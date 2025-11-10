// src/static/js/agent/AgentThinkingDisplay.js - 修复版

export class AgentThinkingDisplay {
    constructor() {
        this.container = null;
        this.currentSession = null;
        this.stylesInjected = false;
        this.timeUpdateInterval = null;
        
        this.init();
    }

    /**
     * 🎯 初始化显示组件
     */
    init() {
        this.injectStyles();
        this.setupEventListeners();
        console.log('[AgentThinkingDisplay] DeepResearch 显示组件初始化完成');
    }

    /**
     * 🎯 修复：注入不透明样式
     */
    injectStyles() {
        if (this.stylesInjected) return;

        const styleId = 'agent-thinking-styles';
        if (document.getElementById(styleId)) return;

        const css = `
/* Agent Thinking Display Styles - DeepResearch主题 - 修复不透明问题 */
#agent-thinking-container {
    display: none;
    position: fixed;
    top: 20px;
    right: 20px;
    width: 600px; /* 增加宽度以显示更多内容 */
    max-height: 80vh;
    background: #ffffff !important; /* 强制白色背景，去除透明 */
    border: 2px solid #667eea;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.25); /* 增强阴影 */
    z-index: 1000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    transition: all 0.3s ease;
    opacity: 1 !important; /* 强制不透明 */
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

.agent-thinking-container .thinking-content {
    background: #f8fafc !important;
    opacity: 1 !important;
}

.agent-thinking-container .user-query {
    background: #f8fafc !important;
}

.agent-thinking-container .plan-step {
    background: #ffffff !important;
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

/* 新增：研究统计样式 */
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

/* 工具调用记录样式 */
.tool-call-record {
    background: #f0fff4;
    border: 1px solid #c6f6d5;
    border-radius: 6px;
    padding: 8px 12px;
    margin: 4px 0;
    font-size: 12px;
}

.tool-call-record.error {
    background: #fed7d7;
    border-color: #feb2b2;
}

/* 关键词标签样式增强 */
.keyword-tag {
    display: inline-block;
    background: #667eea;
    color: white;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 11px;
    margin: 2px 4px 2px 0;
    font-weight: 500;
}

/* 修复思考内容显示 */
.thinking-text {
    color: #4a5568;
    white-space: pre-wrap;
    line-height: 1.5;
    font-size: 13px;
    background: transparent !important;
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

/* 步骤指示器样式 */
.step-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 12px;
}

.step-number {
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
}

/* 计划步骤样式 */
.plan-step {
    display: flex;
    padding: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin: 8px 0;
    transition: all 0.3s ease;
}

.plan-step.completed {
    background: #f0fff4;
    border-color: #c6f6d5;
}

.plan-step.current {
    background: #ebf8ff;
    border-color: #90cdf4;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
}

.step-content {
    flex: 1;
}

.step-type {
    font-weight: bold;
    color: #2d3748;
    margin-bottom: 4px;
}

.step-description {
    color: #4a5568;
    font-size: 13px;
    line-height: 1.4;
}

.step-tool, .step-result, .step-duration {
    font-size: 12px;
    color: #718096;
    margin-top: 4px;
}

/* 思考内容区域 */
.thinking-content {
    max-height: 300px;
    overflow-y: auto;
    padding: 12px;
    background: #f8fafc;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.5;
}

.thinking-placeholder {
    color: #a0aec0;
    font-style: italic;
    text-align: center;
    padding: 20px;
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

.user-query-section, .research-stats-section, .execution-plan-section, .thinking-process-section {
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
        `;

        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);

