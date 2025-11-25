// src/static/js/agent/middlewares/HumanInterventionMiddleware.js

/**
 * @class HumanInterventionMiddleware  
 * @description 人类干预中间件 - 在工具调用和Agent决策中插入干预点
 */
export class HumanInterventionMiddleware {
    constructor(interventionManager, config = {}) {
        this.name = 'HumanInterventionMiddleware';
        this.interventionManager = interventionManager;
        
        this.config = {
            enableToolFailureIntervention: config.enableToolFailureIntervention !== false,
            enableAutoPause: config.enableAutoPause !== false,
            enableProgressCheck: config.enableProgressCheck !== false,
            checkInterval: config.checkInterval || 3, // 每3次迭代检查一次
            maxConsecutiveFailures: config.maxConsecutiveFailures || 3
        };
        
        this.executionContext = {
            consecutiveFailures: 0,
            lastFailureTime: null,
            totalIterations: 0,
            toolCallStats: {},
            lastInterventionCheck: 0
        };
        
        console.log('🎯 [HumanInterventionMiddleware] 初始化完成');
    }

    async wrapToolCall(request, next) {
        const { toolName, parameters } = request;
        
        // 🎯 检查当前干预状态
        const interventionStatus = this.interventionManager.checkStatus();
        if (interventionStatus.state.status !== 'running') {
            console.log(`🎯 [InterventionMiddleware] 任务处于 ${interventionStatus.state.status} 状态，等待...`);
            
            const result = await this._waitForInterventionResolution();
            if (result.action === 'abort') {
                throw new Error(`任务已被中止: ${result.message}`);
            }
        }
        
        try {
            // 🎯 执行工具调用
            const result = await next(request);
            
            // 🎯 成功时重置连续失败计数
            if (result.success !== false) {
                this.executionContext.consecutiveFailures = 0;
            }
            
            return result;
            
        } catch (error) {
            // 🎯 处理工具调用失败
            this.executionContext.consecutiveFailures++;
            this.executionContext.lastFailureTime = Date.now();
            
            // 🎯 更新工具统计
            if (!this.executionContext.toolCallStats[toolName]) {
                this.executionContext.toolCallStats[toolName] = { calls: 0, failures: 0 };
            }
            this.executionContext.toolCallStats[toolName].calls++;
            this.executionContext.toolCallStats[toolName].failures++;
            
            console.warn(`🎯 [InterventionMiddleware] 工具 ${toolName} 调用失败，连续失败: ${this.executionContext.consecutiveFailures}`);
            
            // 🎯 检查是否需要自动干预
            if (this.config.enableToolFailureIntervention) {
                const shouldIntervene = this._shouldTriggerToolFailureIntervention(toolName, error);
                if (shouldIntervene) {
                    await this._handleToolFailureIntervention(toolName, error, parameters);
                }
            }
            
            throw error;
        }
    }

    async wrapAgentIteration(iterationContext, next) {
        this.executionContext.totalIterations++;
        
        // 🎯 定期进度检查
        if (this.config.enableProgressCheck && 
            this.executionContext.totalIterations - this.executionContext.lastInterventionCheck >= this.config.checkInterval) {
            
            this.executionContext.lastInterventionCheck = this.executionContext.totalIterations;
            
            const shouldIntervene = this._shouldTriggerProgressIntervention(iterationContext);
            if (shouldIntervene) {
                await this._handleProgressIntervention(iterationContext);
            }
        }
        
        // 🎯 检查干预状态
        const interventionStatus = this.interventionManager.checkStatus();
        if (interventionStatus.state.status !== 'running') {
            const result = await this._waitForInterventionResolution();
            if (result.action === 'abort') {
                return { 
                    type: 'abort', 
                    reason: result.message,
                    intermediateSteps: iterationContext.intermediateSteps || []
                };
            }
        }
        
        return await next(iterationContext);
    }

    // 🎯 判断是否需要工具失败干预
    _shouldTriggerToolFailureIntervention(toolName, error) {
        // 连续失败超过阈值
        if (this.executionContext.consecutiveFailures >= this.config.maxConsecutiveFailures) {
            return true;
        }
        
        // 特定错误类型
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('connection refused') || 
            errorMessage.includes('econnrefused') ||
            errorMessage.includes('500') ||
            errorMessage.includes('service unavailable')) {
            return true;
        }
        
