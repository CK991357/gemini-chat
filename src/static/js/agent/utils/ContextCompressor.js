// src/static/js/utils/ContextCompressor.js

/**
 * @class ContextCompressor
 * @description 研究专用上下文压缩器，优化长对话上下文管理
 */
export class ContextCompressor {
    constructor(config = {}) {
        this.config = {
            maxStepsToKeep: 8,
            compressionRatio: 0.6,
            preserveImportantSteps: true,
            ...config
        };
        
        this.compressionStrategies = {
            'research_light': this.lightCompression.bind(this),
            'research_aggressive': this.aggressiveCompression.bind(this),
            'semantic': this.semanticCompression.bind(this)
        };
    }

    /**
     * 🎯 压缩研究步骤 - 与DeepResearchAgent需求匹配
     */
    async compressSteps(intermediateSteps, researchState) {
        if (intermediateSteps.length <= this.config.maxStepsToKeep) {
            return {
                compressed: false,
                steps: intermediateSteps,
                originalSteps: intermediateSteps.length,
                compressedSteps: intermediateSteps.length,
                strategy: 'none'
            };
        }

        // 🎯 根据研究阶段选择压缩策略
        const strategy = this._selectCompressionStrategy(researchState);
        const compressionFn = this.compressionStrategies[strategy] || this.lightCompression;
        
        try {
            const compressedSteps = await compressionFn(intermediateSteps, researchState);
            
            return {
                compressed: true,
                steps: compressedSteps,
                originalSteps: intermediateSteps.length,
                compressedSteps: compressedSteps.length,
                strategy: strategy,
                compressionRate: (intermediateSteps.length - compressedSteps.length) / intermediateSteps.length
            };
        } catch (error) {
            console.warn('[ContextCompressor] 压缩失败，使用降级策略:', error);
            return this.fallbackCompression(intermediateSteps);
        }
    }

    /**
     * 🎯 轻度压缩 - 保留关键研究步骤
     */
    lightCompression(steps, researchState) {
        const importantSteps = this._identifyImportantSteps(steps, researchState);
        const recentSteps = steps.slice(-Math.floor(this.config.maxStepsToKeep * 0.7));
        
        // 🎯 合并重要步骤和最近步骤，去重
        const allSteps = [...importantSteps, ...recentSteps];
        const uniqueSteps = this._removeDuplicateSteps(allSteps);
        
        // 🎯 按原始顺序排序并限制数量
        return uniqueSteps
            .sort((a, b) => steps.indexOf(a) - steps.indexOf(b))
            .slice(-this.config.maxStepsToKeep);
    }

    /**
     * 🎯 激进压缩 - 用于长研究任务
     */
    aggressiveCompression(steps, researchState) {
        // 🎯 只保留工具调用成功且信息量大的步骤
        const filteredSteps = steps.filter(step => 
            !step.observation?.isError && 
            step.observation?.output?.length > 50 &&
            this._isResearchRelevant(step, researchState)
        );
        
        // 🎯 如果过滤后仍然太多，取最重要的
        if (filteredSteps.length > this.config.maxStepsToKeep) {
            return this._selectMostImportantSteps(filteredSteps, researchState);
        }
        
        return filteredSteps.length > 0 ? filteredSteps : steps.slice(-3); // 保底
    }

    /**
     * 🎯 语义压缩 - 基于内容相似性（需要LLM，可选的增强功能）
     */
    async semanticCompression(steps, researchState) {
        // 🎯 分组相似步骤
        const groupedSteps = this._groupSimilarSteps(steps);
        
        // 🎯 从每组中选择代表性步骤
        const representativeSteps = [];
        for (const group of groupedSteps) {
            if (group.length > 0) {
                const representative = this._selectRepresentativeStep(group, researchState);
                representativeSteps.push(representative);
            }
        }
        
        // 🎯 确保不超过最大步骤数
        return representativeSteps.slice(-this.config.maxStepsToKeep);
    }

    /**
     * 🎯 识别重要步骤
     */
    _identifyImportantSteps(steps, researchState) {
        return steps.filter(step => {
            // 🎯 成功的信息收集步骤
            if ((step.action.tool_name === 'tavily_search' || step.action.tool_name === 'crawl4ai') && 
                step.observation?.success) {
                return true;
            }
            
            // 🎯 产生关键发现的步骤
            if (step.observation?.output && step.observation.output.length > 200) {
                return true;
            }
            
            // 🎯 与研究焦点相关的步骤
            if (this._isStepRelevantToFocus(step, researchState.currentFocus)) {
                return true;
            }
            
            return false;
        });
    }

    /**
     * 🎯 检查步骤与研究相关性
     */
    _isResearchRelevant(step, researchState) {
        const { currentFocus, phase } = researchState;
        
        // 🎯 早期阶段保留更多探索性步骤
        if (phase === 'information_gathering') {
            return true;
        }
        
        // 🎯 后期阶段聚焦相关步骤
        if (currentFocus && step.observation?.output) {
            return step.observation.output.toLowerCase().includes(currentFocus.toLowerCase());
        }
        
        return true;
    }

    /**
     * 🎯 选择最重要的步骤
     */
    _selectMostImportantSteps(steps, researchState, maxCount = null) {
        const maxSteps = maxCount || this.config.maxStepsToKeep;
        
        // 🎯 为每个步骤评分
        const scoredSteps = steps.map(step => ({
            step,
            score: this._calculateStepImportance(step, researchState)
        }));
        
        // 🎯 按分数排序并取前N个
        return scoredSteps
            .sort((a, b) => b.score - a.score)
            .slice(0, maxSteps)
            .map(item => item.step)
            .sort((a, b) => steps.indexOf(a) - steps.indexOf(b)); // 恢复原始顺序
    }

