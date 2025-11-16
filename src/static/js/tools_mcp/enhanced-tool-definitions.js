// D:\Github_10110531\gemini_chat\src\static\js\tools_mcp\enhanced-tool-definitions.js
import { geminiMcpTools, mcpTools, mcpToolsMap } from './tool-definitions.js';

/**
 * 🚀 增强工具定义生成器
 * 专门为 crawl4ai 和 python_sandbox 提供增强描述
 */
class EnhancedToolDefinitions {
  constructor() {
    this.enhancedToolsCache = new Map();
  }

  /**
   * 获取增强版工具定义
   */
  async getEnhancedTools(baseTools, modelName = '') {
    const cacheKey = `${modelName}_${baseTools.map(t => t.function?.name).join(',')}`;
    
    if (this.enhancedToolsCache.has(cacheKey)) {
      return this.enhancedToolsCache.get(cacheKey);
    }

    const enhancedTools = [];
    
    for (const tool of baseTools) {
      const toolName = tool.function?.name;
      if (!toolName) {
        enhancedTools.push(tool);
        continue;
      }

      try {
        let enhancedTool;
        
        // 🚀 特殊处理复杂工具
        if (toolName === 'crawl4ai') {
          enhancedTool = this._enhanceCrawl4AITool(tool);
        } else if (toolName === 'python_sandbox') {
          enhancedTool = this._enhancePythonSandboxTool(tool);
        } else {
          // 其他工具保持原有描述
          enhancedTool = JSON.parse(JSON.stringify(tool));
        }

        enhancedTools.push(enhancedTool);
      } catch (error) {
        console.warn(`增强工具 ${toolName} 失败:`, error);
        enhancedTools.push(tool); // 降级到原始工具
      }
    }

    this.enhancedToolsCache.set(cacheKey, enhancedTools);
    return enhancedTools;
  }

  /**
   * 🚀 增强crawl4ai工具描述
   */
  _enhanceCrawl4AITool(tool) {
    const enhancedTool = JSON.parse(JSON.stringify(tool));
    
    enhancedTool.function.description = `
${tool.function.description}

📖 **核心模式**:
• scrape - 抓取单个网页内容
• deep_crawl - 深度智能爬取网站  
• batch_crawl - 批量URL处理
• extract - 结构化数据提取
• pdf_export - PDF导出
• screenshot - 截图捕获

💡 **关键规范**:
• 所有参数必须嵌套在 "parameters" 对象内
• URL必须以 http:// 或 https:// 开头
• extract模式必须使用 "schema_definition" 参数名

🚀 **典型场景**:
• 新闻文章采集、竞品分析、产品目录爬取
    `.trim();

    return enhancedTool;
  }

  /**
   * 🚀 增强Python沙盒工具描述
   */
  _enhancePythonSandboxTool(tool) {
    const enhancedTool = JSON.parse(JSON.stringify(tool));
    
    enhancedTool.function.description = `
${tool.function.description}

📖 **核心能力**:
• 数据可视化：使用Matplotlib, Seaborn, Plotly生成图表
• 数据处理：使用Pandas进行数据清洗、转换、分析
• 文档自动化：创建Excel, Word, PDF, PPT文件
• 机器学习：使用scikit-learn进行模型训练和评估
• 数学计算：使用Sympy进行符号计算和公式证明

💡 **工作流模式**:
• 公式证明：定义符号 → 构建表达式 → 简化证明
• ETL管道：数据提取 → 转换处理 → 结果输出  
• 分析报告：数据收集 → 处理分析 → 可视化 → 文档生成

🚀 **输出规范**:
• 图片：必须使用包含 type: "image" 和 image_base64 的JSON对象
• 文件：必须使用包含 type: "word|excel|pdf|ppt" 和 data_base64 的JSON对象

🔧 **可用库**:
pandas, numpy, matplotlib, seaborn, plotly, scikit-learn, sympy, scipy, python-docx, reportlab, python-pptx, openpyxl
    `.trim();

    return enhancedTool;
  }
}

// 创建单例实例
export const enhancedToolDefinitions = new EnhancedToolDefinitions();

// 提供异步获取方法
export async function getEnhancedMcpTools(modelName = '') {
  return await enhancedToolDefinitions.getEnhancedTools(mcpTools, modelName);
}

export async function getEnhancedGeminiMcpTools(modelName = '') {
  return await enhancedToolDefinitions.getEnhancedTools(geminiMcpTools, modelName);
}

// 保持原有导出的兼容性
export { geminiMcpTools, mcpTools, mcpToolsMap };
