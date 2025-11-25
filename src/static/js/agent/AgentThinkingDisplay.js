// src/static/js/agent/AgentThinkingDisplay.js - 状态同步修复版

export class AgentThinkingDisplay {
    constructor() {
        this.container = null;
        this.currentSession = null;
        this.stylesInjected = false;
        this.timeUpdateInterval = null;
        this.executionLog = [];
        
        // 🎯 修复：折叠状态管理 - 只在会话开始时初始化
        this.sectionStates = {};
        
        this.init();
    }

    /**
     * 🎯 初始化显示组件
     */
    init() {
        this.injectStyles();
        this.setupEventListeners();
        console.log('[AgentThinkingDisplay] DeepResearch 监控面板初始化完成');
    }

    /**
     * 🎯 修复：注入不透明样式
     */
    injectStyles() {
        if (this.stylesInjected) return;

        const styleId = 'agent-thinking-styles';
        if (document.getElementById(styleId)) return;

        const css = `
/* Agent Thinking Display Styles - 折叠状态修复版 */
#agent-thinking-container {
    display: none;
    position: fixed;
    top: 20px;
    right: 20px;
    width: 650px;
    max-height: 80vh;
    background: #ffffff !important;
    border: 2px solid #667eea;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.25);
    z-index: 1000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    transition: all 0.3s ease;
    opacity: 1 !important;
}

#agent-thinking-container.minimized {
    height: 50px;
    overflow: hidden;
}

/* 修复内容区域不透明 */
.agent-thinking-container .session-content {
    background: #ffffff !important;
    opacity: 1 !important;
}

/* 移动端优化 */
@media (max-width: 768px) {
    #agent-thinking-container {
        width: 95% !important;
        left: 2.5% !important;
        right: 2.5% !important;
        top: 10px !important;
    }
}

/* 增强的DeepResearch主题样式 */
.agent-thinking-container .session-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
}

/* 🎯 优化：研究统计网格 */
.research-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 12px 0;
}

.stat-item {
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    text-align: center;
    transition: all 0.3s ease;
}

.stat-item:hover {
    background: #edf2f7;
    transform: translateY(-2px);
}

.stat-value {
    font-size: 18px;
    font-weight: bold;
    color: #2d3748;
    display: block;
}

.stat-label {
    font-size: 12px;
    color: #718096;
    margin-top: 4px;
}

/* 🎯 新增：搜索记录样式 */
.query-log-section {
    margin-bottom: 16px;
    padding: 0 16px;
}

.query-log {
    max-height: 200px;
    overflow-y: auto;
    background: #f8fafc;
    border-radius: 8px;
    padding: 12px;
}

.query-log-entry {
    display: flex;
    align-items: flex-start;
    padding: 8px;
    margin-bottom: 6px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.4;
}

.query-log-entry:last-child {
    margin-bottom: 0;
}

.query-number {
    background: #667eea;
    color: white;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: bold;
    margin-right: 8px;
    flex-shrink: 0;
}

.query-text {
    flex: 1;
    color: #2d3748;
}

.query-status {
    margin-left: 8px;
    font-size: 12px;
    flex-shrink: 0;
}

/* 🎯 新增：执行日志样式 */
.execution-log-section {
    margin-bottom: 16px;
    padding: 0 16px;
}

.execution-log {
    max-height: 300px;
    overflow-y: auto;
    background: #f8fafc;
    border-radius: 8px;
    padding: 12px;
}

.log-entry {
    display: flex;
    align-items: flex-start;
    padding: 10px;
    margin-bottom: 8px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    transition: all 0.2s ease;
}

.log-entry:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.log-entry:last-child {
    margin-bottom: 0;
}

.log-icon {
    font-size: 14px;
    margin-right: 10px;
    flex-shrink: 0;
    margin-top: 2px;
}

.log-content {
    flex: 1;
}

.log-meta {
    font-size: 11px;
    color: #718096;
    margin-bottom: 4px;
    font-weight: 500;
}

.log-text {
    font-size: 13px;
    line-height: 1.5;
    color: #2d3748;
    white-space: pre-wrap;
}

.log-placeholder {
    color: #a0aec0;
    font-style: italic;
    text-align: center;
    padding: 20px;
}

/* 日志类型颜色 */
.log-type-thought {
    border-left: 3px solid #4299e1;
}

.log-type-tool_start {
    border-left: 3px solid #48bb78;
}

.log-type-tool_success {
    border-left: 3px solid #38a169;
}

.log-type-tool_error {
    border-left: 3px solid #e53e3e;
}

.log-type-plan {
    border-left: 3px solid #805ad5;
}

.log-type-summary {
    border-left: 3px solid #d69e2e;
}

.log-type-research_start {
    border-left: 3px solid #667eea;
}

/* 会话控制按钮样式 */
.session-controls {
    display: flex;
    gap: 8px;
}

.session-controls button {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: background 0.2s;
}

.session-controls button:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* 部分标题样式 */
.section-title {
    font-weight: bold;
    color: #2d3748;
    margin-bottom: 8px;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.user-query-section, .research-stats-section {
    margin-bottom: 16px;
    padding: 0 16px;
}

.user-query {
    background: #f7fafc;
    padding: 12px;
    border-radius: 6px;
    border-left: 3px solid #667eea;
    font-size: 14px;
    line-height: 1.5;
}

.session-title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.session-icon {
    font-size: 16px;
}

.session-title h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.session-badge {
    background: rgba(255, 255, 255, 0.2);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
}

/* Token详情样式 */
.token-details {
    font-size: 11px;
    color: #718096;
    margin-top: 2px;
}

.token-details span {
    margin-right: 8px;
}

/* ✨ 修复：可折叠 Section 样式 */
.section-title {
    cursor: pointer;
    user-select: none;
}

.section-title .toggle-icon {
    margin-left: auto;
    transition: transform 0.2s ease;
    font-size: 12px;
}

.section-content-wrapper.minimized .toggle-icon {
    transform: rotate(-90deg);
}

.section-content-wrapper .section-content {
    max-height: 500px;
    overflow: hidden;
    transition: all 0.3s ease-in-out;
}

.section-content-wrapper.minimized .section-content {
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    margin-top: 0;
    margin-bottom: 0;
    opacity: 0;
}

/* 🎯 干预面板样式 */
.intervention-panel {
    margin: 12px 16px;
    padding: 12px;
    border-radius: 8px;
    background: linear-gradient(90deg, #f8fafc 0%, #ffffff 100%);
    border: 1px solid #e6eef8;
}
.intervention-panel .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}
.intervention-panel .panel-title {
    font-weight: 600;
    color: #2d3748;
}
.intervention-panel .panel-badge {
    background: #e2e8f0;
    color: #2d3748;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
}
.intervention-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
}
.intervention-buttons .btn {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid rgba(34,36,38,0.1);
    cursor: pointer;
}
.intervention-buttons .btn-warning { background:#fff7ed; }
.intervention-buttons .btn-danger { background:#fff1f2; }
.intervention-buttons .btn-success { background:#ecfdf5; }
.intervention-input { margin-top:8px; }
.intervention-input textarea { width:100%; min-height:80px; resize:vertical; padding:8px; border-radius:6px; border:1px solid #e2e8f0 }
.intervention-input .btn { margin-top:8px }

@media (max-width: 768px) {
    .intervention-buttons { flex-direction: column; }
}
        `;

        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);

