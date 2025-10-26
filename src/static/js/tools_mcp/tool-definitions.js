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
        "name": "glm4v_analyze_image",
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
        "description": "Executes a snippet of Python code in a sandboxed environment for data analysis and visualization. Can return Base64 encoded images (PNG format). This tool is secure and has no access to the internet or the host filesystem.",
        "parameters": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "The Python code to be executed in the sandbox."
                }
            },
            "required": ["code"]
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "stdout": {
                    "type": "string",
                    "description": "Standard output from the executed code. If an image is generated, this will contain its Base64 encoded string (typically starts with 'iVBORw0KGgo' for PNG)."
                },
                "stderr": {
                    "type": "string",
                    "description": "Standard error output from the executed code."
                },
                "exit_code": {
                    "type": "number",
                    "description": "Exit code of the executed code (0 for success, non-zero for failure)."
                }
            }
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

// Firecrawl tool definition
const firecrawl = {
    "type": "function",
    "function": {
        "name": "firecrawl",
        "description": "A powerful tool to scrape, crawl, search, map, or extract structured data from web pages. Modes: 'scrape' for a single URL, 'search' for a web query, 'crawl' for an entire website, 'map' to get all links, 'extract' for AI-powered data extraction, and 'check_status' for async jobs.",
        "parameters": {
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["scrape", "search", "crawl", "map", "extract", "check_status"],
                    "description": "The function to execute."
                },
                "parameters": {
                    "type": "object",
                    "description": "A dictionary of parameters for the selected mode."
                }
            },
            "required": ["mode", "parameters"]
        }
    }
};

// Stockfish analyzer tool definition
const stockfish_analyzer = {
    "type": "function",
    "function": {
        "name": "stockfish_analyzer",
        "description": "一个强大的国际象棋分析工具，使用Stockfish引擎。通过'mode'参数选择不同的分析功能。",
        "parameters": {
            "type": "object",
            "properties": {
                "fen": {
                    "type": "string",
                    "description": "必需。当前棋盘局面的FEN字符串。"
                },
                "mode": {
                    "type": "string",
                    "description": "必需。要执行的分析模式。可选值: 'get_best_move', 'get_top_moves', 'evaluate_position'。",
                    "enum": ["get_best_move", "get_top_moves", "evaluate_position"]
                },
                "options": {
                    "type": "object",
                    "description": "可选。为特定模式提供额外参数。",
                    "properties": {
                        "skill_level": {
                            "type": "number",
                            "description": "设置Stockfish的技能等级 (0-20)。默认20。",
                            "minimum": 0,
                            "maximum": 20
                        },
                        "depth": {
                            "type": "number",
                            "description": "分析深度 (1-30)。数值越高，计算越准但越慢。默认15。",
                            "minimum": 1,
                            "maximum": 30
                        },
                        "count": {
                            "type": "number",
                            "description": "在 'get_top_moves' 模式下，要返回的最佳走法数量。默认3。"
                        }
                    }
                }
            },
            "required": ["fen", "mode"]
        }
    }
};

// Crawl4AI tool definition - UPDATED with all 7 modes
const crawl4ai = {
    "type": "function",
    "function": {
        "name": "crawl4ai",
        "description": "A powerful open-source tool to scrape, crawl, extract structured data, export PDFs, and capture screenshots from web pages. Supports deep crawling with multiple strategies (BFS, DFS, BestFirst), batch URL processing, AI-powered extraction, and advanced content filtering. All outputs are returned as memory streams (base64 for binary data).",
        "parameters": {
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["scrape", "crawl", "deep_crawl", "extract", "batch_crawl", "pdf_export", "screenshot"],
                    "description": "The Crawl4AI function to execute."
                },
                "parameters": {
                    "type": "object",
                    "description": "Parameters for the selected mode, matching the respective schema."
                }
            },
            "required": ["mode", "parameters"]
        }
    }
};

// Export all available tools in an array
export const mcpTools = [
    tavily_search,
    image_url_analyzer,
    python_sandbox,
    mcp_tool_catalog, // 添加新工具
    firecrawl,
    stockfish_analyzer,
    crawl4ai
    // Future tools can be added here
];

// Export a map for easy lookup by name
export const mcpToolsMap = {
    'tavily_search': tavily_search,
    'glm4v_analyze_image': image_url_analyzer,
    'python_sandbox': python_sandbox,
    'mcp_tool_catalog': mcp_tool_catalog, // 添加新工具映射
    'firecrawl': firecrawl,
    'stockfish_analyzer': stockfish_analyzer,
    'crawl4ai': crawl4ai
};

// Create a deep copy of python_sandbox and remove the output_schema for Gemini compatibility
const python_sandbox_gemini = JSON.parse(JSON.stringify(python_sandbox));
delete python_sandbox_gemini.function.output_schema;

// Create a deep copy of firecrawl and remove the output_schema for Gemini compatibility
const firecrawl_gemini = JSON.parse(JSON.stringify(firecrawl));
delete firecrawl_gemini.function.output_schema;

// Create a deep copy of crawl4ai and remove any output_schema for Gemini compatibility
const crawl4ai_gemini = JSON.parse(JSON.stringify(crawl4ai));
if (crawl4ai_gemini.function.output_schema) {
    delete crawl4ai_gemini.function.output_schema;
}

// Gemini-specific toolset without output_schema
export const geminiMcpTools = [
    tavily_search,
    python_sandbox_gemini,
    firecrawl_gemini,
    stockfish_analyzer,
    crawl4ai_gemini
];
