import { HttpApiHandler } from '../core/api-handler.js';

/**
 * @fileoverview Manages all API interactions for the chat functionality.
 * This includes sending messages via HTTP (streaming) and handling tool calls.
 * It is designed to be completely decoupled from the UI.
 */
export class ChatApi {
    /**
     * 构造函数
     * @param {object} options - 配置选项.
     * @param {() => string} options.getApiKey - 一个函数，用于获取当前的API Key.
     * @param {object} options.callbacks - 用于与UI通信的回调函数.
     * @param {(message: string, type: 'system' | 'user' | 'ai') => void} options.callbacks.logMessage - 记录消息的回调.
     * @param {() => object} options.callbacks.createAIMessageElement - 创建AI消息元素的回调.
     * @param {() => void} options.callbacks.scrollToBottom - 滚动到底部的回调.
     * @param {(toolCall: object) => Promise<object>} options.callbacks.handleToolCall - 处理工具调用的回调.
     */
    constructor({ getApiKey, callbacks }) {
        this.apiHandler = new HttpApiHandler({ getApiKey });
        this.callbacks = callbacks;
    }

    /**
     * 处理 HTTP SSE 流，包括文本累积和工具调用。
     * @param {Object} requestBody - 发送给模型的请求体。
     * @param {Array} chatHistory - 当前的聊天历史记录.
     * @returns {Promise<Array>} - 返回更新后的聊天历史记录.
     * @throws {Error} 如果处理流失败.
     */
    async processHttpStream(requestBody, chatHistory) {
        let currentMessages = requestBody.messages;
        let functionCallDetected = false;
        let currentFunctionCall = null;
        let reasoningStarted = false;
        let answerStarted = false;
        let currentAIMessageContentDiv = null;

        try {
            const reader = await this.apiHandler.fetchStream('/api/chat/completions', requestBody);
            const decoder = new TextDecoder('utf-8');

            const isToolResponseFollowUp = currentMessages.some(msg => msg.role === 'tool');
            if (!isToolResponseFollowUp) {
                currentAIMessageContentDiv = this.callbacks.createAIMessageElement();
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
                        if (jsonStr === '[DONE]') return;

                        try {
                            const data = JSON.parse(jsonStr);
                            if (data.choices && data.choices.length > 0) {
                                const choice = data.choices[0];
                                if (choice.delta) {
                                    const functionCallPart = choice.delta.parts?.find(p => p.functionCall);

                                    // 提取文本内容，兼容不同模型的返回格式
                                    const textContent = this._extractContent(choice.delta);

                                    if (choice.delta.reasoning_content) {
                                        if (!currentAIMessageContentDiv) currentAIMessageContentDiv = this.callbacks.createAIMessageElement();
                                        if (!reasoningStarted) {
                                            currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                            reasoningStarted = true;
                                        }
                                        currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content').innerHTML += choice.delta.reasoning_content.replace(/\n/g, '<br>');
                                    }
                                    
                                    if (functionCallPart) {
                                        functionCallDetected = true;
                                        currentFunctionCall = functionCallPart.functionCall;
                                        Logger.info('Function call detected:', currentFunctionCall);
                                        this.callbacks.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                        if (currentAIMessageContentDiv) currentAIMessageContentDiv = null;
                                    } else if (textContent) {
                                        if (!functionCallDetected) {
                                            if (!currentAIMessageContentDiv) currentAIMessageContentDiv = this.callbacks.createAIMessageElement();
                                            
                                            if (reasoningStarted && !answerStarted) {
                                                const separator = document.createElement('hr');
                                                separator.className = 'answer-separator';
                                                currentAIMessageContentDiv.markdownContainer.before(separator);
                                                answerStarted = true;
                                            }

                                            currentAIMessageContentDiv.rawMarkdownBuffer += textContent;
                                            // Qwen "Thinking" 模型可能会返回包含特殊标记的内容，这里先简单渲染
                                            currentAIMessageContentDiv.markdownContainer.innerHTML = marked.parse(currentAIMessageContentDiv.rawMarkdownBuffer);
                                            
                                            if (typeof MathJax !== 'undefined' && MathJax.startup) {
                                                MathJax.startup.promise.then(() => {
                                                    MathJax.typeset([currentAIMessageContentDiv.markdownContainer, currentAIMessageContentDiv.reasoningContainer]);
                                                }).catch((err) => console.error('MathJax typesetting failed:', err));
                                            }
                                            this.callbacks.scrollToBottom();
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
                if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
                    chatHistory.push({ role: 'assistant', content: currentAIMessageContentDiv.rawMarkdownBuffer });
                }
                currentAIMessageContentDiv = null;

                try {
                    const toolResult = await this.callbacks.handleToolCall(currentFunctionCall);
                    const toolResponsePart = toolResult.functionResponses[0].response.output;

                    chatHistory.push({
                        role: 'assistant',
                        parts: [{ functionCall: { name: currentFunctionCall.name, args: currentFunctionCall.args } }]
                    });
                    chatHistory.push({
                        role: 'tool',
                        parts: [{ functionResponse: { name: currentFunctionCall.name, response: toolResponsePart } }]
                    });

                    return await this.processHttpStream({ ...requestBody, messages: chatHistory }, chatHistory);

                } catch (toolError) {
                    Logger.error('工具执行失败:', toolError);
                    this.callbacks.logMessage(`工具执行失败: ${toolError.message}`, 'system');
                    
                    chatHistory.push({
                        role: 'assistant',
                        parts: [{ functionCall: { name: currentFunctionCall.name, args: currentFunctionCall.args } }]
                    });
                    chatHistory.push({
                        role: 'tool',
                        parts: [{ functionResponse: { name: currentFunctionCall.name, response: { error: toolError.message } } }]
                    });

                    return await this.processHttpStream({ ...requestBody, messages: chatHistory }, chatHistory);
                }
            } else {
                if (currentAIMessageContentDiv && currentAIMessageContentDiv.rawMarkdownBuffer) {
                   // 移除 Qwen "Thinking" 模型的特殊处理逻辑，使用通用方式
                   const finalContent = currentAIMessageContentDiv.rawMarkdownBuffer;
                   chatHistory.push({ role: 'assistant', content: finalContent });
                }
                currentAIMessageContentDiv = null;
                this.callbacks.logMessage('Turn complete (HTTP)', 'system');
            }
            return chatHistory;

        } catch (error) {
            Logger.error('处理 HTTP 流失败:', error);
            this.callbacks.logMessage(`处理流失败: ${error.message}`, 'system');
            if (currentAIMessageContentDiv && currentAIMessageContentDiv.markdownContainer) {
                currentAIMessageContentDiv.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${error.message}</p>`;
            }
            throw error;
        }
    }

    /**
     * 发送聊天消息 (HTTP 模式).
     * @param {object} params - 参数对象.
     * @param {string} params.message - 用户输入的文本消息.
     * @param {Array<object>} params.attachedFiles - 附加的文件数组.
     * @param {Array} params.chatHistory - 当前的聊天历史.
     * @param {string} params.modelName - 当前选择的模型名称.
     * @param {string} params.systemInstruction - 当前的系统指令.
     * @param {string} params.currentSessionId - 当前的会话 ID.
     * @returns {Promise<Array>} - 返回更新后的聊天历史记录.
     */
    async sendMessage({ message, attachedFiles, chatHistory, modelName, systemInstruction, currentSessionId }) {
        try {
            const userContent = [];
            if (message) {
                userContent.push({ type: 'text', text: message });
            }
            if (attachedFiles && attachedFiles.length > 0) {
                attachedFiles.forEach(file => {
                    if (file.type.startsWith('image/')) {
                        userContent.push({
                            type: 'image_url',
                            image_url: { url: file.base64 }
                        });
                    } else if (file.type === 'application/pdf') {
                        userContent.push({
                            type: 'pdf_url',
                            pdf_url: { url: file.base64 }
                        });
                    } else if (file.type.startsWith('audio/')) {
                        userContent.push({
                            type: 'audio_url',
                            audio_url: { url: file.base64 }
                        });
                    }
                });
            }

            const newHistory = [...chatHistory, { role: 'user', content: userContent }];

            let requestBody = {
                model: modelName,
                messages: newHistory,
                generationConfig: {
                    responseModalities: ['text']
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
                ],
                enableGoogleSearch: true,
                stream: true,
                sessionId: currentSessionId
            };

            if (systemInstruction) {
                requestBody.systemInstruction = {
                    parts: [{ text: systemInstruction }]
                };
            }

            return await this.processHttpStream(requestBody, newHistory);

        } catch (error) {
            Logger.error('发送 HTTP 消息失败:', error);
            this.callbacks.logMessage(`发送消息失败: ${error.message}`, 'system');
            throw error; // 将错误向上抛出，以便 main.js 可以处理
        }
    }

    /**
     * 从 SSE delta 对象中提取文本内容，兼容多种格式。
     * @param {object} delta - 从 SSE 流中解析出的 delta 对象.
     * @returns {string} - 提取出的文本内容，如果不存在则返回空字符串.
     * @private
     */
    _extractContent(delta) {
        if (!delta) return '';
        
        // 1. 优先检查 content 字段 (Gemini, etc.)
        if (delta.content) {
            return delta.content;
        }

        // 2. 检查 text 字段 (某些开源模型)
        if (delta.text) {
            return delta.text;
        }
        
        // 3. 检查 message 对象 (兼容类 OpenAI 格式)
        if (delta.message && delta.message.content) {
            return delta.message.content;
        }

        // 4. 记录未知格式以备调试
        if (Object.keys(delta).length > 0) {
            console.warn('Unknown SSE delta format:', delta);
        }

        return '';
    }
}