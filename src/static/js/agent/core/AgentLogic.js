// src/static/js/agent/core/AgentLogic.js

/**
 * @class AgentLogic
 * @description Agent的思考核心，负责规划下一步行动
 */
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
        
        // 🎯 构建思考提示词
        const prompt = this._constructPrompt(userMessage, intermediateSteps, context);
        
        console.log(`[AgentLogic] 第 ${intermediateSteps.length + 1} 次思考...`);

        try {
            // 🎯 思考开始事件
            await runManager?.callbackManager.invokeEvent('on_agent_think_start', {
                name: 'agent_think',
                run_id: runManager.runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    prompt_preview: prompt.substring(0, 200) + '...'
                }
            });

            // 🎯 调用LLM进行思考
            const llmResponse = await this.llm.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: context?.model || 'gpt-3.5-turbo',
                temperature: 0.1, // 低温度确保稳定性
                max_tokens: 1000
            }, context?.apiKey);

            if (!llmResponse || !llmResponse.choices || !llmResponse.choices[0]) {
                throw new Error("LLM返回无效响应");
            }

            const responseText = llmResponse.choices[0].message.content;
            
            // 🎯 思考结束事件
            await runManager?.callbackManager.invokeEvent('on_agent_think_end', {
                name: 'agent_think',
                run_id: runManager.runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    response_preview: responseText.substring(0, 200) + '...'
                }
            });

            // 🎯 解析响应
            const action = this.outputParser.parse(responseText);
            
            console.log(`[AgentLogic] 决策:`, action.type, action.tool_name || '');
            
            return action;

        } catch (error) {
            console.error(`[AgentLogic] 思考过程失败:`, error);
            
            // 🎯 思考失败事件
            await runManager?.callbackManager.invokeEvent('on_agent_think_error', {
                name: 'agent_think',
                run_id: runManager.runId,
                data: { 
                    step: intermediateSteps.length + 1,
                    error: error.message
                }
            });

            // 🎯 思考失败时抛出错误，让执行器处理
            throw new Error(`思考过程失败: ${error.message}`);
        }
    }

    /**
     * 🎯 构建思考提示词（ReAct格式 - 生产级优化）
     */
    _constructPrompt(userMessage, intermediateSteps, context) {
        const toolDescriptions = Object.values(this.tools)
            .map(tool => `- ${tool.name}: ${tool.description}`)
            .join('\n');

        const toolNames = Object.keys(this.tools).join(', ');

        let prompt = `你是一个智能助手，需要通过多步推理和工具调用来解决复杂问题。

原始问题: ${userMessage}

你可以使用的工具:
${toolDescriptions}

请严格按照以下格式响应：

Question: 你必须回答的原始问题
Thought: 分析当前状况，规划下一步行动。解释为什么选择这个行动。
Action: 需要调用的工具名称，必须是以下之一: [${toolNames}]
Action Input: 工具的输入参数，必须是有效的JSON对象
Observation: 工具执行的结果
... (这个 Thought/Action/Action Input/Observation 循环可以重复N次)
Thought: 我现在有足够信息来给出最终答案了
Final Answer: 对原始问题的完整、详细答案

现在开始！

Question: ${userMessage}
`;

        // 🎯 添加历史步骤（scratchpad）
        if (intermediateSteps.length > 0) {
            prompt += "\n之前的执行历史:\n\n";
            intermediateSteps.forEach((step, index) => {
                prompt += `步骤 ${index + 1}:\n`;
                prompt += `Thought: ${step.action.log}\n`;
                prompt += `Action: ${step.action.tool_name}\n`;
                prompt += `Action Input: ${JSON.stringify(step.action.parameters, null, 2)}\n`;
                prompt += `Observation: ${this._formatObservation(step.observation)}\n\n`;
            });
            
            prompt += "基于以上历史，请继续思考：\n";
        }

        prompt += "Thought: ";
        
        return prompt;
    }

    /**
     * 🎯 格式化观察结果
     */
    _formatObservation(observation) {
        if (typeof observation === 'string') {
            // 如果是错误信息，突出显示
            if (observation.includes('失败') || observation.includes('错误')) {
                return `❌ ${observation}`;
            }
            return observation.substring(0, 800) + (observation.length > 800 ? '...' : '');
        }
        
        if (observation.output) {
            return observation.output.substring(0, 800) + (observation.output.length > 800 ? '...' : '');
        }
        
        if (observation.success === false) {
            return `❌ 工具执行失败: ${observation.error || '未知错误'}`;
        }
        
        return JSON.stringify(observation).substring(0, 800) + '...';
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