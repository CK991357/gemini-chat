// handlers/alphavantage.js
/**
 * @file MCP Proxy Handler for AlphaVantage
 * @description Handles the 'alphavantage' tool call by proxying it to the external Python tool server.
 * 支持21个完整的金融数据获取功能（包括新增的9个基本面数据功能）。
 */

// 模式到功能的映射（新的API结构使用mode而不是function）
const MODE_TO_FUNCTION = {
    "weekly_adjusted": "fetch_weekly_adjusted",
    "global_quote": "fetch_global_quote",
    // 删除付费期权功能: "historical_options": "fetch_historical_options",
    "earnings_transcript": "fetch_earnings_transcript",
    "insider_transactions": "fetch_insider_transactions",
    "etf_profile": "fetch_etf_profile",
    "forex_daily": "fetch_forex_daily",
    "digital_currency_daily": "fetch_digital_currency_daily",
    "wti": "fetch_wti",
    "brent": "fetch_brent",
    "copper": "fetch_copper",
    "treasury_yield": "fetch_treasury_yield",
    "news_sentiment": "fetch_news_sentiment",
    // 新增基本面数据功能
    "overview": "fetch_overview",
    "income_statement": "fetch_income_statement",
    "balance_sheet": "fetch_balance_sheet",
    "cash_flow": "fetch_cash_flow",
    "earnings": "fetch_earnings",
    "earnings_calendar": "fetch_earnings_calendar",
    "earnings_estimates": "fetch_earnings_estimates",
    "dividends": "fetch_dividends",
    "shares_outstanding": "fetch_shares_outstanding"
};

// 支持的AlphaVantage模式列表
const SUPPORTED_MODES = Object.keys(MODE_TO_FUNCTION);

// 模式描述
const MODE_DESCRIPTIONS = {
    "weekly_adjusted": "获取股票周调整数据（开盘价、最高价、最低价、收盘价、调整后收盘价、成交量、股息）",
    "global_quote": "获取实时行情数据（当前价格、涨跌幅、成交量等）",
    // 删除付费期权功能: "historical_options": "获取历史期权数据（需要付费API套餐）",
    "earnings_transcript": "获取财报电话会议记录",
    "insider_transactions": "获取公司内部人交易数据",
    "etf_profile": "获取ETF详细信息和持仓数据",
    "forex_daily": "获取外汇每日数据",
    "digital_currency_daily": "获取数字货币每日数据",
    "wti": "获取WTI原油价格数据",
    "brent": "获取Brent原油价格数据",
    "copper": "获取全球铜价数据",
    "treasury_yield": "获取美国国债收益率数据",
    "news_sentiment": "获取市场新闻和情绪数据",
    // 新增基本面数据描述
    "overview": "获取公司概况和财务比率数据（市值、市盈率、股息收益率等）",
    "income_statement": "获取利润表数据（年报和季报）",
    "balance_sheet": "获取资产负债表数据（年报和季报）",
    "cash_flow": "获取现金流量表数据（年报和季报）",
    "earnings": "获取每股收益(EPS)数据（年报和季报）",
    "earnings_calendar": "获取财报日历数据",
    "earnings_estimates": "获取盈利预测数据",
    "dividends": "获取股息历史数据",
    "shares_outstanding": "获取流通股数量数据"
};

