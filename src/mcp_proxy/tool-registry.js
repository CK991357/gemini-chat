/**
 * @file MCP Tool Registry
 * @description This module maps tool names to their corresponding handler functions.
 * It allows the main MCP handler to dynamically dispatch tool calls to the correct implementation.
 */

// Import all available tool handlers
import { handleFirecrawl } from './handlers/firecrawl.js';
import { handleMcpToolCatalog } from './handlers/mcp-tool-catalog.js';
import { handlePythonSandbox } from './handlers/python-sandbox.js';
import { handleStockfishAnalyzer } from './handlers/stockfish.js'; // 新增导入
import { handleTavilySearch } from './handlers/tavily-search.js';
import { handleZhipuImageAnalysis } from './handlers/zhipu-glm4v.js';

// Create a map of tool names to their handler functions
const toolRegistry = {
    'glm4v.analyze_image': handleZhipuImageAnalysis,
    'tavily_search': handleTavilySearch,
    'python_sandbox': handlePythonSandbox,
    'mcp_tool_catalog': handleMcpToolCatalog,
    'firecrawl': handleFirecrawl,
    'stockfish_analyzer': handleStockfishAnalyzer, // 新增注册
    // To add a new tool, import its handler and add an entry here.
    // e.g., 'new_tool_name': handleNewTool,
};

/**
 * Retrieves the handler function for a given tool name.
 * @param {string} toolName - The name of the tool.
 * @returns {Function|undefined} - The handler function, or undefined if the tool is not found.
 */
export function getToolHandler(toolName) {
    return toolRegistry[toolName];
}