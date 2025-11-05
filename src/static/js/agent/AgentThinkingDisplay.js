// src/static/js/agent/AgentThinkingDisplay.js
export class AgentThinkingDisplay {
    constructor(containerId = 'agent-thinking-container') {
        this.container = document.getElementById(containerId) || this.createContainer();
        this.currentSession = null;
        this.thinkingBuffer = '';
        this.setupEventListeners();
    }

    createContainer() {
        const container = document.createElement('div');
        container.id = 'agent-thinking-container';
        container.className = 'agent-thinking-container';
        
        // 插入到聊天界面旁边
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.parentNode.insertBefore(container, chatContainer);
        } else {
            document.body.appendChild(container);
        }
        
        return container;
    }

    /**
     * 🎯 开始新的Agent会话
     */
    startSession(userMessage, maxIterations = 8) {
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
        this.container.style.display = 'block';
    }

    hide() {
        this.container.style.display = 'none';
    }

    clear() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
        }
        this.currentSession = null;
        this.thinkingBuffer = '';
        this.container.innerHTML = '';
    }

    /**
     * 🎯 销毁实例
     */
    destroy() {
        this.clear();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}