import { EnhancedSkillManager } from './EnhancedSkillManager.js';
import { WorkflowEngine } from './WorkflowEngine.js';
import { WorkflowUI } from './WorkflowUI.js';

export class Orchestrator {
  constructor(chatApiHandler, config = {}) {
    this.chatApiHandler = chatApiHandler;
    this.config = config;
    
    this.skillManager = new EnhancedSkillManager();
    this.workflowEngine = new WorkflowEngine(this.skillManager);
    this.workflowUI = new WorkflowUI(config.containerId);
    
    this.isEnabled = config.enabled !== false;
    this.currentWorkflow = null;
    this.currentContext = null;
    this.workflowResolve = null;
    
    this.setupEventListeners();
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
        onStepUpdate: this.handleStepUpdate.bind(this)
      });
      
      if (!this.currentWorkflow) {
        return await this.fallbackToStandard(userMessage, files, context);
      }
      
      this.workflowUI.showWorkflow(this.currentWorkflow);
      
      return new Promise((resolve) => {
        this.workflowResolve = resolve;
      });
      
    } catch (error) {
      console.error('工作流创建失败:', error);
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
      const result = await this.callTool(skill.toolName, skill.parameters, context);
      
      this.skillManager.recordToolExecution(
        skill.toolName,
        skill.parameters,
        true,
        { ...result, executionTime: Date.now() - startTime }
      );
      
      return this.formatToolResult(result, skill);
      
    } catch (error) {
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
      const workflowResult = await this.workflowEngine.executeWorkflow(this.currentWorkflow, {
        apiHandler: this.chatApiHandler,  // 传递正确的API处理器
        apiKey: this.currentContext?.apiKey,
        model: this.currentContext?.model,
        onStepUpdate: this.handleStepUpdate.bind(this)
      });
      
      this.workflowUI.showCompletion(workflowResult);
      
      if (this.workflowResolve) {
        this.workflowResolve(this.formatWorkflowResult(workflowResult));
      }
      
    } catch (error) {
      console.error('工作流执行失败:', error);
      
      if (this.workflowResolve) {
        this.workflowResolve(this.formatErrorResult(error));
      }
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

  handleStepUpdate(stepIndex, status, step, result = null) {
    this.workflowUI.updateStep(stepIndex, status, result);
  }

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
      } : null
    };
  }

  getToolStatistics() {
    return this.skillManager.getToolAnalytics();
  }

  // 清理资源
  destroy() {
    this.currentWorkflow = null;
    this.currentContext = null;
    this.workflowResolve = null;
    
    // 移除事件监听器
    document.removeEventListener('workflow:workflow-start', this.startWorkflowExecution);
    document.removeEventListener('workflow:workflow-skip', this.skipWorkflow);
    document.removeEventListener('workflow:workflow-cancel', this.skipWorkflow);
  }
}