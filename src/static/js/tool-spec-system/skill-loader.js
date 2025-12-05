// src/tool-spec-system/skill-loader.js (最终修复版)

// 🎯 核心修复：直接从已经存在的 generated-skills.js 导入数据
import { getSkillsRegistry } from './generated-skills.js';

class KnowledgeFederationLoader {
  constructor() {
    // knowledgeBase 将存储完整的联邦知识，包括文档内容
    this.knowledgeBase = new Map(); // tool_name -> {metadata, content, references}
  }

  /**
   * 🎯 从已经包含了元数据的技能注册表进行初始化
   *   这个方法现在将成为知识库的唯一数据来源。
   */
  async initializeFromRegistry() {
    // 1. 直接从您已有的文件/模块中获取技能注册表
    const skillsRegistry = getSkillsRegistry(); 

    if (!skillsRegistry || skillsRegistry.size === 0) {
      console.warn('[KnowledgeFederation] 技能注册表为空或未加载，无法初始化知识库。');
      return;
    }

    console.log(`[KnowledgeFederation] 开始从已编译的技能注册表加载知识库...`);

    // 2. 遍历注册表，为每个技能填充完整的知识内容
    for (const [skillName, skillData] of skillsRegistry.entries()) {
        // 确保 skillData 和 metadata 存在
        if (skillData && skillData.metadata) {
            const toolName = skillData.metadata.tool_name;
            
            // 3. 将 skillData 中已有的信息（元数据、内容、引用）
            //    转换为 knowledgeBase 需要的格式。
            //    这里的关键是，我们假设您的 build-skills.js 已经把内容都打包进来了。
            
            // 将 resources.references 对象（如果存在）转换为 Map 结构
            const referencesMap = new Map(Object.entries(skillData.resources?.references || {}));
            
            this.knowledgeBase.set(toolName, {
                metadata: skillData.metadata,
                content: skillData.content || '主技能文档内容缺失。', // 提供一个默认值
                references: referencesMap,
            });
        } else {
            console.warn(`[KnowledgeFederation] 技能 "${skillName}" 数据格式不完整，已跳过。`);
        }
    }

    console.log(`[KnowledgeFederation] ✅ 知识库加载完成，已加载 ${this.knowledgeBase.size} 个技能。`);
    // 返回一个 resolved Promise 以保持与现有 await 语法的兼容性
    return Promise.resolve();
  }

  // --------------------------------------------------------------------
  // 以下方法保持不变，因为它们依赖于已经成功初始化的 `this.knowledgeBase`
  // --------------------------------------------------------------------
  
  /**
   * 🎯 获取联邦知识包
   */
  getFederatedKnowledge(toolName, requestedSections = []) {
    const skill = this.knowledgeBase.get(toolName);
    if (!skill) {
        // 增加更详细的警告
        console.warn(`[KnowledgeFederation] 在知识库中未找到工具: "${toolName}". 可用工具:`, Array.from(this.knowledgeBase.keys()));
        return null;
    }

    let knowledgePackage = `# ${skill.metadata.name}\n\n${skill.metadata.description}\n\n${skill.content}`;

    if (requestedSections.length > 0) {
      knowledgePackage += `\n\n## 📚 相关参考指南\n`;
      requestedSections.forEach(section => {
        const refContent = this._extractReferenceSection(skill, section);
        if (refContent) {
          knowledgePackage += `\n\n### ${section}\n${refContent}`;
        } else {
          console.warn(`[KnowledgeFederation] 在工具 "${toolName}" 中未找到参考章节: "${section}"`);
        }
      });
    } else {
      knowledgePackage += `\n\n## 📚 完整参考指南\n`;
      skill.references.forEach((content, refFile) => {
        knowledgePackage += `\n\n### ${refFile.replace('.md', '')}\n${content}`;
      });
    }

    return knowledgePackage;
  }

