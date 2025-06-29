// src/static/js/tools/translation-tool.js

import { Logger } from '../utils/logger.js'; // 导入 Logger

export class TranslationTool {
    /**
     * @function
     * @description 翻译工具的构造函数。
     * @param {HTMLTextAreaElement} inputElement - 输入文本区域的DOM元素。
     * @param {HTMLSelectElement} inputLanguageSelect - 输入语言选择下拉菜单的DOM元素。
     * @param {HTMLSelectElement} modelSelect - 模型选择下拉菜单的DOM元素。
     * @param {HTMLButtonElement} translateButton - 翻译按钮的DOM元素。
     * @param {HTMLDivElement} outputElement - 输出文本显示区域的DOM元素。
     * @param {HTMLSelectElement} outputLanguageSelect - 输出语言选择下拉菜单的DOM元素。
     * @param {HTMLButtonElement} copyButton - 复制按钮的DOM元素。
     * @param {Logger} logger - 用于日志输出的Logger实例。
     */
    constructor(
        inputElement,
        inputLanguageSelect,
        modelSelect,
        translateButton,
        outputElement,
        outputLanguageSelect,
        copyButton,
        logger
    ) {
        this.inputElement = inputElement;
        this.inputLanguageSelect = inputLanguageSelect;
        this.modelSelect = modelSelect;
        this.translateButton = translateButton;
        this.outputElement = outputElement;
        this.outputLanguageSelect = outputLanguageSelect;
        this.copyButton = copyButton;
        this.logger = logger;

        /**
         * @property {Array<Object>} availableLanguages - 可用的语言列表。
         * @property {string} availableLanguages[].code - 语言的ISO 639-1代码。
         * @property {string} availableLanguages[].name - 语言的显示名称。
         */
        this.availableLanguages = [
            { code: 'auto', name: '自动检测' },
            { code: 'zh', name: '中文' },
            { code: 'en', name: '英语' },
            { code: 'ja', name: '日语' },
            { code: 'fr', name: '法语' },
            { code: 'de', name: '德语' },
            { code: 'es', name: '西班牙语' },
            { code: 'ru', name: '俄语' },
            { code: 'ko', name: '韩语' },
        ];

        /**
         * @property {string} modelName - 翻译工具使用的模型名称，固定为 'glm-4-flash-250414'。
         */
        this.modelName = 'glm-4-flash-250414';
    }

    /**
     * @function
     * @description 初始化翻译工具，包括填充语言下拉菜单和添加事件监听器。
     * @returns {void}
     */
    init() {
        this.populateLanguageSelects();
        this.addEventListeners();
        this.logger.info('翻译工具已初始化', 'system');
    }

    /**
     * @function
     * @description 填充输入和输出语言选择下拉菜单的选项。
     * @returns {void}
     */
    populateLanguageSelects() {
        // 填充输入语言选择
        this.inputLanguageSelect.innerHTML = '';
        this.availableLanguages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;
            this.inputLanguageSelect.appendChild(option);
        });
        this.inputLanguageSelect.value = 'auto'; // 默认自动检测
        this.inputLanguageSelect.title = '选择输入语言'; // 添加title属性以提高可访问性

        // 填充输出语言选择
        this.outputLanguageSelect.innerHTML = '';
        this.availableLanguages.filter(lang => lang.code !== 'auto').forEach(lang => { // 输出不能是自动检测
            const option = document.createElement('option');
            option.value = lang.code;
            option.textContent = lang.name;
            this.outputLanguageSelect.appendChild(option);
        });
        this.outputLanguageSelect.value = 'en'; // 默认输出英语
        this.outputLanguageSelect.title = '选择输出语言'; // 添加title属性以提高可访问性

        // 为模型选择添加title属性
        this.modelSelect.title = '选择翻译模型';
    }

    /**
     * @function
     * @description 为翻译按钮和复制按钮添加事件监听器。
     * @returns {void}
     */
    addEventListeners() {
        this.translateButton.addEventListener('click', () => this.translate());
        this.copyButton.addEventListener('click', () => this.copyOutput());
        // 添加悬停提示
        this.copyButton.title = '复制到剪贴板';
    }

    /**
     * @function
     * @description 执行翻译操作，向后端代理发送翻译请求。
     * @returns {Promise<void>}
     * @throws {Error} 如果API请求失败。
     */
    async translate() {
        const inputText = this.inputElement.value.trim();
        if (!inputText) {
            this.logger.warn('请输入要翻译的文本。', 'system');
            return;
        }

        const inputLang = this.inputLanguageSelect.value;
        const outputLang = this.outputLanguageSelect.value;

        this.translateButton.disabled = true;
        this.translateButton.textContent = '翻译中...';
        this.outputElement.textContent = '正在翻译...';
        this.logger.info(`翻译工具：开始翻译：从 ${inputLang} 到 ${outputLang}`, 'system');

        try {
            // 构建请求体，使用智谱AI API的messages格式
            const messages = [
                {
                    role: 'system',
                    content: `你是一个专业的翻译助手。请将用户提供的文本从${inputLang === 'auto' ? '自动检测语言' : inputLang}翻译成${outputLang}。只返回翻译结果，不要添加任何额外说明。`
                },
                {
                    role: 'user',
                    content: inputText
                }
            ];

            const requestBody = {
                model: this.modelName,
                messages: messages,
                // stream: false, // 同步调用，默认就是false
            };

            // 发送请求到后端代理
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API 请求失败: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`);
            }

            const result = await response.json();
            const translatedText = result.choices[0]?.message?.content || '翻译失败，请重试。';
            this.outputElement.textContent = translatedText;
            this.logger.info('翻译工具：翻译完成。', 'system');

        } catch (error) {
            this.outputElement.textContent = `翻译失败: ${error.message}`;
            this.logger.error(`翻译工具：翻译失败: ${error.message}`, 'system');
            console.error('翻译工具错误:', error);
        } finally {
            this.translateButton.disabled = false;
            this.translateButton.textContent = '翻译';
        }
    }

    /**
     * @function
     * @description 将翻译结果复制到剪贴板。
     * @returns {Promise<void>}
     */
    async copyOutput() {
        try {
            await navigator.clipboard.writeText(this.outputElement.textContent);
            this.copyButton.textContent = '已复制';
            this.logger.info('翻译工具：翻译结果已复制到剪贴板。', 'system');
            setTimeout(() => {
                this.copyButton.textContent = '复制';
            }, 2000);
        } catch (err) {
            this.logger.error('翻译工具：复制失败:', err, 'system');
            console.error('翻译工具复制失败:', err);
        }
    }
}