import { CONFIG } from '../config/config.js';
import { ApiHandler } from '../core/api-handler.js'; // 引入 ApiHandler
import { Logger } from '../utils/logger.js';

/**
 * @fileoverview Core logic for the Vision feature.
 * Handles UI initialization, API calls, and message display for multimodal vision chat.
 */

// Module-level state
let elements = {};
let visionChatHistory = [];
let attachmentManager = null;
let showToastHandler = null;
const apiHandler = new ApiHandler(); // 创建 ApiHandler 实例

/**
 * Initializes the Vision feature.
 * @param {object} el - A collection of DOM elements required by the vision module.
 * @param {object} manager - The global attachment manager instance.
 * @param {object} handlers - A collection of handler functions from other modules.
 */
export function initializeVisionCore(el, manager, handlers) {
    elements = el;
    attachmentManager = manager;
    showToastHandler = handlers.showToast;

    populateModelSelect();
    populatePromptSelect();
    attachEventListeners();

    Logger.info('Vision module initialized.');
}

/**
 * Populates the vision model selection dropdown.
 */
function populateModelSelect() {
    if (!elements.visionModelSelect) return;

    elements.visionModelSelect.innerHTML = ''; // Clear existing options
    CONFIG.VISION.MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName;
        if (model.name === CONFIG.VISION.DEFAULT_MODEL) {
            option.selected = true;
        }
        elements.visionModelSelect.appendChild(option);
    });
}

/**
 * Populates the vision prompt selection dropdown.
 */
function populatePromptSelect() {
    if (!elements.visionPromptSelect) return;

    elements.visionPromptSelect.innerHTML = ''; // Clear existing options
    CONFIG.VISION.PROMPTS.forEach(prompt => {
        const option = document.createElement('option');
        option.value = prompt.id;
        option.textContent = prompt.name;
        option.title = prompt.description; // 添加描述作为悬停提示
        if (prompt.id === CONFIG.VISION.DEFAULT_PROMPT_ID) {
            option.selected = true;
        }
        elements.visionPromptSelect.appendChild(option);
    });
}

/**
 * Attaches all necessary event listeners for the vision UI.
 */
function attachEventListeners() {
    elements.visionSendButton?.addEventListener('click', () => handleSendVisionMessage());
    elements.visionAttachmentButton?.addEventListener('click', () => elements.visionFileInput.click());
    elements.visionFileInput?.addEventListener('change', (event) => attachmentManager.handleFileAttachment(event, 'vision'));
    elements.visionSummaryButton?.addEventListener('click', () => generateGameSummary());
    
    // 监听提示词模式切换
    elements.visionPromptSelect?.addEventListener('change', () => {
        const selectedPrompt = getSelectedPrompt();
        Logger.info(`Vision prompt changed to: ${selectedPrompt.name}`);
    });
    
    // 添加视觉模式内部子标签事件监听器
    const visionTabs = document.querySelectorAll('.vision-tabs .tab');
    if (visionTabs.length > 0) {
        visionTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                
                // 移除所有 vision tab 和 vision-container 子容器的 active 类
                visionTabs.forEach(t => t.classList.remove('active'));
                const visionSubContainers = document.querySelectorAll('.vision-container .sub-container');
                visionSubContainers.forEach(c => c.classList.remove('active'));
                
                // 添加当前点击 tab 和对应子容器的 active 类
                tab.classList.add('active');
                const targetContainer = document.querySelector(`.vision-container .sub-container.${mode}-mode`);
                if (targetContainer) {
                    targetContainer.classList.add('active');
                }
            });
        });
        
        // 默认激活视觉聊天子标签
        const defaultVisionTab = document.querySelector('.vision-tabs .tab[data-mode="chat"]');
        if (defaultVisionTab) {
            defaultVisionTab.click();
        }
    }
}

/**
 * Handles sending a message with optional attachments to the vision model.
 */
