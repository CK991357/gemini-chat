// src/tool-spec-system/skill-manager.js
import { getSkillsRegistry } from './generated-skills.js';
import { knowledgeFederation } from './skill-loader.js';

class EnhancedSkillManager {
  constructor(synonyms) {
    this.skills = getSkillsRegistry();
    this.synonymMap = synonyms;
    
    // 🎯 联邦知识库集成
    this.knowledgeFederation = knowledgeFederation;
    this.isFederationReady = false;
    
    // 🚀 新增：Agent模式专用缓存系统（与普通模式隔离）
    this.agentCache = new Map();
    this.agentInjectionHistory = new Map();
    
    // 🚀 工具关键词映射系统
    this.toolKeywordMapping = {
      // 爬虫类工具
      'crawl4ai': {
        keywords: [
          '抓取', '爬取', '提取', '网页', '网站', '网络', '数据抓取', '网络爬虫',
          'scrape', 'crawl', 'extract', 'web', 'website', 'html', '数据采集'
        ],
        modes: {
          'extract': ['结构化', 'schema', '提取数据', '数据提取', 'structured data'],
          'scrape': ['单个网页', '单页面', 'single page', '抓取网页'],
          'deep_crawl': ['深度爬取', '整站爬取', '网站地图', 'site map', '深度采集'],
          'batch_crawl': ['批量', '多个url', '列表', 'list', 'batch'],
          'screenshot': ['截图', '截屏', 'screenshot', 'capture'],
          'pdf_export': ['pdf', '导出pdf', 'pdf导出', 'export pdf']
        }
      },
      
      // Python沙盒
      'python_sandbox': {
        keywords: [
          'python', '代码', '编程', '脚本', '执行', '运行',
          '数据分析', '数据处理', '可视化', '图表', '画图',
          '机器学习', '模型训练', '预测', 'ai', '人工智能',
          '数学', '计算', '公式', '统计', '数学计算',
          '文档处理', 'word', 'excel', 'pdf', '报告生成'
        ],
        libraries: {
          'pandas': ['数据处理', '数据分析', '表格', 'excel', 'csv', '数据清洗'],
          'matplotlib': ['可视化', '图表', '画图', 'plot', 'chart', '条形图', '折线图'],
          'seaborn': ['统计可视化', '热力图', '分布图', '统计图表'],
          'scikit-learn': ['机器学习', '模型', '训练', '预测', '分类', '回归'],
          'sympy': ['数学', '公式', '符号计算', '微积分', '代数'],
          'python-docx': ['word', '文档', '报告', 'docx'],
          'reportlab': ['pdf生成', 'pdf报告', 'pdf导出'],
          'networkx': ['图分析', '网络分析', '关系图', '拓扑']
        }
      },
      
      // 网络搜索
      'tavily_search': {
        keywords: [
          '搜索', '查询', '查找', '信息', '实时', '最新',
          'search', 'query', 'find', 'information', 'news'
        ]
      },
      
      // 图像分析
      'glm4v_analyze_image': {
        keywords: [
          '图片', '图像', '照片', '分析图片', '识别图片',
          'image', 'photo', 'picture', 'analyze image', 'recognize'
        ]
      },
      
      // 国际象棋
      'stockfish_analyzer': {
        keywords: [
          '国际象棋', '象棋', '棋局', '棋盘', '分析棋局', '最佳走法',
          'chess', 'fen', '棋谱', '棋局分析', 'best move'
        ],
        modes: {
          'get_best_move': ['最佳走法', '下一步', '建议走法'],
          'get_top_moves': ['多个走法', '候选走法', 'top moves'],
          'evaluate_position': ['局面评估', '分数', '优势', '劣势']
        }
      },
      
      // Firecrawl
      'firecrawl': {
        keywords: [
          'firecrawl', '网页抓取', '网站爬取', '网络爬虫', 'firecrawl'
        ],
        modes: {
          'scrape': ['抓取单个', '单页面'],
          'search': ['查询网站'],
          'crawl': ['爬取整站', '网站爬虫'],
          'extract': ['提取结构化', '数据提取']
        }
      }
    };
    
    // 🚀 Python沙盒能力矩阵
    this.pythonSandboxCapabilities = {
      data_analysis: {
        libraries: ['pandas', 'numpy', 'scipy', 'pyarrow', 'polars-lts-cpu'],
        tasks: ['数据清洗', '数据转换', '统计分析', '数据聚合', '时间序列分析']
      },
      visualization: {
        libraries: ['matplotlib', 'seaborn'],
        tasks: ['图表制作', '数据可视化', '统计图表', '画图', '绘图']
      },
      machine_learning: {
        libraries: ['scikit-learn', 'xgboost', 'lightgbm', 'statsmodels'],
        tasks: ['分类', '回归', '聚类', '预测', '模型评估', '特征工程', '机器学习']
      },
      document_processing: {
        libraries: ['python-docx', 'python-pptx', 'reportlab', 'openpyxl'],
        tasks: ['Word文档', 'Excel文件', 'PDF生成', 'PPT制作', '报告生成']
      },
      mathematical_computing: {
        libraries: ['sympy', 'scipy', 'numpy'],
        tasks: ['符号计算', '数值计算', '微积分', '线性代数', '优化问题', '数学']
      },
      web_scraping: {
        libraries: ['beautifulsoup4', 'lxml'],
        tasks: ['网页解析', 'HTML处理', '数据提取', '网页抓取']
      },
      advanced_statistics: {
        libraries: ['statsmodels', 'scipy', 'numpy'],
        tasks: ['统计分析', '假设检验', '回归分析', '时间序列', '统计']
      },
      optimization: {
        libraries: ['scipy', 'numpy'],
        tasks: ['优化', '线性规划', '非线性优化', '最优化']
      }
    };
    
    // 🎯 自动初始化联邦知识库
    this.initializeFederation().then(() => {
      this.isFederationReady = true;
      console.log(`🎯 [联邦知识] 系统已就绪，可用技能: ${this.skills.size} 个`);
    }).catch(err => {
      console.warn(`🎯 [联邦知识] 初始化失败，将使用基础模式:`, err);
    });
    
    console.log(`🎯 [运行时] 技能系统已就绪，可用技能: ${this.skills.size} 个`);
  }

