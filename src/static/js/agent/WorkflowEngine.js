// src/static/js/agent/WorkflowEngine.js

import { WORKFLOW_TEMPLATES } from './WorkflowTemplates.js';

export class WorkflowEngine {
  constructor(skillManager, callbackManager) {
    this.skillManager = skillManager;
    this.callbackManager = callbackManager;
  }

  /**
   * 🎯 智能分析用户请求的复杂度和意图 (增强版)
   * 动态利用 Skill 系统进行分析
   */
  async analyzeTask(userMessage, context = {}) {
    const lowerCaseMessage = userMessage.toLowerCase();
    let complexity = 'low';
    let workflowType = null;
    let score = 0;

    // --- 原有的关键词逻辑 (作为基础评分) ---
    const highComplexityKeywords = ['分析', '报告', '生成', '可视化', '爬取', '总结', '工作流'];
    highComplexityKeywords.forEach(keyword => {
        if (lowerCaseMessage.includes(keyword)) score++;
    });

    // --- ✨ 1. 动态利用 Skill 系统进行分析 ---
    try {
      // 🎯 修复：传递 availableTools 给技能匹配
      const matchedSkills = await this.skillManager.findRelevantSkills(userMessage, {
        category: 'general',
        availableTools: context.availableTools || []  // 新增：传递可用工具
      });

      if (matchedSkills && matchedSkills.length > 0) {
        console.log(`[Task Analysis] 检测到相关技能:`, matchedSkills.map(s => s.toolName || s.name),
          `(已过滤，实际可用: ${matchedSkills.length}个)`);

        if (matchedSkills.length > 1) {
          // 如果匹配到多个不同的高分技能，很可能是一个复杂任务
          score += 2;
          console.log(`[Task Analysis] 检测到多个相关技能 (${matchedSkills.length}个)，增加复杂度分数。`);
        } else if (matchedSkills.length === 1) {
          // 检查单个技能是否本身就是复杂任务的标志
          const topSkill = matchedSkills[0];
          const skillName = topSkill.toolName || topSkill.name;
          const skillCategory = topSkill.category || (skillName?.includes('code') ? 'code' : 'general');
          
          if (skillCategory === 'code' || skillCategory === 'web-crawling') {
            score += 1.5;
            console.log(`[Task Analysis] 检测到复杂技能 "${skillName}"，增加复杂度分数。`);
          }
        }
      }
    } catch (error) {
      console.warn('[Task Analysis] 技能匹配失败:', error);
      // 🎯 修复：技能匹配失败不影响基础关键词匹配
    }

    // --- 结合评分和触发器进行最终决策 ---
    const workflowTriggers = {
      web_analysis: ['分析网页', '总结这个网站', '爬取url内容', '网页内容分析'],
      data_visualization: ['画图', '生成图表', '可视化数据', '绘制图表', '数据可视化'],
      research_report: ['研究报告', '做个调研', '收集信息并总结', '调研报告']
    };

    // 🎯 设置合理的阈值
    if (score >= 3) {
      complexity = 'high';
    } else if (score >= 2) {
      complexity = 'medium';
    } else {
      complexity = 'low';
    }

    // 🎯 匹配工作流触发器
    for (const [type, triggers] of Object.entries(workflowTriggers)) {
      if (triggers.some(trigger => lowerCaseMessage.includes(trigger))) {
        workflowType = type;
        complexity = 'high'; // 触发工作流意味着高复杂度
        break;
      }
    }

    console.log(`[Task Analysis] Query: "${userMessage}", Score: ${score}, Complexity: ${complexity}, Workflow: ${workflowType || 'N/A'}`);

    return {
      complexity,
      workflowType,
      score
    };
  }

  /**
   * 🎯 创建工作流 - 重用现有模板
   */
  async createWorkflow(userMessage, context) {
    const { taskAnalysis } = context;
    const workflowType = taskAnalysis?.workflowType;

    if (!workflowType || !WORKFLOW_TEMPLATES[workflowType]) {
      console.warn(`[WorkflowEngine] 未找到与类型 "${workflowType}" 匹配的工作流模板。`);
      return null;
    }

    // 🎯 从模板深拷贝
    const workflow = JSON.parse(JSON.stringify(WORKFLOW_TEMPLATES[workflowType]));

    workflow.id = `wf_${Date.now()}`;
    workflow.type = workflowType;

    // 🎯 参数替换：将用户输入注入到工作流步骤中
    workflow.steps.forEach(step => {
      if (step.parameters) {
        for (const key in step.parameters) {
          if (typeof step.parameters[key] === 'string' && step.parameters[key].includes('{user_query}')) {
            step.parameters[key] = step.parameters[key].replace('{user_query}', userMessage);
          }
        }
      }
      if (step.prompt && step.prompt.includes('{user_query}')) {
        step.prompt = step.prompt.replace('{user_query}', userMessage);
      }
    });

    console.log('[WorkflowEngine] 成功创建工作流:', workflow);
    return workflow;
  }

