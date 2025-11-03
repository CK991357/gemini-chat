export class WorkflowUI {
  constructor(containerId = 'workflow-container') {
    this.container = document.getElementById(containerId) || this.createContainer();
    this.currentWorkflow = null;
    this._isWorkflowActive = false; // ✨ 添加内部状态跟踪
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
    
    this.attachEventListeners();
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

  // ✨ 新增：显示取消确认对话框
  showCancelConfirmation() {
    return confirm('确定要取消当前工作流执行吗？');
  }

  // ✨ 新增：显示取消状态
  showCancelledState() {
    if (!this._isWorkflowActive) return;
    
    const panel = this.container.querySelector('.workflow-panel');
    panel.classList.add('workflow-cancelled');
    
    const cancelledHTML = `
      <div class="workflow-cancelled">
        <div class="cancelled-header">
          <span class="cancelled-icon">⏹️</span>
          <h4>工作流已取消</h4>
        </div>
        
        <div class="cancelled-message">
          <p>工作流执行已被用户取消</p>
        </div>
        
        <div class="cancelled-actions">
          <button class="btn-close-workflow">关闭面板</button>
        </div>
      </div>
    `;
    
    // 隐藏控制按钮
    const controls = this.container.querySelector('.workflow-controls');
    if (controls) controls.style.display = 'none';
    
    // 添加取消状态显示
    panel.querySelector('.workflow-steps').insertAdjacentHTML('afterend', cancelledHTML);
    this.attachCompletionEvents();
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

  attachEventListeners() {
    // 开始执行按钮
    this.container.querySelector('.btn-start-workflow')?.addEventListener('click', () => {
      // ✨ 点击开始后，显示取消按钮，隐藏开始和跳过按钮
      this.container.querySelector('.btn-start-workflow').style.display = 'none';
      this.container.querySelector('.btn-skip-workflow').style.display = 'none';
      this.container.querySelector('.btn-cancel-workflow').style.display = 'inline-block';
      this.emitEvent('workflow-start');
    });
    
    // 跳过按钮
    this.container.querySelector('.btn-skip-workflow')?.addEventListener('click', () => {
      this.hide();
      this.emitEvent('workflow-skip');
    });

    // ✨ 为取消按钮添加事件监听
    this.container.querySelector('.btn-cancel-workflow')?.addEventListener('click', () => {
      if (this.showCancelConfirmation()) {
        this.hide();
        this.emitEvent('workflow-cancel');
      }
    });
  }

  attachCompletionEvents() {
    this.container.querySelector('.btn-close-workflow')?.addEventListener('click', () => {
      this.hide();
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