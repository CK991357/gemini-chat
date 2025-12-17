// src/tool-spec-system/skill-cache-compressor.js
// 🎯 优化版本：降低压缩率 + 保留更多有用内容

// 添加压缩质量追踪
class CompressionQualityMonitor {
    constructor() {
        this.qualityMetrics = [];
    }
    
    trackCompression(toolName, originalSize, compressedSize, userQuery, compressedContent) {
        const metric = {
            timestamp: Date.now(),
            toolName,
            originalSize,
            compressedSize,
            compressionRate: 1 - (compressedSize / originalSize),
            userQuery: userQuery.substring(0, 100),
            qualityScore: this.calculateQualityScore(compressedContent),
            keyElementsPresent: this.checkKeyElements(compressedContent)
        };
        
        this.qualityMetrics.push(metric);
        
        // 实时质量告警
        if (metric.qualityScore < 0.6) {
            console.warn(`⚠️ 压缩质量低: ${toolName}, 评分: ${metric.qualityScore.toFixed(2)}`);
        }
        
        return metric;
    }
    
    calculateQualityScore(content) {
        // 如果内容太小，返回基础分
        if (!content || content.length < 500) {
            console.log(`📊 [质量评分] 内容太小(${content.length})，返回基础分`);
            return 0.5;
        }
        
        // 检查是否是完整的SKILL.md内容
        const isLikelyFullSkill = content.length > 3000 || 
                                 content.includes('通用调用结构') ||
                                 content.includes('```python');
        
        if (!isLikelyFullSkill) {
            console.log(`📊 [质量评分] 内容可能不是完整技能文档，长度: ${content.length}`);
            return this.calculatePartialContentScore(content);
        }
        
        // 原有的评分逻辑
        const checks = [
            { test: /通用调用结构/.test(content), weight: 0.3 },
            { test: /```json[\s\S]*?```/.test(content), weight: 0.25 },
            { test: /参数|parameters/.test(content), weight: 0.15 },
            { test: content.length >= 200 && content.length <= 15000, weight: 0.1 },
            { test: /#{1,3}\s/.test(content), weight: 0.1 },
            { test: !/\.\.\.$/.test(content.trim()), weight: 0.1 }
        ];
        
        return checks.reduce((score, check) => 
            score + (check.test ? check.weight : 0), 0
        );
    }
    
    // 计算部分内容的评分
    calculatePartialContentScore(content) {
        const checks = [
            { test: content.includes('```python'), weight: 0.4 },
            { test: /#{1,3}\s+/.test(content), weight: 0.2 },
            { test: content.length > 800, weight: 0.2 },
            { test: /参数|示例|代码/.test(content), weight: 0.2 }
        ];
        
        const score = checks.reduce((total, check) => 
            total + (check.test ? check.weight : 0), 0
        );
        
        console.log(`📊 [部分内容评分] 长度: ${content.length}, 得分: ${score.toFixed(2)}`);
        return score;
    }
    
    checkKeyElements(content) {
        return [];
    }
}

// 🎯 压缩质量分析器
class CompressionQualityAnalyzer {
    constructor() {
        this.keyElementsByTool = this.defineKeyElements();
    }
    
    defineKeyElements() {
        return {
            'python_sandbox': [
                '通用调用结构', '代码示例', '参数说明', '输出格式',
                '图表生成说明', 'plt.plot', 'plt.pie', 'plt.bar'
            ],
            'crawl4ai': [
                '通用调用结构', '模式选择指南', '参数说明',
                '错误示例', 'JSON结构示例'
            ],
            'default': ['调用结构', '参数说明', '示例代码', '关键指令']
        };
    }
    
    analyze(content, compressed, toolName, userQuery) {
        // 检查关键元素是否保留
        const keyElements = this.keyElementsByTool[toolName] || this.keyElementsByTool.default;
        const preservedElements = keyElements.filter(element => 
            compressed.includes(element)
        );
        
        // 计算语义覆盖率
        const queryKeywords = userQuery.toLowerCase().split(/[\s,，、]+/).filter(w => w.length > 1);
        let keywordCoverage = 0;
        if (queryKeywords.length > 0) {
            const foundKeywords = queryKeywords.filter(keyword => 
                compressed.toLowerCase().includes(keyword)
            );
            keywordCoverage = foundKeywords.length / queryKeywords.length;
        }
        
        // 结构完整性评分
        const originalSections = (content.match(/#{1,3}\s+[^\n]+/g) || []).length;
        const compressedSections = (compressed.match(/#{1,3}\s+[^\n]+/g) || []).length;
        const structureScore = originalSections > 0 ? 
            Math.min(compressedSections / Math.max(originalSections, 1), 1) : 1;
        
        // 综合评分
        const score = (
            (preservedElements.length / Math.max(keyElements.length, 1)) * 0.4 +
            keywordCoverage * 0.3 +
            structureScore * 0.3
        );
        
        return {
            score,
            keyElementsPreserved: preservedElements,
            keywordCoverage,
            structureScore,
            compressionRate: 1 - (compressed.length / Math.max(content.length, 1)),
            details: {
                originalSize: content.length,
                compressedSize: compressed.length,
                originalSections,
                compressedSections
            }
        };
    }
}

export class SkillCacheCompressor {
  constructor() {
    // 🎯 缓存系统
    this.knowledgeCache = new Map();
    this.injectionHistory = new Map();
    
    // 🎯 压缩配置 - 大幅降低压缩率
    this.compressionEnabled = true;
    this.maxKnowledgeChars = 20000; // 提高最大字符数
    this.minimalLength = 5000; // 提高最小长度
    
    // 🎯 会话管理
    this.activeSessions = new Map();
    
    // 🎯 压缩质量监控
    this.qualityMonitor = new CompressionQualityMonitor();
    this.qualityAnalyzer = new CompressionQualityAnalyzer();
    
    // 🎯 工具感知压缩配置 - 大幅降低压缩率
    this.toolTypeConfig = {
      // Python沙盒：需要保留大量代码示例
      'python_sandbox': {
        compressionThreshold: 15000,    // 超过15KB才压缩
        maxCompressionRate: 0.3,        // 最多压缩30%（原40%）
        minPreservedLength: 10000,      // 至少保留10KB（原8KB）
        compressionMethod: 'smart_extract',
        preserveCodeExamples: true,
        preserveTables: true,
        preserveStructure: true
      },
      
      // Crawl4AI：结构化文档，保守压缩
      'crawl4ai': {
        compressionThreshold: 18000,    // 超过18KB才压缩
        maxCompressionRate: 0.2,        // 最多压缩20%（原30%）
        minPreservedLength: 12000,      // 至少保留12KB（原10KB）
        compressionMethod: 'smart_trim',
        preserveStructure: true,
        preserveJsonExamples: true
      },
      
      // 其他简单工具：基本不压缩
      'default': {
        compressionThreshold: 20000,    // 超过20KB才压缩
        maxCompressionRate: 0.1,        // 最多压缩10%（原20%）
        minPreservedLength: 15000,      // 至少保留15KB（原12KB）
        compressionMethod: 'minimal_trim',
        preserveCoreSections: true
      }
    };
    
    console.log('✅ SkillCacheCompressor 优化版已加载（降低压缩率）');
  }

  /**
   * 🎯 核心：智能知识压缩算法 - 优化版
   */
  async compressKnowledge(content, options = {}) {
    let {
      level = 'smart',
      maxChars = this.maxKnowledgeChars,
      userQuery = '',
      toolName = 'unspecified_tool'
    } = options;

    console.log(`📦 [压缩开始] 工具: ${toolName}, 原始大小: ${content.length}字符`);

    // 🎯 优化1: 如果内容很小，直接返回
    if (content.length < 3000) {
      console.log(`📦 [保留完整] 内容较小(${content.length})，直接返回`);
      return content;
    }

    // 🎯 优化2: 工具感知的压缩决策
    const compressionDecision = this.decideCompressionStrategy(content, {
      toolName,
      userQuery,
      maxChars
    });

    // 如果决定不压缩
    if (!compressionDecision.shouldCompress) {
      console.log(`📦 [压缩跳过] 原因: ${compressionDecision.reason}`);
      return content;
    }

    console.log(`📦 [压缩决策] 策略: ${compressionDecision.strategy}, 目标大小: ${compressionDecision.targetSize}字符`);

    let compressed = content;

    // 🎯 根据工具类型使用不同的压缩策略
    switch (toolName) {
      case 'python_sandbox':
        compressed = await this.compressPythonSandbox(content, compressionDecision.targetSize, userQuery);
        break;
        
      case 'crawl4ai':
        compressed = await this.compressCrawl4AI(content, compressionDecision.targetSize, userQuery);
        break;
        
      default:
        compressed = await this.compressGeneralTool(content, compressionDecision.targetSize, userQuery, toolName);
        break;
    }

    // 🎯 确保压缩质量
    const qualityReport = this.qualityAnalyzer.analyze(
      content, 
      compressed, 
      toolName, 
      userQuery
    );

    // 如果质量过低，回退到较少压缩
    if (qualityReport.score < 0.5) {
      console.warn(`⚠️ 压缩质量过低(${qualityReport.score.toFixed(2)})，回退到较少压缩`);
      compressed = this.minimalCompress(content, Math.max(compressed.length * 1.5, 8000));
    }

    // 添加压缩质量监控
    this.qualityMonitor.trackCompression(
      toolName,
      content.length,
      compressed.length,
      userQuery,
      compressed
    );

    // 详细压缩统计
    const compressionRate = ((1 - compressed.length / content.length) * 100).toFixed(1);
    const bytesSaved = content.length - compressed.length;
    
    console.log(`✅ [压缩完成] ${content.length} → ${compressed.length}字符`);
    console.log(`📊 [压缩统计] 压缩率: ${compressionRate}%, 节省: ${bytesSaved}字符`);
    console.log(`📊 [质量评分] 综合质量: ${qualityReport.score.toFixed(2)}`);
    
    if (qualityReport.keyElementsPreserved.length > 0) {
      console.log(`📊 [关键元素] 保留: ${qualityReport.keyElementsPreserved.join(', ')}`);
    }

    return compressed;
  }

  /**
   * 🎯 优化压缩决策
   */
  decideCompressionStrategy(content, options = {}) {
    const { toolName, userQuery, maxChars } = options;
    const contentLength = content.length;
    
    // 获取工具特定配置
    const toolConfig = this.toolTypeConfig[toolName] || this.toolTypeConfig.default;
    
    // 1. 如果内容很小，不压缩
    if (contentLength <= toolConfig.compressionThreshold) {
      return {
        shouldCompress: false,
        reason: `内容大小(${contentLength})未达到压缩阈值(${toolConfig.compressionThreshold})`
      };
    }
    
    // 2. 计算目标大小（确保保留足够内容）
    const targetSize = Math.max(
      Math.min(
        contentLength * (1 - toolConfig.maxCompressionRate),
        maxChars
      ),
      toolConfig.minPreservedLength
    );
    
    return {
      shouldCompress: true,
      strategy: toolConfig.compressionMethod,
      targetSize,
      toolConfig,
      reason: `内容大小(${contentLength})超过阈值，使用${toolConfig.compressionMethod}策略`
    };
  }

  /**
   * 🎯 Python沙盒专用压缩 - 优化版
   */
  async compressPythonSandbox(content, maxChars, userQuery) {
    console.log(`🐍 [Python沙盒压缩] 查询: "${userQuery.substring(0, 50)}..."`);
    
    // 1. 提取核心部分（必须保留）
    let compressed = this.extractPythonSandboxCore(content);
    
    // 2. 如果核心部分不足，添加更多内容
    if (compressed.length < maxChars * 0.4) {
      // 基于查询添加相关内容
      const relevantContent = this.extractRelevantPythonContent(content, userQuery, maxChars - compressed.length);
      compressed += relevantContent;
    }
    
    // 3. 确保至少有一定长度的内容
    if (compressed.length < 5000) {
      compressed = this.extractMinimalPythonGuide(content, 8000);
    }
    
    // 4. 确保不超过最大长度
    if (compressed.length > maxChars) {
      compressed = compressed.substring(0, maxChars) + '...';
    }
    
    return compressed;
  }

  /**
   * 🎯 提取Python沙盒核心内容 - 优化版
   */
  extractPythonSandboxCore(content) {
    let coreContent = '';
    const requiredPatterns = [
      { pattern: /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i, name: '调用结构', weight: 1.0 },
      { pattern: /```json[\s\S]*?```/, name: 'JSON示例', weight: 0.8 },
      { pattern: /## 🚀 输出规范[\s\S]*?(?=\n##\s|$)/i, name: '输出规范', weight: 0.7 },
      { pattern: /## 💡 核心工作流模式[\s\S]*?(?=\n##\s|$)/i, name: '工作流模式', weight: 0.6 }
    ];
    
    for (const { pattern, name, weight } of requiredPatterns) {
      const matches = content.match(new RegExp(pattern.source, 'g')) || [];
      let addedCount = 0;
      
      for (const match of matches) {
        if (addedCount < 2) { // 每个模式最多取2个匹配
          coreContent += match + '\n\n';
          addedCount++;
        }
      }
    }
    
    console.log(`🐍 [提取核心] ${coreContent.length}字符`);
    return coreContent;
  }

  /**
   * 🎯 提取相关Python内容
   */
  extractRelevantPythonContent(content, userQuery, maxLength) {
    const queryLower = userQuery.toLowerCase();
    let relevantContent = '';
    
    // 检测用户意图
    if (queryLower.includes('折线图') || queryLower.includes('line') || queryLower.includes('plot')) {
      relevantContent += this.extractSection(content, '折线图', maxLength * 0.6);
      relevantContent += this.extractCodeBlocks(content, 'plt.plot', maxLength * 0.4);
    } else if (queryLower.includes('饼图') || queryLower.includes('pie')) {
      relevantContent += this.extractSection(content, '饼图', maxLength * 0.6);
      relevantContent += this.extractCodeBlocks(content, 'plt.pie', maxLength * 0.4);
    } else if (queryLower.includes('数据') || queryLower.includes('分析')) {
      relevantContent += this.extractSection(content, '数据', maxLength * 0.5);
      relevantContent += this.extractSection(content, 'pandas', maxLength * 0.5);
    } else if (queryLower.includes('可视化') || queryLower.includes('图表')) {
      relevantContent += this.extractSection(content, '可视化', maxLength * 0.5);
      relevantContent += this.extractSection(content, 'matplotlib', maxLength * 0.5);
    } else {
      // 通用情况：提取与查询关键词相关的内容
      const keywords = queryLower.split(/[\s,，、]+/).filter(w => w.length > 1);
      for (const keyword of keywords.slice(0, 3)) {
        if (relevantContent.length < maxLength) {
          relevantContent += this.extractSection(content, keyword, maxLength / 3);
        }
      }
    }
    
    return relevantContent;
  }

  /**
   * 🎯 提取章节内容
   */
  extractSection(content, keyword, maxLength) {
    // 查找包含关键词的章节
    const sectionPattern = new RegExp(`##.*?${keyword}.*?[\\s\\S]*?(?=\\n##|$)`, 'i');
    const match = content.match(sectionPattern);
    
    if (match) {
      const section = match[0];
      if (section.length > maxLength) {
        return section.substring(0, maxLength - 100) + '...\n\n';
      }
      return section + '\n\n';
    }
    
    return '';
  }

  /**
   * 🎯 提取代码块
   */
  extractCodeBlocks(content, keyword, maxLength) {
    const allCodeBlocks = content.match(/```[\s\S]*?```/g) || [];
    let result = '';
    
    // 优先提取包含关键词的代码块
    const relevantBlocks = allCodeBlocks.filter(block => 
      block.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const blocksToUse = relevantBlocks.length > 0 ? relevantBlocks : allCodeBlocks;
    
    for (const block of blocksToUse.slice(0, 3)) {
      if (result.length + block.length + 10 <= maxLength) {
        result += block + '\n\n';
      } else {
        break;
      }
    }
    
    return result;
  }

  /**
   * 🎯 提取最小化Python指南
   */
  extractMinimalPythonGuide(content, minLength) {
    let guide = '';
    
    // 提取标题和描述
    const titleMatch = content.match(/^#{1,2}\s+[^\n]+/);
    if (titleMatch) {
      guide += titleMatch[0] + '\n\n';
    }
    
    // 提取第一段描述
    const firstPara = content.split('\n\n').find(p => 
      p.trim().length > 50 && !p.startsWith('#')
    );
    if (firstPara) {
      guide += firstPara.substring(0, 300) + '\n\n';
    }
    
    // 提取核心调用结构
    const structureMatch = content.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i);
    if (structureMatch) {
      guide += structureMatch[0] + '\n\n';
    }
    
    // 提取代码示例
    const codeBlocks = content.match(/```python[\s\S]*?```/g) || [];
    if (codeBlocks.length > 0) {
      guide += '## 💻 代码示例\n\n';
      guide += codeBlocks[0] + '\n\n';
      if (codeBlocks.length > 1 && guide.length < minLength * 0.7) {
        guide += codeBlocks[1] + '\n\n';
      }
    }
    
    // 如果内容不足，添加更多
    if (guide.length < minLength) {
      const moreContent = content.substring(guide.length, minLength);
      guide += moreContent + '...';
    }
    
    return guide;
  }

  /**
   * 🎯 最小化压缩（保留核心内容）
   */
  minimalCompress(content, targetSize) {
    // 按重要性排序提取内容
    const patterns = [
      /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i,
      /```python[\s\S]*?```/g,
      /^#{1,2}\s+[^\n]+/,
      /## [^\n]+[\s\S]*?(?=\n##|$)/g
    ];
    
    let result = '';
    
    for (const pattern of patterns) {
      const matches = content.match(pattern) || [];
      for (const match of matches) {
        if (result.length + match.length + 10 <= targetSize) {
          result += match + '\n\n';
        } else {
          break;
        }
      }
      if (result.length >= targetSize * 0.8) {
        break;
      }
    }
    
    // 确保有足够内容
    if (result.length < targetSize * 0.5) {
      result += content.substring(0, Math.min(targetSize - result.length, content.length));
    }
    
    return result;
  }

  /**
   * 🎯 用户意图分类
   */
  classifyUserIntent(query) {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('折线图') || queryLower.includes('line') || queryLower.includes('plot')) {
      return 'line_chart';
    } else if (queryLower.includes('饼图') || queryLower.includes('pie')) {
      return 'pie_chart';
    } else if (queryLower.includes('条形图') || queryLower.includes('bar')) {
      return 'bar_chart';
    } else if (queryLower.includes('可视化') || queryLower.includes('图表')) {
      return 'visualization';
    } else if (queryLower.includes('数据') || queryLower.includes('分析')) {
      return 'data_analysis';
    } else if (queryLower.includes('代码') || queryLower.includes('执行')) {
      return 'code_execution';
    } else if (queryLower.includes('报告') || queryLower.includes('文档')) {
      return 'report_generation';
    }
    
    return 'general';
  }

  /**
   * 🎯 Crawl4AI专用压缩
   */
  async compressCrawl4AI(content, maxChars, userQuery) {
    console.log(`🕷️ [Crawl4AI压缩] 查询: "${userQuery.substring(0, 50)}..."`);
    
    let compressed = '';
    
    // 提取核心部分
    const corePatterns = [
      /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i,
      /## 📋 可用模式快速选择指南[\s\S]*?(?=\n##\s|$)/i,
      /```json[\s\S]*?```/g
    ];
    
    for (const pattern of corePatterns) {
      const matches = content.match(pattern) || [];
      for (const match of matches) {
        if (compressed.length + match.length + 10 <= maxChars) {
          compressed += match + '\n\n';
        }
      }
    }
    
    // 确保有足够内容
    if (compressed.length < 5000) {
      compressed += content.substring(0, Math.min(8000, content.length));
    }
    
    return compressed;
  }

  /**
   * 🎯 通用工具压缩
   */
  async compressGeneralTool(content, maxChars, userQuery, toolName) {
    console.log(`🛠️ [通用工具压缩] ${toolName}, 查询: "${userQuery.substring(0, 50)}..."`);
    
    // 提取最小化指南
    let compressed = this.extractMinimalGuide(content);
    
    // 确保有足够内容
    if (compressed.length < 3000) {
      compressed += content.substring(compressed.length, Math.min(6000, content.length));
    }
    
    return compressed;
  }

  /**
   * 🎯 提取最小化指南
   */
  extractMinimalGuide(content) {
    let minimal = '';
    const MINIMAL_REQUIRED_LENGTH = 2000;
    
    const requiredPatterns = [
      { pattern: /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i, name: '调用结构' },
      { pattern: /```json[\s\S]*?```/, name: 'JSON示例' },
      { pattern: /## 🚀 .*?[\s\S]*?(?=\n##\s|$)/i, name: '快速开始' }
    ];

    for (const { pattern, name } of requiredPatterns) {
      const match = content.match(pattern);
      if (match && minimal.length + match[0].length <= MINIMAL_REQUIRED_LENGTH * 1.5) {
        minimal += match[0] + '\n\n';
      }
    }

    if (minimal.length < MINIMAL_REQUIRED_LENGTH) {
      const descriptionMatch = content.match(/## [^\n]+[\s\S]*?(?=\n##|$)/i);
      if (descriptionMatch) {
        minimal = descriptionMatch[0].substring(0, 500) + '\n\n' + minimal;
      }
    }

    if (minimal.length < 1000) {
      minimal = content.substring(0, Math.min(3000, content.length)) + '...';
    }

    return minimal;
  }

  /**
   * 🎯 缓存管理
   */
  getFromCache(toolName, userQuery, context = {}) {
    const cacheKey = this._generateCacheKey(toolName, userQuery, context);
    
    if (this.knowledgeCache.has(cacheKey)) {
      const cached = this.knowledgeCache.get(cacheKey);
      // 缓存有效（10分钟内）
      if (Date.now() - cached.timestamp < 10 * 60 * 1000) {
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
      userQuery: userQuery.substring(0, 50)
    });
    
    // 限制缓存大小
    if (this.knowledgeCache.size > 100) {
      const oldestKey = Array.from(this.knowledgeCache.keys())[0];
      this.knowledgeCache.delete(oldestKey);
    }
  }

  /**
   * 🎯 会话级工具使用跟踪
   */
  recordToolInjection(sessionId, toolName) {
    if (!this.injectionHistory.has(sessionId)) {
      this.injectionHistory.set(sessionId, new Set());
    }
    
    this.injectionHistory.get(sessionId).add(toolName);
  }

  hasToolBeenInjected(sessionId, toolName) {
    return this.injectionHistory.has(sessionId) && 
           this.injectionHistory.get(sessionId).has(toolName);
  }

  /**
   * 🎯 生成缓存键
   */
  _generateCacheKey(toolName, userQuery, context) {
    const contextStr = context.sessionId || 'default';
    const queryHash = this._hashString(userQuery.substring(0, 100));
    const version = context.version || 'v1.0';
    const hourSlot = Math.floor(Date.now() / (1000 * 60 * 60));
    return `${toolName}_${version}_${contextStr}_${queryHash}_${hourSlot}`;
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
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
    return {
      cacheSize: this.knowledgeCache.size,
      injectionHistorySize: this.injectionHistory.size,
      activeSessions: this.activeSessions.size
    };
  }

  /**
   * 🎯 获取压缩统计报告
   */
  getCompressionReport() {
    const recentMetrics = this.qualityMonitor.qualityMetrics.slice(-20);
    const toolStats = {};
    
    recentMetrics.forEach(metric => {
      if (!toolStats[metric.toolName]) {
        toolStats[metric.toolName] = {
          count: 0,
          totalCompressionRate: 0,
          avgQualityScore: 0,
          lowQualityCount: 0
        };
      }
      
      const stats = toolStats[metric.toolName];
      stats.count++;
      stats.totalCompressionRate += metric.compressionRate;
      stats.avgQualityScore += metric.qualityScore;
      
      if (metric.qualityScore < 0.6) {
        stats.lowQualityCount++;
      }
    });
    
    // 计算平均值
    Object.keys(toolStats).forEach(tool => {
      const stats = toolStats[tool];
      if (stats.count > 0) {
        stats.avgCompressionRate = stats.totalCompressionRate / stats.count;
        stats.avgQualityScore = stats.avgQualityScore / stats.count;
        stats.lowQualityRate = stats.lowQualityCount / stats.count;
      }
    });
    
    return {
      recentMetrics: recentMetrics.length,
      toolStats,
      config: {
        toolTypeConfig: this.toolTypeConfig,
        maxKnowledgeChars: this.maxKnowledgeChars
      }
    };
  }
}

// 导出单例实例
export const skillCacheCompressor = new SkillCacheCompressor();