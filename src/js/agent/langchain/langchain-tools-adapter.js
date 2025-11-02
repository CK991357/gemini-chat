// src/static/js/agent/langchain/langchain-tools-adapter.js
import { tool } from "langchain"; // 🆕 修正：使用正确的导入路径
import { z } from "zod";

/**
 * 🎯 LangChain 工具适配器
 * 职责：将项目现有的 MCP 工具（通过 apiHandler.callTool 调用）包装成 LangChain 标准格式。
 */
export class LangChainToolsAdapter {
  constructor(apiHandler) {
    if (!apiHandler || typeof apiHandler.callTool !== 'function') {
      throw new Error("LangChainToolsAdapter 需要一个带有 callTool 方法的有效 apiHandler。");
    }
    this.apiHandler = apiHandler;
    this._allTools = this.createAllTools();
    this._toolMap = new Map(this._allTools.map(t => [t.name, t]));
  }

  createAllTools() {
    return [
      tool(
        (input) => this.executeTool('tavily_search', input), // 🆕 移除不必要的 async
        {
          name: "tavily_search",
          description: "用于网络搜索，获取实时信息。",
          schema: z.object({ query: z.string().describe("搜索查询") }),
        }
      ),
      tool(
        (input) => this.executeTool('python_sandbox', input), // 🆕 移除不必要的 async
        {
          name: "python_sandbox",
          description: "执行 Python 代码用于数据分析、可视化等。",
          schema: z.object({ code: z.string().describe("要执行的 Python 代码") }),
        }
      ),
      tool(
        (input) => this.executeTool('firecrawl', input),
        {
          name: "firecrawl",
          description: "爬取网页内容进行分析。",
          schema: z.object({ 
            url: z.string().describe("要爬取的网页URL"),
            mode: z.string().optional().describe("爬取模式")
          }),
        }
      ),
      tool(
        (input) => this.executeTool('stockfish_analyzer', input),
        {
          name: "stockfish_analyzer",
          description: "国际象棋局面分析。",
          schema: z.object({ 
            fen: z.string().describe("FEN格式的棋局"),
            depth: z.number().optional().describe("分析深度")
          }),
        }
      ),
      tool(
        (input) => this.executeTool('crawl4ai', input),
        {
          name: "crawl4ai",
          description: "高级网页爬取工具。",
          schema: z.object({ 
            url: z.string().describe("要爬取的URL"),
            options: z.object({}).optional().describe("爬取选项")
          }),
        }
      )
    ];
  }

  async executeTool(toolName, input) {
    try {
      const result = await this.apiHandler.callTool(toolName, input);
      if (result.success) {
        // LangChain 工具期望返回一个字符串。我们将结构化输出进行字符串化。
        return typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);
      } else {
        return `错误: ${result.output || '工具执行失败。'}`;
      }
    } catch (error) {
      return `执行错误: ${error.message}`;
    }
  }

  getToolsBySkillMatches(skillMatches = []) {
    if (!skillMatches || skillMatches.length === 0) return [];
    return skillMatches
      .map(match => this._toolMap.get(match.toolName))
      .filter(Boolean);
  }

  // 🆕 新增：按名称获取工具
  getToolByName(toolName) {
    return this._toolMap.get(toolName);
  }

  // 🆕 新增：获取所有工具名称
  getAllToolNames() {
    return Array.from(this._toolMap.keys());
  }

  // 🆕 新增：按类别过滤工具
  getToolsByCategory(categoryKeywords = []) {
    if (categoryKeywords.length === 0) return this._allTools;
    
    return this._allTools.filter(tool => {
      const description = tool.description.toLowerCase();
      return categoryKeywords.some(keyword => description.includes(keyword.toLowerCase()));
    });
  }
}