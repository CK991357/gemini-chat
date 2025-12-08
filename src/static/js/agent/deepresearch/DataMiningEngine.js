// src/static/js/agent/deepresearch/DataMiningEngine.js

/**
 * 🔥 数据挖掘专用引擎 - 完整优化版
 * 包含数据挖掘模式的所有专用逻辑、配置和提示词
 */
export class DataMiningEngine {
    constructor(config = {}) {
        this.config = {
            maxIterations: config.maxIterations || 5,
            noGainThreshold: config.noGainThreshold || 1,
            minDataTables: config.minDataTables || 2,
            minSources: config.minSources || 3,
            dataQualityThreshold: config.dataQualityThreshold || 0.6,
            enableAdaptivePatterns: config.enableAdaptivePatterns !== false,
            ...config
        };
        
        // 数据模式检测器
        this.patternDetector = {
            patterns: [
                { name: 'comparison_table', keywords: ['对比', '比较', 'vs', 'versus', '参数对比'] },
                { name: 'time_series', keywords: ['年', '月', '季度', '趋势', '增长率', '时间序列'] },
                { name: 'geographic', keywords: ['地区', '省份', '城市', '国家', '分布', '地图'] },
                { name: 'categorical', keywords: ['分类', '类型', '级别', '等级', '类别'] },
                { name: 'statistical', keywords: ['统计', '数据', '百分比', '比例', '平均值'] }
            ],
            detectionCache: new Map()
        };
        
        console.log('[DataMiningEngine] 初始化完成，启用自适应模式:', this.config.enableAdaptivePatterns);
    }
    
    /**
     * 🔥 获取数据挖掘模式专用配置
     */
    getDataMiningConfig() {
        return {
            maxIterations: 5,
            noGainThreshold: 1,
            minDataTables: 2,
            minSources: 3,
            dataQualityThreshold: 0.6,
            enableAdaptivePatterns: true,
            toolPriorities: {
                'tavily_search': { priority: 1, dataYield: 'high' },
                'crawl4ai': { priority: 2, dataYield: 'medium' },
                'python_sandbox': { priority: 3, dataYield: 'high' },
                'code_generator': { priority: 4, dataYield: 'high' }
            }
        };
    }
    
    /**
     * 🔥 检查数据挖掘完成条件
     */
    checkDataMiningCompletion(intermediateSteps, allSources, iterations) {
        console.log(`[DataMiningEngine] 检查数据挖掘完成条件: 步骤=${intermediateSteps.length}, 来源=${allSources.length}, 迭代=${iterations}`);
        
        // 检查是否达到最小表格要求
        const totalTables = this.extractAllStructuredData(intermediateSteps, false).length;
        const hasEnoughTables = totalTables >= this.config.minDataTables;
        
        // 检查是否达到最小来源要求
        const hasEnoughSources = allSources.length >= this.config.minSources;
        
        // 检查是否达到最大迭代次数
        const hasReachedMaxIterations = iterations >= this.config.maxIterations;
        
        // 检查数据质量
        const dataQuality = this.assessDataQuality(intermediateSteps, allSources);
        const hasGoodQuality = dataQuality.overall_score >= this.config.dataQualityThreshold;
        
        // 检查最近步骤是否有信息增益
        const recentSteps = intermediateSteps.slice(-2);
        const hasRecentGain = recentSteps.some(step => 
            step.success && step.observation && step.observation.length > 100
        );
        
        // 决策矩阵
        const shouldTerminate = (
            (hasEnoughTables && hasEnoughSources && hasGoodQuality) ||
            (hasReachedMaxIterations && hasEnoughSources) ||
            (!hasRecentGain && iterations >= 3)
        );
        
        console.log(`[DataMiningEngine] 完成检查:`, {
            totalTables,
            hasEnoughTables,
            hasEnoughSources,
            hasReachedMaxIterations,
            dataQuality: dataQuality.overall_score,
            hasGoodQuality,
            hasRecentGain,
            shouldTerminate
        });
        
        return shouldTerminate;
    }
    
