import { getBaseSkillManager } from '../tool-spec-system/skill-manager.js';

export class EnhancedSkillManager {
  constructor() {
    this.baseSkillManager = null;
    this.isInitialized = false;
    this.executionHistory = this.loadExecutionHistory();
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
      // 假设基础技能管理器在全局可用，或者通过其他方式获取
      if (typeof getBaseSkillManager === 'function') {
        this.baseSkillManager = await getBaseSkillManager();
      } else {
        // 🎯 备用方案：创建一个简单的技能匹配器
        console.warn("基础技能管理器不可用，使用简化版本");
        this.baseSkillManager = this.createFallbackSkillManager();
      }
      
      this.isInitialized = true;
      this.initializationResolve(true);
      console.log("EnhancedSkillManager initialized with skill manager.");
    } catch (error) {
      console.error("EnhancedSkillManager 初始化失败:", error);
      // 🎯 确保即使初始化失败也能继续工作
      this.baseSkillManager = this.createFallbackSkillManager();
      this.isInitialized = true;
      this.initializationResolve(false); // 即使失败也继续
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
      findRelevantSkills: (userQuery, context = {}) => {
        // 🎯 简化的关键词匹配逻辑
        const tools = ['python_sandbox', 'tavily_search', 'firecrawl', 'stockfish_analyzer'];
        const matches = [];
        
        const lowerQuery = userQuery.toLowerCase();
        tools.forEach(toolName => {
          if (lowerQuery.includes(toolName.replace('_', ' ')) || 
              this.doesQueryMatchTool(lowerQuery, toolName)) {
            matches.push({
              toolName,
              score: 0.7 + Math.random() * 0.3, // 基础评分
              category: this.getToolCategory(toolName)
            });
          }
        });
        
        return matches;
      }
    };
  }

  /**
   * 🎯 简化的工具匹配逻辑
   */
  doesQueryMatchTool(query, toolName) {
    const toolKeywords = {
      python_sandbox: ['代码', '编程', '计算', 'python', '运行代码', '执行代码'],
      tavily_search: ['搜索', '查询', '查找', '信息', '资料'],
      firecrawl: ['网页', '网站', '爬取', '抓取', '内容'],
      stockfish_analyzer: ['象棋', '国际象棋', '棋局', '走法']
    };
    
    const keywords = toolKeywords[toolName] || [];
    return keywords.some(keyword => query.includes(keyword));
  }

  getToolCategory(toolName) {
    const categories = {
      python_sandbox: 'code',
      tavily_search: 'search',
      firecrawl: 'web-crawling',
      stockfish_analyzer: 'analysis'
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
    const basicMatches = this.baseSkillManager.findRelevantSkills(userQuery, context);
    if (!basicMatches.length) return null;

    // 🎯 添加执行历史增强评分（这是Agent模式的增值）
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
    
    // 🎯 直接重用基础匹配，不进行增强过滤
    return this.baseSkillManager.findRelevantSkills(userQuery, context);
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
        outputLength: result?.output?.length || 0
      }
    };
    
    this.saveExecution(entry);
    console.log(`[EnhancedSkillManager] 记录工具执行: ${toolName}, 成功: ${success}`);
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
        : 0
    };
  }

  loadExecutionHistory() {
    try {
      return JSON.parse(localStorage.getItem('agent_execution_history') || '{}');
    } catch {
      return {};
    }
  }

  saveExecution(entry) {
    const toolName = entry.toolName;
    if (!this.executionHistory[toolName]) this.executionHistory[toolName] = [];
    
    this.executionHistory[toolName].push(entry);
    
    if (this.executionHistory[toolName].length > 100) {
      this.executionHistory[toolName] = this.executionHistory[toolName].slice(-50);
    }
    
    localStorage.setItem('agent_execution_history', JSON.stringify(this.executionHistory));
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
      successRate: this.getToolSuccessRate(toolName)
    })).sort((a, b) => b.totalExecutions - a.totalExecutions);

    console.log('[EnhancedSkillManager] 工具分析:', analytics);
    return analytics;
  }
}