// 模式参数验证规则
const MODE_PARAMETERS = {
    "weekly_adjusted": {
        required: ["symbol"],
        optional: [],
        description: "获取股票周调整数据"
    },
    "global_quote": {
        required: ["symbol"],
        optional: [],
        description: "获取实时行情数据"
    },
    "earnings_transcript": {
        required: ["symbol", "quarter"],
        optional: [],
        description: "获取财报会议记录，quarter格式: YYYY-Q1/Q2/Q3/Q4"
    },
    "insider_transactions": {
        required: ["symbol"],
        optional: [],
        description: "获取内部人交易数据"
    },
    "etf_profile": {
        required: ["symbol"],
        optional: [],
        description: "获取ETF详细信息和持仓数据"
    },
    "forex_daily": {
        required: ["from_symbol", "to_symbol"],
        optional: ["outputsize"],
        description: "获取外汇每日数据，outputsize: compact(最近100天)或full(全部数据)"
    },
    "digital_currency_daily": {
        required: ["symbol", "market"],
        optional: [],
        description: "获取数字货币每日数据，market如: USD, CNY"
    },
    "wti": {
        required: [],
        optional: ["interval"],
        description: "获取WTI原油价格数据，interval: daily, weekly, monthly"
    },
    "brent": {
        required: [],
        optional: ["interval"],
        description: "获取Brent原油价格数据，interval: daily, weekly, monthly"
    },
    "copper": {
        required: [],
        optional: ["interval"],
        description: "获取全球铜价数据，interval: daily, weekly, monthly"
    },
    "treasury_yield": {
        required: [],
        optional: ["interval", "maturity"],
        description: "获取美国国债收益率数据，maturity: 3month, 2year, 5year, 7year, 10year, 30year"
    },
    "news_sentiment": {
        required: [],
        optional: ["tickers", "topics", "time_from", "time_to", "sort", "limit"],
        description: "获取市场新闻和情绪数据，limit: 1-1000"
    },
    // 新增基本面数据参数验证规则
    "overview": {
        required: ["symbol"],
        optional: [],
        description: "获取公司概况和财务比率数据"
    },
    "income_statement": {
        required: ["symbol"],
        optional: [],
        description: "获取利润表数据（年报和季报）"
    },
    "balance_sheet": {
        required: ["symbol"],
        optional: [],
        description: "获取资产负债表数据（年报和季报）"
    },
    "cash_flow": {
        required: ["symbol"],
        optional: [],
        description: "获取现金流量表数据（年报和季报）"
    },
    "earnings": {
        required: ["symbol"],
        optional: [],
        description: "获取每股收益(EPS)数据（年报和季报）"
    },
    "earnings_calendar": {
        required: [],
        optional: ["symbol", "horizon"],
        description: "获取财报日历数据，horizon: 3month, 6month, 12month"
    },
    "earnings_estimates": {
        required: ["symbol"],
        optional: [],
        description: "获取盈利预测数据"
    },
    "dividends": {
        required: ["symbol"],
        optional: [],
        description: "获取股息历史数据"
    },
    "shares_outstanding": {
        required: ["symbol"],
        optional: [],
        description: "获取流通股数量数据"
    }
};

/**
 * 验证AlphaVantage模式参数
 */
