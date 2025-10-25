// src/static/js/agent/CallbackManager.js

export class CallbackManager {
    constructor() { 
        this.handlers = [];
        this.eventHistory = [];
        this.currentRunId = null;
        this.runCounter = 0;
    }

    addHandler(handler) { 
        this.handlers.push(handler);
    }

    removeHandler(handler) {
        const index = this.handlers.indexOf(handler);
        if (index > -1) {
            this.handlers.splice(index, 1);
        }
    }

    // 🎯 生成唯一运行ID
    generateRunId() {
        this.runCounter++;
        return `run_${Date.now()}_${this.runCounter}`;
    }

    // 🎯 结构化事件分发方法 - 对齐 LangChain 事件流
    async invokeEvent(eventName, payload = {}) {
        const event = {
            event: eventName, // 🎯 对齐 LangChain 事件名称风格
            name: payload.name || 'unnamed', // 事件源的名称
            run_id: payload.run_id || this.currentRunId, // 🎯 统一运行ID
            timestamp: new Date().toISOString(),
            data: payload.data || {},
            metadata: payload.metadata || {}
        };
        
        // 🎯 记录事件历史（用于调试和追溯）
        this.eventHistory.push(event);
        if (this.eventHistory.length > 200) {
            this.eventHistory.shift();
        }

        console.log(`🔄 Event Stream: ${event.event} [${event.name}]`, event);

        // 🎯 异步调用所有处理器的对应方法
        const promises = this.handlers.map(async (handler) => {
            if (typeof handler[event.event] === 'function') {
                try {
                    // 🎯 传递整个结构化事件对象
                    await handler[event.event](event);
                } catch (error) {
                    console.error(`Error in handler for event ${event.event}:`, error);
                }
            }
            
            // 🎯 同时支持通用事件处理器
            if (typeof handler.onEvent === 'function') {
                try {
                    await handler.onEvent(event);
                } catch (error) {
                    console.error(`Error in generic handler for event ${event.event}:`, error);
                }
            }
        });

        await Promise.all(promises);
        
        return event; // 🎯 返回事件对象，便于链式调用
    }

    // 🎯 具体事件方法 - 使用结构化payload
    async onWorkflowStart(workflow) {
        this.currentRunId = this.generateRunId();
        return await this.invokeEvent('on_workflow_start', {
            name: workflow.name,
            run_id: this.currentRunId,
            data: { 
                workflow,
                steps_count: workflow.steps.length,
                workflow_type: workflow.type
            },
            metadata: {
                source: 'orchestrator',
                complexity: workflow.analysis?.complexity
            }
        });
    }

    async onWorkflowEnd(workflow, result) {
        return await this.invokeEvent('on_workflow_end', {
            name: workflow.name,
            run_id: this.currentRunId,
            data: { 
                workflow,
                result,
                summary: result.summary
            },
            metadata: {
                source: 'orchestrator',
                success: result.success,
                execution_time: result.summary?.totalExecutionTime
            }
        });
    }

    async onStepStart(step, stepIndex) {
        return await this.invokeEvent('on_step_start', {
            name: step.name,
            run_id: this.currentRunId,
            data: { 
                step,
                step_index: stepIndex,
                tool_name: step.toolName
            },
            metadata: {
                source: 'workflow_engine',
                critical: step.critical || false
            }
        });
    }

    async onStepEnd(step, stepIndex, result) {
        return await this.invokeEvent('on_step_end', {
            name: step.name,
            run_id: this.currentRunId,
            data: { 
                step,
                step_index: stepIndex,
                result,
                execution_time: result.executionTime
            },
            metadata: {
                source: 'workflow_engine',
                success: result.success,
                tool_name: step.toolName
            }
        });
    }

    async onToolStart(toolName, input, stepIndex) {
        return await this.invokeEvent('on_tool_start', {
            name: toolName,
            run_id: this.currentRunId,
            data: { 
                tool_name: toolName,
                input,
                step_index: stepIndex
            },
            metadata: {
                source: 'tool_executor',
                input_type: typeof input
            }
        });
    }

    async onToolEnd(toolName, output, stepIndex, result) {
        return await this.invokeEvent('on_tool_end', {
            name: toolName,
            run_id: this.currentRunId,
            data: { 
                tool_name: toolName,
                output,
                step_index: stepIndex,
                result
            },
            metadata: {
                source: 'tool_executor',
                success: result?.success,
                execution_time: result?.executionTime
            }
        });
    }

