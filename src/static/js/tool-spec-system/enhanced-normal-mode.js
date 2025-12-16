// 🎯 普通模式增强模块 - 完全独立，不修改现有代码
// 为普通模式提供缓存+压缩+章节传递能力

class EnhancedNormalModeManager {
  constructor(skillContextManager) {
    this.skillContextManager = skillContextManager;
    this.skillManager = null;
    
    // 🎯 独立缓存系统（与Agent模式完全隔离）
    this.knowledgeCache = new Map(); // tool -> {content, timestamp}
    this.sessionInjectionTracker = new Map(); // sessionId -> Set(toolNames)
    
    // 🎯 配置
    this.cacheEnabled = true;
    this.compressionEnabled = true;
    this.maxChars = 8000;
    
    // 🎯 章节推断映射
    this.sectionMapping = {
      // 数据相关
      '数据分析': ['pandas_cheatsheet.md', '数据清洗与分析'],
      '数据清洗': ['pandas_cheatsheet.md', 'ETL管道模式'],
      '数据处理': ['pandas_cheatsheet.md', '数据清洗与分析'],
      
      // 可视化相关
      '可视化': ['matplotlib_cookbook.md', '数据可视化'],
      '画图': ['matplotlib_cookbook.md', '数据可视化'],
      '图表': ['matplotlib_cookbook.md', '数据可视化'],
      
      // 文本分析
      '文本分析': ['text_analysis_cookbook.md', '文本分析与结构化提取'],
      '文本处理': ['text_analysis_cookbook.md', '文本分析与结构化提取'],
      '提取': ['text_analysis_cookbook.md', '文本分析与结构化提取'],
      
      // 数学相关
      '数学': ['sympy_cookbook.md', '公式证明工作流'],
      '公式': ['sympy_cookbook.md', '公式证明工作流'],
      '计算': ['scipy_cookbook.md', '科学计算与优化'],
      
      // 机器学习
      '机器学习': ['ml_workflow.md', '机器学习'],
      '训练': ['ml_workflow.md', '机器学习'],
      '预测': ['ml_workflow.md', '机器学习'],
      
      // 报告生成
      '报告': ['report_generator_workflow.md', '自动化报告生成'],
      '文档': ['report_generator_workflow.md', '自动化报告生成'],
      '导出': ['report_generator_workflow.md', '自动化报告生成']
    };
    
    console.log('✅ EnhancedNormalModeManager 初始化完成');
  }

  /**
   * 🎯 等待技能管理器就绪
   */
  async ensureInitialized() {
    if (this.skillManager) return true;
    
    try {
      // 🎯 获取现有的技能管理器实例
      this.skillManager = await window.skillManagerModule?.skillManagerPromise;
      if (!this.skillManager) {
        console.warn('无法获取技能管理器，使用降级模式');
        this.skillManager = this.createFallbackManager();
      }
      return true;
    } catch (error) {
      console.error('EnhancedNormalModeManager 初始化失败:', error);
      this.skillManager = this.createFallbackManager();
      return false;
    }
  }

  /**
   * 🎯 为普通模式生成增强上下文（替代原方法）
   */
  async generateEnhancedContext(userQuery, availableTools = [], modelConfig = {}, options = {}) {
    await this.ensureInitialized();
    
    const sessionId = options.sessionId || 'normal_mode_session';
    const useCache = options.useCache !== false;
    
    // 🎯 1. 查找相关技能（使用原始技能管理器）
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

    // 🎯 2. 检查是否有复杂工具
    const hasComplexTools = relevantSkills.some(skill => 
      ['crawl4ai', 'python_sandbox'].includes(skill.toolName)
    );

    // 🎯 3. 生成增强提示词（使用缓存）
    const enhancedPrompt = hasComplexTools 
      ? await this._buildEnhancedPromptWithCache(userQuery, relevantSkills, sessionId, useCache)
      : await this._buildStandardPromptWithCache(userQuery, relevantSkills, sessionId, useCache);
    
    return {
      enhancedPrompt,
      relevantTools: relevantSkills.map(skill => skill.toolName),
      contextLevel: relevantSkills.length > 1 ? 'multi' : 'single',
      skillCount: relevantSkills.length,
      hasComplexTools,
      cached: useCache
    };
  }

  /**
   * 🎯 构建带缓存的增强提示词
   */
  async _buildEnhancedPromptWithCache(userQuery, relevantSkills, sessionId, useCache) {
    let context = `## 🎯 智能工具指南 (检测到复杂工具)\n\n`;
    
    for (const skill of relevantSkills) {
      if (skill.toolName === 'python_sandbox') {
        context += await this._buildPythonSandboxWithCache(skill, userQuery, sessionId, useCache);
      } else if (skill.toolName === 'crawl4ai') {
        context += await this._buildCrawl4AIWithCache(skill, userQuery, sessionId, useCache);
      } else {
        context += await this._buildStandardSkillWithCache(skill, userQuery, sessionId, useCache);
      }
      context += '\n\n';
    }

    context += `## 💡 执行指导\n`;
    context += `请基于以上详细指南来响应用户请求。特别注意复杂工具的特殊调用规范。\n\n`;
    context += `---\n\n## 👤 用户原始请求\n${userQuery}`;

    return context;
  }

