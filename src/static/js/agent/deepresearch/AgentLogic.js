// src/static/js/agent/deepresearch/AgentLogic.js - 强化Prompt版

export class AgentLogic {
    constructor(chatApiHandler) {
        this.llm = chatApiHandler;
    }

    async plan(inputs, runManager) {
        const prompt = this._constructResearchPrompt(inputs);
        await runManager?.callbackManager.invokeEvent('on_agent_think_start', { run_id: runManager.runId });
        
        try {
            const llmResponse = await this.llm.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'gemini-2.5-flash-preview-09-2025',
                temperature: 0.0,
            });
            const responseText = llmResponse.choices.message.content;
            await runManager?.callbackManager.invokeEvent('on_agent_think_end', { run_id: runManager.runId, data: { response: responseText } });
            return responseText;
        } catch (error) {
            console.error("[AgentLogic] LLM 思考失败:", error);
            await runManager?.callbackManager.invokeEvent('on_agent_think_error', { run_id: runManager.runId, data: { error: error.message } });
            return `思考: 发生内部错误，无法继续规划。\n最终答案: 研究因错误终止。`;
        }
    }

    _constructResearchPrompt({ topic, intermediateSteps, availableTools }) {
        const toolDescriptions = availableTools
            .map(tool => `- ${tool.name}: ${tool.description}`)
            .join('\n');

        let history = "这是研究的第一步，还没有历史记录。";
        if (intermediateSteps && intermediateSteps.length > 0) {
            history = intermediateSteps.map(step => 
                `上一步行动: 调用工具 ${step.action.tool_name}，参数: ${JSON.stringify(step.action.parameters)}\n观察结果: ${step.observation}`
            ).join('\n\n');
        }

        // 🎯 关键修复：更严格、更清晰的Prompt指令
        return `
你是一个专业的AI研究员。你的任务是深入、多步骤地研究用户给定的主题，并最终输出一份全面的研究报告。

# 可用工具
${toolDescriptions}

# 研究主题
"${topic}"

# 指令
你必须遵循以下的“思考-行动-观察”循环来完成任务：

1.  **思考 (Thought)**: 分析你目前掌握的信息（参考“研究历史与观察”），判断信息是否足够回答问题。如果不够，清晰地规划下一步你需要什么信息，以及你准备使用哪个工具来获取它。

2.  **行动 (Action)**: **严格地**将你的行动决策格式化为一个JSON代码块。
    \`\`\`json
    {
        "tool_name": "你选择的工具名称",
        "parameters": {
            "参数1": "值1",
            "参数2": "值2"
        }
    }
    \`\`\`

如果你认为所有信息都已收集完毕，可以撰写最终报告，那么**不要输出“行动”JSON**，而是直接在"最终答案 (Final Answer):"部分输出你的完整研究报告。

---
# 研究历史与观察
${history}
---

现在，根据以上历史，请规划你的下一步。你的回答必须从"思考:"开始，然后提供“行动”的JSON代码块或“最终答案”的报告。

思考:`;
    }
}