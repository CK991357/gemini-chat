/**
 * @file history-manager.js
 * @description Manages chat history, including loading, saving, and interacting with session metadata.
 */

// 无法直接导入 main.js 中的函数，需要通过构造函数注入或重构
// 暂时移除 showToast 和 showSystemMessage 的导入，因为它们在 main.js 中定义，会造成循环依赖
// import { showToast, showSystemMessage } from '../main.js'; 

/**
 * @class HistoryManager
 * @description A class to encapsulate all functionality related to chat history.
 */
export class HistoryManager {
    /**
     * @constructor
     * @param {object} options - The options for the history manager.
     * @param {object} options.elements - A collection of DOM elements.
     * @param {Function} options.updateChatUI - Function to update the main chat UI.
     * @param {Function} options.getChatHistory - Function to get the current chat history array.
     * @param {Function} options.setChatHistory - Function to set the current chat history array.
     * @param {Function} options.getCurrentSessionId - Function to get the current session ID.
     * @param {Function} options.setCurrentSessionId - Function to set the current session ID.
     * @param {Function} options.showToast - Function to show a toast message.
     * @param {Function} options.showSystemMessage - Function to show a system message in chat.
     * @param {Function} options.logMessage - Function to log a system message.
     */
    constructor({ elements, updateChatUI, getChatHistory, setChatHistory, getCurrentSessionId, setCurrentSessionId, showToast, showSystemMessage, logMessage }) {
        this.elements = elements;
        this.updateChatUI = updateChatUI;
        this.getChatHistory = getChatHistory;
        this.setChatHistory = setChatHistory;
        this.getCurrentSessionId = getCurrentSessionId;
        this.setCurrentSessionId = setCurrentSessionId;
        this.showToast = showToast;
        this.showSystemMessage = showSystemMessage;
        this.logMessage = logMessage;

        this.activeOptionsMenu = null; // Track the currently open options menu
        this.boundHandleGlobalMenuClose = this.handleGlobalMenuClose.bind(this); // Bind the method once

        console.log("HistoryManager initialized");
    }

    /**
     * @description Initializes the history manager, renders the history list.
     */
    init() {
        this.renderHistoryList();
    }

    /**
     * @description Gets chat session metadata from localStorage.
     * @returns {Array<object>} Array of session metadata, or an empty array on failure.
     * @private
     */
    getChatSessionMeta() {
        try {
            const meta = localStorage.getItem('chat_session_meta');
            return meta ? JSON.parse(meta) : [];
        } catch (e) {
            console.error('Failed to parse chat session meta:', e);
            return [];
        }
    }

    /**
     * @description Saves chat session metadata to localStorage.
     * @param {Array<object>} meta - The session metadata array to save.
     * @private
     */
    saveChatSessionMeta(meta) {
        try {
            localStorage.setItem('chat_session_meta', JSON.stringify(meta));
        } catch (e) {
            console.error('Failed to save chat session meta:', e);
        }
    }

    /**
     * @description Generates a new chat session.
     */
    generateNewSession() {
        this.setChatHistory([]);
        const newSessionId = `session-${crypto.randomUUID()}`;
        this.setCurrentSessionId(newSessionId);
        this.updateChatUI({ messages: [] }); // Clear the UI

        let sessions = this.getChatSessionMeta();
        const now = new Date().toISOString();
        const newSessionMeta = {
            id: newSessionId,
            title: '新聊天',
            updatedAt: now,
            createdAt: now
        };
        sessions.unshift(newSessionMeta);
        this.saveChatSessionMeta(sessions);

        this.logMessage(`新聊天已开始 (ID: ${newSessionId})`, 'system');
        this.renderHistoryList();
    }

