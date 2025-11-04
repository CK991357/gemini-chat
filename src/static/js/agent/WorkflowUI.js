export class WorkflowUI {
  constructor(containerId = 'workflow-container') {
    this.container = document.getElementById(containerId) || this.createContainer();
    this.currentWorkflow = null;
    this._isWorkflowActive = false; // ✨ 添加内部状态跟踪
    this._bindEventListeners(); // ✨ 绑定一次性事件监听器
  }

  // ✨ 新增：检查工作流是否激活的方法
  isWorkflowActive() {
    return this._isWorkflowActive;
  }

  showWorkflow(workflow) {
    this._isWorkflowActive = true; // ✨ 显示时激活状态
    this.currentWorkflow = workflow;
    
    this.container.innerHTML = `
      <div class="workflow-panel">
        <div class="workflow-header">
          <div class="workflow-title">
            <span class="workflow-icon">🎯</span>
            <h3>${workflow.name}</h3>
            <span class="workflow-badge">工作流</span>
          </div>
          <div class="workflow-meta">
            <span class="workflow-steps">${workflow.steps.length} 个步骤</span>
            <span class="workflow-status planning">规划中</span>
          </div>
        </div>
        
        <div class="workflow-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
          </div>
          <div class="progress-text">准备开始执行...</div>
        </div>
        
        <div class="workflow-steps">
          ${this.renderSteps(workflow.steps)}
        </div>
        
        <div class="workflow-controls">
          <button class="btn-start-workflow primary">开始执行</button>
          <button class="btn-skip-workflow secondary">跳过，直接聊天</button>
          <!-- ✨ 新增取消按钮，初始隐藏 -->
          <button class="btn-cancel-workflow danger" style="display: none;">取消执行</button>
        </div>
      </div>
    `;
    
    // this.attachEventListeners(); // ✨ 移除，事件监听器已在构造函数中绑定
    this.show();
  }

  updateStep(stepIndex, status, result = null) {
    // ✨ 添加防御性检查
    if (!this._isWorkflowActive) return;
    
    const stepElement = this.container.querySelector(`[data-step-index="${stepIndex}"]`);
    if (!stepElement) return;

    stepElement.className = `workflow-step workflow-step-${status}`;
    
    const statusElement = stepElement.querySelector('.step-status');
    statusElement.textContent = this.getStatusText(status);
    statusElement.className = `step-status step-status-${status}`;
    
    if (result) this.updateStepOutput(stepElement, result);
    this.updateProgress();
  }

  showCompletion(workflowResult) {
    // ✨ 添加防御性检查
    if (!this._isWorkflowActive) return;
    
    const panel = this.container.querySelector('.workflow-panel');
    panel.classList.add('workflow-completed');
    
    const completionHTML = `
      <div class="workflow-completion">
        <div class="completion-header">
          <span class="completion-icon">🎉</span>
          <h4>工作流执行完成</h4>
        </div>
        
        <div class="completion-stats">
          <div class="stat">
            <span class="stat-value">${workflowResult.summary.successfulSteps}/${workflowResult.summary.totalSteps}</span>
            <span class="stat-label">步骤完成</span>
          </div>
          <div class="stat">
            <span class="stat-value">${Math.round(workflowResult.summary.successRate * 100)}%</span>
            <span class="stat-label">成功率</span>
          </div>
        </div>
        
        <div class="completion-actions">
          <button class="btn-close-workflow">关闭面板</button>
        </div>
      </div>
    `;
    
    panel.querySelector('.workflow-steps').insertAdjacentHTML('afterend', completionHTML);
    this.attachCompletionEvents();
  }

  /**
 * 🎯 增强取消确认对话框（响应式设计）
 */
showCancelConfirmation(currentProgress = { completed: 0, total: 0 }) {
    return new Promise((resolve) => {
        // 🎯 响应式消息设计
        const isMobile = window.innerWidth < 768;
        const messages = {
            full: [
                `确定要取消当前工作流执行吗？`,
                ``,
                `📊 进度: ${currentProgress.completed}/${currentProgress.total} 步骤`,
                `✅ 已完成步骤会保留`,
                `🔍 可查看部分结果`,
                `🔄 支持稍后继续`
            ],
            compact: [
                `取消工作流执行？`,
                `进度: ${currentProgress.completed}/${currentProgress.total}`,
                `已完成步骤将保留`
            ]
        };
        
        const message = (isMobile ? messages.compact : messages.full).join('\n');
        const confirmed = confirm(message);
        resolve(confirmed);
    });
}

/**
 * 🎯 安全显示取消摘要页面
 */
showCancellationSummary(cancelData) {
    const { completedSteps, partialResults, progress, cancelledAtStep } = cancelData;
    
    // 🎯 创建安全的DOM结构
    const summaryElement = document.createElement('div');
    summaryElement.className = 'cancellation-summary';
    
    // 🎯 构建头部
    const header = document.createElement('div');
    header.className = 'summary-header';
    header.innerHTML = '<span class="icon">⏹️</span><h4>工作流已取消</h4>';
    
    // 🎯 构建进度信息
    const progressEl = document.createElement('div');
    progressEl.className = 'summary-progress';
    progressEl.textContent = `取消时进度: ${progress}`;
    
    summaryElement.appendChild(header);
    summaryElement.appendChild(progressEl);
    
    // 🎯 安全构建已完成步骤列表
    if (completedSteps.length > 0) {
        const stepsSection = document.createElement('div');
        stepsSection.className = 'completed-steps';
        
        const stepsTitle = document.createElement('strong');
        stepsTitle.textContent = `已完成步骤 (${completedSteps.length}个):`;
        
        const stepsList = document.createElement('ul');
        completedSteps.forEach(step => {
            const item = document.createElement('li');
            item.textContent = `✅ ${this.escapeHtml(step.step)} - ${step.executionTime}ms`;
            stepsList.appendChild(item);
        });
        
        stepsSection.appendChild(stepsTitle);
        stepsSection.appendChild(stepsList);
        summaryElement.appendChild(stepsSection);
    }
    
    // 🎯 安全构建部分结果预览
    if (partialResults && partialResults.length > 0) {
        const resultsSection = document.createElement('div');
        resultsSection.className = 'partial-results';
        
        const resultsTitle = document.createElement('strong');
        resultsTitle.textContent = '部分结果:';
        
        const resultsContainer = document.createElement('div');
        resultsContainer.className = 'results-preview';
        
        partialResults.forEach(result => {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = this.escapeHtml(result.stepName);
            
            const pre = document.createElement('pre');
            pre.textContent = typeof result.output === 'string'
                ? result.output
                : JSON.stringify(result.output, null, 2);
            
            details.appendChild(summary);
            details.appendChild(pre);
            resultsContainer.appendChild(details);
        });
        
        resultsSection.appendChild(resultsTitle);
        resultsSection.appendChild(resultsContainer);
        summaryElement.appendChild(resultsSection);
    }
    
    // 🎯 构建操作按钮
    const actionsSection = document.createElement('div');
    actionsSection.className = 'cancellation-actions';
    
    const viewDetailsBtn = document.createElement('button');
    viewDetailsBtn.className = 'btn-view-details';
    viewDetailsBtn.textContent = '查看详细报告';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-close';
    closeBtn.textContent = '关闭面板';
    
    actionsSection.appendChild(viewDetailsBtn);
    actionsSection.appendChild(closeBtn);
    summaryElement.appendChild(actionsSection);
    
    // 🎯 插入到UI中
    const stepsContainer = this.container.querySelector('.workflow-steps');
    if (stepsContainer) {
        stepsContainer.insertAdjacentElement('afterend', summaryElement);
    }
    
    // 🎯 隐藏控制按钮
    const controls = this.container.querySelector('.workflow-controls');
    if (controls) {
        controls.style.display = 'none';
    }
}

  // 私有方法
  renderSteps(steps) {
    return steps.map((step, index) => `
      <div class="workflow-step workflow-step-pending" data-step-index="${index}">
        <div class="step-header">
          <span class="step-number">${index + 1}</span>
          <span class="step-name">${step.name}</span>
          <span class="step-status step-status-pending">等待中</span>
        </div>
        <div class="step-details">
          <div class="step-tool">🔧 ${step.toolName}</div>
          <div class="step-output"></div>
        </div>
      </div>
    `).join('');
  }

  getStatusText(status) {
    const statusMap = { 
      pending: '等待中', 
      running: '执行中', 
      success: '完成', 
      failed: '失败',
      cancelled: '已取消' // ✨ 新增取消状态
    };
    return statusMap[status] || status;
  }

  updateStepOutput(stepElement, result) {
    const outputElement = stepElement.querySelector('.step-output');
    if (result.success) {
      outputElement.innerHTML = `<div class="output-success">✓ 执行成功</div>`;
    } else if (result.cancelled) {
      outputElement.innerHTML = `<div class="output-cancelled">⏹️ 执行被取消</div>`;
    } else {
      outputElement.innerHTML = `<div class="output-error">✗ ${result.error}</div>`;
    }
  }

  updateProgress() {
    // ✨ 添加防御性检查
    if (!this._isWorkflowActive) return;
    
    const steps = this.container.querySelectorAll('.workflow-step');
    const completed = Array.from(steps).filter(step => 
      step.classList.contains('workflow-step-success')
    ).length;
    
    const total = steps.length;
    const percentage = (completed / total) * 100;
    
    const progressFill = this.container.querySelector('.progress-fill');
    const progressText = this.container.querySelector('.progress-text');
    
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `${completed}/${total} 步骤完成`;
  }

  createContainer() {
    const container = document.createElement('div');
    container.id = 'workflow-container';
    container.className = 'workflow-container';
    
    const chatContainer = document.querySelector('.chat-container') || document.body;
    chatContainer.parentNode.insertBefore(container, chatContainer);
    
    return container;
  }

  /**
 * 🎯 HTML转义辅助方法
 */
escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * 🎯 初始化事件监听器（一次性绑定）
 */
_bindEventListeners() {
    // 🎯 使用事件委托，避免重复绑定
    this.container.addEventListener('click', (e) => {
        // 开始执行按钮处理
        if (e.target.closest('.btn-start-workflow')) {
            // ✨ 点击开始后，显示取消按钮，隐藏开始和跳过按钮
            this.container.querySelector('.btn-start-workflow').style.display = 'none';
            this.container.querySelector('.btn-skip-workflow').style.display = 'none';
            this.container.querySelector('.btn-cancel-workflow').style.display = 'inline-block';
            this.emitEvent('workflow-start');
        }
        // 跳过按钮处理
        else if (e.target.closest('.btn-skip-workflow')) {
            this.hide();
            this.emitEvent('workflow-skip');
        }
        // 取消按钮处理
        else if (e.target.closest('.btn-cancel-workflow')) {
            // 🎯 触发取消事件，由外部处理确认逻辑
            this.emitEvent('workflow-cancel-request');
        }
        // 查看详情按钮处理
        else if (e.target.closest('.btn-view-details')) {
            this.emitEvent('workflow-cancellation-details', {
                timestamp: new Date().toISOString()
            });
        }
        // 关闭按钮处理 (包括完成和取消后的关闭)
        else if (e.target.closest('.btn-close') || e.target.closest('.btn-close-workflow')) {
            this.hide();
        }
    });
}

  emitEvent(eventName, detail = null) {
    const event = new CustomEvent(`workflow:${eventName}`, { detail });
    window.dispatchEvent(event);
  }

  show() {
    this.container.style.display = 'block';
  }

  hide() {
    this._isWorkflowActive = false; // ✨ 隐藏时取消激活状态
    this.container.style.display = 'none';
  }

  // ✨ 新增：获取当前工作流信息
  getCurrentWorkflow() {
    return this.currentWorkflow;
  }

  // ✨ 新增：重置UI状态
  reset() {
    this._isWorkflowActive = false;
    this.currentWorkflow = null;
    this.container.innerHTML = '';
  }
}

