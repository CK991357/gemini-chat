import { initializeChessAIEnhanced } from '../chess/chess-ai-enhanced.js';
import { getChessGameInstance } from '../chess/chess-core.js';
import { CONFIG } from '../config/config.js';
import { ApiHandler } from '../core/api-handler.js'; // 用于 GLM 模型
import { Logger } from '../utils/logger.js';

/**
 * @fileoverview Core logic for the Vision feature.
 * Handles UI initialization, API calls, and message display for multimodal vision chat.
 * Now supports both GLM models (via ApiHandler) and Gemini models (via ChatApiHandler).
 */

// Module-level state
let elements = {};
let visionChatHistory = [];
let attachmentManager = null;
let showToastHandler = null;
let chatApiHandlerInstance = null; // 新增：存储注入的 ChatApiHandler 实例
const apiHandler = new ApiHandler(); // 用于 GLM 模型

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
    chatApiHandlerInstance = handlers.chatApiHandler; // 接收注入的 ChatApiHandler 实例

    // 检查关键依赖是否就绪
    if (!chatApiHandlerInstance) {
        console.warn('ChatApiHandler instance not provided to Vision module. Gemini models will not be available.');
    }

    populateModelSelect();
    populatePromptSelect();
    attachEventListeners();

    // 初始化 Chess AI 模块
    try {
        const chessGame = getChessGameInstance();
        if (chessGame) {
            initializeChessAIEnhanced(chessGame, {
                showToast: showToastHandler,
                logMessage: Logger.info,
                displayVisionMessage: displayVisionMessage,
            });
            Logger.info('ChessAIEnhanced module initialized successfully.');
        } else {
            Logger.warn('Could not get chessGame instance to initialize ChessAIEnhanced.');
        }
    } catch (error) {
        console.error('Failed to initialize ChessAIEnhanced:', error);
        showToastHandler(`错误：无法初始化国际象棋AI模块: ${error.message}`);
    }

    Logger.info('Vision module initialized with dual-model support.');
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
 * Routes to appropriate handler based on model type.
 */
async function handleSendVisionMessage() {
    const text = elements.visionInputText.value.trim();
    const visionAttachedFiles = attachmentManager.getVisionAttachedFiles();
    if (!text && visionAttachedFiles.length === 0) {
        showToastHandler('请输入文本或添加附件。');
        return;
    }

    const selectedModel = elements.visionModelSelect.value;
    const modelConfig = CONFIG.VISION.MODELS.find(m => m.name === selectedModel);

    // Display user message in the UI
    displayVisionUserMessage(text, visionAttachedFiles);

    // Clear inputs
    elements.visionInputText.value = '';
    attachmentManager.clearAttachedFile('vision');

    // Route to appropriate handler based on model type
    if (modelConfig && modelConfig.isGemini && chatApiHandlerInstance) {
        // Use ChatApiHandler for Gemini models
        await handleGeminiVisionRequest(selectedModel, text, visionAttachedFiles);
    } else {
        // Use original ApiHandler for GLM models
        await handleGlmVisionRequest(selectedModel, text, visionAttachedFiles);
    }
}

/**
 * Handles Gemini model requests using the injected ChatApiHandler.
 * @param {string} modelName - The selected model name.
 * @param {string} text - The text message.
 * @param {Array} files - Array of attached files.
 */
async function handleGeminiVisionRequest(modelName, text, files) {
    // Set loading state
    elements.visionSendButton.disabled = true;
    elements.visionSendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
        // Create UI adapter for vision interface
        const visionUiAdapter = createVisionUIAdapter();
        
        // Prepare message content
        const userContent = prepareUserContent(text, files);
        visionChatHistory.push({ role: 'user', content: userContent });

        // Build request body
        const requestBody = buildGeminiRequestBody(modelName);
        
        // Get API key
        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error('请先在设置中配置 API Key');
        }

        // Use ChatApiHandler to process the request
        await chatApiHandlerInstance.streamChatCompletion(requestBody, apiKey, visionUiAdapter);

        // Extract final response and add to vision history
        const finalResponse = extractFinalResponseFromVisionUI();
        if (finalResponse) {
            visionChatHistory.push({ role: 'assistant', content: finalResponse });
        }

        Logger.info(`Gemini vision request completed for model: ${modelName}`, 'system');

    } catch (error) {
        console.error('Error processing Gemini vision request:', error);
        // Display error in vision interface
        const { markdownContainer } = createVisionAIMessageElement();
        markdownContainer.innerHTML = `<p><strong>Gemini 请求失败:</strong> ${error.message}</p>`;
        showToastHandler(`Gemini 请求失败: ${error.message}`);
    } finally {
        // Restore button state
        elements.visionSendButton.disabled = false;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
}

