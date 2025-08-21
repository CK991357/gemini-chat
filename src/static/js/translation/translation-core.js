import { ApiHandler } from '../api/api-handler.js'; // 引入 ApiHandler
import { CONFIG } from '../config/config.js';
import { Logger } from '../utils/logger.js';
import { handleTranslationOcr, toggleOcrButtonVisibility } from './translation-ocr.js';

/**
 * @fileoverview Core logic for the translation feature.
 * Handles UI initialization, API calls, and mode switching.
 */

// Store references to DOM elements to avoid repeated lookups
let elements = {};
let initialTouchY = 0; // For swipe-to-cancel gesture
const apiHandler = new ApiHandler(); // 创建 ApiHandler 实例

// --- 从 main.js 迁移过来的翻译语音输入相关状态变量 ---
let translationAudioRecorder = null;
let translationAudioChunks = [];
let recordingTimeout = null;
let _isTranslationRecording = false;
let hasRequestedMicPermission = false;

/**
 * Initializes the translation feature.
 * @param {object} el - A collection of DOM elements required by the translation module.
 * @param {object} handlers - A collection of handler functions from other modules.
 * @param {function} showToast - Function to display toast messages.
 */
export function initializeTranslationCore(el, handlers, showToast) {
    elements = el;

    // Populate language dropdowns from config
    populateLanguageSelects();
    // Populate model dropdown from config
    populateModelSelect();

    // Attach event listeners
    attachEventListeners(handlers, showToast);

    // Set initial state for the OCR button
    toggleOcrButtonVisibility();
}

/**
 * Populates the language selection dropdowns.
 * @function populateLanguageSelects
 * @description Fills the input and output language dropdown menus based on the languages defined in the configuration.
 * @returns {void}
 */
function populateLanguageSelects() {
    const languages = CONFIG.TRANSLATION.LANGUAGES;
    languages.forEach(lang => {
        const inputOption = document.createElement('option');
        inputOption.value = lang.code;
        inputOption.textContent = lang.name;
        elements.inputLangSelect.appendChild(inputOption);

        if (lang.code !== 'auto') {
            const outputOption = document.createElement('option');
            outputOption.value = lang.code;
            outputOption.textContent = lang.name;
            elements.outputLangSelect.appendChild(outputOption);
        }
    });

    elements.inputLangSelect.value = CONFIG.TRANSLATION.DEFAULT_INPUT_LANG;
    elements.outputLangSelect.value = CONFIG.TRANSLATION.DEFAULT_OUTPUT_LANG;
}

/**
 * Populates the translation model selection dropdown.
 * @function populateModelSelect
 * @description Fills the model selection dropdown based on the models defined in the configuration.
 * @returns {void}
 */
function populateModelSelect() {
    elements.translationModelSelect.innerHTML = ''; // Clear existing options
    CONFIG.TRANSLATION.MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName;
        if (model.name === CONFIG.TRANSLATION.DEFAULT_MODEL) {
            option.selected = true;
        }
        elements.translationModelSelect.appendChild(option);
    });
}

/**
 * Attaches all necessary event listeners for the translation UI.
 * @function attachEventListeners
 * @description Binds event listeners to buttons and selects for translation, OCR, copying, and mode switching.
 * @param {object} handlers - A collection of handler functions from other modules (e.g., videoHandler, screenHandler).
 * @returns {void}
 */
function attachEventListeners(handlers, showToast) {
    elements.translateButton.addEventListener('click', handleTranslation);
    elements.translationOcrButton.addEventListener('click', () => elements.translationOcrInput.click());
    elements.translationOcrInput.addEventListener('change', handleTranslationOcr);
    elements.translationModelSelect.addEventListener('change', toggleOcrButtonVisibility);

    elements.copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(elements.outputText.textContent).then(() => {
            Logger.info('翻译结果已复制', 'system');
        }).catch(err => {
            Logger.info('复制失败: ' + err, 'system');
        });
    });

    // Mode switching events
    elements.translationModeBtn.addEventListener('click', () => switchMode('translation', handlers));
    elements.chatModeBtn.addEventListener('click', () => switchMode('chat', handlers));
    elements.visionModeBtn?.addEventListener('click', () => switchMode('vision', handlers));
    elements.toggleLogBtn.addEventListener('click', () => switchMode('log', handlers));

    // Voice input events (mousedown, mouseup, mouseleave, touchstart, touchend, touchmove)
    attachVoiceInputListeners();
}

