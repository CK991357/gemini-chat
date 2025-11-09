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
        this._isDisposed = false;
        
        console.log('[CallbackManager] 初始化完成');
        
        // 内存清理：每 5 分钟清理一次事件历史
        try {
            this.cleanupInterval = setInterval(() => {
                if (!this._isDisposed) {
                    this.cleanup();
                }
            }, 5 * 60 * 1000);
        } catch (error) {
            console.error('[CallbackManager] 定时器设置失败:', error);
        }
    }

    // 🎯 基础管理方法
    addHandler(handler) {
        if (this._isDisposed) {
            console.warn('[CallbackManager] 尝试在已销毁的管理器上添加处理器');
            return;
        }
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

        const currentRequest = { ...request };
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

        // 执行中间件链后的实际处理器并获取原始结果
        const rawResult = await currentHandler(currentRequest);

        // 🎯 使用 ObservationUtils 进行统一规范化
        try {
            // 使用相对路径导入
            const { ObservationUtils } = await import('./utils/ObservationUtils.js');
            const normalizedResult = ObservationUtils.normalizeToolResult(rawResult);

            console.log(`[CallbackManager] 工具调用规范化完成:`, {
                tool: request.toolName,
                success: normalizedResult.success,
                outputLength: (normalizedResult.output || '').length,
                extractedFrom: normalizedResult._extractedFrom
            });

            return normalizedResult;
        } catch (err) {
            console.error('[CallbackManager] 使用 ObservationUtils 规范化失败:', err);
            // 🎯 安全的回退方案
            return {
                success: false,
                output: `规范化失败: ${err.message}`,
                _rawResult: rawResult,
                _callbackManagerError: true,
                _error: err.message
            };
        }
    }

    async wrapLLMCall(request, handler) {
        console.log(`[CallbackManager] 包装LLM调用`);
        
        const currentRequest = { ...request };
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
        if (this._isDisposed) {
            console.warn('[CallbackManager] 尝试在已销毁的管理器上调用事件');
            return Promise.resolve(null);
        }
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

    async onResearchStatsUpdated(stats) {
        return await this.invokeEvent('on_research_stats_updated', {
            name: 'research_stats',
            run_id: this.currentRunId,
            data: stats,
            metadata: {
                source: 'deep_research_agent',
                step_type: 'stats_update'
            }
        });
    }

    async onToolCalled(toolData) {
        return await this.invokeEvent('on_tool_called', {
            name: 'tool_call',
            run_id: this.currentRunId,
            data: toolData,
            metadata: {
                source: 'deep_research_agent',
                step_type: 'tool_execution'
            }
        });
    }

    // 🎯 工具方法
    getCurrentRunEvents() {
        if (this._isDisposed) return [];
        return this.eventHistory.filter(event => event.run_id === this.currentRunId);
    }

    /**
     * @description 定期清理事件历史，防止内存泄漏
     */
    cleanup() {
        if (this._isDisposed) return;
        
        try {
            const beforeSize = this.eventHistory.length;
            
            // 🎯 优化：提高清理阈值，避免过于频繁
            if (this.eventHistory.length > 200) { // 从100提高到200
                this.eventHistory = this.eventHistory.slice(-100); // 保留更多历史
                console.log(`[CallbackManager] 内存清理: ${beforeSize} -> ${this.eventHistory.length}`);
            }
            
            // 清理无效处理器
            this._cleanupInvalidHandlers();
            
        } catch (error) {
            console.error('[CallbackManager] 清理过程出错:', error);
        }
    }

    /**
     * 🎯 新增：清理无效处理器
     */
    _cleanupInvalidHandlers() {
        const validHandlers = this.handlers.filter(handler => {
            if (handler._isDisposed) {
                console.log(`[CallbackManager] 清理已销毁的处理器: ${handler.name || 'unnamed'}`);
                return false;
            }
            return true;
        });
        
        if (validHandlers.length !== this.handlers.length) {
            this.handlers = validHandlers;
        }
    }

    clearCurrentRun() {
        if (this._isDisposed) return;
        this.currentRunId = null;
    }

    getEventHistory() {
        if (this._isDisposed) return [];
        return [...this.eventHistory];
    }

    /**
     * @description 清理资源，停止定时器
     */
    dispose() {
        if (this._isDisposed) return;
        
        console.log('[CallbackManager] 开始资源清理...');
        this._isDisposed = true;
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('[CallbackManager] 清理定时器完成');
        }
        
        // 清理所有引用
        this.handlers = [];
        this.middlewares = [];
        this.eventHistory = [];
        this.currentRunId = null;
        
        console.log('[CallbackManager] 资源完全释放');
    }

    getStatus() {
        return {
            handlers: this.handlers.length,
            middlewares: this.middlewares.length,
            eventHistory: this.eventHistory.length,
            currentRunId: this.currentRunId,
            runCounter: this.runCounter,
            isDisposed: this._isDisposed
        };
    }
}