  /**
   * 🎯 [增强版] 多层级章节检索策略
   */
  _extractReferenceSection(skill, sectionKeyword) {
    if (!skill || !sectionKeyword) {
      console.warn(`[KnowledgeFederation] 无效的输入: skill=${!!skill}, keyword=${sectionKeyword}`);
      return null;
    }
    
    const strategies = [
      // 策略1: 精确标题匹配 (### 章节标题)
      () => {
        const exactRegex = new RegExp(`^#{2,4}\\s+${this.escapeRegex(sectionKeyword)}\\b`, 'im');
        const sections = skill.content.split(/(?=^#{2,4}\s)/m);
        for (const section of sections) {
          if (exactRegex.test(section)) {
            console.log(`[KnowledgeFederation] 🔍 策略1精确匹配成功: "${sectionKeyword}"`);
            return section;
          }
        }
        return null;
      },
      
      // 策略2: 模糊标题匹配 (包含关键词)
      () => {
        const fuzzyKeyword = sectionKeyword.toLowerCase().replace(/[_\-]/g, '[\\s_-]*');
        const fuzzyRegex = new RegExp(`^#{2,4}\\s+(?:📖\\s+)?.*?${fuzzyKeyword}.*?\\b`, 'im');
        const sections = skill.content.split(/(?=^#{2,4}\s)/m);
        for (const section of sections) {
          if (fuzzyRegex.test(section)) {
            console.log(`[KnowledgeFederation] 🔍 策略2模糊匹配成功: "${sectionKeyword}"`);
            return section;
          }
        }
        return null;
      },
      
      // 策略3: 语义匹配 (基于同义词)
      () => {
        const synonyms = this.getSectionSynonyms(sectionKeyword);
        const sections = skill.content.split(/(?=^#{2,4}\s)/m);
        
        for (const section of sections) {
          const titleMatch = section.match(/^#{2,4}\s+(?:📖\s+)?([^\n]+)/i);
          if (titleMatch) {
            const title = titleMatch[1].toLowerCase();
            if (synonyms.some(syn => title.includes(syn.toLowerCase()))) {
              console.log(`[KnowledgeFederation] 🔍 策略3语义匹配成功: "${sectionKeyword}" -> "${titleMatch[1]}"`);
              return section;
            }
          }
        }
        return null;
      },
      
      // 策略4: 参考文件匹配 (降级)
      () => {
        const keywordLower = sectionKeyword.toLowerCase().replace(/\.md$/, '');
        for (const [refFile, content] of skill.references.entries()) {
          const fileName = refFile.toLowerCase().replace(/\.md$/, '');
          if (fileName.includes(keywordLower) || keywordLower.includes(fileName)) {
            console.log(`[KnowledgeFederation] 🔍 策略4文件匹配成功: "${sectionKeyword}" -> "${refFile}"`);
            return content;
          }
        }
        return null;
      },
      
      // 策略5: 内容关键词匹配 (最后手段)
      () => {
        const keywords = this.extractSearchKeywords(sectionKeyword);
        let bestSection = '';
        let bestScore = 0;
        
        const sections = skill.content.split(/(?=^#{2,4}\s)/m);
        sections.forEach(section => {
          let score = 0;
          const sectionLower = section.toLowerCase();
          
          keywords.forEach(keyword => {
            if (sectionLower.includes(keyword)) {
              score += 1;
              // 标题中出现的关键词权重更高
              const titleMatch = section.match(/^#{2,4}\s+(?:📖\s+)?([^\n]+)/i);
              if (titleMatch && titleMatch[1].toLowerCase().includes(keyword)) {
                score += 3;
              }
            }
          });
          
          if (score > bestScore) {
            bestScore = score;
            bestSection = section;
          }
        });
        
        if (bestScore > 0) {
          console.log(`[KnowledgeFederation] 🔍 策略5内容匹配成功: "${sectionKeyword}" (得分: ${bestScore})`);
          return bestSection;
        }
        return null;
      }
    ];
    
    // 按顺序尝试所有策略
    for (let i = 0; i < strategies.length; i++) {
      const result = strategies[i]();
      if (result) {
        return result;
      }
    }
    
    console.warn(`[KnowledgeFederation] ❌ 所有检索策略均失败: "${sectionKeyword}"`);
    return null;
  }

  /**
   * 🎯 辅助方法：转义正则表达式特殊字符
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 🎯 获取章节同义词
   */
  getSectionSynonyms(keyword) {
    const synonymMap = {
        // 数据相关（深度研究优先）
        'pandas_cheatsheet': ['pandas', '数据分析', '数据清洗', '数据处理', 'dataframe', '表格处理', 'excel', 'csv'],
        '数据清洗与分析': ['数据清洗', '数据分析', '数据处理', 'pandas', 'data cleaning', '数据清理'],
        'ETL管道模式': ['ETL', '数据管道', '数据处理流程', '数据转换', '数据流程'],
        
        // 文本分析（深度研究核心） 🆕 增强
        'text_analysis_cookbook.md': [
            '文本分析', '文本处理', '文本挖掘', 'NLP', '自然语言处理',
            '数据分析', '数据清洗', '结构化提取', '信息抽取', '深度分析',  // 🆕 新增同义词
            '趋势分析', '投资分析', '报告分析', '研究分析'                // 🆕 研究场景同义词
        ],
        '文本分析与结构化提取': ['文本提取', '结构化提取', '信息抽取', '文本分析', '数据提取'],
        
        // 可视化相关
        'matplotlib_cookbook': ['matplotlib', '可视化', '绘图', '图表', 'plot', '图形', '趋势图'],
        '数据可视化': ['可视化', '图表绘制', '绘图', '图形', 'visualization', '图表展示'],
        
        // 数学相关
        '公式证明工作流': ['公式', '证明', '符号计算', '数学证明', 'sympy', '数学推导'],
        'sympy_cookbook': ['sympy', '符号计算', '数学计算', '代数', '数学分析'],
        '科学计算与优化': ['科学计算', '数值计算', '优化', 'scipy', '数值分析', '计算分析'],
        
        // 机器学习
        '机器学习': ['ml', 'machine learning', '模型训练', '预测', '分类', '回归', '聚类'],
        'ml_workflow': ['机器学习流程', '模型训练流程', 'ml pipeline', 'ai流程'],
        
        // 报告生成
        '自动化报告生成': ['报告生成', '文档生成', '报告', '文档', '导出', '研究报告', '分析报告', '投资报告'],
        
        // 新增：通用分析关键词映射 🆕
        '分析': ['分析', '分析数据', '数据分析', '文本分析', '趋势分析', '投资分析', '研究报告'],
        '清洗': ['清洗', '清理', '数据清洗', '清洗数据', '预处理', '数据预处理']
    };
    
    // 先尝试精确匹配
    if (synonymMap[keyword]) {
        return synonymMap[keyword];
    }
    
    // 尝试模糊匹配：包含关键词
    for (const [key, synonyms] of Object.entries(synonymMap)) {
        if (keyword.includes(key) || synonyms.some(syn => keyword.includes(syn))) {
            console.log(`[KnowledgeFederation] 🔍 同义词模糊匹配: "${keyword}" -> "${key}"`);
            return synonyms;
        }
    }
    
    return [keyword];
  }

  /**
   * 🎯 提取搜索关键词
   */
  extractSearchKeywords(text) {
    const words = text.toLowerCase()
      .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
      .filter(w => w.length > 1);
    
    // 移除常见停用词
    const stopWords = ['的', '和', '与', '或', '在', '从', '到', '关于', '对于'];
    return words.filter(w => !stopWords.includes(w));
  }
}

// 导出单例实例
export const knowledgeFederation = new KnowledgeFederationLoader();