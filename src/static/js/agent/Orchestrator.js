// src/static/js/agent/Orchestrator.js

import { CallbackManager } from './CallbackManager.js';
import { EnhancedSkillManager } from './EnhancedSkillManager.js';
import { LoggingHandler } from './handlers/LoggingHandler.js';
import { WorkflowUIHandler } from './handlers/WorkflowUIHandler.js';
import { WorkflowEngine } from './WorkflowEngine.js';
import { WorkflowUI } from './WorkflowUI.js';

export class Orchestrator {
  constructor(chatApiHandler, config = {}) {
    this.chatApiHandler = chatApiHandler;
    this.config = config;
    
    // 🎯 简化：只保留必要的组件
    this.callbackManager = new CallbackManager();
    this.skillManager = new EnhancedSkillManager();
    this.workflowEngine = new WorkflowEngine(this.skillManager, this.callbackManager);
    this.workflowUI = new WorkflowUI(config.containerId);
    
    // 🎯 简化处理器注册
    this.setupHandlers();
    
    this.isEnabled = config.enabled !== false;
    this.currentWorkflow = null;
    this.currentContext = null;
    
    this.setupEventListeners();
  }

  setupHandlers() {
    // 🎯 只保留UI处理器和日志处理器
    const uiHandler = new WorkflowUIHandler(this.workflowUI);
    this.callbackManager.addHandler(uiHandler);
    
    const loggingHandler = new LoggingHandler();
    this.callbackManager.addHandler(loggingHandler);
    
    console.log('🎯 简化事件处理器已注册');
  }

  /**
   * 🎯 核心：智能路由用户请求
   * 重用现有技能系统，只在复杂任务时启动工作流
   */
  async handleUserRequest(userMessage, files = [], context = {}) {
    this.currentContext = context;
    
    // ✨ 如果开关关闭，直接返回标准回退
    if (!this.isEnabled) {
      return { enhanced: false, type: 'standard_fallback' };
    }

    try {
      // 🎯 重用现有的任务分析逻辑
      const taskAnalysis = await this.workflowEngine.analyzeTask(userMessage);
      
      console.log(`[Orchestrator] 任务分析结果:`, taskAnalysis);

      // 🎯 只在明确需要工作流时才启动
      if (taskAnalysis.complexity === 'high' && taskAnalysis.workflowType) {
        console.log(`[Orchestrator] 检测到复杂任务，启动工作流: ${taskAnalysis.workflowType}`);
        return await this.handleWithWorkflow(userMessage, taskAnalysis, files, context);
      } else {
        // 🎯 其他情况都回退到标准模式，重用现有技能系统
        console.log(`[Orchestrator] 简单任务，回退到标准模式`);
        return { enhanced: false, type: 'standard_fallback' };
      }
      
    } catch (error) {
      console.error('Orchestrator任务分析失败:', error);
      // 🎯 出错时也回退到标准模式
      return { enhanced: false, type: 'standard_fallback' };
    }
  }

  /**
   * 🎯 工作流处理 - 只在明确需要时启动
   */
  async handleWithWorkflow(userMessage, taskAnalysis, files, context) {
    try {
      this.currentWorkflow = await this.workflowEngine.createWorkflow(userMessage, {
        ...context,
        files,
        taskAnalysis,
        callbackManager: this.callbackManager
      });
      
      if (!this.currentWorkflow) {
        console.log('[Orchestrator] 工作流创建失败，回退到标准模式');
        return { enhanced: false, type: 'standard_fallback' };
      }
      
      // 🎯 显示工作流UI
      this.workflowUI.showWorkflow(this.currentWorkflow);
      
      // 🎯 返回工作流信号，让主流程等待工作流完成
      return { 
        enhanced: true, 
        type: 'workflow_pending',
        workflow: this.currentWorkflow
      };
      
    } catch (error) {
      console.error('工作流创建失败:', error);
      await this.callbackManager.onError(error, null, {
        source: 'workflow_creation',
        userMessage
      });
      return { enhanced: false, type: 'standard_fallback' };
    }
  }

  /**
   * 🎯 启动工作流执行
   */
  async startWorkflowExecution() {
    if (!this.currentWorkflow) return;
    
    try {
      // 🎯 重用现有的流式工作流引擎
      const workflowStream = this.workflowEngine.stream(this.currentWorkflow, {
        apiHandler: this.chatApiHandler,
        apiKey: this.currentContext?.apiKey,
        model: this.currentContext?.model,
        stepOutputs: {}
      });
      
      let finalResult = null;
      
      for await (const event of workflowStream) {
        // 🎯 转发到事件系统
        await this.callbackManager.invokeEvent(event.event, {
          name: event.name,
          run_id: event.run_id,
          data: event.data,
          metadata: event.metadata
        });
        
        if (event.event === 'on_workflow_end') {
          finalResult = event.data.result;
        }
      }
      
      return this.formatWorkflowResult(finalResult);
      
    } catch (error) {
      console.error('工作流执行失败:', error);
      await this.callbackManager.onError(error, null, {
        workflow: this.currentWorkflow,
        context: this.currentContext,
        source: 'workflow_execution'
      });
      
      return this.formatErrorResult(error);
    }
  }

