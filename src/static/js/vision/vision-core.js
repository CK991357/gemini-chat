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
let currentVisionAIMessage = null; // ADDED: Manages the current AI message element across recursive calls

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
    currentVisionAIMessage = null; // Reset current AI message

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

    // ========= 🧠 注入可用工具 (Mirrors chat-api-handler logic) =========
    requestBody.tools = toolManager.getToolDeclarations();

    // ========= ⚙️ Gemini 模型兼容性处理 =========
    if (selectedModel.includes('gemini')) {
        Logger.info('Detected Gemini model, applying ChatML compatibility mode.');
        requestBody.enableReasoning = true;
        requestBody.disableSearch = true;
    }

    console.log("🚀 [Vision] Final requestBody:", requestBody);

    if (!isToolCallFollowUp) {
        createVisionAIMessageElement();
        currentVisionAIMessage.markdownContainer.innerHTML = '<p>正在请求模型...</p>';
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

        if (currentVisionAIMessage) {
            currentVisionAIMessage.markdownContainer.innerHTML = ''; // 清空占位内容
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
                if (jsonStr === '[DONE]') { // MODIFIED: Check for DONE and return to exit loop
                     // Post-stream logic is now handled after the loop
                } else {
                     try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta;

                        if (delta) {
                            const functionCallPart = delta.parts?.find(p => p.functionCall);
                            
                            if (functionCallPart) {
                                functionCallDetected = true;
                                currentFunctionCall = functionCallPart.functionCall;
                                Logger.info('Vision Function call detected:', currentFunctionCall);
                                
                                // MODIFIED: Use new UI display function
                                displayVisionToolCallStatus(currentFunctionCall.name, currentFunctionCall.args);
                                
                                if (currentVisionAIMessage && currentVisionAIMessage.rawMarkdownBuffer) {
                                    visionChatHistory.push({ 
                                        role: 'assistant', 
                                        content: currentVisionAIMessage.rawMarkdownBuffer 
                                    });
                                }
                                break; 
                            }

                            if (delta.reasoning_content) {
                                if (!currentVisionAIMessage) createVisionAIMessageElement();
                                if (!reasoningStarted) {
                                    currentVisionAIMessage.reasoningContainer.style.display = 'block';
                                    reasoningStarted = true;
                                }
                                currentVisionAIMessage.rawReasoningBuffer += delta.reasoning_content;
                                currentVisionAIMessage.reasoningContainer.querySelector('.reasoning-content').innerHTML += delta.reasoning_content.replace(/\n/g, '<br>');
                            }
                            if (delta.content) {
                                if (!currentVisionAIMessage) createVisionAIMessageElement();
                                
                                if (reasoningStarted && !answerStarted) {
                                    const separator = document.createElement('hr');
                                    separator.className = 'answer-separator';
                                    currentVisionAIMessage.reasoningContainer.after(separator);
                                    answerStarted = true;
                                }
                                finalContent += delta.content;
                                currentVisionAIMessage.rawMarkdownBuffer += delta.content;
                                currentVisionAIMessage.markdownContainer.innerHTML = marked.parse(currentVisionAIMessage.rawMarkdownBuffer);
                            }
                        }
                    } catch {
                        console.warn('Skipping invalid SSE data line');
                    }
                }
            }
            
            if (functionCallDetected) break;
            
            if (currentVisionAIMessage && elements.visionMessageHistory) {
                elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
            }
        }

        // ========= 🛠️ 处理工具调用 =========
        if (functionCallDetected && currentFunctionCall) {
            await handleVisionToolCall(currentFunctionCall, selectedModel, selectedPrompt);
            return; 
        }

        // ========= ✅ 完成普通响应 =========
        if (currentVisionAIMessage && currentVisionAIMessage.rawMarkdownBuffer) {
            if (typeof MathJax !== 'undefined' && MathJax.startup) {
                MathJax.startup.promise.then(() => {
                    MathJax.typeset([currentVisionAIMessage.markdownContainer, currentVisionAIMessage.reasoningContainer]);
                }).catch(err => console.error('MathJax typesetting failed:', err));
            }

            visionChatHistory.push({ 
                role: 'assistant', 
                content: currentVisionAIMessage.rawMarkdownBuffer,
                reasoning: currentVisionAIMessage.rawReasoningBuffer 
            });
        }

    } catch (error) {
        console.error('Error in vision stream processing:', error);
        if (currentVisionAIMessage) {
            currentVisionAIMessage.markdownContainer.innerHTML = `<p><strong>请求失败:</strong> ${error.message}</p>`;
        }
        throw error;
    }
}