async function handleSendVisionMessage() {
    const text = elements.visionInputText.value.trim();
    const visionAttachedFiles = attachmentManager.getVisionAttachedFiles();
    if (!text && visionAttachedFiles.length === 0) {
        showToastHandler('请输入文本或添加附件。');
        return;
    }

    const selectedModel = elements.visionModelSelect.value;
    const selectedPrompt = getSelectedPrompt();

    // Display user message in the UI
    displayVisionUserMessage(text, visionAttachedFiles);

    // Add user message to history
    const userContent = [];
    if (text) {
        userContent.push({ type: 'text', text });
    }
    visionAttachedFiles.forEach(file => {
        userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
    });
    visionChatHistory.push({ role: 'user', content: userContent });

    // Clear inputs
    elements.visionInputText.value = '';
    attachmentManager.clearAttachedFile('vision');

    // Set loading state
    elements.visionSendButton.disabled = true;
    elements.visionSendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; // 使用 Font Awesome 加载图标
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在请求模型...</p>';
    Logger.info(`Requesting vision model: ${selectedModel}`, 'system');

    try {
        const requestBody = {
            model: selectedModel,
            messages: [
                { role: 'system', content: selectedPrompt.systemPrompt },
                ...visionChatHistory
            ],
            stream: true,
        };

        // 使用升级后的 ApiHandler 发送流式请求
        const reader = await apiHandler.fetchStream('/api/chat/completions', requestBody);
        const decoder = new TextDecoder('utf-8');
        let finalContent = '';
        let reasoningStarted = false;
        let answerStarted = false;

        markdownContainer.innerHTML = ''; // Clear loading message

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            chunk.split('\n\n').forEach(part => {
                if (part.startsWith('data: ')) {
                    const jsonStr = part.substring(6);
                    if (jsonStr === '[DONE]') return;
                    try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta;
                        if (delta) {
                            if (delta.reasoning_content) {
                                if (!reasoningStarted) {
                                    reasoningContainer.style.display = 'block';
                                    reasoningStarted = true;
                                }
                                reasoningContainer.querySelector('.reasoning-content').innerHTML += delta.reasoning_content.replace(/\n/g, '<br>');
                            }
                            if (delta.content) {
                                if (reasoningStarted && !answerStarted) {
                                    const separator = document.createElement('hr');
                                    separator.className = 'answer-separator';
                                    reasoningContainer.after(separator);
                                    answerStarted = true;
                                }
                                finalContent += delta.content;
                                markdownContainer.innerHTML = marked.parse(finalContent);
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing SSE chunk:', e, jsonStr);
                    }
                }
            });
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        }

        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }

        visionChatHistory.push({ role: 'assistant', content: finalContent });

    } catch (error) {
        console.error('Error sending vision message:', error);
        markdownContainer.innerHTML = `<p><strong>请求失败:</strong> ${error.message}</p>`;
        Logger.info(`视觉模型请求失败: ${error.message}`, 'system');
    } finally {
        elements.visionSendButton.disabled = false;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>'; // 恢复为 Font Awesome 发送图标
    }
}

/**
 * Displays a user's message in the vision chat UI.
 * @param {string} text - The text part of the message.
 * @param {Array<object>} files - An array of attached file objects.
 */
function displayVisionUserMessage(text, files) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'user');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '👤';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    if (text) {
        const textNode = document.createElement('p');
        textNode.textContent = text;
        contentDiv.appendChild(textNode);
    }

    if (files && files.length > 0) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.className = 'attachments-grid';
        files.forEach(file => {
            let attachmentElement;
            if (file.type.startsWith('image/')) {
                attachmentElement = document.createElement('img');
                attachmentElement.src = file.base64;
                attachmentElement.style.maxWidth = '200px'; // 限制图片最大宽度
                attachmentElement.style.maxHeight = '200px'; // 限制图片最大高度
                attachmentElement.style.borderRadius = '8px'; // 添加圆角
            } else if (file.type.startsWith('video/')) {
                attachmentElement = document.createElement('video');
                attachmentElement.src = file.base64;
                attachmentElement.controls = true;
            }
            if (attachmentElement) {
                attachmentElement.className = 'chat-attachment';
                attachmentsContainer.appendChild(attachmentElement);
            }
        });
        contentDiv.appendChild(attachmentsContainer);
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.visionMessageHistory.appendChild(messageDiv);
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}

