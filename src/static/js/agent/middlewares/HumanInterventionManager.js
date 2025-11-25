// src/static/js/agent/middlewares/HumanInterventionManager.js

/**
 * @class HumanInterventionManager
 * @description 人类干预管理器 - 处理暂停、中止、补充资料等干预请求
 */
export class HumanInterventionManager {
    constructor(config = {}) {
        this.name = 'HumanInterventionManager';
        
        this.state = {
            status: 'running', // running, paused, aborted, waiting_for_input
            interventionType: null, // 'pause', 'abort', 'provide_info', 'retry_with_fix'
            userInput: null,
            pendingRequests: [],
            lastInterventionTime: null
        };

        this.config = {
            autoPauseOnConsecutiveFailures: config.autoPauseOnConsecutiveFailures || 3,
            maxWaitTimeForInput: config.maxWaitTimeForInput || 300000, // 5分钟
            enableAutoIntervention: config.enableAutoIntervention !== false,
            interventionCallbacks: config.interventionCallbacks || {}
        };

        this.eventListeners = new Map();
        this.interventionHistory = [];
        
        console.log('🎯 [HumanInterventionManager] 初始化完成');
    }

    // 🎯 核心干预方法
    async requestIntervention(type, data = {}) {
        console.log(`🎯 [HumanIntervention] 请求干预: ${type}`, data);
        
        const intervention = {
            id: this._generateId(),
            type,
            data,
            timestamp: Date.now(),
            status: 'requested'
        };

        this.interventionHistory.push(intervention);
        
        // 触发干预请求事件
        this._emit('intervention_requested', intervention);
        
        switch (type) {
            case 'pause':
                return await this._handlePause(intervention);
            case 'abort':
                return await this._handleAbort(intervention);
            case 'provide_info':
                return await this._handleProvideInfo(intervention);
            case 'retry_with_fix':
                return await this._handleRetryWithFix(intervention);
            case 'continue':
                return await this._handleContinue(intervention);
            default:
                console.warn(`🎯 [HumanIntervention] 未知干预类型: ${type}`);
                return { success: false, error: `未知干预类型: ${type}` };
        }
    }

    // 🎯 处理暂停
    async _handlePause(intervention) {
        this.state.status = 'paused';
        this.state.interventionType = 'pause';
        intervention.status = 'active';
        
        this._emit('paused', intervention);
        
        // 返回暂停信息，让调用方等待
        return {
            success: true,
            action: 'wait',
            message: '研究任务已暂停，等待用户操作',
            interventionId: intervention.id
        };
    }

    // 🎯 处理中止
    async _handleAbort(intervention) {
        this.state.status = 'aborted';
        this.state.interventionType = 'abort';
        intervention.status = 'completed';
        
        this._emit('aborted', intervention);
        
        return {
            success: true,
            action: 'abort',
            message: '研究任务已被用户中止',
            interventionId: intervention.id
        };
    }