/**
 * Creates a UI adapter that redirects ChatApiHandler output to Vision interface.
 * @returns {object} UI adapter object.
 */
function createVisionUIAdapter() {
    return {
        // Core message functions
        createAIMessageElement: () => {
            const element = createVisionAIMessageElement();
            // 确保返回的对象包含所有必要的属性
            return {
                container: element.container,
                markdownContainer: element.markdownContainer,
                reasoningContainer: element.reasoningContainer,
                contentDiv: element.contentDiv,
                rawMarkdownBuffer: element.rawMarkdownBuffer || '',
                rawReasoningBuffer: element.rawReasoningBuffer || ''
            };
        },
        displayUserMessage: (text, files) => {
            // User message is already displayed, but we implement for completeness
            if (files && files.length > 0) {
                displayVisionUserMessage(text || '', files);
            }
        },
        
        // Logging and status
        logMessage: (message, type = 'system') => {
            Logger.info(`[Vision-Gemini] ${type}: ${message}`);
            // Optional: Display system messages in vision interface
            if (type === 'system' && message.includes('错误') || message.includes('失败')) {
                showToastHandler(message);
            }
        },
        
        // Tool call status
        displayToolCallStatus: (toolName, args) => {
            if (!elements.visionMessageHistory) return;
            const statusDiv = document.createElement('div');
            statusDiv.className = 'tool-call-status vision-tool-call';
            statusDiv.innerHTML = `
                <i class="fas fa-cog fa-spin"></i>
                <span>正在调用工具: ${toolName}...</span>
            `;
            elements.visionMessageHistory.appendChild(statusDiv);
            scrollVisionToBottom();
        },
        
        // Image result display with vision context
        displayImageResult: (base64Image, altText = 'Generated Image', fileName = 'generated_image.png') => {
            // Create a dedicated vision message for the image
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', 'ai');
            
            const avatarDiv = document.createElement('div');
            avatarDiv.classList.add('avatar');
            avatarDiv.textContent = '🤖';
            
            const contentDiv = document.createElement('div');
            contentDiv.classList.add('content', 'image-result-content');
            
            const imageElement = document.createElement('img');
            imageElement.src = `data:image/png;base64,${base64Image}`;
            imageElement.alt = altText;
            imageElement.classList.add('chat-image-result');
            imageElement.style.maxWidth = '100%';
            imageElement.style.borderRadius = '8px';
            
            // Add click handler for modal view
            imageElement.addEventListener('click', () => {
                if (typeof openImageModal === 'function') {
                    openImageModal(imageElement.src, altText, '未知尺寸', '未知大小', 'image/png');
                }
            });
            
            contentDiv.appendChild(imageElement);
            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(contentDiv);
            
            if (elements.visionMessageHistory) {
                elements.visionMessageHistory.appendChild(messageDiv);
                scrollVisionToBottom();
            }
        },
        
        // Scrolling
        scrollToBottom: () => scrollVisionToBottom()
    };
}

/**
 * Handles GLM model requests using the original ApiHandler.
 * @param {string} modelName - The selected model name.
 * @param {string} text - The text message.
 * @param {Array} files - Array of attached files.
 */
async function handleGlmVisionRequest(modelName, text, files) {
    const selectedPrompt = getSelectedPrompt();

    // Prepare user content
    const userContent = prepareUserContent(text, files);
    visionChatHistory.push({ role: 'user', content: userContent });

    // Set loading state
    elements.visionSendButton.disabled = true;
    elements.visionSendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在请求模型...</p>';
    Logger.info(`Requesting GLM vision model: ${modelName}`, 'system');

    try {
        const requestBody = {
            model: modelName,
            messages: [
                { role: 'system', content: selectedPrompt.systemPrompt },
                ...visionChatHistory
            ],
            stream: true,
        };

        // Use original ApiHandler for GLM models
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
            buffer = lines.pop() || ''; // Keep incomplete data

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
                        console.warn('Skipping invalid SSE data:', jsonStr);
                    }
                }
            }
            scrollVisionToBottom();
        }

        // Apply MathJax rendering
        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }

        visionChatHistory.push({ role: 'assistant', content: finalContent });

    } catch (error) {
        console.error('Error sending GLM vision message:', error);
        markdownContainer.innerHTML = `<p><strong>GLM 请求失败:</strong> ${error.message}</p>`;
        Logger.info(`GLM 视觉模型请求失败: ${error.message}`, 'system');
        showToastHandler(`GLM 请求失败: ${error.message}`);
    } finally {
        elements.visionSendButton.disabled = false;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
}

