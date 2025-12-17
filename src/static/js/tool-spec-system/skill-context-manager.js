// src/tool-spec-system/skill-context-manager.js
// 🎯 精准修复版 - 只修复核心问题，保持现有架构

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
   * 🚀 增强的Python沙盒上下文构建（修复版）
   */
  async _buildEnhancedPythonSandboxContext(skill, userQuery, sessionId, context = {}) {
    try {
        const { skill: skillData, score, name, description } = skill;
        
        console.log(`🔍 [增强Python沙盒-修复版] 查询: "${userQuery.substring(0, 50)}..."`);
        console.log(`📊 [技能数据检查]`, {
            hasContent: !!skillData.content,
            contentLength: skillData.content?.length || 0,
            hasResources: !!skillData.resources,
            resourcesCount: Object.keys(skillData.resources?.references || {}).length,
            referenceFiles: Object.keys(skillData.resources?.references || {})
        });
        
        // 🎯 修复1：确保skillData.content存在且有效
        if (!skillData.content || skillData.content.length < 100) {
            console.error('🚨 [严重错误] skillData.content 为空或太小');
            // 降级到fallback内容
            return this._buildFallbackContent(skillData, userQuery);
        }
        
        // 🎯 修复2：先检查缓存（保持原有逻辑）
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
        
        // 🎯 修复3：获取完整的技能数据
        const mainContent = skillData.content; // 主SKILL.md内容
        const references = skillData.resources?.references || {}; // 参考文件内容映射
        
        console.log(`📚 [文档统计-修复] 主文档: ${mainContent.length}字符, 参考文件: ${Object.keys(references).length}个`);
        
        // 🎯 修复4：分析用户查询，推断相关参考文件
        const relevantRefs = this._findRelevantReferencesFix(userQuery);
        console.log(`📚 [相关参考文件-修复] ${relevantRefs.length}个:`, relevantRefs);
        
        // 🎯 修复5：构建上下文内容
        // 5.1 添加主文档的关键部分
        const mainKeyContent = this._extractKeySectionsFromMainDocFix(mainContent);
        contextContent += mainKeyContent;
        
        // 5.2 添加相关参考文件的内容
        if (relevantRefs.length > 0) {
            contextContent += `\n## 📚 相关参考指南\n\n`;
            
            for (const refFile of relevantRefs.slice(0, 2)) { // 最多2个参考文件
                if (references[refFile]) {
                    const refContent = references[refFile];
                    console.log(`📖 [提取参考文件-修复] ${refFile}, 大小: ${refContent.length}字符`);
                    
                    // 提取参考文件的关键内容
                    const extracted = this._extractKeyContentFromReferenceFix(refContent, refFile, userQuery);
                    if (extracted && extracted.length > 100) {
                        contextContent += `### 📖 ${refFile.replace('.md', '')}\n\n`;
                        contextContent += extracted + '\n\n';
                    }
                }
            }
        }
        
        // 🎯 修复6：如果内容太少，添加库推荐
        if (contextContent.length < 1500) {
            console.log('⚠️ [内容过少-修复] 添加库推荐');
            const librarySuggestions = this.skillManager?.suggestPythonLibrariesForQuery?.(userQuery) || [];
            if (librarySuggestions.length > 0) {
                contextContent += `\n## 📚 推荐使用的Python库\n`;
                
                librarySuggestions.forEach(suggestion => {
                    contextContent += `\n### ${suggestion.category}\n`;
                    contextContent += `**适用任务**: ${suggestion.tasks.join('、')}\n`;
                    contextContent += `**推荐库**: ${suggestion.libraries.join(', ')}\n`;
                });
            }
        }
        
        // 🎯 修复7：添加Python沙盒专用提醒
        contextContent += `\n**🚨 输出规范**:\n`;
        contextContent += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
        contextContent += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
        contextContent += `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
        
        console.log(`✅ [上下文构建完成-修复] 总长度: ${contextContent.length}字符`);
        
        // 🎯 修复8：压缩内容
        let compressedContent = contextContent;
        if (this.skillManager.cacheCompressor) {
            try {
                compressedContent = await this.skillManager.cacheCompressor.compressKnowledge(
                    contextContent,
                    {
                        level: 'smart',
                        maxChars: 12000,
                        userQuery: userQuery,
                        toolName: 'python_sandbox'
                    }
                );
                console.log(`📦 [压缩完成-修复] ${contextContent.length} → ${compressedContent.length}字符`);
            } catch (compressError) {
                console.error('🚨 [内容压缩失败-修复]', compressError);
            }
        }
        
        // 缓存结果
        try {
            this.skillManager.cacheCompressor.setToCache(
                'python_sandbox', 
                userQuery, 
                { sessionId, ...context }, 
                compressedContent
            );
        } catch (cacheError) {
            console.error('🚨 [缓存写入失败-修复]', cacheError);
        }
        
        // 记录注入
        try {
            this.skillManager.cacheCompressor.recordToolInjection(sessionId, 'python_sandbox');
        } catch (recordError) {
            console.error('🚨 [工具注入记录失败-修复]', recordError);
        }
        
        contextContent += compressedContent;
        return contextContent;
    } catch (error) {
        console.error(`🚨 [Python沙盒上下文构建失败] ${error.message}`, {
            error,
            userQuery: userQuery.substring(0, 50),
            sessionId
        });
        
        // 返回基础的降级内容
        try {
            return this._buildFallbackContent(skill.skill, userQuery);
        } catch (fallbackError) {
            console.error(`🚨 [降级内容构建失败] ${fallbackError.message}`);
            return `### 🐍 Python沙盒工具 (降级模式)\n\n由于系统错误，无法提供详细的上下文信息，请直接使用Python沙盒工具执行代码。`;
        }
    }
  }

  /**
   * 🎯 修复：从主文档提取关键章节
   */
  _extractKeySectionsFromMainDocFix(mainContent) {
    let extracted = '';
    
    console.log(`📄 [提取主文档-修复] 文档长度: ${mainContent.length}`);
    
    // 必须包含的关键章节
    const keySections = [
        { pattern: /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i, name: '调用结构' },
        { pattern: /## 📋 基础调用规范[\s\S]*?(?=\n##\s|$)/i, name: '基础调用' },
        { pattern: /## 🚀 输出规范[\s\S]*?(?=\n##\s|$)/i, name: '输出规范' },
        { pattern: /## ⚠️ 重要限制与最佳实践[\s\S]*?(?=\n##\s|$)/i, name: '限制实践' }
    ];
    
    for (const { pattern, name } of keySections) {
        const match = mainContent.match(pattern);
        if (match) {
            console.log(`✅ [提取主文档章节-修复] ${name}: ${match[0].length}字符`);
            extracted += match[0] + '\n\n';
        }
    }
    
    // 如果提取的内容太少，添加通用部分
    if (extracted.length < 500) {
        const firstSection = mainContent.substring(0, Math.min(2000, mainContent.length));
        extracted = firstSection + '\n\n';
        console.log(`📝 [提取主文档通用部分-修复] ${firstSection.length}字符`);
    }
    
    console.log(`📊 [主文档提取完成-修复] 总长度: ${extracted.length}字符`);
    return extracted;
  }

  /**
   * 🎯 修复：查找相关参考文件
   */
  _findRelevantReferencesFix(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const matchedRefs = new Set();
    
    console.log(`🔍 [参考文件匹配-修复] 查询: "${queryLower}"`);
    
    // 1. 基于关键词精确匹配
    for (const [keyword, refFile] of Object.entries(this.pythonReferenceMap)) {
        if (queryLower.includes(keyword)) {
            matchedRefs.add(refFile);
            console.log(`✅ [关键词匹配-修复] "${keyword}" → ${refFile}`);
        }
    }
    
    // 2. 基于任务类型推断
    if (queryLower.includes('可视化') || queryLower.includes('画图') || queryLower.includes('图表')) {
        matchedRefs.add('matplotlib_cookbook.md');
        console.log(`📊 [任务推断-修复] 可视化任务 → matplotlib_cookbook.md`);
    }
    
    if (queryLower.includes('数据') && (queryLower.includes('处理') || queryLower.includes('分析'))) {
        matchedRefs.add('pandas_cheatsheet.md');
        console.log(`📊 [任务推断-修复] 数据处理任务 → pandas_cheatsheet.md`);
    }
    
    if (queryLower.includes('报告') || queryLower.includes('文档') || queryLower.includes('生成')) {
        matchedRefs.add('report_generator_workflow.md');
        console.log(`📊 [任务推断-修复] 报告生成任务 → report_generator_workflow.md`);
    }
    
    // 3. 确保至少有一个参考文件
    if (matchedRefs.size === 0) {
        console.log(`📚 [默认参考文件-修复] 添加matplotlib和pandas`);
        matchedRefs.add('matplotlib_cookbook.md');
        matchedRefs.add('pandas_cheatsheet.md');
    }
    
    const result = Array.from(matchedRefs);
    console.log(`📚 [最终匹配参考文件-修复] ${result.length}个:`, result);
    return result;
  }

  /**
   * 🎯 修复：从参考文件提取关键内容
   */
  _extractKeyContentFromReferenceFix(refContent, refFileName, userQuery) {
    if (!refContent || refContent.length < 100) {
        console.warn(`📄 [参考文件太小-修复] ${refFileName}: ${refContent?.length || 0}字符`);
        return refContent || '';
    }
    
    console.log(`📝 [参考文件提取-修复] ${refFileName}: ${refContent.length}字符`);
    
    const queryLower = userQuery.toLowerCase();
    let extracted = '';
    
    // 1. 提取参考文件的标题和简介
    const titleMatch = refContent.match(/^#\s+([^\n]+)/m);
    if (titleMatch) {
        extracted += `## ${titleMatch[1]}\n\n`;
    }
    
    // 2. 提取文件的前几段（简介部分）
    const paragraphs = refContent.split('\n\n');
    let introCount = 0;
    for (const para of paragraphs) {
        if (para.trim() && !para.trim().startsWith('#') && para.length > 50) {
            extracted += para + '\n\n';
            introCount++;
            if (introCount >= 3) break; // 最多3段
        }
    }
    
    // 3. 提取与查询相关的代码示例
    const codeBlocks = refContent.match(/```[\s\S]*?```/g) || [];
    if (codeBlocks.length > 0) {
        extracted += `\n**💻 相关代码示例**:\n\n`;
        
        // 选择前2个代码块
        codeBlocks.slice(0, 2).forEach(block => {
            extracted += block + '\n\n';
        });
    }
    
    // 4. 根据文件类型提取特定内容
    if (refFileName.includes('matplotlib') && (queryLower.includes('折线图') || queryLower.includes('饼图'))) {
        // 查找具体的图表类型部分
        const chartPattern = new RegExp(`(#{1,3}\\s*.*?${queryLower.includes('折线图') ? '折线图' : '饼图'}.*?[\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i');
        const chartMatch = refContent.match(chartPattern);
        if (chartMatch) {
            extracted += `\n**📈 具体图表指南**:\n\n${chartMatch[0].substring(0, 1500)}...\n\n`;
        }
    }
    
    // 5. 限制总长度
    if (extracted.length > 3500) {
        extracted = extracted.substring(0, 3500) + '\n\n...*(内容截断，完整内容请参考原文件)*';
    }
    
    console.log(`✅ [参考文件提取完成-修复] ${extracted.length}字符`);
    return extracted;
  }

  /**
   * 🎯 修复：分析查询，推断相关文档和章节
   */
  _analyzeQueryForSections(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const relevantDocuments = [];
    const relevantSections = [];
    
    console.log(`🔍 [章节推断-修复] 查询: "${queryLower}"`);
    
    // 🎯 修复：直接匹配参考文件，而不是章节
    for (const [docName, docInfo] of Object.entries(this.enhancedPythonSectionMap)) {
        // 检查文档关键词
        const docMatch = docInfo.keywords.some(keyword => 
            queryLower.includes(keyword.toLowerCase())
        );
        
        if (docMatch) {
            relevantDocuments.push(docName);
            console.log(`✅ [文档匹配-修复] ${docName}`);
            
            // 🎯 修复：不提取具体章节，只返回文档名
            // 具体章节提取在后续步骤中进行
        }
    }
    
    // 🎯 修复：确保至少有一个文档
    if (relevantDocuments.length === 0) {
        console.log('📚 [默认文档-修复] 添加matplotlib_cookbook.md');
        relevantDocuments.push('matplotlib_cookbook.md');
    }
    
    // 🎯 修复：不返回章节，只返回文档
    // 章节提取逻辑在后续的_extractKeyContentFromReferenceFix中处理
    
    return {
        relevantDocuments: relevantDocuments,
        relevantSections: [], // 🎯 修复：返回空数组，章节提取在后续步骤
        hasExactSectionMatch: false
    };
  }

  /**
   * 🎯 修复：从文档中提取指定章节内容
   */
  _extractSectionContent(docContent, sectionName) {
    // 🎯 修复：增强输入验证
    if (!docContent || typeof docContent !== 'string') {
        console.warn('📚 [章节提取-修复] 无效的文档内容');
        return '';
    }
    
    if (!sectionName || typeof sectionName !== 'string') {
        console.warn('📚 [章节提取-修复] 无效的章节名称');
        return '';
    }
    
    console.log(`📚 [章节提取-修复] 查找章节: "${sectionName}", 文档大小: ${docContent.length}字符`);
    
    // 🎯 修复：检查是否是参考文件（.md文件）
    if (sectionName.includes('.md')) {
        // 这是整个参考文件，直接返回前3000字符
        console.log(`📄 [提取整个参考文件-修复] ${sectionName}: ${docContent.length}字符`);
        const content = docContent.substring(0, Math.min(3000, docContent.length));
        return content + (docContent.length > 3000 ? '...' : '');
    }
    
    // 🎯 修复：增强正则表达式匹配
    const patterns = [
        // 策略1：精确章节标题匹配 (### 章节标题)
        new RegExp(`(#{1,3}\\s*${this._escapeRegex(sectionName)}[\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i'),
        // 策略2：模糊标题匹配 (包含章节名)
        new RegExp(`(#{1,3}\\s+[^\\n]*${this._escapeRegex(sectionName)}[^\\n]*\\n[\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i')
    ];
    
    for (const pattern of patterns) {
        try {
            const match = docContent.match(pattern);
            if (match && match[0].length > 100) {
                const content = match[0];
                console.log(`✅ [章节提取成功-修复] "${sectionName}": ${content.length}字符`);
                
                // 限制长度
                if (content.length > 2500) {
                    return content.substring(0, 2500) + '...\n*(内容截断)*';
                }
                return content;
            }
        } catch (error) {
            console.warn('⚠️ 正则匹配失败-修复:', error);
        }
    }
    
    // 🎯 修复：如果找不到章节，返回文档开头部分
    console.log(`🔄 [章节提取降级-修复] 未找到"${sectionName}"，返回文档开头`);
    const fallback = docContent.substring(0, Math.min(2000, docContent.length));
    return fallback + (docContent.length > 2000 ? '...' : '');
  }

  /**
   * 🎯 修复：转义正则表达式特殊字符
   */
  _escapeRegex(string) {
    if (!string || typeof string !== 'string') return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 🎯 修复：降级内容构建
   */
  _buildFallbackContent(skillData, userQuery) {
    console.log('🔄 [降级内容构建-修复]');
    
    let content = '';
    const mainContent = skillData.content || '';
    
    // 1. 提取主文档的关键部分
    if (mainContent.length > 0) {
        // 提取调用结构和输出规范
        const structureMatch = mainContent.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i);
        if (structureMatch) {
            content += structureMatch[0] + '\n\n';
        }
        
        // 如果内容太少，添加更多
        if (content.length < 1000) {
            const intro = mainContent.substring(0, Math.min(1500, mainContent.length));
            content += intro + (mainContent.length > 1500 ? '...' : '') + '\n\n';
        }
    }
    
    // 2. 添加基本指导
    content += `**💡 基本指导**:\n`;
    content += `• 使用 python_sandbox 工具执行Python代码\n`;
    content += `• 图片输出必须使用包含 type: "image" 的JSON对象\n`;
    content += `• 复杂任务请参考相关参考文件\n`;
    
    console.log(`✅ [降级内容构建完成-修复] ${content.length}字符`);
    return content;
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