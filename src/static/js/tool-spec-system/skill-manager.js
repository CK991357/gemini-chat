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
    const tagsLower = (metadata.tags || []).map(tag => tag.toLowerCase());
    // 增强功能性动词的权重
    const coreVerbs = ['extract', 'scrape', 'crawl', '提取', '抓取', '爬取', '搜索', '查询'];

    keywords.forEach(keyword => {
      // 1. 基础匹配
      if (searchText.includes(keyword)) {
        score += 0.1; // 基础分

        // 2. 标签加权 (如果是标签中的词，权重翻倍)
        if (tagsLower.some(tag => tag.includes(keyword))) {
          score += 0.15;
        }

        // 3. 关键动词加权 (针对核心功能)
        if (coreVerbs.includes(keyword)) {
          score += 0.2;
        }
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
   * 提取关键词 (优化版)
   */
  extractKeywords(text) {
    const stopWords = ['请', '帮', '我', '怎么', '如何', '什么', '为什么', 'the', 'and', 'for', '从', '的', '提取', '获取'];
    
    // 1. 预处理：移除 URL
    const textWithoutUrls = text.replace(/https?:\/\/[^\s]+/g, '');
    
    // 2. 预处理：将非字母数字字符替换为空格 (保留中文)
    // 这一步有助于拆分像 "crawl4ai的extract功能" 这样的连词
    const cleanText = textWithoutUrls.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ');

    return cleanText.split(/\s+/)
        .filter(k => {
            if (typeof k !== 'string') return false;
            if (k.length <= 1) return false; // 过滤单字
            if (stopWords.includes(k)) return false;
            return true;
        })
        // 移除转义逻辑，直接返回清洗后的关键词
        .map(k => k.toLowerCase());
  }

  /**
   * [最终修复版] 智能生成单个技能的注入内容
   * 能够提取并注入完整的、与用户查询最相关的文档章节
   */
  generateSkillInjection(skill, userQuery = '') {
    const { metadata, content } = skill;
    
    let injectionContent = `## 🛠️ 工具指南: ${metadata.name} (${metadata.tool_name})\n\n`;
    injectionContent += `**核心功能**: ${metadata.description}\n\n`;
    
    // --- 智能章节提取逻辑 ---
    // 目标：根据用户查询，从完整的 SKILL.md 内容中提取最相关的章节
    
    // 1. 定义关键词与章节标题的映射关系
    const sectionKeywords = {
      'extract': ['结构化数据提取 (`extract`)', 'Schema Definition 结构说明'],
      'scrape': ['抓取单个网页 (`scrape`)'],
      'deep_crawl': ['深度网站爬取 (`deep_crawl`)'],
      'batch': ['批量 URL 处理 (`batch_crawl`)'],
      'screenshot': ['截图捕获 (`screenshot`)'],
      'pdf': ['PDF 导出 (`pdf_export`)']
    };
    
    // 2. 根据用户查询找到相关的关键词
    let relevantSectionTitle = null;
    const queryLower = userQuery.toLowerCase();
    for (const keyword in sectionKeywords) {
      if (queryLower.includes(keyword)) {
        relevantSectionTitle = sectionKeywords[keyword];
        break;
      }
    }
    
    // 3. 如果找到了相关章节，提取其完整内容
    if (relevantSectionTitle) {
      injectionContent += `### 📖 相关操作指南 (已为您提取)\n\n`;
      let sectionFound = false;
      relevantSectionTitle.forEach(title => {
        // 使用正则表达式精确提取从标题 (##) 到下一个同级或更高级标题之间的所有内容
        const regex = new RegExp(`##\\s+${this.escapeRegex(title)}[\\s\\S]*?(?=\\n##\\s|$)`, 'i');
        const match = content.match(regex);
        
        if (match) {
          injectionContent += match[0] + '\n\n';
          sectionFound = true;
        }
      });
      
      if (!sectionFound) {
         injectionContent += `*未找到与'${relevantSectionTitle.join(', ')}'直接相关的详细章节，请参考通用指南。*\n\n`;
      }
    }

    // 4. 无论如何，总是提供通用调用结构和错误示例，这是最重要的！
    injectionContent += `### 🚨 【强制遵守】通用调用结构与常见错误\n\n`;
    const generalStructureRegex = /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i;
    const generalStructureMatch = content.match(generalStructureRegex);
    if(generalStructureMatch){
        injectionContent += generalStructureMatch[0] + '\n\n';
    }

    const commonErrorsRegex = /### ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i;
    const commonErrorsMatch = content.match(commonErrorsRegex);
    if(commonErrorsMatch){
        injectionContent += commonErrorsMatch[0] + '\n\n';
    }

    injectionContent += `请严格遵循上述指南和示例来使用 **${metadata.tool_name}** 工具。`;
    
    return injectionContent;
  }

  // 辅助函数，用于安全地创建正则表达式
  escapeRegex(string) {
      return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
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
        // 移除转义字符用于字符串包含检查
        const cleanKeyword = keyword.replace(/\\/g, '');
        if (sectionLower.includes(cleanKeyword)) {
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
   * [最终修复版] 多技能注入内容生成
   * 对 crawl4ai 等复杂工具进行特殊处理，注入更详细的指南
   */
  generateMultiSkillInjection(skills, userQuery) {
    if (skills.length === 0) return '';
    
    // 如果只有一个技能，或者最重要的技能是 crawl4ai，则使用单技能的详细注入
    const primarySkill = skills[0];
    if (skills.length === 1 || primarySkill.toolName === 'crawl4ai') {
      return this.generateSkillInjection(primarySkill.skill, userQuery);
    }
    
    // 对于多个非关键技能，保持摘要模式
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
    // 🔧 修复：使用更安全的正则表达式
    const instructionMatch = content.match(/##\s+关键指令[\s\S]*?(?=##|$)/i);
    if (instructionMatch) {
      return instructionMatch[0]
        .replace(/##\s+关键指令/gi, '')
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
    // 🔧 修复：使用更安全的正则表达式
    const formatMatch = content.match(/```json\s*\n([\s\S]*?)\n\s*```/);
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

  /**
   * 🎯 新增：等待技能管理器就绪
   */
  async waitUntilReady() {
    // 如果技能已经加载完成，直接返回
    if (this.isInitialized) {
      return Promise.resolve(true);
    }
    
    // 否则等待一小段时间再检查
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.isInitialized) {
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 100);
      
      // 10秒超时
      setTimeout(() => {
        clearInterval(checkInterval);
        console.warn('[SkillManager] 技能管理器初始化超时');
        resolve(false);
      }, 10000);
    });
  }
}

// ✨ 步骤 2: 创建一个异步工厂函数来初始化
async function getBaseSkillManager() {
  try {
    const response = await fetch('./synonyms.json'); // ✨ 使用 fetch 加载
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
export { EnhancedSkillManager, getBaseSkillManager };
