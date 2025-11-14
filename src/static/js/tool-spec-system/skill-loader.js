// src/tool-spec-system/skill-loader.js (修复版)

class KnowledgeFederationLoader {
  constructor() {
    this.knowledgeBase = new Map(); // tool_name -> {metadata, content, references}
  }

  // --- START FIX: 添加 initializeFromRegistry 方法 ---
  /**
   * 🎯 从技能注册表批量初始化和加载所有联邦知识
   * @param {Map} skillsRegistry - 从 generated-skills.js 获取的技能注册表
   */
  async initializeFromRegistry(skillsRegistry) {
    if (!skillsRegistry || skillsRegistry.size === 0) {
      console.warn('[KnowledgeFederation] 技能注册表为空，无法加载知识库。');
      return;
    }

    console.log(`[KnowledgeFederation] 开始从注册表加载 ${skillsRegistry.size} 个技能的知识库...`);

    const loadingPromises = [];
    for (const [toolName, skillData] of skillsRegistry.entries()) {
      // 假设技能目录结构为 src/skills/{tool_name}/SKILL.md
      // 注意: 这个路径需要根据您的实际项目结构进行调整
      const skillPath = `src/skills/${toolName}/SKILL.md`;
      
      // 注意：这里的 'path' 模块在浏览器环境中不可用，我们用字符串拼接模拟
      // 如果在Node.js环境，请确保 const path = require('path');
      loadingPromises.push(
        this.loadFederatedSkill(skillPath).catch(error => {
          console.error(`[KnowledgeFederation] ❌ 加载技能 ${toolName} 失败:`, error);
        })
      );
    }

    await Promise.all(loadingPromises);
    console.log(`[KnowledgeFederation] ✅ 知识库加载完成，已加载 ${this.knowledgeBase.size} 个技能。`);
  }
  // --- END FIX ---

  /**
   * 🎯 联邦知识加载：主文档 + 所有引用文档
   */
  async loadFederatedSkill(skillPath) {
    // 模拟 Node.js path.dirname 的行为
    const skillDir = skillPath.substring(0, skillPath.lastIndexOf('/'));
    
    const mainContent = await this._readSkillFile(skillPath);
    // 修复：确保解析逻辑健壮
    const { metadata, content } = this._parseSkillMetadata(mainContent) || { metadata: {}, content: '' };
    
    if (!metadata.tool_name) {
        // 如果 SKILL.md 中没有 tool_name, 从路径中推断
        metadata.tool_name = skillDir.split('/').pop();
        console.warn(`[KnowledgeFederation] 技能 ${skillPath} 未指定 tool_name, 从路径推断为: ${metadata.tool_name}`);
    }

    const federatedSkill = {
      metadata,
      content,
      references: new Map() // 🎯 引用文档联邦存储
    };

    // 🎯 预加载所有引用文档
    if (metadata.references && Array.isArray(metadata.references)) {
      for (const refFile of metadata.references) {
        const refPath = `${skillDir}/references/${refFile}`;
        try {
          const refContent = await this._readSkillFile(refPath);
          federatedSkill.references.set(refFile, refContent);
          console.log(`[KnowledgeFederation] ✅ 联邦加载引用: ${refFile}`);
        } catch (error) {
          console.warn(`[KnowledgeFederation] ⚠️ 引用文件缺失: ${refFile} at path ${refPath}`);
        }
      }
    }

    this.knowledgeBase.set(metadata.tool_name, federatedSkill);
    return federatedSkill;
  }
  
  // --- 新增一个模拟文件读取的辅助方法 ---
  async _readSkillFile(path) {
    // 在浏览器环境中，我们使用 fetch 来读取本地文件
    // 确保您的开发服务器正确地服务了这些 .md 文件
    const response = await fetch(`/${path}`); // 假设文件位于网站根目录下的 src/skills/...
    if (!response.ok) {
        throw new Error(`无法获取文件 ${path}: ${response.statusText}`);
    }
    return await response.text();
  }
  
  // --- 修复：正确解析元数据方法 ---
  _parseSkillMetadata(fileContent) {
    // 使用 ^---\n 确保只匹配文件开头的元数据块
    const metadataMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
    if (!metadataMatch) {
        return { metadata: {}, content: fileContent };
    }

    // ✅ 正确修复 1: 使用捕获组 metadataMatch[1] 获取元数据字符串
    const metadataBlock = metadataMatch[1]; 
    const metadata = {};
    
    metadataBlock.split('\n').forEach(line => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex !== -1) {
            const key = line.substring(0, separatorIndex).trim();
            const value = line.substring(separatorIndex + 1).trim();
            
            if (key === 'references' && value) {
                // 处理数组，并过滤掉因尾随逗号等产生的空字符串
                metadata[key] = value.split(',').map(item => item.trim()).filter(Boolean);
            } else if (key) {
                metadata[key] = value;
            }
        }
    });

    // ✅ 正确修复 2: 使用完整匹配 metadataMatch[0] 的长度来截取内容
    const content = fileContent.substring(metadataMatch[0].length).trim();
    return { metadata, content };
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
    const keywordLower = sectionKeyword.toLowerCase().trim();

    for (const [refFile, content] of skill.references) {
        // 优化 1: 优先进行精确的文件名匹配 (不含后缀)
        const fileNameWithoutExt = refFile.replace(/\.md$/, '').toLowerCase();
        if (fileNameWithoutExt === keywordLower) {
            return content;
        }
    }
      
    // 优化 2: 如果没有精确文件名匹配，再在文件内容中搜索章节标题
    for (const [refFile, content] of skill.references) {
        const sections = content.split(/(?=^#+\s)/m); // 按Markdown标题分割
        const relevantSection = sections.find(sec =>
            // 匹配 '# Section Name' 或 '## Section Name' 等
            sec.trim().toLowerCase().startsWith(`# ${keywordLower}`)
        );
        if (relevantSection) {
            return relevantSection;
        }
    }

    // 优化 3: 最后，回退到模糊的文件名包含匹配
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