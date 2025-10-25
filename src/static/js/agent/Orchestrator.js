// src/static/js/agent/Orchestrator.js

import { CallbackManager } from './CallbackManager.js';
import { EnhancedSkillManager } from './EnhancedSkillManager.js';
import { AnalyticsHandler } from './handlers/AnalyticsHandler.js';
import { LearningHandler } from './handlers/LearningHandler.js';
import { LoggingHandler } from './handlers/LoggingHandler.js';
import { WorkflowUIHandler } from './handlers/WorkflowUIHandler.js';
import { WorkflowEngine } from './WorkflowEngine.js';
import { WorkflowUI } from './WorkflowUI.js';

export class Orchestrator {
  constructor(chatApiHandler, config = {}) {
    this.chatApiHandler = chatApiHandler;
    this.config = config;
    
    // 🎯 初始化结构化回调管理器
    this.callbackManager = new CallbackManager();
    
    this.skillManager = new EnhancedSkillManager();
    this.workflowEngine = new WorkflowEngine(this.skillManager, this.callbackManager);
    this.workflowUI = new WorkflowUI(config.containerId);
    
    // 🎯 注册处理器
    this.setupHandlers();
    
    this.isEnabled = config.enabled !== false;
    this.currentWorkflow = null;
    this.workflowResolve = null;
    this.currentContext = null;
    
    this.setupEventListeners();
  }

  setupHandlers() {
    // UI处理器
    const uiHandler = new WorkflowUIHandler(this.workflowUI);
    this.callbackManager.addHandler(uiHandler);
    
    // 学习处理器
    const learningHandler = new LearningHandler(this.skillManager);
    this.callbackManager.addHandler(learningHandler);
    
    // 日志处理器
    const loggingHandler = new LoggingHandler();
    this.callbackManager.addHandler(loggingHandler);
    
    // 🎯 新增分析处理器
    const analyticsHandler = new AnalyticsHandler();
    this.callbackManager.addHandler(analyticsHandler);
    
    console.log('🎯 结构化事件处理器已注册:', 
      this.callbackManager.handlers.map(h => h.name)
    );
  }

  async handleUserRequest(userMessage, files = [], context = {}) {
    // 保存当前上下文
    this.currentContext = context;
    
    if (!this.isEnabled) {
      return await this.fallbackToStandard(userMessage, files, context);
    }

    const taskAnalysis = this.workflowEngine.analyzeTask(userMessage);
    
    if (taskAnalysis.complexity === 'high' || taskAnalysis.workflowType) {
      return await this.handleWithWorkflow(userMessage, taskAnalysis, files, context);
    } else {
      return await this.handleWithEnhancedSingleStep(userMessage, files, context);
    }
  }

  async handleWithWorkflow(userMessage, taskAnalysis, files, context) {
    try {
      this.currentWorkflow = await this.workflowEngine.createWorkflow(userMessage, {
        ...context,
        files,
        callbackManager: this.callbackManager
      });
      
      if (!this.currentWorkflow) {
        return await this.fallbackToStandard(userMessage, files, context);
      }
      
      // 🎯 通过事件系统显示工作流（UI处理器会处理）
      await this.callbackManager.onWorkflowStart(this.currentWorkflow);
      
      return new Promise((resolve) => {
        this.workflowResolve = resolve;
      });
      
    } catch (error) {
      console.error('工作流创建失败:', error);
      await this.callbackManager.onError(error, null, {
        source: 'workflow_creation',
        userMessage
      });
      return await this.fallbackToStandard(userMessage, files, context);
    }
  }

  async handleWithEnhancedSingleStep(userMessage, files, context) {
    const optimalSkill = await this.skillManager.findOptimalSkill(userMessage, context);
    
    if (optimalSkill) {
      return await this.executeToolWithOptimization(optimalSkill, userMessage, context);
    } else {
      return await this.fallbackToStandard(userMessage, files, context);
    }
  }

