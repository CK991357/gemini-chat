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
    constructor({ toolManager, historyManager, state, libs }) {
        this.toolManager = toolManager;
        this.historyManager = historyManager;
        this.state = state;
        this.libs = libs;
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
                                if (data.tool_code) {
                                    // Qwen MCP Tool Call Detected
                                    functionCallDetected = true;
                                    currentFunctionCall = data.tool_code; // Store the tool_code object
                                    Logger.info('Qwen MCP tool call detected:', currentFunctionCall);
                                    chatUI.logMessage(`模型请求 MCP 工具: ${currentFunctionCall.tool_name}`, 'system');
                                    if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;
                                } else if (choice.delta) {
                                    const functionCallPart = choice.delta.parts?.find(p => p.functionCall);

                                    if (choice.delta.reasoning_content) {
                                        if (!this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = chatUI.createAIMessageElement();
                                        if (!reasoningStarted) {
                                            this.state.currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                            reasoningStarted = true;
                                        }
                                        this.state.currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content').innerHTML += choice.delta.reasoning_content.replace(/\n/g, '<br>');
                                    }
                                    
                                    if (functionCallPart) {
                                        functionCallDetected = true;
                                        currentFunctionCall = functionCallPart.functionCall;
                                        Logger.info('Function call detected:', currentFunctionCall);
                                        chatUI.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                        if (this.state.currentAIMessageContentDiv) this.state.currentAIMessageContentDiv = null;
                                    }
                                    else if (choice.delta.content) {
                                        if (!functionCallDetected) {
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

            if (functionCallDetected && currentFunctionCall) {
                // 将最终的文本部分（如果有）保存到历史记录
                if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.rawMarkdownBuffer) {
                    this.state.chatHistory.push({
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    });
                }
                this.state.currentAIMessageContentDiv = null;

                // 根据 currentFunctionCall 的结构区分是 Gemini 调用还是 Qwen 调用
                if (currentFunctionCall.tool_name) {
                    // Qwen MCP Tool Call
                    await this._handleMcpToolCall(currentFunctionCall, requestBody, apiKey);
                } else {
                    // Gemini Function Call
                    await this._handleGeminiToolCall(currentFunctionCall, requestBody, apiKey);
                }

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
        try {
            this.state.isUsingTool = true;
            // 显示工具调用状态UI
            chatUI.displayToolCallStatus(toolCode.tool_name, toolCode.arguments);
            chatUI.logMessage(`通过代理执行 MCP 工具: ${toolCode.tool_name} with args: ${JSON.stringify(toolCode.arguments)}`, 'system');

            // 调用后端代理
            const proxyResponse = await fetch('/api/mcp-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(toolCode)
            });

            if (!proxyResponse.ok) {
                const errorData = await proxyResponse.json();
                throw new Error(`MCP 代理请求失败: ${errorData.details || proxyResponse.statusText}`);
            }

            const toolResult = await proxyResponse.json();
            
            // 将模型思考过程（即 tool_code 本身）和工具结果添加到历史记录
            this.state.chatHistory.push({
                role: 'assistant',
                content: `<tool_code>${JSON.stringify(toolCode, null, 2)}</tool_code>`
            });

            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify(toolResult)
            });

            // 再次调用模型以获得最终答案
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                // 确保再次传递工具定义，以防需要连续调用
                tools: requestBody.tools
            }, apiKey);

        } catch (toolError) {
            Logger.error('MCP 工具执行失败:', toolError);
            chatUI.logMessage(`MCP 工具执行失败: ${toolError.message}`, 'system');
            // 即使失败，也要将失败信息加入历史记录
            this.state.chatHistory.push({
                role: 'assistant',
                content: `<tool_code>${JSON.stringify(toolCode, null, 2)}</tool_code>`
            });
            this.state.chatHistory.push({
                role: 'tool',
                content: JSON.stringify({ error: toolError.message })
            });
            // 再次调用模型，让它知道工具失败了
            await this.streamChatCompletion({
                ...requestBody,
                messages: this.state.chatHistory,
                tools: requestBody.tools
            }, apiKey);
        } finally {
            this.state.isUsingTool = false;
        }
    }
}
