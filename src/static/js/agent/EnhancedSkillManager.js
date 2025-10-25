import { skillManager } from '../../../tool-spec-system/skill-manager.js';

export class EnhancedSkillManager {
  constructor() {
    this.baseSkillManager = skillManager;
    this.executionHistory = this.loadExecutionHistory();
  }

  async findOptimalSkill(userQuery, context = {}) {
    const basicMatches = this.baseSkillManager.findRelevantSkills(userQuery, context);
    if (!basicMatches.length) return null;

    const enhancedMatches = basicMatches.map(match => ({
      ...match,
      enhancedScore: this.calculateEnhancedScore(match),
      successRate: this.getToolSuccessRate(match.toolName)
    })).sort((a, b) => b.enhancedScore - a.enhancedScore);

    return enhancedMatches[0];
  }

  recordToolExecution(toolName, parameters, success, result, error = null) {
    const entry = {
      timestamp: Date.now(),
      toolName,
      parameters: this.sanitizeParameters(parameters),
      success,
      executionTime: result?.executionTime || 0,
      error: error?.message
    };
    this.saveExecution(entry);
  }

  getToolAnalytics() {
    const tools = new Set(Object.keys(this.executionHistory));
    return Array.from(tools).map(toolName => ({
      toolName,
      ...this.getToolUsage(toolName),
      successRate: this.getToolSuccessRate(toolName)
    }));
  }

  // 私有方法
  calculateEnhancedScore(match) {
    const baseScore = match.score;
    const successRate = this.getToolSuccessRate(match.toolName);
    const usage = this.getToolUsage(match.toolName);
    
    if (usage.totalExecutions < 3) return baseScore * 0.8;
    return baseScore * (0.6 + 0.4 * successRate);
  }

  getToolSuccessRate(toolName) {
    const usage = this.getToolUsage(toolName);
    return usage.totalExecutions > 0 ? usage.successfulExecutions / usage.totalExecutions : 0.5;
  }

  getToolUsage(toolName) {
    const history = this.executionHistory[toolName] || [];
    const successfulExecutions = history.filter(entry => entry.success).length;
    return {
      totalExecutions: history.length,
      successfulExecutions,
      lastUsed: history.length > 0 ? Math.max(...history.map(e => e.timestamp)) : null
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
    if (this.executionHistory[toolName].length > 50) this.executionHistory[toolName].shift();
    
    localStorage.setItem('agent_execution_history', JSON.stringify(this.executionHistory));
  }

  sanitizeParameters(parameters) {
    const sanitized = { ...parameters };
    if (sanitized.code && sanitized.code.length > 200) {
      sanitized.code = sanitized.code.substring(0, 200) + '...';
    }
    return sanitized;
  }
}