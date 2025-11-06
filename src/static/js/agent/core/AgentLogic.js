// src/static/js/agent/core/AgentLogic.js

/**
 * @class AgentLogic
 * @description Agent的思考核心，负责规划下一步行动
 */
import { ObservationUtils } from '../utils/ObservationUtils.js';
export class AgentLogic {
    constructor(llm, tools, outputParser) {
        this.llm = llm; // chatApiHandler
        this.tools = tools; // 工具注册表
        this.outputParser = outputParser;
    }

    /**
     * 🎯 规划下一步行动
     */
    async plan(intermediateSteps, inputs, runManager) {
        const { userMessage, context } = inputs;
        const { runId, callbackManager } = runManager || {};
        
        console.log(`[AgentLogic] 第 ${intermediateSteps.length + 1} 次思考...`);

        try {
            // 🎯 思考开始事件
            await callbackManager?.invokeEvent('on_agent_think_start', {
                name: 'agent_think',
                run_id: runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    user_message: userMessage.substring(0, 200)
                }
            });

            // 🎯 构建增强的系统提示词
            const systemPrompt = this._buildEnhancedSystemPrompt(intermediateSteps, context);
            
            // 🎯 构建消息历史
            const messages = this._buildMessages(systemPrompt, intermediateSteps, userMessage);
            
            console.log(`[AgentLogic] 发送给LLM的消息数量: ${messages.length}`);

            // 🎯 调用LLM进行思考
            const llmResponse = await this.llm.completeChat({
                messages: messages,
                model: context?.model || 'gpt-4',
                temperature: 0.1, // 低温度确保稳定性
                max_tokens: 1500
            }, context?.apiKey);

            if (!llmResponse || !llmResponse.choices || !llmResponse.choices[0]) {
                throw new Error("LLM返回无效响应");
            }

            const responseText = llmResponse.choices[0].message.content;
            
            // 🎯 思考结束事件
            await callbackManager?.invokeEvent('on_agent_think_end', {
                name: 'agent_think',
                run_id: runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    response_preview: responseText.substring(0, 300) + '...'
                }
            });

            // 🎯 解析响应
            const action = this.outputParser.parse(responseText);
            
            console.log(`[AgentLogic] 决策:`, action.type, action.tool_name || '');
            
            return action;

        } catch (error) {
            console.error(`[AgentLogic] 思考过程失败:`, error);
            
            // 🎯 思考失败事件
            await callbackManager?.invokeEvent('on_agent_think_error', {
                name: 'agent_think',
                run_id: runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    error: error.message
                }
            });

            // 🎯 错误时返回继续思考，而不是抛出错误
            console.warn('[AgentLogic] 规划失败，返回继续思考状态');
            return {
                type: 'continue_thinking',
                log: `规划过程遇到错误: ${error.message}。请重新分析问题。`
            };
        }
    }

    /**
     * 🎯 构建增强的系统提示词
     */
    _buildEnhancedSystemPrompt(intermediateSteps, context) {
        const toolDescriptions = Object.values(this.tools)
            .map(tool => `- ${tool.name}: ${tool.description}`)
            .join('\n');

        const toolNames = Object.keys(this.tools).join(', ');
        const stepCount = intermediateSteps.length;

        return `你是一个智能代理，需要按照ReAct(思考-行动-观察)框架解决问题。

## 可用工具:
${toolDescriptions}

## 网页抓取工具使用策略：
- 网页抓取任务必须优先使用 crawl4ai 工具，它提供更强大的网页抓取和内容提取能力
- 只有在 crawl4ai 明确失败时才考虑firecrawl作为替代方案

## 执行流程：
1. **思考(Thought)**: 分析当前状况，规划下一步
2. **行动(Action)**: 选择合适工具并调用
3. **观察(Observation)**: 获取工具执行结果
4. 重复1-3步直到问题解决
5. **最终答案(Final Answer)**: 整理所有信息给出完整答案

## 关键规则：
- 必须使用工具获取实时信息，不要凭空猜测
- 每次只执行一个工具调用
- 工具参数必须是有效的JSON格式
- 只有获得所有必要信息后才能给出最终答案
- 最终答案必须是整理后的完整信息，不要包含思考过程

## 输出格式：
\`\`\`
Thought: 你的思考过程
Action: 工具名称
Action Input: {"参数": "值"}
\`\`\`

或者当问题解决时：
\`\`\`
Thought: 我已经获得所有必要信息
Final Answer: 完整的最终答案
\`\`\`

当前是第${stepCount + 1}步思考，请继续...

## 🎯 重要提醒：
- **不要**在最终答案中包含思考过程、Action、Observation等内容
- **必须**先通过工具获取真实信息，再整理成完整的最终答案
- 最终答案应该是面向用户的、完整的、整理好的信息
- 如果信息不足，继续使用工具获取更多信息

例如：
❌ 错误答案："根据搜索，Model Y是销量最高的... Action: crawl4ai ..."
✅ 正确答案："根据最新行业数据和官方信息，特斯拉2025年销量最高的车型是Model Y。该车型具有以下特点：1. ... 2. ..."

当前任务：${context?.userMessage}`;
    }

    /**
     * 🎯 构建消息历史
     */
    _buildMessages(systemPrompt, intermediateSteps, userMessage) {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `问题: ${userMessage}` }
        ];
        
        // 🎯 添加历史步骤作为对话上下文
        intermediateSteps.forEach((step, index) => {
            if (step.action && step.observation) {
                // 添加助理的思考+行动
                messages.push({ 
                    role: 'assistant', 
                    content: `Thought: ${step.action.log || `执行第${index + 1}步工具调用`}\nAction: ${step.action.tool_name}\nAction Input: ${JSON.stringify(step.action.parameters)}` 
                });
                
                // 添加工具执行结果作为用户消息
                messages.push({ 
                    role: 'user', 
                    content: `Observation: ${this._formatObservation(step.observation)}` 
                });
            }
        });
        
        return messages;
    }

    /**
     * 🎯 格式化观察结果
     */
    _formatObservation(observation) {
        try {
            const outputText = ObservationUtils.getOutputText(observation) || '[无输出内容]';
            const isError = ObservationUtils.isErrorResult(observation);

            const display = outputText.substring(0, 1000) + (outputText.length > 1000 ? '...' : '');
            return isError ? `❌ 执行失败: ${display}` : display;
        } catch (error) {
            console.warn('[AgentLogic] _formatObservation 失败:', error);
            return `❌ 格式化观察结果失败: ${error.message}`;
        }
    }

    /**
     * 🎯 获取逻辑状态
     */
    getStatus() {
        return {
            availableTools: Object.keys(this.tools),
            toolsCount: Object.keys(this.tools).length,
            type: 'react_agent_logic'
        };
    }
}