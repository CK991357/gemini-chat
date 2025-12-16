// 🎯 共享的缓存与压缩核心模块
// 为普通模式和Agent模式提供统一的缓存、压缩、章节检索服务

class SkillCacheCompressor {
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
    
    console.log('✅ SkillCacheCompressor 初始化完成');
  }

  /**
   * 🎯 核心：智能知识压缩算法（Agent模式同款）
   */
  async compressKnowledge(content, options = {}) {
    const {
      level = 'smart', // smart, minimal, reference
      maxChars = this.maxKnowledgeChars,
      userQuery = '',
      iteration = 0
    } = options;

    // 如果内容已经很小，直接返回
    if (content.length <= maxChars) return content;

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

    console.log(`🎯 [压缩] ${content.length} → ${compressed.length} 字符 (压缩率: ${((1 - compressed.length/content.length)*100).toFixed(1)}%)`);
    return compressed;
  }

  /**
   * 🎯 提取最小化指南（保留最核心内容）
   */
  extractMinimalGuide(content) {
    let minimal = '';

    // 1. 提取通用调用结构（最重要！）
    const structureMatch = content.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i);
    if (structureMatch) {
      minimal += structureMatch + '\n\n';
    }

    // 2. 提取常见错误（第二重要）
    const errorsMatch = content.match(/### ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i);
    if (errorsMatch) {
      minimal += errorsMatch + '\n\n';
    }

    // 3. 提取关键指令
    const instructionsMatch = content.match(/##\s+关键指令[\s\S]*?(?=##|$)/i);
    if (instructionsMatch) {
      minimal += '## 关键指令摘要\n' +
                instructionsMatch[0].split('\n')
                  .filter(line => line.trim() && !line.trim().startsWith('#') && line.trim().length > 10)
                  .slice(0, 10) // 只取前10行
                  .join('\n') + '\n\n';
    }

    // 4. 如果没有找到关键部分，返回前3000字符
    if (minimal.length < 500) {
      minimal = content.substring(0, Math.min(this.minimalLength, content.length)) + '...';
    }

    return minimal;
  }

  /**
   * 🎯 智能压缩（基于查询相关性）
   */
  async smartCompress(content, maxChars, userQuery) {
    if (!userQuery) return this.extractMinimalGuide(content);

    const sections = content.split(/(?=^#{2,4}\s)/m);
    let compressed = '';
    let remaining = maxChars;

    // 根据查询关键词给章节评分
    const queryWords = userQuery.toLowerCase().split(/[\s,，、]+/).filter(w => w.length > 1);
    
    const scoredSections = sections.map(section => {
      let score = 0;
      const sectionLower = section.toLowerCase();
      
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
      
      return { section, score };
    }).filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // 添加高评分章节
    for (const { section, score } of scoredSections) {
      if (section.length <= remaining * 0.6) {
        compressed += section + '\n\n';
        remaining -= section.length;
      } else {
        // 章节过长，截取开头
        compressed += section.substring(0, Math.min(section.length, remaining * 0.3)) + '...\n\n';
        remaining -= Math.min(section.length, remaining * 0.3);
      }
      
      if (remaining < 1000) break;
    }

    // 如果压缩后内容太少，添加最小化指南
    if (compressed.length < 1000) {
      compressed = this.extractMinimalGuide(content).substring(0, maxChars);
    }

    return compressed;
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
    
    if (this.knowledgeCache.has(cacheKey)) {
      const cached = this.knowledgeCache.get(cacheKey);
      
      // 缓存有效（5分钟内）
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
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
    return `${toolName}_${contextStr}_${queryHash}`;
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
   * 🎯 清理会话数据
   */
  clearSession(sessionId) {
    if (this.injectionHistory.has(sessionId)) {
      this.injectionHistory.delete(sessionId);
    }
    
    // 清理该会话相关的缓存
    const sessionPrefix = `${sessionId}_`;
    for (const key of this.knowledgeCache.keys()) {
      if (key.includes(sessionPrefix)) {
        this.knowledgeCache.delete(key);
      }
    }
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