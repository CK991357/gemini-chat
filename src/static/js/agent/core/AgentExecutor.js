// src/static/js/agent/core/AgentExecutor.js

/**
 * @class AgentExecutor
 * @description 纯粹的ReAct循环执行器，包含错误恢复机制和智能超时优化
 */
import { ObservationUtils } from '../utils/ObservationUtils.js';
export class AgentExecutor {
    constructor(agentLogic, tools, callbackManager, config = {}) {
        this.agentLogic = agentLogic;
        this.tools = tools;
        this.callbackManager = callbackManager;
        
        this.maxIterations = config.maxIterations || 10;
        this.earlyStoppingMethod = config.earlyStoppingMethod || 'force';
        this.maxThinkTimeout = config.maxThinkTimeout || 120000; // 🎯 新增：最大思考超时配置
        
        // 🎯 新增：会话状态管理
        this.currentSession = {
            steps: [],
            startTime: null,
            endTime: null
        };
        
        console.log(`[AgentExecutor] 初始化完成，最大迭代次数: ${this.maxIterations}, 最大思考超时: ${this.maxThinkTimeout}ms`);
    }

    /**
     * 🎯 智能思考超时策略
     * @param {number} iteration - 当前迭代次数 (0-based)
     * @param {number} consecutiveErrors - 连续错误次数
     * @param {string} taskComplexity - 任务复杂度 ('low'|'medium'|'high')
     * @param {object} context - 执行上下文
     * @returns {number} 超时时间(毫秒)
     */
    _getThinkTimeout(iteration, consecutiveErrors, taskComplexity = 'medium', context = {}) {
        // 🎯 基础超时配置（基于实际使用数据优化）
        const baseTimeouts = {
            high: 75000,    // 复杂任务：75秒（代码分析、多步推理）
            medium: 35000,  // 中等任务：35秒（信息检索、简单分析）
            low: 18000      // 简单任务：18秒（单工具调用、简单查询）
        };
        
        let timeout = baseTimeouts[taskComplexity] || baseTimeouts.medium;
        
        // 🎯 迭代策略调整
        if (iteration === 0) {
            // 首次思考：给予充分规划时间
            timeout = Math.round(timeout * 1.6); // 增加60%
            console.log(`🧠 首次思考，超时延长至: ${timeout}ms`);
        } else if (iteration > 3) {
            // 后期迭代：逐渐收紧，避免无限循环
            timeout = Math.round(timeout * 0.8); // 减少20%
            console.log(`⚡ 后期迭代${iteration}，超时收紧至: ${timeout}ms`);
        }
        
        // 🎯 错误恢复策略
        if (consecutiveErrors > 0) {
            const errorPenalty = Math.min(consecutiveErrors * 0.3, 0.7); // 最多减少70%
            timeout = Math.round(timeout * (1 - errorPenalty));
            timeout = Math.max(timeout, 10000); // 最低10秒保障
            console.log(`🔄 连续错误${consecutiveErrors}次，超时调整至: ${timeout}ms`);
        }
        
        // 🎯 上下文感知调整
        if (context.availableTools && context.availableTools.length > 5) {
            // 工具较多时，选择困难，需要更多思考时间
            timeout = Math.round(timeout * 1.2);
        }
        
        // 🎯 安全上限和个人使用友好
        return Math.min(timeout, this.maxThinkTimeout);
    }

    /**
     * 🎯 增强的任务复杂度评估
     */
    _getTaskComplexity(context) {
        // 检查多层嵌套结构
        if (context?.taskAnalysis?.complexity) {
            return context.taskAnalysis.complexity;
        }
        
        // 🎯 基于可用工具数量推断复杂度
        const availableTools = context.availableTools || Object.keys(this.tools);
        if (availableTools.length >= 5) return 'high';
        if (availableTools.length >= 3) return 'medium';
        return 'low';
    }

