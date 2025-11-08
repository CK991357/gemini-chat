// src/static/js/agent/specialized/DeepResearchAgent.js
import { ResearchOutputParser } from './ResearchOutputParser.js';
import { ResearchPrompts } from './ResearchPrompts.js';

export class DeepResearchAgent {
    constructor(chatApiHandler, tools, callbackManager, config = {}) {
        this.chatApiHandler = chatApiHandler;
        this.tools = this._filterResearchTools(tools); // 只保留研究工具
        this.callbackManager = callbackManager;
        
        this.maxIterations = config.maxIterations || 6;
        this.researchConfig = {
            enableCompression: true,
            enableDeduplication: true,
            maxSources: 20,
            analysisDepth: 'comprehensive',
            ...config.researchConfig
        };
        
        this.outputParser = new ResearchOutputParser();
        this.researchState = null;
    }

    /**
     * 🎯 过滤工具：只保留研究相关工具
     */
    _filterResearchTools(allTools) {
        const researchTools = ['tavily_search', 'crawl4ai', 'python_sandbox'];
        const filtered = {};
        
        researchTools.forEach(toolName => {
            if (allTools[toolName]) {
                filtered[toolName] = allTools[toolName];
            }
        });
        
        console.log(`[DeepResearchAgent] 研究工具过滤完成: ${Object.keys(filtered).join(', ')}`);
        return filtered;
    }

    /**
     * 🎯 核心研究执行方法
     */
    async conductResearch(researchRequest) {
        const runId = this.callbackManager.generateRunId();
        const { topic, requirements, language, depth, focus } = researchRequest;
        
        // 🎯 初始化研究状态
        this.researchState = {
            phase: 'initializing',
            topic,
            requirements,
            language: language || 'zh-CN',
            depth: depth || 'standard',
            focus: focus || [],
            keywords: [],
            collectedSources: [],
            analyzedContent: [],
            startTime: Date.now(),
            sessionId: runId
        };

        console.log(`[DeepResearchAgent] 开始深度研究: "${topic}"`);

        try {
            // 🎯 阶段1: 关键词生成
            await this._enterPhase('keyword_generation', runId);
            const keywords = await this._generateResearchKeywords();
            
            // 🎯 阶段2: 多轮搜索
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
     * 🎯 生成研究关键词
     */
    async _generateResearchKeywords() {
        const prompt = ResearchPrompts.keywordGeneration(
            this.researchState.topic, 
            this.researchState.requirements
        );

        const response = await this.chatApiHandler.completeChat({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-3.5-turbo',
            temperature: 0.3
        });

        const keywordData = JSON.parse(response.choices[0].message.content);
        this.researchState.keywords = keywordData.keywords;
        
        return keywordData.keywords;
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
                    const searchResult = await this.tools.tavily_search.invoke({
                        query: `${keyword.term} ${this.researchState.topic}`,
                        max_results: 8,
                        include_raw_content: true
                    });

                    if (searchResult.success) {
                        allResults.push(...this._processSearchResults(searchResult, keyword));
                    }
                    
                    // 更新进度
                    this._updateProgress('search', {
                        round: round + 1,
                        currentKeyword: keyword.term,
                        resultsCount: allResults.length
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
     * 🎯 研究报告合成
     */
    async _synthesizeResearchReport(analyzedContent) {
        const prompt = ResearchPrompts.reportStructure(this.researchState, analyzedContent);
        
        const response = await this.chatApiHandler.completeChat({
            messages: [{ role: 'user', content: prompt }],
            model: 'gpt-3.5-turbo',
            temperature: 0.2,
            max_tokens: 4000
        });

        return response.choices[0].message.content;
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
            availableTools: Object.keys(this.tools)
        };
    }
}