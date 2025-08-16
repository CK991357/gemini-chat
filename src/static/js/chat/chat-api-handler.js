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
                                if (choice.delta) {
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
                if (this.state.currentAIMessageContentDiv && this.state.currentAIMessageContentDiv.rawMarkdownBuffer) {
                    this.state.chatHistory.push({
                        role: 'assistant',
                        content: this.state.currentAIMessageContentDiv.rawMarkdownBuffer
                    });
                }
                this.state.currentAIMessageContentDiv = null;

                try {
                    this.state.isUsingTool = true;
                    chatUI.logMessage(`执行工具: ${currentFunctionCall.name} with args: ${JSON.stringify(currentFunctionCall.args)}`, 'system');
                    const toolResult = await this.toolManager.handleToolCall(currentFunctionCall);
                    const toolResponsePart = toolResult.functionResponses[0].response.output;

                    this.state.chatHistory.push({
                        role: 'assistant',
                        parts: [{
                            functionCall: {
                                name: currentFunctionCall.name,
                                args: currentFunctionCall.args
                            }
                        }]
                    });

                    this.state.chatHistory.push({
                        role: 'tool',
                        parts: [{
                            functionResponse: {
                                name: currentFunctionCall.name,
                                response: toolResponsePart
                            }
                        }]
                    });

                    await this.streamChatCompletion({
                        ...requestBody,
                        messages: this.state.chatHistory,
                        tools: this.toolManager.getToolDeclarations(),
                        sessionId: this.state.currentSessionId
                    }, apiKey);

                } catch (toolError) {
                    Logger.error('工具执行失败:', toolError);
                    chatUI.logMessage(`工具执行失败: ${toolError.message}`, 'system');
                    
                    this.state.chatHistory.push({
                        role: 'assistant',
                        parts: [{
                            functionCall: {
                                name: currentFunctionCall.name,
                                args: currentFunctionCall.args
                            }
                        }]
                    });

                    this.state.chatHistory.push({
                        role: 'tool',
                        parts: [{
                            functionResponse: {
                                name: currentFunctionCall.name,
                                response: { error: toolError.message }
                            }
                        }]
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
}