/**
 * @fileoverview Manages the rendering and interactions of the chat UI.
 * This module includes functions for displaying user and AI messages (text, audio),
 * creating message elements, and managing the scroll behavior of the chat history.
 */

import { CONFIG } from '../config/config.js';
// DOM elements are now passed as arguments to functions.

// State variables that might be needed by UI functions.
// In a further refactoring, these could be managed by a state module.
let currentAudioElement = null; // Tracks the currently playing audio element.
let isUserScrolling = false; // Tracks if the user is manually scrolling the chat history.

/**
 * Scrolls the message history to the bottom smoothly.
 * It checks if the user is manually scrolling and avoids interfering.
 * @function scrollToBottom
 * @returns {void}
 */
export function scrollToBottom(messageHistoryElement) {
    if (!messageHistoryElement) return; // Safety check

    requestAnimationFrame(() => {
        if (typeof isUserScrolling !== 'boolean' || !isUserScrolling) {
            messageHistoryElement.scrollTop = messageHistoryElement.scrollHeight;
        }
    });
}

/**
 * Formats seconds into a MM:SS time format.
 * @function formatTime
 * @param {number} seconds - The total number of seconds.
 * @returns {string} The formatted time string (e.g., "01:23").
 */
export function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Displays a user's message in the chat history, which can include text and an attached file preview.
 * @function displayUserMessage
 * @param {string} text - The text content of the message.
 * @param {object|null} file - An object containing file details for preview.
 * @param {string} file.base64 - The base64-encoded content of the file.
 * @param {string} [file.name] - The name of the file.
 * @returns {void}
 */
export function displayUserMessage(messageHistoryElement, text, file) {
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
    messageHistoryElement.appendChild(messageDiv);

    scrollToBottom(messageHistoryElement);
}

/**
 * Creates and displays a new AI message element in the chat history.
 * This element includes containers for reasoning (thinking process) and the final markdown-formatted answer.
 * @function createAIMessageElement
 * @returns {{container: HTMLElement, markdownContainer: HTMLElement, reasoningContainer: HTMLElement, contentDiv: HTMLElement, rawMarkdownBuffer: string}} - An object containing references to the new message's elements and a buffer for accumulating raw markdown.
 */
export function createAIMessageElement(messageHistoryElement) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');

    const reasoningContainer = document.createElement('div');
    reasoningContainer.className = 'reasoning-container';
    reasoningContainer.style.display = 'none'; // Default to hidden
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
            console.error('Failed to copy text:', err);
        }
    });

    contentDiv.appendChild(copyButton);
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messageHistoryElement.appendChild(messageDiv);
    scrollToBottom(messageHistoryElement);
    return {
        container: messageDiv,
        markdownContainer,
        reasoningContainer,
        contentDiv,
        rawMarkdownBuffer: '' // Buffer for accumulating raw markdown text
    };
}

/**
 * Displays a system message in the chat history area.
 * @function showSystemMessage
 * @param {string} message - The system message to display.
 * @returns {void}
 */
export function showSystemMessage(messageHistoryElement, message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'system-info');

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    contentDiv.textContent = message;

    messageDiv.appendChild(contentDiv);
    messageHistoryElement.appendChild(messageDiv);
    scrollToBottom(messageHistoryElement);
}

/**
 * Helper function to write a string to a DataView.
 * @param {DataView} view The DataView to write to.
 * @param {number} offset The offset to start writing at.
 * @param {string} string The string to write.
 */
export function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Converts raw PCM audio data into a WAV file blob.
 * @param {Uint8Array[]} pcmDataBuffers An array of PCM data chunks.
 * @param {number} [sampleRate=CONFIG.AUDIO.OUTPUT_SAMPLE_RATE] The sample rate of the audio.
 * @returns {Blob} A blob representing the WAV file.
 */
export function pcmToWavBlob(pcmDataBuffers, sampleRate = CONFIG.AUDIO.OUTPUT_SAMPLE_RATE) {
    let dataLength = 0;
    for (const buffer of pcmDataBuffers) {
        dataLength += buffer.length;
    }

    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (const pcmBuffer of pcmDataBuffers) {
        for (let i = 0; i < pcmBuffer.length; i++) {
            view.setUint8(offset + i, pcmBuffer[i]);
        }
        offset += pcmBuffer.length;
    }

    return new Blob([view], { type: 'audio/wav' });
}


/**
 * Displays an audio message in the chat UI with a custom player.
 * @function displayAudioMessage
 * @param {string} audioUrl - The URL of the audio file to play.
 * @param {number} duration - The duration of the audio in seconds.
 * @param {string} type - The message type, either 'user' or 'ai'.
 * @returns {void}
 */
