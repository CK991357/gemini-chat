/**
 * @file MCP Proxy Handler for Crawl4AI
 * @description Handles the 'crawl4ai' tool call with streaming response to avoid Cloudflare Worker timeout.
 */

/**
 * Executes the Crawl4AI tool with streaming response to keep connection alive.
 * @param {object} tool_params - The parameters for the tool call.
 * @param {object} env - The Cloudflare Worker environment object.
 * @returns {Promise<Response>} - A promise that resolves to a streaming Response.
 */
/**
 * 🎯 模式专用超时设置（毫秒）
 * @param {string} mode - Crawl4AI 模式
 * @returns {number} - 超时时间（毫秒）
 */
const getTimeoutForMode = (mode) => {
    const timeouts = {
        'deep_crawl': 400000,    // 400秒 (后端最大超时)
        'batch_crawl': 300000,   // 300秒
        'extract': 120000,        // 120秒
        'scrape': 90000,         // 90秒
        'pdf_export': 90000,     // 90秒
        'screenshot': 90000      // 90秒
    };
    // 默认使用 deep_crawl 的超时时间，以防模式未定义
    return timeouts[mode] || timeouts['deep_crawl'];
};

export async function handleCrawl4AI(tool_params, env) {
    const toolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';

    // Validate parameters
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
    
    // 批量模式不需要 url 参数
    if (mode !== 'batch_crawl' && !parameters.url) {
        return createJsonResponse({
            success: false,
            error: 'Missing required parameter: "url" in parameters object.'
        }, 400);
    }

    // Validate mode
    const allowedModes = ['scrape', 'crawl', 'deep_crawl', 'extract', 'batch_crawl', 'pdf_export', 'screenshot'];
    if (!allowedModes.includes(mode)) {
        return createJsonResponse({
            success: false,
            error: `Invalid mode "${mode}". Allowed modes are: ${allowedModes.join(', ')}`
        }, 400);
    }

    const requestBody = {
        tool_name: 'crawl4ai',
        parameters: tool_params
    };

    try {
        // 🔥 修复：创建流式响应（不使用 waitUntil）
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        // 🎯 直接启动处理，不使用 waitUntil
        processCrawlRequest(writer, encoder, toolServerUrl, requestBody, mode, parameters.url || 'batch_crawl')
            .catch(error => {
                console.error('Background processing error:', error);
            });

        return new Response(readable, {
            headers: {
                'Content-Type': 'application/x-ndjson', // 使用 NDJSON 流格式
                'Access-Control-Allow-Origin': '*',
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error) {
        console.error('Failed to create streaming response:', error);
        return createJsonResponse({
            success: false,
            error: 'Failed to initiate streaming request: ' + error.message
        }, 500);
    }
}

/**
 * Background processing with heartbeat to keep connection alive
 */
async function processCrawlRequest(writer, encoder, toolServerUrl, requestBody, mode, url) {
    let heartbeatInterval;
    let requestCompleted = false;
    
    try {
        // 🎯 立即发送开始状态
        await writer.write(encoder.encode(JSON.stringify({
            type: 'status',
            status: 'started',
            message: `Starting ${mode} operation for ${url}`,
            timestamp: new Date().toISOString()
        }) + '\n'));

        // 🎯 启动心跳 - 每15秒发送一次（更保守）
        heartbeatInterval = setInterval(async () => {
            if (!requestCompleted) {
                try {
                    await writer.write(encoder.encode(JSON.stringify({
                        type: 'heartbeat',
                        status: 'processing',
                        message: `Still processing ${mode} request...`,
                        timestamp: new Date().toISOString(),
                        progress: 'alive'
                    }) + '\n'));
                } catch (heartbeatError) {
                    // 心跳写入失败可能表示客户端断开连接
                    console.log('Heartbeat failed, client may have disconnected');
                    clearInterval(heartbeatInterval);
                }
            }
        }, 15000); // 每15秒发送心跳（更保守）

        // 🎯 发送进度更新
        await sendProgressUpdate(writer, encoder, mode, 'initializing', 'Initializing crawler...');

        // 🔥 执行实际的工具服务器请求（带更保守的超时）
        const controller = new AbortController();
        // 🎯 修正：根据模式设置超时时间
        const BACKEND_TIMEOUT_MS = getTimeoutForMode(mode);
        const timeoutId = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

        try {
            await sendProgressUpdate(writer, encoder, mode, 'fetching', 'Sending request to tool server...');
            
            const toolResponse = await fetch(toolServerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!toolResponse.ok) {
                let errorDetails;
                try {
                    errorDetails = await toolResponse.text();
                } catch {
                    errorDetails = toolResponse.statusText;
                }
                
                await sendProgressUpdate(writer, encoder, mode, 'error', `Tool server error: ${toolResponse.status}`);
                
                await writer.write(encoder.encode(JSON.stringify({
                    type: 'error',
                    success: false,
                    error: `Tool server request failed with status ${toolResponse.status}`,
                    details: errorDetails.substring(0, 500),
                    timestamp: new Date().toISOString()
                }) + '\n'));
                
                return;
            }

            await sendProgressUpdate(writer, encoder, mode, 'processing', 'Processing response from tool server...');
            
            const responseData = await toolResponse.json();
            
            if (!responseData || typeof responseData !== 'object') {
                await writer.write(encoder.encode(JSON.stringify({
                    type: 'error',
                    success: false,
                    error: 'Invalid response format from tool server',
                    timestamp: new Date().toISOString()
                }) + '\n'));
                return;
            }

            // 🎯 发送最终结果
            await sendProgressUpdate(writer, encoder, mode, 'completed', 'Operation completed successfully');
            
            await writer.write(encoder.encode(JSON.stringify({
                type: 'result',
                success: true,
                data: responseData,
                timestamp: new Date().toISOString()
            }) + '\n'));

        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                await sendProgressUpdate(writer, encoder, mode, 'error', `Request timeout (${BACKEND_TIMEOUT_MS / 1000}s) exceeded`);
                await writer.write(encoder.encode(JSON.stringify({
                    type: 'error',
                    success: false,
                    error: `Tool server request timed out after ${BACKEND_TIMEOUT_MS / 1000} seconds`,
                    timestamp: new Date().toISOString()
                }) + '\n'));
            } else {
                await sendProgressUpdate(writer, encoder, mode, 'error', `Request failed: ${fetchError.message}`);
                await writer.write(encoder.encode(JSON.stringify({
                    type: 'error',
                    success: false,
                    error: `Request failed: ${fetchError.message}`,
                    details: fetchError.stack || 'No stack trace available',
                    timestamp: new Date().toISOString()
                }) + '\n'));
            }
        }

    } catch (error) {
        console.error('Unexpected error in background processing:', error);
        try {
            await writer.write(encoder.encode(JSON.stringify({
                type: 'error',
                success: false,
                error: `Unexpected error: ${error.message}`,
                details: error.stack || 'No stack trace available',
                timestamp: new Date().toISOString()
            }) + '\n'));
        } catch (writeError) {
            // 忽略写入错误，连接可能已经关闭
        }
    } finally {
        // 🎯 清理资源
        requestCompleted = true;
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
        
        try {
            // 发送结束标记
            await writer.write(encoder.encode(JSON.stringify({
                type: 'end',
                timestamp: new Date().toISOString()
            }) + '\n'));
            
            await writer.close();
        } catch (closeError) {
            // 忽略关闭错误
        }
    }
}

/**
 * Send progress updates with mode-specific messages
 */
async function sendProgressUpdate(writer, encoder, mode, stage, message) {
    const progressMessages = {
        'scrape': {
            'initializing': 'Initializing web scraper...',
            'fetching': 'Fetching webpage content...',
            'processing': 'Processing and cleaning content...',
            'completed': 'Content extraction completed'
        },
        'deep_crawl': {
            'initializing': 'Initializing deep crawl engine...',
            'fetching': 'Discovering and crawling pages...',
            'processing': 'Analyzing crawled content...',
            'completed': 'Deep crawl completed'
        },
        'extract': {
            'initializing': 'Initializing data extraction...',
            'fetching': 'Extracting structured data...',
            'processing': 'Processing extracted information...',
            'completed': 'Data extraction completed'
        },
        'batch_crawl': {
            'initializing': 'Initializing batch crawl...',
            'fetching': 'Processing URLs in batch...',
            'processing': 'Aggregating batch results...',
            'completed': 'Batch crawl completed'
        },
        'pdf_export': {
            'initializing': 'Initializing PDF export...',
            'fetching': 'Rendering page for PDF...',
            'processing': 'Generating PDF file...',
            'completed': 'PDF export completed'
        },
        'screenshot': {
            'initializing': 'Initializing screenshot capture...',
            'fetching': 'Capturing page screenshot...',
            'processing': 'Compressing and encoding image...',
            'completed': 'Screenshot capture completed'
        }
    };

    const modeMessages = progressMessages[mode] || {};
    const finalMessage = modeMessages[stage] || message;

    try {
        await writer.write(encoder.encode(JSON.stringify({
            type: 'progress',
            mode: mode,
            stage: stage,
            message: finalMessage,
            timestamp: new Date().toISOString()
        }) + '\n'));
    } catch (error) {
        console.warn('Failed to send progress update:', error);
    }
}

/**
 * Helper to create a consistent JSON response (for non-streaming errors)
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