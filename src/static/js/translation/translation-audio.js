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
 * @returns {Promise<void>}
 */
export async function startTranslationRecording(elements, showToast, Logger) {
    if (_isTranslationRecording) return;

    // First click: request permission only
    if (!hasRequestedTranslationMicPermission) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            hasRequestedTranslationMicPermission = true;
            showToast('已获取麦克风权限，请再次长按开始录音。');
            return;
        } catch (error) {
            showToast(`获取麦克风权限失败: ${error.message}`);
            Logger.error('获取麦克风权限失败:', error);
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
        translationAudioRecorder = new AudioRecorder();

        await translationAudioRecorder.start((chunk) => {
            translationAudioChunks.push(chunk);
        }, { returnRaw: true });

        _isTranslationRecording = true;

        translationRecordingTimeout = setTimeout(() => {
            if (_isTranslationRecording) {
                showToast('录音超时，自动停止');
                stopTranslationRecording(elements, showToast);
            }
        }, 60000); // 60 seconds timeout

    } catch (error) {
        showToast(`启动录音失败: ${error.message}`);
        Logger.error('启动录音失败:', error);
        resetTranslationRecordingState(elements);
        hasRequestedTranslationMicPermission = false;
    }
}

/**
 * Stops voice recording and processes the audio
 * @param {object} elements - DOM elements for UI feedback
 * @param {function} showToast - Toast notification function
 * @returns {Promise<void>}
 */
export async function stopTranslationRecording(elements, showToast, Logger) {
    if (!_isTranslationRecording) return;

    clearTimeout(translationRecordingTimeout);
    showToast('停止录音，正在处理...');
    elements.inputTextarea.placeholder = '正在处理语音...';

    try {
        if (translationAudioRecorder) {
            translationAudioRecorder.stop();
            translationAudioRecorder = null;
        }

        if (translationAudioChunks.length === 0) {
            showToast('没有录到音频');
            resetTranslationRecordingState(elements);
            return;
        }

        // Merge audio chunks (aligned with main.js implementation)
        const totalLength = translationAudioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const mergedAudioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of translationAudioChunks) {
            mergedAudioData.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        translationAudioChunks = [];

        // Convert to WAV blob (aligned with main.js implementation)
        const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.INPUT_SAMPLE_RATE);

        // Send request using fetch (aligned with main.js implementation)
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
        const transcriptionText = result.text || '未获取到转录文本。';
        
        elements.inputTextarea.value = transcriptionText;
        showToast('语音转文字成功');

    } catch (error) {
        showToast(`语音转文字失败: ${error.message}`);
        Logger.error('语音转文字失败:', error);
        elements.inputTextarea.placeholder = '语音转文字失败，请重试。';
    } finally {
        resetTranslationRecordingState(elements);
    }
}

/**
 * Cancels the current recording
 * @param {object} elements - DOM elements for UI feedback
 * @param {function} showToast - Toast notification function
 */
export function cancelTranslationRecording(elements, showToast, Logger) {
    if (!_isTranslationRecording) return;

    clearTimeout(translationRecordingTimeout);
    showToast('录音已取消');

    if (translationAudioRecorder) {
        translationAudioRecorder.stop();
        translationAudioRecorder = null;
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

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (const pcmBuffer of pcmDataBuffers) {
        for (let i = 0; i < pcmBuffer.length; i++) {
            view.setUint8(offset + i, pcmBuffer[i]);
        }
        offset += pcmBuffer.length;
    }

    return new Blob([view], { type: 'audio/wav' });
}