/**
 * Attaches event listeners for the voice input button.
 * @function attachVoiceInputListeners
 * @description Binds mouse and touch events to the voice input button for starting, stopping, and canceling recordings.
 * @returns {void}
 */
function attachVoiceInputListeners() {
    const button = elements.translationVoiceInputButton;
    if (!button) return;

    const audioElements = {
        voiceInputButton: button,
        inputTextarea: elements.translationInputTextarea
    };

    // Mouse events
    button.addEventListener('mousedown', () => startTranslationRecording(audioElements));
    button.addEventListener('mouseup', () => stopTranslationRecording(audioElements, showToast));
    button.addEventListener('mouseleave', () => {
        if (isTranslationRecording()) {
            cancelTranslationRecording(audioElements, showToast);
        }
    });

    // Touch events
    button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initialTouchY = e.touches[0].clientY;
        startTranslationRecording(audioElements, showToast);
    });
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopTranslationRecording(audioElements, showToast);
    });
    button.addEventListener('touchmove', (e) => {
        if (isTranslationRecording()) {
            const currentTouchY = e.touches[0].clientY;
            if (initialTouchY - currentTouchY > 50) { // 50px threshold for swipe up to cancel
                cancelTranslationRecording(audioElements, showToast);
            }
        }
    });
}

/**
 * Handles the main translation request.
 * @function handleTranslation
 * @description Gathers input text, selected languages, and the chosen model, then sends a request to the translation API and displays the result.
 * @returns {Promise<void>}
 */
async function handleTranslation() {
    const inputText = elements.translationInputTextarea.value.trim();
    if (!inputText) {
        Logger.info('请输入要翻译的内容', 'system');
        return;
    }

    const inputLang = elements.inputLangSelect.value;
    const outputLang = elements.outputLangSelect.value;
    const model = elements.translationModelSelect.value;

    elements.outputText.textContent = '翻译中...';

    try {
        const prompt = inputLang === 'auto' ?
            `请将以下内容翻译成${getLanguageName(outputLang)}：\n\n${inputText}` :
            `请将以下内容从${getLanguageName(inputLang)}翻译成${getLanguageName(outputLang)}：\n\n${inputText}`;

        const requestBody = {
            model: model,
            messages: [
                { role: 'system', content: CONFIG.TRANSLATION.SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            stream: false
        };

        // 使用 ApiHandler 发送请求
        const data = await apiHandler.fetchJson('/api/translate', requestBody);
        const translatedText = data.choices[0].message.content;

        elements.outputText.textContent = translatedText;
        Logger.info('翻译完成', 'system');
    } catch (error) {
        Logger.info(`翻译失败: ${error.message}`, 'system');
        elements.outputText.textContent = '翻译失败，请重试';
        console.error('翻译错误:', error);
    }
}

/**
 * Gets the display name of a language from its code.
 * @function getLanguageName
 * @description Retrieves the human-readable language name from the configuration based on a given language code.
 * @param {string} code - The language code (e.g., 'en', 'zh').
 * @returns {string} The language name or the code itself if not found.
 */
function getLanguageName(code) {
    const language = CONFIG.TRANSLATION.LANGUAGES.find(lang => lang.code === code);
    return language ? language.name : code;
}

/**
 * Switches the application's UI mode.
 * @function switchMode
 * @description Manages the visibility of different UI containers (chat, translation, vision, log) and controls media streams.
 * @param {string} mode - The target mode ('translation', 'chat', 'vision', 'log').
 * @param {object} handlers - A collection of handler functions from other modules.
 * @returns {void}
 */
function switchMode(mode, handlers) {
    const { videoHandler, screenHandler, updateMediaPreviewsDisplay } = handlers;

    // Deactivate all containers and buttons first
    [elements.translationContainer, elements.chatContainer, elements.visionContainer, elements.logContainer].forEach(c => c?.classList.remove('active'));
    [elements.translationModeBtn, elements.chatModeBtn, elements.visionModeBtn].forEach(b => b?.classList.remove('active'));

    // Hide chat-specific elements by default
    if (elements.mediaPreviewsContainer) elements.mediaPreviewsContainer.style.display = 'none';
    if (elements.inputArea) elements.inputArea.style.display = 'none';
    if (elements.chatVoiceInputButton) elements.chatVoiceInputButton.style.display = 'none';

    // Stop media streams if they are active
    if (videoHandler?.getIsVideoActive()) videoHandler.stopVideo();
    if (screenHandler?.getIsScreenActive()) screenHandler.stopScreenSharing();

    // Activate the target mode
    switch (mode) {
        case 'translation':
            elements.translationContainer.classList.add('active');
            elements.translationModeBtn.classList.add('active');
            if (elements.translationVoiceInputButton) elements.translationVoiceInputButton.style.display = 'inline-flex';
            break;
        case 'chat':
            elements.chatContainer.classList.add('active');
            elements.chatModeBtn.classList.add('active');
            if (elements.inputArea) elements.inputArea.style.display = 'flex';
            if (elements.chatVoiceInputButton) elements.chatVoiceInputButton.style.display = 'inline-flex';
            updateMediaPreviewsDisplay();
            document.querySelector('.tab[data-mode="text"]')?.click();
            break;
        case 'vision':
            elements.visionContainer?.classList.add('active');
            elements.visionModeBtn?.classList.add('active');
            break;
        case 'log':
            elements.logContainer.classList.add('active');
            document.querySelector('.tab[data-mode="log"]')?.click();
            break;
}
}
    
/**
 * Checks if translation recording is currently active.
 * @returns {boolean} True if recording is active, false otherwise.
 */
function isTranslationRecording() {
    return _isTranslationRecording;
}

/**
 * Starts the audio recording for translation.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 * @param {function} showToast - Function to display toast messages.
 * @returns {Promise<void>}
 */
async function startTranslationRecording(elements, showToast) {
    if (_isTranslationRecording) return;

    if (!hasRequestedMicPermission) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            hasRequestedMicPermission = true;
            showToast('已获取麦克风权限，请再次长按开始录音。');
            return;
        } catch (error) {
            showToast(`获取麦克风权限失败: ${error.message}`);
            console.error('获取麦克风权限失败:', error);
            resetRecordingState(elements);
            hasRequestedMicPermission = false;
            return;
        }
    }
 
    try {
        showToast('开始录音...');
        elements.voiceInputButton.classList.add('recording-active');
        elements.inputTextarea.placeholder = '正在录音，请说话...';
        elements.inputTextarea.value = '';

        translationAudioChunks = [];
        // Assuming AudioRecorder is available in this scope, might need to import it
        translationAudioRecorder = new AudioRecorder();

        await translationAudioRecorder.start((chunk) => {
            translationAudioChunks.push(chunk);
        }, { returnRaw: true });

        _isTranslationRecording = true;

        recordingTimeout = setTimeout(() => {
            if (_isTranslationRecording) {
                showToast('录音超时，自动停止');
                stopTranslationRecording(elements, showToast);
            }
        }, 60000); // 60 seconds timeout
 
    } catch (error) {
        showToast(`启动录音失败: ${error.message}`);
        console.error('启动录音失败:', error);
        resetRecordingState(elements);
        hasRequestedMicPermission = false;
    }
}

