console.log("--- ChatApiHandler v3 Loaded ---");
import { Logger } from '../utils/logger.js';
import * as chatUI from './chat-ui.js';

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
    async streamChatCompletion(requestBody, apiKey) {
        let currentMessages = requestBody.messages;

        try {
            const response = await fetch('/api/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody)
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
            if (!isToolResponseFollowUp) {
                this.state.currentAIMessageContentDiv = chatUI.createAIMessageElement();
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    Logger.info('HTTP Stream finished.');
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                chunk.split('\n\n').forEach(part => {
                    if (part.startsWith('data: ')) {
                        const jsonStr = part.substring(6);
                        if (jsonStr === '[DONE]') {
                            return;
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
                                                chatUI.logMessage(`模型请求 MCP 工具: ${qwenToolCallAssembler.tool_name}`, 'system');
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
                                    chatUI.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                    if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;

                                } else if (choice.delta && !functionCallDetected && !qwenToolCallAssembler) {
                                    // Process reasoning and content only if no tool call is active
                                    if (choice.delta.reasoning_content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = chatUI.createAIMessageElement();
                                        if (!reasoningStarted) {
                                            this.state.currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                            reasoningStarted = true;
                                        }
                                        this.state.currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content').innerHTML += choice.delta.reasoning_content.replace(/\n/g, '<br>');
                                    }
                                    
                                    if (choice.delta.content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = chatUI.createAIMessageElement();
                                        
                                        if (reasoningStarted && !answerStarted) {
                                            const separator = document.createElement('hr');
                                            separator.className = 'answer-separator';
                                            this.state.currentAIMessageContentDiv.markdownContainer.before(separator);
                                            answerStarted = true;
                                        }

                                        this.state.currentAIMessageContentDiv.rawMarkdownBuffer += choice.delta.content || '';
                                        this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = this.libs.marked.parse(this.state.currentAIMessageContentDiv.rawMarkdownBuffer);
                                        
                                        if (typeof this.libs.MathJax !== 'undefined' && this.libs.MathJax.startup) {
                                            this.libs.MathJax.startup.promise.then(() => {
                                                this.libs.MathJax.typeset([this.state.currentAIMessageContentDiv.markdownContainer, this.state.currentAIMessageContentDiv.reasoningContainer]);
                                            }).catch((err) => console.error('MathJax typesetting failed:', err));
                                        }
                                        chatUI.scrollToBottom();
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
                });
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
                // 将最终的文本部分（如果有）保存到历史记录
                if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.rawMarkdownBuffer) {
                    console.log(`[${timestamp()}] [DISPATCH] Saving final text part to history.`);
                    this.state.chatHistory.push({
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    });
                }
                this.state.currentAIMessageContentDiv = null;

                // 根据 currentFunctionCall 的结构区分是 Gemini 调用还是 Qwen 调用
                console.log(`[${timestamp()}] [DISPATCH] Analyzing tool call structure:`, currentFunctionCall);
                if (currentFunctionCall.tool_name) {
                    // Qwen MCP Tool Call
                    console.log(`[${timestamp()}] [DISPATCH] Detected Qwen MCP tool call. Routing to _handleMcpToolCall...`);
                    await this._handleMcpToolCall(currentFunctionCall, requestBody, apiKey);
                } else {
                    // Gemini Function Call
                    console.log(`[${timestamp()}] [DISPATCH] Detected Gemini function call. Routing to _handleGeminiToolCall...`);
                    await this._handleGeminiToolCall(currentFunctionCall, requestBody, apiKey);
                }
                console.log(`[${timestamp()}] [DISPATCH] Returned from tool call handler.`);

            } else {
                if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.rawMarkdownBuffer) {
                    this.state.chatHistory.push({
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    });
                }
                this.state.currentAIMessageContentDiv = null;
                chatUI.logMessage('Turn complete (HTTP)', 'system');
                this.historyManager.saveHistory();
            }
     
        } catch (error) {
            Logger.error('处理 HTTP 流失败:', error);
            chatUI.logMessage(`处理流失败: ${error.message}`, 'system');
            if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.markdownContainer) {
                this.state.currentAIMessageContentDiv.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${error.message}</p>`;
            }
            this.state.currentAIMessageContentDiv = null;
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
    _handleGeminiToolCall = async (functionCall, requestBody, apiKey) => {
        try {
            this.state.isUsingTool = true;
            chatUI.logMessage(`执行 Gemini 工具: ${functionCall.name} with args: ${JSON.stringify(functionCall.args)}`, 'system');
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
            }, apiKey);

        } catch (toolError) {
            Logger.error('Gemini 工具执行失败:', toolError);
            chatUI.logMessage(`Gemini 工具执行失败: ${toolError.message}`, 'system');
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
            }, apiKey);
        } finally {
            this.state.isUsingTool = false;
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
    _handleMcpToolCall = async (toolCode, requestBody, apiKey) => {
        const timestamp = () => new Date().toISOString();
        console.log(`[${timestamp()}] [MCP] --- _handleMcpToolCall START ---`);

        try {
            this.state.isUsingTool = true;
            console.log(`[${timestamp()}] [MCP] State isUsingTool set to true.`);

            // 显示工具调用状态UI
            console.log(`[${timestamp()}] [MCP] Displaying tool call status UI for tool: ${toolCode.tool_name}`);
            chatUI.displayToolCallStatus(toolCode.tool_name, toolCode.arguments);
            chatUI.logMessage(`通过代理执行 MCP 工具: ${toolCode.tool_name} with args: ${JSON.stringify(toolCode.arguments)}`, 'system');
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

            // --- FIX: Match Tavily's Non-Standard Request Format ---
            // Based on successful calls from Cline and analysis of Tavily's MCP server source,
            // the remote server expects a raw arguments object containing ONLY the 'query' parameter.
            let parsedArguments;
            try {
                parsedArguments = JSON.parse(toolCode.arguments);
            } catch (e) {
                const errorMsg = `无法解析来自模型的工具参数，它不是一个有效的JSON字符串: ${toolCode.arguments}`;
                console.error(`[${timestamp()}] [MCP] ERROR: ${errorMsg}`, e);
                throw new Error(errorMsg);
            }

            // Sanitize the arguments to only include 'query', matching the successful request format.
            const sanitizedArguments = {
                query: parsedArguments.query
            };

            if (!sanitizedArguments.query) {
                 const errorMsg = `从模型工具参数中未能提取到 'query' 字段: ${toolCode.arguments}`;
                console.error(`[${timestamp()}] [MCP] ERROR: ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // 构建包含 server_url 的请求体
            const proxyRequestBody = {
                tool_name: toolCode.tool_name,
                arguments: sanitizedArguments, // Send only the sanitized arguments
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

            const toolResult = await proxyResponse.json();
            console.log(`[${timestamp()}] [MCP] Successfully parsed JSON from proxy response:`, toolResult);
            
            // --- Refactored History Logging based on AliCloud Docs ---
            // 1. Push the assistant's decision to call the tool.
            // This must be an object with a `tool_calls` array.
            console.log(`[${timestamp()}] [MCP] Pushing assistant 'tool_calls' message to history...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: null, // Qwen expects content to be null when tool_calls are present
                tool_calls: [{
                    id: `call_${Date.now()}`, // Generate a unique ID for the call
                    type: 'function',
                    function: {
                        name: toolCode.tool_name,
                        arguments: JSON.stringify(toolCode.arguments)
                    }
                }]
            });

            // 2. Push the result from the tool execution.
            // This must be an object with `role: 'tool'`.
            console.log(`[${timestamp()}] [MCP] Pushing 'tool' result message to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify(toolResult),
                tool_call_id: `call_${Date.now()}` // Should match the ID from the assistant message
            });

            // 再次调用模型以获得最终答案
            console.log(`[${timestamp()}] [MCP] Resuming chat completion with tool result...`);
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                // 确保再次传递工具定义，以防需要连续调用
                tools: requestBody.tools
            }, apiKey);
            console.log(`[${timestamp()}] [MCP] Chat completion stream finished.`);

        } catch (toolError) {
            console.error(`[${timestamp()}] [MCP] --- CATCH BLOCK ERROR ---`, toolError);
            Logger.error('MCP 工具执行失败:', toolError);
            chatUI.logMessage(`MCP 工具执行失败: ${toolError.message}`, 'system');
            
            // 即使失败，也要将失败信息以正确的格式加入历史记录
            const toolCallId = `call_${Date.now()}`;
            console.log(`[${timestamp()}] [MCP] Pushing assistant 'tool_calls' message to history on error...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: null,
                tool_calls: [{
                    id: toolCallId,
                    type: 'function',
                    function: {
                        name: toolCode.tool_name,
                        arguments: JSON.stringify(toolCode.arguments)
                    }
                }]
            });
            console.log(`[${timestamp()}] [MCP] Pushing 'tool' error result to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify({ error: toolError.message }),
                tool_call_id: toolCallId
            });
            
            // 再次调用模型，让它知道工具失败了
            console.log(`[${timestamp()}] [MCP] Resuming chat completion with tool error...`);
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: requestBody.tools
            }, apiKey);
            console.log(`[${timestamp()}] [MCP] Chat completion stream after error finished.`);
        } finally {
            this.state.isUsingTool = false;
            console.log(`[${timestamp()}] [MCP] State isUsingTool set to false.`);
            console.log(`[${timestamp()}] [MCP] --- _handleMcpToolCall END ---`);
        }
    }
}
