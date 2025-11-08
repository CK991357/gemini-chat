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
     * 🎯 第一阶段：工具输出标准化 - 无风险版本
     * 保持所有原始数据，只添加标准化结构
     */
    _normalizeToolOutput(rawResult, toolName) {
        // 🎯 基础标准化结构 - 完全向后兼容
        const normalized = {
            // 保持现有字段不变
            success: rawResult.success !== undefined ? rawResult.success : true,
            output: rawResult.output || '',
            error: rawResult.error || null,
            isError: rawResult.isError || false,
            
            // 🎯 新增：原始数据保护
            raw: rawResult,  // 完整保留原始数据
            
            // 🎯 新增：工具标识和时间戳
            tool: toolName,
            timestamp: Date.now(),
            
            // 🎯 新增：元数据（不影响现有逻辑）
            metadata: {
                normalized: true,
                version: '1.0'
            }
        };

        // 🎯 智能生成Agent可读输出（不修改原始数据）
        if (!normalized.output || normalized.output.length < 10) {
            normalized.output = this._generateAgentReadableOutput(rawResult, toolName);
        }

        return normalized;
    }

    /**
     * 🎯 生成Agent可读输出（安全版本）
     */
    _generateAgentReadableOutput(rawResult, toolName) {
        // 🎯 根据工具类型生成友好的摘要
        switch (toolName) {
            case 'python_sandbox':
                return this._formatPythonOutput(rawResult);
                
            case 'tavily_search':
                return this._formatSearchOutput(rawResult);
                
            case 'crawl4ai':
                return this._formatCrawlerOutput(rawResult);
                
            default:
                return this._formatGenericOutput(rawResult);
        }
    }

    /**
     * 🎯 Python沙箱输出格式化
     */
    _formatPythonOutput(rawResult) {
        if (rawResult.images && rawResult.images.length > 0) {
            return `📊 代码执行完成，生成了 ${rawResult.images.length} 个可视化结果。`;
        }
        
        if (rawResult.stdout) {
            const output = rawResult.stdout.length > 500 
                ? rawResult.stdout.substring(0, 500) + '...' 
                : rawResult.stdout;
            return `📊 代码执行完成:\n${output}`;
        }
        
        return '📊 代码执行完成（无输出）';
    }

    /**
     * 🎯 搜索工具输出格式化
     */
    _formatSearchOutput(rawResult) {
        if (Array.isArray(rawResult.data)) {
            const count = rawResult.data.length;
            const sample = rawResult.data.slice(0, 2).map(item => 
                `• ${item.title || '无标题'}: ${item.content?.substring(0, 100)}...`
            ).join('\n');
            
            return `🔍 搜索到 ${count} 条结果:\n${sample}${count > 2 ? `\n... 还有 ${count - 2} 条结果` : ''}`;
        }
        
        return '🔍 搜索完成';
    }

    /**
     * 🎯 爬虫工具输出格式化
     */
    _formatCrawlerOutput(rawResult) {
        if (rawResult.content) {
            const content = rawResult.content.length > 500 
                ? rawResult.content.substring(0, 500) + '...' 
                : rawResult.content;
            return `🌐 网页抓取完成:\n${content}`;
        }
        
        if (rawResult.data) {
            return `🌐 网页抓取完成，数据长度: ${JSON.stringify(rawResult.data).length} 字符`;
        }
        
        return '🌐 网页抓取完成';
    }

    /**
     * 🎯 通用输出格式化
     */
    _formatGenericOutput(rawResult) {
        // 安全地提取可读内容
        const content = rawResult.content || rawResult.data || rawResult.result;
        
        if (typeof content === 'string' && content.trim()) {
            return content.length > 1000 
                ? content.substring(0, 1000) + '...' 
                : content;
        }
        
        return '工具执行完成';
    }

    /**
     * 🎯 第一阶段：智能错误重试 - 无风险版本
     */
    async _executeActionWithRetry(action, runId, maxRetries = 2) {
        const { tool_name, parameters } = action;
        
        // 🎯 安全的重试配置
        const retryConfig = this._getSafeRetryConfig(tool_name);
        const actualRetries = Math.min(maxRetries, retryConfig.maxRetries);
        
        let lastAttempt;
        
        for (let attempt = 1; attempt <= actualRetries + 1; attempt++) {
            try {
                console.log(`🔄 ${tool_name} 第 ${attempt} 次执行`);
                
                // 🎯 使用现有的 _executeAction 逻辑，只包装工具调用部分
                const result = await this._executeSingleAction(action, runId);
                
                if (result.success || !result.isError) {
                    return result;
                }
                
                lastAttempt = result;
                
                // 🎯 检查是否可重试
                if (this._isSafeToRetry(result) && attempt <= actualRetries) {
                    const delay = retryConfig.getDelay(attempt);
                    console.log(`⏱️ ${tool_name} 等待 ${delay}ms 后重试`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                break;
                
            } catch (error) {
                console.error(`${tool_name} 执行异常:`, error);
                lastAttempt = this._normalizeToolOutput({
                    success: false,
                    output: `❌ 工具执行异常: ${error.message}`,
                    error: error.message,
                    isError: true
                }, tool_name);
                
                if (this._isSafeToRetry(error) && attempt <= actualRetries) {
                    const delay = retryConfig.getDelay(attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                break;
            }
        }
        
        // 🎯 返回最后一次尝试的结果（保持现有错误格式）
        return lastAttempt;
    }

    /**
     * 🎯 安全的重试配置 - 无风险版本
     */
    _getSafeRetryConfig(toolName) {
        // 🎯 保守的重试策略，避免对关键工具过度重试
        const configs = {
            'tavily_search': {
                maxRetries: 2,
                getDelay: (attempt) => Math.min(1000 * attempt, 3000) // 1s, 2s, 3s
            },
            'crawl4ai': {
                maxRetries: 1, 
                getDelay: () => 2000
            }
        };
        
        // 🎯 默认配置：大多数工具不重试
        return configs[toolName] || { 
            maxRetries: 0, 
            getDelay: () => 0 
        };
    }

    /**
     * 🎯 安全检查是否可重试
     */
    _isSafeToRetry(errorOrResult) {
        // 🎯 只对网络相关错误进行重试
        const errorMessage = errorOrResult.message || errorOrResult.error || '';
        
        const safeRetryPatterns = [
            '网络错误', '超时', 'timeout', 
            '服务不可用', '服务繁忙', 'too many requests',
            '连接失败', '网络连接'
        ];
        
        const unsafePatterns = [
            '语法错误', '参数错误', '无效的', '不支持',
            '未授权', '权限不足', '余额不足'
        ];
        
        const isSafe = safeRetryPatterns.some(pattern => 
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );
        
        const isUnsafe = unsafePatterns.some(pattern =>
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );
        
        return isSafe && !isUnsafe;
    }

    /**
     * 🎯 单次工具执行（现有 _executeAction 的简化版）
     */
    async _executeSingleAction(action, runId) {
        const { tool_name, parameters } = action;
        
        try {
            const tool = this.tools[tool_name];
            if (!tool) {
                throw new Error(`未知的工具: ${tool_name}`);
            }

            // 🎯 执行工具调用（保持现有逻辑）
            const executionContext = { 
                runId, 
                callbackManager: this.callbackManager 
            };

            const rawResult = await this.callbackManager.wrapToolCall(
                { toolName: tool_name, parameters },
                async (request) => {
                    return await tool.invoke(request.parameters, executionContext);
                }
            );

            // 🎯 应用标准化（无风险）
            return this._normalizeToolOutput(rawResult, tool_name);
            
        } catch (error) {
            console.error(`工具 ${tool_name} 执行失败:`, error);
            
            // 🎯 返回标准化错误格式
            return this._normalizeToolOutput({
                success: false,
                error: error.message,
                isError: true,
                output: `❌ 工具"${tool_name}"执行失败: ${error.message}`
            }, tool_name);
        }
    }

    /**
     * 🎯 执行行动（工具调用）- 增强版本
     */
    async _executeAction(action, runId, thinkTimeout = null) {
        const { tool_name, parameters } = action;
        
        console.log(`[AgentExecutor] 执行工具: ${tool_name}`, parameters);

        // 🎯 工具开始事件（保持现有逻辑）
        await this.callbackManager.invokeEvent('on_tool_start', {
            name: tool_name,
            run_id: runId,
            data: {
                tool_name,
                parameters,
                thinkTimeout: thinkTimeout
            }
        });

        try {
            // 🎯 使用增强的执行（包含重试）
            const observation = await this._executeActionWithRetry(action, runId, 2);

            // 🎯 工具结束事件（保持现有逻辑）
            await this.callbackManager.invokeEvent('on_tool_end', {
                name: tool_name,
                run_id: runId,
                data: {
                    tool_name,
                    result: observation,
                    success: observation.success,
                    thinkTimeout: thinkTimeout
                }
            });

            return observation;

        } catch (error) {
            console.error(`[AgentExecutor] 工具执行失败:`, error);
            
            // 🎯 工具错误事件（保持现有逻辑）
            await this.callbackManager.invokeEvent('on_tool_error', {
                name: tool_name,
                run_id: runId,
                data: {
                    tool_name,
                    error: error.message,
                    parameters,
                    thinkTimeout: thinkTimeout
                }
            });

            // 🎯 返回标准化错误
            return this._normalizeToolOutput({
                success: false,
                output: `❌ 工具"${tool_name}"执行失败: ${error.message}`,
                error: error.message,
                isError: true
            }, tool_name);
        }
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

        // 🎯 新增：在聊天区显示Agent开始消息
        window.dispatchEvent(new CustomEvent('chat:agent_started', {
            detail: {
                userMessage: userMessage,
                sessionId: runId,
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
        let lastAction = null; // 🎯 跟踪上一次行动
        let repeatedActions = 0; // 🎯 重复行动计数

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

                // 🎯 思考开始 - 同时在聊天区显示
                window.dispatchEvent(new CustomEvent('chat:agent_thinking', {
                    detail: {
                        content: `第 ${iteration + 1} 次思考...`,
                        iteration: iteration + 1,
                        sessionId: runId
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

                // 🎯 检查重复行动，避免无限循环
                if (lastAction && action &&
                    action.type === 'tool_call' &&
                    lastAction.type === 'tool_call' && // 确保上次也是工具调用
                    action.tool_name === lastAction.tool_name &&
                    JSON.stringify(action.parameters) === JSON.stringify(lastAction.parameters)) {
                    
                    repeatedActions++;
                    console.warn(`[AgentExecutor] 重复执行相同行动: ${action.tool_name} (${repeatedActions}次)`);
                    
                    if (repeatedActions >= 2) {
                        console.warn(`[AgentExecutor] 重复行动过多，提前终止`);
                        finalAnswer = this._handleRepeatedActions(intermediateSteps, repeatedActions);
                        break;
                    }
                } else {
                    repeatedActions = 0; // 重置计数
                }
                
                lastAction = action;

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

                // 🎯 添加思考步骤到聊天区
                window.dispatchEvent(new CustomEvent('chat:agent_step', {
                    detail: {
                        type: 'think',
                        content: action.log || '模型思考过程',
                        iteration: iteration + 1,
                        sessionId: runId
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

                    // 🎯 最终答案显示到聊天区
                    window.dispatchEvent(new CustomEvent('chat:agent_final_answer', {
                        detail: {
                            content: finalAnswer,
                            sessionId: runId,
                            iterations: iteration + 1
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

                    // 🎯 工具调用显示到聊天区
                    window.dispatchEvent(new CustomEvent('chat:agent_step', {
                        detail: {
                            type: 'action',
                            content: `执行工具: ${action.tool_name}`,
                            tool: action.tool_name,
                            parameters: action.parameters,
                            iteration: iteration + 1,
                            sessionId: runId
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

                    // 🎯 工具结果显示到聊天区
                    window.dispatchEvent(new CustomEvent('chat:agent_step_completed', {
                        detail: {
                            type: 'observation',
                            content: observation.output,
                            tool: action.tool_name,
                            success: !observation.isError,
                            iteration: iteration + 1,
                            sessionId: runId
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
                
                // 🎯 错误显示到聊天区
                window.dispatchEvent(new CustomEvent('chat:agent_error', {
                    detail: {
                        error: error.message,
                        iteration: iteration + 1,
                        sessionId: runId
                    }
                }));

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

        // 🎯 格式化结果用于显示
        finalResult.formatted = this._formatAgentResult(finalResult);

        window.dispatchEvent(new CustomEvent('agent:session_completed', {
            detail: { 
                result: finalResult,
                sessionId: runId,
                duration: this.currentSession.endTime - this.currentSession.startTime
            }
        }));

        // 🎯 Agent完成显示到聊天区
        window.dispatchEvent(new CustomEvent('chat:agent_completed', {
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
     * 🎯 优化结果显示 - 新增方法
     */
    _formatAgentResult(agentResult) {
        if (!agentResult.success) {
            return {
                enhanced: true,
                type: 'agent_error',
                content: agentResult.output,
                success: false,
                agentRunId: agentResult.agentRunId,
                fallback: true
            };
        }

        let content = agentResult.output;
        
        // 🎯 确保内容完整显示
        if (content && content.length > 2000) {
            // 对于长内容，添加分页或折叠显示
            const preview = content.substring(0, 1500) + '...\n\n**⚠️ 内容较长，已截断显示**';
            content = preview;
        }
        
        // 🎯 优化执行摘要显示
        if (agentResult.intermediateSteps && agentResult.intermediateSteps.length > 0) {
            const successfulSteps = agentResult.intermediateSteps.filter(step => 
                !ObservationUtils.isErrorResult(step.observation)
            ).length;
            const failedSteps = agentResult.intermediateSteps.filter(step => 
                ObservationUtils.isErrorResult(step.observation)
            ).length;
            
            content += `\n\n---\n**🤖 智能代理执行摘要**\n`;
            content += `共执行 ${agentResult.iterations} 轮思考，完成 ${successfulSteps} 个成功步骤${failedSteps > 0 ? `，${failedSteps} 个失败步骤` : ''}\n`;
            
            // 🎯 简化步骤显示
            agentResult.intermediateSteps.forEach((step, index) => {
                const isError = ObservationUtils.isErrorResult(step.observation);
                const status = isError ? '❌' : '✅';
                content += `\n${index + 1}. ${step.action.tool_name} ${status}`;
            });
        }

        return {
            enhanced: true,
            type: 'agent_result',
            content: content,
            success: agentResult.success,
            agentRunId: agentResult.agentRunId,
            intermediateSteps: agentResult.intermediateSteps,
            isMultiStep: agentResult.intermediateSteps && agentResult.intermediateSteps.length > 0,
            iterations: agentResult.iterations
        };
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
     * 🎯 处理重复行动
     */
    _handleRepeatedActions(_intermediateSteps, repeatedCount) {
        return `🤖 Agent执行因重复行动过多而终止（${repeatedCount}次重复）。\n\n建议重新表述问题或分步骤提问。`;
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