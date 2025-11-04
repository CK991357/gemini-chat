import { EventEmitter } from 'https://cdn.skypack.dev/eventemitter3';
import { CONFIG } from '../config/config.js';
import { ToolManager } from '../tools/tool-manager.js';
import { ApplicationError, ErrorCodes } from '../utils/error-boundary.js';
import { Logger } from '../utils/logger.js';
import { base64ToArrayBuffer, blobToJSON } from '../utils/utils.js';

/**
 * Client for interacting with the Gemini 2.0 Flash Multimodal Live API via WebSockets.
 * This class handles the connection, sending and receiving messages, and processing responses.
 * It extends EventEmitter to emit events for various stages of the interaction.
 *
 * @extends EventEmitter
 */
export class MultimodalLiveClient extends EventEmitter {
    /**
     * Creates a new MultimodalLiveClient.
     *
     * @param {Object} options - Configuration options.
     * @param {string} [options.url] - The WebSocket URL for the Gemini API. Defaults to a URL constructed with the provided API key.
     */
    constructor() {
        super();
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.baseUrl = `${wsProtocol}//${window.location.host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;
        this.ws = null;
        this.config = null;
        this.send = this.send.bind(this);
        this.toolManager = new ToolManager();
        
        // 🔥 新增：视频传输状态初始化
        this.videoState = null;
    }

    /**
     * Logs a message with a timestamp and type. Emits a 'log' event.
     *
     * @param {string} type - The type of the log message (e.g., 'server.send', 'client.close').
     * @param {string|Object} message - The message to log.
     */
    log(type, message) {
        this.emit('log', { date: new Date(), type, message });
    }

    /**
     * Connects to the WebSocket server with the given configuration.
     * The configuration can include model settings, generation config, system instructions, and tools.
     *
     * @param {Object} config - The configuration for the connection.
     * @param {string} config.model - The model to use (e.g., 'gemini-2.0-flash-exp').
     * @param {Object} config.generationConfig - Configuration for content generation.
     * @param {string[]} config.generationConfig.responseModalities - The modalities for the response (e.g., "audio", "text").
     * @param {Object} config.generationConfig.speechConfig - Configuration for speech generation.
     * @param {Object} config.generationConfig.speechConfig.voiceConfig - Configuration for the voice.
     * @param {string} config.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName - The name of the prebuilt voice to use.
     * @param {Object} config.systemInstruction - Instructions for the system.
     * @param {Object[]} config.systemInstruction.parts - Parts of the system instruction.
     * @param {string} config.systemInstruction.parts[].text - Text content of the instruction part.
     * @param {Object[]} [config.tools] - Additional tools to be used by the model.
     * @returns {Promise<boolean>} - Resolves with true when the connection is established.
     * @throws {ApplicationError} - Throws an error if the connection fails.
     */
    connect(config, apiKey) {
        this.config = {
            ...config,
            tools: [
                ...this.toolManager.getToolDeclarations(),
                ...(config.tools || [])
            ]
        };
        const ws = new WebSocket(`${this.baseUrl}?key=${apiKey}`);

        ws.addEventListener('message', async (evt) => {
            try {
                if (evt.data instanceof Blob) {
                    await this.receive(evt.data);
                } else {
                    // 处理文本消息，检查是否为JSON
                    const text = evt.data.toString();
                    if (text.startsWith('{') || text.startsWith('[')) {
                        // 是JSON，正常处理
                        const response = JSON.parse(text);
                        await this.handleJSONResponse(response);
                    } else {
                        // 非JSON响应，可能是错误信息
                        Logger.error('Non-JSON response from server:', text);
                        this.emit('error', new Error(`API returned non-JSON: ${text.substring(0, 100)}`));
                    }
                }
            } catch (error) {
                Logger.error('Message processing error:', error);
                this.emit('error', error);
            }
        });

        return new Promise((resolve, reject) => {
            const onError = (ev) => {
                this.disconnect(ws);
                const error = new ApplicationError(
                    `WebSocket connection error: ${ev.message || 'Connection failed'}`,
                    ErrorCodes.WEBSOCKET_CONNECTION_FAILED,
                    { originalError: ev }
                );
                Logger.error('WebSocket error:', error);
                this.emit('error', error);
                reject(error);
            };

            ws.addEventListener('error', onError);
            ws.addEventListener('open', (ev) => {
                if (!this.config) {
                    reject('Invalid config sent to `connect(config)`');
                    return;
                }
                this.log(`client.${ev.type}`, 'Connected to socket');
                this.emit('open');

                this.ws = ws;

                const setupMessage = { setup: this.config };
                this._sendDirect(setupMessage);
                this.log('client.send', 'setup');

                ws.removeEventListener('error', onError);
                ws.addEventListener('close', (ev) => {
                    this.disconnect(ws);
                    let reason = ev.reason || '';
                    if (reason.toLowerCase().includes('error')) {
                        const prelude = 'ERROR]';
                        const preludeIndex = reason.indexOf(prelude);
                        if (preludeIndex > 0) {
                            reason = reason.slice(preludeIndex + prelude.length + 1);
                        }
                    }
                    this.log(`server.${ev.type}`, `Disconnected ${reason ? `with reason: ${reason}` : ''}`);
                    this.emit('close', { code: ev.code, reason });
                });
                resolve(true);
            });
        });
    }

    /**
     * Disconnects from the WebSocket server.
     *
     * @param {WebSocket} [ws] - The WebSocket instance to disconnect. If not provided, defaults to the current instance.
     * @returns {boolean} - True if disconnected, false otherwise.
     */
    disconnect(ws) {
        if ((!ws || this.ws === ws) && this.ws) {
            this.ws.close();
            this.ws = null;
            this.log('client.close', 'Disconnected');
            return true;
        }
        return false;
    }

    /**
     * Receives and processes a message from the WebSocket server.
     * Handles different types of responses like tool calls, setup completion, and server content.
     *
     * @param {Blob} blob - The received blob data.
     */
    async receive(blob) {
        const response = await blobToJSON(blob);
        if (response.toolCall) {
            this.log('server.toolCall', response);
            await this.handleToolCall(response.toolCall);
            return;
        }
        if (response.toolCallCancellation) {
            this.log('receive.toolCallCancellation', response);
            this.emit('toolcallcancellation', response.toolCallCancellation);
            return;
        }
        if (response.setupComplete) {
            this.log('server.send', 'setupComplete');
            this.emit('setupcomplete');
            return;
        }
        if (response.serverContent) {
            const { serverContent } = response;
            if (serverContent.interrupted) {
                this.log('receive.serverContent', 'interrupted');
                this.emit('interrupted');
                return;
            }
            if (serverContent.turnComplete) {
                this.log('server.send', 'turnComplete');
                this.emit('turncomplete');
            }
            if (serverContent.modelTurn) {
                let parts = serverContent.modelTurn.parts;
                const audioParts = parts.filter((p) => p.inlineData && p.inlineData.mimeType.startsWith('audio/pcm'));
                const base64s = audioParts.map((p) => p.inlineData?.data);
                const otherParts = parts.filter((p) => !audioParts.includes(p));

                base64s.forEach((b64) => {
                    if (b64) {
                        const data = base64ToArrayBuffer(b64);
                        this.emit('audio', data);
                        //this.log(`server.audio`, `buffer (${data.byteLength})`);
                    }
                });

                if (!otherParts.length) {
                    return;
                }

                parts = otherParts;
                const content = { modelTurn: { parts } };
                this.emit('content', content);
                this.log(`server.content`, response);
            }
        } else {
            console.log('Received unmatched message', response);
        }
    }

    /**
     * Sends real-time input data to the server.
     *
     * @param {Array} chunks - An array of media chunks to send. Each chunk should have a mimeType and data.
     */
    sendRealtimeInput(chunks) {
        // 🔥 修正：添加安全检查
        if (!chunks || !Array.isArray(chunks)) {
            Logger.error('Invalid chunks data:', chunks);
            return;
        }
        
        const videoConfig = CONFIG.WEBSOCKET_VIDEO || {};
        const useVideoQueue = videoConfig.OPTIMIZATION_ENABLED && videoConfig.TRANSMISSION?.MAX_QUEUE_SIZE;
        
        if (useVideoQueue) {
            // 分离视频帧和其他数据
            const videoChunks = chunks.filter(ch => ch && ch.mimeType && ch.mimeType.includes('image'));
            const nonVideoChunks = chunks.filter(ch => !ch || !ch.mimeType || !ch.mimeType.includes('image'));
            
            // 🔥 修正：处理所有视频块，而不是只处理第一个
            if (videoChunks.length > 0) {
                videoChunks.forEach(videoChunk => {
                    this.manageVideoQueue(videoChunk);
                });
            }
            
            // 立即发送音频和其他数据
            if (nonVideoChunks.length > 0) {
                this.sendImmediate(nonVideoChunks);
            }
        } else {
            // 原有逻辑
            let hasAudio = false;
            let hasVideo = false;
            let totalSize = 0;

            for (let i = 0; i < chunks.length; i++) {
                const ch = chunks[i];
                totalSize += ch.data.length;
                if (ch.mimeType && ch.mimeType.includes('audio')) {
                    hasAudio = true;
                }
                if (ch.mimeType && ch.mimeType.includes('image')) {
                    hasVideo = true;
                }
            }

            const message = hasAudio && hasVideo ? 'audio + video' : hasAudio ? 'audio' : hasVideo ? 'video' : 'unknown';
            Logger.debug(`Sending realtime input: ${message} (${Math.round(totalSize/1024)}KB)`);

            const data = { realtimeInput: { mediaChunks: chunks } };
            this._sendDirect(data);
        }
    }

    /**
     * 🔥 修正：视频队列管理方法 - 处理单个视频块
     * @param {Object} videoChunk - 单个视频数据块
     * @private
     */
    manageVideoQueue(videoChunk) {
        // 初始化视频状态
        if (!this.videoState) {
            const videoConfig = CONFIG.WEBSOCKET_VIDEO || {};
            this.videoState = {
                lastVideoTime: 0,
                videoQueue: [],
                isProcessing: false,
                maxQueueSize: videoConfig.TRANSMISSION?.MAX_QUEUE_SIZE || 3,
                transmitInterval: videoConfig.TRANSMISSION?.ADAPTIVE_INTERVAL || 100
            };
        }
        
        // 限制队列大小，丢弃旧帧
        if (this.videoState.videoQueue.length >= this.videoState.maxQueueSize) {
            this.videoState.videoQueue.shift();
        }
        
        // 🔥 修正：push单个视频块
        this.videoState.videoQueue.push(videoChunk);
        
        // 如果没有在处理，开始处理队列
        if (!this.videoState.isProcessing) {
            this.processVideoQueue();
        }
    }

    /**
     * 🔥 修正：处理视频队列
     * @private
     */
    async processVideoQueue() {
        if (!this.videoState || this.videoState.isProcessing || this.videoState.videoQueue.length === 0) {
            return;
        }
        
        this.videoState.isProcessing = true;
        
        while (this.videoState.videoQueue.length > 0) {
            const videoChunk = this.videoState.videoQueue.shift();
            
            try {
                const data = { realtimeInput: { mediaChunks: [videoChunk] } };
                this._sendDirect(data);
                
                Logger.debug(`Video frame sent (${Math.round(videoChunk.data.length/1024)}KB), queue: ${this.videoState.videoQueue.length}`);
                
                // 控制发送速率
                await new Promise(resolve => setTimeout(resolve, this.videoState.transmitInterval));
                
            } catch (error) {
                Logger.error('Video transmission error:', error);
                break;
            }
        }
        
        this.videoState.isProcessing = false;
    }

    /**
     * 🔥 新增：立即发送方法
     * @param {Array} chunks - 要立即发送的数据块
     * @private
     */
    sendImmediate(chunks) {
        const data = { realtimeInput: { mediaChunks: chunks } };
        this._sendDirect(data);
    }

    /**
     * Sends a tool response to the server.
     *
     * @param {Object} toolResponse - The tool response to send.
     */
    sendToolResponse(toolResponse) {
        const message = { toolResponse };
        this._sendDirect(message);
        this.log(`client.toolResponse`, message);
    }

    /**
     * Sends a message to the server.
     *
     * @param {string|Object|Array} parts - The message parts to send. Can be a string, an object, or an array of strings/objects.
     * @param {boolean} [turnComplete=true] - Indicates if this message completes the current turn.
     */
    send(parts, turnComplete = true) {
        parts = Array.isArray(parts) ? parts : [parts];
        const formattedParts = parts.map(part => {
            if (typeof part === 'string') {
                return { text: part };
            } else if (typeof part === 'object' && !part.text && !part.inlineData) {
                return { text: JSON.stringify(part) };
            }
            return part;
        });
        const content = { role: 'user', parts: formattedParts };
        const clientContentRequest = { clientContent: { turns: [content], turnComplete } };
        this._sendDirect(clientContentRequest);
        this.log(`client.send`, clientContentRequest);
    }

    /**
     * Sends a message directly to the WebSocket server.
     *
     * @param {Object} request - The request to send.
     * @throws {Error} - Throws an error if the WebSocket is not connected.
     * @private
     */
    _sendDirect(request) {
        if (!this.ws) {
            throw new Error('WebSocket is not connected');
        }
        const str = JSON.stringify(request);
        this.ws.send(str);
    }

    /**
     * Handles a tool call from the server.
     *
     * @param {Object} toolCall - The tool call data.
     */
    async handleToolCall(toolCall) {
        try {
            const response = await this.toolManager.handleToolCall(toolCall.functionCalls[0]);
            this.sendToolResponse(response);
        } catch (error) {
            Logger.error('Tool call failed', error);
            this.sendToolResponse({
                functionResponses: [{
                    response: { error: error.message },
                    id: toolCall.functionCalls[0].id
                }]
            });
        }
    }
    /**
     * 🔥 新增：JSON响应处理
     * 处理非 Blob 的 JSON 消息，包括 API 错误。
     * @param {Object} response - 解析后的 JSON 响应对象。
     */
    async handleJSONResponse(response) {
        if (response.error) {
            Logger.error('API returned error:', response.error);
            this.emit('api_error', response.error);
            return;
        }
        // 重新打包为 Blob，以便 receive 方法可以像处理原始 Blob 一样处理它
        await this.receive(new Blob([JSON.stringify(response)]));
    }
}