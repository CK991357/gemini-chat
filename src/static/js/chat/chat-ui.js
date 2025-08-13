/**
 * @fileoverview Manages all UI rendering for the main chat interface.
 * This module is responsible for creating and displaying user messages,
 * AI responses, system logs, and other UI elements within the chat history.
 */

// Module-level state, populated by initChatUI
let elements = {};
let handlers = {};
let libraries = {};
let currentAIMessage = null; // Module-level state to track the current AI message element being updated

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

    currentAIMessage = {
        container: messageDiv,
        markdownContainer,
        reasoningContainer,
        contentDiv,
        rawMarkdownBuffer: ''
    };
    return currentAIMessage;
}

/**
 * Updates the content of the current AI message bubble.
 * Handles streaming text, reasoning, and errors.
 * @param {object} data - The data for the update.
 * @param {string} data.type - The type of update ('content', 'reasoning', 'error').
 * @param {string} data.content - The text content to append.
 * @param {boolean} [data.isStream=false] - If true, appends content; otherwise, replaces.
 */
export function updateAIMessage(data) {
    if (!currentAIMessage) {
        console.warn("updateAIMessage called but no current AI message element exists.");
        return;
    }

    const { type, content, isStream } = data;

    if (type === 'content') {
        if (isStream) {
            currentAIMessage.rawMarkdownBuffer += content;
        } else {
            currentAIMessage.rawMarkdownBuffer = content;
        }
        currentAIMessage.markdownContainer.innerHTML = libraries.marked.parse(currentAIMessage.rawMarkdownBuffer);
        if (libraries.MathJax && libraries.MathJax.startup) {
            libraries.MathJax.startup.promise.then(() => {
                libraries.MathJax.typeset([currentAIMessage.markdownContainer]);
            }).catch((err) => console.error('MathJax typesetting failed:', err));
        }
    } else if (type === 'reasoning') {
        // Similar logic for reasoning container can be added here
    } else if (type === 'error') {
        currentAIMessage.markdownContainer.innerHTML = `<p><strong>错误:</strong> ${content}</p>`;
    }
    
    scrollToBottom();
}

/**
 * Finalizes the current AI message, typically after a stream ends.
 * This function resets the module-level state for the current message.
 */
export function finalizeAIMessage() {
    if (currentAIMessage && currentAIMessage.rawMarkdownBuffer) {
        // Potentially add the complete message to history here if needed,
        // though it's better handled by the state manager.
    }
    currentAIMessage = null; // Reset for the next message
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