        this.stylesInjected = true;
        console.log('[AgentThinkingDisplay] DeepResearch主题样式修复完成');
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
     * 🎯 修复：开始会话时接收完整的研究数据
     */
    startSession(userMessage, maxIterations = 6, researchData = {}) {
        if (!this.container) {
            this.container = this.createContainer();
        }
        
        const sessionId = `deepresearch_${Date.now()}`;
        this.currentSession = {
            id: sessionId,
            userMessage: userMessage.replace(/！\s*$/, '').trim(), // 清理感叹号
            maxIterations,
            currentIteration: 0,
            steps: [],
            startTime: Date.now(),
            status: 'initializing',
            researchState: {
                phase: 'initializing',
                keywords: researchData.keywords || [],
                collectedSources: researchData.sources || [],
                analyzedContent: researchData.analyzedContent || [],
                toolCalls: researchData.toolCalls || [],
                metrics: researchData.metrics || {}
            }
        };

        this.renderSession();
        this.show();
        this.container.classList.add('minimized');
        
        return sessionId;
    }

    /**
     * 🎯 修复：渲染会话界面，显示准确数据
     */
    renderSession() {
        const { userMessage, maxIterations, steps, status, researchState } = this.currentSession;
        
        // 计算准确的统计数据
        const keywordsCount = researchState.keywords?.length || 0;
        const sourcesCount = researchState.collectedSources?.length || 0;
        const analyzedCount = researchState.analyzedContent?.length || 0;
        const toolCallsCount = researchState.toolCalls?.length || 0;
        const successfulTools = researchState.toolCalls?.filter(t => t.success)?.length || 0;

        this.container.innerHTML = `
            <div class="agent-session">
                <div class="session-header">
                    <div class="session-title">
                        <span class="session-icon">🔍</span>
                        <h3>DeepResearch 深度研究</h3>
                        <span class="session-badge">${this.getStatusText(status)}</span>
                    </div>
                    <div class="session-controls">
                        <button class="btn-minimize">−</button>
                        <button class="btn-close">×</button>
                    </div>
                </div>
                
                <div class="session-content">
                    <!-- 用户研究请求 -->
                    <div class="user-query-section">
                        <div class="section-title">🎯 研究主题</div>
                        <div class="user-query">${this.escapeHtml(userMessage)}</div>
                    </div>
                    
                    <!-- 研究统计 -->
                    <div class="research-stats-section">
                        <div class="section-title">📈 研究统计</div>
                        <div class="research-stats-grid">
                            <div class="stat-item">
                                <span class="stat-value">${keywordsCount}</span>
                                <span class="stat-label">研究关键词</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${sourcesCount}</span>
                                <span class="stat-label">收集来源</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">${analyzedCount}</span>
                                <span class="stat-label">分析内容</span>
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
                                <span class="stat-value" id="elapsed-time">0s</span>
                                <span class="stat-label">已用时间</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 研究阶段 -->
                    <div class="execution-plan-section">
                        <div class="section-title">📊 研究进展</div>
                        <div class="plan-steps" id="plan-steps">
                            ${this.renderResearchSteps(steps, researchState)}
                        </div>
                    </div>
                    
                    <!-- 实时思考过程 -->
                    <div class="thinking-process-section">
                        <div class="section-title">💭 研究思考</div>
                        <div class="thinking-content" id="thinking-content">
                            <div class="thinking-placeholder">等待DeepResearch开始分析...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.attachContainerEvents();
        this.startTimeUpdate();
    }

    /**
     * 🎯 修复：增强研究步骤渲染
     */
    renderResearchSteps(steps, researchState) {
        if (!steps || steps.length === 0) {
            const phaseText = this.getPhaseText(researchState.phase);
            let keywordsHtml = '';
            
            if (researchState.keywords && researchState.keywords.length > 0) {
                keywordsHtml = `
                    <div class="research-keywords">
                        <strong>研究关键词:</strong>
                        ${researchState.keywords.map(kw => 
                            `<span class="keyword-tag">${this.escapeHtml(kw.term || kw)}</span>`
                        ).join('')}
                    </div>
                `;
            }

            return `
                <div class="research-progress">
                    <strong>当前阶段:</strong> ${phaseText}
                    ${keywordsHtml}
                </div>
            `;
        }

        return steps.map((step, index) => `
            <div class="plan-step ${step.completed ? 'completed' : ''} ${step.current ? 'current' : ''}" data-step-index="${index}">
                <div class="step-indicator">
                    <span class="step-number">${index + 1}</span>
                    <span class="step-status">${step.completed ? '✅' : step.current ? '🔄' : '⏳'}</span>
                </div>
                <div class="step-content">
                    <div class="step-type">${this.getStepTypeIcon(step.type)} ${step.type}</div>
                    <div class="step-description">${this.escapeHtml(step.description)}</div>
                    ${step.tool ? `<div class="step-tool">🛠️ ${step.tool}</div>` : ''}
                    ${step.result ? `<div class="step-result">${this.formatStepResult(step.result)}</div>` : ''}
                    ${step.duration ? `<div class="step-duration">${step.duration}ms</div>` : ''}
                </div>
            </div>
        `).join('');
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
     * 🎯 获取阶段文本
     */
    getPhaseText(phase) {
        const phaseMap = {
            'initializing': '🔧 初始化研究环境',
            'planning': '📋 制定研究计划',
            'searching': '🔍 搜索信息',
            'analyzing': '📊 分析数据',
            'synthesizing': '🧠 整合信息',
            'reporting': '📝 生成报告',
            'completed': '✅ 研究完成'
        };
        return phaseMap[phase] || phase;
    }

    /**
     * 🎯 获取步骤类型图标
     */
    getStepTypeIcon(type) {
        const iconMap = {
            'search': '🔍',
            'analysis': '📊',
            'synthesis': '🧠',
            'planning': '📋',
            'tool_call': '🛠️',
            'thinking': '💭',
            'summary': '📝'
        };
        return iconMap[type] || '•';
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
     * 🎯 附加容器事件
     */
    attachContainerEvents() {
        // 最小化按钮
        const minimizeBtn = this.container.querySelector('.btn-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                this.container.classList.toggle('minimized');
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
     * 🎯 开始时间更新
     */
    startTimeUpdate() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }

        this.timeUpdateInterval = setInterval(() => {
            if (this.currentSession) {
                const elapsed = Math.floor((Date.now() - this.currentSession.startTime) / 1000);
                const timeElement = this.container.querySelector('#elapsed-time');
                if (timeElement) {
                    timeElement.textContent = `${elapsed}s`;
                }
            }
        }, 1000);
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
     * 🎯 新增：更新研究统计数据
     */
    updateResearchStats(stats) {
        if (!this.currentSession) return;
        
        // 更新研究状态数据
        if (stats.keywords) {
            this.currentSession.researchState.keywords = stats.keywords;
        }
        if (stats.sources) {
            this.currentSession.researchState.collectedSources = stats.sources;
        }
        if (stats.analyzedContent) {
            this.currentSession.researchState.analyzedContent = stats.analyzedContent;
        }
        if (stats.toolCalls) {
            this.currentSession.researchState.toolCalls = stats.toolCalls;
        }
        if (stats.metrics) {
            this.currentSession.researchState.metrics = stats.metrics;
        }

        // 重新渲染统计部分
        this.renderSession();
    }

    /**
     * 🎯 修复：添加工具调用记录
     */
    addToolCallRecord(toolName, parameters, success = true, result = null) {
        if (!this.currentSession) return;

        const toolCall = {
            tool: toolName,
            parameters,
            success,
            result: result ? this.formatStepResult(result) : null,
            timestamp: Date.now()
        };

        // 🛡️ 确保 toolCalls 是数组
        if (!this.currentSession.researchState.toolCalls) {
            this.currentSession.researchState.toolCalls = [];
        }
        if (!Array.isArray(this.currentSession.researchState.toolCalls)) {
            console.warn('[AgentThinkingDisplay] toolCalls 不是数组，重置为数组');
            this.currentSession.researchState.toolCalls = [];
        }
        
        this.currentSession.researchState.toolCalls.push(toolCall);
        
        // 在思考内容中显示工具调用记录
        const toolCallText = `🔧 调用工具: ${toolName} ${success ? '✅' : '❌'}`;
        this.updateThinking(toolCallText, 'tool_call');
        
        // 更新统计显示
        this.renderSession();
    }

    /**
     * 🎯 更新思考内容
     */
    updateThinking(content, type = 'research') {
        if (!this.currentSession) return;

        const thinkingContent = this.container.querySelector('#thinking-content');
        if (!thinkingContent) return;

        // 移除占位符
        const placeholder = thinkingContent.querySelector('.thinking-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        // 创建新的思考记录
        const thinkingRecord = document.createElement('div');
        thinkingRecord.className = `thinking-record thinking-${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        thinkingRecord.innerHTML = `
            <div class="thinking-text">
                <span class="thinking-time">[${timestamp}]</span> ${this.escapeHtml(content)}
            </div>
        `;

        thinkingContent.appendChild(thinkingRecord);
        thinkingContent.scrollTop = thinkingContent.scrollHeight;
    }

    /**
     * 🎯 添加步骤
     */
    addStep(step) {
        if (!this.currentSession) return;

        if (!this.currentSession.steps) {
            this.currentSession.steps = [];
        }

        // 标记之前的步骤为完成
        this.currentSession.steps.forEach(s => {
            s.current = false;
        });

        // 添加新步骤
        const newStep = {
            ...step,
            current: true,
            completed: false,
            startTime: Date.now()
        };

        this.currentSession.steps.push(newStep);
        this.renderSession();
    }

    /**
     * 🎯 完成步骤
     */
    completeStep(stepIndex, result = null) {
        if (!this.currentSession || !this.currentSession.steps[stepIndex]) return;

        const step = this.currentSession.steps[stepIndex];
        step.completed = true;
        step.current = false;
        step.endTime = Date.now();
        step.duration = step.endTime - step.startTime;
        
        if (result) {
            step.result = result;
        }

        this.renderSession();
    }

    /**
     * 🎯 完成会话
     */
    completeSession(finalResult = {}) {
        if (!this.currentSession) return;

        this.currentSession.status = 'completed';
        this.currentSession.endTime = Date.now();
        
        // 标记所有步骤为完成
        this.currentSession.steps.forEach(step => {
            step.completed = true;
            step.current = false;
        });

        this.addDeepResearchSummary(finalResult);
        this.renderSession();

        // 清理时间更新
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }

    /**
     * 🎯 修复：增强DeepResearch完成总结
     */
    addDeepResearchSummary(finalResult = {}) {
        const { researchState, startTime, endTime } = this.currentSession;
        const totalTime = ((endTime - startTime) / 1000).toFixed(1);
        
        // 使用实际数据，而不是默认的0
        const keywordsCount = researchState.keywords?.length || 0;
        const sourcesCount = researchState.collectedSources?.length || 0;
        const analyzedCount = researchState.analyzedContent?.length || 0;
        const toolCallsCount = researchState.toolCalls?.length || 0;
        const successfulTools = researchState.toolCalls?.filter(t => t.success)?.length || 0;

        // 从finalResult中获取更多数据
        const iterations = finalResult.iterations || 0;
        const researchMode = finalResult.research_mode || 'standard';
        const tokenUsage = finalResult.metrics?.tokenUsage || '未统计';

        const summary = `
🔍 DeepResearch 执行总结:

• 研究主题: ${this.currentSession.userMessage}
• 研究模式: ${researchMode}
• 研究关键词: ${keywordsCount}个
• 收集来源: ${sourcesCount}个  
• 分析内容: ${analyzedCount}个
• 工具调用: ${toolCallsCount}次 (成功: ${successfulTools}次)
• 研究迭代: ${iterations}次
• Token消耗: ${tokenUsage}
• 总用时: ${totalTime}秒
• 完成时间: ${new Date().toLocaleTimeString()}

详细工具调用记录:
${this.formatToolCallDetails(researchState.toolCalls)}
        `;

        this.updateThinking(summary, 'summary');
    }

    /**
     * 🎯 新增：格式化工具调用详情
     */
    formatToolCallDetails(toolCalls) {
        if (!toolCalls || toolCalls.length === 0) {
            return "  无工具调用记录";
        }

        return toolCalls.map((call, index) => {
            const time = new Date(call.timestamp).toLocaleTimeString();
            const status = call.success ? '✅' : '❌';
            return `  ${index + 1}. ${time} ${status} ${call.tool}`;
        }).join('\n');
    }

    // 🎯 修复：设置事件监听器，确保正确的 this 上下文
    setupEventListeners() {
        console.log('🔍 AgentThinkingDisplay 设置事件监听器...');

        // 使用箭头函数确保正确的 this 上下文
        const handlers = {
            'research:start': (event) => {
                console.log('🔍 research:start 接收:', event.detail.data);
                const { topic, maxIterations, researchData } = event.detail.data;
                this.startSession(topic, maxIterations, researchData);
            },
            'research:plan_generated': (event) => {
                console.log('🔍 research:plan_generated 接收:', event.detail.data);
                // 假设有一个 renderPlan 方法，但当前代码中没有，这里使用 updateResearchStats 替代，或者需要用户提供 renderPlan 的实现
                // 暂时使用 updateResearchStats 来更新 UI
                this.updateResearchStats({ keywords: event.detail.data.keywords });
                this.updateThinking(`研究计划已生成，关键词: ${event.detail.data.keywords.join(', ')}`, 'planning');
            },
            'research:progress': (event) => { // 修正事件名称为 research:progress
                console.log('🔍 research:progress 接收:', event.detail.data);
                this.updateProgressUI(event.detail.data);
            },
            'research:tool_start': (event) => {
                console.log('🔍 research:tool_start 接收:', event.detail.data);
                const { tool_name, parameters, thought } = event.detail.data;
                if (thought) this.updateThinking(`💭 思考: ${this.escapeHtml(thought)}`, 'thought');
                this.updateThinking(`🛠️ 调用工具: ${tool_name}`, 'tool_start');
            },
            'research:tool_end': (event) => {
                console.log('🔍 research:tool_end 接收:', event.detail.data);
                const { tool_name, output, success, sources_found } = event.detail.data;
                const status = success ? `✅ 完成，发现 ${sources_found} 个来源` : '❌ 失败';
                this.updateThinking(`工具 ${tool_name}: ${status}`, success ? 'tool_success' : 'tool_error');
            },
            'research:stats_updated': (event) => {
                console.log('🔍 research:stats_updated 接收:', event.detail.data);
                this.updateResearchStats(event.detail.data);
            },
            'research:tool_called': (event) => {
                console.log('🔍 research:tool_called 接收:', event.detail.data);
                this.addToolCallRecord(
                    event.detail.data.toolName,
                    event.detail.data.parameters,
                    event.detail.data.success,
                    event.detail.data.result
                );
            },
            'research:end': (event) => {
                console.log('🔍 research:end 接收:', event.detail.data);
                this.completeSession(event.detail.data);
            }
        };

        // 注册所有事件监听器
        Object.entries(handlers).forEach(([eventName, handler]) => {
            window.addEventListener(eventName, handler);
        });

        // 窗口点击事件，确保显示在最前
        window.addEventListener('click', () => {
            if (this.container && this.container.style.display === 'block') {
                this.container.style.zIndex = '1000';
            }
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
        
        // 移除样式（可选）
        const styleElement = document.getElementById('agent-thinking-styles');
        if (styleElement) {
            styleElement.remove();
        }
        
        this.stylesInjected = false;
        this.currentSession = null;
    }
}