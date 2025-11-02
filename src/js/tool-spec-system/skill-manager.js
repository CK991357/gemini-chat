// src/tool-spec-system/skill-manager.js
import { getSkillsRegistry } from './generated-skills.js';

class EnhancedSkillManager {
  constructor(synonyms) {
    this.skills = getSkillsRegistry();
    this.synonymMap = synonyms;
    console.log(`🎯 [运行时] 技能系统已就绪，可用技能: ${this.skills.size} 个`);
  }

  /**
   * 增强的技能匹配算法
   */
  findRelevantSkills(userQuery, context = {}) {
    const query = userQuery.toLowerCase().trim();
    if (!query || query.length < 2) {
      return [];
    }
    
    console.log(`🔍 [技能匹配] 查询: "${query}"`,
      context.availableTools ? `可用工具: ${context.availableTools.length}个` : '');
    
    const matches = [];
    const expandedQuery = this.expandQuery(query);
    
    // 🎯 新增：获取可用工具过滤条件
    const availableTools = context.availableTools || [];
    const shouldFilterByAvailableTools = availableTools.length > 0;
    
    for (const [skillName, skill] of this.skills) {
      const toolName = skill.metadata.tool_name;
      
      // 🎯 新增：如果指定了可用工具，进行过滤
      if (shouldFilterByAvailableTools && !availableTools.includes(toolName)) {
        continue; // 跳过不可用的工具
      }
      
      const relevanceScore = this.calculateEnhancedRelevanceScore(expandedQuery, skill, context);
      
      if (relevanceScore >= 0.15) {
        matches.push({
          skill,
          score: relevanceScore,
          toolName: toolName,
          name: skill.metadata.name,
          description: skill.metadata.description,
          category: skill.metadata.category
        });
      }
    }
    
    const sortedMatches = matches.sort((a, b) => b.score - a.score).slice(0, 3);
    
    if (sortedMatches.length > 0) {
      console.log(`📊 [技能匹配] 完成，找到 ${sortedMatches.length} 个相关技能 (已过滤):`);
      sortedMatches.forEach(match => {
        console.log(`   - ${match.name} (${match.toolName}): ${(match.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log(`🔍 [技能匹配] 未找到相关技能`);
    }
    
    return sortedMatches;
  }

  /**
   * 增强的相关性计算
   */
  calculateEnhancedRelevanceScore(query, skill, context) {
    let score = 0;
    const { metadata, content } = skill;
    
    // 1. 工具名精确匹配（最高权重）
    const cleanToolName = metadata.tool_name.replace(/^default_api:/, '');
    if (query.includes(cleanToolName) || query.includes(metadata.name.replace('-', '_'))) {
      score += 0.6;
    }
    
    // 2. 描述关键词匹配
    const searchText = `
      ${metadata.name || ''}
      ${metadata.description || ''}
      ${content || ''}
      ${(metadata.tags || []).join(' ')}
    `.toLowerCase();
    
    const keywords = this.extractKeywords(query);
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = searchText.match(regex);
      if (matches) {
        score += matches.length * 0.08;
      }
    });
    
    // 3. 同义词扩展匹配
    const synonymScore = this.calculateSynonymScore(query, skill);
    score += synonymScore * 0.3;
    
    // 4. 类别匹配
    if (context.category && metadata.category === context.category) {
      score += 0.25;
    }
    
    // 5. 优先级调整
    if (metadata.priority) {
      score += (metadata.priority / 10) * 0.15;
    }
    
    return Math.min(Math.max(score, 0), 1.0);
  }

  /**
   * 扩展查询词
   */
  expandQuery(query) {
    const words = query.toLowerCase().split(/\s+/);
    const expanded = new Set(words);
    
    words.forEach(word => {
      if (this.synonymMap[word]) {
        this.synonymMap[word].forEach(synonym => expanded.add(synonym));
      }
    });
    
    return Array.from(expanded).join(' ');
  }

  /**
   * 同义词匹配得分
   */
  calculateSynonymScore(query, skill) {
    let score = 0;
    const searchText = skill.metadata.description.toLowerCase();
    
    Object.entries(this.synonymMap).forEach(([key, synonyms]) => {
      if (query.includes(key)) {
        synonyms.forEach(synonym => {
          if (searchText.includes(synonym)) {
            score += 0.1;
          }
        });
      }
    });
    
    return score;
  }

  /**
   * 提取关键词
   */
  extractKeywords(text) {
    const stopWords = ['请', '帮', '我', '怎么', '如何', '什么', '为什么', 'the', 'and', 'for'];
    return text.split(/\s+/)
      .filter(k => k.length > 1 && !stopWords.includes(k));
  }

  /**
   * 智能生成注入内容
   */
  generateSkillInjection(skill, userQuery = '') {
    const { metadata, content } = skill;
    
    // 智能提取相关内容片段
    const relevantContent = this.extractRelevantContent(content, userQuery);
    const keyInstructions = this.extractKeyInstructions(content);
    const callingFormat = this.extractCallingFormat(content);
    
    let injectionContent = `## 🛠️ 工具指南: ${metadata.name}\n\n`;
    injectionContent += `${metadata.description}\n\n`;
    
    if (keyInstructions) {
      injectionContent += `**关键指令:**\n${keyInstructions}\n\n`;
    }
    
    injectionContent += `**调用格式:**\n\`\`\`json\n${callingFormat}\n\`\`\`\n\n`;
    
    if (relevantContent) {
      injectionContent += `${relevantContent}\n\n`;
    }
    
    injectionContent += `请严格遵循上述指南使用 **${metadata.tool_name}** 工具。`;
    
    return injectionContent;
  }

  /**
   * 提取相关内容片段
   */
  extractRelevantContent(content, userQuery) {
    if (!userQuery || !content) return '';
    
    // 按章节分割内容
    const sections = content.split(/\n## /);
    let bestSection = '';
    let bestScore = 0;
    
    const queryKeywords = this.extractKeywords(userQuery.toLowerCase());
    
    sections.forEach(section => {
      let score = 0;
      const sectionLower = section.toLowerCase();
      
      queryKeywords.forEach(keyword => {
        if (sectionLower.includes(keyword)) {
          score += 1;
        }
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestSection = section;
      }
    });
    
    return bestScore > 0 ? `**相关指导:**\n## ${bestSection}` : '';
  }

  /**
   * 多技能注入内容生成
   */
  generateMultiSkillInjection(skills, userQuery) {
    if (skills.length === 1) {
      return this.generateSkillInjection(skills[0].skill, userQuery);
    }
    
    let content = `## 🎯 多个相关工具推荐\n\n`;
    content += `基于您的查询，以下工具可能有用：\n\n`;
    
    skills.forEach((skill, index) => {
      content += `### ${index + 1}. ${skill.skill.metadata.name} (匹配度: ${(skill.score * 100).toFixed(1)}%)\n`;
      content += `**用途**: ${skill.skill.metadata.description}\n`;
      
      const keyInstructions = this.extractKeyInstructions(skill.skill.content);
      if (keyInstructions) {
        content += `${keyInstructions}\n`;
      }
      
      content += `\n`;
    });
    
    content += `💡 **提示**: 您可以根据具体需求选择合适的工具，或组合使用多个工具完成复杂任务。`;
    return content;
  }

  /**
   * 提取关键指令 (保持原有逻辑)
   */
  extractKeyInstructions(content) {
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
    
    const numberedItems = content.match(/\d+\.\s+[^\n]+/g);
    if (numberedItems && numberedItems.length > 0) {
      return numberedItems.slice(0, 5).map(item => `- ${item}`).join('\n');
    }
    
    return '';
  }

  /**
   * 提取调用格式 (保持原有逻辑)
   */
  extractCallingFormat(content) {
    const formatMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (formatMatch) {
      return formatMatch[1];
    }
    
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

  // 保持向后兼容的方法
  get isInitialized() {
    return this.skills.size > 0;
  }

  getAllSkills() {
    return Array.from(this.skills.values()).map(skill => ({
      tool_name: skill.metadata.tool_name,
      name: skill.metadata.name,
      description: skill.metadata.description,
      category: skill.metadata.category
    }));
  }

  getSystemStatus() {
    return {
      initialized: this.isInitialized,
      skillCount: this.skills.size,
      tools: this.getAllSkills().map(t => t.tool_name),
      timestamp: new Date().toISOString()
    };
  }
}

// ✨ 步骤 2: 创建一个异步工厂函数来初始化
async function getBaseSkillManager() {
  try {
    const response = await fetch('/synonyms.json'); // ✨ 使用 fetch 加载
    if (!response.ok) {
      throw new Error(`Failed to load synonyms.json: ${response.statusText}`);
    }
    const synonymsData = await response.json();
    return new EnhancedSkillManager(synonymsData);
  } catch (error) {
    console.error("Error initializing EnhancedSkillManager:", error);
    // 在加载失败时，返回一个没有同义词功能的实例，确保程序不崩溃
    return new EnhancedSkillManager({});
  }
}

// ✨ 步骤 3: 导出异步创建的单例实例
export const skillManagerPromise = getBaseSkillManager();
export let skillManager; // 导出一个变量，稍后填充

// ✨ 步骤 4: 异步填充 skillManager 实例
skillManagerPromise.then(instance => {
  skillManager = instance;
});

// 导出函数以便外部模块可以获取基础技能管理器
export { getBaseSkillManager };
