import { showToast } from '../main.js';
import { Logger } from '../utils/logger.js';

/**
 * @fileoverview Handles OCR (Optical Character Recognition) for the translation feature.
 */

/**
 * Toggles the visibility of the OCR button based on the selected translation model.
 * @param {HTMLSelectElement} modelSelect - The model selection dropdown element.
 * @param {HTMLButtonElement} ocrButton - The OCR button element.
 */
export function toggleOcrButtonVisibility() {
    const modelSelect = document.getElementById('translation-model-select');
    const ocrButton = document.getElementById('translation-ocr-button');
    if (!modelSelect || !ocrButton) {
        Logger.warn('OCR 按钮或模型选择元素未找到。');
        return;
    }

    const selectedModel = modelSelect.value;
    // Show OCR button only for Gemini models which support image input
    if (selectedModel.startsWith('gemini-')) {
        ocrButton.style.display = 'inline-flex';
    } else {
        ocrButton.style.display = 'none';
    }
}

/**
 * Handles the OCR process when a user uploads an image.
 * @param {Event} event - The file input change event.
 * @param {HTMLTextAreaElement} inputTextarea - The textarea for the recognized text.
 * @param {HTMLElement} outputElement - The element to display translation output.
 * @param {HTMLButtonElement} ocrButton - The OCR button element.
 * @param {HTMLSelectElement} modelSelect - The model selection dropdown element.
 * @returns {Promise<void>}
 */
export async function handleTranslationOcr(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件。');
        return;
    }

    const inputTextarea = document.getElementById('translation-input-text');
    const outputElement = document.getElementById('translation-output-text');
    const ocrButton = document.getElementById('translation-ocr-button');
    const modelSelect = document.getElementById('translation-model-select');

    if (!inputTextarea || !outputElement || !ocrButton || !modelSelect) {
        Logger.error('OCR 相关 DOM 元素未找到。');
        showToast('OCR 功能初始化失败，请刷新页面。');
        return;
    }

    inputTextarea.value = '';
    inputTextarea.placeholder = '正在识别图片中的文字...';
    outputElement.textContent = '';
    ocrButton.disabled = true;

    try {
        const base64String = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });

        const model = modelSelect.value;

        const requestBody = {
            model: model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: '请对图片进行OCR识别。提取所有文本，并严格保持其原始的布局和格式，包括表格、列、缩进和换行。请使用Markdown格式化输出，尤其是表格。' },
                        {
                            type: 'image_url',
                            image_url: { url: base64String }
                        }
                    ]
                }
            ],
            stream: false
        };

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`图片文字识别失败: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const extractedText = data.choices[0].message.content;

        if (extractedText) {
            inputTextarea.value = extractedText;
            showToast('文字识别成功！');
        } else {
            showToast('图片中未识别到文字。');
        }

    } catch (error) {
        Logger.info(`OCR 失败: ${error.message}`, 'system');
        showToast('图片文字识别失败，请重试。');
        console.error('OCR Error:', error);
    } finally {
        inputTextarea.placeholder = '输入要翻译的内容...';
        ocrButton.disabled = false;
        event.target.value = ''; // Reset file input
    }
}
