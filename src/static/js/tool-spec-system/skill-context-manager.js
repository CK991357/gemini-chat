// src/tool-spec-system/skill-context-manager.js
// 🎯 重构版本：智能内容构建 + 匹配压缩器新架构

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
    
    // 🚀 Python沙盒参考文件映射（优化版）
    this.pythonReferenceMap = {
      // 基础图表绘制
      'matplotlib': 'matplotlib_cookbook.md',
      '可视化': 'matplotlib_cookbook.md',
      '图表': 'matplotlib_cookbook.md',
      '画图': 'matplotlib_cookbook.md',
      '绘图': 'matplotlib_cookbook.md',
      
      // 具体图表类型
      '折线图': 'matplotlib_cookbook.md:line',
      '折线': 'matplotlib_cookbook.md:line',
      'line': 'matplotlib_cookbook.md:line',
      'line_chart': 'matplotlib_cookbook.md:line',
      
      '饼图': 'matplotlib_cookbook.md:pie',
      'pie': 'matplotlib_cookbook.md:pie',
      'pie_chart': 'matplotlib_cookbook.md:pie',
      
      '条形图': 'matplotlib_cookbook.md:bar',
      '柱状图': 'matplotlib_cookbook.md:bar',
      'bar': 'matplotlib_cookbook.md:bar',
      'bar_chart': 'matplotlib_cookbook.md:bar',
      
      '散点图': 'matplotlib_cookbook.md:scatter',
      'scatter': 'matplotlib_cookbook.md:scatter',
      'scatter_plot': 'matplotlib_cookbook.md:scatter',
      
      '热力图': 'matplotlib_cookbook.md:heatmap',
      'heatmap': 'matplotlib_cookbook.md:heatmap',
      
      '直方图': 'matplotlib_cookbook.md:histogram',
      'histogram': 'matplotlib_cookbook.md:histogram',
      
      // 数据处理
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
    
    console.log('✅ SkillContextManager 已加载 - 重构的上下文构建系统');
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
   * 🚀 增强的Python沙盒上下文构建 - 重构版
   */
  async _buildEnhancedPythonSandboxContext(skill, userQuery, sessionId, context = {}) {
    try {
      console.log(`🔍 [Python沙盒] 查询: "${userQuery.substring(0, 50)}..."`);
      
      // 直接从skill对象获取内容（避免解析错误）
      const skillContent = skill.skill.content;
      
      // 构建智能上下文
      let contextContent = `### 🐍 Python沙盒工具: ${skill.name}\n\n`;
      contextContent += `**核心功能**: ${skill.description}\n\n`;
      
      // 1. 提取核心信息（智能回退）
      const coreInfo = this._extractCoreInfoSmart(skillContent);
      contextContent += coreInfo;
      
      // 2. 根据查询类型添加专项内容
      if (userQuery.includes('折线图') || userQuery.includes('饼图') || userQuery.includes('图表')) {
        contextContent += this._extractChartSpecificContent(userQuery, skillContent);
      }
      
      // 3. 添加关键代码模板
      contextContent += this._extractCodeTemplates(skillContent, 2);
      
      // 4. 添加使用指南
      contextContent += `## 🚀 快速使用指南\n\n`;
      contextContent += `1. 图表生成：使用 \`plt.plot()\` + \`plt.show()\`\n`;
      contextContent += `2. 文件输出：使用指定JSON格式\n`;
      contextContent += `3. 数据处理：从 \`/data\` 目录读取文件\n`;
      contextContent += `4. 内存注意：容器限制6GB，Swap已禁用\n\n`;
      
      return contextContent;
      
    } catch (error) {
      console.error(`🚨 [上下文构建失败]`, error);
      return this._buildFallbackContext(skill.skill, userQuery);
    }
  }

  _extractCoreInfoSmart(content) {
    let core = '## 📋 核心信息摘要\n\n';
    
    // 关键词提取法（不依赖正则）
    const infoSections = [
      {
        title: '🎯 核心能力',
        keywords: ['多功能的代码执行环境', '数据分析', '可视化', '文档自动化'],
        extract: (lines) => lines.slice(0, 10).join('\n')
      },
      {
        title: '🚀 输出规范',
        keywords: ['JSON格式', 'plt.show()', '自动捕获', 'base64'],
        extract: (lines) => lines.filter(l => l.includes('JSON') || l.includes('show()')).join('\n')
      },
      {
        title: '💾 文件操作',
        keywords: ['/data', '工作区', '会话持久化', '读取文件'],
        extract: (lines) => lines.filter(l => l.includes('/data') || l.includes('pd.read')).join('\n')
      }
    ];
    
    const lines = content.split('\n');
    
    for (const section of infoSections) {
      const relevantLines = [];
      let inSection = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 检查是否进入相关章节
        if (line.startsWith('## ') && section.keywords.some(kw => line.includes(kw))) {
          inSection = true;
          relevantLines.push(line);
        } else if (line.startsWith('## ') && inSection) {
          break;
        } else if (inSection) {
          relevantLines.push(line);
        }
      }
      
      if (relevantLines.length > 0) {
        core += `### ${section.title}\n`;
        core += relevantLines.slice(0, 8).join('\n') + '\n\n';
      }
    }
    
    return core;
  }

  _extractChartSpecificContent(userQuery, skillContent) {
    let chartContent = '\n## 📊 图表示例\n\n';
    
    if (userQuery.includes('折线图')) {
      chartContent += '检测到您想生成折线图，以下是一个简单的折线图代码模板：\n\n';
      chartContent += '``python\n';
      chartContent += 'import matplotlib.pyplot as plt\n';
      chartContent += '# 示例数据\n';
      chartContent += 'x = [1, 2, 3, 4, 5]\n';
      chartContent += 'y = [2, 4, 1, 5, 3]\n';
      chartContent += '# 绘制折线图\n';
      chartContent += 'plt.plot(x, y, marker=\'o\')\n';
      chartContent += 'plt.title("折线图示例")\n';
      chartContent += 'plt.xlabel("X轴")\n';
      chartContent += 'plt.ylabel("Y轴")\n';
      chartContent += 'plt.show()\n';
      chartContent += '```\n\n';
    } else if (userQuery.includes('饼图')) {
      chartContent += '检测到您想生成饼图，以下是一个简单的饼图代码模板：\n\n';
      chartContent += '``python\n';
      chartContent += 'import matplotlib.pyplot as plt\n';
      chartContent += '# 示例数据\n';
      chartContent += 'labels = [\'A\', \'B\', \'C\', \'D\']\n';
      chartContent += 'sizes = [15, 30, 45, 10]\n';
      chartContent += '# 绘制饼图\n';
      chartContent += 'plt.pie(sizes, labels=labels, autopct=\'%1.1f%%\')\n';
      chartContent += 'plt.title("饼图示例")\n';
      chartContent += 'plt.show()\n';
      chartContent += '```\n\n';
    } else {
      chartContent += '检测到您想生成图表，以下是一些常用的图表示例：\n\n';
      chartContent += '``python\n';
      chartContent += 'import matplotlib.pyplot as plt\n';
      chartContent += '# 这里放置您的数据和图表代码\n';
      chartContent += 'plt.show()\n';
      chartContent += '```\n\n';
    }
    
    return chartContent;
  }

  _extractCodeTemplates(skillContent, count) {
    let templateContent = '\n## 💻 代码模板\n\n';
    
    // 简单提取代码块
    const codeBlocks = skillContent.match(/```python[\s\S]*?```/g) || [];
    
    if (codeBlocks.length > 0) {
      const limitedBlocks = codeBlocks.slice(0, count);
      limitedBlocks.forEach((block, index) => {
        templateContent += `**模板 ${index + 1}**:\n\n${block}\n\n`;
      });
    } else {
      templateContent += '暂无可用代码模板\n\n';
    }
    
    return templateContent;
  }

  /**
   * 🎯 从技能文档提取核心结构 - 修复版
   */
  _extractSkillDocumentCore(skillContent) {
    let core = '';
    
    // 移除Markdown加粗标记以简化匹配
    const normalizedContent = skillContent.replace(/\*\*/g, '');
    
    // 核心章节的优先级顺序 - 修正的正则表达式
    const coreSections = [
        {
            pattern: /## 🎯 核心能力概览[\s\S]*?(?=\n##\s|$)/i,
            name: '核心能力概览',
            required: true,
            maxLength: 3000
        },
        {
            pattern: /## 🚀 输出规范 - 后端实际支持的格式[\s\S]*?(?=\n##\s|$)/i,
            name: '输出规范',
            required: true,
            maxLength: 2500
        },
        {
            pattern: /## 💡 核心工作流模式[\s\S]*?(?=\n##\s|$)/i,
            name: '工作流模式',
            required: true,
            maxLength: 2000
        },
        {
            pattern: /## 📋 可用库快速参考[\s\S]*?(?=\n##\s|$)/i,
            name: '库参考',
            required: false,
            maxLength: 1500
        },
        {
            pattern: /## 🎯 快速开始模板[\s\S]*?(?=\n##\s|$)/i,
            name: '快速开始',
            required: false,
            maxLength: 2000
        }
    ];
    
    // 首先提取标题和描述
    const introMatch = normalizedContent.match(/^# [^\n]+[\s\S]*?(?=\n##\s|$)/);
    if (introMatch) {
      core += introMatch[0] + '\n\n';
    }
    
    // 提取核心章节
    for (const section of coreSections) {
      if (section.required || core.length < 4000) {
        const match = normalizedContent.match(section.pattern);
        if (match) {
          let content = match[0];
          if (content.length > section.maxLength) {
            content = content.substring(0, section.maxLength) + '\n\n...';
          }
          core += content + '\n\n';
          console.log(`✅ [提取核心] ${section.name}: ${Math.min(content.length, section.maxLength)}字符`);
        } else if (section.required) {
          console.warn(`⚠️ [缺少核心章节] ${section.name}`);
          // 回退方案：手动提取相关内容
          const fallbackContent = this._extractFallbackSection(normalizedContent, section.name);
          if (fallbackContent) {
            core += fallbackContent + '\n\n';
          }
        }
      }
    }
    
    // 确保有JSON示例
    if (!core.includes('```json')) {
      const jsonExample = normalizedContent.match(/```json[\s\S]*?```/);
      if (jsonExample) {
        core += '## 🎯 调用示例\n\n' + jsonExample[0] + '\n\n';
      }
    }
    
    console.log(`📘 [技能核心完成] 总大小: ${core.length}字符`);
    return core;
  }

  // 添加回退提取方法
  _extractFallbackSection(content, sectionName) {
    const lines = content.split('\n');
    let inSection = false;
    let sectionContent = [];
    let sectionFound = false;
    
    for (const line of lines) {
      if (line.startsWith('## ') && line.includes(sectionName)) {
        inSection = true;
        sectionFound = true;
        sectionContent.push(line);
      } else if (line.startsWith('## ') && inSection) {
        break;
      } else if (inSection) {
        sectionContent.push(line);
      }
    }
    
    if (sectionFound) {
      return sectionContent.join('\n');
    }
    return null;
  }

  // 添加基于关键词的内容提取方法
  _extractByKeywords(content, keywords, maxLength = 2000) {
    const lines = content.split('\n');
    let extracted = [];
    let keywordFound = false;
    let charCount = 0;
    
    for (const line of lines) {
      if (charCount > maxLength) break;
      
      // 检查是否包含关键词
      const hasKeyword = keywords.some(keyword => 
        line.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasKeyword || keywordFound) {
        if (!keywordFound) {
          // 找到关键词，开始收集
          keywordFound = true;
        }
        
        if (charCount + line.length <= maxLength) {
          extracted.push(line);
          charCount += line.length;
        }
      }
    }
    
    return extracted.length > 0 ? extracted.join('\n') : null;
  }

  /**
   * 🎯 根据查询构建特定内容
   */
  _buildQuerySpecificContent(skillData, userQuery) {
    const queryLower = userQuery.toLowerCase();
    let queryContent = '';
    
    // 检测用户意图
    const chartType = this._extractChartType(userQuery);
    const relevantRefs = this._findRelevantReferences(userQuery);
    
    console.log(`🎯 [用户意图] 图表类型: ${chartType || '无'}, 相关参考: ${relevantRefs.length}个`);
    
    // 如果是图表相关查询
    if (chartType && relevantRefs.includes('matplotlib_cookbook.md')) {
      const refContent = skillData.resources?.references?.['matplotlib_cookbook.md'];
      if (refContent) {
        const chartExamples = this._extractChartExamples(refContent, chartType, userQuery);
        if (chartExamples) {
          queryContent += `## 📊 ${chartType}专项代码示例\n\n`;
          queryContent += `检测到您的查询关于 **${chartType}**，已提取最相关的代码模板：\n\n`;
          queryContent += chartExamples;
          
          // 添加图表使用提示
          queryContent += this._getChartUsageTips(chartType);
        }
      }
    }
    
    // 如果是数据处理相关
    if (queryLower.includes('数据') && queryLower.includes('处理')) {
      const refContent = skillData.resources?.references?.['pandas_cheatsheet.md'];
      if (refContent) {
        const dataExamples = this._extractDataProcessingExamples(refContent, userQuery);
        if (dataExamples) {
          queryContent += `## 📈 数据处理代码示例\n\n`;
          queryContent += dataExamples;
        }
      }
    }
    
    // 基于现有文档结构提取内容
    const skillContent = skillData.content;
    
    // 如果正则匹配失败，使用关键词回退
    const sectionKeywords = {
      '输出规范': ['输出规范', 'json格式', 'plt.show()'],
      '调用结构': ['通用调用结构', '参数', 'parameters'],
      '工作流模式': ['工作流', '示例', '模板']
    };
    
    // 尝试提取核心章节
    for (const [section, keywords] of Object.entries(sectionKeywords)) {
      const extracted = this._extractByKeywords(skillContent, keywords, 1500);
      if (extracted && !queryContent.includes(section)) {
        queryContent += `## 📋 ${section}\n\n${extracted}\n\n`;
      }
    }
    
    // 如果没有特定内容，添加一些通用示例
    if (!queryContent && skillData.content.includes('```python')) {
      const codeBlocks = skillData.content.match(/```python[\s\S]*?```/g) || [];
      if (codeBlocks.length > 0) {
        queryContent += `## 💻 通用Python代码示例\n\n`;
        queryContent += `以下是几个可以直接使用的代码模板：\n\n`;
        codeBlocks.slice(0, 2).forEach((block, idx) => {
          queryContent += `**示例 ${idx + 1}**:\n\n${block}\n\n`;
        });
      }
    }
    
    // 添加代码示例（直接从skillData.content中提取）
    const codeBlocks = skillData.content.match(/```python[\s\S]*?```/g) || [];
    if (codeBlocks.length > 0) {
      queryContent += `## 💻 相关代码示例\n\n`;
      codeBlocks.slice(0, 2).forEach((block, idx) => {
        queryContent += `**示例 ${idx + 1}**:\n\n${block}\n\n`;
      });
    }
    
    console.log(`🎯 [查询内容构建] 大小: ${queryContent.length}字符`);
    return queryContent;
  }

  /**
   * 🎯 提取图表示例
   */
  _extractChartExamples(refContent, chartType, userQuery) {
    const chartPatterns = {
      '折线图': ['plt.plot', 'plot(', '折线图示例', 'line'],
      '饼图': ['plt.pie', 'pie(', '饼图示例'],
      '条形图': ['plt.bar', 'bar(', '条形图示例'],
      '散点图': ['plt.scatter', 'scatter(', '散点图示例'],
      '热力图': ['plt.imshow', 'heatmap', '热力图示例'],
      '直方图': ['plt.hist', 'hist(', '直方图示例']
    };
    
    const keywords = chartPatterns[chartType] || [chartType];
    const allCodeBlocks = refContent.match(/```python[\s\S]*?```/g) || [];
    
    // 优先选择包含关键词的代码块
    const relevantBlocks = [];
    for (const block of allCodeBlocks) {
      const blockLower = block.toLowerCase();
      const isRelevant = keywords.some(keyword => 
        blockLower.includes(keyword.toLowerCase())
      );
      
      if (isRelevant) {
        relevantBlocks.push(block);
        if (relevantBlocks.length >= 2) break;
      }
    }
    
    // 如果没有找到，取前两个通用代码块
    const displayBlocks = relevantBlocks.length > 0 
      ? relevantBlocks.slice(0, 2)
      : allCodeBlocks.slice(0, 2);
    
    if (displayBlocks.length === 0) {
      return null;
    }
    
    let examples = '';
    displayBlocks.forEach((block, index) => {
      examples += `**模板 ${index + 1}**:\n\n${block}\n\n`;
    });
    
    return examples;
  }

  /**
   * 🎯 提取数据处理示例
   */
  _extractDataProcessingExamples(refContent, userQuery) {
    const queryLower = userQuery.toLowerCase();
    const allCodeBlocks = refContent.match(/```python[\s\S]*?```/g) || [];
    
    // 根据查询关键词选择代码块
    const keywords = [];
    if (queryLower.includes('清洗')) keywords.push('清洗', 'clean');
    if (queryLower.includes('分析')) keywords.push('分析', 'analyze');
    if (queryLower.includes('转换')) keywords.push('转换', 'transform');
    if (queryLower.includes('聚合')) keywords.push('聚合', 'aggregate');
    
    const relevantBlocks = [];
    for (const block of allCodeBlocks) {
      if (relevantBlocks.length >= 2) break;
      
      const blockLower = block.toLowerCase();
      const isRelevant = keywords.length === 0 || 
        keywords.some(keyword => blockLower.includes(keyword));
      
      if (isRelevant) {
        relevantBlocks.push(block);
      }
    }
    
    if (relevantBlocks.length === 0 && allCodeBlocks.length > 0) {
      relevantBlocks.push(...allCodeBlocks.slice(0, 2));
    }
    
    if (relevantBlocks.length === 0) {
      return null;
    }
    
    let examples = '';
    relevantBlocks.forEach((block, index) => {
      examples += `**示例 ${index + 1}**:\n\n${block}\n\n`;
    });
    
    return examples;
  }

  /**
   * 🎯 合并技能核心和查询内容
   */
  _mergeSkillAndQueryContent(skillCore, queryContent, userQuery) {
    if (!queryContent) {
      console.log('📋 [合并内容] 只有技能核心，无查询特定内容');
      return skillCore;
    }
    
    // 如果技能核心太小，直接合并
    if (skillCore.length < 2000) {
      const merged = skillCore + '\n\n' + queryContent;
      console.log(`🔗 [简单合并] 大小: ${merged.length}字符`);
      return merged;
    }
    
    // 智能合并：确保不重复，结构清晰
    let merged = skillCore;
    
    // 只在技能核心没有代码示例时添加查询内容
    if (!skillCore.includes('```python') && queryContent.includes('```python')) {
      merged += '\n\n---\n\n' + queryContent;
    }
    // 如果技能核心已经有代码，但查询内容有更相关的示例
    else if (queryContent.length > 1000) {
      // 添加一个专门的"查询相关"章节
      merged += '\n\n## 🎯 查询相关内容\n\n';
      merged += `以下内容专门针对您的查询"${userQuery.substring(0, 50)}..."：\n\n`;
      merged += queryContent;
    }
    
    console.log(`🔗 [智能合并完成] 总大小: ${merged.length}字符`);
    return merged;
  }

  /**
   * 🎯 格式化内容以供提示使用
   */
  _formatContentForPrompt(content, userQuery) {
    // 确保内容结构清晰
    let formatted = content;
    
    // 如果内容太大，进行基本截断
    if (formatted.length > 12000) {
      // 保留开头的重要部分
      const preserved = formatted.substring(0, 10000);
      
      // 查找最后一个完整段落
      const lastSection = preserved.lastIndexOf('## ');
      if (lastSection > 8000) {
        formatted = preserved.substring(0, lastSection);
      } else {
        formatted = preserved;
      }
      
      formatted += '\n\n...\n\n**提示**: 内容已截断，如需完整文档请查阅参考文件。';
    }
    
    // 添加执行指导
    formatted += `\n\n## 🚀 执行步骤\n\n`;
    formatted += `1. 参考上面的调用结构和代码示例\n`;
    formatted += `2. 根据您的需求调整代码\n`;
    formatted += `3. 确保遵循输出规范\n`;
    formatted += `4. 图表输出使用 \`plt.show()\`\n`;
    formatted += `5. 文件输出使用JSON格式\n`;
    
    return formatted;
  }

  /**
   * 🎯 获取图表使用提示
   */
  _getChartUsageTips(chartType) {
    const tips = {
      '折线图': '\n**💡 折线图要点**:\n• 使用 `plt.plot(x, y)` 绘制折线\n• 添加 `marker` 参数显示数据点\n• 使用 `plt.title()` 和 `plt.xlabel()`/`plt.ylabel()` 添加标签',
      '饼图': '\n**💡 饼图要点**:\n• 使用 `plt.pie(sizes, labels=labels)` 绘制饼图\n• 添加 `autopct` 参数显示百分比\n• 使用 `explode` 参数突出某部分',
      '条形图': '\n**💡 条形图要点**:\n• 使用 `plt.bar(x, height)` 绘制条形图\n• 使用 `plt.barh()` 绘制水平条形图\n• 设置 `color` 参数改变颜色',
      '散点图': '\n**💡 散点图要点**:\n• 使用 `plt.scatter(x, y)` 绘制散点图\n• 使用 `s` 参数设置点的大小\n• 使用 `c` 参数设置点的颜色',
      '热力图': '\n**💡 热力图要点**:\n• 使用 `plt.imshow(data)` 显示热力图\n• 使用 `cmap` 参数设置颜色映射\n• 添加 `plt.colorbar()` 显示颜色条'
    };
    
    return tips[chartType] || '\n**💡 通用图表提示**:\n• 使用 `plt.figure(figsize=(宽, 高))` 设置画布大小\n• 使用 `plt.tight_layout()` 防止标签重叠\n• 使用 `plt.show()` 显示图表';
  }

  /**
   * 🎯 降级上下文构建
   */
  _buildFallbackContext(skillData, userQuery) {
    console.log('🔄 [使用降级方案构建上下文]');
    
    let content = `## 🐍 Python沙盒工具\n\n`;
    
    // 提取最关键的信息
    const keySections = [
      skillData.content.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i),
      skillData.content.match(/## 🚀 输出规范 - 后端实际支持的格式[\s\S]*?(?=\n##\s|$)/i)
    ].filter(Boolean);
    
    keySections.forEach(section => {
      if (section) {
        const truncated = section[0].length > 1500 
          ? section[0].substring(0, 1500) + '...'
          : section[0];
        content += truncated + '\n\n';
      }
    });
    
    // 添加一个代码示例
    const codeBlock = skillData.content.match(/```python[\s\S]*?```/);
    if (codeBlock) {
      content += `## 💻 代码示例\n\n${codeBlock[0]}\n\n`;
    }
    
    // 添加执行指导
    content += `## 🚀 快速使用\n\n`;
    content += `1. 遵循上面的调用结构格式\n`;
    content += `2. 图表输出使用 \`plt.show()\`\n`;
    content += `3. 文件输出使用指定的JSON格式\n`;
    content += `4. 复杂任务可查阅完整参考文件\n`;
    
    return content;
  }

  /**
   * 🎯 从查询中提取图表类型
   */
  _extractChartType(userQuery) {
    const queryLower = userQuery.toLowerCase();
    
    const chartKeywords = {
      '折线图': ['折线图', '折线', 'line', 'line_chart', '趋势图'],
      '饼图': ['饼图', 'pie', 'pie_chart', '扇形图', '占比图'],
      '条形图': ['条形图', '柱状图', 'bar', 'bar_chart', '柱形图'],
      '散点图': ['散点图', 'scatter', 'scatter_plot', '散点', '点图'],
      '热力图': ['热力图', 'heatmap', '热图'],
      '直方图': ['直方图', 'histogram', '分布图']
    };
    
    for (const [chartType, keywords] of Object.entries(chartKeywords)) {
      for (const keyword of keywords) {
        if (queryLower.includes(keyword)) {
          console.log(`🎯 [图表类型识别] ${chartType} (通过关键词: ${keyword})`);
          return chartType;
        }
      }
    }
    
    return null;
  }

  /**
   * 🎯 查找相关参考文件
   */
  _findRelevantReferences(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const matchedRefs = new Set();
    
    // 优先匹配具体图表类型
    const chartType = this._extractChartType(userQuery);
    if (chartType) {
      matchedRefs.add('matplotlib_cookbook.md');
    }
    
    // 关键词匹配
    for (const [keyword, refFile] of Object.entries(this.pythonReferenceMap)) {
      if (queryLower.includes(keyword)) {
        const baseFile = refFile.split(':')[0];
        matchedRefs.add(baseFile);
      }
    }
    
    // 默认文件
    if (matchedRefs.size === 0) {
      matchedRefs.add('matplotlib_cookbook.md');
    }
    
    return Array.from(matchedRefs);
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