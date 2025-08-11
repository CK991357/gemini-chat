/**
 * @fileoverview UI helper functions like toasts and system messages.
 */

/**
 * Displays a toast notification.
 * @param {string} message - The message to display.
 * @param {number} [duration=3000] - The duration in milliseconds.
 */
export function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }, duration);
}

/**
 * Displays a system message in the main chat history.
 * @param {string} message - The message to display.
 */
export function showSystemMessage(message) {
    const messageHistory = document.getElementById('message-history');
    if (!messageHistory) return;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'system-info');

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('content');
    contentDiv.textContent = message;

    messageDiv.appendChild(contentDiv);
    messageHistory.appendChild(messageDiv);
    
    // Attempt to scroll to bottom
    requestAnimationFrame(() => {
        messageHistory.scrollTop = messageHistory.scrollHeight;
    });
}