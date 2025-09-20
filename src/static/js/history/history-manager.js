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

        // Initialize history enabled state from localStorage, default to true
        this.historyEnabled = localStorage.getItem('historyEnabled') !== 'false';

        // State for batch selection
        this.isSelectMode = false;
        this.selectedSessions = new Set();

        this.elements.historyEnabledSwitch = document.getElementById('history-enabled-switch');
        this.elements.restoreHistoryBtn = document.getElementById('restore-history-btn');
        this.elements.batchSelectBtn = document.getElementById('batch-select-history-btn');
        this.elements.deleteSelectedBtn = document.getElementById('delete-selected-history-btn');

        console.log("HistoryManager initialized");
    }
 
     /**
      * @description Initializes the history manager, renders the history list.
      */
    async init() {
        if (this.elements.historyEnabledSwitch) {
            this.elements.historyEnabledSwitch.checked = this.historyEnabled;
            this.elements.historyEnabledSwitch.addEventListener('change', (event) => {
                this.setHistoryEnabled(event.target.checked);
            });
        }

        if (this.elements.restoreHistoryBtn) {
            this.elements.restoreHistoryBtn.addEventListener('click', () => this.recoverHistoryFromServer());
        }

        if (this.elements.batchSelectBtn) {
            this.elements.batchSelectBtn.addEventListener('click', () => this.toggleSelectMode());
        }

        if (this.elements.deleteSelectedBtn) {
            this.elements.deleteSelectedBtn.addEventListener('click', () => this.handleBatchDelete());
        }

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

        // 如果历史记录被禁用，则不创建新的会话元数据
        if (!this.historyEnabled) {
            this.logMessage('历史记录已禁用，仅重置聊天界面。', 'system');
            // 列表保持可见，因此不需要特殊的渲染调用
            return;
        }

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
        this.elements.historyContent.innerHTML = '';

        let sessions = this.getChatSessionMeta();

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

            // No extra elements needed. The selection state will be indicated by a CSS pseudo-element.
            if (this.selectedSessions.has(session.id)) {
                li.classList.add('selected');
            }

            const infoDiv = document.createElement('div');
            infoDiv.className = 'history-info';
            infoDiv.innerHTML = `
                <span class="history-title">${session.title}</span>
                <span class="history-date">${new Date(session.updatedAt).toLocaleString()}</span>
            `;
            li.appendChild(infoDiv);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'history-actions';
            actionsDiv.innerHTML = `
                ${session.is_pinned ? '<i class="fa-solid fa-thumbtack pinned-icon"></i>' : ''}
                <button class="history-options-button"><i class="fa-solid fa-ellipsis-v"></i></button>
                <div class="history-options-menu" style="display: none;">
                    <button class="menu-item" data-action="toggle-pin">${session.is_pinned ? '取消置顶' : '置顶'}</button>
                    <button class="menu-item" data-action="edit-title">编辑标题</button>
                    <button class="menu-item" data-action="delete">删除</button>
                </div>
            `;
            li.appendChild(actionsDiv);

            const handleItemClick = (event) => {
                if (this.isSelectMode) {
                    // Final debugging attempt: Directly manipulate inline styles to bypass all CSS issues.
                    if (this.selectedSessions.has(session.id)) {
                        // Item is currently selected, so unselect it
                        this.selectedSessions.delete(session.id);
                        li.style.backgroundColor = ''; // Clear inline style
                    } else {
                        // Item is not selected, so select it
                        this.selectedSessions.add(session.id);
                        // Using a hardcoded RGBA value that corresponds to --primary-color with opacity
                        li.style.backgroundColor = 'rgba(66, 133, 244, 0.2)';
                    }
                } else {
                    // Default behavior: load session, but not if clicking on actions
                    if (!event.target.closest('.history-actions')) {
                        this.loadSessionHistory(session.id);
                    }
                }
            };

            li.addEventListener('click', handleItemClick);

            const optionsButton = li.querySelector('.history-options-button');
            const optionsMenu = li.querySelector('.history-options-menu');

            optionsButton.addEventListener('click', (event) => {
                event.stopPropagation();
                if (this.isSelectMode) return; // Disable options menu in select mode
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
        // Exit select mode if active
        if (this.isSelectMode) {
            this.toggleSelectMode(false);
        }

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
        if (!this.historyEnabled) {
            this.logMessage('历史记录已禁用，跳过保存。', 'system');
            return;
        }
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

    /**
     * @description Sets the history enabled state and saves it to localStorage.
     * @param {boolean} isEnabled - Whether to enable or disable history.
     */
    setHistoryEnabled(isEnabled) {
        this.historyEnabled = isEnabled;
        localStorage.setItem('historyEnabled', isEnabled);
        this.showToast(`历史记录已${isEnabled ? '启用' : '禁用'}`);
        this.logMessage(`历史记录已${isEnabled ? '启用' : '禁用'}。`, 'system');
        this.renderHistoryList(); // 立即刷新历史列表的显示状态
    }

    /**
     * @description Recovers chat session metadata from the backend and overwrites local data.
     * @param {boolean} showAlert - Whether to show a success/failure alert. Defaults to true.
     */
    async recoverHistoryFromServer(showAlert = true) {
        this.showToast('正在从云端恢复历史记录...');
        try {
            const response = await fetch('/api/history/list-all-meta');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `无法从后端恢复: ${response.statusText}`);
            }
            const sessionMetas = await response.json();

            if (sessionMetas) {
                // 强制覆盖本地存储
                this.saveChatSessionMeta(sessionMetas);
                this.renderHistoryList();

                // 检查当前会话是否仍然存在，如果不存在则新建一个会话以清空UI
                const currentSessionId = this.getCurrentSessionId();
                if (currentSessionId && !sessionMetas.some(s => s.id === currentSessionId)) {
                    this.logMessage('当前会话在恢复后已不存在，正在启动新会话...', 'system');
                    this.generateNewSession();
                }

                if (showAlert) {
                    this.showToast(`已成功从云端恢复 ${sessionMetas.length} 条记录！`);
                }
                this.logMessage(`已从后端恢复 ${sessionMetas.length} 个会话元数据。`, 'system');
            } else {
                if (showAlert) {
                    this.showToast('云端没有可恢复的记录。');
                }
                this.logMessage('后端没有可恢复的会话元数据。', 'system');
            }
        } catch (error) {
            console.error('从后端恢复历史记录失败:', error);
            if (showAlert) {
                this.showSystemMessage(`从后端恢复失败: ${error.message}`);
            }
        }
    }

    /**
     * @description Toggles the batch selection mode.
     * @param {boolean} [forceState] - Optional. Force a specific state (true for on, false for off).
     */
    toggleSelectMode(forceState = null) {
        this.isSelectMode = forceState !== null ? forceState : !this.isSelectMode;

        const container = this.elements.historyContent.parentElement; // Get the container to apply the class
        const batchSelectIcon = this.elements.batchSelectBtn.querySelector('i');

        if (this.isSelectMode) {
            container.classList.add('select-mode');
            this.elements.deleteSelectedBtn.style.display = 'inline-flex';
            this.elements.restoreHistoryBtn.style.display = 'none'; // Hide restore button
            this.elements.batchSelectBtn.title = '取消选择';
            batchSelectIcon.className = 'fas fa-times'; // Change to a 'cancel' icon
        } else {
            container.classList.remove('select-mode');
            this.elements.deleteSelectedBtn.style.display = 'none';
            this.elements.restoreHistoryBtn.style.display = 'inline-flex'; // Show restore button
            this.elements.batchSelectBtn.title = '批量选择';
            batchSelectIcon.className = 'fas fa-check-square'; // Revert to original icon
            this.selectedSessions.clear();
        }
        // Re-render to show/hide checkboxes correctly without a full redraw if possible
        // For simplicity, we'll just rely on the CSS class toggle.
        this.renderHistoryList();
    }

    /**
     * @description Handles the batch deletion of selected sessions.
     */
    async handleBatchDelete() {
        const sessionIdsToDelete = Array.from(this.selectedSessions);
        if (sessionIdsToDelete.length === 0) {
            this.showToast('没有选择任何会话。');
            return;
        }

        if (!confirm(`确定要删除选中的 ${sessionIdsToDelete.length} 个聊天会话吗？此操作不可撤销。`)) {
            this.showToast('批量删除已取消。');
            return;
        }

        this.showToast(`正在删除 ${sessionIdsToDelete.length} 个会话...`);
        try {
            const response = await fetch('/api/history/batch-delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionIds: sessionIdsToDelete })
            });

            if (!response.ok) {
                // Try to get error details, but handle cases where it might not be JSON
                let errorMsg = '无法批量删除会话';
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {
                    // Ignore if response is not JSON
                }
                throw new Error(errorMsg);
            }

            let sessions = this.getChatSessionMeta();
            sessions = sessions.filter(s => !this.selectedSessions.has(s.id));
            this.saveChatSessionMeta(sessions);

            this.showToast('选中的会话已成功删除！');

            // Check if the currently active session was deleted
            const currentSessionId = this.getCurrentSessionId();
            if (this.selectedSessions.has(currentSessionId)) {
                this.generateNewSession(); // Start a new session if the active one was deleted
            }

        } catch (error) {
            console.error('批量删除会话失败:', error);
            this.showSystemMessage(`批量删除失败: ${error.message}`);
        } finally {
            // Always exit select mode and re-render
            this.toggleSelectMode(false);
        }
    }
}