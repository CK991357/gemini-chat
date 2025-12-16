// src/static/js/agent/EnhancedSkillManager.js
import { knowledgeFederation } from '../tool-spec-system/skill-loader.js';
import { getBaseSkillManager } from '../tool-spec-system/skill-manager.js';

export class EnhancedSkillManager {
  constructor() {
    this.baseSkillManager = null;
    this.isInitialized = false;
    this.executionHistory = this.loadExecutionHistory();
    this.knowledgeFederation = knowledgeFederation;
    
    // 🎯 新增：知识库缓存系统
    this.knowledgeCache = new Map(); // tool -> {full, summary, compressed, timestamp}
    this.injectionHistory = new Map(); // sessionId -> [toolNames]
    this.compressionEnabled = true;
    this.maxKnowledgeChars = 15000; // 最大知识库字符数
    this.initializationPromise = this.initialize();
    this.initializationResolve = null;
    this.initializationReject = null;
    
    // 🎯 创建等待机制
    this.readyPromise = new Promise((resolve, reject) => {
      this.initializationResolve = resolve;
      this.initializationReject = reject;
    });
  }

  async initialize() {
    try {
      // 🎯 修复：动态获取基础技能管理器
      if (typeof getBaseSkillManager === 'function') {
        this.baseSkillManager = await getBaseSkillManager();
      } else {
        // 🎯 备用方案：创建一个简单的技能匹配器
        console.warn("基础技能管理器不可用，使用简化版本");
        this.baseSkillManager = this.createFallbackSkillManager();
      }
      
      // 🎯 新增：确保联邦知识库初始化
      if (this.knowledgeFederation && typeof this.knowledgeFederation.initializeFromRegistry === 'function') {
        const skillsRegistry = await this.getSkillsRegistry();
        if (skillsRegistry) {
          await this.knowledgeFederation.initializeFromRegistry(skillsRegistry);
          console.log("[EnhancedSkillManager] ✅ 联邦知识库初始化完成");
        }
      }
      
      this.isInitialized = true;
      this.initializationResolve(true);
      console.log("EnhancedSkillManager initialized with skill manager.");
    } catch (error) {
      console.error("EnhancedSkillManager 初始化失败:", error);
      // 🎯 确保即使初始化失败也能继续工作
      this.baseSkillManager = this.createFallbackSkillManager();
      this.isInitialized = true;
      this.initializationResolve(false);
    }
  }

  /**
   * 🎯 新增：获取技能注册表
   */
  async getSkillsRegistry() {
    try {
      // 这里需要根据您的项目结构获取技能注册表
      // 例如：从 generated-skills.js 导入
      const { getSkillsRegistry } = await import('../tool-spec-system/generated-skills.js');
      return getSkillsRegistry ? getSkillsRegistry() : null;
    } catch (error) {
      console.warn("[EnhancedSkillManager] 无法获取技能注册表:", error);
      return null;
    }
  }

  /**
   * 🎯 新增：等待初始化完成的方法
   */
  async waitUntilReady() {
    return this.readyPromise;
  }

  /**
   * 🎯 创建备用技能管理器
   */
  createFallbackSkillManager() {
    return {
      findRelevantSkills: async (userQuery, context = {}) => {
        try {
          const baseSkillManager = await getBaseSkillManager();
          if (baseSkillManager && baseSkillManager.findRelevantSkills) {
            return baseSkillManager.findRelevantSkills(userQuery, context);
          }
        } catch (error) {
          console.warn('重用技能系统失败，使用简化降级:', error);
        }
        
        // 🎯 真正的降级：极简匹配
        return this.simplifiedFallback(userQuery, context);
      }
    };
  }

  /**
   * 🎯 真正的降级：极简匹配
   */
  simplifiedFallback(userQuery, context = {}) {
    const availableTools = context.availableTools || [];
    const matches = [];
    const lowerQuery = userQuery.toLowerCase();
    
    // 🎯 只做最基本的工具名匹配
    availableTools.forEach(toolName => {
      if (lowerQuery.includes(toolName.replace('_', ' '))) {
        matches.push({
          toolName,
          score: 0.8,
          category: this.getToolCategory(toolName)
        });
      }
    });
    
    return matches;
  }

