console.log("--- ChatApiHandler v3 Loaded ---");
import { Logger } from '../utils/logger.js';
import * as chatUI from './chat-ui.js';
import { displayImageResult } from './chat-ui.js';

/**
 * @class ChatApiHandler
 * @description Handles the business logic for chat API interactions,
 * including processing streaming responses and managing tool calls.
 */
export class ChatApiHandler {
    /**
     * @constructor
     * @param {object} dependencies - The dependencies required by the handler.
     * @param {ToolManager} dependencies.toolManager - The tool manager instance.
     * @param {HistoryManager} dependencies.historyManager - The history manager instance.
     * @param {object} dependencies.state - A state object containing shared variables.
     * @param {Array} dependencies.state.chatHistory - The chat history array.
     * @param {string|null} dependencies.state.currentSessionId - The current session ID.
     * @param {HTMLElement|null} dependencies.state.currentAIMessageContentDiv - The current AI message container.
     * @param {boolean} dependencies.state.isUsingTool - Flag indicating if a tool is in use.
     * @param {object} dependencies.libs - External libraries.
     * @param {object} dependencies.libs.marked - The marked.js library instance.
     * @param {object} dependencies.libs.MathJax - The MathJax library instance.
     */
    constructor({ toolManager, historyManager, state, libs, config }) {
        this.toolManager = toolManager;
        this.historyManager = historyManager;
        this.state = state;
        this.libs = libs;
        this.config = config; // 存储配置对象
        
        // ✨ 新增：创建流上下文管理器
        this.streamContextManager = new StreamContextManager();
    }

    /**
     * Processes an HTTP Server-Sent Events (SSE) stream from the chat completions API.
     * It handles text accumulation, UI updates, and tool calls.
     * @param {object} requestBody - The request body to be sent to the model.
     * @param {string} apiKey - The API key for authorization.
     * @returns {Promise<void>}
     */
    async streamChatCompletion(requestBody, apiKey, uiOverrides = null, parentContextId = null) {
        // ✅ 步骤2: 接收 uiOverrides 参数
        const ui = uiOverrides || chatUI; // ✅ 如果有覆盖则使用，否则回退到默认的 chatUI

        // ✨ 修复：创建或获取流上下文
        const streamContext = parentContextId 
            ? this.streamContextManager.createChildContext(parentContextId, requestBody)
            : this.streamContextManager.createContext(requestBody);
            
        try {
            // ✨ 修复：标记流开始，使用上下文ID
            this.state.chatHistory.push({
                role: 'assistant',
                content: '', // 空内容表示流开始
                streamId: streamContext.id,
                timestamp: streamContext.startTime
            });

            let currentMessages = requestBody.messages;
            const selectedModelName = requestBody.model; // 获取当前模型名称
            const modelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === selectedModelName);
            
            // 检查当前模型是否为Gemini类型（通过名称判断，不依赖isGemini标签）
            const isCurrentModelGeminiType = selectedModelName.includes('gemini');
            const isReasoningEnabledGlobally = localStorage.getItem('geminiEnableReasoning') === 'true';
            
            let enableReasoning;
            if (modelConfig && modelConfig.enableReasoning !== undefined) {
                // 如果模型配置中明确设置了 enableReasoning，则以其为准
                enableReasoning = modelConfig.enableReasoning;
            } else {
                // 否则，回退到 localStorage 中的全局开关状态，但仅限于 Gemini 类型模型
                enableReasoning = isCurrentModelGeminiType && isReasoningEnabledGlobally;
            }
            
            const disableSearch = modelConfig ? modelConfig.disableSearch : false;
            
            // 提取 tools 字段，它可能来自 vision-core.js 或 chat-ui.js
            const tools = requestBody.tools;

            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                // 将 tools, enableReasoning 和 disableSearch 参数添加到请求体中
                body: JSON.stringify({ ...requestBody, tools, enableReasoning, disableSearch })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP API 请求失败: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
            }

