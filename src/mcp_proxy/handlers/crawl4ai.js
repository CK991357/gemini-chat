/**
 * @file MCP Proxy Handler for Crawl4AI
 * @description Handles the 'crawl4ai' tool call by proxying it to the external Python tool server.
 */

/**
 * Executes the Crawl4AI tool by calling the external tool server.
 * @param {object} tool_params - The parameters for the tool call, containing mode and nested parameters.
 * @param {object} env - The Cloudflare Worker environment object (not used in this handler but kept for consistency).
 * @returns {Promise<Response>} - A promise that resolves to a Response object containing the Crawl4AI results.
 */
export async function handleCrawl4AI(tool_params, env) {
    const toolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';

    // Validate the basic structure of the parameters for Crawl4AI
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ success: false, error: 'Missing or invalid "parameters" object for crawl4ai tool.' }, 400);
    }

    const { mode, parameters } = tool_params;

    if (!mode) {
        return createJsonResponse({ success: false, error: 'Missing required parameter: "mode" for crawl4ai tool.' }, 400);
    }
    if (!parameters || typeof parameters !== 'object') {
        return createJsonResponse({ success: false, error: 'Missing or invalid nested "parameters" object for crawl4ai tool.' }, 400);
    }

    // 🎯 关键修复：验证URL参数
    if (!parameters.url) {
        return createJsonResponse({ 
            success: false, 
            error: 'Missing required parameter: "url" in parameters object.' 
        }, 400);
    }

    // Validate mode against allowed values - UPDATED with all 7 modes
    const allowedModes = ['scrape', 'crawl', 'deep_crawl', 'extract', 'batch_crawl', 'pdf_export', 'screenshot'];
    if (!allowedModes.includes(mode)) {
        return createJsonResponse({ 
            success: false, 
            error: `Invalid mode "${mode}". Allowed modes are: ${allowedModes.join(', ')}` 
        }, 400);
    }

    const requestBody = {
        tool_name: 'crawl4ai',
        parameters: tool_params // Pass the entire original parameters object
    };

    try {
        const toolResponse = await fetch(toolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            // 🎯 关键修复：增加超时设置
            signal: AbortSignal.timeout(30000) // 30秒超时
        });

        // 🎯 关键修复：更好的错误处理
        if (!toolResponse.ok) {
            let errorDetails;
            try {
                errorDetails = await toolResponse.text();
            } catch {
                errorDetails = toolResponse.statusText;
            }
            
            console.error('Crawl4AI Tool Server Error:', {
                status: toolResponse.status,
                statusText: toolResponse.statusText,
                details: errorDetails
            });
            
            return createJsonResponse({
                success: false,
                error: `Crawl4AI tool server request failed with status ${toolResponse.status}`,
                details: errorDetails.substring(0, 500) // 限制错误信息长度
            }, toolResponse.status);
        }
        
        const responseData = await toolResponse.json();
        
        // 🎯 关键修复：验证响应数据结构
        if (!responseData || typeof responseData !== 'object') {
            return createJsonResponse({
                success: false,
                error: 'Invalid response format from tool server'
            }, 500);
        }
        
        return createJsonResponse(responseData);

    } catch (error) {
        console.error('Failed to fetch from Crawl4AI tool server:', error);
        
        // 🎯 关键修复：区分不同类型的错误
        let errorMessage = 'Failed to connect to the external tool server.';
        if (error.name === 'TimeoutError') {
            errorMessage = 'Tool server request timed out (30s).';
        } else if (error.name === 'AbortError') {
            errorMessage = 'Tool server request was aborted.';
        } else if (error.message.includes('fetch')) {
            errorMessage = 'Network error: Unable to reach the tool server.';
        }
        
        return createJsonResponse({
            success: false,
            error: errorMessage,
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

/**
 * Tool schema definition for MCP registration
 */
export const crawl4AISchema = {
    name: "crawl4ai",
    description: "A powerful open-source tool to scrape, crawl, extract structured data, export PDFs, and capture screenshots from web pages. Supports deep crawling with multiple strategies (BFS, DFS, BestFirst), batch URL processing, AI-powered extraction, and advanced content filtering. All outputs are returned as memory streams (base64 for binary data).",
    inputSchema: {
        type: "object",
        properties: {
            mode: {
                type: "string",
                enum: ["scrape", "crawl", "deep_crawl", "extract", "batch_crawl", "pdf_export", "screenshot"],
                description: "The function to execute."
            },
            parameters: {
                type: "object",
                description: "A dictionary of parameters for the selected mode.",
                properties: {
                    // Common parameters
                    url: { type: "string", description: "The URL to process" },
                    format: { type: "string", enum: ["markdown", "html", "text"], description: "Output format for scrape mode" },
                    
                    // Crawl parameters
                    max_pages: { type: "number", description: "Maximum pages to crawl" },
                    max_depth: { type: "number", description: "Maximum crawl depth for deep_crawl" },
                    strategy: { type: "string", enum: ["bfs", "dfs", "best_first"], description: "Crawl strategy for deep_crawl" },
                    
                    // Batch parameters
                    urls: { 
                        type: "array", 
                        items: { type: "string" },
                        description: "List of URLs for batch_crawl mode" 
                    },
                    
                    // Extraction parameters
                    schema_definition: { type: "object", description: "JSON schema for extraction" },
                    extraction_type: { type: "string", enum: ["css", "llm"], description: "Extraction strategy type" },
                    
                    // Media parameters
                    return_screenshot: { type: "boolean", description: "Whether to return screenshot" },
                    return_pdf: { type: "boolean", description: "Whether to return PDF" },
                    screenshot_quality: { type: "number", description: "JPEG quality for screenshot (10-100)" },
                    screenshot_max_width: { type: "number", description: "Maximum width for screenshot" },
                    
                    // Content filtering
                    word_count_threshold: { type: "number", description: "Minimum words per content block" },
                    exclude_external_links: { type: "boolean", description: "Remove external links from content" },
                    include_external: { type: "boolean", description: "Include external domains in crawl" }
                }
            }
        },
        required: ["mode", "parameters"]
    }
};