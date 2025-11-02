/**
 * @file Qwen Agent Adapter
 * @description This module acts as a client-side adapter to handle MCP tool calls initiated by Qwen models.
 * It determines how to process each tool call, either by proxying it to the backend
 * or handling it client-side if applicable.
 */

class QwenAgentAdapter {
    /**
     * @param {object} apiHandler - An instance of a client-side API handler (e.g., from api-handler.js)
     *                              used to make requests to the backend.
     */
    constructor(apiHandler) {
        if (!apiHandler) {
            throw new Error("QwenAgentAdapter requires an apiHandler instance.");
        }
        this.apiHandler = apiHandler;
    }

    /**
     * Handles a tool call from the Qwen model.
     * It routes the call to the appropriate handler based on the tool's name.
     * @param {object} toolCall - The tool call object from the model, containing tool_name and parameters.
     * @returns {Promise<object>} - A promise that resolves with the result of the tool execution.
     */
    async handleToolCall(toolCall) {
        const { tool_name, parameters } = toolCall;
        let result;

        console.log(`[QwenAgentAdapter] Handling tool call: ${tool_name}`, parameters);

        switch (tool_name) {
            // This tool is handled by the backend proxy because it requires API keys.
            case 'glm4v.analyze_image':
            case 'tavily_search':
                result = await this.proxyToMcpEndpoint({
                    tool_name: tool_name,
                    parameters: parameters
                });
                break;
            
            // Example of a future client-side tool
            // case 'client_side_tool':
            //     result = this.handleClientSideTool(parameters);
            //     break;

            default:
                console.error(`[QwenAgentAdapter] Unknown or unsupported tool: ${tool_name}`);
                result = {
                    success: false,
                    error: `Unknown or unsupported tool: ${tool_name}`
                };
        }
        return result;
    }

    /**
     * A generic method to proxy a tool call to the backend's /api/mcp-proxy endpoint.
     * This is used for tools that require server-side execution (e.g., due to API keys, CORS, etc.).
     * @param {object} payload - The data to send to the backend, usually { tool_name, parameters }.
     * @returns {Promise<object>} - The result from the backend proxy.
     */
    async proxyToMcpEndpoint(payload) {
        try {
            // The apiHandler should handle the actual HTTP POST request and JSON stringification.
            const response = await this.apiHandler.post('/api/mcp-proxy', payload);
            return response;
        } catch (error) {
            console.error(`[QwenAgentAdapter] Error proxying tool '${payload.tool_name}' to MCP endpoint:`, error);
            return {
                success: false,
                error: `Failed to execute tool via MCP proxy: ${error.message}`
            };
        }
    }
}

export default QwenAgentAdapter;