    async onAIStart(prompt, stepIndex) {
        return await this.invokeEvent('on_ai_start', {
            name: 'ai_processor',
            run_id: this.currentRunId,
            data: { 
                prompt_preview: prompt.substring(0, 100) + '...',
                step_index: stepIndex,
                prompt_length: prompt.length
            },
            metadata: {
                source: 'ai_engine',
                step_index: stepIndex
            }
        });
    }

    async onAIStream(chunk, stepIndex, chunkType = 'content') {
        return await this.invokeEvent('on_ai_stream', {
            name: 'ai_stream',
            run_id: this.currentRunId,
            data: { 
                chunk,
                step_index: stepIndex,
                chunk_type: chunkType,
                chunk_length: chunk.length
            },
            metadata: {
                source: 'ai_engine',
                stream_type: chunkType
            }
        });
    }

    async onAIEnd(response, stepIndex) {
        return await this.invokeEvent('on_ai_end', {
            name: 'ai_processor',
            run_id: this.currentRunId,
            data: { 
                response,
                step_index: stepIndex,
                response_length: response?.length || 0
            },
            metadata: {
                source: 'ai_engine',
                step_index: stepIndex,
                has_reasoning: !!response?.reasoning
            }
        });
    }

    async onError(error, stepIndex, context) {
        return await this.invokeEvent('on_error', {
            name: context?.toolName || context?.step?.name || 'unknown',
            run_id: this.currentRunId,
            data: { 
                error: {
                    message: error.message,
                    stack: error.stack
                },
                step_index: stepIndex,
                context
            },
            metadata: {
                source: context?.source || 'unknown',
                error_type: error.constructor.name,
                recoverable: this.isRecoverableError(error)
            }
        });
    }

    async onLearningUpdate(toolName, success, executionTime) {
        return await this.invokeEvent('on_learning_update', {
            name: toolName,
            run_id: this.currentRunId,
            data: { 
                tool_name: toolName,
                success,
                execution_time: executionTime
            },
            metadata: {
                source: 'learning_engine',
                update_type: 'tool_performance'
            }
        });
    }

    // 🎯 新增：LangChain风格的事件
    async onChainStart(chainType, inputs) {
        return await this.invokeEvent('on_chain_start', {
            name: chainType,
            run_id: this.currentRunId,
            data: { 
                chain_type: chainType,
                inputs
            },
            metadata: {
                source: 'chain_executor'
            }
        });
    }

    async onChainEnd(chainType, outputs) {
        return await this.invokeEvent('on_chain_end', {
            name: chainType,
            run_id: this.currentRunId,
            data: { 
                chain_type: chainType,
                outputs
            },
            metadata: {
                source: 'chain_executor'
            }
        });
    }

    async onAgentAction(action, stepIndex) {
        return await this.invokeEvent('on_agent_action', {
            name: 'agent',
            run_id: this.currentRunId,
            data: { 
                action,
                step_index: stepIndex
            },
            metadata: {
                source: 'agent',
                action_type: action.type
            }
        });
    }

    // 🎯 辅助方法
    isRecoverableError(error) {
        const recoverableErrors = [
            'NetworkError',
            'TimeoutError',
            'RateLimitError'
        ];
        return recoverableErrors.some(type => error.message.includes(type));
    }

    // 🎯 获取当前运行的事件流
    getCurrentRunEvents() {
        return this.eventHistory.filter(event => event.run_id === this.currentRunId);
    }

    // 🎯 清空当前运行状态
    clearCurrentRun() {
        this.currentRunId = null;
    }

    // 🎯 调试方法
    getEventHistory() {
        return [...this.eventHistory];
    }

    getRunStatistics(runId = this.currentRunId) {
        const runEvents = this.eventHistory.filter(event => event.run_id === runId);
        const eventCounts = {};
        runEvents.forEach(event => {
            eventCounts[event.event] = (eventCounts[event.event] || 0) + 1;
        });
        
        return {
            runId,
            totalEvents: runEvents.length,
            eventCounts,
            startTime: runEvents[0]?.timestamp,
            endTime: runEvents[runEvents.length - 1]?.timestamp,
            events: runEvents
        };
    }
}