/**
 * Prepares user content array from text and files.
 * @param {string} text - The text message.
 * @param {Array} files - Array of attached files.
 * @returns {Array} Formatted user content array.
 */
function prepareUserContent(text, files) {
    const userContent = [];
    if (text) {
        userContent.push({ type: 'text', text });
    }
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
        }
        // Add support for other file types if needed
    });
    return userContent;
}

/**
 * Builds request body for Gemini models.
 * @param {string} modelName - The model name.
 * @param {Array} userContent - The user content array.
 * @returns {object} Request body object.
 */
function buildGeminiRequestBody(modelName) { // 移除 userContent 参数
    const selectedPrompt = getSelectedPrompt();
    
    // 修正：从 API 配置中查找模型配置（因为工具定义在这里，与 Chat 模式对齐）
    const modelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === modelName);
    
    const requestBody = {
        model: modelName,
        messages: [
            {
                role: 'system',
                content: [{ type: 'text', text: selectedPrompt.systemPrompt }]
            },
            ...visionChatHistory // 使用完整的历史记录
        ],
        stream: true,
        safetySettings: CONFIG.API.SAFETY_SETTINGS || [
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
        ]
    };

    // 1. 添加工具配置（从 API 配置中获取）
    if (modelConfig && modelConfig.tools) {
        console.log(`[Vision] 为模型 ${modelName} 添加工具:`, modelConfig.tools);
        requestBody.tools = modelConfig.tools;
    } else {
        console.log(`[Vision] 模型 ${modelName} 未配置工具`);
    }

    // 2. 精确的思维链启用逻辑
    const enableReasoning = shouldEnableReasoning(modelName, modelConfig);
    if (enableReasoning) {
        console.log(`[Vision] 为模型 ${modelName} 启用思维链`);
        requestBody.enableReasoning = true;
    }

    // 3. 添加搜索禁用配置（如果模型配置了）
    if (modelConfig && modelConfig.disableSearch) {
        requestBody.disableSearch = true;
    }

    console.log(`[Vision] 最终请求体配置:`, {
        model: modelName,
        hasTools: !!(modelConfig && modelConfig.tools),
        enableReasoning: enableReasoning,
        disableSearch: !!(modelConfig && modelConfig.disableSearch)
    });

    return requestBody;
}

/**
 * Extracts the final response text from the vision UI.
 * @returns {string} The final response text.
 */
function extractFinalResponseFromVisionUI() {
    if (!elements.visionMessageHistory) return '';
    
    const lastAIMessage = elements.visionMessageHistory.querySelector('.message.ai:last-child');
    if (!lastAIMessage) return '';
    
    const markdownContainer = lastAIMessage.querySelector('.markdown-container');
    return markdownContainer ? markdownContainer.innerText : '';
}

/**
 * Gets the API key from main interface.
 * @returns {string} The API key.
 */
function getApiKey() {
    // Try to get API key from main interface
    const apiKeyInput = document.getElementById('api-key');
    return apiKeyInput ? apiKeyInput.value : localStorage.getItem('gemini_api_key');
}

/**
 * Scrolls the vision message history to bottom.
 */
function scrollVisionToBottom() {
    if (elements.visionMessageHistory) {
        elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
    }
}

// ========== EXISTING VISION UI FUNCTIONS (保持原样) ==========

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
    scrollVisionToBottom();
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
    scrollVisionToBottom();

    return {
        container: messageDiv,
        markdownContainer,
        reasoningContainer,
        contentDiv,
        rawMarkdownBuffer: '',
        rawReasoningBuffer: ''
    };
}

/**
 * 获取当前选择的提示词
 * @returns {object} 当前选择的提示词对象
 */