  getToolCategory(toolName) {
    const categories = {
      python_sandbox: 'code',
      tavily_search: 'search',
      firecrawl: 'web-crawling',
      stockfish_analyzer: 'analysis',
      crawl4ai: 'web-crawling',
      glm4v_analyze_image: 'vision'
    };
    return categories[toolName] || 'general';
  }

  /**
   * 🎯 核心：重用基础技能匹配，但添加增强评分
   * 保持与现有技能系统的完全兼容
   */
  async findOptimalSkill(userQuery, context = {}) {
    await this.waitUntilReady();

    // 🎯 重用基础技能匹配（确保与现有系统一致）
    const basicMatches = await this.baseSkillManager.findRelevantSkills(userQuery, context);
    if (!basicMatches.length) return null;

    // 🎯 添加执行历史增强评分
    const enhancedMatches = basicMatches.map(match => ({
      ...match,
      enhancedScore: this.calculateEnhancedScore(match),
      successRate: this.getToolSuccessRate(match.toolName),
      usageStats: this.getToolUsage(match.toolName)
    })).sort((a, b) => b.enhancedScore - a.enhancedScore);

    console.log(`[EnhancedSkillManager] 增强评分完成:`, 
      enhancedMatches.map(m => `${m.toolName}: ${(m.enhancedScore * 100).toFixed(1)}%`)
    );

    return enhancedMatches;
  }

  /**
   * 🎯 提供与基础系统相同的接口
   */
  async findRelevantSkills(userQuery, context = {}) {
    await this.waitUntilReady();

    // 🎯 URL检测与预处理
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = userQuery.match(urlRegex);
    let processedQuery = userQuery;
    let urlBonus = 0;
    
    if (urls && urls.length > 0) {
        console.log(`[EnhancedSkillManager] 检测到URL: ${urls[0]}`);
        // 为包含URL的查询添加crawl4ai权重加成
        urlBonus = 0.5;
        // 保留URL作为查询上下文，但移除特殊字符影响
        processedQuery = userQuery.replace(urlRegex, '').trim() + ' 网页内容分析';
    }
    
    // 原有技能匹配逻辑...
    const basicMatches = await this.baseSkillManager.findRelevantSkills(processedQuery, context);
    
    // 🎯 URL权重应用
    if (urlBonus > 0) {
        basicMatches.forEach(match => {
            if (match.toolName === 'crawl4ai') {
                match.score += urlBonus;
                console.log(`[EnhancedSkillManager] 为crawl4ai添加URL权重加成: +${urlBonus}`);
            }
        });
    }
    
    return basicMatches;
  }

  /**
   * 🎯 新增：DeepResearch模式专用技能匹配
   */
  async findResearchSkills(userQuery, context = {}) {
    await this.waitUntilReady();
    
    // 🎯 获取基础匹配
    const basicMatches = await this.baseSkillManager.findRelevantSkills(userQuery, {
      ...context,
      // 🎯 DeepResearch模式优先使用研究相关工具
      preferredTools: ['tavily_search', 'crawl4ai', 'python_sandbox']
    });
    
    // 🎯 为DeepResearch模式添加研究优化评分
    const researchMatches = basicMatches.map(match => ({
      ...match,
      researchScore: this.calculateResearchScore(match, userQuery),
      researchSuitability: this.assessResearchSuitability(match.toolName)
    })).sort((a, b) => b.researchScore - a.researchScore);
    
    console.log(`[EnhancedSkillManager] DeepResearch技能匹配完成:`, 
      researchMatches.map(m => `${m.toolName}: ${(m.researchScore * 100).toFixed(1)}%`)
    );
    
    return researchMatches;
  }