        this.stylesInjected = true;
        console.log('[AgentThinkingDisplay] 优化样式注入完成');
    }

    /**
     * 🎯 创建显示容器
     */
    createContainer() {
        const container = document.createElement('div');
        container.id = 'agent-thinking-container';
        container.className = 'agent-thinking-container';
        document.body.appendChild(container);
        return container;
    }

    /**
     * 🎯 修复：开始会话 - 只在启动时自动折叠
     */
    startSession(userMessage, maxIterations = 6, researchData = {}) {
        if (!this.container) {
            this.container = this.createContainer();
        }
        
        const sessionId = `deepresearch_${Date.now()}`;
        this.currentSession = {
            id: sessionId,
            userMessage: userMessage.replace(/！\s*$/, '').trim(),
            maxIterations,
            currentIteration: 0,
            startTime: Date.now(),
            status: 'initializing',
            researchState: {
                queryLog: [],
                collectedSources: researchData.sources || [],
                toolCalls: researchData.toolCalls || [],
                metrics: {
                    tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                    ...researchData.metrics
                }
            },
            executionLog: []
        };

        // 🎯 修复：只在会话开始时初始化折叠状态
        // 如果已经有折叠状态，保持现有状态；否则初始化默认状态
        if (Object.keys(this.sectionStates).length === 0) {
            this.sectionStates = {
                'stats-content': false,      // 研究统计 - 默认展开
                'query-log-content': false,  // 搜索记录 - 默认折叠
                'execution-log-content': false // 执行日志 - 默认折叠
            };
        }

        this.renderSession();
        this.show();
        
        // 🎯 修复：只在启动时自动折叠整个面板
        this.container.classList.add('minimized');
        
        // 🎯 记录研究开始
        this.addExecutionLog(`开始研究: "${this.currentSession.userMessage}"`, 'research_start');
        
        return sessionId;
    }

    /**
     * 🎯 ✨✨✨ 核心修复1：渲染会话界面 - 即时计算成功调用次数 ✨✨✨
     */
    renderSession() {
        const { userMessage, researchState } = this.currentSession;
        
        // 🎯 修复：正确计算工具调用统计数据
        const queryCount = researchState.queryLog?.length || 0;
        const sourcesCount = researchState.collectedSources?.length || 0;
        const toolCallsCount = researchState.toolCalls?.length || 0;
        
        // ✨✨✨ 核心修复1：每次渲染时即时计算成功调用次数 ✨✨✨
        const successfulTools = researchState.toolCalls?.filter(t => {
            // 多种方式确保成功状态的正确识别
            if (t.success === true) return true;
            if (t.success === 'true') return true;
            if (String(t.success).toLowerCase() === 'true') return true;
            return false;
        })?.length || 0;
        
        const tokenUsage = researchState.metrics?.tokenUsage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };

        // 🎯 修复：计算已用时间
        const elapsedTime = this._calculateElapsedTime();

        // 🎯 修复：保存当前整体面板的折叠状态
        const isPanelMinimized = this.container?.classList?.contains('minimized') || false;

        // 🎯 调试：打印统计信息
        console.log(`[AgentThinkingDisplay] 渲染统计:`, {
            toolCallsCount,
            successfulTools, // ✨ 现在这个值应该是正确的
            allToolCalls: researchState.toolCalls?.map(t => ({ tool: t.tool, success: t.success })) || []
        });

        this.container.innerHTML = `
            <div class="agent-session">
                <div class="session-header">
                    <div class="session-title">
                        <span class="session-icon">🔍</span>
                        <h3>DeepResearch 深度研究</h3>
                        <span class="session-badge">${this.getStatusText(this.currentSession.status)}</span>
                    </div>
                    <div class="session-controls">
                        <button class="btn-minimize">${isPanelMinimized ? '+' : '−'}</button>
                        <button class="btn-close">×</button>
                    </div>
                </div>
                
                <div class="session-content">
                    <!-- 用户研究请求 -->
                    <div class="user-query-section">
                        <div class="section-title">🎯 研究主题</div>
                        <div class="user-query">${this.escapeHtml(userMessage)}</div>
                    </div>

                    <!-- 🎯 人工干预控制面板（插入点：研究主题与研究统计之间） -->
                    <div id="intervention-panel" class="intervention-panel" style="display: none;">
                        <div class="panel-header">
                            <div class="panel-title">研究任务控制</div>
                            <div id="interventionBadge" class="panel-badge">状态: 空闲</div>
                        </div>
                        <div class="intervention-buttons">
                            <button id="btnPause" class="btn btn-warning">⏸️ 暂停</button>
                            <button id="btnAbort" class="btn btn-danger">⏹️ 中止</button>
                            <button id="btnContinue" class="btn btn-success">▶️ 继续</button>
                        </div>
                        <div id="interventionInput" class="intervention-input" style="display:none;">
                            <textarea id="interventionText" placeholder="请输入补充信息（最大5000字符）..."></textarea>
                            <button id="btnSubmitInfo" class="btn btn-primary">提交</button>
                        </div>
                    </div>
                    
                    <!-- 研究统计 -->
                    <div class="research-stats-section section-content-wrapper ${this.sectionStates['stats-content'] ? 'minimized' : ''}">
                        <div class="section-title" data-target="stats-content">
                            📈 研究统计 <span class="toggle-icon">▼</span>
                        </div>
                        <div class="section-content" id="stats-content">
                            <div class="research-stats-grid">
                                <div class="stat-item">
                                    <span class="stat-value">${queryCount}</span>
                                    <span class="stat-label">搜索次数</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${sourcesCount}</span>
                                    <span class="stat-label">收集来源</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${toolCallsCount}</span>
                                    <span class="stat-label">工具调用</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${successfulTools}</span>
                                    <span class="stat-label">成功调用</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value">${tokenUsage.total_tokens.toLocaleString()}</span>
                                    <span class="stat-label">Token 消耗</span>
                                    <div class="token-details">
                                        <span>上行: ${tokenUsage.prompt_tokens.toLocaleString()}</span>
                                        <span>下行: ${tokenUsage.completion_tokens.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value" id="elapsed-time">${elapsedTime}</span>
                                    <span class="stat-label">已用时间</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 🎯 搜索记录 -->
                    <div class="query-log-section section-content-wrapper ${this.sectionStates['query-log-content'] ? 'minimized' : ''}">
                        <div class="section-title" data-target="query-log-content">
                            🔍 搜索记录 <span class="toggle-icon">▼</span>
                        </div>
                        <div class="section-content" id="query-log-content">
                            <div class="query-log" id="query-log">
                                ${this.renderQueryLog(researchState.queryLog)}
                            </div>
                        </div>
                    </div>
                    
                    <!-- 🎯 执行日志 -->
                    <div class="execution-log-section section-content-wrapper ${this.sectionStates['execution-log-content'] ? 'minimized' : ''}">
                        <div class="section-title" data-target="execution-log-content">
                            📜 执行日志 <span class="toggle-icon">▼</span>
                        </div>
                        <div class="section-content" id="execution-log-content">
                            <div class="execution-log" id="execution-log">
                                ${this.renderExecutionLog()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 🎯 修复：恢复整体面板的折叠状态
        if (isPanelMinimized) {
            this.container.classList.add('minimized');
        } else {
            this.container.classList.remove('minimized');
        }

        this.attachContainerEvents();
        this.attachCollapsibleEvents();
        this.startTimeUpdate();
        // 绑定干预面板按钮事件（每次渲染后确保绑定）
        this._bindInterventionHandlers();
    }

    /**
     * 🎯 绑定干预面板的按钮事件
     */
    _bindInterventionHandlers() {
        try {
            const panel = document.getElementById('intervention-panel');
            const btnPause = document.getElementById('btnPause');
            const btnAbort = document.getElementById('btnAbort');
            const btnContinue = document.getElementById('btnContinue');
            const btnSubmit = document.getElementById('btnSubmitInfo');

            if (btnPause) {
                btnPause.onclick = async () => {
                    await this.onPauseClick();
                };
            }
            if (btnAbort) {
                btnAbort.onclick = async () => {
                    await this.onAbortClick();
                };
            }
            if (btnContinue) {
                btnContinue.onclick = async () => {
                    await this.onContinueClick();
                };
            }
            if (btnSubmit) {
                btnSubmit.onclick = async () => {
                    await this.onSubmitInfo();
                };
            }
        } catch (e) {
            console.warn('[AgentThinkingDisplay] 绑定干预按钮失败', e);
        }
    }

    /**
     * 🎯 修复：计算已用时间
     */
    _calculateElapsedTime() {
        if (!this.currentSession) return '0s';
        
        const endTime = this.currentSession.endTime || Date.now();
        const elapsedSeconds = Math.floor((endTime - this.currentSession.startTime) / 1000);
        return `${elapsedSeconds}s`;
    }

    /**
     * 🎯 渲染搜索记录
     */
    renderQueryLog(queryLog) {
        if (!queryLog || queryLog.length === 0) {
            return '<div class="log-placeholder">暂无搜索记录</div>';
        }

        return queryLog.map((query, index) => `
            <div class="query-log-entry">
                <div class="query-number">${index + 1}</div>
                <div class="query-text">${this.escapeHtml(query.query)}</div>
                <div class="query-status">${query.success ? '✅' : '❌'}</div>
            </div>
        `).join('');
    }

    /**
     * 🎯 渲染执行日志
     */
    renderExecutionLog() {
        if (!this.executionLog || this.executionLog.length === 0) {
            return '<div class="log-placeholder">等待DeepResearch开始分析...</div>';
        }

        return this.executionLog.map(log => `
            <div class="log-entry log-type-${log.type}">
                <div class="log-icon">${this.getLogIcon(log.type)}</div>
                <div class="log-content">
                    <div class="log-meta">${this.getLogTypeText(log.type)} - ${log.timestamp}</div>
                    <div class="log-text">${this.escapeHtml(log.content)}</div>
                </div>
            </div>
        `).join('');
    }

    /**
     * 🎯 获取日志图标
     */
    getLogIcon(type) {
        const iconMap = {
            'research_start': '🚀',
            'plan': '📋',
            'thought': '💭',
            'tool_start': '🛠️',
            'tool_success': '✅',
            'tool_error': '❌',
            'summary': '📝',
            'info': 'ℹ️'
        };
        return iconMap[type] || '•';
    }

    /**
     * 🎯 获取日志类型文本
     */
    getLogTypeText(type) {
        const textMap = {
            'research_start': '研究开始',
            'plan': '研究计划',
            'thought': '模型思考',
            'tool_start': '工具调用',
            'tool_success': '工具成功',
            'tool_error': '工具错误',
            'summary': '研究总结',
            'info': '信息'
        };
        return textMap[type] || type;
    }

    /**
     * 🎯 添加执行日志
     */
    addExecutionLog(content, type = 'info') {
        const logEntry = {
            content,
            type,
            timestamp: new Date().toLocaleTimeString()
        };
        
        this.executionLog.push(logEntry);
        
        // 限制日志数量，防止内存泄漏
        if (this.executionLog.length > 50) {
            this.executionLog = this.executionLog.slice(-40);
        }
        
        this.renderSession();
    }

    /**
     * 🎯 干预按钮 - 暂停
     */
    async onPauseClick() {
        try {
            if (!globalThis.deepResearchAgent) {
                this.addExecutionLog('Agent 未就绪，无法暂停', 'info');
                return;
            }
            const res = await globalThis.deepResearchAgent.pauseResearch();
            this.addExecutionLog(res.message || '已请求暂停', 'info');
            const badge = this.container.querySelector('#interventionBadge');
            if (badge) badge.textContent = '已请求暂停';
        } catch (e) {
            console.error('[AgentThinkingDisplay] 暂停请求失败', e);
            this.addExecutionLog('暂停请求失败: ' + e.message, 'tool_error');
        }
    }

    /**
     * 🎯 干预按钮 - 中止
     */
    async onAbortClick() {
        try {
            if (!globalThis.deepResearchAgent) {
                this.addExecutionLog('Agent 未就绪，无法中止', 'info');
                return;
            }
            if (!confirm('确认要中止当前研究任务吗？此操作不可逆。')) return;
            const res = await globalThis.deepResearchAgent.abortResearch();
            this.addExecutionLog(res.message || '已请求中止', 'info');
            const badge = this.container.querySelector('#interventionBadge');
            if (badge) badge.textContent = '已中止';
        } catch (e) {
            console.error('[AgentThinkingDisplay] 中止请求失败', e);
            this.addExecutionLog('中止请求失败: ' + e.message, 'tool_error');
        }
    }

    /**
     * 🎯 干预按钮 - 继续
     */
    async onContinueClick() {
        try {
            if (!globalThis.deepResearchAgent) {
                this.addExecutionLog('Agent 未就绪，无法继续', 'info');
                return;
            }
            const res = await globalThis.deepResearchAgent.continueResearch();
            this.addExecutionLog(res.message || '已请求继续', 'info');
            const badge = this.container.querySelector('#interventionBadge');
            if (badge) badge.textContent = '运行中';
            const inputDiv = this.container.querySelector('#interventionInput');
            if (inputDiv) inputDiv.style.display = 'none';
        } catch (e) {
            console.error('[AgentThinkingDisplay] 继续请求失败', e);
            this.addExecutionLog('继续请求失败: ' + e.message, 'tool_error');
        }
    }

    /**
     * 🎯 提交用户补充信息
     */
    async onSubmitInfo() {
        try {
            const ta = this.container.querySelector('#interventionText');
            if (!ta) return;
            let info = ta.value || '';
            info = String(info).trim().slice(0, 5000);
            if (!info) {
                this.addExecutionLog('提交失败：输入为空', 'info');
                return;
            }
            if (!globalThis.deepResearchAgent) {
                this.addExecutionLog('Agent 未就绪，无法提交补充信息', 'info');
                return;
            }
            const res = await globalThis.deepResearchAgent.provideAdditionalInfo(info);
            this.addExecutionLog(res.message || '已提交补充信息', 'info');
            const inputDiv = this.container.querySelector('#interventionInput');
            if (inputDiv) inputDiv.style.display = 'none';
            ta.value = '';
        } catch (e) {
            console.error('[AgentThinkingDisplay] 提交补充信息失败', e);
            this.addExecutionLog('提交补充信息失败: ' + e.message, 'tool_error');
        }
    }

    /**
     * 🎯 添加搜索记录
     */
    addQueryRecord(query, success = true) {
        if (!this.currentSession) return;
        
        if (!this.currentSession.researchState.queryLog) {
            this.currentSession.researchState.queryLog = [];
        }
        
        this.currentSession.researchState.queryLog.push({
            query,
            success,
            timestamp: Date.now()
        });
        
        this.renderSession();
    }

    /**
     * 🎯 更新研究统计数据
     */
    updateResearchStats(stats) {
        if (!this.currentSession) return;
        
        // 更新研究状态数据
        if (stats.sources) {
            this.currentSession.researchState.collectedSources = stats.sources;
        }
        // ✅✅✅ 核心修复：不再通过此方法更新 toolCalls，避免状态覆盖
        // 工具调用记录现在完全由 addToolCallRecord 方法管理
        if (stats.metrics) {
            this.currentSession.researchState.metrics = {
                ...this.currentSession.researchState.metrics,
                ...stats.metrics
            };
        }

        this.renderSession(); // ✨ 重新渲染时会自动计算正确的成功次数
    }

    /**
     * 🎯 ✨✨✨ 核心修复2：添加工具调用记录 - 兼容query和queries参数 ✨✨✨
     */
    addToolCallRecord(toolName, parameters, success = true, result = null) {
        if (!this.currentSession) return;

        // 🎯 修复：确保success是布尔值，并且正确处理各种类型的success值
        let toolSuccess;
        if (typeof success === 'boolean') {
            toolSuccess = success;
        } else if (typeof success === 'string') {
            toolSuccess = success.toLowerCase() === 'true';
        } else {
            toolSuccess = Boolean(success);
        }

        console.log(`[AgentThinkingDisplay] 记录工具调用: ${toolName}, 成功状态: ${toolSuccess}`, {
            parameters,
            successValue: success,
            convertedSuccess: toolSuccess
        });

        const toolCall = {
            tool: toolName,
            parameters,
            success: toolSuccess, // 🎯 修复：确保是布尔值
            result: result ? this.formatStepResult(result) : null,
            timestamp: Date.now()
        };

        if (!this.currentSession.researchState.toolCalls) {
            this.currentSession.researchState.toolCalls = [];
        }
        
        this.currentSession.researchState.toolCalls.push(toolCall);
        
        // ✨✨✨ 核心修复2：健壮地处理搜索记录 - 兼容query和queries参数 ✨✨✨
        if (toolName === 'tavily_search') {
            let searchQuery = '';
            
            // 处理多种查询参数格式
            if (parameters.query && typeof parameters.query === 'string') {
                searchQuery = parameters.query;
            } else if (Array.isArray(parameters.queries) && parameters.queries.length > 0) {
                console.log("[AgentThinkingDisplay] 检测到 'queries' 数组，合并为单一查询。");
                searchQuery = parameters.queries.join('; '); // 用分号连接多个查询
            } else if (parameters.queries && typeof parameters.queries === 'string' && parameters.queries.trim() !== '') {
                searchQuery = parameters.queries;
            }

            if (searchQuery) {
                this.addQueryRecord(searchQuery, toolSuccess);
            }
        }
        
        // 🎯 调试：打印当前工具调用统计
        console.log(`[AgentThinkingDisplay] 当前工具调用统计:`, {
            total: this.currentSession.researchState.toolCalls.length,
            successful: this.currentSession.researchState.toolCalls.filter(t => t.success === true).length,
            allCalls: this.currentSession.researchState.toolCalls.map(t => ({ tool: t.tool, success: t.success }))
        });
        
        this.renderSession();
    }

    /**
     * 🎯 获取状态文本
     */
    getStatusText(status) {
        const statusMap = {
            'initializing': '初始化',
            'planning': '规划中',
            'executing': '执行中',
            'summarizing': '总结中',
            'completed': '已完成',
            'error': '错误'
        };
        return statusMap[status] || status;
    }

    /**
     * 🎯 格式化步骤结果
     */
    formatStepResult(result) {
        if (typeof result === 'string') {
            if (result.length > 100) {
                return result.substring(0, 100) + '...';
            }
            return result;
        }
        return JSON.stringify(result).substring(0, 100) + '...';
    }

    /**
     * 🎯 转义HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 🎯 修复：附加容器事件 - 保持整体面板状态
     */
    attachContainerEvents() {
        // 最小化按钮
        const minimizeBtn = this.container.querySelector('.btn-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                this.container.classList.toggle('minimized');
                // 更新按钮文本
                const isMinimized = this.container.classList.contains('minimized');
                minimizeBtn.textContent = isMinimized ? '+' : '−';
            });
        }

        // 关闭按钮
        const closeBtn = this.container.querySelector('.btn-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }
    }

    /**
     * 🎯 修复：为所有可折叠的section标题添加点击事件 - 保存折叠状态
     */
    attachCollapsibleEvents() {
        this.container.querySelectorAll('.section-title[data-target]').forEach(title => {
            title.addEventListener('click', () => {
                const contentWrapper = title.closest('.section-content-wrapper');
                if (contentWrapper) {
                    const target = title.dataset.target;
                    // 🎯 修复：切换并保存折叠状态
                    const isMinimized = !contentWrapper.classList.contains('minimized');
                    contentWrapper.classList.toggle('minimized');
                    this.sectionStates[target] = isMinimized;
                    
                    console.log(`[AgentThinkingDisplay] 折叠状态更新: ${target} = ${isMinimized}`);
                }
            });
        });
    }

    /**
     * 🎯 修复：开始时间更新 - 确保完成后不重置
     */
    startTimeUpdate() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }

        // 🎯 修复：只在会话未完成时更新计时器
        if (this.currentSession && this.currentSession.status !== 'completed') {
            this.timeUpdateInterval = setInterval(() => {
                if (this.currentSession && this.currentSession.status !== 'completed') {
                    const elapsedTime = this._calculateElapsedTime();
                    const timeElement = this.container.querySelector('#elapsed-time');
                    if (timeElement) {
                        timeElement.textContent = elapsedTime;
                    }
                } else {
                    // 会话完成时清理计时器
                    clearInterval(this.timeUpdateInterval);
                    this.timeUpdateInterval = null;
                }
            }, 1000);
        }
    }

    /**
     * 🎯 显示容器
     */
    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }

    /**
     * 🎯 隐藏容器
     */
    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            if (this.timeUpdateInterval) {
                clearInterval(this.timeUpdateInterval);
                this.timeUpdateInterval = null;
            }
        }
    }

    /**
     * 🎯 修复：完成会话 - 确保时间正确显示
     */
    completeSession(finalResult = {}) {
        if (!this.currentSession) return;

        this.currentSession.status = 'completed';
        this.currentSession.endTime = Date.now();
        
        // 🎯 修复：强制更新一次最终时间
        const elapsedTime = this._calculateElapsedTime();
        const timeElement = this.container.querySelector('#elapsed-time');
        if (timeElement) {
            timeElement.textContent = elapsedTime;
        }

        // 清理时间更新
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }

        this.addDeepResearchSummary(finalResult);
        this.renderSession();
    }

    /**
     * 🎯 增强DeepResearch完成总结
     */
    addDeepResearchSummary(finalResult = {}) {
        const { researchState, startTime, endTime } = this.currentSession;
        const totalTime = ((endTime - startTime) / 1000).toFixed(1);
        
        const queryCount = researchState.queryLog?.length || 0;
        const sourcesCount = researchState.collectedSources?.length || 0;
        const toolCallsCount = researchState.toolCalls?.length || 0;
        const successfulTools = researchState.toolCalls?.filter(t => t.success === true)?.length || 0;
        const tokenUsage = researchState.metrics?.tokenUsage || { total_tokens: 0 };

        const iterations = finalResult.iterations || 0;
        const researchMode = finalResult.research_mode || 'standard';

        const summary = `