/**
 * @private
 * @description Attempts to parse a JSON string that may have minor syntax errors.
 * @param {string} jsonString - The JSON string to parse.
 * @returns {object} The parsed JavaScript object.
 * @throws {Error} If the string cannot be parsed.
 */
function _robustJsonParse(jsonString) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.warn("[Vision Core] Standard JSON.parse failed, attempting robust parsing...", e);
        let cleanedString = jsonString.replace(/,\s*([}\]])/g, '$1');
        cleanedString = cleanedString.replace(/(".*?[^\\]")(?<!\\)\n/g, '$1\\n');
        cleanedString = cleanedString.replace(/(".*?[^\\]")(?<!\\)\r/g, '$1\\r');
        cleanedString = cleanedString.replace(/:( *[0-9\.]+)\"/g, ':$1');
        cleanedString = cleanedString.replace(/:( *(?:true|false))\"/g, ':$1');
        try {
            return JSON.parse(cleanedString);
        } catch (finalError) {
            console.error("[Vision Core] Robust JSON parsing failed after cleanup.", finalError);
            throw finalError || e;
        }
    }
}


/**
 * NEW: Displays a Base64 encoded image in the vision chat history.
 * @param {string} base64Image - The Base64 encoded image string.
 * @param {string} [altText='Generated Image'] - Alternative text for the image.
 */
function displayImageResultInVision(base64Image, altText = 'Generated Image') {
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

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.visionMessageHistory.appendChild(messageDiv);
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}

/**
 * NEW: Displays a tool call status UI message in the vision chat.
 * @param {string} toolName - The name of the tool being called.
 */
function displayVisionToolCallStatus(toolName) {
    if (!elements.visionMessageHistory) return;
    // Remove any existing status message to avoid duplicates
    const existingStatus = elements.visionMessageHistory.querySelector('.tool-call-status');
    if (existingStatus) {
        existingStatus.remove();
    }

    const statusDiv = document.createElement('div');
    statusDiv.className = 'tool-call-status';

    const icon = document.createElement('i');
    icon.className = 'fas fa-cog fa-spin';

    const text = document.createElement('span');
    text.textContent = `正在调用工具: ${toolName}...`;

    statusDiv.appendChild(icon);
    statusDiv.appendChild(text);

    elements.visionMessageHistory.appendChild(statusDiv);
    elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
}


/**
 * REWRITTEN: Handles the execution of a tool call via the backend proxy,
 * mirroring the logic from chat-api-handler.js for consistency.
 * @param {object} functionCall - The function call object from the model.
 * @param {string} selectedModel - The name of the currently selected model.
 * @param {object} selectedPrompt - The currently selected prompt object.
 */
