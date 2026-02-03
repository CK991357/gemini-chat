from typing import Dict, Any
from pydantic import ValidationError
import logging
import inspect

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

def _get_execute_parameter_count(tool_instance):
    """检查工具的 execute 方法需要多少个参数（包括有默认值的参数，不包括self）"""
    try:
        execute_method = tool_instance.execute
        # 使用 inspect 获取参数信息
        sig = inspect.signature(execute_method)
        params = sig.parameters
        
        # ✅ 修正：计算参数总数（不包括self），而不是只计算非默认参数
        total_params = len(params) - 1  # 减去self
        
        # 调试信息
        param_names = []
        for param_name, param in params.items():
            if param_name != 'self':
                has_default = param.default != inspect.Parameter.empty
                param_names.append(f"{param_name}{'=...' if has_default else ''}")
        
        logger.debug(f"工具 {tool_instance.name} 的 execute 方法有 {total_params} 个参数: [{', '.join(param_names)}]")
        
        return total_params
    except Exception as e:
        logger.warning(f"无法检查工具 {tool_instance.name} 的参数数量: {e}")
        return 1  # 默认返回1（大多数工具的默认值）

async def execute_tool(tool_name: str, parameters: Dict[str, Any], session_id: str = None) -> Dict[str, Any]:
    """
    使用共享的工具实例来查找、验证和执行工具。
    
    🎯 新增：支持向后兼容和向前兼容
    - 现有工具：只传递一个参数（parameters）
    - 新工具（如 alphavantage, python_sandbox）：可以传递两个参数（parameters, session_id）
    """
    logger.info(f"[EXECUTE_TOOL] 开始执行: {tool_name}, session_id: {session_id or 'none'}")
    
    if tool_name not in tool_instances:
        available_tools = list(tool_instances.keys())
        error_msg = f"Tool '{tool_name}' not found or not initialized. Available tools: {available_tools}"
        logger.warning(error_msg)
        raise ValueError(error_msg)

    tool_instance = tool_instances[tool_name]
    
    # 🎯 核心修复：不要修改 parameters，直接使用传入的参数
    # 现有工具不需要 session_id 参数，新工具会处理 session_id
    
    # 输入验证 (使用 tool_instance 的 schema)
    try:
        input_schema = tool_instance.input_schema
        validated_parameters = input_schema(**parameters)
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
        logger.info(f"Executing tool: {tool_name}")
        
        # 🎯 核心：根据工具的 execute 方法签名决定调用方式
        param_count = _get_execute_parameter_count(tool_instance)
        
        if param_count == 1:
            # 工具只接受一个参数（大多数现有工具）
            result = await tool_instance.execute(validated_parameters)
        elif param_count >= 2:
            # ✅ 修正：工具接受两个或更多参数（如 alphavantage, python_sandbox）
            # 我们只传递前两个参数：validated_parameters 和 session_id
            result = await tool_instance.execute(validated_parameters, session_id)
        else:
            # 理论上不会出现，但保留处理
            logger.warning(f"工具 {tool_name} 需要 {param_count} 个参数，尝试调用...")
            result = await tool_instance.execute(validated_parameters)
        
        logger.info(f"Tool {tool_name} executed successfully")
        return result
        
    except TypeError as e:
        # 🎯 专门处理参数不匹配错误
        logger.error(f"参数不匹配错误 for tool {tool_name}: {str(e)}")
        
        # 尝试回退到单参数调用
        try:
            logger.warning(f"尝试使用单参数回退方式调用 {tool_name}")
            result = await tool_instance.execute(validated_parameters)
            return result
        except Exception as fallback_error:
            logger.error(f"回退调用也失败: {fallback_error}")
            return {
                "success": False,
                "error": f"工具执行失败: {str(e)}",
                "suggestion": f"工具 {tool_name} 可能不兼容当前参数格式"
            }
            
    except Exception as e:
        logger.error(f"Error executing tool {tool_name}: {str(e)}", exc_info=True)
        
        # 提供更详细的错误信息
        error_detail = {
            "success": False,
            "error": f"执行工具 '{tool_name}' 时出错: {str(e)}",
            "tool_name": tool_name,
            "error_type": type(e).__name__
        }
        
        # 如果是模块导入错误，提供特定建议
        if "No module named" in str(e):
            error_detail["suggestion"] = f"工具 {tool_name} 依赖的模块可能未正确安装"
        
        return error_detail