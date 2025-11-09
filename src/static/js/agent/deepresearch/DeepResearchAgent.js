// src/static/js/agent/deepresearch/DeepResearchAgent.js - 重构版

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.tools = tools; // 工具执行器
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

        let intermediateSteps = []; // 上下文历史
        let iterations = 0;

        while (iterations < this.maxIterations) {
            iterations++;
            await this.callbackManager.invokeEvent('on_research_progress', { run_id: runId, data: { iteration: iterations, total: this.maxIterations } });

            // 1. 思考
            const agentDecisionText = await this.agentLogic.plan({
                topic,
                intermediateSteps,
                availableTools 
            }, { run_id: runId, callbackManager: this.callbackManager });
            
            const parsedAction = this.outputParser.parse(agentDecisionText);

            // 2. 检查是否得出最终答案
            if (parsedAction.type === 'final_answer') {
                await this.callbackManager.invokeEvent('on_research_end', { run_id: runId, data: { success: true, report: parsedAction.answer, iterations } });
                return { success: true, report: parsedAction.answer, iterations };
            }

            // 3. 如果是工具调用，则执行
            if (parsedAction.type === 'tool_call') {
                const { tool_name, parameters } = parsedAction;
                await this.callbackManager.invokeEvent('on_tool_start', { run_id: runId, data: { tool_name, parameters } });

                const tool = this.tools[tool_name];
                let observation;

                if (!tool) {
                    observation = `错误: 工具 "${tool_name}" 不存在。`;
                } else {
                    try {
                        const toolResult = await tool.invoke(parameters);
                        observation = toolResult.output;
                    } catch (error) {
                        observation = `错误: 工具 "${tool_name}" 执行失败: ${error.message}`;
                    }
                }
                
                // 4. 将观察结果存入历史记录，形成上下文
                intermediateSteps.push({ action: parsedAction, observation });
                await this.callbackManager.invokeEvent('on_tool_end', { run_id: runId, data: { tool_name, output: observation } });
            } else {
                // 如果模型未能做出有效决策
                const report = "研究终止：未能规划出有效的下一步行动。";
                await this.callbackManager.invokeEvent('on_research_end', { run_id: runId, data: { success: false, report, iterations } });
                return { success: false, report, iterations };
            }
        }

        const report = "研究达到最大迭代次数，未能得出最终结论。";
        await this.callbackManager.invokeEvent('on_research_end', { run_id: runId, data: { success: false, report, iterations } });
        return { success: false, report, iterations };
    }
}