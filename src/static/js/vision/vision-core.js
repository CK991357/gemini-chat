// vision-core.js - 采用专属 API Handler 的最终架构版本
import { getChessGameInstance } from '../chess/chess-core.js';
import { CONFIG } from '../config/config.js';
import { Logger } from '../utils/logger.js';

// Module-level state
let elements = {};
let attachmentManager = null;
let showToastHandler = null;
let chatApiHandlerInstance = null; // 这个实例现在是 Vision 模式专属的
let isVisionActive = false; // 跟踪视觉模式是否激活
let handlers = {}; // T16: 新增，保存 handlers 对象

/**
 * [新增] 导出函数，用于从外部（如 main.js）清空 Vision 模式的聊天历史。
 */
export function clearVisionHistory() {
    if (chatApiHandlerInstance) {
        // 清空专属 handler 内部的状态
        chatApiHandlerInstance.state.chatHistory = [];
        chatApiHandlerInstance.state.currentSessionId = null;
        chatApiHandlerInstance.state.currentAIMessageContentDiv = null;
        chatApiHandlerInstance.state.isUsingTool = false;
    }
    if (elements.visionMessageHistory) {
        elements.visionMessageHistory.innerHTML = '';
    }
    
    // 同时清除历史管理器中的当前会话
    if (handlers.historyManager && handlers.historyManager.clearCurrentSession) {
        handlers.historyManager.clearCurrentSession();
    }
    
    Logger.info('Vision chat history cleared.');
}

/**
 * 设置视觉模式激活状态
 */
export function setVisionActive(active) {
    isVisionActive = active;
}

/**
 * Initializes the Vision feature.
 */
export function initializeVisionCore(el, manager, handlersObj) { // 重命名参数以避免冲突
    elements = el;
    attachmentManager = manager;
    handlers = handlersObj; // T16: 保存 handlers 对象
    showToastHandler = handlers.showToast;
    // [关键] 接收专属的 chatApiHandler 实例
    chatApiHandlerInstance = handlers.chatApiHandler;

    if (!validateConfig()) {
        Logger.error('Vision configuration validation failed');
        return;
    }

    populateModelSelect();
    populatePromptSelect();
    attachEventListeners();

    Logger.info('Vision module initialized with a dedicated API handler.');
}

/**
 * Validates required configuration
 */
function validateConfig() {
    if (!CONFIG.VISION) {
        console.error('CONFIG.VISION is not defined');
        showToastHandler('Vision configuration is missing');
        return false;
    }

    if (!CONFIG.VISION.MODELS || CONFIG.VISION.MODELS.length === 0) {
        console.error('No vision models configured');
        showToastHandler('No vision models available');
        return false;
    }

    if (!CONFIG.VISION.PROMPTS || CONFIG.VISION.PROMPTS.length === 0) {
        console.error('No vision prompts configured');
        showToastHandler('No vision prompts available');
        return false;
    }

    return true;
}

/**
 * Populates the vision model selection dropdown with VISION.MODELS only.
 */
function populateModelSelect() {
    if (!elements.visionModelSelect) {
        console.warn('visionModelSelect element not found');
        return;
    }

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

    Logger.info(`Populated ${CONFIG.VISION.MODELS.length} vision models`);
}

/**
 * Populates the vision prompt selection dropdown.
 */
function populatePromptSelect() {
    if (!elements.visionPromptSelect) {
        console.warn('visionPromptSelect element not found');
        return;
    }

    elements.visionPromptSelect.innerHTML = '';
    
    CONFIG.VISION.PROMPTS.forEach(prompt => {
        const option = document.createElement('option');
        option.value = prompt.id;
        option.textContent = prompt.name;
        option.title = prompt.description || '';
        if (prompt.id === CONFIG.VISION.DEFAULT_PROMPT_ID) {
            option.selected = true;
        }
        elements.visionPromptSelect.appendChild(option);
    });
}

