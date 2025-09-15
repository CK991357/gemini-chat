import { displayToolCallStatus } from '../chat/chat-ui.js';
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
 * Attaches all necessary event listeners for the vision UI.
 */
function attachEventListeners() {
    elements.visionSendButton?.addEventListener('click', () => handleSendVisionMessage());
    elements.visionAttachmentButton?.addEventListener('click', () => elements.visionFileInput.click());
    elements.visionFileInput?.addEventListener('change', (event) => attachmentManager.handleFileAttachment(event, 'vision'));
    
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

    // Display user message in the UI and add to history
    displayVisionUserMessage(text, visionAttachedFiles);
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

    // Start the stream
    await _continueVisionStream();
}

/**
 * @private
 * @description Continues the vision chat stream, typically after a user message or tool call.
 */
async function _continueVisionStream() {
    const selectedModel = elements.visionModelSelect.value;

    // Set loading state
    elements.visionSendButton.disabled = true;
    elements.visionSendButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在请求模型...</p>';
    Logger.info(`Requesting vision model: ${selectedModel}`, 'system');

    try {
        const modelConfig = CONFIG.VISION.MODELS.find(m => m.name === selectedModel);
        const requestBody = {
            model: selectedModel,
            messages: [
                { role: 'system', content: CONFIG.VISION.SYSTEM_PROMPT },
                ...visionChatHistory
            ],
            stream: true,
        };

        if (modelConfig && modelConfig.tools) {
            requestBody.tools = modelConfig.tools;
        }

        const reader = await apiHandler.fetchStream('/api/chat/completions', requestBody);
        const decoder = new TextDecoder('utf-8');
        let finalContent = '';
        let reasoningStarted = false;
        let answerStarted = false;
        let qwenToolCallAssembler = null;

        markdownContainer.innerHTML = '';

        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                Logger.info('Vision Stream finished.');
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            let boundary = buffer.indexOf('\n\n');

            while (boundary !== -1) {
                const message = buffer.substring(0, boundary);
                buffer = buffer.substring(boundary + 2);

                if (message.startsWith('data: ')) {
                    const jsonStr = message.substring(6);
                    if (jsonStr === '[DONE]') {
                        boundary = buffer.indexOf('\n\n');
                        continue;
                    }
                    try {
                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta;
                        if (delta) {
                            const qwenToolCallParts = delta.tool_calls;
                            if (qwenToolCallParts && Array.isArray(qwenToolCallParts)) {
                                qwenToolCallParts.forEach(toolCallChunk => {
                                    const func = toolCallChunk.function;
                                    if (func && func.name) {
                                        if (!qwenToolCallAssembler) {
                                            qwenToolCallAssembler = { tool_name: func.name, arguments: func.arguments || '' };
                                            Logger.info('Vision MCP tool call started:', qwenToolCallAssembler);
                                            displayToolCallStatus(qwenToolCallAssembler.tool_name, qwenToolCallAssembler.arguments);
                                        } else {
                                            qwenToolCallAssembler.arguments += func.arguments || '';
                                        }
                                    } else if (qwenToolCallAssembler && func && func.arguments) {
                                        qwenToolCallAssembler.arguments += func.arguments;
                                    }
                                });
                            } else if (delta.reasoning_content) {
                                if (!reasoningStarted) {
                                    reasoningContainer.style.display = 'block';
                                    reasoningStarted = true;
                                }
                                reasoningContainer.querySelector('.reasoning-content').innerHTML += delta.reasoning_content.replace(/\n/g, '<br>');
                            } else if (delta.content) {
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
                boundary = buffer.indexOf('\n\n');
            }
            elements.visionMessageHistory.scrollTop = elements.visionMessageHistory.scrollHeight;
        }

        if (qwenToolCallAssembler) {
            await handleMcpToolCall(qwenToolCallAssembler, requestBody);
        } else {
            if (typeof MathJax !== 'undefined' && MathJax.startup) {
                MathJax.startup.promise.then(() => {
                    MathJax.typeset([markdownContainer, reasoningContainer]);
                }).catch((err) => console.error('MathJax typesetting failed:', err));
            }
            visionChatHistory.push({ role: 'assistant', content: finalContent });
        }

    } catch (error) {
        console.error('Error sending vision message:', error);
        markdownContainer.innerHTML = `<p><strong>请求失败:</strong> ${error.message}</p>`;
        Logger.info(`视觉模型请求失败: ${error.message}`, 'system');
    } finally {
        elements.visionSendButton.disabled = false;
        elements.visionSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
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
        reasoningContainer,
        contentDiv,
    };
}


/**
 * @private
 * @description Handles the execution of a Qwen/Zhipu MCP tool call via the backend proxy.
 * @param {object} toolCode - The tool_code object from the model.
 * @param {object} originalRequestBody - The original request body.
 * @returns {Promise<void>}
 */
async function handleMcpToolCall(toolCode, originalRequestBody) {
    const timestamp = () => new Date().toISOString();
    let callId = `call_${Date.now()}`;
    Logger.info(`[${timestamp()}] [VISION_MCP] --- handleMcpToolCall START ---`);

    try {
        const modelName = originalRequestBody.model;
        const modelConfig = CONFIG.VISION.MODELS.find(m => m.name === modelName);

        if (!modelConfig || !modelConfig.mcp_server_url) {
            throw new Error(`在 config.js 中未找到模型 '${modelName}' 的 mcp_server_url 配置。`);
        }
        const server_url = modelConfig.mcp_server_url;

        let parsedArguments;
        try {
            parsedArguments = _robustJsonParse(toolCode.arguments);
        } catch (e) {
            throw new Error(`无法解析来自模型的工具参数: ${toolCode.arguments}`);
        }

        const proxyRequestBody = {
            tool_name: toolCode.tool_name,
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
            throw new Error(`MCP 代理请求失败: ${errorData.details || proxyResponse.statusText}`);
        }

        const toolResult = await proxyResponse.json();
        
        // Add tool call and result to history
        visionChatHistory.push({
            role: 'assistant',
            content: null,
            tool_calls: [{
                id: callId,
                type: 'function',
                function: {
                    name: toolCode.tool_name,
                    arguments: JSON.stringify(parsedArguments)
                }
            }]
        });

        visionChatHistory.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
            tool_call_id: callId
        });

        // Resend to model to get final answer
        await _continueVisionStream();

    } catch (toolError) {
        Logger.error('[VISION_MCP] 工具执行失败:', toolError);
        // In case of error, we might want to display it in the UI
        const aiMessage = createVisionAIMessageElement();
        aiMessage.markdownContainer.innerHTML = `<p><strong>工具执行失败:</strong> ${toolError.message}</p>`;
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
        console.warn("[VISION_MCP] Standard JSON.parse failed, attempting robust parsing...", e);
        let cleanedString = jsonString.replace(/,\s*([}\]])/g, '$1');
        try {
            return JSON.parse(cleanedString);
        } catch (finalError) {
            console.error("[VISION_MCP] Robust JSON parsing failed after cleanup.", finalError);
            throw finalError;
        }
    }
}
