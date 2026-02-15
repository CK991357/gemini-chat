"""工具注册表"""
from typing import Dict, Any
from pydantic import ValidationError
import logging

# 配置日志
logger = logging.getLogger(__name__)

# 导入工具类
from .tavily_search import TavilySearchTool
from .code_interpreter import CodeInterpreterTool as PythonSandboxTool
from .firecrawl_tool import FirecrawlTool
from .stockfish_tool import StockfishTool
from .crawl4ai_tool_all import EnhancedCrawl4AITool  # 改为增强版本
from .alphavantage_tool import AlphaVantageTool  # 新增AlphaVantage工具

# --- Tool Classes Registry ---
TOOL_CLASSES = {
    TavilySearchTool.name: TavilySearchTool,
    PythonSandboxTool.name: PythonSandboxTool,
    FirecrawlTool.name: FirecrawlTool,
    StockfishTool.name: StockfishTool,
    EnhancedCrawl4AITool.name: EnhancedCrawl4AITool,  # 更新为增强版类名
    AlphaVantageTool.name: AlphaVantageTool,  # 新增
}

# --- Shared Tool Instances ---
# 这个字典将持有工具的单例实例
tool_instances: Dict[str, Any] = {}

async def initialize_tools():
    """创建并初始化所有工具的实例"""
    logger.info("Starting tool initialization...")
    
    for name, tool_class in TOOL_CLASSES.items():
        try:
            # 创建工具实例
            tool_instance = tool_class()
            tool_instances[name] = tool_instance
            logger.info(f"Created instance for tool: {name}")
            
            # 特别为 crawl4ai 预热浏览器
            if name == "crawl4ai":
                logger.info("Pre-warming browser for crawl4ai...")
                await tool_instance.initialize()
                logger.info("Browser pre-warmed successfully for crawl4ai")
            
            # AlphaVantage工具不需要特殊预热，但可以记录初始化成功
            if name == "alphavantage":
                logger.info(f"AlphaVantage tool initialized successfully")
                
        except Exception as e:
            logger.error(f"Failed to initialize tool {name}: {str(e)}")
            # 如果某个工具初始化失败，我们仍然继续初始化其他工具
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
    
    🎯 新增：支持session_id参数，用于会话隔离和数据共享
    """
    if tool_name not in tool_instances:
        available_tools = list(tool_instances.keys())
        error_msg = f"Tool '{tool_name}' not found or not initialized. Available tools: {available_tools}"
        logger.warning(error_msg)
        raise ValueError(error_msg)

    tool_instance = tool_instances[tool_name]
    
    # 🎯 核心修复：在验证前从原始参数中提取session_id
    extracted_session_id = None
    if tool_name == "alphavantage":
        # 从原始参数中提取 session_id（如果存在）
        extracted_session_id = parameters.get("session_id")
        # 复制参数并移除 session_id，避免验证错误
        parameters_for_validation = {k: v for k, v in parameters.items() if k != "session_id"}
    else:
        parameters_for_validation = parameters
        # 对于其他工具，使用传入的session_id参数
        extracted_session_id = session_id
    
    # 输入验证 (使用 tool_instance 的 schema)
    try:
        input_schema = tool_instance.input_schema
        validated_parameters = input_schema(**parameters_for_validation)
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
        logger.info(f"Executing tool: {tool_name} with mode: {getattr(validated_parameters, 'mode', 'N/A')}")
        
        # 🎯 修复后：为AlphaVantage工具传递session_id
        if tool_name == "alphavantage":
            result = await tool_instance.execute(validated_parameters, session_id=extracted_session_id)
        else:
            # 其他工具只传递 validated_parameters，避免多余位置参数
            result = await tool_instance.execute(validated_parameters)
            
        logger.info(f"Tool {tool_name} executed successfully")
        return result
    except Exception as e:
        logger.error(f"Error executing tool {tool_name}: {str(e)}")
        return {
            "success": False,
            "error": f"An error occurred while executing tool '{tool_name}': {str(e)}"
        }