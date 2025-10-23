/**
 * @file Main MCP Proxy Handler
 * @description This is the main entry point for all MCP tool proxy requests.
 * It receives requests from worker.js, uses the tool registry to find the
 * appropriate handler, and dispatches the request.
 */

import { getToolHandler } from './tool-registry.js';

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
        const { tool_name, parameters, requestId } = payload;

        // 记录工具调用开始
        console.log('🔧 [工具调用监控]', JSON.stringify({
            request_id: requestId,
            tool_name: tool_name,
            parameters: parameters,
            action: 'start',
            timestamp: new Date().toISOString()
        }));

        if (!tool_name) {
            return createJsonResponse({ success: false, error: 'Request body must include a "tool_name".' }, 400);
        }

        // Find the appropriate handler for the requested tool.
        const toolHandler = getToolHandler(tool_name);

        if (toolHandler) {
            // If a handler is found, execute it and return its response.
            // The handler is responsible for its own logic and error handling.
            const response = await toolHandler(parameters, env);
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
            // If no handler is found, return a 404 error.
            const responseTime = Date.now() - startTime;
            console.error('❌ [工具调用失败]', JSON.stringify({
                request_id: requestId,
                tool_name: tool_name,
                error: `Tool '${tool_name}' is not registered or supported.`,
                response_time: responseTime,
                action: 'not_found',
                timestamp: new Date().toISOString()
            }));
            
            return createJsonResponse({ success: false, error: `Tool '${tool_name}' is not registered or supported.` }, 404);
        }

    } catch (error) {
        const responseTime = Date.now() - startTime;
        
        // 记录工具调用失败
        console.error('❌ [工具调用失败]', JSON.stringify({
            request_id: payload?.requestId,
            tool_name: payload?.tool_name,
            error: error.message,
            stack: error.stack,
            response_time: responseTime,
            action: 'error',
            timestamp: new Date().toISOString()
        }));

        console.error('[MCP HANDLER] General Error:', error);
        return createJsonResponse({
            success: false,
            error: 'An unexpected error occurred in the MCP proxy handler.',
            details: error.message
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