🔍 DeepResearch 执行完成！

• 研究主题: ${this.currentSession.userMessage}
• 研究模式: ${researchMode}
• 搜索次数: ${queryCount}次
• 收集来源: ${sourcesCount}个
• 工具调用: ${toolCallsCount}次 (成功: ${successfulTools}次)
• 研究迭代: ${iterations}次
• Token消耗: ${tokenUsage.total_tokens.toLocaleString()}
• 总用时: ${totalTime}秒
• 完成时间: ${new Date().toLocaleTimeString()}
        `;

        this.addExecutionLog(summary, 'summary');
    }

    /**
     * 🎯 设置事件监听器
     */
    setupEventListeners() {
        console.log('🔍 AgentThinkingDisplay 设置事件监听器...');

        const handlers = {
            'research:start': (event) => {
                console.log('🔍 research:start 接收:', event.detail.data);
                const { topic, researchData } = event.detail.data;
                this.startSession(topic, 8, researchData);
            },
            'research:plan_generated': (event) => {
                console.log('🔍 research:plan_generated 接收:', event.detail.data);
                const { plan, research_mode } = event.detail.data;
                
                let planText = `研究计划已生成 (${research_mode}模式):\n`;
                if (plan && Array.isArray(plan)) {
                    plan.forEach((step, index) => {
                        planText += `${index + 1}. ${step.sub_question || step}\n`;
                    });
                }
                this.addExecutionLog(planText, 'plan');
            },
            'research:progress': (event) => {
                console.log('🔍 research:progress 接收:', event.detail.data);
                const { iteration, total_iterations, plan_completion } = event.detail.data;
                this.addExecutionLog(`研究进度: 第 ${iteration}/${total_iterations} 次迭代 (完成度: ${Math.round(plan_completion * 100)}%)`, 'info');
            },
            'research:tool_start': (event) => {
                console.log('🔍 research:tool_start 接收:', event.detail.data);
                const { tool_name, parameters, thought } = event.detail.data;
                
                if (thought) {
                    this.addExecutionLog(thought, 'thought');
                }
                
                let toolText = `调用工具: ${tool_name}`;
                if (parameters.query) {
                    toolText += `\n搜索查询: "${parameters.query}"`;
                }
                if (parameters.url) {
                    toolText += `\n目标URL: ${parameters.url}`;
                }
                
                this.addExecutionLog(toolText, 'tool_start');
            },
            'research:tool_end': (event) => {
                console.log('🔍 research:tool_end 接收:', event.detail.data);
                const { tool_name, output, success, sources_found } = event.detail.data;
                
                const status = success ? '成功' : '失败';
                const type = success ? 'tool_success' : 'tool_error';
                const resultText = `工具 ${tool_name} 执行${status}`;
                const details = sources_found > 0 ? `，发现 ${sources_found} 个来源` : '';
                const outputPreview = output ? `\n结果摘要: ${output.substring(0, 200)}...` : '';
                
                this.addExecutionLog(resultText + details + outputPreview, type);
            },
            'research:stats_updated': (event) => {
                console.log('🔍 research:stats_updated 接收:', event.detail.data);
                this.updateResearchStats(event.detail.data);
            },
            'research:tool_called': (event) => {
                console.log('🔍 research:tool_called 接收:', event.detail.data);
                const { toolName, parameters, success, result } = event.detail.data;
                
                // 🎯 修复：确保success值正确传递
                console.log(`[AgentThinkingDisplay] 接收工具调用事件:`, {
                    toolName,
                    success,
                    successType: typeof success,
                    successValue: success
                });
                
                this.addToolCallRecord(
                    toolName,
                    parameters,
                    success, // 直接传递原始值，在addToolCallRecord中处理
                    result
                );
            },
            'research:end': (event) => {
                console.log('🔍 research:end 接收:', event.detail.data);
                this.completeSession(event.detail.data);
            }
        };

        // 注册所有事件监听器
        Object.entries(handlers).forEach(([eventName, handler]) => {
            try {
                globalThis.addEventListener(eventName, handler);
            } catch (e) {
                console.warn('[AgentThinkingDisplay] 无法注册事件监听器', eventName, e);
            }
        });

        // 注册干预相关事件
        const interventionHandlers = {
            'research:waiting_for_input': (_event) => {
                this.addExecutionLog('系统等待用户输入以继续研究...', 'info');
                const inputDiv = this.container.querySelector('#interventionInput');
                const panel = this.container.querySelector('#intervention-panel');
                if (panel) panel.style.display = 'block';
                if (inputDiv) inputDiv.style.display = 'block';
            },
            'research:intervention_requested': (_event) => {
                const reason = event?.detail?.data?.reason || '人工干预请求';
                this.addExecutionLog(`收到干预请求: ${reason}`, 'info');
                const panel = this.container.querySelector('#intervention-panel');
                const badge = this.container.querySelector('#interventionBadge');
                if (panel) panel.style.display = 'block';
                if (badge) badge.textContent = `请求: ${reason}`;
            },
            'research:paused': (_event) => {
                this.addExecutionLog('研究已被暂停', 'info');
                const badge = this.container.querySelector('#interventionBadge');
                if (badge) badge.textContent = '已暂停';
            },
            'research:aborted': (_event) => {
                this.addExecutionLog('研究已被中止', 'info');
                const badge = this.container.querySelector('#interventionBadge');
                if (badge) badge.textContent = '已中止';
                // 禁用按钮
                ['btnPause','btnAbort','btnContinue','btnSubmitInfo'].forEach(id => {
                    const el = this.container.querySelector('#' + id);
                    if (el) el.disabled = true;
                });
            },
            'research:intervention_suggested': (event) => {
                const suggestions = event?.detail?.data?.suggestions || [];
                if (suggestions.length) {
                    this.addExecutionLog('系统建议: ' + suggestions.join('; '), 'info');
                }
            }
        };

        Object.entries(interventionHandlers).forEach(([name, h]) => {
            try { globalThis.addEventListener(name, h); } catch (e) { console.warn('注册干预事件失败', name, e); }
        });

        console.log('✅ AgentThinkingDisplay 事件监听器设置完成');
    }

    /**
     * 🎯 销毁组件
     */
    destroy() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        
        const styleElement = document.getElementById('agent-thinking-styles');
        if (styleElement) {
            styleElement.remove();
        }
        
        this.stylesInjected = false;
        this.currentSession = null;
        this.executionLog = [];
        this.sectionStates = {};
    }
}