  /**
   * 🎯 流式工作流执行引擎
   */
  async* stream(workflow, context = {}) {
    const { apiHandler, apiKey, model, stepOutputs = {} } = context;
    const runId = `run_${Date.now()}`;

    try {
      // 🎯 触发工作流开始事件
      yield {
        event: 'on_workflow_start',
        name: 'workflow_start',
        run_id: runId,
        data: { workflow },
        metadata: { timestamp: Date.now() }
      };

      const results = {
        workflowName: workflow.name,
        success: true,
        steps: [],
        summary: {
          totalSteps: workflow.steps.length,
          successfulSteps: 0,
          totalExecutionTime: 0
        }
      };

      // 🎯 按顺序执行每个步骤
      for (let stepIndex = 0; stepIndex < workflow.steps.length; stepIndex++) {
        const step = workflow.steps[stepIndex];
        const stepStartTime = Date.now();

        // 🎯 触发步骤开始事件
        yield {
          event: 'on_step_start',
          name: 'step_start',
          run_id: runId,
          data: { step, stepIndex },
          metadata: { timestamp: Date.now() }
        };

        try {
          let stepResult;

          // 🎯 根据步骤类型执行不同的逻辑
          if (step.type === 'ai_call') {
            stepResult = await this.executeAIStep(step, context, stepOutputs);
          } else if (step.type === 'tool_call') {
            stepResult = await this.executeToolStep(step, context, stepOutputs);
          } else {
            throw new Error(`未知的步骤类型: ${step.type}`);
          }

          const stepExecutionTime = Date.now() - stepStartTime;
          results.summary.totalExecutionTime += stepExecutionTime;

          // 🎯 记录步骤结果
          const stepData = {
            step: step.name || `步骤 ${stepIndex + 1}`,
            success: stepResult.success,
            output: stepResult.output,
            executionTime: stepExecutionTime,
            ...(stepResult.error && { error: stepResult.error })
          };

          results.steps.push(stepData);

          if (stepResult.success) {
            results.summary.successfulSteps++;
            
            // 🎯 保存步骤输出供后续步骤使用
            if (step.outputKey) {
              stepOutputs[step.outputKey] = stepResult.output;
            }
          }

          // 🎯 触发步骤结束事件
          yield {
            event: 'on_step_end',
            name: 'step_end',
            run_id: runId,
            data: { step: stepData, stepIndex },
            metadata: { 
              timestamp: Date.now(),
              executionTime: stepExecutionTime
            }
          };

          // 🎯 如果步骤失败且是关键步骤，停止工作流
          if (!stepResult.success && step.critical) {
            results.success = false;
            break;
          }

        } catch (error) {
          const stepExecutionTime = Date.now() - stepStartTime;
          
          // 🎯 记录失败的步骤
          results.steps.push({
            step: step.name || `步骤 ${stepIndex + 1}`,
            success: false,
            error: error.message,
            executionTime: stepExecutionTime
          });

          // 🎯 触发步骤错误事件
          yield {
            event: 'on_step_error',
            name: 'step_error',
            run_id: runId,
            data: { 
              step: step, 
              stepIndex, 
              error: error.message 
            },
            metadata: { 
              timestamp: Date.now(),
              executionTime: stepExecutionTime
            }
          };

          // 🎯 如果是关键步骤失败，停止工作流
          if (step.critical) {
            results.success = false;
            break;
          }
        }
      }

      // 🎯 触发工作流结束事件
      yield {
        event: 'on_workflow_end',
        name: 'workflow_end',
        run_id: runId,
        data: { result: results },
        metadata: { timestamp: Date.now() }
      };

    } catch (error) {
      // 🎯 触发工作流错误事件
      yield {
        event: 'on_workflow_error',
        name: 'workflow_error',
        run_id: runId,
        data: { error: error.message },
        metadata: { timestamp: Date.now() }
      };
    }
  }

