// D:\Github_10110531\gemini_chat\src\static\js\tool-spec-system\skill-context-manager.js
import { skillCacheCompressor } from './skill-cache-compressor.js';
import { skillManagerPromise } from './skill-manager.js';

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
    
    // 🎯 新增：缓存系统
    this.localCache = new Map();
    this.sessionInjectionTracker = new Map(); // sessionId -> Set(toolNames)
    
    // 🎯 配置
    this.cacheEnabled = true;
    this.compressionEnabled = true;
    this.maxContextChars = 12000; // 普通模式上下文限制
    
    console.log('✅ SkillContextManager 升级版初始化');
  }

  async ensureInitialized() {
    if (this.initialized) return true;
    
    try {
      this.skillManager = await skillManagerPromise;
      this.initialized = true;
      console.log('✅ SkillContextManager 初始化完成');
      return true;
    } catch (error) {
      console.error('❌ SkillContextManager 初始化失败:', error);
      return false;
    }
  }

  /**
   * 🚀 核心方法：为模型请求生成智能上下文（增强版）
   */
  async generateRequestContext(userQuery, availableTools = [], modelConfig = {}, context = {}) {
    if (!await this.ensureInitialized()) {
      return { enhancedPrompt: userQuery, relevantTools: [] };
    }

    // 🎯 获取会话ID（用于跟踪工具使用）
    const sessionId = context.sessionId || this._getCurrentSessionId();
    
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

    // 3. 生成增强的提示词（使用缓存+压缩）
    const enhancedPrompt = hasComplexTools 
      ? await this._buildEnhancedPromptWithComplexTools(userQuery, relevantSkills, modelConfig, sessionId)
      : await this._buildStandardEnhancedPrompt(userQuery, relevantSkills, modelConfig, sessionId);
    
    // 🎯 记录工具使用
    this._recordToolsUsed(sessionId, relevantSkills.map(skill => skill.toolName));
    
    return {
      enhancedPrompt,
      relevantTools: relevantSkills.map(skill => skill.toolName),
      contextLevel: relevantSkills.length > 1 ? 'multi' : 'single',
      skillCount: relevantSkills.length,
      hasComplexTools,
      cacheStats: skillCacheCompressor.getCacheStats()
    };
  }

  /**
   * 🎯 构建包含复杂工具的增强提示词（使用缓存）
   */
  async _buildEnhancedPromptWithComplexTools(userQuery, relevantSkills, modelConfig, sessionId) {
    let context = `## 🎯 智能工具指南 (检测到复杂工具)\n\n`;
    
    // 分别处理每个复杂工具
    for (const skill of relevantSkills) {
      if (skill.toolName === 'crawl4ai') {
        context += await this._buildCrawl4AIContext(skill, userQuery, sessionId);
      } else if (skill.toolName === 'python_sandbox') {
        context += await this._buildPythonSandboxContext(skill, userQuery, sessionId, {
          modelConfig,
          availableTools: modelConfig.tools || []
        });
      } else {
        // 其他工具的标准处理（使用缓存）
        context += await this._buildStandardSkillContext(skill, userQuery, sessionId);
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
   * 🚀 crawl4ai 专用上下文构建（增强版 - 使用缓存）
   */
  async _buildCrawl4AIContext(skill, userQuery, sessionId) {
    const { skill: skillData, score, name, description } = skill;
    const toolName = 'crawl4ai';
    
    // 🎯 检查缓存
    const cacheKey = `${toolName}_${sessionId}_${this._hashQuery(userQuery)}`;
    
    if (this.cacheEnabled && this.localCache.has(cacheKey)) {
      const cached = this.localCache.get(cacheKey);
      console.log(`🎯 [Crawl4AI缓存命中] ${toolName} (${cached.content.length} 字符)`);
      return cached.content;
    }
    
    let context = `### 🕷️ 网页抓取工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    context += `**核心功能**: ${description}\n\n`;
    
    // 1. 智能模式推荐
    const recommendedMode = this._recommendCrawl4AIMode(userQuery);
    if (recommendedMode) {
      context += `**🎯 推荐模式**: ${recommendedMode}\n\n`;
    }
    
    // 2. 提取关键调用结构（使用压缩）
    const fullContent = this._extractCrawl4AIKeyInformation(skillData.content, userQuery);
    
    // 压缩内容
    let compressedContent = fullContent;
    if (this.compressionEnabled && fullContent.length > 2000) {
      compressedContent = await skillCacheCompressor.compressKnowledge(fullContent, {
        level: 'smart',
        maxChars: 5000,
        userQuery
      });
    }
    
    context += compressedContent;
    
    // 3. 添加专用提醒
    context += `**🚨 关键规范**:\n`;
    context += `• 所有参数必须嵌套在 "parameters" 对象内\n`;
    context += `• URL必须以 http:// 或 https:// 开头\n`;
    context += `• extract模式必须使用 "schema_definition" 参数名\n`;
    
    // 🎯 缓存结果
    if (this.cacheEnabled) {
      this.localCache.set(cacheKey, {
        content: context,
        timestamp: Date.now(),
        toolName,
        userQuery: userQuery.substring(0, 50)
      });
    }
    
    return context;
  }

  /**
   * 🚀 Python沙盒专用上下文构建（增强版 - 使用缓存+章节传递）
   */
  async _buildPythonSandboxContext(skill, userQuery, sessionId, context = {}) {
    const { skill: skillData, score, name, description } = skill;
    const toolName = 'python_sandbox';
    
    // 🎯 检查缓存
    const cacheKey = `${toolName}_${sessionId}_${this._hashQuery(userQuery)}`;
    
    if (this.cacheEnabled && this.localCache.has(cacheKey)) {
      const cached = this.localCache.get(cacheKey);
      console.log(`🎯 [Python缓存命中] ${toolName} (${cached.content.length} 字符)`);
      return cached.content;
    }
    
    // 🎯 检查是否已经在当前会话中注入过该工具
    const hasBeenInjected = skillCacheCompressor.hasToolBeenInjected(sessionId, toolName);
    
    let contextContent = `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    contextContent += `**核心功能**: ${description}\n\n`;
    
    // 🎯 如果已经注入过，使用引用模式
    if (hasBeenInjected) {
      contextContent += `**📚 提示**: 此工具的详细指南已在之前的步骤中提供。请参考之前的指南来使用。\n\n`;
      
      // 只提供关键提示
      const keyHint = this._extractKeyHint(skillData.content, userQuery);
      if (keyHint) {
        contextContent += `**💡 关键提醒**: ${keyHint}\n\n`;
      }
    } else {
      // 🎯 首次注入，使用详细内容（带压缩）
      
      // 1. 获取完整知识内容
      let fullContent = '';
      try {
        // 尝试使用联邦知识库（如果可用）
        if (this.skillManager.knowledgeFederation && this.skillManager.isFederationReady) {
          // 🎯 推断相关章节
          const relevantSections = skillCacheCompressor.inferRelevantSections(userQuery, {
            toolCallHistory: context.toolCallHistory || [],
            sessionId
          });
          
          // 获取联邦知识包
          const knowledgePackage = this.skillManager.knowledgeFederation.getFederatedKnowledge(
            toolName,
            relevantSections
          );
          
          if (knowledgePackage) {
            fullContent = knowledgePackage;
            console.log(`🎯 [联邦知识] 为 ${toolName} 获取 ${relevantSections.length} 个章节`);
          }
        }
        
        // 降级方案：使用基础技能内容
        if (!fullContent) {
          fullContent = this._extractPythonKeyInformation(skillData.content, userQuery);
          
          // 🎯 添加相关参考文件内容
          const relevantReferences = this._findRelevantPythonReferences(userQuery);
          if (relevantReferences.length > 0) {
            fullContent += `\n\n## 📚 相关参考指南\n`;
            
            for (const refFile of relevantReferences.slice(0, 2)) {
              const refContent = skillData.resources?.references?.[refFile];
              if (refContent) {
                const summary = this._extractReferenceSummary(refContent, refFile);
                fullContent += `\n### ${refFile}\n${summary}\n`;
              }
            }
          }
        }
      } catch (error) {
        console.warn('获取Python知识包失败，使用降级方案:', error);
        fullContent = this._extractPythonKeyInformation(skillData.content, userQuery);
      }
      
      // 2. 智能压缩
      let compressedContent = fullContent;
      if (this.compressionEnabled && fullContent.length > 3000) {
        compressedContent = await skillCacheCompressor.compressKnowledge(fullContent, {
          level: 'smart',
          maxChars: 8000, // Python沙盒分配更多空间
          userQuery,
          iteration: 0
        });
      }
      
      contextContent += compressedContent;
      
      // 3. 记录已注入
      skillCacheCompressor.recordToolInjection(sessionId, toolName);
    }
    
    // 🎯 添加Python沙盒专用提醒
    contextContent += `\n**🚨 输出规范**:\n`;
    contextContent += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    contextContent += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    contextContent += `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
    
    // 🎯 缓存结果
    if (this.cacheEnabled) {
      this.localCache.set(cacheKey, {
        content: contextContent,
        timestamp: Date.now(),
        toolName,
        userQuery: userQuery.substring(0, 50)
      });
      
      // 限制缓存大小
      if (this.localCache.size > 50) {
        const oldestKey = Array.from(this.localCache.keys())[0];
        this.localCache.delete(oldestKey);
      }
    }
    
    return contextContent;
  }

  /**
   * 🎯 标准技能上下文构建（使用缓存）
   */
  async _buildStandardSkillContext(skill, userQuery, sessionId) {
    const { name, description, score, toolName } = skill;
    
    // 🎯 检查缓存
    const cacheKey = `${toolName}_${sessionId}_${this._hashQuery(userQuery)}`;
    
    if (this.cacheEnabled && this.localCache.has(cacheKey)) {
      const cached = this.localCache.get(cacheKey);
      console.log(`🎯 [标准缓存命中] ${toolName} (${cached.content.length} 字符)`);
      return cached.content;
    }
    
    const keyHint = this._extractKeyHint(skill.skill.content, userQuery);
    
    let context = `### 🛠️ 工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    context += `**功能**: ${description}\n`;
    
    if (keyHint) {
      context += `**提示**: ${keyHint}\n`;
    }
    
    // 🎯 简单压缩：只保留前500字符
    if (this.compressionEnabled && context.length > 500) {
      context = context.substring(0, 500) + '...';
    }
    
    // 🎯 缓存结果
    if (this.cacheEnabled) {
      this.localCache.set(cacheKey, {
        content: context,
        timestamp: Date.now(),
        toolName,
        userQuery: userQuery.substring(0, 50)
      });
    }
    
    return context;
  }

  /**
   * 🎯 标准增强提示词构建（使用缓存）
   */
  async _buildStandardEnhancedPrompt(userQuery, relevantSkills, modelConfig, sessionId) {
    let context = `## 🎯 相关工具指南\n\n`;
    
    for (const skill of relevantSkills) {
      context += await this._buildStandardSkillContext(skill, userQuery, sessionId);
      context += '\n\n';
    }

    context += `## 💡 执行指导\n`;
    context += `请基于以上工具信息来响应用户请求。\n\n`;
    context += `---\n\n## 👤 用户原始请求\n${userQuery}`;

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

  /**
   * 🎯 辅助方法
   */
  _hashQuery(query) {
    let hash = 0;
    for (let i = 0; i < Math.min(query.length, 50); i++) {
      hash = ((hash << 5) - hash) + query.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  _getCurrentSessionId() {
    // 从全局状态获取当前会话ID
    return window.currentSessionId || 'default_session';
  }

  _recordToolsUsed(sessionId, toolNames) {
    if (!this.sessionInjectionTracker.has(sessionId)) {
      this.sessionInjectionTracker.set(sessionId, new Set());
    }
    
    const tracker = this.sessionInjectionTracker.get(sessionId);
    toolNames.forEach(tool => tracker.add(tool));
  }

  /**
   * 🎯 清理会话缓存
   */
  clearSessionCache(sessionId) {
    // 清理本地缓存
    const sessionPrefix = `${sessionId}_`;
    for (const key of this.localCache.keys()) {
      if (key.startsWith(sessionPrefix)) {
        this.localCache.delete(key);
      }
    }
    
    // 清理会话跟踪器
    this.sessionInjectionTracker.delete(sessionId);
    
    // 清理共享缓存
    skillCacheCompressor.clearSession(sessionId);
    
    console.log(`🗑️ 清理会话 ${sessionId} 的缓存`);
  }

  /**
   * 🎯 获取缓存统计
   */
  getCacheStats() {
    return {
      localCacheSize: this.localCache.size,
      sessionTrackerSize: this.sessionInjectionTracker.size,
      sharedCacheStats: skillCacheCompressor.getCacheStats()
    };
  }
}

// 创建全局单例
export const skillContextManager = new SkillContextManager();