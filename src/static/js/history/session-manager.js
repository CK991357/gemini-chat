
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
 * @param {HTMLElement} messageHistoryEl - The message history container element.
 * @param {Function} showSystemMessageFunc - Function to show a system message.
 * @param {Function} renderHistoryListFunc - Function to render the history list.
 */
export function generateNewSession(messageHistoryEl, showSystemMessageFunc, renderHistoryListFunc) {
    chatHistory = []; // Clear in-memory chat history
    currentSessionId = `session-${crypto.randomUUID()}`; // Generate a new session ID
    messageHistoryEl.innerHTML = ''; // Clear the chat display area

    // Update or add session metadata
    const sessions = getChatSessionMeta();
    const now = new Date().toISOString();
    const newSessionMeta = {
        id: currentSessionId,
        title: '新聊天', // Default title
        updatedAt: now,
        createdAt: now
    };
    sessions.unshift(newSessionMeta); // Add the new session to the beginning of the list
    saveChatSessionMeta(sessions);

    showSystemMessageFunc(`新聊天已开始 (ID: ${currentSessionId})`, 'system');
    renderHistoryListFunc(); // Refresh the history list immediately after creating a new session
}

/**
 * Renders the list of chat sessions in the history panel.
 * @param {HTMLElement} historyContentEl - The history content container element.
 * @param {Function} loadSessionHistoryFunc - Function to load session history.
 */
export function renderHistoryList(historyContentEl, loadSessionHistoryFunc) {
    const sessions = getChatSessionMeta();
    historyContentEl.innerHTML = ''; // Clear the existing list

    if (sessions.length === 0) {
        historyContentEl.innerHTML = '<p class="empty-history">暂无历史记录</p>';
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
        li.addEventListener('click', () => loadSessionHistoryFunc(session.id));
        ul.appendChild(li);
    });

    historyContentEl.appendChild(ul);
}

/**
 * Loads a complete chat history for a session from the backend and renders it.
 * @param {string} sessionId - The ID of the session to load.
 * @param {HTMLElement} messageHistoryEl - The message history container element.
 * @param {Function} showToastFunc - Function to show a toast message.
 * @param {Function} showSystemMessageFunc - Function to show a system message.
 * @param {Function} displayUserMessageFunc - Function to display a user message.
 * @param {Function} createAIMessageElementFunc - Function to create an AI message element.
 */
export async function loadSessionHistory(sessionId, messageHistoryEl, showToastFunc, showSystemMessageFunc, displayUserMessageFunc, createAIMessageElementFunc) {
    showToastFunc(`正在加载会话: ${sessionId}`);
    try {
        const response = await fetch(`/api/history/load/${sessionId}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `无法加载会话: ${response.statusText}`);
        }
        const sessionData = await response.json();

        // Clear current state and UI
        messageHistoryEl.innerHTML = '';
        
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
                displayUserMessageFunc(textPart, file);
            } else if (message.role === 'assistant') {
                // AI messages are currently text only
                const aiMessage = createAIMessageElementFunc();
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
        showToastFunc('会话加载成功！');

    } catch (error) {
        console.error('加载历史记录失败:', error);
        showSystemMessageFunc(`加载历史记录失败: ${error.message}`);
    }
}

/**
 * Saves the current session's full history to the backend.
 * @param {Function} renderHistoryListFunc - Function to render the history list.
 * @param {Function} showSystemMessageFunc - Function to show a system message.
 * @param {Function} generateTitleForSessionFunc - Function to generate a title for the session.
 */
export async function saveHistory(renderHistoryListFunc, showSystemMessageFunc, generateTitleForSessionFunc) {
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
        renderHistoryListFunc(); // Refresh the list to show the latest update time

        // 3. T16: Check if a title needs to be generated
        // Condition: When the second turn is complete (2 messages in history: 1 user + 1 assistant), and the title is the default "新聊天"
        if (chatHistory.length === 2 && currentSessionMeta.title === '新聊天') {
            generateTitleForSessionFunc(currentSessionId, chatHistory);
        }

    } catch (error) {
        console.error('保存历史记录失败:', error);
        showSystemMessageFunc(`保存历史记录失败: ${error.message}`);
    }
}

/**
 * Asynchronously generates a title for a given session and updates metadata and UI.
 * @param {string} sessionId - The ID of the session for which to generate a title.
 * @param {Array<object>} messages - The list of messages to use for generating the title.
 * @param {Function} renderHistoryListFunc - Function to render the history list.
 * @param {Function} showToastFunc - Function to show a toast message.
 */
export async function generateTitleForSession(sessionId, messages, renderHistoryListFunc, showToastFunc) {
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
                renderHistoryListFunc();
                showToastFunc('会话标题已生成');
            }
        }
    } catch (error) {
        console.error('生成标题失败:', error);
        // Failure here should not disturb the user, only log to console
    }
}