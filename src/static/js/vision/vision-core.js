import { CONFIG } from '../config/config.js';
import { ApiHandler } from '../core/api-handler.js';
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
let toolManager = null;
const apiHandler = new ApiHandler();

/**
 * Initializes the Vision feature.
 * @param {object} el - A collection of DOM elements required by the vision module.
 * @param {object} manager - The global attachment manager instance.
 * @param {object} handlers - A collection of handler functions from other modules.
 * @param {object} toolManagerInstance - The tool manager instance for handling function calls.
 */
export function initializeVisionCore(el, manager, handlers, toolManagerInstance) {
    elements = el;
    attachmentManager = manager;
    showToastHandler = handlers.showToast;
    toolManager = toolManagerInstance;

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
 * 完整版：支持 Gemini 模型、工具调用、流式输出、递归工具调用处理。
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

    // 显示用户消息
    displayVisionUserMessage(text, visionAttachedFiles);

    // 构建聊天内容
    const userContent = [];
    if (text) userContent.push({ type: 'text', text });
    visionAttachedFiles.forEach(file => {
        userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
    });
    visionChatHistory.push({ role: 'user', content: userContent });

    // 清空输入区
    elements.visionInputText.value = '';
    attachmentManager.clearAttachedFile('vision');

    // 设置加载状态
    elements.visionSendButton.disabled = true;
    elements.visionSendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        await processVisionStream(selectedModel, selectedPrompt, visionChatHistory);
        Logger.info('✅ Vision AI response completed', 'system');
    } catch (error) {
        console.error('Error sending vision message:', error);
        Logger.info(`视觉模型请求失败: ${error.message}`, 'system');
    } finally {
        elements.visionSendButton.disabled = false;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
}

/**
 * 处理视觉模型的流式请求，包括工具调用
 * @param {string} selectedModel - 选择的模型名称
 * @param {object} selectedPrompt - 选择的提示词
 * @param {Array} currentHistory - 当前聊天历史
 * @param {boolean} isToolCallFollowUp - 是否为工具调用的后续请求
 */
