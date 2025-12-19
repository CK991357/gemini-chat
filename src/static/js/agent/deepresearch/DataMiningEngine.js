// src/static/js/agent/deepresearch/DataMiningEngine.js

/**
 * 🔥 数据挖掘专用引擎 - 完全兼容模板版
 * 与 ReportTemplates.js 中的数据挖掘模板完全匹配
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
        
        // 🔥 完全与模板匹配的场景检测器
        this.scenarioDetector = {
            scenarios: {
                // 1. 科技产品对比 - 与模板完全一致
                tech_comparison: {
                    triggers: ['对比', '比较', 'vs', '哪个好', '参数对比', '规格', '测评', '评测', '对比分析'],
                    keywords: ['手机', '电脑', '处理器', 'GPU', '显卡', '相机', '电池', '续航', '价格'],
                    priority: 10,
                    templateKey: 'tech_comparison' // 与模板中的key完全一致
                },
                // 2. 金融数据 - 与模板完全一致
                financial: {
                    triggers: ['股票', '股价', '财报', '财务', '收益', '利润率', '估值', '市盈率', '市净率'],
                    keywords: ['营业收入', '净利润', '毛利率', '净资产收益率', '市盈率', '市净率'],
                    priority: 9,
                    templateKey: 'financial' // 与模板中的key完全一致
                },
                // 3. 商业市场分析 - 与模板完全一致
                business_data: {
                    triggers: ['市场', '规模', '份额', '增长率', '竞争格局', '产业链', '行业分析', '投资分析'],
                    keywords: ['市场规模', '市场份额', '企业排名', '产业链', '上下游', '财务数据'],
                    priority: 8,
                    templateKey: 'business_data' // 与模板中的key完全一致
                },
                // 4. 学术研究 - 与模板完全一致
                academic_data: {
                    triggers: ['论文', '研究', '实验', '方法', '引用', '学术', '期刊', '会议', '参考文献'],
                    keywords: ['实验数据', '研究方法', '引用次数', '作者', '发表时间', '期刊影响因子'],
                    priority: 7,
                    templateKey: 'academic_data' // 与模板中的key完全一致
                },
                // 5. 通用数据（默认） - 与模板完全一致
                generic: {
                    triggers: [],
                    keywords: [],
                    priority: 0,
                    templateKey: 'generic' // 与模板中的key完全一致
                }
            },
            detectionCache: new Map()
        };

        // 数据模式检测器（保持不变）
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
        
        console.log('[DataMiningEngine] 完全兼容版初始化完成，场景适配器已与模板对齐');
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
        
        // 检查数据质量（使用模板兼容的评级）
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
            dataQualityLevel: dataQuality.overall_rating, // 新增：显示评级
            hasGoodQuality,
            hasRecentGain,
            shouldTerminate
        });
        
        return shouldTerminate;
    }
    
    /**
     * 🔥 构建数据挖掘专用提示词（完全兼容模板）
     */
    buildDataMiningPrompt(topic, intermediateSteps, plan, sources, userInstruction, template, promptFragment, dataBus = null) {
        // 1. 智能场景检测（兼容模板版本）
        const detectedScenario = this.detectUserScenarioCompatible(topic, userInstruction, intermediateSteps, template);
        
        // 2. 数据模式检测
        const detectedPattern = this.detectDataPattern(intermediateSteps);
        
        // 3. 提取所有结构化数据
        const structuredData = this.extractAllStructuredData(intermediateSteps, true, dataBus);
        
        // 4. 数据质量评估（使用模板兼容的评级）
        const dataQuality = this.assessDataQuality(intermediateSteps, sources);
        
        // 5. 构建带编号的来源索引
        const numberedSourcesText = sources.map((s, i) => {
            const dateStr = s.collectedAt ? ` (${s.collectedAt.split('T')[0]})` : '';
            const credibility = this.assessSourceCredibility(s);
            return `[${i + 1}] 《${s.title}》${dateStr} ${credibility.rating}`;
        }).join('\n');
        
        // 6. 获取最佳模板配置（完全兼容模板）
        const templateConfig = this.getBestTemplateConfigCompatible(detectedScenario, template, detectedPattern, dataQuality);
        
        // 7. 获取自适应角色和指令
        const adaptiveTemplate = this.getAdaptiveTemplate(detectedPattern, dataQuality);
        
        // 8. 获取场景映射信息（用于调试）
        const scenarioInfo = this.getScenarioMappingInfo(detectedScenario, template);
        
        return `
# 🚫 绝对禁止开场白协议
**禁止生成任何形式的"好的，遵命"等确认语句**
**必须直接从报告标题开始输出纯净内容**

# 🎯 数据挖掘引擎状态报告
**引擎版本**: 完全兼容模板版 v1.0
**场景映射**: ${scenarioInfo}
**模板配置源**: ${templateConfig.source}

# 角色：数据整理专家（${adaptiveTemplate.role}）
# 场景模式：${detectedScenario.name} → ${detectedScenario.templateKey}
# 任务：基于收集的原始数据，生成纯数据报告

# 最终研究主题: "${topic}"

# 0. 🎯 原始用户指令 (最高优先级)
**请严格遵循此指令中包含的任何数据收集要求。**
\`\`\`
${userInstruction}
\`\`\`

# 1. 📊 数据收集概况
**检测到的场景**: ${detectedScenario.name} → ${detectedScenario.templateKey}
**场景映射状态**: ${scenarioInfo.includes("直接匹配") ? "✅ 直接匹配" : "🔄 智能映射"}
**检测到的数据模式**: ${detectedPattern}
**数据质量评分**: ${dataQuality.overall_score.toFixed(2)} (${dataQuality.overall_rating})
**提取表格数量**: ${dataQuality.table_count}
**结构化数据比例**: ${dataQuality.structured_ratio}

# 2. 📚 资料来源索引 (Source Index)
**注意：以下编号对应你在表格中应引用的 [x] 标记。**
${numberedSourcesText}

# 3. 收集到的原始数据
以下内容是从上述来源中提取的详细信息。请将这些数据整理成规范的表格。

${structuredData}

# 4. 你的数据整理指令 (输出要求)
现在，请严格遵循以下元结构和要求，将上述数据整理成最终的数据报告。

${promptFragment}

## 🎯 ${detectedScenario.templateKey.toUpperCase()} 模板专用指令
${templateConfig.instructions}

## 📋 数据结构要求
${templateConfig.structure.map(section => `- ${section}`).join('\n')}

## 📊 数据质量评级标准（完全兼容模板）
1. **A级**: 数据完整，来源可靠，格式统一
2. **B级**: 数据基本完整，来源一般，格式基本统一  
3. **C级**: 数据缺失严重，来源单一，格式混乱
4. **D级**: 数据不可用或无效

**🚫 绝对禁止:**
- 添加任何分析、观点、解读、总结
- 使用主观形容词（如"显著"、"重要"）
- 进行趋势预测或比较评价
- 合并或修改原始数据值

**✅ 核心要求:**
- **自主生成标题**: 基于数据主题和场景生成精准标题
- **表格为主**: 所有数据优先以表格形式呈现
- **来源标注**: 每行数据必须标注来源编号 [x]
- **格式规范**: 数值、百分比、日期格式统一
- **保留原始**: 保持数据原貌，不进行任何计算
- **纯净内容**: 只呈现数据，不添加任何分析
- **质量标注**: 每个表格/数据块必须标注质量等级 [质量: X级]

## 📋 表格格式化规范
1. 使用标准的 Markdown 表格语法
2. 表头清晰描述数据维度
3. 数值右对齐，文本左对齐
4. 缺失数据标记为 "N/A"
5. 每个表格不超过 10 列
6. **必须标注质量等级**，例如：[质量: A级]

## 🔄 场景自适应输出示例
\`\`\`markdown
## 表1: 智能手机参数对比 [质量: A级]

| 型号 | 发布年份 | 处理器 | 内存(GB) | 价格(美元) | 来源 |
|------|----------|--------|----------|------------|------|
| iPhone 16 | 2024 | A18 Pro | 8 | 999 | [1, 3] |
| Samsung S24 | 2024 | Snapdragon 8 Gen 3 | 12 | 899 | [2, 4] |

## 时间序列数据: 季度销量 [质量: B级]

| 季度 | iPhone 销量(百万) | Samsung 销量(百万) |
|------|-------------------|-------------------|
| 2024 Q1 | 51.2 | 60.1 |
| 2024 Q2 | 45.8 | 55.3 |

## 地理分布数据 [质量: C级]

- 北美市场占有率: iPhone 52%, Samsung 28% [来源 5]
- 欧洲市场占有率: iPhone 34%, Samsung 41% [来源 6]
- *注: 亚洲市场数据暂缺*
\`\`\`

现在，请开始整理这份基于原始数据的数据报告。
`;
    }
    
    /**
     * 🔥 智能场景检测 - 完全兼容模板版本
     */
    detectUserScenarioCompatible(topic, userInstruction, intermediateSteps, template) {
        const cacheKey = `${topic.substring(0, 100)}|${userInstruction.substring(0, 100)}|${template?.name || 'no-template'}`;
        if (this.scenarioDetector.detectionCache.has(cacheKey)) {
            return this.scenarioDetector.detectionCache.get(cacheKey);
        }
        
        const text = (userInstruction + ' ' + topic).toLowerCase();
        console.log(`[DataMiningEngine] 检测用户场景（兼容版），输入文本: ${text.substring(0, 200)}...`);
        
        // 计算每个场景的得分
        const scenarioScores = Object.entries(this.scenarioDetector.scenarios).map(([scenarioKey, scenarioConfig]) => {
            let score = 0;
            
            // 1. 触发词匹配
            scenarioConfig.triggers.forEach(trigger => {
                const regex = new RegExp(trigger, 'gi');
                const matches = text.match(regex);
                if (matches) {
                    score += matches.length * 10;
                }
            });
            
            // 2. 关键词匹配
            scenarioConfig.keywords.forEach(keyword => {
                if (text.includes(keyword.toLowerCase())) {
                    score += 5;
                }
            });
            
            // 3. 优先级加成
            score += scenarioConfig.priority;
            
            // 4. 模板适配器检查加成（如果模板有适配器则加分）
            if (template?.config?.scenario_adapters?.[scenarioConfig.templateKey]) {
                score += 20; // 有模板适配器大幅加分
            }
            
            return { 
                scenario: scenarioKey, 
                templateKey: scenarioConfig.templateKey,
                score 
            };
        });
        
        // 按得分排序
        scenarioScores.sort((a, b) => b.score - a.score);
        
        // 选择得分最高的场景
        let detectedScenario = scenarioScores[0];
        if (detectedScenario.score <= 0) {
            // 如果没有明显匹配，使用generic
            detectedScenario = { 
                scenario: 'generic', 
                templateKey: 'generic',
                score: 0 
            };
        }
        
        console.log(`[DataMiningEngine] 检测到用户场景: ${detectedScenario.scenario} → ${detectedScenario.templateKey} (得分: ${detectedScenario.score})`);
        
        const result = {
            name: detectedScenario.scenario,
            templateKey: detectedScenario.templateKey,
            score: detectedScenario.score,
            isDirectMatch: this.scenarioDetector.scenarios[detectedScenario.scenario]?.templateKey === detectedScenario.templateKey
        };
        
        this.scenarioDetector.detectionCache.set(cacheKey, result);
        
        return result;
    }
    
    /**
     * 🔥 获取最佳模板配置 - 完全兼容模板
     */
    getBestTemplateConfigCompatible(detectedScenario, template, detectedPattern, dataQuality) {
        console.log(`[DataMiningEngine] 获取模板配置，场景: ${detectedScenario.name} → ${detectedScenario.templateKey}`);
        
        // 1. 优先使用模板中的场景适配器
        const templateKey = detectedScenario.templateKey;
        if (template?.config?.scenario_adapters?.[templateKey]) {
            const templateAdapter = template.config.scenario_adapters[templateKey];
            console.log(`[DataMiningEngine] ✅ 使用模板场景适配器: ${templateKey}`);
            
            return {
                structure: templateAdapter.structure || [],
                instructions: templateAdapter.requirements || '使用模板预定义的结构和要求',
                source: 'template_adapter'
            };
        }
        
        // 2. 检查模板是否有通用结构
        if (template?.config?.structure) {
            console.log(`[DataMiningEngine] 🔄 使用模板通用结构`);
            
            return {
                structure: template.config.structure,
                instructions: '使用模板通用结构和要求',
                source: 'template_general'
            };
        }
        
        // 3. 使用引擎生成的动态结构（兼容模板风格）
        console.log(`[DataMiningEngine] ⚡ 生成兼容模板的动态结构`);
        const dynamicStructure = this.generateCompatibleStructure(detectedScenario, detectedPattern, dataQuality, template);
        
        return {
            structure: dynamicStructure,
            instructions: this.getCompatibleInstructions(detectedScenario, template),
            source: 'engine_compatible'
        };
    }
    
    /**
     * 🔥 生成兼容模板的动态结构
     */
    generateCompatibleStructure(detectedScenario, dataPattern, dataQuality, template) {
        console.log(`[DataMiningEngine] 生成兼容模板的结构，场景: ${detectedScenario.templateKey}`);
        
        // 基础结构
        let structure = [
            `# [智能生成的${detectedScenario.name}数据报告]`,
            `## 数据收集说明`,
            `### 数据模式: ${dataPattern}`,
            `### 数据质量: ${dataQuality.overall_rating}`,
            `### 收集时间: ${new Date().toLocaleDateString('zh-CN')}`
        ];
        
        // 根据模板Key添加特定章节
        if (detectedScenario.templateKey === 'tech_comparison') {
            structure.push(
                '## 表1: 核心参数对比',
                '## 表2: 性能测试数据',
                '## 表3: 成本与定价',
                '## 表4: 生态支持对比',
                '## 时间线数据',
                '## 数据质量说明',
                '## 资料来源'
            );
        } else if (detectedScenario.templateKey === 'financial') {
            structure.push(
                '## 表1: 财务指标对比',
                '## 表2: 市场表现数据',
                '## 表3: 估值数据对比',
                '## 表4: 风险指标',
                '## 时间序列图表',
                '## 数据验证说明',
                '## 资料来源'
            );
        } else if (detectedScenario.templateKey === 'business_data') {
        // 🔥 添加 business_data 结构 - 与模板完全一致
            structure.push(
                '## 表1: 市场规模数据',
                '## 表2: 企业竞争数据',
                '## 表3: 产业链数据',
                '## 表4: 财务指标对比',
                '## 时间序列图表',
                '## 数据验证说明',
                '## 资料来源'
        );
        } else if (detectedScenario.templateKey === 'academic_data') {
            structure.push(
                '## 表1: 实验数据',
                '## 表2: 统计分析',
                '## 表3: 文献引用数据',
                '## 表4: 方法论对比',
                '## 原始数据清单',
                '## 数据可重复性说明',
                '## 资料来源'
            );
        } else {
            // 通用结构（templateKey === 'generic'）
            structure.push(
                '## 一、结构化数据表格',
                '## 二、时间序列数据',
                '## 三、分类对比数据',
                '## 四、地理位置数据',
                '## 五、非结构化数据清单',
                '## 数据质量评估',
                '## 资料来源'
            );
        }
        
        return structure;
    }
    
    /**
     * 🔥 获取兼容模板的指令
     */
    getCompatibleInstructions(detectedScenario, template) {
        const templateKey = detectedScenario.templateKey;
        
        // 如果模板有要求，优先使用
        if (template?.config?.requirements) {
            return template.config.requirements;
        }
        
        // 否则使用预设指令
        const instructions = {
            tech_comparison: `科技产品对比专用要求：
1. 对比维度清晰明确
2. 参数名称统一标准化
3. 性能指标分离展示
4. 每个对比项单独标注来源
5. 使用表格形式呈现对比数据`,
            financial: `金融数据专用要求：
1. 财务指标符合会计准则
2. 时间频率明确（年/季/月）
3. 货币单位统一
4. 风险指标单独列出
5. 市场对比数据完整`,
            business_data: `商业市场数据专用要求：
1. 市场规模数据完整
2. 企业竞争数据准确
3. 产业链结构清晰
4. 财务指标可比
5. 时间序列连续`,  // 🔥 新增 business_data 指令
            academic_data: `学术研究数据专用要求：
1. 实验数据详细完整
2. 统计方法说明清晰
3. 引用数据准确无误
4. 方法论对比客观
5. 数据可重复性说明`,
            generic: `通用数据收集要求：
1. 数据分层清晰
2. 格式统一规范
3. 质量分级明确
4. 来源可追溯
5. 完整性说明详细`
        };
        
        return instructions[templateKey] || instructions.generic;
    }
    
    /**
     * 🔥 获取场景映射信息
     */
    getScenarioMappingInfo(detectedScenario, template) {
        const templateKey = detectedScenario.templateKey;
        const hasAdapter = template?.config?.scenario_adapters?.[templateKey];
        
        if (detectedScenario.isDirectMatch && hasAdapter) {
            return `✅ 直接匹配: ${detectedScenario.name} → ${templateKey}`;
        } else if (hasAdapter) {
            return `🔄 智能映射: ${detectedScenario.name} → ${templateKey}`;
        } else {
            return `⚠️ 使用通用适配器: ${detectedScenario.name} → generic`;
        }
    }
    
    /**
     * 🔥 评估数据质量 - 完全兼容模板评级
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
        const lengthScore = Math.min(stats.avg_observation_length / 500, 1);
        const diversityScore = stats.source_diversity;
        
        const overallScore = (
            successRate * 0.3 +
            structureRate * 0.4 +
            lengthScore * 0.2 +
            diversityScore * 0.1
        );
        
        // 🔥 完全兼容模板的评级系统：A/B/C/D级
        let qualityRating, qualityLevel;
        if (overallScore >= 0.8) {
            qualityRating = 'A级 (优秀)';
            qualityLevel = 'A级';
        } else if (overallScore >= 0.6) {
            qualityRating = 'B级 (良好)';
            qualityLevel = 'B级';
        } else if (overallScore >= 0.4) {
            qualityRating = 'C级 (一般)';
            qualityLevel = 'C级';
        } else {
            qualityRating = 'D级 (待改进)';
            qualityLevel = 'D级';
        }
        
        return {
            overall_score: overallScore,
            overall_rating: qualityLevel, // 模板兼容的评级
            rating_display: qualityRating, // 显示用评级
            metrics: {
                success_rate: successRate,
                structure_rate: structureRate,
                avg_length: stats.avg_observation_length,
                source_diversity: stats.source_diversity,
                table_count: stats.total_tables,
                list_count: stats.total_lists
            },
            structured_ratio: `${(structureRate * 100).toFixed(1)}%`,
            recommendation: this.getQualityRecommendation(overallScore, stats),
            template_compatible: true // 标记为模板兼容
        };
    }
    
    /**
     * 🔥 获取质量改进建议（兼容模板）
     */
    getQualityRecommendation(score, stats) {
        if (score >= 0.8) {
            return "数据质量A级：优秀，已满足分析需求";
        } else if (score >= 0.6) {
            return "数据质量B级：良好，建议增加数据多样性";
        } else if (score >= 0.4) {
            const recommendations = [];
            if (stats.table_count < 2) recommendations.push("增加表格数据收集");
            if (stats.avg_observation_length < 300) recommendations.push("增加数据详细程度");
            if (stats.source_diversity < 0.5) recommendations.push("增加来源多样性");
            return `数据质量C级：一般，建议：${recommendations.join('；')}`;
        } else {
            return "数据质量D级：待改进，建议重新设计数据收集策略";
        }
    }
    
    /**
     * 🔥 数据表格降级方案（保持原样）
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
     * 🔥 提取所有结构化数据（增强版）
     */
    extractAllStructuredData(intermediateSteps, includeSections = true, dataBus = null) {
        console.log('[DataMiningEngine] 提取结构化数据，DataBus大小:', dataBus?.size || 0);
        
        // 1. 优先从 DataBus 获取原始结构化数据
        if (dataBus && dataBus.size > 0) {
            const structuredData = this._extractFromDataBus(dataBus);
            if (structuredData.length > 0) {
                console.log(`[DataMiningEngine] ✅ 从DataBus获取 ${structuredData.length} 个数据块`);
                return structuredData;
            }
        }
        
        // 2. 降级到 intermediateSteps 提取
        console.warn('[DataMiningEngine] ⚠️ DataBus无结构化数据，从摘要中提取');
        return this._extractFromIntermediateSteps(intermediateSteps, includeSections);
    }

    _extractFromDataBus(dataBus) {
        const structuredData = [];
        
        dataBus.forEach((value, key) => {
            const data = value.originalData || value.rawData;
            const meta = value.metadata;
            
            // 只处理结构化数据或网页数据
            if (meta.contentType === 'structured_data' || meta.contentType === 'webpage') {
                // 提取表格
                const tables = this.extractTablesFromText(data);
                if (tables.length > 0) {
                    structuredData.push(`## 📊 DataBus: ${key} (${meta.toolName})`);
                    structuredData.push(...tables);
                }
                
                // 提取列表
                const lists = this.extractListsFromText(data);
                if (lists.length > 0) {
                    structuredData.push(`## 📝 DataBus列表: ${key}`);
                    structuredData.push(...lists);
                }
            }
        });
        
        return structuredData;
    }
    
    _extractFromIntermediateSteps(intermediateSteps, includeSections = true) {
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

            return [summary, ...dataSections];
        }
        
        return dataSections;
    }
    
    /**
     * 🔥 从文本中提取表格（保持原样）
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
     * 🔥 从文本中提取列表（保持原样）
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
     * 🔥 提取键值对数据（保持原样）
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
     * 🔥 格式化键值对数据（保持原样）
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
     * 🔥 检测数据模式（保持原样）
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
     * 🔥 获取自适应模板（保持原样）
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
     * 🔥 评估来源可信度（保持原样）
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
     * 🔥 清理表格格式（保持原样）
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
     * 🔥 建议下一步行动（保持原样）
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
     * 🔥 优化搜索关键词（保持原样）
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
     * 🔥 构建数据挖掘专用的工具调用指南（保持原样）
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
    
    /**
     * 🔥 新增：验证模板兼容性
     */
    validateTemplateCompatibility(template) {
        const requiredScenarios = ['tech_comparison', 'financial','business_data','academic_data', 'generic'];
        const templateScenarios = Object.keys(template?.config?.scenario_adapters || {});
        
        const missingScenarios = requiredScenarios.filter(s => !templateScenarios.includes(s));
        const extraScenarios = templateScenarios.filter(s => !requiredScenarios.includes(s));
        
        const matchScore = (templateScenarios.length / requiredScenarios.length) * 100;
        
        return {
            isCompatible: missingScenarios.length === 0,
            missingScenarios,
            extraScenarios,
            matchScore,
            status: matchScore >= 100 ? '完美兼容' : 
                   matchScore >= 75 ? '基本兼容' : 
                   matchScore >= 50 ? '部分兼容' : '不兼容'
        };
    }
    
    /**
     * 🔥 新增：获取模板兼容性报告
     */
    getCompatibilityReport(template) {
        const compatibility = this.validateTemplateCompatibility(template);
        const engineScenarios = Object.values(this.scenarioDetector.scenarios)
            .map(s => ({ name: s.templateKey, hasAdapter: !!template?.config?.scenario_adapters?.[s.templateKey] }));
        
        return {
            engineVersion: '完全兼容模板版 v1.0',
            templateName: template?.name || '未知模板',
            compatibility,
            scenarioMapping: engineScenarios,
            recommendations: compatibility.missingScenarios.map(s => `建议在模板中添加 ${s} 场景适配器`)
        };
    }
}