async function handleVisionToolCall(functionCall, selectedModel, selectedPrompt) {
    const callId = `call_${Date.now()}`;
    currentVisionAIMessage = null; // Clear the current message bubble to prepare for the final response

    try {
        Logger.info(`Executing vision tool via MCP proxy: ${functionCall.name}`, 'system');

        const parsedArguments = functionCall.args || {};

        const modelConfig = CONFIG.VISION.MODELS.find(m => m.name === selectedModel);
        if (!modelConfig || !modelConfig.mcp_server_url) {
            throw new Error(`In config.js, mcp_server_url not found for vision model '${selectedModel}'.`);
        }
        const server_url = modelConfig.mcp_server_url;

        const proxyRequestBody = {
            tool_name: functionCall.name,
            parameters: parsedArguments,
            server_url: server_url
        };

        const proxyResponse = await fetch('/api/mcp-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proxyRequestBody)
        });

        if (!proxyResponse.ok) {
            const errorData = await proxyResponse.json();
            throw new Error(`MCP proxy request failed: ${errorData.details || proxyResponse.statusText}`);
        }

        const toolRawResult = await proxyResponse.json();
        let toolResultContent;

        if (functionCall.name === 'python_sandbox') {
            let isImageHandled = false;
            if (toolRawResult && toolRawResult.stdout && typeof toolRawResult.stdout === 'string') {
                const stdoutContent = toolRawResult.stdout.trim();
                try {
                    const imageData = _robustJsonParse(stdoutContent);
                    if (imageData && imageData.type === 'image' && imageData.image_base64) {
                        const title = imageData.title || 'Generated Chart';
                        displayImageResultInVision(imageData.image_base64, title);
                        toolResultContent = { output: `Image "${title}" generated and displayed.` };
                        isImageHandled = true;
                    }
                } catch (e) { /* Not a JSON object */ }

                if (!isImageHandled && (stdoutContent.startsWith('iVBORw0KGgo') || stdoutContent.startsWith('/9j/'))) {
                    displayImageResultInVision(stdoutContent, 'Generated Chart');
                    toolResultContent = { output: 'Image generated and displayed.' };
                    isImageHandled = true;
                } else if (!isImageHandled && stdoutContent) {
                    toolResultContent = { output: stdoutContent };
                }
            }
            if (toolRawResult && toolRawResult.stderr) {
                Logger.info(`Python Sandbox STDERR: ${toolRawResult.stderr}`, 'system');
                if (toolResultContent && toolResultContent.output) {
                    toolResultContent.output += `\nError: ${toolRawResult.stderr}`;
                } else {
                    toolResultContent = { output: `Error: ${toolRawResult.stderr}` };
                }
            }
            if (!toolResultContent) {
                toolResultContent = { output: "Tool executed successfully with no output." };
            }
        } else {
            toolResultContent = { output: toolRawResult };
        }

        // Push history using the MCP/Qwen format for consistency
        visionChatHistory.push({
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: callId,
                type: 'function',
                function: {
                    name: functionCall.name,
                    arguments: JSON.stringify(parsedArguments)
                }
            }]
        });

        visionChatHistory.push({
            role: 'tool',
            content: JSON.stringify(toolResultContent),
            tool_call_id: callId
        });

        // The UI status is still visible, so we can just wait for the next stream.
        await processVisionStream(selectedModel, selectedPrompt, visionChatHistory, true);

    } catch (toolError) {
        Logger.error('Vision tool execution failed:', toolError);
        showToastHandler(`❌ 工具执行失败: ${toolError.message}`);
        
        visionChatHistory.push({
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: callId,
                type: 'function',
                function: {
                    name: functionCall.name,
                    arguments: JSON.stringify(functionCall.args || {})
                }
            }]
        });

        visionChatHistory.push({
            role: 'tool',
            content: JSON.stringify({ error: toolError.message }),
            tool_call_id: callId
        });

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
    
    // Remove old status message before adding new AI bubble
    const existingStatus = elements.visionMessageHistory?.querySelector('.tool-call-status');
    if (existingStatus) {
        existingStatus.remove();
    }

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

    // MODIFIED: Set the module-level variable
    currentVisionAIMessage = {
        container: messageDiv,
        markdownContainer,
        reasoningContainer,
        rawMarkdownBuffer: '',
        rawReasoningBuffer: ''
    };
    return currentVisionAIMessage;
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
    currentVisionAIMessage = null; // Reset
    
    // 设置按钮加载状态
    if (summaryButton) {
        summaryButton.disabled = true;
        summaryButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 分析中...';
    }
    
    // 创建总结消息元素
    createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = currentVisionAIMessage;
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
                    if (jsonStr === '[DONE]') {
                         // End of stream
                    } else {
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
    createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = currentVisionAIMessage;
    
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