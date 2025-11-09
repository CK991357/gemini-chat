// src/static/js/agent/deepresearch/DeepResearchAgent.js - 终极版 (集成摘要子代理)

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler; // 需要用它来调用摘要子代理
        this.tools = tools;
        this.callbackManager = callbackManager;
        this.maxIterations = config.maxIterations || 8;
        this.agentLogic = new AgentLogic(chatApiHandler);
        this.outputParser = new AgentOutputParser();
        console.log(`[DeepResearchAgent] 初始化完成，可用研究工具: ${Object.keys(tools).join(', ')}`);
    }

    async conductResearch(researchRequest) {
        const { topic, availableTools } = researchRequest;
        const runId = this.callbackManager.generateRunId();
        
        await this.callbackManager.invokeEvent('on_research_start', { run_id: runId, data: { topic } });

        let intermediateSteps = [];
        let iterations = 0;

        while (iterations < this.maxIterations) {
            iterations++;
            await this.callbackManager.invokeEvent('on_research_progress', { run_id: runId, data: { iteration: iterations, total: this.maxIterations } });

            const agentDecisionText = await this.agentLogic.plan({ topic, intermediateSteps, availableTools }, { run_id: runId, callbackManager: this.callbackManager });
            const parsedAction = this.outputParser.parse(agentDecisionText);

            if (parsedAction.type === 'final_answer') {
                await this.callbackManager.invokeEvent('on_research_end', { run_id: runId, data: { success: true, report: parsedAction.answer, iterations } });
                return { success: true, report: parsedAction.answer, iterations };
            }

            if (parsedAction.type === 'tool_call') {
                const { tool_name, parameters } = parsedAction;
                await this.callbackManager.invokeEvent('on_tool_start', { run_id: runId, data: { tool_name, parameters } });

                const tool = this.tools[tool_name];
                let rawObservation;
                if (!tool) {
                    rawObservation = `错误: 工具 "${tool_name}" 不存在。`;
                } else {
                    try {
                        const toolResult = await tool.invoke(parameters, { mode: 'deep_research' });
                        rawObservation = toolResult.output || JSON.stringify(toolResult);
                    } catch (error) {
                        rawObservation = `错误: 工具 "${tool_name}" 执行失败: ${error.message}`;
                    }
                }
                
                // 🎯 关键升级：使用智能摘要子代理来处理观察结果
                const summarizedObservation = await this._smartSummarizeObservation(topic, rawObservation);
                
                intermediateSteps.push({ action: parsedAction, observation: summarizedObservation });
                await this.callbackManager.invokeEvent('on_tool_end', { run_id: runId, data: { tool_name, output: summarizedObservation } });
            
            } else { 
                const observation = `你上一步的思考未能产生有效的行动JSON或最终答案。请严格遵循指令，检查你的输出格式，然后重试。你的上一步思考是：\n${agentDecisionText}`;
                intermediateSteps.push({ action: { tool_name: 'self_correction', parameters: {} }, observation });
            }
        }

        const report = "# 研究达到最大迭代次数\n\n研究已达到最大迭代次数，但未得出最终结论。";
        await this.callbackManager.invokeEvent('on_research_end', { run_id: runId, data: { success: false, report, iterations } });
        return { success: false, report, iterations };
    }

    /**
     * 🎯 新增：智能摘要函数（混合策略）
     * 这就是我们的“摘要子代理”实现
     */
    async _smartSummarizeObservation(mainTopic, observation) {
        const threshold = 2000; // 超过2000字符就启动LLM摘要
        if (!observation || typeof observation !== 'string' || observation.length < threshold) {
            // 内容不长，直接返回（或做简单截断）
            return observation.length > threshold ? observation.substring(0, threshold) + "\n[...内容已截断]" : observation;
        }

        console.log(`[DeepResearchAgent] 内容过长 (${observation.length} > ${threshold})，启动摘要子代理...`);
        await this.callbackManager.invokeEvent('agent:thinking', { detail: { content: '正在调用摘要子代理压缩上下文...', type: 'summarize', agentType: 'deep_research' } });

        // 构建给“摘要子代理”的Prompt
        const summarizerPrompt = `
        你是一个信息分析专家。你的任务是阅读以下原始材料，并根据给定的“主要研究主题”，提取出最核心、最相关的关键信息，生成一个简洁的摘要。
        摘要必须保留关键数据、名称、结论和核心观点。长度不要超过400字。

        ---
        主要研究主题: "${mainTopic}"
        ---
        原始材料:
        ${observation.substring(0, 10000)} 
        ---

        现在，请生成你的摘要：
        `;

        try {
            // 调用LLM扮演摘要子代理
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: summarizerPrompt }],
                model: 'gemini-2.0-flash-exp', // 可以用一个更快的模型来做摘要
                temperature: 0.0,
            });

            const choice = response && response.choices && response.choices[0];
            const summary = choice && choice.message && choice.message.content ? choice.message.content : '摘要生成失败。';
            
            console.log("[DeepResearchAgent] 摘要子代理完成。");
            return `[由AI摘要]:\n${summary}`;

        } catch (error) {
            console.error("[DeepResearchAgent] 摘要子代理调用失败:", error);
            // 摘要失败，回退到简单的程序化截断，保证流程不中断
            return observation.substring(0, threshold) + "\n\n[...内容过长，摘要失败，已截断...]";
        }
    }
}