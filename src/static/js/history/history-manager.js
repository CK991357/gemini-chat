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

        this.isBatchMode = false; // 新增：批量模式状态
        this.selectedSessions = new Set(); // 新增：存储选中的会话ID

        console.log("HistoryManager initialized");
    }

    /**
     * @description Initializes the history manager, renders the history list and sets up event listeners for batch operations.
     */
    init() {
        this.renderHistoryList();
        this.setupBatchEventListeners(); // 新增：设置批量操作事件监听器
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
     * @description Sets up event listeners for batch operation buttons.
     * @private
     */
    setupBatchEventListeners() {
        this.elements.batchModeBtn.addEventListener('click', () => this.toggleBatchMode());
        this.elements.deleteSelectedBtn.addEventListener('click', () => this.deleteSelectedSessions());
        this.elements.cancelBatchBtn.addEventListener('click', () => this.toggleBatchMode(false)); // 取消批量模式
    }

    /**
     * @description Toggles the batch mode on/off.
     * @param {boolean} [forceState] - Optional. If provided, forces the batch mode to this state.
     */
    toggleBatchMode(forceState) {
        this.isBatchMode = forceState !== undefined ? forceState : !this.isBatchMode;
        this.selectedSessions.clear(); // 清空选中项

        // 切换 body 上的 class 以控制 CSS 样式
        document.body.classList.toggle('batch-mode', this.isBatchMode);

        this.renderHistoryList(); // 重新渲染列表以显示/隐藏复选框
        this.showToast(this.isBatchMode ? '已进入批量操作模式' : '已退出批量操作模式');
    }

    /**
     * @description Toggles the selection state of a session in batch mode.
     * @param {string} sessionId - The ID of the session to toggle.
     */
    toggleSessionSelection(sessionId) {
        if (this.selectedSessions.has(sessionId)) {
            this.selectedSessions.delete(sessionId);
        } else {
            this.selectedSessions.add(sessionId);
        }
        // 更新删除按钮的文本，显示选中数量
        this.elements.deleteSelectedBtn.textContent = `删除选中 (${this.selectedSessions.size})`;
        if (this.selectedSessions.size === 0) {
            this.elements.deleteSelectedBtn.textContent = '删除选中';
        }
    }

    /**
     * @description Deletes all selected sessions.
     */
    async deleteSelectedSessions() {
        if (this.selectedSessions.size === 0) {
            this.showToast('请选择要删除的会话。');
            return;
        }

        if (!confirm(`确定要删除选中的 ${this.selectedSessions.size} 个聊天会话吗？此操作不可撤销。`)) {
            this.showToast('删除已取消。');
            return;
        }

        this.showToast('正在批量删除会话...');
        try {
            const sessionIdsToDelete = Array.from(this.selectedSessions);
            const deletePromises = sessionIdsToDelete.map(sessionId => 
                fetch(`/api/history/${sessionId}`, { method: 'DELETE' })
            );

            const results = await Promise.allSettled(deletePromises);
            let successfulDeletions = 0;
            let failedDeletions = 0;

            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.ok) {
                    successfulDeletions++;
                } else {
                    failedDeletions++;
                    console.error(`删除会话 ${sessionIdsToDelete[index]} 失败:`, result.reason || result.value.statusText);
                }
            });

            let sessions = this.getChatSessionMeta();
            sessions = sessions.filter(s => !this.selectedSessions.has(s.id));
            this.saveChatSessionMeta(sessions);
            
            this.toggleBatchMode(false); // 退出批量模式并清空选中项
            this.renderHistoryList(); // 重新渲染列表

            if (successfulDeletions > 0) {
                this.showToast(`成功删除 ${successfulDeletions} 个会话！`);
            }
            if (failedDeletions > 0) {
                this.showSystemMessage(`有 ${failedDeletions} 个会话删除失败，请检查控制台。`);
            }

            // 如果当前会话被删除，则生成新会话
            if (sessionIdsToDelete.includes(this.getCurrentSessionId())) {
                this.generateNewSession();
            }
        } catch (error) {
            console.error('批量删除会话失败:', error);
            this.showSystemMessage(`批量删除会话失败: ${error.message}`);
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

            // 根据是否在批量模式添加复选框
            const checkboxHtml = this.isBatchMode ? 
                `<input type="checkbox" class="session-checkbox" data-session-id="${session.id}" ${this.selectedSessions.has(session.id) ? 'checked' : ''}>` : '';

            li.innerHTML = `
                ${checkboxHtml}
                <div class="history-info">
                    <span class="history-title">${session.title}</span>
                    <span class="history-date">${new Date(session.updatedAt).toLocaleString()}</span>
                </div>
                <div class="history-actions">
                    ${session.is_pinned ? '<span class="material-symbols-outlined pinned-icon">push_pin</span>' : ''}
                    ${!this.isBatchMode ? '<button class="material-symbols-outlined history-options-button">more_vert</button>' : ''}
                    <div class="history-options-menu" style="display: none;">
                        <button class="menu-item" data-action="toggle-pin">${session.is_pinned ? '取消置顶' : '置顶'}</button>
                        <button class="menu-item" data-action="edit-title">编辑标题</button>
                        <button class="menu-item" data-action="delete">删除</button>
                    </div>
                </div>
            `;
            
            // 批量模式下点击整个li切换选中状态，非批量模式下加载会话
            li.addEventListener('click', (event) => {
                if (this.isBatchMode) {
                    const checkbox = li.querySelector('.session-checkbox');
                    if (checkbox && event.target !== checkbox) { // 避免重复处理点击复选框的事件
                        checkbox.checked = !checkbox.checked;
                    }
                    this.toggleSessionSelection(session.id);
                } else if (!event.target.closest('.history-actions')) {
                    this.loadSessionHistory(session.id);
                }
            });

            // 监听复选框的change事件
            const checkbox = li.querySelector('.session-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (event) => {
                    event.stopPropagation(); // 阻止事件冒泡到li的点击事件
                    this.toggleSessionSelection(session.id);
                });
            }

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
