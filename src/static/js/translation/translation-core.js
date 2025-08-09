import { logMessage, showToast } from '../chat/chat-ui.js';
import { CONFIG } from '../config/config.js';
import * as DOM from '../ui/dom-elements.js';

/**
 * @const {string} UNIVERSAL_TRANSLATION_SYSTEM_PROMPT
 * @description The system prompt for the translation model, instructing it to be a professional translation assistant.
 */
const UNIVERSAL_TRANSLATION_SYSTEM_PROMPT = `You are a professional translation assistant. Only focus on the translation task and ignore other tasks! Strictly adhere to the following: only output the translated text. Do not include any additional prefixes, explanations, or introductory phrases, such as "Okay, here is the translation:" ,"Sure, I can help you with that!"or "Here is your requested translation:" and so on.

## Translation Requirements

1. !!!Important!Strictly adhere to the following: only output the translated text. Do not include any other words which are no related to the translation,such as polite expressions, additional prefixes, explanations, or introductory phrases.
2. Word Choice: Do not translate word-for-word rigidly. Instead, use idiomatic expressions and common phrases in the target language (e.g., idioms, internet slang).
3. Sentence Structure: Do not aim for sentence-by-sentence translation. Adjust sentence length and word order to better suit the expression habits of the target language.
4. Punctuation Usage: Use punctuation marks accurately (including adding and modifying) according to different expression habits.
5. Format Preservation: Only translate the text content from the original. Content that cannot be translated should remain as is. Do not add extra formatting to the translated content.
`;

/**
 * @function handleTranslation
 * @description Handles the translation request by getting input text, languages, and model,
 *              sending the request to the backend, and displaying the result.
 * @async
 * @returns {Promise<void>} A promise that resolves when the translation is complete or fails.
 */
export async function handleTranslation() {
  const inputText = DOM.translationInputTextarea.value.trim();
  if (!inputText) {
    showToast('请输入要翻译的内容');
    return;
  }

  const inputLang = DOM.translationInputLanguageSelect.value;
  const outputLang = DOM.translationOutputLanguageSelect.value;
  const model = DOM.translationModelSelect.value;

  const outputElement = DOM.translationOutputText;
  outputElement.textContent = '翻译中...';

  try {
    // Build the prompt
    const prompt = inputLang === 'auto' ?
      `请将以下内容翻译成${getLanguageName(outputLang)}：\n\n${inputText}` :
      `请将以下内容从${getLanguageName(inputLang)}翻译成${getLanguageName(outputLang)}：\n\n${inputText}`;

    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
            {
                role: 'system',
                content: UNIVERSAL_TRANSLATION_SYSTEM_PROMPT
            },
            { role: 'user', content: prompt }
        ],
        stream: false // Translation usually doesn't need streaming
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`翻译请求失败: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    const translatedText = data.choices[0].message.content;

    outputElement.textContent = translatedText;
    logMessage('翻译完成', 'system');
  } catch (error) {
    logMessage(`翻译失败: ${error.message}`, 'system');
    outputElement.textContent = '翻译失败，请重试';
    console.error('翻译错误:', error);
  }
}

/**
 * @function getLanguageName
 * @description Gets the Chinese name of a language from its code.
 * @param {string} code - The language code (e.g., 'en', 'zh', 'auto').
 * @returns {string} The Chinese name of the language or the original code if not found.
 */
export function getLanguageName(code) {
  const language = CONFIG.TRANSLATION.LANGUAGES.find(lang => lang.code === code);
  return language ? language.name : code;
}