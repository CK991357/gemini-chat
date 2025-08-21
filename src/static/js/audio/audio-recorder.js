import { CONFIG } from '../config/config.js';
import { ApplicationError, ErrorCodes } from '../utils/error-boundary.js';
import { Logger } from '../utils/logger.js';

/**
 * @class AudioRecorder
 * @description Handles audio recording functionality with configurable sample rate
 * and real-time audio processing through WebAudio API.
 */
export class AudioRecorder {
    /**
     * @constructor
     * @param {number} sampleRate - The sample rate for audio recording (default: 16000)
     */
    constructor(sampleRate = CONFIG.AUDIO.SAMPLE_RATE) {
        this.audioContext = null; // Will be initialized on first start
        this.sampleRate = sampleRate;
        this.stream = null;
        this.source = null;
        this.processor = null;
        this.onAudioData = null;
        
        // Bind methods to preserve context
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
    
        // Add state tracking
        this.isRecording = false;
    }

    /**
     * @method start
     * @description Starts audio recording with the specified callback for audio data.
     * @param {Function} onAudioData - Callback function for processed audio data.
     * @param {Object} [options={}] - Optional configuration for recording.
     * @param {boolean} [options.returnRaw=false] - If true, onAudioData receives raw ArrayBuffer; otherwise, Base64 string.
     * @throws {Error} If unable to access microphone or set up audio processing.
     * @async
     */
    async initialize() {
        if (!this.audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                throw new ApplicationError(
                    'AudioContext is not supported in this browser.',
                    ErrorCodes.AUDIO_NOT_SUPPORTED
                );
            }
            this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * @method start
     * @description Starts audio recording with the specified callback for audio data.
     * @param {Function} onAudioData - Callback function for processed audio data.
     * @param {Object} [options={}] - Optional configuration for recording.
     * @param {boolean} [options.returnRaw=false] - If true, onAudioData receives raw ArrayBuffer; otherwise, Base64 string.
     * @throws {Error} If unable to access microphone or set up audio processing.
     * @async
     */
    async start(onAudioData, options = {}) {
        if (this.isRecording) {
            Logger.warn('Recording is already in progress.');
            return;
        }

        this.onAudioData = onAudioData;
        const { returnRaw = false } = options;

        try {
            await this.initialize(); // Ensure AudioContext is ready

            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: this.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            this.source = this.audioContext.createMediaStreamSource(this.stream);
            
            // Ensure the worklet path is correct
            const workletURL = new URL('./worklets/audio-processing.js', import.meta.url).href;
            
            // Check if the worklet has already been added
            // Note: AudioWorklet does not provide a direct way to check for a registered processor.
            // We'll add it every time, modern browsers handle this gracefully.
            try {
                await this.audioContext.audioWorklet.addModule(workletURL);
            } catch (e) {
                // Ignore errors if the module is already registered.
                if (!e.message.includes('already been registered')) {
                    throw e;
                }
            }

            this.processor = new AudioWorkletNode(this.audioContext, 'audio-recorder-worklet');
            
            this.processor.port.onmessage = (event) => {
                if (event.data.event === 'chunk' && this.onAudioData && this.isRecording) {
                    if (returnRaw) {
                        this.onAudioData(event.data.data.int16arrayBuffer); // 返回原始 ArrayBuffer
                    } else {
                        const base64Data = this.arrayBufferToBase64(event.data.data.int16arrayBuffer);
                        this.onAudioData(base64Data); // 返回 Base64 字符串
                    }
                }
            };

            // Connect audio nodes
            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            this.isRecording = true;
        } catch (error) {
            console.error('Error starting audio recording:', error);
            throw error;
        }
    }

    /**
     * @method stop
     * @description Stops the current recording session and cleans up resources.
     * @param {boolean} shouldSend - Whether to send the recorded audio or cancel it.
     * @throws {ApplicationError} If an error occurs during stopping the recording.
     */
    stop(shouldSend = true) {
        try {
            if (!this.isRecording) {
                Logger.warn('Attempting to stop recording when not recording');
                return;
            }

            // Stop the microphone stream
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            // Disconnect nodes and close AudioContext
            if (this.source) {
                this.source.disconnect();
                this.source = null;
            }
            if (this.processor) {
                this.processor.disconnect();
                this.processor = null;
            }
            // Do not close the audio context, as it is now shared.

            this.isRecording = false;
            
            if (shouldSend) {
                Logger.info('Audio recording stopped and will be sent');
            } else {
                Logger.info('Audio recording canceled');
            }
        } catch (error) {
            Logger.error('Error stopping audio recording', error);
            throw new ApplicationError(
                'Failed to stop audio recording',
                ErrorCodes.AUDIO_STOP_FAILED,
                { originalError: error }
            );
        }
    }

    /**
     * @method arrayBufferToBase64
     * @description Converts ArrayBuffer to Base64 string.
     * @param {ArrayBuffer} buffer - The ArrayBuffer to convert.
     * @returns {string} The Base64 representation of the ArrayBuffer.
     * @throws {ApplicationError} If an error occurs during conversion.
     * @private
     */
    arrayBufferToBase64(buffer) {
        try {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        } catch (error) {
            Logger.error('Error converting buffer to base64', error);
            throw new ApplicationError(
                'Failed to convert audio data',
                ErrorCodes.AUDIO_CONVERSION_FAILED,
                { originalError: error }
            );
        }
    }

    /**
     * @method checkBrowserSupport
     * @description Checks if the browser supports required audio APIs.
     * @throws {ApplicationError} If the browser does not support audio recording.
     * @private
     */
    checkBrowserSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new ApplicationError(
                'Audio recording is not supported in this browser',
                ErrorCodes.AUDIO_NOT_SUPPORTED
            );
        }
    }
} 