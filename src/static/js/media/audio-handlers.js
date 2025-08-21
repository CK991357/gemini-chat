import { AudioRecorder } from '../audio/audio-recorder.js';
import * as chatUI from '../chat/chat-ui.js';
import { showSystemMessage } from '../main.js';
import { Logger } from '../utils/logger.js';

/**
 * @class AudioHandler
 * @description Manages microphone input logic, including permission handling, recording, and UI updates.
 */
export class AudioHandler {
    /**
     * @constructor
     * @param {object} options - The options for the audio handler.
     * @param {object} options.elements - A collection of DOM elements (e.g., micButton).
     * @param {Function} options.isConnected - Function to get the current connection status.
     * @param {object} options.client - The MultimodalLiveClient instance.
     * @param {Function} options.getSelectedModelConfig - Function to get the currently selected model configuration.
     * @param {Function} options.getIsUsingTool - Function to get the current tool usage status.
     * @param {AudioContext} options.audioCtx - The global audio context.
     * @param {AudioStreamer} options.audioStreamer - The global audio streamer.
     */
    constructor({ elements, isConnected, client, getSelectedModelConfig, getIsUsingTool, audioCtx, audioStreamer }) {
        this.elements = elements;
        this.isConnected = isConnected;
        this.client = client;
        this.getSelectedModelConfig = getSelectedModelConfig;
        this.getIsUsingTool = getIsUsingTool;
        this.audioCtx = audioCtx;
        this.audioStreamer = audioStreamer;

        this.isRecording = false;
        this.audioRecorder = null;
        this.micStream = null;

        this.elements.micButton.addEventListener('click', async () => {
            if (this.isConnected() && this.getSelectedModelConfig().isWebSocket) {
                await this.handleMicToggle();
            } else if (!this.getSelectedModelConfig().isWebSocket) {
                showSystemMessage('当前模型不支持麦克风功能。');
            }
        });
    }

    /**
     * @description Updates the microphone icon based on the recording state.
     */
    updateMicIcon() {
        if (this.elements.micButton) {
            this.elements.micButton.textContent = this.isRecording ? 'mic_off' : 'mic';
            this.elements.micButton.classList.toggle('active', this.isRecording);
        }
    }

    /**
     * @description Handles the microphone toggle. Starts or stops audio recording.
     * @returns {Promise<void>}
     */
    async handleMicToggle() {
        if (!this.isRecording) {
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                if (permissionStatus.state === 'denied') {
                    chatUI.logMessage('麦克风权限被拒绝，请在浏览器设置中启用', 'system');
                    return;
                }

                if (!this.audioCtx || !this.audioStreamer) {
                    chatUI.logMessage('音频组件尚未初始化', 'system');
                    return;
                }
                
                this.audioRecorder = new AudioRecorder();
                
                const inputAnalyser = this.audioCtx.createAnalyser();
                inputAnalyser.fftSize = 256;
                
                await this.audioRecorder.start((base64Data) => {
                    if (this.getIsUsingTool()) {
                        this.client.sendRealtimeInput([{
                            mimeType: "audio/pcm;rate=16000",
                            data: base64Data,
                            interrupt: true
                        }]);
                    } else {
                        this.client.sendRealtimeInput([{
                            mimeType: "audio/pcm;rate=16000",
                            data: base64Data
                        }]);
                    }
                });

                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.micStream = stream;
                const source = this.audioCtx.createMediaStreamSource(stream);
                source.connect(inputAnalyser);
                
                await this.audioStreamer.resume();
                this.isRecording = true;
                Logger.info('Microphone started');
                chatUI.logMessage('Microphone started', 'system');
                this.updateMicIcon();
            } catch (error) {
                Logger.error('Microphone error:', error);
                chatUI.logMessage(`Error: ${error.message}`, 'system');
                this.isRecording = false;
                this.updateMicIcon();
            }
        } else {
            try {
                if (this.audioRecorder && this.isRecording) {
                    this.audioRecorder.stop();
                    if (this.micStream) {
                        this.micStream.getTracks().forEach(track => track.stop());
                        this.micStream = null;
                    }
                }
                this.isRecording = false;
                chatUI.logMessage('Microphone stopped', 'system');
                this.updateMicIcon();
            } catch (error) {
                Logger.error('Microphone stop error:', error);
                chatUI.logMessage(`Error stopping microphone: ${error.message}`, 'system');
                this.isRecording = false;
                this.updateMicIcon();
            }
        }
    }

    /**
     * @description Checks if microphone recording is currently active.
     * @returns {boolean} True if recording is active, false otherwise.
     */
    getIsRecording() {
        return this.isRecording;
    }
}