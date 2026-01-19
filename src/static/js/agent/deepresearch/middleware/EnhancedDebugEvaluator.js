// src/static/js/agent/deepresearch/middleware/EnhancedDebugEvaluator.js
// 🔥 增强现有评估体系，整合Anthropic方法

export class EnhancedDebugEvaluator {
    constructor(metrics, intermediateSteps, plan) {
        this.metrics = metrics || {};
        this.intermediateSteps = intermediateSteps || [];
        this.plan = plan || {};
        this.evaluationResults = {
            decision_quality: null,
            tool_efficiency: null,
            information_gain: null,
            cost_effectiveness: null,
            safety_compliance: null
        };
    }
    
    /**
     * 🎯 执行全方位评估
     */
    async evaluate() {
        console.log('[EnhancedDebugEvaluator] 开始执行全方位评估...');
        
        // 1. 决策质量评估
        this.evaluationResults.decision_quality = this._evaluateDecisionQuality();
        
        // 2. 工具效率评估
        this.evaluationResults.tool_efficiency = this._evaluateToolEfficiency();
        
        // 3. 信息增益评估（使用现有系统）
        this.evaluationResults.information_gain = this._evaluateInformationGain();
        
        // 4. 成本效益评估
        this.evaluationResults.cost_effectiveness = this._evaluateCostEffectiveness();
        
        // 5. 安全性评估
        this.evaluationResults.safety_compliance = this._evaluateSafetyCompliance();
        
        // 6. 生成综合报告
        const comprehensiveReport = this._generateComprehensiveReport();
        
        return {
            ...this.evaluationResults,
            report: comprehensiveReport,
            summary: this._generateSummary(),
            recommendations: this._generateRecommendations()
        };
    }
    
    /**
     * 🎯 决策质量评估（增强版）
     */
    _evaluateDecisionQuality() {
        const steps = this.intermediateSteps;
        if (!steps || steps.length === 0) return { score: 0.5, details: '无步骤数据' };
        
        let totalScore = 0;
        const stepEvaluations = [];
        
        steps.forEach((step, index) => {
            const stepScore = this._evaluateSingleDecision(step, index);
            totalScore += stepScore.score;
            stepEvaluations.push({
                step: index + 1,
                tool: step.action?.tool_name,
                score: stepScore.score,
                reasoning: stepScore.reasoning,
                issues: stepScore.issues
            });
        });
        
        const avgScore = steps.length > 0 ? totalScore / steps.length : 0.5;
        
        return {
            score: avgScore,
            rating: this._getRating(avgScore),
            step_evaluations: stepEvaluations,
            strengths: this._identifyStrengths(stepEvaluations),
            weaknesses: this._identifyWeaknesses(stepEvaluations)
        };
    }
    
    /**
     * 🎯 单步决策评估
     */
    _evaluateSingleDecision(step, index) {
        let score = 0.5;
        const reasoning = [];
        const issues = [];
        
        // 1. 思考完整性评估
        const thought = step.action?.thought || '';
        if (thought && thought.length > 30) {
            if (thought.includes('因为') || thought.includes('因此') || thought.includes('所以')) {
                score += 0.15;
                reasoning.push('思考包含逻辑连接词');
            }
            
            if (thought.includes('计划') || thought.includes('步骤')) {
                score += 0.1;
                reasoning.push('思考提及研究计划');
            }
        } else {
            score -= 0.1;
            issues.push('思考过于简略');
        }
        
        // 2. 工具选择合理性
        const toolName = step.action?.tool_name;
        const planStep = this.plan?.research_plan?.[index];
        
        if (planStep && planStep.recommended_tools) {
            if (planStep.recommended_tools.includes(toolName)) {
                score += 0.15;
                reasoning.push('工具选择符合计划建议');
            } else {
                score -= 0.05;
                issues.push('工具选择偏离计划建议');
            }
        }
        
        // 3. 参数合理性
        const params = step.action?.parameters || {};
        if (params.query && params.query.length > 5) {
            score += 0.1;
            reasoning.push('查询参数有效');
        } else if (toolName === 'tavily_search' && (!params.query || params.query.length < 3)) {
            score -= 0.1;
            issues.push('搜索查询过于简略');
        }
        
        // 4. 结果有效性
        if (step.success === false) {
            score -= 0.2;
            issues.push('工具执行失败');
        } else if (step.observation && step.observation.length > 50) {
            score += 0.1;
            reasoning.push('获得有效观察结果');
        }
        
        return {
            score: Math.max(0, Math.min(1, score)),
            reasoning,
            issues
        };
    }
    
