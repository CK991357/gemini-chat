/**
 * @file 技能注册表 (构建时加载器)
 * @description 此文件在构建时执行，利用 import.meta.glob 读取所有 SKILL.md 文件，
 * 将其内容解析并预处理成一个可以直接在运行时使用的 Map。
 */
import matter from 'gray-matter';

// 1. 在构建时，Vite/Wrangler 会找到所有匹配的文件并将其内容注入进来。
// 'eager: true' 确保模块被立即加载而不是懒加载。
const skillModules = import.meta.glob('/src/skills/*/SKILL.md', {
  as: 'raw',
  eager: true,
});

const loadedSkills = new Map();

// 2. 遍历注入的模块，解析并填充 Map
for (const path in skillModules) {
  const markdownContent = skillModules[path];
  try {
    const { data: metadata, content } = matter(markdownContent);
    
    // 验证必要元数据
    if (!metadata.tool_name) {
      console.warn(`⚠️ [构建时警告] 技能文件 ${path} 缺少 'tool_name' 元数据，已跳过。`);
      continue;
    }

    // 确保 name 字段存在，如果不存在则使用 tool_name
    if (!metadata.name) {
      metadata.name = metadata.tool_name;
      console.warn(`⚠️ [构建时警告] 技能文件 ${path} 缺少 'name' 元数据，已使用 tool_name 作为默认值。`);
    }

    const skill = {
      metadata,
      content: content.trim(),
      filePath: path
    };
    
    loadedSkills.set(metadata.tool_name, skill);
    console.log(`✅ [构建时] 成功加载技能: ${metadata.name}`);

  } catch (e) {
    console.error(`❌ [构建时错误] 解析技能文件 ${path} 失败:`, e);
  }
}

console.log(`🎉 [构建时信息] 技能注册表构建完成，共加载 ${loadedSkills.size} 个技能。`);

// 3. 导出一个预填充好的、可在运行时直接使用的技能注册表
export const SKILLS_REGISTRY = loadedSkills;