  /**
   * 🎯 初始化联邦知识库
   */
  async initializeFederation() {
    if (this.knowledgeFederation && typeof this.knowledgeFederation.initializeFromRegistry === 'function') {
      await this.knowledgeFederation.initializeFromRegistry();
      console.log(`🎯 [联邦知识] 初始化完成，知识库大小: ${this.knowledgeFederation.knowledgeBase?.size || 0}`);
    } else {
      console.warn(`🎯 [联邦知识] 知识库模块不可用`);
    }
  }

  /**
   * 🎯 增强的技能匹配算法（集成关键词映射）
   */
  findRelevantSkills(userQuery, context = {}) {
    const query = userQuery.toLowerCase().trim();
    if (!query || query.length < 2) {
      return [];
    }
    
    console.log(`🔍 [增强匹配] 查询: "${userQuery.substring(0, 50)}..."`, {
      会话ID: context.sessionId || '无',
      可用工具数: context.availableTools?.length || 0,
      模式: context.mode || 'normal'
    });

    const matches = [];
    const expandedQuery = this.expandQuery(query);
    
    // 🎯 获取可用工具过滤条件
    const availableTools = context.availableTools || [];
    const shouldFilterByAvailableTools = availableTools.length > 0;
    
    for (const [skillName, skill] of this.skills) {
      const toolName = skill.metadata.tool_name;
      
      // 🎯 如果指定了可用工具，进行过滤
      if (shouldFilterByAvailableTools && !availableTools.includes(toolName)) {
        continue;
      }
      
      // 🎯 使用增强版相关性计算
      const relevanceScore = this.calculateEnhancedRelevanceScoreWithKeywords(expandedQuery, skill, context);
      
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
      console.log(`📊 [增强匹配] 完成，找到 ${sortedMatches.length} 个相关技能:`);
      sortedMatches.forEach(match => {
        console.log(`   - ${match.name} (${match.toolName}): ${(match.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log(`🔍 [增强匹配] 未找到相关技能`);
    }
    
    return sortedMatches;
  }

  /**
   * 🎯 Agent模式专用：简化的技能匹配（避免复杂缓存逻辑）
   */
  findAgentSkills(userQuery, context = {}) {
    const query = userQuery.toLowerCase().trim();
    if (!query || query.length < 2) {
      return [];
    }
    
    console.log(`🤖 [Agent模式匹配] 查询: "${userQuery.substring(0, 50)}..."`);

    const matches = [];
    
    for (const [skillName, skill] of this.skills) {
      const toolName = skill.metadata.tool_name;
      
      // 🎯 Agent模式只进行基础匹配，不使用复杂缓存
      const relevanceScore = this.calculateBasicRelevanceScore(query, skill, context);
      
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
      console.log(`🤖 [Agent模式匹配] 完成，找到 ${sortedMatches.length} 个相关技能`);
    }
    
    return sortedMatches;
  }

  /**
   * 🚀 新增：集成关键词映射的增强相关性计算
   */
  calculateEnhancedRelevanceScoreWithKeywords(query, skill, context) {
    let score = this.calculateEnhancedRelevanceScore(query, skill, context);
    
    const toolName = skill.metadata.tool_name;
    const mapping = this.toolKeywordMapping[toolName];
    
    if (mapping) {
      const queryLower = query.toLowerCase();
      const matchedKeywords = new Set();
      
      // 🎯 基础关键词匹配增强
      mapping.keywords.forEach(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        if (queryLower.includes(lowerKeyword) && !matchedKeywords.has(lowerKeyword)) {
          matchedKeywords.add(lowerKeyword);
          score += 0.15;
        }
      });
      
      // 🎯 模式匹配增强
      if (mapping.modes) {
        Object.values(mapping.modes).forEach(modeKeywords => {
          modeKeywords.forEach(keyword => {
            const lowerKeyword = keyword.toLowerCase();
            if (queryLower.includes(lowerKeyword) && !matchedKeywords.has(lowerKeyword)) {
              matchedKeywords.add(lowerKeyword);
              score += 0.2;
            }
          });
        });
      }
      
      // 🎯 Python库匹配增强
      if (toolName === 'python_sandbox' && mapping.libraries) {
        Object.values(mapping.libraries).forEach(libKeywords => {
          libKeywords.forEach(keyword => {
            const lowerKeyword = keyword.toLowerCase();
            if (queryLower.includes(lowerKeyword) && !matchedKeywords.has(lowerKeyword)) {
              matchedKeywords.add(lowerKeyword);
              score += 0.1;
            }
          });
        });
      }
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * 🎯 Agent模式专用：基础相关性计算
   */
  calculateBasicRelevanceScore(query, skill, context) {
    let score = 0;
    const { metadata } = skill;
    
    // 1. 工具名精确匹配
    const cleanToolName = metadata.tool_name.replace(/^default_api:/, '');
    if (query.includes(cleanToolName)) {
      score += 0.6;
    }
    
    // 2. 描述关键词匹配
    const searchText = `${metadata.description || ''}`.toLowerCase();
    const keywords = this.extractKeywords(query);
    
    keywords.forEach(keyword => {
      if (searchText.includes(keyword)) {
        score += 0.1;
      }
    });
    
    // 3. 类别匹配
    if (context.category && metadata.category === context.category) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * 🎯 原有的增强相关性计算
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
    const coreVerbs = ['extract', 'scrape', 'crawl', '提取', '抓取', '爬取', '搜索', '查询'];

    keywords.forEach(keyword => {
      // 1. 基础匹配
      if (searchText.includes(keyword)) {
        score += 0.1;

        // 2. 标签加权
        if (tagsLower.some(tag => tag.includes(keyword))) {
          score += 0.15;
        }

        // 3. 关键动词加权
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
   * 🎯 扩展查询词
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
   * 🎯 同义词匹配得分
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
   * 🎯 提取关键词
   */
  extractKeywords(text) {
    const stopWords = ['请', '帮', '我', '怎么', '如何', '什么', '为什么', 'the', 'and', 'for', '从', '的', '提取', '获取'];
    
    // 预处理：移除 URL
    const textWithoutUrls = text.replace(/https?:\/\/[^\s]+/g, '');
    
    // 预处理：将非字母数字字符替换为空格
    const cleanText = textWithoutUrls.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ');

    return cleanText.split(/\s+/)
        .filter(k => {
            if (typeof k !== 'string') return false;
            if (k.length <= 1) return false;
            if (stopWords.includes(k)) return false;
            return true;
        })
        .map(k => k.toLowerCase());
  }

  /**
   * 🎯 【核心修复】Agent模式专用：生成工具知识（不涉及缓存系统）
   */
  async generateAgentSkillKnowledge(skill, userQuery = '', context = {}) {
    const { metadata } = skill;
    const toolName = metadata.tool_name;
    
    console.log(`🤖 [Agent模式知识] 为 ${toolName} 生成工具知识`);
    
    // 🎯 Agent模式使用简化知识结构
    const knowledge = {
      toolName: toolName,
      name: metadata.name,
      description: metadata.description,
      category: metadata.category,
      // 🎯 只包含Agent模式必需的核心信息
      coreInfo: this.extractAgentCoreInfo(skill, userQuery),
      timestamp: Date.now()
    };
    
    return knowledge;
  }

  /**
   * 🎯 Agent模式专用：提取核心信息
   */
  extractAgentCoreInfo(skill, userQuery) {
    const { metadata, content } = skill;
    const toolName = metadata.tool_name;
    
    let coreInfo = `工具: ${metadata.name} (${toolName})\n`;
    coreInfo += `功能: ${metadata.description}\n\n`;
    
    // 🎯 根据不同工具类型提供特定信息
    if (toolName === 'crawl4ai') {
      coreInfo += this.extractCrawl4AIAgentInfo(content, userQuery);
    } else if (toolName === 'python_sandbox') {
      coreInfo += this.extractPythonSandboxAgentInfo(content, userQuery);
    } else if (toolName === 'tavily_search') {
      coreInfo += "使用方式: 搜索查询\n参数格式: {\"query\": \"搜索内容\"}\n";
    } else if (toolName === 'firecrawl') {
      coreInfo += "使用方式: 网页抓取\n参数格式: {\"url\": \"网页地址\"}\n";
    }
    
    return coreInfo;
  }

  /**
   * 🎯 提取crawl4ai的Agent模式信息
   */
  extractCrawl4AIAgentInfo(content, userQuery) {
    let info = "可用模式:\n";
    
    // 提取模式信息
    const modes = ['extract', 'scrape', 'deep_crawl', 'batch_crawl'];
    modes.forEach(mode => {
      const modePattern = new RegExp(`##.*?${mode}.*?模式[\\s\\S]*?(?=\\n##|$)`, 'i');
      const match = content.match(modePattern);
      if (match) {
        const firstLine = match[0].split('\n')[0];
        info += `- ${firstLine.replace('##', '').trim()}\n`;
      }
    });
    
    info += "\n参数格式: {\"url\": \"网页地址\", \"mode\": \"模式名称\", \"parameters\": {...}}\n";
    return info;
  }

  /**
   * 🎯 提取python_sandbox的Agent模式信息
   */
  extractPythonSandboxAgentInfo(content, userQuery) {
    let info = "核心功能:\n";
    
    // 根据查询判断需要的功能
    const queryLower = userQuery.toLowerCase();
    
    if (queryLower.includes('图表') || queryLower.includes('可视化') || queryLower.includes('画图')) {
      info += "- 数据可视化 (matplotlib/seaborn)\n";
      info += "- 图表类型: 折线图、柱状图、饼图、散点图等\n";
    }
    
    if (queryLower.includes('数据') || queryLower.includes('分析') || queryLower.includes('处理')) {
      info += "- 数据分析 (pandas)\n";
      info += "- 数据清洗、转换、聚合\n";
    }
    
    if (queryLower.includes('数学') || queryLower.includes('计算') || queryLower.includes('公式')) {
      info += "- 数学计算 (sympy)\n";
      info += "- 符号计算、方程求解\n";
    }
    
    info += "\n参数格式: {\"code\": \"Python代码字符串\"}\n";
    info += "注意: 图表输出使用 plt.show()\n";
    
    return info;
  }

  /**
   * 🎯 【普通模式专用】智能生成单个技能的注入内容
   */
  async generateSkillInjection(skill, userQuery = '', context = {}) {
    const { metadata, content } = skill;
    const toolName = metadata.tool_name;
    
    // 🚀 特殊处理：Python沙盒使用增强注入
    if (toolName === 'python_sandbox') {
      return await this.generateEnhancedPythonInjection(skill, userQuery, context);
    }
    
    console.log(`🎯 [普通模式注入] 开始为 ${toolName} 生成注入内容`);

    // 🎯 检查Agent模式标识，如果是Agent模式则使用简化的知识
    if (context.isAgentMode) {
      console.log(`🎯 [普通模式注入] 检测到Agent模式，使用简化知识`);
      return this.extractAgentCoreInfo(skill, userQuery);
    }

    // 🎯 基础注入内容生成
    console.log(`🎯 [普通模式注入] 为 ${toolName} 使用基础注入模式`);
    const basicContent = this.generateBasicInjection(skill, userQuery);

    return basicContent;
  }

  /**
   * 🎯 基础注入内容生成
   */
  generateBasicInjection(skill, userQuery = '') {
    const { metadata, content } = skill;
    
    let injectionContent = `## 🛠️ 工具指南: ${metadata.name} (${metadata.tool_name})\n\n`;
    injectionContent += `**核心功能**: ${metadata.description}\n\n`;
    
    // 智能章节提取逻辑
    const sectionKeywords = {
      'extract': ['结构化数据提取 (`extract`)', 'Schema Definition 结构说明'],
      'scrape': ['抓取单个网页 (`scrape`)'],
      'deep_crawl': ['深度网站爬取 (`deep_crawl`)'],
      'batch': ['批量 URL 处理 (`batch_crawl`)'],
      'screenshot': ['截图捕获 (`screenshot`)'],
      'pdf': ['PDF 导出 (`pdf_export`)']
    };
    
    // 根据用户查询找到相关的关键词
    let relevantSectionTitle = null;
    const queryLower = userQuery.toLowerCase();
    
    for (const keyword in sectionKeywords) {
      if (queryLower.includes(keyword)) {
        relevantSectionTitle = sectionKeywords[keyword];
        break;
      }
    }
    
    // 如果找到了相关章节，提取其完整内容
    if (relevantSectionTitle) {
      injectionContent += `### 📖 相关操作指南 (已为您提取)\n\n`;
      let sectionFound = false;
      
      relevantSectionTitle.forEach(title => {
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

    // 添加通用调用结构和错误示例
    injectionContent += `### 🚨 【强制遵守】通用调用结构与常见错误\n\n`;
    
    const generalStructureRegex = /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i;
    const generalStructureMatch = content.match(generalStructureRegex);
    if (generalStructureMatch) {
      injectionContent += generalStructureMatch[0] + '\n\n';
    }

    const commonErrorsRegex = /### ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i;
    const commonErrorsMatch = content.match(commonErrorsRegex);
    if (commonErrorsMatch) {
      injectionContent += commonErrorsMatch[0] + '\n\n';
    }

    injectionContent += `请严格遵循上述指南和示例来使用 **${metadata.tool_name}** 工具。`;
    
    return injectionContent;
  }

  /**
   * 🚀 新增：根据查询推荐Python库
   */
  suggestPythonLibrariesForQuery(query) {
    const queryLower = query.toLowerCase();
    const suggestions = [];
    
    for (const [category, info] of Object.entries(this.pythonSandboxCapabilities)) {
      const hasRelatedTask = info.tasks.some(task => 
        queryLower.includes(task.toLowerCase())
      );
      
      if (hasRelatedTask) {
        suggestions.push({
          category: category,
          libraries: info.libraries,
          tasks: info.tasks.filter(task => queryLower.includes(task.toLowerCase())),
          reason: `查询涉及${info.tasks.filter(task => queryLower.includes(task.toLowerCase())).join('、')}等任务`
        });
      }
    }
    
    return suggestions;
  }

  /**
   * 🚀 新增：生成Python沙盒的增强注入内容
   */
  async generateEnhancedPythonInjection(skill, userQuery = '', context = {}) {
    const { metadata, content } = skill;
    
    // 🎯 检查Agent模式标识
    if (context.isAgentMode) {
      return this.extractPythonSandboxAgentInfo(content, userQuery);
    }
    
    // 基础注入内容
    let injectionContent = this.generateBasicInjection(skill, userQuery);
    
    // 🎯 添加库推荐
    const librarySuggestions = this.suggestPythonLibrariesForQuery(userQuery);
    
    if (librarySuggestions.length > 0) {
      const librarySection = `\n\n## 📚 推荐使用的Python库\n`;
      let libraryText = librarySection;
      
      librarySuggestions.forEach(suggestion => {
        libraryText += `\n### ${suggestion.category} (${suggestion.libraries.length}个库)\n`;
        libraryText += `**适用任务**: ${suggestion.tasks.join('、')}\n`;
        libraryText += `**推荐库**: ${suggestion.libraries.join(', ')}\n`;
        
        // 添加示例导入语句
        libraryText += `**示例导入**:\n\`\`\`python\n`;
        suggestion.libraries.slice(0, 3).forEach(lib => {
          const importMap = {
            'pandas': 'import pandas as pd',
            'numpy': 'import numpy as np',
            'scipy': 'import scipy',
            'pyarrow': 'import pyarrow',
            'polars-lts-cpu': 'import polars as pl',
            'matplotlib': 'import matplotlib.pyplot as plt',
            'seaborn': 'import seaborn as sns',
            'scikit-learn': 'from sklearn import preprocessing, model_selection, metrics',
            'xgboost': 'import xgboost as xgb',
            'lightgbm': 'import lightgbm as lgb',
            'statsmodels': 'import statsmodels.api as sm',
            'sympy': 'import sympy as sp',
            'python-docx': 'import docx',
            'python-pptx': 'from pptx import Presentation',
            'reportlab': 'from reportlab.lib.pagesizes import letter',
            'openpyxl': 'import openpyxl',
            'networkx': 'import networkx as nx',
            'beautifulsoup4': 'from bs4 import BeautifulSoup',
            'lxml': 'import lxml.etree as ET',
            'pyarrow': 'import pyarrow as pa'
          };
          
          const importStatement = importMap[lib] || `import ${lib}`;
          libraryText += `${importStatement}\n`;
        });
        libraryText += `\`\`\`\n`;
      });
      
      // 将库推荐插入到合适位置
      const structureIndex = injectionContent.indexOf('## 🎯 【至关重要】通用调用结构');
      if (structureIndex !== -1) {
        injectionContent = injectionContent.substring(0, structureIndex) + 
                          libraryText + 
                          injectionContent.substring(structureIndex);
      } else {
        injectionContent += libraryText;
      }
    }
    
    return injectionContent;
  }

  /**
   * 🎯 使用联邦知识库生成注入内容
   */
  generateFederatedInjection(toolName, userQuery, metadata) {
    if (!this.knowledgeFederation || !this.isFederationReady) {
      console.warn(`🎯 [联邦注入] 知识库未就绪，无法为 ${toolName} 生成增强内容`);
      return null;
    }
    
    // 🎯 构建上下文
    const context = {
      userQuery: userQuery,
      toolCallHistory: [],
      mode: 'standard'
    };
    
    // 🎯 推断相关章节
    const relevantSections = this.inferRelevantSections(userQuery);
    
    // 🎯 从联邦知识库获取内容
    const knowledgePackage = this.knowledgeFederation.getFederatedKnowledge(
      toolName, 
      relevantSections
    );
    
    if (!knowledgePackage) {
      console.warn(`🎯 [联邦注入] 知识库中未找到 ${toolName} 的内容`);
      return null;
    }
    
    // 🎯 构建增强的注入内容
    let injectionContent = `## 🛠️ 增强工具指南: ${metadata.name} (${toolName})\n\n`;
    injectionContent += `**核心功能**: ${metadata.description}\n\n`;
    
    // 添加联邦知识库提供的内容
    injectionContent += `### 📚 智能提取的相关指导\n`;
    injectionContent += knowledgePackage;
    
    // 添加通用的调用结构和错误示例
    injectionContent += `\n\n### 🚨 【强制遵守】通用调用结构\n`;
    
    // 从原始内容中提取通用结构
    const generalStructureRegex = /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i;
    const generalStructureMatch = metadata.content?.match(generalStructureRegex);
    if (generalStructureMatch) {
      injectionContent += generalStructureMatch[0] + '\n\n';
    } else {
      injectionContent += `请参考工具的通用调用结构，确保参数格式正确。\n\n`;
    }
    
    injectionContent += `请严格遵循上述指南和示例来使用 **${toolName}** 工具。`;
    
    console.log(`🎯 [联邦注入] 成功为 ${toolName} 生成增强内容 (${knowledgePackage.length} 字符)`);
    return injectionContent;
  }

  /**
   * 🎯 [增强版] 智能推断相关章节
   */
  inferRelevantSections(userQuery) {
    const sections = new Set();
    const queryLower = userQuery.toLowerCase();
    
    console.log(`🎯 [章节推断优化] 开始分析查询: "${userQuery.substring(0, 50)}..."`);
    
    // 数据分析与清洗
    if (this.containsKeywords(queryLower,
        ['分析', '数据处理', '清洗', '清洗数据', '清理数据', 'data analysis', 'data clean', '数据清洗'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('pandas_cheatsheet');
        sections.add('数据清洗与分析');
    }
    
    // 表格与结构化数据处理
    if (this.containsKeywords(queryLower,
        ['表格', '表', '结构化', '表格数据', 'table', 'excel', 'csv', '趋势表', '汇总表'])) {
        sections.add('pandas_cheatsheet');
        sections.add('ETL管道模式');
        sections.add('数据清洗与分析');
    }
    
    // 趋势分析与预测
    if (this.containsKeywords(queryLower,
        ['趋势', '预测', '增长', '增速', '变化趋势', '趋势分析', '增长预测'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('pandas_cheatsheet');
        sections.add('数据可视化');
    }
    
    // 投资与金融分析
    if (this.containsKeywords(queryLower,
        ['资本支出', '资本', '支出', '投资', 'cpex', 'capex', '投入', '资金', '财务'])) {
        sections.add('pandas_cheatsheet');
        sections.add('数据分析与可视化');
        sections.add('自动化报告生成');
    }
    
    // 数据相关查询
    if (this.containsKeywords(queryLower, ['数据', 'data', 'pandas'])) {
        if (!sections.has('pandas_cheatsheet')) {
            sections.add('pandas_cheatsheet');
        }
        if (!sections.has('数据清洗与分析')) {
            sections.add('数据清洗与分析');
        }
    }
    
    // 可视化相关查询
    if (this.containsKeywords(queryLower, ['可视化', 'visual', 'plot', 'chart', '图表', '绘图', 'matplotlib'])) {
        sections.add('matplotlib_cookbook');
        sections.add('数据可视化');
    }
    
    // 文本处理相关查询
    if (this.containsKeywords(queryLower, ['文本', 'text', '字符串', '提取', '解析'])) {
        sections.add('text_analysis_cookbook.md');
        sections.add('文本分析与结构化提取');
    }
    
    // 数学/计算相关查询
    if (this.containsKeywords(queryLower, ['数学', '公式', '计算', '证明', 'sympy', '科学'])) {
        sections.add('公式证明工作流');
        sections.add('sympy_cookbook');
        sections.add('科学计算与优化');
    }
    
    // 机器学习相关查询
    if (this.containsKeywords(queryLower, ['机器学习', 'ml', '模型', '训练', '预测', '分类'])) {
        sections.add('机器学习');
        sections.add('ml_workflow');
    }
    
    // 深度研究模式特殊处理
    const depthKeywords = ['深度研究', '深度分析', '深度报告', '深入研究', '深度调研'];
    if (depthKeywords.some(kw => queryLower.includes(kw.toLowerCase()))) {
        console.log(`🎯 [章节推断] 检测到深度研究模式，添加核心参考文件`);
        
        sections.add('text_analysis_cookbook.md');
        sections.add('pandas_cheatsheet');
        sections.add('数据清洗与分析');
        
        if (this.containsKeywords(queryLower, ['投资', '分析', '报告', '研究'])) {
            sections.add('自动化报告生成');
        }
    }
    
    const result = Array.from(sections);
    
    // 优化排序：参考文件优先
    result.sort((a, b) => {
        const isRefA = a.includes('.md');
        const isRefB = b.includes('.md');
        
        if (isRefA && !isRefB) return -1;
        if (!isRefA && isRefB) return 1;
        return 0;
    });
    
    console.log(`🎯 [章节推断优化] 完成，推断 ${result.length} 个章节`);
    
    return result;
  }

  /**
   * 🎯 辅助方法：检查是否包含关键词
   */
  containsKeywords(text, keywords) {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  // 辅助函数，用于安全地创建正则表达式
  escapeRegex(string) {
      return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  /**
   * 🎯 提取相关内容片段
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
   * 🎯 [升级版] 多技能注入内容生成
   */
  async generateMultiSkillInjection(skills, userQuery) {
    if (skills.length === 0) return '';
    
    // 🎯 特殊处理：对 python_sandbox 使用联邦知识库
    const primarySkill = skills[0];
    const toolName = primarySkill.toolName;
    
    if (toolName === 'python_sandbox' && this.isFederationReady) {
      try {
        const federatedContent = this.generateFederatedInjection(toolName, userQuery, primarySkill.skill.metadata);
        if (federatedContent) {
          return federatedContent;
        }
      } catch (error) {
        console.warn(`🎯 [多技能注入] 联邦知识库调用失败，回退到基础模式:`, error);
      }
    }
    
    // 如果只有一个技能，或者最重要的技能是 crawl4ai，则使用单技能的详细注入
    if (skills.length === 1 || toolName === 'crawl4ai') {
      return await this.generateSkillInjection(primarySkill.skill, userQuery, {});
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
   * 🎯 提取关键指令
   */
  extractKeyInstructions(content) {
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
   * 🎯 提取调用格式
   */
  extractCallingFormat(content) {
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

  /**
   * 🎯 保持向后兼容的方法
   */
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
      federationReady: this.isFederationReady,
      federationSize: this.knowledgeFederation?.knowledgeBase?.size || 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 🎯 等待技能管理器就绪
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

// 🎯 创建异步工厂函数来初始化
async function getBaseSkillManager() {
  try {
    const response = await fetch('./synonyms.json');
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

// 🎯 导出异步创建的单例实例
export const skillManagerPromise = getBaseSkillManager();
export let skillManager;

// 🎯 异步填充 skillManager 实例
skillManagerPromise.then(instance => {
  skillManager = instance;
});

// 导出函数以便外部模块可以获取基础技能管理器
export { EnhancedSkillManager, getBaseSkillManager };
