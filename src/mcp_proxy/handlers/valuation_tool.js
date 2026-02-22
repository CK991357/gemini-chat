// handlers/valuation_tool.js
/**
 * @file MCP Proxy Handler for Valuation Tool
 * @description Handles the 'valuation_tool' call by proxying it to the external Python tool server.
 */

// 模式描述（用于日志和提示）
const MODE_DESCRIPTIONS = {
    "single": "运行单个估值模型（需指定 model 参数）",
    "multi": "运行多个估值模型（默认全部五种）",
    "monte_carlo": "执行蒙特卡洛模拟"
};

/**
 * Executes the Valuation Tool by calling the external tool server.
 * @param {object} tool_params - The parameters for the tool call.
 * @param {object} env - The Cloudflare Worker environment object.
 * @param {string} session_id - 会话ID，用于数据文件共享
 * @returns {Promise<Response>} - A promise that resolves to a Response object.
 */
export async function handleValuationTool(tool_params, _env, session_id = null) {
    const toolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';

    console.log(`[ValuationTool] 开始处理请求, session_id: ${session_id || 'none'}`);
    
    // 验证基本参数结构
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ 
            success: false, 
            error: '估值工具需要有效的参数对象',
            usage: {
                description: "从会话工作区读取原始JSON文件，生成估值报告",
                structure: {
                    mode: "string (single / multi / monte_carlo)",
                    parameters: "object (具体参数，如 symbol, models 等)"
                },
                example: {
                    mode: "multi",
                    parameters: {
                        symbol: "AAPL",
                        models: ["dcf","fcfe","rim","eva","apv"],
                        sensitivity: true
                    }
                }
            }
        }, 400);
    }

    const { mode, parameters } = tool_params;

    if (!mode) {
        return createJsonResponse({ 
            success: false, 
            error: '缺少必需参数: "mode"',
            supported_modes: ["single", "multi", "monte_carlo"],
            suggestion: "请指定运行模式：single, multi 或 monte_carlo"
        }, 400);
    }

    const validModes = ["single", "multi", "monte_carlo"];
    if (!validModes.includes(mode)) {
        return createJsonResponse({
            success: false,
            error: `不支持的 mode: ${mode}`,
            supported_modes: validModes,
            suggestion: "请使用 single, multi 或 monte_carlo"
        }, 400);
    }

    // 如果是 single 模式，必须提供 model 参数
    if (mode === "single" && (!parameters || !parameters.model)) {
        return createJsonResponse({
            success: false,
            error: 'single 模式必须指定 model 参数',
            example: {
                mode: "single",
                parameters: {
                    symbol: "AAPL",
                    model: "dcf",
                    sensitivity: true
                }
            }
        }, 400);
    }

    // 构建请求体（与后端期待的格式一致）
    const requestBody = {
        tool_name: 'valuation_tool',
        parameters: {
            mode: mode,
            parameters: parameters || {}
        },
        session_id: session_id
    };

    try {
        console.log(`[ValuationTool] 调用工具服务器: ${mode}`, {
            parameters: parameters || {},
            session_id: session_id || 'none',
            description: MODE_DESCRIPTIONS[mode]
        });
        
        const toolResponse = await fetch(toolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const contentType = toolResponse.headers.get('content-type') || '';
        let responseData;
        
        if (contentType.includes('application/json')) {
            try {
                responseData = await toolResponse.json();
            } catch (jsonError) {
                const text = await toolResponse.text();
                console.error('[ValuationTool] ❌ JSON解析失败:', jsonError.message, '响应:', text.substring(0, 500));
                return createJsonResponse({
                    success: false,
                    error: '工具服务器返回的JSON格式无效',
                    details: {
                        status: toolResponse.status,
                        jsonError: jsonError.message,
                        preview: text.substring(0, 200)
                    }
                }, 500);
            }
        } else {
            const text = await toolResponse.text();
            console.error('[ValuationTool] ❌ 工具服务器返回非JSON响应:', text.substring(0, 500));
            return createJsonResponse({
                success: false,
                error: '工具服务器返回无效响应格式',
                details: {
                    status: toolResponse.status,
                    contentType: contentType,
                    preview: text.substring(0, 200)
                }
            }, 500);
        }

        if (!toolResponse.ok) {
            console.error('[ValuationTool] 工具服务器错误:', {
                status: toolResponse.status,
                data: responseData,
                mode: mode
            });
            return createJsonResponse({
                success: false,
                error: `估值工具服务器请求失败 (${toolResponse.status})`,
                details: responseData,
                mode: mode
            }, toolResponse.status);
        }
        
        if (responseData.success) {
            console.log(`[ValuationTool] ✅ 成功生成估值报告`, {
                mode: mode,
                session_id: session_id || 'none',
                generated_files: responseData.generated_files?.length || 0
            });
        } else {
            console.error('[ValuationTool] ❌ 工具执行失败:', {
                mode: mode,
                error: responseData.error
            });
        }
        
        return createJsonResponse(responseData);

    } catch (error) {
        console.error('[ValuationTool] ❌ 连接工具服务器失败:', error);
        return createJsonResponse({
            success: false,
            error: '连接估值工具服务器失败',
            details: error.message,
            error_type: error.name,
            suggestion: '请检查网络连接或稍后重试'
        }, 500);
    }
}

/**
 * Helper to create a consistent JSON response.
 * @param {object} body - The response body.
 * @param {number} status - The HTTP status code.
 * @returns {Response}
 */
function createJsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body, null, 2), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-ValuationTool-Handler': '1.0.0',
        },
    });
}