async function processVisionStream(selectedModel, selectedPrompt, currentHistory, isToolCallFollowUp = false) {
    // ========= 🧩 构建基础请求体 =========
    const requestBody = {
        model: selectedModel,
        messages: [
            { role: 'system', content: selectedPrompt.systemPrompt },
            ...currentHistory
        ],
        stream: true,
        enable_reasoning: true,
    };

    // ========= 🧠 注入可用工具 =========
    requestBody.tools = [
        {
            type: "function",
            function: {
                name: "tavily_search",
                description: "Web search via Tavily API",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Search query" }
                    },
                    required: ["query"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "python_sandbox",
                description: "Run Python code securely in a sandbox",
                parameters: {
                    type: "object",
                    properties: {
                        code: { type: "string", description: "Python code to execute" }
                    },
                    required: ["code"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "firecrawl",
                description: "Web scraping/crawling/extraction tool",
                parameters: {
                    type: "object",
                    properties: {
                        mode: {
                            type: "string",
                            enum: ["scrape", "search", "crawl", "map", "extract", "check_status"]
                        },
                        parameters: { type: "object" }
                    },
                    required: ["mode", "parameters"]
                }
            }
        }
    ];

    // ========= ⚙️ Gemini 模型兼容性处理 =========
    if (selectedModel.includes('gemini')) {
        Logger.info('Detected Gemini model, applying ChatML compatibility mode.');
        requestBody.enableReasoning = true;
        requestBody.disableSearch = true;
    }

    console.log("🚀 [Vision] Final requestBody:", requestBody);

    let aiMessage = null;
    if (!isToolCallFollowUp) {
        aiMessage = createVisionAIMessageElement();
        aiMessage.markdownContainer.innerHTML = '<p>正在请求模型...</p>';
    }

    try {
        // ========= 🚀 发起流式请求 =========
        const reader = await apiHandler.fetchStream('/api/chat/completions', requestBody);
        const decoder = new TextDecoder('utf-8');
        let finalContent = '';
        let reasoningStarted = false;
        let answerStarted = false;
        let buffer = '';
        let functionCallDetected = false;
        let currentFunctionCall = null;

        if (aiMessage) {
            aiMessage.markdownContainer.innerHTML = ''; // 清空占位内容
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.substring(6);
                if (jsonStr === '[DONE]') return;

                try {
                    const data = JSON.parse(jsonStr);
                    const delta = data.choices?.[0]?.delta;

                    if (delta) {
                        // 检查是否有工具调用
                        const functionCallPart = delta.parts?.find(p => p.functionCall);
                        
                        if (functionCallPart) {
                            functionCallDetected = true;
                            currentFunctionCall = functionCallPart.functionCall;
                            Logger.info('Vision Function call detected:', currentFunctionCall);
                            showToastHandler(`🧠 正在调用 ${currentFunctionCall.name}...`);
                            
                            // 如果有AI消息，先保存当前内容
                            if (aiMessage && aiMessage.rawMarkdownBuffer) {
                                visionChatHistory.push({ 
                                    role: 'assistant', 
                                    content: aiMessage.rawMarkdownBuffer 
                                });
                            }
                            break; // 跳出循环处理工具调用
                        }

                        if (delta.reasoning_content) {
                            if (!aiMessage) aiMessage = createVisionAIMessageElement();
                            if (!reasoningStarted) {
                                aiMessage.reasoningContainer.style.display = 'block';
                                reasoningStarted = true;
                            }
                            aiMessage.rawReasoningBuffer += delta.reasoning_content;
                            aiMessage.reasoningContainer.querySelector('.reasoning-content').innerHTML += delta.reasoning_content.replace(/\n/g, '<br>');
                        }
                        if (delta.content) {
                            if (!aiMessage) aiMessage = createVisionAIMessageElement();
                            
                            if (reasoningStarted && !answerStarted) {
                                const separator = document.createElement('hr');
                                separator.className = 'answer-separator';
                                aiMessage.reasoningContainer.after(separator);
                                answerStarted = true;
                            }
                            finalContent += delta.content;
                            aiMessage.rawMarkdownBuffer += delta.content;
                            aiMessage.markdownContainer.innerHTML = marked.parse(aiMessage.rawMarkdownBuffer);
                        }
                    }
                } catch {
                    console.warn('Skipping invalid SSE data line');
                }
            }
            
            // 如果检测到工具调用，跳出主循环
            if (functionCallDetected) break;
            
            if (aiMessage && elements.visionMessageHistory) {
                elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
            }
        }

        // ========= 🛠️ 处理工具调用 =========
        if (functionCallDetected && currentFunctionCall) {
            await handleVisionToolCall(currentFunctionCall, selectedModel, selectedPrompt);
            return; // 工具调用会递归处理后续流程
        }

        // ========= ✅ 完成普通响应 =========
        if (aiMessage && aiMessage.rawMarkdownBuffer) {
            // 应用数学公式渲染
            if (typeof MathJax !== 'undefined' && MathJax.startup) {
                MathJax.startup.promise.then(() => {
                    MathJax.typeset([aiMessage.markdownContainer, aiMessage.reasoningContainer]);
                }).catch(err => console.error('MathJax typesetting failed:', err));
            }

            visionChatHistory.push({ 
                role: 'assistant', 
                content: aiMessage.rawMarkdownBuffer,
                reasoning: aiMessage.rawReasoningBuffer 
            });
        }

    } catch (error) {
        console.error('Error in vision stream processing:', error);
        if (aiMessage) {
            aiMessage.markdownContainer.innerHTML = `<p><strong>请求失败:</strong> ${error.message}</p>`;
        }
        throw error;
    }
}

/**
 * 处理视觉模块的工具调用
 * @param {object} functionCall - 函数调用对象
 * @param {string} selectedModel - 模型名称
 * @param {object} selectedPrompt - 提示词对象
 */
async function handleVisionToolCall(functionCall, selectedModel, selectedPrompt) {
    try {
        Logger.info(`Executing vision tool: ${functionCall.name}`, 'system');
        showToastHandler(`🛠️ 执行工具: ${functionCall.name}`);
        
        // 执行工具调用
        const toolResult = await toolManager.handleToolCall(functionCall);
        const toolResponsePart = toolResult.functionResponses[0].response.output;

        // 将工具调用和响应添加到历史记录
        visionChatHistory.push({
            role: 'assistant',
            parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }]
        });

        visionChatHistory.push({
            role: 'tool',
            parts: [{ functionResponse: { name: functionCall.name, response: toolResponsePart } }]
        });

        // 递归处理后续响应
        await processVisionStream(selectedModel, selectedPrompt, visionChatHistory, true);

    } catch (toolError) {
        Logger.error('Vision tool execution failed:', toolError);
        showToastHandler(`❌ 工具执行失败: ${toolError.message}`);
        
        // 即使失败也要将错误信息添加到历史记录
        visionChatHistory.push({
            role: 'assistant',
            parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }]
        });

        visionChatHistory.push({
            role: 'tool',
            parts: [{ functionResponse: { name: functionCall.name, response: { error: toolError.message } } }]
        });

        // 继续处理，让模型知道工具调用失败
        await processVisionStream(selectedModel, selectedPrompt, visionChatHistory, true);
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
        reasoningContainer,
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
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        }

        // 应用数学公式渲染
        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }

        // 将总结添加到视觉聊天历史
        visionChatHistory.push({ role: 'assistant', content: finalContent });

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
 */
export function displayVisionMessage(markdownContent) {
    if (!elements.visionMessageHistory) {
        console.error('Vision message history element not found.');
        return;
    }

    // 使用现有的函数来创建和渲染AI消息元素
    const { markdownContainer, reasoningContainer } = createVisionAIMessageElement();
    
    // 渲染 Markdown 内容
    const contentToRender = typeof markdownContent === 'string' ? markdownContent : String(markdownContent);
    markdownContainer.innerHTML = marked.parse(contentToRender);

    // 渲染可能存在的数学公式
    if (typeof MathJax !== 'undefined' && MathJax.startup) {
        MathJax.startup.promise.then(() => {
            MathJax.typeset([markdownContainer, reasoningContainer]);
        }).catch((err) => console.error('MathJax typesetting failed:', err));
    }

    // 将这条消息添加到内部历史记录中，以保持一致性
    visionChatHistory.push({ role: 'assistant', content: contentToRender });

    // 滚动到底部
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}