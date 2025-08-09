import { AudioRecorder } from '../audio/audio-recorder.js';
import { logMessage, pcmToWavBlob } from '../chat/chat-ui.js';
import { CONFIG } from '../config/config.js';

// State variables specific to translation audio recording
let isTranslationRecording = false;
let hasRequestedTranslationMicPermission = false;
let translationAudioRecorder = null;
let translationAudioChunks = [];
let recordingTimeout = null;
export const initialTouchY = 0; // Export for use in main.js event listeners

/**
 * @function startTranslationRecording
 * @description Starts the voice recording for translation. Handles microphone permission requests.
 * @param {HTMLButtonElement} translationVoiceInputButton - The button for voice input.
 * @param {HTMLTextAreaElement} translationInputTextarea - The textarea for the input text.
 * @async
 * @returns {Promise<void>}
 */
export async function startTranslationRecording(translationVoiceInputButton, translationInputTextarea) {
  if (isTranslationRecording) return;

  if (!hasRequestedTranslationMicPermission) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      hasRequestedTranslationMicPermission = true;
      logMessage('已请求并获取麦克风权限。请再次点击开始录音。', 'system');
      translationVoiceInputButton.textContent = '点击开始录音';
      return;
    } catch (error) {
      logMessage(`获取麦克风权限失败: ${error.message}`, 'system');
      console.error('获取麦克风权限失败:', error);
      alert('无法访问麦克风。请确保已授予麦克风权限。');
      resetTranslationRecordingState(translationVoiceInputButton);
      hasRequestedTranslationMicPermission = false;
      return;
    }
  }

  try {
    logMessage('开始录音...', 'system');
    translationVoiceInputButton.classList.add('recording-active');
    translationInputTextarea.placeholder = '正在录音，请说话...';
    translationInputTextarea.value = '';

    translationAudioChunks = [];
    translationAudioRecorder = new AudioRecorder();

    await translationAudioRecorder.start((chunk) => {
      translationAudioChunks.push(chunk);
    }, { returnRaw: true });

    isTranslationRecording = true;
    translationVoiceInputButton.textContent = '录音中...';

    recordingTimeout = setTimeout(() => {
      if (isTranslationRecording) {
        logMessage('录音超时，自动停止并发送', 'system');
        stopTranslationRecording(translationVoiceInputButton, translationInputTextarea);
      }
    }, 60 * 1000); // 60 seconds max recording

  } catch (error) {
    logMessage(`启动录音失败: ${error.message}`, 'system');
    console.error('启动录音失败:', error);
    alert('无法访问麦克风。请确保已授予麦克风权限。');
    resetTranslationRecordingState(translationVoiceInputButton);
    hasRequestedTranslationMicPermission = false;
  }
}

/**
 * @function stopTranslationRecording
 * @description Stops the voice recording for translation and sends the audio for transcription.
 * @param {HTMLButtonElement} translationVoiceInputButton - The button for voice input.
 * @param {HTMLTextAreaElement} translationInputTextarea - The textarea for the input text.
 * @async
 * @returns {Promise<void>}
 */
export async function stopTranslationRecording(translationVoiceInputButton, translationInputTextarea) {
  if (!isTranslationRecording) return;

  clearTimeout(recordingTimeout);
  logMessage('停止录音，正在转文字...', 'system');
  translationVoiceInputButton.classList.remove('recording-active');
  translationInputTextarea.placeholder = '正在处理语音...';

  try {
    if (translationAudioRecorder) {
      translationAudioRecorder.stop();
      translationAudioRecorder = null;
    }

    if (translationAudioChunks.length === 0) {
      logMessage('没有录到音频，请重试', 'system');
      resetTranslationRecordingState(translationVoiceInputButton);
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
      headers: {
        'Content-Type': audioBlob.type,
      },
      body: audioBlob,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`转文字失败: ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    const transcriptionText = result.text || '未获取到转录文本。';

    translationInputTextarea.value = transcriptionText;
    logMessage('语音转文字成功', 'system');

  } catch (error) {
    logMessage(`语音转文字失败: ${error.message}`, 'system');
    console.error('语音转文字失败:', error);
    translationInputTextarea.placeholder = '语音转文字失败，请重试。';
  } finally {
    resetTranslationRecordingState(translationVoiceInputButton);
    hasRequestedTranslationMicPermission = false;
  }
}

/**
 * @function cancelTranslationRecording
 * @description Cancels the ongoing voice recording for translation.
 * @param {HTMLButtonElement} translationVoiceInputButton - The button for voice input.
 * @param {HTMLTextAreaElement} translationInputTextarea - The textarea for the input text.
 * @returns {void}
 */
export function cancelTranslationRecording(translationVoiceInputButton, translationInputTextarea) {
  if (!isTranslationRecording) return;

  clearTimeout(recordingTimeout);
  logMessage('录音已取消', 'system');
  
  if (translationAudioRecorder) {
    translationAudioRecorder.stop();
    translationAudioRecorder = null;
  }
  translationAudioChunks = [];
  resetTranslationRecordingState(translationVoiceInputButton);
  translationInputTextarea.placeholder = '输入要翻译的内容...';
  hasRequestedTranslationMicPermission = false;
}

/**
 * @function resetTranslationRecordingState
 * @description Resets the state related to translation voice recording.
 * @param {HTMLButtonElement} translationVoiceInputButton - The button for voice input.
 * @returns {void}
 */
function resetTranslationRecordingState(translationVoiceInputButton) {
  isTranslationRecording = false;
  translationVoiceInputButton.classList.remove('recording-active');
  translationVoiceInputButton.textContent = '语音输入';
}

/**
 * @function isRecording
 * @description Returns the current recording state.
 * @returns {boolean} True if recording, false otherwise.
 */
export function isRecording() {
    return isTranslationRecording;
}