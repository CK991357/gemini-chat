// src/static/js/agent/AgentThinkingDisplay.js
export class AgentThinkingDisplay {
    constructor(containerId = 'agent-thinking-container') {
        this.containerId = containerId;
        this.container = null;
        this.currentSession = null;
        this.thinkingBuffer = '';
        this.stylesInjected = false; // 标记样式是否已注入
        this.timeUpdateInterval = null;
        
        this.setupEventListeners();
        this.injectStyles(); // 预注入样式，但确保默认隐藏
    }

    /**
     * 🎯 动态注入CSS样式 - 关键修复
     */
    injectStyles() {
        if (this.stylesInjected) return;

        const styleId = 'agent-thinking-styles';
        if (document.getElementById(styleId)) return;

        const css = `
/* Agent Thinking Display Styles - 动态注入 */
#agent-thinking-container {
    display: none;
    position: fixed;
    top: 20px;
    right: 20px;
    width: 500px;
    max-height: 80vh;
    background: white;
    border: 1px solid #e1e5e9;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
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

/* 内部样式 */
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
        `;

        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);

        this.stylesInjected = true;
        console.log('[AgentThinkingDisplay] 动态样式注入完成');
    }

    createContainer() {
        // 如果容器已存在，直接返回
        const existingContainer = document.getElementById(this.containerId);
        if (existingContainer) {
            this.container = existingContainer;
            return this.container;
        }

        const container = document.createElement('div');
        container.id = this.containerId;
        container.className = 'agent-thinking-container';
        container.style.display = 'none'; // 关键：确保默认隐藏
        
        // 插入到body末尾，避免影响现有布局
        document.body.appendChild(container);
        this.container = container;
        
        return container;
    }

    /**
     * 🎯 开始新的Agent会话
     */
    startSession(userMessage, maxIterations = 8) {
        // 确保容器存在
        if (!this.container) {
            this.container = this.createContainer();
        }
        
        const sessionId = `agent_${Date.now()}`;
        this.currentSession = {
            id: sessionId,
            userMessage,
            maxIterations,
            currentIteration: 0,
            steps: [],
            startTime: Date.now(),
            status: 'planning'
        };

        this.renderSession();
        this.show();
        
        return sessionId;
    }

    /**
     * 🎯 完成会话 - 修复：统一使用 completeSession 方法
     */
    completeSession(finalResult) {
        if (!this.currentSession) return;

        this.currentSession.status = 'completed';
        this.currentSession.endTime = Date.now();
        this.currentSession.finalResult = finalResult;

        this.updateThinking('🎉 Agent执行完成！', 'completion');
        this.updateStatus('completed');
        
        // 添加完成总结
        this.addCompletionSummary();
    }

    /**
     * 🎯 结束会话（兼容性方法）- 修复：添加 endSession 方法
     */
    endSession(finalResult) {
        console.warn('endSession 方法已弃用，请使用 completeSession 方法');
        this.completeSession(finalResult);
    }

    /**
     * 🎯 渲染会话界面
     */
    renderSession() {
        const { userMessage, maxIterations, steps, status } = this.currentSession;
        
        this.container.innerHTML = `
            <div class="agent-session">
                <div class="session-header">
                    <div class="session-title">
                        <span class="session-icon">🤖</span>
                        <h3>智能代理执行过程</h3>
                        <span class="session-badge">${status === 'planning' ? '规划中' : '执行中'}</span>
                    </div>
                    <div class="session-controls">
                        <button class="btn-minimize">−</button>
                        <button class="btn-close">×</button>
                    </div>
                </div>
                
                <div class="session-content">
                    <!-- 用户请求 -->
                    <div class="user-query-section">
                        <div class="section-title">🎯 用户请求</div>
                        <div class="user-query">${this.escapeHtml(userMessage)}</div>
                    </div>
                    
                    <!-- 执行计划 -->
                    <div class="execution-plan-section">
                        <div class="section-title">📋 执行计划</div>
                        <div class="plan-steps" id="plan-steps">
                            ${this.renderPlanSteps(steps)}
                        </div>
                    </div>
                    
                    <!-- 实时思考过程 -->
                    <div class="thinking-process-section">
                        <div class="section-title">💭 实时思考</div>
                        <div class="thinking-content" id="thinking-content">
                            <div class="thinking-placeholder">等待模型开始思考...</div>
                        </div>
                    </div>
                    
                    <!-- 当前状态 -->
                    <div class="current-status-section">
                        <div class="status-item">
                            <span class="status-label">当前迭代:</span>
                            <span class="status-value" id="current-iteration">0/${maxIterations}</span>
                        </div>
                        <div class="status-item">
                            <span class="status-label">执行状态:</span>
                            <span class="status-value" id="execution-status">准备开始</span>
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
     * 🎯 开始更新时间显示
     */
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

    /**
     * 🎯 渲染计划步骤
     */
    renderPlanSteps(steps) {
        if (!steps || steps.length === 0) {
            return '<div class="no-plan">模型正在制定执行计划...</div>';
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
     * 🎯 更新思考过程
     */
    updateThinking(content, type = 'thinking') {
        const thinkingContent = this.container.querySelector('#thinking-content');
        if (!thinkingContent) return;

        // 移除占位符
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
     * 🎯 更新迭代信息
     */
    updateIteration(iteration, total, thinking = '') {
        if (!this.currentSession) return;
        
        this.currentSession.currentIteration = iteration;
        
        const iterationElement = this.container.querySelector('#current-iteration');
        if (iterationElement) {
            iterationElement.textContent = `${iteration}/${total}`;
        }

        if (thinking) {
            this.updateThinking(`开始第 ${iteration} 次迭代分析...\n${thinking}`, 'iteration');
        }
    }

    /**
     * 🎯 添加执行步骤
     */
    addStep(step) {
        if (!this.currentSession) return;

        // 确保有步骤数组
        if (!this.currentSession.steps) {
            this.currentSession.steps = [];
        }

        const newStep = {
            ...step,
            timestamp: Date.now(),
            completed: false,
            current: true
        };

        this.currentSession.steps.push(newStep);

        // 更新之前的当前步骤
        this.currentSession.steps.forEach((s, index) => {
            s.current = index === this.currentSession.steps.length - 1;
        });

        this.renderPlanSteps(this.currentSession.steps);
        
        // 记录思考过程
        if (step.type === 'think') {
            this.updateThinking(step.description, 'thinking');
        } else if (step.type === 'action') {
            this.updateThinking(`执行工具: ${step.tool}\n参数: ${JSON.stringify(step.parameters, null, 2)}`, 'action');
        }
    }

    /**
     * 🎯 完成步骤
     */
    completeStep(stepIndex, result) {
        if (!this.currentSession || !this.currentSession.steps[stepIndex]) return;

        const step = this.currentSession.steps[stepIndex];
        step.completed = true;
        step.current = false;
        step.result = result;
        step.endTime = Date.now();
        step.duration = step.endTime - step.timestamp;

        this.renderPlanSteps(this.currentSession.steps);

        // 记录结果
        if (step.type === 'action') {
            const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            this.updateThinking(`工具执行完成 (${step.duration}ms):\n${resultText}`, 'result');
        }
    }

    /**
     * 🎯 添加完成总结
     */
    addCompletionSummary() {
        const { steps, startTime, endTime } = this.currentSession;
        const totalTime = ((endTime - startTime) / 1000).toFixed(1);
        const completedSteps = steps.filter(s => s.completed).length;
        const thinkingSteps = steps.filter(s => s.type === 'think').length;
        const actionSteps = steps.filter(s => s.type === 'action').length;

        const summary = `
执行总结:
• 总步骤: ${steps.length} (${thinkingSteps}次思考, ${actionSteps}次行动)
• 完成步骤: ${completedSteps}
• 总用时: ${totalTime}秒
• 成功率: ${((completedSteps / steps.length) * 100).toFixed(1)}%
        `;

        this.updateThinking(summary, 'summary');
    }

    /**
     * 🎯 更新状态
     */
    updateStatus(status) {
        if (!this.currentSession) return;
        
        this.currentSession.status = status;
        
        const statusElement = this.container.querySelector('#execution-status');
        if (statusElement) {
            const statusText = {
                planning: '规划中',
                running: '执行中',
                completed: '已完成',
                error: '执行错误'
            }[status] || status;
            
            statusElement.textContent = statusText;
        }
    }

    // 辅助方法
    getStepTypeIcon(type) {
        const icons = {
            think: '💭',
            action: '🎯',
            plan: '📋',
            review: '🔍'
        };
        return icons[type] || '📝';
    }

    getThinkingIcon(type) {
        const icons = {
            thinking: '🧠',
            action: '🎯',
            result: '📊',
            iteration: '🔄',
            completion: '🎉',
            summary: '📋',
            error: '❌'
        };
        return icons[type] || '💭';
    }

    getThinkingTypeText(type) {
        const texts = {
            thinking: '模型思考',
            action: '执行行动',
            result: '执行结果',
            iteration: '迭代分析',
            completion: '完成',
            summary: '总结',
            error: '错误'
        };
        return texts[type] || '思考';
    }

    formatStepResult(result) {
        if (typeof result === 'string') {
            return result.length > 100 ? result.substring(0, 100) + '...' : result;
        }
        return JSON.stringify(result).substring(0, 100) + '...';
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

    attachContainerEvents() {
        // 最小化/关闭按钮
        this.container.querySelector('.btn-minimize')?.addEventListener('click', () => {
            this.container.classList.toggle('minimized');
        });

        this.container.querySelector('.btn-close')?.addEventListener('click', () => {
            this.hide();
        });
    }

    setupEventListeners() {
        // 监听Agent事件
        window.addEventListener('agent:thinking', (event) => {
            this.updateThinking(event.detail.content, event.detail.type);
        });

        window.addEventListener('agent:step_added', (event) => {
            this.addStep(event.detail.step);
        });

        window.addEventListener('agent:step_completed', (event) => {
            this.completeStep(event.detail.index, event.detail.result);
        });

        window.addEventListener('agent:iteration_update', (event) => {
            this.updateIteration(
                event.detail.iteration, 
                event.detail.total,
                event.detail.thinking
            );
        });

        window.addEventListener('agent:session_completed', (event) => {
            this.completeSession(event.detail.result);
        });

        window.addEventListener('agent:session_error', (event) => {
            this.updateThinking(`❌ Agent执行出错: ${event.detail.error}`, 'error');
            this.updateStatus('error');
        });
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

    /**
     * 🎯 完全销毁实例
     */
    destroy() {
        this.clear();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
            this.container = null;
        }
        
        // 可选：移除注入的样式
        // this.removeStyles();
    }

    /**
     * 🎯 可选：移除注入的样式
     */
    removeStyles() {
        const styleElement = document.getElementById('agent-thinking-styles');
        if (styleElement && styleElement.parentNode) {
            styleElement.parentNode.removeChild(styleElement);
            this.stylesInjected = false;
        }
    }
}