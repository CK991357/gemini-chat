// src/tool-spec-system/skill-cache-compressor.js
// 🎯 重构版本：智能内容识别 + 分层压缩策略

// 内容类型分析器
class ContentTypeAnalyzer {
    constructor() {
        this.patterns = {
            // 完整技能文档特征
            fullSkill: [
                /## 🎯 【至关重要】通用调用结构/i,
                /## 🚀 输出规范 - 后端实际支持的格式/i,
                /## 💡 核心工作流模式/i,
                /name: \w+/,
                /description: /i,
                /tool_name: /
            ],
            
            // 图表内容特征
            chartContent: [
                /```python[\s\S]*?plt\.(plot|pie|bar|scatter|imshow|hist)/i,
                /matplotlib_cookbook\.md/,
                /图表类型选择指南/,
                /可直接使用的代码模板/
            ],
            
            // 核心调用结构特征
            coreStructure: [
                /通用调用结构/,
                /```json[\s\S]*?tool_name.*?:.*?python_sandbox/i,
                /参数必须嵌套在 "parameters" 对象内/
            ],
            
            // 代码示例特征
            codeExamples: [
                /```python[\s\S]*?```/,
                /plt\.show\(\)/,
                /import matplotlib/
            ]
        };
    }
    
    analyze(content) {
        const analysis = {
            type: 'unknown',
            confidence: 0,
            features: {},
            recommendations: []
        };
        
        // 检查每种类型特征
        for (const [type, patterns] of Object.entries(this.patterns)) {
            let matches = 0;
            for (const pattern of patterns) {
                if (pattern.test(content)) {
                    matches++;
                }
            }
            
            const confidence = matches / Math.max(patterns.length, 1);
            analysis.features[type] = {
                matches,
                total: patterns.length,
                confidence
            };
        }
        
        // 判断主要类型
        const { 
            fullSkill, 
            chartContent, 
            coreStructure, 
            codeExamples 
        } = analysis.features;
        
        // 规则1：如果有完整的技能文档特征
        if (fullSkill.confidence > 0.7) {
            analysis.type = 'fullSkill';
            analysis.confidence = fullSkill.confidence;
        }
        // 规则2：如果是图表内容
        else if (chartContent.confidence > 0.6 && codeExamples.confidence > 0.4) {
            analysis.type = 'chartContent';
            analysis.confidence = chartContent.confidence;
            analysis.recommendations.push('保留完整代码示例');
        }
        // 规则3：如果是混合内容
        else if (coreStructure.confidence > 0.3 || codeExamples.confidence > 0.3) {
            analysis.type = 'mixedContent';
            analysis.confidence = Math.max(coreStructure.confidence, codeExamples.confidence);
        }
        // 规则4：通用内容
        else {
            analysis.type = 'genericContent';
            analysis.confidence = 0.5;
        }
        
        // 计算代码块数量
        analysis.codeBlocks = (content.match(/```python/g) || []).length;
        analysis.jsonExamples = (content.match(/```json/g) || []).length;
        analysis.sections = (content.match(/#{1,3} /g) || []).length;
        analysis.length = content.length;
        
        console.log(`🔍 [内容分析] 类型: ${analysis.type}, 置信度: ${analysis.confidence.toFixed(2)}`);
        console.log(`📊 [内容统计] 代码块: ${analysis.codeBlocks}, JSON示例: ${analysis.jsonExamples}, 章节: ${analysis.sections}, 长度: ${analysis.length}`);
        
        return analysis;
    }
}

// 压缩质量监控器（优化版）
class CompressionQualityMonitor {
    constructor() {
        this.qualityMetrics = [];
        this.qualityThresholds = {
            low: 0.5,
            medium: 0.7,
            high: 0.85
        };
    }
    
    trackCompression(toolName, originalSize, compressedSize, userQuery, compressedContent, contentType) {
        const metric = {
            timestamp: Date.now(),
            toolName,
            contentType: contentType.type,
            originalSize,
            compressedSize,
            compressionRate: 1 - (compressedSize / Math.max(originalSize, 1)),
            userQuery: userQuery.substring(0, 50),
            qualityScore: this.calculateQualityScore(compressedContent, contentType, userQuery),
            keyElementsPresent: this.checkKeyElements(compressedContent, contentType, toolName),
            contentTypeAnalysis: contentType
        };
        
        this.qualityMetrics.push(metric);
        
        // 质量分级反馈
        const level = this.getQualityLevel(metric.qualityScore);
        if (level === 'low') {
            console.warn(`⚠️ 压缩质量低: ${toolName}, 评分: ${metric.qualityScore.toFixed(2)}`);
        } else if (level === 'high') {
            console.log(`✅ 压缩质量高: ${toolName}, 评分: ${metric.qualityScore.toFixed(2)}`);
        }
        
        return metric;
    }
    
    getQualityLevel(score) {
        if (score < this.qualityThresholds.low) return 'low';
        if (score < this.qualityThresholds.medium) return 'medium';
        return 'high';
    }
    
    calculateQualityScore(content, contentType, userQuery) {
        // 根据内容类型使用不同的评分标准
        switch (contentType.type) {
            case 'fullSkill':
                return this.scoreFullSkill(content, userQuery);
            case 'chartContent':
                return this.scoreChartContent(content, userQuery);
            case 'mixedContent':
                return this.scoreMixedContent(content, userQuery);
            default:
                return this.scoreGenericContent(content);
        }
    }
    
    scoreFullSkill(content, userQuery) {
        const checks = [
            { test: /通用调用结构/.test(content), weight: 0.25, desc: '核心调用结构' },
            { test: /输出规范/.test(content), weight: 0.20, desc: '输出规范' },
            { test: /核心工作流模式/.test(content), weight: 0.15, desc: '工作流模式' },
            { test: /```json/.test(content), weight: 0.15, desc: 'JSON示例' },
            { test: /```python/.test(content), weight: 0.10, desc: '代码示例' },
            { test: content.length >= 3000 && content.length <= 15000, weight: 0.10, desc: '合适长度' },
            { test: this.containsQueryKeywords(content, userQuery), weight: 0.05, desc: '查询相关性' }
        ];
        
        return checks.reduce((score, check) => 
            score + (check.test ? check.weight : 0), 0
        );
    }
    
    scoreChartContent(content, userQuery) {
        const checks = [
            { test: /```python/.test(content), weight: 0.40, desc: '代码块' },
            { test: /plt\.(plot|pie|bar|scatter|imshow|hist)/.test(content), weight: 0.25, desc: '图表函数' },
            { test: /plt\.show\(\)/.test(content), weight: 0.15, desc: '显示调用' },
            { test: /图表|plot|chart/i.test(content), weight: 0.10, desc: '图表描述' },
            { test: this.containsQueryKeywords(content, userQuery), weight: 0.10, desc: '查询相关性' }
        ];
        
        return checks.reduce((score, check) => 
            score + (check.test ? check.weight : 0), 0
        );
    }
    
    scoreMixedContent(content, userQuery) {
        const checks = [
            { test: /通用调用结构/.test(content), weight: 0.15, desc: '调用结构' },
            { test: /```python/.test(content), weight: 0.25, desc: '代码示例' },
            { test: /#{1,3} /.test(content), weight: 0.15, desc: '章节结构' },
            { test: content.length >= 2000 && content.length <= 10000, weight: 0.20, desc: '合适长度' },
            { test: this.containsQueryKeywords(content, userQuery), weight: 0.25, desc: '查询相关性' }
        ];
        
        return checks.reduce((score, check) => 
            score + (check.test ? check.weight : 0), 0
        );
    }
    
    scoreGenericContent(content) {
        // 基础评分，确保内容有效
        const checks = [
            { test: content && content.length > 0, weight: 0.4 },
            { test: content.length >= 1000 && content.length <= 8000, weight: 0.3 },
            { test: /#{1,3} |```/.test(content), weight: 0.3 }
        ];
        
        return checks.reduce((score, check) => 
            score + (check.test ? check.weight : 0), 0
        );
    }
    
    containsQueryKeywords(content, userQuery) {
        if (!userQuery || userQuery.length < 3) return true;
        
        const keywords = this.extractKeywords(userQuery);
        if (keywords.length === 0) return true;
        
        const contentLower = content.toLowerCase();
        const matches = keywords.filter(keyword => 
            keyword.length > 2 && contentLower.includes(keyword)
        ).length;
        
        return matches > 0;
    }
    
    extractKeywords(query) {
        const stopWords = new Set([
            '测试', '代码', '解释器', '可视化', '画一张', '一张', '一个', '一些',
            '这个', '那个', '怎么', '如何', '请', '谢谢', '你好', '请问', '可以'
        ]);
        
        return query
            .toLowerCase()
            .split(/[\s,，、.。!！?？]+/)
            .filter(word => 
                word.length > 1 && 
                !stopWords.has(word) &&
                !/^\d+$/.test(word)
            );
    }
    
    checkKeyElements(content, contentType, toolName) {
        const keyElements = {
            'python_sandbox': {
                fullSkill: ['通用调用结构', '输出规范', '核心工作流模式', '```json', '```python'],
                chartContent: ['```python', 'plt.show()', 'plt.plot', 'plt.pie', 'plt.bar'],
                mixedContent: ['```python', '通用调用结构', '```json'],
                genericContent: ['#', '```']
            },
            'crawl4ai': {
                fullSkill: ['通用调用结构', '模式选择指南', '```json'],
                chartContent: [],
                mixedContent: ['通用调用结构', '```json'],
                genericContent: ['#', '```']
            }
        };
        
        const elements = keyElements[toolName]?.[contentType.type] || keyElements.default?.[contentType.type] || [];
        return elements.filter(element => content.includes(element));
    }
}

export class SkillCacheCompressor {
  constructor() {
    // 🎯 缓存系统
    this.knowledgeCache = new Map();
    this.injectionHistory = new Map();
    
    // 🎯 压缩配置 - 基于内容类型动态调整
    this.compressionEnabled = true;
    
    // 🎯 会话管理
    this.activeSessions = new Map();
    
    // 🎯 分析器和监控器
    this.contentAnalyzer = new ContentTypeAnalyzer();
    this.qualityMonitor = new CompressionQualityMonitor();
    
    // 🎯 内容类型特定的压缩配置
    this.contentTypeConfig = {
      // 完整技能文档：保守压缩，保留结构
      'fullSkill': {
        compressionThreshold: 12000,    // 超过12KB才压缩
        maxCompressionRate: 0.2,        // 最多压缩20%
        minPreservedLength: 8000,       // 至少保留8KB
        preserveSections: [
          '通用调用结构',
          '输出规范', 
          '核心工作流模式',
          '快速开始模板'
        ],
        strategy: 'extract_core',
        description: '完整技能文档，保留核心结构'
      },
      
      // 图表内容：几乎不压缩，保留所有代码
      'chartContent': {
        compressionThreshold: 30000,    // 图表内容几乎不压缩
        maxCompressionRate: 0.05,       // 最多压缩5%
        minPreservedLength: 10000,      // 至少保留10KB
        preserveSections: [
          '可直接使用的代码模板',
          '```python',
          'plt.show()'
        ],
        strategy: 'format_only',
        description: '图表内容，保留完整代码示例'
      },
      
      // 混合内容：智能提取
      'mixedContent': {
        compressionThreshold: 8000,    // 超过8KB才压缩
        maxCompressionRate: 0.5,        // 最多压缩50%
        minPreservedLength: 6000,       // 至少保留6KB
        preserveSections: [
          '通用调用结构',
          '```python',
          '```json'
        ],
        strategy: 'smart_mix',
        description: '混合内容，智能平衡结构和示例'
      },
      
      // 通用内容：基本压缩
      'genericContent': {
        compressionThreshold: 10000,    // 超过10KB才压缩
        maxCompressionRate: 0.4,        // 最多压缩40%
        minPreservedLength: 4000,       // 至少保留4KB
        preserveSections: [
          '#',
          '```'
        ],
        strategy: 'minimal_compress',
        description: '通用内容，基本压缩'
      }
    };
    
    // 🎯 工具特定配置
    this.toolTypeConfig = {
      'python_sandbox': {
        maxTotalChars: 20000,
        defaultContentType: 'mixedContent'
      },
      'crawl4ai': {
        maxTotalChars: 18000,
        defaultContentType: 'fullSkill'
      },
      'default': {
        maxTotalChars: 15000,
        defaultContentType: 'genericContent'
      }
    };
    
    console.log('✅ SkillCacheCompressor 重构版已加载（智能内容识别）');
  }

  /**
   * 🎯 核心：智能知识压缩算法 - 重构版
   */
  async compressKnowledge(content, options = {}) {
    let {
      level = 'smart',
      maxChars = 20000,
      userQuery = '',
      toolName = 'unspecified_tool',
      preserveSections = []
    } = options;

    console.log(`📦 [压缩开始] 工具: ${toolName}, 原始大小: ${content.length}字符`);

    // 🎯 第一步：内容类型分析
    const contentType = this.contentAnalyzer.analyze(content);
    
    // 如果内容很小，直接返回
    if (content.length < 2000) {
      console.log(`📦 [保留完整] 内容较小(${content.length})，直接返回`);
      return content;
    }

    // 🎯 第二步：获取类型特定配置
    const typeConfig = this.contentTypeConfig[contentType.type] || this.contentTypeConfig.genericContent;
    const toolConfig = this.toolTypeConfig[toolName] || this.toolTypeConfig.default;
    
    // 合并保留章节
    const allPreserveSections = [...new Set([
      ...typeConfig.preserveSections,
      ...preserveSections
    ])];

    // 🎯 第三步：压缩决策
    const compressionDecision = this.decideCompressionStrategy(
      content, 
      contentType,
      typeConfig,
      toolConfig,
      maxChars
    );

    // 如果决定不压缩
    if (!compressionDecision.shouldCompress) {
      console.log(`📦 [压缩跳过] 原因: ${compressionDecision.reason}`);
      return content;
    }

    console.log(`📦 [压缩决策] 策略: ${compressionDecision.strategy}, 目标大小: ${compressionDecision.targetSize}字符`);

    // 🎯 第四步：执行压缩
    let compressed;
    try {
      compressed = await this.executeCompression(
        content,
        compressionDecision,
        contentType,
        userQuery,
        toolName,
        allPreserveSections
      );
    } catch (error) {
      console.error(`🚨 [压缩执行失败]`, error);
      compressed = this.fallbackCompression(content, compressionDecision.targetSize);
    }

    // 🎯 第五步：质量评估
    const qualityReport = this.qualityMonitor.trackCompression(
      toolName,
      content.length,
      compressed.length,
      userQuery,
      compressed,
      contentType
    );

    // 🎯 第六步：质量过低时回退
    if (qualityReport.qualityScore < 0.5 && compressed.length < content.length * 0.7) {
      console.warn(`⚠️ 压缩质量过低(${qualityReport.qualityScore.toFixed(2)})，回退到较少压缩`);
      compressed = this.qualityFallback(content, compressed, compressionDecision.targetSize);
    }

    // 🎯 第七步：最终调整
    compressed = this.finalizeContent(compressed, compressionDecision.targetSize, contentType);

    // 压缩统计
    const compressionRate = ((1 - compressed.length / content.length) * 100).toFixed(1);
    const bytesSaved = content.length - compressed.length;
    
    console.log(`✅ [压缩完成] ${content.length} → ${compressed.length}字符`);
    console.log(`📊 [压缩统计] 压缩率: ${compressionRate}%, 节省: ${bytesSaved}字符`);
    console.log(`📊 [质量评分] 综合质量: ${qualityReport.qualityScore.toFixed(2)}`);
    console.log(`📊 [内容类型] ${contentType.type}, 代码块: ${contentType.codeBlocks}`);
    
    if (qualityReport.keyElementsPresent.length > 0) {
      console.log(`📊 [关键元素] 保留: ${qualityReport.keyElementsPresent.join(', ')}`);
    }

    return compressed;
  }

  /**
   * 🎯 压缩决策
   */
  decideCompressionStrategy(content, contentType, typeConfig, toolConfig, maxChars) {
    const contentLength = content.length;
    
    // 1. 检查是否应该压缩
    const shouldCompress = 
      contentLength > typeConfig.compressionThreshold &&
      this.compressionEnabled;
    
    if (!shouldCompress) {
      return {
        shouldCompress: false,
        reason: `内容大小(${contentLength})未达到压缩阈值(${typeConfig.compressionThreshold})或压缩已禁用`
      };
    }
    
    // 2. 计算目标大小
    const toolMaxChars = toolConfig.maxTotalChars || maxChars;
    const calculatedTarget = Math.min(
      contentLength * (1 - typeConfig.maxCompressionRate),
      toolMaxChars
    );
    
    const targetSize = Math.max(
      calculatedTarget,
      typeConfig.minPreservedLength
    );
    
    return {
      shouldCompress: true,
      strategy: typeConfig.strategy,
      targetSize,
      typeConfig,
      toolConfig,
      reason: `${contentType.type}内容，使用${typeConfig.strategy}策略`
    };
  }

  /**
   * 🎯 执行压缩
   */
  async executeCompression(content, decision, contentType, userQuery, toolName, preserveSections) {
    console.log(`⚙️ [执行压缩] 策略: ${decision.strategy}`);
    
    switch (decision.strategy) {
      case 'extract_core':
        return this.extractCoreSections(content, decision.targetSize, preserveSections);
        
      case 'format_only':
        return this.formatAndOrganize(content, decision.targetSize, userQuery);
        
      case 'smart_mix':
        return this.smartMixedCompression(content, decision.targetSize, contentType, userQuery, toolName);
        
      case 'minimal_compress':
        return this.minimalCompression(content, decision.targetSize);
        
      default:
        return this.smartCompression(content, decision.targetSize, preserveSections);
    }
  }

  /**
   * 🎯 提取核心章节
   */
  extractCoreSections(content, targetSize, preserveSections) {
    let result = '';
    
    // 第一步：提取保留章节
    for (const sectionKeyword of preserveSections) {
      if (result.length >= targetSize * 0.8) break;
      
      if (sectionKeyword.startsWith('```')) {
        // 提取代码块
        const codeBlocks = content.match(new RegExp(sectionKeyword + '[\\s\\S]*?' + sectionKeyword, 'g')) || [];
        for (const block of codeBlocks.slice(0, 2)) {
          if (result.length + block.length + 10 <= targetSize) {
            result += block + '\n\n';
          }
        }
      } else {
        // 提取章节
        const sectionRegex = new RegExp(`##.*?${sectionKeyword}.*?[\\s\\S]*?(?=\\n##|$)`, 'i');
        const match = content.match(sectionRegex);
        if (match && result.length + match[0].length + 10 <= targetSize) {
          result += match[0] + '\n\n';
        }
      }
    }
    
    // 第二步：如果内容不足，添加开头部分
    if (result.length < targetSize * 0.5) {
      const titleMatch = content.match(/^#{1,2}\s+[^\n]+[\s\S]*?(?=\n##|\n#|$)/);
      if (titleMatch && result.length + titleMatch[0].length + 10 <= targetSize) {
        result = titleMatch[0] + '\n\n' + result;
      }
    }
    
    // 第三步：确保达到最小长度
    if (result.length < 3000 && result.length < targetSize) {
      const moreContent = content.substring(0, Math.min(targetSize - result.length, 5000));
      result += '\n' + moreContent;
    }
    
    return result;
  }

  /**
   * 🎯 格式化和整理（图表内容专用）
   */
  formatAndOrganize(content, targetSize, userQuery) {
    console.log(`📊 [格式化图表内容] 查询: "${userQuery.substring(0, 30)}..."`);
    
    let formatted = '';
    
    // 1. 提取所有代码块
    const codeBlocks = content.match(/```python[\s\S]*?```/g) || [];
    console.log(`📊 [代码块数量] ${codeBlocks.length}`);
    
    // 2. 根据查询关键词排序代码块
    const sortedBlocks = this.sortCodeBlocksByRelevance(codeBlocks, userQuery);
    
    // 3. 添加标题
    formatted += `## 💻 可直接使用的代码模板\n\n`;
    
    // 4. 添加最相关的代码块
    let addedBlocks = 0;
    for (const block of sortedBlocks) {
      if (formatted.length + block.length + 50 <= targetSize && addedBlocks < 3) {
        formatted += `**模板 ${addedBlocks + 1}**:\n\n`;
        formatted += block + '\n\n';
        addedBlocks++;
      }
    }
    
    // 5. 如果没有代码块，提取一些示例
    if (addedBlocks === 0) {
      const exampleCode = this.createFallbackChartExample(userQuery);
      formatted += exampleCode;
    }
    
    // 6. 添加使用说明
    formatted += `\n## 🚀 使用指南\n\n`;
    formatted += `1. 复制以上代码到Python沙盒中执行\n`;
    formatted += `2. 确保包含 \`plt.show()\` 调用\n`;
    formatted += `3. 图表会自动生成并显示\n`;
    formatted += `4. 可以修改数据部分定制您的图表\n`;
    
    return formatted.length > targetSize 
      ? formatted.substring(0, targetSize - 100) + '\n\n...'
      : formatted;
  }

  /**
   * 🎯 智能混合压缩
   */
  smartMixedCompression(content, targetSize, contentType, userQuery, toolName) {
    console.log(`🔄 [智能混合压缩] ${toolName}, 查询: "${userQuery.substring(0, 30)}..."`);
    
    let compressed = '';
    const sections = [];
    
    // 1. 提取核心调用结构（如果存在）
    const coreSection = content.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##|$)/i);
    if (coreSection && coreSection[0].length < targetSize * 0.4) {
      sections.push({ content: coreSection[0], type: 'core', priority: 1 });
    }
    
    // 2. 提取与查询相关的部分
    const relevantSections = this.extractRelevantSections(content, userQuery, targetSize * 0.3);
    if (relevantSections) {
      sections.push({ content: relevantSections, type: 'relevant', priority: 2 });
    }
    
    // 3. 提取代码示例
    const codeExamples = this.extractBestCodeExamples(content, userQuery, targetSize * 0.3);
    if (codeExamples) {
      sections.push({ content: codeExamples, type: 'code', priority: 3 });
    }
    
    // 4. 按优先级排序并组合
    sections.sort((a, b) => a.priority - b.priority);
    
    for (const section of sections) {
      if (compressed.length + section.content.length + 20 <= targetSize) {
        compressed += section.content + '\n\n';
      } else {
        // 如果放不下，尝试截断
        const spaceLeft = targetSize - compressed.length - 50;
        if (spaceLeft > 500) {
          compressed += section.content.substring(0, spaceLeft) + '...\n\n';
        }
        break;
      }
    }
    
    // 5. 确保有足够内容
    if (compressed.length < targetSize * 0.3) {
      compressed = this.extractFallbackContent(content, targetSize);
    }
    
    return compressed;
  }

  /**
   * 🎯 提取相关章节
   */
  extractRelevantSections(content, userQuery, maxLength) {
    const queryLower = userQuery.toLowerCase();
    const keywords = this.extractKeywords(queryLower);
    
    if (keywords.length === 0) return '';
    
    // 查找所有章节
    const sectionRegex = /(#{2,3}\s+[^\n]+)([\s\S]*?)(?=\n#{2,3}\s|$)/g;
    let relevantContent = '';
    let match;
    
    while ((match = sectionRegex.exec(content)) !== null) {
      const [fullMatch, title, sectionContent] = match;
      const sectionText = (title + ' ' + sectionContent).toLowerCase();
      
      // 检查是否包含关键词
      const hasKeyword = keywords.some(keyword => 
        keyword.length > 2 && sectionText.includes(keyword)
      );
      
      if (hasKeyword && relevantContent.length + fullMatch.length <= maxLength) {
        relevantContent += fullMatch + '\n\n';
      }
    }
    
    return relevantContent;
  }

  /**
   * 🎯 提取最佳代码示例
   */
  extractBestCodeExamples(content, userQuery, maxLength) {
    const codeBlocks = content.match(/```python[\s\S]*?```/g) || [];
    if (codeBlocks.length === 0) return '';
    
    const queryLower = userQuery.toLowerCase();
    
    // 根据查询类型选择代码示例
    let selectedBlocks = [];
    
    if (queryLower.includes('折线图') || queryLower.includes('line') || queryLower.includes('plot')) {
      selectedBlocks = codeBlocks.filter(block => 
        block.includes('plt.plot') || block.includes('plot(')
      );
    } else if (queryLower.includes('饼图') || queryLower.includes('pie')) {
      selectedBlocks = codeBlocks.filter(block => 
        block.includes('plt.pie') || block.includes('pie(')
      );
    } else if (queryLower.includes('条形图') || queryLower.includes('柱状图') || queryLower.includes('bar')) {
      selectedBlocks = codeBlocks.filter(block => 
        block.includes('plt.bar') || block.includes('bar(')
      );
    }
    
    // 如果特定类型不够，取通用的代码块
    if (selectedBlocks.length < 2) {
      selectedBlocks = codeBlocks.slice(0, 2);
    }
    
    // 构建输出
    let examples = '## 💻 相关代码示例\n\n';
    selectedBlocks.slice(0, 2).forEach((block, index) => {
      examples += `**示例 ${index + 1}**:\n\n${block}\n\n`;
    });
    
    return examples.length <= maxLength ? examples : examples.substring(0, maxLength) + '...';
  }

  /**
   * 🎯 最小化压缩
   */
  minimalCompression(content, targetSize) {
    let result = '';
    
    // 1. 提取标题
    const titleMatch = content.match(/^#{1,2}\s+[^\n]+/);
    if (titleMatch) {
      result += titleMatch[0] + '\n\n';
    }
    
    // 2. 提取第一段
    const firstPara = content.split('\n\n').find(p => 
      p.trim().length > 50 && !p.startsWith('#')
    );
    if (firstPara) {
      result += firstPara.substring(0, 300) + '\n\n';
    }
    
    // 3. 提取一个代码示例
    const codeBlock = content.match(/```python[\s\S]*?```/);
    if (codeBlock) {
      result += '## 💻 示例代码\n\n';
      result += codeBlock[0] + '\n\n';
    }
    
    // 4. 确保达到目标长度
    if (result.length < targetSize) {
      const moreContent = content.substring(result.length, Math.min(result.length + 3000, content.length));
      result += moreContent;
    }
    
    return result.length > targetSize 
      ? result.substring(0, targetSize - 100) + '\n\n...'
      : result;
  }

  /**
   * 🎯 智能压缩
   */
  smartCompression(content, targetSize, preserveSections) {
    // 这是通用智能压缩，会尽量保留结构和关键内容
    const paragraphs = content.split('\n\n');
    let result = '';
    let inImportantSection = false;
    
    for (const para of paragraphs) {
      if (result.length >= targetSize) break;
      
      // 检查是否重要段落
      const isImportant = preserveSections.some(keyword => 
        para.includes(keyword)
      ) || para.startsWith('#') || para.startsWith('```');
      
      if (isImportant || inImportantSection) {
        if (result.length + para.length + 2 <= targetSize) {
          result += para + '\n\n';
        } else {
          // 如果重要内容放不下，尽量放一部分
          const spaceLeft = targetSize - result.length - 10;
          if (spaceLeft > 100) {
            result += para.substring(0, spaceLeft) + '...\n\n';
          }
          break;
        }
        
        // 如果遇到标题，标记进入重要章节
        if (para.startsWith('##')) {
          inImportantSection = true;
        }
      }
    }
    
    return result || content.substring(0, Math.min(targetSize, content.length));
  }

  /**
   * 🎯 回退压缩
   */
  fallbackCompression(content, targetSize) {
    // 最简单的回退方案：截取开头部分
    const safeTarget = Math.min(targetSize, content.length);
    const result = content.substring(0, safeTarget);
    
    // 如果截断了内容，添加省略号
    if (result.length < content.length) {
      return result + '\n\n...';
    }
    
    return result;
  }

  /**
   * 🎯 质量回退
   */
  qualityFallback(original, compressed, targetSize) {
    // 如果压缩后质量太低，回退到较少压缩
    if (compressed.length < original.length * 0.4) {
      // 压缩太多，回退到70%左右
      const newTarget = Math.min(original.length * 0.7, targetSize * 1.5);
      return this.minimalCompression(original, newTarget);
    }
    
    return compressed;
  }

  /**
   * 🎯 最终内容调整
   */
  finalizeContent(content, targetSize, contentType) {
    // 确保内容以合理的方式结束
    let finalized = content.trim();
    
    // 1. 确保不超过目标大小
    if (finalized.length > targetSize) {
      finalized = finalized.substring(0, targetSize - 100);
      
      // 找到最后一个完整段落结束
      const lastNewline = finalized.lastIndexOf('\n\n');
      if (lastNewline > targetSize * 0.8) {
        finalized = finalized.substring(0, lastNewline);
      }
      
      finalized += '\n\n...';
    }
    
    // 2. 为图表内容添加结束提示
    if (contentType.type === 'chartContent' && !finalized.includes('plt.show()')) {
      finalized += '\n\n**💡 提示**: 记得在代码末尾添加 `plt.show()` 来显示图表。';
    }
    
    // 3. 确保有结尾
    if (!finalized.endsWith('\n') && !finalized.endsWith('...')) {
      finalized += '\n';
    }
    
    return finalized;
  }

  /**
   * 🎯 提取回退内容
   */
  extractFallbackContent(content, targetSize) {
    // 回退方案：取开头部分
    const result = content.substring(0, Math.min(targetSize, content.length));
    
    // 尝试在段落边界截断
    const lastNewline = result.lastIndexOf('\n\n');
    if (lastNewline > targetSize * 0.7) {
      return result.substring(0, lastNewline) + '\n\n...';
    }
    
    return result;
  }

  /**
   * 🎯 根据相关性排序代码块
   */
  sortCodeBlocksByRelevance(codeBlocks, userQuery) {
    if (!userQuery || codeBlocks.length <= 1) return codeBlocks;
    
    const queryLower = userQuery.toLowerCase();
    const keywords = this.extractKeywords(queryLower);
    
    return codeBlocks.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      
      // 计算匹配分数
      const scoreA = keywords.reduce((score, keyword) => 
        score + (aLower.includes(keyword) ? 1 : 0), 0
      );
      
      const scoreB = keywords.reduce((score, keyword) => 
        score + (bLower.includes(keyword) ? 1 : 0), 0
      );
      
      // 优先包含plt.show()的代码块
      if (aLower.includes('plt.show()') && !bLower.includes('plt.show()')) return -1;
      if (!aLower.includes('plt.show()') && bLower.includes('plt.show()')) return 1;
      
      // 按关键词匹配分数排序
      return scoreB - scoreA;
    });
  }

  /**
   * 🎯 创建回退图表示例
   */
  createFallbackChartExample(userQuery) {
    const queryLower = userQuery.toLowerCase();
    
    if (queryLower.includes('折线图') || queryLower.includes('line') || queryLower.includes('plot')) {
      return `\`\`\`python
import matplotlib.pyplot as plt
import numpy as np

# 创建示例数据
x = np.arange(0, 10, 0.1)
y = np.sin(x)

# 绘制折线图
plt.figure(figsize=(10, 6))
plt.plot(x, y, label='sin(x)', color='blue', linewidth=2)
plt.title('折线图示例')
plt.xlabel('X轴')
plt.ylabel('Y轴')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()
\`\`\`\n\n`;
    }
    
    // 默认返回一个通用示例
    return `\`\`\`python
import matplotlib.pyplot as plt

# 简单示例数据
data = [10, 20, 30, 40, 50]
labels = ['A', 'B', 'C', 'D', 'E']

# 绘制图表
plt.figure(figsize=(8, 6))
plt.bar(labels, data)
plt.title('示例图表')
plt.xlabel('类别')
plt.ylabel('数值')
plt.tight_layout()
plt.show()
\`\`\`\n\n`;
  }

  /**
   * 🎯 提取关键词
   */
  extractKeywords(text) {
    if (!text) return [];
    
    const stopWords = new Set([
      '测试', '代码', '解释器', '可视化', '画一张', '一张', '即可',
      '这个', '那个', '怎么', '如何', '请', '谢谢', '你好', '请问'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 1 && 
        !stopWords.has(word) &&
        !/^\d+$/.test(word)
      );
  }

  /**
   * 🎯 缓存管理
   */
  getFromCache(toolName, userQuery, context = {}) {
    const cacheKey = this._generateCacheKey(toolName, userQuery, context);
    
    if (this.knowledgeCache.has(cacheKey)) {
      const cached = this.knowledgeCache.get(cacheKey);
      // 缓存有效（15分钟内）
      if (Date.now() - cached.timestamp < 15 * 60 * 1000) {
        console.log(`🎯 [缓存命中] ${toolName}: ${cached.content.length} 字符`);
        return cached.content;
      }
    }
    
    return null;
  }

  setToCache(toolName, userQuery, context, content) {
    const cacheKey = this._generateCacheKey(toolName, userQuery, context);
    
    this.knowledgeCache.set(cacheKey, {
      content,
      timestamp: Date.now(),
      toolName,
      userQuery: userQuery.substring(0, 50),
      size: content.length
    });
    
    // 限制缓存大小
    if (this.knowledgeCache.size > 150) {
      const oldestKey = Array.from(this.knowledgeCache.keys())[0];
      this.knowledgeCache.delete(oldestKey);
    }
  }

  /**
   * 🎯 生成缓存键
   */
  _generateCacheKey(toolName, userQuery, context) {
    const contextStr = context.sessionId || 'default';
    const queryHash = this._hashString(userQuery.substring(0, 100));
    const contentType = context.contentType || 'auto';
    return `${toolName}_${contentType}_${contextStr}_${queryHash}`;
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 🎯 清理指定会话的所有相关数据
   */
  clearSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      console.warn('❌ clearSession: 无效的会话ID');
      return;
    }
    
    const beforeSize = this.knowledgeCache.size;
    const hadInjectionHistory = this.injectionHistory.has(sessionId);
    
    // 清理注入历史
    if (hadInjectionHistory) {
      this.injectionHistory.delete(sessionId);
    }
    
    // 清理会话相关的缓存
    const deletedKeys = [];
    for (const key of this.knowledgeCache.keys()) {
      if (key.includes(sessionId)) {
        deletedKeys.push(key);
      }
    }
    
    for (const key of deletedKeys) {
      this.knowledgeCache.delete(key);
    }
    
    // 清理活跃会话
    const hadActiveSession = this.activeSessions.has(sessionId);
    if (hadActiveSession) {
      this.activeSessions.delete(sessionId);
    }

    const stats = {
      injectionHistoryRemoved: hadInjectionHistory ? 1 : 0,
      cacheEntriesRemoved: deletedKeys.length,
      activeSessionRemoved: hadActiveSession ? 1 : 0,
      beforeSize,
      afterSize: this.knowledgeCache.size
    };
    
    console.log(`🧹 会话清理完成: ${sessionId}`, stats);
    return stats;
  }

  /**
   * 🎯 获取缓存统计
   */
  getCacheStats() {
    const sizeStats = {};
    for (const [key, value] of this.knowledgeCache) {
      const toolName = key.split('_')[0];
      sizeStats[toolName] = (sizeStats[toolName] || 0) + (value.size || 0);
    }
    
    return {
      cacheSize: this.knowledgeCache.size,
      injectionHistorySize: this.injectionHistory.size,
      activeSessions: this.activeSessions.size,
      totalSize: Object.values(sizeStats).reduce((a, b) => a + b, 0),
      sizeByTool: sizeStats
    };
  }

  /**
   * 🎯 获取压缩统计报告
   */
  getCompressionReport() {
    const recentMetrics = this.qualityMonitor.qualityMetrics.slice(-50);
    const toolStats = {};
    const contentTypeStats = {};
    
    recentMetrics.forEach(metric => {
      // 按工具统计
      if (!toolStats[metric.toolName]) {
        toolStats[metric.toolName] = {
          count: 0,
          totalScore: 0,
          lowQualityCount: 0,
          compressionRates: []
        };
      }
      
      const tool = toolStats[metric.toolName];
      tool.count++;
      tool.totalScore += metric.qualityScore;
      tool.compressionRates.push(metric.compressionRate);
      
      if (metric.qualityScore < 0.5) {
        tool.lowQualityCount++;
      }
      
      // 按内容类型统计
      const contentType = metric.contentTypeAnalysis?.type || 'unknown';
      if (!contentTypeStats[contentType]) {
        contentTypeStats[contentType] = {
          count: 0,
          avgScore: 0,
          totalScore: 0
        };
      }
      
      const type = contentTypeStats[contentType];
      type.count++;
      type.totalScore += metric.qualityScore;
    });
    
    // 计算平均值
    Object.keys(toolStats).forEach(tool => {
      const stats = toolStats[tool];
      if (stats.count > 0) {
        stats.avgScore = stats.totalScore / stats.count;
        stats.lowQualityRate = stats.lowQualityCount / stats.count;
        
        // 计算平均压缩率
        if (stats.compressionRates.length > 0) {
          stats.avgCompressionRate = stats.compressionRates.reduce((a, b) => a + b, 0) / stats.compressionRates.length;
        }
      }
    });
    
    Object.keys(contentTypeStats).forEach(type => {
      const stats = contentTypeStats[type];
      if (stats.count > 0) {
        stats.avgScore = stats.totalScore / stats.count;
      }
    });
    
    return {
      recentMetrics: recentMetrics.length,
      toolStats,
      contentTypeStats,
      config: {
        contentTypeConfig: this.contentTypeConfig,
        toolTypeConfig: this.toolTypeConfig
      },
      qualityThresholds: this.qualityMonitor.qualityThresholds
    };
  }
  
  /**
   * 🎯 重置压缩器配置
   */
  resetConfig(config = {}) {
    if (config.compressionEnabled !== undefined) {
      this.compressionEnabled = config.compressionEnabled;
    }
    
    if (config.contentTypeConfig) {
      Object.assign(this.contentTypeConfig, config.contentTypeConfig);
    }
    
    if (config.toolTypeConfig) {
      Object.assign(this.toolTypeConfig, config.toolTypeConfig);
    }
    
    console.log('🔄 压缩器配置已重置');
  }
}

// 导出单例实例
export const skillCacheCompressor = new SkillCacheCompressor();