export function displayAudioMessage(messageHistoryElement, audioUrl, duration, type) {
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
    audioDurationSpan.textContent = formatTime(duration);

    const downloadButton = document.createElement('a');
    downloadButton.classList.add('audio-download-button', 'material-icons');
    downloadButton.textContent = 'download';
    downloadButton.download = `gemini_audio_${Date.now()}.wav`;
    downloadButton.href = audioUrl;

    const transcribeButton = document.createElement('button');
    transcribeButton.classList.add('audio-transcribe-button', 'material-icons');
    transcribeButton.textContent = 'text_fields';

    transcribeButton.addEventListener('click', async () => {
        transcribeButton.disabled = true;
        transcribeButton.textContent = 'hourglass_empty';
        try {
            const audioBlobResponse = await fetch(audioUrl);
            if (!audioBlobResponse.ok) throw new Error(`Failed to fetch audio blob: ${audioBlobResponse.statusText}`);
            const audioBlob = await audioBlobResponse.blob();

            const response = await fetch('/api/transcribe-audio', {
                method: 'POST',
                headers: { 'Content-Type': audioBlob.type },
                body: audioBlob,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Transcription failed: ${errorData.error || response.statusText}`);
            }

            const result = await response.json();
            const transcriptionText = result.text || 'No transcription available.';
            const { markdownContainer } = createAIMessageElement(messageHistoryElement);
            markdownContainer.innerHTML = marked.parse(transcriptionText);
            if (typeof MathJax !== 'undefined' && MathJax.startup) {
                MathJax.startup.promise.then(() => MathJax.typeset([markdownContainer]));
            }
            scrollToBottom(messageHistoryElement);
        } catch (error) {
            console.error('Transcription failed:', error);
        } finally {
            transcribeButton.disabled = false;
            transcribeButton.textContent = 'text_fields';
        }
    });

    const audioElement = new Audio(audioUrl);
    audioElement.preload = 'metadata';

    playButton.addEventListener('click', () => {
        if (currentAudioElement && currentAudioElement !== audioElement) {
            currentAudioElement.pause();
            const prevPlayButton = currentAudioElement.closest('.audio-player').querySelector('.audio-play-button');
            if (prevPlayButton) prevPlayButton.textContent = 'play_arrow';
        }

        if (audioElement.paused) {
            audioElement.play();
            playButton.textContent = 'pause';
            currentAudioElement = audioElement;
        } else {
            audioElement.pause();
            playButton.textContent = 'play_arrow';
            currentAudioElement = null;
        }
    });

    audioElement.addEventListener('timeupdate', () => {
        const progress = (audioElement.currentTime / audioElement.duration) * 100;
        audioProgressBar.style.width = `${progress}%`;
        audioDurationSpan.textContent = formatTime(audioElement.currentTime);
    });

    audioElement.addEventListener('ended', () => {
        playButton.textContent = 'play_arrow';
        audioProgressBar.style.width = '0%';
        audioDurationSpan.textContent = formatTime(duration);
        currentAudioElement = null;
    });

    audioPlayerDiv.appendChild(playButton);
    audioPlayerDiv.appendChild(audioWaveform);
    audioPlayerDiv.appendChild(audioDurationSpan);
    audioPlayerDiv.appendChild(downloadButton);
    audioPlayerDiv.appendChild(transcribeButton);
    contentDiv.appendChild(audioPlayerDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messageHistoryElement.appendChild(messageDiv);

    scrollToBottom(messageHistoryElement);
}

export function initializeChatUI(messageHistoryElement) {
    if (messageHistoryElement) {
        messageHistoryElement.addEventListener('wheel', () => { isUserScrolling = true; }, { passive: true });
        messageHistoryElement.addEventListener('scroll', () => {
            if (messageHistoryElement.scrollHeight - messageHistoryElement.clientHeight <= messageHistoryElement.scrollTop + 1) {
                isUserScrolling = false;
            }
        });

        if ('ontouchstart' in window) {
            messageHistoryElement.addEventListener('touchstart', () => { isUserScrolling = true; }, { passive: true });
            messageHistoryElement.addEventListener('touchend', () => {
                isUserScrolling = false;
                const threshold = 50;
                const isNearBottom = messageHistoryElement.scrollHeight - messageHistoryElement.clientHeight <= messageHistoryElement.scrollTop + threshold;
                if (isNearBottom) {
                    scrollToBottom(messageHistoryElement);
                }
            }, { passive: true });
        }
    }
}