  async executeToolWithOptimization(skill, userMessage, context) {
    const startTime = Date.now();
    
    try {
      // 🎯 通知工具开始执行
      await this.callbackManager.onToolStart(skill.toolName, skill.parameters, 0);
      
      const result = await this.callTool(skill.toolName, skill.parameters, context);
      
      const executionTime = Date.now() - startTime;
      
      // 🎯 通知工具执行完成
      await this.callbackManager.onToolEnd(skill.toolName, result.output, 0, {
        ...result,
        executionTime
      });
      
      // 🎯 通知学习更新
      await this.callbackManager.onLearningUpdate(skill.toolName, true, executionTime);
      
      this.skillManager.recordToolExecution(
        skill.toolName,
        skill.parameters,
        true,
        { ...result, executionTime }
      );
      
      return this.formatToolResult(result, skill);
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      // 🎯 通知错误
      await this.callbackManager.onError(error, 0, {
        toolName: skill.toolName,
        parameters: skill.parameters,
        source: 'tool_execution'
      });
      
      // 🎯 通知学习更新（失败情况）
      await this.callbackManager.onLearningUpdate(skill.toolName, false, executionTime);
      
      this.skillManager.recordToolExecution(
        skill.toolName,
        skill.parameters, 
        false,
        null,
        error
      );
      
      throw error;
    }
  }

  async startWorkflowExecution() {
    if (!this.currentWorkflow) return;
    
    try {
      // 🎯 通过结构化事件系统通知工作流开始
      await this.callbackManager.onWorkflowStart(this.currentWorkflow);
      
      const workflowResult = await this.workflowEngine.executeWorkflow(this.currentWorkflow, {
        apiHandler: this.chatApiHandler,
        apiKey: this.currentContext?.apiKey,
        model: this.currentContext?.model,
        callbackManager: this.callbackManager
      });
      
      // 🎯 通过结构化事件系统通知工作流结束
      await this.callbackManager.onWorkflowEnd(this.currentWorkflow, workflowResult);
      
      if (this.workflowResolve) {
        this.workflowResolve(this.formatWorkflowResult(workflowResult));
      }
      
    } catch (error) {
      // 🎯 通过结构化事件系统通知错误
      await this.callbackManager.onError(error, null, {
        workflow: this.currentWorkflow,
        context: this.currentContext,
        source: 'orchestrator'
      });
      
      if (this.workflowResolve) {
        this.workflowResolve(this.formatErrorResult(error));
      }
    } finally {
      // 🎯 清理当前运行状态
      this.callbackManager.clearCurrentRun();
    }
  }

  skipWorkflow() {
    this.workflowUI.hide();
    
    if (this.workflowResolve) {
      this.workflowResolve({ 
        skipped: true,
        enhanced: true,
        type: 'workflow_skipped'
      });
    }
  }

  // 🎯 移除原有的handleStepUpdate方法，由事件系统处理

  async fallbackToStandard(userMessage, files, context) {
    return { 
      type: 'standard_fallback',
      message: '使用标准处理',
      enhanced: false
    };
  }

  // 真实的工具调用适配器
  async callTool(toolName, parameters, context = {}) {
    try {
      console.log(`调用工具: ${toolName}`, parameters);
      
      // 使用真实的chatApiHandler调用工具
      if (!this.chatApiHandler || typeof this.chatApiHandler.callTool !== 'function') {
        throw new Error('API处理器不可用或缺少callTool方法');
      }
      
      const result = await this.chatApiHandler.callTool(toolName, parameters);
      
      // 确保返回标准格式
      return {
        success: true,
        output: result.output || result.content || result.data || '工具执行成功',
        rawResult: result
      };
      
    } catch (error) {
      console.error(`工具调用失败 ${toolName}:`, error);
      
      return {
        success: false,
        error: error.message,
        output: `工具 ${toolName} 执行失败: ${error.message}`
      };
    }
  }

  formatToolResult(result, skill) {
    return {
      type: 'tool_result',
      success: result.success,
      content: result.output,
      tool: skill.toolName,
      enhanced: true,
      executionTime: result.executionTime
    };
  }