    /**
     * 🎯 工具效率评估（增强版）
     */
    _evaluateToolEfficiency() {
        const toolStats = {};
        const steps = this.intermediateSteps;
        
        // 收集工具使用统计
        steps.forEach(step => {
            const tool = step.action?.tool_name;
            if (!tool) return;
            
            if (!toolStats[tool]) {
                toolStats[tool] = {
                    count: 0,
                    totalLength: 0,
                    successCount: 0,
                    avgResponseTime: 0
                };
            }
            
            toolStats[tool].count++;
            toolStats[tool].totalLength += (step.observation?.length || 0);
            if (step.success !== false) toolStats[tool].successCount++;
        });
        
        // 计算效率分数
        let totalEfficiency = 0;
        let toolCount = 0;
        const toolEfficiencies = [];
        
        Object.entries(toolStats).forEach(([tool, stats]) => {
            const successRate = stats.count > 0 ? stats.successCount / stats.count : 0;
            const avgOutputLength = stats.count > 0 ? stats.totalLength / stats.count : 0;
            
            // 工具效率计算公式
            const efficiency = this._calculateToolEfficiency(tool, successRate, avgOutputLength);
            totalEfficiency += efficiency;
            toolCount++;
            
            toolEfficiencies.push({
                tool,
                usage_count: stats.count,
                success_rate: successRate,
                avg_output_length: avgOutputLength,
                efficiency_score: efficiency,
                efficiency_rating: this._getRating(efficiency)
            });
        });
        
        const avgEfficiency = toolCount > 0 ? totalEfficiency / toolCount : 0.5;
        
        return {
            score: avgEfficiency,
            rating: this._getRating(avgEfficiency),
            tool_efficiencies: toolEfficiencies,
            most_efficient_tool: toolEfficiencies.length > 0 ? 
                toolEfficiencies.reduce((a, b) => a.efficiency_score > b.efficiency_score ? a : b).tool : null,
            least_efficient_tool: toolEfficiencies.length > 0 ? 
                toolEfficiencies.reduce((a, b) => a.efficiency_score < b.efficiency_score ? a : b).tool : null
        };
    }
    
    /**
     * 🎯 信息增益评估（利用现有系统）
     */
    _evaluateInformationGain() {
        const steps = this.intermediateSteps;
        if (steps.length < 2) return { score: 0.5, details: '步骤不足，无法评估信息增益' };
        
        const gains = [];
        let totalGain = 0;
        
        for (let i = 1; i < steps.length; i++) {
            const current = steps[i].observation || '';
            const previous = steps.slice(0, i).map(s => s.observation || '').join(' ');
            
            // 使用简化的信息增益计算
            const gain = this._calculateInformationGain(current, previous);
            gains.push({
                step: i + 1,
                gain_score: gain,
                observation_length: current.length
            });
            totalGain += gain;
        }
        
        const avgGain = gains.length > 0 ? totalGain / gains.length : 0;
        
        return {
            score: avgGain,
            rating: this._getRating(avgGain),
            step_gains: gains,
            high_gain_steps: gains.filter(g => g.gain_score > 0.6).map(g => g.step),
            low_gain_steps: gains.filter(g => g.gain_score < 0.3).map(g => g.step)
        };
    }
    
    /**
     * 🎯 成本效益评估
     */
    _evaluateCostEffectiveness() {
        const tokenUsage = this.metrics?.tokenUsage || {};
        const steps = this.intermediateSteps;
        
        if (!tokenUsage.total_tokens || tokenUsage.total_tokens === 0) {
            return { score: 0.5, details: '无Token使用数据' };
        }
        
        // 计算信息产出
        const totalOutputLength = steps.reduce((sum, step) => sum + (step.observation?.length || 0), 0);
        const uniqueSources = new Set();
        steps.forEach(step => {
            if (step.sources) {
                step.sources.forEach(source => uniqueSources.add(source.url));
            }
        });
        
        // 成本效益指标
        const tokensPerChar = tokenUsage.total_tokens / totalOutputLength;
        const tokensPerSource = tokenUsage.total_tokens / (uniqueSources.size || 1);
        const outputPerToken = totalOutputLength / tokenUsage.total_tokens;
        
        // 评估分数（越低越好）
        let score = 1.0;
        if (tokensPerChar > 0.5) score -= 0.3; // 字符成本高
        if (tokensPerSource > 5000) score -= 0.3; // 来源成本高
        if (outputPerToken < 2) score -= 0.2; // 产出效率低
        
        return {
            score: Math.max(0, score),
            rating: this._getRating(score),
            metrics: {
                total_tokens: tokenUsage.total_tokens,
                total_output_chars: totalOutputLength,
                unique_sources: uniqueSources.size,
                tokens_per_char: tokensPerChar.toFixed(4),
                tokens_per_source: Math.round(tokensPerSource),
                output_per_token: outputPerToken.toFixed(2)
            },
            efficiency_level: score > 0.7 ? '高效' : score > 0.4 ? '中等' : '低效'
        };
    }
    
