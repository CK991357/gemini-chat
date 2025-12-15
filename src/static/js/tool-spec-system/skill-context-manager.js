// D:\Github_10110531\gemini_chat\src\static\js\tool-spec-system\skill-context-manager.js

import { skillManagerPromise } from './skill-manager.js';

// Modified to use global skill manager singleton
async function getSkillManager() {
  if (typeof window.getGlobalSkillManager === 'function') {
    return await window.getGlobalSkillManager();
  }

  // 降级方案
  const { EnhancedSkillManager } = await import('../agent/EnhancedSkillManager.js');
  const manager = new EnhancedSkillManager();
  await manager.waitUntilReady();
  return manager;
}

class SkillContextManager {
  constructor() {
    this.skillManager = null;
    this.initialized = false;
    
    // 🚀 crawl4ai 专用关键词映射
    this.crawl4aiModeMap = {
      '提取': 'extract',
      '抓取': 'scrape', 
      '爬取': 'deep_crawl',
      '批量': 'batch_crawl',
      '截图': 'screenshot',
      'pdf': 'pdf_export',
      '数据提取': 'extract',
      '网页抓取': 'scrape',
      '深度爬取': 'deep_crawl',
      '批量处理': 'batch_crawl'
    };
    
    // 🚀 Python沙盒专用关键词映射
    this.pythonReferenceMap = {
      'matplotlib': 'matplotlib_cookbook.md',
      '可视化': 'matplotlib_cookbook.md',
      '图表': 'matplotlib_cookbook.md',
      '画图': 'matplotlib_cookbook.md',
      'chart': 'matplotlib_cookbook.md',
      'plot': 'matplotlib_cookbook.md',
      '条形图': 'matplotlib_cookbook.md',
      '折线图': 'matplotlib_cookbook.md',
      '散点图': 'matplotlib_cookbook.md',
      '热力图': 'matplotlib_cookbook.md',
      
      'pandas': 'pandas_cheatsheet.md',
      '数据清洗': 'pandas_cheatsheet.md',
      '数据分析': 'pandas_cheatsheet.md',
      '数据处理': 'pandas_cheatsheet.md',
      '数据整理': 'pandas_cheatsheet.md',
      
      '报告': 'report_generator_workflow.md',
      'word': 'report_generator_workflow.md',
      'excel': 'report_generator_workflow.md',
      'pdf': 'report_generator_workflow.md',
      'ppt': 'report_generator_workflow.md',
      '文档': 'report_generator_workflow.md',
      '自动化': 'report_generator_workflow.md',
      '周报': 'report_generator_workflow.md',
      
      '机器学习': 'ml_workflow.md',
      '模型': 'ml_workflow.md',
      '训练': 'ml_workflow.md',
      '分类': 'ml_workflow.md',
      '回归': 'ml_workflow.md',
      '预测': 'ml_workflow.md',
      '评估': 'ml_workflow.md',
      
      '数学': 'sympy_cookbook.md',
      '公式': 'sympy_cookbook.md',
      '符号': 'sympy_cookbook.md',
      '证明': 'sympy_cookbook.md',
      '方程': 'sympy_cookbook.md',
      '微积分': 'sympy_cookbook.md',
      '代数': 'sympy_cookbook.md',
      
      '科学计算': 'scipy_cookbook.md',
      '数值计算': 'scipy_cookbook.md',
      '统计': 'scipy_cookbook.md',
      '计算': 'scipy_cookbook.md'
    };
  }

  async ensureInitialized() {
    if (this.initialized) return true;
    
    try {
      this.skillManager = await getSkillManager();
      this.initialized = true;
      console.log('✅ SkillContextManager 初始化完成');
      return true;
    } catch (error) {
      console.error('❌ SkillContextManager 初始化失败:', error);
      return false;
    }
  }

  /**
   * 🚀 核心方法：为模型请求生成智能上下文
   */
  async generateRequestContext(userQuery, availableTools = [], modelConfig = {}) {
    if (!await this.ensureInitialized()) {
      return { enhancedPrompt: userQuery, relevantTools: [] };
    }

    // 1. 查找相关技能
    const relevantSkills = this.skillManager.findRelevantSkills(userQuery, {
      availableTools,
      category: modelConfig.category
    });

    if (relevantSkills.length === 0) {
      return { 
        enhancedPrompt: userQuery, 
        relevantTools: [],
        contextLevel: 'none'
      };
    }

    // 2. 检查是否有需要特殊处理的复杂工具
    const hasComplexTools = relevantSkills.some(skill => 
      ['crawl4ai', 'python_sandbox'].includes(skill.toolName)
    );

    // 3. 生成增强的提示词
    const enhancedPrompt = hasComplexTools 
      ? await this._buildEnhancedPromptWithComplexTools(userQuery, relevantSkills, modelConfig)
      : await this._buildStandardEnhancedPrompt(userQuery, relevantSkills, modelConfig);
    
    return {
      enhancedPrompt,
      relevantTools: relevantSkills.map(skill => skill.toolName),
      contextLevel: relevantSkills.length > 1 ? 'multi' : 'single',
      skillCount: relevantSkills.length,
      hasComplexTools
    };
  }