function getSelectedPrompt() {
    if (!elements.visionPromptSelect) {
        return CONFIG.VISION.PROMPTS[0];
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
    const modelConfig = CONFIG.VISION.MODELS.find(m => m.name === selectedModel);
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
        // 根据模型类型选择处理方式
        if (modelConfig && modelConfig.isGemini && chatApiHandlerInstance) {
            // 使用 Gemini 处理方式
            const visionUiAdapter = createVisionUIAdapter();
            const summaryPromptConfig = CONFIG.VISION.PROMPTS.find(prompt => prompt.id === 'chess_summary');
            const systemPrompt = summaryPromptConfig ? summaryPromptConfig.systemPrompt : `你是一位国际象棋特级大师。请基于提供的完整对局历史（FEN格式）生成一份详细的对局总结和分析。`;

            const requestBody = {
                model: selectedModel,
                messages: [
                    { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
                    { 
                        role: 'user', 
                        content: [
                            { 
                                type: 'text', 
                                text: `请分析以下国际象棋对局历史（共${fenHistory.length}步）：\n\n完整FEN历史：\n${fenHistory.join('\n')}\n\n当前局面：${fenHistory[fenHistory.length - 1]}\n\n请基于这个完整的对局历史，生成一份专业的对局分析总结。` 
                            }
                        ]
                    }
                ],
                stream: true
            };

            const apiKey = getApiKey();
            if (!apiKey) {
                throw new Error('请先在设置中配置 API Key');
            }

            await chatApiHandlerInstance.streamChatCompletion(requestBody, apiKey, visionUiAdapter);

        } else {
            // 使用 GLM 处理方式（原有逻辑）
            const summaryPromptConfig = CONFIG.VISION.PROMPTS.find(prompt => prompt.id === 'chess_summary');
            const systemPrompt = summaryPromptConfig ? summaryPromptConfig.systemPrompt : `你是一位国际象棋特级大师。请基于提供的完整对局历史（FEN格式）生成一份详细的对局总结和分析。`;

            const summaryRequest = {
                model: selectedModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { 
                        role: 'user', 
                        content: [
                            { 
                                type: 'text', 
                                text: `请分析以下国际象棋对局历史（共${fenHistory.length}步）：\n\n完整FEN历史：\n${fenHistory.join('\n')}\n\n当前局面：${fenHistory[fenHistory.length - 1]}\n\n请基于这个完整的对局历史，生成一份专业的对局分析总结。` 
                            }
                        ]
                    }
                ],
                stream: true
            };

            const reader = await apiHandler.fetchStream('/api/chat/completions', summaryRequest);
            const decoder = new TextDecoder('utf-8');
            let finalContent = '';
            let reasoningStarted = false;
            let answerStarted = false;
            let buffer = '';

            markdownContainer.innerHTML = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

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
                            console.warn('Skipping invalid SSE data:', jsonStr);
                        }
                    }
                }
                scrollVisionToBottom();
            }

            if (typeof MathJax !== 'undefined' && MathJax.startup) {
                MathJax.startup.promise.then(() => {
                    MathJax.typeset([markdownContainer, reasoningContainer]);
                }).catch((err) => console.error('MathJax typesetting failed:', err));
            }

            visionChatHistory.push({ role: 'assistant', content: finalContent });
        }

        Logger.info('对局总结生成完成', 'system');

    } catch (error) {
        console.error('Error generating game summary:', error);
        markdownContainer.innerHTML = `<p><strong>总结生成失败:</strong> ${error.message}</p>`;
        Logger.info(`对局总结生成失败: ${error.message}`, 'system');
        showToastHandler(`总结生成失败: ${error.message}`);
    } finally {
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
 */
export function displayVisionMessage(markdownContent) {
    if (!elements.visionMessageHistory) {
        console.error('Vision message history element not found.');
        return;
    }

    const { markdownContainer, reasoningContainer } = createVisionAIMessageElement();
    
    const contentToRender = typeof markdownContent === 'string' ? markdownContent : String(markdownContent);
    markdownContainer.innerHTML = marked.parse(contentToRender);

    if (typeof MathJax !== 'undefined' && MathJax.startup) {
        MathJax.startup.promise.then(() => {
            MathJax.typeset([markdownContainer, reasoningContainer]);
        }).catch((err) => console.error('MathJax typesetting failed:', err));
    }

    visionChatHistory.push({ role: 'assistant', content: contentToRender });
    scrollVisionToBottom();
}
/**
 * 判断是否应该为指定模型启用思维链
 * @param {string} modelName - 模型名称
 * @param {object} modelConfig - 模型配置对象
 * @returns {boolean} 是否启用思维链
 */
function shouldEnableReasoning(modelName, modelConfig) {
    // 优先检查模型特定配置
    if (modelConfig && modelConfig.enableReasoning !== undefined) {
        return modelConfig.enableReasoning;
    }
    
    // 其次检查全局设置（从主界面继承）
    try {
        // 尝试从主界面的 localStorage 获取设置
        const globalReasoningSetting = localStorage.getItem('geminiEnableReasoning');
        if (globalReasoningSetting !== null) {
            return globalReasoningSetting === 'true';
        }
    } catch (e) {
        console.warn('[Vision] 无法读取全局思维链设置:', e);
    }
    
    // 默认不启用思维链
    return false;
}