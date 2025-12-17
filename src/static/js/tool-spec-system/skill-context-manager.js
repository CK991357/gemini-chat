// src/tool-spec-system/skill-context-manager.js
// 🎯 增强章节推断 + 语义理解 + 上下文动态匹配

import { skillManagerPromise } from './skill-manager.js';

class SkillContextManager {
  constructor() {
    this.skillManager = null;
    this.initialized = false;
    
    // 🎯 新增：缓存压缩系统引用
    this.cacheCompressor = null;
    
    // 初始化时获取缓存压缩器
    skillManagerPromise.then(skillManager => {
        this.cacheCompressor = skillManager.cacheCompressor;
        console.log('✅ SkillContextManager 已集成缓存压缩系统');
    });
    
    // 🚀 crawl4ai 专用关键词映射（保持不变）
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
    
    // 🚀 Python沙盒专用关键词映射（保持不变）
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
    
    // 🎯 ==================== 新增部分 ====================
    
    // 1. 增强章节映射（针对Python沙盒）
    this.enhancedPythonSectionMap = {
      'matplotlib_cookbook.md': {
        keywords: ['图表', '可视化', '画图', 'plot', 'chart', '图形', '绘图', 'matplotlib'],
        sections: [
          { name: '核心使用方法', keywords: ['使用方法', '原则', '导入', 'plt.show'] },
          { name: '可直接使用的代码模板', keywords: ['模板', '示例', '代码', '条形图', '折线图', '子图'] },
          { name: '图表类型选择指南', keywords: ['选择', '指南', '对比', '条形图', '折线图', '饼图'] },
          { name: '流程图与架构图生成指南', keywords: ['流程图', '架构图', 'graphviz', 'networkx'] },
          { name: '样式配置与字体设置', keywords: ['样式', '字体', '配置', '中文', '乱码'] }
        ]
      },
      
      'pandas_cheatsheet.md': {
        keywords: ['数据', '清洗', '处理', '分析', 'pandas', 'dataframe', 'duckdb'],
        sections: [
          { name: '文件操作（会话工作区：/data）', keywords: ['文件', '读取', '保存', 'csv', 'excel'] },
          { name: '数据可视化（自动捕获）', keywords: ['可视化', '图表', '自动', 'plt.show'] },
          { name: '数据处理（简洁实用版）', keywords: ['清洗', '处理', '缺失值', '重复值'] },
          { name: '性能优化（针对大文件）', keywords: ['性能', '大文件', '内存', '优化', 'duckdb'] }
        ]
      },
      
      'ml_workflow.md': {
        keywords: ['机器学习', '模型', '训练', '预测', '分类', '回归', 'xgboost'],
        sections: [
          { name: '基础机器学习模板', keywords: ['基础', '模板', '准备', '预处理'] },
          { name: '回归分析完整工作流', keywords: ['回归', '分析', '工作流', '随机森林'] },
          { name: '分类分析完整工作流', keywords: ['分类', '工作流', '随机森林', '准确率'] },
          { name: '时间序列分析', keywords: ['时间序列', 'arima', 'xgboost', '预测'] },
          { name: '模型优化与调参', keywords: ['优化', '调参', '网格搜索', '参数'] }
        ]
      },
      
      'report_generator_workflow.md': {
        keywords: ['报告', 'word', 'excel', 'pdf', 'ppt', '文档', '生成'],
        sections: [
          { name: 'Word 报告生成 (.docx)', keywords: ['word', 'docx', '文档'] },
          { name: 'Excel 报告生成 (.xlsx)', keywords: ['excel', 'xlsx', '表格'] },
          { name: 'PDF 报告生成 (.pdf)', keywords: ['pdf', '报告', '生成'] },
          { name: 'PowerPoint 报告生成 (.pptx)', keywords: ['ppt', 'powerpoint', '幻灯片'] }
        ]
      },
      
      'text_analysis_cookbook.md': {
        keywords: ['文本', '分析', '提取', '解析', '正则', '字符串'],
        sections: [
          { name: '快速开始模板', keywords: ['快速', '开始', '模板', '示例'] },
          { name: '输出格式规范', keywords: ['格式', '规范', 'json', '输出'] },
          { name: '专业分析工具箱', keywords: ['工具', '工具箱', '提取', '分析'] }
        ]
      },
      
      'sympy_cookbook.md': {
        keywords: ['数学', '符号', '计算', '方程', '微积分', '代数', '公式'],
        sections: [
          { name: '基础符号运算', keywords: ['符号', '运算', '表达式', '变量'] },
          { name: '方程求解', keywords: ['方程', '求解', '解方程', 'solve'] },
          { name: '微积分运算', keywords: ['微积分', '微分', '积分', '导数'] }
        ]
      },
      
      'scipy_cookbook.md': {
        keywords: ['科学计算', '数值计算', '优化', '积分', '统计'],
        sections: [
          { name: '优化与方程求解', keywords: ['优化', '方程', '求解', '最小化'] },
          { name: '数值积分', keywords: ['积分', '数值积分', '定积分'] },
          { name: '统计计算', keywords: ['统计', '分布', '检验', '概率'] }
        ]
      }
    };
    
    // 2. 语义理解配置
    this.semanticClusters = {
      // 数据可视化相关
      '可视化': ['图表', '图形', '画图', '绘图', '数据可视化', 'visualization', 'plot', 'chart', 'graph', 'figure'],
      'matplotlib': ['pyplot', 'plt', 'seaborn', 'plotly', 'pyecharts', '可视化库', '绘图库'],
      
      // 数据处理相关
      '数据处理': ['数据清洗', '数据整理', '数据转换', 'data processing', 'data cleaning', 'data wrangling'],
      'pandas': ['dataframe', 'series', '数据分析', '数据操作', '数据筛选'],
      
      // 机器学习相关
      '机器学习': ['ml', '模型训练', '算法', '预测', '分类', '回归', 'machine learning'],
      '模型评估': ['准确率', '精确率', '召回率', 'f1', 'auc', '混淆矩阵', '模型性能'],
      
      // 报告生成相关
      '报告': ['文档', 'word', 'excel', 'pdf', '输出', '生成', 'export', 'report'],
      '自动化': ['自动生成', '批量处理', '脚本', '自动化流程']
    };
    
    // 3. 配置开关
    this.enhancedInferenceEnabled = true; // 启用增强推断
    this.semanticUnderstandingEnabled = true; // 启用语义理解
    this.contextAwareMatchingEnabled = true; // 启用上下文感知
    
    // 4. 会话上下文跟踪
    this.conversationContexts = new Map(); // sessionId -> context
    
    console.log('✅ SkillContextManager 已加载增强章节推断和语义理解系统');
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
   * 🚀 核心方法：为模型请求生成智能上下文
   */
  async generateRequestContext(userQuery, availableTools = [], modelConfig = {}, context = {}) {
    if (!await this.ensureInitialized()) {
      return { 
        enhancedPrompt: userQuery, 
        relevantTools: [],
        contextLevel: 'none'
      };
    }

    console.log(`🔍 [技能上下文生成] 查询: "${userQuery.substring(0, 50)}..."`, {
      可用工具数: availableTools.length,
      模型: modelConfig.name,
      会话ID: context.sessionId || 'default'
    });

    // 🎯 合并上下文信息
    const skillContext = {
      ...context,  // 包含 sessionId, userQuery, mode 等
      availableTools,
      category: modelConfig.category
    };

    // 1. 查找相关技能
    const relevantSkills = this.skillManager.findRelevantSkills(userQuery, skillContext);

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
      ? await this._buildEnhancedPromptWithComplexTools(userQuery, relevantSkills, modelConfig, context)
      : await this._buildStandardEnhancedPrompt(userQuery, relevantSkills, modelConfig);
    
    return {
      enhancedPrompt,
      relevantTools: relevantSkills.map(skill => skill.toolName),
      contextLevel: relevantSkills.length > 1 ? 'multi' : 'single',
      skillCount: relevantSkills.length,
      hasComplexTools,
      sessionId: context.sessionId || 'default'
    };
  }

  /**
   * 🎯 构建包含复杂工具的增强提示词
   */
  async _buildEnhancedPromptWithComplexTools(userQuery, relevantSkills, modelConfig, context = {}) {
    let contextPrompt = `## 🎯 智能工具指南 (检测到复杂工具)\n\n`;
    
    // 分别处理每个复杂工具
    for (const skill of relevantSkills) {
      if (skill.toolName === 'crawl4ai') {
        contextPrompt += await this._buildCrawl4AIContext(skill, userQuery);
      } else if (skill.toolName === 'python_sandbox') {
        contextPrompt += await this._buildEnhancedPythonSandboxContext(skill, userQuery, context.sessionId, context);
      } else {
        // 其他工具的标准处理
        contextPrompt += this._buildStandardSkillContext(skill, userQuery);
      }
      contextPrompt += '\n\n';
    }

    // 添加通用指导
    contextPrompt += `## 💡 执行指导\n`;
    contextPrompt += `请基于以上详细指南来响应用户请求。特别注意复杂工具的特殊调用规范。\n\n`;
    contextPrompt += `---\n\n## 👤 用户原始请求\n${userQuery}`;

    return contextPrompt;
  }

  /**
   * 🚀 增强的Python沙盒上下文构建（替换原有方法）
   */
  async _buildEnhancedPythonSandboxContext(skill, userQuery, sessionId, context = {}) {
    const { skill: skillData, score, name, description } = skill;
    
    console.log(`🔍 [增强Python沙盒] 查询: "${userQuery.substring(0, 50)}..."`);
    
    // 🎯 1. 先检查缓存（保持原有逻辑）
    const cacheKey = this.skillManager.cacheCompressor._generateCacheKey(
      'python_sandbox', 
      userQuery, 
      { sessionId, ...context }
    );
    
    const cachedContent = this.skillManager.cacheCompressor.getFromCache(
      'python_sandbox', 
      userQuery, 
      { sessionId, ...context }
    );
    
    let contextContent = `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    contextContent += `**核心功能**: ${description}\n\n`;
    
    if (cachedContent) {
      // ✅ 缓存命中，直接返回
      contextContent += cachedContent;
      console.log(`🎯 [上下文缓存命中] python_sandbox: ${cachedContent.length} 字符`);
      return contextContent;
    }
    
    // 🎯 2. 分析用户查询，推断相关文档和章节
    let sectionAnalysis;
    if (this.enhancedInferenceEnabled) {
      sectionAnalysis = this._analyzeQueryForSections(userQuery);
      console.log('📚 [章节分析结果]', {
        相关文档数: sectionAnalysis.relevantDocuments.length,
        相关章节数: sectionAnalysis.relevantSections.length,
        具体章节: sectionAnalysis.relevantSections.map(s => s.section)
      });
    } else {
      // 降级：使用原有方法
      sectionAnalysis = {
        relevantDocuments: this._findRelevantPythonReferences(userQuery),
        relevantSections: [],
        hasExactSectionMatch: false
      };
    }
    
    // 🎯 3. 语义理解增强
    let semanticAnalysis = null;
    if (this.semanticUnderstandingEnabled) {
      semanticAnalysis = this._performSemanticAnalysis(userQuery, context);
      console.log('🧠 [语义分析]', {
        意图: semanticAnalysis.intent,
        复杂度: semanticAnalysis.complexity,
        扩展词数: semanticAnalysis.expandedQuery.expanded.length
      });
    }
    
    // 🎯 4. 上下文感知
    let conversationContext = null;
    if (this.contextAwareMatchingEnabled && sessionId) {
      conversationContext = this._getOrCreateConversationContext(sessionId, userQuery, context);
    }
    
    // 🎯 5. 构建增强的上下文内容
    let enhancedContent = '';
    
    if (sectionAnalysis.hasExactSectionMatch || (semanticAnalysis && semanticAnalysis.intent.confidence > 0.5)) {
      // 有明确的匹配或高置信度意图
      enhancedContent = this._buildEnhancedSectionsContent(
        sectionAnalysis, 
        semanticAnalysis, 
        conversationContext, 
        skillData, 
        userQuery
      );
    } else {
      // 降级：使用原有方法
      enhancedContent = this._buildFallbackContent(skillData, userQuery);
    }
    
    // 🎯 6. 压缩内容（保持原有逻辑）
    const compressedContent = await this.skillManager.cacheCompressor.compressKnowledge(
      enhancedContent,
      {
        level: 'smart',
        maxChars: 12000,
        userQuery: userQuery
      }
    );
    
    // 缓存结果
    this.skillManager.cacheCompressor.setToCache(
      'python_sandbox', 
      userQuery, 
      { sessionId, ...context }, 
      compressedContent
    );
    
    // 记录注入
    this.skillManager.cacheCompressor.recordToolInjection(sessionId, 'python_sandbox');
    
    // 更新会话上下文
    if (conversationContext) {
      this._updateConversationContext(sessionId, {
        query: userQuery,
        matchedSections: sectionAnalysis.relevantSections.map(s => s.section),
        intent: semanticAnalysis?.intent?.type || 'unknown',
        timestamp: Date.now()
      });
    }
    
    contextContent += compressedContent;
    return contextContent;
  }

  /**
   * 🎯 分析查询，推断相关章节
   */
  _analyzeQueryForSections(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const relevantDocuments = [];
    const relevantSections = [];
    
    // 1. 文档级别匹配
    for (const [docName, docInfo] of Object.entries(this.enhancedPythonSectionMap)) {
      // 检查文档关键词
      const docMatch = docInfo.keywords.some(keyword => 
        queryLower.includes(keyword.toLowerCase())
      );
      
      if (docMatch) {
        relevantDocuments.push(docName);
        
        // 2. 章节级别匹配
        docInfo.sections.forEach(section => {
          const sectionMatch = section.keywords.some(keyword =>
            queryLower.includes(keyword.toLowerCase())
          );
          
          if (sectionMatch) {
            relevantSections.push({
              document: docName,
              section: section.name,
              keywords: section.keywords.filter(kw => queryLower.includes(kw.toLowerCase())),
              score: this._calculateSectionScore(section.keywords, queryLower)
            });
          }
        });
      }
    }
    
    // 3. 语义扩展匹配（如果启用）
    if (this.semanticUnderstandingEnabled) {
      const expandedMatches = this._semanticExpansionMatch(queryLower);
      relevantDocuments.push(...expandedMatches.documents);
      relevantSections.push(...expandedMatches.sections);
    }
    
    // 4. 去重和排序
    const uniqueDocuments = [...new Set(relevantDocuments)];
    const sortedSections = relevantSections
      .filter((section, index, self) => 
        index === self.findIndex(s => 
          s.document === section.document && s.section === section.section
        )
      )
      .sort((a, b) => b.score - a.score);
    
    // 5. 如果没有明确匹配，使用原有的参考文件匹配（保持向后兼容）
    if (uniqueDocuments.length === 0) {
      const originalReferences = this._findRelevantPythonReferences(userQuery);
      uniqueDocuments.push(...originalReferences);
    }
    
    return {
      relevantDocuments: uniqueDocuments,
      relevantSections: sortedSections,
      hasExactSectionMatch: sortedSections.length > 0
    };
  }

  /**
   * 🎯 计算章节匹配分数
   */
  _calculateSectionScore(keywords, queryLower) {
    let score = 0;
    
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      if (queryLower.includes(keywordLower)) {
        score += 1;
        
        // 关键词位置权重
        if (queryLower.startsWith(keywordLower)) {
          score += 2; // 查询开头出现权重更高
        }
        
        // 关键词长度权重
        if (keywordLower.length > 4) {
          score += 0.5; // 长关键词更具体
        }
      }
    });
    
    return score;
  }

  /**
   * 🎯 语义扩展匹配
   */
  _semanticExpansionMatch(queryLower) {
    const documents = new Set();
    const sections = [];
    
    // 检查每个语义簇
    for (const [cluster, synonyms] of Object.entries(this.semanticClusters)) {
      const clusterInQuery = synonyms.some(synonym => queryLower.includes(synonym.toLowerCase()));
      
      if (clusterInQuery) {
        // 找到包含该簇的文档
        for (const [docName, docInfo] of Object.entries(this.enhancedPythonSectionMap)) {
          const docHasCluster = docInfo.keywords.some(keyword => 
            synonyms.some(syn => keyword.toLowerCase().includes(syn.toLowerCase()))
          );
          
          if (docHasCluster) {
            documents.add(docName);
            
            // 找到相关章节
            docInfo.sections.forEach(section => {
              const sectionHasCluster = section.keywords.some(keyword =>
                synonyms.some(syn => keyword.toLowerCase().includes(syn.toLowerCase()))
              );
              
              if (sectionHasCluster) {
                sections.push({
                  document: docName,
                  section: section.name,
                  keywords: [cluster, ...synonyms.slice(0, 2)],
                  score: 0.7, // 语义匹配的基础分数
                  reason: `语义扩展匹配到"${cluster}"`
                });
              }
            });
          }
        }
      }
    }
    
    return {
      documents: Array.from(documents),
      sections: sections
    };
  }

  /**
   * 🎯 语义分析
   */
  _performSemanticAnalysis(userQuery, context) {
    const queryLower = userQuery.toLowerCase();
    
    // 1. 意图识别
    const intent = this._detectUserIntent(queryLower);
    
    // 2. 语义扩展
    const expandedQuery = this._expandQuerySemantically(queryLower);
    
    // 3. 复杂度评估
    const complexity = this._assessQueryComplexity(userQuery);
    
    return {
      intent,
      expandedQuery,
      complexity,
      context: {
        toolCallHistory: context.toolCallHistory || [],
        userPreferences: context.userPreferences || {}
      }
    };
  }

  /**
   * 🎯 检测用户意图
   */
  _detectUserIntent(queryLower) {
    const intentPatterns = {
      visualization: {
        patterns: [/画(?:一个|张|幅)?/, /可视化(?:一下)?/, /图表(?:展示|表示)/, /plot/, /chart/, /graph/],
        weight: 0.9
      },
      data_processing: {
        patterns: [/处理(?:一下)?数据/, /清洗(?:数据)?/, /整理(?:数据)?/, /data process/, /clean data/],
        weight: 0.8
      },
      code_execution: {
        patterns: [/如何(?:使用|实现|编写)?/, /请(?:写|给)?(?:一个|一段)?代码/, /代码(?:示例|例子)?/, /code/, /example/],
        weight: 0.7
      },
      analysis: {
        patterns: [/分析(?:一下|下)?/, /看看(?:数据|趋势)?/, /有什么(?:发现|结论)/, /analyze/, /analysis/],
        weight: 0.8
      }
    };
    
    let bestIntent = { type: 'general', confidence: 0.3 };
    
    for (const [intentType, config] of Object.entries(intentPatterns)) {
      for (const pattern of config.patterns) {
        if (pattern.test(queryLower)) {
          const confidence = config.weight;
          if (confidence > bestIntent.confidence) {
            bestIntent = { type: intentType, confidence };
          }
        }
      }
    }
    
    return bestIntent;
  }

  /**
   * 🎯 语义扩展查询
   */
  _expandQuerySemantically(queryLower) {
    const words = queryLower.split(/[\s,，、.。!！?？]+/);
    const expandedWords = new Set(words);
    
    // 基于语义簇扩展
    for (const word of words) {
      if (word.length < 2) continue;
      
      for (const [cluster, synonyms] of Object.entries(this.semanticClusters)) {
        if (synonyms.includes(word) || word.includes(cluster)) {
          // 添加整个簇的同义词
          synonyms.forEach(syn => {
            if (syn.length > 1) expandedWords.add(syn);
          });
        }
      }
    }
    
    return {
      original: words,
      expanded: Array.from(expandedWords)
    };
  }

  /**
   * 🎯 评估查询复杂度
   */
  _assessQueryComplexity(userQuery) {
    const wordCount = userQuery.split(/\s+/).length;
    const charCount = userQuery.length;
    
    let level = 'simple';
    let requires = '代码示例';
    
    if (charCount > 100 || wordCount > 25) {
      level = 'complex';
      requires = '完整文档+示例+最佳实践';
    } else if (charCount > 50 || wordCount > 15) {
      level = 'medium';
      requires = '工作流+代码';
    }
    
    // 检查是否包含复杂操作词汇
    const complexIndicators = [
      '多个', '批量', '自动化', '工作流', '流程', '完整',
      'complex', 'workflow', 'automation', 'batch'
    ];
    
    if (complexIndicators.some(ind => userQuery.includes(ind))) {
      level = 'complex';
      requires = '完整工作流+多个示例';
    }
    
    return { level, requires, wordCount, charCount };
  }

  /**
   * 🎯 获取或创建会话上下文
   */
  _getOrCreateConversationContext(sessionId, userQuery, context) {
    if (!this.conversationContexts.has(sessionId)) {
      this.conversationContexts.set(sessionId, {
        history: [],
        patterns: {},
        preferences: {},
        recentTopics: new Set()
      });
    }
    
    const conversationContext = this.conversationContexts.get(sessionId);
    
    // 分析当前查询的主题
    const topics = this._extractTopicsFromQuery(userQuery);
    topics.forEach(topic => conversationContext.recentTopics.add(topic));
    
    // 限制主题数量
    if (conversationContext.recentTopics.size > 10) {
      const topicsArray = Array.from(conversationContext.recentTopics);
      conversationContext.recentTopics = new Set(topicsArray.slice(-10));
    }
    
    return conversationContext;
  }

  /**
   * 🎯 从查询中提取主题
   */
  _extractTopicsFromQuery(userQuery) {
    const topics = new Set();
    const words = userQuery.toLowerCase().split(/[\s,，、.。!！?？]+/);
    
    const stopWords = new Set([
      '这个', '那个', '怎么', '如何', '请', '谢谢', '你好',
      '请问', '可以', '帮助', '需要', '想要', '希望'
    ]);
    
    words.forEach(word => {
      if (word.length > 1 && !stopWords.has(word)) {
        // 检查是否是内容词（不是功能词）
        if (this._isContentWord(word)) {
          topics.add(word);
        }
      }
    });
    
    return Array.from(topics);
  }

  /**
   * 🎯 判断是否为内容词
   */
  _isContentWord(word) {
    // 简单的启发式规则
    const functionWords = ['一个', '一种', '一下', '一些', '不要', '需要', '想要'];
    return !functionWords.includes(word) && word.length > 1;
  }

  /**
   * 🎯 更新会话上下文
   */
  _updateConversationContext(sessionId, entry) {
    if (!this.conversationContexts.has(sessionId)) return;
    
    const context = this.conversationContexts.get(sessionId);
    context.history.push(entry);
    
    // 限制历史长度
    if (context.history.length > 20) {
      context.history = context.history.slice(-20);
    }
    
    // 分析模式
    this._analyzeConversationPatterns(context);
  }

  /**
   * 🎯 分析会话模式
   */
  _analyzeConversationPatterns(context) {
    const history = context.history;
    if (history.length < 3) return;
    
    // 分析查询类型分布
    const queryTypes = {
      codeRequest: 0,
      analysisRequest: 0,
      visualizationRequest: 0,
      dataRequest: 0
    };
    
    history.forEach(entry => {
      const query = entry.query?.toLowerCase() || '';
      if (query.includes('代码') || query.includes('示例')) queryTypes.codeRequest++;
      if (query.includes('分析') || query.includes('统计')) queryTypes.analysisRequest++;
      if (query.includes('图表') || query.includes('可视化')) queryTypes.visualizationRequest++;
      if (query.includes('数据') || query.includes('处理')) queryTypes.dataRequest++;
    });
    
    // 设置用户偏好
    context.preferences = {
      prefersCodeExamples: queryTypes.codeRequest > queryTypes.analysisRequest,
      prefersDetailedExplanations: history.some(entry => (entry.query?.length || 0) > 50),
      commonTopics: Array.from(context.recentTopics || [])
    };
    
    // 检测使用模式
    const toolNames = history.map(entry => entry.tool || 'unknown');
    const uniqueTools = new Set(toolNames);
    
    if (uniqueTools.size === 1 && toolNames.length > 2) {
      context.patterns.usage = 'specialized';
    } else if (uniqueTools.size > 3) {
      context.patterns.usage = 'exploratory';
    } else {
      context.patterns.usage = 'balanced';
    }
  }

  /**
   * 🎯 构建增强的章节内容
   */
  _buildEnhancedSectionsContent(sectionAnalysis, semanticAnalysis, conversationContext, skillData, userQuery) {
    let content = '';
    
    // 1. 意图和复杂度说明
    if (semanticAnalysis) {
      content += `## 🧠 智能分析结果\n\n`;
      content += `**用户意图**: ${semanticAnalysis.intent.type} (置信度: ${(semanticAnalysis.intent.confidence * 100).toFixed(0)}%)\n`;
      content += `**查询复杂度**: ${semanticAnalysis.complexity.level}\n`;
      content += `**推荐处理方式**: ${semanticAnalysis.complexity.requires}\n\n`;
    }
    
    // 2. 相关章节推荐
    if (sectionAnalysis.relevantSections.length > 0) {
      content += `## 📚 相关章节推荐\n\n`;
      content += `检测到您的查询与以下章节高度相关：\n\n`;
      
      // 按文档分组显示
      const sectionsByDoc = {};
      sectionAnalysis.relevantSections.forEach(section => {
        if (!sectionsByDoc[section.document]) {
          sectionsByDoc[section.document] = [];
        }
        sectionsByDoc[section.document].push(section);
      });
      
      for (const [docName, sections] of Object.entries(sectionsByDoc)) {
        const docContent = skillData.resources?.references?.[docName];
        if (!docContent) continue;
        
        content += `### 📖 ${docName.replace('.md', '')}\n`;
        
        sections.forEach(sectionInfo => {
          content += `\n**${sectionInfo.section}**\n`;
          if (sectionInfo.keywords && sectionInfo.keywords.length > 0) {
            content += `*匹配关键词: ${sectionInfo.keywords.join(', ')}*\n`;
          }
          if (sectionInfo.score) {
            content += `*匹配分数: ${sectionInfo.score.toFixed(2)}*\n`;
          }
          
          // 提取该章节的内容
          const sectionContent = this._extractSectionContent(docContent, sectionInfo.section);
          if (sectionContent) {
            content += '\n' + sectionContent + '\n';
          }
        });
        
        content += '\n---\n\n';
      }
    } else if (sectionAnalysis.relevantDocuments.length > 0) {
      // 只有文档级别匹配
      content += `## 📚 相关参考文档\n\n`;
      content += `根据您的查询，以下文档可能对您有帮助：\n\n`;
      
      sectionAnalysis.relevantDocuments.forEach(docName => {
        const docContent = skillData.resources?.references?.[docName];
        if (docContent) {
          const summary = this._extractReferenceSummary(docContent, docName);
          content += `• **${docName.replace('.md', '')}**: ${summary}\n`;
        }
      });
    }
    
    // 3. 基于会话上下文的建议
    if (conversationContext && conversationContext.preferences.commonTopics.length > 0) {
      content += `\n**🎯 基于您近期关注的领域**:\n`;
      conversationContext.preferences.commonTopics.slice(0, 5).forEach(topic => {
        content += `• ${topic}\n`;
      });
      content += `\n`;
    }
    
    // 4. 添加通用指导
    content += `**💡 提示**: 执行相关任务时请严格参考上述指南中的代码模板和工作流。\n`;
    
    // 5. 添加Python沙盒专用提醒
    content += `\n**🚨 输出规范**:\n`;
    content += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    content += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    content += `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
    
    return content;
  }

  /**
   * 🎯 从文档中提取指定章节内容
   */
  _extractSectionContent(docContent, sectionName) {
    // 安全检查：确保docContent存在
    if (!docContent || typeof docContent !== 'string') {
        console.warn(`📚 [章节提取] 文档内容无效:`, { docContent, sectionName });
        return '';
    }
    
    const sectionPattern = new RegExp(
        `(#{2,}\\s*${this._escapeRegex(sectionName)}[\\s\\S]*?)(?=\\n#{2,}\\s|$)`,
        'i'
    );
    
    const match = docContent.match(sectionPattern);
    if (match) {
        // 截取前1500字符，避免内容过长
        const content = match[0];
        if (content.length > 1500) {
            return content.substring(0, 1500) + '...\n*(内容截断，如需完整章节请查阅对应文档)*';
        }
        return content;
    }
    
    // 如果精确匹配失败，尝试模糊匹配
    const similarSection = this._findSimilarSection(docContent, sectionName);
    
    // 🎯 修复：确保总是返回字符串
    return similarSection || '';
  }