    /**
     * 🔥 构建数据挖掘专用提示词
     */
    buildDataMiningPrompt(topic, intermediateSteps, plan, sources, userInstruction, template, promptFragment) {
        // 1. 检测数据模式
        const detectedPattern = this.detectDataPattern(intermediateSteps);
        
        // 2. 提取所有结构化数据
        const structuredData = this.extractAllStructuredData(intermediateSteps);
        
        // 3. 数据质量评估
        const dataQuality = this.assessDataQuality(intermediateSteps, sources);
        
        // 4. 构建带编号的来源索引
        const numberedSourcesText = sources.map((s, i) => {
            const dateStr = s.collectedAt ? ` (${s.collectedAt.split('T')[0]})` : '';
            const credibility = this.assessSourceCredibility(s);
            return `[${i + 1}] 《${s.title}》${dateStr} ${credibility.rating}`;
        }).join('\n');
        
        // 5. 自适应模板选择
        const adaptiveTemplate = this.getAdaptiveTemplate(detectedPattern, dataQuality);
        
        return `
# 🚫 绝对禁止开场白协议
**禁止生成任何形式的"好的，遵命"等确认语句**
**必须直接从报告标题开始输出纯净内容**

# 角色：数据整理专家（${adaptiveTemplate.role}）
# 任务：基于收集的原始数据，生成纯数据报告

# 最终研究主题: "${topic}"

# 0. 🎯 原始用户指令 (最高优先级)
**请严格遵循此指令中包含的任何数据收集要求。**
\`\`\`
${userInstruction}
\`\`\`

# 1. 📊 数据收集概况
**检测到的数据模式**: ${detectedPattern}
**数据质量评分**: ${dataQuality.overall_score.toFixed(2)} (${dataQuality.overall_rating})
**提取表格数量**: ${dataQuality.table_count}
**结构化数据比例**: ${dataQuality.structured_ratio}%

# 2. 📚 资料来源索引 (Source Index)
**注意：以下编号对应你在表格中应引用的 [x] 标记。**
${numberedSourcesText}

# 3. 收集到的原始数据
以下内容是从上述来源中提取的详细信息。请将这些数据整理成规范的表格。

${structuredData}

# 4. 你的数据整理指令 (输出要求)
现在，请严格遵循以下元结构和要求，将上述数据整理成最终的数据报告。

${promptFragment}

## 🎯 ${detectedPattern.toUpperCase()} 模式专用指令
${adaptiveTemplate.instructions}

**🚫 绝对禁止:**
- 添加任何分析、观点、解读、总结
- 使用主观形容词（如"显著"、"重要"）
- 进行趋势预测或比较评价
- 合并或修改原始数据值

**✅ 核心要求:**
- **自主生成标题**: 基于数据主题生成精准标题
- **表格为主**: 所有数据优先以表格形式呈现
- **来源标注**: 每行数据必须标注来源编号 [x]
- **格式规范**: 数值、百分比、日期格式统一
- **保留原始**: 保持数据原貌，不进行任何计算
- **纯净内容**: 只呈现数据，不添加任何分析

## 📋 表格格式化规范
1. 使用标准的 Markdown 表格语法
2. 表头清晰描述数据维度
3. 数值右对齐，文本左对齐
4. 缺失数据标记为 "N/A"
5. 每个表格不超过 10 列

现在，请开始整理这份基于原始数据的数据报告。
`;
    }
    
    /**
     * 🔥 数据表格降级方案
     */
    generateDataTablesFallback(intermediateSteps, sources) {
        const tables = [];
        const allTables = [];
        
        intermediateSteps.forEach((step, index) => {
            if (step.success && step.observation) {
                // 提取表格数据
                const extractedTables = this.extractTablesFromText(step.observation);
                if (extractedTables.length > 0) {
                    const stepTables = extractedTables.map(table => ({
                        step: index + 1,
                        table: table,
                        tool: step.action?.tool_name,
                        source: step.sources?.[0]?.title || '未知来源'
                    }));
                    
                    tables.push(`## 步骤 ${index+1} 收集的数据 (${step.action?.tool_name})\n${extractedTables.join('\n')}`);
                    allTables.push(...stepTables);
                }
            }
        });
        
        if (tables.length > 0) {
            return `# 数据收集报告 (降级方案)

## 📊 数据汇总
共收集 ${allTables.length} 个数据表格，来自 ${sources.length} 个独立来源。

${tables.join('\n\n')}

## 📚 资料来源
${sources.map((s, i) => `${i+1}. ${s.title} - ${s.url}`).join('\n')}

## ⚠️ 数据质量说明
由于系统限制，部分数据可能未完全结构化。建议手动验证关键数据点。`;
        } else {
            return `# 数据收集报告

## 提示
系统收集了 ${intermediateSteps.length} 个步骤的数据，但未能提取到结构化表格。

## 可能的原因
1. 数据源不包含表格格式数据
2. 数据提取工具配置不当
3. 数据格式不符合预期

## 建议
1. 尝试使用更具体的搜索关键词
2. 指定包含表格的网页进行爬取
3. 使用代码生成器自定义数据提取逻辑`;
        }
    }
    
