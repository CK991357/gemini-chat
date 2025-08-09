import { logMessage, showToast } from '../chat/chat-ui.js';

/**
 * @function toggleOcrButtonVisibility
 * @description Toggles the visibility of the OCR button based on the selected translation model.
 *              The button is only shown for Gemini models.
 * @param {HTMLSelectElement} translationModelSelect - The select element for the translation model.
 * @param {HTMLButtonElement} translationOcrButton - The OCR button.
 * @returns {void}
 */
export function toggleOcrButtonVisibility(translationModelSelect, translationOcrButton) {
    const selectedModel = translationModelSelect.value;
    if (selectedModel.startsWith('gemini-')) {
        translationOcrButton.style.display = 'inline-flex';
    } else {
        translationOcrButton.style.display = 'none';
    }
}

/**
 * @function handleTranslationOcr
 * @description Handles the OCR process for an uploaded image in translation mode.
 *              It reads the image, sends it to the backend for text extraction,
 *              and populates the translation input area with the result.
 * @async
 * @param {Event} event - The file input change event.
 * @param {HTMLElement} translationOutputText - The element to display the translated text.
 * @param {HTMLTextAreaElement} translationInputTextarea - The textarea for the input text.
 * @param {HTMLButtonElement} translationOcrButton - The OCR button.
 * @param {HTMLSelectElement} translationModelSelect - The select element for the translation model.
 * @returns {Promise<void>}
 */
export async function handleTranslationOcr(event, translationOutputText, translationInputTextarea, translationOcrButton, translationModelSelect) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('请上传图片文件。');
        return;
    }

    const outputElement = translationOutputText;
    const inputTextarea = translationInputTextarea;
    
    inputTextarea.value = '';
    inputTextarea.placeholder = '正在识别图片中的文字...';
    outputElement.textContent = '';
    translationOcrButton.disabled = true;

    try {
        const base64String = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });

        const model = translationModelSelect.value;

        const requestBody = {
            model: model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: '请对图片进行OCR识别。提取所有文本，并严格保持其原始的布局和格式，包括表格、列、缩进和换行。请使用Markdown格式化输出，尤其是表格。' },
                        {
                            type: 'image_url',
                            image_url: {
                                url: base64String
                            }
                        }
                    ]
                }
            ],
            stream: false
        };

        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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
        logMessage(`OCR 失败: ${error.message}`, 'system');
        showToast('图片文字识别失败，请重试。');
        console.error('OCR Error:', error);
    } finally {
        inputTextarea.placeholder = '输入要翻译的内容...';
        translationOcrButton.disabled = false;
        event.target.value = '';
    }
}