  /**
   * 🎯 计算研究模式专用评分
   */
  calculateResearchScore(match, userQuery) {
    const baseScore = match.score;
    const toolName = match.toolName;
    
    // 🎯 研究工具优先级调整
    const researchToolMultipliers = {
      'tavily_search': 1.3,    // 搜索工具最高优先级
      'crawl4ai': 1.2,         // 爬虫工具高优先级
      'python_sandbox': 1.1,   // 数据分析中等优先级
      'default': 0.8           // 其他工具降低优先级
    };
    
    const multiplier = researchToolMultipliers[toolName] || researchToolMultipliers.default;
    
    // 🎯 查询复杂度分析
    const queryComplexity = this.analyzeQueryComplexity(userQuery);
    const complexityBonus = queryComplexity > 2 ? 0.2 : 0;
    
    return baseScore * multiplier + complexityBonus;
  }

  /**
   * 🎯 评估工具对研究的适用性
   */
  assessResearchSuitability(toolName) {
    const suitabilityScores = {
      'tavily_search': {
        score: 95,
        strengths: ['信息检索', '多源收集', '快速搜索'],
        limitations: ['内容深度有限', '依赖搜索算法']
      },
      'crawl4ai': {
        score: 90,
        strengths: ['深度内容提取', '结构化数据', '完整页面获取'],
        limitations: ['速度较慢', '可能被反爬']
      },
      'python_sandbox': {
        score: 75,
        strengths: ['数据分析', '自定义处理', '复杂计算'],
        limitations: ['需要编程知识', '执行时间较长']
      },
      'default': {
        score: 50,
        strengths: ['基础功能'],
        limitations: ['非研究专用']
      }
    };
    
    return suitabilityScores[toolName] || suitabilityScores.default;
  }

  /**
   * 🎯 分析查询复杂度
   */
  analyzeQueryComplexity(userQuery) {
    let complexity = 0;
    
    // 长度复杂度
    if (userQuery.length > 100) complexity += 1;
    if (userQuery.length > 200) complexity += 1;
    
    // 主题复杂度
    const topicSeparators = /[、，,;；]/g;
    const topicCount = (userQuery.match(topicSeparators) || []).length + 1;
    if (topicCount > 2) complexity += 1;
    
    // 关键词复杂度
    const researchKeywords = ['研究', '分析', '调查', '报告', '趋势', '发展', '深度'];
    const keywordCount = researchKeywords.filter(keyword => 
      userQuery.includes(keyword)
    ).length;
    if (keywordCount > 1) complexity += 1;
    
    return Math.min(complexity, 4);
  }

  /**
   * 🎯 【核心优化】智能知识检索与压缩
   */
  async retrieveFederatedKnowledge(toolName, context = {}, options = {}) {
    const {
      compression = 'smart', // smart, minimal, reference
      maxChars = this.maxKnowledgeChars,
      iteration = 0, // 当前迭代次数
      sessionId = context.sessionId || 'default'
    } = options;

    console.log(`[EnhancedSkillManager] 🎯 智能检索: ${toolName}, 迭代: ${iteration}, 压缩: ${compression}`);

    // 🎯 1. 检查是否已经注入过（同一个会话中）
    if (this.hasBeenInjected(sessionId, toolName) && iteration > 0) {
      console.log(`[EnhancedSkillManager] 🔄 工具 ${toolName} 已在当前会话中注入过，使用引用模式`);
      return this.getKnowledgeReference(toolName, context);
    }

    // 🎯 2. 检查缓存
    const cacheKey = `${toolName}_${compression}`;
    if (this.knowledgeCache.has(cacheKey)) {
      const cached = this.knowledgeCache.get(cacheKey);
      // 缓存有效（5分钟内）
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        console.log(`[EnhancedSkillManager] 🔄 使用缓存: ${toolName} (${cached.content.length} chars)`);
        this.recordInjection(sessionId, toolName);
        return this.formatKnowledgeForIteration(cached, context, iteration);
      }
    }

    // 🎯 3. 获取原始知识
    const rawKnowledge = await this._getRawFederatedKnowledge(toolName, context);
    if (!rawKnowledge) return null;

    // 🎯 4. 智能压缩内容（核心优化）
    const compressedContent = await this.compressKnowledge(
      rawKnowledge.content,
      compression,
      maxChars,
      context.userQuery
    );

