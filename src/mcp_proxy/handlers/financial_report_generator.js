// handlers/financial_report_generator.js
/**
 * @file MCP Proxy Handler for Financial Report Generator
 * @description Handles the 'financial_report_generator' tool call by proxying it to the external Python tool server.
 */

// 模式描述
const MODE_DESCRIPTIONS = {
    "base": "生成基础财务数据报告（包含同比、CAGR、健康评分）",
    "ratio": "生成财务比率历史数据表格（多年度对比）",
    "both": "同时生成两种报告"
};

/**
 * Executes the Financial Report Generator tool by calling the external tool server.
 * @param {object} tool_params - The parameters for the tool call.
 * @param {object} env - The Cloudflare Worker environment object.
 * @param {string} session_id - 会话ID，用于数据文件共享
 * @returns {Promise<Response>} - A promise that resolves to a Response object.
 */
export async function handleFinancialReportGenerator(tool_params, _env, session_id = null) {
    const toolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';

    console.log(`[FinancialReportGenerator] 开始处理请求, session_id: ${session_id || 'none'}`);
    
    // 验证基本参数结构
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ 
            success: false, 
            error: '财务报告生成工具需要有效的参数对象',
            usage: {
                description: "从会话工作区中读取原始JSON文件，生成财务报告",
                structure: {
                    mode: "string (base / ratio / both)",
                    parameters: "object (可选参数 { symbol })"
                },
                example: {
                    mode: "both",
                    parameters: { symbol: "AAPL" }
                }
            }
        }, 400);
    }

    const { mode, parameters } = tool_params;

    if (!mode) {
        return createJsonResponse({ 
            success: false, 
            error: '缺少必需参数: "mode"',
            supported_modes: ["base", "ratio", "both"],
            suggestion: "请指定一个报告生成模式：base, ratio, 或 both"
        }, 400);
    }

    const validModes = ["base", "ratio", "both"];
    if (!validModes.includes(mode)) {
        return createJsonResponse({
            success: false,
            error: `不支持的 mode: ${mode}`,
            supported_modes: validModes,
            suggestion: "请使用 base, ratio 或 both"
        }, 400);
    }

    // 构建请求体
    const requestBody = {
        tool_name: 'financial_report_generator',
        parameters: {
            mode: mode,
            parameters: parameters || {}
        },
        session_id: session_id
    };

    try {
        console.log(`[FinancialReportGenerator] 调用工具服务器: ${mode}`, {
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
                console.error('[FinancialReportGenerator] ❌ JSON解析失败:', jsonError.message, '响应:', text.substring(0, 500));
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
            console.error('[FinancialReportGenerator] ❌ 工具服务器返回非JSON响应:', text.substring(0, 500));
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
            console.error('[FinancialReportGenerator] 工具服务器错误:', {
                status: toolResponse.status,
                data: responseData,
                mode: mode
            });
            return createJsonResponse({
                success: false,
                error: `财务报告生成工具服务器请求失败 (${toolResponse.status})`,
                details: responseData,
                mode: mode
            }, toolResponse.status);
        }
        
        if (responseData.success) {
            console.log(`[FinancialReportGenerator] ✅ 成功生成报告`, {
                mode: mode,
                session_id: session_id || 'none',
                files_count: (responseData.generated_files || []).length
            });
        } else {
            console.error('[FinancialReportGenerator] ❌ 工具执行失败:', {
                mode: mode,
                error: responseData.error
            });
        }
        
        return createJsonResponse(responseData);

    } catch (error) {
        console.error('[FinancialReportGenerator] ❌ 连接工具服务器失败:', error);
        return createJsonResponse({
            success: false,
            error: '连接财务报告生成工具服务器失败',
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
            'X-FinancialReport-Handler': '1.0.0',
        },
    });
}