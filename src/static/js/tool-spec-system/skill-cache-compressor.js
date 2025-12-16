// src/tool-spec-system/skill-cache-compressor.js
// 🎯 为普通模式和Agent模式提供统一的缓存、压缩、章节检索服务

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
            this.suggestImprovements(metric, compressedContent);
        }
        
        return metric;
    }
    
    calculateQualityScore(content) {
        const checks = [
            { test: /通用调用结构/.test(content), weight: 0.3 },
            { test: /```json[\s\S]*?```/.test(content), weight: 0.25 },
            { test: /参数|parameters/.test(content), weight: 0.15 },
            { test: content.length >= 200 && content.length <= 5000, weight: 0.1 },
            { test: /#{1,3}\s/.test(content), weight: 0.1 }, // 有标题结构
            { test: !/\.\.\.$/.test(content.trim()), weight: 0.1 } // 没有截断痕迹
        ];
        
        return checks.reduce((score, check) => 
            score + (check.test ? check.weight : 0), 0
        );
    }
    
    checkKeyElements(content) {
        // 占位符方法，实际实现可以根据需要添加
        return [];
    }
    
    suggestImprovements(metric, compressedContent) {
        // 占位符方法，实际实现可以根据需要添加
        console.log('改善建议: 检查内容是否包含必要的关键元素');
    }
}

export class SkillCacheCompressor {
  constructor() {
    // 🎯 缓存系统
    this.knowledgeCache = new Map(); // tool -> {full, summary, compressed, timestamp}
    this.injectionHistory = new Map(); // sessionId -> [toolNames]
    
    // 🎯 压缩配置
    this.compressionEnabled = true;
    this.maxKnowledgeChars = 15000;
    this.minimalLength = 3000;
    
    // 🎯 会话管理
    this.activeSessions = new Map();
    
    // 🎯 压缩质量监控
    this.qualityMonitor = new CompressionQualityMonitor();
    
    console.log('✅ SkillCacheCompressor 初始化完成');
  }

  /**
   * 🎯 核心：智能知识压缩算法（Agent模式同款）
   */
  async compressKnowledge(content, options = {}) {
    let {
      level = 'auto', // 改为 auto，支持自动选择
      maxChars = this.maxKnowledgeChars,
      userQuery = '',
      iteration = 0,
      toolName = 'unspecified_tool'
    } = options;

    // 如果内容已经很小，直接返回
    if (content.length <= maxChars) {
      // 即使内容很小也进行质量监控
      this.qualityMonitor.trackCompression(
        toolName, 
        content.length, 
        content.length, 
        userQuery, 
        content
      );
      return content;
    }

    // 🎯 新增：自动压缩级别选择逻辑
    if (level === 'auto') {
      if (content.length > 30000) {
        level = 'minimal'; // 超长内容用最小化
      } else if (content.length > 10000) {
        level = 'smart';   // 中等长度用智能压缩
      } else {
        level = 'reference'; // 短内容用引用模式
      }
      console.log(`🎯 [自动压缩] ${content.length}字符 → 选择${level}级别`);
    }

    let compressed = content;

    switch (level) {
      case 'minimal':
        // 最小化：只保留最关键的部分
        compressed = this.extractMinimalGuide(content);
        break;

      case 'reference':
        // 引用模式：不注入内容，只给提示
        compressed = this.createKnowledgeReference(content);
        break;

      case 'smart':
      default:
        // 智能压缩：根据查询提取相关部分
        compressed = await this.smartCompress(content, maxChars, userQuery);
        break;
    }

    // 确保不超过最大长度
    if (compressed.length > maxChars) {
      compressed = compressed.substring(0, maxChars) + '...';
    }

    // 🎯 添加压缩质量监控
    this.qualityMonitor.trackCompression(
      toolName,
      content.length,
      compressed.length,
      userQuery,
      compressed
    );

    console.log(`🎯 [压缩] ${content.length} → ${compressed.length} 字符 (压缩率: ${((1 - compressed.length/content.length)*100).toFixed(1)}%)`);
    return compressed;
  }