    // 🎯 处理信息补充
    async _handleProvideInfo(intervention) {
        this.state.status = 'waiting_for_input';
        this.state.interventionType = 'provide_info';
        intervention.status = 'waiting';
        
        this._emit('waiting_for_input', intervention);
        
        // 设置超时检查
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('等待用户输入超时'));
            }, this.config.maxWaitTimeForInput);
        });

        // 等待用户输入
        const userInputPromise = new Promise((resolve) => {
            const checkInput = () => {
                if (this.state.userInput) {
                    resolve(this.state.userInput);
                } else {
                    setTimeout(checkInput, 100);
                }
            };
            checkInput();
        });

        try {
            const input = await Promise.race([userInputPromise, timeoutPromise]);
            
            intervention.data.userInput = input;
            intervention.status = 'completed';
            this.state.status = 'running';
            this.state.interventionType = null;
            this.state.userInput = null;
            
            this._emit('input_received', intervention);
            
            return {
                success: true,
                action: 'continue',
                message: '已接收用户输入，继续执行',
                userInput: input,
                interventionId: intervention.id
            };
        } catch (error) {
            intervention.status = 'timeout';
            this.state.status = 'running';
            this.state.interventionType = null;
            
            this._emit('input_timeout', intervention);
            
            return {
                success: false,
                action: 'continue',
                message: '用户输入超时，继续执行',
                interventionId: intervention.id
            };
        }
    }

    // 🎯 处理修复后重试
    async _handleRetryWithFix(intervention) {
        this.state.status = 'waiting_for_input';
        this.state.interventionType = 'retry_with_fix';
        intervention.status = 'waiting';
        
        this._emit('waiting_for_fix', intervention);
        
        // 类似 provide_info 的等待逻辑，但专门用于修复
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('等待修复输入超时')), this.config.maxWaitTimeForInput);
        });

        const fixInputPromise = new Promise((resolve) => {
            const checkFix = () => {
                if (this.state.userInput) {
                    resolve(this.state.userInput);
                } else {
                    setTimeout(checkFix, 100);
                }
            };
            checkFix();
        });

        try {
            const fix = await Promise.race([fixInputPromise, timeoutPromise]);
            
            intervention.data.fix = fix;
            intervention.status = 'completed';
            this.state.status = 'running';
            this.state.interventionType = null;
            this.state.userInput = null;
            
            this._emit('fix_received', intervention);
            
            return {
                success: true,
                action: 'retry',
                message: '已接收修复信息，重试操作',
                fix: fix,
                interventionId: intervention.id
            };
        } catch (error) {
            intervention.status = 'timeout';
            this.state.status = 'running';
            this.state.interventionType = null;
            
            this._emit('fix_timeout', intervention);
            
            return {
                success: false,
                action: 'continue',
                message: '修复输入超时，继续执行',
                interventionId: intervention.id
            };
        }
    }

    // 🎯 处理继续
    async _handleContinue(intervention) {
        this.state.status = 'running';
        this.state.interventionType = null;
        intervention.status = 'completed';
        
        this._emit('continued', intervention);
        
        return {
            success: true,
            action: 'continue',
            message: '研究任务已继续',
            interventionId: intervention.id
        };
    }

    // 🎯 提供用户输入
    provideUserInput(input, interventionId = null) {
        console.log(`🎯 [HumanIntervention] 接收用户输入`, { input, interventionId });
        
        this.state.userInput = input;
        
        if (interventionId) {
            const intervention = this.interventionHistory.find(i => i.id === interventionId);
            if (intervention) {
                intervention.data.userInput = input;
            }
        }
        
        this._emit('user_input_provided', { input, interventionId });
        
        return { success: true, message: '用户输入已接收' };
    }

    // 🎯 自动干预检查
    shouldTriggerAutoIntervention(context) {
        if (!this.config.enableAutoIntervention) return null;
        
        const { consecutiveFailures, errorType, toolName, iteration } = context;
        
        // 🎯 连续失败自动暂停
        if (consecutiveFailures >= this.config.autoPauseOnConsecutiveFailures) {
            return {
                type: 'pause',
                reason: `检测到连续 ${consecutiveFailures} 次失败`,
                data: { consecutiveFailures, toolName, errorType }
            };
        }
        
        // 🎯 特定错误类型建议修复
        if (errorType === 'tool_unavailable' || errorType === 'connection_error') {
            return {
                type: 'retry_with_fix',
                reason: `检测到工具不可用错误: ${errorType}`,
                data: { toolName, errorType, suggestion: '请检查工具服务器状态' }
            };
        }
        
        // 🎯 长时间运行建议暂停
        if (iteration > 10) {
            return {
                type: 'pause', 
                reason: '研究任务已运行较长时间，建议检查进度',
                data: { iteration, suggestion: '是否需要调整研究方向？' }
            };
        }
        
        return null;
    }

    // 🎯 检查当前状态
    checkStatus() {
        return {
            state: { ...this.state },
            history: this.interventionHistory.slice(-5), // 最近5次干预
            stats: {
                totalInterventions: this.interventionHistory.length,
                activeInterventions: this.interventionHistory.filter(i => i.status === 'active' || i.status === 'waiting').length,
                lastInterventionTime: this.state.lastInterventionTime
            }
        };
    }

    // 🎯 事件管理
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    _emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`🎯 [HumanIntervention] 事件处理错误: ${event}`, error);
                }
            });
        }
        
        // 调用配置的回调
        if (this.config.interventionCallbacks[event]) {
            try {
                this.config.interventionCallbacks[event](data);
            } catch (error) {
                console.error(`🎯 [HumanIntervention] 配置回调错误: ${event}`, error);
            }
        }
    }

    _generateId() {
        return `intervention_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}