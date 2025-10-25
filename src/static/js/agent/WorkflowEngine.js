import { WORKFLOW_TEMPLATES } from './WorkflowTemplates.js';

export class WorkflowEngine {
  constructor(enhancedSkillManager) {
    this.skillManager = enhancedSkillManager;
    this.templates = WORKFLOW_TEMPLATES;
  }

  analyzeTask(userQuery) {
    const query = userQuery.toLowerCase();
    const indicators = [
      query.includes('然后') || query.includes('接着') || query.includes('下一步'),
      query.includes('分析') && query.includes('报告'),
      query.includes('爬取') && query.includes('总结'),
      (query.match(/\b(和|与|及)\b/g) || []).length >= 2,
      query.length > 100
    ];
    
    const complexityScore = indicators.filter(Boolean).length;
    return {
      complexity: complexityScore >= 3 ? 'high' : complexityScore >= 1 ? 'medium' : 'low',
      workflowType: this.detectWorkflowType(query),
      estimatedSteps: complexityScore >= 3 ? 4 : complexityScore >= 1 ? 3 : 2
    };
  }

  async createWorkflow(userQuery, context = {}) {
    const analysis = this.analyzeTask(userQuery);
    
    if (analysis.workflowType && this.templates[analysis.workflowType]) {
      return this.instantiateTemplate(analysis.workflowType, userQuery, context);
    } else if (analysis.complexity === 'high') {
      return await this.createDynamicWorkflow(userQuery, analysis, context);
    }
    
    return null;
  }

  async executeWorkflow(workflow, context) {
    const results = [];
    const stepOutputs = {};
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      
      try {
        context.onStepUpdate?.(i, 'running', step);
        const result = await this.executeStep(step, { ...context, stepOutputs, stepIndex: i });
        results.push(result);
        stepOutputs[`step${i}`] = result;
        
        this.skillManager.recordToolExecution(step.toolName, step.parameters, result.success, result);
        context.onStepUpdate?.(i, 'success', step, result);
        
        if (!result.success && step.critical) break;
      } catch (error) {
        const errorResult = { success: false, error: error.message, step: step.name };
        results.push(errorResult);
        context.onStepUpdate?.(i, 'failed', step, errorResult);
        this.skillManager.recordToolExecution(step.toolName, step.parameters, false, null, error);
        if (step.critical) break;
      }
    }
    
    return this.compileWorkflowResult(workflow, results);
  }

  // 私有方法
  detectWorkflowType(query) {
    if (query.includes('爬取') && query.includes('分析')) return 'web_analysis';
    if (query.includes('数据') && query.includes('可视化')) return 'data_visualization';
    if (query.includes('搜索') && query.includes('总结')) return 'research_report';
    return null;
  }

  instantiateTemplate(templateType, userQuery, context) {
    const template = JSON.parse(JSON.stringify(this.templates[templateType]));
    template.id = `wf_${Date.now()}`;
    template.originalQuery = userQuery;
    
    template.steps.forEach(step => {
      if (step.parameters) step.parameters = this.hydrateParameters(step.parameters, userQuery);
      if (step.prompt) step.prompt = step.prompt.replace('{user_query}', userQuery);
    });
    
    return template;
  }

  async createDynamicWorkflow(userQuery, analysis, context) {
    const steps = [
      {
        name: '信息收集',
        toolName: 'tavily_search',
        parameters: { query: userQuery },
        critical: true
      },
      {
        name: '分析处理',
        toolName: 'standard_ai',
        prompt: `请基于收集的信息回答: ${userQuery}`,
        critical: true
      }
    ];
    
    return {
      id: `wf_dynamic_${Date.now()}`,
      name: `动态工作流`,
      type: 'dynamic',
      steps,
      analysis
    };
  }

  async executeStep(step, context) {
    const startTime = Date.now();
    
    try {
      let result;
      if (step.toolName === 'standard_ai') {
        result = await this.executeAIStep(step, context);
      } else {
        // 使用上下文中的API处理器调用真实工具
        result = await context.apiHandler.callTool(step.toolName, step.parameters);
      }
      
      return {
        ...result,
        step: step.name,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        step: step.name,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  async executeAIStep(step, context) {
    try {
      // 使用现有的chatApiHandler来处理AI步骤
      if (!context.apiHandler) {
        throw new Error('API处理器未提供');
      }

      const apiKey = context.apiKey;
      if (!apiKey) {
        throw new Error('API密钥未提供');
      }

      // 构建消息历史
      const messages = [
        { role: 'system', content: '你是一个智能代理工作流中的执行步骤。请根据提供的上下文完成特定任务，提供准确、有用的回答。' },
        { role: 'user', content: step.prompt }
      ];

      // 如果有前一步骤的输出，添加到上下文
      if (context.stepOutputs) {
        const previousSteps = Object.keys(context.stepOutputs)
          .filter(key => key.startsWith('step'))
          .sort();
        
        if (previousSteps.length > 0) {
          const lastStepKey = previousSteps[previousSteps.length - 1];
          const previousOutput = context.stepOutputs[lastStepKey];
          if (previousOutput && previousOutput.success && previousOutput.output) {
            messages.push({
              role: 'system',
              content: `前一步骤的输出: ${JSON.stringify(previousOutput.output, null, 2)}`
            });
          }
        }
      }

      // 创建请求体 - 使用真实API调用
      const requestBody = {
        model: context.model || 'gemini-2.0-flash-exp',
        messages: messages,
        stream: false, // 工作流步骤使用非流式
        generationConfig: {
          responseModalities: ['text'],
          maxOutputTokens: 2000
        }
      };

      // 使用真实的API调用
      const result = await this.makeAICall(requestBody, apiKey);
      
      return {
        success: true,
        output: result.content || result.text || 'AI处理完成但无输出内容'
      };
      
    } catch (error) {
      console.error('AI步骤执行失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 真实的AI API调用
  async makeAICall(requestBody, apiKey) {
    try {
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API调用失败: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      // 处理不同的响应格式
      if (result.choices && result.choices[0] && result.choices[0].message) {
        return { content: result.choices[0].message.content };
      } else if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        return { content: result.candidates[0].content.parts[0].text };
      } else if (result.text) {
        return { content: result.text };
      } else {
        console.warn('未知的API响应格式:', result);
        return { content: JSON.stringify(result) };
      }
    } catch (error) {
      console.error('AI调用失败:', error);
      throw error;
    }
  }

  compileWorkflowResult(workflow, stepResults) {
    const successfulSteps = stepResults.filter(r => r.success);
    
    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      success: successfulSteps.length > 0,
      steps: stepResults,
      summary: {
        totalSteps: workflow.steps.length,
        successfulSteps: successfulSteps.length,
        totalExecutionTime: stepResults.reduce((sum, r) => sum + (r.executionTime || 0), 0)
      }
    };
  }

  hydrateParameters(parameters, userQuery) {
    const hydrated = { ...parameters };
    if (hydrated.query && hydrated.query.includes('{user_query}')) {
      hydrated.query = hydrated.query.replace('{user_query}', userQuery);
    }
    return hydrated;
  }
}