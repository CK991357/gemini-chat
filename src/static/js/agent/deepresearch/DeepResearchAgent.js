// src/static/js/agent/deepresearch/DeepResearchAgent.js - 依赖注入修复版

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';

export class DeepResearchAgent {
    // 🎯 关键修复：在构造函数中接收 chatApiHandler
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler; // 保存一份引用，供子代理使用
        this.tools = tools;
        this.callbackManager = callbackManager;
        this.maxIterations = config.maxIterations || 8;
        
        // 🎯 关键修复：将 chatApiHandler 传递给 AgentLogic
        this.agentLogic = new AgentLogic(chatApiHandler);
        this.outputParser = new AgentOutputParser();

        console.log(`[DeepResearchAgent] 初始化完成，可用研究工具: ${Object.keys(tools).join(', ')}`);
    }

    // ... conductResearch 和 _smartSummarizeObservation 函数保持我们上一版的内容，无需修改 ...
    // ... 这里为了完整性，我把它们也复制过来 ...
    
    async conductResearch(researchRequest) {
        // ... 此处代码与上一版完全相同 ...
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
        return { success: false, report: iterations };
    }

    async _smartSummarizeObservation(mainTopic, observation) {
        // ... 此处代码与上一版完全相同 ...
        const threshold = 2000;
        if (!observation || typeof observation !== 'string' || observation.length < threshold) {
            return observation.length > threshold ? observation.substring(0, threshold) + "\n[...内容已截断]" : observation;
        }

        console.log(`[DeepResearchAgent] 内容过长 (${observation.length} > ${threshold})，启动摘要子代理...`);
        await this.callbackManager.invokeEvent('agent:thinking', { detail: { content: '正在调用摘要子代理压缩上下文...', type: 'summarize', agentType: 'deep_research' } });

        const summarizerPrompt = `You are an expert information analyst. Your task is to read the following raw text and, based on the MAIN RESEARCH TOPIC, extract the most critical and relevant key information to create a concise summary. The summary must preserve key data, names, conclusions, and core arguments. Keep it under 400 words.

        ---
        MAIN RESEARCH TOPIC: "${mainTopic}"
        ---
        RAW TEXT:
        ${observation.substring(0, 10000)} 
        ---

        Your concise summary:`;

        try {
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: summarizerPrompt }],
                model: 'gemini-2.0-flash-exp-summarizer',
                stream: false,
            });

            const choice = response && response.choices && response.choices[0];
            const summary = choice && choice.message && choice.message.content ? choice.message.content : '摘要生成失败。';
            
            console.log("[DeepResearchAgent] 摘要子代理完成。");
            return `[AI-Generated Summary]:\n${summary}`;

        } catch (error) {
            console.error("[DeepResearchAgent] 摘要子代理调用失败:", error);
            return observation.substring(0, threshold) + "\n\n[...Content too long, summarization failed, content truncated...]";
        }
    }
}