import { createAIMessageElement, displayUserMessage, showSystemMessage, showToast } from '../chat/chat-ui.js';
import * as DOM from '../ui/dom-elements.js';

/**
 * @fileoverview Manages chat session history, including creating, loading, saving, and rendering sessions.
 */

/**
 * Stores the chat history for the current session.
 * @type {Array<object>}
 */
export let chatHistory = [];

/**
 * Stores the ID of the current chat session.
 * @type {string|null}
 */
export let currentSessionId = null;

/**
 * Updates the internal chatHistory variable.
 * @param {Array<object>} newHistory - The new chat history array.
 */
export function setChatHistory(newHistory) {
    chatHistory = newHistory;
}

/**
 * Updates the internal currentSessionId variable.
 * @param {string|null} newSessionId - The new session ID.
 */
export function setCurrentSessionId(newSessionId) {
    currentSessionId = newSessionId;
}


/**
 * Retrieves chat session metadata from localStorage.
 * @function getChatSessionMeta
 * @description Gets the list of chat session metadata from localStorage.
 * @returns {Array<object>} An array of session metadata objects, or an empty array if parsing fails.
 */
function getChatSessionMeta() {
    try {
        const meta = localStorage.getItem('chat_session_meta');
        return meta ? JSON.parse(meta) : [];
    } catch (e) {
        console.error('Failed to parse chat session meta:', e);
        return [];
    }
}

/**
 * Saves chat session metadata to localStorage.
 * @function saveChatSessionMeta
 * @description Saves the list of chat session metadata to localStorage.
 * @param {Array<object>} meta - The array of session metadata to save. Each object should include id, title, updatedAt, etc.
 * @returns {void} - No return value.
 */
function saveChatSessionMeta(meta) {
    try {
        localStorage.setItem('chat_session_meta', JSON.stringify(meta));
    } catch (e) {
        console.error('Failed to save chat session meta:', e);
    }
}

/**
 * Generates a new chat session.
 * @function generateNewSession
 * @description Creates a new chat session by generating a new session ID, clearing the chat history and UI, and updating the session metadata in localStorage.
 * @returns {void} - No return value.
 */
export function generateNewSession() {
    chatHistory = []; // Clear in-memory chat history
    currentSessionId = `session-${crypto.randomUUID()}`; // Generate a new session ID
    DOM.messageHistory.innerHTML = ''; // Clear the chat display area

    // Update or add session metadata
    let sessions = getChatSessionMeta();
    const now = new Date().toISOString();
    const newSessionMeta = {
        id: currentSessionId,
        title: '新聊天', // Default title
        updatedAt: now,
        createdAt: now
    };
    sessions.unshift(newSessionMeta); // Add the new session to the beginning of the list
    saveChatSessionMeta(sessions);

    showSystemMessage(`新聊天已开始 (ID: ${currentSessionId})`, 'system');
    renderHistoryList(); // Refresh the history list immediately after creating a new session
}

/**
 * Renders the list of chat sessions in the history panel.
 * @function renderHistoryList
 * @description Reads session metadata from localStorage and renders it into the history panel. It also adds click event listeners to each list item to load the session.
 * @returns {void} - No return value.
 */
export function renderHistoryList() {
    const sessions = getChatSessionMeta();
    DOM.historyContent.innerHTML = ''; // Clear the existing list

    if (sessions.length === 0) {
        DOM.historyContent.innerHTML = '<p class="empty-history">暂无历史记录</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'history-list';

    sessions.forEach(session => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.dataset.sessionId = session.id;
        li.innerHTML = `
            <span class="history-title">${session.title}</span>
            <span class="history-date">${new Date(session.updatedAt).toLocaleString()}</span>
        `;
        li.addEventListener('click', () => loadSessionHistory(session.id));
        ul.appendChild(li);
    });

    DOM.historyContent.appendChild(ul);
}

/**
 * Loads a complete chat history for a session from the backend and renders it.
 * @function loadSessionHistory
 * @description Loads the full chat history for a given session ID from the backend and renders it in the main chat window.
 * @param {string} sessionId - The ID of the session to load.
 * @returns {Promise<void>} - A promise that resolves when the session is loaded and rendered.
 */