    /**
     * 🔥 提取所有结构化数据
     */
    extractAllStructuredData(intermediateSteps, includeSections = true) {
        const dataSections = [];
        let totalTables = 0;
        let totalLists = 0;
        
        intermediateSteps.forEach((step, index) => {
            if (step.success && step.observation && step.observation.length > 50) {
                const stepData = [];
                
                // 提取表格数据
                const tables = this.extractTablesFromText(step.observation);
                if (tables.length > 0) {
                    totalTables += tables.length;
                    stepData.push(`### 📋 表格数据 (${tables.length}个)`);
                    stepData.push(...tables.map(t => t.replace('### 提取表格\n', '')));
                }
                
                // 提取列表数据
                const lists = this.extractListsFromText(step.observation);
                if (lists.length > 0) {
                    totalLists += lists.length;
                    stepData.push(`### 📝 列表数据 (${lists.length}个)`);
                    stepData.push(...lists.map(l => l.replace('### 提取列表\n', '')));
                }
                
                // 提取键值对数据
                const keyValues = this.extractKeyValueData(step.observation);
                if (keyValues.length > 0) {
                    stepData.push(`### 🔑 键值对数据`);
                    stepData.push(this.formatKeyValueData(keyValues));
                }
                
                if (stepData.length > 0) {
                    if (includeSections) {
                        dataSections.push(`## 步骤 ${index+1} 数据 (${step.action?.tool_name || '未知工具'})`);
                        dataSections.push(...stepData);
                        dataSections.push('---');
                    } else {
                        dataSections.push(...stepData);
                    }
                }
            }
        });
        
        if (includeSections) {
            // 添加数据统计摘要
            const summary = `## 📊 数据统计摘要
- **总表格数**: ${totalTables}
- **总列表数**: ${totalLists}
- **有效数据步骤**: ${intermediateSteps.filter(s => s.success).length}/${intermediateSteps.length}
- **结构化数据比例**: ${((totalTables + totalLists) / intermediateSteps.length).toFixed(2)}`;

            return [summary, ...dataSections].join('\n\n');
        }
        
        return dataSections;
    }
    
    /**
     * 🔥 从文本中提取表格
     */
    extractTablesFromText(text) {
        if (!text || typeof text !== 'string') return [];
        
        // 支持多种表格格式
        const tablePatterns = [
            // Markdown表格
            /\|.*\|.*\r?\n\|[-: ]+\|[-: ]+\|.*\r?\n(\|.*\|.*\r?\n?)+/g,
            // 简单表格（无分隔线）
            /(?:^|\n)(?:[\u4e00-\u9fa5a-zA-Z0-9]+\s+){2,}[\u4e00-\u9fa5a-zA-Z0-9]+(?:\n(?:[\u4e00-\u9fa5a-zA-Z0-9]+\s+){2,}[\u4e00-\u9fa5a-zA-Z0-9]+)+/g,
            // CSV风格
            /(?:[^,\n]+,){2,}[^,\n]+(?:\n(?:[^,\n]+,){2,}[^,\n]+)+/g
        ];
        
        const tables = [];
        
        tablePatterns.forEach(pattern => {
            const matches = text.match(pattern) || [];
            matches.forEach(match => {
                // 清理和标准化表格格式
                const cleanedTable = this.cleanTableFormat(match);
                if (cleanedTable.split('\n').length >= 2) { // 至少两行
                    tables.push(`### 提取表格\n${cleanedTable}`);
                }
            });
        });
        
        // 去重
        const uniqueTables = [...new Set(tables)];
        return uniqueTables;
    }
    
