from typing import Dict, Any
from pydantic import ValidationError
import logging
import os

# 配置日志
logger = logging.getLogger(__name__)

# 导入工具类
from .tavily_search import TavilySearchTool
from .code_interpreter import CodeInterpreterTool as PythonSandboxTool
from .firecrawl_tool import FirecrawlTool
from .stockfish_tool import StockfishTool
from .crawl4ai_tool_all import EnhancedCrawl4AITool
from .alphavantage_tool import AlphaVantageTool  # 新增导入

# --- Tool Classes Registry ---
TOOL_CLASSES = {
    TavilySearchTool.name: TavilySearchTool,
    PythonSandboxTool.name: PythonSandboxTool,
    FirecrawlTool.name: FirecrawlTool,
    StockfishTool.name: StockfishTool,
    EnhancedCrawl4AITool.name: EnhancedCrawl4AITool,
    AlphaVantageTool.name: AlphaVantageTool,  # 新增
}

# --- Shared Tool Instances ---
tool_instances: Dict[str, Any] = {}

async def initialize_tools():
    """创建并初始化所有工具的实例"""
    logger.info("Starting tool initialization...")
    
    # 设置数据目录（从环境变量读取）
    data_dir = os.getenv("ALPHAVANTAGE_DATA_DIR", "/tmp/alphavantage_data")
    os.makedirs(data_dir, exist_ok=True)
    logger.info(f"AlphaVantage data directory: {data_dir}")
    
    for name, tool_class in TOOL_CLASSES.items():
        try:
            # 创建工具实例
            tool_instance = tool_class()
            tool_instances[name] = tool_instance
            logger.info(f"Created instance for tool: {name}")
            
            # 对于alphavantage工具，设置数据目录
            if name == "alphavantage":
                # 确保数据目录存在
                os.makedirs(data_dir, exist_ok=True)
                logger.info(f"AlphaVantage tool initialized with data dir: {data_dir}")
                
            # 特别为 crawl4ai 预热浏览器
            elif name == "crawl4ai":
                logger.info("Pre-warming browser for crawl4ai...")
                await tool_instance.initialize()
                logger.info("Browser pre-warmed successfully for crawl4ai")
                
        except Exception as e:
            logger.error(f"Failed to initialize tool {name}: {str(e)}")
            continue
    
    logger.info(f"Tool initialization completed. Available tools: {list(tool_instances.keys())}")

async def cleanup_tools():
    """清理需要特殊处理的工具资源"""
    logger.info("Starting tool cleanup...")
    
    # 特别清理 crawl4ai 的浏览器资源
    if "crawl4ai" in tool_instances:
        try:
            await tool_instances["crawl4ai"].cleanup()
            logger.info("crawl4ai browser resources cleaned up successfully")
        except Exception as e:
            logger.error(f"Error cleaning up crawl4ai: {str(e)}")
    
    # 清空工具实例字典
    tool_instances.clear()
    logger.info("All tool instances cleaned up")

async def execute_tool(tool_name: str, parameters: Dict[str, Any], session_id: str = None) -> Dict[str, Any]:
    """
    使用共享的工具实例来查找、验证和执行工具。
    新增：支持传递 session_id 参数
    """
    if tool_name not in tool_instances:
        available_tools = list(tool_instances.keys())
        error_msg = f"Tool '{tool_name}' not found or not initialized. Available tools: {available_tools}"
        logger.warning(error_msg)
        raise ValueError(error_msg)

    tool_instance = tool_instances[tool_name]
    
    # 🎯 核心修改：根据工具类型处理 session_id
    processed_parameters = parameters.copy() if isinstance(parameters, dict) else {}
    
    # 对于 alphavantage 工具，特殊处理参数结构
    if tool_name == "alphavantage":
        # alphavantage 的参数结构是：{"function": "...", "parameters": {...}}
        if "function" not in processed_parameters:
            return {
                "success": False,
                "error": "AlphaVantage requires 'function' parameter",
                "available_functions": [
                    "fetch_weekly_adjusted", "fetch_global_quote",
                    "fetch_historical_options", "fetch_earnings_transcript",
                    "fetch_insider_transactions", "fetch_etf_profile",
                    "fetch_forex_daily", "fetch_digital_currency_daily",
                    "fetch_wti", "fetch_brent", "fetch_copper",
                    "fetch_treasury_yield", "fetch_news_sentiment"
                ]
            }
        
        # 确保内部 parameters 存在
        if "parameters" not in processed_parameters:
            processed_parameters["parameters"] = {}
        
        # 将 session_id 添加到内部 parameters 中
        if session_id:
            processed_parameters["parameters"]["session_id"] = session_id
    
    else:
        # 对于其他工具，直接将 session_id 添加到参数中
        if session_id and isinstance(processed_parameters, dict):
            processed_parameters["session_id"] = session_id
    
    # 输入验证 (使用 tool_instance 的 schema)
    try:
        input_schema = tool_instance.input_schema
        validated_parameters = input_schema(**processed_parameters)
        logger.debug(f"Input validation passed for tool: {tool_name}")
    except ValidationError as e:
        logger.warning(f"Input validation failed for tool {tool_name}: {e.errors()}")
        return {
            "success": False,
            "error": "Input validation failed",
            "details": e.errors()
        }
    
    # 工具执行 (使用已存在的实例)
    try:
        logger.info(f"Executing tool: {tool_name} with session_id: {session_id}")
        
        # 🎯 核心：传递 session_id 给工具的 execute 方法
        result = await tool_instance.execute(validated_parameters, session_id)
        
        # 如果结果中包含 session_id 信息，记录日志
        if session_id and isinstance(result, dict):
            logger.info(f"Tool {tool_name} executed for session {session_id}")
            
        logger.info(f"Tool {tool_name} executed successfully")
        return result
    except Exception as e:
        logger.error(f"Error executing tool {tool_name}: {str(e)}")
        return {
            "success": False,
            "error": f"An error occurred while executing tool '{tool_name}': {str(e)}"
        }