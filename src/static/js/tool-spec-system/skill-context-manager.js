// src/tool-spec-system/skill-context-manager.js
// 🚨 完全重写版：修复章节推断和文档传递问题

import { skillManagerPromise } from './skill-manager.js';

class SkillContextManager {
  constructor() {
    this.skillManager = null;
    this.initialized = false;
    this.cacheCompressor = null;
    
    // 初始化时获取技能管理器和缓存压缩器
    skillManagerPromise.then(skillManager => {
        this.skillManager = skillManager;
        this.cacheCompressor = skillManager.cacheCompressor;
        console.log('✅ SkillContextManager 已正确初始化');
    }).catch(error => {
        console.error('❌ SkillContextManager 初始化失败:', error);
    });
    
    // 🚨 正确配置：参考文件映射（基于实际文件结构）
    this.referenceFileMapping = {
      // 可视化相关
      'matplotlib': 'matplotlib_cookbook.md',
      '可视化': 'matplotlib_cookbook.md',
      '图表': 'matplotlib_cookbook.md',
      '画图': 'matplotlib_cookbook.md',
      'plot': 'matplotlib_cookbook.md',
      'chart': 'matplotlib_cookbook.md',
      '折线图': 'matplotlib_cookbook.md',
      '饼图': 'matplotlib_cookbook.md',
      '条形图': 'matplotlib_cookbook.md',
      '散点图': 'matplotlib_cookbook.md',
      '热力图': 'matplotlib_cookbook.md',
      '图形': 'matplotlib_cookbook.md',
      '数据可视化': 'matplotlib_cookbook.md',
      
      // 数据处理相关
      'pandas': 'pandas_cheatsheet.md',
      '数据': 'pandas_cheatsheet.md',
      '数据处理': 'pandas_cheatsheet.md',
      '数据清洗': 'pandas_cheatsheet.md',
      '数据分析': 'pandas_cheatsheet.md',
      'dataframe': 'pandas_cheatsheet.md',
      'excel': 'pandas_cheatsheet.md',
      'csv': 'pandas_cheatsheet.md',
      '表格': 'pandas_cheatsheet.md',
      '清洗': 'pandas_cheatsheet.md',
      
      // 机器学习相关
      '机器学习': 'ml_workflow.md',
      '模型': 'ml_workflow.md',
      '训练': 'ml_workflow.md',
      '预测': 'ml_workflow.md',
      '分类': 'ml_workflow.md',
      '回归': 'ml_workflow.md',
      'xgboost': 'ml_workflow.md',
      'lightgbm': 'ml_workflow.md',
      'ml': 'ml_workflow.md',
      
      // 报告生成相关
      '报告': 'report_generator_workflow.md',
      '文档': 'report_generator_workflow.md',
      'word': 'report_generator_workflow.md',
      'excel': 'report_generator_workflow.md', // 注意：这个可能同时映射到pandas
      'pdf': 'report_generator_workflow.md',
      'ppt': 'report_generator_workflow.md',
      '生成': 'report_generator_workflow.md',
      '自动化': 'report_generator_workflow.md',
      
      // 数学计算相关
      '数学': 'sympy_cookbook.md',
      '公式': 'sympy_cookbook.md',
      '计算': 'sympy_cookbook.md',
      '方程': 'sympy_cookbook.md',
      '微积分': 'sympy_cookbook.md',
      '代数': 'sympy_cookbook.md',
      'sympy': 'sympy_cookbook.md',
      '证明': 'sympy_cookbook.md',
      
      // 科学计算相关
      '科学计算': 'scipy_cookbook.md',
      'scipy': 'scipy_cookbook.md',
      '优化': 'scipy_cookbook.md',
      '统计': 'scipy_cookbook.md',
      '数值': 'scipy_cookbook.md',
      
      // 文本分析相关
      '文本': 'text_analysis_cookbook.md',
      '字符串': 'text_analysis_cookbook.md',
      '正则': 'text_analysis_cookbook.md',
      '提取': 'text_analysis_cookbook.md',
      '解析': 'text_analysis_cookbook.md'
    };
    
    // 参考文件中的关键章节映射
    this.referenceSectionsMapping = {
      'matplotlib_cookbook.md': [
        '核心使用方法',
        '可直接使用的代码模板',
        '图表类型选择指南',
        '流程图与架构图生成指南',
        '样式配置与字体设置'
      ],
      'pandas_cheatsheet.md': [
        '文件操作（会话工作区：/data）',
        '数据可视化（自动捕获）',
        '数据处理（简洁实用版）',
        '性能优化（针对大文件）'
      ],
      'ml_workflow.md': [
        '基础机器学习模板',
        '回归分析完整工作流',
        '分类分析完整工作流',
        '时间序列分析',
        '模型优化与调参'
      ],
      'report_generator_workflow.md': [
        'Word 报告生成 (.docx)',
        'Excel 报告生成 (.xlsx)',
        'PDF 报告生成 (.pdf)',
        'PowerPoint 报告生成 (.pptx)'
      ],
      'sympy_cookbook.md': [
        '基础符号运算',
        '方程求解',
        '微积分运算'
      ],
      'scipy_cookbook.md': [
        '优化与方程求解',
        '数值积分',
        '统计计算'
      ],
      'text_analysis_cookbook.md': [
        '快速开始模板',
        '输出格式规范',
        '专业分析工具箱'
      ]
    };
    
    console.log('✅ SkillContextManager 重写完成，使用正确的文件映射');
  }

