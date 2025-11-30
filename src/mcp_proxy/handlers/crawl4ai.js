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

    // 验证参数
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ success: false, error: 'Missing or invalid "parameters" object for crawl4ai tool.' }, 400);
    }

    const { mode, parameters } = tool_params;

    if (!mode) {
        return createJsonResponse({ success: false, error: 'Missing required parameter: "mode" for crawl4ai tool.' }, 400);
    }

    // 🎯 异步任务状态查询的特殊处理
    if (mode === 'async_task_status') {
        // 快速返回，不需要长时间等待
        const requestBody = {
            tool_name: 'crawl4ai',
            parameters: tool_params
        };

        try {
            const toolResponse = await fetch(toolServerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(10000) // 10秒超时
            });

            if (!toolResponse.ok) {
                throw new Error(`Tool server returned ${toolResponse.status}`);
            }

            return createJsonResponse(await toolResponse.json());
        } catch (error) {
            console.error('Async task status check failed:', error);
            return createJsonResponse({
                success: false,
                error: 'Failed to check task status',
                details: error.message
            }, 500);
        }
    }

    // 🎯 长时间任务：启动异步模式
    const isLongRunningTask = ['deep_crawl', 'batch_crawl'].includes(mode);
    // 🎯 修复：添加对 parameters 存在的检查
    const shouldUseAsync = parameters && parameters.async_mode !== false; // 默认启用异步模式
    
    if (isLongRunningTask && shouldUseAsync) {
        // 对于长时间任务，强制使用异步模式
        const asyncParams = {
            ...tool_params,
            parameters: {
                ...parameters,
                async_mode: true
            }
        };

        const requestBody = {
            tool_name: 'crawl4ai',
            parameters: asyncParams
        };

        try {
            // 🎯 关键：启动任务但不等待完成
            const toolResponse = await fetch(toolServerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(30000) // 30秒启动超时
            });

            if (!toolResponse.ok) {
                throw new Error(`Tool server returned ${toolResponse.status}`);
            }

            const result = await toolResponse.json();
            
            // 🎯 如果是异步任务响应，直接返回给前端进行轮询
            if (result.task_id) {
                return createJsonResponse({
                    success: true,
                    async: true,
                    task_id: result.task_id,
                    status: result.status,
                    message: result.message,
                    polling_interval: result.polling_interval || 3
                });
            }

            return createJsonResponse(result);

        } catch (error) {
            console.error('Failed to start async task:', error);
            return createJsonResponse({
                success: false,
                error: 'Failed to start async task',
                details: error.message
            }, 500);
        }
    }

    // 🎯 短时间任务：保持原有同步逻辑
    const requestBody = {
        tool_name: 'crawl4ai',
        parameters: tool_params
    };

    try {
        const toolResponse = await fetch(toolServerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(90000)
        });

        if (!toolResponse.ok) {
            let errorDetails;
            try {
                errorDetails = await toolResponse.text();
            } catch {
                errorDetails = toolResponse.statusText;
            }
            
            return createJsonResponse({
                success: false,
                error: `Crawl4AI tool server request failed with status ${toolResponse.status}`,
                details: errorDetails.substring(0, 500)
            }, toolResponse.status);
        }
        
        const responseData = await toolResponse.json();
        return createJsonResponse(responseData);

    } catch (error) {
        console.error('Failed to fetch from Crawl4AI tool server:', error);
        
        let errorMessage = 'Failed to connect to the external tool server.';
        if (error.name === 'TimeoutError') {
            errorMessage = 'Tool server request timed out.';
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
                enum: ["scrape", "crawl", "deep_crawl", "extract", "batch_crawl", "pdf_export", "screenshot", "async_task_status"],
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
                    
                    // 🟢 添加缺失的参数
                    async_mode: { type: "boolean", description: "Whether to run as async task" },
                    keywords: {
                        type: "array",
                        items: { type: "string" },
                        description: "Keywords for relevance scoring in deep_crawl"
                    },
                    url_patterns: {
                        type: "array",
                        items: { type: "string" },
                        description: "URL patterns to include in deep_crawl"
                    },
                    prompt: { type: "string", description: "Prompt for LLM extraction" },
                    include_external_links: { type: "boolean", description: "Whether to include external links" },
                    include_images: { type: "boolean", description: "Whether to include images" },
                    full_page: { type: "boolean", description: "Whether to capture full page screenshot" },
                    
                    exclude_external_links: { type: "boolean", description: "Remove external links from content" },
                    include_external: { type: "boolean", description: "Include external domains in crawl" }
                }
            }
        },
        required: ["mode", "parameters"]
    }
};