    /**
     * 🎯 增强的ReAct循环执行（含智能超时和错误恢复）
     */
    async invoke(inputs) {
        const runId = this.callbackManager.generateRunId();
        const { userMessage, context } = inputs;
        
        console.log(`[AgentExecutor] 开始执行Agent循环，输入: "${userMessage.substring(0, 100)}..."`);

        // 🎯 启动思考过程显示
        window.dispatchEvent(new CustomEvent('agent:session_started', {
            detail: { 
                sessionId: runId, 
                userMessage, 
                maxIterations: this.maxIterations 
            }
        }));

        // 🎯 初始化会话状态
        this.currentSession = {
            steps: [],
            startTime: Date.now(),
            endTime: null,
            sessionId: runId
        };

        // 🎯 Agent开始事件
        await this.callbackManager.invokeEvent('on_agent_start', {
            name: 'agent_executor',
            run_id: runId,
            data: { 
                userMessage,
                maxIterations: this.maxIterations,
                availableTools: Object.keys(this.tools),
                maxThinkTimeout: this.maxThinkTimeout
            }
        });

        const intermediateSteps = [];
        let finalAnswer = null;
        let iteration = 0;
        let consecutiveErrors = 0; // 🎯 新增：连续错误计数

        // 🎯 使用增强的任务复杂度评估
        const taskComplexity = this._getTaskComplexity(context);
        console.log(`🎯 任务复杂度评估: ${taskComplexity}`);

        // 🎯 ReAct循环核心
        for (iteration = 0; iteration < this.maxIterations; iteration++) {
            console.log(`[AgentExecutor] 第 ${iteration + 1} 次迭代开始`);
            
            // 🎯 迭代开始
            window.dispatchEvent(new CustomEvent('agent:iteration_update', {
                detail: { 
                    iteration: iteration + 1, 
                    total: this.maxIterations,
                    thinking: `开始分析第 ${iteration + 1} 次迭代...` 
                }
            }));
            
            // 🎯 检查连续错误，避免无限循环（放宽到5次）
            if (consecutiveErrors >= 5) {
                console.warn(`[AgentExecutor] 连续错误过多 (${consecutiveErrors}次)，提前终止`);
                finalAnswer = this._handleConsecutiveErrors(intermediateSteps, consecutiveErrors);
                break;
            }

            // 🎯 迭代开始事件
            await this.callbackManager.invokeEvent('on_agent_iteration_start', {
                name: 'agent_iteration',
                run_id: runId,
                data: {
                    iteration: iteration + 1,
                    intermediateSteps: intermediateSteps.length,
                    consecutiveErrors: consecutiveErrors,
                    taskComplexity: taskComplexity
                }
            });

            // 🎯 修复：将变量提升到作用域顶部
            let action, observation, thinkTimeout;

            try {
                // 🎯 思考开始
                window.dispatchEvent(new CustomEvent('agent:thinking', {
                    detail: { 
                        content: `正在分析当前状况并规划下一步行动...`,
                        type: 'thinking' 
                    }
                }));

                // 🎯 动态计算思考超时时间
                thinkTimeout = this._getThinkTimeout(
                    iteration, 
                    consecutiveErrors, 
                    taskComplexity,
                    { 
                        availableTools: Object.keys(this.tools)
                    }
                );
                
                console.log(`⏱️ 第${iteration + 1}次思考超时: ${thinkTimeout}ms`);

                // 🎯 步骤1: 思考 (Think) - 使用动态超时保护
                const thinkPromise = this.agentLogic.plan(
                    intermediateSteps, 
                    { userMessage, context },
                    { runId, callbackManager: this.callbackManager }
                );
                
                // 动态思考超时
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`思考超时 (${thinkTimeout}ms)`)), thinkTimeout);
                });
                
                action = await Promise.race([thinkPromise, timeoutPromise]);
                consecutiveErrors = 0; // 🎯 重置连续错误计数

                // 🎯 添加思考步骤
                window.dispatchEvent(new CustomEvent('agent:step_added', {
                    detail: {
                        step: {
                            type: 'think',
                            description: action.log || '模型思考过程',
                            timestamp: Date.now(),
                            iteration: iteration + 1
                        }
                    }
                }));

                // 🎯 检查是否获得最终答案
                if (action.type === 'final_answer') {
                    finalAnswer = action.answer;
                    console.log(`[AgentExecutor] 获得最终答案，结束循环`);
                    
                    // 🎯 添加最终答案步骤
                    window.dispatchEvent(new CustomEvent('agent:step_added', {
                        detail: {
                            step: {
                                type: 'final_answer',
                                description: `生成最终答案: ${finalAnswer.substring(0, 100)}...`,
                                timestamp: Date.now(),
                                iteration: iteration + 1
                            }
                        }
                    }));
                    
                    await this.callbackManager.invokeEvent('on_agent_iteration_end', {
                        name: 'agent_iteration',
                        run_id: runId,
                        data: {
                            iteration: iteration + 1,
                            action: action,
                            isFinal: true,
                            thinkTimeout: thinkTimeout
                        }
                    });
                    break;
                }

                // 🎯 步骤2: 执行工具调用 (Act)
                if (action.type === 'tool_call') {
                    // 🎯 添加行动步骤
                    const actionStepIndex = this.currentSession.steps.length;
                    window.dispatchEvent(new CustomEvent('agent:step_added', {
                        detail: {
                            step: {
                                type: 'action',
                                description: `执行工具: ${action.tool_name}`,
                                tool: action.tool_name,
                                parameters: action.parameters,
                                timestamp: Date.now(),
                                iteration: iteration + 1
                            }
                        }
                    }));

                    // 🎯 增强：传递思考超时信息给工具执行
                    observation = await this._executeAction(action, runId, thinkTimeout);
                    
                    // 🎯 完成行动步骤
                    window.dispatchEvent(new CustomEvent('agent:step_completed', {
                        detail: {
                            index: actionStepIndex,
                            result: observation.output,
                            success: !observation.isError
                        }
                    }));
                    
                    // 🎯 检查工具执行结果
                    if (observation.isError) {
                        consecutiveErrors++;
                        console.warn(`[AgentExecutor] 工具执行失败，连续错误: ${consecutiveErrors}`);
                    } else {
                        consecutiveErrors = 0; // 成功则重置
                    }
                    
                    intermediateSteps.push({ action, observation });
                    
                    // 🎯 检查是否应该提前停止
                    if (this._shouldEarlyStop(observation)) {
                        console.log(`[AgentExecutor] 提前停止条件触发`);
                        finalAnswer = this._handleEarlyStop(observation, intermediateSteps);
                        break;
                    }
                } else {
                    throw new Error(`未知的Action类型: ${action.type}`);
                }

            } catch (error) {
                consecutiveErrors++;
                console.error(`[AgentExecutor] 第 ${iteration + 1} 次迭代出错:`, error);
                
                // 🎯 创建错误观察结果
                observation = {
                    success: false,
                    output: `❌ 步骤执行失败: ${error.message}`,
                    error: error.message,
                    isError: true
                };
                
                if (action) {
                    intermediateSteps.push({ action, observation });
                    
                    // 🎯 标记步骤为错误状态
                    window.dispatchEvent(new CustomEvent('agent:step_error', {
                        detail: {
                            index: this.currentSession.steps.length - 1,
                            error: error.message
                        }
                    }));
                }
                
                // 🎯 错误事件 - 修复：现在可以安全访问 thinkTimeout
                await this.callbackManager.invokeEvent('on_agent_iteration_error', {
                    name: 'agent_iteration',
                    run_id: runId,
                    data: {
                        iteration: iteration + 1,
                        error: error.message,
                        action: action,
                        consecutiveErrors: consecutiveErrors,
                        thinkTimeout: thinkTimeout // ✅ 修复：安全访问
                    }
                });

                // 🎯 如果是严重错误，直接终止（同样放宽条件）
                if (this._isCriticalError(error) || consecutiveErrors >= 5) {
                    finalAnswer = this._handleCriticalError(error, intermediateSteps, consecutiveErrors);
                    break;
                }
                
                continue;
            }

            // 🎯 迭代成功结束事件
            await this.callbackManager.invokeEvent('on_agent_iteration_end', {
                name: 'agent_iteration',
                run_id: runId,
                data: {
                    iteration: iteration + 1,
                    action: action,
                    intermediateSteps: intermediateSteps.length,
                    consecutiveErrors: consecutiveErrors,
                    thinkTimeout: thinkTimeout // 🎯 记录当前迭代的超时时间
                }
            });
        }

        // 🎯 处理循环结束
        if (!finalAnswer) {
            if (iteration >= this.maxIterations) {
                finalAnswer = this._handleMaxIterations(intermediateSteps);
            } else {
                finalAnswer = "Agent执行意外结束";
            }
        }

        // 🎯 更新会话结束时间
        this.currentSession.endTime = Date.now();

        // 🎯 会话完成
        const finalResult = {
            success: !!finalAnswer,
            output: finalAnswer,
            intermediateSteps,
            agentRunId: runId,
            type: 'agent_execution',
            iterations: iteration + 1,
            hasErrors: intermediateSteps.some(step => step.observation.isError),
            taskComplexity: taskComplexity
        };

        window.dispatchEvent(new CustomEvent('agent:session_completed', {
            detail: { 
                result: finalResult,
                sessionId: runId,
                duration: this.currentSession.endTime - this.currentSession.startTime
            }
        }));

        // 🎯 Agent结束事件
        await this.callbackManager.invokeEvent('on_agent_end', {
            name: 'agent_executor',
            run_id: runId,
            data: {
                finalAnswer,
                totalIterations: iteration + 1,
                intermediateSteps: intermediateSteps.length,
                success: !!finalAnswer,
                hasErrors: intermediateSteps.some(step => step.observation.isError),
                consecutiveErrors: consecutiveErrors,
                taskComplexity: taskComplexity,
                maxThinkTimeout: this.maxThinkTimeout
            }
        });

        return finalResult;
    }

    /**
     * 🎯 执行行动（工具调用）- 增强版本
     */
    async _executeAction(action, runId, thinkTimeout = null) {
        const { tool_name, parameters } = action;
        
        console.log(`[AgentExecutor] 执行工具: ${tool_name}`, parameters);

        // 🎯 工具开始事件
        await this.callbackManager.invokeEvent('on_tool_start', {
            name: tool_name,
            run_id: runId,
            data: {
                tool_name,
                parameters,
                thinkTimeout: thinkTimeout // 🎯 传递思考超时信息
            }
        });

        try {
            const tool = this.tools[tool_name];
            if (!tool) {
                throw new Error(`未知的工具: ${tool_name}。可用工具: ${Object.keys(this.tools).join(', ')}`);
            }

            // 🎯 执行工具调用（通过中间件包装）- 增强：传递思考超时信息
            const executionContext = { 
                runId, 
                callbackManager: this.callbackManager 
            };
            
            // 🎯 如果提供了思考超时，传递给工具作为参考
            if (thinkTimeout !== null) {
                executionContext.thinkTimeout = thinkTimeout;
                console.log(`⏱️ 工具执行协调: 当前思考超时 ${thinkTimeout}ms`);
            }

            const observation = await this.callbackManager.wrapToolCall(
                { toolName: tool_name, parameters },
                async (request) => {
                    return await tool.invoke(request.parameters, executionContext);
                }
            );

            // 🎯 工具结束事件
            await this.callbackManager.invokeEvent('on_tool_end', {
                name: tool_name,
                run_id: runId,
                data: {
                    tool_name,
                    result: observation,
                    success: true,
                    thinkTimeout: thinkTimeout // 🎯 记录思考超时信息
                }
            });

            return observation;

        } catch (error) {
            console.error(`[AgentExecutor] 工具执行失败:`, error);
            
            // 🎯 工具错误事件
            await this.callbackManager.invokeEvent('on_tool_error', {
                name: tool_name,
                run_id: runId,
                data: {
                    tool_name,
                    error: error.message,
                    parameters,
                    thinkTimeout: thinkTimeout // 🎯 记录思考超时信息
                }
            });

            // 🎯 返回错误信息作为观察结果
            return {
                success: false,
                output: `❌ 工具"${tool_name}"执行失败: ${error.message}`,
                error: error.message,
                isError: true
            };
        }
    }

    /**
     * 🎯 检查是否应该提前停止
     */
    _shouldEarlyStop(observation) {
        // 🎯 可以根据业务逻辑实现提前停止条件（安全处理各种类型的 observation.output）
        if (!observation) return false;

        const outputText = this._extractOutputText(observation);
        if (!outputText) return false;

        if (
            outputText.includes("ERROR_CRITICAL") ||
            outputText.includes("无法继续") ||
            outputText.includes("终止执行")
        ) {
            return true;
        }

        return false;
    }

    /**
     * 🎯 处理提前停止
     */
    _handleEarlyStop(observation, _intermediateSteps) {
        const reason = this._extractOutputText(observation) || '未知原因';
        return `执行提前停止。原因: ${reason}`;
    }

    /**
     * 从 observation 中安全提取可读字符串输出
     */
    /**
     * 从 observation 中安全提取可读字符串输出
     */
    _extractOutputText(observation) {
        try {
            return ObservationUtils.getOutputText(observation) || '';
        } catch (error) {
            console.warn('[AgentExecutor] _extractOutputText 失败:', error);
            // 🎯 简化的安全兜底
            try {
                if (typeof observation === 'string') return observation;
                if (observation && typeof observation === 'object') {
                    if (typeof observation.output === 'string') return observation.output;
                    if (observation.error) return String(observation.error);
                    return JSON.stringify(observation);
                }
                return String(observation);
            } catch {
                return '[无法提取输出]';
            }
        }
    }

    /**
     * 🎯 处理达到最大迭代次数
     */
    _handleMaxIterations(intermediateSteps) {
        const successfulSteps = intermediateSteps.filter(step => !step.observation.isError).length;
        const failedSteps = intermediateSteps.filter(step => step.observation.isError).length;
        
        let summary = `🤖 已达到最大迭代次数 (${this.maxIterations})。\n\n`;
        summary += `执行统计: ${successfulSteps}个步骤成功, ${failedSteps}个步骤失败\n\n`;
        summary += `执行摘要:\n`;
        
        intermediateSteps.forEach((step, index) => {
            const status = step.observation.isError ? '❌' : '✅';
            summary += `${index + 1}. ${step.action.tool_name} ${status}\n`;
        });

        summary += `\n请尝试简化您的问题或分步骤提问。`;
        
        return summary;
    }

    /**
     * 🎯 判断是否为严重错误
     */
    _isCriticalError(error) {
        const criticalPatterns = [
            '无法解析',
            '语法错误',
            '无效的JSON',
            '未定义的工具',
            'Maximum call stack'
        ];
        
        return criticalPatterns.some(pattern => 
            error.message.includes(pattern)
        );
    }

    /**
     * 🎯 处理连续错误
     */
    _handleConsecutiveErrors(_intermediateSteps, errorCount) {
        return `🤖 Agent执行因连续错误过多而终止（${errorCount}次连续错误）。\n\n请尝试简化问题或检查工具可用性。`;
    }

    /**
     * 🎯 处理严重错误
     */
    _handleCriticalError(error, _intermediateSteps, consecutiveErrors) {
        return `🤖 Agent执行遇到严重错误: ${error.message}\n\n连续错误次数: ${consecutiveErrors}\n\n建议检查问题表述或稍后重试。`;
    }

    /**
     * 🎯 获取执行器状态
     */
    getStatus() {
        return {
            maxIterations: this.maxIterations,
            availableTools: Object.keys(this.tools),
            toolsCount: Object.keys(this.tools).length,
            maxThinkTimeout: this.maxThinkTimeout,
            type: 'react_agent_executor',
            currentSession: this.currentSession
        };
    }
}