    /**
     * @description Renders the list of chat sessions from localStorage into the history panel.
     */
    renderHistoryList() {
        let sessions = this.getChatSessionMeta();
        this.elements.historyContent.innerHTML = '';

        if (sessions.length === 0) {
            this.elements.historyContent.innerHTML = '<p class="empty-history">暂无历史记录</p>';
            return;
        }

        sessions.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        const ul = document.createElement('ul');
        ul.className = 'history-list';

        sessions.forEach(session => {
            const li = document.createElement('li');
            li.className = 'history-item';
            li.dataset.sessionId = session.id;
            if (session.is_pinned) {
                li.classList.add('is-pinned');
            }
            li.innerHTML = `
                <div class="history-info">
                    <span class="history-title">${session.title}</span>
                    <span class="history-date">${new Date(session.updatedAt).toLocaleString()}</span>
                </div>
                <div class="history-actions">
                    ${session.is_pinned ? '<i class="fa-solid fa-thumbtack pinned-icon"></i>' : ''}
                    <button class="history-options-button"><i class="fa-solid fa-ellipsis-v"></i></button>
                    <div class="history-options-menu" style="display: none;">
                        <button class="menu-item" data-action="toggle-pin">${session.is_pinned ? '取消置顶' : '置顶'}</button>
                        <button class="menu-item" data-action="edit-title">编辑标题</button>
                        <button class="menu-item" data-action="delete">删除</button>
                    </div>
                </div>
            `;
            li.addEventListener('click', (event) => {
                if (!event.target.closest('.history-actions')) {
                    this.loadSessionHistory(session.id);
                }
            });

            const optionsButton = li.querySelector('.history-options-button');
            const optionsMenu = li.querySelector('.history-options-menu');

            optionsButton.addEventListener('click', (event) => {
                event.stopPropagation();
                if (this.activeOptionsMenu && this.activeOptionsMenu !== optionsMenu) {
                    this.activeOptionsMenu.style.display = 'none';
                }
                optionsMenu.style.display = optionsMenu.style.display === 'block' ? 'none' : 'block';
                this.activeOptionsMenu = optionsMenu.style.display === 'block' ? optionsMenu : null;
                document.removeEventListener('click', this.boundHandleGlobalMenuClose);
                if (this.activeOptionsMenu) {
                    document.addEventListener('click', this.boundHandleGlobalMenuClose);
                }
            });

            optionsMenu.querySelectorAll('.menu-item').forEach(menuItem => {
                menuItem.addEventListener('click', (event) => {
                    event.stopPropagation();
                    optionsMenu.style.display = 'none';
                    const action = menuItem.dataset.action;
                    switch (action) {
                        case 'toggle-pin':
                            this.togglePinSession(session.id, !session.is_pinned);
                            break;
                        case 'edit-title':
                            this.editSessionTitle(session.id, session.title);
                            break;
                        case 'delete':
                            this.deleteSession(session.id);
                            break;
                    }
                });
            });
            ul.appendChild(li);
        });
        this.elements.historyContent.appendChild(ul);
    }

    /**
     * @description Handles closing the options menu when clicking outside.
     * @param {Event} e - The click event.
     * @private
     */
    handleGlobalMenuClose(e) {
        if (this.activeOptionsMenu && !this.activeOptionsMenu.contains(e.target) && !e.target.closest('.history-options-button')) {
            this.activeOptionsMenu.style.display = 'none';
            this.activeOptionsMenu = null;
            document.removeEventListener('click', this.boundHandleGlobalMenuClose);
        }
    }