/**
 * Attaches event listeners for vision UI.
 */
function attachEventListeners() {
    // 验证元素存在性
    if (!elements.visionSendButton) {
        console.error('visionSendButton element not found');
        return;
    }

    elements.visionSendButton?.addEventListener('click', () => handleSendVisionMessage());
    elements.visionAttachmentButton?.addEventListener('click', () => elements.visionFileInput?.click());
    elements.visionFileInput?.addEventListener('change', (event) => attachmentManager.handleFileAttachment(event, 'vision'));
    elements.visionSummaryButton?.addEventListener('click', () => generateGameSummary());
    
    // 视觉模式内部子标签事件监听器
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

    // 确保视觉模式主容器的显示状态正确
    const visionModeButton = document.getElementById('vision-mode-button');
    const visionContainer = document.querySelector('.vision-container');
    
    if (visionModeButton && visionContainer) {
        visionModeButton.addEventListener('click', () => {
            // 切换视觉模式激活状态
            const isActive = visionContainer.classList.contains('active');
            if (!isActive) {
                visionContainer.classList.add('active');
                visionModeButton.classList.add('active');
                setVisionActive(true);
            }
        });
    }

    Logger.info('Vision event listeners attached');
}

/**
 * Handles sending vision messages using its dedicated chatApiHandler.
 */
async function handleSendVisionMessage() {
    if (!validateUIElements()) return;

    const text = elements.visionInputText.value.trim();
    const visionAttachedFiles = attachmentManager.getVisionAttachedFiles();
    
    if (!text && visionAttachedFiles.length === 0) {
        showToastHandler('请输入文本或添加附件。');
        return;
    }

    try {
        const selectedModel = elements.visionModelSelect.value;
        const selectedPrompt = getSelectedPrompt();

        const modelConfig = getModelConfig(selectedModel);
        if (!modelConfig) {
            showToastHandler(`模型配置不存在: ${selectedModel}`);
            return;
        }

        // 准备用户消息内容
        const userContent = prepareUserContent(text, visionAttachedFiles);
        
        // 1. 从专属 Vision API Handler 的状态中获取当前完整的历史记录，并创建一个副本
        //    Vision API Handler 的 chatHistory 状态已在 main.js 中初始化为 visionHistoryManager 的消息
        const messages = [...chatApiHandlerInstance.state.chatHistory];
        
        // 2. 仅添加当前的用户新消息
        messages.push({
            role: 'user',
            content: userContent
        });
        
        // 3. 移除此处多余的 system prompt 添加逻辑，系统指令将由 buildVisionRequestBody 统一处理。

        // 在UI上显示用户消息并清空输入
        displayVisionUserMessage(text, visionAttachedFiles);
        elements.visionInputText.value = '';
        attachmentManager.clearAttachedFile('vision');

        // 保存用户消息到历史
        if (handlers.historyManager && handlers.historyManager.addMessage) {
            // 确保保存完整的 userContent 数组，以便历史记录可以正确加载图片等附件
            handlers.historyManager.addMessage({
                role: 'user',
                content: userContent, // 修改为保存完整的 userContent 数组
                files: visionAttachedFiles,
                timestamp: new Date().toISOString()
            });
        }

        setSendButtonLoading(true);

        // 使用构建的消息数组构建请求体
        const requestBody = buildVisionRequestBody(
            selectedModel,
            selectedPrompt,
            messages // 传递完整的消息数组，而不是历史记录
        );

        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error('请先在设置中配置 API Key');
        }
        
        const visionUiAdapter = createVisionUIAdapter();
        
        if (!chatApiHandlerInstance) {
            throw new Error('Vision Chat API Handler 未初始化。');
        }
        
        // 直接调用，无需任何状态切换
        await chatApiHandlerInstance.streamChatCompletion(requestBody, apiKey, visionUiAdapter);

        // AI回复会自动保存到 chatApiHandlerInstance.state.chatHistory 中

        Logger.info(`Vision request completed for model: ${selectedModel}`, 'system');

    } catch (error) {
        console.error('Vision request failed:', error);
        const errorMessage = getErrorMessage(error);
        showToastHandler(`Vision 请求失败: ${errorMessage}`);
        displayErrorMessage(errorMessage);
    } finally {
        setSendButtonLoading(false);
    }
}

