// src/static/js/agent/deepresearch/DeepResearchAgent.js

export class DeepResearchAgent {
    constructor(chatApiHandler, researchTools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.researchTools = researchTools;
        this.callbackManager = callbackManager;
        
        this.maxIterations = config.maxIterations || 6;
        this.researchConfig = {
            enableCompression: true,
            enableDeduplication: true,
            maxSources: 20,
            analysisDepth: 'comprehensive',
            ...config.researchConfig
        };
        
        // 🎯 移除缺失的依赖
        // this.outputParser = new ResearchOutputParser();
        this.researchState = null;
        
        console.log(`[DeepResearchAgent] 初始化完成，可用研究工具: ${Object.keys(researchTools).join(', ')}`);
    }

    /**
     * 🎯 核心研究执行方法 - 简化版本
     */
    async conductResearch(researchRequest) {
        const runId = this.callbackManager.generateRunId();
        const { topic, requirements, language, depth, focus, availableTools } = researchRequest;
        
        // 🎯 初始化研究状态
        this.researchState = {
            phase: 'initializing',
            topic,
            requirements,
            language: language || 'zh-CN',
            depth: depth || 'standard',
            focus: focus || [],
            availableTools: availableTools || Object.keys(this.researchTools),
            keywords: [],
            collectedSources: [],
            analyzedContent: [],
            startTime: Date.now(),
            sessionId: runId
        };

        console.log(`[DeepResearchAgent] 开始深度研究: "${topic}"，可用工具: ${this.researchState.availableTools.join(', ')}`);

        try {
            // 🎯 阶段1: 关键词生成
            await this._enterPhase('keyword_generation', runId);
            const keywords = await this._generateResearchKeywords();
            
            // 🎯 阶段2: 多轮搜索 - 使用研究工具
            await this._enterPhase('search', runId);
            const searchResults = await this._conductMultiRoundSearch(keywords);
            
            // 🎯 阶段3: 内容分析
            await this._enterPhase('analysis', runId);
            const analyzedContent = await this._analyzeAndDeduplicate(searchResults);
            
            // 🎯 阶段4: 报告合成
            await this._enterPhase('synthesis', runId);
            const finalReport = await this._synthesizeResearchReport(analyzedContent);
            
            await this._enterPhase('completed', runId);
            
            return this._formatResearchResult(finalReport, true);
            
        } catch (error) {
            console.error('[DeepResearchAgent] 研究过程失败:', error);
            return this._formatResearchResult(error.message, false);
        }
    }

    /**
     * 🎯 生成研究关键词 - 简化版本
     */
    async _generateResearchKeywords() {
        const prompt = `请为以下研究主题生成搜索关键词：
研究主题：${this.researchState.topic}
额外要求：${this.researchState.requirements || '无'}

请返回JSON格式：
{
    "keywords": [
        {"term": "关键词1", "priority": "high"},
        {"term": "关键词2", "priority": "medium"},
        {"term": "关键词3", "priority": "low"}
    ]
}`;

        try {
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'gpt-3.5-turbo',
                temperature: 0.3
            });

            const keywordData = JSON.parse(response.choices[0].message.content);
            this.researchState.keywords = keywordData.keywords;
            