    // 🎯 5. 缓存并记录
    const processed = {
      ...rawKnowledge,
      content: compressedContent,
      originalLength: rawKnowledge.content.length,
      compressedLength: compressedContent.length,
      compressionRate: (1 - compressedContent.length / rawKnowledge.content.length).toFixed(2),
      compression,
      timestamp: Date.now()
    };

    this.knowledgeCache.set(cacheKey, processed);
    this.recordInjection(sessionId, toolName);

    console.log(`[EnhancedSkillManager] ✅ 知识压缩: ${processed.originalLength} → ${processed.compressedLength} 字符 (压缩率: ${processed.compressionRate})`);

    // 🎯 6. 根据迭代次数格式化输出
    return this.formatKnowledgeForIteration(processed, context, iteration);
  }

  /**
   * 🎯 [增强版] 基于上下文智能推断相关章节
   * 构建高密度的关键词映射网络，覆盖更多隐晦场景
   */
  /**
   * 🎯 [增强版] 基于上下文智能推断相关章节
   * 构建高密度的关键词映射网络，覆盖更多隐晦场景
   */
  _inferRelevantSections(context) {
    const sections = new Set(); // 使用Set避免重复
    const { userQuery, toolCallHistory = [] } = context; // 提取 toolCallHistory
    
    if (!userQuery) return Array.from(sections);
    
    const queryLower = userQuery.toLowerCase();
    
    // ============================================================
    // 1. 精确关键词匹配 + 优先级评分
    // ============================================================
    const keywordPatterns = [
      // 高优先级匹配（精确词组）
      {
        patterns: ['数据清洗', '清洗数据', '清理数据', 'data clean', 'data cleaning'],
        sections: ['数据清洗与分析', 'pandas_cheatsheet', 'ETL管道模式'],
        score: 1.0
      },
      {
        patterns: ['数据分析', '分析数据', 'data analysis', 'analyze data'],
        sections: ['数据清洗与分析', 'pandas_cheatsheet', 'ETL管道模式', '数据可视化'],
        score: 0.9
      },
      {
        patterns: ['数据可视化', '可视化', '画图', '绘图', 'plot', 'chart', 'graph'],
        sections: ['数据可视化', 'matplotlib_cookbook'],
        score: 1.0
      },
      {
        patterns: ['文本分析', '文本处理', '结构化提取', 'extract text', 'text analysis', '正则表达式'],
        sections: ['文本分析与结构化提取', 'text_analysis_cookbook.md'],
        score: 1.0
      },
      {
        patterns: ['公式', '证明', '推导', '计算', 'formula', 'proof', 'derivative', '微积分'],
        sections: ['公式证明工作流', 'sympy_cookbook'],
        score: 0.8
      },
      {
        patterns: ['机器学习', '模型训练', '预测', '分类', 'ml', 'machine learning', '回归', '聚类'],
        sections: ['机器学习', 'ml_workflow'],
        score: 0.9
      },
      {
        patterns: ['报告生成', '文档导出', '生成pdf', '生成word', 'report generate'],
        sections: ['自动化报告生成', 'report_generator_workflow'],
        score: 0.8
      }
    ];
    
    // 执行精确匹配
    keywordPatterns.forEach(pattern => {
      const hasMatch = pattern.patterns.some(p =>
        queryLower.includes(p.toLowerCase())
      );
      
      if (hasMatch) {
        pattern.sections.forEach(section => sections.add(section));
      }
    });
    
    // ============================================================
    // 2. 模糊匹配（分词+语义相似度）
    // ============================================================
    const queryWords = queryLower.split(/[\s,\，、;；]+/);
    
    // 构建语义相似度词典
    const semanticGroups = {
      'data': ['数据', 'dataset', 'dataframe', '表格', 'excel', 'csv'],
      'analysis': ['分析', 'analyze', 'process', '处理', '统计'],
      'visualization': ['可视化', 'visualize', '图表', 'plot', 'graph', 'chart'],
      'cleaning': ['清洗', '清理', 'clean', 'cleaning', 'preprocess'],
      'text': ['文本', '文字', 'text', 'string', '文档'],
      'extract': ['提取', '抽取', 'extract', 'parse', '解析'],
      'math': ['数学', '计算', '公式', '方程', 'math', 'calculate'],
      'ml': ['机器学习', 'ai', '人工智能', '模型', '训练']
    };
    
    queryWords.forEach(word => {
      // 查找语义相关组
      Object.entries(semanticGroups).forEach(([group, synonyms]) => {
        if (synonyms.includes(word)) {
          // 根据组别添加相关章节
          switch(group) {
            case 'data':
            case 'analysis':
            case 'cleaning':
              sections.add('pandas_cheatsheet');
              sections.add('ETL管道模式');
              sections.add('数据清洗与分析');
              break;
            case 'visualization':
              sections.add('matplotlib_cookbook');
              sections.add('数据可视化');
              break;
            case 'text':
            case 'extract':
              sections.add('text_analysis_cookbook.md');
              sections.add('文本分析与结构化提取');
              break;
            case 'math':
              sections.add('公式证明工作流');
              sections.add('sympy_cookbook');
              sections.add('科学计算与优化');
              break;
            case 'ml':
              sections.add('机器学习');
              sections.add('ml_workflow');
              break;
          }
        }
      });
    });
    
    // ============================================================
    // 3. 上下文增强（考虑之前的工具调用历史）
    // ============================================================
    const recentTools = toolCallHistory.slice(-3).map(h => h.toolName); // 最近3个工具
    
    if (recentTools.includes('python_sandbox')) {
      // 如果最近使用了python_sandbox，增加相关章节的权重
      sections.add('pandas_cheatsheet');
      sections.add('matplotlib_cookbook');
      sections.add('scipy_cookbook');
    }
    
    if (recentTools.includes('crawl4ai') || recentTools.includes('firecrawl')) {
      // 如果最近抓取了数据，添加数据处理章节
      sections.add('ETL管道模式');
      sections.add('文本分析与结构化提取');
    }
    
    // ============================================================
    // 4. 章节存在性验证（预检查） - 仅日志输出
    // ============================================================
    
    console.log(`[EnhancedSkillManager] 🧠 智能章节推断完成:`, {
      原始查询: userQuery,
      推断章节: Array.from(sections),
      匹配模式: '混合策略（精确+模糊+语义+上下文）'
    });
    
    return Array.from(sections);
  }

  /**
   * 🎯 新增：测试联邦知识检索
   */
  async testFederatedKnowledgeRetrieval() {
    console.log("[EnhancedSkillManager] 🧪 测试联邦知识检索...");
    
    const testCases = [
      { tool: 'python_sandbox', context: { userQuery: '证明数学公式' } },
      { tool: 'python_sandbox', context: { userQuery: '科学计算与优化' } },
      { tool: 'python_sandbox', context: { userQuery: '数据分析和可视化' } },
      { tool: 'python_sandbox', context: { userQuery: '文本结构化提取' } }
    ];
    
    for (const testCase of testCases) {
      const result = await this.retrieveFederatedKnowledge(testCase.tool, testCase.context);
      console.log(`测试 ${testCase.tool}:`, {
        查询: testCase.context.userQuery,
        结果: result ? '成功' : '失败',
        章节: result?.suggestedSections
      });
    }
  }

  /**
   * 🎯 【核心】智能知识压缩算法
   */
  async compressKnowledge(content, level, maxChars, userQuery = '') {
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
                instructionsMatch.split('\n')
                  .filter(line => line.trim() && !line.trim().startsWith('#') && line.trim().length > 10)
                  .slice(0, 10) // 只取前10行
                  .join('\n') + '\n\n';
    }

    // 4. 如果没有找到关键部分，返回前3000字符
    if (minimal.length < 500) {
      minimal = content.substring(0, Math.min(3000, content.length)) + '...';
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
          if (titleMatch && titleMatch[1]) {
            const title = String(titleMatch[1] || '').toLowerCase(); // 🛡️ 强制转为字符串
            if (title.includes(word)) {
              score += 3;
            }
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
   * 🎯 根据迭代次数格式化知识
   */
  formatKnowledgeForIteration(knowledge, context, iteration) {
    const { metadata, content, originalLength, compressedLength } = knowledge;
    
    // 第一次迭代：详细指南
    if (iteration === 0) {
      return {
        tool: knowledge.tool,
        metadata,
        content: `## 🛠️ 详细工具指南: ${metadata.name}\n\n` +
                `**核心功能**: ${metadata.description}\n\n` +
                `📖 **操作指南** (已智能压缩: ${originalLength} → ${compressedLength} 字符):\n\n` +
                content,
        isCompressed: true
      };
    }
    
    // 后续迭代：只给关键提示
    return {
      tool: knowledge.tool,
      metadata,
      content: `## 🛠️ 工具提示: ${metadata.name}\n\n` +
              `**关键提醒**: ${this.extractKeyBulletPoints(content, 2)}\n\n` +
              `*完整指南已在步骤0提供。*`,
      isReference: true
    };
  }

  /**
   * 🎯 辅助方法
   */
  hasBeenInjected(sessionId, toolName) {
    return this.injectionHistory.has(sessionId) &&
           this.injectionHistory.get(sessionId).includes(toolName);
  }

  recordInjection(sessionId, toolName) {
    if (!this.injectionHistory.has(sessionId)) {
      this.injectionHistory.set(sessionId, []);
    }
    const injected = this.injectionHistory.get(sessionId);
    if (!injected.includes(toolName)) {
      injected.push(toolName);
    }
  }

  getKnowledgeReference(toolName, context) {
    const cacheKey = `${toolName}_smart`;
    if (this.knowledgeCache.has(cacheKey)) {
      const cached = this.knowledgeCache.get(cacheKey);
      return {
        tool: toolName,
        metadata: cached.metadata,
        content: this.createKnowledgeReference(cached.content),
        isReference: true
      };
    }
    return null;
  }

  extractKeyBulletPoints(content, maxPoints = 3) {
    const points = [];
    
    // 提取关键指令
    const lines = content.split('\n');
    lines.forEach(line => {
      if (line.includes('必须') || line.includes('确保') || line.includes('不要') ||
          line.includes('关键') || line.includes('重要')) {
        const clean = line.replace(/^[-\*•]\s*/, '').trim();
        if (clean && !clean.startsWith('#') && points.length < maxPoints) {
          points.push(clean);
        }
      }
    });
    
    return points.length > 0 ? points.join('；') : '请参考完整指南中的说明。';
  }

  /**
   * 内部方法：获取原始知识
   */
  async _getRawFederatedKnowledge(toolName, context) {
    try {
      const requestedSections = this._inferRelevantSections(context);
      
      // 使用现有的知识联邦方法
      const knowledgePackageContent = this.knowledgeFederation.getFederatedKnowledge(
        toolName,
        requestedSections
      );

      if (!knowledgePackageContent) {
        console.warn(`[EnhancedSkillManager] 知识库中不存在工具: ${toolName}`);
        return null;
      }

      const skill = this.knowledgeFederation.knowledgeBase.get(toolName);
      if (!skill) return null;

      const result = {
        tool: toolName,
        metadata: skill.metadata || {},
        content: knowledgePackageContent,
        suggestedSections: requestedSections,
        retrievalContext: context,
        timestamp: Date.now()
      };

      console.log(`[EnhancedSkillManager] ✅ 原始知识检索成功完成: ${toolName}`, {
        contentLength: knowledgePackageContent.length,
        sectionsFound: requestedSections
      });

      return result;
    } catch (error) {
      console.error(`[EnhancedSkillManager] ❌ 获取原始知识失败: ${toolName}`, error);
      return null;
    }
  }

  // 🎯 其余方法保持不变...
  calculateEnhancedScore(match) {
    const baseScore = match.score;
    const successRate = this.getToolSuccessRate(match.toolName);
    const usage = this.getToolUsage(match.toolName);
    
    if (usage.totalExecutions < 2) {
      return baseScore * 0.7;
    } else if (successRate > 0.8) {
      return baseScore * (0.6 + 0.4 * successRate);
    } else {
      return baseScore * (0.7 + 0.3 * successRate);
    }
  }

  recordToolExecution(toolName, parameters, success, result, error = null) {
    const entry = {
      timestamp: Date.now(),
      toolName,
      parameters: this.sanitizeParameters(parameters),
      success,
      executionTime: result?.executionTime || 0,
      error: error?.message,
      context: {
        userQuery: parameters?.query || parameters?.prompt || 'unknown',
        outputLength: result?.output?.length || 0,
        mode: result?.mode || 'standard' // 🎯 记录调用模式
      }
    };
    
    this.saveExecution(entry);
    console.log(`[EnhancedSkillManager] 记录工具执行: ${toolName}, 模式: ${entry.context.mode}, 成功: ${success}`);
  }

  getToolSuccessRate(toolName) {
    const usage = this.getToolUsage(toolName);
    if (usage.totalExecutions === 0) return 0.5;
    
    const successRate = usage.successfulExecutions / usage.totalExecutions;
    console.log(`[EnhancedSkillManager] 工具 ${toolName} 成功率: ${(successRate * 100).toFixed(1)}%`);
    return successRate;
  }

  getToolUsage(toolName) {
    const history = this.executionHistory[toolName] || [];
    const successfulExecutions = history.filter(entry => entry.success).length;
    
    return {
      totalExecutions: history.length,
      successfulExecutions,
      lastUsed: history.length > 0 ? Math.max(...history.map(e => e.timestamp)) : null,
      averageExecutionTime: history.length > 0 
        ? history.reduce((sum, e) => sum + (e.executionTime || 0), 0) / history.length 
        : 0,
      // 🎯 新增：模式使用统计
      modeUsage: this.getModeUsage(toolName)
    };
  }

  /**
   * 🎯 新增：获取工具在不同模式下的使用统计
   */
  getModeUsage(toolName) {
    const history = this.executionHistory[toolName] || [];
    const modeStats = {};
    
    history.forEach(entry => {
      const mode = entry.context?.mode || 'standard';
      modeStats[mode] = (modeStats[mode] || 0) + 1;
    });
    
    return modeStats;
  }

  loadExecutionHistory() {
    try {
      if (!localStorage) return {};
      return JSON.parse(localStorage.getItem('agent_execution_history') || '{}');
    } catch {
      return {};
    }
  }

  saveExecution(entry) {
    try {
      if (!localStorage) return;
      
      const toolName = entry.toolName;
      if (!this.executionHistory[toolName]) this.executionHistory[toolName] = [];
      
      this.executionHistory[toolName].push(entry);
      
      if (this.executionHistory[toolName].length > 100) {
        this.executionHistory[toolName] = this.executionHistory[toolName].slice(-50);
      }
      
      localStorage.setItem('agent_execution_history', JSON.stringify(this.executionHistory));
    } catch (error) {
      console.warn('无法保存执行历史（可能处于隐私模式）:', error);
    }
  }

  sanitizeParameters(parameters) {
    const sanitized = { ...parameters };
    if (sanitized.code && sanitized.code.length > 200) {
      sanitized.code = sanitized.code.substring(0, 200) + '...';
    }
    if (sanitized.image_url) {
      sanitized.image_url = '[IMAGE_URL_REDACTED]';
    }
    return sanitized;
  }

  getToolAnalytics() {
    const tools = new Set(Object.keys(this.executionHistory));
    const analytics = Array.from(tools).map(toolName => ({
      toolName,
      ...this.getToolUsage(toolName),
      successRate: this.getToolSuccessRate(toolName),
      researchSuitability: this.assessResearchSuitability(toolName)
    })).sort((a, b) => b.totalExecutions - a.totalExecutions);

    console.log('[EnhancedSkillManager] 工具分析:', analytics);
    return analytics;
  }
}