// src/static/js/agent/deepresearch/AgentLogic.js - 具备自主终止能力的最终版

export class AgentLogic {
    constructor(chatApiHandler) {
        this.llm = chatApiHandler;
    }

    async plan(inputs, runManager) {
        const prompt = this._constructFinalPrompt(inputs);
        await runManager?.callbackManager.invokeEvent('on_agent_think_start', { run_id: runManager.runId });
        
        try {
            const llmResponse = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'gemini-2.5-flash-preview-09-2025',
                temperature: 0.0,
            });

            const choice = llmResponse && llmResponse.choices && llmResponse.choices[0];
            const responseText = choice && choice.message && choice.message.content ? choice.message.content : '';

            if (!responseText) {
                throw new Error("LLM返回了空的或无效的响应。");
            }

            await runManager?.callbackManager.invokeEvent('on_agent_think_end', { run_id: runManager.runId, data: { response: responseText } });
            return responseText;

        } catch (error) {
            console.error("[AgentLogic] LLM 思考失败:", error);
            await runManager?.callbackManager.invokeEvent('on_agent_think_error', { run_id: runManager.runId, data: { error: error.message } });
            return `思考: 发生内部错误，无法继续规划。\n最终答案: 研究因错误终止：${error.message}`;
        }
    }

    /**
     * 🎯 终极版Prompt：增加了“任务完成判断”的明确指令
     */
    _constructFinalPrompt({ topic, intermediateSteps, availableTools }) {
        const toolDescriptions = availableTools
            .map(tool => `  - ${tool.name}: ${tool.description}`)
            .join('\n');

        let history = "";
        if (intermediateSteps && intermediateSteps.length > 0) {
            const formattedSteps = intermediateSteps.map(step => {
                const actionJson = JSON.stringify({
                    tool_name: step.action.tool_name,
                    parameters: step.action.parameters
                });
                return `上一步行动:
\`\`\`json
${actionJson}
\`\`\`
观察: ${step.observation}`;
            });
            history = formattedSteps.join('\n\n');
        }

        return `
# 角色
你是一个高效、目标导向的AI研究助理。你的任务是尽快地、用最少的步骤来回答用户的研究主题。

# 核心指令
你的每一次思考都必须遵循以下决策流程：

1.  **回顾最终目标**: 用户的研究主题是：“${topic}”。
2.  **评估现有信息**: 查看“研究历史与观察”，判断你掌握的信息是否已经**足够、完整地**回答了用户的研究主题。
3.  **做出决策**:
    *   **如果信息足够**: 你的任务已经完成。请立刻停止使用工具，并直接在 "最终答案 (Final Answer):" 部分，根据你收集到的所有信息，撰写一份完整、清晰的研究报告。
    *   **如果信息不足**: 规划出**一个**能最快获取缺失信息的下一步行动。然后在 "行动 (Action):" 部分输出一个JSON代码块。

# 行动格式
如果需要行动，你的“行动”部分必须是**严格格式化**的JSON代码块：
\`\`\`json
{
    "tool_name": "你选择的工具名称",
    "parameters": { "参数": "值" }
}
\`\`\`

# 可用工具
${toolDescriptions}

# 重要原则
- **效率优先**: 不要进行不必要的搜索或重复操作。
- **目标导向**: 你的每一步都必须是为了直接回答用户的研究主题。
- **及时终止**: 一旦信息足够，立即输出“最终答案”。

---
# 研究历史与观察
${history || "这是研究的第一步，还没有历史记录。"}
---

# 你的任务
现在，开始你的决策。你的回答必须从"思考:"开始。

思考:`;
    }
}