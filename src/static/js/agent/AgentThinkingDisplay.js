// src/static/js/agent/AgentThinkingDisplay.js - v2.1 Final (this上下文修复版)

export class AgentThinkingDisplay {
    constructor(containerId = 'agent-thinking-container') {
        this.containerId = containerId;
        this.container = null;
        this.currentSession = null;
        this.stylesInjected = false;
        this.timeUpdateInterval = null;
        
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.onMouseMoveBound = this.onMouseMove.bind(this);
        this.onMouseUpBound = this.onMouseUp.bind(this);

        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.injectStyles();
            this.createContainer();
            this.setupEventListeners(); // 确保在 DOM 加载后设置监听器
            console.log('[AgentThinkingDisplay] v2.1 Final 初始化完成');
        });
    }

    injectStyles() {
        // ... 您的 injectStyles 代码保持不变 ...
        // (为了简洁，这里省略，请保留您之前版本中正确的样式代码)
        if (this.stylesInjected) return;
        const styleId = 'agent-thinking-styles';
        if (document.getElementById(styleId)) return;

        const css = `
        /* Agent Thinking Display Styles - DeepResearch主题 - 修复不透明问题 */
        #agent-thinking-container { display: none; position: fixed; top: 20px; right: 20px; width: 600px; max-height: 80vh; background: #ffffff !important; border: 2px solid #667eea; border-radius: 12px; box-shadow: 0 8px 32px rgba(102, 126, 234, 0.25); z-index: 1000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; transition: all 0.3s ease; opacity: 1 !important; }
        #agent-thinking-container.minimized { height: 50px; overflow: hidden; }
        .agent-thinking-container .session-content { background: #ffffff !important; opacity: 1 !important; }
        .agent-thinking-container .thinking-content { background: #f8fafc !important; opacity: 1 !important; padding: 12px; border-radius: 6px; }
        .agent-thinking-container .user-query { background: #f8fafc !important; }
        .agent-thinking-container .plan-step { background: #ffffff !important; }
        @media (max-width: 768px) { #agent-thinking-container { width: 95% !important; left: 2.5% !important; right: 2.5% !important; top: 10px !important; } }
        .agent-thinking-container .session-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; cursor: move; }
        .research-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0; }
        .stat-item { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
        .stat-value { font-size: 18px; font-weight: bold; color: #2d3748; display: block; }
        .stat-label { font-size: 12px; color: #718096; margin-top: 4px; }
        .keyword-tag { display: inline-block; background: #667eea; color: white; padding: 4px 8px; border-radius: 12px; font-size: 11px; margin: 2px 4px 2px 0; font-weight: 500; }
        .thinking-text { color: #4a5568; white-space: pre-wrap; line-height: 1.5; font-size: 13px; background: transparent !important; }
        .session-controls { display: flex; gap: 8px; }
        .session-controls button { background: rgba(255, 255, 255, 0.2); border: none; color: white; width: 24px; height: 24px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: background 0.2s; }
        .session-controls button:hover { background: rgba(255, 255, 255, 0.3); }
        .step-indicator { display: flex; align-items: center; gap: 8px; margin-right: 12px; }
        .step-number { background: #667eea; color: white; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; }
        .plan-step { display: flex; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; margin: 8px 0; transition: all 0.3s ease; }
        .plan-step.completed { background: #f0fff4; border-color: #c6f6d5; }
        .plan-step.current { background: #ebf8ff; border-color: #90cdf4; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1); }
        .step-content { flex: 1; }
        .step-type { font-weight: bold; color: #2d3748; margin-bottom: 4px; }
        .step-description { color: #4a5568; font-size: 13px; line-height: 1.4; }
        .step-tool, .step-result, .step-duration { font-size: 12px; color: #718096; margin-top: 4px; }
        .thinking-placeholder { color: #a0aec0; font-style: italic; text-align: center; padding: 20px; }
        .section-title { font-weight: bold; color: #2d3748; margin-bottom: 8px; font-size: 14px; display: flex; align-items: center; gap: 6px; }
        .user-query-section, .research-stats-section, .execution-plan-section, .thinking-process-section { margin-bottom: 16px; padding: 0 16px; }
        .user-query { background: #f7fafc; padding: 12px; border-radius: 6px; border-left: 3px solid #667eea; font-size: 14px; line-height: 1.5; }
        .session-title { display: flex; align-items: center; gap: 8px; }
        .session-icon { font-size: 16px; }
        .session-title h3 { margin: 0; font-size: 16px; font-weight: 600; }
        .session-badge { background: rgba(255, 255, 255, 0.2); padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
        .log-entry { display: flex; gap: 10px; padding: 8px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .log-entry:last-child { border-bottom: none; }
        .log-icon { flex-shrink: 0; }
        .log-details { display: flex; flex-direction: column; width: 100%; }
        .log-header { display: flex; justify-content: space-between; align-items: center; }
        .log-type { font-weight: 600; color: #475569; }
        .log-time { font-size: 11px; color: #94a3b8; }
        .log-content { margin-top: 4px; color: #334155; white-space: pre-wrap; word-break: break-all; }
        .log-content pre { background-color: #f1f5f9; padding: 8px; border-radius: 4px; font-size: 12px; }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
        this.stylesInjected = true;
    }
    
    // ... startSession, renderSession, 等其他方法保持您之前的版本 ...
    // ... 我们只修改 setupEventListeners ...
    
    // =============================================================
    // ✨ 核心修复：重写所有事件监听器以正确绑定 `this` 上下文
    // =============================================================
    setupEventListeners() {
        console.log('🔍 AgentThinkingDisplay 正在设置 v2.1 事件监听器...');

        window.addEventListener('research:start', (event) => {
            console.log('🔍 research:start 接收:', event.detail.data);
            const { topic, researchMode, researchData } = event.detail.data;
            this.startSession(topic, 8, researchData);
        });

        window.addEventListener('research:plan_generated', (event) => {
            console.log('🔍 research:plan_generated 接收:', event.detail.data);
            const { plan, keywords } = event.detail.data;
            if (this.currentSession) {
                this.currentSession.researchState.keywords = keywords;
                this.renderPlan(plan, keywords);
            }
        });

        window.addEventListener('research:progress_update', (event) => {
            console.log('🔍 research:progress_update 接收:', event.detail.data);
            if (this.currentSession) {
                this.updateProgressUI(event.detail.data);
            }
        });
        
        window.addEventListener('research:tool_start', (event) => {
            console.log('🔍 research:tool_start 接收:', event.detail.data);
            const { tool_name, parameters, thought } = event.detail.data;
            if (thought) this.addLogEntry('thought', `<pre>${this.escapeHtml(thought)}</pre>`);
            this.addLogEntry('tool_start', `调用 <strong>${tool_name}</strong>, 参数: <pre>${this.escapeHtml(JSON.stringify(parameters, null, 2))}</pre>`);
        });
        
        window.addEventListener('research:tool_end', (event) => {
            console.log('🔍 research:tool_end 接收:', event.detail.data);
            const { tool_name, output, success, sources_found } = event.detail.data;
            const status = success ? `发现 ${sources_found} 个新来源。` : '执行失败。';
            this.addLogEntry(success ? 'tool_end' : 'error', `${status}<br>结果摘要: <pre>${this.escapeHtml((output || '').substring(0, 250))}...</pre>`);
        });

        window.addEventListener('research:stats_updated', (event) => {
            console.log('🔍 research:stats_updated 接收:', event.detail.data);
            if (this.currentSession) {
                this.updateResearchStats(event.detail.data);
            }
        });

        window.addEventListener('research:tool_called', (event) => {
            console.log('🔍 research:tool_called 接收:', event.detail.data);
            if (this.currentSession) {
                this.addToolCallRecord(
                    event.detail.data.toolName,
                    event.detail.data.parameters,
                    event.detail.data.success,
                    event.detail.data.result
                );
            }
        });

        window.addEventListener('research:end', (event) => {
            console.log('🔍 research:end 接收:', event.detail.result);
            if (this.currentSession) {
                this.completeSession(event.detail.result);
            }
        });

        // 通用思考事件
        window.addEventListener('agent:thinking', (event) => {
            if (event.detail.agentType === 'deep_research' && this.currentSession) {
                this.updateThinking(event.detail.content, event.detail.type || 'research');
            }
        });
        
        console.log('✅ AgentThinkingDisplay v2.1 事件监听器设置完成。');
    }

    // ... (所有其他方法，如 addLogEntry, addToolCallRecord, renderSession 等，保持您之前的版本)
    // (为了简洁，这里省略，请保留您之前版本中所有方法的正确代码)
    
    // 确保这些方法存在
    createContainer() {
        if (document.getElementById(this.containerId)) {
            this.container = document.getElementById(this.containerId);
            return this.container;
        }
        const container = document.createElement('div');
        container.id = this.containerId;
        container.className = 'agent-thinking-container';
        document.body.appendChild(container);
        this.container = container;
        return container;
    }

    startSession(userMessage, maxIterations = 8, researchData = {}) {
        if (!this.container) {
            this.container = this.createContainer();
        }
        this.currentSession = {
            id: `deepresearch_${Date.now()}`,
            userMessage: userMessage.replace(/！\s*$/, '').trim(),
            startTime: Date.now(),
            status: 'initializing',
            researchState: {
                phase: 'initializing',
                keywords: researchData.keywords || [],
                collectedSources: [],
                analyzedContent: [],
                toolCalls: researchData.toolCalls || [],
                metrics: researchData.metrics || {}
            }
        };
        this.renderSession();
        this.show();
        this.container.classList.remove('minimized');
    }

    renderSession() {
        if (!this.container || !this.currentSession) return;
        const { userMessage, status, researchState } = this.currentSession;
        const keywordsCount = Array.isArray(researchState.keywords) ? researchState.keywords.length : 0;
        const sourcesCount = Array.isArray(researchState.collectedSources) ? researchState.collectedSources.length : 0;
        const analyzedCount = Array.isArray(researchState.analyzedContent) ? researchState.analyzedContent.length : 0;
        const toolCalls = Array.isArray(researchState.toolCalls) ? researchState.toolCalls : [];
        const toolCallsCount = toolCalls.length;
        const successfulTools = toolCalls.filter(t => t.success).length;

        this.container.innerHTML = `
            <div class="session-header">
                <div class="session-title"><span class="session-icon">🔬</span><h3>高级研究代理</h3><span id="session-status-badge" class="session-badge">${this.getStatusText(status)}</span></div>
                <div class="session-controls"><button id="btn-minimize">−</button><button id="btn-close">×</button></div>
            </div>
            <div class="session-content">
                <div class="section"><div class="section-title">🎯 研究主题</div><div class="user-query">${this.escapeHtml(userMessage)}</div></div>
                <div class="section"><div class="section-title">📈 研究统计</div>
                    <div class="research-stats-grid">
                        <div class="stat-item"><span class="stat-value">${keywordsCount}</span><span class="stat-label">研究关键词</span></div>
                        <div class="stat-item"><span class="stat-value">${sourcesCount}</span><span class="stat-label">收集来源</span></div>
                        <div class="stat-item"><span class="stat-value">${analyzedCount}</span><span class="stat-label">分析内容</span></div>
                        <div class="stat-item"><span class="stat-value">${toolCallsCount}</span><span class="stat-label">工具调用</span></div>
                        <div class="stat-item"><span class="stat-value">${successfulTools}</span><span class="stat-label">成功调用</span></div>
                        <div class="stat-item"><span class="stat-value" id="status-elapsed-time">0s</span><span class="stat-label">已用时间</span></div>
                    </div>
                </div>
                <div class="section"><div class="section-title">🗺️ 研究计划</div><div id="plan-steps-container" class="plan-steps"><p>等待研究计划...</p></div></div>
                <div class="section"><div class="section-title">🧠 思考过程</div><div id="thinking-log-container" class="thinking-log"><div class="thinking-placeholder">等待Agent开始思考...</div></div></div>
            </div>
        `;
        this.attachContainerEvents();
        this.startTimeUpdate();
    }
    
    renderPlan(planSteps, keywords) {
        const container = this.container.querySelector('#plan-steps-container');
        if (!container) return;
        let keywordsHtml = Array.isArray(keywords) && keywords.length > 0 ? `<div class="keyword-list">${keywords.map(kw => `<span class="keyword-tag">${this.escapeHtml(kw)}</span>`).join('')}</div>` : '';
        container.innerHTML = planSteps.map((step, index) => `<div class="plan-step" id="plan-step-${index + 1}"><div class="step-indicator"><div class="step-number">${index + 1}</div></div><div class="step-content"><p class="step-description">${this.escapeHtml(step.sub_question)}</p></div></div>`).join('') + keywordsHtml;
    }

    updateProgressUI(data) { /* ... */ }
    addLogEntry(type, content) { /* ... */ }
    updateThinking(content, type) { /* ... */ }
    addToolCallRecord(toolName, parameters, success, result) {
        if (!this.currentSession) return;
        const toolCall = { tool: toolName, parameters, success, timestamp: Date.now() };
        if (!Array.isArray(this.currentSession.researchState.toolCalls)) {
            this.currentSession.researchState.toolCalls = [];
        }
        this.currentSession.researchState.toolCalls.push(toolCall);
        this.renderSession();
    }
    updateResearchStats(stats) {
        if (!this.currentSession) return;
        if (stats.keywords) this.currentSession.researchState.keywords = stats.keywords;
        if (stats.sources) this.currentSession.researchState.collectedSources = stats.sources;
        if (stats.toolCalls) this.currentSession.researchState.analyzedContent = Array(stats.toolCalls).fill(1); // 模拟分析内容
        this.renderSession();
    }
    completeSession(finalResult) { /* ... */ }
    addDeepResearchSummary(result) { /* ... */ }
    
    // 其他辅助方法
    escapeHtml(unsafe) { /* ... */ }
    getStatusText(status) { /* ... */ }
    attachContainerEvents() { /* ... */ }
    startTimeUpdate() { /* ... */ }
    show() { /* ... */ }
    hide() { /* ... */ }
    onMouseDown(e) { /* ... */ }
    onMouseMove(e) { /* ... */ }
    onMouseUp() { /* ... */ }
}