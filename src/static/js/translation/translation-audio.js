import { AudioRecorder } from '../audio/audio-recorder.js';
import { CONFIG } from '../config/config.js';

/**
 * @fileoverview Handles voice input functionality for translation feature.
 * Aligned with the implementation in main.js for consistency.
 */

let translationAudioRecorder = null;
let translationAudioChunks = [];
let translationRecordingTimeout = null;
let _isTranslationRecording = false;
let hasRequestedTranslationMicPermission = false;

/**
 * Starts voice recording for translation
 * @param {object} elements - DOM elements for UI feedback
 * @param {function} showToast - Toast notification function
 * @param {object} Logger - Logger instance
 * @returns {Promise<void>}
 */
export async function startTranslationRecording(elements, showToast, Logger) {
    if (_isTranslationRecording) {
        Logger?.info('Recording already in progress, skipping start');
        return;
    }

    // First click: request permission only
    if (!hasRequestedTranslationMicPermission) {
        try {
            Logger?.info('Requesting microphone permission for translation');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: CONFIG.AUDIO.INPUT_SAMPLE_RATE,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            // Immediately stop the stream to release resources, just get permission
            stream.getTracks().forEach(track => {
                track.stop();
                Logger?.debug('Stopped permission track:', track.id);
            });
            
            hasRequestedTranslationMicPermission = true;
            showToast('已获取麦克风权限，请再次长按开始录音');
            Logger?.info('Microphone permission granted for translation');
            return;
        } catch (error) {
            const errorMsg = `获取麦克风权限失败: ${error.message}`;
            showToast(errorMsg);
            Logger?.error('Failed to get microphone permission for translation:', error);
            resetTranslationRecordingState(elements);
            hasRequestedTranslationMicPermission = false;
            return;
        }
    }

    // Permission already granted, start recording
    try {
        showToast('开始录音...');
        elements.voiceInputButton.classList.add('recording-active');
        elements.inputTextarea.placeholder = '正在录音，请说话...';
        elements.inputTextarea.value = '';

        translationAudioChunks = [];
        translationAudioRecorder = new AudioRecorder(CONFIG.AUDIO.INPUT_SAMPLE_RATE);

        Logger?.info('Starting audio recording for translation');
        
        await translationAudioRecorder.start((chunk) => {
            // Add chunk size validation and logging
            if (chunk && chunk.byteLength > 0) {
                translationAudioChunks.push(chunk);
                Logger?.debug('Received audio chunk, size:', chunk.byteLength, 'Total chunks:', translationAudioChunks.length);
            } else {
                Logger?.warn('Received empty or invalid audio chunk');
            }
        }, { returnRaw: true });

        _isTranslationRecording = true;
        Logger?.info('Translation recording started successfully');

        // Set reasonable timeout (30 seconds)
        translationRecordingTimeout = setTimeout(() => {
            if (_isTranslationRecording) {
                Logger?.info('Recording timeout reached, stopping automatically');
                showToast('录音超时，自动停止');
                stopTranslationRecording(elements, showToast, Logger);
            }
        }, 30000); // 30 seconds timeout

    } catch (error) {
        const errorMsg = `启动录音失败: ${error.message}`;
        showToast(errorMsg);
        Logger?.error('Failed to start translation recording:', error);
        resetTranslationRecordingState(elements);
        hasRequestedTranslationMicPermission = false; // Reset permission state on failure
    }
}

/**
 * Stops voice recording and processes the audio
 * @param {object} elements - DOM elements for UI feedback
 * @param {function} showToast - Toast notification function
 * @param {object} Logger - Logger instance
 * @returns {Promise<void>}
 */
