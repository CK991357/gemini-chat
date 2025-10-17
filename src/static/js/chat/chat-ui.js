/**
 * @fileoverview Manages all UI rendering for the main chat interface.
 * This module is responsible for creating and displaying user messages,
 * AI responses, system logs, and other UI elements within the chat history.
 */

// Module-level state, populated by initChatUI
let elements = {};
let handlers = {};
let libraries = {};

// 导入 ImageManager 中的 openImageModal
import { openImageModal } from '../image-gallery/image-manager.js';

/**
 * Initializes the Chat UI module with necessary dependencies.
 * @param {object} el - A collection of essential DOM elements.
 * @param {object} hdl - A collection of event handler functions.
 * @param {object} libs - A collection of external libraries (e.g., marked, MathJax).
 */
export function initChatUI(el, hdl, libs) {
    elements = el;
    handlers = hdl;
    libraries = libs;
}

/**
 * Logs a message to the dedicated logs container in the UI.
 * @param {string} message - The message content to log.
 * @param {string} [type='system'] - The type of message (e.g., 'system', 'user', 'ai').
 */
export function logMessage(message, type = 'system') {
    if (!elements.logsContainer) return;
    const rawLogEntry = document.createElement('div');
    rawLogEntry.classList.add('log-entry', type);
    rawLogEntry.innerHTML = `
        <span class="timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="emoji">${type === 'system' ? '⚙️' : (type === 'user' ? '🫵' : '🤖')}</span>
        <span>${message}</span>
    `;
    elements.logsContainer.appendChild(rawLogEntry);
    elements.logsContainer.scrollTop = elements.logsContainer.scrollHeight;
}

/**
 * Displays a user's message in the chat history, including text and optional attachments.
 * @param {string} text - The text content of the user's message.
 * @param {Array<object>} files - An array of file objects with base64 data for display.
 */
export function displayUserMessage(text, files) {
    if (!elements.messageHistory) return;
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
        attachmentsContainer.className = 'attachments-grid'; // Use a grid for multiple attachments

        files.forEach(file => {
            let fileDisplayElement;
            if (file.type.startsWith('image/')) {
                fileDisplayElement = document.createElement('img');
                fileDisplayElement.src = file.base64;
                fileDisplayElement.alt = file.name || 'Attached Image';
                fileDisplayElement.style.maxWidth = '200px';
                fileDisplayElement.style.maxHeight = '200px';
                fileDisplayElement.style.borderRadius = '8px';
            } else if (file.type === 'application/pdf') {
                fileDisplayElement = document.createElement('div');
                fileDisplayElement.className = 'file-placeholder';
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-file-pdf';
                const textElement = document.createElement('p');
                textElement.textContent = file.name;
                fileDisplayElement.appendChild(icon);
                fileDisplayElement.appendChild(textElement);
            } else if (file.type.startsWith('audio/')) {
                // For audio files in chat history, we use the full audio player
                fileDisplayElement = document.createElement('audio');
                fileDisplayElement.src = file.base64;
                fileDisplayElement.controls = true;
                fileDisplayElement.style.maxWidth = '100%';
            } else {
                fileDisplayElement = document.createElement('div');
                fileDisplayElement.className = 'file-placeholder';
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-file';
                const textElement = document.createElement('p');
                textElement.textContent = file.name;
                fileDisplayElement.appendChild(icon);
                fileDisplayElement.appendChild(textElement);
            }

            if (fileDisplayElement) {
                fileDisplayElement.classList.add('chat-attachment'); // Add a class for styling
                attachmentsContainer.appendChild(fileDisplayElement);
            }
        });
        contentDiv.appendChild(attachmentsContainer);
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.messageHistory.appendChild(messageDiv);

    scrollToBottom();
}

/**
 * Displays an audio message player in the chat history.
 * The transcription logic is handled by an injected handler.
 * @param {string} audioUrl - The URL of the audio file to be played.
 * @param {number} duration - The duration of the audio in seconds.
 * @param {string} type - The message type, either 'user' or 'ai'.
 * @param {Blob} audioBlob - The raw audio blob for transcription.
 */