  /**
   * 🎯 执行AI调用步骤
   */
  async executeAIStep(step, context, stepOutputs) {
    const { apiHandler, apiKey, model } = context;
    
    if (!apiHandler || typeof apiHandler.streamChatCompletion !== 'function') {
      throw new Error('API处理器不可用或缺少streamChatCompletion方法');
    }

    // 🎯 构建提示词，替换变量
    let prompt = step.prompt;
    if (prompt) {
      // 替换用户查询变量
      prompt = prompt.replace('{user_query}', context.userMessage || '');
      
      // 替换之前步骤的输出变量
      for (const [key, value] of Object.entries(stepOutputs)) {
        if (prompt.includes(`{${key}}`)) {
          prompt = prompt.replace(`{${key}}`, value);
        }
      }
    }

    // 🎯 构建请求体
    const requestBody = {
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      model: model || 'gpt-3.5-turbo',
      stream: true
    };

    try {
      // 🎯 执行AI调用
      const response = await apiHandler.streamChatCompletion(requestBody, apiKey);
      
      // 🎯 处理流式响应
      let output = '';
      for await (const chunk of response) {
        if (chunk.choices && chunk.choices[0].delta.content) {
          output += chunk.choices[0].delta.content;
        }
      }

      return {
        success: true,
        output: output.trim()
      };

    } catch (error) {
      console.error(`AI步骤执行失败:`, error);
      return {
        success: false,
        error: error.message,
        output: `AI调用失败: ${error.message}`
      };
    }
  }

  /**
   * 🎯 执行工具调用步骤
   */
  async executeToolStep(step, context, stepOutputs) {
    const { apiHandler } = context;
    
    if (!apiHandler || typeof apiHandler.callTool !== 'function') {
      throw new Error('API处理器不可用或缺少callTool方法');
    }

    // 🎯 处理工具参数，替换变量
    const parameters = { ...step.parameters };
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        // 替换用户查询变量
        let processedValue = value.replace('{user_query}', context.userMessage || '');
        
        // 替换之前步骤的输出变量
        for (const [outputKey, outputValue] of Object.entries(stepOutputs)) {
          if (processedValue.includes(`{${outputKey}}`)) {
            processedValue = processedValue.replace(`{${outputKey}}`, outputValue);
          }
        }
        
        parameters[key] = processedValue;
      }
    }

    try {
      // 🎯 执行工具调用
      const result = await apiHandler.callTool(step.toolName, parameters);
      
      return {
        success: true,
        output: result.output || result.content || result.data || '工具执行成功',
        rawResult: result
      };

    } catch (error) {
      console.error(`工具步骤执行失败:`, error);
      return {
        success: false,
        error: error.message,
        output: `工具调用失败: ${error.message}`
      };
    }
  }

  /**
   * 🎯 获取可用的工作流模板列表
   */
  getAvailableTemplates() {
    return Object.keys(WORKFLOW_TEMPLATES).map(key => ({
      id: key,
      name: WORKFLOW_TEMPLATES[key].name,
      description: WORKFLOW_TEMPLATES[key].description,
      steps: WORKFLOW_TEMPLATES[key].steps.length
    }));
  }

  /**
   * 🎯 验证工作流定义
   */
  validateWorkflow(workflow) {
    const errors = [];

    if (!workflow.name) {
      errors.push('工作流缺少名称');
    }

    if (!workflow.steps || !Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      errors.push('工作流必须包含至少一个步骤');
    }

    workflow.steps.forEach((step, index) => {
      if (!step.type) {
        errors.push(`步骤 ${index + 1} 缺少类型`);
      }

      if (step.type === 'ai_call' && !step.prompt) {
        errors.push(`AI调用步骤 ${index + 1} 缺少提示词`);
      }

      if (step.type === 'tool_call' && !step.toolName) {
        errors.push(`工具调用步骤 ${index + 1} 缺少工具名称`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 🎯 创建工作流执行报告
   */
  generateExecutionReport(workflowResult) {
    const report = {
      timestamp: new Date().toISOString(),
      workflow: workflowResult.workflowName,
      success: workflowResult.success,
      executionTime: workflowResult.summary.totalExecutionTime,
      steps: workflowResult.steps.map(step => ({
        name: step.step,
        success: step.success,
        executionTime: step.executionTime,
        ...(step.error && { error: step.error })
      })),
      summary: workflowResult.summary
    };

    return report;
  }

  /**
   * 🎯 清理工作流执行上下文
   */
  cleanupContext(stepOutputs) {
    // 清理步骤输出，避免内存泄漏
    Object.keys(stepOutputs).forEach(key => {
      delete stepOutputs[key];
    });
  }

  /**
   * 🎯 新增：获取任务分析统计
   */
  getTaskAnalysisStats() {
    return {
      availableTemplates: Object.keys(WORKFLOW_TEMPLATES).length,
      workflowTriggers: {
        web_analysis: 4,
        data_visualization: 5,
        research_report: 4
      },
      complexityThresholds: {
        high: 3,
        medium: 2,
        low: 1
      }
    };
  }
}