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
    const statusMap = { pending: '等待中', running: '执行中', success: '完成', failed: '失败' };
    return statusMap[status] || status;
  }

  updateStepOutput(stepElement, result) {
    const outputElement = stepElement.querySelector('.step-output');
    if (result.success) {
      outputElement.innerHTML = `<div class="output-success">✓ 执行成功</div>`;
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
    
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = `${completed}/${total} 步骤完成`;
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
    this.container.querySelector('.btn-start-workflow')?.addEventListener('click', () => {
      this.emitEvent('workflow-start');
    });
    
    this.container.querySelector('.btn-skip-workflow')?.addEventListener('click', () => {
      this.hide();
      this.emitEvent('workflow-skip');
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
}