        return false;
    }

    // 🎯 处理工具失败干预
    async _handleToolFailureIntervention(toolName, error, parameters) {
        console.log(`🎯 [InterventionMiddleware] 触发工具失败干预: ${toolName}`);
        
        const interventionContext = {
            consecutiveFailures: this.executionContext.consecutiveFailures,
            errorType: this._classifyError(error),
            toolName,
            iteration: this.executionContext.totalIterations,
            parameters
        };
        
        // 🎯 自动干预建议
        const autoIntervention = this.interventionManager.shouldTriggerAutoIntervention(interventionContext);
        if (autoIntervention && this.config.enableAutoPause) {
            console.log(`🎯 [InterventionMiddleware] 自动触发干预: ${autoIntervention.type}`);
            
            const result = await this.interventionManager.requestIntervention(
                autoIntervention.type, 
                autoIntervention.data
            );
            
            return result;
        }
        
        // 🎯 发送干预建议事件
        this.interventionManager._emit('intervention_suggested', {
            type: 'retry_with_fix',
            reason: `工具 ${toolName} 连续失败 ${this.executionContext.consecutiveFailures} 次`,
            context: interventionContext,
            suggestions: [
                '检查工具服务器是否启动',
                '验证网络连接',
                '检查工具参数配置',
                '尝试使用备用工具'
            ]
        });
    }

    // 🎯 判断是否需要进度干预
    _shouldTriggerProgressIntervention(iterationContext) {
        const { intermediateSteps = [], researchPlan } = iterationContext;
        
        // 🎯 检查信息增益
        const lowInfoGainSteps = intermediateSteps.filter(step => 
            step.informationGain < 0.1
        ).length;
        
        if (lowInfoGainSteps >= 2) {
            return true;
        }
        
        // 🎯 检查计划完成度
        if (researchPlan && this._calculatePlanCompletion(researchPlan, intermediateSteps) > 0.8) {
            return true;
        }
        
        return false;
    }

    // 🎯 处理进度干预
    async _handleProgressIntervention(iterationContext) {
        const { intermediateSteps = [], researchPlan } = iterationContext;
        
        const progressContext = {
            iteration: this.executionContext.totalIterations,
            planCompletion: researchPlan ? this._calculatePlanCompletion(researchPlan, intermediateSteps) : 0,
            stepsWithLowGain: intermediateSteps.filter(step => step.informationGain < 0.1).length,
            totalSteps: intermediateSteps.length
        };
        
        this.interventionManager._emit('progress_check', {
            context: progressContext,
            suggestions: [
                '研究进度良好，是否继续深入？',
                '检测到部分步骤信息增益较低，是否需要调整研究方向？',
                '计划完成度较高，是否准备生成报告？'
            ]
        });
    }

    // 🎯 等待干预解决
    async _waitForInterventionResolution() {
        return new Promise((resolve) => {
            const checkResolution = () => {
                const status = this.interventionManager.checkStatus();
                
                if (status.state.status === 'running') {
                    resolve({ action: 'continue', message: '干预已解决，继续执行' });
                    return;
                }
                
                if (status.state.status === 'aborted') {
                    resolve({ action: 'abort', message: '任务已被中止' });
                    return;
                }
                
                // 继续等待
                setTimeout(checkResolution, 500);
            };
            
            checkResolution();
        });
    }

    // 🎯 错误分类
    _classifyError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('connection') || message.includes('econn')) {
            return 'connection_error';
        } else if (message.includes('timeout')) {
            return 'timeout_error';
        } else if (message.includes('rate limit') || message.includes('429')) {
            return 'rate_limit_error';
        } else if (message.includes('500') || message.includes('server error')) {
            return 'server_error';
        } else if (message.includes('not found') || message.includes('404')) {
            return 'not_found_error';
        } else {
            return 'unknown_error';
        }
    }

    _calculatePlanCompletion(plan, steps) {
        if (!plan || !steps || steps.length === 0) return 0;
        
        const completedSteps = plan.research_plan.filter(step => 
            steps.some(s => s.action?.thought?.includes(step.sub_question) || 
                          s.observation?.includes(step.sub_question))
        ).length;
        
        return completedSteps / plan.research_plan.length;
    }

    // 🎯 获取执行上下文
    getExecutionContext() {
        return { ...this.executionContext };
    }

    // 🎯 重置执行上下文
    resetExecutionContext() {
        this.executionContext = {
            consecutiveFailures: 0,
            lastFailureTime: null,
            totalIterations: 0,
            toolCallStats: {},
            lastInterventionCheck: 0
        };
    }
}