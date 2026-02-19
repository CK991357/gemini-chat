/**
 * @file Main MCP Proxy Handler (统一名称版本)
 * @description This is the main entry point for all MCP tool proxy requests.
 * It directly imports and dispatches to all available tool handlers.
 */

// ✨ 直接、静态地导入所有工具的处理器
import { handleAlphaVantage } from './handlers/alphavantage.js'; // 新增AlphaVantage处理器
import { handleCrawl4AI } from './handlers/crawl4ai.js';
import { handleFirecrawl } from './handlers/firecrawl.js';
import { handleMcpToolCatalog } from './handlers/mcp-tool-catalog.js';
import { handlePythonSandbox } from './handlers/python-sandbox.js';
import { handleStockfishAnalyzer } from './handlers/stockfish.js';
import { handleTavilySearch } from './handlers/tavily-search.js';

// ✨ 统一的工具注册表
const toolRegistry = {
    'crawl4ai': handleCrawl4AI,
    'firecrawl': handleFirecrawl,
    'mcp_tool_catalog': handleMcpToolCatalog,
    'python_sandbox': handlePythonSandbox,
    'stockfish_analyzer': handleStockfishAnalyzer,
    'tavily_search': handleTavilySearch,
    'alphavantage': handleAlphaVantage, // 新增AlphaVantage工具
};

/**
 * 获取工具描述信息
 */
function getToolDescription(toolName) {
    const descriptions = {
        'crawl4ai': '网页抓取、爬取、PDF导出和截图工具',
        'firecrawl': '网页抓取和爬取工具',
        'mcp_tool_catalog': '获取可用工具目录',
        'python_sandbox': 'Python代码执行沙箱',
        'stockfish_analyzer': '国际象棋分析工具',
        'tavily_search': '网络搜索工具',
        'alphavantage': 'AlphaVantage金融数据获取工具，支持股票、外汇、数字货币、大宗商品、新闻等13种金融数据类型'
    };
    return descriptions[toolName] || `工具: ${toolName}`;
}

/**
 * Handles all incoming MCP tool proxy requests.
 * @param {Request} request - The incoming request object from the Cloudflare Worker.
 * @param {object} env - The environment object, containing API keys and other secrets.
 * @returns {Promise<Response>} - A promise that resolves to the final Response object to be sent to the client.
 */
export async function handleMcpProxyRequest(request, env) {
    const startTime = Date.now();
    
    // 处理预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Session-ID', // 添加X-Session-ID支持
                'Access-Control-Max-Age': '86400',
            }
        });
    }
    
    if (request.method !== 'POST') {
        return createJsonResponse({ success: false, error: 'Method Not Allowed' }, 405);
    }

    let payload;
    try {
        payload = await request.json();
        const { tool_name, parameters, requestId } = payload;
        
        // 🎯 新增：从请求头中提取session_id（保持向后兼容）
        const sessionIdFromHeader = request.headers.get('X-Session-ID');
        const sessionIdFromBody = payload.session_id; // 也从body中检查
        const session_id = sessionIdFromHeader || sessionIdFromBody;

        // 记录工具调用开始
        console.log('🔧 [工具调用监控]', JSON.stringify({
            request_id: requestId,
            tool_name: tool_name,
            description: getToolDescription(tool_name),
            parameters: parameters,
            session_id: session_id || '未提供',
            action: 'start',
            timestamp: new Date().toISOString()
        }));

        if (!tool_name) {
            return createJsonResponse({ success: false, error: 'Request body must include a "tool_name".' }, 400);
        }

        // ✨ 直接从内部的注册表中查找处理器
        const toolHandler = toolRegistry[tool_name];

        if (toolHandler) {
            // 如果找到处理器，执行并返回响应
            // 🎯 传递session_id给所有工具处理器（工具自己决定是否使用）
            const response = await toolHandler(parameters, env, session_id);
            const responseTime = Date.now() - startTime;

            // 记录工具调用成功
            console.log('✅ [工具调用完成]', JSON.stringify({
                request_id: requestId,
                tool_name: tool_name,
                response_time: responseTime,
                action: 'success',
                timestamp: new Date().toISOString()
            }));

            return response;
        } else {
            // 如果未找到处理器，返回404错误
            const responseTime = Date.now() - startTime;
            console.error('❌ [工具调用失败]', JSON.stringify({
                request_id: requestId,
                tool_name: tool_name,
                error: `Tool '${tool_name}' is not registered or supported.`,
                response_time: responseTime,
                action: 'not_found',
                timestamp: new Date().toISOString()
            }));
            
            return createJsonResponse({ 
                success: false, 
                error: `工具 '${tool_name}' 未注册或不支持。`,
                description: getToolDescription(tool_name),
                available_tools: Object.keys(toolRegistry).map(name => ({
                    name,
                    description: getToolDescription(name)
                })) // 提供可用工具列表和描述
            }, 404);
        }

    } catch (error) {
        const responseTime = Date.now() - startTime;
        
        // 记录工具调用失败
        console.error('❌ [工具调用失败]', JSON.stringify({
            request_id: payload?.requestId,
            tool_name: payload?.tool_name,
            error: error.message,
            response_time: responseTime,
            action: 'error',
            timestamp: new Date().toISOString()
        }));

        console.error('[MCP HANDLER] General Error:', error);
        return createJsonResponse({
            success: false,
            error: 'MCP代理处理器发生意外错误。',
            details: error.message,
            suggestion: '请检查请求格式和网络连接'
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
            'X-MCP-Proxy-Version': '2.1.0',
        },
    });
}