  /**
   * 🎯 查找相似章节（模糊匹配）
   */
  _findSimilarSection(docContent, sectionName) {
    // 提取所有章节标题
    const sectionRegex = /#{2,}\s+([^\n]+)/g;
    const sections = [];
    let match;
    
    while ((match = sectionRegex.exec(docContent)) !== null) {
      sections.push({
        title: match[1],
        index: match.index
      });
    }
    
    // 找到最相似的章节
    let bestMatch = null;
    let bestScore = 0;
    
    sections.forEach(section => {
      const score = this._calculateSimilarity(section.title, sectionName);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = section;
      }
    });
    
    // 如果相似度足够高，提取该章节
    if (bestMatch && bestScore > 0.6) {
      const startIndex = bestMatch.index;
      let endIndex = docContent.length;
      
      // 找到下一个章节的开始
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].index > startIndex) {
          endIndex = sections[i].index;
          break;
        }
      }
      
      const sectionContent = docContent.substring(startIndex, endIndex);
      if (sectionContent.length > 1500) {
        return sectionContent.substring(0, 1500) + '...';
      }
      return sectionContent;
    }
    
    // 🎯 修复：返回空字符串而不是null
    return '';  // 修改这里
  }

  /**
   * 🎯 计算字符串相似度
   */
  _calculateSimilarity(str1, str2) {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1;
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    
    // 计算公共字符数量
    const commonChars = this._countCommonChars(s1, s2);
    return commonChars / Math.max(s1.length, s2.length);
  }

  /**
   * 🎯 计算公共字符数量
   */
  _countCommonChars(str1, str2) {
    const chars1 = new Set(str1);
    const chars2 = new Set(str2);
    let count = 0;
    
    chars1.forEach(char => {
      if (chars2.has(char)) count++;
    });
    
    return count;
  }

  /**
   * 🎯 转义正则表达式特殊字符
   */
  _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 🎯 降级内容构建（当增强匹配失败时使用）
   */
  _buildFallbackContent(skillData, userQuery) {
    // 使用原有的方法
    let fullContent = '';
    
    // 1. 提取主文档的关键信息（原有方法）
    const mainContent = this._extractPythonKeyInformation(skillData.content, userQuery);
    fullContent += mainContent;
    
    // 2. 智能匹配相关参考文件（原有方法）
    const relevantReferences = this._findRelevantPythonReferences(userQuery);
    
    if (relevantReferences.length > 0) {
      fullContent += `**📚 相关参考指南**:\n`;
      
      for (const refFile of relevantReferences.slice(0, 2)) {
        const refContent = skillData.resources?.references?.[refFile];
        if (refContent) {
          const summary = this._extractReferenceSummary(refContent, refFile);
          fullContent += `• **${refFile}**: ${summary}\n`;
        }
      }
      
      fullContent += `\n💡 **提示**: 执行相关任务时请严格参考这些指南中的代码模板和工作流。\n`;
    }
    
    // 3. 添加Python沙盒专用提醒（原有内容）
    fullContent += `\n**🚨 输出规范**:\n`;
    fullContent += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    fullContent += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    fullContent += `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
    
    return fullContent;
  }

  // ==================== 原有方法保持不变 ====================
  
  /**
   * 🚀 crawl4ai 专用上下文构建（保持不变）
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
   * 🎯 推荐crawl4ai模式（保持不变）
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
   * 提取crawl4ai关键信息（保持不变）
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
   * 提取Python关键信息（保持不变）
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
   * 🎯 查找相关的Python参考文件（保持不变）
   */
  _findRelevantPythonReferences(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const matchedReferences = new Set();
    
    console.log('🔍 [参考文件匹配] 查询:', queryLower);
    
    // 基于关键词匹配参考文件
    for (const [keyword, referenceFile] of Object.entries(this.pythonReferenceMap)) {
      if (queryLower.includes(keyword)) {
        console.log(`✅ 匹配关键词 "${keyword}" -> ${referenceFile}`);
        matchedReferences.add(referenceFile);
      }
    }
    
    console.log('📚 匹配到的参考文件:', Array.from(matchedReferences));
    return Array.from(matchedReferences);
  }

  /**
   * 从参考文件内容提取摘要（保持不变）
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
   * 标准技能上下文构建（用于非复杂工具，保持不变）
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
   * 标准增强提示词构建（保持不变）
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
   * 提取关键提示（保持不变）
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