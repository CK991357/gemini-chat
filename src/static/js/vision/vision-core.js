import { getChessGameInstance } from '../chess/chess-core.js'; // 引入棋盘函数
import { CONFIG } from '../config/config.js';
import { ApiHandler } from '../core/api-handler.js'; // 引入 ApiHandler
import { HistoryManager } from '../history/history-manager.js'; // 引入 HistoryManager
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

// History management variables
let visionHistoryManager = null;
let currentVisionSessionId = null;

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
    
    // 初始化历史管理器
    initializeVisionHistoryManager(handlers);

    Logger.info('Vision module initialized.');
}

/**
 * Initializes the history manager for vision mode
 * @param {object} handlers - Handler functions from main module
 */
function initializeVisionHistoryManager(handlers) {
    if (!elements.visionHistoryContent) {
        console.warn('Vision history content element not found, history features disabled');
        return;
    }

    // Custom UI update function for vision mode
    const updateVisionChatUI = (sessionData) => {
        if (!elements.visionMessageHistory) {
            console.error('Vision message history element not found');
            return;
        }

        // 1. Clear existing messages
        elements.visionMessageHistory.innerHTML = '';
        visionChatHistory = [];

        // 2. Render all messages from the loaded history
        if (sessionData.messages && sessionData.messages.length > 0) {
            sessionData.messages.forEach(message => {
                if (message.role === 'user') {
                    // 处理用户消息
                    const text = message.content.find(c => c.type === 'text')?.text || '';
                    const files = message.content
                        .filter(c => c.type === 'image_url')
                        .map(c => ({
                            base64: c.image_url.url,
                            type: 'image/jpeg' // 假设类型，实际应该从历史数据中获取
                        }));
                    displayVisionUserMessage(text, files);
                    
                    // 添加到内部历史记录
                    visionChatHistory.push({
                        role: 'user',
                        content: message.content
                    });
                } else if (message.role === 'assistant') {
                    // 处理AI消息
                    const content = typeof message.content === 'string' ? message.content : 
                                   message.content.find(c => c.type === 'text')?.text || '';
                    displayVisionMessage(content);
                    
                    // 添加到内部历史记录
                    visionChatHistory.push({
                        role: 'assistant',
                        content: content
                    });
                }
            });

            // 3. CRITICAL: Restore the chessboard to the last known state
            const lastMessage = sessionData.messages[sessionData.messages.length - 1];
            if (lastMessage.fen) {
                Logger.info(`Restoring board to FEN: ${lastMessage.fen}`, 'system');
                try {
                    // 尝试获取国际象棋实例并加载FEN
                    const chessGame = getChessGameInstance();
                    if (chessGame && typeof chessGame.loadFEN === 'function') {
                        chessGame.loadFEN(lastMessage.fen);
                        Logger.info('Chess board state restored from history', 'system');
                    }
                } catch (error) {
                    console.error('Failed to restore chess board state:', error);
                    Logger.info('Failed to restore chess board state', 'system');
                }
            }

            // 滚动到底部
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        }
    };

    // 获取当前会话ID的函数
    const getCurrentSessionId = () => currentVisionSessionId;
    
    // 设置当前会话ID的函数
    const setCurrentSessionId = (id) => { currentVisionSessionId = id; };

    // 获取当前聊天历史的函数
    const getChatHistory = () => {
        // 将内部格式转换为历史管理器期望的格式
        return visionChatHistory.map(msg => {
            if (msg.role === 'user') {
                // 用户消息可能包含文本和图片
                const textContent = msg.content.find(c => c.type === 'text');
                const imageContents = msg.content.filter(c => c.type === 'image_url');
                
                return {
                    role: 'user',
                    content: [
                        ...(textContent ? [textContent] : []),
                        ...imageContents
                    ],
                    fen: msg.fen // 保存FEN状态
                };
            } else {
                // AI消息
                return {
                    role: 'assistant',
                    content: typeof msg.content === 'string' ? 
                        [{ type: 'text', text: msg.content }] : msg.content,
                    fen: msg.fen // 保存FEN状态
                };
            }
        });
    };

    // 设置聊天历史的函数
    const setChatHistory = (history) => {
        visionChatHistory = history;
    };

    visionHistoryManager = new HistoryManager({
        mode: 'vision',
        elements: {
            historyContent: elements.visionHistoryContent,
            // 可以根据需要添加其他历史相关的DOM元素
        },
        updateChatUI: updateVisionChatUI,
        getChatHistory: getChatHistory,
        setChatHistory: setChatHistory,
        getCurrentSessionId: getCurrentSessionId,
        setCurrentSessionId: setCurrentSessionId,
        showToast: showToastHandler,
        showSystemMessage: handlers.showSystemMessage || console.log,
        logMessage: handlers.logMessage || console.log
    });

    // 初始化历史管理器
    visionHistoryManager.init();
    
    Logger.info('Vision history manager initialized', 'system');
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
    
    const resetChessButton = document.getElementById('reset-chess-button');
    if (resetChessButton) {
        resetChessButton.addEventListener('click', () => {
            // 1. Reset the actual chess game state and UI
            const chessGame = getChessGameInstance();
            if (chessGame) {
                chessGame.completelyResetGame();
                showToastHandler('新棋局已开始！');
            }
            
            // 2. CRITICAL: Reset the history session ID
            startNewVisionSession();
        });
    }
    
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

    // --- 历史保存逻辑开始 ---
    
    // 1. 获取当前FEN字符串
    let currentFEN = '';
    try {
        const chessGame = getChessGameInstance();
        if (chessGame && typeof chessGame.getCurrentFEN === 'function') {
            currentFEN = chessGame.getCurrentFEN();
            Logger.info(`Current FEN for history: ${currentFEN}`, 'system');
        }
    } catch (error) {
        console.warn('Could not get current FEN:', error);
    }

    // 2. 创建用户消息对象并包含FEN
    const userContent = [];
    if (text) {
        userContent.push({ type: 'text', text });
    }
    visionAttachedFiles.forEach(file => {
        userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
    });
    
    const userMessage = {
        role: 'user',
        content: userContent,
        fen: currentFEN // 附加棋盘状态
    };
    
    // 添加到历史记录并显示
    visionChatHistory.push(userMessage);
    displayVisionUserMessage(text, visionAttachedFiles);

    // --- 历史保存逻辑结束 ---

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
        let buffer = '';

        markdownContainer.innerHTML = ''; // Clear loading message

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留最后一行不完整的数据

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
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
                        // 忽略解析错误，继续处理下一行
                        console.warn('Skipping invalid SSE data:', jsonStr);
                    }
                }
            }
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        }

        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }

        // --- 保存AI回复到历史记录 ---
        const assistantMessage = {
            role: 'assistant',
            content: finalContent,
            fen: currentFEN // 使用相同的FEN状态
        };
        visionChatHistory.push(assistantMessage);

        // 4. 保存整个会话到后端
        if (visionHistoryManager) {
            await visionHistoryManager.saveHistory();
            Logger.info('Vision conversation saved to history', 'system');
        }

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
 * 生成对局总结 - 基于FEN历史而不是聊天历史
 */
