// src/static/js/agent/deepresearch/DeepResearchAgent.js - 最终修复版

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';
// 🎯 核心修改：从 ReportTemplates.js 导入工具函数
import { getTemplateByResearchMode } from './ReportTemplates.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.tools = tools;
        this.callbackManager = callbackManager;
        this.maxIterations = config.maxIterations || 8;
        
        this.agentLogic = new AgentLogic(chatApiHandler);
        this.outputParser = new AgentOutputParser();

        // ✨ 性能追踪
        this.metrics = {
            toolUsage: { tavily_search: 0, crawl4ai: 0, python_sandbox: 0 },
            stepProgress: [],
            informationGain: [],
            planCompletion: 0,
            tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };

        console.log(`[DeepResearchAgent] 初始化完成，可用研究工具: ${Object.keys(tools).join(', ')}`);
    }

    // 🎯 新增：Token 追踪方法
    _updateTokenUsage(usage) {
        if (!usage) return;
        
        this.metrics.tokenUsage.prompt_tokens += usage.prompt_tokens || 0;
        this.metrics.tokenUsage.completion_tokens += usage.completion_tokens || 0;
        this.metrics.tokenUsage.total_tokens += usage.total_tokens || 0;
        
        console.log(`[DeepResearchAgent] Token 使用更新:`, this.metrics.tokenUsage);
    }

    async conductResearch(researchRequest) {
        // ✨ 修复：直接从 Orchestrator 接收模式和清理后的主题
        // ✨✨✨ 核心修复：解构出 displayTopic ✨✨✨
        const { topic, displayTopic, availableTools, researchMode } = researchRequest;
        const runId = this.callbackManager.generateRunId();
        
        // 原始 topic (enrichedTopic) 用于 Agent 内部逻辑
        const internalTopic = topic.replace(/！\s*$/, '').trim();
        // displayTopic 用于 UI 显示
        const uiTopic = (displayTopic || topic).replace(/！\s*$/, '').trim();
        
        const detectedMode = researchMode || 'standard';
        
        console.log(`[DeepResearchAgent] 开始研究: "${uiTopic}"，接收到模式: ${detectedMode}`);
        
        // ✨✨✨ 核心修复：在 on_research_start 事件中使用 uiTopic ✨✨✨
        await this.callbackManager.invokeEvent('on_research_start', {
            run_id: runId,
            data: {
                topic: uiTopic, // <--- 使用干净的 topic
                availableTools: availableTools.map(t => t.name),
                researchMode: detectedMode,
                researchData: {
                    keywords: [], // 初始化空数组，后续更新
                    sources: [],
                    analyzedContent: [],
                    toolCalls: [],
                    metrics: this.metrics
                }
            }
        });

        // 🎯 修复：在研究过程中更新统计数据
        const updateResearchStats = (updates) => {
            this.callbackManager.invokeEvent('on_research_stats_updated', {
                run_id: runId,
                data: updates
            });
        };

        // 🎯 修复：记录工具调用
        const recordToolCall = (toolName, parameters, success, result) => {
            this.callbackManager.invokeEvent('on_tool_called', {
                run_id: runId,
                data: { toolName, parameters, success, result }
            });
        };

        // ✨ 阶段1：智能规划
        console.log(`[DeepResearchAgent] 阶段1：生成${detectedMode}研究计划...`);
        let researchPlan;
        try {
            // ✨✨✨ 核心修复：规划时使用完整的 internalTopic (enrichedTopic) ✨✨✨
            const planResult = await this.agentLogic.createInitialPlan(internalTopic, detectedMode);
            researchPlan = planResult;
            this._updateTokenUsage(planResult.usage); // 🎯 新增
            
            // 实时通知UI研究计划
            await this.callbackManager.invokeEvent('on_research_plan_generated', {
                run_id: runId,
                data: {
                    plan: researchPlan.research_plan,
                    keywords: [], // 占位符，将在后续更新
                    estimated_iterations: researchPlan.estimated_iterations,
                    risk_assessment: researchPlan.risk_assessment,
                    research_mode: detectedMode
                }
            });

            console.log(`[DeepResearchAgent] ${detectedMode}研究计划生成完成，预计${researchPlan.estimated_iterations}次迭代`);
        } catch (error) {
            console.error('[DeepResearchAgent] 研究计划生成失败，使用降级方案:', error);
            researchPlan = this.agentLogic._createFallbackPlan(internalTopic, detectedMode);
        }

        // ✨ 阶段2：自适应执行
        let intermediateSteps = [];
        let iterations = 0;
        let consecutiveNoGain = 0;
        let allSources = [];
        let finalAnswerFromIteration = null;
        
        const totalSteps = researchPlan.research_plan.length; // 新增：总计划步骤数

        while (iterations < this.maxIterations && consecutiveNoGain < 2 && !finalAnswerFromIteration) {
            iterations++;
            console.log(`[DeepResearchAgent] 迭代 ${iterations}/${this.maxIterations}`);
            
            const planCompletion = this._calculatePlanCompletion(researchPlan, intermediateSteps); // 计算完成度
            
            await this.callbackManager.invokeEvent('on_research_progress', {
                run_id: runId,
                data: {
                    iteration: iterations,
                    total_iterations: this.maxIterations, // 统一命名
                    current_step: intermediateSteps.length, // 统一命名
                    total_steps: totalSteps, // 新增
                    plan_completion: planCompletion, // 新增
                    sources_collected: allSources.length, // 新增
                    metrics: this.metrics,
                    research_mode: detectedMode
                }
            });

            try {
                // 🎯 构建AgentLogic输入数据
                // ✨✨✨ 核心修复：将 internalTopic 和 uiTopic 都传递给 AgentLogic ✨✨✨
                const logicInput = {
                    topic: internalTopic,     // 供 LLM 使用的完整上下文
                    displayTopic: uiTopic,      // 备用，以防需要
                    intermediateSteps,
                    availableTools,
                    researchPlan,
                    researchMode: detectedMode
                };

                const agentDecision = await this.agentLogic.plan(logicInput, {
                    run_id: runId,
                    callbackManager: this.callbackManager
                });
                const agentDecisionText = agentDecision.responseText;
                this._updateTokenUsage(agentDecision.usage); // 🎯 新增

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
                    console.log('[DeepResearchAgent] ✅ Agent在迭代中决定生成最终答案，保存答案并跳出循环');
                    finalAnswerFromIteration = parsedAction.answer;
                    break; // 跳出循环
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
                    let toolSources = [];
                    let toolSuccess = false; // 新增：追踪工具执行状态
                    
                    if (!tool) {
                        rawObservation = `错误: 工具 "${tool_name}" 不存在。可用工具: ${Object.keys(this.tools).join(', ')}`;
                        console.error(`[DeepResearchAgent] ❌ 工具不存在: ${tool_name}`);
                    } else {
                        try {
                            console.log(`[DeepResearchAgent] 调用工具: ${tool_name}...`);
                            const toolResult = await tool.invoke(parameters, {
                                mode: 'deep_research',
                                researchMode: detectedMode
                            });
                            rawObservation = toolResult.output || JSON.stringify(toolResult);
                            toolSuccess = true; // 工具执行成功
                            
                            // 🎯 提取来源信息
                            if (toolResult.sources && Array.isArray(toolResult.sources)) {
                                toolSources = toolResult.sources.map(source => ({
                                    title: source.title || '无标题',
                                    url: source.url || '#',
                                    description: source.description || '',
                                    collectedAt: new Date().toISOString(),
                                    used_in_report: false
                                }));
                                console.log(`[DeepResearchAgent] 提取到 ${toolSources.length} 个来源`);
                            }
                            
                            console.log(`[DeepResearchAgent] ✅ 工具执行成功，结果长度: ${rawObservation.length}`);
                            
                            // ✨ 追踪工具使用
                            if (this.metrics.toolUsage[tool_name] !== undefined) {
                                this.metrics.toolUsage[tool_name]++;
                            }
                            
                            // 🎯 修复：记录工具调用
                            recordToolCall(tool_name, parameters, true, rawObservation);

                        } catch (error) {
                            rawObservation = `错误: 工具 "${tool_name}" 执行失败: ${error.message}`;
                            console.error(`[DeepResearchAgent] ❌ 工具执行失败: ${tool_name}`, error);
                            // 🎯 修复：记录工具调用失败
                            recordToolCall(tool_name, parameters, false, error.message);
                        }
                    }
                    
                    // ✅✅✅ --- 核心修复：传入工具名称以应用不同的摘要策略 --- ✅✅✅
                    const summarizedObservation = await this._smartSummarizeObservation(internalTopic, rawObservation, detectedMode, tool_name);
                    
                    // ✨ 评估信息增益
                    const currentInfoGain = this._calculateInformationGain(summarizedObservation, intermediateSteps);
                    this.metrics.informationGain.push(currentInfoGain);
                    
                    if (currentInfoGain < 0.1) { // 信息增益阈值
                        consecutiveNoGain++;
                        console.log(`[DeepResearchAgent] 低信息增益 ${currentInfoGain.toFixed(2)}，连续${consecutiveNoGain}次`);
                    } else {
                        consecutiveNoGain = 0;
                    }
                    
                    // 保存完整的步骤信息
                    intermediateSteps.push({
                        action: {
                            type: 'tool_call',
                            tool_name: tool_name,
                            parameters: parameters,
                            thought: thought || `执行工具 ${tool_name} 来获取更多信息。`
                        },
                        observation: summarizedObservation,
                        sources: toolSources
                    });
                    
                    // 🎯 合并到总来源列表
                    allSources = [...allSources, ...toolSources];
                    
                    // 在收集到新来源时更新统计
                    updateResearchStats({
                        sources: allSources,
                        // ✨ 核心修复：传递过滤后的数组本身，而不是它的长度
                        toolCalls: intermediateSteps.filter(step => step.action.type === 'tool_call')
                    });
                    
                    await this.callbackManager.invokeEvent('on_tool_end', {
                        run_id: runId,
                        data: {
                            tool_name,
                            output: summarizedObservation,
                            sources_found: toolSources.length, // 统一命名为 sources_found
                            success: toolSuccess, // 新增：工具执行状态
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
                    const observation = `格式错误: ${parsedAction.error || '无法解析响应'}。请严格遵循指令格式：思考: ... 行动: {...} 或 最终答案: ...`;
                    
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
                            error: parsedAction.error
                        }
                    });
                }

            } catch (error) {
                // 🎯 简化错误处理：完全信任ChatApiHandler的重试机制
                console.error(`[DeepResearchAgent] 迭代 ${iterations} 失败:`, error);
                
                // 增强错误处理
                let thoughtText = `在第 ${iterations} 次迭代中遇到错误，尝试继续。错误: ${error.message}`;
                let observationText = '系统执行错误，将尝试在下一步骤中恢复。';

                // 检查是否为速率限制错误
                if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
                    thoughtText = `在第 ${iterations} 次迭代中遭遇API速率限制。这通常是由于请求过于频繁。我将暂停当前操作，并在下一步中调整策略，而不是重复之前的操作。`;
                    observationText = '错误: API速率限制。无法完成上一步操作。';
                    // 遭遇速率限制时，强制增加"无增益"计数，以加速跳出无效循环
                    consecutiveNoGain++;
                }

                intermediateSteps.push({
                    action: {
                        tool_name: 'internal_error',
                        parameters: {},
                        thought: thoughtText, // 使用新的思考文本
                        type: 'error'
                    },
                    observation: observationText // 使用新的观察文本
                });
                
                // 增加连续无增益计数，避免在连续错误中死循环
                consecutiveNoGain++;
            }
        }

        // 在每次迭代结束时更新统计
        updateResearchStats({
            iterations: iterations,
            metrics: this.metrics // 🎯 确保包含 tokenUsage
        });
        
        // ✨ 阶段3：统一的报告生成
        console.log('[DeepResearchAgent] 研究完成，进入统一报告生成阶段...');

        // 提取所有观察结果用于关键词分析
        const allObservationsForKeywords = intermediateSteps.map(s => s.observation).join(' ');
        const keywords = this._extractKeywords(uiTopic, allObservationsForKeywords);
        
        // 更新关键词统计
        updateResearchStats({ keywords });
        
        let finalReport;
        if (finalAnswerFromIteration) {
            console.log('[DeepResearchAgent] 使用迭代中生成的答案作为报告基础');
            finalReport = finalAnswerFromIteration;
        } else {
            console.log('[DeepResearchAgent] 调用报告生成模型进行最终整合');
            // ✨✨✨ 核心修复：生成报告时使用 uiTopic ✨✨✨
            finalReport = await this._generateFinalReport(uiTopic, intermediateSteps, researchPlan, allSources, detectedMode);
        }

        // ✨ 附加所有收集到的资料来源
        const uniqueSources = this._deduplicateSources(allSources);
        finalReport += this._generateSourcesSection(uniqueSources);
        console.log(`[DeepResearchAgent] 最终报告完成，附加了 ${uniqueSources.length} 个资料来源`);

        const result = {
            success: true, // 只要能生成报告就视为成功
            topic: uiTopic, // 最终返回给 UI 的 topic 也应该是干净的
            report: finalReport,
            iterations,
            intermediateSteps,
            sources: uniqueSources,
            metrics: this.metrics,
            plan_completion: this._calculatePlanCompletion(researchPlan, intermediateSteps),
            research_mode: detectedMode
        };
        
        await this.callbackManager.invokeEvent('on_research_end', {
            run_id: runId,
            data: result
        });
        return result;
    }

    // ✨ 最终报告生成 - 现在只负责合成
    async _generateFinalReport(topic, intermediateSteps, plan, sources, researchMode) {
        try {
            // 1. 提取补充资料来源
            const extractedSources = this._extractSourcesFromIntermediateSteps(intermediateSteps);
            const combinedSources = [...sources, ...extractedSources];
            const uniqueSources = this._deduplicateSources(combinedSources);
            console.log(`[DeepResearchAgent] 提取到 ${extractedSources.length} 个补充来源，总计 ${uniqueSources.length} 个潜在来源`);
            
            // 2. 收集所有观察结果
            const allObservations = intermediateSteps
                .filter(step => step.observation && 
                               step.observation !== '系统执行错误，继续研究' &&
                               !step.observation.includes('OutputParser解析失败'))
                .map(step => {
                    let observation = step.observation;
                    // 清理观察结果中的冗余信息
                    if (observation.includes('【来源')) {
                        observation = observation.split('【来源')[0].trim();
                    }
                    return observation;
                })
                .filter(obs => obs.length > 50) // 只保留有内容的观察
                .join('\n\n');
            
            // 3. 使用LLM生成结构化报告（基于研究模式）
            const reportPrompt = this._buildReportPrompt(topic, plan, allObservations, researchMode);

            const reportResponse = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: reportPrompt }],
                model: 'gemini-2.5-flash-preview-09-2025',
                temperature: 0.3,
            });
            this._updateTokenUsage(reportResponse.usage); // 🎯 新增
            
            let finalReport = reportResponse?.choices?.[0]?.message?.content || 
                this._generateFallbackReport(topic, intermediateSteps, uniqueSources, researchMode);
            
            console.log(`[DeepResearchAgent] 报告生成完成，模式: ${researchMode}`);
            return finalReport;
            
        } catch (error) {
            console.error('[DeepResearchAgent] 报告生成失败:', error);
            return this._generateFallbackReport(topic, intermediateSteps, sources, researchMode);
        }
    }

    // ✨ 新增：强化资料来源提取
    _extractSourcesFromIntermediateSteps(intermediateSteps) {
        const sources = new Map(); // 使用Map避免重复来源
        
        intermediateSteps.forEach(step => {
            if (step.observation && typeof step.observation === 'string') {
                // 从tavily_search结果中提取来源
                if (step.action.tool_name === 'tavily_search' && step.observation.includes('【来源')) {
                    const sourceMatches = step.observation.match(/【来源\s*\d+】[^】]*?https?:\/\/[^\s)]+/g);
                    if (sourceMatches) {
                        sourceMatches.forEach(source => {
                            const urlMatch = source.match(/(https?:\/\/[^\s)]+)/);
                            if (urlMatch) {
                                const url = urlMatch[1];
                                const titleMatch = source.match(/【来源\s*\d+】([^】]*?)(?=http|$)/);
                                const title = titleMatch ? titleMatch[1].trim() : '未知标题';
                                
                                if (!sources.has(url)) {
                                    sources.set(url, {
                                        title: title,
                                        url: url,
                                        used_in_report: false
                                    });
                                }
                            }
                        });
                    }
                }
                
                // 从crawl4ai结果中提取来源
                if (step.action.tool_name === 'crawl4ai' && step.action.parameters && step.action.parameters.url) {
                    const url = step.action.parameters.url;
                    if (!sources.has(url)) {
                        sources.set(url, {
                            title: `爬取页面: ${new URL(url).hostname}`,
                            url: url,
                            used_in_report: false
                        });
                    }
                }
            }
        });
        
        return Array.from(sources.values());
    }

    // ✨ 新增：来源去重
    _deduplicateSources(sources) {
        const seen = new Set();
        return sources.filter(source => {
            const key = source.url;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    // ✨ 新增：关键词提取
    _extractKeywords(topic, observations) {
        // 简单的关键词提取逻辑
        const words = (topic + ' ' + observations).split(/\s+/)
            .filter(word => word.length > 2)
            .map(word => word.toLowerCase());
        
        const keywordCounts = words.reduce((acc, word) => {
            acc[word] = (acc[word] || 0) + 1;
            return acc;
        }, {});
        
        return Object.entries(keywordCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([term, count]) => ({ term, count }));
    }

    // 🎯 核心重构：构建报告提示词 - 使用单一来源原则
    _buildReportPrompt(topic, plan, observations, researchMode) {
        // 🎯 DRY原则优化：从 ReportTemplates.js 动态获取配置
        const template = getTemplateByResearchMode(researchMode);
        
        // 如果找不到模板，提供安全的回退
        if (!template) {
            console.warn(`[DeepResearchAgent] 未能为 researchMode "${researchMode}" 找到报告模板，将使用标准降级报告。`);
            return this._generateFallbackReport(topic, [{observation: observations}], [], researchMode);
        }
        
        const config = template.config;

        return `
你是一个专业的报告撰写专家。请基于以下收集到的信息，生成一份专业、结构完整的研究报告。

# 研究主题
${topic}

# 已收集的关键信息摘要
${observations.substring(0, 4000)} ${observations.length > 4000 ? '...（内容过长已截断）' : ''}

# 报告要求 (${template.name})

1.  **格式**: 必须是完整的 Markdown 格式。
2.  **结构**: 严格按照以下结构组织内容：
${config.structure.map(section => `    - ${section}`).join('\n')}
3.  **字数**: 报告总字数应在 ${config.wordCount} 左右。
4.  **风格**: ${config.style}
5.  **核心要求**: ${config.requirements}

---
**🛑 重要指令 🛑**
-   **绝对不要**在报告的任何部分（包括标题和章节名）提及或包含 "步骤"、"研究计划" 或任何相关的编号 (例如 "(步骤 1)")。
-   报告内容应流畅、连贯，直接呈现最终的研究成果，而不是研究过程的复述。
-   不要包含 "资料来源" 章节，我们会自动添加。
---

现在，请生成最终的研究报告：`;
    }

    _generateFallbackReport(topic, intermediateSteps, sources, researchMode) {
        // 降级报告生成逻辑
        const observations = intermediateSteps
            .filter(step => step.observation)
            .map(step => `• ${step.observation.substring(0, 200)}...`)
            .join('\n');
            
        let report = `# ${topic}\n\n## 收集的信息\n${observations}\n\n## 总结\n基于收集的信息整理完成。`;
            
        return report;
    }

    // 🎯 保留：生成资料来源部分的方法
    _generateSourcesSection(sources) {
        if (!sources || sources.length === 0) {
            return '\n\n## 资料来源\n本次研究未收集到外部资料来源。';
        }
        
        const sourcesList = sources.map((source, index) => {
            return `[${index + 1}] ${source.title} - ${source.url}`;
        }).join('\n');
        
        return `\n\n## 资料来源\n${sourcesList}`;
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

    /**
     * 🎯 智能摘要方法 - 带有工具特定策略和优雅降级
     * ✅✅✅ 核心修复：为不同工具设置不同的摘要策略 ✅✅✅
     */
    async _smartSummarizeObservation(mainTopic, observation, researchMode, toolName) {
        // ✅✅✅ --- 核心修复：为不同工具设置不同的摘要策略 --- ✅✅✅
        // 搜索工具的结果本身就是摘要，不应再被摘要，否则会丢失关键信息
        const noSummarizeTools = ['tavily_search']; 
        const summarizationThresholds = {
            'crawl4ai': 2000,
            'firecrawl': 2000,
            'default': 4000 // 其他工具使用更高的阈值
        };

        // 🎯 对于搜索工具，跳过摘要直接返回原始结果
        if (noSummarizeTools.includes(toolName)) {
            console.log(`[DeepResearchAgent] 工具 "${toolName}" 跳过摘要，直接使用原始输出。`);
            // 即使不摘要，也进行一次长度硬截断，防止极端情况
            const hardLimit = 15000; 
            return observation.length > hardLimit ? 
                observation.substring(0, hardLimit) + "\n[...内容已截断]" : 
                observation;
        }

        const threshold = summarizationThresholds[toolName] || summarizationThresholds.default;
        
        if (!observation || typeof observation !== 'string' || observation.length < threshold) {
            return observation.length > threshold ? 
                observation.substring(0, threshold) + "\n[...内容已截断]" : 
                observation;
        }

        console.log(`[DeepResearchAgent] 工具 "${toolName}" 内容过长 (${observation.length} > ${threshold})，启动摘要子代理...`);
        
        // 🎯 添加Agent模式专用延迟，降低请求频率
        if (researchMode && researchMode !== 'standard') {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
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
            
            // 🎯 优雅降级策略：根据错误类型返回不同的降级内容
            if (error.message.includes('429') || error.message.includes('速率限制')) {
                // 速率限制：返回智能截断版本
                const truncated = this._intelligentTruncate(observation, threshold);
                return `[摘要生成失败-速率限制，已智能截断]:\n${truncated}`;
            } else if (error.message.includes('超时')) {
                // 超时错误
                return observation.substring(0, threshold) + "\n\n[...内容过长，摘要超时，内容已截断...]";
            } else {
                // 其他错误
                return observation.substring(0, threshold) + "\n\n[...内容过长，摘要失败，内容已截断...]";
            }
        }
    }

    /**
     * 🎯 智能截断方法
     * 在指定长度附近寻找合适的截断点（段落边界）
     */
    _intelligentTruncate(text, maxLength) {
        if (text.length <= maxLength) return text;
        
        // 在maxLength附近寻找段落边界
        const searchWindow = Math.min(500, text.length - maxLength);
        const searchArea = text.substring(maxLength - 100, maxLength + searchWindow);
        
        // 优先在段落边界截断
        const lastParagraph = searchArea.lastIndexOf('\n\n');
        if (lastParagraph !== -1) {
            return text.substring(0, maxLength - 100 + lastParagraph) + "\n\n[...]";
        }
        
        // 其次在句子边界截断
        const lastSentence = searchArea.lastIndexOf('. ');
        if (lastSentence !== -1 && lastSentence > 50) {
            return text.substring(0, maxLength - 100 + lastSentence + 1) + ".. [...]";
        }
        
        // 最后在单词边界截断
        const lastSpace = searchArea.lastIndexOf(' ');
        if (lastSpace !== -1) {
            return text.substring(0, maxLength - 100 + lastSpace) + " [...]";
        }
        
        // 实在找不到合适的边界，直接截断
        return text.substring(0, maxLength) + "...";
    }
}