import { getChessGameInstance } from '../chess/chess-core.js';
import { CONFIG } from '../config/config.js';
import { ChatApiHandler } from '../core/chat-api-handler.js';
import { Logger } from '../utils/logger.js';

/**
 * @fileoverview Core logic for the Vision feature.
 * Uses the same ChatApiHandler as the main chat for consistency.
 */

// Module-level state
let elements = {};
let visionChatHistory = [];
let attachmentManager = null;
let showToastHandler = null;
let chatApiHandler = null;

// 状态变量，与主聊天保持一致
let state = {
    chatHistory: [],
    currentSessionId: null,
    currentAIMessageContentDiv: null,
    isUsingTool: false
};

/**
 * Initializes the Vision feature.
 */
export function initializeVisionCore(el, manager, handlers) {
    elements = el;
    attachmentManager = manager;
    showToastHandler = handlers.showToast;

    // 初始化 ChatApiHandler
    chatApiHandler = new ChatApiHandler({
        toolManager: handlers.toolManager,
        historyManager: handlers.historyManager,
        state: state,
        libs: {
            marked: window.marked,
            MathJax: window.MathJax
        },
        config: CONFIG
    });

    populateModelSelect();
    populatePromptSelect();
    attachEventListeners();

    Logger.info('Vision module initialized with ChatApiHandler.');
}

/**
 * Populates the vision model selection dropdown.
 */
