import { logMessage } from './logger.js';

/**
 * @fileoverview Utility functions for displaying UI messages like toasts and system messages.
 */

/**
 * Displays a toast notification at the bottom of the screen.
 * @param {string} message - The message to display in the toast.
 * @param {number} [duration=3000] - The duration (in milliseconds) the toast should be visible.
 */
export function showToast(message, duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.warn('Toast container not found. Message:', message);
        return;
    }

    const toast = document.createElement('div');
    toast.classList.add('toast');
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Force reflow to enable CSS transition
    void toast.offsetWidth;

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            toast.remove();
        }, { once: true });
    }, duration);
}

/**
 * Displays a system message in the main chat history.
 * @param {string} message - The system message to display.
 */
export function showSystemMessage(message) {
    const messageHistory = document.getElementById('message-history');
    if (!messageHistory) {
        console.warn('Message history container not found. System message:', message);
        return;
    }

    const systemMessageDiv = document.createElement('div');
    systemMessageDiv.classList.add('message', 'system');

    const avatarDiv = document.createElement('div');
    avatarDiv.classList.add('avatar');
    avatarDiv.textContent = '⚙️'; // System icon

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    const textNode = document.createElement('p');
    textNode.textContent = message;
    contentDiv.appendChild(textNode);

    systemMessageDiv.appendChild(avatarDiv);
    systemMessageDiv.appendChild(contentDiv);
    messageHistory.appendChild(systemMessageDiv);

    // Scroll to bottom after adding message
    messageHistory.scrollTop = messageHistory.scrollHeight;
    logMessage(message, 'system'); // Also log to the raw logs container
}
