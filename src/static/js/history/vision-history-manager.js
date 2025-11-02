// src/history/vision-history-manager.js

/**
 * Vision 模式专用的历史管理器
 */
export const createVisionHistoryManager = () => {
    const VISION_HISTORY_KEY = 'vision_chat_history';
    let currentSessionId = null;
    let sessions = [];
    
    // 从本地存储加载数据
    try {
        const stored = localStorage.getItem(VISION_HISTORY_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            sessions = data.sessions || [];
            currentSessionId = data.currentSessionId || null;
        }
    } catch (error) {
        console.warn('Failed to load vision history:', error);
    }
    
    return {
        saveHistory: function() {
            try {
                const historyData = {
                    sessions: sessions,
                    currentSessionId: currentSessionId,
                    lastUpdated: new Date().toISOString()
                };
                localStorage.setItem(VISION_HISTORY_KEY, JSON.stringify(historyData));
                console.log('Vision history saved');
            } catch (error) {
                console.warn('Failed to save vision history:', error);
            }
        },
        
        getSessions: function() {
            return sessions;
        },
        
        getCurrentSessionId: function() {
            return currentSessionId;
        },
        
        setCurrentSessionId: function(sessionId) {
            currentSessionId = sessionId;
            this.saveHistory();
        },
        
        generateNewSession: function() {
            currentSessionId = `vision_${Date.now()}`;
            
            // 创建新会话
            const newSession = {
                id: currentSessionId,
                title: `Vision 会话 ${new Date().toLocaleString()}`,
                createdAt: new Date().toISOString(),
                messages: []
            };
            
            sessions.unshift(newSession); // 添加到开头
            if (sessions.length > 50) { // 限制会话数量
                sessions = sessions.slice(0, 50);
            }
            
            this.saveHistory();
            console.log('New vision session created:', currentSessionId);
            return currentSessionId;
        },
        
        // 添加消息到当前会话
        addMessage: function(message) {
            if (!currentSessionId) {
                this.generateNewSession();
            }
            
            const currentSession = sessions.find(s => s.id === currentSessionId);
            if (currentSession) {
                currentSession.messages.push({
                    ...message,
                    timestamp: new Date().toISOString()
                });
                this.saveHistory();
            }
        },
        
        // 获取当前会话的消息
        getCurrentSessionMessages: function() {
            if (!currentSessionId) return [];
            const currentSession = sessions.find(s => s.id === currentSessionId);
            return currentSession ? currentSession.messages : [];
        },
        
        // 清除当前会话
        clearCurrentSession: function() {
            if (currentSessionId) {
                const currentSession = sessions.find(s => s.id === currentSessionId);
                if (currentSession) {
                    currentSession.messages = [];
                    this.saveHistory();
                }
            }
        },
        
        renderHistoryList: function() {
            // Vision 模式的历史列表渲染逻辑
            console.log('Rendering vision history list - sessions:', sessions.length);
        },
        
        // 获取当前会话的标题
        getCurrentSessionTitle: function() {
            if (!currentSessionId) return '新会话';
            const currentSession = sessions.find(s => s.id === currentSessionId);
            return currentSession ? currentSession.title : '新会话';
        }
    };
};