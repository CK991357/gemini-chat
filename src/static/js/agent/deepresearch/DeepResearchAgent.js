// src/static/js/agent/deepresearch/DeepResearchAgent.js - 兼容解析失败

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
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

            const agentDecisionText = await this.agentLogic.plan({
                topic,
                intermediateSteps,
                availableTools 
            }, { run_id: runId, callbackManager: this.callbackManager });
            
            const parsedAction = this.outputParser.parse(agentDecisionText);

            if (parsedAction.type === 'final_answer') {
                await this.callbackManager.invokeEvent('on_research_end', { run_id: runId, data: { success: true, report: parsedAction.answer, iterations } });
                return { success: true, report: parsedAction.answer, iterations };
            }

            if (parsedAction.type === 'tool_call') {
                const { tool_name, parameters } = parsedAction;
                await this.callbackManager.invokeEvent('on_tool_start', { run_id: runId, data: { tool_name, parameters } });

                const tool = this.tools[tool_name];
                let observation;

                if (!tool) {
                    observation = `错误: 工具 "${tool_name}" 不存在。可用工具: ${Object.keys(this.tools).join(', ')}`;
                } else {
                    try {
                        const toolResult = await tool.invoke(parameters, { mode: 'deep_research' }); // 传递模式
                        observation = typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult);
                    } catch (error) {
                        observation = `错误: 工具 "${tool_name}" 执行失败: ${error.message}`;
                    }
                }
                
                intermediateSteps.push({ action: parsedAction, observation });
                await this.callbackManager.invokeEvent('on_tool_end', { run_id: runId, data: { tool_name, output: observation } });
            
            } else {
                // 🎯 如果解析失败或LLM无法决策，将LLM的原始思考加入上下文，让它自我纠正
                console.warn("[DeepResearchAgent] 模型未能规划出有效行动，将原始思考作为观察结果，尝试让其自我纠正。");
                const observation = `你上一步的思考未能产生有效的行动。请检查你的输出格式是否正确（必须是单行JSON），或者判断是否应该输出最终答案。你的上一步思考是：\n${agentDecisionText}`;
                intermediateSteps.push({ action: { tool_name: 'self_correction', parameters: {} }, observation });
            }
        }

        const report = "# 研究达到最大迭代次数\n\n研究已达到最大迭代次数，但未得出最终结论。";
        await this.callbackManager.invokeEvent('on_research_end', { run_id: runId, data: { success: false, report, iterations } });
        return { success: false, report, iterations };
    }
}