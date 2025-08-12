/**
 * @fileoverview ChatAPI 类负责管理与后端的所有聊天相关API交互，
 * 包括 WebSocket 和 HTTP 请求。它封装了通信逻辑，并通过回调和
 * 状态获取器与主应用程序（main.js）解耦。
 */


export class ChatAPI {
    /**
     * ChatAPI 构造函数。
     * @param {object} dependencies - 依赖项对象。
     * @param {MultimodalLiveClient} dependencies.client - WebSocket 客户端实例。
     * @param {ToolManager} dependencies.toolManager - 工具管理器实例。
     * @param {object} dependencies.callbacks - 用于与UI交互的回调函数。
     * @param {function} dependencies.callbacks.logMessage - 记录消息的回调。
     * @param {function} dependencies.callbacks.createAIMessageElement - 创建AI消息UI元素的回调。
     * @param {function} dependencies.callbacks.displayAudioMessage - 显示音频消息的回调。
     * @param {function} dependencies.callbacks.pcmToWavBlob - PCM转WAV的回调。
     * @param {function} dependencies.callbacks.scrollToBottom - 滚动到底部的回调。
     * @param {object} dependencies.stateGetters - 用于获取当前应用状态的函数。
     * @param {function} dependencies.stateGetters.getChatHistory - 获取聊天历史的函数。
     * @param {function} dependencies.stateGetters.getCurrentSessionId - 获取当前会话ID的函数。
     * @param {function} dependencies.stateGetters.getSelectedModelConfig - 获取所选模型配置的函数。
     * @param {function} dependencies.stateGetters.getSystemInstruction - 获取系统指令的函数。
     * @param {function} dependencies.stateGetters.getApiKey - 获取API密钥的函数。
     * @param {object} dependencies.stateUpdaters - 用于更新状态的函数。
     * @param {function} dependencies.stateUpdaters.updateChatHistory - 更新聊天历史的函数。
     * @param {function} dependencies.stateUpdaters.resetCurrentAIMessage - 重置当前AI消息元素的回调。
     */
    constructor(dependencies) {
        this.client = dependencies.client;
        this.toolManager = dependencies.toolManager;
        this.callbacks = dependencies.callbacks;
        this.stateGetters = dependencies.stateGetters;
        this.stateUpdaters = dependencies.stateUpdaters;

        // 内部状态
        this.isUsingTool = false;
        this.audioDataBuffer = [];
        this.currentAIMessageContentDiv = null; // 用于跟踪当前AI消息的UI元素

        this._registerSocketHandlers();
    }

    /**
     * 注册 WebSocket 客户端的事件监听器。
     * @private
     */
    _registerSocketHandlers() {
        this.client.on('content', this._handleContent.bind(this));
        this.client.on('audio', this._handleAudio.bind(this));
        this.client.on('turncomplete', this._handleTurnComplete.bind(this));
        this.client.on('interrupted', this._handleInterrupted.bind(this));
        this.client.on('error', this._handleError.bind(this));

        // 这些事件只记录日志，可以直接处理
        this.client.on('open', () => this.callbacks.logMessage('WebSocket connection opened', 'system'));
        this.client.on('log', (log) => this.callbacks.logMessage(`${log.type}: ${JSON.stringify(log.message)}`, 'system'));
        this.client.on('setupcomplete', () => this.callbacks.logMessage('Setup complete', 'system'));
        this.client.on('close', (event) => {
            this.callbacks.logMessage(`WebSocket connection closed (code ${event.code})`, 'system');
            // 重连逻辑可以保留在 main.js 或移至此处
        });
    }

