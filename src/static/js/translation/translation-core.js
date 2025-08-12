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
let translationAudioFunctions = {}; // 新增：用于存储从 main.js 传入的翻译音频相关函数

/**
 * Initializes the translation feature.
 * @param {object} el - A collection of DOM elements required by the translation module.
 * @param {object} handlers - A collection of handler functions from other modules.
 * @param {object} audioFunctions - A collection of audio recording functions from main.js.
 */
export function initializeTranslationCore(el, handlers, audioFunctions, showToast) {
    elements = el;
    translationAudioFunctions = audioFunctions; // 保存传入的函数

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
    button.addEventListener('mousedown', () => translationAudioFunctions.startTranslationRecording(audioElements));
    button.addEventListener('mouseup', () => translationAudioFunctions.stopTranslationRecording(audioElements));
    button.addEventListener('mouseleave', () => {
        if (translationAudioFunctions.isTranslationRecording()) {
            translationAudioFunctions.cancelTranslationRecording(audioElements);
        }
    });

    // Touch events
    button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        initialTouchY = e.touches[0].clientY;
        translationAudioFunctions.startTranslationRecording(audioElements);
    });
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        translationAudioFunctions.stopTranslationRecording(audioElements);
    });
    button.addEventListener('touchmove', (e) => {
        if (translationAudioFunctions.isTranslationRecording()) {
            const currentTouchY = e.touches[0].clientY;
            if (initialTouchY - currentTouchY > 50) { // 50px threshold for swipe up to cancel
                translationAudioFunctions.cancelTranslationRecording(audioElements);
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

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: CONFIG.TRANSLATION.SYSTEM_PROMPT },
                    { role: 'user', content: prompt }
                ],
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`翻译请求失败: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
        }

        const data = await response.json();
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
    [elements.translationContainer, elements.chatContainer, elements.visionContainer, elements.logContainer].forEach(c => {
        if (c) {
            c.classList.remove('active');
            // Also hide translation container explicitly when switching modes
            if (c === elements.translationContainer) {
                c.style.display = 'none';
            }
        }
    });
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
            elements.translationContainer.style.display = 'flex'; // 确保翻译区可见
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
            // 默认激活视觉模式下的第一个标签页（视觉聊天）
            document.querySelector('.vision-tabs .tab[data-mode="vision-chat"]')?.click();
            break;
        case 'log':
            elements.logContainer.classList.add('active');
            document.querySelector('.tab[data-mode="log"]')?.click();
            break;
    }
}