  /**
   * 🎯 简化结果格式化
   */
  formatWorkflowResult(workflowResult) {
    if (!workflowResult) {
      return {
        type: 'error',
        success: false,
        content: '工作流执行无结果',
        enhanced: true
      };
    }

    return {
      type: 'workflow_result',
      success: workflowResult.success,
      content: this.extractWorkflowOutput(workflowResult),
      workflow: workflowResult.workflowName,
      steps: workflowResult.steps?.length || 0,
      enhanced: true,
      summary: workflowResult.summary
    };
  }

  formatErrorResult(error) {
    return {
      type: 'error', 
      success: false,
      content: `处理失败: ${error.message}`,
      enhanced: true
    };
  }

  extractWorkflowOutput(workflowResult) {
    // 🎯 简化输出提取逻辑
    if (!workflowResult.success) {
      return '工作流执行失败';
    }

    const successfulSteps = workflowResult.steps?.filter(step => step?.success) || [];
    if (successfulSteps.length === 0) return '工作流执行无成功步骤';

    // 使用最后一个成功步骤的输出
    const lastSuccessfulStep = successfulSteps[successfulSteps.length - 1];
    return lastSuccessfulStep.output || '工作流执行完成';
  }

  /**
   * 🎯 跳过工作流
   */
  skipWorkflow() {
    this.workflowUI.hide();
    return { 
      skipped: true,
      enhanced: true,
      type: 'workflow_skipped'
    };
  }

  /**
   * 🎯 设置事件监听器
   */
  setupEventListeners() {
    document.addEventListener('workflow:workflow-start', async () => {
      const result = await this.startWorkflowExecution();
      // 🎯 通过事件系统通知工作流完成
      this.emitWorkflowResult(result);
    });
    
    document.addEventListener('workflow:workflow-skip', () => {
      const result = this.skipWorkflow();
      this.emitWorkflowResult(result);
    });
  }

  /**
   * 🎯 发送工作流结果事件
   */
  emitWorkflowResult(result) {
    const event = new CustomEvent('workflow:result', { detail: result });
    window.dispatchEvent(event);
  }

  /**
   * 🎯 简化状态获取
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      currentWorkflow: this.currentWorkflow ? {
        name: this.currentWorkflow.name,
        steps: this.currentWorkflow.steps.length
      } : null
    };
  }

  /**
   * 🎯 启用/禁用智能代理模式
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`智能代理模式 ${enabled ? '已启用' : '已禁用'}`);
  }

  /**
   * 🎯 获取技能统计信息
   */
  getToolStatistics() {
    return this.skillManager.getToolAnalytics();
  }

  /**
   * 🎯 获取事件历史
   */
  getAllEventHistory() {
    return this.callbackManager.getEventHistory();
  }

  /**
   * 🎯 获取当前工作流执行状态
   */
  getWorkflowExecutionState() {
    if (!this.currentWorkflow) return null;
    
    const currentEvents = this.callbackManager.getCurrentRunEvents();
    
    return {
      workflow: this.currentWorkflow,
      events: currentEvents,
      status: 'running',
      progress: this.calculateProgress(currentEvents)
    };
  }

  /**
   * 🎯 计算执行进度
   */
  calculateProgress(events = []) {
    if (!this.currentWorkflow) return 0;
    
    const stepStarts = events.filter(e => e.event === 'on_step_start').length;
    const stepEnds = events.filter(e => e.event === 'on_step_end').length;
    
    const totalSteps = this.currentWorkflow.steps.length;
    
    if (totalSteps === 0) return 0;
    
    // 进度计算：开始步骤占50%，完成步骤占50%
    const progress = ((stepStarts * 0.5) + (stepEnds * 0.5)) / totalSteps * 100;
    return Math.min(100, Math.max(0, progress));
  }

  /**
   * 🎯 清理资源
   */
  destroy() {
    this.currentWorkflow = null;
    this.currentContext = null;
    this.callbackManager.clearCurrentRun();
    
    // 移除事件监听器
    document.removeEventListener('workflow:workflow-start', this.startWorkflowExecution);
    document.removeEventListener('workflow:workflow-skip', this.skipWorkflow);
  }
}