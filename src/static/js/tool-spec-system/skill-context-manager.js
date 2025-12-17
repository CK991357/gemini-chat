// src/tool-spec-system/skill-context-manager.js
// 🎯 完整修复版 - 支持所有工具类型

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
    
    // 🎯 工具类型分类
    this.toolCategories = {
      // 基础工具（只有SKILL.md）
      'basic_tools': ['crawl4ai', 'firecrawl', 'glm4v_analyze_image', 'stockfish_analyzer', 'tavily_search'],
      
      // 复杂工具（SKILL.md + 参考文件）
      'complex_tools': ['python_sandbox']
    };
    
    // Python沙盒参考文件映射
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
    
    console.log('✅ SkillContextManager 已加载，支持所有工具类型');
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
   * 🎯 核心方法：为模型请求生成智能上下文（完整修复版）
   */
  async generateRequestContext(userQuery, availableTools = [], modelConfig = {}, context = {}) {
    if (!await this.ensureInitialized()) {
      return { 
        enhancedPrompt: userQuery, 
        relevantTools: [],
        contextLevel: 'none'
      };
    }

    console.log(`🔍 [技能上下文生成-完整版] 查询: "${userQuery.substring(0, 50)}..."`, {
      可用工具数: availableTools.length,
      模型: modelConfig.name,
      会话ID: context.sessionId || 'default'
    });

    // 构建技能上下文
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

    // 2. 生成增强的提示词
    const enhancedPrompt = await this._buildCompleteEnhancedPrompt(userQuery, relevantSkills, context);
    
    return {
      enhancedPrompt,
      relevantTools: relevantSkills.map(skill => skill.toolName),
      contextLevel: relevantSkills.length > 1 ? 'multi' : 'single',
      skillCount: relevantSkills.length,
      sessionId: context.sessionId || 'default'
    };
  }

  /**
   * 🎯 构建完整的增强提示词（支持所有工具）
   */
  async _buildCompleteEnhancedPrompt(userQuery, relevantSkills, context = {}) {
    let contextPrompt = `## 🎯 智能工具指南\n\n`;
    
    // 分别处理每个技能
    for (const skill of relevantSkills) {
      const toolName = skill.toolName;
      
      // 根据工具类型选择处理方法
      if (toolName === 'python_sandbox') {
        contextPrompt += await this._buildPythonSandboxContext(skill, userQuery, context.sessionId, context);
      } else if (toolName === 'crawl4ai') {
        contextPrompt += await this._buildCrawl4AIContext(skill, userQuery, context.sessionId, context);
      } else {
        // 其他基础工具
        contextPrompt += await this._buildBasicToolContext(skill, userQuery, context.sessionId, context);
      }
      
      contextPrompt += '\n\n';
    }

    // 添加通用指导
    contextPrompt += `## 💡 执行指导\n`;
    contextPrompt += `请基于以上详细指南来响应用户请求。注意工具的特殊调用规范。\n\n`;
    contextPrompt += `---\n\n## 👤 用户原始请求\n${userQuery}`;

    return contextPrompt;
  }

  /**
   * 🎯 Python沙盒上下文构建（完整版）
   */
  async _buildPythonSandboxContext(skill, userQuery, sessionId, context = {}) {
    try {
        const { skill: skillData, score, name, description } = skill;
        
        console.log(`🔍 [Python沙盒上下文] 工具: ${name}, 查询: "${userQuery.substring(0, 50)}..."`);
        console.log(`📊 [技能数据检查]`, {
            hasContent: !!skillData.content,
            contentLength: skillData.content?.length || 0,
            hasReferences: !!skillData.resources?.references,
            referenceCount: Object.keys(skillData.resources?.references || {}).length
        });
        
        // 1. 获取完整的技能数据
        if (!skillData || !skillData.content) {
            console.error('🚨 [Python沙盒错误] skillData 为空');
            return this._buildToolFallback(name, description, score, userQuery);
        }
        
        const mainContent = skillData.content; // 主SKILL.md
        const references = skillData.resources?.references || {};
        
        console.log(`📚 [Python沙盒文档] 主文档: ${mainContent.length}字符, 参考文件: ${Object.keys(references).length}个`);
        
        // 2. 检查缓存
        let contextContent = `### 🐍 Python沙盒工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
        contextContent += `**核心功能**: ${description}\n\n`;
        
        const cachedContent = this._getCachedContent('python_sandbox', userQuery, sessionId, context);
        if (cachedContent) {
            contextContent += cachedContent;
            console.log(`🎯 [Python沙盒缓存命中] ${cachedContent.length}字符`);
            return contextContent;
        }
        
        // 3. 提取主文档的关键部分
        const mainKeyContent = this._extractMainDocKeySections(mainContent);
        contextContent += mainKeyContent;
        
        // 4. 查找并添加相关参考文件
        const relevantRefs = this._findPythonReferences(userQuery);
        if (relevantRefs.length > 0) {
            contextContent += `\n## 📚 相关参考指南\n\n`;
            
            for (const refFile of relevantRefs.slice(0, 2)) {
                if (references[refFile]) {
                    const refContent = references[refFile];
                    const extracted = this._extractReferenceContent(refContent, refFile, userQuery);
                    if (extracted && extracted.length > 100) {
                        contextContent += `### 📖 ${refFile.replace('.md', '')}\n\n`;
                        contextContent += extracted + '\n\n';
                    }
                }
            }
        }
        
        // 5. 添加输出规范
        contextContent += this._getPythonOutputSpec();
        
        console.log(`✅ [Python沙盒构建完成] ${contextContent.length}字符`);
        
        // 6. 压缩并缓存
        return await this._compressAndCache(contextContent, 'python_sandbox', userQuery, sessionId, context);
        
    } catch (error) {
        console.error(`🚨 [Python沙盒构建失败] ${error.message}`, error);
        return this._buildToolFallback(skill.name, skill.description, skill.score, userQuery);
    }
  }

  /**
   * 🎯 Crawl4AI上下文构建（完整版）
   */
  async _buildCrawl4AIContext(skill, userQuery, sessionId, context = {}) {
    try {
        const { skill: skillData, score, name, description } = skill;
        
        console.log(`🔍 [Crawl4AI上下文] 工具: ${name}, 查询: "${userQuery.substring(0, 50)}..."`);
        
        if (!skillData || !skillData.content) {
            return this._buildToolFallback(name, description, score, userQuery);
        }
        
        const mainContent = skillData.content;
        
        // 1. 基础信息
        let contextContent = `### 🕷️ 网页抓取工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
        contextContent += `**核心功能**: ${description}\n\n`;
        
        // 2. 检查缓存
        const cachedContent = this._getCachedContent('crawl4ai', userQuery, sessionId, context);
        if (cachedContent) {
            contextContent += cachedContent;
            console.log(`🎯 [Crawl4AI缓存命中] ${cachedContent.length}字符`);
            return contextContent;
        }
        
        // 3. 提取关键内容
        const keyContent = this._extractCrawl4AIKeyContent(mainContent, userQuery);
        contextContent += keyContent;
        
        // 4. 添加专用提醒
        contextContent += `**🚨 关键规范**:\n`;
        contextContent += `• 所有参数必须嵌套在 "parameters" 对象内\n`;
        contextContent += `• URL必须以 http:// 或 https:// 开头\n`;
        contextContent += `• extract模式必须使用 "schema_definition" 参数名\n`;
        
        console.log(`✅ [Crawl4AI构建完成] ${contextContent.length}字符`);
        
        // 5. 压缩并缓存
        return await this._compressAndCache(contextContent, 'crawl4ai', userQuery, sessionId, context);
        
    } catch (error) {
        console.error(`🚨 [Crawl4AI构建失败] ${error.message}`, error);
        return this._buildToolFallback(skill.name, skill.description, skill.score, userQuery);
    }
  }

  /**
   * 🎯 基础工具上下文构建（完整版）
   */
  async _buildBasicToolContext(skill, userQuery, sessionId, context = {}) {
    try {
        const { skill: skillData, score, name, description, toolName } = skill;
        
        console.log(`🔍 [基础工具上下文] 工具: ${name}(${toolName}), 查询: "${userQuery.substring(0, 50)}..."`);
        
        if (!skillData || !skillData.content) {
            return this._buildToolFallback(name, description, score, userQuery);
        }
        
        const mainContent = skillData.content;
        
        // 1. 基础信息
        let contextContent = `### 🛠️ 工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n`;
        contextContent += `**功能**: ${description}\n\n`;
        
        // 2. 检查缓存
        const cachedContent = this._getCachedContent(toolName, userQuery, sessionId, context);
        if (cachedContent) {
            contextContent += cachedContent;
            console.log(`🎯 [${toolName}缓存命中] ${cachedContent.length}字符`);
            return contextContent;
        }
        
        // 3. 提取关键内容（根据工具类型）
        let keyContent = '';
        
        switch(toolName) {
            case 'tavily_search':
                keyContent = this._extractSearchKeyContent(mainContent, userQuery);
                break;
            case 'glm4v_analyze_image':
                keyContent = this._extractImageAnalysisKeyContent(mainContent, userQuery);
                break;
            case 'stockfish_analyzer':
                keyContent = this._extractChessKeyContent(mainContent, userQuery);
                break;
            case 'firecrawl':
                keyContent = this._extractFirecrawlKeyContent(mainContent, userQuery);
                break;
            default:
                keyContent = this._extractGenericKeyContent(mainContent, userQuery);
        }
        
        contextContent += keyContent;
        
        // 4. 添加工具特定提示
        const toolHint = this._getToolSpecificHint(toolName, userQuery);
        if (toolHint) {
            contextContent += `**💡 提示**: ${toolHint}\n\n`;
        }
        
        console.log(`✅ [${toolName}构建完成] ${contextContent.length}字符`);
        
        // 5. 压缩并缓存
        return await this._compressAndCache(contextContent, toolName, userQuery, sessionId, context);
        
    } catch (error) {
        console.error(`🚨 [${skill.toolName}构建失败] ${error.message}`, error);
        return this._buildToolFallback(skill.name, skill.description, skill.score, userQuery);
    }
  }

  /**
   * 🎯 通用方法：提取主文档关键章节
   */
  _extractMainDocKeySections(mainContent) {
    if (!mainContent || mainContent.length < 100) return '';
    
    let extracted = '';
    
    // 必须包含的关键章节模式
    const keyPatterns = [
        // 调用结构（最高优先级）
        { pattern: /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i, name: '调用结构' },
        { pattern: /## 📋 基础调用规范[\s\S]*?(?=\n##\s|$)/i, name: '基础调用' },
        { pattern: /## 🚀 基础调用[\s\S]*?(?=\n##\s|$)/i, name: '基础调用' },
        
        // 输出规范
        { pattern: /## 🚀 输出规范[\s\S]*?(?=\n##\s|$)/i, name: '输出规范' },
        { pattern: /## 📤 输出格式[\s\S]*?(?=\n##\s|$)/i, name: '输出格式' },
        
        // 错误示例
        { pattern: /## ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i, name: '常见错误' },
        { pattern: /## ⚠️ 重要限制[\s\S]*?(?=\n##\s|$)/i, name: '重要限制' },
        
        // 正确示例
        { pattern: /## ✅ 正确示例[\s\S]*?(?=\n##\s|$)/i, name: '正确示例' },
        
        // 关键指令
        { pattern: /## 🔑 关键指令[\s\S]*?(?=\n##\s|$)/i, name: '关键指令' },
        { pattern: /## 💡 关键提示[\s\S]*?(?=\n##\s|$)/i, name: '关键提示' }
    ];
    
    let foundCount = 0;
    for (const { pattern, name } of keyPatterns) {
        const match = mainContent.match(pattern);
        if (match) {
            extracted += match[0] + '\n\n';
            foundCount++;
            console.log(`✅ [提取章节] ${name}: ${match[0].length}字符`);
            
            // 如果已经提取了足够内容，提前停止
            if (extracted.length > 2000 && foundCount >= 3) {
                break;
            }
        }
    }
    
    // 如果什么都没找到，提取开头部分
    if (extracted.length < 500) {
        const intro = mainContent.substring(0, Math.min(1500, mainContent.length));
        extracted = `## 📖 工具指南\n\n${intro}`;
        if (mainContent.length > 1500) {
            extracted += '...\n*(完整指南请参考技能文档)*\n\n';
        }
    }
    
    return extracted;
  }

  /**
   * 🎯 查找Python参考文件
   */
  _findPythonReferences(userQuery) {
    const queryLower = userQuery.toLowerCase();
    const matchedRefs = new Set();
    
    // 关键词匹配
    for (const [keyword, refFile] of Object.entries(this.pythonReferenceMap)) {
        if (queryLower.includes(keyword)) {
            matchedRefs.add(refFile);
        }
    }
    
    // 任务推断
    if (queryLower.includes('可视化') || queryLower.includes('画图') || queryLower.includes('图表')) {
        matchedRefs.add('matplotlib_cookbook.md');
    }
    
    if (queryLower.includes('数据') && (queryLower.includes('处理') || queryLower.includes('分析'))) {
        matchedRefs.add('pandas_cheatsheet.md');
    }
    
    // 确保至少有一个
    if (matchedRefs.size === 0) {
        matchedRefs.add('matplotlib_cookbook.md');
    }
    
    return Array.from(matchedRefs);
  }

  /**
   * 🎯 提取参考文件内容
   */
  _extractReferenceContent(refContent, refFileName, userQuery) {
    if (!refContent || refContent.length < 100) return '';
    
    let extracted = '';
    
    // 1. 提取标题
    const titleMatch = refContent.match(/^#\s+([^\n]+)/m);
    if (titleMatch) {
        extracted += `## ${titleMatch[1]}\n\n`;
    }
    
    // 2. 提取前几段简介
    const paragraphs = refContent.split('\n\n');
    let introCount = 0;
    for (const para of paragraphs) {
        if (para.trim() && !para.trim().startsWith('#') && para.length > 30) {
            extracted += para + '\n\n';
            introCount++;
            if (introCount >= 2) break;
        }
    }
    
    // 3. 提取代码示例（最重要！）
    const codeBlocks = refContent.match(/```[\s\S]*?```/g) || [];
    if (codeBlocks.length > 0) {
        extracted += `**💻 代码示例**:\n\n`;
        // 取前2个代码块
        codeBlocks.slice(0, 2).forEach(block => {
            extracted += block + '\n\n';
        });
    }
    
    // 4. 限制长度
    if (extracted.length > 3000) {
        extracted = extracted.substring(0, 3000) + '\n\n...*(内容截断)*';
    }
    
    return extracted;
  }

  /**
   * 🎯 提取Crawl4AI关键内容
   */
  _extractCrawl4AIKeyContent(mainContent, userQuery) {
    let extracted = '';
    
    // 提取模式选择指南
    const modeSection = mainContent.match(/## 📋 可用模式快速选择指南[\s\S]*?(?=\n##\s|$)/i);
    if (modeSection) {
        extracted += modeSection[0] + '\n\n';
    }
    
    // 提取调用结构
    const structureMatch = mainContent.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i);
    if (structureMatch) {
        extracted += structureMatch[0] + '\n\n';
    }
    
    // 如果内容太少，添加通用部分
    if (extracted.length < 300) {
        const intro = mainContent.substring(0, Math.min(1000, mainContent.length));
        extracted += intro + '\n\n';
    }
    
    return extracted;
  }

  /**
   * 🎯 提取搜索工具关键内容
   */
  _extractSearchKeyContent(mainContent, userQuery) {
    return this._extractGenericKeyContent(mainContent, userQuery);
  }

  /**
   * 🎯 提取图像分析工具关键内容
   */
  _extractImageAnalysisKeyContent(mainContent, userQuery) {
    return this._extractGenericKeyContent(mainContent, userQuery);
  }

  /**
   * 🎯 提取象棋分析工具关键内容
   */
  _extractChessKeyContent(mainContent, userQuery) {
    return this._extractGenericKeyContent(mainContent, userQuery);
  }

  /**
   * 🎯 提取Firecrawl关键内容
   */
  _extractFirecrawlKeyContent(mainContent, userQuery) {
    return this._extractGenericKeyContent(mainContent, userQuery);
  }

  /**
   * 🎯 提取通用工具关键内容
   */
  _extractGenericKeyContent(mainContent, userQuery) {
    let extracted = '';
    
    // 尝试提取关键章节
    const keyPatterns = [
        /## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i,
        /## 📋 基础调用规范[\s\S]*?(?=\n##\s|$)/i,
        /## 🚀 基础调用[\s\S]*?(?=\n##\s|$)/i,
        /## ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i,
        /## ✅ 正确示例[\s\S]*?(?=\n##\s|$)/i
    ];
    
    for (const pattern of keyPatterns) {
        const match = mainContent.match(pattern);
        if (match) {
            extracted += match[0] + '\n\n';
            break; // 找到一个关键章节就足够
        }
    }
    
    // 如果没找到关键章节，提取开头部分
    if (extracted.length < 300) {
        const intro = mainContent.substring(0, Math.min(800, mainContent.length));
        extracted += intro + '\n\n';
    }
    
    return extracted;
  }

  /**
   * 🎯 获取Python输出规范
   */
  _getPythonOutputSpec() {
    return `**🚨 Python沙盒输出规范**:\n` +
           `• 图片输出：必须使用包含 type: "image" 和 image_base64 的JSON对象\n` +
           `• 文件输出：必须使用包含 type: "word|excel|pdf|..." 和 data_base64 的JSON对象\n` +
           `• 复杂任务：请优先参考对应的参考文件获取完整工作流\n`;
  }

  /**
   * 🎯 获取工具特定提示
   */
  _getToolSpecificHint(toolName, userQuery) {
    const hints = {
        'tavily_search': '支持实时网络搜索和信息获取',
        'glm4v_analyze_image': '支持图片内容分析和理解',
        'stockfish_analyzer': '提供国际象棋局面分析和最佳走法建议',
        'crawl4ai': '支持多种爬取模式：extract、scrape、deep_crawl等',
        'firecrawl': 'Firecrawl网页抓取工具',
        'python_sandbox': '在沙盒中执行Python代码，支持数据分析、可视化等'
    };
    
    return hints[toolName] || null;
  }

  /**
   * 🎯 构建工具降级内容
   */
  _buildToolFallback(name, description, score, userQuery) {
    return `### 🛠️ 工具: ${name} (匹配度: ${(score * 100).toFixed(1)}%)\n\n` +
           `**功能**: ${description}\n\n` +
           `**基本调用格式**:\n\`\`\`json\n{\n  "tool_name": "${name}",\n  "parameters": {\n    // 根据具体工具填写参数\n  }\n}\n\`\`\`\n\n` +
           `**当前任务**: ${userQuery.substring(0, 100)}`;
  }

  /**
   * 🎯 获取缓存内容
   */
  _getCachedContent(toolName, userQuery, sessionId, context) {
    if (!this.cacheCompressor) return null;
    
    try {
        return this.cacheCompressor.getFromCache(
            toolName, 
            userQuery, 
            { sessionId, ...context }
        );
    } catch (error) {
        console.warn(`⚠️ [缓存查询失败] ${toolName}:`, error);
        return null;
    }
  }

  /**
   * 🎯 压缩并缓存内容
   */
  async _compressAndCache(content, toolName, userQuery, sessionId, context) {
    if (!this.cacheCompressor) return content;
    
    try {
        // 压缩内容
        const compressed = await this.cacheCompressor.compressKnowledge(
            content,
            {
                level: 'smart',
                maxChars: 10000,
                userQuery: userQuery,
                toolName: toolName
            }
        );
        
        // 缓存结果
        this.cacheCompressor.setToCache(
            toolName, 
            userQuery, 
            { sessionId, ...context }, 
            compressed
        );
        
        // 记录注入
        this.cacheCompressor.recordToolInjection(sessionId, toolName);
        
        console.log(`📦 [压缩完成] ${toolName}: ${content.length} → ${compressed.length}字符`);
        
        return compressed;
    } catch (error) {
        console.error(`🚨 [压缩缓存失败] ${toolName}:`, error);
        return content; // 返回未压缩的内容
    }
  }
}

// 创建全局单例
export const skillContextManager = new SkillContextManager();