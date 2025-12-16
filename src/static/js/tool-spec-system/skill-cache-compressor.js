// src/tool-spec-system/skill-cache-compressor.js
// 🎯 为普通模式和Agent模式提供统一的缓存、压缩、章节检索服务

export class SkillCacheCompressor {
  constructor() {
    // 🎯 增强的缓存系统
    this.knowledgeCache = new Map(); // tool_userQuery_hash -> {content, timestamp, toolName, userQuery}
    this.injectionHistory = new Map(); // sessionId -> Set(toolNames)
    
    // 🎯 压缩配置
    this.compressionEnabled = true;
    this.maxKnowledgeChars = 15000;
    this.minimalLength = 3000;
    
    // 🎯 会话管理
    this.activeSessions = new Map();
    
    // 🎯 性能监控
    this.stats = {
      hits: 0,
      misses: 0,
      compressions: 0,
      lastAccess: new Map()
    };
    
    console.log('✅ SkillCacheCompressor 初始化完成 - 增强版');
  }

  /**
   * 🎯 核心：智能知识压缩算法（与Agent模式完全一致）
   */
  async compressKnowledge(content, options = {}) {
    const {
      level = 'smart', // smart, minimal, reference
      maxChars = this.maxKnowledgeChars,
      userQuery = '',
      iteration = 0
    } = options;

    // 记录压缩统计
    this.stats.compressions++;

    // 如果内容已经很小，直接返回
    if (content.length <= maxChars) {
      console.log(`🎯 [压缩跳过] 内容已足够小 (${content.length} ≤ ${maxChars})`);
      return content;
    }

    let compressed = content;
    const originalLength = content.length;

    switch (level) {
      case 'minimal':
        console.log(`🎯 [最小化压缩] 开始，原长度: ${originalLength}`);
        compressed = this.extractMinimalGuide(content);
        break;

      case 'reference':
        console.log(`🎯 [引用模式] 创建知识引用`);
        compressed = this.createKnowledgeReference(content);
        break;

      case 'smart':
      default:
        console.log(`🎯 [智能压缩] 开始，查询: "${userQuery.substring(0, 50)}..."`);
        compressed = await this.smartCompress(content, maxChars, userQuery);
        break;
    }

    // 确保不超过最大长度
    if (compressed.length > maxChars) {
      console.log(`🎯 [长度限制] 压缩后仍超出限制，截断`);
      compressed = compressed.substring(0, maxChars) + '...';
    }

    const compressionRate = ((1 - compressed.length / originalLength) * 100).toFixed(1);
    console.log(`🎯 [压缩完成] ${originalLength} → ${compressed.length} 字符 (压缩率: ${compressionRate}%)`);
    
    return compressed;
  }

  /**
   * 🎯 提取最小化指南（保留最核心内容）
   */
  extractMinimalGuide(content) {
    let minimal = '';
    console.log(`🎯 [最小化提取] 开始提取核心内容`);

    // 1. 提取通用调用结构（最重要！）
    const structureMatch = content.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i);
    if (structureMatch) {
      minimal += structureMatch[0] + '\n\n';
      console.log(`🎯 [最小化提取] 找到通用调用结构`);
    }

    // 2. 提取常见错误（第二重要）
    const errorsMatch = content.match(/### ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i);
    if (errorsMatch) {
      minimal += errorsMatch[0] + '\n\n';
      console.log(`🎯 [最小化提取] 找到常见错误`);
    }

    // 3. 提取关键指令
    const instructionsMatch = content.match(/##\s+关键指令[\s\S]*?(?=##|$)/i);
    if (instructionsMatch) {
      const instructions = '## 关键指令摘要\n' +
                instructionsMatch[0].split('\n')
                  .filter(line => line.trim() && !line.trim().startsWith('#') && line.trim().length > 10)
                  .slice(0, 10) // 只取前10行
                  .join('\n') + '\n\n';
      minimal += instructions;
      console.log(`🎯 [最小化提取] 找到关键指令`);
    }

    // 4. 如果没有找到关键部分，返回前3000字符
    if (minimal.length < 500) {
      console.log(`🎯 [最小化提取] 未找到关键部分，使用前${this.minimalLength}字符`);
      minimal = content.substring(0, Math.min(this.minimalLength, content.length)) + '...';
    }

    console.log(`🎯 [最小化提取] 完成: ${minimal.length} 字符`);
    return minimal;
  }

  /**
   * 🎯 智能压缩（基于查询相关性）
   */
  async smartCompress(content, maxChars, userQuery) {
    if (!userQuery) {
      console.log(`🎯 [智能压缩] 无查询，使用最小化指南`);
      return this.extractMinimalGuide(content);
    }

    const sections = content.split(/(?=^#{2,4}\s)/m);
    let compressed = '';
    let remaining = maxChars;

    console.log(`🎯 [智能压缩] 分割为 ${sections.length} 个章节`);

    // 根据查询关键词给章节评分
    const queryWords = userQuery.toLowerCase().split(/[\s,，、]+/).filter(w => w.length > 1);
    
    console.log(`🎯 [智能压缩] 查询关键词: ${queryWords.join(', ')}`);

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
            console.log(`🎯 [智能压缩] 标题匹配: "${word}" -> "${titleMatch[1]}"`);
          }
        }
      });
      
