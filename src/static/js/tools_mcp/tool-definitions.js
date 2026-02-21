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

// AlphaVantage tool definition - 20种模式
const alphavantage = {
    "type": "function",
    "function": {
        "name": "alphavantage",
        "description": "从AlphaVantage获取金融数据的完整工具。支持股票、财报、基本面数据、内部交易、ETF、外汇、数字货币、大宗商品、国债收益率、新闻情绪等20种数据类型。数据会返回在响应中，可用于进一步分析。",
        "parameters": {
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "description": "要执行的AlphaVantage功能模式",
                    "enum": [
                        "weekly_adjusted",
                        "global_quote",
                        "earnings_transcript",
                        "insider_transactions",
                        "etf_profile",
                        "forex_daily",
                        "digital_currency_daily",
                        "wti",
                        "brent",
                        "copper",
                        "treasury_yield",
                        "news_sentiment",
                        "overview",
                        "income_statement",
                        "balance_sheet",
                        "cash_flow",
                        "earnings",
                        "earnings_estimates",
                        "dividends",
                        "shares_outstanding"
                    ]
                },
                "parameters": {
                    "type": "object",
                    "description": "功能参数，具体参数取决于选择的mode"
                }
            },
            "required": ["mode", "parameters"]
        }
    }
};

// ========== 新增：财务报告生成工具 ==========
const financial_report_generator = {
    "type": "function",
    "function": {
        "name": "financial_report_generator",
        "description": "从会话工作区中读取 AlphaVantage 获取的原始 JSON 文件（如 income_statement_*.json, balance_sheet_*.json 等），生成两种财务报告：基础财务数据详表（包含同比、CAGR、健康评分）和财务比率历史数据表格（多年度对比）。模式 base 仅生成基础财务报告，ratio 仅生成比率历史报告，both 同时生成两者。参数中可指定 symbol，若不指定则自动从文件名推断。",
        "parameters": {
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["base", "ratio", "both"],
                    "description": "要生成的报告类型：base（基础财务数据）、ratio（财务比率历史数据）、both（两者）"
                },
                "parameters": {
                    "type": "object",
                    "properties": {
                        "symbol": {
                            "type": "string",
                            "description": "股票代码，如 AAPL。若未提供，将自动从会话目录中的 JSON 文件推断。"
                        }
                    }
                }
            },
            "required": ["mode", "parameters"]
        }
    }
};

// Export all available tools in an array
export const mcpTools = [
    tavily_search,
    python_sandbox,
    mcp_tool_catalog,
    firecrawl,
    stockfish_analyzer,
    crawl4ai,
    alphavantage,
    financial_report_generator  // 新增
];

// Export a map for easy lookup by name
export const mcpToolsMap = {
    'tavily_search': tavily_search,
    'python_sandbox': python_sandbox,
    'mcp_tool_catalog': mcp_tool_catalog,
    'firecrawl': firecrawl,
    'stockfish_analyzer': stockfish_analyzer,
    'crawl4ai': crawl4ai,
    'alphavantage': alphavantage,
    'financial_report_generator': financial_report_generator  // 新增
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

// Create a deep copy of alphavantage for Gemini compatibility
const alphavantage_gemini = JSON.parse(JSON.stringify(alphavantage));

// Create a deep copy of financial_report_generator for Gemini compatibility
const financial_report_generator_gemini = JSON.parse(JSON.stringify(financial_report_generator));

// Gemini-specific toolset without output_schema
export const geminiMcpTools = [
    tavily_search,
    python_sandbox_gemini,
    firecrawl_gemini,
    stockfish_analyzer,
    crawl4ai_gemini,
    alphavantage_gemini,
    financial_report_generator_gemini  // 新增
];