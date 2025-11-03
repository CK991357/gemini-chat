// src/static/js/agent/CallbackManager.js

/**
 * @class CallbackManager
 * @description 增强的回调管理器，支持中间件和Agent事件系统
 */
export class CallbackManager {
    constructor() {
        this.handlers = [];
        this.middlewares = [];
        this.eventHistory = [];
        this.currentRunId = null;
        this.runCounter = 0;
        
        console.log('[CallbackManager] 初始化完成');
    }

    // 🎯 基础管理方法
    addHandler(handler) {
        if (this.handlers.includes(handler)) {
            console.warn('[CallbackManager] 处理器已存在，跳过添加');
            return;
        }
        this.handlers.push(handler);
        console.log(`[CallbackManager] 添加处理器，当前总数: ${this.handlers.length}`);
    }

    removeHandler(handler) {
        const index = this.handlers.indexOf(handler);
        if (index > -1) {
            this.handlers.splice(index, 1);
            console.log(`[CallbackManager] 移除处理器，剩余: ${this.handlers.length}`);
        }
    }

    addMiddleware(middleware) {
        if (this.middlewares.includes(middleware)) {
            console.warn('[CallbackManager] 中间件已存在，跳过添加');
            return;
        }
        this.middlewares.push(middleware);
        console.log(`[CallbackManager] 添加中间件，当前总数: ${this.middlewares.length}`);
    }

    generateRunId() {
        this.runCounter++;
        this.currentRunId = `agent_${Date.now()}_${this.runCounter}`;
        return this.currentRunId;
    }

    // 🎯 中间件系统
    async wrapToolCall(request, handler) {
        console.log(`[CallbackManager] 包装工具调用: ${request.toolName}`);
        
        let currentRequest = { ...request };
        let currentHandler = handler;

        // 🎯 应用中间件（从后向前包装）
        for (let i = this.middlewares.length - 1; i >= 0; i--) {
            const middleware = this.middlewares[i];
            if (typeof middleware.wrapToolCall === 'function') {
                const originalHandler = currentHandler;
                currentHandler = async (req) => {
                    return await middleware.wrapToolCall(req, originalHandler);
                };
            }
        }

        return await currentHandler(currentRequest);
    }

    async wrapLLMCall(request, handler) {
        console.log(`[CallbackManager] 包装LLM调用`);
        
        let currentRequest = { ...request };
        let currentHandler = handler;

        for (let i = this.middlewares.length - 1; i >= 0; i--) {
            const middleware = this.middlewares[i];
            if (typeof middleware.wrapLLMCall === 'function') {
                const originalHandler = currentHandler;
                currentHandler = async (req) => {
                    return await middleware.wrapLLMCall(req, originalHandler);
                };
            }
        }

        return await currentHandler(currentRequest);
    }

    // 🎯 事件系统
    async invokeEvent(eventName, payload = {}) {
        const event = {
            event: eventName,
            name: payload.name || 'unnamed',
            run_id: payload.run_id || this.currentRunId,
            timestamp: new Date().toISOString(),
            data: payload.data || {},
            metadata: payload.metadata || {}
        };

        // 🎯 记录事件历史（限制大小）
        this.eventHistory.push(event);
        if (this.eventHistory.length > 1000) {
            this.eventHistory = this.eventHistory.slice(-500);
        }

        console.log(`[CallbackManager] 事件: ${eventName} [${event.run_id}]`);

        // 🎯 异步通知所有处理器
        const promises = this.handlers.map(async (handler) => {
            try {
                // 🎯 特定事件处理器
                if (typeof handler[eventName] === 'function') {
                    await handler[eventName](event);
                }
                
                // 🎯 通用事件处理器
                if (typeof handler.handleEvent === 'function') {
                    await handler.handleEvent(event);
                }
            } catch (error) {
                console.error(`[CallbackManager] 处理器执行失败 (${eventName}):`, error);
            }
        });

        await Promise.allSettled(promises);
        return event;
    }

