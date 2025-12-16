// src/tool-spec-system/skill-manager.js
import { getSkillsRegistry } from './generated-skills.js';
import { knowledgeFederation } from './skill-loader.js';
// 🎯 新增：导入缓存压缩模块
import { skillCacheCompressor } from './skill-cache-compressor.js'; // 假设这个文件放在同级目录

class EnhancedSkillManager {
  constructor(synonyms) {
    this.skills = getSkillsRegistry();
    this.synonymMap = synonyms;
    
    // 🎯 新增：联邦知识库集成
    this.knowledgeFederation = knowledgeFederation;
    this.isFederationReady = false;
    
    // 🎯 新增：缓存压缩系统集成
    this.cacheCompressor = skillCacheCompressor;
    
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
   * 🎯 新增：初始化联邦知识库
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
   * 增强的技能匹配算法
   */
  findRelevantSkills(userQuery, context = {}) {
    const query = userQuery.toLowerCase().trim();
    if (!query || query.length < 2) {
      return [];
    }
    
    console.log(`🔍 [技能匹配] 查询: "${userQuery}"`, {
        会话ID: context.sessionId || '无',
        可用工具数: context.availableTools?.length || 0
    });

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
   * 🎯 [增强版] 智能生成单个技能的注入内容（支持缓存和压缩）
   * 为普通模式提供与Agent模式相同的知识检索能力
   */
  async generateSkillInjection(skill, userQuery = '', context = {}) {
    const { metadata, content } = skill;
    const toolName = metadata.tool_name;
    
    // 🎯 获取会话ID
    const sessionId = context.sessionId || 'default';
    
    console.log(`🎯 [普通模式注入] 开始为 ${toolName} 生成注入内容`);

    // 🎯 检查是否已经注入过（会话级跟踪）
    if (this.cacheCompressor.hasToolBeenInjected(sessionId, toolName)) {
      console.log(`🎯 [普通模式注入] ${toolName} 已在会话中注入过，使用引用模式`);
      return this._createReferenceModeContent(metadata, userQuery);
    }

    // 🎯 检查缓存
    const cacheKey = this.cacheCompressor._generateCacheKey(toolName, userQuery, context);
    const cachedContent = this.cacheCompressor.getFromCache(cacheKey);
    
    if (cachedContent) {
      console.log(`🎯 [普通模式注入] ${toolName} 缓存命中，使用缓存内容`);
      // 记录注入
      this.cacheCompressor.recordToolInjection(sessionId, toolName);
      return cachedContent;
    }

    // 🎯 特殊处理：对 python_sandbox 使用联邦知识库
    if (toolName === 'python_sandbox' && this.isFederationReady) {
      try {
        const federatedContent = await this._generateFederatedInjectionForNormalMode(toolName, userQuery, metadata, context);
        if (federatedContent) {
          // 压缩并缓存
          const compressedContent = await this.cacheCompressor.compressKnowledge(
            federatedContent,
            {
              level: 'smart',
              maxChars: 15000,
              userQuery: userQuery
            }
          );
          
          // 记录注入并缓存
          this.cacheCompressor.setToCache(cacheKey, compressedContent);
          this.cacheCompressor.recordToolInjection(sessionId, toolName);
          
          return compressedContent;
        }
      } catch (error) {
        console.warn(`🎯 [普通模式注入] 联邦知识库调用失败，回退到基础模式:`, error);
      }
    }

    // 🎯 基础注入内容生成（带压缩）
    console.log(`🎯 [普通模式注入] 为 ${toolName} 使用基础注入模式（带压缩）`);
    const basicContent = await this.generateBasicInjectionWithCompression(skill, userQuery, context);

    // 记录注入并缓存
    this.cacheCompressor.setToCache(cacheKey, basicContent);
    this.cacheCompressor.recordToolInjection(sessionId, toolName);

    return basicContent;
  }

  /**
   * 🎯 新增：带压缩的基础注入内容生成
   */
  async generateBasicInjectionWithCompression(skill, userQuery = '', context = {}) {
    const { metadata, content } = skill;
    
    // 构建知识包
    let knowledgePackage = `## 🛠️ 工具指南: ${metadata.name} (${metadata.tool_name})\n\n`;
    knowledgePackage += `**核心功能**: ${metadata.description}\n\n`;
    
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
      knowledgePackage += `### 📖 相关操作指南 (已为您提取)\n\n`;
      let sectionFound = false;
      
      relevantSectionTitle.forEach(title => {
        const regex = new RegExp(`##\\s+${this.escapeRegex(title)}[\\s\\S]*?(?=\\n##\\s|$)`, 'i');
        const match = content.match(regex);
        
        if (match) {
          knowledgePackage += match[0] + '\n\n';
          sectionFound = true;
        }
      });
      
      if (!sectionFound) {
        knowledgePackage += `*未找到与'${relevantSectionTitle.join(', ')}'直接相关的详细章节，请参考通用指南。*\n\n`;
      }
    }

    // 添加通用调用结构和错误示例
    knowledgePackage += `### 🚨 【强制遵守】通用调用结构与常见错误\n\n`;
    
    const generalStructureRegex = /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i;
    const generalStructureMatch = content.match(generalStructureRegex);
    if (generalStructureMatch) {
      knowledgePackage += generalStructureMatch[0] + '\n\n';
    }

    const commonErrorsRegex = /### ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i;
    const commonErrorsMatch = content.match(commonErrorsRegex);
    if (commonErrorsMatch) {
      knowledgePackage += commonErrorsMatch[0] + '\n\n';
    }

    knowledgePackage += `请严格遵循上述指南和示例来使用 **${metadata.tool_name}** 工具。`;
    
    // 🎯 应用智能压缩
    const compressedContent = await this.cacheCompressor.compressKnowledge(
      knowledgePackage,
      {
        level: 'smart',
        maxChars: 12000, // 稍小一些，为普通模式优化
        userQuery: userQuery
      }
    );
    
    return compressedContent;
  }

  /**
   * 🎯 新增：创建引用模式内容
   */
  _createReferenceModeContent(metadata, userQuery) {
    return `## 🛠️ 工具引用: ${metadata.name}\n\n` +
           `**功能**: ${metadata.description}\n\n` +
           `*该工具的操作指南已在之前步骤中提供，请参考已有指南使用。*\n\n` +
           `**当前任务提示**: 专注于当前查询"${userQuery.substring(0, 50)}..."的相关操作。`;
  }

  /**
   * 🎯 新增：为普通模式生成联邦知识注入
   */
  async _generateFederatedInjectionForNormalMode(toolName, userQuery, metadata, context) {
    if (!this.knowledgeFederation || !this.isFederationReady) {
      console.warn(`🎯 [普通模式联邦注入] 知识库未就绪，无法为 ${toolName} 生成增强内容`);
      return null;
    }
    
    // 🎯 构建上下文
    const fedContext = {
      userQuery: userQuery,
      toolCallHistory: [],
      mode: 'standard'
    };
    
    // 🎯 使用缓存压缩系统的章节推断
    const relevantSections = this.cacheCompressor.inferRelevantSections(userQuery, fedContext);
    
    // 🎯 从联邦知识库获取内容
    const knowledgePackage = this.knowledgeFederation.getFederatedKnowledge(
      toolName, 
      relevantSections
    );
    
    if (!knowledgePackage) {
      console.warn(`🎯 [普通模式联邦注入] 知识库中未找到 ${toolName} 的内容`);
      return null;
    }
    
    return knowledgePackage;
  }

  /**
   * 🎯 新增：使用联邦知识库生成注入内容
   */
  generateFederatedInjection(toolName, userQuery, metadata) {
    if (!this.knowledgeFederation || !this.isFederationReady) {
      console.warn(`🎯 [联邦注入] 知识库未就绪，无法为 ${toolName} 生成增强内容`);
      return null;
    }
    
    // 🎯 构建上下文，用于智能推断相关章节
    const context = {
      userQuery: userQuery,
      toolCallHistory: [], // 可以留空，或从全局状态获取
      mode: 'standard' // 普通模式
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
   * 针对深度研究模式优化，优先匹配参考文件
   */
  inferRelevantSections(userQuery) {
    const sections = new Set();
    const queryLower = userQuery.toLowerCase();
    
    console.log(`🎯 [章节推断优化] 开始分析查询: "${userQuery.substring(0, 50)}..."`);
    
    // ============================================================
    // 1. 深度研究模式专用匹配（最高优先级）
    // ============================================================
    
    // 🎯 数据分析与清洗（深度研究核心）
    if (this.containsKeywords(queryLower,
        ['分析', '数据处理', '清洗', '清洗数据', '清理数据', 'data analysis', 'data clean', '数据清洗'])) {
        
        // 深度研究优先使用参考文件
        sections.add('text_analysis_cookbook.md');  // 🆕 新增：深度研究首选
        sections.add('pandas_cheatsheet');         // 数据分析必备
        sections.add('数据清洗与分析');            // 保留基础章节
        
        console.log(`🎯 [章节推断] 深度研究数据分析需求，添加 text_analysis_cookbook.md`);
    }
    
    // 🎯 表格与结构化数据处理
    if (this.containsKeywords(queryLower,
        ['表格', '表', '结构化', '表格数据', 'table', 'excel', 'csv', '趋势表', '汇总表'])) {
        
        sections.add('pandas_cheatsheet');
        sections.add('ETL管道模式');
        sections.add('数据清洗与分析');
        
        console.log(`🎯 [章节推断] 表格数据处理需求，添加 pandas_cheatsheet 和 ETL管道模式`);
    }
    
    // 🎯 趋势分析与预测
    if (this.containsKeywords(queryLower,
        ['趋势', '预测', '增长', '增速', '变化趋势', '趋势分析', '增长预测'])) {
        
        sections.add('text_analysis_cookbook.md');
        sections.add('pandas_cheatsheet');
        sections.add('数据可视化');
        
        console.log(`🎯 [章节推断] 趋势分析需求，优先添加 text_analysis_cookbook.md`);
    }
    
    // 🎯 投资与金融分析
    if (this.containsKeywords(queryLower,
        ['资本支出', '资本', '支出', '投资', 'cpex', 'capex', '投入', '资金', '财务'])) {
        
        sections.add('pandas_cheatsheet');
        sections.add('数据分析与可视化');
        sections.add('自动化报告生成');  // 报告生成也相关
        
        console.log(`🎯 [章节推断] 投资分析需求，添加数据分析和报告生成章节`);
    }
    
    // ============================================================
    // 2. 保留原有逻辑（向后兼容）
    // ============================================================
    
    // 🎯 数据相关查询（原有逻辑）
    if (this.containsKeywords(queryLower, ['数据', 'data', 'pandas'])) {
        if (!sections.has('pandas_cheatsheet')) {
            sections.add('pandas_cheatsheet');
        }
        if (!sections.has('数据清洗与分析')) {
            sections.add('数据清洗与分析');
        }
    }
    
    // 🎯 可视化相关查询
    if (this.containsKeywords(queryLower, ['可视化', 'visual', 'plot', 'chart', '图表', '绘图', 'matplotlib'])) {
        sections.add('matplotlib_cookbook');
        sections.add('数据可视化');
    }
    
    // 🎯 文本处理相关查询
    if (this.containsKeywords(queryLower, ['文本', 'text', '字符串', '提取', '解析'])) {
        sections.add('text_analysis_cookbook.md');  // 🆕 确保添加
        sections.add('文本分析与结构化提取');
    }
    
    // 🎯 数学/计算相关查询
    if (this.containsKeywords(queryLower, ['数学', '公式', '计算', '证明', 'sympy', '科学'])) {
        sections.add('公式证明工作流');
        sections.add('sympy_cookbook');
        sections.add('科学计算与优化');
    }
    
    // 🎯 机器学习相关查询
    if (this.containsKeywords(queryLower, ['机器学习', 'ml', '模型', '训练', '预测', '分类'])) {
        sections.add('机器学习');
        sections.add('ml_workflow');
    }
    
    // ============================================================
    // 3. 深度研究模式特殊处理
    // ============================================================
    
    // 如果查询包含深度研究关键词，强制添加关键参考文件
    const depthKeywords = ['深度研究', '深度分析', '深度报告', '深入研究', '深度调研'];
    if (depthKeywords.some(kw => queryLower.includes(kw.toLowerCase()))) {
        console.log(`🎯 [章节推断] 检测到深度研究模式，添加核心参考文件`);
        
        sections.add('text_analysis_cookbook.md');  // 深度研究必备
        sections.add('pandas_cheatsheet');          // 数据处理必备
        sections.add('数据清洗与分析');             // 基础必备
        
        // 如果查询与投资相关，添加报告生成
        if (this.containsKeywords(queryLower, ['投资', '分析', '报告', '研究'])) {
            sections.add('自动化报告生成');
        }
    }
    
    // ============================================================
    // 4. 结果优化与去重
    // ============================================================
    
    const result = Array.from(sections);
    
    // 优化排序：参考文件优先，SKILL.md章节靠后
    result.sort((a, b) => {
        const isRefA = a.includes('.md');
        const isRefB = b.includes('.md');
        
        if (isRefA && !isRefB) return -1;
        if (!isRefA && isRefB) return 1;
        return 0;
    });
    
    console.log(`🎯 [章节推断优化] 完成，推断 ${result.length} 个章节:`, {
        原始查询: userQuery.substring(0, 100) + '...',
        推断章节: result,
        参考文件: result.filter(r => r.includes('.md')),
        SKILL章节: result.filter(r => !r.includes('.md'))
    });
    
    return result;
  }

  /**
   * 🎯 辅助方法：检查是否包含关键词
   */
  containsKeywords(text, keywords) {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }

  /**
   * 🎯 基础注入内容生成（保持原有逻辑）
   */
  generateBasicInjection(skill, userQuery = '') {
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
   * [升级版] 多技能注入内容生成
   * 对 crawl4ai 等复杂工具进行特殊处理，注入更详细的指南
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
      // 使用新的异步方法
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
      federationReady: this.isFederationReady,
      federationSize: this.knowledgeFederation?.knowledgeBase?.size || 0,
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
