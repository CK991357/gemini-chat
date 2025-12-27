// src/static/js/agent/CallbackManager.js

/**
 * @class CallbackManager
 * @description 增强的回调管理器，支持中间件和Agent事件系统
 * 🎯 重构版：完全兼容新旧事件名称
 */
export class CallbackManager {
    constructor() {
        this.handlers = [];
        this.middlewares = [];
        this.eventHistory = [];
        this.currentRunId = null;
        this.runCounter = 0;
        this._isDisposed = false;
        
        // 🎯 新增：事件名称映射（新旧兼容）
        this.eventNameMapping = {
            // 新事件名 → 旧事件名（供内部处理）
            'research:start': 'on_research_start',
            'research:plan_generated': 'on_research_plan_generated', 
            'research:progress': 'on_research_progress',
            'research:tool_start': 'on_tool_start',
            'research:tool_end': 'on_tool_end',
            'research:stats_updated': 'on_research_stats_updated',
            'research:tool_called': 'on_tool_called',
            'research:end': 'on_research_end',
            // 反向映射（旧→新，供DOM事件）
            'on_research_start': 'research:start',
            'on_research_plan_generated': 'research:plan_generated',
            'on_research_progress': 'research:progress',
            'on_tool_start': 'research:tool_start',
            'on_tool_end': 'research:tool_end',
            'on_research_stats_updated': 'research:stats_updated',
            'on_tool_called': 'research:tool_called',
            'on_research_end': 'research:end'
        };
        
        console.log('[CallbackManager] 初始化完成（兼容新旧事件名）');
        
        // 内存清理
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

    // 🎯 增强的 invokeEvent 方法 - 完全兼容新旧事件名
    async invokeEvent(eventName, payload = {}) {
        if (this._isDisposed) {
            console.warn('[CallbackManager] 尝试在已销毁的管理器上调用事件');
            return Promise.resolve(null);
        }
        
        // 🎯 核心修复：处理新旧事件名称
        const originalEventName = eventName;
        const mappedEventName = this.eventNameMapping[eventName] || eventName;
        
        console.log(`[CallbackManager] 事件: ${originalEventName} → ${mappedEventName} [${payload.run_id || this.currentRunId}]`);
        
        // 创建事件对象
        const event = {
            event: originalEventName, // 保留原始事件名
            mapped_event: mappedEventName, // 映射后的事件名
            name: payload.name || 'unnamed',
            run_id: payload.run_id || this.currentRunId,
            timestamp: new Date().toISOString(),
            data: payload.data || {},
            metadata: {
                ...payload.metadata,
                original_event_name: originalEventName,
                mapped_event_name: mappedEventName,
                source: payload.metadata?.source || 'callback_manager'
            }
        };

        // 🎯 记录事件历史（限制大小）
        this.eventHistory.push(event);
        if (this.eventHistory.length > 1000) {
            this.eventHistory = this.eventHistory.slice(-500);
        }

        // 🎯 异步通知所有处理器 - 支持多种事件名格式
        const promises = this.handlers.map(async (handler) => {
            try {
                // 尝试1：映射后的事件名（旧格式）
                if (typeof handler[mappedEventName] === 'function') {
                    await handler[mappedEventName](event);
                }
                
                // 尝试2：原始事件名（新格式）
                if (typeof handler[originalEventName] === 'function') {
                    await handler[originalEventName](event);
                }
                
                // 尝试3：通用事件处理器
                if (typeof handler.handleEvent === 'function') {
                    await handler.handleEvent(event);
                }
                
                // 🎯 新增：如果处理器有 handleCallbackManagerEvent 方法
                if (typeof handler.handleCallbackManagerEvent === 'function') {
                    await handler.handleCallbackManagerEvent(event);
                }
            } catch (error) {
                console.error(`[CallbackManager] 处理器执行失败 (${originalEventName}/${mappedEventName}):`, error);
            }
        });

        await Promise.allSettled(promises);
        
        // 🎯 关键修复：自动触发DOM事件（确保面板能收到）
        this._triggerDOMEvent(event);
        
        return event;
    }

    // 🎯 新增：自动触发DOM事件
    _triggerDOMEvent(event) {
        try {
            // 确定要触发的DOM事件名
            let domEventName = event.event; // 原始事件名
            
            // 如果原始是旧格式，映射为新格式
            if (domEventName.startsWith('on_')) {
                domEventName = this.eventNameMapping[domEventName] || domEventName;
            }
            
            console.log(`[CallbackManager] 触发DOM事件: ${domEventName}`);
            
            const domEvent = new CustomEvent(domEventName, {
                detail: {
                    run_id: event.run_id,
                    data: event.data,
                    metadata: event.metadata,
                    original_event: event.event
                },
                bubbles: true,
                cancelable: true
            });
            
            // 在window上触发
            if (typeof window !== 'undefined') {
                window.dispatchEvent(domEvent);
            }
        } catch (error) {
            console.error('[CallbackManager] 触发DOM事件失败:', error);
        }
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

    // 🎯 Agent特定事件方法 - 兼容新旧调用方式
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

    // 🎯 DeepResearchAgent 专用事件方法 - 新增兼容性方法
    async onResearchStart(data) {
        return await this.invokeEvent('research:start', {
            name: 'research_start',
            run_id: data.run_id || this.currentRunId,
            data: data.data || {},
            metadata: {
                source: 'deep_research_agent',
                step_type: 'research_start'
            }
        });
    }

    async onResearchPlanGenerated(data) {
        return await this.invokeEvent('research:plan_generated', {
            name: 'research_plan',
            run_id: data.run_id || this.currentRunId,
            data: data.data || {},
            metadata: {
                source: 'deep_research_agent',
                step_type: 'plan_generated'
            }
        });
    }

    async onResearchProgress(data) {
        return await this.invokeEvent('research:progress', {
            name: 'research_progress',
            run_id: data.run_id || this.currentRunId,
            data: data.data || {},
            metadata: {
                source: 'deep_research_agent',
                step_type: 'progress'
            }
        });
    }

    async onResearchToolStart(data) {
        return await this.invokeEvent('research:tool_start', {
            name: 'research_tool',
            run_id: data.run_id || this.currentRunId,
            data: data.data || {},
            metadata: {
                source: 'deep_research_agent',
                step_type: 'tool_start'
            }
        });
    }

    async onResearchToolEnd(data) {
        return await this.invokeEvent('research:tool_end', {
            name: 'research_tool',
            run_id: data.run_id || this.currentRunId,
            data: data.data || {},
            metadata: {
                source: 'deep_research_agent',
                step_type: 'tool_end'
            }
        });
    }

    async onResearchStatsUpdated(data) {
        return await this.invokeEvent('research:stats_updated', {
            name: 'research_stats',
            run_id: data.run_id || this.currentRunId,
            data: data.data || {},
            metadata: {
                source: 'deep_research_agent',
                step_type: 'stats_update'
            }
        });
    }

    async onResearchToolCalled(data) {
        return await this.invokeEvent('research:tool_called', {
            name: 'research_tool_call',
            run_id: data.run_id || this.currentRunId,
            data: data.data || {},
            metadata: {
                source: 'deep_research_agent',
                step_type: 'tool_called'
            }
        });
    }

    async onResearchEnd(data) {
        return await this.invokeEvent('research:end', {
            name: 'research_end',
            run_id: data.run_id || this.currentRunId,
            data: data.data || {},
            metadata: {
                source: 'deep_research_agent',
                step_type: 'research_end'
            }
        });
    }

    // 🎯 旧版兼容方法（供现有代码使用）
    async onResearchStatsUpdatedLegacy(stats) {
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

    async onToolCalledLegacy(toolData) {
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
            
            if (this.eventHistory.length > 200) {
                this.eventHistory = this.eventHistory.slice(-100);
                console.log(`[CallbackManager] 内存清理: ${beforeSize} -> ${this.eventHistory.length}`);
            }
            
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