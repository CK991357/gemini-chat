// src/static/js/agent/deepresearch/DeepResearchAgent.js - 最终版

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

        let intermediateSteps = []; // 这就是我们的上下文记忆
        let iterations = 0;

        while (iterations < this.maxIterations) {
            iterations++;
            await this.callbackManager.invokeEvent('on_research_progress', { run_id: runId, data: { iteration: iterations, total: this.maxIterations } });

            // 1. 思考 (将上下文记忆`intermediateSteps`传给大脑)
            const agentDecisionText = await this.agentLogic.plan({
                topic,
                intermediateSteps,
                availableTools 
            }, { run_id: runId, callbackManager: this.callbackManager });
            
            // 2. 解析决策
            const parsedAction = this.outputParser.parse(agentDecisionText);

            // 3. 根据决策行动
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
                        // 🎯 关键：传递'deep_research'模式，让工具返回更丰富的结果
                        const toolResult = await tool.invoke(parameters, { mode: 'deep_research' });
                        observation = typeof toolResult.output === 'string' ? toolResult.output : JSON.stringify(toolResult);
                    } catch (error) {
                        observation = `错误: 工具 "${tool_name}" 执行失败: ${error.message}`;
                    }
                }
                
                // 4. 记录“行动”和“观察”到上下文记忆中
                intermediateSteps.push({ action: parsedAction, observation });
                await this.callbackManager.invokeEvent('on_tool_end', { run_id: runId, data: { tool_name, output: observation } });
            
            } else { // 处理解析失败 (parsedAction.type === 'error')
                console.warn("[DeepResearchAgent] 模型未能规划出有效行动，将启动自我纠正机制。");
                const observation = `你上一步的思考未能产生有效的行动JSON或最终答案。请严格遵循指令，检查你的输出格式，然后重试。你的上一步思考是：\n${agentDecisionText}`;
                // 将纠正指令作为“观察”加入记忆，让模型在下一步看到并改正
                intermediateSteps.push({ action: { tool_name: 'self_correction', parameters: {} }, observation });
            }
        }

        const report = "# 研究达到最大迭代次数\n\n研究已达到最大迭代次数，但未得出最终结论。";
        await this.callbackManager.invokeEvent('on_research_end', { run_id: runId, data: { success: false, report, iterations } });
        return { success: false, report, iterations };
    }
}