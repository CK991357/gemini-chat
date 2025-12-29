// src/static/js/agent/deepresearch/DeepResearchAgent.js - 重构完整版（事件名称修复版）
// 🔥 重构说明：此文件已拆分为多个中间件，现在是协调器角色

import { AgentLogic } from './AgentLogic.js';
import { AgentOutputParser } from './OutputParser.js';
// 🎯 核心修改：从 ReportTemplates.js 导入工具函数
import { getTemplateByResearchMode, getTemplatePromptFragment } from './ReportTemplates.js';
// 🎯 新增：导入 DataMiningEngine
import { DataMiningEngine } from './DataMiningEngine.js';
// 🔥 新增：导入中间件模块
import { ReportGeneratorMiddleware } from './middleware/ReportGeneratorMiddleware.js';
import { ToolExecutionMiddleware } from './middleware/ToolExecutionMiddleware.js';
import { StateManager } from './services/StateManager.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.tools = tools;
        this.callbackManager = callbackManager;
        this.maxIterations = config.maxIterations || 8;
        
        // ============================================================
        // 🔥 核心修改：使用 StateManager 统一管理所有共享状态
        // ============================================================
        this.stateManager = new StateManager({
            maxRawDataSize: 250000,
            retentionSteps: 100,
            urlSimilarityThreshold: 0.85,
            maxRevisitCount: 2,
            maxIterations: this.maxIterations
        });
        
        // 🔥 向后兼容：保留原始引用以便现有代码平滑过渡
        this.visitedURLs = this.stateManager.visitedURLs;
        this.generatedImages = this.stateManager.generatedImages;
        this.intermediateSteps = this.stateManager.intermediateSteps;
        this.dataBus = this.stateManager.dataBus;
        this.metrics = this.stateManager.metrics;
        this.imageCounter = 0; // 仍然由主文件管理，因为ToolExecutionMiddleware需要更新它
        
        // ============================================================
        // 🔥 核心修改：初始化工具执行中间件
        // ============================================================
        this.toolExecutor = new ToolExecutionMiddleware(
            tools,
            this.callbackManager,  // 🔥 改为 this.callbackManager
            config.skillManager,
            {
                visitedURLs: this.stateManager.visitedURLs,
                generatedImages: this.stateManager.generatedImages,
                intermediateSteps: this.stateManager.intermediateSteps,
                dataBus: this.stateManager.dataBus,
                runId: null
            },
            {
                chatApiHandler: this.chatApiHandler, // 🔥 必须添加这个！
                smartSummarizeMethod: this._smartSummarizeObservation.bind(this),
                storeRawDataMethod: this._storeRawData.bind(this),
                updateTokenUsageMethod: this._updateTokenUsage.bind(this),
                urlSimilarityThreshold: 0.85,
                maxRevisitCount: 2,
                imageCounter: () => this.imageCounter, // 传递getter函数
                currentResearchContext: "" // 将在研究开始时设置
                
            }
        );
        
        // ============================================================
        // 🔥 核心修改：初始化报告生成中间件
        // ============================================================
        this.reportGenerator = new ReportGeneratorMiddleware(
            chatApiHandler,
            config.skillManager,
            this.callbackManager, // 🔥 新增：传递 callbackManager
            {
                dataBus: this.stateManager.dataBus,
                generatedImages: this.stateManager.generatedImages,
                intermediateSteps: this.stateManager.intermediateSteps,
                metrics: this.stateManager.metrics,
                runId: null

            },
            {
                reportModel: config.reportModel || 'deepseek-reasoner',
                // 🔥🔥🔥 关键修复：传递模板函数
                getTemplateByResearchMode: getTemplateByResearchMode, // 从 ReportTemplates.js 导入的
                getTemplatePromptFragment: getTemplatePromptFragment,  // 从 ReportTemplates.js 导入的
                dataMiningEngine: this.dataMiningEngine // 🎯 新增
            }
        );
        
        // ============================================================
        // 🆕 原有状态变量（现在通过StateManager管理，但保留引用）
        // ============================================================
        
        // 🆕 新增：解析错误重试追踪
        this.parserRetryAttempt = 0; // 追踪解析重试次数（最大为 1）
        this.lastParserError = null; // 存储上次解析失败的错误对象
        this.lastDecisionText = null; // 存储上次模型输出的原始文本
        
        // 🎯 图像生成追踪（现在由StateManager管理）
        this.runId = null; // 用于隔离不同研究任务的图片
        
        // ✅ 接收来自 Orchestrator 的 skillManager 实例
        this.skillManager = config.skillManager;
        
        // 🎯 新增：注入状态跟踪
        this.injectedTools = new Set(); // 本次研究已注入的工具
        this.knowledgeStrategy = 'smart'; // smart, minimal, reference
        this.currentSessionId = `session_${Date.now()}`; // 🎯 新增：会话ID
        
        // 🎯 联邦知识系统
        this.knowledgeSystem = {
            enabled: config.knowledgeRetrievalEnabled !== false,
            skillManager: config.skillManager,
            knowledgeCache: new Map(), // tool_name -> {content, timestamp}
            retrievalHistory: [] // 追踪知识使用情况
        };

        this.agentLogic = new AgentLogic(chatApiHandler);
        this.outputParser = new AgentOutputParser();

        // ✨ 性能追踪（现在由StateManager管理）

        // ============================================================
        // 🎯 初始化 DataMiningEngine
        // ============================================================
        this.dataMiningEngine = null;
        if (config.dataMiningConfig !== undefined) {
            this.dataMiningEngine = new DataMiningEngine(config.dataMiningConfig);
            console.log('[DeepResearchAgent] DataMiningEngine 初始化完成');
        }

        console.log(`[DeepResearchAgent] ✅ 重构版本初始化完成，可用研究工具: ${Object.keys(tools).join(', ')}`);
        console.log(`[DeepResearchAgent] 📦 已加载模块: ToolExecutionMiddleware, ReportGeneratorMiddleware, StateManager`);
    }

    // ============================================================
    // 🎯 核心研究执行方法（重构版）
    // ============================================================
    
    async conductResearch(researchRequest) {
        // ✨ 修复：直接从 Orchestrator 接收模式和清理后的主题
        // ✨✨✨ 核心修复：解构出 displayTopic、enrichedTopic 及 contextMessages ✨✨✨
        const {
            topic: enrichedTopic,
            displayTopic: cleanTopic,
            originalUserInstruction, // 🎯 接收
            availableTools,
            researchMode,
            currentDate,
            contextMessages,
            reportModel // 🔥 新增：接收用户选择的报告模型
        } = researchRequest;
        
        // 🎯 存储报告模型选择
        if (reportModel) {
            this.reportGenerator.reportModel = reportModel; // 🔥 存储为类属性
        }
        
        const runId = this.callbackManager.generateRunId();
        this.runId = runId; // 关键：为当前研究会话设置唯一ID
        
        // 🎯 核心新增：使用StateManager开始新的研究运行
        this.stateManager.startNewRun(runId, cleanTopic);
        this.stateManager.clearImages(); // 关键：每次新研究开始时清空图片缓存
        
        // 🎯 更新工具执行中间件的运行ID
        this.toolExecutor.updateSharedState({
            runId: runId,
            intermediateSteps: this.intermediateSteps,
            currentResearchContext: cleanTopic,
            dataBus: this.dataBus,
            generatedImages: this.generatedImages,
            imageCounter: this.imageCounter // 🔥 添加这个
        });

        // 🔥 新增：更新报告生成中间件的运行ID
        this.reportGenerator.updateSharedState({
            runId: runId,
            dataBus: this.dataBus,
            generatedImages: this.generatedImages,
            intermediateSteps: this.intermediateSteps,
            metrics: this.metrics // 确保 metrics 也同步
        });
        
        // 🎯 核心新增：重置知识注入状态
        this.resetInjectionState();
        
        // 原始 topic (enrichedTopic) 用于 Agent 内部逻辑
        const internalTopic = enrichedTopic.replace(/！\s*$/, '').trim();
        // displayTopic 用于 UI 显示
        const uiTopic = (cleanTopic || enrichedTopic).replace(/！\s*$/, '').trim();

        // ============================================================
        // 🔥🔥🔥 [核心新增] 全局挂载上下文数据
        // 这行代码至关重要！它让后续的"急诊医生"能看到原始数据
        // 优先使用 cleanTopic (用户原始输入)，因为它通常包含最原始的数据文本
        // ============================================================
        this.currentResearchContext = uiTopic;
        
        const detectedMode = researchMode || 'standard';
        
        // 🎯 存储当前研究模式，供知识检索系统使用
        this.currentResearchMode = detectedMode;

        console.log(`[DeepResearchAgent] 🚀 开始研究: "${uiTopic}"，接收到模式: ${detectedMode}`);
        
        // 🔥🔥🔥 [核心逻辑] 构建带记忆的上下文 Prompt
        const historyContextStr = this._serializeContextMessages(contextMessages);
        // Planner 可见的内部主题（包含历史上下文块）
        let internalTopicWithContext = enrichedTopic;
        if (historyContextStr) {
            internalTopicWithContext = `\n${enrichedTopic}\n\n<ContextMemory>\n以下是你与用户的近期对话历史（Context Memory）。\n请注意：用户当前的请求可能依赖于这些上下文（例如指代词"它"可能指代上文的图片或话题）。\n如果当前请求中包含指代词或缺乏具体主语，请务必从下文中推断：\n\n${historyContextStr}\n</ContextMemory>\n`;
            console.log(`[DeepResearchAgent] ✅ 已注入 ${historyContextStr.length} 字符的历史上下文。`);
        }
        
        // ✨✨✨ 核心修复：在 on_research_start 事件中使用 uiTopic
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

        // ============================================================
        // ✨ 阶段1：智能规划
        // ============================================================
        console.log(`[DeepResearchAgent] 阶段1：生成${detectedMode}研究计划...`);
        let researchPlan;
        try {
            // ✨✨✨ 核心修复：规划时使用完整的 internalTopic (enrichedTopic) ✨✨✨
            const planResult = await this.agentLogic.createInitialPlan(internalTopicWithContext, detectedMode, currentDate);
            researchPlan = planResult;
            
            // 🎯 核心修复：确保plan包含研究模式，供完成度计算使用
            if (!researchPlan.research_mode) {
                researchPlan.research_mode = detectedMode;
            }
            
            // 同时确保plan.research_plan存在（兼容不同命名）
            if (!researchPlan.research_plan && researchPlan.researchPlan) {
                researchPlan.research_plan = researchPlan.researchPlan;
            }
            
            console.log(`[DeepResearchAgent] ✅ 智能规划完成，已生成${detectedMode}研究计划。`);      
            this._updateTokenUsage(planResult.usage);
            
            // 🎯 优化：传递完整的研究计划对象和文本
            await this.callbackManager.invokeEvent('on_research_plan_generated', {
                run_id: runId,
                data: {
                    plan: researchPlan.research_plan,
                    plan_text: JSON.stringify(researchPlan, null, 2), // 🎯 新增：传递完整计划文本
                    plan_object: researchPlan, // 🎯 新增：传递完整对象
                    keywords: [], // 占位符，将在后续更新
                    estimated_iterations: researchPlan.estimated_iterations,
                    risk_assessment: researchPlan.risk_assessment,
                    research_mode: detectedMode,
                    temporal_awareness: researchPlan.temporal_awareness // 🎯 新增：传递时效性评估
                }
            });

            console.log(`[DeepResearchAgent] ${detectedMode}研究计划生成完成，预计${researchPlan.estimated_iterations}次迭代`);
        } catch (error) {
            console.error('[DeepResearchAgent] 研究计划生成失败，使用降级方案:', error);
            researchPlan = this.agentLogic._createFallbackPlan(internalTopic, detectedMode, currentDate);
        }

        // ✨ 阶段2：自适应执行
        // 🎯 核心修复：将 intermediateSteps 提升为类属性以支持状态注入
        this.intermediateSteps = []; // ✅ 确保每次新研究都清空历史
        let iterations = 0;
        let consecutiveNoGain = 0;
        
        // 🆕 新增：解析错误控制变量
        let parserErrorOccurred = false;
        this.parserRetryAttempt = 0;
        this.lastParserError = null;
        this.lastDecisionText = null;
        
        // 🔥 核心修改：在数据挖掘模式下，使用DataMiningEngine的完成条件检查
        const isDataMiningMode = detectedMode === 'data_mining';
        let noGainThreshold;
        
        if (isDataMiningMode && this.dataMiningEngine) {
            const config = this.dataMiningEngine.config;
            // 使用数据挖掘引擎的配置
            noGainThreshold = config.noGainThreshold || 1;
            console.log(`[DeepResearchAgent] 数据挖掘模式，使用专用完成条件检查，noGainThreshold: ${noGainThreshold}`);
        } else {
            // 其他模式使用原有逻辑
            noGainThreshold = (detectedMode === 'deep') ? 3 : 2;
        }
        
        let allSources = [];
        let finalAnswerFromIteration = null;
        
        const totalSteps = researchPlan.research_plan.length; // 新增：总计划步骤数

        while (iterations < this.maxIterations && consecutiveNoGain < noGainThreshold && !finalAnswerFromIteration) {
            
            if (!parserErrorOccurred) { // 只有在没有解析错误时才增加迭代计数
                iterations++;
            }
            parserErrorOccurred = false; // 重置标志
            
            console.log(`[DeepResearchAgent] 迭代 ${iterations}/${this.maxIterations}`);
            
            const planCompletion = this._calculatePlanCompletion(researchPlan, this.intermediateSteps); // 计算完成度
            
            // 🎯 数据挖掘模式：使用专用完成条件检查
            let shouldTerminate = false;
            if (isDataMiningMode && this.dataMiningEngine) {
                shouldTerminate = this.dataMiningEngine.checkDataMiningCompletion(
                    this.intermediateSteps,
                    allSources,
                    iterations
                );
                
                if (shouldTerminate) {
                    console.log(`[DeepResearchAgent] 数据挖掘完成条件满足，提前终止迭代`);
                    break;
                }
            }
            
            await this.callbackManager.invokeEvent('on_research_progress', {
                run_id: runId,
                data: {
                    iteration: iterations, // 统一命名
                    total_iterations: this.maxIterations, // 统一命名
                    current_step: this.intermediateSteps.length,
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
                    topic: internalTopic, // 供 LLM 使用的完整上下文 (enrichedTopic 经过清理)
                    displayTopic: uiTopic, // 备用，以防需要 (cleanTopic 经过清理)
                    intermediateSteps: this.intermediateSteps,
                    availableTools,
                    researchPlan,
                    researchMode: detectedMode,
                    currentDate: new Date().toISOString(), // 🎯 新增：传递当前日期
                    dataBus: this.dataBus // 🎯 核心新增：传递数据总线
                };
                
                // 🆕 核心修改：如果上次是解析错误，注入修正提示
                if (this.parserRetryAttempt > 0 && this.lastParserError && this.lastDecisionText) {
                    const correctionPrompt = this._generateCorrectionPrompt(
                        this.lastDecisionText,
                        this.lastParserError.message
                    );
                    // 注入到 topic 中，确保 LLM 看到
                    logicInput.topic = `${correctionPrompt}\n\n${logicInput.topic}`;
                    console.log('[DeepResearchAgent] 🔄 注入格式修正提示，进行重试...');
                }

                const agentDecision = await this.agentLogic.plan(logicInput, {
                    run_id: runId,
                    callbackManager: this.callbackManager
                });
                const agentDecisionText = agentDecision.responseText;
                this.lastDecisionText = agentDecisionText; // 🆕 保存原始输出
                this._updateTokenUsage(agentDecision.usage); // 🎯 新增

                console.log('[DeepResearchAgent] AgentLogic返回的原始决策文本:');
                console.log('--- 开始 ---');
                console.log(agentDecisionText);
                console.log('--- 结束 ---');

                const parsedAction = this.outputParser.parse(agentDecisionText);
                this.parserRetryAttempt = 0; // ✅ 成功解析，重置计数
                this.lastParserError = null; // ✅ 成功解析，重置错误
                
                console.log('[DeepResearchAgent] OutputParser解析结果:', {
                    type: parsedAction.type,
                    tool_name: parsedAction.tool_name,
                    thought_length: parsedAction.thought?.length,
                    parameters: parsedAction.parameters
                });

                // 🎯 处理最终答案
                if (parsedAction.type === 'final_answer') {
                    const completionRate = this._calculatePlanCompletion(researchPlan, this.intermediateSteps);
                    console.log(`[DeepResearchAgent] 📊 研究完成度评估：${(completionRate * 100).toFixed(1)}%`);
                    console.log(`[DeepResearchAgent] 📊 DataBus数据量：${this.dataBus.size} 个条目`);
                    console.log(`[DeepResearchAgent] 🚀 资料已充足，将由 ${this.reportGenerator.reportModel} 模型生成最终报告`);
                    console.log(`[DeepResearchAgent] 🔄 结束研究循环（${iterations}/${this.maxIterations}轮）`);
    
                // 🚨 关键修改：不保存 finalAnswerFromIteration，让它保持为 null
                // 🚨 这样就会自然进入 else 分支，调用 _generateFinalReport
    
                // 可选：记录Agent的思考（仅供调试）
                if (parsedAction.thought) {
                    console.log(`[DeepResearchAgent] 🤖 Agent思考摘要：${parsedAction.thought.substring(0, 100)}...`);
                }
    
                break; // 跳出循环，进入统一报告流程
                }

                // 🎯 处理报告大纲生成
                if (parsedAction.type === 'generate_outline' || parsedAction.tool_name === 'generate_outline') { // 增加对 tool_name 的判断以增强兼容性
                    console.log('[DeepResearchAgent] 📝 Agent已完成信息收集，正在生成报告大纲...');
                    
                    // 🎯 1. 调用您已经写好的大纲生成方法
                    const reportOutline = await this._generateReportOutline(
                        uiTopic, // 使用干净的主题
                        parsedAction.parameters.key_findings,
                        detectedMode // 传递当前的研究模式
                    );
                    
                    // 🎯 2. 将生成的大纲作为观察结果，送入下一次迭代，以指导Agent撰写最终报告
                    this.intermediateSteps.push({
                        action: {
                            tool_name: 'generate_outline',
                            parameters: parsedAction.parameters,
                            thought: parsedAction.thought
                        },
                        // 关键：构建一个对LLM友好的、指令清晰的观察结果
                        observation: `✅ 报告大纲已成功生成。你的下一步任务是基于这份大纲，填充详细内容，撰写最终的、完整的Markdown研究报告。\n\n---\n\n${reportOutline}`,
                        key_finding: `已生成包含${parsedAction.parameters.key_findings.length}个关键发现的报告大纲`,
                        success: true
                    });

                    // 🎯 3. 结束本次迭代，立即进入下一轮思考
                    continue;
                }

                // 🎯 处理知识检索
                // ✅ 新增：处理知识检索动作
                if (parsedAction.type === 'knowledge_retrieval' || parsedAction.tool_name === 'retrieve_knowledge') {
                    console.log('[DeepResearchAgent] 🧠 Agent请求查阅工具文档...');
                    await this._handleKnowledgeRetrieval(parsedAction, this.intermediateSteps, runId);
                    continue; // 查阅文档后，直接进入下一轮迭代
                }

                // 🎯 处理工具调用
                if (parsedAction.type === 'tool_call') {
                    const { tool_name, parameters, thought } = parsedAction;
                    
                    // 拦截知识检索调用，以防万一
                    if (tool_name === 'retrieve_knowledge') {
                        await this._handleKnowledgeRetrieval(parsedAction, this.intermediateSteps, runId);
                        continue;
                    }

                    console.log(`[DeepResearchAgent] 🔧 执行工具调用: ${tool_name}`, parameters);
                    
                    await this.callbackManager.invokeEvent('on_tool_start', {
                        run_id: runId,
                        data: { tool_name, parameters, thought }
                    });

                    // ============================================================
                    // 🔥 核心修改：使用 ToolExecutionMiddleware 执行工具调用
                    // ============================================================
                    const { rawObservation, toolSources, toolSuccess, updatedThought } = await this.toolExecutor.executeToolWithKnowledge(
                        tool_name,
                        parameters,
                        thought,
                        this.intermediateSteps,
                        detectedMode,
                        recordToolCall
                    );
                    
                    // 🎯 新增：将原始数据存储到数据总线（使用StateManager）
                    if (toolSuccess) {
                        this.stateManager.storeInDataBus(
                            this.intermediateSteps.length + 1,
                            rawObservation,
                            {
                                toolName: tool_name,
                                contentType: tool_name === 'crawl4ai' ? 'webpage' : 'text'
                            },
                            toolSources
                        );
                    }

                    // ✅✅✅ 使用智能摘要
                    const summarizedObservation = await this._smartSummarizeObservation(internalTopic, rawObservation, detectedMode, tool_name);
                    
                    // ✨ 评估信息增益
                    const currentInfoGain = this._calculateInformationGain(summarizedObservation, this.intermediateSteps);
                    this.stateManager.updateMetrics({ informationGain: currentInfoGain });
                    
                    if (currentInfoGain < 0.07) { // 信息增益阈值
                        consecutiveNoGain++;
                        console.log(`[DeepResearchAgent] 低信息增益 ${currentInfoGain.toFixed(2)}，连续${consecutiveNoGain}次`);
                    } else {
                        consecutiveNoGain = 0;
                    }

                    // 🎯 新增：生成关键发现摘要
                    const keyFinding = await this._generateKeyFinding(summarizedObservation);
                    
                    // 保存完整的步骤信息
                    const stepData = {
                        action: {
                            type: 'tool_call',
                            tool_name: tool_name,
                            parameters: parameters,
                            thought: updatedThought || thought || `执行工具 ${tool_name} 来获取更多信息。`
                        },
                        observation: summarizedObservation,
                        key_finding: keyFinding, // 🎯 新增：存储关键发现
                        sources: toolSources,
                        success: toolSuccess // ✅ 新增：记录工具执行状态
                    };
                    
                    this.intermediateSteps.push(stepData);
                    this.stateManager.recordIntermediateStep(stepData);
                    
                    // 🎯 合并到总来源列表
                    allSources = [...allSources, ...toolSources];
                    
                    // 在收集到新来源时更新统计
                    updateResearchStats({
                        sources: allSources,
                        // ✨ 核心修复：传递过滤后的数组本身，而不是它的长度
                        toolCalls: this.intermediateSteps.filter(step => step.action.type === 'tool_call')
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

                    // 🎯 双重保险：在工具执行后立即同步图片计数器
                    this.imageCounter = this.toolExecutor.getImageCounter();
                    
                    // ✨ 智能提前终止：基于计划完成度
                    const completionRate = this._calculatePlanCompletion(researchPlan, this.intermediateSteps);
                    this.stateManager.updateMetrics({ planCompletion: completionRate });
                    
                    if (completionRate > 0.9 && consecutiveNoGain >= 1) {
                        console.log(`[DeepResearchAgent] 计划完成度${completionRate}%，提前终止`);
                        break;
                    }
                
                }

            } catch (error) {
                // 🎯 捕获解析错误 (OutputParser.parse 抛出的错误)
                if (this._isParserError(error)) {
                    this.lastParserError = error; // 🆕 保存错误对象
                    
                    // 🎯 新增：重复URL错误修正提示
                    if (error.message.includes('[DUPLICATE_URL_ERROR]')) {
                        const correctionPrompt = `
## 🚨 紧急修正指令 (URGENT CORRECTION)
**系统检测到你上次的行动尝试抓取一个重复或高度相似的 URL。**
**错误信息**: ${error.message}

**强制修正要求**:
1.  **必须**立即更换为**新的、未访问过的** URL。
2.  **或者**，如果所有相关 URL 都已访问，请立即采取 \`final_answer\` 或 \`generate_outline\` 行动，或转向研究计划中的**下一个子问题**。
3.  **请重新生成**完整的"思考"和"行动"/"最终答案"块，并确保行动是有效的。
`;
                        // 注入修正提示，并强制重试
                        this.lastDecisionText = correctionPrompt; // 伪造上次输出，用于生成修正提示
                        parserErrorOccurred = true; // 设置标志，防止下次循环增加 iterations
                        this.parserRetryAttempt = 1; // 强制进入修正流程
                        console.warn(`[DeepResearchAgent] ⚠️ 拦截到重复URL，触发 L1 智能重定向`);
                        continue; // 跳过当前迭代的其余逻辑，进入下一次循环（不增加 iterations）
                    }
                    
                    // 原始的解析错误重试逻辑
                    if (this.parserRetryAttempt < 1) { // 允许一次重试
                        parserErrorOccurred = true; // 设置标志，防止下次循环增加 iterations
                        this.parserRetryAttempt++;
                        console.warn(`[DeepResearchAgent] ⚠️ 致命解析错误，触发 L1 智能重试 (${this.parserRetryAttempt}/1)`);
                        continue; // 跳过当前迭代的其余逻辑，进入下一次循环（不增加 iterations）
                    }
                    
                    // 达到最大重试次数，降级为内部错误处理 (包括速率限制和降级处理)
                    console.error('[DeepResearchAgent] ❌ 致命解析错误，重试失败，降级为内部错误');
                }
                
                // 🎯 原始的全局错误处理逻辑 (包括速率限制和降级处理)
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

                const errorStep = {
                    action: {
                        tool_name: 'internal_error',
                        parameters: {},
                        thought: thoughtText,// 使用新的思考文本
                        type: 'error'
                    },
                    observation: observationText,// 使用新的观察文本
                    key_finding: `迭代 ${iterations} 遇到错误: ${error.message}`,
                    success: false // ✅ 新增：明确标记为失败
                };
                
                this.intermediateSteps.push(errorStep);
                this.stateManager.recordIntermediateStep(errorStep);
                
                // 增加连续无增益计数，避免在连续错误中死循环
                if (!parserErrorOccurred) {
                    consecutiveNoGain++;
                }
            }
        }

        // 在每次迭代结束时更新统计
        updateResearchStats({
            iterations: iterations,
            metrics: this.metrics // 🎯 确保包含 tokenUsage
        });
        
        // ============================================================
        // ✨ 阶段3：使用 ReportGeneratorMiddleware 生成完整结果
        // ============================================================
        console.log('[DeepResearchAgent] 研究完成，进入统一报告生成阶段...');

        // 提取所有观察结果用于关键词分析
        const allObservationsForKeywords = this.intermediateSteps.map(s => s.observation).join(' ');
        const keywords = this._extractKeywords(uiTopic, allObservationsForKeywords);
        
        // 更新关键词统计
        updateResearchStats({ keywords });
        
        // 收集所有来源
        const allSourcesFromSteps = this.intermediateSteps.flatMap(step => step.sources || []);
        const combinedSources = [...allSources, ...allSourcesFromSteps];
        const uniqueSources = this._deduplicateSources(combinedSources);

        console.log(`[DeepResearchAgent] 🔍 来源统计:`, {
            allSourcesCount: allSources.length,
            stepsSourcesCount: allSourcesFromSteps.length,
            combinedCount: combinedSources.length,
            uniqueCount: uniqueSources.length
        });

        // 🔥 核心修改：同步图片计数器
        this.imageCounter = this.toolExecutor.getImageCounter();
        console.log(`[DeepResearchAgent] 📊 图片统计: ${this.imageCounter} 张生成图片`);
        
        // 🔥 核心修改：更新中间件的共享状态
        this.reportGenerator.updateSharedState({
            dataBus: this.dataBus,
            generatedImages: this.generatedImages,
            intermediateSteps: this.intermediateSteps,
            metrics: this.metrics,
            runId: runId
        });

        // ============================================================
        // 🔥 核心修改：使用 ReportGeneratorMiddleware 生成完整结果
        // ============================================================
        let finalResult;
        
        // 🎯 数据挖掘模式：使用 DataMiningEngine 生成报告
        if (isDataMiningMode && this.dataMiningEngine) {
            console.log('[DeepResearchAgent] 数据挖掘模式，使用 DataMiningEngine 生成报告...');
            
            try {
                // 获取数据挖掘提示词片段
                const dataMiningTemplate = getTemplateByResearchMode('data_mining');
                const promptFragment = getTemplatePromptFragment('data_mining');
                // 🔧 修复：调试日志，确认配置一致性
                console.log('[DeepResearchAgent] 数据挖掘引擎配置:', {
                    minDataTables: this.dataMiningEngine.config.minDataTables,
                    maxIterations: this.dataMiningEngine.config.maxIterations,
                    qualityThreshold: this.dataMiningEngine.config.dataQualityThreshold
                });
                
                // 构建数据挖掘专用提示词
                const dataMiningPrompt = this.dataMiningEngine.buildDataMiningPrompt(
                    uiTopic,
                    this.intermediateSteps,
                    researchPlan,
                    uniqueSources,
                    originalUserInstruction,
                    dataMiningTemplate, // ✅ 传递模板，不是 null
                    promptFragment,
                    this.dataBus // 🔥 新增：传递 dataBus
                );
                
                // 生成数据挖掘报告
                const reportResponse = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: dataMiningPrompt }],
                    model: this.reportGenerator.reportModel || 'deepseek-reasoner',
                    temperature: 0.1,
                });
                
                const rawReport = reportResponse?.choices?.[0]?.message?.content ||
                    this.dataMiningEngine.generateDataTablesFallback(this.intermediateSteps, uniqueSources);
                
                console.log('[DeepResearchAgent] ✅ 数据挖掘报告生成成功');
                
                // 使用中间件进行后处理
                const processedResult = await this.reportGenerator.processReport(
                    rawReport,
                    uniqueSources,
                    researchPlan,
                    detectedMode,
                    uiTopic,  // ✅ 添加 topic 参数
                    this.intermediateSteps  // ✅ 必须添加 intermediateSteps 参数！
                );
                
                // 构建最终结果
                finalResult = {
                    success: true,
                    topic: uiTopic,
                    report: processedResult.cleanedReport,
                    iterations: iterations,
                    intermediateSteps: this.intermediateSteps,
                    sources: processedResult.filteredSources,
                    metrics: this.metrics,
                    plan_completion: this._calculatePlanCompletion(researchPlan, this.intermediateSteps),
                    research_mode: detectedMode,
                    temporal_quality: processedResult.temporalQualityReport,
                    model: this.reportGenerator.reportModel
                };
                
            } catch (error) {
                console.error('[DeepResearchAgent] ❌ 数据挖掘报告生成失败:', error);
                // 降级：使用中间件生成标准报告
                finalResult = await this.reportGenerator.generateCompleteResult(
                    uiTopic,
                    this.intermediateSteps,
                    researchPlan,
                    uniqueSources,
                    detectedMode,
                    originalUserInstruction
                );
            }
        } else {
            // 🔥 核心修改：其他模式直接使用中间件生成完整结果
            console.log('[DeepResearchAgent] 使用 ReportGeneratorMiddleware 生成完整结果...');
            finalResult = await this.reportGenerator.generateCompleteResult(
                uiTopic,
                this.intermediateSteps,
                researchPlan,
                uniqueSources,
                detectedMode,
                originalUserInstruction
            );
        }

        console.log('[DeepResearchAgent] ✅ 最终结果构建完成');

        // ============================================================
        // 🎯 阶段4：发送完成事件并返回结果
        // ============================================================
        console.log('[DeepResearchAgent] 阶段4：生成时效性质量评估报告...');

        // 🎯 4.1. 不再重复生成 temporalQualityReport，使用 processReport 返回的
        
        // 🎯 4.2. 构建最终的、包含质量报告的 result 对象
        
        // 🎯 4.3. 调用性能记录方法
        
        // 🎯 4.4. 发送包含完整结果的 on_research_end 事件
        await this.callbackManager.invokeEvent('on_research_end', {
            run_id: runId,
            data: finalResult
        });

        return finalResult;
    }

    // ============================================================
    // 🎯 核心辅助方法（保持不变）
    // ============================================================
    
    /**
     * 🎯 Token 追踪方法
     */
    _updateTokenUsage(usage) {
        if (!usage) return;
        
        this.metrics.tokenUsage.prompt_tokens += usage.prompt_tokens || 0;
        this.metrics.tokenUsage.completion_tokens += usage.completion_tokens || 0;
        this.metrics.tokenUsage.total_tokens += usage.total_tokens || 0;
        
        console.log(`[DeepResearchAgent] Token 使用更新:`, this.metrics.tokenUsage);
    }

    /**
     * 🎯 生成格式修正提示词
     */
    _generateCorrectionPrompt(originalText, errorMessage) {
        const errorSnippet = originalText.substring(0, 500);
        
        let specificGuidance = '';
        if (errorMessage.includes('Expected \',\' or \'}\'')) {
            specificGuidance = `
**常见错误示例**：
❌ 错误: \`"query": "search term" AND "another"\`
✅ 正确: \`"query": "search term AND another"\`

**解决方法**：确保整个查询字符串在一对引号内
            `;
        }

        return `
## 🚨 紧急格式修正指令 (URGENT FORMAT CORRECTION)
**系统检测到你上次的输出存在致命的格式错误，导致解析失败。**

**错误类型**: JSON 语法错误 (Parser Error)
**错误信息**: ${errorMessage}
**上次输出片段**:
\`\`\`
${errorSnippet}
\`\`\`

${specificGuidance}

**强制修正要求**:
1.  **必须**严格遵循正确的 JSON 语法。
2.  **特别注意**: 在 JSON 字符串中，请勿使用未被引号包裹的关键字（如 \`AND\`）。
3.  **请重新生成**完整的"思考"和"行动"/"最终答案"块，并确保 JSON 参数是有效的。
`;
    }

    /**
     * 🔥 智能上下文序列化器
     */
    _serializeContextMessages(messages) {
        if (!messages || messages.length === 0) return '';

        const recentMessages = messages.slice(0, -1).slice(-6);
        if (recentMessages.length === 0) return '';

        let contextBuffer = [];
        contextBuffer.push("--- 对话历史开始 ---");

        recentMessages.forEach((msg) => {
            const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
            let textContent = '';

            if (Array.isArray(msg.content)) {
                msg.content.forEach(part => {
                    if (part.type === 'text') {
                        textContent += part.text;
                    } else if (part.type === 'image_url' || part.type === 'image_base64') {
                        textContent += `[🖼️ Image Uploaded by User] `;
                    } else if (part.type === 'file_url' || part.type === 'file') {
                        textContent += `[📁 File Uploaded: ${part.name || 'document'}] `;
                    }
                });
            } else if (typeof msg.content === 'string') {
                textContent = msg.content;
            }

            if (textContent.length > 500) {
                textContent = textContent.substring(0, 500) + "...(content truncated)";
            }

            contextBuffer.push(`${roleLabel}: ${textContent}`);
        });

        contextBuffer.push("--- 对话历史结束 ---");
        return contextBuffer.join('\n');
    }

    /**
     * 🎯 报告大纲生成方法
     */
    async _generateReportOutline(topic, keyFindings, researchMode) {
        console.log(`[DeepResearchAgent] 开始为模式 "${researchMode}" 生成报告大纲...`);

        const modeSpecificInstructions = {
            academic: "大纲应侧重于：文献综述、研究方法、核心论证、结论与未来展望。结构必须严谨。",
            business: "大纲应侧重于：市场背景、竞争格局、核心发现、商业影响、战略建议。必须有明确的商业洞察。",
            technical: "大纲应侧重于：问题定义、技术架构、实现细节、性能评估、最佳实践。必须包含技术深度。",
            deep: "大纲需要体现多维度、辩证的分析，包含问题解构、多角度论证、解决方案评估和创新性见解。",
            standard: "大纲应结构清晰，覆盖主题的核心方面，逻辑连贯，易于理解。",
            data_mining: "大纲应侧重于：数据收集概况、数据质量评估、结构化数据呈现、数据对比分析、数据可视化建议。必须以数据表格为核心。"
        };

        const prompt = `
# 角色：你是一位顶级的报告架构师和内容策略师。

# 任务
你的任务是基于一个研究项目已经收集到的"关键信息发现"，为一份专业的最终报告设计一份逻辑严谨、结构完整、深度十足的报告大纲。

## 核心研究主题
${topic}

## 关键信息发现 (Key Findings)
${keyFindings.map((finding, index) => `- ${finding}`).join('\n')}

## 大纲设计要求
1.  **逻辑性**: 大纲的章节顺序必须构成一个流畅且有说服力的叙事逻辑。
2.  **完整性**: 必须覆盖所有"关键信息发现"，并将它们合理地分配到各个章节。
3.  **深度**: 大纲不应只是简单地罗列要点，而应体现出分析的层次感。在每个章节下，用2-3个子要点来阐述该部分将要探讨的核心内容。
4.  **模式适配**: ${modeSpecificInstructions[researchMode] || modeSpecificInstructions.standard}
5.  **输出格式**: 必须严格使用Markdown格式，包含主标题、二级标题（##）和三级标题（###）。

## 示例输出格式
\`\`\`markdown
# [报告主标题]

## 1. 引言与背景
### 1.1 研究背景与问题定义
### 1.2 核心概念解析

## 2. 核心分析与发现
### 2.1 [关键发现A的深入分析]
### 2.2 [关键发现B与C的对比]

## 3. [根据模式调整的章节，如：商业影响或方法论]
### 3.1 ...

## 4. 结论与建议
### 4.1 核心结论总结
### 4.2 未来展望与建议
\`\`\`

现在，请生成这份高质量的Markdown报告大纲：`;

        try {
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: this.reportGenerator.reportModel || 'deepseek-reasoner',
                temperature: 0.1,
            });
            const outline = response?.choices?.[0]?.message?.content || '### 错误：未能生成大纲';
            console.log(`[DeepResearchAgent] ✅ 报告大纲生成成功。`);
            return outline;
        } catch (error) {
            console.error('[DeepResearchAgent] ❌ 报告大纲生成失败:', error);
            return `# 报告大纲 (降级)\n\n## 核心发现\n${keyFindings.map(f => `- ${f}`).join('\n')}`;
        }
    }

    /**
     * 🎯 关键发现生成方法
     */
    async _generateKeyFinding(observation) {
        try {
            const prompt = `从以下文本中，用一句话总结最核心、最有价值的信息发现。总结必须简明扼要。\n\n文本：\n${observation.substring(0, 2000)}`;
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'gemini-2.0-flash-exp-summarizer',
                temperature: 0.0,
            });
            return response?.choices?.[0]?.message?.content || '未能提取关键发现。';
        } catch (error) {
            console.warn('[DeepResearchAgent] 关键发现生成失败:', error);
            return '关键发现提取异常。';
        }
    }

    /**
     * ✅ 处理知识检索
     */
    async _handleKnowledgeRetrieval(parsedAction, intermediateSteps, runId) {
        const { parameters, thought } = parsedAction;
        const { tool_name: targetTool, context } = parameters;
        
        console.log(`[DeepResearchAgent] 🧠 联邦知识检索请求: ${targetTool}`);
        let observation;
        let success = false;

        try {
            const knowledgePackage = await this.skillManager.retrieveFederatedKnowledge(targetTool, { userQuery: context });

            if (knowledgePackage && knowledgePackage.content) {
                observation = knowledgePackage.content;
                success = true;
                console.log(`[DeepResearchAgent] ✅ 联邦知识检索成功: ${targetTool}`);
            } else {
                observation = `## ❌ 知识检索失败\n\n无法找到工具 \`${targetTool}\` 的联邦知识文档。`;
            }
        } catch (error) {
            console.error(`[DeepResearchAgent] ❌ 联邦知识检索错误: ${targetTool}`, error);
            observation = `## ❌ 知识检索系统错误\n\n检索工具 \`${targetTool}\` 知识时发生错误: ${error.message}`;
        }

        intermediateSteps.push({
            action: {
                type: 'knowledge_retrieval',
                tool_name: 'retrieve_knowledge',
                parameters,
                thought
            },
            observation: observation,
            key_finding: `已加载 ${targetTool} 的操作指南`,
            success: success
        });
    }

    // ============================================================
    // 🎯 智能摘要方法 - 带有工具特定策略和优雅降级
    // ============================================================
    
    async _smartSummarizeObservation(mainTopic, observation, researchMode, toolName) {
        // ✅✅✅ --- 核心修复：为不同工具设置不同的摘要策略 --- ✅✅✅
        
        // 输入验证
        if (!observation || typeof observation !== 'string') {
            console.warn(`[DeepResearchAgent] 无效的观察结果，工具: ${toolName}`);
            return observation || '无观察结果';
        }
        // 🎯 搜索工具的结果本身就是摘要，不应再被摘要
        const originalLength = observation.length;
        console.log(`[DeepResearchAgent] 开始处理工具 "${toolName}" 的输出，长度: ${originalLength} 字符`);

        const noSummarizeTools = ['tavily_search']; 
        const summarizationThresholds = {
            'crawl4ai': 15000,
            'firecrawl': 15000,
            'default': 10000
        };
        // 🎯 对于搜索工具，跳过摘要直接返回原始结果
        if (noSummarizeTools.includes(toolName)) {
            console.log(`[DeepResearchAgent] 工具 "${toolName}" 跳过摘要，直接使用原始输出。`);

            // 统一的硬截断保护
            const hardLimit = 20000; 
            if (originalLength > hardLimit) {
                console.log(`[DeepResearchAgent] 内容超过硬截断限制 ${hardLimit}，进行安全截断`);
                return observation.substring(0, hardLimit) + "\n[...内容过长已安全截断]";
            }
            return observation;
        }

        const threshold = summarizationThresholds[toolName] || summarizationThresholds.default;
        // 🎯 修正逻辑：只有超过阈值才触发摘要
        if (originalLength <= threshold) {
            console.log(`[DeepResearchAgent] 工具 "${toolName}" 内容长度 ${originalLength} ≤ 阈值 ${threshold}，直接返回`);
            return observation;
        }
        
        if (this._containsStructuredData(observation)) {
            console.log(`[DeepResearchAgent] 检测到结构化数据，优先保留表格内容`);
            const structuredContent = this._extractAndPreserveStructuredData(observation);
            // 🎯 优化：如果提取的结构化内容本身不长，且原始内容超过阈值，则直接返回结构化内容
            if (structuredContent.length < threshold * 0.8 && structuredContent.length > 100) {
                console.log(`[DeepResearchAgent] 结构化内容 (${structuredContent.length} 字符) 足够短，直接返回`);
                return `## 📋 ${toolName} 结构化数据（已优化保留）\n\n${structuredContent}`;
            }
            // 如果结构化内容仍然很长，则继续走智能摘要流程，但使用结构化内容作为输入
            if (structuredContent.length > threshold) {
                console.log(`[DeepResearchAgent] 结构化内容 (${structuredContent.length} 字符) 仍过长，将对结构化内容进行摘要`);
                observation = structuredContent;
            }
        }

        console.log(`[DeepResearchAgent] 工具 "${toolName}" 内容过长 (${originalLength} > ${threshold})，启动智能摘要...`);
        // 🎯 添加Agent模式专用延迟，降低请求频率
        if (researchMode && researchMode !== 'standard') {
            console.log(`[DeepResearchAgent] 研究模式 "${researchMode}" 添加500ms延迟`);
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        // 通知UI摘要开始
        await this.callbackManager.invokeEvent('agent:thinking', { 
            detail: { 
                content: `正在为 ${toolName} 生成智能摘要...`, 
                type: 'summarize', 
                agentType: 'deep_research' 
            } 
        });
        // 🎯 优化摘要提示词，要求保留更多技术细节
        const summarizerPrompt = `你是一个专业的技术信息分析师。基于"主要研究主题"，从以下原始文本中提取最关键和相关的信息，创建一个详细的技术摘要。

**严格的摘要要求**：
1. 📊 **数据绝对保留**: 必须保留原文中出现的所有统计数据、年份、数值、单位（如"万人"、"亿元"）。这是最高优先级！
2. 📉 **表格重构**: 如果原文包含表格数据，请将其转换为 Markdown 表格格式保留。
3. 🔧 **保留技术规格**：模型名称、参数数量、上下文长度、技术特性
4. 💡 **保持核心结论**：研究发现、比较结果、优势劣势分析
5. 🎯 **准确性优先**：专业术语、专有名词必须准确无误
6. 📝 **长度控制**：控制在1500-2000字之间，确保信息完整性

**绝对禁止**：
- 删除或模糊化具体的数字和技术参数
- 丢失关键的技术比较和性能数据
- 改变原始的技术术语和专有名词

---
主要研究主题: "${mainTopic}"
---
原始文本 (前15000字符):
${observation.substring(0, 15000)}
${observation.length > 15000 ? `\n[... 原始内容共 ${observation.length} 字符，此处显示前15000字符 ...]` : ''}
---

请生成详细的技术摘要（必须包含所有关键细节和数字）:`;

        try {
            const startTime = Date.now();
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: summarizerPrompt }],
                model: 'gemini-2.0-flash-exp-summarizer',
                stream: false,
            });
            // 🎯 计算并记录压缩率
            const executionTime = Date.now() - startTime;
            const choice = response && response.choices && response.choices[0];
            const summary = choice && choice.message && choice.message.content ? 
                choice.message.content.trim() : '❌ 摘要生成失败';

            const compressionRatio = summary !== '❌ 摘要生成失败' ? 
                (1 - (summary.length / originalLength)).toFixed(3) : 1;
            
            console.log(`[DeepResearchAgent] ✅ 智能摘要完成`, {
                tool: toolName,
                originalLength,
                summaryLength: summary.length,
                compressionRatio: `${(compressionRatio * 100).toFixed(1)}%`,
                executionTime: `${executionTime}ms`,
                researchMode
            });
            // 🎯 提供详细的结构化上下文信息
            if (summary === '❌ 摘要生成失败') {
                throw new Error('摘要模型返回空内容');
            }
            
            return `## 📋 ${toolName} 内容摘要\n**原始长度**: ${originalLength} 字符 | **摘要长度**: ${summary.length} 字符 | **压缩率**: ${(compressionRatio * 100).toFixed(1)}%\n\n${summary}\n\n---\n*摘要基于 ${toolName} 工具返回的原始内容生成*`;

        } catch (error) {
            console.error(`[DeepResearchAgent] ❌ 摘要子代理调用失败:`, {
                tool: toolName,
                error: error.message,
                originalLength
            });
            // 🎯 增强的优雅降级策略
            let fallbackSolution;
            
            if (error.message.includes('429') || error.message.includes('速率限制')) {
                // 速率限制：使用智能截断
                fallbackSolution = this._intelligentTruncate(observation, threshold * 1.2);
                console.log(`[DeepResearchAgent] 🟡 速率限制，使用智能截断降级`);
            } else if (error.message.includes('超时') || error.message.includes('timeout')) {
                // 超时错误：直接截断
                fallbackSolution = observation.substring(0, threshold) + `\n\n[... 内容过长，摘要超时，已截断前 ${threshold} 字符 ...]`;
                console.log(`[DeepResearchAgent] 🟡 超时错误，使用直接截断降级`);
            } else {
                // 其他错误：使用扩展截断阈值
                const fallbackThreshold = Math.min(threshold * 1.5, 20000);
                fallbackSolution = originalLength > fallbackThreshold ?
                    this._intelligentTruncate(observation, fallbackThreshold) :
                    observation;
                console.log(`[DeepResearchAgent] 🟡 其他错误，使用扩展截断降级，阈值: ${fallbackThreshold}`);
            }
            
            return `## ⚠️ ${toolName} 内容降级处理\n**原因**: ${error.message}\n**原始长度**: ${originalLength} 字符\n**降级方案**: ${fallbackSolution === observation ? '保持原始内容' : '智能截断'}\n\n${fallbackSolution}\n\n---\n*因摘要服务不可用，已使用降级方案显示内容*`;
        }
    }

    /**
     * 🎯 智能截断方法
     * * 在指定长度附近寻找合适的截断点（段落边界）
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

    /**
     * 🎯新增： 结构化数据检测
     */
    _containsStructuredData(text) {
        const structuredPatterns = [
            /\|.*\|.*\|/, // Markdown表格
            /<table[^>]*>.*?<\/table>/is, // HTML表格
            /\b(模型|名称|定位|特点|上下文|输出)\b.*\n.*-{3,}/, // 中文表格特征
            /\b(Model|Name|Positioning|Features|Context|Output)\b.*\n.*-{3,}/ // 英文表格特征
        ];
        
        return structuredPatterns.some(pattern => pattern.test(text));
    }

    /**
     * 🎯 提取并保留结构化数据
     */
    _extractAndPreserveStructuredData(text) {
        let preservedContent = '';
        // 提取Markdown表格
        const markdownTables = text.match(/(\|[^\n]+\|\r?\n)((?:\|?:?-+)+\|?\r?\n)((?:\|[^\n]+\|\r?\n?)+)/g);
        if (markdownTables) {
            preservedContent += '## 提取的Markdown表格数据\n\n' + markdownTables.join('\n\n') + '\n\n';
        }
        // 提取类似表格的结构化文本
        const structuredSections = text.split(/\n## |\n# |\n### /).filter(section => {
            // 检查每个部分是否包含结构化特征
            return this._containsStructuredData(section);
        });
        // 如果没找到结构化数据，返回原始文本的前面部分
        if (structuredSections.length > 0) {
            preservedContent += '## 关键结构化信息\n\n' + structuredSections.join('\n\n') + '\n\n';
        }
        
        if (!preservedContent) {
            return text.substring(0, Math.min(5000, text.length));
        }
        // 降级：返回原始文本的前5000字符
        return preservedContent;
    }

    // ============================================================
    // 🎯 时效性质量评估系统（保持不变）
    // ============================================================
    // 核心：时效性质量评估系统
    _generateTemporalQualityReport(researchPlan, intermediateSteps, topic, researchMode) {
        const currentDate = new Date().toISOString().split('T')[0];
        
        // 🎯 唯一事实来源：模型自主评估结果
        const modelAssessedSensitivity = researchPlan.temporal_awareness?.overall_sensitivity || '未知';
        
        // 🎯 系统程序化评估（仅用于对比分析）
        const systemAssessedSensitivity = this._assessTemporalSensitivity(topic, researchMode);
        
        // 分析计划层面的时效性意识
        const planAnalysis = this._analyzePlanTemporalAwareness(researchPlan);
        
        // 分析执行层面的时效性行为  
        const executionAnalysis = this._analyzeExecutionTemporalBehavior(intermediateSteps, researchPlan);
        
        // 综合评估（基于模型自主评估的一致性）
        const overallScore = this._calculateTemporalScore(planAnalysis, executionAnalysis, modelAssessedSensitivity);

        return {
            // 元数据
            assessment_date: currentDate,
            topic: topic,
            research_mode: researchMode,
            
            // 🎯 核心：模型自主评估结果（唯一事实来源）
            model_assessment: {
                overall_sensitivity: modelAssessedSensitivity,
                step_sensitivities: researchPlan.research_plan.map(step => ({
                    step: step.step,
                    sensitivity: step.temporal_sensitivity,
                    sub_question: step.sub_question
                }))
            },
            
            // 系统程序化评估（用于对比分析）
            system_assessment: {
                overall_sensitivity: systemAssessedSensitivity,
                is_consistent: modelAssessedSensitivity === systemAssessedSensitivity,
                consistency_note: this._getConsistencyNote(modelAssessedSensitivity, systemAssessedSensitivity)
            },
            
            // 质量分析
            quality_metrics: {
                overall_temporal_score: overallScore,
                plan_quality: planAnalysis,
                execution_quality: executionAnalysis,
                quality_rating: this._getQualityRating(overallScore)
            },
            
            // 改进建议
            improvement_recommendations: this._getImprovementRecommendations(
                planAnalysis, 
                executionAnalysis, 
                overallScore,
                modelAssessedSensitivity,
                systemAssessedSensitivity
            ),
            
            // 执行总结
            summary: this._generateTemporalSummary(planAnalysis, executionAnalysis, overallScore, modelAssessedSensitivity)
        };
    }

    // 系统程序化评估方法
    _assessTemporalSensitivity(topic, researchMode) {
        const currentYear = new Date().getFullYear().toString();
        const currentYearMinus1 = (new Date().getFullYear() - 1).toString();
        
        // 高敏感度关键词
        const highSensitivityKeywords = [
            '最新', '当前', '现状', '趋势', '发展', '前景', '202', currentYear, currentYearMinus1,
            '版本', '更新', '发布', 'AI', '人工智能', '模型', '技术', '市场', '政策', '法规'
        ];
        
        // 低敏感度关键词
        const lowSensitivityKeywords = [
            '历史', '起源', '发展史', '经典', '理论', '基础', '概念', '定义', '原理'
        ];
        
        const topicLower = topic.toLowerCase();
        
        // 检查高敏感度关键词
        const hasHighSensitivity = highSensitivityKeywords.some(keyword => 
            topicLower.includes(keyword.toLowerCase())
        );
        
        // 检查低敏感度关键词
        const hasLowSensitivity = lowSensitivityKeywords.some(keyword => 
            topicLower.includes(keyword.toLowerCase())
        );
        
        // 基于研究模式的调整
        const modeSensitivity = {
            'deep': '高',
            'academic': '中', 
            'business': '高',
            'technical': '高',
            'standard': '中',
            'data_mining': '高' // 数据挖掘模式通常需要最新数据
        };
        
        if (hasHighSensitivity) return '高';
        if (hasLowSensitivity) return '低';
        
        return modeSensitivity[researchMode] || '中';
    }

    // 分析计划层面的时效性意识
    _analyzePlanTemporalAwareness(researchPlan) {
        const steps = researchPlan.research_plan;
        const totalSteps = steps.length;
        
        // 统计敏感度分布
        const sensitivityCount = { '高': 0, '中': 0, '低': 0 };
        let stepsWithTemporalQueries = 0;
        let totalTemporalQueries = 0;
        
        steps.forEach(step => {
            sensitivityCount[step.temporal_sensitivity] = (sensitivityCount[step.temporal_sensitivity] || 0) + 1;
            
            // 检查步骤是否包含时效性查询建议
            const hasTemporalQuery = step.initial_queries?.some(query => 
                query.includes('最新') || query.includes('202') || query.includes('版本')
            );
            
            if (hasTemporalQuery) {
                stepsWithTemporalQueries++;
                totalTemporalQueries += step.initial_queries.filter(q =>
                    q.includes('最新') || q.includes('202') || q.includes('版本')
                ).length;
            }
        });
        
        return {
            total_steps: totalSteps,
            sensitivity_distribution: sensitivityCount,
            high_sensitivity_ratio: sensitivityCount['高'] / totalSteps,
            temporal_coverage: stepsWithTemporalQueries / totalSteps,
            avg_temporal_queries_per_step: stepsWithTemporalQueries > 0 ? 
                (totalTemporalQueries / stepsWithTemporalQueries) : 0,
            plan_quality: this._ratePlanQuality(sensitivityCount, stepsWithTemporalQueries, totalSteps)
        };
    }

    // 分析执行层面的时效性行为
    _analyzeExecutionTemporalBehavior(intermediateSteps, researchPlan) {
        const currentYear = new Date().getFullYear().toString();
        const totalActions = intermediateSteps.length;
        
        let temporalAwareActions = 0;
        let temporalKeywordUsage = 0;
        let versionVerificationAttempts = 0;
        let officialSourceAccess = 0;
        
        // 构建步骤敏感度映射
        const stepSensitivityMap = {};
        researchPlan.research_plan.forEach(step => {
            stepSensitivityMap[step.step] = step.temporal_sensitivity;
        });
        
        intermediateSteps.forEach(step => {
            const stepSensitivity = stepSensitivityMap[step.step] || '中';
            let isTemporalAware = false;
            
            if (step.action?.tool_name === 'tavily_search') {
                const query = step.action.parameters?.query || '';
                
                // 检查是否使用时序性关键词
                const usedTemporalKeyword = query.includes('最新') || 
                                          query.includes(currentYear) || 
                                          query.includes('版本');
                
                if (usedTemporalKeyword) {
                    temporalKeywordUsage++;
                    isTemporalAware = true;
                }
                
                // 检查版本验证尝试
                if (query.includes('版本') || query.includes('v') || query.match(/\d+\.\d+/)) {
                    versionVerificationAttempts++;
                    isTemporalAware = true;
                }
            }
            
            // 检查crawl4ai是否用于获取官方信息
            if (step.action?.tool_name === 'crawl4ai') {
                const url = step.action.parameters?.url || '';
                const isOfficialSource = url.includes('github.com') || 
                                       url.includes('official') || 
                                       url.includes('website');
                
                if (isOfficialSource) {
                    officialSourceAccess++;
                    isTemporalAware = true;
                }
            }
            
            if (isTemporalAware) {
                temporalAwareActions++;
            }
        });
        
        return {
            total_actions: totalActions,
            temporal_aware_actions: temporalAwareActions,
            temporal_action_ratio: totalActions > 0 ? (temporalAwareActions / totalActions) : 0,
            temporal_keyword_usage: temporalKeywordUsage,
            version_verification_attempts: versionVerificationAttempts,
            official_source_access: officialSourceAccess,
            execution_quality: this._rateExecutionQuality(temporalAwareActions, totalActions, temporalKeywordUsage)
        };
    }

    // 综合评分（基于模型自主评估）
    _calculateTemporalScore(planAnalysis, executionAnalysis, modelAssessedSensitivity) {
        // 计划质量权重
        const planScore = planAnalysis.temporal_coverage * 0.3 + 
                         planAnalysis.high_sensitivity_ratio * 0.2;
        
        // 执行质量权重
        const executionScore = executionAnalysis.temporal_action_ratio * 0.4 +
                             (executionAnalysis.temporal_keyword_usage > 0 ? 0.1 : 0);
        
        let baseScore = planScore + executionScore;
        
        // 🎯 基于模型评估调整分数
        if (modelAssessedSensitivity === '高' && executionAnalysis.temporal_action_ratio < 0.5) {
            baseScore *= 0.7; // 高敏感主题但执行不足，严重扣分
        } else if (modelAssessedSensitivity === '低' && executionAnalysis.temporal_action_ratio > 0.7) {
            baseScore *= 0.9; // 低敏感主题但过度关注时效性，轻微扣分
        }
        
        return Math.min(baseScore, 1.0);
    }

    // 计划质量评级
    _ratePlanQuality(sensitivityCount, stepsWithTemporalQueries, totalSteps) {
        const highSensitivityRatio = sensitivityCount['高'] / totalSteps;
        const temporalCoverage = stepsWithTemporalQueries / totalSteps;
        
        if (highSensitivityRatio > 0.5 && temporalCoverage > 0.6) return '优秀';
        if (highSensitivityRatio > 0.3 && temporalCoverage > 0.4) return '良好';
        if (highSensitivityRatio > 0.2 && temporalCoverage > 0.2) return '一般';
        return '待改进';
    }

    // 执行质量评级
    _rateExecutionQuality(temporalAwareActions, totalActions, temporalKeywordUsage) {
        const temporalActionRatio = totalActions > 0 ? (temporalAwareActions / totalActions) : 0;
        
        if (temporalActionRatio > 0.6 && temporalKeywordUsage > 0) return '优秀';
        if (temporalActionRatio > 0.4 && temporalKeywordUsage > 0) return '良好';
        if (temporalActionRatio > 0.2) return '一般';
        return '待改进';
    }

    // 一致性说明
    _getConsistencyNote(modelSensitivity, systemSensitivity) {
        if (modelSensitivity === systemSensitivity) {
            return '模型评估与系统评估一致，判断准确';
        } else if (modelSensitivity === '高' && systemSensitivity === '低') {
            return '模型评估比系统更严格，可能过度关注时效性';
        } else if (modelSensitivity === '低' && systemSensitivity === '高') {
            return '模型评估比系统更宽松，可能低估时效性需求';
        } else {
            return '模型与系统评估存在差异，需要人工复核';
        }
    }

    // 质量评级
    _getQualityRating(score) {
        if (score >= 0.8) return { level: '优秀', emoji: '✅', description: '时效性管理卓越' };
        if (score >= 0.6) return { level: '良好', emoji: '⚠️', description: '时效性管理良好' };
        if (score >= 0.4) return { level: '一般', emoji: '🔶', description: '时效性管理一般' };
        return { level: '待改进', emoji: '❌', description: '时效性管理需要改进' };
    }

    // 改进建议
    _getImprovementRecommendations(planAnalysis, executionAnalysis, overallScore, modelSensitivity, systemSensitivity) {
        const recommendations = [];
        
        // 基于模型评估的建议
        if (modelSensitivity === '高' && executionAnalysis.temporal_action_ratio < 0.5) {
            recommendations.push('对于高敏感度主题，建议在执行中更多关注信息时效性验证');
        }
        
        if (modelSensitivity === '低' && executionAnalysis.temporal_action_ratio > 0.7) {
            recommendations.push('对于低敏感度主题，当前对时效性的关注可能过度，建议更专注于准确性');
        }
        
        // 基于执行质量的建议
        if (executionAnalysis.temporal_keyword_usage === 0 && modelSensitivity === '高') {
            recommendations.push('高敏感度主题中未使用时序性搜索关键词，建议在搜索中更多使用"最新"、"2025"等关键词');
        }
        
        if (executionAnalysis.official_source_access === 0 && modelSensitivity === '高') {
            recommendations.push('高敏感度主题中未访问官方来源，建议直接访问官网获取准确版本信息');
        }
        
        // 基于计划质量的建议
        if (planAnalysis.temporal_coverage < 0.3) {
            recommendations.push('研究计划中对时效性的考虑不足，建议在规划阶段更多关注信息时效性');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('当前时效性管理策略适当，模型判断与执行一致');
        }
        
        return recommendations;
    }

    // 生成总结
    _generateTemporalSummary(planAnalysis, executionAnalysis, overallScore, modelSensitivity) {
        const rating = this._getQualityRating(overallScore);
        const coveragePercent = (planAnalysis.temporal_coverage * 100).toFixed(0);
        const actionPercent = (executionAnalysis.temporal_action_ratio * 100).toFixed(0);
        const scorePercent = (overallScore * 100).toFixed(0);
        
        return `${rating.emoji} 时效性管理${rating.level} | 模型评估:${modelSensitivity} | 计划覆盖:${coveragePercent}% | 执行验证:${actionPercent}% | 综合得分:${scorePercent}分`;
    }
    // 确保 _recordTemporalPerformance 方法存在于 DeepResearchAgent.js 中
    _recordTemporalPerformance(performanceData) {
        if (!performanceData) return;
        try {
            const analyticsData = {
                timestamp: new Date().toISOString(),
                topic: performanceData.topic,
                research_mode: performanceData.research_mode,
                model_assessed_sensitivity: performanceData.model_assessment.overall_sensitivity,
                system_assessed_sensitivity: performanceData.system_assessment.overall_sensitivity,
                consistency: performanceData.system_assessment.is_consistent,
                overall_score: performanceData.quality_metrics.overall_temporal_score,
                quality_rating: performanceData.quality_metrics.quality_rating.level,
                plan_coverage: performanceData.quality_metrics.plan_quality.temporal_coverage,
                execution_ratio: performanceData.quality_metrics.execution_quality.temporal_action_ratio
            };
            console.log('[TemporalAnalytics] 记录时效性性能:', analyticsData);
        } catch (error) {
            console.warn('[TemporalAnalytics] 记录性能数据失败:', error);
        }
    }

    // ============================================================
    // 🎯 信息增益计算系统（保持不变）
    // ============================================================
    
    _calculateInformationGain(newObservation, history, config) {
        // 🎯 参数兼容处理
        const useConfig = typeof config === 'object' ? config : {
            useNovelty: true,
            useStructure: true,
            useEntity: false,  // 默认关闭，技术研究时手动开启
            useLengthRatio: true,
            decayFactor: 0.95 // 默认衰减因子
        };
        
        // 1. 基础参数验证
        const previousText = history.map(h => h.observation || '').join(' ');
        const newText = newObservation || '';
        
        // 短文本保护
        if (!newText || newText.length < 50) {
            return 0.1; // 基础增益，鼓励继续探索
        }
        
        let totalScore = 0;
        let activeDimensions = 0;
        
        // 2. 词汇新颖性（核心维度，权重40%）
        if (useConfig.useNovelty !== false) {
            const noveltyScore = this._calculateNoveltyScore(newText, previousText);
            totalScore += noveltyScore * 0.4;
            activeDimensions++;
        }
        
        // 3. 结构多样性（权重30%）
        if (useConfig.useStructure !== false) {
            const structureScore = this._calculateStructureScore(newText);
            totalScore += structureScore * 0.3;
            activeDimensions++;
        }
        
        // 4. 长度比率（权重20%）
        if (useConfig.useLengthRatio !== false) {
            const lengthScore = this._calculateLengthScore(newText, previousText);
            totalScore += lengthScore * 0.2;
            activeDimensions++;
        }
        
        // 5. 技术实体（可选，权重10%）
        if (useConfig.useEntity === true) {
            const entityScore = this._calculateEntityScore(newText, previousText);
            totalScore += entityScore * 0.1;
            activeDimensions++;
        }
        
        // 避免除零
        if (activeDimensions === 0) {
            return 0.1;
        }
        
        // 6. 加权平均
        const rawScore = totalScore / activeDimensions;
        
        // 7. 历史衰减（防止无限迭代）
        const decayFactor = useConfig.decayFactor || 0.9;
        const decay = Math.pow(decayFactor, Math.max(0, history.length - 3)); // 从第4步开始衰减
        const finalScore = rawScore * decay;
        
        // 8. 返回[0,1]范围内的值
        return Math.max(0.05, Math.min(0.95, finalScore));
    }

    // ✨ 新增：词汇新颖性计算（私有方法）
    _calculateNoveltyScore(newText, previousText) {
        // 简化的分词和过滤
        const tokenize = (text) => {
            return text
                .toLowerCase()
                .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
                .split(/\s+/)
                .filter(word => {
                    if (word.length < 2) return false;
                    if (/^\d+$/.test(word)) return false;
                    // 常见停用词（可根据需求扩展）
                    const stopWords = ['the', 'and', 'for', 'are', 'with', 'this', 'that', 
                                      '是', '的', '了', '在', '和', '与', '或'];
                    return !stopWords.includes(word);
                });
        };
        
        const previousWords = new Set(tokenize(previousText));
        const newWords = tokenize(newText);
        
        if (newWords.length === 0) return 0.1;
        
        // 新词比例
        const novelWords = newWords.filter(word => !previousWords.has(word));
        const basicNovelty = novelWords.length / newWords.length;
        
        return Math.max(0.1, Math.min(0.9, basicNovelty));
    }

    // ✨ 新增：结构多样性计算
    _calculateStructureScore(newText) {
        // 检测结构化内容
        let features = 0;
        const maxFeatures = 6;
        
        if (/\`\`\`[\s\S]*?\`\`\`/.test(newText)) features++; // 代码块
        if (/\|[\s\S]*?\|/.test(newText)) features++;         // 表格
        if (/^\s*[\-\*\+]\s|\d+\.\s/.test(newText)) features++; // 列表
        if (/^>\s/.test(newText)) features++;                 // 引用块
        if (/^#{1,3}\s/.test(newText)) features++;            // 标题
        if ((newText.match(/\n\s*\n/g) || []).length >= 3) features++; // 多段落
        
        return Math.min(features / maxFeatures, 1);
    }

    // ✨ 新增：长度比率计算
    _calculateLengthScore(newText, previousText) {
        if (previousText.length === 0) return 0.5; // 没有历史时中等增益
        
        const ratio = newText.length / previousText.length;
        // 归一化：ratio=1得0.5分，ratio=2得1分，ratio=0.5得0分
        const normalized = Math.max(0, Math.min(1, (ratio - 0.5) * 1.0));
        return normalized;
    }

    // ✨ 新增：技术实体检测（技术研究场景优化）
    _calculateEntityScore(newText, previousText) {
        // 技术术语模式
        const patterns = [
            /\b[A-Z]{2,}\b/g,           // 大写缩写（CUDA, GPU, API）
            /\b[\w\-]+(?:\.\d+)+\b/g,   // 版本号（13.1, TensorFlow-2.0）
            /\b(?:SDK|IDE|IR|SIMD|TPU|HPC)\b/gi // 技术缩写
        ];
        
        const extractEntities = (text) => {
            const entities = new Set();
            patterns.forEach(pattern => {
                const matches = text.match(pattern) || [];
                matches.forEach(match => entities.add(match.toLowerCase()));
            });
            return entities;
        };
        
        const newEntities = extractEntities(newText);
        const previousEntities = extractEntities(previousText);
        
        if (newEntities.size === 0) return 0;
        
        const novelEntities = Array.from(newEntities).filter(e => !previousEntities.has(e));
        return novelEntities.length / newEntities.size;
    }

    // ============================================================
    // 🎯 数据处理和工具方法（保持不变）
    // ============================================================
    
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
    if (!topic && !observations) return [];
    
    const text = (topic + ' ' + observations);
    const lowerText = text.toLowerCase();
    
    // 专有名词
    const properNouns = (text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b|\b[A-Z]{2,}\b/g) || [])
        .map(word => word.toLowerCase());

    // 数字
    const numbers = lowerText.match(/\b(20\d{2}|v?\d+\.\d+(?:\.\d+)?|[一二三四五六七八九十\d]+年|[一二三四五六七八九十\d]+月)\b/g) || [];

    // 中文短语（过滤虚词）
    const chinesePhrases = lowerText.match(/[\u4e00-\u9fa5]{2,}/g) || []
        .filter(phrase => {
            const virtualWords = ['的', '了', '在', '是', '和', '就', '不', '都'];
            return !virtualWords.some(vw => phrase.includes(vw));
        });

    // 技术术语
    const techTerms = lowerText.match(/\b(?:[a-z]+\d+|\d+[a-z]+|[a-z]+-\d+|[a-z]+_\d+|[a-z]+\.\d+(?:\.\d+)?)\b/g) || [];

    // 英文单词
    const englishStopWords = new Set([
        'this', 'that', 'with', 'from', 'have', 'has', 'been', 'were', 
        'what', 'when', 'where', 'which', 'who', 'will', 'would', 'about',
        'above', 'below', 'under', 'over', 'after', 'before', 'during',
        'between', 'among', 'should', 'could', 'might', 'must', 'some',
        'any', 'each', 'every', 'other', 'such', 'than', 'then', 'more',
        'most', 'less', 'also', 'just', 'only', 'very', 'really'
    ]);
    
    const englishWords = lowerText
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 4 && !englishStopWords.has(word) && word.trim() !== '');

    // 组合并过滤
    const allKeywords = [
        ...properNouns,
        ...numbers,
        ...chinesePhrases,
        ...techTerms,
        ...englishWords
    ];
    
    const filteredKeywords = [...new Set(allKeywords)]
        .filter(keyword => {
            if (!keyword || keyword.length < 2) return false;
            if (/^\d+$/.test(keyword)) return false;
            
            const meaninglessWords = new Set([
                '可以通过', '进行分析', '为我们', '也可以', '还可以',
                '可以通过', '我们需要', '我们可以', '你们可以'
            ]);
            return !meaninglessWords.has(keyword);
        });

    // 频率统计
    const keywordCounts = filteredKeywords.reduce((acc, word) => {
        let count = 0;
        const exactRegex = new RegExp(`\\b${word}\\b`, 'gi');
        const exactMatches = text.match(exactRegex);
        count += (exactMatches ? exactMatches.length : 0);
        
        if (word.length >= 4) {
            const partialRegex = new RegExp(word, 'gi');
            const partialMatches = text.match(partialRegex);
            if (partialMatches && partialMatches.length > (exactMatches ? exactMatches.length : 0)) {
                count = Math.max(count, partialMatches.length);
            }
        }
        
        if (count > 0) {
            acc[word] = count;
        }
        return acc;
    }, {});
    
    // 加权排序 - 🔥 修正后的关键部分
    const weightedResults = Object.entries(keywordCounts)
        .map(([term, count]) => {
            const lengthWeight = Math.min(term.length / 10, 1.5);
            const weight = count * lengthWeight;
            return { term, count, weight };
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 15)
        .map(({ term, count }) => ({ term, count }));
    
    return weightedResults;
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
2.  **结构**: 严格按照以下结构组织内容:
${config.structure.map(section => `    - ${section}`).join('\n')}
3.  **字数**: 报告总字数应在 ${config.wordCount} 左右。
4.  **风格**: ${config.style}
5.  **核心要求**: ${config.requirements}

6.  **【至关重要】引用来源的强制性学术准则 (Mandatory Citation Guideline)**

    *   **核心规则 (The Rule):** 你报告中的**每一个**关键数据、观点或结论，都**必须**在陈述该信息的段落末尾，清晰地注明其来源的**编号**。这是一个衡量报告专业性与可信度的核心标准，**必须严格遵守**。

    *   **原则与目的 (The Why):** 你的每一份报告都必须体现出学术的严谨性。清晰的编号引用能让读者追溯信息的源头，是验证内容准确性的唯一途径，也是一份专业报告的基石。

    *   **格式与位置 (The How)**:
        *   **引用内容**: 必须使用方括号和编号，例如 \`[1]\` 或 \`[2, 3]\`。
        *   **引用位置**: 在包含引用信息的**句子或段落结尾处**。

    *   **格式示例 (The Examples)**:
        *   **🚫 错误示例**: \`"...这个结论很重要。来源: 网站A"\` (格式错误且不够自然)
        *   **✅ 正确示例**: \`"...这一观点在最新的研究中得到了详细阐述 [1]。"\`
        *   **✅ 正确示例**: \`"...根据分类，我们可以将其分为三类 [2, 3]。"\`

---
**🛑 重要指令 🛑**
-   **绝对不要**在报告的任何部分（包括标题和章节名）提及或包含 "步骤"、"研究计划" 或任何相关的编号 (例如 "(步骤 1)")。
-   报告内容应流畅、连贯，直接呈现最终的研究成果，而不是研究过程的复述。
-   不要包含 "资料来源" 章节，我们会自动添加。
---

现在，请生成最终的研究报告：`;
    }

    _generateFallbackReport(topic, intermediateSteps, sources, researchMode) {
        // 🔥 使用 ReportGeneratorMiddleware 的降级报告方法
        return this.reportGenerator._generateFallbackReport(topic, intermediateSteps, sources, researchMode);
    }

    // ============================================================
    // 🎯 智能计划完成度计算系统（保持不变）
    // ============================================================
    
    _calculatePlanCompletion(plan, history) {
        if (!plan || !history || history.length === 0) return 0;
    
        const totalSteps = plan.research_plan?.length || 0;
        if (totalSteps === 0) return 0;
    
        // 🎯 核心修复：从plan中获取研究模式，兼容现有调用
        const researchMode = plan.research_mode || (plan.researchPlan?.research_mode) || 'standard';
    
        console.log(`[PlanCompletion] 开始计算完成度，计划步骤: ${totalSteps}，历史步骤: ${history.length}，模式: ${researchMode}`);
    
        let matchedSteps = 0;
    
        plan.research_plan.forEach((planStep, index) => {
        // 🎯 核心：双引擎匹配策略
            const keywordScore = this._calculateKeywordMatchScore(planStep, history, index, plan);
            const semanticScore = this._calculateSemanticSimilarity(planStep, history, index);
        
        // 🎯 智能融合：取两者较高值（避免单一算法偏差）
            const finalScore = Math.max(keywordScore, semanticScore);
        
        // 🎯 自适应阈值：根据研究模式调整
            const threshold = this._getAdaptiveThreshold(researchMode);
        
            if (finalScore >= threshold) {
                matchedSteps++;
                console.log(`[PlanCompletion] ✅ 步骤 ${index+1} 匹配成功: 关键词=${(keywordScore*100).toFixed(1)}%，语义=${(semanticScore*100).toFixed(1)}%，综合=${(finalScore*100).toFixed(1)}%`);
            } else {
                console.log(`[PlanCompletion] ❌ 步骤 ${index+1} 匹配失败: 关键词=${(keywordScore*100).toFixed(1)}%，语义=${(semanticScore*100).toFixed(1)}%，综合=${(finalScore*100).toFixed(1)}% < ${threshold*100}%`);
            }
        
        // 🎯 调试信息：显示计划步骤内容
            const stepPreview = planStep.sub_question?.length > 40 
                ? planStep.sub_question.substring(0, 40) + "..."
                : planStep.sub_question || '无问题描述';
            console.log(`[PlanCompletion]   步骤内容: "${stepPreview}"`);
        });
    
        const completion = totalSteps > 0 ? matchedSteps / totalSteps : 0;
        console.log(`[PlanCompletion] 🎯 总完成度: ${matchedSteps}/${totalSteps} = ${(completion*100).toFixed(1)}%`);
    
        // 🎯 确保返回值在0-1之间
        return Math.max(0, Math.min(1, completion));
    }

/**
 * 🎯 关键词匹配分数（精准算法）
 * 基于关键词的精确匹配，适合技术术语
 * 🔥 核心修复：保持与现有系统的参数兼容性
 */
    _calculateKeywordMatchScore(planStep, history, stepIndex, plan) {
        if (!planStep || !planStep.sub_question) return 0;
    
        const questionText = (planStep.sub_question || '').toLowerCase();
    
        // 🎯 智能分词：同时处理中英文混合文本
        const keywords = this._smartTokenize(questionText);
        if (keywords.length === 0) return 0;
    
        // 🎯 获取相关历史（每个计划步骤对应2-3个历史步骤）
        const relevantHistory = this._getRelevantHistoryForStep(history, stepIndex, plan);
        const historyText = relevantHistory.map(h => 
            `${h.action?.thought || ''} ${h.observation || ''} ${h.key_finding || ''}`
        ).join(' ').toLowerCase();
    
        // 🎯 计算匹配的关键词数量
        let foundCount = 0;
        keywords.forEach(keyword => {
        // 使用包含匹配（允许部分匹配，更灵活）
            if (historyText.includes(keyword)) {
                foundCount++;
            }
        });
    
        // 🎯 返回匹配比例
        return keywords.length > 0 ? foundCount / keywords.length : 0;
    }

/**
 * 🎯 语义相似度计算（模糊算法）
 * 基于词袋模型的Jaccard相似度，适合语义匹配
 * 🔥 核心修复：保持参数一致性，支持原系统调用
 */
    _calculateSemanticSimilarity(planStep, history, stepIndex) {
        if (!planStep || !planStep.sub_question) return 0;
    
        const questionText = (planStep.sub_question || '').toLowerCase();
    
        // 🎯 获取相关历史（最近3步）
        const relevantHistory = history.slice(-3);
        const historyText = relevantHistory.map(h => 
            `${h.action?.thought || ''} ${h.observation || ''}`
        ).join(' ').toLowerCase();
    
        // 🎯 智能分词
        const questionWords = this._smartTokenize(questionText);
        const historyWords = this._smartTokenize(historyText);
    
        if (questionWords.length === 0 || historyWords.length === 0) return 0;
    
        // 🎯 计算Jaccard相似度（交集/并集）
        const questionSet = new Set(questionWords);
        const historySet = new Set(historyWords);
    
        let intersection = 0;
        for (const word of questionSet) {
            if (historySet.has(word)) intersection++;
        }
    
        const union = questionSet.size + historySet.size - intersection;
    
        return union > 0 ? intersection / union : 0;
    }

/**
 * 🎯 智能分词（中英文通用）
 * 统一处理中英文混合文本，无需区分语言
 * 🔥 核心修复：增强健壮性，防止空值错误
 */
    _smartTokenize(text) {
        if (!text || typeof text !== 'string') return [];
    
        // 🎯 清理文本：保留中文字符、英文字母、数字
        const cleaned = text
            .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')  // 移除非中英文字符
            .replace(/\s+/g, ' ')                    // 合并多个空格
            .trim();
    
        if (!cleaned) return [];
    
        // 🎯 按非字母数字和非中文分割（统一分词）
        const tokens = cleaned
            .split(/[^\w\u4e00-\u9fa5]+/)
            .filter(token => {
            // 过滤条件
                const trimmed = token.trim();
            
            // 1. 长度至少为2
                if (trimmed.length < 2) return false;
            
            // 2. 过滤常见停用词（最小集合）
                const stopWords = new Set([
                // 中文停用词
                    '的', '了', '在', '和', '与', '或', '是', '有', '为', '对',
                    '从', '以', '就', '但', '而', '则', '却', '虽', '既',
                    '如何', '什么', '为什么', '怎样', '怎么', '哪些',
                
                // 英文停用词
                    'the', 'and', 'for', 'are', 'with', 'this', 'that',
                    'how', 'what', 'why', 'which', 'when', 'where'
                ]);
            
                if (stopWords.has(trimmed.toLowerCase())) return false;
            
                return true;
            })
            .map(token => token.toLowerCase());
    
        return tokens;
    }

/**
 * 🎯 获取步骤相关历史（智能映射）
 * 将计划步骤映射到对应的历史步骤
 * 🔥 核心修复：保持与现有系统兼容，支持不同的plan结构
 */
    _getRelevantHistoryForStep(history, stepIndex, plan) {
        if (!history || history.length === 0) return [];
    
    // 🎯 策略1：平均分配（每个计划步骤对应2-3个历史步骤）
    // 兼容不同的plan结构
        const planSteps = plan?.research_plan?.length || plan?.researchPlan?.length || 1;
        const stepsPerPlan = Math.ceil(history.length / planSteps);
    
        const startIndex = Math.max(0, stepIndex * stepsPerPlan);
        const endIndex = Math.min(history.length, startIndex + Math.max(3, stepsPerPlan));
    
    // 🎯 策略2：最近优先（取最近3步）
        const recentHistory = history.slice(-3);
    
    // 🎯 智能选择：如果历史步骤多，使用平均分配；否则使用最近优先
        if (history.length >= 6) {
            return history.slice(startIndex, endIndex);
        } else {
            return recentHistory;
        }
    }

/**
 * 🎯 自适应阈值（根据研究模式调整）
 * 根据不同的研究模式设置不同的匹配阈值
 */
    _getAdaptiveThreshold(researchMode) {
    // 🎯 默认阈值
        let threshold = 0.4; // 40%匹配度
    
    // 🎯 根据研究模式调整
        const modeThresholds = {
            'deep': 0.35,       // 深度模式降低要求（允许更深入探索）
            'academic': 0.45,   // 学术模式提高要求
            'business': 0.4,    // 商业模式标准要求
            'technical': 0.4,   // 技术模式标准要求  
            'data_mining': 0.3, // 数据挖掘模式最低要求
            'standard': 0.4     // 标准模式标准要求
        };
    
        return modeThresholds[researchMode] || threshold;
    }

/**
 * 🎯 兼容原系统的 _isStepEvidenceInHistory 方法
 * 🔥 核心修复：保持与原系统完全兼容的调用方式
 */
    _isStepEvidenceInHistory(step, history, plan) {
    // 🎯 兼容性修复：支持原系统的2参数调用
        if (arguments.length === 2) {
        // 原系统调用方式：isStepEvidenceInHistory(step, history)
        // 使用默认plan结构
            const defaultPlan = { research_mode: 'standard' };
            const keywordScore = this._calculateKeywordMatchScore(step, history, 0, defaultPlan);
            const semanticScore = this._calculateSemanticSimilarity(step, history, 0);
            const finalScore = Math.max(keywordScore, semanticScore);
        
            return finalScore >= this._getAdaptiveThreshold('standard');
        }
    
    // 🎯 新系统调用方式：isStepEvidenceInHistory(step, history, plan)
        const keywordScore = this._calculateKeywordMatchScore(step, history, 0, plan);
        const semanticScore = this._calculateSemanticSimilarity(step, history, 0);
        const finalScore = Math.max(keywordScore, semanticScore);
    
    // 🎯 使用自适应阈值
        const researchMode = plan?.research_mode || 'standard';
        return finalScore >= this._getAdaptiveThreshold(researchMode);
    }

    // ============================================================
    // 🎯 知识注入系统（保持不变）
    // ============================================================
    
    /**
     * 🎯 【核心优化】按需知识注入
     */
    async injectKnowledgeAsNeeded(toolName, context, step) {
        const { mode = 'deep' } = context;
        
        console.log(`[DeepResearchAgent] 🔍 检查知识注入: ${toolName}, 步骤: ${step}, 模式: ${mode}`);
        
        // 🎯 1. 检查是否已经注入过
        if (this.injectedTools.has(toolName)) {
            console.log(`[DeepResearchAgent] 🔄 工具 ${toolName} 已注入过，使用引用模式`);
            return this.getKnowledgeReference(toolName, context);
        }
        
        // 🎯 2. 根据步骤和模式决定压缩级别
        let compression = 'smart';
        let maxChars = 15000;
        
        if (step === 0) {
            // 第一步：完整（压缩后）指南
            compression = 'smart';
            maxChars = 20000;
        } else if (step <= 2) {
            // 前几步：摘要版
            compression = 'smart';
            maxChars = 8000;
        } else {
            // 后续步骤：最小化或引用
            if (mode === 'deep') {
                compression = 'minimal';
                maxChars = 5000;
            } else {
                compression = 'reference';
                maxChars = 2000;
            }
        }
        
        // 🎯 3. 从EnhancedSkillManager获取知识（带压缩）
        const knowledge = await this.skillManager.retrieveFederatedKnowledge(
            toolName,
            context,
            {
                compression,
                maxChars,
                iteration: step,
                sessionId: this.currentSessionId
            }
        );
        
        // 🎯 4. 记录已注入的工具
        if (knowledge && knowledge.content) {
            this.injectedTools.add(toolName);
            console.log(`[DeepResearchAgent] ✅ 注入知识: ${toolName} (${knowledge.content.length} chars)`);
        }
        
        return knowledge ? knowledge.content : '';
    }


    /**
     * 🎯 获取知识引用（已注入过的情况）
     */
    getKnowledgeReference(toolName, context) {
        // 🎯 关键：调用 EnhancedSkillManager 的 getKnowledgeReference 方法
        const knowledgePackage = this.skillManager.getKnowledgeReference(toolName, context);
        
        if (knowledgePackage && knowledgePackage.content) {
            return knowledgePackage.content;
        }
        
        // 降级到本地生成引用
        return `## 工具提示: ${toolName}\n\n` +
               `**注意**: 该工具的详细操作指南已在之前步骤中提供。\n` +
               `**当前步骤关键点**: 请根据任务需求合理使用 ${toolName} 工具。\n\n` +
               `*如需查看完整指南，请参考之前步骤的详细说明。*`;
    }

    /**
     * 🎯 判断是否需要注入知识
     */
    shouldInjectKnowledge(toolName, step) {
        // 简单策略：每个工具只在第一次使用时注入详细知识
        if (!this.injectedTools.has(toolName)) {
            return true;
        }
        
        // 如果是复杂工具（如python_sandbox）且在关键步骤，可以再次提示
        if (toolName === 'python_sandbox' && (step === 3 || step === 5)) {
            return true;
        }
        
        return false;
    }

    resetInjectionState() {
        this.injectedTools.clear();
        this.currentSessionId = `session_${Date.now()}`;
        console.log(`[DeepResearchAgent] 🔄 知识注入状态已重置，新会话ID: ${this.currentSessionId}`);
    }
 
    /**
     * 🎯 辅助方法：判断是否为致命解析错误
     */
    _isParserError(error) {
        if (!error || !error.message) return false;
        
        // 🎯 关键字列表：涵盖 OutputParser 抛出的自定义错误和 JSON.parse 抛出的标准错误
        const parserKeywords = [
            '无法解析出有效的行动或最终答案',
            'Expected \',\' or \'}\' after property value',
            'Unexpected token',
            'JSON格式错误',
            '解析失败',
            'Invalid JSON',
            'SyntaxError',
            '[DUPLICATE_URL_ERROR]' // 🎯 新增：识别重复URL错误
        ];
        
        const message = error.message || '';
        return parserKeywords.some(keyword => message.includes(keyword));
    }

    // ============================================================
    // 🎯 向后兼容的代理方法（确保现有代码正常运行）
    // ============================================================
    
    /**
     * 🎯 代理方法：执行工具调用（向后兼容）
     */
    async _executeToolCall(toolName, parameters, detectedMode, recordToolCall) {
        console.warn(`[DeepResearchAgent] ⚠️ 使用已弃用的 _executeToolCall 方法，请更新为使用 toolExecutor`);
        return await this.toolExecutor.executeToolCall(toolName, parameters, detectedMode, recordToolCall);
    }
    
    /**
     * 🎯 代理方法：执行带知识的工具调用（向后兼容）
     */
    async _executeToolWithKnowledge(toolName, parameters, thought, intermediateSteps, detectedMode, recordToolCall) {
        console.warn(`[DeepResearchAgent] ⚠️ 使用已弃用的 _executeToolWithKnowledge 方法，请更新为使用 toolExecutor`);
        return await this.toolExecutor.executeToolWithKnowledge(
            toolName, parameters, thought, intermediateSteps, detectedMode, recordToolCall
        );
    }
    
    /**
     * 🎯 代理方法：存储原始数据（向后兼容）
     */
    _storeRawData(stepIndex, rawData, metadata = {}, toolSources = []) {
        console.warn(`[DeepResearchAgent] ⚠️ 使用已弃用的 _storeRawData 方法，请更新为使用 stateManager`);
        this.stateManager.storeInDataBus(stepIndex, rawData, metadata, toolSources);
    }
    
    /**
     * 🎯 代理方法：从数据总线检索（向后兼容）
     */
    _retrieveDataFromBus() {
        console.warn(`[DeepResearchAgent] ⚠️ 使用已弃用的 _retrieveDataFromBus 方法，请更新为使用 stateManager`);
        return this.stateManager.retrieveFromDataBus();
    }
    
    /**
     * 🎯 代理方法：构建证据集合（向后兼容）
     */
    _buildEvidenceCollection(intermediateSteps, plan, researchMode = 'standard') {
        console.warn(`[DeepResearchAgent] ⚠️ 使用已弃用的 _buildEvidenceCollection 方法，请更新为使用 reportGenerator`);
        return this.reportGenerator._buildEvidenceCollection(intermediateSteps, plan, researchMode);
    }
    
    /**
     * 🎯 代理方法：生成最终报告（向后兼容）
     */
    async _generateFinalReport(topic, intermediateSteps, plan, sources, researchMode, originalUserInstruction) {
        console.warn(`[DeepResearchAgent] ⚠️ 使用已弃用的 _generateFinalReport 方法，请更新为使用 reportGenerator`);
        return await this.reportGenerator.generateFinalReport(
            topic, intermediateSteps, plan, sources, researchMode, originalUserInstruction
        );
    }
    
    /**
     * 🎯 代理方法：生成来源章节（向后兼容）
     */
    async _generateSourcesSection(sources, plan) {
        console.warn(`[DeepResearchAgent] ⚠️ 使用已弃用的 _generateSourcesSection 方法，请更新为使用 reportGenerator`);
        return this.reportGenerator._generateSourcesSection(sources, plan);
    }
}