// src/static/js/agent/AgentThinkingDisplay.js
export class AgentThinkingDisplay {
    constructor(containerId = 'agent-thinking-container') {
        this.containerId = containerId;
        this.container = null;
        this.currentSession = null;
        this.thinkingBuffer = '';
        this.stylesInjected = false;
        this.timeUpdateInterval = null;
        
        // 🎯 新增：多Agent支持
        this.availableAgents = {
            'deep_research': {
                name: '深度研究助手',
                description: '专业的研究分析，收集多源信息并生成深度报告',
                icon: '🔍',
                tools: ['tavily_search', 'crawl4ai', 'python_sandbox']
            }
            // 🎯 未来可以添加更多Agent
        };
        
        this.currentAgentType = null;
        
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
     * 🎯 新增：显示Agent选择界面
     */
    showAgentSelection() {
        if (!this.container) {
            this.container = this.createContainer();
        }
        
        this.container.innerHTML = this.renderAgentSelection();
        this.container.style.display = 'block';
        
        this.attachSelectionEvents();
    }

    /**
     * 🎯 新增：渲染Agent选择界面
     */
    renderAgentSelection() {
        return `
            <div class="agent-selection-panel">
                <div class="selection-header">
                    <h3>🤖 选择智能助手模式</h3>
                    <p>请根据您的任务需求选择合适的助手</p>
                </div>
                
                <div class="agent-options">
                    ${Object.entries(this.availableAgents).map(([agentId, agent]) => `
                        <div class="agent-option" data-agent-id="${agentId}">
                            <div class="agent-icon">${agent.icon}</div>
                            <div class="agent-info">
                                <h4>${agent.name}</h4>
                                <p>${agent.description}</p>
                                <div class="agent-tools">
                                    <span>可用工具: ${agent.tools.map(tool => 
                                        `<span class="tool-tag">${tool}</span>`
                                    ).join('')}</span>
                                </div>
                            </div>
                            <div class="agent-select">
                                <button class="btn-select-agent">选择</button>
                            </div>
                        </div>
                    `).join('')}
                    
                    <div class="agent-option" data-agent-id="standard">
                        <div class="agent-icon">💬</div>
                        <div class="agent-info">
                            <h4>标准对话模式</h4>
                            <p>使用基础的对话和工具调用功能</p>
                            <div class="agent-tools">
                                <span>所有可用工具</span>
                            </div>
                        </div>
                        <div class="agent-select">
                            <button class="btn-select-agent">选择</button>
                        </div>
                    </div>
                </div>
                
                <div class="selection-actions">
                    <button class="btn-cancel-selection">取消</button>
                </div>
            </div>
        `;
    }

    /**
     * 🎯 新增：开始特定Agent会话
     */
    startAgentSession(agentType, userMessage, context = {}) {
        this.currentAgentType = agentType;
        this.currentSession = {
            id: `agent_${Date.now()}`,
            agentType: agentType,
            userMessage,
            context,
            startTime: Date.now(),
            status: 'initializing',
            phases: []
        };

        this.renderAgentSession();
        this.show();
        
        // 🎯 触发Agent模式选择事件
        window.dispatchEvent(new CustomEvent('agent:mode_selected', {
            detail: {
                agentType: agentType,
                sessionId: this.currentSession.id,
                userMessage: userMessage
            }
        }));

        return this.currentSession.id;
    }

    /**
     * 🎯 新增：渲染特定Agent会话界面
     */
    renderAgentSession() {
        const agentConfig = this.availableAgents[this.currentAgentType];
        
        this.container.innerHTML = `
            <div class="agent-session">
                <div class="session-header">
                    <div class="session-title">
                        <span class="session-icon">${agentConfig?.icon || '🤖'}</span>
                        <h3>${agentConfig?.name || '智能助手'} - 执行中</h3>
                        <span class="session-badge">${this.currentAgentType}</span>
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
                        <div class="user-query">${this.escapeHtml(this.currentSession.userMessage)}</div>
                    </div>
                    
                    <!-- Agent特定内容 -->
                    <div class="agent-specific-content">
                        ${this.renderAgentSpecificContent()}
                    </div>
                    
                    <!-- 执行计划 -->
                    <div class="execution-plan-section">
                        <div class="section-title">📋 执行计划</div>
                        <div class="plan-steps" id="plan-steps">
                            <div class="no-plan">等待${agentConfig?.name || '智能助手'}制定执行计划...</div>
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
                            <span class="status-label">当前模式:</span>
                            <span class="status-value">${agentConfig?.name || this.currentAgentType}</span>
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
     * 🎯 新增：渲染Agent特定内容
     */
    renderAgentSpecificContent() {
        switch (this.currentAgentType) {
            case 'deep_research':
                return `
                    <div class="research-info-section">
                        <div class="section-title">🔍 研究信息</div>
                        <div class="research-metadata">
                            <div class="metadata-item">
                                <span class="label">研究工具:</span>
                                <span class="value">搜索工具 + 内容分析 + 数据整理</span>
                            </div>
                            <div class="metadata-item">
                                <span class="label">预计步骤:</span>
                                <span class="value">关键词生成 → 多轮搜索 → 内容分析 → 报告合成</span>
                            </div>
                        </div>
                    </div>
                `;
                
            default:
                return '';
        }
    }

    /**
     * 🎯 新增：研究进度更新
     */
    updateResearchProgress(event) {
        if (!this.currentSession || this.currentAgentType !== 'deep_research') return;
        
        const { stage, progress, researchState } = event.detail;
        
        this.updateThinking(this._formatResearchProgress(stage, progress, researchState), 'research_progress');
        
        // 🎯 更新阶段显示
        this._updateResearchPhases(researchState);
    }

    /**
     * 🎯 新增：研究阶段变更
     */
    updateResearchPhase(event) {
        if (!this.currentSession || this.currentAgentType !== 'deep_research') return;
        
        const { phase, researchState } = event.detail;
        
        this.currentSession.researchState = researchState;
        this.updateThinking(`进入阶段: ${this._getPhaseName(phase)}`, 'phase_change');
        
        this._updateResearchPhases(researchState);
    }

    /**
     * 🎯 新增：格式化研究进度
     */
    _formatResearchProgress(stage, progress, researchState) {
        switch (stage) {
            case 'search':
                return `🔍 搜索进度: 第 ${progress.round} 轮，关键词 "${progress.currentKeyword}"，已收集 ${progress.resultsCount} 个结果`;
                
            case 'analysis':
                return `📊 分析进度: ${progress.analyzed}/${progress.total} 个内容已完成分析`;
                
            default:
                return `⚡ 研究进行中: ${researchState.phase}`;
        }
    }

    /**
     * 🎯 新增：更新研究阶段显示
     */
    _updateResearchPhases(researchState) {
        const phases = {
            'initializing': '初始化研究',
            'keyword_generation': '生成关键词', 
            'search': '收集资料',
            'analysis': '分析内容',
            'synthesis': '合成报告',
            'completed': '完成'
        };
        
        const planSteps = this.container.querySelector('#plan-steps');
        if (!planSteps) return;
        
        planSteps.innerHTML = Object.entries(phases).map(([phaseKey, phaseName]) => {
            const isCurrent = researchState.phase === phaseKey;
            const isCompleted = this._isPhaseCompleted(phaseKey, researchState.phase);
            
            return `
                <div class="plan-step ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}">
                    <div class="step-indicator">
                        <span class="step-number">${Object.keys(phases).indexOf(phaseKey) + 1}</span>
                        <span class="step-status">${isCompleted ? '✅' : isCurrent ? '🔄' : '⏳'}</span>
                    </div>
                    <div class="step-content">
                        <div class="step-type">研究阶段</div>
                        <div class="step-description">${phaseName}</div>
                        ${isCurrent && researchState.keywords ? `
                            <div class="step-tool">关键词: ${researchState.keywords.map(k => k.term).join(', ')}</div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 🎯 新增：判断阶段是否完成
     */
    _isPhaseCompleted(phase, currentPhase) {
        const phases = ['initializing', 'keyword_generation', 'search', 'analysis', 'synthesis', 'completed'];
        return phases.indexOf(phase) < phases.indexOf(currentPhase);
    }

    /**
     * 🎯 新增：获取阶段名称
     */
    _getPhaseName(phase) {
        const phaseNames = {
            'initializing': '初始化研究',
            'keyword_generation': '生成关键词',
            'search': '收集资料', 
            'analysis': '分析内容',
            'synthesis': '合成报告',
            'completed': '完成'
        };
        return phaseNames[phase] || phase;
    }

    /**
     * 🎯 修改：设置事件监听器（支持多Agent）
     */
    setupEventListeners() {
        // 🎯 Agent模式选择事件
        window.addEventListener('agent:show_selection', (event) => {
            this.showAgentSelection();
        });

        // 🎯 研究专用事件
        window.addEventListener('agent:research_phase_changed', (event) => {
            this.updateResearchPhase(event.detail);
        });

        window.addEventListener('agent:research_progress', (event) => {
            this.updateResearchProgress(event.detail);
        });

        // 🎯 保留原有的通用事件（向后兼容）
        window.addEventListener('agent:session_started', (event) => {
            if (!this.currentAgentType) {
                // 🎯 如果没有选择Agent，显示选择界面
                this.showAgentSelection();
            }
        });

        window.addEventListener('agent:thinking', (event) => {
            this.updateThinking(event.detail.content, event.detail.type);
        });

        window.addEventListener('agent:step_added', (event) => {
            this.addStep(event.detail.step);
        });

        window.addEventListener('agent:step_completed', (event) => {
            const lastStepIndex = this.currentSession?.steps?.length - 1 || 0;
            if (lastStepIndex >= 0) {
                this.completeStep(lastStepIndex, event.detail.result);
            }
        });

        window.addEventListener('agent:session_completed', (event) => {
            this.completeSession(event.detail.result);
        });

        window.addEventListener('agent:session_error', (event) => {
            this.updateThinking(`❌ Agent执行出错: ${event.detail.error}`, 'error');
            this.updateStatus('error');
        });
    }

    /**
     * 🎯 新增：绑定选择界面事件
     */
    attachSelectionEvents() {
        const agentOptions = this.container.querySelectorAll('.agent-option');
        const cancelBtn = this.container.querySelector('.btn-cancel-selection');
        
        agentOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-select-agent')) {
                    const agentId = option.dataset.agentId;
                    this.selectAgent(agentId);
                }
            });
        });
        
        cancelBtn.addEventListener('click', () => {
            this.hide();
            // 🎯 取消Agent模式选择
            window.dispatchEvent(new CustomEvent('agent:selection_cancelled'));
        });
    }

    /**
     * 🎯 新增：选择Agent
     */
    selectAgent(agentId) {
        if (agentId === 'standard') {
            // 🎯 选择标准模式
            window.dispatchEvent(new CustomEvent('agent:standard_mode_selected'));
            this.hide();
        } else {
            // 🎯 选择专用Agent
            this.currentAgentType = agentId;
            window.dispatchEvent(new CustomEvent('agent:specialized_selected', {
                detail: { agentType: agentId }
            }));
            // 🎯 这里可以显示Agent特定的配置界面
            this.hide();
        }
    }

    // 🎯 保留原有的核心方法（createContainer, updateThinking, addStep, completeStep等）
    // 这些方法保持不变，确保向后兼容

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
        container.style.display = 'none';
        
        document.body.appendChild(container);
        this.container = container;
        
        return container;
    }

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

    addStep(step) {
        if (!this.currentSession) {
            console.warn('没有活跃的Agent会话，忽略步骤:', step);
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
        this.renderPlanSteps(this.currentSession.steps);
        
        if (step.type === 'think') {
            this.updateThinking(step.description, 'thinking');
        } else if (step.type === 'action') {
            this.updateThinking(`执行工具: ${step.tool}\n参数: ${JSON.stringify(step.parameters, null, 2)}`, 'action');
        }
    }

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

        this.renderPlanSteps(this.currentSession.steps);

        if (step.type === 'action') {
            const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            this.updateThinking(`工具执行完成 (${step.duration}ms):\n${resultText}`, 'result');
        }
    }

    completeSession(finalResult) {
        if (!this.currentSession) return;

        this.currentSession.status = 'completed';
        this.currentSession.endTime = Date.now();
        this.currentSession.finalResult = finalResult;

        this.updateThinking('🎉 Agent执行完成！', 'completion');
        this.updateStatus('completed');
        
        this.addCompletionSummary();
    }

    // 🎯 保留其他辅助方法（renderPlanSteps, getThinkingIcon, escapeHtml等）
    // 这些方法保持不变...

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
            error: '❌',
            research_progress: '🔍',
            phase_change: '🔄'
        };
        return icons[type] || '💭';
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

    // 🎯 注入样式时添加多Agent支持的样式
    injectStyles() {
        if (this.stylesInjected) return;

        const styleId = 'agent-thinking-styles';
        if (document.getElementById(styleId)) return;

        const css = `
            /* 原有的样式保持不变... */
            
            /* 🎯 新增：多Agent选择样式 */
            .agent-selection-panel {
                padding: 20px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            }
            
            .selection-header {
                text-align: center;
                margin-bottom: 24px;
            }
            
            .selection-header h3 {
                margin: 0 0 8px 0;
                color: #2d3748;
            }
            
            .selection-header p {
                margin: 0;
                color: #718096;
                font-size: 14px;
            }
            
            .agent-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 24px;
            }
            
            .agent-option {
                display: flex;
                align-items: center;
                padding: 16px;
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                transition: all 0.2s;
                cursor: pointer;
            }
            
            .agent-option:hover {
                border-color: #4299e1;
                background: #f7fafc;
            }
            
            .agent-icon {
                font-size: 24px;
                margin-right: 16px;
            }
            
            .agent-info {
                flex: 1;
            }
            
            .agent-info h4 {
                margin: 0 0 4px 0;
                color: #2d3748;
            }
            
            .agent-info p {
                margin: 0 0 8px 0;
                color: #718096;
                font-size: 14px;
            }
            
            .agent-tools {
                font-size: 12px;
                color: #a0aec0;
            }
            
            .tool-tag {
                display: inline-block;
                background: #edf2f7;
                padding: 2px 6px;
                border-radius: 4px;
                margin-right: 4px;
            }
            
            .btn-select-agent {
                background: #4299e1;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
            }
            
            .selection-actions {
                text-align: center;
            }
            
            .btn-cancel-selection {
                background: #e2e8f0;
                color: #4a5568;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
            }
            
            /* 🎯 研究特定样式 */
            .research-info-section {
                border-bottom: 1px solid #f1f5f9;
                padding: 0 20px 16px;
            }
            
            .research-metadata {
                display: grid;
                gap: 8px;
            }
            
            .metadata-item {
                display: flex;
                justify-content: space-between;
            }
            
            .metadata-item .label {
                font-weight: 600;
                color: #4a5568;
            }
            
            .metadata-item .value {
                color: #718096;
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);

        this.stylesInjected = true;
        console.log('[AgentThinkingDisplay] 动态样式注入完成（多Agent支持）');
    }
}