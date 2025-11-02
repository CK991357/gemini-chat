import { AudioRecorder } from '../audio/audio-recorder.js';
import { CONFIG } from '../config/config.js';

/**
 * @fileoverview Audio input handling for translation mode.
 * Provides voice-to-text functionality with the same UX as chat mode.
 */

/**
 * PCM to WAV blob conversion function (copied from main.js)
 * @param {Uint8Array[]} pcmDataBuffers - Array of PCM data buffers
 * @param {number} sampleRate - Sample rate (default 24000)
 * @returns {Blob} WAV format blob
 */
function pcmToWavBlob(pcmDataBuffers, sampleRate = 24000) {
    let dataLength = 0;
    for (const buffer of pcmDataBuffers) {
        dataLength += buffer.length;
    }

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF'); // RIFF identifier
    view.setUint32(4, 36 + dataLength, true); // file length
    writeString(view, 8, 'WAVE'); // RIFF type
    writeString(view, 12, 'fmt '); // format chunk identifier
    view.setUint32(16, 16, true); // format chunk length
    view.setUint16(20, 1, true); // sample format (1 = PCM)
    view.setUint16(22, 1, true); // num channels
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * 2, true); // byte rate (sampleRate * numChannels * bytesPerSample)
    view.setUint16(32, 2, true); // block align (numChannels * bytesPerSample)
    view.setUint16(34, 16, true); // bits per sample
    writeString(view, 36, 'data'); // data chunk identifier
    view.setUint32(40, dataLength, true); // data length

    // Write PCM data
    let offset = 44;
    for (const pcmBuffer of pcmDataBuffers) {
        for (let i = 0; i < pcmBuffer.length; i++) {
            view.setUint8(offset + i, pcmBuffer[i]);
        }
        offset += pcmBuffer.length;
    }

    return new Blob([view], { type: 'audio/wav' });
}

/**
 * TranslationAudio class handling voice input for translation mode
 */
export class TranslationAudio {
    constructor(elements, showToast, showSystemMessage) {
        this.elements = elements;
        this.showToast = showToast;
        this.showSystemMessage = showSystemMessage;
        
        // State variables (aligned with main.js)
        this.isRecording = false;
        this.hasRequestedMicPermission = false;
        this.audioRecorder = null;
        this.audioChunks = [];
        this.recordingTimeout = null;
        this.initialTouchY = 0;
        
        this.init();
    }

    /**
     * Initialize the audio module
     */
    init() {
        this.attachEventListeners();
    }

    /**
     * Attach event listeners for voice input
     */
    attachEventListeners() {
        const voiceButton = this.elements.translationVoiceInputButton;
        if (!voiceButton) return;

        // Mouse events for press-and-hold recording
        voiceButton.addEventListener('mousedown', () => this.startRecording());
        voiceButton.addEventListener('mouseup', () => this.stopRecording());
        voiceButton.addEventListener('mouseleave', () => {
            if (this.isRecording) {
                this.cancelRecording();
            }
        });

        // Touch events for press-and-hold recording on mobile
        voiceButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.initialTouchY = e.touches[0].clientY;
            this.startRecording();
        });
        voiceButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });
        voiceButton.addEventListener('touchmove', (e) => {
            if (this.isRecording) {
                const currentTouchY = e.touches[0].clientY;
                // Check for significant upward swipe to cancel
                if (this.initialTouchY - currentTouchY > 50) {
                    this.cancelRecording();
                }
            }
        });
    }

    /**
     * Start voice recording for translation
     * @returns {Promise<void>}
     */
    async startRecording() {
        if (this.isRecording) return;

        // First click: only request permission
        if (!this.hasRequestedMicPermission) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                this.hasRequestedMicPermission = true;
                this.showToast('已获取麦克风权限，请再次点击开始录音');
                return;
            } catch (error) {
                this.showSystemMessage(`获取麦克风权限失败: ${error.message}`);
                console.error('获取麦克风权限失败:', error);
                this.resetRecordingState();
                this.hasRequestedMicPermission = false;
                return;
            }
        }

        // Permission already requested, start recording
        try {
            this.showToast('录音已开始...');
            // 使用 recording-active 类名与 CSS 匹配
            this.elements.translationVoiceInputButton.classList.add('recording-active');
            this.elements.translationInputTextarea.placeholder = '正在录音，请说话...';
            // 不清空输入框内容，实现内容叠加

            this.audioChunks = [];
            this.audioRecorder = new AudioRecorder();

            await this.audioRecorder.start((chunk) => {
                this.audioChunks.push(chunk);
            }, { returnRaw: true });

            this.isRecording = true;

            // Auto-stop after 60 seconds
            this.recordingTimeout = setTimeout(() => {
                if (this.isRecording) {
                    this.showToast('录音超时，自动停止');
                    this.stopRecording();
                }
            }, 60 * 1000);

        } catch (error) {
            this.showSystemMessage(`启动录音失败: ${error.message}`);
            console.error('启动录音失败:', error);
            this.resetRecordingState();
            this.hasRequestedMicPermission = false;
        }
    }

    /**
     * Stop recording and transcribe audio
     * @returns {Promise<void>}
     */
    async stopRecording() {
        if (!this.isRecording) return;

        clearTimeout(this.recordingTimeout);
        this.showToast('正在处理语音...');
        
        try {
            if (this.audioRecorder) {
                this.audioRecorder.stop();
                this.audioRecorder = null;
            }

            if (this.audioChunks.length === 0) {
                this.showSystemMessage('没有录到音频，请重试');
                this.resetRecordingState();
                return;
            }

            // Merge all audio chunks
            const totalLength = this.audioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
            const mergedAudioData = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of this.audioChunks) {
                mergedAudioData.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }
            this.audioChunks = [];

            // Convert to WAV format
            const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.INPUT_SAMPLE_RATE);

            // Send to transcription API
            const response = await fetch('/api/transcribe-audio', {
                method: 'POST',
                headers: { 'Content-Type': audioBlob.type },
                body: audioBlob,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`转文字失败: ${errorData.error || response.statusText}`);
            }

            const result = await response.json();
            const transcriptionText = result.text;

            if (transcriptionText) {
                // 简单的内容追加，与 main.js 保持一致
                this.elements.translationInputTextarea.value += transcriptionText;
                this.showToast('语音转文字成功');
            } else {
                this.showSystemMessage('未获取到转录文本。');
            }

        } catch (error) {
            this.showSystemMessage(`语音转文字失败: ${error.message}`);
            console.error('语音转文字失败:', error);
        } finally {
            this.resetRecordingState();
        }
    }

    /**
     * Cancel ongoing recording
     */
    cancelRecording() {
        if (!this.isRecording) return;

        clearTimeout(this.recordingTimeout);
        this.showToast('录音已取消');
        
        if (this.audioRecorder) {
            this.audioRecorder.stop();
            this.audioRecorder = null;
        }
        this.audioChunks = [];
        this.resetRecordingState();
    }

    /**
     * Reset recording state
     */
    resetRecordingState() {
        this.isRecording = false;
        // 使用 recording-active 类名与 CSS 匹配
        this.elements.translationVoiceInputButton.classList.remove('recording-active');
        this.elements.translationInputTextarea.placeholder = '输入要翻译的内容...';
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (this.isRecording) {
            this.cancelRecording();
        }
        
        const voiceButton = this.elements.translationVoiceInputButton;
        if (voiceButton) {
            // 使用 recording-active 类名与 CSS 匹配
            voiceButton.classList.remove('recording-active');
        }
    }
}