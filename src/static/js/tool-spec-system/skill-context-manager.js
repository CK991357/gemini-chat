// D:\Github_10110531\gemini_chat\src\static\js\tool-spec-system\skill-context-manager.js


// Modified to use global skill manager singleton
async function getSkillManager() {
  // 首先尝试全局增强管理器
  if (typeof window.getGlobalSkillManager === 'function') {
    return await window.getGlobalSkillManager();
  }

  // 降级方案：直接使用EnhancedSkillManager
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
    
    // 🎯 【新增】会话迭代跟踪
    this.sessionIterations = new Map(); // sessionId -> iterationCount
    this.sessionToolUsage = new Map(); // sessionId -> toolUsageCount
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
  async generateRequestContext(userQuery, availableTools = [], modelConfig = {}, sessionId = 'default') {
    if (!await this.ensureInitialized()) {
      return { enhancedPrompt: userQuery, relevantTools: [] };
    }

    // 1. 查找相关技能 - 🎯【修复】添加 await
    let relevantSkills;
    try {
      relevantSkills = await this.skillManager.findRelevantSkills(userQuery, {
        availableTools,
        category: modelConfig.category
      });
    } catch (error) {
      console.error('❌ 获取相关技能失败:', error);
      relevantSkills = [];
    }

    // 🎯 【重要】确保 relevantSkills 是数组
    if (!Array.isArray(relevantSkills) || relevantSkills.length === 0) {
      console.log('[SkillContextManager] 未找到相关技能或结果格式错误:', relevantSkills);
      return { 
        enhancedPrompt: userQuery, 
        relevantTools: [],
        contextLevel: 'none'
      };
    }

    // 🎯 【新增】获取当前会话的迭代次数
    let iteration = 0;
    if (this.sessionIterations.has(sessionId)) {
      iteration = this.sessionIterations.get(sessionId);
    }
    
    // 🎯 【新增】检查工具使用历史
    const toolHistory = this.sessionToolUsage.has(sessionId) 
      ? this.sessionToolUsage.get(sessionId)
      : new Map();

    // 2. 生成增强提示词（使用智能缓存）
    let enhancedPrompt = '';
    const injectedTools = [];
    
    // 🎯 【修复】这里是对 relevantSkills 进行迭代
    for (const skill of relevantSkills) {
      const toolName = skill.toolName;
      
      // 🎯 【关键】检查是否已经注入过
      // 注意：这里需要skillManager提供hasToolBeenInjected方法
      const hasBeenInjected = this.skillManager.hasToolBeenInjected ? 
        await this.skillManager.hasToolBeenInjected(toolName, sessionId) : false;
      const usageCount = toolHistory.get(toolName) || 0;
      
      // 🎯 决定是否使用完整指南还是引用
      const isFirstTime = !hasBeenInjected || usageCount === 0;
      
      // 生成技能指南
      let skillGuide;
      if (this.skillManager.generateSmartSkillInjection) {
        // 使用增强管理器的智能注入
        skillGuide = await this.skillManager.generateSmartSkillInjection(
          skill.skill || skill,
          userQuery,
          sessionId,
          isFirstTime
        );
      } else {
        // 降级方案：构建基本指南
        skillGuide = await this._buildBasicSkillGuide(skill, userQuery, isFirstTime);
      }
      
      enhancedPrompt += skillGuide + '\n\n';
      injectedTools.push(toolName);
      
      // 🎯 更新工具使用计数
      toolHistory.set(toolName, usageCount + 1);
    }

    // 🎯 【新增】更新会话状态
    this.sessionIterations.set(sessionId, iteration + 1);
    this.sessionToolUsage.set(sessionId, toolHistory);

    // 3. 添加通用指导
    if (enhancedPrompt) {
      enhancedPrompt += `## 💡 执行指导\n`;
      enhancedPrompt += `请基于以上工具指南来响应用户请求。特别注意复杂工具的特殊调用规范。\n\n`;
      enhancedPrompt += `---\n\n## 👤 用户原始请求\n${userQuery}`;
    } else {
      enhancedPrompt = userQuery;
    }
    
    // 4. 清理过时会话（可选）
    this.cleanupOldSessions();

    return {
      enhancedPrompt,
      relevantTools: relevantSkills.map(skill => skill.toolName),
      injectedTools, // 🎯 新增：记录实际注入的工具
      contextLevel: relevantSkills.length > 1 ? 'multi' : 'single',
      skillCount: relevantSkills.length,
      hasComplexTools: relevantSkills.some(skill => 
        ['crawl4ai', 'python_sandbox'].includes(skill.toolName)
      ),
      sessionId,
      iteration
    };
  }

  /**
   * 🎯 构建基本技能指南（降级方案）
   */
  async _buildBasicSkillGuide(skill, userQuery, isFirstTime) {
    const toolName = skill.toolName;
    const name = skill.name || toolName;
    const description = skill.description || '未提供描述';
    
    // 🎯 检查工具类型，调用对应的构建方法
    if (toolName === 'python_sandbox') {
      return await this._buildPythonSandboxContext(skill, userQuery);
    } else if (toolName === 'crawl4ai') {
      return await this._buildCrawl4AIContext(skill, userQuery);
    }
    
    // 🎯 通用工具的基本指南
    let guide = `### 🛠️ 工具: ${name}\n\n`;
    guide += `**功能**: ${description}\n`;
    
    if (!isFirstTime) {
      guide += `\n**提示**: 该工具的详细指南已在之前的对话中提供，请参考之前的说明。`;
    }
    
    return guide;
  }

  /**
   * 🎯 【新增】清理过时会话
   */
  cleanupOldSessions(maxAge = 30 * 60 * 1000) { // 30分钟
    const now = Date.now();
    // 注意：skill-manager.js 中的缓存有自己的TTL，这里只清理迭代记录
  }

  /**
   * 🎯 【新增】重置会话状态（用于新建聊天）
   */
  resetSession(sessionId) {
    this.sessionIterations.delete(sessionId);
    this.sessionToolUsage.delete(sessionId);
    console.log(`[SkillContextManager] 已重置会话 ${sessionId} 的状态`);
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
    const skillData = skill.skill || skill;
    const score = skill.score || 0;
    const name = skill.name || skill.toolName;
    const description = skill.description || skillData.description || '未提供描述';
    
    let context = `### 🕷️ 网页抓取工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    context += `**核心功能**: ${description}\n\n`;
    
    // 1. 智能模式推荐
    const recommendedMode = this._recommendCrawl4AIMode(userQuery);
    if (recommendedMode) {
      context += `**🎯 推荐模式**: ${recommendedMode}\n\n`;
    }
    
    // 2. 提取关键调用结构
    const keyInfo = this._extractCrawl4AIKeyInformation(skillData.content || '', userQuery);
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
    const skillData = skill.skill || skill;
    const score = skill.score || 0;
    const name = skill.name || skill.toolName;
    const description = skill.description || skillData.description || '未提供描述';
    
    let context = `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    context += `**核心功能**: ${description}\n\n`;
    
    // 1. 提取主文档的关键信息
    const mainContent = this._extractPythonKeyInformation(skillData.content || '', userQuery);
    context += mainContent;
    
    // 2. 🎯 【新增】智能章节匹配：根据用户查询推断相关章节
    const relevantSections = this._inferRelevantSections(userQuery);
    
    if (relevantSections.length > 0) {
      context += `**📚 相关操作指南（根据您的查询智能提取）**:\n\n`;
      
      // 从技能内容中提取相关章节
      for (const section of relevantSections.slice(0, 3)) { // 限制前3个
        const sectionContent = this._extractSpecificSection(skillData.content || '', section);
        if (sectionContent) {
          context += `#### ${section}\n`;
          context += this._compressSection(sectionContent, 300) + '\n\n'; // 压缩到300字符
        }
      }
      
      context += `💡 **提示**: 执行相关任务时请参考以上指南中的代码模板和工作流。\n\n`;
    }
    
    // 3. 智能匹配相关参考文件
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
    
    // 4. 添加Python沙盒专用提醒
    context += `\n**🚨 输出规范**:\n`;
    context += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    context += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    context += `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
    
    return context;
  }

  /**
   * 🎯 【新增】智能章节推断方法（从EnhancedSkillManager复制）
   * 基于上下文智能推断相关章节
   * 构建高密度的关键词映射网络，覆盖更多隐晦场景
   */
  _inferRelevantSections(userQuery, toolCallHistory = []) {
    const sections = new Set(); // 使用Set避免重复
    
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
    
    console.log(`[SkillContextManager] 🧠 智能章节推断完成:`, {
      原始查询: userQuery,
      推断章节: Array.from(sections),
      匹配模式: '混合策略（精确+模糊+语义+上下文）'
    });
    
    return Array.from(sections);
  }

  /**
   * 🎯 【新增】从内容中提取特定章节
   */
  _extractSpecificSection(content, sectionKeyword) {
    if (!content) return null;
    
    // 智能提取章节内容
    const sections = content.split(/(?=^#{2,4}\s)/m);
    
    // 精确标题匹配
    for (const section of sections) {
      const titleMatch = section.match(/^#{2,4}\s+([^\n]+)/i);
      if (titleMatch) {
        const title = titleMatch[1];
        if (title.toLowerCase().includes(sectionKeyword.toLowerCase()) ||
            sectionKeyword.toLowerCase().includes(title.toLowerCase())) {
          return section;
        }
      }
    }
    
    // 模糊内容匹配
    for (const section of sections) {
      if (section.toLowerCase().includes(sectionKeyword.toLowerCase())) {
        return section;
      }
    }
    
    return null;
  }
  
  /**
   * 🎯 【新增】压缩章节内容
   */
  _compressSection(content, maxChars = 500) {
    if (!content) return '';
    if (content.length <= maxChars) return content;
    
    // 1. 提取代码示例（优先保留）
    const codeMatch = content.match(/```[\s\S]*?```/);
    if (codeMatch) {
      const codeBlock = codeMatch[0];
      const remainingChars = maxChars - codeBlock.length;
      if (remainingChars > 100) {
        // 保留代码块和部分文字
        const textBefore = content.substring(0, content.indexOf(codeBlock));
        const textAfter = content.substring(content.indexOf(codeBlock) + codeBlock.length);
        
        return textBefore.substring(0, Math.min(remainingChars/2, textBefore.length)) + 
               '\n' + codeBlock + '\n' +
               textAfter.substring(0, Math.min(remainingChars/2, textAfter.length)) + '...';
      }
    }
    
    // 2. 没有代码块，简单截断
    return content.substring(0, maxChars) + '...';
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
    if (!skillContent) return '';
    
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
    if (!skillContent) return '';
    
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
    if (!refContent) return '';
    
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
    const name = skill.name || skill.toolName;
    const description = skill.description || '未提供描述';
    const score = skill.score || 0;
    const keyHint = this._extractKeyHint(skill.skill?.content || '', userQuery);
    
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