/**
 * Validates required UI elements
 */
function validateUIElements() {
    const requiredElements = [
        'visionInputText', 'visionMessageHistory', 'visionSendButton'
    ];

    for (const elementName of requiredElements) {
        if (!elements[elementName]) {
            console.error(`Required element not found: ${elementName}`);
            showToastHandler('界面初始化错误，请刷新页面重试');
            return false;
        }
    }

    return true;
}

/**
 * Sets send button loading state
 */
function setSendButtonLoading(isLoading) {
    if (!elements.visionSendButton) return;

    if (isLoading) {
        elements.visionSendButton.disabled = true;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    } else {
        elements.visionSendButton.disabled = false;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
}

/**
 * Gets model configuration
 */
function getModelConfig(modelName) {
    // 优先从 API 配置查找，确保与 Chat 模式一致
    let modelConfig = CONFIG.API.AVAILABLE_MODELS.find(m => m.name === modelName);
    if (!modelConfig) {
        modelConfig = CONFIG.VISION.MODELS.find(m => m.name === modelName);
    }
    return modelConfig;
}

/**
 * Extracts user-friendly error message
 */
function getErrorMessage(error) {
    if (error.message.includes('API Key')) {
        return '请检查 API Key 配置';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
        return '网络连接错误，请检查网络连接';
    } else if (error.message.includes('timeout')) {
        return '请求超时，请稍后重试';
    } else {
        return error.message || '未知错误';
    }
}

/**
 * Displays error message in vision interface
 */
function displayErrorMessage(message) {
    if (!elements.visionMessageHistory) return;

    const errorMessage = createVisionAIMessageElement();
    errorMessage.markdownContainer.innerHTML = `<p class="error-message"><strong>错误:</strong> ${message}</p>`;
    scrollVisionToBottom();
}

/**
 * Builds request body for vision requests.
 * @param {string} modelName
 * @param {object} selectedPrompt
 * @param {Array} messages - The complete message array for this request.
 */
function buildVisionRequestBody(modelName, selectedPrompt, messages) {
    const modelConfig = getModelConfig(modelName);
    
    const requestBody = {
        model: modelName,
        messages: messages, // 使用传入的消息数组
        stream: true
    };

    // 添加系统指令（如果存在）- 使用正确的格式
    if (selectedPrompt && selectedPrompt.systemPrompt) {
        requestBody.systemInstruction = {
            parts: [{ text: selectedPrompt.systemPrompt }]
        };
    }

    // 添加必要的配置字段，确保与 chat 模式一致
    requestBody.generationConfig = {
        responseModalities: ['text']
    };

    requestBody.safetySettings = [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
    ];

    // 动态添加工具配置
    if (modelConfig?.tools) {
        requestBody.tools = modelConfig.tools;
        Logger.info(`Added tools for model: ${modelName}`);
    }

    // 动态添加思维链配置
    if (modelConfig?.enableReasoning) {
        requestBody.enableReasoning = true;
        Logger.info(`Enabled reasoning for model: ${modelName}`);
    }

    // 动态添加搜索配置
    if (modelConfig?.disableSearch) {
        requestBody.disableSearch = true;
        Logger.info(`Disabled search for model: ${modelName}`);
    } else {
        requestBody.enableGoogleSearch = true;
    }

    Logger.info(`Built request body for model: ${modelName}`, {
        hasTools: !!modelConfig?.tools,
        enableReasoning: !!modelConfig?.enableReasoning,
        disableSearch: !!modelConfig?.disableSearch,
        messagesCount: messages.length
    });

    return requestBody;
}

/**
 * Creates a UI adapter that redirects ChatApiHandler output to Vision interface.
 */
function createVisionUIAdapter() {
    return {
        // Core message functions
        createAIMessageElement: createVisionAIMessageElement,
        displayUserMessage: displayVisionUserMessage,
        
        // Tool call status
        displayToolCallStatus: (toolName, args) => {
            if (!elements.visionMessageHistory) return;
            
            const statusDiv = document.createElement('div');
            statusDiv.className = 'tool-call-status vision-tool-call';
            
            const icon = document.createElement('i');
            icon.className = 'fas fa-cog fa-spin';
            
            const text = document.createElement('span');
            text.textContent = `正在调用工具: ${toolName}...`;
            
            statusDiv.appendChild(icon);
            statusDiv.appendChild(text);
            
            elements.visionMessageHistory.appendChild(statusDiv);
            scrollVisionToBottom();

            Logger.info(`Tool call started: ${toolName}`);
        },
        
        // Image result display
        displayImageResult: (base64Image, altText = 'Generated Image', fileName = 'generated_image.png') => {
            if (!elements.visionMessageHistory) return;

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
            contentDiv.appendChild(imageElement);

            // Get image dimensions and type
            let dimensions = 'N/A';
            let imageType = 'image/png';

            const mimeMatch = base64Image.match(/^data:(image\/[a-zA-Z0-9-.+]+);base64,/);
            if (mimeMatch && mimeMatch[1]) {
                imageType = mimeMatch[1];
            } else if (base64Image.startsWith('/9j/')) {
                imageType = 'image/jpeg';
            } else if (base64Image.startsWith('iVBORw0KGgo')) {
                imageType = 'image/png';
            }

            imageElement.onload = () => {
                dimensions = `${imageElement.naturalWidth}x${imageElement.naturalHeight} px`;
                const base64Length = base64Image.length;
                const sizeInBytes = (base64Length * 0.75) - (base64Image.endsWith('==') ? 2 : (base64Image.endsWith('=') ? 1 : 0));
                const sizeInKB = (sizeInBytes / 1024).toFixed(2);
                const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
                let size = sizeInKB < 1024 ? `${sizeInKB} KB` : `${sizeInMB} MB`;

                imageElement.addEventListener('click', () => {
                    if (typeof openImageModal === 'function') {
                        openImageModal(imageElement.src, altText, dimensions, size, imageType);
                    }
                });
            };

            messageDiv.appendChild(avatarDiv);
            messageDiv.appendChild(contentDiv);
            elements.visionMessageHistory.appendChild(messageDiv);
            scrollVisionToBottom();

            Logger.info('Image result displayed in vision interface');
        },
        
        // Scrolling
        scrollToBottom: scrollVisionToBottom,
        
        // Logging
        logMessage: (message, type = 'system') => {
            Logger.info(`[Vision] ${type}: ${message}`);
            if (type === 'system' && (message.includes('错误') || message.includes('失败'))) {
                showToastHandler(message);
            }
        }
    };
}

/**
 * 生成对局总结 - 复用Chat模块逻辑
 */
async function generateGameSummary() {
    if (!elements.visionMessageHistory || !elements.visionSummaryButton) {
        showToastHandler('界面元素未初始化');
        return;
    }

    let chessGame = null;
    
    // 尝试多种方式获取国际象棋实例
    if (typeof window.chessGame !== 'undefined') {
        chessGame = window.chessGame;
    } else if (typeof getChessGameInstance === 'function') {
        chessGame = getChessGameInstance();
    } else {
        chessGame = window.chessGameInstance;
    }
    
    if (!chessGame) {
        showToastHandler('无法获取国际象棋对局数据，请确保棋局已初始化。');
        return;
    }

    if (typeof chessGame.getFullGameHistory !== 'function') {
        showToastHandler('国际象棋实例方法不可用');
        return;
    }

    const fenHistory = chessGame.getFullGameHistory();
    if (!fenHistory || fenHistory.length === 0) {
        showToastHandler('没有对局历史可以总结。');
        return;
    }

    const selectedModel = elements.visionModelSelect.value;
    const summaryButton = elements.visionSummaryButton;
    
    // 设置按钮加载状态
    summaryButton.disabled = true;
    summaryButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 分析中...';
    
    // 创建总结消息元素
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在分析对局历史...</p>';

    try {
        const summaryPromptConfig = CONFIG.VISION.PROMPTS.find(prompt => prompt.id === 'chess_summary');
        const systemPrompt = summaryPromptConfig ? summaryPromptConfig.systemPrompt : `你是一位国际象棋特级大师。请基于提供的完整对局历史（FEN格式）生成一份详细的对局总结和分析。`;

        const requestBody = {
            model: selectedModel,
            messages: [
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

        // 添加系统指令
        if (systemPrompt) {
            requestBody.systemInstruction = {
                parts: [{ text: systemPrompt }]
            };
        }

        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error('请先在设置中配置 API Key');
        }

        const visionUiAdapter = createVisionUIAdapter();
        
        if (!chatApiHandlerInstance) {
            throw new Error('Chat API Handler 未初始化，无法发送请求。');
        }
        
        await chatApiHandlerInstance.streamChatCompletion(requestBody, apiKey, visionUiAdapter);

        Logger.info('对局总结生成完成', 'system');

    } catch (error) {
        console.error('Error generating game summary:', error);
        const errorMessage = getErrorMessage(error);
        markdownContainer.innerHTML = `<p class="error-message"><strong>总结生成失败:</strong> ${errorMessage}</p>`;
        Logger.info(`对局总结生成失败: ${errorMessage}`, 'system');
        showToastHandler(`总结生成失败: ${errorMessage}`);
    } finally {
        summaryButton.disabled = false;
        summaryButton.innerHTML = '对局总结';
    }
}

// ========== VISION UI FUNCTIONS ==========

/**
 * Displays a user's message in the vision chat UI.
 */
function displayVisionUserMessage(text, files) {
    if (!elements.visionMessageHistory) return;

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
                attachmentElement.alt = file.name || '上传的图片';
            } else if (file.type.startsWith('video/')) {
                attachmentElement = document.createElement('video');
                attachmentElement.src = file.base64;
                attachmentElement.controls = true;
                attachmentElement.style.maxWidth = '200px';
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
 */
function createVisionAIMessageElement() {
    if (!elements.visionMessageHistory) return null;

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
    copyButton.title = '复制内容';
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
            showToastHandler('复制失败，请重试');
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
 * 在视觉聊天界面显示一条AI消息。
 */
export function displayVisionMessage(markdownContent) {
    if (!elements.visionMessageHistory) {
        console.error('Vision message history element not found.');
        return;
    }

    const { markdownContainer, reasoningContainer } = createVisionAIMessageElement();
    if (!markdownContainer) return;
    
    const contentToRender = typeof markdownContent === 'string' ? markdownContent : String(markdownContent);
    markdownContainer.innerHTML = marked.parse(contentToRender);

    if (typeof MathJax !== 'undefined' && MathJax.startup) {
        MathJax.startup.promise.then(() => {
            MathJax.typeset([markdownContainer, reasoningContainer]);
        }).catch((err) => console.error('MathJax typesetting failed:', err));
    }

    scrollVisionToBottom();
}

// ========== UTILITY FUNCTIONS ==========

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
 * Prepares user content array from text and files.
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
 * Gets the API key from main interface.
 */
function getApiKey() {
    const apiKeyInput = document.getElementById('api-key');
    return apiKeyInput ? apiKeyInput.value.trim() : localStorage.getItem('gemini_api_key');
}

/**
 * Scrolls the vision message history to bottom.
 */
function scrollVisionToBottom() {
    if (elements.visionMessageHistory) {
        requestAnimationFrame(() => {
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        });
    }
}