import { CONFIG } from './config.js';

// DOM Elements (will be passed in)
let promptSelect;
let systemInstructionInput;

/**
 * @function updateSystemInstruction
 * @description 根据下拉菜单的当前选择，更新隐藏的 system-instruction 文本域的值。
 */
function updateSystemInstruction() {
    if (!promptSelect || !systemInstructionInput) return;

    const selectedId = promptSelect.value;
    const selectedOption = CONFIG.PROMPT_OPTIONS.find(option => option.id === selectedId);

    if (selectedOption) {
        systemInstructionInput.value = selectedOption.prompt;
        // 使用全局函数 logMessage (假设它在 main.js 中仍然可用)
        if (typeof logMessage === 'function') {
            logMessage(`指令模式已切换为: ${selectedOption.displayName}`, 'system');
        }
    }
}

/**
 * @function initializePromptSelect
 * @description 初始化指令模式下拉菜单，填充选项并设置事件监听器。
 * @param {HTMLSelectElement} promptSelectEl - 指令模式的 select 元素。
 * @param {HTMLTextAreaElement} systemInstructionInputEl - 系统指令的 textarea 元素。
 */
export function initializePromptSelect(promptSelectEl, systemInstructionInputEl) {
    promptSelect = promptSelectEl;
    systemInstructionInput = systemInstructionInputEl;

    if (!promptSelect) return;

    // 1. 清空现有选项
    promptSelect.innerHTML = '';

    // 2. 从配置填充选项
    CONFIG.PROMPT_OPTIONS.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.id;
        optionElement.textContent = option.displayName;
        promptSelect.appendChild(optionElement);
    });

    // 3. 设置默认值并更新文本域
    const savedPromptId = localStorage.getItem('selected_prompt_id') || CONFIG.DEFAULT_PROMPT_ID;
    promptSelect.value = savedPromptId;
    updateSystemInstruction();


    // 4. 添加事件监听器
    promptSelect.addEventListener('change', () => {
        updateSystemInstruction();
        // 保存用户的选择
        localStorage.setItem('selected_prompt_id', promptSelect.value);
    });
}