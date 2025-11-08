// src/static/js/agent/AgentThinkingDisplay.js
export class AgentThinkingDisplay {
    constructor(containerId = 'agent-thinking-container') {
        this.containerId = containerId;
        this.container = null;
        this.currentSession = null;
        this.thinkingBuffer = '';
        this.stylesInjected = false;
        this.timeUpdateInterval = null;
        
        // 🎯 拖动状态和绑定函数
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.onMouseMoveBound = this.onMouseMove.bind(this);
        this.onMouseUpBound = this.onMouseUp.bind(this);

        this.setupEventListeners();
        this.injectStyles();
    }

    /**
     * 🎯 动态注入CSS样式 - 适配DeepResearch主题
     */
    injectStyles() {
        if (this.stylesInjected) return;

        const styleId = 'agent-thinking-styles';
        if (document.getElementById(styleId)) return;

        const css = `
/* Agent Thinking Display Styles - DeepResearch主题 */
#agent-thinking-container {
    display: none;
    position: fixed;
    top: 20px;
    right: 20px;
    width: 520px;
    max-height: 80vh;
    background: white;
    border: 2px solid #667eea;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.15);
    z-index: 1000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
    transition: all 0.3s ease;
}

#agent-thinking-container.minimized {
    height: 50px;
    overflow: hidden;
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

/* DeepResearch主题样式 */
.agent-thinking-container .session-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: move;
}

.agent-thinking-container .session-title {
    display: flex;
    align-items: center;
    gap: 10px;
}

.agent-thinking-container .session-icon {
    font-size: 20px;
}

.agent-thinking-container .session-title h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.agent-thinking-container .session-badge {
    background: rgba(255, 255, 255, 0.2);
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
}

.agent-thinking-container .session-controls {
    display: flex;
    gap: 8px;
}

.agent-thinking-container .session-controls button {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: background 0.2s;
}

.agent-thinking-container .session-controls button:hover {
    background: rgba(255, 255, 255, 0.3);
}

.agent-thinking-container .session-content {
    padding: 0;
    max-height: calc(80vh - 60px);
    overflow-y: auto;
}

.agent-thinking-container .section-title {
    font-weight: 600;
    font-size: 14px;
    color: #2d3748;
    margin-bottom: 12px;
    padding: 16px 20px 0;
    display: flex;
    align-items: center;
    gap: 8px;
}

.agent-thinking-container .user-query-section {
    border-bottom: 1px solid #f1f5f9;
    padding: 0 20px 16px;
}

.agent-thinking-container .user-query {
    background: #f8fafc;
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.5;
    color: #4a5568;
}

.agent-thinking-container .execution-plan-section {
    border-bottom: 1px solid #f1f5f9;
    padding: 0 20px 16px;
}

.agent-thinking-container .plan-steps {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.agent-thinking-container .plan-step {
    display: flex;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: white;
    transition: all 0.2s;
}

.agent-thinking-container .plan-step.current {
    border-color: #4299e1;
    background: #ebf8ff;
}

.agent-thinking-container .plan-step.completed {
    border-color: #48bb78;
    background: #f0fff4;
}

.agent-thinking-container .step-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.agent-thinking-container .step-number {
    width: 24px;
    height: 24px;
    background: #e2e8f0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
}

.agent-thinking-container .plan-step.current .step-number {
    background: #4299e1;
    color: white;
}

.agent-thinking-container .plan-step.completed .step-number {
    background: #48bb78;
    color: white;
}

.agent-thinking-container .step-content {
    flex: 1;
    min-width: 0;
}

.agent-thinking-container .step-type {
    font-size: 12px;
    font-weight: 600;
    color: #718096;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
}

.agent-thinking-container .step-description {
    font-size: 14px;
    line-height: 1.4;
    color: #2d3748;
    margin-bottom: 6px;
}

.agent-thinking-container .step-tool {
    font-size: 12px;
    color: #667eea;
    background: #f0f4ff;
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
}

.agent-thinking-container .step-result {
    font-size: 12px;
    color: #718096;
    background: #f7fafc;
    padding: 6px;
    border-radius: 4px;
    margin-top: 6px;
    border-left: 3px solid #e2e8f0;
    max-height: 100px;
    overflow-y: auto;
}

.agent-thinking-container .thinking-process-section {
    border-bottom: 1px solid #f1f5f9;
    padding: 0 20px 16px;
}

.agent-thinking-container .thinking-content {
    background: #f8fafc;
    border-radius: 8px;
    padding: 12px;
    max-height: 200px;
    overflow-y: auto;
    font-size: 13px;
    line-height: 1.5;
}

.agent-thinking-container .thinking-chunk {
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e2e8f0;
}

.agent-thinking-container .thinking-chunk:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
}

.agent-thinking-container .thinking-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
}

.agent-thinking-container .thinking-time {
    font-size: 11px;
    color: #718096;
}

.agent-thinking-container .thinking-type {
    font-size: 11px;
    font-weight: 600;
    color: #667eea;
    background: #f0f4ff;
    padding: 2px 6px;
    border-radius: 4px;
}

.agent-thinking-container .thinking-text {
    color: #4a5568;
    white-space: pre-wrap;
}

.agent-thinking-container .current-status-section {
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    background: #f7fafc;
    border-top: 1px solid #e2e8f0;
}

.agent-thinking-container .status-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.agent-thinking-container .status-label {
    font-size: 11px;
    color: #718096;
    font-weight: 500;
}

.agent-thinking-container .status-value {
    font-size: 13px;
    font-weight: 600;
    color: #2d3748;
}

.agent-thinking-container .thinking-placeholder {
    color: #a0aec0;
    font-style: italic;
    text-align: center;
    padding: 20px;
}

/* DeepResearch特定样式 */
.agent-thinking-container .research-phase {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.agent-thinking-container .research-keywords {
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    border-radius: 6px;
    padding: 8px 12px;
    margin: 8px 0;
}

.agent-thinking-container .keyword-tag {
    display: inline-block;
    background: #667eea;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    margin: 2px 4px 2px 0;
}

.agent-thinking-container .research-progress {
    background: #d1ecf1;
    border: 1px solid #bee5eb;
    border-radius: 6px;
    padding: 8px 12px;
    margin: 8px 0;
    font-size: 12px;
}

.agent-thinking-container .source-item {
    background: #e8f5e8;
    border: 1px solid #c8e6c9;
    border-radius: 6px;
    padding: 8px 12px;
    margin: 4px 0;
    font-size: 12px;
}
        `;

        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);

