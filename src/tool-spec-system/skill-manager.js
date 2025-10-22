/**
 * @file Worker环境专用技能管理器
 * @description 数据源于构建时生成的 SKILLS_REGISTRY，提供技能匹配、注入等运行时逻辑
 */
import { SKILLS_REGISTRY } from './skill-registry.js';

class WorkerSkillManager {
  constructor() {
    // 直接从构建好的注册表获取技能数据
    this.skills = SKILLS_REGISTRY;
    this.initialized = this.skills.size > 0;

    if (this.initialized) {
      console.log(`🎯 [运行时] 技能系统已就绪，可用技能: ${this.skills.size} 个。`);
      console.log(`📋 可用工具: ${Array.from(this.skills.keys()).join(', ')}`);
    } else {
      console.warn(`⚠️ [运行时] 未加载任何技能，技能注入功能将不可用。`);
    }
  }

  /**
   * 根据用户查询匹配相关技能
   */
  findRelevantSkills(userQuery, context = {}) {
    if (!this.initialized) {
      console.warn('⚠️ 技能系统未初始化，无法匹配技能');
      return [];
    }
    
    const query = userQuery.toLowerCase().trim();
    if (!query || query.length < 3) {
      return [];
    }
    
    console.log(`🔍 [技能匹配] 开始匹配，查询: "${query}"`);
    const matches = [];
    
    for (const [toolName, skill] of this.skills) {
      const relevanceScore = this.calculateRelevanceScore(query, skill, context);
      
      if (relevanceScore >= 0.15) {
        matches.push({
          skill,
          score: relevanceScore,
          toolName,
          name: skill.metadata.name,
          description: skill.metadata.description,
          category: skill.metadata.category
        });
      }
    }
    
    const sortedMatches = matches.sort((a, b) => b.score - a.score).slice(0, 3);
    
    if (sortedMatches.length > 0) {
      console.log(`📊 [技能匹配] 完成，找到 ${sortedMatches.length} 个相关技能:`);
      sortedMatches.forEach(match => {
        console.log(`   - ${match.name}: ${(match.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log(`🔍 [技能匹配] 未找到相关技能`);
    }
    
    return sortedMatches;
  }

  /**
   * 计算查询与技能的相关性分数
   */
  calculateRelevanceScore(query, skill, context) {
    let score = 0;
    const { metadata, content } = skill;
    
    // 构建搜索文本
    const searchText = `
      ${metadata.name || ''}
      ${metadata.description || ''}
      ${content || ''}
      ${(metadata.tags || []).join(' ')}
    `.toLowerCase();
    
    // 关键词匹配
    const keywords = query.split(/\s+/)
      .filter(k => k.length > 1)
      .filter(k => !['请', '帮', '我', '怎么', '如何', '什么', '为什么', 'the', 'and', 'for'].includes(k));
    
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = searchText.match(regex);
      if (matches) {
        score += matches.length * 0.08;
      }
    });
    
    // 类别匹配
    if (context.category && metadata.category === context.category) {
      score += 0.25;
    }
    
    // 标签匹配
    if (metadata.tags && Array.isArray(metadata.tags)) {
      metadata.tags.forEach(tag => {
        if (query.includes(tag)) {
          score += 0.15;
        }
      });
    }
    
    // 优先级调整
    if (metadata.priority) {
      score += (metadata.priority / 10) * 0.15;
    }
    
    // 工具名称完全匹配（最高优先级）
    if (query.includes(metadata.tool_name) || query.includes(metadata.name)) {
      score += 0.6;
    }
    
    // 确保分数在合理范围内
    return Math.min(Math.max(score, 0), 1.0);
  }

  /**
   * 生成技能注入内容
   */
  generateSkillInjection(skill, injectionType = 'precise') {
    const { metadata, content } = skill;
    
    const keyInstructions = this.extractKeyInstructions(content);
    const callingFormat = this.extractCallingFormat(content);
    
    return `## 🛠️ 工具指南: ${metadata.name}

${metadata.description}

**关键指令:**
${keyInstructions}

**调用格式:**
\`\`\`json
${callingFormat}
\`\`\`

请严格遵循上述指南使用 **${metadata.tool_name}** 工具。`;
  }

  /**
   * 提取关键指令
   */
  extractKeyInstructions(content) {
    // 尝试多种方式提取关键指令
    const instructionMatch = content.match(/## 关键指令[\s\S]*?(?=##|$)/i);
    if (instructionMatch) {
      return instructionMatch[0]
        .replace(/## 关键指令/i, '')
        .trim()
        .split('\n')
        .filter(line => line.trim() && !line.trim().startsWith('#'))
        .map(line => `- ${line.trim()}`)
        .join('\n');
    }
    
    // 回退：提取所有编号列表
    const numberedItems = content.match(/\d+\.\s+[^\n]+/g);
    if (numberedItems && numberedItems.length > 0) {
      return numberedItems.slice(0, 5).map(item => `- ${item}`).join('\n');
    }
    
    return '请参考完整指南中的说明。';
  }

  /**
   * 提取调用格式
   */
  extractCallingFormat(content) {
    const formatMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (formatMatch) {
      return formatMatch[1];
    }
    
    // 回退：查找JSON对象
    const jsonMatch = content.match(/\{[^{}]*"tool_name"[^{}]*\}/);
    if (jsonMatch) {
      try {
        const jsonObj = JSON.parse(jsonMatch[0]);
        return JSON.stringify(jsonObj, null, 2);
      } catch (e) {
        // 忽略解析错误
      }
    }
    
    return '{"tool_name": "tool_name", "parameters": {}}';
  }

  /**
   * 获取特定工具的技能
   */
  getSkill(toolName) {
    if (!this.initialized) {
      return null;
    }
    return this.skills.get(toolName);
  }

  /**
   * 获取所有可用技能
   */
  getAllSkills() {
    if (!this.initialized) {
      return [];
    }
    return Array.from(this.skills.values()).map(skill => ({
      tool_name: skill.metadata.tool_name,
      name: skill.metadata.name,
      description: skill.metadata.description,
      category: skill.metadata.category
    }));
  }

  /**
   * 检查是否已初始化
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * 获取技能数量
   */
  getSkillCount() {
    return this.skills.size;
  }

  /**
   * 获取系统状态
   */
  getSystemStatus() {
    return {
      initialized: this.initialized,
      skillCount: this.getSkillCount(),
      tools: this.getAllSkills().map(t => t.tool_name),
      timestamp: new Date().toISOString()
    };
  }
}

// 创建单例实例
export const skillManager = new WorkerSkillManager();