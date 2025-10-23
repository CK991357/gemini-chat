// scripts/build-skills.js
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 构建技能注册表 - ESM版本
 */
async function buildSkills() {
  const skillsDir = path.join(__dirname, '../src/skills');
  const outputFile = path.join(__dirname, '../src/tool-spec-system/generated-skills.js');
  
  console.log('🚀 开始构建技能系统...');
  
  const skillsData = {};
  const skillFolders = fs.readdirSync(skillsDir).filter(item => {
    const itemPath = path.join(skillsDir, item);
    return fs.statSync(itemPath).isDirectory();
  });

  console.log(`📁 发现 ${skillFolders.length} 个技能文件夹`);

  // 并行处理所有技能文件夹
  const results = await Promise.allSettled(
    skillFolders.map(folder => {
      const skillPath = path.join(skillsDir, folder);
      return processSkillFolder(skillPath);
    })
  );

  // 处理结果
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      const skillData = result.value;
      skillsData[skillData.metadata.name] = skillData;
      console.log(`✅ 处理完成: ${skillData.metadata.name}`);
    } else {
      console.warn(`⚠️ 处理失败: ${skillFolders[index]}`, result.reason?.message);
    }
  });

  // 生成输出文件
  const outputContent = `/**
 * @file 自动生成的技能注册表 - 由 build-skills.js 脚本生成
 * !!! 请勿直接编辑此文件 !!!
 * 生成时间: ${new Date().toISOString()}
 * 技能数量: ${Object.keys(skillsData).length}
 */

export const SKILLS_DATA = ${JSON.stringify(skillsData, null, 2)};

export function getSkillsRegistry() {
  const map = new Map();
  Object.entries(SKILLS_DATA).forEach(([key, value]) => {
    map.set(key, value);
  });
  return map;
}`;

  fs.writeFileSync(outputFile, outputContent);
  console.log(`🎉 技能构建完成! 共生成 ${Object.keys(skillsData).length} 个技能`);
  console.log(`📄 输出文件: ${outputFile}`);
}

/**
 * 处理单个技能文件夹
 */
async function processSkillFolder(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  
  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`缺少SKILL.md文件: ${skillPath}`);
  }

  const { metadata, content } = parseSkillMarkdown(skillMdPath);
  const resources = scanSkillResources(skillPath);
  
  return {
    metadata: {
      ...metadata,
      // 保持向后兼容
      tool_name: metadata.allowed_tools?.[0] || metadata.name.replace('-', '_')
    },
    content,
    resources,
    filePath: skillPath,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 解析SKILL.md文件
 */
function parseSkillMarkdown(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    throw new Error('无效的SKILL.md格式: 缺少YAML frontmatter');
  }

  const frontmatter = yaml.load(frontmatterMatch[1]);
  const markdownContent = frontmatterMatch[2].trim();

  // 验证必需字段
  if (!frontmatter.name) {
    throw new Error('SKILL.md必须包含name字段');
  }
  if (!frontmatter.description) {
    throw new Error('SKILL.md必须包含description字段');
  }

  return {
    metadata: frontmatter,
    content: markdownContent
  };
}

/**
 * 扫描资源文件
 */
function scanSkillResources(skillPath) {
  const resourceTypes = ['scripts', 'references', 'assets'];
  const resources = {};

  resourceTypes.forEach(type => {
    const typePath = path.join(skillPath, type);
    if (fs.existsSync(typePath)) {
      resources[type] = scanDirectory(typePath);
    }
  });

  return resources;
}

/**
 * 递归扫描目录
 */
function scanDirectory(dirPath) {
  const files = [];
  
  function scanRecursive(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    items.forEach(item => {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanRecursive(fullPath);
      } else {
        const relativePath = path.relative(dirPath, fullPath);
        files.push(relativePath);
      }
    });
  }
  
  scanRecursive(dirPath);
  return files;
}

// 执行构建
buildSkills().catch(error => {
  console.error('❌ 构建失败:', error);
  process.exit(1);
});