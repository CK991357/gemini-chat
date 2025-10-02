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
let _isProcessing = false;
let _recordingStartTime = 0; // 新增：记录录音开始时间

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

    // 首先停止任何可能存在的录音
    if (translationAudioRecorder) {
        try {
            translationAudioRecorder.stop();
        } catch (e) {
            // 忽略停止错误
        }
        translationAudioRecorder = null;
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

        // 重置数据 - 确保完全清空
        translationAudioChunks = [];
        translationAudioRecorder = new AudioRecorder(CONFIG.AUDIO.INPUT_SAMPLE_RATE);
        _recordingStartTime = Date.now();

        Logger?.info('Starting audio recording for translation');
        
        // 使用防抖的回调函数，防止重复调用
        let lastChunkTime = 0;
        const debouncedCallback = (chunk) => {
            const now = Date.now();
            // 防止在1毫秒内重复调用
            if (now - lastChunkTime < 1) {
                return;
            }
            lastChunkTime = now;
            
            if (chunk && chunk.byteLength > 0) {
                translationAudioChunks.push(chunk);
                Logger?.debug('Received audio chunk, size:', chunk.byteLength, 'Total chunks:', translationAudioChunks.length);
            }
        };

        await translationAudioRecorder.start(debouncedCallback, { returnRaw: true });

        _isTranslationRecording = true;
        Logger?.info('Translation recording started successfully');

        // 设置与主聊天模式相同的超时时间 (10秒)
        translationRecordingTimeout = setTimeout(() => {
            if (_isTranslationRecording) {
                Logger?.info('Recording timeout reached, stopping automatically');
                showToast('录音超时，自动停止');
                stopTranslationRecording(elements, showToast, Logger);
            }
        }, 10000); // 10 seconds timeout - 与主聊天模式完全一致

    } catch (error) {
        const errorMsg = `启动录音失败: ${error.message}`;
        showToast(errorMsg);
        Logger?.error('Failed to start translation recording:', error);
        resetTranslationRecordingState(elements);
        hasRequestedTranslationMicPermission = false;
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
    // 防止重复调用
    if (!_isTranslationRecording || _isProcessing) {
        Logger?.warn('Stop called but not recording or already processing. isRecording:', _isTranslationRecording, 'isProcessing:', _isProcessing);
        return;
    }

    _isProcessing = true;
    clearTimeout(translationRecordingTimeout);
    
    try {
        const recordingDuration = Date.now() - _recordingStartTime;
        Logger?.info('Stopping translation recording, duration:', recordingDuration + 'ms');
        
        showToast('停止录音，正在处理...');
        elements.inputTextarea.placeholder = '正在处理语音...';

        // 立即停止录音器
        if (translationAudioRecorder) {
            translationAudioRecorder.stop();
            translationAudioRecorder = null;
            Logger?.info('Audio recorder stopped');
        }

        // 检查录音时长，如果太短可能是误触
        if (recordingDuration < 300) {
            showToast('录音时间过短');
            Logger?.warn('Recording too short:', recordingDuration + 'ms');
            return;
        }

        // Check if we have any audio data
        if (translationAudioChunks.length === 0) {
            showToast('没有录到音频');
            Logger?.warn('No audio chunks recorded');
            return;
        }

        // Add detailed logging
        Logger?.info('Processing audio data for translation, chunk count:', translationAudioChunks.length);
        
        // Calculate total length and merge data
        const totalLength = translationAudioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        Logger?.info('Total audio data length:', totalLength, 'bytes');
        
        if (totalLength === 0) {
            showToast('音频数据为空');
            Logger?.error('Total audio data length is 0');
            return;
        }

        // 数据量检查 - 3秒录音应该在30-50KB左右
        if (totalLength > 100000) { // 100KB 限制
            Logger?.warn('Audio data unusually large, expected ~50KB for 3s, got:', totalLength + 'bytes');
            // 但仍然继续处理，不截断
        }

        const mergedAudioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of translationAudioChunks) {
            const chunkArray = new Uint8Array(chunk);
            mergedAudioData.set(chunkArray, offset);
            offset += chunkArray.length;
        }
        
        // 立即清空数据，防止重复处理
        const audioChunksToProcess = [...translationAudioChunks];
        translationAudioChunks = [];
        
        Logger?.info('Audio data merged successfully, final size:', mergedAudioData.length);

        // Convert to WAV blob
        const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.INPUT_SAMPLE_RATE);
        Logger?.info('WAV blob created, size:', audioBlob.size, 'type:', audioBlob.type);

        // 添加超时控制和错误处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            Logger?.warn('Translation transcription request timed out');
        }, 10000); // 10秒超时

        try {
            Logger?.info('Sending transcription request for translation');
            const response = await fetch('/api/transcribe-audio', {
                method: 'POST',
                headers: { 
                    'Content-Type': audioBlob.type,
                    'X-Request-Source': 'translation'
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
        // 确保状态被重置
        resetTranslationRecordingState(elements);
        _isProcessing = false;
        // 确保数据被清空
        translationAudioChunks = [];
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
    // 彻底清空数据
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
    _recordingStartTime = 0;
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