export async function stopTranslationRecording(elements, showToast, Logger) {
    if (!_isTranslationRecording) {
        Logger?.warn('Attempted to stop translation recording when not recording');
        return;
    }

    clearTimeout(translationRecordingTimeout);
    showToast('停止录音，正在处理...');
    elements.inputTextarea.placeholder = '正在处理语音...';

    try {
        if (translationAudioRecorder) {
            translationAudioRecorder.stop();
            translationAudioRecorder = null;
            Logger?.info('Audio recorder stopped');
        }

        // Check if we have any audio data
        if (translationAudioChunks.length === 0) {
            showToast('没有录到音频');
            Logger?.warn('No audio chunks recorded');
            resetTranslationRecordingState(elements);
            return;
        }

        // Add detailed logging
        Logger?.info('Processing audio data for translation, chunk count:', translationAudioChunks.length);
        
        // Calculate total length and merge data (aligned with main.js implementation)
        const totalLength = translationAudioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        Logger?.info('Total audio data length:', totalLength, 'bytes');
        
        if (totalLength === 0) {
            showToast('音频数据为空');
            Logger?.error('Total audio data length is 0');
            resetTranslationRecordingState(elements);
            return;
        }

        const mergedAudioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of translationAudioChunks) {
            const chunkArray = new Uint8Array(chunk);
            mergedAudioData.set(chunkArray, offset);
            offset += chunkArray.length;
        }
        translationAudioChunks = [];
        Logger?.info('Audio data merged successfully, final size:', mergedAudioData.length);

        // Convert to WAV blob (aligned with main.js implementation)
        const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.INPUT_SAMPLE_RATE);
        Logger?.info('WAV blob created, size:', audioBlob.size, 'type:', audioBlob.type);

        // Add timeout control and error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            Logger?.warn('Translation transcription request timed out');
        }, 30000); // 30 second timeout

        try {
            Logger?.info('Sending transcription request for translation');
            const response = await fetch('/api/transcribe-audio', {
                method: 'POST',
                headers: { 
                    'Content-Type': audioBlob.type,
                    'X-Request-Source': 'translation' // Add request source identifier
                },
                body: audioBlob,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorMessage = `转文字失败: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMessage = `转文字失败: ${errorData.error || response.statusText}`;
                } catch (e) {
                    // If JSON parsing fails, use text content
                    try {
                        const text = await response.text();
                        errorMessage = `转文字失败: ${text || response.statusText}`;
                    } catch (textError) {
                        errorMessage = `转文字失败: ${response.status} ${response.statusText}`;
                    }
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            const transcriptionText = result.text || '未获取到转录文本。';
            
            elements.inputTextarea.value = transcriptionText;
            showToast('语音转文字成功');
            Logger?.info('Translation transcription successful, text length:', transcriptionText.length);

        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error('请求超时，请重试');
            }
            throw fetchError;
        }

    } catch (error) {
        Logger?.error('Translation transcription failed:', error);
        showToast(`语音转文字失败: ${error.message}`);
        elements.inputTextarea.placeholder = '语音转文字失败，请重试。';
    } finally {
        resetTranslationRecordingState(elements);
    }
}

/**
 * Cancels the current recording
 * @param {object} elements - DOM elements for UI feedback
 * @param {function} showToast - Toast notification function
 * @param {object} Logger - Logger instance
 */
export function cancelTranslationRecording(elements, showToast, Logger) {
    if (!_isTranslationRecording) {
        return;
    }

    clearTimeout(translationRecordingTimeout);
    showToast('录音已取消');
    Logger?.info('Translation recording cancelled by user');

    if (translationAudioRecorder) {
        translationAudioRecorder.stop();
        translationAudioRecorder = null;
        Logger?.info('Audio recorder stopped during cancellation');
    }
    translationAudioChunks = [];
    resetTranslationRecordingState(elements);
    elements.inputTextarea.placeholder = '输入要翻译的内容...';
}

/**
 * Resets the recording state and UI
 * @param {object} elements - DOM elements to reset
 */
function resetTranslationRecordingState(elements) {
    _isTranslationRecording = false;
    elements.voiceInputButton.classList.remove('recording-active');
    elements.inputTextarea.placeholder = '输入要翻译的内容...';
}

/**
 * Checks if translation recording is active
 * @returns {boolean}
 */
export function isTranslationRecording() {
    return _isTranslationRecording;
}

/**
 * Converts PCM data to WAV Blob (aligned with main.js implementation)
 * @param {Uint8Array[]} pcmDataBuffers - PCM data arrays
 * @param {number} sampleRate - Sample rate
 * @returns {Blob} WAV format blob
 */
function pcmToWavBlob(pcmDataBuffers, sampleRate = CONFIG.AUDIO.INPUT_SAMPLE_RATE) {
    let dataLength = 0;
    for (const buffer of pcmDataBuffers) {
        dataLength += buffer.length;
    }

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

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