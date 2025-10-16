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
    }

    /**
     * Processes an HTTP Server-Sent Events (SSE) stream from the chat completions API.
     * It handles text accumulation, UI updates, and tool calls.
     * @param {object} requestBody - The request body to be sent to the model.
     * @param {string} apiKey - The API key for authorization.
     * @returns {Promise<void>}
     */
    async streamChatCompletion(requestBody, apiKey, uiOverrides = null) {
        // ✅ 步骤2: 接收 uiOverrides 参数
        const ui = uiOverrides || chatUI; // ✅ 如果有覆盖则使用，否则回退到默认的 chatUI

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

        try {
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

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let functionCallDetected = false;
            let currentFunctionCall = null;
            let reasoningStarted = false;
            let answerStarted = false;

            // --- Qwen Tool Call Stream Assembler ---
            let qwenToolCallAssembler = null;
            // ---

            const isToolResponseFollowUp = currentMessages.some(msg => msg.role === 'tool');
            // 关键修改：只有在不是工具响应跟随 且 不在工具使用过程中时，才创建新的消息容器
            if (!isToolResponseFollowUp && !this.state.isUsingTool) {
                this.state.currentAIMessageContentDiv = ui.createAIMessageElement();
            }

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
                                            if (!qwenToolCallAssembler) {
                                                qwenToolCallAssembler = { tool_name: func.name, arguments: func.arguments || '' };
                                                Logger.info('Qwen MCP tool call started:', qwenToolCallAssembler);
                                                ui.logMessage(`模型请求 MCP 工具: ${qwenToolCallAssembler.tool_name}`, 'system');
                                                if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;
                                            } else {
                                                qwenToolCallAssembler.arguments += func.arguments || '';
                                            }
                                        } else if (qwenToolCallAssembler && func && func.arguments) { // Subsequent chunks
                                            qwenToolCallAssembler.arguments += func.arguments;
                                        }
                                    });
                                    // --- End Assembly Logic ---

                                } else if (functionCallPart) {
                                    // Gemini Function Call Detected
                                    functionCallDetected = true;
                                    currentFunctionCall = functionCallPart.functionCall;
                                    Logger.info('Function call detected:', currentFunctionCall);
                                    ui.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                    if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;

                                } else if (choice.delta && !functionCallDetected && !qwenToolCallAssembler) {
                                    // Process reasoning and content only if no tool call is active
                                    if (choice.delta.reasoning_content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = ui.createAIMessageElement();
                                        
                                        // 兼容性检查：确保 reasoningContainer 存在
                                        if (this.state.currentAIMessageContentDiv.reasoningContainer) {
                                            if (!reasoningStarted) {
                                                this.state.currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                                reasoningStarted = true;
                                            }
                                            const reasoningText = choice.delta.reasoning_content;
                                            
                                            // 兼容性检查：确保 rawReasoningBuffer 存在
                                            if (typeof this.state.currentAIMessageContentDiv.rawReasoningBuffer === 'string') {
                                                this.state.currentAIMessageContentDiv.rawReasoningBuffer += reasoningText;
                                            } else {
                                                this.state.currentAIMessageContentDiv.rawReasoningBuffer = reasoningText;
                                            }
                                            
                                            // 兼容性检查：确保 reasoning-content 元素存在
                                            const reasoningContentEl = this.state.currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content');
                                            if (reasoningContentEl) {
                                                reasoningContentEl.innerHTML += reasoningText.replace(/\n/g, '<br>');
                                            }
                                        }
                                    }
                                    
                                    if (choice.delta.content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = ui.createAIMessageElement();
                                        
                                        // 兼容性检查：确保 reasoningContainer 存在且需要添加分隔线
                                        if (this.state.currentAIMessageContentDiv.reasoningContainer &&
                                            reasoningStarted && !answerStarted) {
                                            const separator = document.createElement('hr');
                                            separator.className = 'answer-separator';
                                            // 兼容性检查：确保 markdownContainer 存在
                                            if (this.state.currentAIMessageContentDiv.markdownContainer) {
                                                this.state.currentAIMessageContentDiv.markdownContainer.before(separator);
                                            }
                                            answerStarted = true;
                                        }

                                        // 兼容性处理：确保 rawMarkdownBuffer 存在
                                        if (typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string') {
                                            this.state.currentAIMessageContentDiv.rawMarkdownBuffer += choice.delta.content || '';
                                        } else {
                                            // 如果不存在，初始化
                                            this.state.currentAIMessageContentDiv.rawMarkdownBuffer = choice.delta.content || '';
                                        }

                                        // 兼容性检查：确保 markdownContainer 存在
                                        if (this.state.currentAIMessageContentDiv.markdownContainer) {
                                            this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = this.libs.marked.parse(
                                                this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                                            );
                                        }
                                        
                                        // 应用数学公式渲染 - 兼容性处理
                                        if (typeof this.libs.MathJax !== 'undefined' && this.libs.MathJax.startup) {
                                            this.libs.MathJax.startup.promise.then(() => {
                                                const containersToTypeset = [];
                                                if (this.state.currentAIMessageContentDiv.markdownContainer) {
                                                    containersToTypeset.push(this.state.currentAIMessageContentDiv.markdownContainer);
                                                }
                                                if (this.state.currentAIMessageContentDiv.reasoningContainer) {
                                                    containersToTypeset.push(this.state.currentAIMessageContentDiv.reasoningContainer);
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

            // --- Post-Stream Processing ---
            if (qwenToolCallAssembler) {
                functionCallDetected = true;
                currentFunctionCall = qwenToolCallAssembler;
                try {
                    JSON.parse(currentFunctionCall.arguments);
                } catch (e) {
                    console.error("Failed to parse assembled tool call arguments.", e);
                }
            }

            const timestamp = () => new Date().toISOString();
            if (functionCallDetected && currentFunctionCall) {
                console.log(`[${timestamp()}] [DISPATCH] Stream finished. Tool call detected.`);
                
                // 兼容性处理：保存最终文本到历史记录
                if (this.state.currentAIMessageContentDiv &&
                    typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string' &&
                    this.state.currentAIMessageContentDiv.rawMarkdownBuffer.trim() !== '') {
                    
                    console.log(`[${timestamp()}] [DISPATCH] Saving final text part to history.`);
                    this.state.chatHistory.push({
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    });
                }
                this.state.currentAIMessageContentDiv = null;

                // 根据 currentFunctionCall 的结构区分是 Gemini 调用还是 Qwen 调用
                console.log(`[${timestamp()}] [DISPATCH] Analyzing tool call for model: ${requestBody.model}`);
                const modelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === requestBody.model);

                const isQwenModel = modelConfig && modelConfig.isQwen;
                const isZhipuModel = modelConfig && modelConfig.isZhipu;
                const isGeminiToolModel = modelConfig && modelConfig.isGemini; // 新增：检查Gemini工具模型标签

                // 为 Qwen、Zhipu 和启用了工具的 Gemini 模型统一路由到 MCP 处理器
                if (isQwenModel || isZhipuModel || isGeminiToolModel) {
                    // 对于 Gemini 风格的 functionCall，我们将其标准化为 MCP 期望的格式
                    const mcpToolCall = currentFunctionCall.tool_name
                        ? currentFunctionCall
                        : { tool_name: currentFunctionCall.name, arguments: JSON.stringify(currentFunctionCall.args || {}) };
                    
                    console.log(`[${timestamp()}] [DISPATCH] Detected Qwen/Zhipu/Gemini MCP tool call. Routing to _handleMcpToolCall...`);
                    await this._handleMcpToolCall(mcpToolCall, requestBody, apiKey, uiOverrides);

                } else {
                    // 否则，处理为标准的、前端执行的 Gemini 函数调用（例如默认的 Google 搜索）
                    console.log(`[${timestamp()}] [DISPATCH] Model is not configured for MCP. Routing to _handleGeminiToolCall...`);
                    await this._handleGeminiToolCall(currentFunctionCall, requestBody, apiKey, uiOverrides);
                }
                console.log(`[${timestamp()}] [DISPATCH] Returned from tool call handler.`);

            } else {
                // 兼容性处理：保存非工具调用的响应
                if (this.state.currentAIMessageContentDiv &&
                    typeof this.state.currentAIMessageContentDiv.rawMarkdownBuffer === 'string' &&
                    this.state.currentAIMessageContentDiv.rawMarkdownBuffer.trim() !== '') {
                    
                    const historyEntry = {
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    };
                    
                    // 兼容性检查：如果有思维链内容也保存
                    if (typeof this.state.currentAIMessageContentDiv.rawReasoningBuffer === 'string' &&
                        this.state.currentAIMessageContentDiv.rawReasoningBuffer.trim() !== '') {
                        historyEntry.reasoning = this.state.currentAIMessageContentDiv.rawReasoningBuffer;
                    }
                    
                    this.state.chatHistory.push(historyEntry);
                }
                this.state.currentAIMessageContentDiv = null;
                
                if (ui.logMessage) {
                    ui.logMessage('Turn complete (HTTP)', 'system');
                }
                
                // 保存历史记录 - 只在有 historyManager 时保存
                if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                    this.historyManager.saveHistory();
                }
            }
     
        } catch (error) {
            Logger.error('处理 HTTP 流失败:', error);
            ui.logMessage(`处理流失败: ${error.message}`, 'system');
            if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.markdownContainer) {
                this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${error.message}</p>`;
            }
            this.state.currentAIMessageContentDiv = null;
            // 确保在失败时也保存历史记录（如果 historyManager 存在）
            if (this.historyManager && typeof this.historyManager.saveHistory === 'function') {
                this.historyManager.saveHistory(); // Ensure history is saved even on failure
            }
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
    _handleGeminiToolCall = async (functionCall, requestBody, apiKey, uiOverrides = null) => {
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

            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: this.toolManager.getToolDeclarations(),
                sessionId: this.state.currentSessionId
            }, apiKey, uiOverrides);
 
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
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: this.toolManager.getToolDeclarations(),
                sessionId: this.state.currentSessionId
            }, apiKey, uiOverrides);
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
    _handleMcpToolCall = async (toolCode, requestBody, apiKey, uiOverrides = null) => {
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
 
            // 从配置中动态查找当前模型的 MCP 服务器 URL
            const modelName = requestBody.model;
            console.log(`[${timestamp()}] [MCP] Searching for model config for: '${modelName}'`);
            const modelConfig = this.config.API.AVAILABLE_MODELS.find(m => m.name === modelName);

            if (!modelConfig || !modelConfig.mcp_server_url) {
                const errorMsg = `在 config.js 中未找到模型 '${modelName}' 的 mcp_server_url 配置。`;
                console.error(`[${timestamp()}] [MCP] ERROR: ${errorMsg}`);
                throw new Error(errorMsg);
            }
            console.log(`[${timestamp()}] [MCP] Found model config. Server URL: ${modelConfig.mcp_server_url}`);
            const server_url = modelConfig.mcp_server_url;

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

            // 构建包含 server_url 的请求体
            const proxyRequestBody = {
                tool_name: toolCode.tool_name,
                parameters: parsedArguments, // Send the full, parsed arguments object
                server_url: server_url
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
                        // --- 处理Office文档和PDF类型（合并标准格式和自定义格式） ---
                        else if (fileData) {
                            let fileBase64, finalFileName, finalFileType;
                            const fileTypeMap = {
                                'docx': 'word',
                                'xlsx': 'excel',
                                'pptx': 'ppt',
                                'pdf': 'pdf'
                            };

                            // 检查标准格式
                            if (fileData.type && ['excel', 'word', 'ppt', 'pdf'].includes(fileData.type) && fileData.data_base64) {
                                fileBase64 = fileData.data_base64;
                                finalFileName = fileData.title ? `${fileData.title}.${fileData.type}` : `download.${fileData.type}`;
                                finalFileType = fileData.type;
                            }
                            // 检查自定义格式
                            else if (fileData.file && fileData.file.name && fileData.file.content) {
                                const { name, content } = fileData.file;
                                const fileExtension = name.split('.').pop().toLowerCase();
                                finalFileType = fileTypeMap[fileExtension];
                                if (finalFileType) {
                                    fileBase64 = content;
                                    finalFileName = name;
                                }
                            }

                            // 如果检测到有效的Office/PDF文件
                            if (fileBase64 && finalFileName && finalFileType) {
                                console.log(`[${timestamp()}] [MCP] Detected file: ${finalFileName} (${finalFileType})`);
                                console.log(`[${timestamp()}] [MCP] Creating download link for:`, finalFileName);
                                // 创建下载链接 - 关键修改：创建独立的消息容器
                                this._createPersistentFileDownload(fileBase64, finalFileName, finalFileType);
                                toolResultContent = { output: `${finalFileType.toUpperCase()} file "${finalFileName}" generated and available for download.` };
                                isFileHandled = true;
                            } else {
                                console.log(`[${timestamp()}] [MCP] JSON parsed but format not recognized:`, Object.keys(fileData));
                            }
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
                const newToolsToAdd = toolResult.data.filter(newTool =>
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
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                // 确保再次传递工具定义，以防需要连续调用
                tools: requestBody.tools // Now 'requestBody.tools' might be updated with newly discovered tools
            }, apiKey, uiOverrides);
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
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: requestBody.tools
            }, apiKey, uiOverrides);
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

    /**
     * @private
     * @description Creates a file download link for Office documents and PDFs
     * @param {string} base64Data - The base64 encoded file data
     * @param {string} fileName - The name of the file to download
     * @param {string} fileType - The type of file (excel, word, ppt, pdf)
     */
    _createFileDownload(base64Data, fileName, fileType) {
        const timestamp = () => new Date().toISOString();
        console.log(`[${timestamp()}] [FILE] Creating download for ${fileType} file: ${fileName}`);
        
        try {
            // 解码base64数据
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // 创建Blob对象
            const mimeTypes = {
                'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'word': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'ppt': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'pdf': 'application/pdf'
            };
            
            const mimeType = mimeTypes[fileType] || 'application/octet-stream';
            const blob = new Blob([bytes], { type: mimeType });
            const url = URL.createObjectURL(blob);
            
            // 创建下载链接
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = fileName;
            downloadLink.textContent = `📥 Download ${fileType.toUpperCase()}: ${fileName}`;
            downloadLink.className = 'file-download-link';
            downloadLink.style.display = 'inline-block';
            downloadLink.style.margin = '10px 0';
            downloadLink.style.padding = '8px 12px';
            downloadLink.style.backgroundColor = '#f0f8ff';
            downloadLink.style.border = '1px solid #007acc';
            downloadLink.style.borderRadius = '4px';
            downloadLink.style.color = '#007acc';
            downloadLink.style.textDecoration = 'none';
            downloadLink.style.fontWeight = 'bold';
            
            // 添加到当前AI消息内容中
            if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.markdownContainer) {
                this.state.currentAIMessageContentDiv.markdownContainer.appendChild(downloadLink);
                this.state.currentAIMessageContentDiv.markdownContainer.appendChild(document.createElement('br'));
            } else {
                // 如果没有当前消息容器，创建新的消息显示下载链接
                const messageDiv = document.createElement('div');
                messageDiv.className = 'file-download-message';
                messageDiv.style.padding = '10px';
                messageDiv.style.margin = '10px 0';
                messageDiv.style.backgroundColor = '#f9f9f9';
                messageDiv.style.border = '1px solid #ddd';
                messageDiv.style.borderRadius = '4px';
                
                const messageText = document.createElement('p');
                messageText.textContent = `Generated ${fileType.toUpperCase()} file:`;
                messageText.style.margin = '0 0 8px 0';
                messageText.style.fontWeight = 'bold';
                
                messageDiv.appendChild(messageText);
                messageDiv.appendChild(downloadLink);
                
                // 添加到聊天容器中
                const chatContainer = document.querySelector('#chat-container') || document.querySelector('.chat-messages');
                if (chatContainer) {
                    chatContainer.appendChild(messageDiv);
                }
            }
            
            // 清理URL对象
            downloadLink.addEventListener('click', () => {
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 100);
            });
            
            console.log(`[${timestamp()}] [FILE] Download link created successfully for ${fileName}`);
            
        } catch (error) {
            console.error(`[${timestamp()}] [FILE] Error creating download link:`, error);
            // 显示错误信息
            if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.markdownContainer) {
                const errorElement = document.createElement('p');
                errorElement.textContent = `Error creating download for ${fileType} file: ${error.message}`;
                errorElement.style.color = 'red';
                this.state.currentAIMessageContentDiv.markdownContainer.appendChild(errorElement);
            }
        }
    }

    /**
     * @private
     * @description Creates a persistent file download link that won't be overwritten by subsequent messages
     * @param {string} base64Data - The base64 encoded file data
     * @param {string} fileName - The name of the file to download
     * @param {string} fileType - The type of file (excel, word, ppt, pdf)
     */
    _createPersistentFileDownload(base64Data, fileName, fileType) {
        const timestamp = () => new Date().toISOString();
        console.log(`[${timestamp()}] [FILE] Creating PERSISTENT download for ${fileType} file: ${fileName}`);
        
        try {
            // 解码base64数据
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // 创建Blob对象
            const mimeTypes = {
                'excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'word': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'ppt': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'pdf': 'application/pdf'
            };
            
            const mimeType = mimeTypes[fileType] || 'application/octet-stream';
            const blob = new Blob([bytes], { type: mimeType });
            const url = URL.createObjectURL(blob);
            
            // 创建独立的永久消息容器
            const persistentMessageDiv = document.createElement('div');
            persistentMessageDiv.className = 'persistent-file-download-message';
            persistentMessageDiv.style.padding = '15px';
            persistentMessageDiv.style.margin = '15px 0';
            persistentMessageDiv.style.backgroundColor = '#f0f8ff';
            persistentMessageDiv.style.border = '2px solid #007acc';
            persistentMessageDiv.style.borderRadius = '8px';
            persistentMessageDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            
            // 创建标题
            const titleText = document.createElement('h4');
            titleText.textContent = `📄 ${fileType.toUpperCase()} 文件生成成功`;
            titleText.style.margin = '0 0 10px 0';
            titleText.style.color = '#007acc';
            titleText.style.fontSize = '16px';
            
            // 创建文件信息
            const fileInfo = document.createElement('p');
            fileInfo.textContent = `文件名称: ${fileName}`;
            fileInfo.style.margin = '0 0 10px 0';
            fileInfo.style.fontSize = '14px';
            fileInfo.style.color = '#666';
            
            // 创建下载链接
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = fileName;
            downloadLink.textContent = `⬇️ 下载 ${fileType.toUpperCase()} 文件`;
            downloadLink.className = 'persistent-file-download-link';
            downloadLink.style.display = 'inline-block';
            downloadLink.style.padding = '10px 16px';
            downloadLink.style.backgroundColor = '#007acc';
            downloadLink.style.color = 'white';
            downloadLink.style.textDecoration = 'none';
            downloadLink.style.borderRadius = '4px';
            downloadLink.style.fontWeight = 'bold';
            downloadLink.style.margin = '5px 0';
            
            // 创建提示信息
            const hintText = document.createElement('p');
            hintText.textContent = '此下载链接将永久保存，不会被后续对话覆盖';
            hintText.style.margin = '8px 0 0 0';
            hintText.style.fontSize = '12px';
            hintText.style.color = '#999';
            hintText.style.fontStyle = 'italic';
            
            // 组装消息
            persistentMessageDiv.appendChild(titleText);
            persistentMessageDiv.appendChild(fileInfo);
            persistentMessageDiv.appendChild(downloadLink);
            persistentMessageDiv.appendChild(hintText);
            
            // 添加到聊天容器中
            const chatContainer = document.querySelector('#chat-container') || document.querySelector('.chat-messages');
            if (chatContainer) {
                // 插入到当前消息之后，确保不会被后续消息覆盖
                if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.markdownContainer) {
                    this.state.currentAIMessageContentDiv.markdownContainer.parentNode.insertBefore(
                        persistentMessageDiv, 
                        this.state.currentAIMessageContentDiv.markdownContainer.nextSibling
                    );
                } else {
                    // 如果没有当前消息容器，直接添加到聊天容器末尾
                    chatContainer.appendChild(persistentMessageDiv);
                }
            }
            
            // 清理URL对象
            downloadLink.addEventListener('click', () => {
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 100);
            });
            
            console.log(`[${timestamp()}] [FILE] Persistent download link created successfully for ${fileName}`);
            
        } catch (error) {
            console.error(`[${timestamp()}] [FILE] Error creating persistent download link:`, error);
            // 显示错误信息
            const errorDiv = document.createElement('div');
            errorDiv.className = 'file-download-error';
            errorDiv.style.padding = '10px';
            errorDiv.style.margin = '10px 0';
            errorDiv.style.backgroundColor = '#ffe6e6';
            errorDiv.style.border = '1px solid #ff4444';
            errorDiv.style.borderRadius = '4px';
            errorDiv.style.color = '#ff4444';
            
            const errorText = document.createElement('p');
            errorText.textContent = `创建下载链接失败: ${error.message}`;
            errorText.style.margin = '0';
            
            errorDiv.appendChild(errorText);
            
            const chatContainer = document.querySelector('#chat-container') || document.querySelector('.chat-messages');
            if (chatContainer) {
                chatContainer.appendChild(errorDiv);
            }
        }
    }

    /**
     * @private
     * @description Attempts to parse a JSON string that may have minor syntax errors,
     * which can sometimes be output by language models.
     * @param {string} jsonString - The JSON string to parse.
     * @returns {object} The parsed JavaScript object.
     * @throws {Error} If the string cannot be parsed even after cleanup attempts.
     */
    _robustJsonParse(jsonString) {
        try {
            // First, try the standard parser.
            return JSON.parse(jsonString);
        } catch (e) {
            console.warn("[MCP] Standard JSON.parse failed, attempting robust parsing...", e);
            let cleanedString = jsonString;

            // 1. Remove trailing commas from objects and arrays.
            cleanedString = cleanedString.replace(/,\s*([}\]])/g, '$1');

            // 2. Escape unescaped newlines and carriage returns within string literals, but not within JSON structure.
            // This is a common issue with LLM output that can break JSON.
            // This regex tries to target content inside string values, not keys or structural elements.
            // This is a heuristic and might not cover all cases, but should help with common code snippets.
            cleanedString = cleanedString.replace(/(".*?[^\\]")(?<!\\)\n/g, '$1\\n');
            cleanedString = cleanedString.replace(/(".*?[^\\]")(?<!\\)\r/g, '$1\\r');


            // 3. Fix issue where a quote is added after a number or boolean.
            // e.g., "max_results": 5" -> "max_results": 5
            cleanedString = cleanedString.replace(/:( *[0-9\.]+)\"/g, ':$1');
            cleanedString = cleanedString.replace(/:( *(?:true|false))\"/g, ':$1');

            try {
                // Retry parsing with the cleaned string.
                return JSON.parse(cleanedString);
            } catch (finalError) {
                console.error("[MCP] Robust JSON parsing failed after cleanup.", finalError);
                // Throw the original error for better context if the final one is not informative.
                throw finalError || e;
            }
        }
    }
}
