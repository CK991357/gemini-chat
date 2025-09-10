/**
 * @file MCP Tool Definitions
 * This file serves as a central registry for all tool schemas provided to MCP-compatible models like Qwen.
 */

// Tavily search tool definition
const tavily_search = {
    "type": "function",
    "function": {
        "name": "tavily_search",
        "description": "Uses the Tavily API to perform a web search to find real-time information, answer questions, or research topics. Returns a list of search results with summaries and links.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to execute."
                }
            },
            "required": ["query"]
        }
    }
};

// Existing image analysis tool definition (schema extracted from config.js)
const image_url_analyzer = {
    "type": "function",
    "function": {
        "name": "glm4v.analyze_image",
        "description": "Analyze image using GLM-4V model",
        "parameters": {
            "type": "object",
            "required": ["model", "image_url", "prompt"],
            "properties": {
                "model": {
                    "type": "string",
                    "enum": ["glm-4v-flash"],
                    "description": "Model to use"
                },
                "image_url": {
                    "type": "string",
                    "description": "Image URL to analyze"
                },
                "prompt": {
                    "type": "string",
                    "description": "Question or instruction about the image"
                }
            }
        }
    }
};

// Python sandbox tool definition
const python_sandbox = {
    "type": "function",
    "function": {
        "name": "python_sandbox",
        "description": "Executes a snippet of Python code in a sandboxed environment and returns the output. This tool is secure and has no access to the internet or the host filesystem.",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The Python code to be executed in the sandbox."
                }
            },
            "required": ["code"]
        }
    }
};

// 新增 mcp_tool_catalog 工具定义
const mcp_tool_catalog = {
    "type": "function",
    "function": {
        "name": "mcp_tool_catalog",
        "description": "Retrieves a list of all available Multi-Cloud Platform (MCP) tools, including their descriptions and input schemas. Useful for dynamically discovering tools the agent can use.",
        "parameters": {
            "type": "object",
            "properties": {}, // 目前无需参数
            "required": []
        }
    }
};

// Export all available tools in an array
export const mcpTools = [
    tavily_search,
    image_url_analyzer,
    python_sandbox,
    mcp_tool_catalog // 添加新工具
    // Future tools can be added here
];

// Export a map for easy lookup by name
export const mcpToolsMap = {
    'tavily_search': tavily_search,
    'glm4v.analyze_image': image_url_analyzer,
    'python_sandbox': python_sandbox,
    'mcp_tool_catalog': mcp_tool_catalog // 添加新工具映射
};