  /**
   * 🎯 提取最小化指南（保留最核心内容）
   */
  extractMinimalGuide(content) {
    const MINIMAL_REQUIRED_LENGTH = 800; // 最小必需长度
    
    let minimal = '';
    const requiredSections = [];

    // 🎯 强制保留序列（按优先级）
    const requiredPatterns = [
        { pattern: /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i, name: '调用结构' },
        { pattern: /```json[\s\S]*?```/, name: 'JSON示例' },
        { pattern: /### ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i, name: '常见错误' },
        { pattern: /##\s+关键指令[\s\S]*?(?=##|$)/i, name: '关键指令' }
    ];

    // 按顺序提取，确保关键信息
    for (const { pattern, name } of requiredPatterns) {
        const match = content.match(pattern);
        if (match && minimal.length + match[0].length <= MINIMAL_REQUIRED_LENGTH * 1.5) {
            minimal += match[0] + '\n\n';
            requiredSections.push(name);
        }
    }

    // 如果还是太短，添加工具描述
    if (minimal.length < MINIMAL_REQUIRED_LENGTH) {
        const descriptionMatch = content.match(/## 🛠️ 工具指南[\s\S]*?(?=\n##|$)/i) ||
                               content.match(/## [^\n]+[\s\S]*?(?=\n##|$)/i);
        if (descriptionMatch) {
            minimal = descriptionMatch[0].substring(0, 300) + '\n\n' + minimal;
        }
    }

    // 4. 如果没有找到关键部分，返回前3000字符
    if (minimal.length < 500) {
      minimal = content.substring(0, Math.min(this.minimalLength, content.length)) + '...';
    }

    console.log(`🎯 最小化提取完成: ${minimal.length}字符, 包含: ${requiredSections.join(', ')}`);
    return minimal;
  }

  /**
   * 🎯 智能压缩（基于查询相关性）
   */
  async smartCompress(content, maxChars, userQuery) {
    // 🎯 改进1：先提取关键部分（确保基础）
    let compressed = this.extractMinimalGuide(content);
    
    // 🎯 改进2：语义相关性分析
    const userIntent = this.classifyUserIntent(userQuery);
    const relevantSections = this.findSectionsByIntent(content, userIntent);
    
    // 🎯 改进3：结构感知的章节提取
    const sections = this.splitIntoSections(content);
    const scoredSections = this.scoreSectionsByRelevance(sections, userQuery, userIntent);
    
    // 🎯 改进4：保证代码示例完整性
    scoredSections.forEach(({ section }) => {
        if (this.isCodeSection(section) && compressed.length + section.length <= maxChars) {
            compressed += this.extractCompleteCodeBlock(section) + '\n\n';
        }
    });
    
    // 🎯 改进5：动态调整压缩级别
    if (compressed.length < maxChars * 0.3) {
        // 压缩过度，添加更多内容
        compressed += this.addContextualExamples(content, userQuery, maxChars - compressed.length);
    }
    
    // 确保不超过最大长度
    if (compressed.length > maxChars) {
      compressed = compressed.substring(0, maxChars) + '...';
    }
    
    return compressed;
  }

  /**
   * 🎯 用户意图分类
   */
  classifyUserIntent(query) {
    const intents = {
        search: ['搜索', '查找', '查询', 'search', 'find', 'lookup'],
        visualization: ['可视化', '画图', '图表', '折线图', '饼图', '柱状图', '热力图', 'visualize', 'plot', 'chart', 'graph'],
        data_analysis: ['分析', '处理', '清洗', '统计', '探索', 'data analysis', 'data processing', 'data cleaning'],
        code_execution: ['代码', '执行', '运行', 'python', 'script', 'execute', 'run'],
        mathematical: ['计算', '公式', '数学', 'math', 'calculate', 'equation'],
        text_processing: ['文本', '字符串', '提取', '解析', 'text', 'string', 'parse', 'extract']
    };
    
    const queryLower = query.toLowerCase();
    for (const [intent, keywords] of Object.entries(intents)) {
        if (keywords.some(kw => queryLower.includes(kw))) {
            return intent;
        }
    }
    return 'general';
  }

  /**
   * 🎯 辅助方法：根据意图查找相关章节
   */
  findSectionsByIntent(content, intent) {
    // 这里可以实现更复杂的意图到章节的映射逻辑
    // 目前返回空数组，作为占位符
    return [];
  }

  /**
   * 🎯 辅助方法：将内容分割成章节
   */
  splitIntoSections(content) {
    return content.split(/(?=^#{2,4}\s)/m);
  }

  /**
   * 🎯 辅助方法：根据相关性评分章节
   */
  scoreSectionsByRelevance(sections, userQuery, userIntent) {
    const queryWords = userQuery.toLowerCase().split(/[\s,，、]+/).filter(w => w.length > 1);
    
    const scoredSections = sections.map(section => {
      let score = 0;
      const sectionLower = section.toLowerCase();
      
      // 基于关键词匹配的评分
      queryWords.forEach(word => {
        if (sectionLower.includes(word)) {
          score += 1;
          // 标题中包含关键词权重更高
          const titleMatch = section.match(/^#{2,4}\s+([^\n]+)/i);
          if (titleMatch && titleMatch[1].toLowerCase().includes(word)) {
            score += 3;
          }
        }
      });
      
      // 基于意图的额外评分
      switch (userIntent) {
        case 'visualization':
          if (sectionLower.includes('matplotlib') || sectionLower.includes('绘图') || 
              sectionLower.includes('图表') || sectionLower.includes('seaborn') ||
              sectionLower.includes('pyecharts')) {
            score += 5;
          }
          break;
        case 'data_analysis':
          if (sectionLower.includes('pandas') || sectionLower.includes('数据分析') || 
              sectionLower.includes('处理') || sectionLower.includes('numpy') ||
              sectionLower.includes('数据处理')) {
            score += 5;
          }
          break;
        case 'code_execution':
          if (section.includes('```')) {
            score += 3;
          }
          break;
        case 'mathematical':
          if (sectionLower.includes('sympy') || sectionLower.includes('数学') ||
              sectionLower.includes('公式') || sectionLower.includes('scipy')) {
            score += 5;
          }
          break;
        case 'text_processing':
          if (sectionLower.includes('正则') || sectionLower.includes('regex') ||
              sectionLower.includes('文本处理') || sectionLower.includes('nlp') ||
              sectionLower.includes('自然语言')) {
            score += 5;
          }
          break;
      }
      
      return { section, score };
    }).filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);
      
    return scoredSections;
  }

  /**
   * 🎯 辅助方法：判断是否为代码章节
   */
  isCodeSection(section) {
    return section.includes('```');
  }

  /**
   * 🎯 辅助方法：提取完整的代码块
   */
  extractCompleteCodeBlock(section) {
    // 简单实现：返回整个章节以保持代码完整
    // 可以进一步优化以更好地处理大型代码块
    return section;
  }

  /**
   * 🎯 辅助方法：添加上下文示例
   */
  addContextualExamples(content, userQuery, maxLength) {
    // 简单实现：返回部分内容以填充空间
    // 可以进一步优化以选择最相关的示例
    const startPos = Math.min(content.length, Math.floor(content.length * 0.3));
    const endPos = Math.min(startPos + maxLength, content.length);
    return content.substring(startPos, endPos);
  }

  /**
   * 🎯 创建知识引用（不注入内容）
   */
  createKnowledgeReference(content) {
    // 提取关键信息点
    const keyPoints = [];
    
    // 提取标题
    const titles = content.match(/^#{2,4}\s+([^\n]+)/gm) || [];
    keyPoints.push(...titles.slice(0, 3).map(t => t.replace(/^#{2,4}\s+/, '')));
    
    return `## 工具参考指南（已在前序步骤中提供）\n\n` +
           `**关键要点**:\n${keyPoints.map(p => `- ${p}`).join('\n')}\n\n` +
           `*如需查看完整操作指南，请参考之前步骤中的详细说明。*`;
  }

  /**
   * 🎯 缓存管理
   */
  getFromCache(toolName, userQuery, context = {}) {
    const cacheKey = this._generateCacheKey(toolName, userQuery, context);
    
    console.log('🔍 缓存查询:', {
        toolName,
        query: userQuery.substring(0, 50),
        cacheKey,
        hasCache: this.knowledgeCache.has(cacheKey)
    });
    
    if (this.knowledgeCache.has(cacheKey)) {
      const cached = this.knowledgeCache.get(cacheKey);
      
      // 缓存有效（5分钟内）
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        console.log(`🎯 [缓存命中] ${toolName}: ${cached.content.length} 字符`);
        console.log('✅ 缓存命中，大小:', cached.content.length);
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
   * 🎯 会话级工具使用跟踪（避免重复注入）
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
   * 🎯 章节推断逻辑（共享版）
   */
  inferRelevantSections(userQuery, context = {}) {
    const sections = new Set();
    const queryLower = userQuery.toLowerCase();
    const toolCallHistory = context.toolCallHistory || [];
    
    // 🎯 数据分析与清洗
    if (this._containsKeywords(queryLower,
        ['分析', '数据处理', '清洗', '清洗数据', '清理数据', 'data analysis', 'data clean', '数据清洗'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('pandas_cheatsheet');
        sections.add('数据清洗与分析');
    }
    
    // 🎯 表格与结构化数据处理
    if (this._containsKeywords(queryLower,
        ['表格', '表', '结构化', '表格数据', 'table', 'excel', 'csv', '趋势表', '汇总表'])) {
        sections.add('pandas_cheatsheet');
        sections.add('ETL管道模式');
    }
    
    // 🎯 趋势分析与预测
    if (this._containsKeywords(queryLower,
        ['趋势', '预测', '增长', '增速', '变化趋势', '趋势分析', '增长预测'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('pandas_cheatsheet');
    }
    
    // 🎯 文本处理相关查询
    if (this._containsKeywords(queryLower, ['文本', 'text', '字符串', '提取', '解析'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('文本分析与结构化提取');
    }
    
    // 🎯 可视化相关查询
    if (this._containsKeywords(queryLower, ['可视化', 'visual', 'plot', 'chart', '图表', '绘图', 'matplotlib'])) {
        sections.add('matplotlib_cookbook');
        sections.add('数据可视化');
    }
    
    // 🎯 数学/计算相关查询
    if (this._containsKeywords(queryLower, ['数学', '公式', '计算', '证明', 'sympy', '科学'])) {
        sections.add('公式证明工作流');
        sections.add('sympy_cookbook');
        sections.add('科学计算与优化');
    }
    
    // 🎯 机器学习相关查询
    if (this._containsKeywords(queryLower, ['机器学习', 'ml', '模型', '训练', '预测', '分类'])) {
        sections.add('机器学习');
        sections.add('ml_workflow');
    }
    
    // 🎯 报告生成
    if (this._containsKeywords(queryLower, ['报告', '文档', 'word', 'excel', 'pdf', 'ppt'])) {
        sections.add('自动化报告生成');
        sections.add('report_generator_workflow');
    }
    
    // 🎯 上下文增强：考虑之前的工具调用历史
    const recentTools = toolCallHistory.slice(-3).map(h => h.toolName);
    
    if (recentTools.includes('python_sandbox')) {
        sections.add('pandas_cheatsheet');
        sections.add('matplotlib_cookbook');
    }
    
    if (recentTools.includes('crawl4ai') || recentTools.includes('firecrawl')) {
        sections.add('ETL管道模式');
        sections.add('文本分析与结构化提取');
    }
    
    return Array.from(sections);
  }

  /**
   * 🎯 辅助方法
   */
  _generateCacheKey(toolName, userQuery, context) {
    const contextStr = context.sessionId || 'default';
    const queryHash = this._hashString(userQuery.substring(0, 100));
    // 从 context 获取版本号，如果没有则使用默认
    const version = context.version || 'v1.0';
    // 增加时间粒度（按小时），避免长时间缓存
    const hourSlot = Math.floor(Date.now() / (1000 * 60 * 60)); // 每小时一个slot
    return `${toolName}_${version}_${contextStr}_${queryHash}_${hourSlot}`;
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  _containsKeywords(text, keywords) {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  /**
   * 🎯 清理指定会话的所有相关数据
   */
  clearSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      console.warn('❌ clearSession: 无效的会话ID');
      return;
    }
    
    // 统计清理前的状态
    const beforeSize = this.knowledgeCache.size;
    
    // 1. 清理注入历史
    const hadInjectionHistory = this.injectionHistory.has(sessionId);
    if (hadInjectionHistory) {
      this.injectionHistory.delete(sessionId);
    }
    
    // 2. 清理会话相关的缓存
    const deletedKeys = this._deleteSessionCache(sessionId);
    
    // 3. 清理活跃会话（如果存在）
    const hadActiveSession = this.activeSessions.has(sessionId);
    if (hadActiveSession) {
      this.activeSessions.delete(sessionId);
    }
    
    // 4. 记录日志
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
   * 🎯 内部方法：删除会话相关的缓存
   * 支持多种缓存键格式，确保精确匹配
   */
  _deleteSessionCache(sessionId) {
    const deletedKeys = [];
    
    // 缓存键可能的格式：
    // 1. tool_sessionId_queryHash
    // 2. tool_version_sessionId_queryHash_timeslot
    // 3. 未来可能增加更多下划线
    
    for (const key of this.knowledgeCache.keys()) {
      const parts = key.split('_');
      
      // 检查会话ID可能出现的所有位置
      // 从索引1开始检查，因为索引0总是工具名
      for (let i = 1; i < parts.length; i++) {
        if (parts[i] === sessionId) {
          // 🔍 验证：确保这是会话ID而不是其他部分
          // 会话ID通常是UUID格式或特定格式，这里只做简单验证
          if (this._isValidSessionIdFormat(parts[i])) {
            deletedKeys.push(key);
            break;
          }
        }
      }
    }
    
    // 批量删除
    for (const key of deletedKeys) {
      this.knowledgeCache.delete(key);
    }
    
    return deletedKeys;
  }
  
  /**
   * 🎯 验证ID格式是否可能是会话ID
   * 可扩展用于更复杂的验证逻辑
   */
  _isValidSessionIdFormat(id) {
    // 简单验证：不是纯数字、长度合理、可能包含连字符
    if (!id || typeof id !== 'string') return false;
    
    // UUID格式：8-4-4-4-12 或类似
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return true;
    }
    
    // 时间戳格式：数字长度10-13
    if (/^\d{10,13}$/.test(id)) {
      return true;
    }
    
    // 默认：长度在8-64之间的字符串
    return id.length >= 8 && id.length <= 64;
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
}

// 导出单例实例
export const skillCacheCompressor = new SkillCacheCompressor();