    // 🎯 Agent特定事件方法
    async onAgentStart(agent, inputs) {
        return await this.invokeEvent('on_agent_start', {
            name: agent.name || 'unknown_agent',
            run_id: this.currentRunId,
            data: { 
                agent: agent.getStatus ? agent.getStatus() : agent,
                inputs,
                timestamp: Date.now()
            },
            metadata: {
                source: 'agent_executor',
                agent_type: 'react_agent'
            }
        });
    }

    async onAgentIterationStart(iteration, intermediateSteps) {
        return await this.invokeEvent('on_agent_iteration_start', {
            name: 'agent_iteration',
            run_id: this.currentRunId,
            data: { 
                iteration,
                intermediateSteps: intermediateSteps.length
            },
            metadata: {
                source: 'agent_executor',
                step_type: 'iteration_start'
            }
        });
    }

    async onAgentThinkStart(step, prompt) {
        return await this.invokeEvent('on_agent_think_start', {
            name: 'agent_think',
            run_id: this.currentRunId,
            data: { 
                step,
                prompt_preview: prompt.substring(0, 100) + '...'
            },
            metadata: {
                source: 'agent_logic',
                step_type: 'think_start'
            }
        });
    }

    async onAgentThinkEnd(step, response) {
        return await this.invokeEvent('on_agent_think_end', {
            name: 'agent_think',
            run_id: this.currentRunId,
            data: { 
                step,
                response_preview: response.substring(0, 100) + '...'
            },
            metadata: {
                source: 'agent_logic',
                step_type: 'think_end'
            }
        });
    }

    async onAgentThinkError(step, error) {
        return await this.invokeEvent('on_agent_think_error', {
            name: 'agent_think',
            run_id: this.currentRunId,
            data: { 
                step,
                error: error.message
            },
            metadata: {
                source: 'agent_logic',
                step_type: 'think_error'
            }
        });
    }

    async onAgentIterationEnd(iteration, action, intermediateSteps) {
        return await this.invokeEvent('on_agent_iteration_end', {
            name: 'agent_iteration',
            run_id: this.currentRunId,
            data: { 
                iteration,
                action,
                intermediateSteps: intermediateSteps.length
            },
            metadata: {
                source: 'agent_executor',
                step_type: 'iteration_end'
            }
        });
    }

    async onAgentIterationError(iteration, error, action) {
        return await this.invokeEvent('on_agent_iteration_error', {
            name: 'agent_iteration',
            run_id: this.currentRunId,
            data: { 
                iteration,
                error: error.message,
                action
            },
            metadata: {
                source: 'agent_executor',
                step_type: 'iteration_error'
            }
        });
    }

    async onAgentEnd(result) {
        return await this.invokeEvent('on_agent_end', {
            name: 'agent_executor',
            run_id: this.currentRunId,
            data: { 
                result,
                success: result.success,
                iterations: result.iterations
            },
            metadata: {
                source: 'agent_executor',
                step_type: 'agent_end'
            }
        });
    }

    async onAgentError(error, context) {
        return await this.invokeEvent('on_agent_error', {
            name: 'agent_executor',
            run_id: this.currentRunId,
            data: { 
                error: {
                    message: error.message,
                    stack: error.stack
                },
                context
            },
            metadata: {
                source: 'agent_executor',
                step_type: 'agent_error'
            }
        });
    }

    // 🎯 工具方法
    getCurrentRunEvents() {
        return this.eventHistory.filter(event => event.run_id === this.currentRunId);
    }

    clearCurrentRun() {
        this.currentRunId = null;
    }

    getEventHistory() {
        return [...this.eventHistory];
    }

    getStatus() {
        return {
            handlers: this.handlers.length,
            middlewares: this.middlewares.length,
            eventHistory: this.eventHistory.length,
            currentRunId: this.currentRunId,
            runCounter: this.runCounter
        };
    }
}