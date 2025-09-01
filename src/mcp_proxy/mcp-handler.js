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
    if (request.method !== 'POST') {
        return createJsonResponse({ success: false, error: 'Method Not Allowed' }, 405);
    }

    try {
        // The frontend QwenAgentAdapter sends a body with { tool_name, parameters }
        const payload = await request.json();
        const { tool_name, parameters } = payload;

        if (!tool_name) {
            return createJsonResponse({ success: false, error: 'Request body must include a "tool_name".' }, 400);
        }

        // Find the appropriate handler for the requested tool.
        const toolHandler = getToolHandler(tool_name);

        if (toolHandler) {
            // If a handler is found, execute it and return its response.
            // The handler is responsible for its own logic and error handling.
            return await toolHandler(parameters, env);
        } else {
            // If no handler is found, return a 404 error.
            return createJsonResponse({ success: false, error: `Tool '${tool_name}' is not registered or supported.` }, 404);
        }

    } catch (error) {
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