    /**
     * 🔥 从文本中提取列表
     */
    extractListsFromText(text) {
        if (!text || typeof text !== 'string') return [];
        
        // 支持多种列表格式
        const listPatterns = [
            // Markdown无序列表
            /(?:\n|^)[-*+]\s+[^\n]+(?:\n[-*+]\s+[^\n]+)+/g,
            // 数字列表
            /(?:\n|^)\d+[\.\)]\s+[^\n]+(?:\n\d+[\.\)]\s+[^\n]+)+/g,
            // 中文列表（包含、包括...）
            /(?:\n|^)[•◦▪▫]\s+[^\n]+(?:\n[•◦▪▫]\s+[^\n]+)+/g,
            // 冒号分隔的列表
            /(?:\n|^)[\u4e00-\u9fa5a-zA-Z]+[:：]\s*[^\n]+(?:\n[\u4e00-\u9fa5a-zA-Z]+[:：]\s*[^\n]+)+/g
        ];
        
        const lists = [];
        
        listPatterns.forEach(pattern => {
            const matches = text.match(pattern) || [];
            matches.forEach(match => {
                lists.push(`### 提取列表\n${match.trim()}`);
            });
        });
        
        return [...new Set(lists)];
    }
    
    /**
     * 🔥 提取键值对数据
     */
    extractKeyValueData(text) {
        const patterns = [
            /([\u4e00-\u9fa5a-zA-Z]+)[:：]\s*([^\n]+)/g,
            /([\u4e00-\u9fa5a-zA-Z]+)\s*[:：]\s*([^\n]+)/g,
            /([\u4e00-\u9fa5a-zA-Z]+)\s*[=＝]\s*([^\n]+)/g
        ];
        
        const keyValues = [];
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const key = match[1].trim();
                const value = match[2].trim();
                if (key.length > 1 && value.length > 0) {
                    keyValues.push({ key, value });
                }
            }
        });
        
        return keyValues;
    }
    
    /**
     * 🔥 格式化键值对数据
     */
    formatKeyValueData(keyValues) {
        if (!keyValues || keyValues.length === 0) return '';
        
        // 分组显示，每行3个键值对
        let result = '';
        for (let i = 0; i < keyValues.length; i += 3) {
            const group = keyValues.slice(i, i + 3);
            const row = group.map(kv => `**${kv.key}**: ${kv.value}`).join(' | ');
            result += `- ${row}\n`;
        }
        
        return result;
    }
    
    /**
     * 🔥 获取数据挖掘专用提示词片段
     */
    getPromptFragment() {
        return `
## 🎯 数据挖掘模式专用指令

**核心原则**: 只收集、整理、呈现数据，不进行任何分析解读

**数据质量标准**:
1. **完整性**: 确保数据覆盖关键维度，标注缺失数据
2. **一致性**: 统一单位、格式、命名规范
3. **准确性**: 引用可靠来源，标注数据时间
4. **结构化**: 优先使用表格，确保可机读
5. **可追溯**: 每个数据点标注具体来源

**输出规范**:
1. 使用清晰的表格组织数据
2. 每个数据点标注来源 [x]
3. 保留原始单位和数值精度
4. 标注数据收集时间和质量等级
5. 使用统一的数据类型标识

**数据处理优先级**:
1. 原始表格数据 > 列表数据 > 文本数据
2. 数值数据 > 文本数据 > 日期数据
3. 最新数据 > 历史数据

**格式要求**:
- 数值: 保留小数点后两位
- 百分比: 统一为 "XX.XX%" 格式
- 日期: 统一为 "YYYY-MM-DD" 格式
- 货币: 统一为 "¥XX.XX" 或 "$XX.XX" 格式
`;
    }
    
    /**
     * 🔥 检测数据模式
     */
    detectDataPattern(intermediateSteps) {
        const cacheKey = JSON.stringify(intermediateSteps.map(s => s.observation?.substring(0, 500) || ''));
        if (this.patternDetector.detectionCache.has(cacheKey)) {
            return this.patternDetector.detectionCache.get(cacheKey);
        }
        
        const text = intermediateSteps
            .map(s => s.observation || '')
            .join(' ')
            .toLowerCase();
        
        // 计算每个模式的得分
        const patternScores = this.patternDetector.patterns.map(pattern => {
            let score = 0;
            pattern.keywords.forEach(keyword => {
                const regex = new RegExp(keyword, 'gi');
                const matches = text.match(regex);
                if (matches) {
                    score += matches.length;
                }
            });
            
            // 检查表格特征
            if (pattern.name === 'comparison_table' && text.includes('|') && text.includes('vs')) {
                score += 5;
            }
            
            if (pattern.name === 'time_series' && /\d{4}.*\d{4}/.test(text)) {
                score += 3;
            }
            
            return { pattern: pattern.name, score };
        });
        
        // 选择得分最高的模式
        patternScores.sort((a, b) => b.score - a.score);
        const detectedPattern = patternScores[0].score > 0 ? patternScores[0].pattern : 'mixed';
        
        this.patternDetector.detectionCache.set(cacheKey, detectedPattern);
        console.log(`[DataMiningEngine] 检测到数据模式: ${detectedPattern} (得分: ${patternScores[0].score})`);
        
        return detectedPattern;
    }
    
    /**
     * 🔥 获取自适应模板
     */
    getAdaptiveTemplate(pattern, dataQuality) {
        const templates = {
            comparison_table: {
                role: "数据对比专家",
                instructions: `
1. **对比维度**: 明确列出所有对比维度
2. **参数对齐**: 确保对比参数名称统一
3. **性能指标**: 分离性能指标和基本参数
4. **差异标注**: 使用特殊标记标注显著差异
5. **数据来源**: 每个对比项单独标注来源`
            },
            time_series: {
                role: "时间序列分析师",
                instructions: `
1. **时间排序**: 严格按时间顺序排列数据
2. **时间格式**: 统一时间格式 (YYYY-MM-DD)
3. **数据连续性**: 标注数据缺失的时间点
4. **增长率计算**: 如有需求可计算环比/同比增长
5. **时间跨度**: 标注数据的时间覆盖范围`
            },
            geographic: {
                role: "地理数据分析师",
                instructions: `
1. **地理层级**: 明确地理层级 (国家>省份>城市)
2. **坐标数据**: 如有坐标数据单独整理
3. **区域编码**: 使用标准区域编码 (如ISO代码)
4. **地图兼容**: 确保数据可用于地图可视化
5. **空间关系**: 标注相邻或相关区域`
            },
            categorical: {
                role: "分类数据专家",
                instructions: `
1. **分类体系**: 明确分类标准和层级
2. **互斥性**: 确保分类之间互不重叠
3. **覆盖率**: 标注分类体系的覆盖程度
4. **编码系统**: 如有分类编码系统需说明
5. **类别定义**: 提供每个类别的明确定义`
            },
            statistical: {
                role: "统计数据分析师",
                instructions: `
1. **数据分布**: 描述数据的基本分布特征
2. **统计量**: 计算并呈现关键统计量
3. **异常值**: 标注潜在的异常数据点
4. **置信区间**: 如有需要提供置信区间
5. **样本信息**: 说明样本大小和抽样方法`
            },
            mixed: {
                role: "数据整理专家",
                instructions: `
1. **数据分层**: 按数据类型分层呈现
2. **格式统一**: 统一不同数据源的格式
3. **质量分级**: 按数据质量分级呈现
4. **来源追踪**: 确保每个数据点可追溯
5. **完整性说明**: 说明数据集的完整程度`
            }
        };
        
        return templates[pattern] || templates.mixed;
    }
    
    /**
     * 🔥 评估数据质量
     */
    assessDataQuality(intermediateSteps, sources) {
        const stats = {
            total_steps: intermediateSteps.length,
            successful_steps: intermediateSteps.filter(s => s.success).length,
            total_tables: this.extractAllStructuredData(intermediateSteps, false).filter(t => t.includes('|')).length,
            total_lists: this.extractAllStructuredData(intermediateSteps, false).filter(t => t.includes('-') || t.includes('*')).length,
            avg_observation_length: 0,
            source_diversity: 0
        };
        
        // 计算平均观察长度
        const validObservations = intermediateSteps
            .filter(s => s.success && s.observation)
            .map(s => s.observation.length);
        
        if (validObservations.length > 0) {
            stats.avg_observation_length = validObservations.reduce((a, b) => a + b) / validObservations.length;
        }
        
        // 计算来源多样性
        if (sources.length > 0) {
            const uniqueDomains = new Set();
            sources.forEach(source => {
                try {
                    const url = new URL(source.url);
                    uniqueDomains.add(url.hostname);
                } catch (e) {
                    // 忽略无效URL
                }
            });
            stats.source_diversity = uniqueDomains.size / Math.max(sources.length, 1);
        }
        
        // 计算综合质量分数
        const successRate = stats.successful_steps / Math.max(stats.total_steps, 1);
        const structureRate = (stats.total_tables + stats.total_lists) / Math.max(stats.successful_steps, 1);
        const lengthScore = Math.min(stats.avg_observation_length / 500, 1); // 目标500字符
        const diversityScore = stats.source_diversity;
        
        const overallScore = (
            successRate * 0.3 +
            structureRate * 0.4 +
            lengthScore * 0.2 +
            diversityScore * 0.1
        );
        
        const qualityRating = overallScore >= 0.8 ? '优秀' :
                            overallScore >= 0.6 ? '良好' :
                            overallScore >= 0.4 ? '一般' : '待改进';
        
        return {
            overall_score: overallScore,
            overall_rating: qualityRating,
            metrics: {
                success_rate: successRate,
                structure_rate: structureRate,
                avg_length: stats.avg_observation_length,
                source_diversity: stats.source_diversity,
                table_count: stats.total_tables,
                list_count: stats.total_lists
            },
            structured_ratio: `${(structureRate * 100).toFixed(1)}%`,
            recommendation: this.getQualityRecommendation(overallScore, stats)
        };
    }
    
    /**
     * 🔥 获取质量改进建议
     */
    getQualityRecommendation(score, stats) {
        if (score >= 0.8) {
            return "数据质量优秀，已满足分析需求";
        } else if (score >= 0.6) {
            return "数据质量良好，建议增加数据多样性";
        } else if (score >= 0.4) {
            const recommendations = [];
            if (stats.table_count < 2) recommendations.push("增加表格数据收集");
            if (stats.avg_observation_length < 300) recommendations.push("增加数据详细程度");
            if (stats.source_diversity < 0.5) recommendations.push("增加来源多样性");
            return `数据质量一般，建议：${recommendations.join('；')}`;
        } else {
            return "数据质量待改进，建议重新设计数据收集策略";
        }
    }
    
    /**
     * 🔥 评估来源可信度
     */
    assessSourceCredibility(source) {
        const url = source.url || '';
        const title = source.title || '';
        
        let credibility = 0.5; // 默认中等可信度
        let rating = '中等';
        
        // 基于域名的可信度评估
        const trustedDomains = [
            'gov.cn', 'edu.cn', 'ac.cn', // 政府/教育
            'nature.com', 'science.org', 'cell.com', // 学术期刊
            'reuters.com', 'bloomberg.com', 'wsj.com' // 权威媒体
        ];
        
        const suspiciousDomains = [
            'blogspot.com', 'wordpress.com', // 个人博客
            'weibo.com', 'twitter.com', // 社交媒体
            'baidu.com', 'zhihu.com' // 需谨慎验证
        ];
        
        for (const domain of trustedDomains) {
            if (url.includes(domain)) {
                credibility = 0.9;
                rating = '高';
                break;
            }
        }
        
        for (const domain of suspiciousDomains) {
            if (url.includes(domain)) {
                credibility = 0.3;
                rating = '低';
                break;
            }
        }
        
        // 基于标题的简单评估
        if (title.includes('官方') || title.includes('权威') || title.includes('正式')) {
            credibility = Math.min(credibility + 0.1, 1.0);
        }
        
        return { score: credibility, rating, factors: ['域名评估', '标题关键词'] };
    }
    
    /**
     * 🔥 清理表格格式
     */
    cleanTableFormat(tableText) {
        let lines = tableText.split('\n').filter(line => line.trim());
        
        // 确保第一行是表头
        if (lines.length >= 2 && lines[1].includes('---') || lines[1].includes('--')) {
            // 已经是Markdown表格格式
            return lines.join('\n');
        }
        
        // 尝试转换为Markdown表格
        if (lines.length >= 2) {
            // 假设第一行是表头
            const header = lines[0];
            const separator = header.replace(/[^|]/g, '-').replace(/\|/g, '|');
            const dataRows = lines.slice(1);
            
            return [header, separator, ...dataRows].join('\n');
        }
        
        return tableText;
    }
    
    /**
     * 🔥 建议下一步行动
     */
    suggestNextAction(intermediateSteps, currentIteration, detectedPattern) {
        const actions = [
            { type: 'collect_more_data', priority: 1, tool: 'tavily_search' },
            { type: 'extract_structured_data', priority: 2, tool: 'crawl4ai' },
            { type: 'analyze_existing_data', priority: 3, tool: 'python_sandbox' },
            { type: 'generate_report', priority: 4, tool: 'generate_outline' }
        ];
        
        // 根据当前状态调整优先级
        const tables = this.extractAllStructuredData(intermediateSteps, false).filter(t => t.includes('|'));
        
        if (tables.length < 2) {
            // 需要更多表格数据
            actions.find(a => a.type === 'collect_more_data').priority = 10;
        } else if (currentIteration >= 3) {
            // 已有足够数据，开始分析
            actions.find(a => a.type === 'analyze_existing_data').priority = 10;
        }
        
        // 按优先级排序
        actions.sort((a, b) => b.priority - a.priority);
        
        return {
            recommended_action: actions[0],
            alternatives: actions.slice(1, 3),
            reasoning: `当前已收集 ${tables.length} 个表格，建议进行 ${actions[0].type}`
        };
    }
    
    /**
     * 🔥 优化搜索关键词（供外部调用）
     */
    optimizeSearchKeywords(originalQuery, detectedPattern) {
        const enhancements = {
            comparison_table: ['数据对比', '参数对比', '性能对比', '规格对比'],
            time_series: ['历年数据', '时间序列', '趋势数据', '历史数据'],
            geographic: ['地区分布', '各省数据', '城市数据', '地理数据'],
            categorical: ['分类数据', '类别统计', '类型分布', '分级数据'],
            statistical: ['统计数据', '数据分析', '统计报告', '数据汇总']
        };
        
        const patternEnhancements = enhancements[detectedPattern] || enhancements.statistical;
        
        // 避免重复添加
        const originalLower = originalQuery.toLowerCase();
        const newKeywords = patternEnhancements.filter(keyword => 
            !originalLower.includes(keyword.toLowerCase())
        );
        
        if (newKeywords.length > 0) {
            return `${originalQuery} ${newKeywords[0]}`;
        }
        
        return originalQuery;
    }
    
    /**
     * 🔥 构建数据挖掘专用的工具调用指南
     */
    getToolGuidanceForDataMining(toolName, context) {
        const guidance = {
            tavily_search: {
                strategy: "搜索时应包含'数据'、'表格'、'统计'等关键词",
                example_queries: [
                    "行业数据 2024 统计表格",
                    "市场规模 数据报告 最新",
                    "对比分析 数据表格"
                ],
                tips: [
                    "使用site:gov.cn限制政府网站",
                    "包含filetype:pdf获取PDF报告",
                    "使用intitle:数据获取标题含数据的页面"
                ]
            },
            crawl4ai: {
                strategy: "优先抓取包含表格的页面",
                target_pages: [
                    "数据报告页面",
                    "统计年鉴页面", 
                    "产品规格页面",
                    "对比分析页面"
                ],
                tips: [
                    "检查页面是否包含<table>标签",
                    "优先选择.gov/.edu域名",
                    "关注页面是否包含图表"
                ]
            },
            python_sandbox: {
                strategy: "用于数据清洗、转换和简单分析",
                common_tasks: [
                    "数据格式转换",
                    "缺失值处理",
                    "简单统计分析",
                    "数据可视化"
                ],
                tips: [
                    "先验证数据格式再处理",
                    "保留处理步骤的日志",
                    "输出结构化数据（JSON/CSV）"
                ]
            },
            code_generator: {
                strategy: "生成数据提取和分析代码",
                focus_areas: [
                    "网页数据提取",
                    "API数据获取",
                    "数据清洗脚本",
                    "分析报告生成"
                ],
                tips: [
                    "明确指定输出格式",
                    "包含错误处理逻辑",
                    "注释关键数据处理步骤"
                ]
            }
        };
        
        return guidance[toolName] || {
            strategy: "专注于收集和整理结构化数据",
            tips: ["优先获取表格形式的数据", "确保数据来源可靠"]
        };
    }
}