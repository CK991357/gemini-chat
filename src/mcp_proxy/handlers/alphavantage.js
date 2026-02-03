// handlers/alphavantage.js
/**
 * @file MCP Proxy Handler for AlphaVantage
 * @description Handles the 'alphavantage' tool call by proxying it to the external Python tool server.
 * 支持13个完整的金融数据获取功能。
 */

// 支持的函数列表
const SUPPORTED_FUNCTIONS = [
    "fetch_weekly_adjusted",
    "fetch_global_quote",
    "fetch_historical_options",
    "fetch_earnings_transcript",
    "fetch_insider_transactions",
    "fetch_etf_profile",
    "fetch_forex_daily",
    "fetch_digital_currency_daily",
    "fetch_wti",
    "fetch_brent",
    "fetch_copper",
    "fetch_treasury_yield",
    "fetch_news_sentiment"
];

// 函数参数验证规则 - 更新为完整版本（注意：很多参数是可选的）
const FUNCTION_PARAMETERS = {
    "fetch_weekly_adjusted": ["symbol"],
    "fetch_global_quote": ["symbol"],
    "fetch_historical_options": ["symbol"],      // date 可选
    "fetch_earnings_transcript": ["symbol", "quarter"],
    "fetch_insider_transactions": ["symbol"],
    "fetch_etf_profile": ["symbol"],
    "fetch_forex_daily": ["from_symbol", "to_symbol"],  // outputsize 可选
    "fetch_digital_currency_daily": ["symbol", "market"],
    "fetch_wti": [],      // interval 可选
    "fetch_brent": [],    // interval 可选
    "fetch_copper": [],   // interval 可选
    "fetch_treasury_yield": [],  // interval, maturity 可选
    "fetch_news_sentiment": []   // 所有参数都可选
};

/**
 * 验证AlphaVantage函数参数 - 更新版本
 */
function validateAlphaVantageParams(functionName, parameters) {
    // 检查函数是否支持
    if (!SUPPORTED_FUNCTIONS.includes(functionName)) {
        return {
            valid: false,
            error: `不支持的函数: ${functionName}`,
            available_functions: SUPPORTED_FUNCTIONS
        };
    }
    
    // 获取必需参数
    const requiredParams = FUNCTION_PARAMETERS[functionName] || [];
    
    // 检查必需参数
    for (const param of requiredParams) {
        if (!parameters || parameters[param] === undefined || parameters[param] === '') {
            return {
                valid: false,
                error: `函数 ${functionName} 需要参数: ${param}`,
                required_parameters: requiredParams
            };
        }
    }
    
    // 特殊参数验证
    if (functionName === "fetch_forex_daily") {
        const validOutputSizes = ["compact", "full"];
        if (parameters.outputsize && !validOutputSizes.includes(parameters.outputsize)) {
            return {
                valid: false,
                error: `outputsize 必须是: ${validOutputSizes.join(" 或 ")}`,
                received: parameters.outputsize
            };
        }
    }
    
    if (functionName === "fetch_news_sentiment") {
        if (parameters.limit && (parameters.limit < 1 || parameters.limit > 50)) {
            return {
                valid: false,
                error: "limit 必须在 1-50 之间",
                received: parameters.limit
            };
        }
    }
    
    // 数字货币参数验证
    if (functionName === "fetch_digital_currency_daily") {
        const validMarkets = ["USD", "CNY", "JPY", "EUR", "GBP"];
        if (parameters.market && !validMarkets.includes(parameters.market.toUpperCase())) {
            return {
                valid: false,
                error: `market 必须是: ${validMarkets.join(" 或 ")}`,
                received: parameters.market
            };
        }
    }
    
    // 国债收益率验证
    if (functionName === "fetch_treasury_yield") {
        const validMaturities = ["3month", "2year", "5year", "7year", "10year", "30year"];
        if (parameters.maturity && !validMaturities.includes(parameters.maturity.toLowerCase())) {
            return {
                valid: false,
                error: `maturity 必须是: ${validMaturities.join(" 或 ")}`,
                received: parameters.maturity
            };
        }
    }
    
    // 大宗商品验证
    if (["fetch_wti", "fetch_brent", "fetch_copper"].includes(functionName)) {
        const validIntervals = ["daily", "weekly", "monthly"];
        if (parameters.interval && !validIntervals.includes(parameters.interval.toLowerCase())) {
            return {
                valid: false,
                error: `interval 必须是: ${validIntervals.join(" 或 ")}`,
                received: parameters.interval
            };
        }
    }
    
    return { valid: true };
}

/**
 * Executes the AlphaVantage tool by calling the external tool server.
 * @param {object} tool_params - The parameters for the tool call.
 * @param {object} env - The Cloudflare Worker environment object.
 * @param {string} session_id - 会话ID，用于数据文件共享
 * @returns {Promise<Response>} - A promise that resolves to a Response object containing the AlphaVantage results.
 */
