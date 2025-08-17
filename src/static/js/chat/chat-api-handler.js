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
        // --- Refactor Start: Centralize State ---
        // The handler now owns the chat history to prevent race conditions.
        this.state = {
            ...state, // Keep other states like isUsingTool, etc.
            chatHistory: []
        };
        // --- Refactor End ---
        this.libs = libs;
        this.config = config;
    }

    /**
     * Processes an HTTP Server-Sent Events (SSE) stream from the chat completions API.
     * It handles text accumulation, UI updates, and tool calls.
     * @param {object} requestBody - The request body to be sent to the model.
     * @param {string} apiKey - The API key for authorization.
     * @returns {Promise<void>}
     */
    /**
     * A new unified method to handle sending messages for HTTP models.
     * It now manages the chat history internally.
     * @param {object} messageData - The data for the message to be sent.
     * @param {string} messageData.message - The user's text message.
     * @param {object|null} messageData.attachedFile - The attached file object.
     * @param {object} messageData.selectedModelConfig - The configuration of the selected model.
     * @param {string} messageData.systemInstruction - The system instruction.
     * @param {string} messageData.apiKey - The user's API key.
     * @param {string} messageData.sessionId - The current session ID.
     */
    async sendMessage({ message, attachedFile, selectedModelConfig, systemInstruction, apiKey, sessionId }) {
        // Build user message and add to internal history
        const userContent = [];
        if (message) {
            userContent.push({ type: 'text', text: message });
        }
        if (attachedFile) {
            userContent.push({
                type: 'image_url',
                image_url: { url: attachedFile.base64 }
            });
        }
        this.state.chatHistory.push({
            role: 'user',
            content: userContent
        });

        // Build the request body using internal history
        let requestBody = {
            model: selectedModelConfig.name,
            messages: this.state.chatHistory,
            // ... (rest of the request body construction)
            generationConfig: { responseModalities: ['text'] },
            safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
            ],
            enableGoogleSearch: true,
            stream: true,
            sessionId: sessionId
        };

        if (systemInstruction) {
            requestBody.systemInstruction = {
                parts: [{ text: systemInstruction }]
            };
        }

        if (selectedModelConfig && selectedModelConfig.isQwen && selectedModelConfig.tools) {
            requestBody.tools = selectedModelConfig.tools;
        }

        // Call the stream completion method
        await this.streamChatCompletion(requestBody, apiKey);
    }

    async streamChatCompletion(requestBody, apiKey) {
        // --- Refactor: This function now ALWAYS uses its internal chat history ---
        requestBody.messages = this.state.chatHistory;

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
                                // --- Logic Refactor: Prioritize Tool Calls ---
                                // 1. Check for Qwen tool_code first.
                                // 2. Then check for Gemini functionCall parts.
                                // 3. Only if no tool calls are detected, process regular content.
                                
                                const functionCallPart = choice.delta.parts?.find(p => p.functionCall);

                                if (data.tool_code) {
                                    // Qwen MCP Tool Call Detected
                                    functionCallDetected = true;
                                    currentFunctionCall = data.tool_code; // Store the tool_code object
                                    Logger.info('Qwen MCP tool call detected:', currentFunctionCall);
                                    chatUI.logMessage(`模型请求 MCP 工具: ${currentFunctionCall.tool_name}`, 'system');
                                    if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;
                                
                                } else if (functionCallPart) {
                                    // Gemini Function Call Detected
                                    functionCallDetected = true;
                                    currentFunctionCall = functionCallPart.functionCall;
                                    Logger.info('Function call detected:', currentFunctionCall);
                                    chatUI.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                    if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;

                                } else if (choice.delta && !functionCallDetected) {
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

            // 构建包含 server_url 的请求体
            const proxyRequestBody = {
                ...toolCode,
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
            console.log(`[${timestamp()}] [MCP] History before second call:`, JSON.stringify(this.state.chatHistory, null, 2));
            
            // 注意：重构后，requestBody不再需要手动传递messages，streamChatCompletion会使用内部的this.state.chatHistory
            const secondRequestBody = {
                ...requestBody,
                tools: requestBody.tools // 确保再次传递工具定义
            };
            console.log(`[${timestamp()}] [MCP] Request body for second call:`, JSON.stringify(secondRequestBody, null, 2));

            await this.streamChatCompletion(secondRequestBody, apiKey);
            console.log(`[${timestamp()}] [MCP] Chat completion stream finished.`);

        } catch (toolError) {
            console.error(`[${timestamp()}] [MCP] --- CATCH BLOCK ERROR ---`, toolError);
            Logger.error('MCP 工具执行失败:', toolError);
            chatUI.logMessage(`MCP 工具执行失败: ${toolError.message}`, 'system');
            
            // 即使失败，也要将失败信息加入历史记录
            console.log(`[${timestamp()}] [MCP] Pushing assistant tool_code to history on error...`);
            this.state.chatHistory.push({
                role: 'assistant',
                content: `<tool_code>${JSON.stringify(toolCode, null, 2)}</tool_code>`
            });
            console.log(`[${timestamp()}] [MCP] Pushing tool error result to history...`);
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify({ error: toolError.message })
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
