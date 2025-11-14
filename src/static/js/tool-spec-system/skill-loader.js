// src/tool-spec-system/skill-loader.js (新建文件)
class KnowledgeFederationLoader {
  constructor() {
    this.knowledgeBase = new Map(); // tool_name -> {metadata, content, references}
  }

  /**
   * 🎯 联邦知识加载：主文档 + 所有引用文档
   */
  async loadFederatedSkill(skillPath) {
    const skillDir = path.dirname(skillPath);
    const mainContent = await this._readSkillFile(skillPath);
    const { metadata, content } = this._parseSkillMetadata(mainContent);
    
    const federatedSkill = {
      metadata,
      content,
      references: new Map() // 🎯 引用文档联邦存储
    };

    // 🎯 预加载所有引用文档
    if (metadata.references && Array.isArray(metadata.references)) {
      for (const refFile of metadata.references) {
        const refPath = path.join(skillDir, 'references', refFile);
        try {
          const refContent = await this._readSkillFile(refPath);
          federatedSkill.references.set(refFile, refContent);
          console.log(`[KnowledgeFederation] ✅ 联邦加载: ${refFile}`);
        } catch (error) {
          console.warn(`[KnowledgeFederation] ⚠️ 引用文件缺失: ${refFile}`);
        }
      }
    }

    this.knowledgeBase.set(metadata.tool_name, federatedSkill);
    return federatedSkill;
  }

  /**
   * 🎯 获取联邦知识包
   */
  getFederatedKnowledge(toolName, requestedSections = []) {
    const skill = this.knowledgeBase.get(toolName);
    if (!skill) return null;

    let knowledgePackage = `# ${skill.metadata.name}\n\n${skill.metadata.description}\n\n${skill.content}`;

    // 🎯 动态构建联邦知识包
    if (requestedSections.length > 0) {
      knowledgePackage += `\n\n## 📚 相关参考指南\n`;
      requestedSections.forEach(section => {
        const refContent = this._extractReferenceSection(skill, section);
        if (refContent) {
          knowledgePackage += `\n\n### ${section}\n${refContent}`;
        }
      });
    } else {
      // 🎯 返回完整联邦知识
      knowledgePackage += `\n\n## 📚 完整参考指南\n`;
      skill.references.forEach((content, refFile) => {
        knowledgePackage += `\n\n### ${refFile.replace('.md', '')}\n${content}`;
      });
    }

    return knowledgePackage;
  }

  _extractReferenceSection(skill, sectionKeyword) {
    for (const [refFile, content] of skill.references) {
      if (refFile.toLowerCase().includes(sectionKeyword.toLowerCase())) {
        return content;
      }
      // 🎯 在引用内容中搜索相关章节
      const sections = content.split(/(?=^#+\s)/m);
      const relevantSection = sections.find(sec => 
        sec.toLowerCase().includes(sectionKeyword.toLowerCase())
      );
      if (relevantSection) return relevantSection;
    }
    return null;
  }
}

// 导出单例实例
export const knowledgeFederation = new KnowledgeFederationLoader();