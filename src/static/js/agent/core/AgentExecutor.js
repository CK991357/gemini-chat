// src/static/js/agent/core/AgentExecutor.js

/**
 * @class AgentExecutor
 * @description 纯粹的ReAct循环执行器，包含错误恢复机制
 */
export class AgentExecutor {
    constructor(agentLogic, tools, callbackManager, config = {}) {
        this.agentLogic = agentLogic;
        this.tools = tools;
        this.callbackManager = callbackManager;
        
        this.maxIterations = config.maxIterations || 10;
        this.earlyStoppingMethod = config.earlyStoppingMethod || 'force';
        
        console.log(`[AgentExecutor] 初始化完成，最大迭代次数: ${this.maxIterations}`);
    }

    /**
     * 🎯 增强的ReAct循环执行（含更好的错误恢复）
     */
    async invoke(inputs) {
        const runId = this.callbackManager.generateRunId();
        const { userMessage, context } = inputs;
        
        console.log(`[AgentExecutor] 开始执行Agent循环，输入: "${userMessage.substring(0, 100)}..."`);

        // 🎯 Agent开始事件
        await this.callbackManager.invokeEvent('on_agent_start', {
            name: 'agent_executor',
            run_id: runId,
            data: { 
                userMessage,
                maxIterations: this.maxIterations,
                availableTools: Object.keys(this.tools)
            }
        });

        const intermediateSteps = [];
        let finalAnswer = null;
        let iteration = 0;
        let consecutiveErrors = 0; // 🎯 新增：连续错误计数

        // 🎯 ReAct循环核心
        for (iteration = 0; iteration < this.maxIterations; iteration++) {
            console.log(`[AgentExecutor] 第 ${iteration + 1} 次迭代开始`);
            
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
                    consecutiveErrors: consecutiveErrors
                }
            });

            let action, observation;

            try {
                // 🎯 步骤1: 思考 (Think) - 添加超时保护
                const thinkPromise = this.agentLogic.plan(
                    intermediateSteps, 
                    { userMessage, context },
                    { runId, callbackManager: this.callbackManager }
                );
                
                // 30秒思考超时
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('思考超时')), 30000);
                });
                
                action = await Promise.race([thinkPromise, timeoutPromise]);
                consecutiveErrors = 0; // 🎯 重置连续错误计数

                // 🎯 检查是否获得最终答案
                if (action.type === 'final_answer') {
                    finalAnswer = action.answer;
                    console.log(`[AgentExecutor] 获得最终答案，结束循环`);
                    
                    await this.callbackManager.invokeEvent('on_agent_iteration_end', {
                        name: 'agent_iteration',
                        run_id: runId,
                        data: {
                            iteration: iteration + 1,
                            action: action,
                            isFinal: true
                        }
                    });
                    break;
                }

                // 🎯 步骤2: 执行工具调用 (Act)
                if (action.type === 'tool_call') {
                    observation = await this._executeAction(action, runId);
                    
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
                }
                
                // 🎯 错误事件
                await this.callbackManager.invokeEvent('on_agent_iteration_error', {
                    name: 'agent_iteration',
                    run_id: runId,
                    data: {
                        iteration: iteration + 1,
                        error: error.message,
                        action: action,
                        consecutiveErrors: consecutiveErrors
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
                    consecutiveErrors: consecutiveErrors
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
                consecutiveErrors: consecutiveErrors
            }
        });

        return {
            success: !!finalAnswer,
            output: finalAnswer,
            intermediateSteps,
            agentRunId: runId,
            type: 'agent_execution',
            iterations: iteration + 1,
            hasErrors: intermediateSteps.some(step => step.observation.isError)
        };
    }

    /**
     * 🎯 执行行动（工具调用）
     */
    async _executeAction(action, runId) {
        const { tool_name, parameters } = action;
        
        console.log(`[AgentExecutor] 执行工具: ${tool_name}`, parameters);

        // 🎯 工具开始事件
        await this.callbackManager.invokeEvent('on_tool_start', {
            name: tool_name,
            run_id: runId,
            data: {
                tool_name,
                parameters
            }
        });

        try {
            const tool = this.tools[tool_name];
            if (!tool) {
                throw new Error(`未知的工具: ${tool_name}。可用工具: ${Object.keys(this.tools).join(', ')}`);
            }

            // 🎯 执行工具调用（通过中间件包装）
            const observation = await this.callbackManager.wrapToolCall(
                { toolName: tool_name, parameters },
                async (request) => {
                    return await tool.invoke(request.parameters, { 
                        runId, 
                        callbackManager: this.callbackManager 
                    });
                }
            );

            // 🎯 工具结束事件
            await this.callbackManager.invokeEvent('on_tool_end', {
                name: tool_name,
                run_id: runId,
                data: {
                    tool_name,
                    result: observation,
                    success: true
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
                    parameters
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
        // 🎯 可以根据业务逻辑实现提前停止条件
        if (observation.output && (
            observation.output.includes("ERROR_CRITICAL") ||
            observation.output.includes("无法继续") ||
            observation.output.includes("终止执行")
        )) {
            return true;
        }
        return false;
    }

    /**
     * 🎯 处理提前停止
     */
    _handleEarlyStop(observation, intermediateSteps) {
        return `执行提前停止。原因: ${observation.output}`;
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
     * 🎯 新增：判断是否为严重错误
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
     * 🎯 新增：处理连续错误
     */
    _handleConsecutiveErrors(intermediateSteps, errorCount) {
        return `🤖 Agent执行因连续错误过多而终止（${errorCount}次连续错误）。\n\n请尝试简化问题或检查工具可用性。`;
    }

    /**
     * 🎯 新增：处理严重错误
     */
    _handleCriticalError(error, intermediateSteps, consecutiveErrors) {
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
            type: 'react_agent_executor'
        };
    }
}