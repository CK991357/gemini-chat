import fs from 'fs';
import { globSync } from 'glob';
import matter from 'gray-matter';
import path from 'path';

// 更健壮的路径处理
const skillsDir = path.resolve(process.cwd(), 'src', 'skills');
const outputDir = path.resolve(process.cwd(), 'src', 'tool-spec-system');
const outputFile = path.join(outputDir, 'generated-skills.js');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🚀 Starting skills build process...');
console.log(`🔍 Scanning for skills in: ${skillsDir}`);

try {
  // 查找所有 SKILL.md 文件
  const skillFiles = globSync(`${skillsDir}/**/SKILL.md`);
  
  if (skillFiles.length === 0) {
    console.warn('⚠️ No skill files found. Creating empty registry.');
    // 创建空的注册表而不是退出
  }

  console.log(`✅ Found ${skillFiles.length} skill files.`);

  const skillsData = {};

  // 读取和解析每个技能文件
  skillFiles.forEach(file => {
    try {
      const markdownContent = fs.readFileSync(file, 'utf8');
      const { data: metadata, content } = matter(markdownContent);

      if (!metadata.tool_name) {
        console.warn(`  ⚠️ Skipping ${file}: Missing 'tool_name' in frontmatter.`);
        return;
      }
      
      // 自动填充缺失的必需字段
      metadata.name = metadata.name || metadata.tool_name;
      metadata.description = metadata.description || '暂无描述';
      metadata.category = metadata.category || 'general';
      metadata.tags = metadata.tags || [];

      skillsData[metadata.tool_name] = {
        metadata,
        content: content.trim(),
        filePath: path.relative(process.cwd(), file)
      };
      
      console.log(`  ✅ Processed: ${metadata.name} (${metadata.tool_name})`);
    } catch (error) {
      console.error(`  ❌ Failed to process ${file}:`, error.message);
    }
  });

  // 生成文件内容 - 使用更安全的序列化
  const fileContent = `/**
 * @file 自动生成的技能注册表 - 由 build-skills.js 脚本生成
 * !!! 请勿直接编辑此文件 !!!
 * 请在 /src/skills/ 目录中编辑 .md 文件
 * 
 * 生成时间: ${new Date().toISOString()}
 * 技能数量: ${Object.keys(skillsData).length}
 */

export const SKILLS_DATA = ${JSON.stringify(skillsData, null, 2)};

// 辅助函数：将对象转换为 Map
export function getSkillsRegistry() {
  const map = new Map();
  Object.entries(SKILLS_DATA).forEach(([key, value]) => {
    map.set(key, value);
  });
  return map;
}
`;

  // 写入文件
  fs.writeFileSync(outputFile, fileContent, 'utf8');
  
  const skillCount = Object.keys(skillsData).length;
  console.log(`\n🎉 Successfully generated skills registry!`);
  console.log(`📦 ${skillCount} skills bundled into: ${outputFile}`);
  
  // 输出技能列表
  if (skillCount > 0) {
    console.log(`\n📋 Available skills:`);
    Object.values(skillsData).forEach(skill => {
      console.log(`   - ${skill.metadata.name} (${skill.metadata.tool_name})`);
    });
  }
  
} catch (error) {
  console.error('❌ Build process failed:', error);
  process.exit(1);
}