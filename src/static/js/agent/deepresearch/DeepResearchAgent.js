// src/static/js/agent/deepresearch/DeepResearchAgent.js - 智能迭代控制版本

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

        // ✨ 新增：性能追踪
        this.metrics = {
            toolUsage: { tavily_search: 0, crawl4ai: 0, python_sandbox: 0 },
            stepProgress: [],
            informationGain: [],
            planCompletion: 0
        };

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

        // ✨ 阶段1：智能规划
        console.log(`[DeepResearchAgent] 阶段1：生成研究计划...`);
        let researchPlan;
        try {
            researchPlan = await this.agentLogic.createInitialPlan(topic);
            
            // 实时通知UI研究计划
            await this.callbackManager.invokeEvent('on_research_plan_generated', {
                run_id: runId,
                data: {
                    plan: researchPlan.research_plan,
                    estimated_iterations: researchPlan.estimated_iterations,
                    risk_assessment: researchPlan.risk_assessment
                }
            });

            console.log(`[DeepResearchAgent] 研究计划生成完成，预计${researchPlan.estimated_iterations}次迭代`);
        } catch (error) {
            console.error('[DeepResearchAgent] 研究计划生成失败，使用降级方案:', error);
            researchPlan = this.agentLogic._createFallbackPlan(topic);
        }

        // ✨ 阶段2：自适应执行
        let intermediateSteps = [];
        let iterations = 0;
        let consecutiveNoGain = 0; // 追踪无效迭代
        let lastInformationCount = 0;
        let allSources = [];

        while (iterations < this.maxIterations && consecutiveNoGain < 2) {
            iterations++;
            console.log(`[DeepResearchAgent] 迭代 ${iterations}/${this.maxIterations}`);
            
            await this.callbackManager.invokeEvent('on_research_progress', { 
                run_id: runId, 
                data: { 
                    iteration: iterations, 
                    total: this.maxIterations,
                    currentSteps: intermediateSteps.length,
                    metrics: this.metrics
                } 
            });

            try {
                // 🎯 构建AgentLogic输入数据
                const logicInput = { 
                    topic, 
                    intermediateSteps, 
                    availableTools,
                    researchPlan 
                };

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
                        sources: allSources,
                        metrics: this.metrics,
                        plan_completion: this._calculatePlanCompletion(researchPlan, intermediateSteps)
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
                            
                            // ✨ 追踪工具使用
                            if (this.metrics.toolUsage[tool_name] !== undefined) {
                                this.metrics.toolUsage[tool_name]++;
                            }
                            
                        } catch (error) {
                            rawObservation = `错误: 工具 "${tool_name}" 执行失败: ${error.message}`;
                            console.error(`[DeepResearchAgent] ❌ 工具执行失败: ${tool_name}`, error);
                        }
                    }
                    
                    // 处理过长内容
                    const summarizedObservation = await this._smartSummarizeObservation(topic, rawObservation);
                    
                    // ✨ 评估信息增益
                    const currentInfoGain = this._calculateInformationGain(summarizedObservation, intermediateSteps);
                    this.metrics.informationGain.push(currentInfoGain);
                    
                    if (currentInfoGain < 0.1) { // 信息增益阈值
                        consecutiveNoGain++;
                        console.log(`[DeepResearchAgent] 低信息增益 ${currentInfoGain.toFixed(2)}，连续${consecutiveNoGain}次`);
                    } else {
                        consecutiveNoGain = 0;
                    }
                    
                    // 保存完整的步骤信息（包含思考过程和来源）
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
                            sources_count: toolSources.length,
                            information_gain: currentInfoGain
                        }
                    });

                    // ✨ 智能提前终止：基于计划完成度
                    const completionRate = this._calculatePlanCompletion(researchPlan, intermediateSteps);
                    this.metrics.planCompletion = completionRate;
                    
                    if (completionRate > 0.8 && consecutiveNoGain >= 1) {
                        console.log(`[DeepResearchAgent] 计划完成度${completionRate}%，提前终止`);
                        break;
                    }
                
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

            } catch (error) {
                console.error(`[DeepResearchAgent] 迭代 ${iterations} 失败:`, error);
                // 记录错误但继续执行
                intermediateSteps.push({ 
                    action: { 
                        tool_name: 'error', 
                        parameters: {},
                        thought: `执行出错: ${error.message}`,
                        type: 'error'
                    }, 
                    observation: '系统执行错误，继续研究' 
                });
            }
        }

        // ✨ 阶段3：优化报告生成
        console.log('[DeepResearchAgent] 研究完成，生成最终报告');
        
        let result;
        if (iterations < this.maxIterations && consecutiveNoGain < 2) {
            // 正常完成
            const finalReport = await this._generateFinalReport(topic, intermediateSteps, researchPlan, allSources);
            result = {
                success: true,
                report: finalReport,
                iterations,
                intermediateSteps,
                sources: allSources,
                metrics: this.metrics,
                plan_completion: this._calculatePlanCompletion(researchPlan, intermediateSteps)
            };
        } else {
            // 达到最大迭代次数或连续无增益
            const report = this._generateFinalReport(topic, intermediateSteps, researchPlan, allSources);
            result = {
                success: false,
                report,
                iterations: this.maxIterations,
                intermediateSteps,
                sources: allSources,
                metrics: this.metrics,
                plan_completion: this._calculatePlanCompletion(researchPlan, intermediateSteps)
            };
            console.warn(`[DeepResearchAgent] ❌ 达到终止条件，研究结束`);
        }
        
        await this.callbackManager.invokeEvent('on_research_end', {
            run_id: runId,
            data: result
        });
        return result;
    }

    // ✨ 新增：信息增益计算
    _calculateInformationGain(newObservation, history) {
        const previousText = history.map(h => h.observation).join(' ');
        const newText = newObservation;
        
        // 简单基于新词出现的计算（可升级为更复杂的NLP方法）
        const previousWords = new Set(previousText.split(/\s+/));
        const newWords = newText.split(/\s+/).filter(word => word.length > 2);
        
        const novelWords = newWords.filter(word => !previousWords.has(word));
        return novelWords.length / Math.max(newWords.length, 1);
    }

    // ✨ 新增：计划完成度计算
    _calculatePlanCompletion(plan, history) {
        if (!plan || !history || history.length === 0) return 0;
        
        const completedSteps = plan.research_plan.filter(step => 
            this._isStepEvidenceInHistory(step, history)
        ).length;
        
        return completedSteps / plan.research_plan.length;
    }

    _isStepEvidenceInHistory(step, history) {
        const stepKeywords = step.sub_question.toLowerCase().split(/\s+/);
        const historyText = history.map(h => `${h.action.thought || ''} ${h.observation || ''}`).join(' ').toLowerCase();
        
        return stepKeywords.some(keyword => 
            historyText.includes(keyword) && keyword.length > 3
        );
    }

    // ✨ 优化：最终报告生成
    async _generateFinalReport(topic, intermediateSteps, plan, sources) {
        // 收集所有观察结果
        const allObservations = intermediateSteps
            .filter(step => step.observation && step.observation !== '系统执行错误，继续研究')
            .map(step => step.observation)
            .join('\n\n');

        // 使用LLM整合和格式化最终报告
        const reportPrompt = `
基于以下研究内容，生成一份结构完整、内容深度的研究报告。

研究主题：${topic}
研究计划：${plan ? JSON.stringify(plan.research_plan) : '无计划'}
收集信息：${allObservations}

报告要求：
1. 格式：Markdown
2. 结构：
   # 主标题
   ## 一、引言与背景
   ## 二、核心分析（至少2个子部分）
   ## 三、深度洞察
   ## 四、总结
3. 字数：800-1200字
4. 风格：专业、客观、信息密集
5. 关键信息标注来源

现在生成最终报告：`;

        try {
            const reportResponse = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: reportPrompt }],
                model: 'gemini-2.5-flash-preview-09-2025',
                temperature: 0.3,
            });
            
            let finalReport = reportResponse?.choices?.[0]?.message?.content || '报告生成失败';
            
            // 添加资料来源
            if (sources && sources.length > 0) {
                finalReport += `\n\n${this._generateSourcesSection(sources)}`;
            }
            
            return finalReport;
        } catch (error) {
            console.error('[DeepResearchAgent] 报告生成失败:', error);
            return this._generateFallbackReport(topic, intermediateSteps, sources);
        }
    }

    _generateFallbackReport(topic, intermediateSteps, sources) {
        // 降级报告生成逻辑
        const observations = intermediateSteps
            .filter(step => step.observation)
            .map(step => `• ${step.observation.substring(0, 200)}...`)
            .join('\n');
            
        let report = `# ${topic}\n\n## 收集的信息\n${observations}\n\n## 总结\n基于收集的信息整理完成。`;
        
        // 添加资料来源
        if (sources && sources.length > 0) {
            report += `\n\n${this._generateSourcesSection(sources)}`;
        }
            
        return report;
    }

    // 🎯 保留：生成资料来源部分的方法
    _generateSourcesSection(sources) {
        let sourcesText = `## 资料来源\n\n`;
        sourcesText += `本研究报告基于以下信息来源，供您参考和验证：\n\n`;
        
        // 去重处理（基于URL）
        const uniqueSources = sources.filter((source, index, self) =>
            index === self.findIndex(s => s.url === source.url)
        );
        
        uniqueSources.forEach((source, index) => {
            sourcesText += `${index + 1}. ${source.title}\n`;
            sourcesText += `   网址: ${source.url}\n\n`;
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