function validateAlphaVantageParams(mode, parameters) {
    // 检查模式是否支持
    if (!SUPPORTED_MODES.includes(mode)) {
        return {
            valid: false,
            error: `不支持的AlphaVantage模式: ${mode}`,
            available_modes: SUPPORTED_MODES.map(m => ({ mode: m, description: MODE_DESCRIPTIONS[m] }))
        };
    }
    
    // 获取参数规则
    const paramRules = MODE_PARAMETERS[mode] || {};
    const requiredParams = paramRules.required || [];
    const optionalParams = paramRules.optional || [];
    
    // 检查必需参数
    for (const param of requiredParams) {
        if (!parameters || parameters[param] === undefined || parameters[param] === '') {
            return {
                valid: false,
                error: `模式 ${mode} 需要参数: ${param}`,
                required_parameters: requiredParams,
                description: paramRules.description
            };
        }
    }
    
    // 特殊参数验证
    if (mode === "forex_daily") {
        const validOutputSizes = ["compact", "full"];
        if (parameters.outputsize && !validOutputSizes.includes(parameters.outputsize)) {
            return {
                valid: false,
                error: `outputsize 必须是: ${validOutputSizes.join(" 或 ")}`,
                received: parameters.outputsize
            };
        }
    }
    
    if (mode === "news_sentiment") {
        if (parameters.limit && (parameters.limit < 1 || parameters.limit > 1000)) {
            return {
                valid: false,
                error: "limit 必须在 1-1000 之间",
                received: parameters.limit
            };
        }
    }
    
    if (mode === "digital_currency_daily") {
        const validMarkets = ["USD", "CNY", "JPY", "EUR", "GBP"];
        if (parameters.market && !validMarkets.includes(parameters.market.toUpperCase())) {
            return {
                valid: false,
                error: `market 必须是: ${validMarkets.join(" 或 ")}`,
                received: parameters.market
            };
        }
    }
    
    if (mode === "treasury_yield") {
        const validMaturities = ["3month", "2year", "5year", "7year", "10year", "30year"];
        if (parameters.maturity && !validMaturities.includes(parameters.maturity.toLowerCase())) {
            return {
                valid: false,
                error: `maturity 必须是: ${validMaturities.join(" 或 ")}`,
                received: parameters.maturity
            };
        }
    }
    
    if (["wti", "brent", "copper"].includes(mode)) {
        const validIntervals = ["daily", "weekly", "monthly"];
        if (parameters.interval && !validIntervals.includes(parameters.interval.toLowerCase())) {
            return {
                valid: false,
                error: `interval 必须是: ${validIntervals.join(" 或 ")}`,
                received: parameters.interval
            };
        }
    }
    
    // 新增基本面数据参数验证
    if (mode === "earnings_calendar") {
        const validHorizons = ["3month", "6month", "12month"];
        if (parameters.horizon && !validHorizons.includes(parameters.horizon.toLowerCase())) {
            return {
                valid: false,
                error: `horizon 必须是: ${validHorizons.join(" 或 ")}`,
                received: parameters.horizon
            };
        }
    }
    
    if (mode === "earnings_transcript") {
        if (parameters.quarter) {
            const quarterPattern = /^\d{4}-Q[1-4]$/;
            if (!quarterPattern.test(parameters.quarter)) {
                return {
                    valid: false,
                    error: "quarter 格式必须为 YYYY-Q1/Q2/Q3/Q4，例如: 2024-Q1",
                    received: parameters.quarter
                };
            }
        }
    }
    
    return { valid: true, paramRules };
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
    
    // 验证基本参数结构 - 新的API结构
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ 
            success: false, 
            error: 'AlphaVantage工具需要有效的参数对象',
            usage: {
                description: "AlphaVantage金融数据获取工具",
                structure: {
                    mode: "string (支持的AlphaVantage模式)",
                    parameters: "object (模式具体参数)"
                },
                example: {
                    mode: "weekly_adjusted",
                    parameters: { symbol: "AAPL" }
                },
                available_modes: SUPPORTED_MODES.map(m => ({
                    mode: m,
                    description: MODE_DESCRIPTIONS[m],
                    parameters: MODE_PARAMETERS[m]
                }))
            }
        }, 400);
    }

    // 🎯 新的API结构：使用mode而不是function
    const { mode, parameters } = tool_params;

    if (!mode) {
        return createJsonResponse({ 
            success: false, 
            error: '缺少必需参数: "mode"',
            supported_modes: SUPPORTED_MODES,
            suggestion: "请指定一个AlphaVantage模式，如: weekly_adjusted, global_quote, overview, income_statement等"
        }, 400);
    }

    // 验证模式参数
    const validation = validateAlphaVantageParams(mode, parameters || {});
    if (!validation.valid) {
        return createJsonResponse({
            success: false,
            error: validation.error,
            details: validation,
            suggestion: `请检查${mode}模式的参数要求`
        }, 400);
    }

    // 构建请求体 - 与后端API完全匹配
    const finalParameters = parameters || {};
    
    const requestBody = {
        tool_name: 'alphavantage',
        parameters: {
            mode: mode,
            parameters: finalParameters
        },
        // 🎯 修复：将session_id放在请求体顶层，与后端API匹配
        session_id: session_id
    };

    try {
        console.log(`[AlphaVantage] 调用工具服务器: ${mode}`, {
            parameters: finalParameters,
            session_id: session_id || 'none',
            description: MODE_DESCRIPTIONS[mode]
        });
        
        // 调用工具服务器
        const toolResponse = await fetch(toolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        // 处理响应
        const contentType = toolResponse.headers.get('content-type') || '';
        let responseData;
        
        if (contentType.includes('application/json')) {
            try {
                responseData = await toolResponse.json();
            } catch (jsonError) {
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
                mode: mode
            });
            
            return createJsonResponse({
                success: false,
                error: `AlphaVantage工具服务器请求失败 (${toolResponse.status})`,
                details: responseData,
                mode: mode
            }, toolResponse.status);
        }
        
        // 🎯 改进的响应处理
        if (responseData.success) {
            // 确保metadata存在
            responseData.metadata = responseData.metadata || {};
            const metadata = responseData.metadata;
            
            // 添加有用的元数据
            metadata.mode_description = MODE_DESCRIPTIONS[mode];
            metadata.timestamp = new Date().toISOString();
            
            // 如果有session_id，添加会话信息
            if (session_id) {
                metadata.session_id = session_id;
                metadata.session_note = '数据已保存到会话工作区，可以使用代码解释器进行数据分析。';
                
                // 如果后端返回了session_dir，提供详细访问路径
                if (metadata.session_dir) {
                    metadata.access_instructions = `可以在代码解释器中使用路径访问文件: ${metadata.session_dir}`;
                } else if (session_id) {
                    metadata.access_instructions = `可以在代码解释器中使用路径访问文件: /srv/sandbox_workspaces/${session_id}/`;
                }
                
                // 🎯 核心修复：正确处理saved_files数组（可能是对象数组）
                const savedFiles = metadata.saved_files || [];
                if (savedFiles.length > 0) {
                    metadata.file_summary = `已保存 ${savedFiles.length} 个文件`;
                    
                    // 🎯 关键修复：安全处理文件项，避免split错误
                    metadata.sample_files = savedFiles.slice(0, 3).map(fileItem => {
                        try {
                            // 如果是字符串，直接使用
                            if (typeof fileItem === 'string') {
                                const parts = fileItem.split('/');
                                return parts[parts.length - 1];
                            }
                            // 如果是对象，提取filename字段
                            else if (fileItem && typeof fileItem === 'object') {
                                // 尝试多个可能的字段名
                                return fileItem.filename || 
                                       fileItem.name || 
                                       (typeof fileItem.container_path === 'string' ? 
                                        fileItem.container_path.split('/').pop() : 'unknown_file');
                            }
                            // 其他情况转为字符串
                            return String(fileItem || 'unknown');
                        } catch (error) {
                            console.warn('[AlphaVantage] 处理文件项时出错:', error, fileItem);
                            return 'error_processing_file';
                        }
                    });
                    
                    // 添加文件访问帮助信息
                    if (savedFiles.length > 0) {
                        const firstFile = savedFiles[0];
                        if (firstFile && typeof firstFile === 'object' && firstFile.container_path) {
                            metadata.container_access = `代码解释器访问路径: ${firstFile.container_path}`;
                        }
                    }
                }
            }
            
            console.log(`[AlphaVantage] ✅ 成功获取数据`, {
                mode: mode,
                description: MODE_DESCRIPTIONS[mode],
                session_id: metadata.session_id || 'none',
                files_count: (metadata.saved_files || []).length,
                has_example_code: !!metadata.example_code
            });
        } else {
            console.error('[AlphaVantage] ❌ 工具执行失败:', {
                mode: mode,
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
            suggestion: suggestion,
            mode_requested: mode,
            parameters_sent: tool_params.parameters
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
            'X-AlphaVantage-Handler': '1.0.0',
        },
    });
}

// 导出函数列表（可选）
export const AVAILABLE_MODES = SUPPORTED_MODES;
export const MODE_INFO = MODE_DESCRIPTIONS;