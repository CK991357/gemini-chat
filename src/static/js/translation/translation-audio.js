import { AudioRecorder } from '../audio/audio-recorder.js';
import { CONFIG } from '../config/config.js';
import { showSystemMessage, showToast } from '../utils/ui-helpers.js'; // New import for UI helpers
import { pcmToWavBlob } from '../utils/utils.js';

/**
 * @fileoverview Manages audio recording for the translation feature.
 */

let translationAudioRecorder = null;
let translationAudioChunks = [];
let recordingTimeout = null;
let _isTranslationRecording = false;
let hasRequestedMicPermission = false;

/**
 * Checks if translation recording is currently active.
 * @returns {boolean} True if recording is active, false otherwise.
 */
export function isTranslationRecording() {
    return _isTranslationRecording;
}

/**
 * Starts the audio recording for translation.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 * @returns {Promise<void>}
 */
export async function startTranslationRecording(elements) {
    if (_isTranslationRecording) return;

    if (!hasRequestedMicPermission) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            hasRequestedMicPermission = true;
            showSystemMessage('已获取麦克风权限，请再次长按开始录音。'); // Use showSystemMessage
            return;
        } catch (error) {
            showSystemMessage(`获取麦克风权限失败: ${error.message}`); // Use showSystemMessage
            console.error('获取麦克风权限失败:', error);
            resetRecordingState(elements);
            hasRequestedMicPermission = false;
            return;
        }
    }

    try {
        logMessage('开始录音...', 'system');
        elements.voiceInputButton.classList.add('recording-active');
        elements.inputTextarea.placeholder = '正在录音，请说话...';
        elements.inputTextarea.value = '';

        translationAudioChunks = [];
        translationAudioRecorder = new AudioRecorder();

        await translationAudioRecorder.start((chunk) => {
            translationAudioChunks.push(chunk);
        }, { returnRaw: true });

        _isTranslationRecording = true;

        recordingTimeout = setTimeout(() => {
            if (_isTranslationRecording) {
                logMessage('录音超时，自动停止', 'system');
                stopTranslationRecording(elements);
            }
        }, 60000); // 60 seconds timeout

    } catch (error) {
        showSystemMessage(`启动录音失败: ${error.message}`); // Use showSystemMessage
        console.error('启动录音失败:', error);
        resetRecordingState(elements);
        hasRequestedMicPermission = false;
    }
}

/**
 * Stops the audio recording and processes the audio data.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 * @returns {Promise<void>}
 */
export async function stopTranslationRecording(elements) {
    if (!_isTranslationRecording) return;

    clearTimeout(recordingTimeout);
    logMessage('停止录音，正在处理...', 'system');
    elements.inputTextarea.placeholder = '正在处理语音...';

    try {
        if (translationAudioRecorder) {
            translationAudioRecorder.stop();
            translationAudioRecorder = null;
        }

        if (translationAudioChunks.length === 0) {
            logMessage('没有录到音频', 'system');
            resetRecordingState(elements);
            return;
        }

        const totalLength = translationAudioChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const mergedAudioData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of translationAudioChunks) {
            mergedAudioData.set(new Uint8Array(chunk), offset);
            offset += chunk.byteLength;
        }
        translationAudioChunks = [];

        const audioBlob = pcmToWavBlob([mergedAudioData], CONFIG.AUDIO.INPUT_SAMPLE_RATE);

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
        elements.inputTextarea.value = result.text || '未获取到转录文本。';
        showToast('语音转文字成功'); // Use showToast

    } catch (error) {
        showSystemMessage(`语音转文字失败: ${error.message}`); // Use showSystemMessage
        console.error('语音转文字失败:', error);
        elements.inputTextarea.placeholder = '语音转文字失败，请重试。';
    } finally {
        resetRecordingState(elements);
    }
}

/**
 * Cancels the current audio recording.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 */
export function cancelTranslationRecording(elements) {
    if (!_isTranslationRecording) return;

    clearTimeout(recordingTimeout);
    logMessage('录音已取消', 'system');

    if (translationAudioRecorder) {
        translationAudioRecorder.stop();
        translationAudioRecorder = null;
    }
    translationAudioChunks = [];
    resetRecordingState(elements);
    elements.inputTextarea.placeholder = '输入要翻译的内容...';
}

/**
 * Resets the recording state and UI elements.
 * @param {object} elements - DOM elements to reset.
 */
function resetRecordingState(elements) {
    _isTranslationRecording = false;
    elements.voiceInputButton.classList.remove('recording-active');
}