        this.stylesInjected = true;
        console.log('[AgentThinkingDisplay] DeepResearch主题样式注入完成');
    }

    createContainer() {
        const existingContainer = document.getElementById(this.containerId);
        if (existingContainer) {
            this.container = existingContainer;
            return this.container;
        }

        const container = document.createElement('div');
        container.id = this.containerId;
        container.className = 'agent-thinking-container';
        container.style.display = 'none';
        
        document.body.appendChild(container);
        this.container = container;
        
        return container;
    }

    /**
     * 🎯 开始新的DeepResearch会话
     */
    startSession(userMessage, maxIterations = 6) {
        if (!this.container) {
            this.container = this.createContainer();
        }
        
        const sessionId = `deepresearch_${Date.now()}`;
        this.currentSession = {
            id: sessionId,
            userMessage,
            maxIterations,
            currentIteration: 0,
            steps: [],
            startTime: Date.now(),
            status: 'initializing',
            researchState: {
                phase: 'initializing',
                keywords: [],
                collectedSources: [],
                analyzedContent: []
            }
        };

        this.renderSession();
        this.show();
        this.container.classList.add('minimized');
        
        return sessionId;
    }

    /**
     * 🎯 完成会话 - DeepResearch专用
     */
    completeSession(finalResult) {
        if (!this.currentSession) return;

        this.currentSession.status = 'completed';
        this.currentSession.endTime = Date.now();
        this.currentSession.finalResult = finalResult;

        this.updateThinking('🎉 DeepResearch执行完成！生成最终研究报告。', 'completion');
        this.updateStatus('completed');
        
        this.addDeepResearchSummary();
    }

    /**
     * 🎯 结束会话（兼容性方法）
     */
    endSession(finalResult) {
        console.warn('endSession 方法已弃用，请使用 completeSession 方法');
        this.completeSession(finalResult);
    }

    /**
     * 🎯 渲染DeepResearch会话界面
     */
    renderSession() {
        const { userMessage, maxIterations, steps, status, researchState } = this.currentSession;
        
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
                    
                    <!-- 研究状态 -->
                    <div class="current-status-section">
                        <div class="status-item">
                            <span class="status-label">研究阶段:</span>
                            <span class="status-value" id="research-phase">${researchState.phase}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label">关键词:</span>
                            <span class="status-value" id="keywords-count">${researchState.keywords.length}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label">已用时间:</span>
                            <span class="status-value" id="elapsed-time">0s</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.attachContainerEvents();
        this.startTimeUpdate();
    }

    /**
     * 🎯 渲染DeepResearch研究步骤
     */
    renderResearchSteps(steps, researchState) {
        if (!steps || steps.length === 0) {
            return `
                <div class="research-progress">
                    <strong>当前阶段:</strong> ${this.getPhaseText(researchState.phase)}
                    ${researchState.keywords.length > 0 ? `
                    <div class="research-keywords">
                        <strong>研究关键词:</strong>
                        ${researchState.keywords.map(kw => 
                            `<span class="keyword-tag">${this.escapeHtml(kw.term || kw)}</span>`
                        ).join('')}
                    </div>
                    ` : ''}
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
     * 🎯 更新研究思考过程
     */
    updateThinking(content, type = 'thinking') {
        const thinkingContent = this.container.querySelector('#thinking-content');
        if (!thinkingContent) return;

        const placeholder = thinkingContent.querySelector('.thinking-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        const thinkingChunk = document.createElement('div');
        thinkingChunk.className = `thinking-chunk thinking-${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        const icon = this.getThinkingIcon(type);
        
        thinkingChunk.innerHTML = `
            <div class="thinking-header">
                <span class="thinking-time">${timestamp}</span>
                <span class="thinking-type">${icon} ${this.getThinkingTypeText(type)}</span>
            </div>
            <div class="thinking-text">${this.escapeHtml(content)}</div>
        `;

        thinkingContent.appendChild(thinkingChunk);
        thinkingContent.scrollTop = thinkingContent.scrollHeight;
    }

    /**
     * 🎯 更新研究阶段
     */
    updateResearchPhase(phase, data = {}) {
        if (!this.currentSession) return;
        
        this.currentSession.researchState.phase = phase;
        
        const phaseElement = this.container.querySelector('#research-phase');
        if (phaseElement) {
            phaseElement.textContent = this.getPhaseText(phase);
        }

        // 更新关键词计数
        if (data.keywords && data.keywords.length > 0) {
            this.currentSession.researchState.keywords = data.keywords;
            const keywordsElement = this.container.querySelector('#keywords-count');
            if (keywordsElement) {
                keywordsElement.textContent = data.keywords.length;
            }
            
            // 显示关键词
            this.updateThinking(`🔍 生成研究关键词: ${data.keywords.map(k => k.term || k).join(', ')}`, 'keywords');
        }

        // 重新渲染研究步骤
        this.renderResearchSteps(this.currentSession.steps, this.currentSession.researchState);
        
        this.updateThinking(`🔄 进入研究阶段: ${this.getPhaseText(phase)}`, 'phase_change');
    }

    /**
     * 🎯 更新研究进度
     */
    updateResearchProgress(stage, progress) {
        if (!this.currentSession) return;

        let progressText = '';
        
        switch (stage) {
            case 'search':
                progressText = `🔍 搜索进度: 第${progress.round}轮，关键词"${progress.currentKeyword}"，已收集${progress.resultsCount}个结果`;
                break;
            case 'analysis':
                progressText = `📊 分析进度: ${progress.analyzed}/${progress.total}个内容分析完成`;
                break;
            case 'synthesis':
                progressText = `📝 报告合成: 正在生成最终研究报告`;
                break;
            default:
                progressText = `🔄 研究进度: ${JSON.stringify(progress)}`;
        }
        
        this.updateThinking(progressText, 'progress');
    }

    /**
     * 🎯 添加研究步骤
     */
    addStep(step) {
        if (!this.currentSession) {
            console.warn('没有活跃的研究会话，忽略步骤:', step);
            return;
        }

        if (!this.currentSession.steps) {
            this.currentSession.steps = [];
        }

        const newStep = {
            ...step,
            id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: step.timestamp || Date.now(),
            completed: false,
            current: true
        };

        this.currentSession.steps.forEach(s => {
            s.current = false;
        });

        this.currentSession.steps.push(newStep);
        this.renderResearchSteps(this.currentSession.steps, this.currentSession.researchState);
        
        // 记录思考过程
        if (step.type === 'research') {
            this.updateThinking(step.description, 'research');
        } else if (step.type === 'search') {
            this.updateThinking(`执行搜索: ${step.description}`, 'search');
        }
    }

    /**
     * 🎯 完成步骤
     */
    completeStep(stepIndex, result) {
        if (!this.currentSession || !this.currentSession.steps[stepIndex]) {
            console.warn('步骤不存在:', stepIndex);
            return;
        }

        const step = this.currentSession.steps[stepIndex];
        step.completed = true;
        step.current = false;
        step.result = result;
        step.endTime = Date.now();
        step.duration = step.endTime - step.timestamp;

        this.renderResearchSteps(this.currentSession.steps, this.currentSession.researchState);

        if (step.type === 'search') {
            const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            this.updateThinking(`搜索完成 (${step.duration}ms):\n${resultText.substring(0, 200)}...`, 'result');
        }
    }

    /**
     * 🎯 添加DeepResearch完成总结
     */
    addDeepResearchSummary() {
        const { researchState, startTime, endTime } = this.currentSession;
        const totalTime = ((endTime - startTime) / 1000).toFixed(1);
        const sourcesCount = researchState.collectedSources?.length || 0;
        const analyzedCount = researchState.analyzedContent?.length || 0;
        const keywordsCount = researchState.keywords?.length || 0;

        const summary = `
🔍 DeepResearch 执行总结:
• 研究主题: ${this.currentSession.userMessage}
• 研究关键词: ${keywordsCount}个
• 收集来源: ${sourcesCount}个
• 分析内容: ${analyzedCount}个
• 总用时: ${totalTime}秒
• 研究深度: ${researchState.depth || 'standard'}
        `;

        this.updateThinking(summary, 'summary');
    }

    /**
     * 🎯 更新研究状态
     */
    updateStatus(status) {
        if (!this.currentSession) return;
        
        this.currentSession.status = status;
        
        const statusElement = this.container.querySelector('.session-badge');
        if (statusElement) {
            statusElement.textContent = this.getStatusText(status);
        }
    }

    // 🎯 DeepResearch专用辅助方法
    getStatusText(status) {
        const statusMap = {
            initializing: '初始化',
            planning: '规划中',
            keyword_generation: '生成关键词',
            search: '搜索中',
            analysis: '分析中',
            synthesis: '合成报告',
            completed: '已完成',
            error: '执行错误'
        };
        return statusMap[status] || status;
    }

    getPhaseText(phase) {
        const phaseMap = {
            initializing: '初始化研究',
            keyword_generation: '关键词生成',
            search: '多轮搜索',
            analysis: '内容分析',
            synthesis: '报告合成',
            completed: '研究完成'
        };
        return phaseMap[phase] || phase;
    }

    getStepTypeIcon(type) {
        const icons = {
            think: '💭',
            research: '🔍',
            search: '🔎',
            action: '🎯',
            analysis: '📊',
            synthesis: '📝',
            phase: '🔄'
        };
        return icons[type] || '📝';
    }

    getThinkingIcon(type) {
        const icons = {
            thinking: '🧠',
            research: '🔍',
            search: '🔎',
            action: '🎯',
            result: '📊',
            phase_change: '🔄',
            completion: '🎉',
            summary: '📋',
            error: '❌',
            keywords: '🔑',
            progress: '📈'
        };
        return icons[type] || '💭';
    }

    getThinkingTypeText(type) {
        const texts = {
            thinking: '模型思考',
            research: '研究分析',
            search: '搜索执行',
            action: '执行行动',
            result: '执行结果',
            phase_change: '阶段变更',
            completion: '完成',
            summary: '研究总结',
            error: '错误',
            keywords: '关键词',
            progress: '研究进度'
        };
        return texts[type] || '思考';
    }

    formatStepResult(result) {
        if (typeof result === 'string') {
            return result.length > 150 ? result.substring(0, 150) + '...' : result;
        }
        const resultStr = JSON.stringify(result);
        return resultStr.length > 150 ? resultStr.substring(0, 150) + '...' : resultStr;
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe;
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\n/g, '<br>');
    }

    // 🎯 时间更新和事件处理（保持不变）
    startTimeUpdate() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        
        this.timeUpdateInterval = setInterval(() => {
            if (this.currentSession && this.currentSession.startTime) {
                const elapsed = Math.floor((Date.now() - this.currentSession.startTime) / 1000);
                const timeElement = this.container.querySelector('#elapsed-time');
                if (timeElement) {
                    timeElement.textContent = `${elapsed}s`;
                }
            }
        }, 1000);
    }

    attachContainerEvents() {
        this.container.querySelector('.btn-minimize')?.addEventListener('click', () => {
            this.container.classList.toggle('minimized');
        });

        this.container.querySelector('.btn-close')?.addEventListener('click', () => {
            this.hide();
        });
        
        const header = this.container.querySelector('.session-header');
        if (header) {
            header.addEventListener('mousedown', this.onMouseDown.bind(this));
        }
    }

    onMouseDown(e) {
        if (e.button !== 0) return;

        this.isDragging = true;
        
        const rect = this.container.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;

        this.container.style.position = 'fixed';
        
        document.addEventListener('mousemove', this.onMouseMoveBound);
        document.addEventListener('mouseup', this.onMouseUpBound);
        
        e.preventDefault();
    }

    onMouseMove(e) {
        if (!this.isDragging) return;

        let newLeft = e.clientX - this.dragOffsetX;
        let newTop = e.clientY - this.dragOffsetY;

        const maxX = window.innerWidth - this.container.offsetWidth;
        const maxY = window.innerHeight - this.container.offsetHeight;

        newLeft = Math.max(0, Math.min(newLeft, maxX));
        newTop = Math.max(0, Math.min(newTop, maxY));

        this.container.style.left = `${newLeft}px`;
        this.container.style.top = `${newTop}px`;
        this.container.style.right = 'auto';
    }

    onMouseUp() {
        if (!this.isDragging) return;

        this.isDragging = false;
        document.removeEventListener('mousemove', this.onMouseMoveBound);
        document.removeEventListener('mouseup', this.onMouseUpBound);
    }

    /**
     * 🎯 设置DeepResearch事件监听器
     */
    setupEventListeners() {
        // DeepResearch Agent事件
        window.addEventListener('agent:session_started', (event) => {
            console.log('🔍 DeepResearch会话开始:', event.detail);
            if (event.detail.agentType === 'deep_research') {
                this.startSession(
                    event.detail.data?.userMessage || event.detail.data?.topic || 'DeepResearch任务',
                    event.detail.data?.maxIterations || 6
                );
            }
        });

        window.addEventListener('agent:thinking', (event) => {
            if (event.detail.agentType === 'deep_research') {
                this.updateThinking(event.detail.content, event.detail.type || 'research');
            }
        });

        window.addEventListener('agent:step_added', (event) => {
            if (event.detail.agentType === 'deep_research') {
                this.addStep(event.detail.step);
            }
        });

        window.addEventListener('agent:step_completed', (event) => {
            if (event.detail.agentType === 'deep_research') {
                const lastStepIndex = this.currentSession?.steps?.length - 1 || 0;
                if (lastStepIndex >= 0) {
                    this.completeStep(lastStepIndex, event.detail.result);
                }
            }
        });

        window.addEventListener('agent:iteration_update', (event) => {
            if (event.detail.agentType === 'deep_research') {
                // DeepResearch使用阶段而不是迭代
                if (event.detail.data?.stage && event.detail.data?.progress) {
                    this.updateResearchProgress(event.detail.data.stage, event.detail.data.progress);
                }
            }
        });

        // 🎯 DeepResearch特定事件
        window.addEventListener('research:phase_changed', (event) => {
            console.log('🔄 DeepResearch阶段变更:', event.detail);
            this.updateResearchPhase(event.detail.phase, event.detail.data);
        });

        window.addEventListener('research:keywords_generated', (event) => {
            console.log('🔑 DeepResearch关键词生成:', event.detail);
            this.updateResearchPhase('keyword_generation', { keywords: event.detail.keywords });
        });

        window.addEventListener('research:progress', (event) => {
            this.updateResearchProgress(event.detail.stage, event.detail.progress);
        });

        window.addEventListener('agent:session_completed', (event) => {
            if (event.detail.agentType === 'deep_research') {
                this.completeSession(event.detail.result);
            }
        });

        window.addEventListener('agent:session_error', (event) => {
            if (event.detail.agentType === 'deep_research') {
                this.updateThinking(`❌ DeepResearch执行出错: ${event.detail.error}`, 'error');
                this.updateStatus('error');
            }
        });
        
        console.log('🔍 AgentThinkingDisplay DeepResearch事件监听器设置完成');
    }

    show() {
        if (this.container) {
            this.container.style.display = 'block';
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    clear() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
        this.currentSession = null;
        this.thinkingBuffer = '';
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    destroy() {
        this.clear();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
            this.container = null;
        }
    }
}