  /**
   * 🎯 Python沙盒缓存版（重点优化）
   */
  async _buildPythonSandboxWithCache(skill, userQuery, sessionId, useCache) {
    const { skill: skillData, score, name, description } = skill;
    const toolName = 'python_sandbox';
    
    // 🎯 1. 检查缓存
    const cacheKey = this._generateCacheKey(toolName, userQuery, sessionId);
    
    if (useCache && this.knowledgeCache.has(cacheKey)) {
      const cached = this.knowledgeCache.get(cacheKey);
      console.log(`🎯 [普通模式缓存命中] ${toolName}`);
      return cached.content;
    }
    
    // 🎯 2. 检查是否已注入过
    const hasBeenInjected = this._hasToolBeenInjected(sessionId, toolName);
    
    let content = `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    content += `**核心功能**: ${description}\n\n`;
    
    // 🎯 3. 如果已注入过，使用引用模式
    if (hasBeenInjected) {
      content += `**📚 提示**: 此工具的详细指南已在之前的对话中提供。\n\n`;
      
      // 提取关键提示
      const keyHint = this._extractKeyHint(skillData.content, userQuery);
      if (keyHint) {
        content += `**💡 关键提醒**: ${keyHint}\n`;
      }
    } else {
      // 🎯 4. 首次注入，获取完整内容
      const fullContent = await this._getPythonSandboxContent(skillData, userQuery);
      
      // 🎯 5. 智能压缩
      const compressedContent = this._compressContent(fullContent, userQuery);
      content += compressedContent;
      
      // 🎯 6. 记录注入
      this._recordToolInjection(sessionId, toolName);
    }
    
    // 🎯 7. 添加输出规范
    content += `\n**🚨 输出规范**:\n`;
    content += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    content += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    
    // 🎯 8. 缓存结果
    if (useCache) {
      this.knowledgeCache.set(cacheKey, {
        content,
        timestamp: Date.now(),
        toolName,
        sessionId
      });
      
      // 限制缓存大小
      if (this.knowledgeCache.size > 50) {
        const oldestKey = Array.from(this.knowledgeCache.keys())[0];
        this.knowledgeCache.delete(oldestKey);
      }
    }
    
    return content;
  }

  /**
   * 🎯 获取Python沙盒完整内容
   */
  async _getPythonSandboxContent(skillData, userQuery) {
    let fullContent = '';
    
    try {
      // 🎯 1. 提取主文档关键信息
      const mainContent = this._extractPythonKeyInformation(skillData.content, userQuery);
      fullContent += mainContent;
      
      // 🎯 2. 推断相关章节
      const relevantSections = this._inferRelevantSections(userQuery);
      
      if (relevantSections.length > 0) {
        fullContent += `\n\n## 📚 相关参考指南\n`;
        
        for (const section of relevantSections) {
          // 🎯 尝试从参考文件中获取内容
          const refContent = skillData.resources?.references?.[section];
          if (refContent) {
            // 🎯 压缩参考文件内容
            const compressedRef = this._compressReference(refContent, section);
            fullContent += `\n### ${section.replace('.md', '')}\n${compressedRef}\n`;
          }
        }
      }
    } catch (error) {
      console.warn('获取Python沙盒内容失败:', error);
      fullContent = this._extractPythonKeyInformation(skillData.content, userQuery);
    }
    
    return fullContent;
  }

  /**
   * 🎯 推断相关章节（简化版）
   */
  _inferRelevantSections(userQuery) {
    const sections = new Set();
    const queryLower = userQuery.toLowerCase();
    
    // 🎯 简单关键词匹配
    Object.entries(this.sectionMapping).forEach(([keyword, sectionList]) => {
      if (queryLower.includes(keyword.toLowerCase())) {
        sectionList.forEach(section => sections.add(section));
      }
    });
    
    // 🎯 如果没有匹配到，使用默认章节
    if (sections.size === 0) {
      sections.add('pandas_cheatsheet.md');
      sections.add('matplotlib_cookbook.md');
    }
    
    return Array.from(sections).slice(0, 3); // 最多返回3个
  }

  /**
   * 🎯 内容压缩
   */
  _compressContent(content, userQuery, maxChars = null) {
    const limit = maxChars || this.maxChars;
    
    if (content.length <= limit) return content;
    
    // 🎯 简单压缩策略：保留关键部分
    const sections = content.split(/(?=^#{2,3}\s)/m);
    let compressed = '';
    let remaining = limit;
    
    // 🎯 根据查询关键词排序章节
    const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    
    sections.forEach(section => {
      const sectionLower = section.toLowerCase();
      const hasKeyword = queryWords.some(word => sectionLower.includes(word));
      
      // 🎯 包含关键词的章节优先
      if (hasKeyword && section.length <= remaining * 0.7) {
        compressed += section;
        remaining -= section.length;
      }
    });
    
    // 🎯 如果压缩后内容太少，添加摘要
    if (compressed.length < 1000) {
      compressed = this._extractKeySections(content);
    }
    
    // 🎯 截断到最大长度
    if (compressed.length > limit) {
      compressed = compressed.substring(0, limit) + '\n\n...(内容已优化，如需完整指南请参考技能文档)';
    }
    
    return compressed;
  }

  /**
   * 🎯 提取关键章节
   */
  _extractKeySections(content) {
    let result = '';
    
    // 提取通用调用结构
    const structureMatch = content.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i);
    if (structureMatch) {
      result += structureMatch[0] + '\n\n';
    }
    
    // 提取常见错误
    const errorsMatch = content.match(/### ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i);
    if (errorsMatch) {
      result += errorsMatch[0] + '\n\n';
    }
    
    if (result.length < 500) {
      result = content.substring(0, Math.min(3000, content.length)) + '...';
    }
    
    return result;
  }

  /**
   * 🎯 压缩参考文件
   */
  _compressReference(content, fileName) {
    if (content.length <= 2000) return content;
    
    // 🎯 保留前2000字符
    return content.substring(0, 2000) + '\n\n...(参考文件内容已压缩)';
  }

  /**
   * 🎯 辅助方法
   */
  _generateCacheKey(toolName, userQuery, sessionId) {
    const queryHash = this._hashString(userQuery.substring(0, 50));
    return `${toolName}_${sessionId}_${queryHash}`;
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  _hasToolBeenInjected(sessionId, toolName) {
    if (!this.sessionInjectionTracker.has(sessionId)) return false;
    return this.sessionInjectionTracker.get(sessionId).has(toolName);
  }

  _recordToolInjection(sessionId, toolName) {
    if (!this.sessionInjectionTracker.has(sessionId)) {
      this.sessionInjectionTracker.set(sessionId, new Set());
    }
    this.sessionInjectionTracker.get(sessionId).add(toolName);
  }

  _extractKeyHint(content, userQuery) {
    if (userQuery.includes('搜索') || userQuery.includes('查询')) {
      return '支持实时网络搜索和信息获取';
    }
    if (userQuery.includes('图片') || userQuery.includes('图像')) {
      return '支持图片内容分析和理解';
    }
    return null;
  }

  _extractPythonKeyInformation(content, userQuery) {
    // 🎯 复用现有逻辑
    let keyInfo = '';
    
    // 提取基础调用规范
    const basicUsage = content.match(/## 🚀 基础调用规范[\s\S]*?(?=\n##|\n#|$)/);
    if (basicUsage) {
      keyInfo += `**📋 基础调用**:\n`;
      const jsonExample = basicUsage[0].match(/```json\n([\s\S]*?)\n```/);
      if (jsonExample) {
        keyInfo += `简单代码执行格式：\n\`\`\`json\n${jsonExample[1]}\n\`\`\`\n\n`;
      }
    }

    // 提取工作流模式
    const workflowSection = content.match(/## 💡 核心工作流模式[\s\S]*?(?=\n##|\n#|$)/);
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
   * 🎯 创建降级技能管理器
   */
  createFallbackManager() {
    return {
      findRelevantSkills: (userQuery, context = {}) => {
        console.log(`[FallbackManager] 简化查询: ${userQuery}`);
        // 🎯 极简匹配逻辑
        const availableTools = context.availableTools || [];
        const matches = [];
        
        availableTools.forEach(toolName => {
          if (userQuery.toLowerCase().includes(toolName.replace('_', ' '))) {
            matches.push({
              toolName,
              score: 0.8,
              skill: { metadata: { name: toolName, description: '工具描述' } }
            });
          }
        });
        
        return matches.slice(0, 2);
      }
    };
  }

  /**
   * 🎯 清理缓存
   */
  clearSessionCache(sessionId) {
    // 清理缓存条目
    const sessionPrefix = `${sessionId}_`;
    for (const key of this.knowledgeCache.keys()) {
      if (key.includes(sessionPrefix)) {
        this.knowledgeCache.delete(key);
      }
    }
    
    // 清理注入跟踪
    this.sessionInjectionTracker.delete(sessionId);
    
    console.log(`🗑️ [普通模式] 清理会话 ${sessionId} 的缓存`);
  }

  /**
   * 🎯 获取缓存统计
   */
  getCacheStats() {
    return {
      cacheSize: this.knowledgeCache.size,
      sessionCount: this.sessionInjectionTracker.size,
      cacheEnabled: this.cacheEnabled,
      compressionEnabled: this.compressionEnabled
    };
  }
}

// 导出单例实例
export const enhancedNormalModeManager = new EnhancedNormalModeManager();