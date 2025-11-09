// src/static/js/agent/deepresearch/DeepResearchAgent.js - 完整调试版本

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler;
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
        
        console.log(`[DeepResearchAgent] 开始研究: "${topic}"`);
        await this.callbackManager.invokeEvent('on_research_start', { 
            run_id: runId, 
            data: { topic, availableTools: availableTools.map(t => t.name) } 
        });

        let intermediateSteps = [];
        let iterations = 0;
        // 🎯 新增：收集所有来源信息
        let allSources = [];

        while (iterations < this.maxIterations) {
            iterations++;
            console.log(`[DeepResearchAgent] 第 ${iterations}/${this.maxIterations} 次迭代开始`);
            
            await this.callbackManager.invokeEvent('on_research_progress', { 
                run_id: runId, 
                data: { 
                    iteration: iterations, 
                    total: this.maxIterations,
                    currentSteps: intermediateSteps.length 
                } 
            });

            // 🎯 构建AgentLogic输入数据
            const logicInput = { 
                topic, 
                intermediateSteps, 
                availableTools 
            };
            
            console.log('[DeepResearchAgent] 传递给AgentLogic的数据:', {
                topic,
                intermediateStepsCount: intermediateSteps.length,
                availableTools: availableTools.map(t => t.name),
                lastStep: intermediateSteps.length > 0 ? 
                    intermediateSteps[intermediateSteps.length - 1].action.tool_name : '无'
            });

            const agentDecisionText = await this.agentLogic.plan(logicInput, { 
                run_id: runId, 
                callbackManager: this.callbackManager 
            });

            console.log('[DeepResearchAgent] AgentLogic返回的原始决策文本:');
            console.log('--- 开始 ---');
            console.log(agentDecisionText);
            console.log('--- 结束 ---');

            const parsedAction = this.outputParser.parse(agentDecisionText);
            console.log('[DeepResearchAgent] OutputParser解析结果:', {
                type: parsedAction.type,
                tool_name: parsedAction.tool_name,
                thought_length: parsedAction.thought?.length,
                parameters: parsedAction.parameters
            });

            // 🎯 处理最终答案
            if (parsedAction.type === 'final_answer') {
                console.log('[DeepResearchAgent] ✅ 检测到最终答案，研究完成');
                
                // 🎯 直接使用外层已经收集好的 allSources
                let finalReport = parsedAction.answer;
                if (allSources.length > 0) {
                    finalReport += `\n\n${this._generateSourcesSection(allSources)}`;
                    console.log(`[DeepResearchAgent] 添加了 ${allSources.length} 个资料来源`);
                } else {
                    console.log('[DeepResearchAgent] 警告：没有收集到任何资料来源');
                }
                
                const result = {
                    success: true,
                    report: finalReport,
                    iterations,
                    intermediateSteps,
                    sources: allSources // 🎯 新增：返回来源信息
                };
                
                await this.callbackManager.invokeEvent('on_research_end', {
                    run_id: runId,
                    data: result
                });
                return result;
            }

            // 🎯 处理工具调用
            if (parsedAction.type === 'tool_call') {
                const { tool_name, parameters, thought } = parsedAction;
                console.log(`[DeepResearchAgent] 🔧 执行工具调用: ${tool_name}`, parameters);
                
                await this.callbackManager.invokeEvent('on_tool_start', {
                    run_id: runId,
                    data: { tool_name, parameters, thought }
                });

                const tool = this.tools[tool_name];
                let rawObservation;
                let toolSources = []; // 🎯 新增：保存本次工具调用的来源
                
                if (!tool) {
                    rawObservation = `错误: 工具 "${tool_name}" 不存在。可用工具: ${Object.keys(this.tools).join(', ')}`;
                    console.error(`[DeepResearchAgent] ❌ 工具不存在: ${tool_name}`);
                } else {
                    try {
                        console.log(`[DeepResearchAgent] 调用工具: ${tool_name}...`);
                        const toolResult = await tool.invoke(parameters, { mode: 'deep_research' });
                        rawObservation = toolResult.output || JSON.stringify(toolResult);
                        
                        // 🎯 新增：提取来源信息
                        if (toolResult.sources && Array.isArray(toolResult.sources)) {
                            toolSources = toolResult.sources.map(source => ({
                                title: source.title || '无标题',
                                url: source.url || '#',
                                description: source.description || '',
                                collectedAt: new Date().toISOString()
                            }));
                            console.log(`[DeepResearchAgent] 提取到 ${toolSources.length} 个来源`);
                        }
                        
                        console.log(`[DeepResearchAgent] ✅ 工具执行成功，结果长度: ${rawObservation.length}`);
                    } catch (error) {
                        rawObservation = `错误: 工具 "${tool_name}" 执行失败: ${error.message}`;
                        console.error(`[DeepResearchAgent] ❌ 工具执行失败: ${tool_name}`, error);
                    }
                }
                
                // 处理过长内容
                const summarizedObservation = await this._smartSummarizeObservation(topic, rawObservation);
                
                // 🎯 保存完整的步骤信息（包含思考过程和来源）
                intermediateSteps.push({
                    action: {
                        type: 'tool_call',
                        tool_name: tool_name,
                        parameters: parameters,
                        thought: thought || `执行工具 ${tool_name} 来获取更多信息。`
                    },
                    observation: summarizedObservation,
                    sources: toolSources // 🎯 新增：保存来源
                });
                
                // 🎯 新增：合并到总来源列表
                allSources = [...allSources, ...toolSources];
                
                await this.callbackManager.invokeEvent('on_tool_end', {
                    run_id: runId,
                    data: {
                        tool_name,
                        output: summarizedObservation,
                        sources_count: toolSources.length
                    }
                });
            
            } else {
                // 🎯 处理解析错误
                console.warn('[DeepResearchAgent] ⚠️ 输出解析失败，触发自我纠正');
                const observation = `格式错误: ${parsedAction.log || '无法解析响应'}。请严格遵循指令格式：思考: ... 行动: {...} 或 最终答案: ...`;
                
                intermediateSteps.push({ 
                    action: { 
                        tool_name: 'self_correction', 
                        parameters: {},
                        thought: parsedAction.thought || agentDecisionText.substring(0, 500),
                        type: 'error'
                    }, 
                    observation 
                });
                
                await this.callbackManager.invokeEvent('on_research_progress', {
                    run_id: runId,
                    data: { 
                        iteration: iterations, 
                        total: this.maxIterations,
                        warning: '输出解析失败，已触发自我纠正',
                        error: parsedAction.log
                    }
                });
            }
        }

        // 🎯 达到最大迭代次数的处理
        const report = this._generateFinalReport(topic, intermediateSteps, iterations, allSources);
        
        console.warn(`[DeepResearchAgent] ❌ 达到最大迭代次数 ${this.maxIterations}，研究失败`);
        const result = {
            success: false,
            report,
            iterations: this.maxIterations,
            intermediateSteps,
            sources: allSources // 🎯 新增：返回来源信息
        };
        
        await this.callbackManager.invokeEvent('on_research_end', {
            run_id: runId,
            data: result
        });
        return result;
    }

    // 🎯 新增：生成包含资料来源的最终报告
    _generateFinalReport(topic, intermediateSteps, iterations, sources) {
        let report = `# 研究达到最大迭代次数\n\n`;
        report += `研究主题: "${topic}"\n\n`;
        report += `已达到最大迭代次数 (${iterations})，但未得出最终结论。\n\n`;
        
        if (intermediateSteps.length > 0) {
            report += `## 收集到的信息\n\n`;
            intermediateSteps.forEach((step, index) => {
                report += `### 步骤 ${index + 1}: ${step.action.tool_name}\n`;
                if (step.action.thought) {
                    report += `**思考**: ${step.action.thought}\n\n`;
                }
                report += `**观察**: ${step.observation.substring(0, 800)}${step.observation.length > 800 ? '...' : ''}\n\n`;
            });
        } else {
            report += `未收集到任何有效信息。\n`;
        }
        
        // 🎯 新增：添加资料来源部分
        if (sources && sources.length > 0) {
            report += this._generateSourcesSection(sources);
        }
        
        return report;
    }

    // 🎯 新增：生成资料来源部分的方法
    _generateSourcesSection(sources) {
        let sourcesText = `## 资料来源\n\n`;
        sourcesText += `本研究报告基于以下信息来源，供您参考和验证：\n\n`;
        
        // 去重处理（基于URL）
        const uniqueSources = sources.filter((source, index, self) =>
            index === self.findIndex(s => s.url === source.url)
        );
        
        uniqueSources.forEach((source, index) => {
            // 移除了标题的加粗，并去掉了描述和多余的换行
            sourcesText += `${index + 1}. ${source.title}\n`;
            sourcesText += `   网址: ${source.url}\n\n`; // 保留一个换行用于条目间距
        });
        
        sourcesText += `*注：以上信息采集时间为研究执行期间，网站内容可能随时间变化。*\n\n`;
        
        return sourcesText;
    }

    async _smartSummarizeObservation(mainTopic, observation) {
        const threshold = 2000;
        if (!observation || typeof observation !== 'string' || observation.length < threshold) {
            return observation.length > threshold ? 
                observation.substring(0, threshold) + "\n[...内容已截断]" : 
                observation;
        }

        console.log(`[DeepResearchAgent] 内容过长 (${observation.length} > ${threshold})，启动摘要子代理...`);
        await this.callbackManager.invokeEvent('agent:thinking', { 
            detail: { 
                content: '正在调用摘要子代理压缩上下文...', 
                type: 'summarize', 
                agentType: 'deep_research' 
            } 
        });

        const summarizerPrompt = `你是一个专业的信息分析师。基于"主要研究主题"，从以下原始文本中提取最关键和相关的信息，创建一个简洁的摘要。摘要必须保留关键数据、名称、结论和核心论点。控制在400字以内。

---
主要研究主题: "${mainTopic}"
---
原始文本:
${observation.substring(0, 10000)} 
---

你的简洁摘要:`;

        try {
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: summarizerPrompt }],
                model: 'gemini-2.0-flash-exp-summarizer',
                stream: false,
            });

            const choice = response && response.choices && response.choices[0];
            const summary = choice && choice.message && choice.message.content ? 
                choice.message.content : '摘要生成失败。';
            
            console.log("[DeepResearchAgent] ✅ 摘要子代理完成，摘要长度:", summary.length);
            return `[AI生成的摘要]:\n${summary}`;

        } catch (error) {
            console.error("[DeepResearchAgent] ❌ 摘要子代理调用失败:", error);
            return observation.substring(0, threshold) + "\n\n[...内容过长，摘要失败，内容已截断...]";
        }
    }
}