    /**
     * @description Loads a complete chat history from the backend and renders it.
     * @param {string} sessionId - The ID of the session to load.
     */
    async loadSessionHistory(sessionId) {
        this.showToast(`正在加载会话: ${sessionId}`);
        try {
            const response = await fetch(`/api/history/load/${sessionId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `无法加载会话: ${response.statusText}`);
            }
            const sessionData = await response.json();

            // Sanitize messages before rendering to prevent errors with marked() and improve UI
            if (sessionData.messages && Array.isArray(sessionData.messages)) {
                sessionData.messages.forEach(message => {
                    if (message.role === 'assistant' && !message.content) {
                        if (message.tool_calls && message.tool_calls.length > 0) {
                            const toolName = message.tool_calls[0]?.function?.name || '未知工具';
                            message.content = `*正在调用工具: ${toolName}...*`;
                        } else {
                            message.content = ''; // Fallback for other empty content cases
                        }
                    }
                });
            }

            this.setCurrentSessionId(sessionData.sessionId);
            this.setChatHistory(sessionData.messages);
            this.updateChatUI(sessionData);

            document.querySelector('.tab[data-mode="text"]').click();
            this.showToast('会话加载成功！');
        } catch (error) {
            console.error('加载历史记录失败:', error);
            this.showSystemMessage(`加载历史记录失败: ${error.message}`);
        }
    }

    /**
     * @description Saves the current session history to the backend.
     */
    async saveHistory() {
        const sessionId = this.getCurrentSessionId();
        const chatHistory = this.getChatHistory();
        if (!sessionId || chatHistory.length === 0) {
            return;
        }

        try {
            let sessions = this.getChatSessionMeta();
            const now = new Date().toISOString();
            const existingIndex = sessions.findIndex(s => s.id === sessionId);
            let currentSessionMeta;

            if (existingIndex !== -1) {
                currentSessionMeta = sessions.splice(existingIndex, 1)[0];
                currentSessionMeta.updatedAt = now;
            } else {
                currentSessionMeta = { id: sessionId, title: '新聊天', createdAt: now, updatedAt: now };
            }

            const response = await fetch('/api/history/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionId,
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

            sessions.unshift(currentSessionMeta);
            this.saveChatSessionMeta(sessions);
            this.renderHistoryList();

            // 在第一轮交互后，如果标题仍为默认值，则生成标题
            if (chatHistory.length === 2 && currentSessionMeta.title === '新聊天') {
                this.generateTitleForSession(sessionId, chatHistory);
            }
            // 在第二轮交互后，再次生成标题以获得更精确的结果，并覆盖旧标题
            else if (chatHistory.length === 4) {
                this.generateTitleForSession(sessionId, chatHistory);
            }
        } catch (error) {
            console.error('保存历史记录失败:', error);
            this.showSystemMessage(`保存历史记录失败: ${error.message}`);
        }
    }

    /**
     * @description Asynchronously generates a title for a session.
     * @param {string} sessionId - The ID of the session.
     * @param {Array<object>} messages - The messages to use for generating the title.
     */
    async generateTitleForSession(sessionId, messages) {
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
                const sessions = this.getChatSessionMeta();
                const sessionToUpdate = sessions.find(s => s.id === sessionId);
                if (sessionToUpdate) {
                    sessionToUpdate.title = title;
                    this.saveChatSessionMeta(sessions);
                    this.renderHistoryList();
                    this.showToast('会话标题已生成');
                }
            }
        } catch (error) {
            console.error('生成标题失败:', error);
        }
    }

    /**
     * @description Toggles the pinned state of a session.
     * @param {string} sessionId - The ID of the session.
     * @param {boolean} isPinned - The target pinned state.
     */
    async togglePinSession(sessionId, isPinned) {
        this.showToast(`正在${isPinned ? '置顶' : '取消置顶'}会话...`);
        try {
            const response = await fetch(`/api/history/${sessionId}/pin`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_pinned: isPinned })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `无法${isPinned ? '置顶' : '取消置顶'}会话`);
            }

            let sessions = this.getChatSessionMeta();
            const sessionToUpdate = sessions.find(s => s.id === sessionId);
            if (sessionToUpdate) {
                sessionToUpdate.is_pinned = isPinned;
                this.saveChatSessionMeta(sessions);
                this.renderHistoryList();
                this.showToast(`会话已${isPinned ? '置顶' : '取消置顶'}！`);
            }
        } catch (error) {
            console.error(`切换置顶状态失败:`, error);
            this.showSystemMessage(`切换置顶状态失败: ${error.message}`);
        }
    }

    /**
     * @description Edits the title of a session.
     * @param {string} sessionId - The ID of the session.
     * @param {string} currentTitle - The current title.
     */
    async editSessionTitle(sessionId, currentTitle) {
        const newTitle = prompt('请输入新的会话标题:', currentTitle);
        if (!newTitle || newTitle.trim() === '' || newTitle === currentTitle) {
            this.showToast('标题未更改或已取消。');
            return;
        }

        this.showToast('正在更新标题...');
        try {
            const response = await fetch(`/api/history/${sessionId}/title`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle.trim() })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '无法更新标题');
            }

            let sessions = this.getChatSessionMeta();
            const sessionToUpdate = sessions.find(s => s.id === sessionId);
            if (sessionToUpdate) {
                sessionToUpdate.title = newTitle.trim();
                this.saveChatSessionMeta(sessions);
                this.renderHistoryList();
                this.showToast('会话标题已更新！');
            }
        } catch (error) {
            console.error('编辑标题失败:', error);
            this.showSystemMessage(`编辑标题失败: ${error.message}`);
        }
    }

    /**
     * @description Deletes a session.
     * @param {string} sessionId - The ID of the session to delete.
     */
    async deleteSession(sessionId) {
        if (!confirm('确定要删除此聊天会话吗？此操作不可撤销。')) {
            this.showToast('删除已取消。');
            return;
        }

        this.showToast('正在删除会话...');
        try {
            const response = await fetch(`/api/history/${sessionId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '无法删除会话');
            }

            let sessions = this.getChatSessionMeta();
            sessions = sessions.filter(s => s.id !== sessionId);
            this.saveChatSessionMeta(sessions);
            this.renderHistoryList();
            this.showToast('会话已删除！');

            if (this.getCurrentSessionId() === sessionId) {
                this.generateNewSession();
            }
        } catch (error) {
            console.error('删除会话失败:', error);
            this.showSystemMessage(`删除会话失败: ${error.message}`);
        }
    }
}