async function loadSessionHistory(sessionId) {
    showToast(`正在加载会话: ${sessionId}`);
    try {
        const response = await fetch(`/api/history/load/${sessionId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `无法加载会话: ${response.statusText}`);
        }
        const sessionData = await response.json();

        // Clear current state and UI
        DOM.messageHistory.innerHTML = '';
        
        // Update current session state
        currentSessionId = sessionData.sessionId;
        chatHistory = sessionData.messages;

        // Re-render chat history
        chatHistory.forEach(message => {
            if (message.role === 'user') {
                // User messages can contain text and images
                const textPart = message.content.find(p => p.type === 'text')?.text || '';
                const imagePart = message.content.find(p => p.type === 'image_url');
                const file = imagePart ? { base64: imagePart.image_url.url, name: 'Loaded Image' } : null;
                displayUserMessage(textPart, file);
            } else if (message.role === 'assistant') {
                // AI messages are currently text only
                const aiMessage = createAIMessageElement();
                aiMessage.rawMarkdownBuffer = message.content; // Assuming content is a string
                aiMessage.markdownContainer.innerHTML = marked.parse(message.content);
                 // Trigger MathJax rendering
                if (typeof MathJax !== 'undefined' && MathJax.startup) {
                    MathJax.startup.promise.then(() => {
                        MathJax.typeset([aiMessage.markdownContainer]);
                    }).catch((err) => console.error('MathJax typesetting failed:', err));
                }
            }
        });

        // Switch back to the chat tab
        document.querySelector('.tab[data-mode="text"]').click();
        showToast('会话加载成功！');

    } catch (error) {
        console.error('加载历史记录失败:', error);
        showSystemMessage(`加载历史记录失败: ${error.message}`);
    }
}

/**
 * Saves the current session's full history to the backend.
 * @function saveHistory
 * @description Saves the complete history of the current session to the backend and updates local metadata upon success. It also includes logic to automatically generate a title for the session at the appropriate time (T16).
 * @returns {Promise<void>} - A promise that resolves when the history is saved.
 */
export async function saveHistory() {
    // Strict check at the beginning of the function to ensure key variables exist
    if (!currentSessionId || chatHistory.length === 0) {
        return;
    }

    try {
        const sessions = getChatSessionMeta();
        const currentSessionMeta = sessions.find(s => s.id === currentSessionId);
        if (!currentSessionMeta) {
            console.error(`Cannot find current session ID in metadata: ${currentSessionId}`);
            return;
        }

        const now = new Date().toISOString();

        // 1. Save the full session data to the backend
        const response = await fetch('/api/history/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: currentSessionId,
                title: currentSessionMeta.title,
                createdAt: currentSessionMeta.createdAt,
                updatedAt: now,
                messages: chatHistory
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '保存历史记录失败');
        }

        // 2. Update local metadata
        currentSessionMeta.updatedAt = now;
        saveChatSessionMeta(sessions);
        renderHistoryList(); // Refresh the list to show the latest update time

        // 3. T16: Check if a title needs to be generated
        // Condition: When the second turn is complete (2 messages in history: 1 user + 1 assistant), and the title is the default "新聊天"
        if (chatHistory.length === 2 && currentSessionMeta.title === '新聊天') {
            generateTitleForSession(currentSessionId, chatHistory);
        }

    } catch (error) {
        console.error('保存历史记录失败:', error);
        showSystemMessage(`保存历史记录失败: ${error.message}`);
    }
}

/**
 * Asynchronously generates a title for a given session and updates metadata and UI.
 * @function generateTitleForSession
 * @description Asynchronously generates a title for the specified session and updates the local metadata and UI.
 * @param {string} sessionId - The ID of the session for which to generate a title.
 * @param {Array<object>} messages - The list of messages to use for generating the title.
 * @returns {Promise<void>} - A promise that resolves when the title is generated and updated.
 */
async function generateTitleForSession(sessionId, messages) {
    try {
        const response = await fetch('/api/history/generate-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, messages })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '生成标题失败');
        }

        const { title } = await response.json();

        if (title) {
            // Update metadata in localStorage
            const sessions = getChatSessionMeta();
            const sessionToUpdate = sessions.find(s => s.id === sessionId);
            if (sessionToUpdate) {
                sessionToUpdate.title = title;
                saveChatSessionMeta(sessions);
                // Re-render the history list to show the new title
                renderHistoryList();
                showToast('会话标题已生成');
            }
        }
    } catch (error) {
        console.error('生成标题失败:', error);
        // Failure here should not disturb the user, only log to console
    }
}