// src/static/js/agent/EnhancedSkillManager.js
import { knowledgeFederation } from '../tool-spec-system/skill-loader.js';
import { getBaseSkillManager } from '../tool-spec-system/skill-manager.js';

export class EnhancedSkillManager {
  constructor() {
    this.baseSkillManager = null;
    this.isInitialized = false;
    this.executionHistory = this.loadExecutionHistory();
    this.knowledgeFederation = knowledgeFederation;
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
   * 🎯 联邦知识检索API - 修复版本
   */
  async retrieveFederatedKnowledge(toolName, context = {}) {
    console.log(`[EnhancedSkillManager] 🔍 联邦知识检索: ${toolName}`, context);
    
    // 🔴 移除外层的 try...catch，因为我们希望即使部分失败也能返回内容
    try {
      const requestedSections = this._inferRelevantSections(context);
      
      // ✅ 关键修复：getFederatedKnowledge 应该返回一个包含内容的字符串，而不是 null
      const knowledgePackageContent = this.knowledgeFederation.getFederatedKnowledge(
        toolName,
        requestedSections
      );

      if (!knowledgePackageContent) {
        // 如果 knowledgeFederation 明确返回 null (意味着工具本身不存在)
        console.warn(`[EnhancedSkillManager] 知识库中不存在工具: ${toolName}`);
        return null;
      }

      // 只要拿到了内容字符串，就认为检索是成功的
      const result = {
        tool: toolName,
        metadata: this.knowledgeFederation.knowledgeBase.get(toolName)?.metadata || {},
        content: knowledgePackageContent, // <-- 使用获取到的内容
        suggestedSections: requestedSections,
        retrievalContext: context,
        timestamp: Date.now()
      };

      console.log(`[EnhancedSkillManager] ✅ 联邦知识检索成功完成: ${toolName}`, {
        contentLength: knowledgePackageContent.length,
        sectionsFound: requestedSections // 即使内容为空，也记录请求过的章节
      });

      return result;
      
    } catch (error) {
        // 这个 catch 现在只用于捕获真正意外的、破坏性的错误
        console.error(`[EnhancedSkillManager] ❌ 联邦知识检索过程中发生严重错误: ${toolName}`, error);
        return null;
    }
}

  /**
   * 🎯 基于上下文智能推断相关章节 - 增强版本
   */
  _inferRelevantSections(context) {
    const sections = [];
    const { userQuery, currentStep, researchMode } = context;

    if (!userQuery) return sections;

    // 🎯 基于查询内容推断章节
    const queryLower = userQuery.toLowerCase();
    
    // 数学证明相关
    if (queryLower.includes('证明') || queryLower.includes('公式') || queryLower.includes('数学')) {
      sections.push('公式证明工作流', 'sympy_cookbook');
    }
    
    // 🎯 新增：科学计算与优化
    if (queryLower.includes('科学计算') || queryLower.includes('优化') || queryLower.includes('统计') || 
        queryLower.includes('数值') || queryLower.includes('计算')) {
      sections.push('科学计算与优化', 'scipy_cookbook');
    }
    
    // 数据分析相关
    if (queryLower.includes('数据') && queryLower.includes('分析')) {
      sections.push('数据清洗与分析', 'pandas_cheatsheet', 'ETL管道模式');
    }
    
    // 可视化相关 (增强关键词)
    // 增加 '折线图', '绘图', 'matplotlib', 'plt' 等
    if (queryLower.includes('图表') || queryLower.includes('可视化') || queryLower.includes('画图') ||
        queryLower.includes('折线图') || queryLower.includes('绘图') || queryLower.includes('matplotlib') || queryLower.includes('plt')) {
      sections.push('数据可视化', 'matplotlib_cookbook');
    }
    
    // 报告生成相关
    if (queryLower.includes('报告') || queryLower.includes('生成') || queryLower.includes('文档')) {
      sections.push('自动化报告生成', 'report_generator_workflow');
    }
    
    // 机器学习相关
    if (queryLower.includes('机器学习') || queryLower.includes('模型') || queryLower.includes('训练')) {
      sections.push('机器学习', 'ml_workflow');
    }
    
    // 网页抓取相关
    if (queryLower.includes('网页') || queryLower.includes('抓取') || queryLower.includes('爬虫')) {
      sections.push('网页抓取最佳实践', '智能内容提取');
    }

    console.log(`[EnhancedSkillManager] 🧠 智能章节推断:`, sections);
    return sections;
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
      { tool: 'crawl4ai', context: { userQuery: '网页抓取最佳实践' } }
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