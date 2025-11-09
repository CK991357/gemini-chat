// src/static/js/agent/deepresearch/AgentLogic.js - 具备自主终止能力的最终版

export class AgentLogic {
    constructor(chatApiHandler) {
        // 🎯 关键修复：正确地将传入的 chatApiHandler 赋值给类的属性
        // 我们将它命名为 this.chatApiHandler 以保持一致性
        if (!chatApiHandler) {
            throw new Error("AgentLogic requires a valid chatApiHandler instance.");
        }
        this.chatApiHandler = chatApiHandler;
    }

    async plan(inputs, runManager) {
        const prompt = this._constructFinalPrompt(inputs);
        await runManager?.callbackManager.invokeEvent('on_agent_think_start', { run_id: runManager.runId });
        
        try {
            // 🎯 关键修复：使用正确的属性 this.chatApiHandler
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
                // 确保 action 存在且有 tool_name
                const toolName = step.action?.tool_name || 'unknown_action';
                const parameters = step.action?.parameters || {};
                const actionJson = JSON.stringify({
                    tool_name: toolName,
                    parameters: parameters
                });
                // 使用 step.action.thought (如果存在)，否则提供一个通用思考
                const thought = step.action?.thought || '我需要执行一个动作。';
                return `思考: ${thought}\n行动:\n\`\`\`json\n${actionJson}\n\`\`\`\n观察: ${step.observation}`;
            });
            history = formattedSteps.join('\n\n');
        }

        const example = `
# 示例

研究历史与观察:
这是研究的第一步，还没有历史记录。

思考: 我需要开始收集关于研究主题的基础信息。使用搜索工具是最直接的方法。
行动:
\`\`\`json
{
    "tool_name": "tavily_search",
    "parameters": {
        "query": "${topic}"
    }
}
\`\`\`
`;

        return `
# 角色
你是一个高效、目标导向的AI研究助理。你的唯一目标是规划和执行一系列工具调用，以深入研究给定的主题，并最终形成一份全面的报告。

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
${history ? '# 研究历史与观察\n' + history : example}
---

# 你的任务
现在，根据以上所有信息，继续这个研究。**严格遵循格式**，提供你的下一步“思考”和“行动”。

思考:`;
    }
}