  async ensureInitialized() {
    if (this.initialized) return true;
    
    try {
      if (!this.skillManager) {
        this.skillManager = await skillManagerPromise;
      }
      this.initialized = true;
      console.log('✅ SkillContextManager 确保初始化完成');
      return true;
    } catch (error) {
      console.error('❌ SkillContextManager 确保初始化失败:', error);
      return false;
    }
  }

  /**
   * 🚨 核心方法：为模型请求生成智能上下文（修复版）
   */
  async generateRequestContext(userQuery, availableTools = [], modelConfig = {}, context = {}) {
    if (!await this.ensureInitialized()) {
      return { 
        enhancedPrompt: userQuery, 
        relevantTools: [],
        contextLevel: 'none'
      };
    }

    console.log(`🔍 [技能上下文生成-修复版] 查询: "${userQuery.substring(0, 50)}..."`, {
      可用工具数: availableTools.length,
      模型: modelConfig.name,
      会话ID: context.sessionId || 'default'
    });

    // 🚨 修复：构建正确的技能上下文
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
      ? await this._buildEnhancedPromptWithComplexToolsFix(userQuery, relevantSkills, modelConfig, context)
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
   * 🚨 修复：构建包含复杂工具的增强提示词
   */
  async _buildEnhancedPromptWithComplexToolsFix(userQuery, relevantSkills, modelConfig, context = {}) {
    let contextPrompt = `## 🎯 智能工具指南 (检测到复杂工具)\n\n`;
    
    // 分别处理每个复杂工具
    for (const skill of relevantSkills) {
      if (skill.toolName === 'crawl4ai') {
        contextPrompt += await this._buildCrawl4AIContext(skill, userQuery);
      } else if (skill.toolName === 'python_sandbox') {
        // 🚨 使用修复版的Python沙盒上下文构建
        contextPrompt += await this._buildEnhancedPythonSandboxContextFix(skill, userQuery, context.sessionId, context);
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
   * 🚨 核心修复：增强的Python沙盒上下文构建
   * 修复章节推断和文档传递问题
   */
  async _buildEnhancedPythonSandboxContextFix(skill, userQuery, sessionId, context = {}) {
    try {
        const { skill: skillData, score, name, description } = skill;
        
        console.log(`🔍 [Python沙盒修复版] 查询: "${userQuery.substring(0, 50)}..."`);
        console.log(`📊 [技能数据检查]`, {
            hasSkillData: !!skillData,
            hasContent: !!skillData?.content,
            contentLength: skillData?.content?.length || 0,
            hasResources: !!skillData?.resources,
            hasReferences: !!skillData?.resources?.references,
            referenceCount: Object.keys(skillData?.resources?.references || {}).length,
            referenceFiles: Object.keys(skillData?.resources?.references || {})
        });
        
        // 🚨 1. 获取完整的技能数据（包括主文档和参考文件）
        if (!skillData || !skillData.content) {
            console.error('🚨 [致命错误] skillData 为空或没有 content');
            return this._buildFallbackContext(skill, userQuery);
        }
        
        const mainContent = skillData.content; // 主SKILL.md内容
        const references = skillData.resources?.references || {}; // 参考文件内容
        
        console.log(`📚 [文档统计] 主文档: ${mainContent.length}字符, 参考文件: ${Object.keys(references).length}个`);
        
        // 🚨 2. 分析用户查询，推断相关参考文件
        const relevantRefs = this._findRelevantReferencesFix(userQuery);
        console.log(`📚 [相关参考文件] ${relevantRefs.length}个:`, relevantRefs);
        
        // 🚨 3. 构建上下文内容
        let contextContent = `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
        contextContent += `**核心功能**: ${description}\n\n`;
        
        // 🚨 4. 添加主文档的关键部分
        const mainKeyContent = this._extractKeySectionsFromMainDoc(mainContent);
        contextContent += mainKeyContent;
        
        // 🚨 5. 添加相关参考文件的内容
        if (relevantRefs.length > 0) {
            contextContent += `\n## 📚 相关参考指南\n\n`;
            
            for (const refFile of relevantRefs.slice(0, 2)) { // 最多2个参考文件
                if (references[refFile]) {
                    const refContent = references[refFile];
                    console.log(`📖 [提取参考文件] ${refFile}, 大小: ${refContent.length}字符`);
                    
                    // 提取参考文件的关键内容
                    const extracted = this._extractKeyContentFromReference(refContent, refFile, userQuery);
                    if (extracted && extracted.length > 100) {
                        contextContent += `### 📖 ${refFile.replace('.md', '')}\n\n`;
                        contextContent += extracted + '\n\n';
                    }
                }
            }
        }
        
        // 🚨 6. 添加Python沙盒专用提醒
        contextContent += `\n**🚨 输出规范**:\n`;
        contextContent += `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n`;
        contextContent += `• 文件输出：必须使用包含 type: "word|excel|..." 和 data_base64 的JSON对象\n`;
        contextContent += `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
        
        console.log(`✅ [上下文构建完成] 总长度: ${contextContent.length}字符`);
        
        // 🚨 7. 压缩内容
        let finalContent = contextContent;
        if (this.cacheCompressor && contextContent.length > 1000) {
            try {
                finalContent = await this.cacheCompressor.compressKnowledge(
                    contextContent,
                    {
                        level: 'smart',
                        maxChars: 12000,
                        userQuery: userQuery,
                        toolName: 'python_sandbox'
                    }
                );
                console.log(`📦 [压缩完成] ${contextContent.length} → ${finalContent.length}字符`);
            } catch (compressError) {
                console.error('🚨 [压缩失败]', compressError);
            }
        }
        
        return finalContent;
        
    } catch (error) {
        console.error(`🚨 [Python沙盒上下文构建失败] ${error.message}`, {
            error,
            userQuery: userQuery.substring(0, 50),
            sessionId
        });
        
        // 最后的兜底方案
        return `### 🐍 Python沙盒工具 (降级模式)\n\n**核心功能**: 在沙盒环境中执行Python代码，用于数据分析、可视化、机器学习等任务。\n\n` +
               `**基本调用格式**:\n\`\`\`json\n{\n  "tool_name": "python_sandbox",\n  "parameters": {\n    "code": "你的Python代码"\n  }\n}\n\`\`\`\n\n` +
               `**输出规范**:\n• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象`;
    }
  }

  /**
   * 🚨 修复：查找相关参考文件
   */
  _findRelevantReferencesFix(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const matchedRefs = new Set();
    
    console.log(`🔍 [参考文件匹配修复] 查询: "${queryLower}"`);
    
    // 1. 基于关键词精确匹配
    for (const [keyword, refFile] of Object.entries(this.referenceFileMapping)) {
        if (queryLower.includes(keyword)) {
            matchedRefs.add(refFile);
            console.log(`✅ [关键词匹配] "${keyword}" → ${refFile}`);
        }
    }
    
    // 2. 基于任务类型推断
    if (queryLower.includes('可视化') || queryLower.includes('画图') || queryLower.includes('图表')) {
        matchedRefs.add('matplotlib_cookbook.md');
    }
    
    if (queryLower.includes('数据') && (queryLower.includes('处理') || queryLower.includes('分析'))) {
        matchedRefs.add('pandas_cheatsheet.md');
    }
    
    if (queryLower.includes('报告') || queryLower.includes('文档') || queryLower.includes('生成')) {
        matchedRefs.add('report_generator_workflow.md');
    }
    
    // 3. 确保至少有一个参考文件
    if (matchedRefs.size === 0) {
        console.log(`📚 [默认参考文件] 添加matplotlib和pandas`);
        matchedRefs.add('matplotlib_cookbook.md');
        matchedRefs.add('pandas_cheatsheet.md');
    }
    
    const result = Array.from(matchedRefs);
    console.log(`📚 [最终匹配参考文件] ${result.length}个:`, result);
    return result;
  }

  /**
   * 🚨 从主SKILL.md提取关键章节
   */
  _extractKeySectionsFromMainDoc(mainContent) {
    let extracted = '';
    
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
            console.log(`✅ [提取主文档章节] ${name}: ${match[0].length}字符`);
            extracted += match[0] + '\n\n';
        }
    }
    
    // 如果提取的内容太少，添加通用部分
    if (extracted.length < 500) {
        const firstSection = mainContent.substring(0, Math.min(2000, mainContent.length));
        extracted = firstSection + '\n\n';
    }
    
    return extracted;
  }

  /**
   * 🚨 从参考文件提取关键内容
   */
  _extractKeyContentFromReference(refContent, refFileName, userQuery) {
    if (!refContent || refContent.length < 100) {
        console.warn(`📄 [参考文件太小] ${refFileName}: ${refContent?.length || 0}字符`);
        return refContent || '';
    }
    
    const queryLower = userQuery.toLowerCase();
    let extracted = '';
    
    // 1. 首先尝试提取整个文件的前面部分（包含标题和简介）
    const introSection = this._extractIntroduction(refContent, 1000);
    extracted += introSection;
    
    // 2. 根据参考文件类型提取特定章节
    const sections = this.referenceSectionsMapping[refFileName] || [];
    
    for (const section of sections) {
        // 检查这个章节是否与查询相关
        if (this._isSectionRelevant(section, queryLower)) {
            const sectionContent = this._extractSectionFromReference(refContent, section);
            if (sectionContent && sectionContent.length > 200) {
                extracted += '\n\n' + sectionContent;
                console.log(`✅ [提取参考章节] ${refFileName} - ${section}: ${sectionContent.length}字符`);
                
                // 最多提取2个相关章节
                if (extracted.length > 3000) {
                    break;
                }
            }
        }
    }
    
    // 3. 如果还是不够，添加一些代码示例
    if (extracted.length < 1500) {
        const codeExamples = this._extractCodeExamples(refContent, 2);
        if (codeExamples) {
            extracted += '\n\n**💻 代码示例**:\n' + codeExamples;
        }
    }
    
    // 4. 截断到合理长度
    if (extracted.length > 4000) {
        extracted = extracted.substring(0, 4000) + '\n\n...*(内容截断，完整内容请参考文档)*';
    }
    
    return extracted;
  }

  /**
   * 🚨 提取参考文件的介绍部分
   */
  _extractIntroduction(refContent, maxLength = 1000) {
    // 提取第一个标题和其后的内容
    const firstTitleMatch = refContent.match(/^#\s+([^\n]+)/m);
    if (!firstTitleMatch) return refContent.substring(0, Math.min(maxLength, refContent.length));
    
    const titleIndex = firstTitleMatch.index;
    const nextTitleMatch = refContent.substring(titleIndex + 10).match(/\n#{1,3}\s+/);
    
    let introEnd = refContent.length;
    if (nextTitleMatch) {
        introEnd = titleIndex + 10 + nextTitleMatch.index;
    }
    
    const intro = refContent.substring(titleIndex, Math.min(introEnd, titleIndex + maxLength));
    return intro;
  }

  /**
   * 🚨 判断章节是否相关
   */
  _isSectionRelevant(sectionName, queryLower) {
    const sectionLower = sectionName.toLowerCase();
    
    // 常见任务关键词
    const taskKeywords = [
        '画图', '图表', '可视化', 'plot', 'chart',
        '数据', '清洗', '处理', '分析',
        '报告', '生成', '文档',
        '模型', '训练', '预测',
        '计算', '公式', '数学'
    ];
    
    // 检查章节名是否包含查询中的关键词
    for (const keyword of taskKeywords) {
        if (queryLower.includes(keyword) && sectionLower.includes(keyword)) {
            return true;
        }
    }
    
    // 默认情况：如果章节名包含"代码"、"模板"、"示例"，也认为是相关的
    if (sectionLower.includes('代码') || sectionLower.includes('模板') || sectionLower.includes('示例')) {
        return true;
    }
    
    return false;
  }

  /**
   * 🚨 从参考文件提取特定章节
   */
  _extractSectionFromReference(refContent, sectionName) {
    // 转义正则特殊字符
    const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 尝试不同级别的标题
    const patterns = [
        new RegExp(`(#{1,3}\\s*${escapedSection}[\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i'),
        new RegExp(`(#{1,3}\\s*[^\\n]*?${escapedSection}[^\\n]*?\\n[\\s\\S]*?)(?=\\n#{1,3}\\s|$)`, 'i')
    ];
    
    for (const pattern of patterns) {
        const match = refContent.match(pattern);
        if (match && match[0].length > 100) {
            // 截断到合理长度
            const content = match[0];
            return content.length > 2000 ? content.substring(0, 2000) + '...' : content;
        }
    }
    
    return null;
  }

  /**
   * 🚨 提取代码示例
   */
  _extractCodeExamples(refContent, maxExamples = 2) {
    const codeBlocks = refContent.match(/```[\s\S]*?```/g);
    if (!codeBlocks || codeBlocks.length === 0) return null;
    
    let examples = '';
    let count = 0;
    
    for (const block of codeBlocks) {
        if (count >= maxExamples) break;
        
        // 只取python或json代码块
        if (block.includes('```python') || block.includes('```json') || !block.includes('```')) {
            examples += block + '\n\n';
            count++;
        }
    }
    
    return examples || null;
  }

  /**
   * 🚨 降级上下文
   */
  _buildFallbackContext(skill, userQuery) {
    const { name, description, score } = skill;
    
    return `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n` +
           `**核心功能**: ${description}\n\n` +
           `**基本调用格式**:\n\`\`\`json\n{\n  "tool_name": "python_sandbox",\n  "parameters": {\n    "code": "你的Python代码"\n  }\n}\n\`\`\`\n\n` +
           `**常用库**: pandas, matplotlib, numpy, scikit-learn\n` +
           `**输出规范**:\n• 图片输出：使用包含 type: "image" 和 image_base64 的JSON对象\n` +
           `**当前任务**: ${userQuery.substring(0, 100)}`;
  }

  /**
   * 🚀 crawl4ai 专用上下文构建
   */
  async _buildCrawl4AIContext(skill, userQuery) {
    const { skill: skillData, score, name, description } = skill;
    
    let context = `### 🕷️ 网页抓取工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
    context += `**核心功能**: ${description}\n\n`;
    
    // 提取关键调用结构
    const keyInfo = this._extractCrawl4AIKeyInformation(skillData.content, userQuery);
    context += keyInfo;
    
    // 添加专用提醒
    context += `**🚨 关键规范**:\n`;
    context += `• 所有参数必须嵌套在 "parameters" 对象内\n`;
    context += `• URL必须以 http:// 或 https:// 开头\n`;
    context += `• extract模式必须使用 "schema_definition" 参数名\n`;
    
    return context;
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

    return keyInfo;
  }

  /**
   * 标准技能上下文构建
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