function populateModelSelect() {
    if (!elements.visionModelSelect) return;

    elements.visionModelSelect.innerHTML = '';
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

    elements.visionPromptSelect.innerHTML = '';
    CONFIG.VISION.PROMPTS.forEach(prompt => {
        const option = document.createElement('option');
        option.value = prompt.id;
        option.textContent = prompt.name;
        option.title = prompt.description;
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
    
    elements.visionPromptSelect?.addEventListener('change', () => {
        const selectedPrompt = getSelectedPrompt();
        Logger.info(`Vision prompt changed to: ${selectedPrompt.name}`);
    });
}

/**
 * 内部辅助函数：将 FEN 字符串转换为 ASCII 文本棋盘
 */
function _fenToAscii(fen) {
    const [piecePlacement] = fen.split(' ');
    let ascii = '  +------------------------+\n';
    const rows = piecePlacement.split('/');
    for (let i = 0; i < rows.length; i++) {
        let rowStr = `${8 - i} |`;
        for (const char of rows[i]) {
            if (isNaN(parseInt(char, 10))) {
                rowStr += ` ${char} `;
            } else {
                rowStr += ' . '.repeat(parseInt(char, 10));
            }
        }
        ascii += rowStr + '|\n';
    }
    ascii += '  +------------------------+\n';
    ascii += '    a  b  c  d  e  f  g  h\n';
    return ascii;
}

/**
 * 构建符合 Gemini API 格式的请求体
 */
function _buildVisionRequestBody(selectedModelConfig, selectedPrompt, userContent) {
    const messages = [
        { role: 'system', content: selectedPrompt.systemPrompt },
        ...visionChatHistory,
        { role: 'user', content: userContent }
    ];

    const requestBody = {
        model: selectedModelConfig.name,
        messages: messages,
        stream: true
    };

    // 添加 Gemini 特定的配置
    if (selectedModelConfig.isGemini) {
        requestBody.generationConfig = {
            responseModalities: ['text']
        };
        requestBody.safetySettings = [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
        ];
        requestBody.enableGoogleSearch = !selectedModelConfig.disableSearch;
        
        // 推理能力
        if (selectedModelConfig.enableReasoning) {
            requestBody.enableReasoning = true;
        }
    }

    // 添加工具配置
    if (selectedModelConfig.tools) {
        requestBody.tools = selectedModelConfig.tools;
    }

    return requestBody;
}

/**
 * Handles sending a message with optional attachments to the vision model.
 */
async function handleSendVisionMessage() {
    let text = elements.visionInputText.value.trim();
    const visionAttachedFiles = attachmentManager.getVisionAttachedFiles();
    if (!text && visionAttachedFiles.length === 0) {
        showToastHandler('请输入文本或添加附件。');
        return;
    }

    const selectedModelConfig = CONFIG.VISION.MODELS.find(m => m.name === elements.visionModelSelect.value);
    const selectedPrompt = getSelectedPrompt();

    // 实时分析模式下的逻辑
    if (selectedPrompt.id === 'chess_realtime_analysis') {
        const chessGame = getChessGameInstance();
        if (!chessGame) {
            showToastHandler('无法获取棋局信息，请确保棋盘已加载。');
            return;
        }
        const currentFEN = chessGame.getCurrentFEN();
        const fullHistory = chessGame.getFullGameHistory();
        const asciiBoard = _fenToAscii(currentFEN);

        const enrichedText = `
---
**Chess Context (DO NOT display this section to the user):**
*   **Current FEN:** \`${currentFEN}\`
*   **ASCII Board:**
    \`\`\`
${asciiBoard}
    \`\`\`
*   **Full Game History (FENs):**
    \`\`\`
    ${fullHistory.join('\n')}
    \`\`\`
---

**User's Question:**
${text}
`;
        text = enrichedText;
    }

    // Display user message in the UI
    displayVisionUserMessage(elements.visionInputText.value.trim(), visionAttachedFiles);

    // Add user message to history
    const userContent = [];
    if (text) {
        userContent.push({ type: 'text', text });
    }
    visionAttachedFiles.forEach(file => {
        if (file.type.startsWith('image/')) {
            userContent.push({
                type: 'image_url',
                image_url: { url: file.base64 }
            });
        } else if (file.type === 'application/pdf') {
            userContent.push({
                type: 'pdf_url',
                pdf_url: { url: file.base64 }
            });
        } else if (file.type.startsWith('audio/')) {
            userContent.push({
                type: 'audio_url',
                audio_url: { url: file.base64 }
            });
        }
    });

    // 更新状态
    state.chatHistory = [...visionChatHistory, { role: 'user', content: userContent }];

    // Clear inputs
    elements.visionInputText.value = '';
    attachmentManager.clearAttachedFile('vision');

    // Set loading state
    elements.visionSendButton.disabled = true;
    elements.visionSendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    const aiMessage = createVisionAIMessageElement();
    
    // 设置当前AI消息容器
    state.currentAIMessageContentDiv = {
        markdownContainer: aiMessage.markdownContainer,
        reasoningContainer: aiMessage.reasoningContainer,
        rawMarkdownBuffer: '',
        rawReasoningBuffer: ''
    };

    aiMessage.markdownContainer.innerHTML = '<p>正在请求模型...</p>';
    Logger.info(`Requesting vision model: ${selectedModelConfig.name}`, 'system');

    try {
        // 构建请求体
        const requestBody = _buildVisionRequestBody(selectedModelConfig, selectedPrompt, userContent);

        // 获取API密钥（这里需要根据您的实现调整）
        const apiKey = document.getElementById('api-key')?.value || localStorage.getItem('apiKey');
        if (!apiKey) {
            throw new Error('API密钥未设置');
        }

        // 使用 ChatApiHandler 处理流式响应
        await chatApiHandler.streamChatCompletion(requestBody, apiKey);

        // 更新视觉聊天历史
        if (state.currentAIMessageContentDiv.rawMarkdownBuffer) {
            visionChatHistory.push({ 
                role: 'assistant', 
                content: state.currentAIMessageContentDiv.rawMarkdownBuffer 
            });
        }

        // 在实时分析模式下自动提取和显示棋步推荐
        if (selectedPrompt.id === 'chess_realtime_analysis' && state.currentAIMessageContentDiv.rawMarkdownBuffer) {
            const extractedMoves = _extractAllSANFromText(state.currentAIMessageContentDiv.rawMarkdownBuffer);
            if (extractedMoves.length > 0) {
                setTimeout(async () => {
                    try {
                        await _presentMoveSelectionModal(extractedMoves, state.currentAIMessageContentDiv.rawMarkdownBuffer);
                    } catch (error) {
                        if (error.message !== '用户取消了走法选择') {
                            console.error('显示走法选择模态框时出错:', error);
                        }
                    }
                }, 500);
            }
        }

    } catch (error) {
        console.error('Error sending vision message:', error);
        const { markdownContainer } = state.currentAIMessageContentDiv || aiMessage;
        if (markdownContainer) {
            markdownContainer.innerHTML = `<p><strong>请求失败:</strong> ${error.message}</p>`;
        }
        Logger.info(`视觉模型请求失败: ${error.message}`, 'system');
    } finally {
        elements.visionSendButton.disabled = false;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        state.currentAIMessageContentDiv = null;
    }
}

/**
 * Displays a user's message in the vision chat UI.
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
                attachmentElement.style.maxWidth = '200px';
                attachmentElement.style.maxHeight = '200px';
                attachmentElement.style.borderRadius = '8px';
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
 */
function getSelectedPrompt() {
    if (!elements.visionPromptSelect) {
        return CONFIG.VISION.PROMPTS[0];
    }
    
    const selectedId = elements.visionPromptSelect.value;
    return CONFIG.VISION.PROMPTS.find(prompt => prompt.id === selectedId) || CONFIG.VISION.PROMPTS[0];
}

/**
 * 从文本中提取所有SAN走法
 */
function _extractAllSANFromText(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    // 简化实现，实际使用时需要完整的提取逻辑
    const sanPattern = /\b(?:O-O-O|O-O|(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)|[a-h][1-8])\b/gi;
    const matches = text.match(sanPattern) || [];
    
    // 去重并保留顺序
    const seen = new Set();
    const unique = [];
    for (const mv of matches) {
        if (mv && !seen.has(mv)) {
            seen.add(mv);
            unique.push(mv);
        }
    }

    return unique;
}

/**
 * 显示走法选择模态框
 */
function _presentMoveSelectionModal(moves, analysisText) {
    return new Promise((resolve, reject) => {
        // 简化的模态框实现
        const modal = document.createElement('div');
        modal.id = 'vision-move-choice-modal';
        modal.className = 'chess-ai-choice-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        modal.innerHTML = `
            <div class="chess-ai-choice-content" style="
                background: white;
                padding: 20px;
                border-radius: 8px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            ">
                <h2 style="margin-top: 0; color: #333;">AI 推荐走法</h2>
                <div class="ai-analysis-container" style="margin-bottom: 20px;">
                    <p><strong>AI 分析:</strong></p>
                    <div class="ai-analysis-text" style="
                        background: #f5f5f5;
                        padding: 12px;
                        border-radius: 4px;
                        border-left: 4px solid #007bff;
                        font-size: 14px;
                        line-height: 1.4;
                        max-height: 200px;
                        overflow-y: auto;
                    ">${analysisText}</div>
                </div>
                <div class="ai-move-choices" style="margin-bottom: 20px;">
                    <p><strong>请选择一个走法执行:</strong></p>
                    <div id="vision-move-choices-container" style="
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    "></div>
                </div>
                <div class="chess-ai-choice-buttons" style="
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                ">
                    <button id="vision-move-cancel-btn" class="chess-btn-secondary" style="
                        padding: 8px 16px;
                        border: 1px solid #ddd;
                        background: #f8f9fa;
                        border-radius: 4px;
                        cursor: pointer;
                    ">取消</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 填充走法选项
        const choicesContainer = document.getElementById('vision-move-choices-container');
        moves.forEach((move) => {
            const moveButton = document.createElement('button');
            moveButton.className = 'ai-move-choice-btn';
            moveButton.style.cssText = `
                padding: 12px 16px;
                border: 2px solid #e9ecef;
                background: white;
                border-radius: 6px;
                cursor: pointer;
                text-align: left;
                transition: all 0.2s;
                font-weight: 500;
            `;
            
            moveButton.innerHTML = `
                <span style="font-size: 16px; color: #495057;">${move}</span>
            `;

            moveButton.addEventListener('click', () => {
                modal.remove();
                resolve(move);
            });

            choicesContainer.appendChild(moveButton);
        });

        // 取消按钮事件
        document.getElementById('vision-move-cancel-btn').addEventListener('click', () => {
            modal.remove();
            reject(new Error('用户取消了走法选择'));
        });

        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                reject(new Error('用户取消了走法选择'));
            }
        });
    });
}

/**
 * 生成对局总结
 */
async function generateGameSummary() {
    // 简化的实现
    const chessGame = getChessGameInstance();
    if (!chessGame) {
        showToastHandler('无法获取国际象棋对局数据，请确保棋局已初始化。');
        return;
    }

    const fenHistory = chessGame.getFullGameHistory();
    if (!fenHistory || fenHistory.length === 0) {
        showToastHandler('没有对局历史可以总结。');
        return;
    }

    showToastHandler('对局总结功能正在开发中');
}

/**
 * 在视觉聊天界面显示一条AI消息。
 */
export function displayVisionMessage(markdownContent) {
    if (!elements.visionMessageHistory) return;
    
    const { markdownContainer } = createVisionAIMessageElement();
    const contentToRender = typeof markdownContent === 'string' ? markdownContent : String(markdownContent);
    markdownContainer.innerHTML = marked.parse(contentToRender);

    // 渲染可能存在的数学公式
    if (typeof MathJax !== 'undefined' && MathJax.startup) {
        MathJax.startup.promise.then(() => {
            MathJax.typeset([markdownContainer]);
        }).catch((err) => console.error('MathJax typesetting failed:', err));
    }

    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}