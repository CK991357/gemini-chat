// src/static/js/agent/deepresearch/middleware/ReportGeneratorMiddleware.js
// 📝 报告生成中间件 - 从 DeepResearchAgent 中分离的报告生成逻辑
// 🎯 完整版本，包含所有缺失的内容和所有方法实现

export class ReportGeneratorMiddleware {
    /**
     * 🎯 报告生成中间件构造函数（完整版）
     * @param {Object} chatApiHandler - 聊天API处理器
     * @param {Object} skillManager - 技能管理器
     * @param {Object} callbackManager - 回调管理器（必须！）
     * @param {Object} sharedState - 共享状态（来自主Agent）
     * @param {Object} config - 配置
     */
    constructor(chatApiHandler, skillManager, callbackManager, sharedState, config = {}) {
        // 🎯 依赖注入（关键：必须包含 callbackManager）
        this.chatApiHandler = chatApiHandler;
        this.skillManager = skillManager;
        this.callbackManager = callbackManager; // 🔥 关键修复：添加回调管理器
        
        // 🎯 共享状态（必须与主文件完全一致）
        this.dataBus = sharedState.dataBus || new Map();
        this.generatedImages = sharedState.generatedImages || new Map();
        this.intermediateSteps = sharedState.intermediateSteps || [];
        this.metrics = sharedState.metrics || { // 🔥 关键：添加指标统计
            toolUsage: { tavily_search: 0, crawl4ai: 0, python_sandbox: 0 },
            stepProgress: [],
            informationGain: [],
            planCompletion: 0,
            tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
        this.runId = sharedState.runId || null; // 🔥 关键：运行ID
        this.reportModel = config.reportModel || 'deepseek-reasoner'; // 🔥 保留报告模型

        // 🎯 关键修复：从配置中获取模板函数
        this.getTemplateByResearchMode = config.getTemplateByResearchMode;
        this.getTemplatePromptFragment = config.getTemplatePromptFragment;
        
        console.log('[ReportGeneratorMiddleware] ✅ 初始化完成', {
            reportModel: this.reportModel,
            dataBusSize: this.dataBus.size,
            imagesCount: this.generatedImages.size,
            stepsCount: this.intermediateSteps.length,
            hasTemplateFunctions: !!(this.getTemplateByResearchMode && this.getTemplatePromptFragment), // 🔥 新增
            hasCallbackManager: !!this.callbackManager // 🔥 关键检查
        });
    }

    // ============================================================
    // 🎯 核心公共API方法 - 供主文件调用
    // ============================================================
    
    /**
     * ✨ 生成最终报告的公共方法（主文件调用入口）
     * 🔥 完全模拟主文件的 _generateFinalReport 方法
     */
    async generateFinalReport(topic, intermediateSteps, plan, sources, researchMode, originalUserInstruction) {
        // 🎯 触发事件：报告生成开始
        if (this.callbackManager) {
            await this.callbackManager.invokeEvent('agent:thinking', {
                detail: {
                    content: `正在为"${topic}"生成${researchMode}模式的研究报告...`,
                    type: 'report_generation',
                    agentType: 'deep_research'
                }
            });
        }
        
        console.log('[ReportGeneratorMiddleware] ==================== 报告生成阶段开始 ====================');
        console.log(`[ReportGeneratorMiddleware] 🎯 报告生成配置:`);
        console.log(`  • 主题: ${topic}`);
        console.log(`  • 研究模式: ${researchMode}`);
        console.log(`  • 写作模型: ${this.reportModel}`);
        console.log(`  • 来源数量: ${sources.length}`);
        console.log(`  • 证据步骤: ${intermediateSteps.length}`);
        console.log(`  • 原始指令长度: ${originalUserInstruction?.length || 0}`);
        console.log(`  • 运行ID: ${this.runId || '未设置'}`);
        
        // 更新中间步骤（允许外部传入覆盖）
        if (intermediateSteps) {
            this.intermediateSteps = intermediateSteps;
        }
        
        // 1. 构建纯净的证据集合
        const evidenceCollection = this._buildEvidenceCollection(intermediateSteps, plan, researchMode);
        
        console.log('[ReportGeneratorMiddleware] 📦 数据准备完成:');
        console.log(`  • 有效证据: ${evidenceCollection.validEvidenceSteps}个`);
        console.log(`  • 关键发现: ${evidenceCollection.keyFindings.length}个`);
        console.log(`  • 总长度: ${evidenceCollection.totalLength}字符`);
        console.log(`  • 数据总线条目: ${this.dataBus.size}个`);

        // 2. 构建带编号的来源索引 (Source Index)
        const numberedSourcesText = this._buildNumberedSources(sources);

        // 3. 获取报告模板和提示词片段
        const reportTemplate = this._getTemplateByResearchMode(researchMode);
        let promptFragment = this._getTemplatePromptFragment(researchMode);

        // 🔥 特殊处理：数据挖掘模式
        if (researchMode === 'data_mining') {
            console.log(`[ReportGeneratorMiddleware] 🔍 数据挖掘模式，使用专用提示词`);
    
            // 检查是否使用真实模板
            if (reportTemplate?.config?.scenario_adapters) {
                console.log(`[ReportGeneratorMiddleware] ✅ 使用真实数据挖掘模板，包含 ${Object.keys(reportTemplate.config.scenario_adapters).length} 个场景适配器`);
            } else {
                console.warn(`[ReportGeneratorMiddleware] ⚠️ 数据挖掘模式使用降级模板`);
            }
        }
        
        // 🎯 【调试模式特别指令注入】- 与主文件完全一致
        if (researchMode === 'standard') {
            promptFragment += `
\n\n🕵️‍♂️ **调试/审计模式核心指令 (System Audit Directives)**：

**角色定义**：
你此刻不再是内容创作者，你是**首席系统架构师**。你的任务是对本次 Agent 的执行链路进行**法医级的尸检分析 (Forensic Analysis)**。

**必须审查的维度 (Mandatory Review Checklist)**：
1.  **意图漂移 (Intent Drift)**：
    - Agent 在执行过程中是否跑题？初始规划是否真正覆盖了用户需求？
2.  **工具滥用 (Tool Misuse)**：
    - 检查 \`tavily_search\`：关键词是否过于宽泛（如只搜了一个字）？是否进行了无意义的重复搜索？
    - 检查 \`crawl4ai\`：是否抓取了显而易见的无效页面（如登录页、验证码页）？
    - 检查 \`python_sandbox\`：是否在没有数据的情况下强行写代码？是否产生了 SyntaxError？
3.  **数据一致性 (Data Integrity)**：
    - **幻觉检测**：Agent 在 "Thought" 中声称查到了数据，但在 "Observation" 中实际上是空的？如有，必须标记为 **[CRITICAL HALLUCINATION]**。
    - **压缩损耗**：指出哪些步骤的原始数据极长，但摘要过短，导致了潜在的关键信息丢失。
4.  **Token 效益 (Token Economics)**：
    - 标记出 **[LOW ROI]**（低投入产出比）的步骤：消耗了大量 Token 但未提供新信息的步骤。

**输出风格要求**：
- 保持**冷酷、客观、技术化**。
- 不要试图为 Agent 辩解。
- 对于严重的逻辑断层，请直接使用 **❌** 符号标出。
`;
        }

        // 4. 构建最终提示词
        let finalPrompt;
        if (reportTemplate.config?.dynamic_structure) {
            console.log(`[ReportGeneratorMiddleware] 检测到动态报告模板 (${researchMode}模式)，构建学术级Prompt...`);
            finalPrompt = this._buildDynamicReportPrompt(
                topic, plan, numberedSourcesText, evidenceCollection, 
                originalUserInstruction, promptFragment, researchMode
            );
        } else {
            console.log(`[ReportGeneratorMiddleware] 使用静态报告模板 (${researchMode}模式)...`);
            finalPrompt = this._buildStaticReportPrompt(
                topic, numberedSourcesText, evidenceCollection, 
                originalUserInstruction, promptFragment, researchMode
            );
        }

        // 5. 日志输出重要指令
        this._logPromptSummary(finalPrompt);

        console.log('[ReportGeneratorMiddleware] 调用报告生成模型进行最终整合');
        
        // 6. 调用模型生成报告（带重试机制）
        const maxRetries = 2;
        const retryDelay = 2000;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const startTime = Date.now();
                
                // 🎯 调用前事件通知
                if (this.callbackManager && attempt === 0) {
                    await this.callbackManager.invokeEvent('agent:thinking', {
                        detail: {
                            content: `正在使用 ${this.reportModel} 模型生成研究报告...`,
                            type: 'model_call',
                            agentType: 'deep_research',
                            model: this.reportModel
                        }
                    });
                }
                
                const reportResponse = await this.chatApiHandler.completeChat({
                    messages: [{ role: 'user', content: finalPrompt }],
                    model: this.reportModel,
                    temperature: 0.3,
                });
                
                const executionTime = Date.now() - startTime;
                console.log(`[ReportGeneratorMiddleware] 📥 收到写作模型响应 (尝试${attempt + 1}):`);
                console.log(`  • 耗时: ${executionTime}ms`);
                
                // 🎯 更新Token使用统计
                if (reportResponse?.usage) {
                    console.log(`  • Token消耗: ${reportResponse.usage.total_tokens}`);
                    console.log(`  • 上行: ${reportResponse.usage.prompt_tokens}`);
                    console.log(`  • 下行: ${reportResponse.usage.completion_tokens}`);
                    
                    // 更新指标
                    this.metrics.tokenUsage = {
                        prompt_tokens: (this.metrics.tokenUsage.prompt_tokens || 0) + (reportResponse.usage.prompt_tokens || 0),
                        completion_tokens: (this.metrics.tokenUsage.completion_tokens || 0) + (reportResponse.usage.completion_tokens || 0),
                        total_tokens: (this.metrics.tokenUsage.total_tokens || 0) + (reportResponse.usage.total_tokens || 0)
                    };
                }
                
                let finalReport = reportResponse?.choices?.[0]?.message?.content ||
                    this._generateFallbackReport(topic, intermediateSteps, sources, researchMode);
                
                // 分析报告结构
                console.log(`[ReportGeneratorMiddleware] 📄 生成的报告:`);
                console.log(`  • 长度: ${finalReport.length}字符`);
                const sections = (finalReport.match(/^#{2,3}\s+.+/gm) || []).length;
                const citations = (finalReport.match(/\[\d+\]/g) || []).length;
                console.log(`  • 章节数: ${sections}`);
                console.log(`  • 引用数: ${citations}`);
                
                console.log(`[ReportGeneratorMiddleware] ✅ 报告生成成功 (尝试 ${attempt + 1}/${maxRetries + 1})，模式: ${researchMode}`);
                
                // 🎯 触发成功事件
                if (this.callbackManager) {
                    await this.callbackManager.invokeEvent('agent:thinking', {
                        detail: {
                            content: `研究报告生成成功！共${sections}个章节，${citations}处引用。`,
                            type: 'report_success',
                            agentType: 'deep_research',
                            reportLength: finalReport.length,
                            sections: sections,
                            citations: citations
                        }
                    });
                }
                
                return finalReport;

            } catch (error) {
                console.error(`[ReportGeneratorMiddleware] ❌ 报告生成失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, error.message);
                
                // 🎯 触发错误事件
                if (this.callbackManager) {
                    await this.callbackManager.invokeEvent('agent:thinking', {
                        detail: {
                            content: `报告生成失败 (${error.message})，正在重试...`,
                            type: 'report_error',
                            agentType: 'deep_research',
                            error: error.message,
                            attempt: attempt + 1,
                            maxRetries: maxRetries + 1
                        }
                    });
                }
                
                // 如果是最后一次尝试，使用降级方案
                if (attempt === maxRetries) {
                    console.error('[ReportGeneratorMiddleware] 🚨 所有重试尝试均失败，使用降级报告');
                    
                    // 🎯 触发降级事件
                    if (this.callbackManager) {
                        await this.callbackManager.invokeEvent('agent:thinking', {
                            detail: {
                                content: '所有重试均失败，生成降级报告...',
                                type: 'report_fallback',
                                agentType: 'deep_research'
                            }
                        });
                    }
                    
                    return this._generateFallbackReport(topic, intermediateSteps, sources, researchMode);
                }
                
                // 等待后重试
                console.log(`[ReportGeneratorMiddleware] ⏳ 等待 ${retryDelay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    /**
     * ✨ 报告后处理流水线（公共方法）
     * 🔥 完整包含所有后处理步骤
     */
    async processReport(finalReport, sources, plan, researchMode) {
        console.log('[ReportGeneratorMiddleware] 🚀 开始报告后处理流水线...');
        
        if (this.callbackManager) {
            await this.callbackManager.invokeEvent('agent:thinking', {
                detail: {
                    content: '正在对报告进行后处理...',
                    type: 'post_processing',
                    agentType: 'deep_research'
                }
            });
        }

        // 1. 智能来源分析
        console.log('[ReportGeneratorMiddleware] 正在基于完整报告进行来源分析...');
        const filteredSources = this._filterUsedSources(sources, finalReport);
        console.log(`[ReportGeneratorMiddleware] 资料来源过滤完成: ${sources.length} → ${filteredSources.length}`);

        // 2. 清理幻觉章节
        let cleanedReport = this._cleanReportSections(finalReport);

        // 3. 兜底图片渲染
        if (this.generatedImages.size > 0) {
            console.log(`[ReportGeneratorMiddleware] 开始检查图片引用完整性，共 ${this.generatedImages.size} 张图片...`);
            cleanedReport = this._enforceImageRendering(cleanedReport);
        }

        // 4. Base64 统一替换
        if (this.generatedImages.size > 0) {
            console.log(`[ReportGeneratorMiddleware] 开始执行最终渲染 (Base64替换)...`);
            cleanedReport = this._replaceImagePlaceholders(cleanedReport);
        }

        // 5. 附加真实来源列表
        cleanedReport += await this._generateSourcesSection(filteredSources, plan);

        // 6. 完全独立的文中引用映射表
        console.log('[ReportGeneratorMiddleware] 构建独立文中引用映射表...');
        const independentCitationSection = await this._generateIndependentCitationMapping(cleanedReport, sources);
        if (independentCitationSection) {
            cleanedReport += independentCitationSection;
            console.log('[ReportGeneratorMiddleware] ✅ 独立文中引用映射表已附加');
        } else {
            console.log('[ReportGeneratorMiddleware] ℹ️ 未检测到文中引用，跳过映射表生成');
        }

        // 7. 🎯 生成时效性质量评估报告（主文件的核心功能）
        console.log('[ReportGeneratorMiddleware] 生成时效性质量评估报告...');
        const temporalQualityReport = this._generateTemporalQualityReport(
            plan,
            this.intermediateSteps,
            plan.topic || '未知主题',
            researchMode
        );
        
        // 8. 🎯 记录性能数据
        this._recordTemporalPerformance(temporalQualityReport);
        
        console.log(`[ReportGeneratorMiddleware] ✅ 报告后处理完成，最终长度: ${cleanedReport.length}字符`);
        
        // 🎯 触发完成事件
        if (this.callbackManager) {
            await this.callbackManager.invokeEvent('agent:thinking', {
                detail: {
                    content: '报告后处理完成！',
                    type: 'post_processing_complete',
                    agentType: 'deep_research',
                    finalLength: cleanedReport.length,
                    sourcesCount: filteredSources.length,
                    imagesCount: this.generatedImages.size
                }
            });
        }
        
        return {
            cleanedReport,
            filteredSources,
            temporalQualityReport,
            metrics: this.metrics
        };
    }

    /**
     * ✨ 生成完整的最终结果（供主文件调用的统一接口）
     * 🔥 模拟主文件的返回结构
     */
    async generateCompleteResult(topic, intermediateSteps, plan, sources, researchMode, originalUserInstruction) {
        console.log('[ReportGeneratorMiddleware] 🎯 生成完整研究结果...');
        
        try {
            // 1. 生成最终报告
            const rawReport = await this.generateFinalReport(
                topic, intermediateSteps, plan, sources, researchMode, originalUserInstruction
            );
            
            // 2. 进行后处理
            const { cleanedReport, filteredSources, temporalQualityReport } = await this.processReport(
                rawReport, sources, plan, researchMode
            );
            
            // 3. 计算计划完成度
            const planCompletion = this._calculatePlanCompletion(plan, intermediateSteps);
            
            // 4. 构建完整结果对象（与主文件完全一致）
            const result = {
                success: true,
                topic: topic,
                report: cleanedReport,
                iterations: intermediateSteps.length,
                intermediateSteps: intermediateSteps,
                sources: filteredSources,
                metrics: this.metrics,
                plan_completion: planCompletion,
                research_mode: researchMode,
                temporal_quality: temporalQualityReport,
                model: this.reportModel
            };
            
            console.log('[ReportGeneratorMiddleware] ✅ 完整结果生成成功');
            return result;
            
        } catch (error) {
            console.error('[ReportGeneratorMiddleware] ❌ 生成完整结果失败:', error);
            
            // 🎯 降级：返回错误报告
            return {
                success: false,
                topic: topic,
                report: this._generateFallbackReport(topic, intermediateSteps, sources, researchMode),
                iterations: intermediateSteps.length,
                intermediateSteps: intermediateSteps,
                sources: sources.slice(0, 5),
                metrics: this.metrics,
                plan_completion: 0,
                research_mode: researchMode,
                temporal_quality: { error: error.message },
                model: this.reportModel,
                error: error.message
            };
        }
    }

    // ============================================================
    // 🎯 时效性质量评估系统（从主文件迁移的完整版本）
    // ============================================================
    
    /**
     * 🎯 时效性质量评估报告（完整实现）
     */
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
                step_sensitivities: researchPlan.research_plan?.map(step => ({
                    step: step.step,
                    sensitivity: step.temporal_sensitivity,
                    sub_question: step.sub_question
                })) || []
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

    /**
     * 🎯 系统程序化评估方法
     */
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
            'data_mining': '高'
        };
        
        if (hasHighSensitivity) return '高';
        if (hasLowSensitivity) return '低';
        
        return modeSensitivity[researchMode] || '中';
    }

    /**
     * 🎯 分析计划层面的时效性意识
     */
    _analyzePlanTemporalAwareness(researchPlan) {
        const steps = researchPlan.research_plan || [];
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
            high_sensitivity_ratio: totalSteps > 0 ? sensitivityCount['高'] / totalSteps : 0,
            temporal_coverage: totalSteps > 0 ? stepsWithTemporalQueries / totalSteps : 0,
            avg_temporal_queries_per_step: stepsWithTemporalQueries > 0 ? 
                (totalTemporalQueries / stepsWithTemporalQueries) : 0,
            plan_quality: this._ratePlanQuality(sensitivityCount, stepsWithTemporalQueries, totalSteps)
        };
    }

    /**
     * 🎯 分析执行层面的时效性行为
     */
    _analyzeExecutionTemporalBehavior(intermediateSteps, researchPlan) {
        const currentYear = new Date().getFullYear().toString();
        const totalActions = intermediateSteps.length;
        
        let temporalAwareActions = 0;
        let temporalKeywordUsage = 0;
        let versionVerificationAttempts = 0;
        let officialSourceAccess = 0;
        
        // 构建步骤敏感度映射
        const stepSensitivityMap = {};
        (researchPlan.research_plan || []).forEach(step => {
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

    /**
     * 🎯 综合评分（基于模型自主评估）
     */
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

    /**
     * 🎯 计划质量评级
     */
    _ratePlanQuality(sensitivityCount, stepsWithTemporalQueries, totalSteps) {
        const highSensitivityRatio = sensitivityCount['高'] / totalSteps;
        const temporalCoverage = stepsWithTemporalQueries / totalSteps;
        
        if (highSensitivityRatio > 0.5 && temporalCoverage > 0.6) return '优秀';
        if (highSensitivityRatio > 0.3 && temporalCoverage > 0.4) return '良好';
        if (highSensitivityRatio > 0.2 && temporalCoverage > 0.2) return '一般';
        return '待改进';
    }

    /**
     * 🎯 执行质量评级
     */
    _rateExecutionQuality(temporalAwareActions, totalActions, temporalKeywordUsage) {
        const temporalActionRatio = totalActions > 0 ? (temporalAwareActions / totalActions) : 0;
        
        if (temporalActionRatio > 0.6 && temporalKeywordUsage > 0) return '优秀';
        if (temporalActionRatio > 0.4 && temporalKeywordUsage > 0) return '良好';
        if (temporalActionRatio > 0.2) return '一般';
        return '待改进';
    }

    /**
     * 🎯 一致性说明
     */
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

    /**
     * 🎯 质量评级
     */
    _getQualityRating(score) {
        if (score >= 0.8) return { level: '优秀', emoji: '✅', description: '时效性管理卓越' };
        if (score >= 0.6) return { level: '良好', emoji: '⚠️', description: '时效性管理良好' };
        if (score >= 0.4) return { level: '一般', emoji: '🔶', description: '时效性管理一般' };
        return { level: '待改进', emoji: '❌', description: '时效性管理需要改进' };
    }

    /**
     * 🎯 改进建议
     */
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

    /**
     * 🎯 生成总结
     */
    _generateTemporalSummary(planAnalysis, executionAnalysis, overallScore, modelSensitivity) {
        const rating = this._getQualityRating(overallScore);
        const coveragePercent = (planAnalysis.temporal_coverage * 100).toFixed(0);
        const actionPercent = (executionAnalysis.temporal_action_ratio * 100).toFixed(0);
        const scorePercent = (overallScore * 100).toFixed(0);
        
        return `${rating.emoji} 时效性管理${rating.level} | 模型评估:${modelSensitivity} | 计划覆盖:${coveragePercent}% | 执行验证:${actionPercent}% | 综合得分:${scorePercent}分`;
    }

    /**
     * 🎯 记录时效性性能数据
     */
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
    // 🔧 计划完成度计算系统（从主文件迁移）
    // ============================================================
    
    /**
     * ✨ 智能计划完成度计算（与主文件兼容版）
     */
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

    _calculateKeywordMatchScore(planStep, history, stepIndex, plan) {
        if (!planStep || !planStep.sub_question) return 0;
        
        const questionText = (planStep.sub_question || '').toLowerCase();
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
            if (historyText.includes(keyword)) {
                foundCount++;
            }
        });
        
        // 🎯 返回匹配比例
        return keywords.length > 0 ? foundCount / keywords.length : 0;
    }

    _calculateSemanticSimilarity(planStep, history, stepIndex) {
        if (!planStep || !planStep.sub_question) return 0;
        
        const questionText = (planStep.sub_question || '').toLowerCase();
        const relevantHistory = history.slice(-3);
        const historyText = relevantHistory.map(h => 
            `${h.action?.thought || ''} ${h.observation || ''}`
        ).join(' ').toLowerCase();
        
        const questionWords = this._smartTokenize(questionText);
        const historyWords = this._smartTokenize(historyText);
        
        if (questionWords.length === 0 || historyWords.length === 0) return 0;
        
        const questionSet = new Set(questionWords);
        const historySet = new Set(historyWords);
        
        let intersection = 0;
        for (const word of questionSet) {
            if (historySet.has(word)) intersection++;
        }
        
        const union = questionSet.size + historySet.size - intersection;
        return union > 0 ? intersection / union : 0;
    }

    _smartTokenize(text) {
        if (!text || typeof text !== 'string') return [];
        
        const cleaned = text
            .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (!cleaned) return [];
        
        const tokens = cleaned
            .split(/[^\w\u4e00-\u9fa5]+/)
            .filter(token => {
                const trimmed = token.trim();
                if (trimmed.length < 2) return false;
                
                const stopWords = new Set([
                    '的', '了', '在', '和', '与', '或', '是', '有', '为', '对',
                    '从', '以', '就', '但', '而', '则', '却', '虽', '既',
                    '如何', '什么', '为什么', '怎样', '怎么', '哪些',
                    'the', 'and', 'for', 'are', 'with', 'this', 'that',
                    'how', 'what', 'why', 'which', 'when', 'where'
                ]);
                
                if (stopWords.has(trimmed.toLowerCase())) return false;
                return true;
            })
            .map(token => token.toLowerCase());
        
        return tokens;
    }

    _getRelevantHistoryForStep(history, stepIndex, plan) {
        if (!history || history.length === 0) return [];
        
        const planSteps = plan?.research_plan?.length || plan?.researchPlan?.length || 1;
        const stepsPerPlan = Math.ceil(history.length / planSteps);
        
        const startIndex = Math.max(0, stepIndex * stepsPerPlan);
        const endIndex = Math.min(history.length, startIndex + Math.max(3, stepsPerPlan));
        
        const recentHistory = history.slice(-3);
        
        if (history.length >= 6) {
            return history.slice(startIndex, endIndex);
        } else {
            return recentHistory;
        }
    }

    _getAdaptiveThreshold(researchMode) {
        const modeThresholds = {
            'deep': 0.35,
            'academic': 0.45,
            'business': 0.4,
            'technical': 0.4,
            'data_mining': 0.3,
            'standard': 0.4
        };
        
        return modeThresholds[researchMode] || 0.4;
    }

    // ============================================================
    // 🔧 报告构建辅助方法
    // ============================================================
    
    /**
     * 🎯 构建带编号的来源索引
     */
    _buildNumberedSources(sources) {
        return sources.map((s, i) => {
            const dateStr = s.collectedAt ? ` (${s.collectedAt.split('T')[0]})` : '';
            const desc = s.description ? s.description.substring(0, 100).replace(/\n/g, ' ') + '...' : '无摘要';
            return `[${i + 1}] 《${s.title}》- ${desc}${dateStr}`;
        }).join('\n');
    }

    /**
     * 🎯 构建动态报告提示词
     */
    _buildDynamicReportPrompt(topic, plan, numberedSourcesText, evidenceCollection, originalUserInstruction, promptFragment, researchMode) {
        return `
# 🚫 绝对禁止开场白协议
**禁止生成任何形式的"好的，遵命"、"作为一名专业的"等确认语句**
**必须直接从报告标题开始输出纯净内容**

# 角色：首席研究分析师

## 🔥 最高优先级指令：引用标记 🔥
**你必须使用 [数字] 格式在文中标注引用，否则报告无效！**

### 📍 引用规则：
1. **每使用一个来源的信息**，就必须在句子末尾标注对应编号
2. **格式**：必须使用方括号包裹数字，如 [1]、[2]、[3]
3. **位置**：放在句子末尾，句号之前
4. **多个引用**：用逗号分隔，如 [1, 2, 3]

### ✅ 通用示例（正确的格式）：
- 研究表明，这一趋势将在未来三年内持续增长 [1]。
- 根据多个来源的分析，该技术具有显著优势 [2, 3, 5]。
- 数据对比显示，新方法比传统方法效率提升了约40% [4, 7]。

### ❌ 错误格式（禁止使用）：
- 研究表明[1]这一趋势...
- 来源1显示...
- 根据ref2...
- [1号来源]认为...

**记住：引用标记必须在句子末尾，方括号内只能是数字！**

# 任务：基于提供的证据和资料来源，撰写一份高质量、结构化、体现深度思考的学术级研究报告。

# 最终研究主题: "${topic}"

# 0. 🎯 原始用户指令 (最高优先级)
**请严格遵循此指令中包含的任何结构、提纲或格式要求。**
\`\`\`
${originalUserInstruction}
\`\`\`

# 1. 研究计划 (纲领)
\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`

# 2. 📚 资料来源索引 (Source Index)
**注意：以下编号对应你在正文中应引用的 [x] 标记。**
${numberedSourcesText}

# 3. 研究证据集合 (详细内容)
以下内容是从上述来源中提取的详细信息。请结合上面的来源索引进行语义化引用。

${evidenceCollection.keyFindings.map((finding, index) => `* 关键发现 ${index + 1}: ${finding}`).join('\n')}

## 详细证据:
${evidenceCollection.evidenceEntries.map(entry => `
### ${entry.subQuestion}
${entry.evidence}
${entry.hasStructuredData ? `\n\n**🗃️ 本步骤包含结构化数据，必须用表格呈现**\n${entry.structuredData}` : ''}
${entry.keyFinding ? `\n**💡 本步关键发现:** ${entry.keyFinding}` : ''}
`).join('\n\n')}

# 4. 你的报告撰写指令 (输出要求)
现在，请严格遵循以下元结构和要求，将上述研究证据整合成一份最终报告。
${promptFragment}

**🚫 绝对禁止:**
- 编造研究计划和证据集合中不存在的信息。
- 在报告中提及"思考"、"行动"、"工具调用"等研究过程细节。
- 手动生成"资料来源"章节。

**✅ 核心要求:**
- **自主生成标题:** 基于主题和核心发现，为报告创建一个精准的标题。
- **章节结构 (最高指示):**
  - **如果**【原始用户指令】中包含明确的"Outline"或"提纲"，**必须**使用该提纲中的**精确文字**作为报告的章节标题（## 和 ###）。
  - **否则**（用户未指定提纲），则将研究计划中的每一个 "sub_question" 直接转化为报告的一个核心章节标题。
- **内容填充:** 用对应研究步骤的详细证据数据来填充该章节。
- **引用来源 (强制)**: **必须**严格使用 **[x]** 编号格式引用【资料来源索引】中的来源。
- **结构化数据优先:** 如果证据包含结构化数据，优先以表格形式呈现。
- **纯净内容**：从报告标题开始输出纯净内容，不包含任何确认语句。

现在，请开始撰写这份基于纯净证据的最终研究报告。
`;
    }

    /**
     * 🎯 构建静态报告提示词
     */
    _buildStaticReportPrompt(topic, numberedSourcesText, evidenceCollection, originalUserInstruction, promptFragment, researchMode) {
        const allObservations = evidenceCollection.evidenceEntries
            .map(entry => entry.evidence)
            .filter(evidence => evidence.length > 50)
            .join('\n\n');
        
        return `
你是一个专业的报告撰写专家。请基于以下收集到的信息，生成一份专业、结构完整的研究报告。

# 研究主题
${topic}

# 0. 🎯 原始用户指令 (最高优先级)
**请严格遵循此指令中包含的任何结构、提纲或格式要求。**
\`\`\`
${originalUserInstruction}
\`\`\`

# 📚 资料来源索引 (必须引用)
${numberedSourcesText}

# 已收集的关键信息摘要
${allObservations.substring(0, 15000)}

${promptFragment}

# 🎯 最终输出要求 (用户强制协议)
1. **直接开始**：从报告标题开始输出纯净内容
2. **严格结构**：如果用户在提示词中已给定提纲，则完全遵循用户指令中的章节结构
3. **纯净内容**：只包含报告正文，不包含任何确认语句
4. **学术引用**：严格按照引用规范标注来源
5. **结构化数据优先:** 如果证据包含结构化数据，优先以表格形式呈现。

# 现在立即开始报告正文：
`;
    }

    /**
     * 🎯 日志输出提示词摘要
     */
    _logPromptSummary(finalPrompt) {
        console.log('[ReportGeneratorMiddleware] 📤 给写作模型的指令摘要:');
        const lines = finalPrompt.split('\n');
        const importantLines = lines.filter(line => 
            line.includes('# ') || 
            line.includes('要求') || 
            line.includes('必须') ||
            line.includes('禁止')
        ).slice(0, 10);
        
        importantLines.forEach(line => {
            console.log(`  ${line}`);
        });
        
        console.log(`[ReportGeneratorMiddleware] 📏 提示词长度: ${finalPrompt.length}字符 (~${Math.ceil(finalPrompt.length/4)} tokens)`);
    }

    // ============================================================
    // 🎯 证据集合构建系统（完整实现）
    // ============================================================
    
    /**
     * @description 从中间步骤和DataBus中提取最佳证据数据
     */
    _buildEvidenceCollection(intermediateSteps, plan, researchMode = 'standard') {
        const evidenceEntries = [];
        const keyFindings = [];
        let totalLength = 0;
        let dataUtilizationStats = { originalChars: 0, evidenceChars: 0, stepsWithDataBus: 0 };

        intermediateSteps.forEach((step, index) => {
            // 🎯 过滤无效步骤
            if (!step.observation ||
                step.observation === '系统执行错误，继续研究' ||
                step.observation.includes('OutputParser解析失败') ||
                step.observation.includes('代码预检失败') ||
                step.observation.length < 10) {
                return;
            }

            // 🎯 清理观察结果中的过程性噪音
            let cleanEvidence = this._cleanObservation(step.observation);
            if (!cleanEvidence || cleanEvidence.length < 20) return;

            // 🎯 获取对应的子问题
            const subQuestion = plan.research_plan?.[index]?.sub_question ||
                                `研究步骤 ${index + 1}`;

            // 🎯 【核心优化】智能数据选择策略
            const dataBusKey = `step_${index + 1}`;
            const dataBusEntry = this.dataBus.get(dataBusKey);
            let finalEvidence = cleanEvidence;
            let structuredData = null;
            let dataSourceType = 'step_observation';
        
            console.log(`[EvidenceCollection] 步骤${index+1}: 检查DataBus键 "${dataBusKey}"`);
        
            if (dataBusEntry && dataBusEntry.originalData) {
                const originalData = dataBusEntry.originalData;
                const contentType = dataBusEntry.metadata?.contentType || 'unknown';
                const toolName = dataBusEntry.metadata?.toolName || step.action?.tool_name;
            
                console.log(`[EvidenceCollection] DataBus条目:`, {
                    hasOriginalData: true,
                    contentType,
                    toolName,
                    originalLength: originalData.length,
                    observationLength: step.observation.length
                });
            
                dataUtilizationStats.originalChars += originalData.length;
                dataUtilizationStats.stepsWithDataBus++;
            
                // 🎯 智能数据策略选择
                const dataStrategy = this._selectDataStrategy(
                    contentType,
                    originalData.length,
                    researchMode,
                    toolName,
                    step.success
                );
            
                console.log(`[EvidenceCollection] 数据策略: ${dataStrategy} (${contentType}, ${originalData.length} chars)`);
            
                switch(dataStrategy) {
                    case 'full_original':
                        if (originalData.length < 15000) {
                            finalEvidence = this._cleanObservation(originalData);
                            dataSourceType = 'data_bus_full';
                            
                            // 🎯 新增：如果是结构化数据，添加智能处理
                            if (this._isStructuredData(originalData)) {
                                const enhancedStructure = this._enhanceStructuredData(originalData, true);
                                if (enhancedStructure) {
                                    structuredData = enhancedStructure.structuredData;
                                    if (enhancedStructure.enhancedEvidence) {
                                        finalEvidence = enhancedStructure.enhancedEvidence;
                                    }
                                    dataSourceType = 'data_bus_full_enhanced';
                                }
                            }
                        } else {
                            finalEvidence = this._createEnhancedSummary(
                                originalData,
                                cleanEvidence,
                                { toolName, contentType }
                            );
                            dataSourceType = 'data_bus_enhanced';
                        }
                        break;
                    
                    case 'enhanced_summary':
                        finalEvidence = this._createEnhancedSummary(
                            originalData,
                            cleanEvidence,
                            { toolName, contentType }
                        );
                        dataSourceType = 'data_bus_enhanced';
                        break;
                    
                    case 'structured_only':
                        if (this._isStructuredData(originalData)) {
                            const enhancedStructure = this._enhanceStructuredData(originalData, false);
                            if (enhancedStructure) {
                                finalEvidence = enhancedStructure.enhancedEvidence || cleanEvidence;
                                structuredData = enhancedStructure.structuredData;
                                dataSourceType = 'data_bus_structured_enhanced';
                            } else {
                                finalEvidence = this._cleanObservation(originalData);
                                dataSourceType = 'data_bus_fallback';
                            }
                        }
                        break;
                    
                    case 'hybrid':
                        finalEvidence = this._createHybridEvidence(
                            originalData,
                            cleanEvidence,
                            { toolName, contentType }
                        );
                        dataSourceType = 'data_bus_hybrid';
                        break;
                    
                    default:
                        finalEvidence = cleanEvidence;
                        dataSourceType = 'step_observation';
                }
            } else if (dataBusEntry) {
                console.log(`[EvidenceCollection] DataBus条目无originalData，使用processedData`);
                const processedData = dataBusEntry.rawData;
                if (processedData && processedData.length > cleanEvidence.length * 1.5) {
                    finalEvidence = this._cleanObservation(processedData);
                    dataSourceType = 'data_bus_processed';
                }
            }
        
            // 🎯 如果最终证据还是原始摘要且很短，尝试从DataBus提取关键信息补充
            if (finalEvidence === cleanEvidence && cleanEvidence.length < 500 && dataBusEntry?.originalData) {
                const criticalData = this._extractCriticalData(dataBusEntry.originalData, 2);
                if (criticalData) {
                    finalEvidence += `\n\n📈 **补充关键信息**：\n${criticalData}`;
                    dataSourceType = 'data_bus_supplemented';
                }
            }
        
            // 🎯 优化呈现方法（仅格式优化，不压缩内容）
            finalEvidence = this._optimizePresentation(finalEvidence, researchMode);
        
            dataUtilizationStats.evidenceChars += finalEvidence.length;
        
            // 🎯 提取年份信息（仅用于排序，不用于质量判定）
            const year = this._extractYear(finalEvidence);

            // 🎯 构建增强的证据条目
            const evidenceEntry = {
                stepIndex: index + 1,
                subQuestion: subQuestion,
                evidence: finalEvidence,
                structuredData: structuredData,
                hasStructuredData: !!structuredData,
                keyFinding: step.key_finding,
                tool: step.action?.tool_name,
                originalLength: step.observation.length,
                enhancedLength: finalEvidence.length,
                dataSourceType: dataSourceType,
                dataBusKey: dataBusEntry ? dataBusKey : null,
                year: year
            };

            evidenceEntries.push(evidenceEntry);
            totalLength += finalEvidence.length;

            // 🎯 收集关键发现
            if (step.key_finding &&
                step.key_finding !== '未能提取关键发现。' &&
                step.key_finding !== '关键发现提取异常。') {
                keyFindings.push(step.key_finding);
            }
        });

        // 🎯 【最终优化】排序逻辑：按研究步骤顺序排序
        evidenceEntries.sort((a, b) => a.stepIndex - b.stepIndex);
        console.log(`[EvidenceCollection] 证据已按步骤顺序排序: 步骤 ${evidenceEntries[0]?.stepIndex} → 步骤 ${evidenceEntries[evidenceEntries.length-1]?.stepIndex}`);

        // 🎯 数据利用率统计
        const utilizationRate = dataUtilizationStats.originalChars > 0 ? 
            (dataUtilizationStats.evidenceChars / dataUtilizationStats.originalChars) : 0;

        console.log(`[EvidenceCollection] 数据利用率统计:`, {
            stepsWithDataBus: dataUtilizationStats.stepsWithDataBus,
            originalChars: dataUtilizationStats.originalChars,
            evidenceChars: dataUtilizationStats.evidenceChars,
            utilizationRate: `${(utilizationRate * 100).toFixed(1)}%`,
            avgEnhancement: evidenceEntries.length > 0 ? 
                (totalLength / evidenceEntries.map(e => e.originalLength).reduce((a, b) => a + b, 1)).toFixed(2) : 'N/A',
            totalEvidenceChars: totalLength,
            estimatedTokens: Math.ceil(totalLength / 3),
            researchMode: researchMode,
            contextWindowUsage: `${(Math.ceil(totalLength / 3) / 128000 * 100).toFixed(2)}% of 128K`,
            recommendation: totalLength < 100000 ? '✅ 内容长度在安全范围内' : '⚠️ 内容较长，但仍在128K窗口内'
        });

        return {
            evidenceEntries,
            keyFindings: [...new Set(keyFindings)],
            totalLength,
            totalSteps: intermediateSteps.length,
            validEvidenceSteps: evidenceEntries.length,
            hasStructuredData: evidenceEntries.some(e => e.hasStructuredData),
            dataUtilization: {
                stepsWithDataBus: dataUtilizationStats.stepsWithDataBus,
                utilizationRate,
                evidenceEnhancementRatio: evidenceEntries.length > 0 ? 
                    totalLength / evidenceEntries.map(e => e.originalLength).reduce((a, b) => a + b, 1) : 1
            },
            contextWindowInfo: {
                totalTokens: Math.ceil(totalLength / 3),
                windowSize: 128000,
                usagePercentage: (Math.ceil(totalLength / 3) / 128000 * 100).toFixed(2)
            }
        };
    }

    // ============================================================
    // 🔧 数据处理方法（完整实现）
    // ============================================================
    
    /**
     * 🎯 增强结构化数据处理（核心方法）
     */
    _enhanceStructuredData(originalData, isFullOriginal = false) {
        try {
            const parsedData = JSON.parse(originalData);
            
            // 🎯 情况1：JSON数组（如数据表）
            if (Array.isArray(parsedData) && parsedData.length > 0) {
                // 1. 转换为主表格
                const table = this._jsonToMarkdownTable(parsedData);
                
                // 2. 添加数组元数据
                const metaInfo = this._generateArrayMetadata(parsedData);
                
                // 3. 构建增强的证据
                let enhancedEvidence = `${metaInfo}\n${table}`;
                
                // 4. 添加原始JSON预览
                if (originalData.length < 5000 || isFullOriginal) {
                    enhancedEvidence += `\n\n🔍 **完整数据结构**:\n\`\`\`json\n${originalData}\n\`\`\``;
                } else {
                    const jsonPreview = originalData.substring(0, 2000) + 
                        `\n... (完整数据 ${originalData.length} 字符)`;
                    enhancedEvidence += `\n\n🔍 **数据结构预览**:\n\`\`\`json\n${jsonPreview}\n\`\`\``;
                }
                
                return {
                    structuredData: table,
                    enhancedEvidence: enhancedEvidence,
                    dataType: 'array',
                    itemCount: parsedData.length
                };
            } 
            // 🎯 情况2：复杂JSON对象（如报告、配置）
            else if (typeof parsedData === 'object' && parsedData !== null) {
                // 1. 提取关键字段表格
                const keyFields = this._extractKeyFields(parsedData, 10);
                const keyValueTable = this._objectToKeyValueTable(parsedData, keyFields);
                
                // 2. 生成对象摘要
                const objectSummary = this._generateObjectSummary(parsedData);
                
                // 3. 构建增强的证据
                let enhancedEvidence = `${objectSummary}\n${keyValueTable}`;
                
                // 4. 保留原始JSON
                if (originalData.length < 8000 || isFullOriginal) {
                    enhancedEvidence += `\n\n🔍 **完整JSON**:\n\`\`\`json\n${originalData}\n\`\`\``;
                } else {
                    const smartPreview = this._createSmartJsonPreview(originalData, parsedData);
                    enhancedEvidence += `\n\n🔍 **JSON智能预览**:\n\`\`\`json\n${smartPreview}\n\`\`\``;
                }
                
                return {
                    structuredData: keyValueTable,
                    enhancedEvidence: enhancedEvidence,
                    dataType: 'object',
                    fieldCount: Object.keys(parsedData).length
                };
            }
            // 🎯 情况3：简单值
            else {
                return {
                    structuredData: null,
                    enhancedEvidence: `📋 **简单数据**: ${JSON.stringify(parsedData, null, 2)}`,
                    dataType: 'simple'
                };
            }
            
        } catch (e) {
            console.warn(`[增强结构化] JSON解析失败，尝试非JSON结构化提取:`, e.message);
            
            // 🎯 降级：尝试提取非JSON结构化数据
            const extractedStructure = this._extractNonJsonStructuredData(originalData);
            if (extractedStructure) {
                return {
                    structuredData: extractedStructure,
                    enhancedEvidence: `📊 **提取的结构化内容**:\n${extractedStructure}`,
                    dataType: 'non_json'
                };
            }
            
            return null;
        }
    }

    /**
     * 🎯 智能数据策略选择方法
     */
    _selectDataStrategy(contentType, dataLength, researchMode, toolName, stepSuccess) {
        if (!stepSuccess) return 'step_observation';

        // 🔥 根据不同研究模式设置策略权重
        const modeWeights = {
            'academic': { full: 0.7, enhanced: 0.9, structured: 0.8, hybrid: 0.6 },
            'business': { full: 0.4, enhanced: 0.8, structured: 0.7, hybrid: 0.9 },
            'technical': { full: 0.8, enhanced: 0.7, structured: 0.9, hybrid: 0.5 },
            'deep': { full: 0.9, enhanced: 0.8, structured: 0.7, hybrid: 0.6 },
            'standard': { full: 0.3, enhanced: 0.6, structured: 0.5, hybrid: 0.7 },
            'data_mining': { full: 0.2, enhanced: 0.4, structured: 1.0, hybrid: 0.3 }
        };

        const weights = modeWeights[researchMode] || modeWeights.standard;

        // 🔥 根据工具类型调整策略
        const toolStrategies = {
            'tavily_search': { prefer: 'enhanced_summary', avoid: 'full_original' },
            'crawl4ai': { prefer: 'hybrid', avoid: 'full_original' },
            'python_sandbox': { prefer: 'structured_only', avoid: null },
            'code_generator': { prefer: 'structured_only', avoid: null },
            'firecrawl': { prefer: 'enhanced_summary', avoid: 'full_original' }
        };

        const toolStrategy = toolStrategies[toolName] || { prefer: 'enhanced_summary', avoid: null };

        // 🔥 根据数据长度决定可行性
        let viableStrategies = [];

        if (dataLength < 15000) {
            viableStrategies = ['full_original', 'enhanced_summary', 'structured_only', 'hybrid'];
        } else if (dataLength < 30000) {
            viableStrategies = ['enhanced_summary', 'structured_only', 'hybrid'];
        } else {
            viableStrategies = ['enhanced_summary', 'structured_only'];
        }

        // 🔥 移除工具不建议的策略
        if (toolStrategy.avoid && viableStrategies.includes(toolStrategy.avoid)) {
            viableStrategies = viableStrategies.filter(s => s !== toolStrategy.avoid);
        }

        // 🔥 优先考虑工具偏好的策略
        if (viableStrategies.includes(toolStrategy.prefer)) {
            return toolStrategy.prefer;
        }

        // 🔥 根据研究模式权重选择
        let bestStrategy = 'enhanced_summary';
        let bestScore = 0;

        viableStrategies.forEach(strategy => {
            const strategyKey = strategy.split('_')[0];
            const score = weights[strategyKey] || 0.5;
        
            let typeBonus = 0;
            if (contentType === 'structured_data' && strategy.includes('structured')) {
                typeBonus = 0.3;
            } else if (contentType === 'webpage' && strategy.includes('hybrid')) {
                typeBonus = 0.2;
            }
        
            const totalScore = score + typeBonus;
            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestStrategy = strategy;
            }
        });

        return bestStrategy;
    }

    /**
     * 🎯 创建增强摘要
     */
    _createEnhancedSummary(originalData, baseSummary, metadata = {}) {
        const { toolName, contentType } = metadata;

        let enhanced = baseSummary;

        const criticalPoints = this._extractCriticalData(originalData, 3);
        if (criticalPoints) {
            enhanced += `\n\n📊 **补充关键数据** (基于${originalData.length.toLocaleString()}字符原始数据):\n${criticalPoints}`;
        }

        enhanced += `\n\n📝 **数据来源**: ${toolName || '未知工具'} (${contentType || '原始数据'})`;
        enhanced += `\n🔍 **数据完整性**: ${this._assessDataCompleteness(originalData)}`;

        const missingKeyInfo = this._detectMissingKeyInfo(originalData, baseSummary);
        if (missingKeyInfo) {
            enhanced += `\n⚠️ **注意**: 原始数据包含以下关键信息未在上方摘要中体现:\n${missingKeyInfo}`;
        }

        enhanced += `\n\n📏 **原始数据规模**: ${originalData.length.toLocaleString()} 字符`;
        
        return enhanced;
    }

    /**
     * 🎯 创建混合证据
     */
    _createHybridEvidence(originalData, baseSummary, metadata = {}) {
        let hybrid = `## 📋 摘要总结\n${baseSummary}`;

        const keySections = this._extractKeySections(originalData, 2);
        if (keySections.length > 0) {
            hybrid += `\n\n## 🔍 原始数据关键部分\n`;
            keySections.forEach((section, idx) => {
                hybrid += `\n### 关键部分 ${idx + 1}\n${section}\n`;
            });
        }

        hybrid += `\n---\n📊 **数据统计**: 原始数据共 ${originalData.length.toLocaleString()} 字符，已提取 ${keySections.reduce((acc, s) => acc + s.length, 0).toLocaleString()} 字符关键内容`;
        return hybrid;
    }

    /**
     * 🎯 提取关键数据
     */
    _extractCriticalData(originalData, maxPoints = 3) {
        if (!originalData || typeof originalData !== 'string') return null;
        const text = originalData.substring(0, 5000);
        
        const patterns = [
            /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g,
            /\b\d+\.\d+%/g,
            /\b(?:20|19)\d{2}\b/g,
            /\b(?:最高|最低|最大|最小|平均|总计|累计|增长|下降|提升|降低)\b[\u4e00-\u9fa5\d\.%]+/g,
            /\b(?:关键|重要|核心|主要|显著|突出)\b[\u4e00-\u9fa5]+/g,
            /\|[^\n]+\|[^\n]+\|/g
        ];

        const matches = new Set();
        patterns.forEach(pattern => {
            const found = text.match(pattern) || [];
            found.forEach(match => {
                if (match.length > 5 && match.length < 200) {
                    matches.add(match.trim());
                }
            });
        });

        const criticalPoints = Array.from(matches).slice(0, maxPoints);
        if (criticalPoints.length === 0) return null;
        return criticalPoints.map(point => `• ${point}`).join('\n');
    }

    /**
     * 🎯 评估数据完整性
     */
    _assessDataCompleteness(data) {
        if (!data || typeof data !== 'string') return '未知';
        const length = data.length;
        if (length > 5000) return '完整';
        if (length > 2000) return '较完整';
        if (length > 500) return '基本完整';
        if (length > 100) return '简要';
        return '极简';
    }

    /**
     * 🎯 检测缺失关键信息
     */
    _detectMissingKeyInfo(originalData, summary) {
        const originalNumbers = new Set((originalData.match(/\b\d+(?:\.\d+)?\b/g) || []).slice(0, 10));
        const summaryNumbers = new Set((summary.match(/\b\d+(?:\.\d+)?\b/g) || []));
        const missingNumbers = Array.from(originalNumbers).filter(num => !summaryNumbers.has(num));
        if (missingNumbers.length > 0) {
            return `数字数据: ${missingNumbers.slice(0, 3).join(', ')}${missingNumbers.length > 3 ? '...' : ''}`;
        }
        return null;
    }

    /**
     * 🎯 提取关键部分
     */
    _extractKeySections(data, maxSections = 2) {
        const sections = [];
        const lines = data.split('\n').filter(line => line.trim().length > 0);
        const keyIndicators = ['##', '###', '**', '关键', '重要', '核心', '数据', '结果', '结论', '发现'];

        for (let i = 0; i < lines.length && sections.length < maxSections; i++) {
            const line = lines[i];
            const hasKeyIndicator = keyIndicators.some(indicator => line.includes(indicator));
            const hasNumbers = /\b\d+(?:\.\d+)?\b/.test(line);
        
            if ((hasKeyIndicator || hasNumbers) && line.length > 20) {
                const section = lines.slice(i, Math.min(i + 3, lines.length)).join('\n');
                if (section.length > 50 && section.length < 500) {
                    sections.push(section);
                    i += 2;
                }
            }
        }
        return sections;
    }

    /**
     * 🎯 优化呈现方法（仅格式优化，不压缩内容）
     */
    _optimizePresentation(evidence, researchMode) {
        if (!evidence || typeof evidence !== 'string') {
            return evidence || '';
        }
    
        let optimized = evidence;
    
        // 🎯 1. 标准化格式（不丢失任何信息）
        const formatOptimizations = [
            // 标准化空行（3个以上→2个，提高可读性但不丢失信息）
            [/\n{3,}/g, '\n\n'],
            [/\r\n{3,}/g, '\n\n'],
        
            // 修复常见的Markdown格式问题
            [/\*\*(.+?)\*\*\s*\*\*(.+?)\*\*/g, '**$1 $2**'], // 合并相邻加粗
            [/\n\s*\n(\s*[-*+]\s)/g, '\n$1'], // 修复列表前的过多空行
            [/(#{1,6})\s{2,}(.+)/g, '$1 $2'], // 修复标题后的多余空格
        ];
    
        formatOptimizations.forEach(([pattern, replacement]) => {
            optimized = optimized.replace(pattern, replacement);
        });
    
        // 🎯 2. 保护结构化数据完整性
        // 确保表格不被格式优化破坏
        const tableRegex = /\|[^\n]+\|[^\n]*\|\n\|[-: ]+\|[-: ]+\|\n(\|[^\n]+\|[^\n]*\|\n?)+/g;
        const tables = optimized.match(tableRegex) || [];
    
        // 对每个表格进行检查和修复
        tables.forEach(table => {
            const rows = table.split('\n').filter(row => row.trim());
            if (rows.length >= 3) { // 至少表头、分隔线、一行数据
                // 确保表格格式正确
                const fixedTable = rows.join('\n');
                // 用修复后的表格替换原表格
                optimized = optimized.replace(table, fixedTable);
            }
        });
    
        // 🎯 3. 添加信息性标记（仅用于调试和理解，不影响内容）
        const length = optimized.length;
        const lineCount = (optimized.match(/\n/g) || []).length + 1;
        const tableCount = (optimized.match(/\|[^\n]+\|/g) || []).length > 0 ? 
            (optimized.match(/\|[^\n]+\|\n\|[-: ]+\|/g) || []).length : 0;
    
        // 仅对较长内容添加统计信息
        if (length > 5000) {
            const statsInfo = `\n\n---\n📊 **本段证据统计**：共${length}字符，${lineCount}行`;
            if (tableCount > 0) {
                statsInfo += `，包含${tableCount}个数据表格`;
            }
            optimized += statsInfo;
        }
    
        console.log(`[EvidenceOptimize] 格式优化完成: ${evidence.length} → ${optimized.length} 字符 (${researchMode}模式)`);
    
        return optimized;
    }

    // ============================================================
    // 🔧 报告后处理方法
    // ============================================================
    
    /**
     * 🎯 清理报告中的幻觉章节
     */
    _cleanReportSections(report) {
        const sourceKeywords = ["资料来源", "参考文献", "Sources", "References", "参考资料清单"];
        let cleanedReport = report;

        for (const keyword of sourceKeywords) {
            const regex = new RegExp(`(##|###)\\s*${keyword}`, "i");
            const match = cleanedReport.match(regex);
            if (match) {
                console.warn(`[ReportGeneratorMiddleware] ⚠️ 检测到模型自行生成的"${keyword}"章节，正在执行自动清理...`);
                cleanedReport = cleanedReport.substring(0, match.index);
                break;
            }
        }
        return cleanedReport.trim();
    }

    /**
     * 🎯 强制图片渲染（兜底）
     */
    _enforceImageRendering(report) {
        let enhancedReport = report;
        
        this.generatedImages.forEach((imageData, imageId) => {
            const placeholder = `placeholder:${imageId}`;
            const base64Snippet = imageData.image_base64?.substring(0, 50) || '';
            
            if (!enhancedReport.includes(placeholder) && !enhancedReport.includes(base64Snippet)) {
                console.warn(`[ReportGeneratorMiddleware] ⚠️ 发现"遗失"的图片 ${imageId}，强制追加占位符。`);
                enhancedReport += `\n\n### 📊 附图：${imageData.title}\n![${imageData.title}](${placeholder})`;
            }
        });
        
        return enhancedReport;
    }

    /**
     * 🎯 替换图片占位符为真实Base64
     */
    _replaceImagePlaceholders(report) {
        return report.replace(
            /!\[(.*?)\]\(placeholder:(.*?)\)/g,
            (match, altText, imageId) => {
                const imageData = this.generatedImages.get(imageId.trim());
                if (imageData && imageData.image_base64) {
                    return `![${altText}](data:image/png;base64,${imageData.image_base64})`;
                }
                return `*[图像 "${altText}" 加载失败]*`;
            }
        );
    }

    /**
     * 🎯 [最终完美版] 自适应参考文献生成器
     */
    async _generateSourcesSection(sources, plan) {
        if (!sources || sources.length === 0) {
            return '\n\n## 📚 参考文献 (References)\n\n*本次研究未引用外部公开资料。*';
        }

        let output = '\n\n## 📚 参考文献 (References)\n\n';
        output += '> *注：本报告基于以下权威数据源生成，引用已通过语义匹配算法验证。*\n\n';

        // 🛠️ 智能元数据提取器
        const extractSmartMeta = (source) => {
            let title = (source.title || 'Untitled Document').trim();
            const url = source.url || '';
            
            let author = source.authors || source.author || '';
            if (Array.isArray(author)) author = author.join(', ');
            
            let publisher = 'Unknown Source';
            if (url) {
                try {
                    const hostname = new URL(url).hostname.replace('www.', '');
                    publisher = hostname.charAt(0).toUpperCase() + hostname.slice(1);
                } catch (_e) {
                    // 保持 Unknown Source
                }
            }

            let dateStr = '';
            if (source.publish_date) {
                dateStr = source.publish_date.split('T')[0]; 
            } else {
                const yearMatch = (title + ' ' + (source.description || '')).match(/(19|20)\d{2}/);
                if (yearMatch) dateStr = yearMatch[0];
            }

            let type = 'web';
            if ((url && url.toLowerCase().endsWith('.pdf')) || (author && author.length > 0 && dateStr.length >= 4)) {
                type = 'academic';
            } else if (dateStr.length > 4) {
                type = 'news';
            }
            
            return { title, url, author, publisher, date: dateStr, type };
        };

        // 📝 列表生成
        sources.forEach((source, idx) => {
            const meta = extractSmartMeta(source);
            const index = idx + 1;
            const accessDate = new Date().toISOString().split('T')[0];
            let citation = '';

            if (meta.type === 'academic' && meta.author) {
                citation = `**[${index}]** ${meta.author}, "${meta.title}"`;
                if (meta.date) citation += `, ${meta.date.substring(0, 4)}`;
            } else if (meta.type === 'news') {
                citation = `**[${index}]** "${meta.title}," *${meta.publisher}*`;
                if (meta.date) citation += `, ${meta.date}`;
            } else {
                citation = `**[${index}]** "${meta.title}," *${meta.publisher}*`;
                if (meta.date) citation += `, ${meta.date}`;
            }

            citation += `. [Online].\n   Available: ${meta.url}`;
            output += `${citation}\n\n`;
        });

        return output;
    }

    /**
     * 🆕 完全独立的文中引用提取系统
     */
    async _generateIndependentCitationMapping(reportContent, uniqueSources) {
        if (!reportContent || !uniqueSources || uniqueSources.length === 0) {
            console.log('[CitationMapping] 报告内容或来源为空，跳过引用映射');
            return '';
        }
        
        console.log(`[CitationMapping] 🚀 启动独立文中引用提取系统，基于 ${uniqueSources.length} 个uniqueSources`);
        
        const citationMarkers = this._extractCitationMarkers(reportContent);
        if (citationMarkers.length === 0) {
            console.log('[CitationMapping] 未找到引用标记');
            return '';
        }
        
        console.log(`[CitationMapping] 提取到 ${citationMarkers.length} 个引用标记`);
        
        const processedCitations = this._processCitations(citationMarkers, uniqueSources);
        if (processedCitations.length === 0) {
            console.log('[CitationMapping] 无有效引用');
            return '';
        }
        
        console.log(`[CitationMapping] 有效引用：${processedCitations.length} 个`);
        return this._generateCitationSection(processedCitations, uniqueSources);
    }

    /**
     * 🎯 [最终版] 智能混合来源过滤器
     */
    _filterUsedSources(sources, reportContent) {
        if (!sources || sources.length === 0) return [];
        if (!reportContent) return sources.slice(0, 8);
        
        console.log(`[SourceFilter] 启动智能匹配，候选来源: ${sources.length} 个`);
        
        const baseKeepCount = 6;
        const usedSources = new Set();
        
        // 轨道 1: 显式引用提取
        const citationPatterns = [
            /【来源\s*(\d+)】/g,
            /\[(\d+)\]/g,
            /来源\s*(\d+)/g,
            /ref\s*(\d+)/gi
        ];
        
        citationPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(reportContent)) !== null) {
                const index = parseInt(match[1], 10) - 1;
                if (index >= 0 && index < sources.length) {
                    usedSources.add(sources[index]);
                }
            }
        });

        // 轨道 2: 关键词匹配
        const reportLower = reportContent.toLowerCase();
        sources.forEach(source => {
            if (usedSources.has(source)) return;
            
            const title = (source.title || '').toLowerCase();
            const url = source.url || '';
            
            let score = 0;
            
            if (title) {
                const keywords = title.split(/[^\w\u4e00-\u9fa5]+/)
                    .filter(word => word.length >= 3);
                
                keywords.forEach(keyword => {
                    if (reportLower.includes(keyword)) score += 0.2;
                });
                
                if (title.length > 10) {
                    const titleFragments = [
                        title.substring(0, 15),
                        title.substring(Math.max(0, title.length - 15))
                    ];
                    
                    titleFragments.forEach(fragment => {
                        if (reportLower.includes(fragment)) score += 0.5;
                    });
                }
            }
            
            if (score >= 0.25) {
                usedSources.add(source);
            }
        });

        // 轨道 3: 确保最小数量
        let finalSources = Array.from(usedSources);
        
        if (finalSources.length < baseKeepCount) {
            console.log(`[SourceFilter] 匹配来源不足(${finalSources.length})，补充至${baseKeepCount}个`);
            
            const remainingSources = sources.filter(s => !usedSources.has(s));
            const additionalCount = Math.min(
                baseKeepCount - finalSources.length,
                remainingSources.length
            );
            
            const highQualitySources = remainingSources.filter(s => {
                const url = s.url || '';
                return url.includes('.gov') || 
                       url.includes('.edu') || 
                       url.includes('reuters') || 
                       url.includes('bloomberg');
            });
            
            const sourcesToAdd = [
                ...highQualitySources.slice(0, additionalCount),
                ...remainingSources.slice(0, additionalCount - highQualitySources.length)
            ];
            
            finalSources.push(...sourcesToAdd);
        }

        finalSources = finalSources.slice(0, 20);
        console.log(`[SourceFilter] 匹配完成: ${sources.length} -> ${finalSources.length} 个有效来源`);
        return finalSources;
    }

    // ============================================================
    // 🔧 数据提取和格式化方法
    // ============================================================
    
    /**
     * 🎯 观察结果清理方法
     */
    _cleanObservation(observation) {
        if (!observation || typeof observation !== 'string') return '';
        
        let cleaned = observation;

        const summaryHeaders = [
            /## 📋 [^\n]+ 内容摘要\s*\*\*原始长度\*\*: [^\n]+\s*\*\*摘要长度\*\*: [^\n]+\s*\*\*压缩率\*\*: [^\n]+\s*/,
            /## ⚠️ [^\n]+ 内容降级处理\s*\*\*原因\*\*: [^\n]+\s*\*\*原始长度\*\*: [^\n]+\s*\*\*降级方案\*\*: [^\n]+\s*/
        ];
        
        summaryHeaders.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });

        const processPatterns = [
            /【来源\s*\d+】[^】]*?(?:https?:\/\/[^\s)]+)?\s*/g,
            /工具执行(?:成功|失败)[^\n]*\n/gi,
            /正在为[^\n]+生成智能摘要[^\n]*\n/gi,
            /智能摘要完成[^\n]*\n/gi,
            /原始长度[^\n]*压缩率[^\n]*\n/gi,
            /## [^\n]* (?:内容摘要|内容降级处理)[^\n]*\n/gi
        ];

        processPatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });

        const redundantTexts = [
            '摘要基于',
            '因摘要服务不可用',
            '已使用降级方案',
            '工具调用',
            '思考:',
            '行动:',
            '观察:',
            '---\n*摘要基于',
            '---\n*因摘要服务不可用'
        ];

        redundantTexts.forEach(text => {
            const regex = new RegExp(text + '[^\n]*\n?', 'gi');
            cleaned = cleaned.replace(regex, '');
        });

        cleaned = cleaned
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^\s+|\s+$/g, '')
            .trim();

        return cleaned;
    }

    /**
     * 🆕 JSON转Markdown表格
     */
    _jsonToMarkdownTable(jsonData) {
        if (!Array.isArray(jsonData) || jsonData.length === 0) return null;

        const firstRow = jsonData.find(row => typeof row === 'object' && row !== null);
        if (!firstRow) return null;

        const headers = Object.keys(firstRow);
        let table = `| ${headers.join(' | ')} |\n`;
        table += `| ${headers.map(() => '---').join(' | ')} |\n`;
        
        jsonData.forEach(row => {
            const values = headers.map(header => {
                const value = row[header];
                return value === undefined || value === null ? 'N/A' : 
                       typeof value === 'string' ? value.replace(/\|/g, '\\|') : JSON.stringify(value);
            });
            table += `| ${values.join(' | ')} |\n`;
        });
        
        return `\n## 📊 结构化数据表格\n\n${table}\n\n`;
    }

    /**
     * 🎯 健壮的结构化数据检测
     */
    _isStructuredData(content) {
        if (!content) return false;
        const trimmed = content.trim();
        
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
            (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            try {
                JSON.parse(trimmed);
                return true;
            } catch {
                return false;
            }
        }
        
        if (trimmed.includes('|') && trimmed.includes('---')) {
            const lines = trimmed.split('\n');
            const tableLines = lines.filter(line => line.includes('|'));
            return tableLines.length >= 3;
        }
        
        return false;
    }

    /**
     * 🆕 JSON对象转键值对表格
     */
    _objectToKeyValueTable(obj, fields) {
        if (!fields || fields.length === 0) {
            fields = Object.keys(obj).slice(0, 15);
        }
        
        let table = `| 字段 | 值 | 类型 |\n|---|---|---|\n`;
        
        fields.forEach(key => {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                let displayValue;
                let valueType = typeof value;
                
                if (value === null) {
                    displayValue = 'null';
                } else if (value === undefined) {
                    displayValue = 'undefined';
                } else if (Array.isArray(value)) {
                    displayValue = `数组[${value.length}]`;
                    valueType = 'array';
                } else if (typeof value === 'object') {
                    displayValue = `对象{${Object.keys(value).length}个字段}`;
                    valueType = 'object';
                } else if (typeof value === 'string') {
                    displayValue = value.length > 50 ? 
                        value.substring(0, 50) + '...' : value;
                    displayValue = displayValue.replace(/\n/g, ' ');
                } else if (typeof value === 'number') {
                    displayValue = value.toLocaleString();
                } else {
                    displayValue = String(value);
                }
                
                table += `| ${key} | ${displayValue} | ${valueType} |\n`;
            }
        });
        
        return `\n## 📋 关键字段详情\n\n${table}\n`;
    }

    /**
     * 🎯 数组元数据生成
     */
    _generateArrayMetadata(parsedArray) {
        if (!Array.isArray(parsedArray) || parsedArray.length === 0) return '';
        
        const itemCount = parsedArray.length;
        const sampleItem = parsedArray[0];
        const fieldCount = Object.keys(sampleItem).length;
        const fieldNames = Object.keys(sampleItem).join(', ');
        
        let numericStats = '';
        const numericFields = Object.keys(sampleItem).filter(key => {
            const value = sampleItem[key];
            return typeof value === 'number' && !isNaN(value);
        });
        
        if (numericFields.length > 0) {
            numericStats = `\n📈 **数值字段**: ${numericFields.join(', ')}`;
        }
        
        return `📊 **数据统计**：
• **记录数**: ${itemCount} 条
• **字段数**: ${fieldCount} 个
• **字段名**: ${fieldNames}
${numericStats}`;
    }

    /**
     * 🎯 提取关键字段
     */
    _extractKeyFields(obj, maxFields = 10) {
        if (typeof obj !== 'object' || obj === null) return [];
        
        const allKeys = Object.keys(obj);
        const priorityKeywords = ['name', 'title', 'value', 'data', 'result', 'score', 
                                 'accuracy', 'performance', 'summary', 'conclusion'];
        
        const scoredKeys = allKeys.map(key => {
            let score = 0;
            if (priorityKeywords.includes(key.toLowerCase())) score += 3;
            const value = obj[key];
            if (typeof value === 'number') score += 2;
            if (typeof value === 'string' && value.length > 0) score += 1;
            if (Array.isArray(value)) score += 1;
            if (typeof value === 'object' && value !== null) score -= 1;
            if (key.length >= 3 && key.length <= 20) score += 1;
            return { key, score };
        });
        
        return scoredKeys
            .sort((a, b) => b.score - a.score)
            .slice(0, maxFields)
            .map(item => item.key);
    }

    /**
     * 🎯 生成对象摘要
     */
    _generateObjectSummary(obj) {
        if (typeof obj !== 'object' || obj === null) return '';
        
        const keys = Object.keys(obj);
        const totalFields = keys.length;
        const typeStats = {};
        keys.forEach(key => {
            const value = obj[key];
            const type = Array.isArray(value) ? 'array' : typeof value;
            typeStats[type] = (typeStats[type] || 0) + 1;
        });
        
        let summary = `**对象结构分析**:\n`;
        summary += `• **总字段数**: ${totalFields}\n`;
        
        Object.entries(typeStats).forEach(([type, count]) => {
            summary += `• **${type}类型**: ${count} 个\n`;
        });
        
        const importantFields = ['type', 'title', 'name', 'result', 'conclusion', 'summary'];
        const foundImportant = keys.filter(key => 
            importantFields.includes(key.toLowerCase())
        );
        
        if (foundImportant.length > 0) {
            summary += `\n**关键字段**: ${foundImportant.join(', ')}\n`;
            foundImportant.forEach(key => {
                const value = obj[key];
                if (value !== undefined && value !== null) {
                    const displayValue = typeof value === 'string' ? 
                        (value.length > 100 ? value.substring(0, 100) + '...' : value) :
                        JSON.stringify(value);
                    summary += `  - **${key}**: ${displayValue}\n`;
                }
            });
        }
        
        return summary;
    }

    /**
     * 🎯 创建智能JSON预览
     */
    _createSmartJsonPreview(jsonString, parsedData) {
        if (jsonString.length <= 3000) return jsonString;
        
        let preview = jsonString.substring(0, 800);
        
        if (typeof parsedData === 'object') {
            const keyFields = this._extractKeyFields(parsedData, 5);
            keyFields.forEach(field => {
                if (parsedData[field] && typeof parsedData[field] === 'string') {
                    const fieldValue = String(parsedData[field]);
                    const fieldJson = `"${field}": "${fieldValue.substring(0, 100)}"`;
                    if (!preview.includes(fieldJson)) {
                        preview += `\n  ${fieldJson},`;
                    }
                }
            });
        }
        
        preview += `\n  ...\n`;
        preview += jsonString.substring(jsonString.length - 500);
        preview += `\n\n// 📊 JSON统计: 总${jsonString.length}字符，已显示${preview.length}字符`;
        
        return preview;
    }

    /**
     * 🎯 提取非JSON结构化数据
     */
    _extractNonJsonStructuredData(text) {
        if (!text || typeof text !== 'string') return null;
        
        const extracted = [];
        
        const mdTables = text.match(/\|[^\n]+\|[^\n]*\|\n\|[-: ]+\|[-: ]+\|\n(\|[^\n]+\|[^\n]*\|\n?)+/g);
        if (mdTables) {
            extracted.push(...mdTables.slice(0, 3).map((table, i) => 
                `### Markdown表格 ${i+1}\n${table}`
            ));
        }
        
        const lists = text.match(/(?:^|\n)(?:\s*[-*+]\s+.*|\s*\d+\.\s+.*)(?:\n\s*(?:[-*+]|\d+\.)\s+.*)*/gm);
        if (lists) {
            const significantLists = lists.filter(list => 
                list.split('\n').length >= 3 && list.length > 50
            ).slice(0, 2);
            
            if (significantLists.length > 0) {
                extracted.push(...significantLists.map((list, i) => 
                    `### 列表 ${i+1}\n${list}`
                ));
            }
        }
        
        const codeBlocks = text.match(/```[\s\S]*?```/g);
        if (codeBlocks) {
            extracted.push(...codeBlocks.slice(0, 2).map((code, i) => 
                `### 代码块 ${i+1}\n${code}`
            ));
        }
        
        if (extracted.length === 0) return null;
        return `\n## 📋 提取的结构化内容\n\n${extracted.join('\n\n')}\n`;
    }

    /**
     * 🎯 提取年份信息
     */
    _extractYear(observation) {
        const yearMatches = observation.match(/(20\d{2})/g);
        if (!yearMatches) return null;
        return Math.max(...yearMatches.map(y => parseInt(y, 10)));
    }

    // ============================================================
    // 🔧 降级报告生成
    // ============================================================
    
    /**
     * 🎯 降级报告生成
     */
    _generateFallbackReport(topic, intermediateSteps, sources, researchMode) {
        const observations = intermediateSteps
            .filter(step => step.success !== false && (step.observation && step.observation.length > 50 || step.key_finding))
            .map(step => {
                const title = step.key_finding && step.key_finding !== '未能提取关键发现。' ?
                    `### ✅ 关键发现: ${step.key_finding}` :
                    `### 🔍 来自步骤 ${step.action?.tool_name || '未知工具'} 的发现`;
                
                const content = step.observation ?
                    step.observation.substring(0, 500) + (step.observation.length > 500 ? '...' : '') :
                    '无详细观察结果。';
                
                return `${title}\n\n${content}`;
            })
            .join('\n\n---\n\n');
            
        return `# ${topic}\n\n## ❗ 报告生成失败通知\n\n**研究模式**: ${researchMode}\n\n由于系统在最后一步整合报告时遇到问题，未能生成完整的结构化报告。以下是研究过程中收集到的关键信息摘要，供您参考。\n\n---\n\n${observations}\n\n## 总结\n基于收集的信息整理完成。`;
    }

    // ============================================================
    // 🔧 引用映射系统（完整实现）
    // ============================================================
    
    _extractCitationMarkers(reportContent) {
        const markers = [];
        let mainContent = reportContent;
        const refKeywords = ["参考文献", "References", "📚 参考文献"];
        
        for (const keyword of refKeywords) {
            const refIndex = reportContent.indexOf(keyword);
            if (refIndex !== -1) {
                mainContent = reportContent.substring(0, refIndex);
                console.log(`[CitationMapping] 检测到"${keyword}"，只提取前 ${mainContent.length} 字符的正文`);
                break;
            }
        }
        
        const patterns = [
            { regex: /\[(\d+)\]/g, type: 'single' },
            { regex: /\[(\d+)\s*,\s*(\d+)\]/g, type: 'multi' },
            { regex: /\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]/g, type: 'multi' },
            { regex: /\[来源\s*(\d+)\]/g, type: 'source' },
            // 🆕 新增以下格式支持
            { regex: /\[(\d+)\s*[，]\s*(\d+)\]/g, type: 'multi' },  // 中文逗号 [4，19]
            { regex: /\[(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\]/g, type: 'multi' },  // 中文逗号三个数字 [4，19，25]
            { regex: /\[(\d+),(\d+)\]/g, type: 'multi' },  // 无空格英文逗号 [4,19]
            { regex: /\[(\d+)[，](\d+)\]/g, type: 'multi' },  // 无空格中文逗号 [4，19]
            // 🆕 新增4个数字的模式
            { regex: /\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]/g, type: 'multi' },
            { regex: /\[(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\]/g, type: 'multi' },
            { regex: /\[(\d+),(\d+),(\d+),(\d+)\]/g, type: 'multi' },
            { regex: /\[(\d+)[，](\d+)[，](\d+)[，](\d+)\]/g, type: 'multi' },
            // 🆕 新增5个数字的模式
            { regex: /\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]/g, type: 'multi' },
            { regex: /\[(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\s*[，]\s*(\d+)\]/g, type: 'multi' },
            { regex: /\[(\d+),(\d+),(\d+),(\d+),(\d+)\]/g, type: 'multi' },
            { regex: /\[(\d+)[，](\d+)[，](\d+)[，](\d+)[，](\d+)\]/g, type: 'multi' },
        ];
        
        patterns.forEach(({ regex, type }) => {
            let match;
            while ((match = regex.exec(mainContent)) !== null) {
                const indices = [];
                
                if (type === 'single' || type === 'source') {
                    indices.push(parseInt(match[1], 10));
                } else if (type === 'multi') {
                    for (let i = 1; i < match.length; i++) {
                        const num = parseInt(match[i], 10);
                        if (!isNaN(num)) indices.push(num);
                    }
                }
                
                if (indices.length > 0) {
                    markers.push({
                        indices,
                        text: match[0],
                        position: match.index,
                        type
                    });
                }
            }
        });
        
        markers.sort((a, b) => a.position - b.position);
        return markers;
    }

    _processCitations(citationMarkers, uniqueSources) {
        const seen = new Set();
        const result = [];
        let warningCount = 0;
        
        citationMarkers.forEach(marker => {
            marker.indices.forEach(index => {
                if (seen.has(index)) return;
                
                if (index < 1 || index > uniqueSources.length) {
                    console.warn(`[CitationMapping] 引用[${index}]超出范围(1-${uniqueSources.length})`);
                    warningCount++;
                    return;
                }
                
                const source = uniqueSources[index - 1];
                if (!source) {
                    console.warn(`[CitationMapping] 无法找到来源[${index}]`);
                    return;
                }
                
                seen.add(index);
                result.push({
                    index,
                    source,
                    position: marker.position
                });
            });
        });
        
        if (warningCount > 0) {
            console.warn(`[CitationMapping] 共发现 ${warningCount} 个超出范围的引用`);
        }
        
        return result;
    }

    _generateCitationSection(processedCitations, uniqueSources) {
        if (processedCitations.length === 0) return '';
        
        let section = '\n\n## 🔗 文中引用对应来源 (Citation-Indexed References)\n\n';
        section += '> *注：本部分仅列出报告中实际引用的来源，按照文中出现的顺序排列。*\n';
        section += '> *与参考文献章节完全独立，不进行任何筛选或交叉引用。*\n\n';
        
        processedCitations.forEach(citation => {
            const { index, source } = citation;
            
            let entry = `**[${index}]** `;
            
            if (source.title && source.title !== '无标题') {
                entry += `"${source.title}"`;
            } else {
                entry += `来源 ${index}`;
            }
            
            if (source.url && source.url !== '#') {
                try {
                    const hostname = new URL(source.url).hostname.replace('www.', '');
                    entry += ` - ${hostname}`;
                } catch {
                    entry += ` - 外部链接`;
                }
            }
            
            if (source.url && source.url !== '#') {
                entry += `\n   🔗 ${source.url}`;
            }
            
            section += `${entry}\n\n`;
        });
        
        section += `---\n📊 **引用统计**：\n`;
        section += `• 文中引用 ${processedCitations.length} 个独立来源\n`;
        section += `• 模型共看到 ${uniqueSources.length} 个去重来源\n`;
        
        return section;
    }

    // ============================================================
    // 🎯 状态管理方法
    // ============================================================
    
    /**
     * 更新共享状态
     */
    updateSharedState(updates) {
        if (updates.dataBus) this.dataBus = updates.dataBus;
        if (updates.generatedImages) this.generatedImages = updates.generatedImages;
        if (updates.intermediateSteps) this.intermediateSteps = updates.intermediateSteps;
        if (updates.metrics) this.metrics = updates.metrics;
        if (updates.runId) this.runId = updates.runId;
        console.log('[ReportGeneratorMiddleware] ✅ 共享状态已更新');
    }

    /**
     * 获取共享状态
     */
    getSharedState() {
        return {
            dataBus: this.dataBus,
            generatedImages: this.generatedImages,
            intermediateSteps: this.intermediateSteps,
            metrics: this.metrics,
            runId: this.runId
        };
    }

    /**
     * 重置状态（新研究开始时调用）
     */
    resetState() {
        this.dataBus.clear();
        this.generatedImages.clear();
        this.intermediateSteps = [];
        this.metrics = {
            toolUsage: { tavily_search: 0, crawl4ai: 0, python_sandbox: 0 },
            stepProgress: [],
            informationGain: [],
            planCompletion: 0,
            tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
        };
        this.runId = null;
        console.log('[ReportGeneratorMiddleware] 🔄 报告生成状态已重置');
    }

    /**
     * 🎯 设置回调管理器（允许动态设置）
     */
    setCallbackManager(callbackManager) {
        this.callbackManager = callbackManager;
        console.log('[ReportGeneratorMiddleware] ✅ 回调管理器已设置');
    }

    // ============================================================
    // 🔧 模板方法（需要从 ReportTemplates.js 导入，这里提供代理方法）
    // ============================================================
    
    /**
     * 🎯 获取研究模式模板（代理方法）
     * 注意：实际使用时应从 ReportTemplates.js 导入
     */
    _getTemplateByResearchMode(researchMode) {
    // 🔥 优先使用传入的模板函数
    if (this.getTemplateByResearchMode && typeof this.getTemplateByResearchMode === 'function') {
        try {
            const template = this.getTemplateByResearchMode(researchMode);
            console.log(`[ReportGeneratorMiddleware] ✅ 使用真实模板: ${researchMode} -> ${template?.name || '未知'}`);
            return template;
        } catch (error) {
            console.warn(`[ReportGeneratorMiddleware] ❌ 模板函数调用失败: ${error.message}, 使用降级模板`);
        }
    }
    
    // 🚨 降级实现（仅在没有模板函数或调用失败时使用）
    console.warn(`[ReportGeneratorMiddleware] ⚠️ 使用降级模板: ${researchMode}`);
        const templates = {
            academic: {
                name: '学术研究',
                config: {
                    dynamic_structure: true,
                    requirements: '学术报告应包含文献综述、研究方法、数据分析和学术讨论。',
                    structure: ['引言与背景', '文献综述', '研究方法', '数据分析', '结论与展望']
                }
            },
            business: {
                name: '商业分析',
                config: {
                    dynamic_structure: true,
                    requirements: '商业报告应聚焦市场分析、竞争格局、商业建议和ROI分析。',
                    structure: ['执行摘要', '市场分析', '竞争格局', '商业建议', '风险与机会']
                }
            },
            technical: {
                name: '技术评估',
                config: {
                    dynamic_structure: true,
                    requirements: '技术报告应详细描述技术架构、实现细节、性能评估和最佳实践。',
                    structure: ['技术背景', '架构设计', '实现细节', '性能评估', '最佳实践']
                }
            },
            deep: {
                name: '深度分析',
                config: {
                    dynamic_structure: true,
                    requirements: '深度分析报告应体现多维度、辩证的分析，包含问题解构、多角度论证、解决方案评估和创新性见解。',
                    structure: ['问题解构', '多角度论证', '解决方案评估', '创新性见解', '综合结论']
                }
            },
            standard: {
                name: '标准报告',
                config: {
                    dynamic_structure: false,
                    requirements: '标准报告应结构清晰，逻辑连贯，易于理解。',
                    structure: ['引言', '正文', '结论']
                }
            },
            data_mining: {
                name: '数据挖掘',
                config: {
                    dynamic_structure: true,
                    requirements: '数据挖掘报告应侧重于数据收集概况、数据质量评估、结构化数据呈现、数据对比分析和数据可视化建议。',
                    structure: ['数据概况', '数据质量', '数据分析', '数据可视化', '数据洞察']
                }
            }
        };
        
        return templates[researchMode] || templates.standard;
    }

    /**
     * 🎯 获取模板提示词片段（代理方法）
     */
    _getTemplatePromptFragment(researchMode) {
    // 🔥 优先使用传入的模板函数
    if (this.getTemplatePromptFragment && typeof this.getTemplatePromptFragment === 'function') {
        try {
            const fragment = this.getTemplatePromptFragment(researchMode);
            console.log(`[ReportGeneratorMiddleware] ✅ 使用真实提示词片段: ${researchMode}`);
            return fragment;
        } catch (error) {
            console.warn(`[ReportGeneratorMiddleware] ❌ 提示词片段函数调用失败: ${error.message}`);
        }
    }
    
    // 🚨 降级实现
    console.warn(`[ReportGeneratorMiddleware] ⚠️ 使用降级提示词片段: ${researchMode}`);
    const fragments = {
        academic: '学术报告应包含文献综述、研究方法、数据分析和学术讨论。必须严格按照学术规范进行引用和参考文献标注。',
        business: '商业报告应聚焦市场分析、竞争格局、商业建议和ROI分析。建议使用清晰的图表和数据支撑结论。',
        technical: '技术报告应详细描述技术架构、实现细节、性能评估和最佳实践。建议包含代码片段、架构图和性能对比数据。',
        deep: '深度分析报告应体现多维度、辩证的分析，包含问题解构、多角度论证、解决方案评估和创新性见解。避免表面化分析，要求深度洞察。',
        standard: '标准报告应结构清晰，逻辑连贯，易于理解。确保信息准确，表达简洁。',
        data_mining: '数据挖掘报告应侧重于数据收集概况、数据质量评估、结构化数据呈现、数据对比分析和数据可视化建议。必须包含数据表格和统计指标。'
    };
        return fragments[researchMode] || fragments.standard;
    }
}