  /**
   * 🎯 构建包含复杂工具的增强提示词
   */
  async _buildEnhancedPromptWithComplexTools(userQuery, relevantSkills, modelConfig) {
    let context = `## 🎯 智能工具指南 (检测到复杂工具)\n\n`;
    
    // 分别处理每个复杂工具
    for (const skill of relevantSkills) {
      if (skill.toolName === 'crawl4ai') {
        context += await this._buildCrawl4AIContext(skill, userQuery);
      } else if (skill.toolName === 'python_sandbox') {
        context += await this._buildPythonSandboxContext(skill, userQuery);
      } else {
        // 其他工具的标准处理
        context += this._buildStandardSkillContext(skill, userQuery);
      }
      context += '\n\n';
    }

    // 添加通用指导
    context += `## 💡 执行指导\n`;
    context += `请基于以上详细指南来响应用户请求。特别注意复杂工具的特殊调用规范。\n\n`;
    context += `---\n\n## 👤 用户原始请求\n${userQuery}`;

    return context;
  }

  /**
   * 🚀 crawl4ai 专用上下文构建
   */
  async _buildCrawl4AIContext(skill, userQuery) {
    const { skill: skillData, score, name, description } = skill;
    
    let context = `### 🕷️ 网页抓取工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    context += `**核心功能**: ${description}\n\n`;
    
    // 1. 智能模式推荐
    const recommendedMode = this._recommendCrawl4AIMode(userQuery);
    if (recommendedMode) {
      context += `**🎯 推荐模式**: ${recommendedMode}\n\n`;
    }
    
    // 2. 提取关键调用结构
    const keyInfo = this._extractCrawl4AIKeyInformation(skillData.content, userQuery);
    context += keyInfo;
    
    // 3. 添加专用提醒
    context += `**🚨 关键规范**:\n`;
    context += `• 所有参数必须嵌套在 "parameters" 对象内\n`;
    context += `• URL必须以 http:// 或 https:// 开头\n`;
    context += `• extract模式必须使用 "schema_definition" 参数名\n`;
    
    return context;
  }

  /**
   * 🚀 Python沙盒专用上下文构建
   */
  async _buildPythonSandboxContext(skill, userQuery) {
    const { skill: skillData, score, name, description } = skill;
    
    let context = `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    context += `**核心功能**: ${description}\n\n`;
    
    // 1. 提取主文档的关键信息
    const mainContent = this._extractPythonKeyInformation(skillData.content, userQuery);
    context += mainContent;
    
    // 2. 智能匹配相关参考文件
    const relevantReferences = this._findRelevantPythonReferences(userQuery);
    
    if (relevantReferences.length > 0) {
      context += `**📚 相关参考指南**:\n`;
      
      for (const refFile of relevantReferences.slice(0, 2)) {
        const refContent = skillData.resources?.references?.[refFile];
        if (refContent) {
          const summary = this._extractReferenceSummary(refContent, refFile);
          context += `• **${refFile}**: ${summary}\n`;
        }
      }
      
      context += `\n💡 **提示**: 执行相关任务时请严格参考这些指南中的代码模板和工作流。\n`;
    }
    
    // 3. 添加Python沙盒专用提醒
    context += `\n**🚨 输出规范**:\n`;
    context += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    context += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    context += `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
    
    return context;
  }

  /**
   * 🎯 推荐crawl4ai模式
   */
  _recommendCrawl4AIMode(userQuery) {
    const queryLower = userQuery.toLowerCase();
    
    for (const [keyword, mode] of Object.entries(this.crawl4aiModeMap)) {
      if (queryLower.includes(keyword)) {
        const modeDescriptions = {
          'extract': '结构化数据提取',
          'scrape': '单个网页抓取', 
          'deep_crawl': '深度网站爬取',
          'batch_crawl': '批量URL处理',
          'screenshot': '截图捕获',
          'pdf_export': 'PDF导出'
        };
        return `${mode} - ${modeDescriptions[mode]}`;
      }
    }
    
    return null;
  }

