import { clearAttachedFile } from '../attachments/file-attachment.js';

/**
 * @fileoverview Manages the vision chat mode, including UI, message handling, and API interaction.
 */

/**
 * System prompt for the vision model.
 * @type {string}
 */
const VISION_SYSTEM_PROMPT = `你是一个顶级的多模态视觉分析专家，你的首要任务是精确、深入地分析用户提供的视觉材料（如图片、图表、截图、视频等），并根据视觉内容回答问题。
所有回复信息以Markdown格式响应。
严格遵循以下规则进行所有响应：
1. **Markdown格式化：**始终使用标准的Markdown语法进行文本、代码块和列表。
2. **LaTeX数学公式：**对于所有数学公式，使用正确的LaTeX语法。
    - 行内数学公式应使用单个美元符号括起来（例如，$\\sin^2\\theta + \\cos^2\\theta = 1$）。
    - 展示数学公式应使用双美元符号括起来（例如，$$\\sum_{i=1}^n i = \\frac{n(n+1)}{2}$$）。
    - 确保所有LaTeX命令拼写正确且正确关闭（例如，\\boldsymbol{\\sin}而不是\\boldsymbol{\\sin}}）。
3. **简洁性：**提供直接答案，无需不必要的对话填充、开场白或礼貌用语。
4. **准确性：**确保内容准确并直接回答用户的问题。
`;

/**
 * Stores the chat history for the vision mode.
 * @type {Array<object>}
 */
export const visionChatHistory = [];

/**
 * Initializes the vision mode UI, specifically the model selection dropdown.
 * @function initVision
 * @description Initializes the vision functionality, primarily populating the model selection dropdown.
 * @param {HTMLSelectElement} visionModelSelect - The select element for vision models.
 * @param {Array<object>} models - The list of available vision models.
 * @param {string} defaultModel - The name of the default vision model.
 * @returns {void} - No return value.
 */
export function initVision(visionModelSelect, models, defaultModel) {
    if (!visionModelSelect) return;

    visionModelSelect.innerHTML = ''; // Clear existing options
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName;
        if (model.name === defaultModel) {
            option.selected = true;
        }
        visionModelSelect.appendChild(option);
    });
}

/**
 * Handles sending a message in vision mode. It constructs the request with text and attachments,
 * sends it to the API, and processes the streamed response.
 * @function handleSendVisionMessage
 * @description Handles the entire process of sending a user's query (text and files) in vision mode and rendering the model's response.
 * @returns {Promise<void>} - A promise that resolves when the message is sent and response handling is complete.
 */
export async function handleSendVisionMessage(visionInputText, visionAttachedFiles, visionModelSelect, visionChatHistory, fileAttachmentPreviews, visionAttachmentPreviews, visionSendButton, visionMessageHistory, logMessage, showToast) {
    const text = visionInputText.value.trim();
    if (!text && visionAttachedFiles.length === 0) {
        showToast('请输入文本或添加附件。');
        return;
    }

    const selectedModel = visionModelSelect.value;

    // Display user message
    displayVisionUserMessage(text, visionAttachedFiles, visionMessageHistory);

    // Add user message to history
    const userContent = [];
    if (text) {
        userContent.push({ type: 'text', text });
    }
    visionAttachedFiles.forEach(file => {
        userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
    });
    visionChatHistory.push({ role: 'user', content: userContent });

    // Clear input
    visionInputText.value = '';
    clearAttachedFile('vision', fileAttachmentPreviews, visionAttachmentPreviews);

    // Show loading state
    visionSendButton.disabled = true;
    visionSendButton.textContent = 'progress_activity';
    const aiMessage = createVisionAIMessageElement(visionMessageHistory);
    const { markdownContainer, reasoningContainer } = aiMessage;
    markdownContainer.innerHTML = '<p>正在请求模型...</p>';
    logMessage(`正在请求视觉模型: ${selectedModel}`, 'system');

    try {
        // Use streaming request
        const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    { role: 'system', content: VISION_SYSTEM_PROMPT },
                    ...visionChatHistory
                ],
                stream: true, // Always enable streaming response
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API 请求失败');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let finalContent = ''; // To store the final content part
        let reasoningStarted = false;
        let answerStarted = false; // To mark if the final answer has started

        markdownContainer.innerHTML = ''; // Clear "Loading..." message

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
                            // Handle reasoning content
                            if (delta.reasoning_content) {
                                if (!reasoningStarted) {
                                    reasoningContainer.style.display = 'block'; // Show reasoning container
                                    reasoningStarted = true;
                                }
                                // Append using innerHTML to render Markdown newlines etc.
                                reasoningContainer.querySelector('.reasoning-content').innerHTML += delta.reasoning_content.replace(/\n/g, '<br>');
                            }
                            // Handle main content
                            if (delta.content) {
                                // When reasoning exists and the final answer appears for the first time, insert a separator
                                if (reasoningStarted && !answerStarted) {
                                    const separator = document.createElement('hr');
                                    separator.className = 'answer-separator';
                                    // Insert the separator after the reasoningContainer
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

        // After the stream ends, typeset the final content with MathJax
        if (typeof MathJax !== 'undefined' && MathJax.startup) {
            MathJax.startup.promise.then(() => {
                MathJax.typeset([markdownContainer, reasoningContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }
        
        // Add the final AI content (without reasoning) to the history
        visionChatHistory.push({ role: 'assistant', content: finalContent });

    } catch (error) {
        console.error('Error sending vision message:', error);
        markdownContainer.innerHTML = `<p><strong>请求失败:</strong> ${error.message}</p>`;
        logMessage(`视觉模型请求失败: ${error.message}`, 'system');
    } finally {
        visionSendButton.disabled = false;
        visionSendButton.textContent = 'send';
    }
}

/**
 * Displays the user's message in the vision chat UI.
 * @function displayVisionUserMessage
 * @description Renders a user's message, including text and any attached files (images/videos), in the vision mode chat history.
 * @param {string} text - The text content of the message.
 * @param {Array<object>} files - An array of file objects to be displayed as attachments. Each object should have `type` and `base64` properties.
 * @returns {void} - No return value.
 */
function displayVisionUserMessage(text, files, visionMessageHistory) {
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
 * Creates and appends a new AI message element to the vision chat UI.
 * @function createVisionAIMessageElement
 * @description Creates the DOM structure for a new AI response, including containers for reasoning and the main markdown content, and appends it to the chat history.
 * @returns {object} - An object containing references to the created DOM elements: `container`, `markdownContainer`, `reasoningContainer`, and `contentDiv`.
 */
function createVisionAIMessageElement(visionMessageHistory) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    
    // Reasoning container
    const reasoningContainer = document.createElement('div');
    reasoningContainer.className = 'reasoning-container';
    reasoningContainer.style.display = 'none'; // Hidden by default
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
            // Copy both reasoning and main content
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
        reasoningContainer, // Return reasoning container
        contentDiv,
    };
}