    /**
     * 发送消息，根据模型配置自动选择 WebSocket 或 HTTP。
     * @param {string} text - 用户输入的文本。
     * @param {object|null} attachedFile - 附加的文件对象。
     * @param {object} attachmentManager - 附件管理器实例。
     * @returns {Promise<void>}
     */
    async sendMessage(text, attachedFile, attachmentManager) {
        const selectedModelConfig = this.stateGetters.getSelectedModelConfig();
        const currentSessionId = this.stateGetters.getCurrentSessionId();
        let chatHistory = this.stateGetters.getChatHistory();

        // 确保在处理任何消息之前，会话已经存在
        if (selectedModelConfig && !selectedModelConfig.isWebSocket && !currentSessionId) {
            this.callbacks.historyManager.generateNewSession();
        }

        this.callbacks.displayUserMessage(text, attachedFile);
        this.stateUpdaters.resetCurrentAIMessage();

        if (selectedModelConfig.isWebSocket) {
            if (attachedFile) {
                this.callbacks.showSystemMessage('实时模式尚不支持文件上传。');
                attachmentManager.clearAttachedFile('chat');
                return;
            }
            this.client.send({ text: text });
        } else {
            try {
                const apiKey = this.stateGetters.getApiKey();
                const modelName = selectedModelConfig.name;
                const systemInstruction = this.stateGetters.getSystemInstruction();

                const userContent = [];
                if (text) {
                    userContent.push({ type: 'text', text: text });
                }
                if (attachedFile) {
                    userContent.push({
                        type: 'image_url',
                        image_url: { url: attachedFile.base64 }
                    });
                }

                const newHistory = [...chatHistory, { role: 'user', content: userContent }];
                this.stateUpdaters.updateChatHistory(newHistory);
                chatHistory = newHistory; // 更新本地副本

                attachmentManager.clearAttachedFile('chat');

                let requestBody = {
                    model: modelName,
                    messages: chatHistory,
                    generationConfig: { responseModalities: ['text'] },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
                    ],
                    enableGoogleSearch: true,
                    stream: true,
                    sessionId: this.stateGetters.getCurrentSessionId()
                };

                if (systemInstruction) {
                    requestBody.systemInstruction = {
                        parts: [{ text: systemInstruction }]
                    };
                }

                await this._processHttpStream(requestBody, apiKey);

            } catch (error) {
                Logger.error('发送 HTTP 消息失败:', error);
                this.callbacks.logMessage(`发送消息失败: ${error.message}`, 'system');
            }
        }
    }

    /**
     * 连接到后端，根据模型配置选择 WebSocket 或 HTTP 模式。
     * @returns {Promise<void>}
     */
    async connect() {
        const apiKey = this.stateGetters.getApiKey();
        if (!apiKey) {
            this.callbacks.showSystemMessage('请输入 API Key');
            return;
        }

        const selectedModelConfig = this.stateGetters.getSelectedModelConfig();

        try {
            if (selectedModelConfig.isWebSocket) {
                await this.client.connect(
                    apiKey,
                    this.stateGetters.getSystemInstruction(),
                    this.callbacks.getAudioSampleRate(),
                    selectedModelConfig.name
                );
                // 确保 WebSocket 连接成功后更新状态
                this.stateUpdaters.setIsConnected(true);
                this.callbacks.updateConnectionStatus(true, selectedModelConfig);
                this.callbacks.logMessage(`已连接到模型: ${selectedModelConfig.displayName}`, 'system');
            } else {
                // HTTP 模式直接更新状态
                this.stateUpdaters.setIsConnected(true);
                this.callbacks.updateConnectionStatus(true, selectedModelConfig);
                this.callbacks.logMessage(`已切换到 HTTP 模式: ${selectedModelConfig.displayName}`, 'system');

                if (!this.stateGetters.getCurrentSessionId()) {
                    this.callbacks.historyManager.generateNewSession();
                }
            }
        } catch (error) {
            this.callbacks.showSystemMessage(`连接失败: ${error.message}`);
            this.callbacks.logMessage(`连接失败: ${error.message}`, 'system');
            this.stateUpdaters.setIsConnected(false);
            this.callbacks.updateConnectionStatus(false, selectedModelConfig);
        }
    }

    /**
     * 断开与后端的连接。
     */
    disconnect() {
        const selectedModelConfig = this.stateGetters.getSelectedModelConfig();
        if (selectedModelConfig.isWebSocket) {
            this.client.close();
        }
        this.stateUpdaters.setIsConnected(false);
        this.callbacks.resetUIForDisconnectedState();
        this.callbacks.logMessage('连接已断开', 'system');
    }


    /**
     * 处理 HTTP SSE 流。
     * @private
     * @param {object} requestBody - 发送给模型的请求体。
     * @param {string} apiKey - API Key。
     * @returns {Promise<void>}
     */
    async _processHttpStream(requestBody, apiKey) {
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
                this.currentAIMessageContentDiv = this.callbacks.createAIMessageElement();
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

                                    if (choice.delta.reasoning_content) {
                                        if (!this.currentAIMessageContentDiv) this.currentAIMessageContentDiv = this.callbacks.createAIMessageElement();
                                        if (!reasoningStarted) {
                                            this.currentAIMessageContentDiv.reasoningContainer.style.display = 'block';
                                            reasoningStarted = true;
                                        }
                                        this.currentAIMessageContentDiv.reasoningContainer.querySelector('.reasoning-content').innerHTML += choice.delta.reasoning_content.replace(/\n/g, '<br>');
                                    }
                                    
                                    if (functionCallPart) {
                                        functionCallDetected = true;
                                        currentFunctionCall = functionCallPart.functionCall;
                                        Logger.info('Function call detected:', currentFunctionCall);
                                        this.callbacks.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                                        if (this.currentAIMessageContentDiv) this.currentAIMessageContentDiv = null;
                                    }
                                    else if (choice.delta.content) {
                                        if (!functionCallDetected) {
                                            if (!this.currentAIMessageContentDiv) this.currentAIMessageContentDiv = this.callbacks.createAIMessageElement();
                                            
                                            if (reasoningStarted && !answerStarted) {
                                                const separator = document.createElement('hr');
                                                separator.className = 'answer-separator';
                                                this.currentAIMessageContentDiv.markdownContainer.before(separator);
                                                answerStarted = true;
                                            }

                                            this.currentAIMessageContentDiv.rawMarkdownBuffer += choice.delta.content || '';
                                            this.currentAIMessageContentDiv.markdownContainer.innerHTML = marked.parse(this.currentAIMessageContentDiv.rawMarkdownBuffer);
                                            
                                            if (typeof MathJax !== 'undefined' && MathJax.startup) {
                                                MathJax.startup.promise.then(() => {
                                                    MathJax.typeset([this.currentAIMessageContentDiv.markdownContainer, this.currentAIMessageContentDiv.reasoningContainer]);
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
                if (this.currentAIMessageContentDiv && this.currentAIMessageContentDiv.rawMarkdownBuffer) {
                    const newHistory = [...this.stateGetters.getChatHistory(), { role: 'assistant', content: this.currentAIMessageContentDiv.rawMarkdownBuffer }];
                    this.stateUpdaters.updateChatHistory(newHistory);
                }
                this.currentAIMessageContentDiv = null;

                try {
                    this.isUsingTool = true;
                    this.callbacks.logMessage(`执行工具: ${currentFunctionCall.name} with args: ${JSON.stringify(currentFunctionCall.args)}`, 'system');
                    const toolResult = await this.toolManager.handleToolCall(currentFunctionCall);
                    const toolResponsePart = toolResult.functionResponses[0].response.output;

                    let historyAfterToolCall = [...this.stateGetters.getChatHistory(),
                        { role: 'assistant', parts: [{ functionCall: { name: currentFunctionCall.name, args: currentFunctionCall.args } }] },
                        { role: 'tool', parts: [{ functionResponse: { name: currentFunctionCall.name, response: toolResponsePart } }] }
                    ];
                    this.stateUpdaters.updateChatHistory(historyAfterToolCall);

                    await this._processHttpStream({
                        ...requestBody,
                        messages: historyAfterToolCall,
                        tools: this.toolManager.getToolDeclarations(),
                        sessionId: this.stateGetters.getCurrentSessionId()
                    }, apiKey);

                } catch (toolError) {
                    Logger.error('工具执行失败:', toolError);
                    this.callbacks.logMessage(`工具执行失败: ${toolError.message}`, 'system');
                    
                    let historyAfterToolError = [...this.stateGetters.getChatHistory(),
                        { role: 'assistant', parts: [{ functionCall: { name: currentFunctionCall.name, args: currentFunctionCall.args } }] },
                        { role: 'tool', parts: [{ functionResponse: { name: currentFunctionCall.name, response: { error: toolError.message } } }] }
                    ];
                    this.stateUpdaters.updateChatHistory(historyAfterToolError);

                    await this._processHttpStream({
                        ...requestBody,
                        messages: historyAfterToolError,
                        tools: this.toolManager.getToolDeclarations(),
                        sessionId: this.stateGetters.getCurrentSessionId()
                    }, apiKey);
                } finally {
                    this.isUsingTool = false;
                }
            } else {
                if (this.currentAIMessageContentDiv && this.currentAIMessageContentDiv.rawMarkdownBuffer) {
                     const newHistory = [...this.stateGetters.getChatHistory(), { role: 'assistant', content: this.currentAIMessageContentDiv.rawMarkdownBuffer }];
                     this.stateUpdaters.updateChatHistory(newHistory);
                }
                this.currentAIMessageContentDiv = null;
                this.callbacks.logMessage('Turn complete (HTTP)', 'system');
                this.callbacks.historyManager.saveHistory();
            }

        } catch (error) {
            Logger.error('处理 HTTP 流失败:', error);
            this.callbacks.logMessage(`处理流失败: ${error.message}`, 'system');
            if (this.currentAIMessageContentDiv && this.currentAIMessageContentDiv.markdownContainer) {
                this.currentAIMessageContentDiv.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${error.message}</p>`;
            }
            this.currentAIMessageContentDiv = null;
        }
    }

    // --- WebSocket 事件处理回调 ---

    _handleContent(data) {
        if (data.modelTurn) {
            if (data.modelTurn.parts.some(part => part.functionCall)) {
                this.isUsingTool = true;
                Logger.info('Model is using a tool');
                if (this.currentAIMessageContentDiv) {
                    this.currentAIMessageContentDiv = null;
                }
            } else if (data.modelTurn.parts.some(part => part.functionResponse)) {
                this.isUsingTool = false;
                Logger.info('Tool usage completed');
                if (!this.currentAIMessageContentDiv) {
                    this.currentAIMessageContentDiv = this.callbacks.createAIMessageElement();
                }
            }

            const text = data.modelTurn.parts.map(part => part.text).join('');
            
            if (text) {
                if (!this.currentAIMessageContentDiv) {
                    this.currentAIMessageContentDiv = this.callbacks.createAIMessageElement();
                }
                
                this.currentAIMessageContentDiv.rawMarkdownBuffer += text;
                this.currentAIMessageContentDiv.markdownContainer.innerHTML = marked.parse(this.currentAIMessageContentDiv.rawMarkdownBuffer);
                
                if (typeof MathJax !== 'undefined' && MathJax.startup) {
                    MathJax.startup.promise.then(() => {
                        MathJax.typeset([this.currentAIMessageContentDiv.markdownContainer]);
                    }).catch((err) => console.error('MathJax typesetting failed:', err));
                }
                this.callbacks.scrollToBottom();
            }
        }
    }

    async _handleAudio(data) {
        try {
            const streamer = await this.callbacks.ensureAudioInitialized();
            streamer.addPCM16(new Uint8Array(data));
            this.audioDataBuffer.push(new Uint8Array(data));
        } catch (error) {
            this.callbacks.logMessage(`处理音频时出错: ${error.message}`, 'system');
        }
    }

    _handleTurnComplete() {
        this.isUsingTool = false;
        this.callbacks.logMessage('Turn complete', 'system');
        if (this.currentAIMessageContentDiv && this.currentAIMessageContentDiv.rawMarkdownBuffer) {
            const newHistory = [...this.stateGetters.getChatHistory(), { role: 'assistant', content: this.currentAIMessageContentDiv.rawMarkdownBuffer }];
            this.stateUpdaters.updateChatHistory(newHistory);
        }
        this.currentAIMessageContentDiv = null;
        
        if (this.audioDataBuffer.length > 0) {
            const audioBlob = this.callbacks.pcmToWavBlob(this.audioDataBuffer);
            const audioUrl = URL.createObjectURL(audioBlob);
            const duration = this.audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (this.callbacks.getAudioSampleRate() * 2);
            this.callbacks.displayAudioMessage(audioUrl, duration, 'ai');
            this.audioDataBuffer = [];
        }

        if (this.stateGetters.isConnected() && !this.stateGetters.getSelectedModelConfig().isWebSocket) {
            this.callbacks.historyManager.saveHistory();
        }
    }

    _handleInterrupted() {
        this.callbacks.audioStreamer?.stop();
        this.isUsingTool = false;
        Logger.info('Model interrupted');
        this.callbacks.logMessage('Model interrupted', 'system');
        
        if (this.currentAIMessageContentDiv && this.currentAIMessageContentDiv.rawMarkdownBuffer) {
            const newHistory = [...this.stateGetters.getChatHistory(), { role: 'assistant', content: this.currentAIMessageContentDiv.rawMarkdownBuffer }];
            this.stateUpdaters.updateChatHistory(newHistory);
        }
        this.currentAIMessageContentDiv = null;
        
        if (this.audioDataBuffer.length > 0) {
            const audioBlob = this.callbacks.pcmToWavBlob(this.audioDataBuffer);
            const audioUrl = URL.createObjectURL(audioBlob);
            const duration = this.audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (this.callbacks.getAudioSampleRate() * 2);
            this.callbacks.displayAudioMessage(audioUrl, duration, 'ai');
            this.audioDataBuffer = [];
        }
    }

    _handleError(error) {
        // 'ApplicationError' is not defined in this scope, so we check for error.message
        if (error && error.message) {
            Logger.error(`Application error: ${error.message}`, error);
        } else {
            Logger.error('Unexpected error', error);
        }
        this.callbacks.logMessage(`Error: ${error.message || 'Unknown error'}`, 'system');
    }
}