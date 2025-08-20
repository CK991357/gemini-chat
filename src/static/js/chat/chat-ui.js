/**
 * @fileoverview Manages all UI rendering for the main chat interface.
 * This module is responsible for creating and displaying user messages,
 * AI responses, system logs, and other UI elements within the chat history.
 */

// Module-level state, populated by initChatUI
let elements = {};
let handlers = {};
let libraries = {};

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
 * @param {object|null} file - An optional file object with base64 data for display.
 */
export function displayUserMessage(text, file) {
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

    if (file && file.base64) {
        const img = document.createElement('img');
        img.src = file.base64;
        img.alt = file.name || 'Attached Image';
        img.style.maxWidth = '200px';
        img.style.maxHeight = '200px';
        img.style.borderRadius = '8px';
        img.style.marginTop = text ? '10px' : '0';
        contentDiv.appendChild(img);
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
    playButton.classList.add('audio-play-button', 'material-icons');
    playButton.textContent = 'play_arrow';

    const audioWaveform = document.createElement('div');
    audioWaveform.classList.add('audio-waveform');
    const audioProgressBar = document.createElement('div');
    audioProgressBar.classList.add('audio-progress-bar');
    audioWaveform.appendChild(audioProgressBar);

    const audioDurationSpan = document.createElement('span');
    audioDurationSpan.classList.add('audio-duration');
    audioDurationSpan.textContent = handlers.formatTime ? handlers.formatTime(duration) : '00:00';

    const downloadButton = document.createElement('a');
    downloadButton.classList.add('audio-download-button', 'material-icons');
    downloadButton.textContent = 'download';
    downloadButton.download = `gemini_audio_${Date.now()}.wav`;
    downloadButton.href = audioUrl;

    const transcribeButton = document.createElement('button');
    transcribeButton.classList.add('audio-transcribe-button', 'material-icons');
    transcribeButton.textContent = 'text_fields';
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
        playButton.textContent = 'play_arrow';
        audioProgressBar.style.width = '0%';
        if (handlers.formatTime) {
            audioDurationSpan.textContent = handlers.formatTime(duration);
        }
    });
    playButton.addEventListener('click', () => {
        if (audioElement.paused) {
            audioElement.play();
            playButton.textContent = 'pause';
        } else {
            audioElement.pause();
            playButton.textContent = 'play_arrow';
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
    elements.messageHistory.appendChild(messageDiv);
    scrollToBottom();

    return {
        container: messageDiv,
        markdownContainer,
        reasoningContainer,
        contentDiv,
        rawMarkdownBuffer: ''
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
 * @function displayAudioInputStatus
 * @description 在UI中显示语音输入状态消息。
 * @param {string} message - 要显示的状态文本。
 * @param {string} [statusType=''] - 状态类型，可以是 'recording' 或 'sending'，用于应用不同的样式。
 * @returns {void}
 */
export function displayAudioInputStatus(message, statusType = '') {
    if (!elements.audioInputStatus) {
        elements.audioInputStatus = document.getElementById('audio-input-status');
    }
    if (elements.audioInputStatus) {
        elements.audioInputStatus.textContent = message;
        elements.audioInputStatus.style.display = 'block';
        elements.audioInputStatus.className = 'audio-input-status'; // Reset classes
        if (statusType) {
            elements.audioInputStatus.classList.add(statusType);
        }
        // 确保在显示状态时，输入区域的其他元素不会被遮挡或布局混乱
        // 可以考虑调整 input-area 的布局，例如使用 flex-direction: column
        // 或者在 CSS 中为 .audio-input-status 设置绝对定位
    }
}

/**
 * @function removeAudioInputStatus
 * @description 隐藏语音输入状态消息。
 * @returns {void}
 */
export function removeAudioInputStatus() {
    if (!elements.audioInputStatus) {
        elements.audioInputStatus = document.getElementById('audio-input-status');
    }
    if (elements.audioInputStatus) {
        elements.audioInputStatus.style.display = 'none';
        elements.audioInputStatus.textContent = '';
        elements.audioInputStatus.className = 'audio-input-status'; // Reset classes
    }
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

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = 'settings'; // 使用一个合适的图标

    const text = document.createElement('span');
    // 为了UI简洁，只显示工具名
    text.textContent = `正在调用工具: ${toolName}...`;

    statusDiv.appendChild(icon);
    statusDiv.appendChild(text);

    elements.messageHistory.appendChild(statusDiv);
    scrollToBottom();
}
