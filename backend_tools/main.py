"""FastAPI主应用"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List
from dotenv import load_dotenv
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 在所有其他导入之前加载.env文件中的环境变量
load_dotenv()

# 导入我们真实的工具执行器
from tools.tool_registry import execute_tool, tool_instances, initialize_tools, cleanup_tools

app = FastAPI(
    title="Python Tool Server & Documentation Gateway",
    description="Executes Python-based tools and provides a unified documentation endpoint for all available services.",
    version="2.0.0",
)

@app.on_event("startup")
async def startup_event():
    """在应用启动时初始化需要预热的工具"""
    logger.info("Initializing tool instances...")
    await initialize_tools()
    logger.info("All tool instances initialized successfully.")

@app.on_event("shutdown") 
async def shutdown_event():
    """在应用关闭时清理工具资源"""
    logger.info("Cleaning up tool instances...")
    await cleanup_tools()
    logger.info("All tool instances cleaned up successfully.")

# --- 工具文档目录 ---
TOOLS_CATALOG = [
  {
    "name": "tavily_search",
    "description": "Performs a web search using the Tavily API to find real-time information. This tool is executed by this service.",
    "endpoint_url": "https://tools.10110531.xyz/api/v1/execute_tool",
    "input_schema": {
      "title": "TavilySearchInput",
      "type": "object",
      "properties": {
        "query": { "title": "Query", "type": "string", "description": "The search query to execute." }
      },
      "required": ["query"]
    }
  },
  {
    "name": "python_sandbox",
    "description": "Executes Python code in a secure, isolated Docker environment. This is an external service with its own endpoint.",
    "endpoint_url": "https://pythonsandbox.10110531.xyz/api/v1/python_sandbox",
    "input_schema": {
      "title": "CodeInterpreterInput",
      "type": "object",
      "properties": {
        "code": { "title": "Code", "type": "string", "description": "The Python code to be executed." }
      },
      "required": ["code"]
    }
  },
  {
    "name": "firecrawl",
    "description": "A powerful tool to scrape, crawl, search, map, or extract structured data from web pages. Modes: 'scrape' for a single URL, 'search' for a web query, 'crawl' for an entire website, 'map' to get all links, 'extract' for AI-powered data extraction, and 'check_status' for async jobs.",
    "endpoint_url": "https://tools.10110531.xyz/api/v1/execute_tool",
    "input_schema": {
      "title": "FirecrawlInput",
      "type": "object",
      "properties": {
        "mode": { "title": "Mode", "type": "string", "enum": ["scrape", "search", "crawl", "map", "extract", "check_status"], "description": "The function to execute." },
        "parameters": { "title": "Parameters", "type": "object", "description": "A dictionary of parameters for the selected mode." }
      },
      "required": ["mode", "parameters"]
    }
  },
  {
    "name": "stockfish_analyzer",
    "description": "A powerful chess analysis tool using the Stockfish engine. Use different modes to get the best move, top several moves, or a positional evaluation.",
    "endpoint_url": "https://tools.10110531.xyz/api/v1/execute_tool",
    "input_schema": {
      "title": "StockfishInput",
      "type": "object",
      "properties": {
        "mode": { "title": "Mode", "type": "string", "enum": ["get_best_move", "get_top_moves", "evaluate_position"], "description": "The analysis mode to execute." },
        "fen": { "title": "FEN", "type": "string", "description": "The FEN string of the current board position." },
        "options": {
          "title": "Options",
          "type": "object",
          "properties": {
            "skill_level": { "title": "Skill Level", "type": "integer", "default": 20, "minimum": 0, "maximum": 20 },
            "depth": { "title": "Depth", "type": "integer", "default": 15, "minimum": 1, "maximum": 30 },
            "count": { "title": "Count", "type": "integer", "default": 3, "minimum": 1, "maximum": 10 }
          }
        }
      },
      "required": ["mode", "fen"]
    }
  },
  {
    "name": "crawl4ai",
    "description": "A powerful open-source tool to scrape, crawl, extract structured data, export PDFs, and capture screenshots from web pages. Supports deep crawling with multiple strategies (BFS, DFS, BestFirst), batch URL processing, AI-powered extraction, and advanced content filtering. All outputs are returned as memory streams (base64 for binary data).",
    "endpoint_url": "https://tools.10110531.xyz/api/v1/execute_tool",
    "input_schema": {
      "title": "Crawl4AIInput",
      "type": "object",
      "properties": {
        "mode": { 
          "title": "Mode", 
          "type": "string", 
          "enum": ["scrape", "crawl", "deep_crawl", "extract", "batch_crawl", "pdf_export", "screenshot"], 
          "description": "The function to execute." 
        },
        "parameters": { 
          "title": "Parameters", 
          "type": "object", 
          "description": "A dictionary of parameters for the selected mode." 
        }
      },
      "required": ["mode", "parameters"]
    }
  },
  {
    "name": "alphavantage",
    "description": "从AlphaVantage获取金融数据的完整工具。支持股票、期权、财报、内部交易、ETF、外汇、数字货币、大宗商品、国债收益率、新闻情绪等13种数据类型。数据会保存到会话工作区。",
    "endpoint_url": "https://tools.10110531.xyz/api/v1/execute_tool",
    "input_schema": {
      "title": "AlphaVantageInput",
      "type": "object",
      "properties": {
        "mode": { 
          "title": "Mode", 
          "type": "string", 
          "enum": ["weekly_adjusted", "global_quote", "historical_options", "earnings_transcript", "insider_transactions", "etf_profile", "forex_daily", "digital_currency_daily", "wti", "brent", "copper", "treasury_yield", "news_sentiment"], 
          "description": "要执行的AlphaVantage功能模式" 
        },
        "parameters": { 
          "title": "Parameters", 
          "type": "object", 
          "description": "功能参数" 
        }
      },
      "required": ["mode", "parameters"]
    },
    # 🎯 新增：添加参数示例
    "examples": {
      "weekly_adjusted": {
        "mode": "weekly_adjusted",
        "parameters": {"symbol": "AAPL"}
      },
      "global_quote": {
        "mode": "global_quote",
        "parameters": {"symbol": "MSFT"}
      },
      "forex_daily": {
        "mode": "forex_daily", 
        "parameters": {"from_symbol": "USD", "to_symbol": "JPY", "outputsize": "full"}
      },
      "news_sentiment": {
        "mode": "news_sentiment",
        "parameters": {"tickers": "AAPL,MSFT", "limit": 50}
      },
      "treasury_yield": {
        "mode": "treasury_yield",
        "parameters": {"maturity": "10year", "interval": "monthly"}
      }
    }
  }
]

class ToolExecutionRequest(BaseModel):
    """工具执行请求模型"""
    tool_name: str
    parameters: Dict[str, Any]
    # 🎯 新增：支持可选的session_id
    session_id: str = None

@app.get("/")
def read_root():
    """ A simple endpoint to check if the server is running. """
    return {"status": "Python Tool Server is running. Visit /api/v1/docs for the tool catalog."}

@app.get(
    "/api/v1/docs",
    summary="Get Documentation for All Available Tools",
    response_model=List[Dict[str, Any]]
)
async def get_tool_documentation():
    """
    Returns a complete, machine-readable list of all available tools (internal and external),
    including their descriptions, input schemas, and specific endpoints for execution.
    """
    return TOOLS_CATALOG

@app.post("/api/v1/execute_tool")
async def api_execute_tool(request: ToolExecutionRequest):
    """
    Executes a specified tool with the given parameters.
    This is the main endpoint for the tool server.
    """
    try:
        # 🎯 修复：传递session_id给execute_tool函数
        result = await execute_tool(
            request.tool_name, 
            request.parameters.dict() if hasattr(request.parameters, 'dict') else request.parameters
        )
        
        # 如果工具执行本身失败，也可能需要一个特定的HTTP状态码
        if isinstance(result, dict) and result.get("success") == False:
            # 检查是否有验证错误
            if "details" in result:
                 raise HTTPException(status_code=400, detail=result) # Bad Request for validation errors
            # 其他工具执行错误
            raise HTTPException(status_code=500, detail=result)

        return result
    except ValueError as e:
        # 如果工具不存在，返回 404
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        # 处理其他所有执行期间的错误
        logger.error(f"Unexpected error in tool execution: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

# To run this server, you would use a command like:
# uvicorn main:app --host 0.0.0.0 --port 8827 --reload