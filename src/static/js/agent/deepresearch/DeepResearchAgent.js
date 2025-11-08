// src/static/js/agent/core/DeepResearchAgent.js

/**
 * @class DeepResearchAgent
 * @description 专用深度研究Agent，专注于复杂研究任务，包含智能上下文压缩和优化策略
 */
import { ContextCompressor } from '../utils/ContextCompressor.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler; // 🎯 修复：使用chatApiHandler而非agentLogic
        this.tools = tools;
        this.callbackManager = callbackManager;
        
        // 🎯 专用研究配置
        this.maxIterations = config.maxIterations || 8;
        this.maxThinkTimeout = config.maxThinkTimeout || 90000;
        this.researchConfig = config.researchConfig || {
            enableCompression: true,
            maxSources: 12,
            analysisDepth: 'comprehensive',
            language: 'zh-CN',
            enableCrossValidation: true
        };
        
        // 🎯 研究专用组件
        this.contextCompressor = new ContextCompressor();
        this.researchState = {
            phase: 'initializing',
            sources: [],
            keyFindings: [],
            currentFocus: '',
            compressionHistory: []
        };
        
        // 🎯 会话状态管理
        this.currentSession = {
            steps: [],
            startTime: null,
            endTime: null,
            sessionId: null,
            researchFocus: ''
        };
        
        console.log(`[DeepResearchAgent] 专用研究Agent初始化完成，工具: ${Object.keys(tools).join(', ')}`);
    }

    /**
     * 🎯 专用研究入口方法 - 与Orchestrator完全匹配
     */
    async conductResearch(researchRequest) {
        const { topic, requirements, language, depth, focus, availableTools } = researchRequest;
        
        const runId = this.callbackManager.generateRunId();
        
        // 🎯 初始化研究状态
        this._initializeResearchState(topic, focus, depth);
        this.currentSession = {
            steps: [],
            startTime: Date.now(),
            endTime: null,
            sessionId: runId,
            researchFocus: focus || this._extractResearchFocus(topic)
        };

        console.log(`[DeepResearchAgent] 开始深度研究: "${topic.substring(0, 100)}..."`);

        // 🎯 研究开始事件
        window.dispatchEvent(new CustomEvent('agent:session_started', {
            detail: {
                sessionId: runId,
                userMessage: topic,
                maxIterations: this.maxIterations,
                agentType: 'deep_research',
                researchFocus: this.currentSession.researchFocus
            }
        }));

        await this.callbackManager.invokeEvent('on_research_start', {
            name: 'deep_research',
            run_id: runId,
            data: {
                topic: topic,
                requirements: requirements,
                researchConfig: this.researchConfig
            }
        });

        const intermediateSteps = [];
        let finalAnswer = null;
        let iteration = 0;
        let consecutiveErrors = 0;

        // 🎯 专用研究循环
        for (iteration = 0; iteration < this.maxIterations; iteration++) {
            console.log(`[DeepResearchAgent] 研究迭代 ${iteration + 1}/${this.maxIterations}`);
            
            // 🎯 更新研究阶段
            this._updateResearchPhase(iteration, intermediateSteps);
            
            window.dispatchEvent(new CustomEvent('agent:iteration_update', {
                detail: { 
                    iteration: iteration + 1, 
                    total: this.maxIterations,
                    thinking: `研究阶段: ${this.researchState.phase}`,
                    agentType: 'deep_research'
                }
            }));

            await this.callbackManager.invokeEvent('on_research_phase_changed', {
                name: 'research_phase',
                run_id: runId,
                data: {
                    phase: this.researchState.phase,
                    iteration: iteration + 1,
                    sourcesCount: this.researchState.sources.length
                }
            });

            // 🎯 安全检查
            if (consecutiveErrors >= 3) {
                finalAnswer = this._handleResearchErrors(intermediateSteps, consecutiveErrors);
                break;
            }

            try {
                // 🎯 动态思考超时
                const thinkTimeout = this._getResearchThinkTimeout(iteration, consecutiveErrors);
                
                // 🎯 构建研究专用提示词
                const researchPrompt = this._constructResearchPrompt(
                    topic, 
                    intermediateSteps, 
                    this.researchState
                );

                // 🎯 思考过程
                window.dispatchEvent(new CustomEvent('agent:thinking', {
                    detail: { 
                        content: `深度分析中... (${this.researchState.phase})`,
                        type: 'research_analysis',
                        agentType: 'deep_research'
                    }
                }));

                const action = await this._researchThink(
                    researchPrompt, 
                    thinkTimeout, 
                    runId
                );

                consecutiveErrors = 0; // 重置错误计数

                // 🎯 处理思考结果
                if (action.type === 'final_answer') {
                    finalAnswer = this._formatFinalAnswer(action.answer, intermediateSteps);
                    break;
                }

                if (action.type === 'tool_call') {
                    // 🎯 执行研究工具
                    const observation = await this._executeResearchAction(action, runId, thinkTimeout);
                    
                    // 🎯 处理观察结果 - 研究专用
                    this._processResearchObservation(observation, action);
                    
                    intermediateSteps.push({ action, observation });

                    // 🎯 检查是否满足研究完成条件
                    if (this._shouldCompleteResearch(intermediateSteps)) {
                        finalAnswer = this._synthesizeResearchReport(intermediateSteps, topic);
                        break;
                    }
                }

                // 🎯 应用上下文压缩（如果启用）
                if (this.researchConfig.enableCompression && intermediateSteps.length > 2) {
                    await this._compressResearchContext(intermediateSteps);
                }

            } catch (error) {
                consecutiveErrors++;
                console.error(`[DeepResearchAgent] 研究迭代 ${iteration + 1} 失败:`, error);
                
                await this.callbackManager.invokeEvent('on_research_error', {
                    name: 'research_iteration',
                    run_id: runId,
                    data: {
                        iteration: iteration + 1,
                        error: error.message,
                        consecutiveErrors: consecutiveErrors
                    }
                });

                if (consecutiveErrors >= 3) {
                    finalAnswer = this._handleResearchErrors(intermediateSteps, consecutiveErrors);
                    break;
                }
            }

            // 🎯 研究进度事件
            await this.callbackManager.invokeEvent('on_research_progress', {
                name: 'research_progress',
                run_id: runId,
                data: {
                    iteration: iteration + 1,
                    sourcesCount: this.researchState.sources.length,
                    keyFindings: this.researchState.keyFindings.length,
                    phase: this.researchState.phase
                }
            });
        }

        // 🎯 处理循环结束
        if (!finalAnswer) {
            if (iteration >= this.maxIterations) {
                finalAnswer = this._handleMaxResearchIterations(intermediateSteps);
            } else {
                finalAnswer = "研究过程意外结束";
            }
        }

        // 🎯 完成研究
        this.currentSession.endTime = Date.now();
        const researchDuration = this.currentSession.endTime - this.currentSession.startTime;

        const finalResult = {
            success: !!finalAnswer,
            report: finalAnswer, // 🎯 使用report字段与Orchestrator匹配
            intermediateSteps,
            researchState: { ...this.researchState },
            sessionId: runId,
            type: 'deep_research',
            iterations: iteration + 1,
            duration: researchDuration,
            sourcesCount: this.researchState.sources.length,
            keyFindingsCount: this.researchState.keyFindings.length
        };

        // 🎯 研究完成事件
        window.dispatchEvent(new CustomEvent('agent:session_completed', {
            detail: { 
                result: finalResult,
                sessionId: runId,
                duration: researchDuration,
                agentType: 'deep_research'
            }
        }));

        await this.callbackManager.invokeEvent('on_research_end', {
            name: 'deep_research',
            run_id: runId,
            data: finalResult
        });

        return finalResult;
    }

    /**
     * 🎯 研究专用思考方法
     */
    async _researchThink(prompt, timeout, runId) {
        const thinkPromise = this.chatApiHandler.completeChat({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-4', // 🎯 研究任务使用更强的模型
            temperature: 0.2,
            max_tokens: 1500
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`研究思考超时 (${timeout}ms)`)), timeout);
        });

        const response = await Promise.race([thinkPromise, timeoutPromise]);
        
        if (!response || !response.choices || !response.choices[0]) {
            throw new Error("LLM返回无效响应");
        }

        const responseText = response.choices[0].message.content;
        
        // 🎯 使用研究专用解析器
        return this._parseResearchResponse(responseText);
    }

    /**
     * 🎯 研究专用响应解析
     */
    _parseResearchResponse(responseText) {
        const cleanedText = responseText.trim();
        
        // 🎯 研究专用解析逻辑
        const thoughtMatch = cleanedText.match(/研究思考:\s*(.*?)(?=行动:|最终报告:|$)/s);
        const actionMatch = cleanedText.match(/行动:\s*(\w+)/s);
        const actionInputMatch = cleanedText.match(/行动输入:\s*(\{.*?\})/s);
        const finalReportMatch = cleanedText.match(/最终报告:\s*(.*)/s);
        
        const thought = thoughtMatch ? thoughtMatch[1].trim() : '';
        const action = actionMatch ? actionMatch[1].trim() : null;
        const actionInput = actionInputMatch ? this._safeParseJson(actionInputMatch[1]) : {};
        const finalReport = finalReportMatch ? finalReportMatch[1].trim() : null;

        // 🎯 研究完成条件
        if (finalReport && cleanedText.includes('最终报告:')) {
            return {
                type: 'final_answer',
                answer: finalReport,
                log: thought || '研究完成，生成最终报告'
            };
        }
        
        // 🎯 研究工具调用
        if (action && this.tools[action]) {
            return {
                type: 'tool_call',
                tool_name: action,
                parameters: actionInput,
                log: thought || `执行研究行动: ${action}`
            };
        }
        
        // 🎯 默认继续研究
        return {
            type: 'continue_research',
            log: cleanedText.substring(0, 500)
        };
    }

    /**
     * 🎯 构建研究专用提示词
     */
    _constructResearchPrompt(topic, intermediateSteps, researchState) {
        const toolDescriptions = Object.values(this.tools)
            .map(tool => `- ${tool.name}: ${tool.description}`)
            .join('\n');

        let prompt = `你是一个专业研究助手，负责进行深度研究和综合分析。

研究主题: ${topic}
当前研究阶段: ${researchState.phase}
已收集来源: ${researchState.sources.length} 个
关键发现: ${researchState.keyFindings.length} 个

可用研究工具:
${toolDescriptions}

请严格按照研究格式响应：

研究思考: 分析当前研究进展，规划下一步研究行动
行动: 需要调用的工具名称
行动输入: 工具的输入参数(JSON格式)
最终报告: 完整的研究报告（当研究完成时）

研究策略指南:
1. 优先使用 crawl4ai 进行网页抓取，获取原始资料
2. 使用 tavily_search 进行信息检索和验证
3. 对关键信息进行交叉验证
4. 逐步深入，从广泛到具体
5. 关注信息的可靠性、时效性和相关性

`;

        // 🎯 添加上下文（压缩后）
        if (intermediateSteps.length > 0) {
            prompt += "\n研究历史:\n";
            const compressedHistory = this._compressResearchHistory(intermediateSteps);
            compressedHistory.forEach((step, index) => {
                prompt += `步骤 ${index + 1}: ${step.summary}\n`;
            });
            prompt += "\n基于以上研究历史，请继续:\n";
        }

        prompt += "研究思考: ";
        
        return prompt;
    }

    /**
     * 🎯 执行研究行动
     */
    async _executeResearchAction(action, runId, thinkTimeout) {
        const { tool_name, parameters } = action;
        
        console.log(`[DeepResearchAgent] 执行研究工具: ${tool_name}`, parameters);

        await this.callbackManager.invokeEvent('on_tool_start', {
            name: tool_name,
            run_id: runId,
            data: {
                tool_name,
                parameters,
                researchPhase: this.researchState.phase
            }
        });

        try {
            const tool = this.tools[tool_name];
            if (!tool) {
                throw new Error(`研究工具不存在: ${tool_name}`);
            }

            const executionContext = { 
                runId, 
                callbackManager: this.callbackManager,
                researchPhase: this.researchState.phase
            };

            const rawResult = await this.callbackManager.wrapToolCall(
                { toolName: tool_name, parameters },
                async (request) => {
                    return await tool.invoke(request.parameters, executionContext);
                }
            );

            const observation = this._normalizeResearchOutput(rawResult, tool_name);

            await this.callbackManager.invokeEvent('on_tool_end', {
                name: tool_name,
                run_id: runId,
                data: {
                    tool_name,
                    result: observation,
                    success: observation.success,
                    researchPhase: this.researchState.phase
                }
            });

            return observation;

        } catch (error) {
            console.error(`[DeepResearchAgent] 研究工具执行失败:`, error);
            
            await this.callbackManager.invokeEvent('on_tool_error', {
                name: tool_name,
                run_id: runId,
                data: {
                    tool_name,
                    error: error.message,
                    parameters,
                    researchPhase: this.researchState.phase
                }
            });

            return this._normalizeResearchOutput({
                success: false,
                error: error.message,
                isError: true,
                output: `❌ 研究工具"${tool_name}"执行失败: ${error.message}`
            }, tool_name);
        }
    }

    /**
     * 🎯 标准化研究输出
     */
    _normalizeResearchOutput(rawResult, toolName) {
        const normalized = {
            success: rawResult.success !== undefined ? rawResult.success : true,
            output: rawResult.output || '',
            error: rawResult.error || null,
            isError: rawResult.isError || false,
            raw: rawResult,
            tool: toolName,
            timestamp: Date.now(),
            metadata: {
                normalized: true,
                version: '2.0',
                researchTool: true
            }
        };

        // 🎯 研究专用输出格式化
        if (!normalized.output || normalized.output.length < 10) {
            normalized.output = this._generateResearchOutput(rawResult, toolName);
        }

        return normalized;
    }

    /**
     * 🎯 生成研究专用输出
     */
    _generateResearchOutput(rawResult, toolName) {
        switch (toolName) {
            case 'tavily_search':
                return this._formatSearchForResearch(rawResult);
            case 'crawl4ai':
                return this._formatCrawlForResearch(rawResult);
            case 'python_sandbox':
                return this._formatAnalysisForResearch(rawResult);
            default:
                return this._formatGenericForResearch(rawResult);
        }
    }

    /**
     * 🎯 研究专用搜索输出格式化
     */
    _formatSearchForResearch(rawResult) {
        if (Array.isArray(rawResult.data)) {
            const count = rawResult.data.length;
            const relevantCount = rawResult.data.filter(item => 
                item.content && item.content.length > 100
            ).length;
            
            return `🔍 搜索到 ${count} 条结果，其中 ${relevantCount} 条包含详细内容。`;
        }
        return '🔍 搜索完成';
    }

    /**
     * 🎯 研究专用爬取输出格式化
     */
    _formatCrawlForResearch(rawResult) {
        if (rawResult.content) {
            const wordCount = rawResult.content.split(/\s+/).length;
            return `🌐 抓取内容: ${wordCount} 词，可用于深度分析。`;
        }
        return '🌐 网页抓取完成';
    }

    /**
     * 🎯 研究专用分析输出格式化
     */
    _formatAnalysisForResearch(rawResult) {
        if (rawResult.stdout) {
            const lines = rawResult.stdout.split('\n').length;
            return `📊 分析完成: ${lines} 行输出数据。`;
        }
        return '📊 数据分析完成';
    }

    /**
     * 🎯 研究专用通用输出格式化
     */
    _formatGenericForResearch(rawResult) {
        const content = rawResult.content || rawResult.data || rawResult.result;
        if (typeof content === 'string' && content.trim()) {
            return `📋 研究数据: ${content.substring(0, 200)}...`;
        }
        return '研究工具执行完成';
    }

    /**
     * 🎯 处理研究观察结果
     */
    _processResearchObservation(observation, action) {
        if (observation.success && !observation.isError) {
            // 🎯 记录来源
            if (action.tool_name === 'tavily_search' || action.tool_name === 'crawl4ai') {
                this.researchState.sources.push({
                    tool: action.tool_name,
                    timestamp: Date.now(),
                    parameters: action.parameters,
                    summary: observation.output.substring(0, 100)
                });
            }
            
            // 🎯 提取关键发现
            if (observation.output && observation.output.length > 50) {
                const keyFinding = this._extractKeyFinding(observation.output);
                if (keyFinding) {
                    this.researchState.keyFindings.push(keyFinding);
                }
            }
        }
    }

    /**
     * 🎯 提取关键发现
     */
    _extractKeyFinding(output) {
        // 🎯 简单的关键信息提取逻辑
        const sentences = output.split(/[.!?。！？]+/);
        const meaningful = sentences.filter(s => 
            s.length > 20 && 
            !s.includes('搜索') && 
            !s.includes('抓取') &&
            !s.includes('执行')
        );
        
        return meaningful.length > 0 ? {
            content: meaningful[0].trim(),
            timestamp: Date.now(),
            confidence: 'medium'
        } : null;
    }

    /**
     * 🎯 压缩研究上下文
     */
    async _compressResearchContext(intermediateSteps) {
        if (intermediateSteps.length < 3) return;
        
        try {
            const compressionResult = await this.contextCompressor.compressSteps(
                intermediateSteps,
                this.researchState
            );
            
            if (compressionResult.compressed) {
                this.researchState.compressionHistory.push({
                    timestamp: Date.now(),
                    originalSteps: intermediateSteps.length,
                    compressedSteps: compressionResult.steps.length
                });
                
                // 🎯 更新步骤（实际应用中可能需要更复杂的逻辑）
                console.log(`[DeepResearchAgent] 上下文压缩: ${compressionResult.originalSteps} -> ${compressionResult.compressedSteps} 步骤`);
            }
        } catch (error) {
            console.warn('[DeepResearchAgent] 上下文压缩失败:', error);
        }
    }

    /**
     * 🎯 压缩研究历史
     */
    _compressResearchHistory(intermediateSteps) {
        return intermediateSteps.slice(-3).map((step, index) => ({
            summary: `使用 ${step.action.tool_name}: ${step.observation.output.substring(0, 80)}...`,
            index: intermediateSteps.length - 3 + index
        }));
    }

    /**
     * 🎯 研究思考超时策略
     */
    _getResearchThinkTimeout(iteration, consecutiveErrors) {
        const baseTimeout = 45000; // 研究任务需要更多思考时间
        
        let timeout = baseTimeout;
        
        // 🎯 迭代调整
        if (iteration === 0) {
            timeout = Math.round(timeout * 1.8); // 首次思考更多时间
        } else if (iteration > 4) {
            timeout = Math.round(timeout * 0.7); // 后期收紧
        }
        
        // 🎯 错误恢复
        if (consecutiveErrors > 0) {
            timeout = Math.round(timeout * (1 - Math.min(consecutiveErrors * 0.2, 0.5)));
            timeout = Math.max(timeout, 15000);
        }
        
        return Math.min(timeout, this.maxThinkTimeout);
    }

    /**
     * 🎯 初始化研究状态
     */
    _initializeResearchState(topic, focus, depth) {
        this.researchState = {
            phase: 'initializing',
            sources: [],
            keyFindings: [],
            currentFocus: focus || this._extractResearchFocus(topic),
            compressionHistory: [],
            depth: depth || 'standard',
            startTime: Date.now()
        };
    }

    /**
     * 🎯 提取研究重点
     */
    _extractResearchFocus(topic) {
        const focusKeywords = {
            '技术': 'technology',
            '市场': 'market', 
            '趋势': 'trends',
            '分析': 'analysis',
            '研究': 'research',
            '发展': 'development'
        };
        
        for (const [keyword, focus] of Object.entries(focusKeywords)) {
            if (topic.includes(keyword)) {
                return focus;
            }
        }
        
        return 'comprehensive';
    }

    /**
     * 🎯 更新研究阶段
     */
    _updateResearchPhase(iteration, intermediateSteps) {
        const phases = [
            'initializing',     // 0: 初始化
            'information_gathering', // 1-2: 信息收集
            'deep_analysis',    // 3-5: 深度分析
            'synthesis',        // 6+: 综合合成
            'finalizing'        // 最后: 最终化
        ];
        
        let phaseIndex = Math.floor(iteration / 2);
        if (phaseIndex >= phases.length) {
            phaseIndex = phases.length - 1;
        }
        
        // 🎯 基于进展调整阶段
        if (intermediateSteps.length >= 4 && this.researchState.keyFindings.length >= 2) {
            phaseIndex = Math.max(phaseIndex, 3); // 强制进入合成阶段
        }
        
        this.researchState.phase = phases[phaseIndex];
    }

    /**
     * 🎯 检查是否应该完成研究
     */
    _shouldCompleteResearch(intermediateSteps) {
        if (intermediateSteps.length < 2) return false;
        
        const recentSteps = intermediateSteps.slice(-3);
        const successfulSteps = recentSteps.filter(step => !step.observation.isError);
        
        // 🎯 完成条件: 最近步骤成功且有足够的关键发现
        return successfulSteps.length >= 2 && 
               this.researchState.keyFindings.length >= 3 &&
               this.researchState.sources.length >= 2;
    }

    /**
     * 🎯 合成研究报告
     */
    _synthesizeResearchReport(intermediateSteps, topic) {
        let report = `# 研究报告: ${topic}\n\n`;
        
        report += `## 执行摘要\n`;
        report += `- 研究轮次: ${intermediateSteps.length}\n`;
        report += `- 信息来源: ${this.researchState.sources.length} 个\n`;
        report += `- 关键发现: ${this.researchState.keyFindings.length} 个\n`;
        report += `- 研究阶段: ${this.researchState.phase}\n\n`;
        
        report += `## 关键发现\n`;
        this.researchState.keyFindings.forEach((finding, index) => {
            report += `${index + 1}. ${finding.content}\n`;
        });
        
        report += `\n## 研究方法\n`;
        intermediateSteps.forEach((step, index) => {
            if (!step.observation.isError) {
                report += `${index + 1}. ${step.action.tool_name}: ${step.observation.output.substring(0, 100)}...\n`;
            }
        });
        
        report += `\n## 结论\n基于以上研究，提供全面的分析和见解。`;
        
        return report;
    }

    /**
     * 🎯 格式化最终答案
     */
    _formatFinalAnswer(answer, intermediateSteps) {
        return `# 研究完成\n\n${answer}\n\n---\n*基于 ${intermediateSteps.length} 个研究步骤的综合分析*`;
    }

    /**
     * 🎯 处理研究错误
     */
    _handleResearchErrors(intermediateSteps, errorCount) {
        return `# 研究遇到困难\n\n连续错误次数: ${errorCount}\n已完成步骤: ${intermediateSteps.length}\n\n建议简化研究问题或稍后重试。`;
    }

    /**
     * 🎯 处理最大迭代次数
     */
    _handleMaxResearchIterations(intermediateSteps) {
        const successfulSteps = intermediateSteps.filter(step => !step.observation.isError).length;
        
        let report = `# 研究达到最大迭代\n\n`;
        report += `已完成 ${successfulSteps}/${intermediateSteps.length} 个成功步骤\n\n`;
        report += `## 已收集信息\n`;
        report += `- 来源: ${this.researchState.sources.length} 个\n`;
        report += `- 关键发现: ${this.researchState.keyFindings.length} 个\n\n`;
        report += `## 初步发现\n`;
        
        this.researchState.keyFindings.slice(0, 3).forEach((finding, index) => {
            report += `${index + 1}. ${finding.content}\n`;
        });
        
        report += `\n建议进行更聚焦的研究以获得更完整的结果。`;
        
        return report;
    }

    /**
     * 🎯 安全的JSON解析
     */
    _safeParseJson(jsonStr) {
        try {
            let cleaned = jsonStr
                .replace(/(\w+):/g, '"$1":')
                .replace(/'/g, '"')
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']');
            return JSON.parse(cleaned);
        } catch (error) {
            console.warn('[DeepResearchAgent] JSON解析失败:', error);
            return {};
        }
    }

    /**
     * 🎯 获取研究Agent状态
     */
    getStatus() {
        return {
            maxIterations: this.maxIterations,
            availableTools: Object.keys(this.tools),
            researchTools: Object.keys(this.tools).filter(name => 
                ['tavily_search', 'crawl4ai', 'python_sandbox'].includes(name)
            ),
            researchState: this.researchState,
            currentSession: this.currentSession,
            researchConfig: this.researchConfig,
            type: 'deep_research_agent'
        };
    }
}