  formatWorkflowResult(workflowResult) {
    return {
      type: 'workflow_result',
      success: workflowResult.success,
      content: this.extractWorkflowOutput(workflowResult),
      workflow: workflowResult.workflowName,
      steps: workflowResult.steps.length,
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
    const successfulSteps = workflowResult.steps.filter(step => step.success);
    if (successfulSteps.length === 0) return '工作流执行失败';
    
    // 构建详细的工作流输出
    let output = `# ${workflowResult.workflowName} 执行完成\n\n`;
    
    // 添加步骤摘要
    output += `## 执行摘要\n`;
    output += `- 总步骤: ${workflowResult.summary.totalSteps}\n`;
    output += `- 成功步骤: ${workflowResult.summary.successfulSteps}\n`;
    output += `- 总耗时: ${(workflowResult.summary.totalExecutionTime / 1000).toFixed(2)}秒\n\n`;
    
    // 添加每个步骤的结果
    output += `## 详细步骤\n`;
    workflowResult.steps.forEach((step, index) => {
      output += `### 步骤 ${index + 1}: ${step.step}\n`;
      output += `- 状态: ${step.success ? '✅ 成功' : '❌ 失败'}\n`;
      output += `- 耗时: ${(step.executionTime / 1000).toFixed(2)}秒\n`;
      
      if (step.success && step.output) {
        output += `- 输出: ${typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}\n`;
      } else if (step.error) {
        output += `- 错误: ${step.error}\n`;
      }
      
      output += '\n';
    });
    
    // 提取最后一个成功步骤的输出作为主要结果
    const lastSuccessfulStep = successfulSteps[successfulSteps.length - 1];
    if (lastSuccessfulStep && lastSuccessfulStep.output) {
      output += `## 最终结果\n${lastSuccessfulStep.output}`;
    }
    
    return output;
  }

  setupEventListeners() {
    // 监听工作流开始事件
    document.addEventListener('workflow:workflow-start', () => {
      this.startWorkflowExecution();
    });
    
    // 监听工作流跳过事件
    document.addEventListener('workflow:workflow-skip', () => {
      this.skipWorkflow();
    });
    
    // 监听工作流取消事件
    document.addEventListener('workflow:workflow-cancel', () => {
      this.skipWorkflow();
    });
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
    console.log(`智能代理模式 ${enabled ? '已启用' : '已禁用'}`);
  }

  getStatus() {
    return {
      enabled: this.isEnabled,
      skillManager: this.skillManager.getToolAnalytics(),
      currentWorkflow: this.currentWorkflow ? {
        id: this.currentWorkflow.id,
        name: this.currentWorkflow.name,
        steps: this.currentWorkflow.steps.length
      } : null,
      currentContext: this.currentContext ? {
        hasApiKey: !!this.currentContext.apiKey,
        model: this.currentContext.model
      } : null,
      // 🎯 新增事件系统状态
      eventSystem: {
        handlers: this.callbackManager.handlers.map(h => h.name),
        currentRunId: this.callbackManager.currentRunId,
        totalEvents: this.callbackManager.eventHistory.length
      }
    };
  }

  getToolStatistics() {
    return this.skillManager.getToolAnalytics();
  }

  // 🎯 增强的调试方法
  getCurrentRunStats() {
    return this.callbackManager.getRunStatistics();
  }

  getAllEventHistory() {
    return this.callbackManager.getEventHistory();
  }

  exportEventLogs() {
    const logsHandler = this.callbackManager.handlers.find(h => h.name === 'LoggingHandler');
    return logsHandler ? logsHandler.exportLogs() : null;
  }

  getAnalyticsMetrics() {
    const analyticsHandler = this.callbackManager.handlers.find(h => h.name === 'AnalyticsHandler');
    return analyticsHandler ? analyticsHandler.getMetrics() : null;
  }

  // 🎯 新增：获取结构化事件流
  getEventStream() {
    return this.callbackManager.eventHistory;
  }

  // 🎯 新增：清空事件历史
  clearEventHistory() {
    this.callbackManager.eventHistory = [];
    const logsHandler = this.callbackManager.handlers.find(h => h.name === 'LoggingHandler');
    if (logsHandler) {
      logsHandler.logBuffer = [];
    }
  }

  // 清理资源
  destroy() {
    this.currentWorkflow = null;
    this.currentContext = null;
    this.workflowResolve = null;
    
    // 🎯 清理事件系统
    this.callbackManager.clearCurrentRun();
    this.callbackManager.handlers = [];
    
    // 移除事件监听器
    document.removeEventListener('workflow:workflow-start', this.startWorkflowExecution);
    document.removeEventListener('workflow:workflow-skip', this.skipWorkflow);
    document.removeEventListener('workflow:workflow-cancel', this.skipWorkflow);
  }
}