async function generateGameSummary() {
    // 检查是否能获取到国际象棋实例
    let chessGame = null;
    
    // 尝试多种方式获取国际象棋实例
    if (typeof window.chessGame !== 'undefined') {
        chessGame = window.chessGame;
    } else if (typeof getChessGameInstance === 'function') {
        chessGame = getChessGameInstance();
    } else {
        // 最后尝试通过DOM事件或其他全局访问方式
        chessGame = window.chessGameInstance;
    }
    
    if (!chessGame || typeof chessGame.getFullGameHistory !== 'function') {
        showToastHandler('无法获取国际象棋对局数据，请确保棋局已初始化。');
        return;
    }

    // 获取完整的FEN历史
    const fenHistory = chessGame.getFullGameHistory();
    if (!fenHistory || fenHistory.length === 0) {
        showToastHandler('没有对局历史可以总结。');
        return;
    }

    const selectedModel = elements.visionModelSelect.value;
    const summaryButton = elements.visionSummaryButton;
    
    // 设置按钮加载状态
    if (summaryButton) {
        summaryButton.disabled = true;
        summaryButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 分析中...';
    }
    
    // 创建总结消息元素
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在分析对局历史...</p>';

    try {
        // 获取当前FEN状态
        let currentFEN = '';
        try {
            if (chessGame && typeof chessGame.getCurrentFEN === 'function') {
                currentFEN = chessGame.getCurrentFEN();
            }
        } catch (error) {
            console.warn('Could not get current FEN for summary:', error);
        }

        // 获取chess_summary提示词
        const summaryPromptConfig = CONFIG.VISION.PROMPTS.find(prompt => prompt.id === 'chess_summary');
        const systemPrompt = summaryPromptConfig ? summaryPromptConfig.systemPrompt : `你是一位国际象棋特级大师。请基于提供的完整对局历史（FEN格式）生成一份详细的对局总结和分析。`;

        // 构建基于FEN历史的总结请求
        const summaryRequest = {
            model: selectedModel,
            messages: [
                { 
                    role: 'system', 
                    content: systemPrompt
                },
                { 
                    role: 'user', 
                    content: [
                        { 
                            type: 'text', 
                            text: `请分析以下国际象棋对局历史（共${fenHistory.length}步）：

完整FEN历史：
${fenHistory.join('\n')}

当前局面：${fenHistory[fenHistory.length - 1]}

请基于这个完整的对局历史，生成一份专业的对局分析总结。` 
                        }
                    ]
                }
            ],
            stream: true
        };

        // 发送请求
        const reader = await apiHandler.fetchStream('/api/chat/completions', summaryRequest);
        const decoder = new TextDecoder('utf-8');
        let finalContent = '';
        let reasoningStarted = false;
        let answerStarted = false;
        let buffer = '';

        markdownContainer.innerHTML = ''; // Clear loading message

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留最后一行不完整的数据

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
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
                        // 忽略解析错误，继续处理下一行
                        console.warn('Skipping invalid SSE data:', jsonStr);
                    }
                }
            }
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        }

        // 应用数学公式渲染
        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }

        // 将总结添加到视觉聊天历史并保存
        const assistantMessage = {
            role: 'assistant',
            content: finalContent,
            fen: currentFEN // 保存当前FEN状态
        };
        visionChatHistory.push(assistantMessage);

        // 保存历史记录
        if (visionHistoryManager) {
            await visionHistoryManager.saveHistory();
            Logger.info('Game summary saved to history', 'system');
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
 * 在视觉聊天界面显示一条AI消息。
 * 这是从外部模块调用的接口，例如从国际象棋AI模块。
 * @param {string} markdownContent - 要显示的Markdown格式的文本内容。
 * @param {object} opts - 选项参数
 * @param {string} opts.id - 消息ID（用于更新现有消息）
 * @param {boolean} opts.create - 是否创建新消息
 * @param {boolean} opts.append - 是否追加到现有消息
 */
export function displayVisionMessage(markdownContent, opts = {}) {
    if (!elements.visionMessageHistory) {
        console.error('Vision message history element not found.');
        return;
    }

    const { id, create = true, append = false } = opts;

    // 如果指定了ID且不是创建新消息，尝试更新现有消息
    if (id && !create) {
        const existingMessage = document.querySelector(`[data-message-id="${id}"]`);
        if (existingMessage) {
            const markdownContainer = existingMessage.querySelector('.markdown-container');
            if (markdownContainer) {
                if (append) {
                    // 追加内容
                    const contentToRender = typeof markdownContent === 'string' ? markdownContent : String(markdownContent);
                    markdownContainer.innerHTML += marked.parse(contentToRender);
                } else {
                    // 替换内容
                    const contentToRender = typeof markdownContent === 'string' ? markdownContent : String(markdownContent);
                    markdownContainer.innerHTML = marked.parse(contentToRender);
                }
                
                // 重新渲染数学公式
                if (typeof MathJax !== 'undefined' && MathJax.startup) {
                    MathJax.startup.promise.then(() => {
                        MathJax.typeset([markdownContainer]);
                    }).catch((err) => console.error('MathJax typesetting failed:', err));
                }
                
                // 滚动到底部
                elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
                return;
            }
        }
    }

    // 创建新消息
    const { markdownContainer, reasoningContainer } = createVisionAIMessageElement();
    
    // 设置消息ID（如果提供）
    if (id) {
        markdownContainer.closest('.message').setAttribute('data-message-id', id);
    }
    
    // 渲染 Markdown 内容
    // 确保 markdownContent 是字符串，以防外部模块传入非字符串类型
    const contentToRender = typeof markdownContent === 'string' ? markdownContent : String(markdownContent);
    markdownContainer.innerHTML = marked.parse(contentToRender);

    // 渲染可能存在的数学公式
    if (typeof MathJax !== 'undefined' && MathJax.startup) {
        MathJax.startup.promise.then(() => {
            MathJax.typeset([markdownContainer, reasoningContainer]);
        }).catch((err) => console.error('MathJax typesetting failed:', err));
    }

    // 将这条消息添加到内部历史记录中，以保持一致性
    // 注意：这里不会自动保存到历史管理器，需要调用者处理
    // visionChatHistory.push({ role: 'assistant', content: contentToRender });

    // 滚动到底部
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}

/**
 * 获取视觉历史管理器实例
 * @returns {HistoryManager|null} 历史管理器实例
 */
export function getVisionHistoryManager() {
    return visionHistoryManager;
}

/**
 * 获取当前视觉会话ID
 * @returns {string|null} 当前会话ID
 */
export function getCurrentVisionSessionId() {
    return currentVisionSessionId;
}

/**
 * 设置当前视觉会话ID
 * @param {string} sessionId - 会话ID
 */
export function setCurrentVisionSessionId(sessionId) {
    currentVisionSessionId = sessionId;
}

/**
 * Clears the current vision session ID and chat history,
 * effectively starting a new session on the next saveHistory() call.
 */
export function startNewVisionSession() {
    console.log("Starting new vision/chess session.");
    currentVisionSessionId = null;
    visionChatHistory = [];
    // Optionally clear the chat message display as well
    if (elements.visionMessageHistory) {
        elements.visionMessageHistory.innerHTML = '';
    }
    // Assuming logMessage is available globally or passed via handlers
    // If not, you might need to adjust how logMessage is accessed here.
    // For now, we'll assume it's accessible or we'll use console.log as a fallback.
    if (typeof logMessage === 'function') {
        logMessage('新棋局开始，历史记录会话已重置。', 'system');
    } else {
        console.log('新棋局开始，历史记录会话已重置。');
    }
}