      return { section, score };
    }).filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    console.log(`🎯 [智能压缩] 找到 ${scoredSections.length} 个相关章节`);

    // 添加高评分章节
    for (const { section, score } of scoredSections) {
      console.log(`🎯 [智能压缩] 章节评分: ${score}, 长度: ${section.length}, 剩余: ${remaining}`);
      
      if (section.length <= remaining * 0.6) {
        compressed += section + '\n\n';
        remaining -= section.length;
        console.log(`🎯 [智能压缩] 添加完整章节 (${section.length}字符)`);
      } else {
        // 章节过长，截取开头
        const truncatedLength = Math.min(section.length, remaining * 0.3);
        compressed += section.substring(0, truncatedLength) + '...\n\n';
        remaining -= truncatedLength;
        console.log(`🎯 [智能压缩] 添加截断章节 (${truncatedLength}字符)`);
      }
      
      if (remaining < 1000) {
        console.log(`🎯 [智能压缩] 剩余空间不足 (${remaining}), 停止添加`);
        break;
      }
    }

    // 如果压缩后内容太少，添加最小化指南
    if (compressed.length < 1000) {
      console.log(`🎯 [智能压缩] 压缩后内容太少 (${compressed.length}), 使用最小化指南`);
      compressed = this.extractMinimalGuide(content).substring(0, maxChars);
    }

    console.log(`🎯 [智能压缩] 最终长度: ${compressed.length} 字符`);
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
    
    console.log(`🎯 [知识引用] 创建引用，关键点: ${keyPoints.length} 个`);
    
    return `## 工具参考指南（已在前序步骤中提供）\n\n` +
           `**关键要点**:\n${keyPoints.map(p => `- ${p}`).join('\n')}\n\n` +
           `*如需查看完整操作指南，请参考之前步骤中的详细说明。*`;
  }

  /**
   * 🎯 增强的缓存管理
   */
  getFromCache(toolName, userQuery, context = {}) {
    const cacheKey = this._generateCacheKey(toolName, userQuery, context);
    
    console.log('🔍 [缓存查询]', {
      toolName,
      query: userQuery?.substring(0, 50) || '无查询',
      cacheKey,
      hasCache: this.knowledgeCache.has(cacheKey),
      cacheSize: this.knowledgeCache.size
    });
    
    if (this.knowledgeCache.has(cacheKey)) {
      const cached = this.knowledgeCache.get(cacheKey);
      
      // 缓存有效（5分钟内）
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        this.stats.hits++;
        this.stats.lastAccess.set(cacheKey, Date.now());
        
        console.log(`🎯 [缓存命中] ${toolName}: ${cached.content.length} 字符`);
        console.log(`📊 [缓存统计] 命中率: ${((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1)}%`);
        
        return cached.content;
      } else {
        console.log(`🎯 [缓存过期] ${toolName}: 缓存已过期`);
        this.knowledgeCache.delete(cacheKey);
      }
    }
    
    this.stats.misses++;
    console.log(`🎯 [缓存未命中] ${toolName}`);
    return null;
  }

  setToCache(toolName, userQuery, context, content) {
    const cacheKey = this._generateCacheKey(toolName, userQuery, context);
    
    this.knowledgeCache.set(cacheKey, {
      content,
      timestamp: Date.now(),
      toolName,
      userQuery: userQuery?.substring(0, 50) || '无查询',
      context: { ...context, userQuery: undefined } // 移除用户查询避免循环引用
    });
    
    this.stats.lastAccess.set(cacheKey, Date.now());
    
    console.log(`🎯 [缓存设置] ${toolName}: ${content.length} 字符`, {
      cacheKey,
      cacheSize: this.knowledgeCache.size
    });
    
    // 限制缓存大小（LRU策略）
    this._cleanupCache();
  }

  /**
   * 🎯 LRU缓存清理
   */
  _cleanupCache() {
    const maxCacheSize = 100;
    
    if (this.knowledgeCache.size > maxCacheSize) {
      console.log(`🎯 [缓存清理] 开始清理，当前大小: ${this.knowledgeCache.size}`);
      
      // 按最后访问时间排序，删除最旧的
      const entries = Array.from(this.knowledgeCache.entries());
      const sortedByAccess = entries.sort((a, b) => {
        const timeA = this.stats.lastAccess.get(a[0]) || 0;
        const timeB = this.stats.lastAccess.get(b[0]) || 0;
        return timeA - timeB;
      });
      
      // 删除最旧的20%
      const toDelete = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toDelete; i++) {
        const [key] = sortedByAccess[i];
        this.knowledgeCache.delete(key);
        this.stats.lastAccess.delete(key);
      }
      
      console.log(`🎯 [缓存清理] 完成，删除 ${toDelete} 项，新大小: ${this.knowledgeCache.size}`);
    }
  }

  /**
   * 🎯 会话级工具使用跟踪（避免重复注入）
   */
  recordToolInjection(sessionId, toolName) {
    if (!this.injectionHistory.has(sessionId)) {
      this.injectionHistory.set(sessionId, new Set());
    }
    
    const injectedTools = this.injectionHistory.get(sessionId);
    if (!injectedTools.has(toolName)) {
      injectedTools.add(toolName);
      console.log(`🎯 [会话记录] ${sessionId}: 记录工具 ${toolName} 注入`);
    } else {
      console.log(`🎯 [会话记录] ${sessionId}: 工具 ${toolName} 已注入过`);
    }
  }

  hasToolBeenInjected(sessionId, toolName) {
    const hasInjected = this.injectionHistory.has(sessionId) && 
           this.injectionHistory.get(sessionId).has(toolName);
    
    console.log(`🎯 [会话检查] ${sessionId}: ${toolName} ${hasInjected ? '已注入' : '未注入'}`);
    return hasInjected;
  }

  /**
   * 🎯 章节推断逻辑（共享版）- 与Agent模式完全一致
   */
  inferRelevantSections(userQuery, context = {}) {
    const sections = new Set();
    const queryLower = userQuery.toLowerCase();
    const toolCallHistory = context.toolCallHistory || [];
    
    console.log(`🎯 [章节推断] 开始分析查询: "${userQuery.substring(0, 50)}..."`);

    // 🎯 数据分析与清洗
    if (this._containsKeywords(queryLower,
        ['分析', '数据处理', '清洗', '清洗数据', '清理数据', 'data analysis', 'data clean', '数据清洗'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('pandas_cheatsheet');
        sections.add('数据清洗与分析');
        console.log(`🎯 [章节推断] 检测到数据分析需求`);
    }
    
    // 🎯 表格与结构化数据处理
    if (this._containsKeywords(queryLower,
        ['表格', '表', '结构化', '表格数据', 'table', 'excel', 'csv', '趋势表', '汇总表'])) {
        sections.add('pandas_cheatsheet');
        sections.add('ETL管道模式');
        console.log(`🎯 [章节推断] 检测到表格处理需求`);
    }
    
    // 🎯 趋势分析与预测
    if (this._containsKeywords(queryLower,
        ['趋势', '预测', '增长', '增速', '变化趋势', '趋势分析', '增长预测'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('pandas_cheatsheet');
        console.log(`🎯 [章节推断] 检测到趋势分析需求`);
    }
    
    // 🎯 文本处理相关查询
    if (this._containsKeywords(queryLower, ['文本', 'text', '字符串', '提取', '解析'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('文本分析与结构化提取');
        console.log(`🎯 [章节推断] 检测到文本处理需求`);
    }
    
    // 🎯 可视化相关查询
    if (this._containsKeywords(queryLower, ['可视化', 'visual', 'plot', 'chart', '图表', '绘图', 'matplotlib'])) {
        sections.add('matplotlib_cookbook');
        sections.add('数据可视化');
        console.log(`🎯 [章节推断] 检测到可视化需求`);
    }
    
    // 🎯 数学/计算相关查询
    if (this._containsKeywords(queryLower, ['数学', '公式', '计算', '证明', 'sympy', '科学'])) {
        sections.add('公式证明工作流');
        sections.add('sympy_cookbook');
        sections.add('科学计算与优化');
        console.log(`🎯 [章节推断] 检测到数学计算需求`);
    }
    
    // 🎯 机器学习相关查询
    if (this._containsKeywords(queryLower, ['机器学习', 'ml', '模型', '训练', '预测', '分类'])) {
        sections.add('机器学习');
        sections.add('ml_workflow');
        console.log(`🎯 [章节推断] 检测到机器学习需求`);
    }
    
    // 🎯 报告生成
    if (this._containsKeywords(queryLower, ['报告', '文档', 'word', 'excel', 'pdf', 'ppt'])) {
        sections.add('自动化报告生成');
        sections.add('report_generator_workflow');
        console.log(`🎯 [章节推断] 检测到报告生成需求`);
    }
    
    // 🎯 上下文增强：考虑之前的工具调用历史
    const recentTools = toolCallHistory.slice(-3).map(h => h.toolName);
    
    if (recentTools.includes('python_sandbox')) {
        sections.add('pandas_cheatsheet');
        sections.add('matplotlib_cookbook');
        console.log(`🎯 [章节推断] 根据历史添加python相关章节`);
    }
    
    if (recentTools.includes('crawl4ai') || recentTools.includes('firecrawl')) {
        sections.add('ETL管道模式');
        sections.add('文本分析与结构化提取');
        console.log(`🎯 [章节推断] 根据历史添加爬虫相关章节`);
    }
    
    // 如果没有任何匹配，添加默认章节
    if (sections.size === 0) {
        sections.add('pandas_cheatsheet');
        console.log(`🎯 [章节推断] 无匹配，添加默认章节`);
    }
    
    const result = Array.from(sections);
    console.log(`🎯 [章节推断] 完成，推断 ${result.length} 个章节:`, result);
    
    return result;
  }

  /**
   * 🎯 辅助方法
   */
  _generateCacheKey(toolName, userQuery, context) {
    const contextStr = context.sessionId || 'default';
    const queryHash = userQuery ? this._hashString(userQuery.substring(0, 100)) : 'no_query';
    return `${toolName}_${contextStr}_${queryHash}`;
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  _containsKeywords(text, keywords) {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  /**
   * 🎯 清理会话数据
   */
  clearSession(sessionId) {
    if (this.injectionHistory.has(sessionId)) {
      const tools = this.injectionHistory.get(sessionId).size;
      this.injectionHistory.delete(sessionId);
      console.log(`🎯 [会话清理] ${sessionId}: 清除 ${tools} 个工具记录`);
    }
    
    // 清理该会话相关的缓存
    const sessionPrefix = `${sessionId}_`;
    let deletedCount = 0;
    
    for (const key of this.knowledgeCache.keys()) {
      if (key.includes(sessionPrefix)) {
        this.knowledgeCache.delete(key);
        this.stats.lastAccess.delete(key);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`🎯 [缓存清理] ${sessionId}: 清除 ${deletedCount} 个缓存项`);
    }
  }

  /**
   * 🎯 获取缓存统计
   */
  getCacheStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1)
      : 0;
    
    return {
      cacheSize: this.knowledgeCache.size,
      injectionHistorySize: this.injectionHistory.size,
      activeSessions: this.injectionHistory.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      compressions: this.stats.compressions,
      lastAccessCount: this.stats.lastAccess.size
    };
  }

  /**
   * 🎯 调试方法：显示缓存内容摘要
   */
  debugCache() {
    console.log('🔍 [缓存调试] ======================');
    console.log(`📊 缓存统计:`, this.getCacheStats());
    
    console.log('🗂️ 缓存内容:');
    let index = 1;
    for (const [key, value] of this.knowledgeCache.entries()) {
      console.log(`${index}. ${key}`);
      console.log(`   工具: ${value.toolName}, 长度: ${value.content.length}, 年龄: ${Math.round((Date.now() - value.timestamp) / 1000)}秒`);
      index++;
    }
    
    console.log('📝 注入历史:');
    for (const [sessionId, tools] of this.injectionHistory.entries()) {
      console.log(`   ${sessionId}: ${Array.from(tools).join(', ')}`);
    }
    
    console.log('==================================');
  }
}

// 导出单例实例
export const skillCacheCompressor = new SkillCacheCompressor();