/**
 * @fileoverview Core functionality for the Vision Mode.
 * Manages UI, message handling, and API communication for vision-related tasks.
 */

import { CONFIG } from '../config/config.js';
import { Logger } from '../utils/logger.js';
import { logMessage, showToast } from '../utils/ui-helpers.js';

// Module-level state and DOM element references, initialized via initVision
let visionChatHistory = [];
let attachmentManager = null;
let visionMessageHistory, visionSendButton, visionMessageInput, visionModelSelect;

/**
 * Initializes the vision feature by setting up DOM elements and event listeners.
 * @param {object} dependencies - A map of DOM elements and managers needed for vision mode.
 */
export function initVision(dependencies) {
    // Assign dependencies to module-level variables
    attachmentManager = dependencies.attachmentManager;
    visionMessageHistory = dependencies.visionMessageHistory;
    visionSendButton = dependencies.visionSendButton;
    visionMessageInput = dependencies.visionMessageInput; // Corrected name from the review
    visionModelSelect = dependencies.visionModelSelect;

    if (!visionModelSelect || !visionSendButton || !visionMessageInput || !visionMessageHistory) {
        Logger.error("One or more essential vision DOM elements were not provided in dependencies.");
        return;
    }

    // Populate model dropdown
    visionModelSelect.innerHTML = ''; // Clear existing options
    CONFIG.VISION.MODELS.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName;
        if (model.name === CONFIG.VISION.DEFAULT_MODEL) {
            option.selected = true;
        }
        visionModelSelect.appendChild(option);
    });

    // Move event listener from main.js into the module
    visionSendButton.addEventListener('click', () => {
        // attachmentManager is now available in the module scope, so no need to pass it
        handleSendVisionMessage();
    });
}

/**
 * Handles sending a message with optional attachments in vision mode.
 */
async function handleSendVisionMessage() {
    const text = visionMessageInput.value.trim();
    const visionAttachedFiles = attachmentManager.getVisionAttachedFiles();
    if (!text && visionAttachedFiles.length === 0) {
        showToast('请输入文本或添加附件。');
        return;
    }

    const selectedModel = visionModelSelect.value;

    displayVisionUserMessage(text, visionAttachedFiles);

    const userContent = [];
    if (text) {
        userContent.push({ type: 'text', text });
    }
    visionAttachedFiles.forEach(file => {
        userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
    });
    visionChatHistory.push({ role: 'user', content: userContent });

    visionMessageInput.value = '';
    attachmentManager.clearAttachedFile('vision');

    visionSendButton.disabled = true;
    visionSendButton.innerHTML = `<span class="material-symbols-outlined loading-icon">progress_activity</span>`;
    const aiMessage = createVisionAIMessageElement();
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在请求模型...</p>';
    Logger.info(`正在请求视觉模型: ${selectedModel}`);
    logMessage(`正在请求视觉模型: ${selectedModel}`, 'system');

    try {
        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    { role: 'system', content: CONFIG.VISION.SYSTEM_PROMPT },
                    ...visionChatHistory
                ],
                stream: true,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API 请求失败');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let finalContent = '';
        let reasoningStarted = false;
        let answerStarted = false;

        markdownContainer.innerHTML = '';

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
            visionMessageHistory.scrollTop = visionMessageHistory.scrollHeight;
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
        showSystemMessage(`视觉模型请求失败: ${error.message}`);
    } finally {
        visionSendButton.disabled = false;
        visionSendButton.textContent = 'send';
    }
}

/**
 * Displays a user's message in the vision chat history.
 * @param {string} text - The text content of the message.
 * @param {Array} files - An array of attached file objects.
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
    visionMessageHistory.appendChild(messageDiv);
    visionMessageHistory.scrollTop = visionMessageHistory.scrollHeight;
}

/**
 * Creates and appends a new AI message element to the vision chat history.
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
    copyButton.classList.add('copy-button', 'material-symbols-outlined');
    copyButton.textContent = 'content_copy';
    copyButton.addEventListener('click', async () => {
        try {
            const reasoningText = reasoningContainer.style.display !== 'none'
                ? `[思维链]\n${reasoningContainer.querySelector('.reasoning-content').innerText}\n\n`
                : '';
            const mainText = markdownContainer.innerText;
            await navigator.clipboard.writeText(reasoningText + mainText);
            copyButton.textContent = 'check';
            setTimeout(() => { copyButton.textContent = 'content_copy'; }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    });

    contentDiv.appendChild(copyButton);
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    visionMessageHistory.appendChild(messageDiv);
    visionMessageHistory.scrollTop = visionMessageHistory.scrollHeight;
    
    return {
        container: messageDiv,
        markdownContainer,
        reasoningContainer,
        contentDiv,
    };
}
