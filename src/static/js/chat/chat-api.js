/**
 * @fileoverview ChatAPI 类负责管理与后端的所有聊天相关API交互，
 * 包括 WebSocket 和 HTTP 请求。它封装了通信逻辑，并通过回调和
 * 状态获取器与主应用程序（main.js）解耦。
 */

import { APIHandler } from '../core/api-handler.js';
import { Logger } from '../utils/logger.js';

/**
 * @class ChatAPI
 * @extends APIHandler
 * @description 处理所有与聊天相关的后端通信，支持 WebSocket 和 HTTP 模式的动态切换。
 */
export class ChatAPI extends APIHandler {
    /**
     * ChatAPI 构造函数。
     * @param {object} dependencies - 依赖项对象。
     * @param {MultimodalLiveClient} dependencies.client - WebSocket 客户端实例。
     * @param {ToolManager} dependencies.toolManager - 工具管理器实例。
     * @param {object} dependencies.callbacks - 用于与UI和状态管理器交互的回调函数。
     * @param {object} dependencies.stateGetters - 用于获取当前应用状态的函数集合。
     * @param {object} dependencies.stateUpdaters - 用于更新应用状态的函数集合。
     */
    constructor(dependencies) {
        super(dependencies.stateGetters.getApiKey());
        this.client = dependencies.client;
        this.toolManager = dependencies.toolManager;
        this.callbacks = dependencies.callbacks;
        this.stateGetters = dependencies.stateGetters;
        this.stateUpdaters = dependencies.stateUpdaters;

        this.audioDataBuffer = [];
        this._registerSocketHandlers();
    }

    /**
     * 注册 WebSocket 客户端的核心事件监听器。
     * @private
     */
    _registerSocketHandlers() {
        this.client.on('open', this.callbacks.onConnectionOpen);
        this.client.on('close', this.callbacks.onConnectionClose);
        this.client.on('error', this.callbacks.onConnectionError);
        this.client.on('content', this.callbacks.onMessageStream);
        this.client.on('audio', this._handleWsAudio.bind(this));
        this.client.on('turncomplete', this._handleWsTurnComplete.bind(this));
        this.client.on('interrupted', this._handleWsInterrupted.bind(this));
        this.client.on('error', (error) => this.callbacks.logMessage(`WebSocket Error: ${error.message || 'Unknown error'}`, 'system'));
        this.client.on('log', (log) => this.callbacks.logMessage(`${log.type}: ${JSON.stringify(log.message)}`, 'system'));
    }

    /**
     * 连接到后端。此方法是所有连接和模型切换的唯一入口。
     * 它会根据当前选择的模型，动态地选择 WebSocket 或 HTTP 模式。
     * @returns {Promise<void>}
     */
    async connect() {
        const apiKey = this.stateGetters.getApiKey();
        if (!apiKey) {
            this.callbacks.showSystemMessage('请输入 API Key');
            return;
        }
        this.setApiKey(apiKey); // 确保基类的 key 是最新的

        const selectedModelConfig = this.stateGetters.getSelectedModelConfig();

        // 在建立新连接前，先彻底断开旧连接，确保状态干净
        if (this.stateGetters.getIsConnected()) {
            this.disconnect();
        }

        try {
            if (selectedModelConfig.isWebSocket) {
                // WebSocket 路径：发起连接，成功状态由 'open' 事件回调处理
                this.callbacks.logMessage(`正在连接到 WebSocket 模型: ${selectedModelConfig.displayName}...`, 'system');
                const wsConfig = {
                    model: selectedModelConfig.name,
                    generationConfig: {
                        responseModalities: ["audio", "text"],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: this.stateGetters.getVoice()
                                }
                            }
                        }
                    },
                };

                const systemInstruction = this.stateGetters.getSystemInstruction();
                if (systemInstruction) {
                    wsConfig.systemInstruction = {
                        parts: [{ text: systemInstruction }]
                    };
                }

