// src/static/js/agent/deepresearch/DeepResearchAgent.js - 最终关键词触发版 v5.0

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

        // ✨ 性能追踪
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
        
        // ✨ 修复：清理主题中的感叹号
        const cleanTopic = topic.replace(/！\s*$/, '').trim();
        
        // ✨ 最终优化 #1: 调用 _detectResearchMode 获取模式和清理后的话题
        const { detectedMode, cleanTopic: finalTopic } = this._detectResearchMode(cleanTopic);
        console.log(`[DeepResearchAgent] 开始研究: "${finalTopic}"，检测到模式: ${detectedMode}`);
        
        // 🎯 修复：传递研究数据到监控面板
        await this.callbackManager.invokeEvent('on_research_start', {
            run_id: runId,
            data: {
                topic: finalTopic,
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
            researchPlan = await this.agentLogic.createInitialPlan(cleanTopic, detectedMode);
            
            // 实时通知UI研究计划
            await this.callbackManager.invokeEvent('on_research_plan_generated', {
                run_id: runId,
                data: {
                    plan: researchPlan.research_plan,
                    estimated_iterations: researchPlan.estimated_iterations,
                    risk_assessment: researchPlan.risk_assessment,
                    research_mode: detectedMode
                }
            });

            console.log(`[DeepResearchAgent] ${detectedMode}研究计划生成完成，预计${researchPlan.estimated_iterations}次迭代`);
        } catch (error) {
            console.error('[DeepResearchAgent] 研究计划生成失败，使用降级方案:', error);
            researchPlan = this.agentLogic._createFallbackPlan(cleanTopic, detectedMode);
        }

        // ✨ 阶段2：自适应执行
        let intermediateSteps = [];
        let iterations = 0;
        let consecutiveNoGain = 0;
        let allSources = [];
        let finalAnswerFromIteration = null;

        while (iterations < this.maxIterations && consecutiveNoGain < 2 && !finalAnswerFromIteration) {
            iterations++;
            console.log(`[DeepResearchAgent] 迭代 ${iterations}/${this.maxIterations}`);
            
            await this.callbackManager.invokeEvent('on_research_progress', { 
                run_id: runId, 
                data: { 
                    iteration: iterations, 
                    total: this.maxIterations,
                    currentSteps: intermediateSteps.length,
                    metrics: this.metrics,
                    research_mode: detectedMode
                } 
            });

            try {
                // 🎯 构建AgentLogic输入数据
                const logicInput = { 
                    topic: cleanTopic, 
                    intermediateSteps, 
                    availableTools,
                    researchPlan,
                    researchMode: detectedMode
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
                    
                    // 处理过长内容
                    const summarizedObservation = await this._smartSummarizeObservation(cleanTopic, rawObservation, detectedMode);
                    
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

        // ✨ 阶段3：统一的报告生成 (最终优化 #2)
        console.log('[DeepResearchAgent] 研究完成，进入统一报告生成阶段...');
        
        let finalReport;
        if (finalAnswerFromIteration) {
            console.log('[DeepResearchAgent] 使用迭代中生成的答案作为报告基础');
            finalReport = finalAnswerFromIteration;
        } else {
            console.log('[DeepResearchAgent] 调用报告生成模型进行最终整合');
            finalReport = await this._generateFinalReport(cleanTopic, intermediateSteps, researchPlan, allSources, detectedMode);
        }

        // ✨ 附加所有收集到的资料来源
        const uniqueSources = this._deduplicateSources(allSources);
        finalReport += this._generateSourcesSection(uniqueSources);
        console.log(`[DeepResearchAgent] 最终报告完成，附加了 ${uniqueSources.length} 个资料来源`);

        const result = {
            success: true, // 只要能生成报告就视为成功
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

    // ✨ 最终优化 #1: 增强的关键词检测逻辑
    _detectResearchMode(topic) {
        // 关键词按特异性从高到低排序，确保更具体的模式被优先匹配
        const keywords = {
            '学术论文': 'academic', 
            '商业分析': 'business',
            '技术文档': 'technical',
            '深度研究': 'deep', // "深度研究" 优先级较低
            '标准报告': 'standard'
        };

        let cleanTopic = topic;
        let detectedMode = 'standard'; // 默认模式

        for (const [keyword, mode] of Object.entries(keywords)) {
            if (topic.includes(keyword)) {
                detectedMode = mode;
                // 只移除第一个匹配到的关键词，避免意外移除内容
                cleanTopic = topic.replace(keyword, '').trim();
                console.log(`[DeepResearchAgent] 匹配到关键词: "${keyword}", 模式设置为: ${mode}, 清理后主题: "${cleanTopic}"`);
                break; // 找到第一个就停止
            }
        }

        return { detectedMode, cleanTopic };
    }

    // ✨ 最终优化 #2: _generateFinalReport 现在只负责合成
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

    // ✨ 新增：构建报告提示词（基于研究模式）
    _buildReportPrompt(topic, plan, observations, researchMode) {
        const modeConfigs = {
            deep: {
                title: "深度研究模式",
                structure: `# 主标题
## 问题解构与分析
## 多维度深度探索（至少从技术、实践、历史三个维度）
## 权威验证与专业深化  
## 辩证解决方案（至少3个可行方案+反对观点）
## 创新建议与执行路径`,
                wordCount: "2500-3500字",
                requirements: "所有关键数据必须验证并标注来源[1][2]，包含至少一个反对观点"
            },
            academic: {
                title: "学术论文模式", 
                structure: `# 标题
## 摘要
## 引言与研究背景
## 文献综述
## 方法论
## 分析与讨论
## 结论
## 参考文献`,
                wordCount: "2500-3500字",
                requirements: "严格标注来源，使用标准引用格式"
            },
            business: {
                title: "商业分析模式",
                structure: `# 执行摘要
## 市场分析
## 竞争格局
## 机会与挑战
## 战略建议
## 财务影响
## 实施路线图`,
                wordCount: "1500-2500字",
                requirements: "市场数据必须标注来源"
            },
            technical: {
                title: "技术文档模式",
                structure: `# 技术概述
## 架构设计
## 核心组件
## 实现细节
## 性能评估
## 最佳实践
## 故障排除`,
                wordCount: "1800-2800字", 
                requirements: "技术规格和性能数据必须验证"
            },
            standard: {
                title: "标准报告模式",
                structure: `# 主标题
## 一、引言与背景
## 二、核心内容分析（至少2-3个子部分）
## 三、深度洞察与总结`,
                wordCount: "800-1200字",
                requirements: "关键信息标注来源[1][2]"
            }
        };

        const config = modeConfigs[researchMode] || modeConfigs.standard;

        return `
基于以下研究内容，生成一份专业、结构完整的研究报告。

研究主题：${topic}
${plan ? `研究计划：${JSON.stringify(plan.research_plan.map(p => p.sub_question))}` : ''}
收集信息：${observations.substring(0, 3000)} ${observations.length > 3000 ? '...（内容过长已截断）' : ''}

报告要求（${config.title}）：
1. 格式：Markdown
2. 结构：
${config.structure}
3. 字数：${config.wordCount}
4. 风格：专业、客观、信息密集
5. 要求：${config.requirements}

请生成最终报告（不要包含"资料来源"章节，我们会自动添加）：`;
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

    async _smartSummarizeObservation(mainTopic, observation, researchMode) {
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