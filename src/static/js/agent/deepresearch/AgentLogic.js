// src/static/js/agent/deepresearch/AgentLogic.js - 重构版

export class AgentLogic {
    constructor(chatApiHandler) {
        this.llm = chatApiHandler;
    }

    /**
     * 思考和规划
     * @param {object} inputs - 包含主题、历史记录和可用工具定义
     * @returns {Promise<string>} LLM返回的原始决策文本
     */
    async plan(inputs, runManager) {
        const prompt = this._constructResearchPrompt(inputs);

        await runManager?.callbackManager.invokeEvent('on_agent_think_start', { run_id: runManager.runId });
        
        try {
            // 调用LLM进行决策
            const llmResponse = await this.llm.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'gemini-2.5-flash-preview-09-2025', // 使用一个强大的模型进行规划
                temperature: 0.0, // 低温确保决策的稳定性
            });
            
            const responseText = llmResponse.choices[0].message.content;
            await runManager?.callbackManager.invokeEvent('on_agent_think_end', { run_id: runManager.runId, data: { response: responseText } });
            return responseText;
        } catch (error) {
            console.error("[AgentLogic] LLM 思考失败:", error);
            await runManager?.callbackManager.invokeEvent('on_agent_think_error', { run_id: runManager.runId, data: { error: error.message } });
            return `思考: 发生内部错误，无法继续规划。\n最终答案: 研究因错误终止。`;
        }
    }

    /**
     * 🎯 关键：构建包含工具描述和历史记录的动态Prompt
     */
    _constructResearchPrompt({ topic, intermediateSteps, availableTools }) {
        // 格式化工具描述，让LLM知道它能用什么
        const toolDescriptions = availableTools
            .map(tool => `- ${tool.name}: ${tool.description}`)
            .join('\n');

        // 格式化历史记录（上下文工程）
        let history = "这是第一步，还没有历史记录。";
        if (intermediateSteps && intermediateSteps.length > 0) {
            history = intermediateSteps.map(step => 
                `上一步行动: 调用工具 ${step.action.tool_name}，参数: ${JSON.stringify(step.action.parameters)}\n观察结果: ${step.observation}`
            ).join('\n\n');
        }

        // ReAct Prompt模板
        return `
你是一个专业的AI研究员，任务是深入研究用户给定的主题，并最终输出一份全面的研究报告。

# 可用工具
你有以下工具可以使用：
${toolDescriptions}

# 研究主题
"${topic}"

# 指令
请遵循以下的“思考-行动-观察”循环来完成任务：
1.  **思考 (Thought)**: 分析当前掌握的信息，判断信息是否足够。如果不够，规划下一步需要什么信息，以及应该使用哪个工具来获取。
2.  **行动 (Action)**: 以单行JSON格式输出你的决策。JSON必须包含 'tool_name' 和 'parameters' 两个键。例如: {"tool_name": "tavily_search", "parameters": {"query": "最新AI技术"}}

如果你认为所有信息都已收集完毕，可以撰写最终报告，请不要输出“行动”JSON，而是直接在"最终答案 (Final Answer)"部分输出你的完整研究报告。

---
# 研究历史与观察
${history}
---

现在，根据以上历史，请规划你的下一步。你的回答必须从"思考:"开始，然后提供"行动:"的JSON或"最终答案:"的报告。

思考:`;
    }
}