export function displayAudioMessage(audioUrl, duration, type, audioBlob) {
    if (!elements.messageHistory) return;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', type);

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = type === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content', 'audio-content');

    const audioPlayerDiv = document.createElement('div');
    audioPlayerDiv.classList.add('audio-player');

    const playButton = document.createElement('button');
    playButton.classList.add('audio-play-button');
    playButton.innerHTML = '<i class="fa-solid fa-play"></i>';

    const audioWaveform = document.createElement('div');
    audioWaveform.classList.add('audio-waveform');
    const audioProgressBar = document.createElement('div');
    audioProgressBar.classList.add('audio-progress-bar');
    audioWaveform.appendChild(audioProgressBar);

    const audioDurationSpan = document.createElement('span');
    audioDurationSpan.classList.add('audio-duration');
    audioDurationSpan.textContent = handlers.formatTime ? handlers.formatTime(duration) : '00:00';

    const downloadButton = document.createElement('a');
    downloadButton.classList.add('audio-download-button');
    downloadButton.innerHTML = '<i class="fa-solid fa-download"></i>';
    downloadButton.download = `gemini_audio_${Date.now()}.wav`;
    downloadButton.href = audioUrl;

    const transcribeButton = document.createElement('button');
    transcribeButton.classList.add('audio-transcribe-button');
    transcribeButton.innerHTML = '<i class="fa-solid fa-file-alt"></i>';
    transcribeButton.addEventListener('click', () => {
        if (handlers.transcribeAudioHandler) {
            handlers.transcribeAudioHandler(audioBlob, transcribeButton);
        }
    });

    const audioElement = new Audio(audioUrl);
    audioElement.preload = 'metadata';
    audioElement.addEventListener('timeupdate', () => {
        const progress = (audioElement.currentTime / audioElement.duration) * 100;
        audioProgressBar.style.width = `${progress}%`;
        if (handlers.formatTime) {
            audioDurationSpan.textContent = handlers.formatTime(audioElement.currentTime);
        }
    });
    audioElement.addEventListener('ended', () => {
        playButton.innerHTML = '<i class="fa-solid fa-play"></i>';
        audioProgressBar.style.width = '0%';
        if (handlers.formatTime) {
            audioDurationSpan.textContent = handlers.formatTime(duration);
        }
    });
    playButton.addEventListener('click', () => {
        if (audioElement.paused) {
            audioElement.play();
            playButton.innerHTML = '<i class="fa-solid fa-pause"></i>';
        } else {
            audioElement.pause();
            playButton.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    });

    audioPlayerDiv.appendChild(playButton);
    audioPlayerDiv.appendChild(audioWaveform);
    audioPlayerDiv.appendChild(audioDurationSpan);
    audioPlayerDiv.appendChild(downloadButton);
    audioPlayerDiv.appendChild(transcribeButton);
    contentDiv.appendChild(audioPlayerDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.messageHistory.appendChild(messageDiv);

    scrollToBottom();
}

/**
 * Creates and returns a new AI message element, ready to be populated.
 * @returns {object} An object containing references to the message's container,
 * markdown container, reasoning container, and a buffer for raw markdown.
 */
export function createAIMessageElement() {
    if (!elements.messageHistory) return null;
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
    elements.messageHistory.appendChild(messageDiv);
    scrollToBottom();

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
 * Scrolls the main message history container to the bottom.
 * Respects user's manual scrolling.
 */
export function scrollToBottom() {
    if (!elements.messageHistory || (handlers.isUserScrolling && handlers.isUserScrolling())) return;
    requestAnimationFrame(() => {
        elements.messageHistory.scrollTop = elements.messageHistory.scrollHeight;
    });
}

/**
 * @function displayToolCallStatus
 * @description 在聊天记录中显示一个工具调用状态的UI提示。
 * @param {string} toolName - 正在调用的工具名称。
 * @param {object} args - 传递给工具的参数。
 * @returns {void}
 */
export function displayToolCallStatus(toolName, args) {
    if (!elements.messageHistory) return;
    const statusDiv = document.createElement('div');
    statusDiv.className = 'tool-call-status';

    const icon = document.createElement('i');
    icon.className = 'fas fa-cog fa-spin'; // 使用 Font Awesome 齿轮图标并添加旋转效果

    const text = document.createElement('span');
    // 为了UI简洁，只显示工具名
    text.textContent = `正在调用工具: ${toolName}...`;

    statusDiv.appendChild(icon);
    statusDiv.appendChild(text);

    elements.messageHistory.appendChild(statusDiv);
    scrollToBottom();
}
/**
 * Displays a Base64 encoded image in the chat history with a download option.
 * @param {string} base64Image - The Base64 encoded image string (e.g., PNG format).
 * @param {string} [altText='Generated Image'] - Alternative text for the image.
 * @param {string} [fileName='generated_image.png'] - The default filename for download.
 */
export function displayImageResult(base64Image, altText = 'Generated Image', fileName = 'generated_image.png') {
    if (!elements.messageHistory) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai'); // Assume AI is generating images

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖'; // AI avatar

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content', 'image-result-content');

    const imageElement = document.createElement('img');
    imageElement.src = `data:image/png;base64,${base64Image}`;
    imageElement.alt = altText;
    imageElement.classList.add('chat-image-result'); // 添加一个类以便 CSS 样式控制
    contentDiv.appendChild(imageElement);

    // 获取图片尺寸和类型
    let dimensions = 'N/A';
    let imageType = 'image/png'; // 默认为 PNG

    // 尝试从 base64 字符串中提取实际的 MIME 类型
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
        // 计算图片大小 (粗略估算，因为 Base64 编码会增加大小)
        const base64Length = base64Image.length;
        const sizeInBytes = (base64Length * 0.75) - (base64Image.endsWith('==') ? 2 : (base64Image.endsWith('=') ? 1 : 0));
        const sizeInKB = (sizeInBytes / 1024).toFixed(2);
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
        let size = sizeInKB < 1024 ? `${sizeInKB} KB` : `${sizeInMB} MB`;

        imageElement.addEventListener('click', () => {
            openImageModal(imageElement.src, altText, dimensions, size, imageType);
        });
    };

    imageElement.onerror = () => {
        console.error('Failed to load image for modal preview:', imageElement.src);
    };

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    elements.messageHistory.appendChild(messageDiv);

    scrollToBottom();
}

/**
 * @description 在 AI 消息末尾显示 Token 使用信息。
 * @param {object} messageContainer - AI 消息容器对象。
 * @param {number} promptTokens - prompt 的 Token 数量。
 * @param {number} completionTokens - completion 的 Token 数量。
 * @param {number} totalTokens - 总 Token 数量。
 */
export function displayTokenUsage(messageContainer, promptTokens, completionTokens, totalTokens) {
    if (!messageContainer || !messageContainer.contentDiv) return;

    // 创建token使用情况显示元素
    const tokenUsageEl = document.createElement('div');
    tokenUsageEl.className = 'token-usage-info';
    tokenUsageEl.style.cssText = `
        margin-top: 15px;
        padding: 10px;
        background-color: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 6px;
        font-size: 12px;
        color: #6c757d;
        text-align: center;
    `;

    tokenUsageEl.innerHTML = `
        <div style="display: flex; justify-content: center; gap: 20px; flex-wrap: wrap;">
            <span><strong>总Token数:</strong> ${totalTokens.toLocaleString()}</span>
            <span><strong>上行Token:</strong> ${promptTokens.toLocaleString()}</span>
            <span><strong>下行Token:</strong> ${completionTokens.toLocaleString()}</span>
        </div>
    `;

    // 将token信息添加到消息容器的末尾
    messageContainer.contentDiv.appendChild(tokenUsageEl);

    // 滚动到底部
    scrollToBottom();
}
