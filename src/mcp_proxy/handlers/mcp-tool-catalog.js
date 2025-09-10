/**
 * @file MCP Tool Catalog Handler
 * @description Handles requests for the 'mcp_tool_catalog' tool.
 * It fetches tool definitions from an external Python tool server,
 * transforms them into a format suitable for Qwen models, and returns them.
 */

const EXTERNAL_PYTHON_TOOL_DOCS_URL = 'https://tools.10110531.xyz/api/v1/docs';

// Simple in-memory cache for tool definitions
let cachedToolDefinitions = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // Cache for 5 minutes

/**
 * Transforms a tool definition from the backend Python server format
 * to the frontend Qwen model tool format.
 * @param {object} backendTool - The tool definition from the Python backend.
 * @returns {object} The tool definition in Qwen model format.
 */
function transformToolDefinition(backendTool) {
    if (!backendTool || !backendTool.name || !backendTool.description || !backendTool.input_schema) {
        console.warn('Malformed backend tool definition:', backendTool);
        return null;
    }

    return {
        "type": "function",
        "function": {
            "name": backendTool.name,
            "description": backendTool.description,
            "parameters": backendTool.input_schema // The input_schema is already in the correct JSON Schema format
        }
    };
}

/**
 * Fetches tool definitions from the external Python tool server and transforms them.
 * Implements a caching mechanism.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of tool definitions.
 */
async function fetchAndTransformExternalTools() {
    const now = Date.now();
    if (cachedToolDefinitions && (now - lastFetchTime < CACHE_DURATION_MS)) {
        console.log('[MCP Tool Catalog] Returning cached tool definitions.');
        return cachedToolDefinitions;
    }

    console.log('[MCP Tool Catalog] Fetching fresh tool definitions from external server.');
    try {
        const response = await fetch(EXTERNAL_PYTHON_TOOL_DOCS_URL);
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to fetch external tool docs: ${response.status} - ${errorBody}`);
        }
        const backendTools = await response.json();
        
        const transformedTools = backendTools
            .map(transformToolDefinition)
            .filter(tool => tool !== null); // Filter out any malformed tools

        cachedToolDefinitions = transformedTools;
        lastFetchTime = now;
        return transformedTools;

    } catch (error) {
        console.error('[MCP Tool Catalog] Error fetching and transforming external tools:', error);
        // Fallback to empty array or rethrow, depending on desired behavior
        return []; 
    }
}

/**
 * Handles the 'mcp_tool_catalog' tool invocation.
 * @param {object} parameters - The parameters for the tool call (currently not used).
 * @param {object} env - The Cloudflare Worker environment object (not used in this handler but kept for consistency).
 * @returns {Promise<Response>} - A promise that resolves to a Response object containing the aggregated tool definitions.
 */
export async function handleMcpToolCatalog(parameters, env) {
    try {
        const tools = await fetchAndTransformExternalTools();
        return new Response(JSON.stringify({ success: true, data: tools }, null, 2), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('[MCP Tool Catalog] Error in handleMcpToolCatalog:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }, null, 2), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}