  /**
   * 提取crawl4ai关键信息
   */
  _extractCrawl4AIKeyInformation(skillContent, userQuery) {
    let keyInfo = '';
    
    // 提取通用调用结构
    const structureMatch = skillContent.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##|\n#|$)/);
    if (structureMatch) {
      keyInfo += `**📋 调用结构**:\n`;
      const jsonExample = structureMatch[0].match(/```json\n([\s\S]*?)\n```/);
      if (jsonExample) {
        keyInfo += `必须严格遵循嵌套参数格式：\n\`\`\`json\n${jsonExample[1]}\n\`\`\`\n\n`;
      }
    }

    // 提取模式选择指南
    const modeSection = skillContent.match(/## 📋 可用模式快速选择指南[\s\S]*?(?=\n##|\n#|$)/);
    if (modeSection) {
      keyInfo += `**🎯 模式选择**:\n`;
      // 提取模式表格的关键信息
      const modeLines = modeSection[0].match(/\|.*?\|.*?\|.*?\|.*?\|/g);
      if (modeLines && modeLines.length > 1) {
        modeLines.slice(1, 4).forEach(line => {
          const cells = line.split('|').filter(cell => cell.trim());
          if (cells.length >= 3) {
            keyInfo += `• **${cells[1].trim()}**: ${cells[2].trim()}\n`;
          }
        });
      }
      keyInfo += `\n`;
    }

    return keyInfo;
  }

  /**
   * 提取Python关键信息
   */
  _extractPythonKeyInformation(skillContent, userQuery) {
    let keyInfo = '';
    
    // 提取基础调用规范
    const basicUsage = skillContent.match(/## 🚀 基础调用规范[\s\S]*?(?=\n##|\n#|$)/);
    if (basicUsage) {
      keyInfo += `**📋 基础调用**:\n`;
      const jsonExample = basicUsage[0].match(/```json\n([\s\S]*?)\n```/);
      if (jsonExample) {
        keyInfo += `简单代码执行格式：\n\`\`\`json\n${jsonExample[1]}\n\`\`\`\n\n`;
      }
    }

    // 提取工作流模式
    const workflowSection = skillContent.match(/## 💡 核心工作流模式[\s\S]*?(?=\n##|\n#|$)/);
    if (workflowSection) {
      keyInfo += `**🔄 核心工作流**:\n`;
      const workflows = workflowSection[0].match(/### [^\n]+/g);
      if (workflows) {
        workflows.forEach(workflow => {
          keyInfo += `• ${workflow.replace('###', '').trim()}\n`;
        });
      }
      keyInfo += `\n`;
    }

    return keyInfo;
  }

  /**
   * 🎯 查找相关的Python参考文件
   */
  _findRelevantPythonReferences(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const matchedReferences = new Set();
    
    // 基于关键词匹配参考文件
    for (const [keyword, referenceFile] of Object.entries(this.pythonReferenceMap)) {
      if (queryLower.includes(keyword)) {
        matchedReferences.add(referenceFile);
      }
    }
    
    return Array.from(matchedReferences);
  }

  /**
   * 从参考文件内容提取摘要
   */
  _extractReferenceSummary(refContent, fileName) {
    // 提取第一段有意义的描述
    const firstParagraph = refContent.split('\n\n').find(p => 
      p.trim().length > 50 && !p.startsWith('#')
    );
    
    if (firstParagraph) {
      return firstParagraph.substring(0, 150) + '...';
    }
    
    // 降级方案：基于文件名返回描述
    const fileDescriptions = {
      'matplotlib_cookbook.md': '数据可视化与图表制作指南',
      'pandas_cheatsheet.md': '数据清洗与分析速查表',
      'report_generator_workflow.md': '自动化报告生成工作流',
      'ml_workflow.md': '机器学习工作流指南',
      'sympy_cookbook.md': '符号数学与公式证明',
      'scipy_cookbook.md': '科学计算与统计分析'
    };
    
    return fileDescriptions[fileName] || '相关代码示例和最佳实践';
  }

  /**
   * 标准技能上下文构建（用于非复杂工具）
   */
  _buildStandardSkillContext(skill, userQuery) {
    const { name, description, score } = skill;
    const keyHint = this._extractKeyHint(skill.skill.content, userQuery);
    
    let context = `### 🛠️ 工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    context += `**功能**: ${description}\n`;
    
    if (keyHint) {
      context += `**提示**: ${keyHint}\n`;
    }
    
    return context;
  }

  /**
   * 标准增强提示词构建
   */
  async _buildStandardEnhancedPrompt(userQuery, relevantSkills, modelConfig) {
    let context = `## 🎯 相关工具指南\n\n`;
    
    relevantSkills.forEach((skill, index) => {
      context += this._buildStandardSkillContext(skill, userQuery);
      if (index < relevantSkills.length - 1) {
        context += '\n';
      }
    });

    context += `\n\n## 💡 执行指导\n`;
    context += `请基于以上工具信息来响应用户请求。\n\n`;
    context += `---\n\n## 👤 用户原始请求\n${userQuery}`;

    return context;
  }

  /**
   * 提取关键提示
   */
  _extractKeyHint(skillContent, userQuery) {
    // 通用关键词提示提取
    if (userQuery.includes('搜索') || userQuery.includes('查询')) {
      return '支持实时网络搜索和信息获取';
    }
    
    if (userQuery.includes('图片') || userQuery.includes('图像')) {
      return '支持图片内容分析和理解';
    }
    
    if (userQuery.includes('分析') || userQuery.includes('chess')) {
      return '提供国际象棋局面分析和最佳走法建议';
    }
    
    return null;
  }
}

// 创建全局单例
export const skillContextManager = new SkillContextManager();