/**
 * 🎯 独立的显示工作流函数（用于全局调用）
 */
export function showWorkflowUI(workflow) {
    // 🎯 修复1：创建或获取全局 WorkflowUI 实例
    if (!window.globalWorkflowUI) {
        window.globalWorkflowUI = new WorkflowUI();
    }
    
    // 🎯 修复2：检查工作流有效性
    if (!workflow || !workflow.steps || workflow.steps.length === 0) {
        console.error('[WorkflowUI] 无效的工作流数据');
        return null;
    }
    
    try {
        return window.globalWorkflowUI.showWorkflow(workflow);
    } catch (error) {
        console.error('[WorkflowUI] 显示工作流失败:', error);
        return null;
    }
}

/**
 * 🎯 获取全局工作流UI实例
 */
export function getWorkflowUI() {
    // 🎯 修复3：安全的实例获取
    if (!window.globalWorkflowUI) {
        window.globalWorkflowUI = new WorkflowUI();
    }
    return window.globalWorkflowUI;
}

/**
 * 🎯 新增：销毁全局工作流UI实例
 */
export function disposeWorkflowUI() {
    if (window.globalWorkflowUI) {
        try {
            window.globalWorkflowUI.hide();
            window.globalWorkflowUI.reset();
            window.globalWorkflowUI = null;
            console.log('[WorkflowUI] 全局实例已销毁');
        } catch (error) {
            console.error('[WorkflowUI] 销毁实例失败:', error);
        }
    }
}

/**
 * 🎯 新增：检查工作流UI状态
 */
export function isWorkflowUIAvailable() {
    return !!(window.globalWorkflowUI &&
              window.globalWorkflowUI.isWorkflowActive &&
              typeof window.globalWorkflowUI.isWorkflowActive === 'function');
}