                await this.client.connect(wsConfig, apiKey);
            } else {
                // HTTP 路径：无状态连接，直接更新UI和内部状态
                this.callbacks.logMessage(`已切换到 HTTP 模式: ${selectedModelConfig.displayName}`, 'system');
                this.callbacks.onConnectionOpen(); // 直接调用 onConnectionOpen 回调来统一处理状态
            }
        } catch (error) {
            this.callbacks.onConnectionError(error);
        }
    }

    /**
     * 断开与后端的连接。
     * 负责清理 WebSocket 连接和重置应用状态。
     */
    disconnect() {
        if (this.client && this.client.ws) {
            this.client.disconnect();
        } else {
            // 对于HTTP模式或未连接状态，确保UI被重置
            this.callbacks.onConnectionClose({ reason: 'User disconnected' });
        }
    }

    /**
     * 发送消息。根据当前模型配置，动态路由到 WebSocket 或 HTTP 方法。
     * @param {string} text - 用户输入的文本。
     * @param {object|null} attachedFile - 附加的文件对象。
     */
    async sendMessage(text, attachedFile) {
        const selectedModelConfig = this.stateGetters.getSelectedModelConfig();

        this.stateUpdaters.addUserMessageToUI(text, attachedFile); // FIX: Use stateUpdaters
        this.callbacks.onMessageStart();

        if (selectedModelConfig.isWebSocket) {
            if (attachedFile) {
                this.callbacks.showSystemMessage('实时模式尚不支持文件上传。');
                this.callbacks.attachmentManager.clearAttachedFile('chat');
                return;
            }
            this.client.send({ text });
        } else {
            const requestBody = this._buildHttpRequestBody(text, attachedFile);
            this.callbacks.attachmentManager.clearAttachedFile('chat');
            await this._sendHttpRequest(requestBody);
        }
    }

    /**
     * 构建 HTTP 请求体。
     * @private
     */
    _buildHttpRequestBody(text, attachedFile) {
        const userContent = [];
        if (text) {
            userContent.push({ type: 'text', text });
        }
        if (attachedFile) {
            userContent.push({ type: 'image_url', image_url: { url: attachedFile.base64 } });
        }

        const systemInstruction = this.stateGetters.getSystemInstruction();
        const requestBody = {
            model: this.stateGetters.getSelectedModelConfig().name,
            messages: [...this.stateGetters.getChatHistory(), { role: 'user', content: userContent }],
            stream: true,
            sessionId: this.stateGetters.getCurrentSessionId(),
            // ... 其他配置如 safetySettings, generationConfig 等
        };

        if (systemInstruction) {
            requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        
        // 如果历史记录中有工具调用，则添加工具声明
        if (this.stateGetters.getChatHistory().some(msg => msg.role === 'tool' || (msg.role === 'assistant' && msg.parts?.some(p => p.functionCall)))) {
            requestBody.tools = this.toolManager.getToolDeclarations();
        }


        return requestBody;
    }

    /**
     * 发送 HTTP 请求并处理返回的流。
     * @private
     */
    async _sendHttpRequest(requestBody) {
        try {
            const response = await this._fetch('/api/chat/completions', {
                method: 'POST',
                body: JSON.stringify(requestBody),
            });
            await this._processHttpStream(response.body.getReader(), requestBody);
        } catch (error) {
            Logger.error('HTTP 请求或流处理失败:', error);
            this.callbacks.logMessage(`请求失败: ${error.message}`, 'system');
            this.callbacks.updateAIMessage({ type: 'error', content: error.message });
        }
    }

    /**
     * 处理 HTTP SSE 流。
     * @private
     */
    async _processHttpStream(reader, originalRequestBody) {
        const decoder = new TextDecoder('utf-8');
        let functionCallDetected = false;
        let currentFunctionCall = null;
        let fullResponseText = "";

        this.callbacks.createAIMessageElement(); // 创建一个空的AI消息容器

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta;
                        if (!delta) continue;

                        const functionCallPart = delta.parts?.find(p => p.functionCall);
                        if (functionCallPart) {
                            functionCallDetected = true;
                            currentFunctionCall = functionCallPart.functionCall;
                            this.callbacks.logMessage(`模型请求工具: ${currentFunctionCall.name}`, 'system');
                        } else if (delta.content) {
                            fullResponseText += delta.content;
                            this.callbacks.updateAIMessage({ type: 'content', content: delta.content, isStream: true });
                        }
                    } catch (e) {
                        Logger.error('Error parsing SSE chunk:', e, jsonStr);
                    }
                }
            }
        }

        // 流结束后的处理
        this.stateUpdaters.updateChatHistory([...this.stateGetters.getChatHistory(), { role: 'assistant', content: fullResponseText }]);

        if (functionCallDetected && currentFunctionCall) {
            await this._handleHttpToolCall(currentFunctionCall, originalRequestBody);
        } else {
            this.callbacks.logMessage('Turn complete (HTTP)', 'system');
            this.callbacks.historyManager.saveHistory();
        }
    }
    
    /**
     * 处理 HTTP 模式下的工具调用。
     * @private
     */
    async _handleHttpToolCall(functionCall, originalRequestBody) {
        try {
            this.callbacks.logMessage(`执行工具: ${functionCall.name} with args: ${JSON.stringify(functionCall.args)}`, 'system');
            const toolResult = await this.toolManager.handleToolCall(functionCall);
            const toolResponsePart = toolResult.functionResponses[0].response.output;

            const historyAfterToolCall = [
                ...this.stateGetters.getChatHistory(),
                { role: 'assistant', parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }] },
                { role: 'tool', parts: [{ functionResponse: { name: functionCall.name, response: toolResponsePart } }] }
            ];
            this.stateUpdaters.updateChatHistory(historyAfterToolCall);

            const nextRequestBody = {
                ...originalRequestBody,
                messages: historyAfterToolCall,
                tools: this.toolManager.getToolDeclarations(),
            };
            await this._sendHttpRequest(nextRequestBody);

        } catch (toolError) {
            Logger.error('工具执行失败:', toolError);
            this.callbacks.logMessage(`工具执行失败: ${toolError.message}`, 'system');
            // 可以选择将错误信息发回给模型
        }
    }


    // --- WebSocket 事件处理回调 ---

    _handleWsContent(data) {
        if (data.modelTurn?.parts) {
            const text = data.modelTurn.parts.map(part => part.text).join('');
            if (text) {
                this.callbacks.updateAIMessage({ type: 'content', content: text, isStream: true });
            }
        }
    }

    async _handleWsAudio(data) {
        try {
            const streamer = await this.callbacks.ensureAudioInitialized();
            streamer.addPCM16(new Uint8Array(data));
            this.audioDataBuffer.push(new Uint8Array(data));
        } catch (error) {
            this.callbacks.logMessage(`处理音频时出错: ${error.message}`, 'system');
        }
    }

    _handleWsTurnComplete() {
        this.callbacks.logMessage('Turn complete (WebSocket)', 'system');
        this.callbacks.finalizeAIMessage(); // 通知UI，流结束了

        if (this.audioDataBuffer.length > 0) {
            const audioBlob = this.callbacks.pcmToWavBlob(this.audioDataBuffer);
            const audioUrl = URL.createObjectURL(audioBlob);
            const duration = this.audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (this.callbacks.getAudioSampleRate() * 2);
            this.callbacks.displayAudioMessage(audioUrl, duration, 'ai');
            this.audioDataBuffer = [];
        }
    }

    _handleWsInterrupted() {
        this.callbacks.audioStreamer?.stop();
        this.callbacks.logMessage('Model interrupted', 'system');
        this.callbacks.finalizeAIMessage();
        
        if (this.audioDataBuffer.length > 0) {
            const audioBlob = this.callbacks.pcmToWavBlob(this.audioDataBuffer);
            const audioUrl = URL.createObjectURL(audioBlob);
            const duration = this.audioDataBuffer.reduce((sum, arr) => sum + arr.length, 0) / (this.callbacks.getAudioSampleRate() * 2);
            this.callbacks.displayAudioMessage(audioUrl, duration, 'ai');
            this.audioDataBuffer = [];
        }
    }
}