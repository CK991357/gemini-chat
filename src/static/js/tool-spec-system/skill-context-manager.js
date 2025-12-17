// src/tool-spec-system/skill-context-manager.js
// ✅ 增强版本：精确的图表类型匹配 + 针对性的代码示例提取

import { skillManagerPromise } from './skill-manager.js';

class SkillContextManager {
  constructor() {
    this.skillManager = null;
    this.initialized = false;
    
    // 缓存压缩系统引用
    this.cacheCompressor = null;
    
    skillManagerPromise.then(skillManager => {
        this.cacheCompressor = skillManager.cacheCompressor;
        console.log('✅ SkillContextManager 已集成缓存压缩系统');
    });
    
    // 🚀 crawl4ai 专用关键词映射
    this.crawl4aiModeMap = {
      '提取': 'extract',
      '抓取': 'scrape', 
      '爬取': 'deep_crawl',
      '批量': 'batch_crawl',
      '截图': 'screenshot',
      'pdf': 'pdf_export'
    };
    
    // 🚀 Python沙盒参考文件映射（增强版）
    this.pythonReferenceMap = {
      // matplotlib 相关
      'matplotlib': 'matplotlib_cookbook.md',
      '可视化': 'matplotlib_cookbook.md',
      '图表': 'matplotlib_cookbook.md',
      '画图': 'matplotlib_cookbook.md',
      'chart': 'matplotlib_cookbook.md',
      'plot': 'matplotlib_cookbook.md',
      '图形': 'matplotlib_cookbook.md',
      '绘图': 'matplotlib_cookbook.md',
      
      // 具体图表类型 - 精确匹配
      '折线图': 'matplotlib_cookbook.md:折线图',
      '折线': 'matplotlib_cookbook.md:折线图',
      'line': 'matplotlib_cookbook.md:折线图',
      'line_chart': 'matplotlib_cookbook.md:折线图',
      
      '饼图': 'matplotlib_cookbook.md:饼图',
      'pie': 'matplotlib_cookbook.md:饼图',
      'pie_chart': 'matplotlib_cookbook.md:饼图',
      
      '条形图': 'matplotlib_cookbook.md:条形图',
      '柱状图': 'matplotlib_cookbook.md:条形图',
      'bar': 'matplotlib_cookbook.md:条形图',
      'bar_chart': 'matplotlib_cookbook.md:条形图',
      
      '散点图': 'matplotlib_cookbook.md:散点图',
      'scatter': 'matplotlib_cookbook.md:散点图',
      'scatter_plot': 'matplotlib_cookbook.md:散点图',
      
      '热力图': 'matplotlib_cookbook.md:热力图',
      'heatmap': 'matplotlib_cookbook.md:热力图',
      
      '直方图': 'matplotlib_cookbook.md:直方图',
      'histogram': 'matplotlib_cookbook.md:直方图',
      
      // pandas 相关
      'pandas': 'pandas_cheatsheet.md',
      '数据清洗': 'pandas_cheatsheet.md',
      '数据分析': 'pandas_cheatsheet.md',
      '数据处理': 'pandas_cheatsheet.md',
      '数据整理': 'pandas_cheatsheet.md',
      'dataframe': 'pandas_cheatsheet.md',
      'series': 'pandas_cheatsheet.md',
      
      // 报告生成
      '报告': 'report_generator_workflow.md',
      'word': 'report_generator_workflow.md',
      'excel': 'report_generator_workflow.md',
      'pdf': 'report_generator_workflow.md',
      'ppt': 'report_generator_workflow.md',
      '文档': 'report_generator_workflow.md',
      '自动化': 'report_generator_workflow.md',
      '周报': 'report_generator_workflow.md',
      'export': 'report_generator_workflow.md',
      
      // 机器学习
      '机器学习': 'ml_workflow.md',
      '模型': 'ml_workflow.md',
      '训练': 'ml_workbox.md',
      '分类': 'ml_workflow.md',
      '回归': 'ml_workflow.md',
      '预测': 'ml_workflow.md',
      '评估': 'ml_workflow.md',
      'xgboost': 'ml_workflow.md',
      'randomforest': 'ml_workflow.md',
      
      // 数学符号计算
      '数学': 'sympy_cookbook.md',
      '公式': 'sympy_cookbook.md',
      '符号': 'sympy_cookbook.md',
      '证明': 'sympy_cookbook.md',
      '方程': 'sympy_cookbook.md',
      '微积分': 'sympy_cookbook.md',
      '代数': 'sympy_cookbook.md',
      'solve': 'sympy_cookbook.md',
      'integral': 'sympy_cookbook.md',
      
      // 科学计算
      '科学计算': 'scipy_cookbook.md',
      '数值计算': 'scipy_cookbook.md',
      '统计': 'scipy_cookbook.md',
      '计算': 'scipy_cookbook.md',
      'optimize': 'scipy_cookbook.md',
      'integrate': 'scipy_cookbook.md'
    };
    
    // 🎯 图表类型与章节映射
    this.chartTypeToSection = {
      // 折线图相关章节
      '折线图': ['折线图示例', '折线图详细配置', '折线图与散点图组合'],
      'line': ['折线图示例', '折线图详细配置', '折线图与散点图组合'],
      'line_chart': ['折线图示例', '折线图详细配置', '折线图与散点图组合'],
      
      // 饼图相关章节
      '饼图': ['饼图示例', '环形图（甜甜圈图）', '饼图高级配置'],
      'pie': ['饼图示例', '环形图（甜甜圈图）', '饼图高级配置'],
      'pie_chart': ['饼图示例', '环形图（甜甜圈图）', '饼图高级配置'],
      
      // 条形图相关章节
      '条形图': ['条形图示例', '分组条形图', '堆叠条形图'],
      '柱状图': ['条形图示例', '分组条形图', '堆叠条形图'],
      'bar': ['条形图示例', '分组条形图', '堆叠条形图'],
      'bar_chart': ['条形图示例', '分组条形图', '堆叠条形图'],
      
      // 散点图相关章节
      '散点图': ['散点图示例', '气泡图', '散点图矩阵'],
      'scatter': ['散点图示例', '气泡图', '散点图矩阵'],
      'scatter_plot': ['散点图示例', '气泡图', '散点图矩阵'],
      
      // 热力图相关章节
      '热力图': ['热力图示例', '相关性热力图', '密度热力图'],
      'heatmap': ['热力图示例', '相关性热力图', '密度热力图'],
      
      // 直方图相关章节
      '直方图': ['直方图示例', '分布直方图', '累积分布直方图'],
      'histogram': ['直方图示例', '分布直方图', '累积分布直方图']
    };
    
    console.log('✅ SkillContextManager 已加载 - 增强的图表类型匹配系统');
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
      会话ID: context.sessionId || 'default'
    });

    // 合并上下文信息
    const skillContext = {
      ...context,
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
      ? await this._buildEnhancedPromptWithComplexTools(userQuery, relevantSkills, context)
      : await this._buildStandardEnhancedPrompt(userQuery, relevantSkills);
    
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
  async _buildEnhancedPromptWithComplexTools(userQuery, relevantSkills, context = {}) {
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
   * 🚀 增强的Python沙盒上下文构建 - 精确版本
   */
  async _buildEnhancedPythonSandboxContext(skill, userQuery, sessionId, context = {}) {
    try {
      const { skill: skillData, score, name, description } = skill;
      
      console.log(`🔍 [Python沙盒] 查询: "${userQuery.substring(0, 50)}..."`);
      console.log(`📦 [文档结构] 主文档: ${skillData.content.length}字符`);
      
      // 🎯 检查缓存
      const cachedContent = this.skillManager.cacheCompressor.getFromCache(
        'python_sandbox', 
        userQuery, 
        { sessionId, ...context }
      );
      
      let contextContent = `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
      contextContent += `**核心功能**: ${description}\n\n`;
      
      if (cachedContent) {
        contextContent += cachedContent;
        console.log(`🎯 [缓存命中] python_sandbox: ${cachedContent.length} 字符`);
        return contextContent;
      }
      
      // 🎯 查找相关参考文件
      const relevantReferences = this._findRelevantPythonReferencesEnhanced(userQuery);
      
      // 🎯 从合并内容中提取相关部分
      let enhancedContent = this._buildContentFromCombinedSource(skillData.content, userQuery, relevantReferences);
      
      // 🎯 验证提取结果
      console.log('🔍 [内容提取]', {
        内容长度: enhancedContent.length,
        参考文件匹配数: relevantReferences.length,
        是否包含代码块: enhancedContent.includes('```python'),
        代码块数量: (enhancedContent.match(/```python/g) || []).length
      });
      
      // 🎯 压缩内容
      let compressedContent = '';
      try {
        compressedContent = await this.skillManager.cacheCompressor.compressKnowledge(
          enhancedContent,
          {
            level: 'smart',
            maxChars: 12000,
            userQuery: userQuery,
            toolName: 'python_sandbox'
          }
        );
      } catch (compressError) {
        console.error(`🚨 [内容压缩失败]`, compressError);
        compressedContent = enhancedContent;
      }
      
      // 缓存结果
      this.skillManager.cacheCompressor.setToCache(
        'python_sandbox', 
        userQuery, 
        { sessionId, ...context }, 
        compressedContent
      );
      
      contextContent += compressedContent;
      return contextContent;
    } catch (error) {
      console.error(`🚨 [Python沙盒上下文构建失败]`, error);
      return this._buildFallbackContent(skill.skill, userQuery);
    }
  }

  /**
   * 🎯 增强的参考文件查找 - 支持图表类型精确匹配
   */
  _findRelevantPythonReferencesEnhanced(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const matchedReferences = new Set();
    
    console.log(`🔍 [增强匹配] 分析查询: "${userQuery.substring(0, 50)}..."`);
    
    // 🎯 第一步：提取查询中的图表类型
    const chartType = this._extractChartType(userQuery);
    console.log(`🎯 [图表类型识别] 识别到: ${chartType || '无'}`);
    
    // 🎯 第二步：基于图表类型进行精确匹配
    if (chartType) {
        // 优先匹配图表类型对应的参考文件
        matchedReferences.add('matplotlib_cookbook.md');
        
        // 根据图表类型添加其他可能相关的文件
        if (chartType.includes('数据') || chartType.includes('清洗') || chartType.includes('处理')) {
            matchedReferences.add('pandas_cheatsheet.md');
        }
    }
    
    // 🎯 第三步：关键词匹配（备用）
    if (matchedReferences.size === 0) {
        console.log(`📋 [无图表类型匹配] 使用关键词匹配`);
        for (const [keyword, referenceFile] of Object.entries(this.pythonReferenceMap)) {
            if (queryLower.includes(keyword)) {
                console.log(`✅ 匹配关键词 "${keyword}" -> ${referenceFile}`);
                matchedReferences.add(referenceFile.split(':')[0]); // 去掉章节部分
            }
        }
    }
    
    // 🎯 第四步：默认文件（如果没有任何匹配）
    if (matchedReferences.size === 0) {
        console.log(`📋 [无匹配] 使用默认参考文件`);
        matchedReferences.add('matplotlib_cookbook.md');
    }
    
    console.log('📚 最终匹配到的参考文件:', Array.from(matchedReferences));
    return Array.from(matchedReferences);
  }

  /**
   * 🎯 从查询中提取图表类型
   */
  _extractChartType(userQuery) {
    const queryLower = userQuery.toLowerCase();
    
    // 图表类型关键词映射
    const chartKeywords = {
      '折线图': ['折线图', '折线', 'line', 'line_chart', '折线图', '趋势图'],
      '饼图': ['饼图', 'pie', 'pie_chart', '扇形图', '占比图'],
      '条形图': ['条形图', '柱状图', 'bar', 'bar_chart', '柱形图'],
      '散点图': ['散点图', 'scatter', 'scatter_plot', '散点', '点图'],
      '热力图': ['热力图', 'heatmap', '热图'],
      '直方图': ['直方图', 'histogram', '分布图'],
      '箱线图': ['箱线图', 'box', 'box_plot', '箱型图'],
      '面积图': ['面积图', 'area', 'area_chart'],
      '雷达图': ['雷达图', 'radar', 'radar_chart', '蛛网图']
    };
    
    for (const [chartType, keywords] of Object.entries(chartKeywords)) {
      for (const keyword of keywords) {
        if (queryLower.includes(keyword)) {
          console.log(`🎯 识别到图表类型: ${chartType} (通过关键词: ${keyword})`);
          return chartType;
        }
      }
    }
    
    // 如果没有精确匹配，检查通用图表关键词
    const generalChartKeywords = ['图', 'chart', 'plot', 'graph', '可视化', '画图'];
    for (const keyword of generalChartKeywords) {
      if (queryLower.includes(keyword)) {
        console.log(`📊 识别到通用图表需求 (通过关键词: ${keyword})`);
        return '通用图表';
      }
    }
    
    return null;
  }

  /**
   * 🎯 构建针对性的内容 - 根据图表类型提取专门的内容
   */
  _buildTargetedContentFromReferences(relevantReferences, skillData, userQuery) {
    let content = `## 📚 相关参考指南\n\n`;
    
    // 提取图表类型
    const chartType = this._extractChartType(userQuery);
    const queryLower = userQuery.toLowerCase();
    
    if (chartType) {
      content += `检测到您的查询关于 **${chartType}**，已提取相关代码示例和配置：\n\n`;
    } else {
      content += `检测到您的查询与以下文档相关：\n\n`;
    }
    
    let totalExtracted = 0;
    const TARGET_MIN_LENGTH = 3000;
    const TARGET_MAX_LENGTH = 8000;
    
    for (const refFile of relevantReferences) {
      if (totalExtracted >= TARGET_MAX_LENGTH) break;
      
      const refContent = skillData.resources?.references?.[refFile];
      if (!refContent) {
        console.warn(`📋 [参考文件不存在] ${refFile}`);
        continue;
      }
      
      console.log(`🔍 [处理文件] ${refFile}, 大小: ${refContent.length}字符`);
      
      // 🎯 针对性的内容提取
      const extracted = this._extractTargetedContent(refContent, refFile, userQuery, chartType);
      
      if (extracted && extracted.length > 500) {
        content += `### 📖 ${refFile.replace('.md', '')}\n\n`;
        content += extracted + '\n\n';
        totalExtracted += extracted.length;
        
        console.log(`📦 [文件提取] ${refFile}: ${extracted.length}字符, 累计: ${totalExtracted}字符`);
        
        // 添加分隔符
        if (totalExtracted < TARGET_MAX_LENGTH && refFile !== relevantReferences[relevantReferences.length - 1]) {
          content += '---\n\n';
        }
      }
    }
    
    console.log(`📊 [内容提取统计] 总共提取: ${totalExtracted}字符, 目标: ${TARGET_MIN_LENGTH}-${TARGET_MAX_LENGTH}字符`);
    
    // 🎯 如果提取不足，补充更多内容
    if (totalExtracted < TARGET_MIN_LENGTH) {
      console.log('📋 [提取不足] 补充更多通用内容');
      content += this._extractMoreGeneralContent(skillData, userQuery, chartType, TARGET_MIN_LENGTH - totalExtracted);
    }
    
    // 🎯 添加Python沙盒专用提醒
    content += `\n**🚨 输出规范**:\n`;
    content += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    content += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    
    // 根据图表类型添加特定提示
    if (chartType) {
      content += `\n**💡 关于${chartType}的提示**:\n`;
      content += this._getChartSpecificTips(chartType);
    }
    
    return content;
  }

  /**
   * 🎯 针对性的内容提取 - 根据图表类型提取相关章节
   */
  _extractTargetedContent(refContent, refFileName, userQuery, chartType) {
    const queryLower = userQuery.toLowerCase();
    let extracted = '';
    
    // 1. 提取文件标题
    const titleMatch = refContent.match(/^#\s+([^\n]+)/m);
    if (titleMatch) {
      extracted += `## ${titleMatch[1]}\n\n`;
    }
    
    // 2. 如果识别到具体图表类型，提取相关章节
    if (chartType && refFileName === 'matplotlib_cookbook.md') {
      const chartSpecificContent = this._extractChartSpecificSections(refContent, chartType, queryLower);
      if (chartSpecificContent.length > 1000) {
        extracted += chartSpecificContent;
        console.log(`🎯 [图表特定内容] ${chartType}: ${chartSpecificContent.length}字符`);
        return extracted;
      }
    }
    
    // 3. 提取与查询相关的章节
    const relevantSections = this._extractRelevantSections(refContent, userQuery);
    if (relevantSections.length > 500) {
      extracted += relevantSections;
      console.log(`🔍 [相关章节] 提取: ${relevantSections.length}字符`);
    }
    
    // 4. 提取代码示例（最重要！）
    const codeExtracted = this._extractRelevantCodeExamples(refContent, userQuery, chartType);
    if (codeExtracted.length > 300) {
      extracted += codeExtracted;
      console.log(`💻 [代码示例] 提取: ${codeExtracted.length}字符, 代码块数量: ${(codeExtracted.match(/```python/g) || []).length}`);
    }
    
    // 5. 如果还是太少，提取前几个段落
    if (extracted.length < 800) {
      const firstParagraphs = this._extractFirstParagraphs(refContent, 3);
      extracted += firstParagraphs;
    }
    
    // 6. 限制长度
    if (extracted.length > 4000) {
      extracted = extracted.substring(0, 4000) + '\n\n*(内容截断，如需完整文档请查阅对应文件)*';
    }
    
    return extracted;
  }

  /**
   * 🎯 提取图表特定章节
   */
  _extractChartSpecificSections(refContent, chartType, queryLower) {
    let extracted = '';
    
    // 根据图表类型查找相关章节
    const sectionKeywords = {
      '折线图': ['折线图', 'line', 'plot', '趋势', '时间序列'],
      '饼图': ['饼图', 'pie', '扇形', '占比', '百分比'],
      '条形图': ['条形图', '柱状图', 'bar', '分组', '堆叠'],
      '散点图': ['散点图', 'scatter', '点图', '相关性'],
      '热力图': ['热力图', 'heatmap', '热图', '颜色映射'],
      '直方图': ['直方图', 'histogram', '分布', '频率']
    };
    
    const keywords = sectionKeywords[chartType] || [chartType];
    
    // 查找所有二级和三级标题
    const sectionRegex = /(#{2,3}\s+[^\n]+)([\s\S]*?)(?=\n#{2,3}\s|$)/g;
    let match;
    
    while ((match = sectionRegex.exec(refContent)) !== null) {
      const [fullMatch, title, content] = match;
      
      // 检查标题是否包含关键词
      const titleLower = title.toLowerCase();
      const hasKeyword = keywords.some(keyword => 
        titleLower.includes(keyword.toLowerCase())
      );
      
      if (hasKeyword) {
        extracted += `${title}\n${content}\n\n`;
        
        // 如果已经提取了足够的内容，可以提前结束
        if (extracted.length > 2500) {
          break;
        }
      }
    }
    
    // 如果找到了特定章节，添加说明
    if (extracted.length > 500) {
      extracted = `**以下是关于${chartType}的专门章节和代码示例：**\n\n${extracted}`;
    }
    
    return extracted;
  }

  /**
   * 🎯 提取与查询相关的章节
   */
  _extractRelevantSections(refContent, userQuery) {
    const queryLower = userQuery.toLowerCase();
    let extracted = '';
    
    // 将查询拆分为关键词（中文和英文单词）
    const keywords = this._extractKeywordsFromQuery(userQuery);
    
    if (keywords.length === 0) {
      return extracted;
    }
    
    // 查找所有二级标题
    const sections = refContent.split(/\n#{2,3}\s+/);
    
    for (let i = 1; i < sections.length; i++) { // 从1开始，跳过第一个（标题）
      const section = sections[i];
      const firstNewline = section.indexOf('\n');
      const title = firstNewline !== -1 ? section.substring(0, firstNewline) : section;
      const content = firstNewline !== -1 ? section.substring(firstNewline + 1) : '';
      
      // 检查标题或内容是否包含关键词
      const sectionLower = (title + ' ' + content).toLowerCase();
      const hasKeyword = keywords.some(keyword => 
        sectionLower.includes(keyword.toLowerCase())
      );
      
      if (hasKeyword) {
        extracted += `## ${title}\n\n${content.substring(0, 1000)}`;
        if (content.length > 1000) {
          extracted += '...\n\n';
        } else {
          extracted += '\n\n';
        }
        
        // 限制提取的章节数量
        if ((extracted.match(/## /g) || []).length >= 2) {
          break;
        }
      }
    }
    
    return extracted;
  }

  /**
   * 🎯 提取相关的代码示例
   */
  _extractRelevantCodeExamples(refContent, userQuery, chartType) {
    let extracted = '';
    const queryLower = userQuery.toLowerCase();
    
    // 查找所有Python代码块
    const codeBlockRegex = /```python\n([\s\S]*?)\n```/g;
    const codeBlocks = [];
    let match;
    
    while ((match = codeBlockRegex.exec(refContent)) !== null) {
      codeBlocks.push({
        code: match[0],
        index: match.index,
        content: match[1]
      });
    }
    
    if (codeBlocks.length === 0) {
      return extracted;
    }
    
    // 根据图表类型或查询关键词选择代码块
    const selectedBlocks = [];
    
    // 优先选择与图表类型相关的代码
    if (chartType) {
      const chartTypeMap = {
        '折线图': ['plot(', 'plt.plot', '折线图', 'line', '趋势'],
        '饼图': ['pie(', 'plt.pie', '饼图', '扇形', '占比'],
        '条形图': ['bar(', 'plt.bar', '条形图', '柱状图', 'bar'],
        '散点图': ['scatter(', 'plt.scatter', '散点图', 'scatter'],
        '热力图': ['imshow(', 'heatmap', '热力图'],
        '直方图': ['hist(', 'plt.hist', '直方图', 'histogram']
      };
      
      const keywords = chartTypeMap[chartType] || [chartType];
      
      for (const block of codeBlocks) {
        const blockLower = block.content.toLowerCase();
        const hasKeyword = keywords.some(keyword => 
          blockLower.includes(keyword.toLowerCase())
        );
        
        if (hasKeyword) {
          selectedBlocks.push(block);
          if (selectedBlocks.length >= 2) break;
        }
      }
    }
    
    // 如果图表类型匹配不够，使用查询关键词匹配
    if (selectedBlocks.length < 2) {
      const queryKeywords = this._extractKeywordsFromQuery(userQuery);
      
      for (const block of codeBlocks) {
        if (selectedBlocks.length >= 3) break;
        
        const blockLower = block.content.toLowerCase();
        const hasKeyword = queryKeywords.some(keyword => 
          blockLower.includes(keyword.toLowerCase())
        );
        
        // 避免重复添加
        if (hasKeyword && !selectedBlocks.includes(block)) {
          selectedBlocks.push(block);
        }
      }
    }
    
    // 如果还是不够，添加通用的代码示例
    if (selectedBlocks.length < 2 && codeBlocks.length > 0) {
      // 选择前几个代码块
      const additionalBlocks = codeBlocks.slice(0, Math.min(2, codeBlocks.length));
      for (const block of additionalBlocks) {
        if (!selectedBlocks.includes(block)) {
          selectedBlocks.push(block);
        }
      }
    }
    
    // 构建提取内容
    if (selectedBlocks.length > 0) {
      extracted += `\n**💻 相关代码示例** (已筛选最相关的${selectedBlocks.length}个):\n\n`;
      selectedBlocks.forEach((block, index) => {
        extracted += `${block.code}\n\n`;
      });
    }
    
    return extracted;
  }

  /**
   * 🎯 从查询中提取关键词
   */
  _extractKeywordsFromQuery(userQuery) {
    const queryLower = userQuery.toLowerCase();
    
    // 移除常见停用词
    const stopWords = new Set([
      '这个', '那个', '怎么', '如何', '请', '谢谢', '你好',
      '请问', '可以', '帮助', '需要', '想要', '希望', '一下',
      '一张', '一个', '一种', '一些', '不要', '测试', '代码', '解释器'
    ]);
    
    // 分割查询为单词（支持中文和英文）
    const words = queryLower.split(/[\s,，、.。!！?？]+/);
    
    // 过滤停用词和短词
    const keywords = words.filter(word => 
      word.length > 1 && 
      !stopWords.has(word) &&
      !/^[0-9]+$/.test(word)
    );
    
    return keywords;
  }

  /**
   * 🎯 提取前几个段落
   */
  _extractFirstParagraphs(refContent, count = 3) {
    let extracted = '';
    const paragraphs = refContent.split('\n\n');
    
    let extractedCount = 0;
    for (const para of paragraphs) {
      if (para.trim() && !para.startsWith('#') && !para.startsWith('```')) {
        extracted += para + '\n\n';
        extractedCount++;
        if (extractedCount >= count) break;
      }
    }
    
    return extracted;
  }

  /**
   * 🎯 提取更多通用内容
   */
  _extractMoreGeneralContent(skillData, userQuery, chartType, minLength) {
    let content = '\n**📋 更多相关内容**:\n\n';
    
    // 提取主技能文档的关键部分
    const mainContent = this._extractPythonKeyInformation(skillData.content, userQuery);
    if (mainContent.length > 500) {
      content += mainContent + '\n\n';
    }
    
    // 如果还是不够，添加一些通用提示
    if (content.length < minLength) {
      content += `**💡 通用Python沙盒使用提示**:\n`;
      content += `• 所有代码都在安全的沙盒环境中执行\n`;
      content += `• 支持matplotlib、pandas、numpy等常用库\n`;
      content += `• 图像会自动捕获并返回base64格式\n`;
      content += `• 复杂任务可以分步执行多个代码块\n`;
      
      if (chartType) {
        content += `\n**🎨 ${chartType}绘制要点**:\n`;
        content += `• 使用plt.figure()设置画布大小\n`;
        content += `• 使用plt.title()添加标题\n`;
        content += `• 使用plt.xlabel()/plt.ylabel()添加坐标轴标签\n`;
        content += `• 使用plt.legend()显示图例\n`;
        content += `• 使用plt.show()显示图表\n`;
      }
    }
    
    return content;
  }

  /**
   * 🎯 获取图表特定提示
   */
  _getChartSpecificTips(chartType) {
    const tips = {
      '折线图': '• 使用plt.plot(x, y)绘制折线\n• marker参数可以添加数据点标记\n• linestyle参数可以设置线型（实线、虚线等）',
      '饼图': '• 使用plt.pie(sizes, labels=labels)绘制饼图\n• autopct参数可以显示百分比\n• explode参数可以突出某一部分',
      '条形图': '• 使用plt.bar(x, height)绘制条形图\n• 可以设置color参数改变颜色\n• 使用plt.barh()绘制水平条形图',
      '散点图': '• 使用plt.scatter(x, y)绘制散点图\n• s参数可以设置点的大小\n• c参数可以设置点的颜色',
      '热力图': '• 使用plt.imshow(data)显示热力图\n• cmap参数可以设置颜色映射\n• 使用plt.colorbar()添加颜色条',
      '直方图': '• 使用plt.hist(data, bins=10)绘制直方图\n• bins参数控制柱子数量\n• 可以设置alpha参数调整透明度'
    };
    
    return tips[chartType] || '• 参考matplotlib官方文档获取更多图表类型和配置选项';
  }

  /**
   * 🎯 检查是否包含对应图表代码
   */
  _checkContainsChartCode(content, userQuery) {
    const chartType = this._extractChartType(userQuery);
    if (!chartType) return false;
    
    const chartCodePatterns = {
      '折线图': ['plt\\.plot', 'plt\\.plot\\(', 'plot\\('],
      '饼图': ['plt\\.pie', 'plt\\.pie\\(', 'pie\\('],
      '条形图': ['plt\\.bar', 'plt\\.bar\\(', 'bar\\('],
      '散点图': ['plt\\.scatter', 'plt\\.scatter\\(', 'scatter\\('],
      '热力图': ['plt\\.imshow', 'heatmap', 'sns\\.heatmap'],
      '直方图': ['plt\\.hist', 'plt\\.hist\\(', 'hist\\(']
    };
    
    const patterns = chartCodePatterns[chartType];
    if (!patterns) return false;
    
    return patterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(content);
    });
  }

  /**
   * 🎯 降级内容构建
   */
  _buildFallbackContent(skillData, userQuery) {
    let fullContent = '';
    
    // 1. 提取主文档的关键信息
    const mainContent = this._extractPythonKeyInformation(skillData.content, userQuery);
    fullContent += mainContent;
    
    // 2. 尝试匹配相关参考文件
    const relevantReferences = this._findRelevantPythonReferencesEnhanced(userQuery);
    
    if (relevantReferences.length > 0) {
      fullContent += `\n**📚 相关参考指南**:\n`;
      
      for (const refFile of relevantReferences.slice(0, 2)) {
        const refContent = skillData.resources?.references?.[refFile];
        if (refContent) {
          const summary = this._extractReferenceSummary(refContent, refFile);
          fullContent += `• **${refFile.replace('.md', '')}**: ${summary}\n`;
        }
      }
    }
    
    // 3. 添加Python沙盒专用提醒
    fullContent += `\n**🚨 输出规范**:\n`;
    fullContent += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    fullContent += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    fullContent += `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
    
    return fullContent;
  }

  /**
   * 🎯 从参考文件内容提取摘要
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
      'matplotlib_cookbook.md': '数据可视化与图表制作指南，包含各种图表类型的代码示例',
      'pandas_cheatsheet.md': '数据清洗与分析速查表，包含数据处理和性能优化代码',
      'report_generator_workflow.md': '自动化报告生成工作流，支持Word/Excel/PDF/PPT',
      'ml_workflow.md': '机器学习工作流指南，包含分类、回归、时间序列分析',
      'sympy_cookbook.md': '符号数学与公式证明，支持方程求解和微积分运算',
      'scipy_cookbook.md': '科学计算与统计分析，支持优化、积分和统计计算'
    };
    
    return fileDescriptions[fileName] || '相关代码示例和最佳实践';
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
   * 🎯 从合并内容中提取参考文件部分
   */
  _extractReferenceFromCombinedContent(combinedContent, refFileName) {
    // 在合并内容中查找参考文件章节
    const chapterPattern = new RegExp(`### 📖 ${refFileName.replace('.md', '')}[\\s\\S]*?(?=\\n### 📖 |\\n<hr>|$)`, 'i');
    const match = combinedContent.match(chapterPattern);
    
    if (match) {
      // 提取章节内容（去掉标题）
      const content = match[0].replace(new RegExp(`^### 📖 ${refFileName.replace('.md', '')}[\\s\\S]*?\\n\\n`), '');
      return content;
    }
    
    return '';
  }

  /**
   * 🎯 从合并内容中构建目标内容
   */
  _buildContentFromCombinedSource(combinedContent, userQuery, relevantReferences) {
    const chartType = this._extractChartType(userQuery);
    let content = `## 📚 相关参考指南\n\n`;
    
    if (chartType) {
      content += `检测到您的查询关于 **${chartType}**，已提取相关代码示例：\n\n`;
    } else {
      content += `检测到您的查询与以下文档相关：\n\n`;
    }
    
    // 1. 首先尝试提取图表特定内容
    if (chartType) {
      const chartContent = this._extractChartSpecificContent(combinedContent, chartType, userQuery);
      if (chartContent && chartContent.length > 1000) {
        content += chartContent;
        console.log(`🎯 [图表特定内容] ${chartType}: ${chartContent.length}字符`);
      }
    }
    
    // 2. 如果图表特定内容不足，提取参考文件章节
    if (content.length < 2000 && relevantReferences.length > 0) {
      for (const refFile of relevantReferences.slice(0, 2)) {
        const refContent = this._extractReferenceFromCombinedContent(combinedContent, refFile);
        if (refContent) {
          const extracted = this._extractRelevantParts(refContent, userQuery, chartType);
          if (extracted.length > 500) {
            content += `### 📖 ${refFile.replace('.md', '')}\n\n`;
            content += extracted + '\n\n';
          }
        }
      }
    }
    
    // 3. 如果还是不足，提取主文档的关键部分
    if (content.length < 3000) {
      const mainContent = this._extractPythonKeyInformation(combinedContent, userQuery);
      if (mainContent.length > 500) {
        content += `### 📋 核心使用指南\n\n`;
        content += mainContent + '\n\n';
      }
    }
    
    // 添加输出规范
    content += `\n**🚨 输出规范**:\n`;
    content += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
    content += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
    
    return content;
  }

  /**
   * 🎯 从合并内容中提取图表特定内容
   */
  _extractChartSpecificContent(combinedContent, chartType, userQuery) {
    const queryLower = userQuery.toLowerCase();
    let extracted = '';
    
    // 图表类型关键词映射
    const chartKeywords = {
      '折线图': ['折线图', '折线', 'line', 'plot', '趋势图'],
      '饼图': ['饼图', 'pie', '扇形图', '占比图'],
      '条形图': ['条形图', '柱状图', 'bar'],
      '散点图': ['散点图', 'scatter'],
      '热力图': ['热力图', 'heatmap'],
      '直方图': ['直方图', 'histogram']
    };
    
    const keywords = chartKeywords[chartType] || [];
    
    if (keywords.length === 0) return extracted;
    
    // 查找所有包含这些关键词的章节
    const chapterRegex = /### 📖 [^\n]+[\s\S]*?(?=\n### 📖 |\n<hr>|$)/g;
    let match;
    
    while ((match = chapterRegex.exec(combinedContent)) !== null) {
      const chapter = match[0];
      const chapterLower = chapter.toLowerCase();
      
      // 检查章节是否包含图表关键词
      const hasKeyword = keywords.some(keyword => 
        chapterLower.includes(keyword.toLowerCase())
      );
      
      if (hasKeyword) {
        extracted += chapter + '\n\n';
        
        // 在章节内查找与查询相关的代码
        const codeRegex = /```python[\s\S]*?```/g;
        const codeBlocks = chapter.match(codeRegex) || [];
        
        if (codeBlocks.length > 0) {
          extracted += `**💻 相关代码示例**:\n\n`;
          // 优先选择包含查询关键词的代码
          const relevantCodeBlocks = codeBlocks.filter(block => {
            const blockLower = block.toLowerCase();
            return queryLower.split(/\s+/).some(word => 
              word.length > 2 && blockLower.includes(word)
            );
          });
          
          // 如果没有完全匹配的，取前2个
          const displayBlocks = relevantCodeBlocks.length > 0 ? 
            relevantCodeBlocks.slice(0, 2) : codeBlocks.slice(0, 2);
          
          displayBlocks.forEach(block => {
            extracted += block + '\n\n';
          });
        }
        
        // 如果已经提取了足够内容，停止
        if (extracted.length > 3000) break;
      }
    }
    
    return extracted;
  }

  /**
   * 🎯 从章节内容中提取相关部分
   */
  _extractRelevantParts(chapterContent, userQuery, chartType) {
    const queryLower = userQuery.toLowerCase();
    let extracted = '';
    
    // 1. 提取标题和简介
    const lines = chapterContent.split('\n');
    let inCodeBlock = false;
    let codeBlockCount = 0;
    
    for (const line of lines) {
      // 处理代码块
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        if (!inCodeBlock) codeBlockCount++;
      }
      
      // 提取非代码部分（最多前10行）
      if (!inCodeBlock && extracted.split('\n').length < 15) {
        // 检查行是否与查询相关
        const lineLower = line.toLowerCase();
        const isRelevant = queryLower.split(/\s+/).some(word => 
          word.length > 2 && lineLower.includes(word)
        );
        
        if (isRelevant || line.match(/^#|^[-*]/)) {
          extracted += line + '\n';
        }
      }
      
      // 提取代码块（最多2个）
      if (inCodeBlock || (line.startsWith('```') && line.includes('python'))) {
        extracted += line + '\n';
      }
      
      // 如果已经提取了足够内容，停止
      if (extracted.length > 2000 || codeBlockCount >= 2) {
        break;
      }
    }
    
    return extracted;
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