export async function handleAlphaVantage(tool_params, _env, session_id = null) {
    const toolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';

    // 记录调用开始
    console.log(`[AlphaVantage] 开始处理请求, session_id: ${session_id || 'none'}`);
    
    // 验证基本参数结构
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ 
            success: false, 
            error: 'Missing or invalid "parameters" object for alphavantage tool.',
            usage: {
                description: "AlphaVantage金融数据获取工具",
                structure: {
                    function: "string (支持的函数名)",
                    parameters: "object (函数具体参数)"
                },
                example: {
                    function: "fetch_weekly_adjusted",
                    parameters: { symbol: "AAPL" }
                },
                available_functions: SUPPORTED_FUNCTIONS
            }
        }, 400);
    }

    const { function: functionName, parameters } = tool_params;

    if (!functionName) {
        return createJsonResponse({ 
            success: false, 
            error: 'Missing required parameter: "function" for alphavantage tool.',
            supported_functions: SUPPORTED_FUNCTIONS
        }, 400);
    }

    // 验证函数参数
    const validation = validateAlphaVantageParams(functionName, parameters || {});
    if (!validation.valid) {
        return createJsonResponse({
            success: false,
            error: validation.error,
            details: validation
        }, 400);
    }

    // 构建请求体
    const finalParameters = parameters || {};
    
    const requestBody = {
        tool_name: 'alphavantage',
        parameters: {
            function: functionName,
            parameters: finalParameters
        }
    };

    // 🎯 核心：如果提供了session_id，添加到请求中
    if (session_id) {
        requestBody.session_id = session_id;
    }

    try {
        console.log(`[AlphaVantage] 调用工具服务器: ${functionName}`, {
            parameters: finalParameters,
            session_id: session_id || 'none'
        });
        
        // 调用工具服务器
        const toolResponse = await fetch(toolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        // 🎯 修复：先检查响应类型，处理可能的HTML错误页面
        const contentType = toolResponse.headers.get('content-type') || '';
        let responseData;
        
        if (contentType.includes('application/json')) {
            try {
                responseData = await toolResponse.json();
            } catch (jsonError) {
                // JSON解析失败
                const text = await toolResponse.text();
                console.error('[AlphaVantage] ❌ JSON解析失败:', jsonError.message, '响应:', text.substring(0, 500));
                
                return createJsonResponse({
                    success: false,
                    error: '工具服务器返回的JSON格式无效',
                    details: {
                        status: toolResponse.status,
                        statusText: toolResponse.statusText,
                        jsonError: jsonError.message,
                        preview: text.substring(0, 200)
                    },
                    suggestion: '请检查工具服务器是否正常返回JSON'
                }, 500);
            }
        } else {
            // 如果是非JSON响应（可能是HTML错误页面）
            const text = await toolResponse.text();
            console.error('[AlphaVantage] ❌ 工具服务器返回非JSON响应:', text.substring(0, 500));
            
            return createJsonResponse({
                success: false,
                error: '工具服务器返回无效响应格式',
                details: {
                    status: toolResponse.status,
                    statusText: toolResponse.statusText,
                    contentType: contentType,
                    preview: text.substring(0, 200)
                },
                suggestion: '工具服务器可能未正确启动或发生内部错误'
            }, 500);
        }

        if (!toolResponse.ok) {
            console.error('[AlphaVantage] 工具服务器错误:', {
                status: toolResponse.status,
                data: responseData,
                function: functionName
            });
            
            return createJsonResponse({
                success: false,
                error: `AlphaVantage工具服务器请求失败 (${toolResponse.status})`,
                details: responseData,
                function: functionName
            }, toolResponse.status);
        }
        
        // 🎯 增强响应日志
        if (responseData.success) {
            const metadata = responseData.metadata || {};
            const savedFiles = metadata.saved_files || [];
            
            console.log(`[AlphaVantage] ✅ 成功获取数据`, {
                function: functionName,
                session_id: metadata.session_id || session_id,
                files_count: savedFiles.length,
                files: savedFiles.slice(0, 3).map(f => f.split('/').pop()), // 只显示文件名
                has_example_code: !!metadata.example_code,
                data_type: metadata.data_type || functionName
            });
            
            // 添加可用功能的提示
            if (responseData.metadata && responseData.metadata.data_dir) {
                responseData.suggestion = `数据已保存到会话目录，可以使用代码解释器进行数据分析。`;
            }
        } else {
            console.error('[AlphaVantage] ❌ 工具执行失败:', {
                function: functionName,
                error: responseData.error,
                parameters: finalParameters
            });
        }
        
        return createJsonResponse(responseData);

    } catch (error) {
        console.error('[AlphaVantage] ❌ 连接工具服务器失败:', error);
        
        // 提供更详细的错误信息
        let errorDetail = '连接AlphaVantage工具服务器失败';
        let suggestion = '请检查网络连接或稍后重试';
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorDetail = '网络请求失败，请检查工具服务器是否可达';
            suggestion = '请确认工具服务器正在运行且网络连接正常';
        } else if (error.name === 'SyntaxError') {
            errorDetail = 'JSON解析失败，工具服务器可能返回了错误格式';
            suggestion = '请检查工具服务器日志确认是否正常启动';
        }
        
        return createJsonResponse({
            success: false,
            error: errorDetail,
            details: error.message,
            error_type: error.name,
            suggestion: suggestion
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
        },
    });
}