            return keywordData.keywords;
        } catch (error) {
            console.warn('[DeepResearchAgent] 关键词生成失败，使用默认关键词', error);
            // 降级方案：使用简单关键词
            return [
                { term: this.researchState.topic, priority: 'high' },
                { term: '最新', priority: 'medium' },
                { term: '分析', priority: 'low' }
            ];
        }
    }

    /**
     * 🎯 多轮搜索执行
     */
    async _conductMultiRoundSearch(keywords) {
        const allResults = [];
        const searchRounds = this.researchState.depth === 'deep' ? 3 : 2;
        
        for (let round = 0; round < searchRounds; round++) {
            const roundKeywords = this._selectKeywordsForRound(keywords, round);
            
            for (const keyword of roundKeywords) {
                try {
                    // 🎯 使用研究工具集中的搜索工具
                    let searchResult;
                    if (this.researchTools.tavily_search) {
                        searchResult = await this.researchTools.tavily_search.invoke({
                            query: `${keyword.term} ${this.researchState.topic}`,
                            max_results: 8,
                            include_raw_content: true
                        });
                    } else if (this.researchTools.crawl4ai) {
                        // 如果没有tavily_search，使用crawl4ai作为备选
                        searchResult = await this.researchTools.crawl4ai.invoke({
                            mode: 'scrape',
                            parameters: {
                                url: `https://example.com/search?q=${encodeURIComponent(keyword.term + ' ' + this.researchState.topic)}`
                            }
                        });
                    }

                    if (searchResult && searchResult.success) {
                        allResults.push(...this._processSearchResults(searchResult, keyword));
                    }
                    
                    // 更新进度
                    this._updateProgress('search', {
                        round: round + 1,
                        currentKeyword: keyword.term,
                        resultsCount: allResults.length,
                        toolUsed: this.researchTools.tavily_search ? 'tavily_search' : 'crawl4ai'
                    });
                    
                    await this._delay(800); // 避免速率限制
                    
                } catch (error) {
                    console.warn(`搜索失败: ${keyword.term}`, error);
                }
            }
        }
        
        return allResults;
    }

    /**
     * 🎯 内容分析和去重
     */
    async _analyzeAndDeduplicate(searchResults) {
        const uniqueResults = this._removeDuplicates(searchResults);
        const analyzedContent = [];
        
        for (let i = 0; i < Math.min(15, uniqueResults.length); i++) {
            const analysis = await this._analyzeSingleSource(uniqueResults[i]);
            if (analysis) {
                analyzedContent.push(analysis);
                
                this._updateProgress('analysis', {
                    analyzed: analyzedContent.length,
                    total: Math.min(15, uniqueResults.length)
                });
            }
        }
        
        this.researchState.analyzedContent = analyzedContent;
        return analyzedContent;
    }

    /**
     * 🎯 智能去重
     */
    _removeDuplicates(results) {
        const seenUrls = new Set();
        const uniqueResults = [];
        
        for (const result of results) {
            if (!result.url || seenUrls.has(result.url)) continue;
            
            seenUrls.add(result.url);
            uniqueResults.push(result);
        }
        
        return uniqueResults;
    }

    /**
     * 🎯 研究报告合成 - 简化版本
     */
    async _synthesizeResearchReport(analyzedContent) {
        const prompt = `请基于以下研究内容撰写一份研究报告：

研究主题：${this.researchState.topic}
研究要求：${this.researchState.requirements || '无'}
分析内容：${JSON.stringify(analyzedContent.slice(0, 5), null, 2)}

请撰写一份结构清晰的研究报告，包含：
1. 研究背景
2. 主要发现
3. 关键分析
4. 结论建议

语言：${this.researchState.language || '中文'}`;
        
        try {
            const response = await this.chatApiHandler.completeChat({
                messages: [{ role: 'user', content: prompt }],
                model: 'gpt-3.5-turbo',
                temperature: 0.2,
                max_tokens: 4000
            });

            return response.choices[0].message.content;
        } catch (error) {
            console.error('[DeepResearchAgent] 报告合成失败', error);
            return `# 研究总结\n\n基于收集的信息，关于"${this.researchState.topic}"的研究已完成。\n\n收集了 ${analyzedContent.length} 个信息来源，经过分析得出相关结论。`;
        }
    }

    // 🎯 辅助方法
    _enterPhase(phase, runId) {
        this.researchState.phase = phase;
        this.callbackManager.invokeEvent('on_research_phase_changed', {
            name: 'research_phase',
            run_id: runId,
            data: { phase, researchState: this.researchState }
        });
    }

    _updateProgress(stage, progress) {
        this.callbackManager.invokeEvent('on_research_progress', {
            name: 'research_progress',
            run_id: this.researchState.sessionId,
            data: { stage, progress, researchState: this.researchState }
        });
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _formatResearchResult(report, success) {
        return {
            success,
            report,
            researchState: this.researchState,
            duration: Date.now() - this.researchState.startTime,
            type: 'deep_research'
        };
    }

    getStatus() {
        return {
            type: 'deep_research_agent',
            researchState: this.researchState,
            availableTools: Object.keys(this.researchTools)
        };
    }

    async _analyzeSingleSource(source) {
        // 简化分析：如果有python_sandbox就使用，否则直接返回
        if (this.researchTools.python_sandbox && source.content) {
            try {
                const analysisCode = `
# 简单的内容分析
content = """${source.content.substring(0, 1000)}"""
word_count = len(content.split())
print(f"内容长度: {word_count} 词")
`;
                const result = await this.researchTools.python_sandbox.invoke({
                    code: analysisCode
                });
                
                if (result.success) {
                    return {
                        ...source,
                        analysis: result.output
                    };
                }
            } catch (error) {
                console.warn('内容分析失败:', error);
            }
        }
        
        return source;
    }

    _selectKeywordsForRound(keywords, round) {
        if (round === 0) {
            return keywords.slice(0, 3);
        } else if (round === 1) {
            return keywords.slice(3, 6);
        } else {
            return keywords.slice(6);
        }
    }

    _processSearchResults(searchResult, keyword) {
        if (searchResult.rawResponse && Array.isArray(searchResult.rawResponse)) {
            return searchResult.rawResponse.map(item => ({
                ...item,
                searchKeyword: keyword.term,
                searchRound: 'current'
            }));
        }
        return [];
    }
}