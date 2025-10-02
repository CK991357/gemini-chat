import { CONFIG } from '../config/config.js';
import { ApiHandler } from '../core/api-handler.js';
import { Logger } from '../utils/logger.js';
import { handleTranslationOcr, toggleOcrButtonVisibility } from './translation-ocr.js';
// 导入新的语音输入模块
import {
    cancelTranslationRecording,
    isTranslationRecording,
    startTranslationRecording,
    stopTranslationRecording
} from './translation-audio.js';

/**
 * @fileoverview Core logic for the translation feature.
 * Handles UI initialization, API calls, and mode switching.
 */

// Store references to DOM elements to avoid repeated lookups
let elements = {};
let initialTouchY = 0; // For swipe-to-cancel gesture
const apiHandler = new ApiHandler(); // 创建 ApiHandler 实例

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
            showToast('翻译结果已复制');
        }).catch(err => {
            showToast('复制失败: ' + err);
        });
    });

    // Mode switching events
    elements.translationModeBtn.addEventListener('click', () => switchMode('translation', handlers));
    elements.chatModeBtn.addEventListener('click', () => switchMode('chat', handlers));
    elements.visionModeBtn?.addEventListener('click', () => switchMode('vision', handlers));
    elements.toggleLogBtn.addEventListener('click', () => switchMode('log', handlers));

    // Voice input events (mousedown, mouseup, mouseleave, touchstart, touchend, touchmove)
    attachVoiceInputListeners(showToast);
}

/**
 * Attaches event listeners for the voice input button.
 * @function attachVoiceInputListeners
 * @description Binds mouse and touch events to the voice input button for starting, stopping, and canceling recordings.
 * @returns {void}
 */
function attachVoiceInputListeners(showToast) {
    const button = elements.translationVoiceInputButton;
    if (!button) return;

    const audioElements = {
        voiceInputButton: button,
        inputTextarea: elements.translationInputTextarea
    };

    // Mouse events
    button.addEventListener('mousedown', () => startTranslationRecording(audioElements, showToast, Logger));
    button.addEventListener('mouseup', () => stopTranslationRecording(audioElements, showToast, Logger));
    button.addEventListener('mouseleave', () => {
        if (isTranslationRecording()) {
            cancelTranslationRecording(audioElements, showToast, Logger);
        }
    });

    // Touch events
    button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initialTouchY = e.touches[0].clientY;
        startTranslationRecording(audioElements, showToast, Logger);
    });
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopTranslationRecording(audioElements, showToast, Logger);
    });
    button.addEventListener('touchmove', (e) => {
        if (isTranslationRecording()) {
            const currentTouchY = e.touches[0].clientY;
            if (initialTouchY - currentTouchY > 50) { // 50px threshold for swipe up to cancel
                cancelTranslationRecording(audioElements, showToast, Logger);
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
        showToast('请输入要翻译的内容');
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
        showToast('翻译完成');
    } catch (error) {
        showToast(`翻译失败: ${error.message}`);
        elements.outputText.textContent = '翻译失败，请重试';
        Logger.error('翻译错误:', error);
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