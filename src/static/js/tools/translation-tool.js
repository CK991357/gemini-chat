/**
 * @file translation-tool.js
 * @description 翻译工具模块，负责处理翻译界面的交互逻辑和与后端代理的通信。
 */

/**
 * 初始化翻译工具的事件监听器和UI逻辑。
 * 该函数应在DOM内容完全加载后调用。
 * @returns {void}
 */
export function initTranslationTool() {
    const translateButton = document.getElementById('translate-button');
    const clearButton = document.getElementById('clear-translation');
    const copyButton = document.getElementById('copy-translation');
    const translateInput = document.getElementById('translate-input');
    const translationResult = document.getElementById('translation-result');
    const sourceLanguage = document.getElementById('source-language');
    const targetLanguage = document.getElementById('target-language');
    const translateModel = document.getElementById('translate-model');
    const apiKeyInput = document.getElementById('api-key'); // 获取API Key输入框

    /**
     * 根据语言代码获取语言名称。
     * @param {string} code - 语言代码（如 'zh', 'en', 'auto'）。
     * @returns {string} 对应的语言名称。
     */
    function getLanguageName(code) {
        const languages = {
            'auto': '自动检测',
            'zh': '中文',
            'en': '英语',
            'es': '西班牙语',
            'fr': '法语',
            'de': '德语',
            'ja': '日语',
            'ko': '韩语',
            'ru': '俄语',
            'ar': '阿拉伯语'
        };
        return languages[code] || code;
    }

    /**
     * 显示系统日志消息。
     * @param {string} message - 要显示的日志消息。
     * @param {string} type - 消息类型（如 'system', 'user'）。
     * @returns {void}
     */
    function logMessage(message, type) {
        const logsContainer = document.getElementById('logs-container');
        if (logsContainer) {
            const logEntry = document.createElement('div');
            logEntry.classList.add('log-entry', type);
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            logsContainer.appendChild(logEntry);
            logsContainer.scrollTop = logsContainer.scrollHeight; // 滚动到底部
        } else {
            console.log(`[LOG - ${type}] ${message}`);
        }
    }

    // 翻译按钮事件监听器
    translateButton.addEventListener('click', async () => {
        const text = translateInput.value.trim();
        if (!text) {
            logMessage('请输入要翻译的内容', 'system');
            return;
        }

        const apiKey = apiKeyInput.value;
        if (!apiKey) {
            logMessage('请先输入API Key', 'system');
            return;
        }

        const sourceLang = sourceLanguage.value;
        const targetLang = targetLanguage.value;
        const model = translateModel.value; // 获取选定的模型

        try {
            translateButton.disabled = true;
            translateButton.textContent = '翻译中...';
            translationResult.textContent = '正在翻译...';

            // 发送请求到后端代理
            const response = await fetch('/api/translate', { // 注意这里是代理路径
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // API Key不再直接发送到智谱AI，而是发送到我们的后端代理
                    // 后端代理会负责添加智谱AI的Authorization头
                    'X-API-Key': apiKey // 将API Key通过自定义头发送给后端代理
                },
                body: JSON.stringify({
                    text: text,
                    source_lang: sourceLang,
                    target_lang: targetLang,
                    model: model // 将模型参数发送给后端代理
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`翻译失败: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const translatedText = data.translatedText; // 假设后端返回的字段是 translatedText

            translationResult.textContent = translatedText;
            logMessage(`翻译完成 (${model})`, 'system');
        } catch (error) {
            logMessage(`翻译错误: ${error.message}`, 'system');
            console.error('翻译错误:', error);
            translationResult.textContent = `翻译失败: ${error.message}`;
        } finally {
            translateButton.disabled = false;
            translateButton.textContent = '翻译';
        }
    });

    // 清空按钮事件监听器
    clearButton.addEventListener('click', () => {
        translateInput.value = '';
        translationResult.textContent = '';
        logMessage('翻译内容已清空', 'system');
    });

    // 复制按钮事件监听器
    copyButton.addEventListener('click', async () => {
        if (!translationResult.textContent) {
            logMessage('没有可复制的内容', 'system');
            return;
        }

        try {
            await navigator.clipboard.writeText(translationResult.textContent);
            copyButton.textContent = 'check'; // 使用Material Symbols图标的名称
            setTimeout(() => {
                copyButton.textContent = 'content_copy'; // 恢复图标
            }, 2000);
            logMessage('翻译结果已复制到剪贴板', 'system');
        } catch (err) {
            logMessage('复制失败: ' + err.message, 'system');
            console.error('复制失败:', err);
        }
    });
}