/**
 * Creates and appends a new AI message element to the vision chat UI.
 * @returns {object} An object containing references to the new message's elements.
 */
function createVisionAIMessageElement() {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const reasoningContainer = document.createElement('div');
    reasoningContainer.className = 'reasoning-container';
    reasoningContainer.style.display = 'none';
    const reasoningTitle = document.createElement('h4');
    reasoningTitle.className = 'reasoning-title';
    reasoningTitle.innerHTML = '<span class="material-symbols-outlined">psychology</span> 思维链';
    const reasoningContent = document.createElement('div');
    reasoningContent.className = 'reasoning-content';
    reasoningContainer.appendChild(reasoningTitle);
    reasoningContainer.appendChild(reasoningContent);
    contentDiv.appendChild(reasoningContainer);

    const markdownContainer = document.createElement('div');
    markdownContainer.classList.add('markdown-container');
    contentDiv.appendChild(markdownContainer);

    const copyButton = document.createElement('button');
    copyButton.classList.add('copy-button');
    copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>';
    copyButton.addEventListener('click', async () => {
        try {
            const reasoningText = reasoningContainer.style.display !== 'none'
                ? `[思维链]\n${reasoningContainer.querySelector('.reasoning-content').innerText}\n\n`
                : '';
            const mainText = markdownContainer.innerText;
            await navigator.clipboard.writeText(reasoningText + mainText);
            copyButton.innerHTML = '<i class="fa-solid fa-check"></i>';
            setTimeout(() => { copyButton.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    });

    contentDiv.appendChild(copyButton);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.visionMessageHistory.appendChild(messageDiv);
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;

    return {
        container: messageDiv,
        markdownContainer,
        reasoningContainer
    };
}

/**
 * 获取当前选择的提示词
 * @returns {object} 当前选择的提示词对象
 */
function getSelectedPrompt() {
    if (!elements.visionPromptSelect) {
        return CONFIG.VISION.PROMPTS[0]; // 默认返回第一个提示词
    }
    
    const selectedId = elements.visionPromptSelect.value;
    return CONFIG.VISION.PROMPTS.find(prompt => prompt.id === selectedId) || CONFIG.VISION.PROMPTS[0];
}

/**
 * 生成对局总结
 */
async function generateGameSummary() {
    if (visionChatHistory.length === 0) {
        showToastHandler('没有对话历史可以总结。');
        return;
    }

    // 检查是否处于国际象棋相关模式
    const currentPrompt = getSelectedPrompt();
    if (currentPrompt.id !== 'chess_teacher') {
        showToastHandler('请先切换到“国际象棋老师”模式后再生成总结。');
        return;
    }

    const selectedModel = elements.visionModelSelect.value;
    const summaryButton = elements.visionSummaryButton;
    
    // 设置按钮加载状态
    if (summaryButton) {
        summaryButton.disabled = true;
        summaryButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 生成中...';
    }
    
    // 创建总结消息元素
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在生成对局总结...</p>';

    try {
        // 构建总结请求，使用专门的chess_summary提示词
        const summaryPrompt = CONFIG.VISION.PROMPTS.find(p => p.id === 'chess_summary');
        if (!summaryPrompt) {
            throw new Error('找不到chess_summary提示词，请检查配置');
        }
        
        const summaryRequest = {
            model: selectedModel,
            messages: [
                { role: 'system', content: summaryPrompt.systemPrompt },
                { role: 'user', content: [
                    { 
                        type: 'text', 
                        text: '请基于我们之前的对话历史，生成一份完整的对局总结和分析。这包括了我在对局中的关键决策、战术执行情况，以及需要改进的地方。请提供具体可行的建议来帮助我提高棋艺水平。' 
                    }
                ]},
                ..._getRelevantHistory() // 智能获取相关历史记录
            ],
            stream: true
        };

        // 发送请求
        const reader = await apiHandler.fetchStream('/api/chat/completions', summaryRequest);
        const decoder = new TextDecoder('utf-8');
        let finalContent = '';
        let reasoningStarted = false;
        let answerStarted = false;

        markdownContainer.innerHTML = ''; // Clear loading message

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            chunk.split('\n\n').forEach(part => {
                if (part.startsWith('data: ')) {
                    const jsonStr = part.substring(6);
                    if (jsonStr === '[DONE]') return;
                    try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta;
                        if (delta) {
                            if (delta.reasoning_content) {
                                if (!reasoningStarted) {
                                    reasoningContainer.style.display = 'block';
                                    reasoningStarted = true;
                                }
                                reasoningContainer.querySelector('.reasoning-content').innerHTML += delta.reasoning_content.replace(/\n/g, '<br>');
                            }
                            if (delta.content) {
                                if (reasoningStarted && !answerStarted) {
                                    const separator = document.createElement('hr');
                                    separator.className = 'answer-separator';
                                    reasoningContainer.after(separator);
                                    answerStarted = true;
                                }
                                finalContent += delta.content;
                                markdownContainer.innerHTML = marked.parse(finalContent);
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing SSE chunk:', e, jsonStr);
                    }
                }
            });
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        }

        // 应用数学公式渲染
        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }

        Logger.info('对局总结生成完成', 'system');

    } catch (error) {
        console.error('Error generating game summary:', error);
        markdownContainer.innerHTML = `<p><strong>总结生成失败:</strong> ${error.message}</p>`;
        Logger.info(`对局总结生成失败: ${error.message}`, 'system');
    } finally {
        // 恢复按钮状态
        if (summaryButton) {
            summaryButton.disabled = false;
            summaryButton.innerHTML = '对局总结';
        }
    }
}

/**
 * 智能获取相关历史记录
 * @private
 */
function _getRelevantHistory() {
    // 如果历史记录较少，全部返回
    if (visionChatHistory.length <= 15) {
        return visionChatHistory;
    }
    
    // 对于较长的对话，采用智能策略：
    // 1. 保留前3条记录（开局信息）
    // 2. 保留最后10条记录（最新情况）
    // 3. 从中间选择关键记录（含有图片的记录）
    
    const startRecords = visionChatHistory.slice(0, 3);
    const endRecords = visionChatHistory.slice(-10);
    
    // 从中间部分选择含有图片的记录
    const middleRecords = visionChatHistory.slice(3, -10);
    const keyRecords = middleRecords.filter(record => 
        record.role === 'user' && 
        record.content && 
        Array.isArray(record.content) && 
        record.content.some(item => item.type === 'image_url')
    ).slice(0, 5); // 最多5条关键记录
    
    Logger.info(`历史记录总数: ${visionChatHistory.length}, 使用记录: ${startRecords.length + keyRecords.length + endRecords.length}`, 'system');
    
    return [...startRecords, ...keyRecords, ...endRecords];
}

/**
 * 在视觉聊天界面显示一条AI消息。
 * 这是从外部模块调用的接口，例如从国际象棋AI模块。
 * @param {string} markdownContent - 要显示的Markdown格式的文本内容。
 */
export function displayVisionMessage(markdownContent) {
    if (!elements.visionMessageHistory) {
        console.error('Vision message history element not found.');
        return;
    }

    // 使用现有的函数来创建和渲染AI消息元素
    const { markdownContainer, reasoningContainer } = createVisionAIMessageElement();
    
    // 渲染Markdown内容
    markdownContainer.innerHTML = marked.parse(markdownContent);

    // 渲染可能存在的数学公式
    if (typeof MathJax !== 'undefined' && MathJax.startup) {
        MathJax.startup.promise.then(() => {
            MathJax.typeset([markdownContainer, reasoningContainer]);
        }).catch((err) => console.error('MathJax typesetting failed:', err));
    }

    // 将这条消息添加到内部历史记录中，以保持一致性
    visionChatHistory.push({ role: 'assistant', content: markdownContent });

    // 滚动到底部
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}
