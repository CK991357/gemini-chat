export class WorkflowEngine {
  constructor(skillManager, callbackManager) {
    this.skillManager = skillManager;
    this.callbackManager = callbackManager;
  }

  // 🎯 核心：统一的工作流执行接口
  async* stream(workflow, context = {}) {
    const run_id = workflow.id || `wf_${Date.now()}`;
    
    // 工作流开始
    yield { 
      event: 'on_workflow_start', 
      name: workflow.name, 
      run_id, 
      data: { workflow },
      metadata: {
        steps_count: workflow.steps.length,
        workflow_type: workflow.type
      }
    };
    
    const results = [];
    const stepOutputs = {};
    let workflowSuccess = true;
    
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      const step_run_id = `${run_id}-step-${i}`;
      
      try {
        // 🎯 执行步骤并消费其事件流
        const stepStream = this.streamStep(step, { 
          ...context, 
          stepOutputs, 
          stepIndex: i, 
          run_id: step_run_id,
          parentRunId: run_id
        });
        
        let finalStepResult = null;
        for await (const chunk of stepStream) {
          // 🎯 关键：事件冒泡到工作流级别
          yield { ...chunk, parent_run_id: run_id };
          
          if (chunk.event === 'on_step_end') {
            finalStepResult = chunk.data.result;
          }
        }
        
        results.push(finalStepResult);
        stepOutputs[`step_${i}`] = finalStepResult?.output;
        
        // 🎯 关键步骤失败处理
        if (!finalStepResult?.success && step.critical) {
          workflowSuccess = false;
          yield { 
            event: 'on_error', 
            name: 'critical_step_failed', 
            run_id, 
            data: { 
              error: new Error("关键步骤失败，工作流中止"),
              stepIndex: i,
              step: step.name
            },
            metadata: { critical: true, recoverable: false }
          };
          break;
        }
        
      } catch (error) {
        workflowSuccess = false;
        yield { 
          event: 'on_error', 
          name: 'step_execution_error', 
          run_id, 
          data: { error, stepIndex: i },
          metadata: { fatal: true }
        };
        break;
      }
    }
    
    // 🎯 编译最终结果
    const finalResult = this.compileWorkflowResult(workflow, results, workflowSuccess);
    
    yield { 
      event: 'on_workflow_end', 
      name: workflow.name, 
      run_id, 
      data: { result: finalResult },
      metadata: {
        success: workflowSuccess,
        total_steps: workflow.steps.length,
        completed_steps: results.length
      }
    };
  }

  // 🎯 每个步骤都是独立的 Runnable
  async* streamStep(step, context) {
    const startTime = Date.now();
    const step_run_id = context.run_id;
    
    yield { 
      event: 'on_step_start', 
      name: step.name, 
      run_id: step_run_id, 
      data: { step, stepIndex: context.stepIndex },
      metadata: { tool_name: step.toolName, critical: step.critical }
    };
    
    let result;
    try {
      if (step.toolName === 'standard_ai') {
        // 🎯 AI 步骤的流式处理
        const aiStream = this.streamAIStep(step, context);
        let fullOutput = '';
        
        for await (const chunk of aiStream) {
          if (chunk.event === 'on_ai_stream' && chunk.data.chunk) {
            fullOutput += chunk.data.chunk.content || chunk.data.chunk;
          }
          yield chunk;
        }
        
        result = { 
          success: true, 
          output: fullOutput,
          reasoning: fullOutput // 可以根据需要提取推理部分
        };
        
      } else {
        // 🎯 工具执行的流式处理
        yield { 
          event: 'on_tool_start', 
          name: step.toolName, 
          run_id: step_run_id, 
          data: { input: step.parameters },
          metadata: { parameters: step.parameters }
        };
        
        // 执行工具调用
        const toolResult = await context.apiHandler.callTool(step.toolName, step.parameters);
        
        yield { 
          event: 'on_tool_end', 
          name: step.toolName, 
          run_id: step_run_id, 
          data: { output: toolResult.output, result: toolResult },
          metadata: { success: toolResult.success }
        };
        
        result = { 
          success: toolResult.success, 
          output: toolResult.output,
          rawResult: toolResult
        };
      }
      
    } catch (error) {
      result = { 
        success: false, 
        error: error.message,
        output: `步骤执行失败: ${error.message}`
      };
      
      yield { 
        event: 'on_error', 
        name: 'step_execution_failed', 
        run_id: step_run_id, 
        data: { error, step: step.name },
        metadata: { tool_name: step.toolName, fatal: false }
      };
    }
    
    // 🎯 步骤结束事件
    const executionResult = {
      ...result,
      step: step.name,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
    
    yield { 
      event: 'on_step_end', 
      name: step.name, 
      run_id: step_run_id, 
      data: { result: executionResult },
      metadata: { 
        success: executionResult.success,
        execution_time: executionResult.executionTime
      }
    };
  }

  // 🎯 AI 步骤的流式实现
  async* streamAIStep(step, context) {
    yield { 
      event: 'on_ai_start', 
      name: 'ai_processor', 
      run_id: context.run_id, 
      data: { 
        prompt: step.prompt,
        stepIndex: context.stepIndex
      },
      metadata: { prompt_length: step.prompt?.length }
    };
    
    try {
      // 🎯 假设 chatApiHandler 支持流式响应
      const aiStream = await context.apiHandler.streamAIResponse(step.prompt, {
        model: context.model,
        apiKey: context.apiKey
      });
      
      for await (const chunk of aiStream) {
        yield {
          event: 'on_ai_stream',
          name: 'ai_stream',
          run_id: context.run_id,
          data: { 
            chunk,
            stepIndex: context.stepIndex,
            chunk_type: chunk.type || 'content'
          },
          metadata: {
            chunk_length: chunk.content?.length || 0
          }
        };
      }
      
      yield {
        event: 'on_ai_end',
        name: 'ai_processor', 
        run_id: context.run_id,
        data: { 
          stepIndex: context.stepIndex,
          completion: true
        }
      };
      
    } catch (error) {
      yield {
        event: 'on_error',
        name: 'ai_execution_failed',
        run_id: context.run_id,
        data: { error, stepIndex: context.stepIndex },
        metadata: { source: 'ai_engine' }
      };
    }
  }

  // 🎯 保持现有的分析方法
  analyzeTask(userMessage) {
    // 现有逻辑保持不变
  }

  // 🎯 保持现有的工作流创建方法
  async createWorkflow(userMessage, context) {
    // 现有逻辑保持不变
  }

  // 🎯 编译工作流结果
  compileWorkflowResult(workflow, stepResults, success) {
    const successfulSteps = stepResults.filter(r => r?.success);
    
    return {
      workflowName: workflow.name,
      success,
      steps: stepResults,
      summary: {
        totalSteps: workflow.steps.length,
        successfulSteps: successfulSteps.length,
        successRate: (successfulSteps.length / workflow.steps.length) * 100,
        totalExecutionTime: stepResults.reduce((total, r) => total + (r?.executionTime || 0), 0)
      }
    };
  }
}