/**
 * Stops the audio recording and processes the audio data.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 * @param {function} showToast - Function to display toast messages.
 * @returns {Promise<void>}
 */
async function stopTranslationRecording(elements, showToast) {
    if (!_isTranslationRecording) return;

    clearTimeout(recordingTimeout);
    showToast('停止录音，正在处理...');
    elements.inputTextarea.placeholder = '正在处理语音...';
 
    try {
        if (translationAudioRecorder) {
            translationAudioRecorder.stop();
            translationAudioRecorder = null;
        }
 
        if (translationAudioChunks.length === 0) {
            showToast('没有录到音频');
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

        // Assuming apiHandler is available in this scope
        const result = await apiHandler.fetchJson('/api/transcribe-audio', audioBlob, { isBlob: true });
        elements.inputTextarea.value = result.text || '未获取到转录文本。';
        showToast('语音转文字成功');
 
    } catch (error) {
        showToast(`语音转文字失败: ${error.message}`);
        console.error('语音转文字失败:', error);
        elements.inputTextarea.placeholder = '语音转文字失败，请重试。';
    } finally {
        resetRecordingState(elements);
    }
}

/**
 * Cancels the current audio recording.
 * @param {object} elements - DOM elements required for audio recording UI feedback.
 * @param {function} showToast - Function to display toast messages.
 */
function cancelTranslationRecording(elements, showToast) {
    if (!_isTranslationRecording) return;

    clearTimeout(recordingTimeout);
    showToast('录音已取消');
 
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

/**
 * Converts PCM data to a WAV Blob.
 * @param {Uint8Array[]} pcmDataBuffers - An array of Uint8Array containing PCM data.
 * @param {number} sampleRate - The sample rate (e.g., 16000).
 * @returns {Blob} A Blob in WAV format.
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