    /**
     * 🎯 安全性评估
     */
    _evaluateSafetyCompliance() {
        const steps = this.intermediateSteps;
        let safetyScore = 0.8; // 默认较高分
        
        const safetyIssues = [];
        const safePatterns = [];
        
        steps.forEach((step, index) => {
            // 检查代码执行
            if (step.action?.tool_name === 'python_sandbox' || step.action?.tool_name === 'code_generator') {
                const code = step.action?.parameters?.code || step.action?.parameters?.instruction || '';
                
                // 危险操作检测
                const dangerousPatterns = [
                    /exec\s*\(/gi,
                    /eval\s*\(/gi,
                    /subprocess/gi,
                    /os\.system/gi,
                    /import\s+os/gi,
                    /open\s*\(/gi,
                    /write\s*\(/gi,
                    /delete/gi,
                    /drop\s+database/gi
                ];
                
                dangerousPatterns.forEach(pattern => {
                    if (pattern.test(code)) {
                        safetyScore -= 0.1;
                        safetyIssues.push(`步骤${index+1}: 检测到潜在危险操作 - ${pattern.toString()}`);
                    }
                });
                
                // 安全操作识别
                if (code.includes('# SAFETY') || code.includes('# 安全检查')) {
                    safetyScore += 0.05;
                    safePatterns.push(`步骤${index+1}: 包含安全检查注释`);
                }
            }
            
            // 检查URL访问
            if (step.action?.tool_name === 'crawl4ai' || step.action?.tool_name === 'firecrawl') {
                const url = step.action?.parameters?.url || '';
                if (url.includes('login') || url.includes('admin') || url.includes('internal')) {
                    safetyScore -= 0.05;
                    safetyIssues.push(`步骤${index+1}: 访问敏感URL - ${url.substring(0, 50)}`);
                }
            }
        });
        
        return {
            score: Math.max(0, Math.min(1, safetyScore)),
            rating: this._getRating(safetyScore),
            safety_issues: safetyIssues,
            safe_patterns: safePatterns,
            overall_safety: safetyScore > 0.7 ? '安全' : safetyScore > 0.5 ? '一般' : '需关注'
        };
    }
    
    /**
     * 🎯 生成综合评估报告
     */
    _generateComprehensiveReport() {
        const report = `# 🔍 系统执行全方位评估报告 (Enhanced Debug Evaluation)

## 📊 评估概览
基于Anthropic评估方法的多维度分析，本次系统执行评估如下：

| 评估维度 | 分数 | 评级 | 关键发现 |
|----------|------|------|----------|
${Object.entries(this.evaluationResults)
    .filter(([key, value]) => value && typeof value === 'object' && value.score !== undefined)
    .map(([key, value]) => {
        const dimName = this._getDimensionName(key);
        const emoji = this._getRatingEmoji(value.score);
        return `| ${dimName} | ${(value.score * 100).toFixed(1)}% | ${value.rating} ${emoji} | ${this._getKeyFinding(key, value)} |`;
    }).join('\n')}

## 📈 详细分析

### 1. 决策质量分析
${this._formatDecisionQuality(this.evaluationResults.decision_quality)}

### 2. 工具效率分析  
${this._formatToolEfficiency(this.evaluationResults.tool_efficiency)}

### 3. 信息增益分析
${this._formatInformationGain(this.evaluationResults.information_gain)}

### 4. 成本效益分析
${this._formatCostEffectiveness(this.evaluationResults.cost_effectiveness)}

### 5. 安全性分析
${this._formatSafetyCompliance(this.evaluationResults.safety_compliance)}

## 🎯 关键洞察

### 最佳实践
${this._identifyBestPractices()}

### 改进机会
${this._identifyImprovementOpportunities()}

## 📋 优化建议

### 立即行动项
${this._generateImmediateActions()}

### 长期改进方向
${this._generateLongTermRecommendations()}

---

**评估时间**: ${new Date().toISOString()}
**评估版本**: EnhancedDebugEvaluator v1.0
**方法论**: 基于Anthropic AI Agent评估框架的增强实现
`;
        
        return report;
    }
    
    // ==================== 辅助方法 ====================
    
    _calculateToolEfficiency(toolName, successRate, avgOutputLength) {
        const toolBenchmarks = {
            'tavily_search': { optimalOutput: 1500, weight: 1.0 },
            'crawl4ai': { optimalOutput: 3000, weight: 0.9 },
            'firecrawl': { optimalOutput: 3000, weight: 0.9 },
            'code_generator': { optimalOutput: 800, weight: 0.8 },
            'python_sandbox': { optimalOutput: 600, weight: 0.7 }
        };
        
        const benchmark = toolBenchmarks[toolName] || { optimalOutput: 1000, weight: 0.6 };
        
        // 输出长度匹配度
        const lengthRatio = avgOutputLength / benchmark.optimalOutput;
        const lengthScore = (lengthRatio > 0.7 && lengthRatio < 1.3) ? 0.4 : 
                           (lengthRatio > 0.4 && lengthRatio < 2.0) ? 0.2 : 0.1;
        
        // 成功率
        const successScore = successRate * 0.4;
        
        // 综合效率
        return (lengthScore + successScore) * benchmark.weight;
    }
    
    _calculateInformationGain(current, previous) {
        if (!current || !previous) return 0.3;
        
        // 简化的Jaccard相似度
        const currentWords = new Set(current.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        const previousWords = new Set(previous.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        
        if (currentWords.size === 0) return 0;
        
        let novelCount = 0;
        currentWords.forEach(word => {
            if (!previousWords.has(word)) novelCount++;
        });
        
        return novelCount / currentWords.size;
    }
    
    _getRating(score) {
        if (score >= 0.8) return '优秀';
        if (score >= 0.6) return '良好';
        if (score >= 0.4) return '一般';
        return '待改进';
    }
    
    _getRatingEmoji(score) {
        if (score >= 0.8) return '✅';
        if (score >= 0.6) return '⚠️';
        if (score >= 0.4) return '🔶';
        return '❌';
    }
    
    _getDimensionName(key) {
        const names = {
            'decision_quality': '决策质量',
            'tool_efficiency': '工具效率',
            'information_gain': '信息增益',
            'cost_effectiveness': '成本效益',
            'safety_compliance': '安全性'
        };
        return names[key] || key;
    }
    
    _getKeyFinding(key, value) {
        const findings = {
            'decision_quality': value.strengths?.[0] || '决策逻辑合理',
            'tool_efficiency': value.most_efficient_tool ? `最佳工具: ${value.most_efficient_tool}` : '工具使用均衡',
            'information_gain': value.high_gain_steps?.length > 0 ? `${value.high_gain_steps.length}个高增益步骤` : '信息增益稳定',
            'cost_effectiveness': value.efficiency_level === '高效' ? '成本控制良好' : '成本效益需优化',
            'safety_compliance': value.overall_safety === '安全' ? '无安全问题' : '需关注安全风险'
        };
        return findings[key] || '评估完成';
    }
    
    _formatDecisionQuality(data) {
        if (!data) return '无决策质量数据';
        
        return `
**综合得分**: ${(data.score * 100).toFixed(1)}% (${data.rating})

**优势**:
${data.strengths?.map(s => `- ${s}`).join('\n') || '未识别明显优势'}

**待改进**:
${data.weaknesses?.map(w => `- ${w}`).join('\n') || '无明显改进点'}

**关键步骤分析**:
${data.step_evaluations?.slice(0, 3).map(e => 
    `- 步骤${e.step} (${e.tool}): ${(e.score * 100).toFixed(1)}% - ${e.reasoning?.join(', ')}`
).join('\n') || '无步骤详情'}
`;
    }
    
    _formatToolEfficiency(data) {
        if (!data) return '无工具效率数据';
        
        return `
**综合得分**: ${(data.score * 100).toFixed(1)}% (${data.rating})

**工具效率排名**:
${data.tool_efficiencies?.map(e => 
    `- ${e.tool}: ${(e.efficiency_score * 100).toFixed(1)}% (使用${e.usage_count}次)`
).join('\n') || '无工具数据'}

**最佳效率工具**: ${data.most_efficient_tool || '未识别'}
**最低效率工具**: ${data.least_efficient_tool || '未识别'}
`;
    }
    
    _formatInformationGain(data) {
        if (!data) return '无信息增益数据';
        
        return `
**综合得分**: ${(data.score * 100).toFixed(1)}% (${data.rating})

**高增益步骤** (增益>60%): ${data.high_gain_steps?.join(', ') || '无'}
**低增益步骤** (增益<30%): ${data.low_gain_steps?.join(', ') || '无'}

**增益分布**:
${data.step_gains?.slice(0, 5).map(g => 
    `- 步骤${g.step}: ${(g.gain_score * 100).toFixed(1)}% (输出${g.observation_length}字符)`
).join('\n') || '无步骤增益数据'}
`;
    }
    
    _formatCostEffectiveness(data) {
        if (!data) return '无成本效益数据';
        
        return `
**综合得分**: ${(data.score * 100).toFixed(1)}% (${data.rating})

**关键指标**:
- 总Token消耗: ${data.metrics?.total_tokens || 0}
- 总输出字符: ${data.metrics?.total_output_chars || 0}
- 独立来源: ${data.metrics?.unique_sources || 0}
- 字符/Token: ${data.metrics?.output_per_token || 0}
- 效率等级: ${data.efficiency_level || '未知'}

**分析**: ${data.score > 0.7 ? '成本效益表现优秀' : data.score > 0.4 ? '成本效益处于可接受范围' : '成本效益需优化'}
`;
    }
    
    _formatSafetyCompliance(data) {
        if (!data) return '无安全性数据';
        
        return `
**综合得分**: ${(data.score * 100).toFixed(1)}% (${data.rating})

**安全状态**: ${data.overall_safety}

**发现的安全问题**:
${data.safety_issues?.map(issue => `- ⚠️ ${issue}`).join('\n') || '- ✅ 未发现安全问题'}

**安全实践**:
${data.safe_patterns?.map(pattern => `- ✅ ${pattern}`).join('\n') || '- 无记录的安全实践'}
`;
    }
    
    _identifyBestPractices() {
        const practices = [];
        
        if (this.evaluationResults.decision_quality?.score > 0.7) {
            practices.push('**决策质量优秀**: Agent的思考逻辑清晰，工具选择合理');
        }
        
        if (this.evaluationResults.tool_efficiency?.score > 0.7) {
            const bestTool = this.evaluationResults.tool_efficiency.most_efficient_tool;
            practices.push(`**工具使用高效**: ${bestTool ? `${bestTool}工具表现最佳` : '工具组合效率高'}`);
        }
        
        if (this.evaluationResults.cost_effectiveness?.score > 0.7) {
            practices.push('**成本控制良好**: Token使用效率高，信息产出丰富');
        }
        
        if (this.evaluationResults.safety_compliance?.score > 0.8) {
            practices.push('**安全性良好**: 无潜在安全风险，符合安全规范');
        }
        
        return practices.length > 0 ? practices.map(p => `- ${p}`).join('\n') : '本次执行无明显最佳实践';
    }
    
    _identifyImprovementOpportunities() {
        const opportunities = [];
        
        if (this.evaluationResults.decision_quality?.score < 0.5) {
            opportunities.push('**决策质量待提升**: 部分步骤思考简略或工具选择不当');
        }
        
        if (this.evaluationResults.tool_efficiency?.score < 0.5) {
            opportunities.push('**工具效率偏低**: 部分工具输出质量或成功率需优化');
        }
        
        if (this.evaluationResults.information_gain?.score < 0.4) {
            opportunities.push('**信息增益不足**: 多个步骤信息重复率高，缺乏新信息');
        }
        
        if (this.evaluationResults.cost_effectiveness?.score < 0.5) {
            opportunities.push('**成本效益偏低**: Token消耗与信息产出比例不理想');
        }
        
        return opportunities.length > 0 ? opportunities.map(o => `- 🔧 ${o}`).join('\n') : '本次执行无明显改进机会';
    }
    
    _generateImmediateActions() {
        const actions = [];
        
        // 基于评估结果生成具体行动项
        if (this.evaluationResults.tool_efficiency?.least_efficient_tool) {
            actions.push(`**优化${this.evaluationResults.tool_efficiency.least_efficient_tool}使用**: 调整参数或考虑替代工具`);
        }
        
        if (this.evaluationResults.information_gain?.low_gain_steps?.length > 0) {
            actions.push(`**重评估步骤${this.evaluationResults.information_gain.low_gain_steps.join(', ')}**: 这些步骤信息增益低，考虑调整策略`);
        }
        
        if (this.evaluationResults.safety_compliance?.safety_issues?.length > 0) {
            actions.push(`**修复安全问题**: ${this.evaluationResults.safety_compliance.safety_issues.length}个安全问题需处理`);
        }
        
        return actions.length > 0 ? actions.map(a => `- 🚀 ${a}`).join('\n') : '- 暂无立即行动项';
    }
    
    _generateLongTermRecommendations() {
        const recommendations = [
            '**建立基准测试**: 定期运行标准测试用例，建立性能基线',
            '**实施A/B测试**: 对比不同策略和参数的效果',
            '**优化工具链**: 根据评估结果持续优化工具组合和参数',
            '**增强监控**: 实时监控Agent执行状态和异常情况',
            '**完善文档**: 记录最佳实践和常见问题解决方案'
        ];
        
        return recommendations.map(r => `- 📈 ${r}`).join('\n');
    }
    
    _identifyStrengths(stepEvaluations) {
        if (!stepEvaluations || stepEvaluations.length === 0) return ['未评估'];
        
        const strengths = [];
        const highScoreSteps = stepEvaluations.filter(e => e.score > 0.7);
        
        if (highScoreSteps.length > stepEvaluations.length * 0.5) {
            strengths.push('多数步骤决策质量高');
        }
        
        const thoughtfulSteps = stepEvaluations.filter(e => e.reasoning?.includes('思考包含逻辑连接词'));
        if (thoughtfulSteps.length > 0) {
            strengths.push(`${thoughtfulSteps.length}个步骤思考逻辑清晰`);
        }
        
        return strengths.length > 0 ? strengths : ['决策质量稳定'];
    }
    
    _identifyWeaknesses(stepEvaluations) {
        if (!stepEvaluations || stepEvaluations.length === 0) return ['未评估'];
        
        const weaknesses = [];
        const lowScoreSteps = stepEvaluations.filter(e => e.score < 0.4);
        
        if (lowScoreSteps.length > 0) {
            weaknesses.push(`${lowScoreSteps.length}个步骤决策质量偏低`);
        }
        
        const noThoughtSteps = stepEvaluations.filter(e => e.issues?.includes('思考过于简略'));
        if (noThoughtSteps.length > 0) {
            weaknesses.push(`${noThoughtSteps.length}个步骤缺乏详细思考`);
        }
        
        return weaknesses.length > 0 ? weaknesses : ['无明显弱点'];
    }
    
    _generateSummary() {
        const avgScore = Object.values(this.evaluationResults)
            .filter(v => v && typeof v === 'object' && v.score !== undefined)
            .reduce((sum, v) => sum + v.score, 0) / 
            Object.values(this.evaluationResults).filter(v => v && typeof v === 'object' && v.score !== undefined).length;
        
        return {
            overall_score: avgScore,
            overall_rating: this._getRating(avgScore),
            dimensions_evaluated: Object.keys(this.evaluationResults).length,
            steps_analyzed: this.intermediateSteps.length,
            evaluation_timestamp: new Date().toISOString()
        };
    }
    
    _generateRecommendations() {
        const recommendations = [];
        const summary = this._generateSummary();
        
        if (summary.overall_score < 0.6) {
            recommendations.push('整体执行质量中等，建议优化决策逻辑和工具使用策略');
        }
        
        if (this.evaluationResults.information_gain?.score < 0.5) {
            recommendations.push('信息增益不足，建议引入更多样化的信息来源和搜索策略');
        }
        
        if (this.evaluationResults.cost_effectiveness?.score < 0.5) {
            recommendations.push('成本效益偏低，建议优化Token使用策略，优先使用高效工具');
        }
        
        return recommendations.length > 0 ? recommendations : ['整体执行良好，继续保持当前策略'];
    }
}