    /**
     * 🎯 计算步骤重要性分数
     */
    _calculateStepImportance(step, researchState) {
        let score = 0;
        
        // 🎯 工具类型权重
        const toolWeights = {
            'tavily_search': 1.2,
            'crawl4ai': 1.5,
            'python_sandbox': 1.3,
            'default': 1.0
        };
        
        score += toolWeights[step.action.tool_name] || toolWeights.default;
        
        // 🎯 输出质量
        if (step.observation?.output) {
            const outputLength = step.observation.output.length;
            if (outputLength > 500) score += 2;
            else if (outputLength > 200) score += 1;
            else if (outputLength > 50) score += 0.5;
        }
        
        // 🎯 成功状态
        if (step.observation?.success) score += 1;
        if (step.observation?.isError) score -= 2;
        
        // 🎯 与研究焦点相关性
        if (this._isStepRelevantToFocus(step, researchState.currentFocus)) {
            score += 1.5;
        }
        
        // 🎯 时间衰减（稍微偏向新步骤）
        const stepIndex = researchState.steps ? researchState.steps.indexOf(step) : 0;
        const recencyBonus = 0.1 * (researchState.steps ? researchState.steps.length - stepIndex : 0);
        score += Math.min(recencyBonus, 1.0);
        
        return score;
    }

    /**
     * 🎯 检查步骤与焦点相关性
     */
    _isStepRelevantToFocus(step, currentFocus) {
        if (!currentFocus || currentFocus === 'comprehensive') return true;
        
        const focusKeywords = {
            'technology': ['技术', '科技', '创新', '开发', '软件', '硬件', 'AI', '人工智能'],
            'market': ['市场', '商业', '经济', '销售', '营收', '份额', '竞争', '行业'],
            'trends': ['趋势', '发展', '未来', '预测', '方向', '新兴', '变化'],
            'analysis': ['分析', '研究', '评估', '比较', '数据', '统计', '报告']
        };
        
        const keywords = focusKeywords[currentFocus] || [];
        const stepText = `${step.action.tool_name} ${JSON.stringify(step.action.parameters)} ${step.observation?.output || ''}`.toLowerCase();
        
        return keywords.some(keyword => stepText.includes(keyword.toLowerCase()));
    }

    /**
     * 🎯 选择压缩策略
     */
    _selectCompressionStrategy(researchState) {
        const { phase, sources, keyFindings } = researchState;
        
        if (phase === 'initializing' || phase === 'information_gathering') {
            return 'research_light';
        } else if (phase === 'deep_analysis' && sources.length > 5) {
            return 'research_aggressive';
        } else if (phase === 'synthesis' || phase === 'finalizing') {
            return 'research_aggressive';
        }
        
        return 'research_light';
    }

    /**
     * 🎯 分组相似步骤
     */
    _groupSimilarSteps(steps) {
        const groups = [];
        
        steps.forEach(step => {
            let addedToGroup = false;
            
            for (const group of groups) {
                if (this._areStepsSimilar(step, group[0])) {
                    group.push(step);
                    addedToGroup = true;
                    break;
                }
            }
            
            if (!addedToGroup) {
                groups.push([step]);
            }
        });
        
        return groups;
    }

    /**
     * 🎯 检查步骤相似性
     */
    _areStepsSimilar(step1, step2) {
        // 🎯 相同工具
        if (step1.action.tool_name !== step2.action.tool_name) return false;
        
        // 🎯 相似参数（简化比较）
        const params1 = JSON.stringify(step1.action.parameters);
        const params2 = JSON.stringify(step2.action.parameters);
        
        if (params1.length > 50 && params2.length > 50) {
            const similarity = this._calculateStringSimilarity(params1, params2);
            return similarity > 0.7;
        }
        
        return params1 === params2;
    }

    /**
     * 🎯 计算字符串相似度（简易版）
     */
    _calculateStringSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        return (longer.length - this._editDistance(longer, shorter)) / parseFloat(longer.length);
    }

    /**
     * 🎯 编辑距离计算
     */
    _editDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    /**
     * 🎯 选择代表性步骤
     */
    _selectRepresentativeStep(steps, researchState) {
        // 🎯 选择分数最高的步骤作为代表
        const scoredSteps = steps.map(step => ({
            step,
            score: this._calculateStepImportance(step, researchState)
        }));
        
        return scoredSteps.sort((a, b) => b.score - a.score)[0].step;
    }

    /**
     * 🎯 去除重复步骤
     */
    _removeDuplicateSteps(steps) {
        const seen = new Set();
        const uniqueSteps = [];
        
        steps.forEach(step => {
            const key = `${step.action.tool_name}-${JSON.stringify(step.action.parameters)}-${step.observation?.output?.substring(0, 100)}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                uniqueSteps.push(step);
            }
        });
        
        return uniqueSteps;
    }

    /**
     * 🎯 降级压缩策略
     */
    fallbackCompression(steps) {
        // 🎯 简单保留最后N个步骤
        return steps.slice(-this.config.maxStepsToKeep);
    }

    /**
     * 🎯 获取压缩统计
     */
    getCompressionStats() {
        return {
            strategies: Object.keys(this.compressionStrategies),
            config: this.config,
            version: '2.0'
        };
    }
}