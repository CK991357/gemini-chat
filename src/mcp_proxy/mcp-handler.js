// handlers/mcp-proxy-handler.js
/**
 * @file Main MCP Proxy Handler (统一名称版本)
 * @description This is the main entry point for all MCP tool proxy requests.
 * It directly imports and dispatches to all available tool handlers.
 */

// ✨ 直接、静态地导入所有工具的处理器
import { handleAlphaVantage } from './handlers/alphavantage.js'; // 🆕 新增导入
import { handleCrawl4AI } from './handlers/crawl4ai.js';
import { handleFirecrawl } from './handlers/firecrawl.js';
import { handleMcpToolCatalog } from './handlers/mcp-tool-catalog.js';
import { handlePythonSandbox } from './handlers/python-sandbox.js';
import { handleStockfishAnalyzer } from './handlers/stockfish.js';
import { handleTavilySearch } from './handlers/tavily-search.js';
import { handleZhipuImageAnalysis } from './handlers/zhipu-glm4v.js';

// ✨ 统一的工具注册表
const toolRegistry = {
    'crawl4ai': handleCrawl4AI,
    'firecrawl': handleFirecrawl,
    'mcp_tool_catalog': handleMcpToolCatalog,
    'python_sandbox': handlePythonSandbox,
    'stockfish_analyzer': handleStockfishAnalyzer,
    'tavily_search': handleTavilySearch,
    'glm4v_analyze_image': handleZhipuImageAnalysis,
    'alphavantage': handleAlphaVantage, // 🆕 新增注册
};

// 可用工具信息（用于文档）
const AVAILABLE_TOOLS = {
    'crawl4ai': '网络爬虫和数据提取工具',
    'firecrawl': '网页抓取和搜索工具',
    'python_sandbox': 'Python代码执行沙箱',
    'stockfish_analyzer': '国际象棋分析工具',
    'tavily_search': '实时网络搜索',
    'glm4v_analyze_image': '智谱GLM-4V图像分析',
    'alphavantage': '金融数据获取工具 (支持13种数据类型)' // 🆕 新增描述
};

/**
 * Handles all incoming MCP tool proxy requests.
 */
export async function handleMcpProxyRequest(request, env) {
    const startTime = Date.now();
    
    // 处理预检请求
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
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
        const { tool_name, parameters, requestId, session_id } = payload;

        // 记录工具调用开始
        console.log('🔧 [工具调用监控]', JSON.stringify({
            request_id: requestId,
            tool_name: tool_name,
            parameters: parameters ? JSON.stringify(parameters).substring(0, 200) : 'none',
            session_id: session_id || 'none',
            action: 'start',
            timestamp: new Date().toISOString()
        }));

        if (!tool_name) {
            return createJsonResponse({ 
                success: false, 
                error: 'Request body must include a "tool_name".',
                available_tools: Object.keys(AVAILABLE_TOOLS)
            }, 400);
        }

        // ✨ 直接从内部的注册表中查找处理器
        const toolHandler = toolRegistry[tool_name];

        if (toolHandler) {
            // 特殊处理：如果是AlphaVantage，记录详细信息
            if (tool_name === 'alphavantage' && parameters && parameters.function) {
                console.log(`[AlphaVantage] 调用函数: ${parameters.function}`);
            }
            
            // 执行工具处理器
            const response = await toolHandler(parameters, env, session_id);
            const responseTime = Date.now() - startTime;

            // 记录工具调用成功
            console.log('✅ [工具调用完成]', JSON.stringify({
                request_id: requestId,
                tool_name: tool_name,
                response_time: responseTime,
                status: 'success',
                timestamp: new Date().toISOString()
            }));

            return response;
        } else {
            // 如果未找到处理器，返回404错误
            const responseTime = Date.now() - startTime;
            console.error('❌ [工具调用失败]', JSON.stringify({
                request_id: requestId,
                tool_name: tool_name,
                error: `工具 '${tool_name}' 未注册或不受支持`,
                available_tools: Object.keys(AVAILABLE_TOOLS),
                response_time: responseTime,
                action: 'not_found',
                timestamp: new Date().toISOString()
            }));
            
            return createJsonResponse({ 
                success: false, 
                error: `工具 '${tool_name}' 未注册或不受支持`,
                available_tools: AVAILABLE_TOOLS
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

        console.error('[MCP HANDLER] 错误:', error);
        return createJsonResponse({
            success: false,
            error: 'MCP代理处理器发生意外错误',
            details: error.message
        }, 500);
    }
}

/**
 * Helper to create a consistent JSON response.
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