            // ✨ 修复：使用上下文处理流
            await this._processStreamWithContext(response, streamContext, requestBody, apiKey, ui);
            
        } catch (error) {
            // ✨ 修复：使用上下文处理错误
            await this._handleStreamError(error, streamContext, ui);
        } finally {
            // ✨ 修复：延迟清理上下文，确保递归调用完成
            setTimeout(() => {
                this.streamContextManager.closeContext(streamContext.id);
            }, 1000);
        }
    }

    /**
     * ✨ 新增：使用上下文处理流数据
     * @private
     */
    async _processStreamWithContext(response, streamContext, requestBody, apiKey, ui) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                Logger.info('HTTP Stream finished.');
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            let boundary = buffer.indexOf('\n\n');

            while (boundary !== -1) {
                const message = buffer.substring(0, boundary);
                buffer = buffer.substring(boundary + 2);

                if (message.startsWith('data: ')) {
                    const jsonStr = message.substring(6);
                    if (jsonStr === '[DONE]') {
                        boundary = buffer.indexOf('\n\n');
                        continue;
                    }
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.choices && data.choices.length > 0) {
                            const choice = data.choices[0];
                            const functionCallPart = choice.delta.parts?.find(p => p.functionCall);
                            const qwenToolCallParts = choice.delta.tool_calls;

                            if (qwenToolCallParts && Array.isArray(qwenToolCallParts)) {
                                // --- Qwen Tool Call Assembly Logic ---
                                qwenToolCallParts.forEach(toolCallChunk => {
                                    const func = toolCallChunk.function;
                                    if (func && func.name) { // First chunk
                                        if (!streamContext.qwenToolCallAssembler) {
                                            streamContext.qwenToolCallAssembler = { tool_name: func.name, arguments: func.arguments || '' };
                                            Logger.info('Qwen MCP tool call started:', streamContext.qwenToolCallAssembler);
                                            ui.logMessage(`模型请求 MCP 工具: ${streamContext.qwenToolCallAssembler.tool_name}`, 'system');
                                            if (streamContext.currentAIMessageContentDiv) streamContext.currentAIMessageContentDiv = null;
                                        } else {
                                            streamContext.qwenToolCallAssembler.arguments += func.arguments || '';
                                        }
                                    } else if (streamContext.qwenToolCallAssembler && func && func.arguments) { // Subsequent chunks
                                        streamContext.qwenToolCallAssembler.arguments += func.arguments;
                                    }
                                });
                                // --- End Assembly Logic ---

                            } else if (functionCallPart) {
                                // Gemini Function Call Detected
                                streamContext.functionCallDetected = true;
                                streamContext.currentFunctionCall = functionCallPart.functionCall;
                                Logger.info('Function call detected:', streamContext.currentFunctionCall);
                                ui.logMessage(`模型请求工具: ${streamContext.currentFunctionCall.name}`, 'system');
                                if (streamContext.currentAIMessageContentDiv) streamContext.currentAIMessageContentDiv = null;

                            } else if (choice.delta && !streamContext.functionCallDetected && !streamContext.qwenToolCallAssembler) {
                                // Process reasoning and content only if no tool call is active
                                if (choice.delta.reasoning_content) {
                                    if (!streamContext.currentAIMessageContentDiv) streamContext.currentAIMessageContentDiv = ui.createAIMessageElement();
                                    
                                    // ✨ 修复：使用上下文存储 reasoningContainer
                                    if (streamContext.currentAIMessageContentDiv.reasoningContainer) {
                                        if (!streamContext.reasoningStarted) {
                                            streamContext.currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                            streamContext.reasoningStarted = true;
                                        }
                                        const reasoningText = choice.delta.reasoning_content;
                                        
                                        // ✨ 修复：使用上下文存储 reasoning buffer
                                        streamContext.rawReasoningBuffer += reasoningText;
                                        
                                        // 兼容性检查：确保 reasoning-content 元素存在
                                        const reasoningContentEl = streamContext.currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content');
                                        if (reasoningContentEl) {
                                            reasoningContentEl.innerHTML += reasoningText.replace(/\n/g, '<br>');
                                        }
                                    }
                                }
                                
                                if (choice.delta.content) {
                                    if (!streamContext.currentAIMessageContentDiv) streamContext.currentAIMessageContentDiv = ui.createAIMessageElement();
                                    
                                    // ✨ 修复：使用上下文状态
                                    if (streamContext.currentAIMessageContentDiv.reasoningContainer &&
                                        streamContext.reasoningStarted && !streamContext.answerStarted) {
                                        const separator = document.createElement('hr');
                                        separator.className = 'answer-separator';
                                        // 兼容性检查：确保 markdownContainer 存在
                                        if (streamContext.currentAIMessageContentDiv.markdownContainer) {
                                            streamContext.currentAIMessageContentDiv.markdownContainer.before(separator);
                                        }
                                        streamContext.answerStarted = true;
                                    }

                                    // ✨ 修复：使用上下文存储 markdown buffer
                                    streamContext.rawMarkdownBuffer += choice.delta.content || '';

                                    // 兼容性检查：确保 markdownContainer 存在
                                    if (streamContext.currentAIMessageContentDiv.markdownContainer) {
                                        streamContext.currentAIMessageContentDiv.markdownContainer.innerHTML = this.libs.marked.parse(
                                            streamContext.rawMarkdownBuffer
                                        );
                                    }
                                    
                                    // 应用数学公式渲染 - 兼容性处理
                                    if (typeof this.libs.MathJax !== 'undefined' && this.libs.MathJax.startup) {
                                        this.libs.MathJax.startup.promise.then(() => {
                                            const containersToTypeset = [];
                                            if (streamContext.currentAIMessageContentDiv.markdownContainer) {
                                                containersToTypeset.push(streamContext.currentAIMessageContentDiv.markdownContainer);
                                            }
                                            if (streamContext.currentAIMessageContentDiv.reasoningContainer) {
                                                containersToTypeset.push(streamContext.currentAIMessageContentDiv.reasoningContainer);
                                            }
                                            if (containersToTypeset.length > 0) {
                                                this.libs.MathJax.typeset(containersToTypeset);
                                            }
                                        }).catch((err) => console.error('MathJax typesetting failed:', err));
                                    }
                                    
                                    // 调用滚动函数
                                    if (ui.scrollToBottom) {
                                        ui.scrollToBottom();
                                    }
                                }
                            }
                        }
                        if (data.usage) {
                            Logger.info('Usage:', data.usage);
                        }
                    } catch (e) {
                        Logger.error('Error parsing SSE chunk:', e, jsonStr);
                    }
                }
                boundary = buffer.indexOf('\n\n');
            }
        }

        // ✨ 修复：使用上下文进行后处理
        await this._finalizeStreamWithContext(streamContext, requestBody, apiKey, ui);
    }

    /**
     * ✨ 新增：使用上下文完成流处理
     * @private
     */
    async _finalizeStreamWithContext(streamContext, requestBody, apiKey, ui) {
        // --- Post-Stream Processing ---
        if (streamContext.qwenToolCallAssembler) {
            streamContext.functionCallDetected = true;
            streamContext.currentFunctionCall = streamContext.qwenToolCallAssembler;
            try {
                JSON.parse(streamContext.currentFunctionCall.arguments);
            } catch (e) {
                console.error("Failed to parse assembled tool call arguments.", e);
            }
        }

        const timestamp = () => new Date().toISOString();
        if (streamContext.functionCallDetected && streamContext.currentFunctionCall) {
            console.log(`[${timestamp()}] [DISPATCH] Stream finished. Tool call detected.`);
            
            // ✨ 修复：使用上下文存储的缓冲区内容
            if (streamContext.currentAIMessageContentDiv &&
                streamContext.rawMarkdownBuffer.trim() !== '') {
                
                console.log(`[${timestamp()}] [DISPATCH] Saving final text part to history.`);
                this.state.chatHistory.push({
                    role: 'assistant',
                    content: streamContext.rawMarkdownBuffer
                });
            }
            streamContext.currentAIMessageContentDiv = null;

            // 根据 currentFunctionCall 的结构区分是 Gemini 调用还是 Qwen 调用
            console.log(`[${timestamp()}] [DISPATCH] Analyzing tool call for model: ${requestBody.model}`);
            const modelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === requestBody.model);

            const isQwenModel = modelConfig && modelConfig.isQwen;
            const isZhipuModel = modelConfig && modelConfig.isZhipu;
            const isGeminiToolModel = modelConfig && modelConfig.isGemini; // 新增：检查Gemini工具模型标签

            // 为 Qwen、Zhipu 和启用了工具的 Gemini 模型统一路由到 MCP 处理器
            if (isQwenModel || isZhipuModel || isGeminiToolModel) {
                // 对于 Gemini 风格的 functionCall，我们将其标准化为 MCP 期望的格式
                const mcpToolCall = streamContext.currentFunctionCall.tool_name
                    ? streamContext.currentFunctionCall
                    : { tool_name: streamContext.currentFunctionCall.name, arguments: JSON.stringify(streamContext.currentFunctionCall.args || {}) };
                
                console.log(`[${timestamp()}] [DISPATCH] Detected Qwen/Zhipu/Gemini MCP tool call. Routing to _handleMcpToolCall...`);
                await this._handleMcpToolCall(mcpToolCall, requestBody, apiKey, null, streamContext.id);

            } else {
                // 否则，处理为标准的、前端执行的 Gemini 函数调用（例如默认的 Google 搜索）
                console.log(`[${timestamp()}] [DISPATCH] Model is not configured for MCP. Routing to _handleGeminiToolCall...`);
                await this._handleGeminiToolCall(streamContext.currentFunctionCall, requestBody, apiKey, null, streamContext.id);
            }
            console.log(`[${timestamp()}] [DISPATCH] Returned from tool call handler.`);

        } else {
            // ✨ 修复：使用上下文存储的缓冲区内容
            if (streamContext.currentAIMessageContentDiv &&
                streamContext.rawMarkdownBuffer.trim() !== '') {
                
                const historyEntry = {
                    role: 'assistant',
                    content: streamContext.rawMarkdownBuffer
                };
                
                // 兼容性检查：如果有思维链内容也保存
                if (streamContext.rawReasoningBuffer.trim() !== '') {
                    historyEntry.reasoning = streamContext.rawReasoningBuffer;
                }
                
                this.state.chatHistory.push(historyEntry);
            }
            streamContext.currentAIMessageContentDiv = null;
            
            if (ui.logMessage) {
                ui.logMessage('Turn complete (HTTP)', 'system');
            }
            
            // 保存历史记录 - 只在有 historyManager 时保存
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory();
            }
        }
    }

    /**
     * ✨ 新增：使用上下文处理流错误
     * @private
     */
    async _handleStreamError(error, streamContext, ui) {
        Logger.error('处理 HTTP 流失败:', error);
        ui.logMessage(`处理流失败: ${error.message}`, 'system');
        if (streamContext.currentAIMessageContentDiv && streamContext.currentAIMessageContentDiv.markdownContainer) {
            streamContext.currentAIMessageContentDiv.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${error.message}</p>`;
        }
        streamContext.currentAIMessageContentDiv = null;
        // 确保在失败时也保存历史记录（如果 historyManager 存在）
        if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
            this.historyManager.saveHistory(); // Ensure history is saved even on failure
        }
    }

    /**
     * @private
     * @description Handles the execution of a Gemini tool call.
     * @param {object} functionCall - The Gemini function call object.
     * @param {object} requestBody - The original request body.
     * @param {string} apiKey - The API key.
     * @returns {Promise<void>}
     */
    _handleGeminiToolCall = async (functionCall, requestBody, apiKey, uiOverrides = null, parentContextId = null) => {
        const ui = uiOverrides || chatUI;
        try {
            this.state.isUsingTool = true;
            ui.logMessage(`执行 Gemini 工具: ${functionCall.name} with args: ${JSON.stringify(functionCall.args)}`, 'system');
            const toolResult = await this.toolManager.handleToolCall(functionCall);
            const toolResponsePart = toolResult.functionResponses[0].response.output;

            this.state.chatHistory.push({
                role: 'assistant',
                parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }]
            });

            this.state.chatHistory.push({
                role: 'tool',
                parts: [{ functionResponse: { name: functionCall.name, response: toolResponsePart } }]
            });

            // ✨ 修复：传递父上下文ID
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: this.toolManager.getToolDeclarations(),
                sessionId: this.state.currentSessionId
            }, apiKey, uiOverrides, parentContextId);
 
        } catch (toolError) {
            Logger.error('Gemini 工具执行失败:', toolError);
            ui.logMessage(`Gemini 工具执行失败: ${toolError.message}`, 'system');
            this.state.chatHistory.push({
                role: 'assistant',
                parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }]
            });
            this.state.chatHistory.push({
                role: 'tool',
                parts: [{ functionResponse: { name: functionCall.name, response: { error: toolError.message } } }]
            });
            // ✨ 修复：传递父上下文ID
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: this.toolManager.getToolDeclarations(),
                sessionId: this.state.currentSessionId
            }, apiKey, uiOverrides, parentContextId);
        } finally {
            this.state.isUsingTool = false;
            // 保存工具调用的历史记录（如果 historyManager 存在）
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory();
            }
        }
    }

    /**
     * @private
     * @description Handles the execution of a Qwen MCP tool call via the backend proxy.
     * @param {object} toolCode - The tool_code object from the Qwen model.
     * @param {object} requestBody - The original request body.
     * @param {string} apiKey - The API key.
     * @returns {Promise<void>}
     */
    _handleMcpToolCall = async (toolCode, requestBody, apiKey, uiOverrides = null, parentContextId = null) => {
        const ui = uiOverrides || chatUI;
        const timestamp = () => new Date().toISOString();
        let callId = `call_${Date.now()}`; // 在函数顶部声明并初始化 callId
        console.log(`[${timestamp()}] [MCP] --- _handleMcpToolCall START ---`);

        try {
            this.state.isUsingTool = true;
            console.log(`[${timestamp()}] [MCP] State isUsingTool set to true.`);

            // 显示工具调用状态UI
            console.log(`[${timestamp()}] [MCP] Displaying tool call status UI for tool: ${toolCode.tool_name}`);
            ui.displayToolCallStatus(toolCode.tool_name, toolCode.arguments);
            ui.logMessage(`通过代理执行 MCP 工具: ${toolCode.tool_name} with args: ${JSON.stringify(toolCode.arguments)}`, 'system');
            console.log(`[${timestamp()}] [MCP] Tool call status UI displayed.`);
 
            // ✨ 修复：不再查找 mcp_server_url，直接发送到后端代理
            console.log(`[${timestamp()}] [MCP] Using unified backend proxy for tool: ${toolCode.tool_name}`);

            // --- Revert to Standard MCP Request Format for glm4v ---
            // We are no longer using Tavily's non-standard API.
            // We will now send the full, unmodified arguments object to the proxy.
            let parsedArguments;
            try {
                parsedArguments = this._robustJsonParse(toolCode.arguments);
            } catch (e) {
                const errorMsg = `无法解析来自模型的工具参数，即使在尝试修复后也是如此: ${toolCode.arguments}`;
                console.error(`[${timestamp()}] [MCP] ROBUST PARSE FAILED: ${errorMsg}`, e);
                throw new Error(errorMsg);
            }

            // ✨ 修复：构建简化的请求体，不再包含 server_url
            const proxyRequestBody = {
                tool_name: toolCode.tool_name,
                parameters: parsedArguments, // Send the full, parsed arguments object
                requestId: `tool_call_${Date.now()}`
            };
            console.log(`[${timestamp()}] [MCP] Constructed proxy request body:`, JSON.stringify(proxyRequestBody, null, 2));

            // 调用后端代理
            console.log(`[${timestamp()}] [MCP] Sending fetch request to /api/mcp-proxy...`);
            const proxyResponse = await fetch('/api/mcp-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proxyRequestBody)
            });
            console.log(`[${timestamp()}] [MCP] Fetch request to /api/mcp-proxy FINISHED. Response status: ${proxyResponse.status}`);

            if (!proxyResponse.ok) {
                const errorData = await proxyResponse.json();
                const errorMsg = `MCP 代理请求失败: ${errorData.details || proxyResponse.statusText}`;
                console.error(`[${timestamp()}] [MCP] ERROR: ${errorMsg}`);
                throw new Error(errorMsg);
            }

            const toolRawResult = await proxyResponse.json();
            console.log(`[${timestamp()}] [MCP] Successfully parsed JSON from proxy response:`, toolRawResult);

            let toolResultContent; // Declare without initializing

            // Enhanced handling for python_sandbox output to detect and display images and download files
            if (toolCode.tool_name === 'python_sandbox') {
                console.log(`[${timestamp()}] [MCP] Processing python_sandbox output`);
                let isFileHandled = false;
                
                // 关键修复：处理MCP代理返回的嵌套结构
                let actualStdout = '';
                if (toolRawResult && toolRawResult.stdout && typeof toolRawResult.stdout === 'string') {
                    // 如果toolRawResult.stdout是字符串，直接使用
                    actualStdout = toolRawResult.stdout.trim();
                } else if (toolRawResult && toolRawResult.type === 'text' && toolRawResult.stdout) {
                    // 如果toolRawResult是对象且包含stdout字段
                    actualStdout = toolRawResult.stdout.trim();
                } else if (toolRawResult && typeof toolRawResult === 'string') {
                    // 如果toolRawResult本身就是字符串
                    actualStdout = toolRawResult.trim();
                }
                
                console.log(`[${timestamp()}] [MCP] Actual stdout content:`, actualStdout.substring(0, 200) + '...');
                
                if (actualStdout) {
                    // 尝试解析为JSON对象
                    try {
                        let fileData = JSON.parse(actualStdout);
                        console.log(`[${timestamp()}] [MCP] First level JSON parsed:`, fileData);
                        
                        // 关键修复：如果解析出来的是包装结构，提取实际的stdout内容
                        if (fileData && fileData.type === 'text' && fileData.stdout) {
                            console.log(`[${timestamp()}] [MCP] Detected wrapped structure, extracting stdout`);
                            actualStdout = fileData.stdout;
                            fileData = JSON.parse(actualStdout); // 重新解析实际的Python输出
                            console.log(`[${timestamp()}] [MCP] Second level JSON parsed:`, fileData);
                        }
                        
                        // 处理图片类型
                        if (fileData && fileData.type === 'image' && fileData.image_base64) {
                            console.log(`[${timestamp()}] [MCP] Detected image file`);
                            const title = fileData.title || 'Generated Chart';
                            displayImageResult(fileData.image_base64, title, `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`);
                            toolResultContent = { output: `Image "${title}" generated and displayed.` };
                            isFileHandled = true;
                        }
                        // 处理Office文档和PDF类型（标准格式）
                        else if (fileData && fileData.type && ['excel', 'word', 'ppt', 'pdf'].includes(fileData.type) && fileData.data_base64) {
                            console.log(`[${timestamp()}] [MCP] Detected standard format office file:`, fileData.type);
                            const extensionMap = { 'word': 'docx', 'excel': 'xlsx', 'ppt': 'pptx', 'pdf': 'pdf' };
                            const fileExtension = extensionMap[fileData.type] || fileData.type;
                            const fileName = fileData.title ? `${fileData.title}.${fileExtension}` : `download.${fileExtension}`;
                            
                            // *** KEY FIX START ***
                            // 1. Create the persistent download link in its own, new message container.
                            this._createFileDownload(fileData.data_base64, fileName, fileData.type, ui);
                            // 2. 强制状态重置：明确设置当前消息容器为 null，确保后续文本响应创建新的容器。
                            // ✨ 修复：不再操作全局状态，由上下文管理
                            // this.state.currentAIMessageContentDiv = null;
                            // *** KEY FIX END ***
                            
                            toolResultContent = { output: `${fileData.type.toUpperCase()} file "${fileName}" generated and available for download.` };
                            isFileHandled = true;
                        }
                        // 处理自定义格式
                        else if (fileData && fileData.file && fileData.file.name && fileData.file.content) {
                            console.log(`[${timestamp()}] [MCP] Detected custom format file:`, fileData.file.name);
                            const { name, content } = fileData.file;
                            const fileExtension = name.split('.').pop().toLowerCase();
                            
                            const fileTypeMap = { 'docx': 'word', 'xlsx': 'excel', 'pptx': 'ppt', 'pdf': 'pdf' };
                            const fileType = fileTypeMap[fileExtension];

                            if (fileType) {
                                // 关键修复：创建独立下载链接并强制状态重置
                                this._createFileDownload(content, name, fileType, ui);
                                // ✨ 修复：不再操作全局状态
                                // this.state.currentAIMessageContentDiv = null;

                                toolResultContent = { output: `${fileType.toUpperCase()} file "${name}" generated and available for download.` };
                                isFileHandled = true;
                            }
                        } else {
                            console.log(`[${timestamp()}] [MCP] JSON parsed but format not recognized:`, Object.keys(fileData));
                        }

                    } catch (e) {
                        console.log(`[${timestamp()}] [MCP] JSON parse failed:`, e.message);
                        console.log(`[${timestamp()}] [MCP] Raw content that failed to parse:`, actualStdout.substring(0, 200));
                    }

                    // 如果不是JSON格式，继续原有的图片检测逻辑
                    if (!isFileHandled) {
                        console.log(`[${timestamp()}] [MCP] Checking for image format`);
                        if (actualStdout.startsWith('iVBORw0KGgo') || actualStdout.startsWith('/9j/')) {
                            console.log(`[${timestamp()}] [MCP] Detected image format`);
                            displayImageResult(actualStdout, 'Generated Chart', `chart_${Date.now()}.png`);
                            toolResultContent = { output: 'Image generated and displayed.' };
                            isFileHandled = true;
                        } else if (actualStdout) {
                            console.log(`[${timestamp()}] [MCP] Treating as plain text output`);
                            toolResultContent = { output: actualStdout };
                        }
                    }
                 }
                 
                 console.log(`[${timestamp()}] [MCP] File handling completed, isFileHandled:`, isFileHandled);
                 
                 // 处理stderr
                 if (toolRawResult && toolRawResult.stderr) {
                     ui.logMessage(`Python Sandbox STDERR: ${toolRawResult.stderr}`, 'system');
                     if (toolResultContent && toolResultContent.output) {
                         toolResultContent.output += `\nError: ${toolRawResult.stderr}`;
                    } else {
                        toolResultContent = { output: `Error: ${toolRawResult.stderr}` };
                    }
                }
                
                if (!toolResultContent) {
                    toolResultContent = { output: "Tool executed successfully with no output." };
                }
            } else {
                // For ALL other tools, wrap the raw result consistently to ensure a predictable
                // structure for the transit worker.
                toolResultContent = { output: toolRawResult };
            }

            // --- Special handling for mcp_tool_catalog tool ---
            if (toolCode.tool_name === 'mcp_tool_catalog' && toolRawResult && toolRawResult.data && Array.isArray(toolRawResult.data)) {
                console.log(`[${timestamp()}] [MCP] Discovered new tools via mcp_tool_catalog. Merging...`);
                
                // 获取当前Qwen模型的完整工具列表
                const currentModelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === requestBody.model);
                let allCurrentTools = currentModelConfig && currentModelConfig.tools ? [...currentModelConfig.tools] : [];

                // 过滤掉重复的工具，然后合并
                const newToolsToAdd = toolRawResult.data.filter(newTool =>
                    !allCurrentTools.some(existingTool => existingTool.function.name === newTool.function.name)
                );
                allCurrentTools = [...allCurrentTools, ...newToolsToAdd];
                
                // 更新 requestBody，确保下次 streamChatCompletion 包含最新工具列表
                requestBody.tools = allCurrentTools;
                console.log(`[${timestamp()}] [MCP] Updated requestBody.tools with ${newToolsToAdd.length} new tools.`);
            }

            // --- Refactored History Logging based on AliCloud Docs ---
            // 1. Push the assistant's decision to call the tool.
            // This must be an object with a `tool_calls` array.
            console.log(`[${timestamp()}] [MCP] Pushing assistant 'tool_calls' message to history...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: null, // Qwen expects content to be null when tool_calls are present
                tool_calls: [{
                    id: callId, // Generate a unique ID for the call
                    type: 'function',
                    function: {
                        name: toolCode.tool_name,
                        arguments: JSON.stringify(parsedArguments) // 使用 parsedArguments
                    }
                }]
            });

            // 2. Push the result from the tool execution.
            // This must be an object with `role: 'tool'`.
            console.log(`[${timestamp()}] [MCP] Pushing 'tool' result message to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify(toolResultContent), // Use the possibly modified content
                tool_call_id: callId // 确保匹配 assistant message 中的 ID
            });

            // 再次调用模型以获得最终答案
            console.log(`[${timestamp()}] [MCP] Resuming chat completion with tool result...`);
            // ✨ 修复：传递父上下文ID
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                // 确保再次传递工具定义，以防需要连续调用
                tools: requestBody.tools // Now 'requestBody.tools' might be updated with newly discovered tools
            }, apiKey, uiOverrides, parentContextId);
            console.log(`[${timestamp()}] [MCP] Chat completion stream finished.`);
 
        } catch (toolError) {
            console.error(`[${timestamp()}] [MCP] --- CATCH BLOCK ERROR ---`, toolError);
            Logger.error('MCP 工具执行失败:', toolError);
            ui.logMessage(`MCP 工具执行失败: ${toolError.message}`, 'system');
            
            // 即使失败，也要将失败信息以正确的格式加入历史记录
            const callId = `call_${Date.now()}`; // 统一生成 ID
            console.log(`[${timestamp()}] [MCP] Pushing assistant 'tool_calls' message to history on error...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: callId, // 使用统一的 ID
                    type: 'function',
                    function: {
                        name: toolCode.tool_name,
                        arguments: toolCode.arguments // 保持原始字符串格式
                    }
                }]
            });
            console.log(`[${timestamp()}] [MCP] Pushing 'tool' error result to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify({ error: toolError.message }), // Use the possibly modified content
                tool_call_id: callId // 确保匹配 assistant message 中的 ID
            });
            
            // 再次调用模型，让它知道工具失败了
            console.log(`[${timestamp()}] [MCP] Resuming chat completion with tool error...`);
            // ✨ 修复：传递父上下文ID
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: requestBody.tools
            }, apiKey, uiOverrides, parentContextId);
            console.log(`[${timestamp()}] [MCP] Chat completion stream after error finished.`);
        } finally {
            this.state.isUsingTool = false;
            console.log(`[${timestamp()}] [MCP] State isUsingTool set to false.`);
            console.log(`[${timestamp()}] [MCP] --- _handleMcpToolCall END ---`);
            // 保存工具调用的历史记录（如果 historyManager 存在）
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory();
            }
        }
    }

    // ... 其余方法保持不变 (_createFileDownload, _robustJsonParse, callTool) ...
}

/**
 * ✨ 新增：流上下文管理器类
 * @class StreamContextManager
 * @description 管理每个流的上下文，防止状态竞态条件
 */
class StreamContextManager {
    constructor() {
        this.activeContexts = new Map();
        this.contextIdCounter = 0;
    }
    
    /**
     * 创建新的流上下文
     * @param {object} requestBody - 请求体
     * @returns {object} 上下文对象
     */
    createContext(requestBody) {
        const contextId = `stream_${Date.now()}_${this.contextIdCounter++}`;
        const context = {
            id: contextId,
            currentAIMessageContentDiv: null,
            rawMarkdownBuffer: '',
            rawReasoningBuffer: '',
            reasoningStarted: false,
            answerStarted: false,
            functionCallDetected: false,
            currentFunctionCall: null,
            qwenToolCallAssembler: null,
            isToolResponseFollowUp: requestBody.messages.some(msg => msg.role === 'tool'),
            startTime: Date.now(),
            parentContextId: null
        };
        
        this.activeContexts.set(contextId, context);
        return context;
    }
    
    /**
     * 获取指定ID的上下文
     * @param {string} contextId - 上下文ID
     * @returns {object|null} 上下文对象
     */
    getContext(contextId) {
        return this.activeContexts.get(contextId);
    }
    
    /**
     * 关闭并清理上下文
     * @param {string} contextId - 上下文ID
     */
    closeContext(contextId) {
        const context = this.activeContexts.get(contextId);
        if (context) {
            // 清理资源
            context.currentAIMessageContentDiv = null;
            this.activeContexts.delete(contextId);
        }
    }
    
    /**
     * 创建子上下文，防止嵌套调用导致的上下文混乱
     * @param {string} parentContextId - 父上下文ID
     * @param {object} requestBody - 请求体
     * @returns {object} 子上下文对象
     */
    createChildContext(parentContextId, requestBody) {
        const parentContext = this.getContext(parentContextId);
        if (!parentContext) {
            return this.createContext(requestBody);
        }
        
        const childContext = this.createContext(requestBody);
        childContext.parentContextId = parentContextId;
        return childContext;
    }
}