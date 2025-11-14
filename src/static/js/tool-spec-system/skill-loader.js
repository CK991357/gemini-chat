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
   * 🎯 提取引用章节 (保持优化后的版本)
   */
  _extractReferenceSection(skill, sectionKeyword) {
    const keywordLower = sectionKeyword.toLowerCase().trim();

    // 策略1: 精确文件名匹配 (不含后缀)
    for (const [refFile, content] of skill.references) {
        const fileNameWithoutExt = refFile.replace(/\.md$/, '').toLowerCase();
        if (fileNameWithoutExt === keywordLower) {
            return content;
        }
    }
      
    // 策略2: 在文件内容中搜索章节标题
    for (const [refFile, content] of skill.references) {
        const sections = content.split(/(?=^#+\s)/m);
        const relevantSection = sections.find(sec =>
            sec.trim().toLowerCase().startsWith(`# ${keywordLower}`)
        );
        if (relevantSection) {
            return relevantSection;
        }
    }

    // 策略3: 模糊的文件名包含匹配
    for (const [refFile, content] of skill.references) {
        if (refFile.toLowerCase().includes(keywordLower)) {
            return content;
        }
    }

    return null;
  }
}

// 导出单例实例
export const knowledgeFederation = new KnowledgeFederationLoader();