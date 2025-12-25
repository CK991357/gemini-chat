"""AlphaVantage金融数据获取工具 - 最终正确版本"""
import os
import logging
import json
import pandas as pd
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime, timedelta
from pathlib import Path

# 导入完整的AlphaVantage数据获取器
from data_fetcher_alphavantage import AlphaVantageFetcher

logger = logging.getLogger(__name__)

# ==================== 配置区 ====================
SESSION_WORKSPACE_ROOT = Path("/srv/sandbox_workspaces")
SESSION_TIMEOUT_HOURS = 24

# ==================== Pydantic模型定义 ====================

class AlphaVantageFunction(str, Enum):
    """支持的AlphaVantage功能列表 - 完整13个功能"""
    FETCH_WEEKLY_ADJUSTED = "fetch_weekly_adjusted"
    FETCH_GLOBAL_QUOTE = "fetch_global_quote"
    FETCH_HISTORICAL_OPTIONS = "fetch_historical_options"
    FETCH_EARNINGS_TRANSCRIPT = "fetch_earnings_transcript"
    FETCH_INSIDER_TRANSACTIONS = "fetch_insider_transactions"
    FETCH_ETF_PROFILE = "fetch_etf_profile"
    FETCH_FOREX_DAILY = "fetch_forex_daily"
    FETCH_DIGITAL_CURRENCY_DAILY = "fetch_digital_currency_daily"
    FETCH_WTI = "fetch_wti"
    FETCH_BRENT = "fetch_brent"
    FETCH_COPPER = "fetch_copper"
    FETCH_TREASURY_YIELD = "fetch_treasury_yield"
    FETCH_NEWS_SENTIMENT = "fetch_news_sentiment"

class AlphaVantageInput(BaseModel):
    """AlphaVantage工具输入模型"""
    function: AlphaVantageFunction = Field(description="要调用的AlphaVantage功能")
    parameters: Dict[str, Any] = Field(description="功能参数")

# ==================== 工具类 ====================

class AlphaVantageTool:
    name = "alphavantage"
    description = (
        "从AlphaVantage获取金融数据的完整工具。支持股票、期权、财报、内部交易、ETF、外汇、"
        "数字货币、大宗商品、国债收益率、新闻情绪等13种数据类型。数据会保存到会话工作区。"
    )
    input_schema = AlphaVantageInput
    
    def __init__(self):
        # 确保工作区根目录存在
        SESSION_WORKSPACE_ROOT.mkdir(exist_ok=True, parents=True)
        logger.info(f"AlphaVantage工具初始化，工作区目录: {SESSION_WORKSPACE_ROOT}")
        
        # 验证API Key
        self._validate_api_key()
    
    def _validate_api_key(self):
        """验证API Key是否配置"""
        try:
            api_key = AlphaVantageFetcher.get_api_key()
            if api_key and api_key != "U5KM36DHDXR95Q7Q":
                logger.info("✅ AlphaVantage API Key 已正确配置")
            else:
                logger.warning("⚠️ AlphaVantage API Key 未配置或使用默认值，请检查.env文件")
        except Exception as e:
            logger.error(f"验证API Key时出错: {e}")
    
    def _ensure_session_workspace(self, session_id: str) -> Path:
        """确保会话工作区存在"""
        if not session_id:
            # 临时目录
            temp_dir = SESSION_WORKSPACE_ROOT / "temp" / str(int(datetime.now().timestamp()))
            temp_dir.mkdir(parents=True, exist_ok=True)
            return temp_dir
        
        session_dir = SESSION_WORKSPACE_ROOT / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建子目录结构
        subdirs = [
            "alphavantage", "stock", "options", "etf", "forex", 
            "crypto", "commodities", "treasury", "news", "raw_data"
        ]
        
        for subdir in subdirs:
            (session_dir / subdir).mkdir(exist_ok=True)
        
        return session_dir
    
    async def execute(self, parameters: AlphaVantageInput, session_id: str = None) -> dict:
        """执行AlphaVantage数据获取"""
        try:
            function_name = parameters.function.value
            function_params = parameters.parameters
            
            # 确保会话工作区
            session_dir = self._ensure_session_workspace(session_id)
            logger.info(f"使用会话目录: {session_dir}")
            
            # 元数据
            metadata = {
                "function": function_name,
                "parameters": function_params,
                "session_id": session_id,
                "timestamp": datetime.now().isoformat(),
                "saved_files": [],
                "data_type": function_name,
                "session_dir": str(session_dir),
                "data_access_path": f"/srv/sandbox_workspaces/{session_id if session_id else 'temp/' + str(int(datetime.now().timestamp()))}"
            }
            
            # 调用对应的方法
            try:
                # 🎯 修改：传递session_dir给数据获取函数
                method = getattr(AlphaVantageFetcher, function_name)
                result = method(**function_params, session_dir=session_dir)
                
                # 获取已保存的文件路径
                saved_files = self._get_saved_file_paths(session_dir, function_name, function_params)
                metadata["saved_files"] = saved_files
                
                # 处理返回结果
                processed_result = self._process_result(result, function_name)
                
                # 构建响应
                response = {
                    "success": True,
                    "data": processed_result,
                    "metadata": metadata
                }
                
                # 添加示例代码
                if session_id:
                    example_code = self._generate_example_code(function_name, function_params, session_dir)
                    response["metadata"]["example_code"] = example_code
                    response["metadata"]["instructions"] = (
                        f"数据已保存到会话目录 {session_dir}，"
                        f"代码解释器可以通过 '/srv/sandbox_workspaces/{session_id}/' 访问这些文件。"
                    )
                
                logger.info(f"AlphaVantage工具执行成功: {function_name}")
                return response
                
            except AttributeError as e:
                return {
                    "success": False,
                    "error": f"不支持的函数: {function_name}",
                    "function": function_name
                }
            except Exception as e:
                logger.error(f"AlphaVantage API调用失败: {e}", exc_info=True)
                return {
                    "success": False,
                    "error": f"数据获取失败: {str(e)}",
                    "function": function_name
                }
                
        except Exception as e:
            logger.error(f"AlphaVantage工具执行失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"工具执行失败: {str(e)}",
                "function": parameters.function.value if hasattr(parameters, 'function') else "unknown"
            }
    
    def _get_saved_file_paths(self, session_dir: Path, function_name: str, params: dict) -> List[str]:
        """获取已保存的文件路径"""
        try:
            if function_name == "fetch_weekly_adjusted":
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / "stock" / f"{symbol}.parquet"
                    return [str(file_path)] if file_path.exists() else []
            
            elif function_name == "fetch_forex_daily":
                from_sym = params.get("from_symbol", "USD")
                to_sym = params.get("to_symbol", "JPY")
                file_path = session_dir / "forex" / f"{from_sym}_{to_sym}.parquet"
                return [str(file_path)] if file_path.exists() else []
            
            elif function_name == "fetch_news_sentiment":
                tickers = params.get("tickers", "general")
                safe_tickers = tickers.replace(',', '_').replace(' ', '_')
                file_path = session_dir / "news" / f"news_{safe_tickers}.json"
                return [str(file_path)] if file_path.exists() else []
            
            # 为其他函数添加类似逻辑...
            
            return []
        except Exception as e:
            logger.warning(f"获取保存文件路径失败: {e}")
            return []
    
    def _process_result(self, result, function_name: str):
        """处理返回结果，确保可序列化"""
        if result is None:
            return {"message": "未获取到数据"}
        
        # 特殊处理 fetch_digital_currency_daily 的返回结构
        if function_name == "fetch_digital_currency_daily":
            if isinstance(result, dict) and "market" in result and "usd" in result:
                processed_result = {}
                
                # 处理 market DataFrame
                if hasattr(result["market"], 'to_dict'):
                    market_df = result["market"]
                    processed_result["market"] = self._process_dataframe(market_df)
                
                # 处理 usd DataFrame
                if hasattr(result["usd"], 'to_dict'):
                    usd_df = result["usd"]
                    processed_result["usd"] = self._process_dataframe(usd_df)
                
                return processed_result
        
        # 处理 DataFrame
        if hasattr(result, 'to_dict'):
            return self._process_dataframe(result)
        
        # 处理字典或列表
        if isinstance(result, (dict, list)):
            if isinstance(result, list) and len(result) > 100:
                return {
                    "total_records": len(result),
                    "sample_data": result[:10],
                    "message": f"数据过多，显示前10条，共{len(result)}条"
                }
            return result
        
        return {"result": str(result)}
    
    def _process_dataframe(self, df):
        """处理DataFrame转换为可序列化格式"""
        try:
            if hasattr(df, 'index'):
                df_processed = df.reset_index()
                # 重命名索引列
                if 'index' in df_processed.columns:
                    df_processed = df_processed.rename(columns={'index': 'date'})
                
                if len(df_processed) > 100:
                    return {
                        "total_records": len(df_processed),
                        "date_range": {
                            "start": str(df_processed['date'].min()) if 'date' in df_processed.columns else None,
                            "end": str(df_processed['date'].max()) if 'date' in df_processed.columns else None
                        },
                        "sample_data": df_processed.head(10).to_dict(orient='records'),
                        "message": f"数据过多，显示前10条，共{len(df_processed)}条"
                    }
                else:
                    return df_processed.to_dict(orient='records')
            else:
                return df.to_dict(orient='records')
        except Exception as e:
            logger.warning(f"DataFrame转换失败: {e}")
            return {"raw_result": str(df)}
    
    def _generate_example_code(self, function_name: str, params: dict, session_dir: Path) -> str:
        """生成Python代码示例，指导如何从会话目录访问数据"""
        
        # 确定数据路径
        if function_name == "fetch_weekly_adjusted":
            symbol = params.get("symbol", "UNKNOWN")
            data_path = f"/srv/sandbox_workspaces/{session_dir.name}/stock/{symbol}.parquet"
            example_code = f'''# 读取股票数据
import pandas as pd
from pathlib import Path

# 会话数据路径
data_path = Path('{data_path}')
if data_path.exists():
    df = pd.read_parquet(data_path)
    print(f"{{'{symbol}'}} 股票数据:")
    print(f"数据形状: {{df.shape}}")
    print(f"日期范围: {{df.index.min()}} 到 {{df.index.max()}}")
    print("\\n前5行数据:")
    print(df.head())
    
    # 可视化
    import matplotlib.pyplot as plt
    plt.figure(figsize=(12, 6))
    plt.plot(df.index, df['close'], label='收盘价', linewidth=2)
    plt.title(f'{symbol} 股价走势')
    plt.xlabel('日期')
    plt.ylabel('价格 (USD)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.show()'''
        
        elif function_name == "fetch_forex_daily":
            from_sym = params.get("from_symbol", "USD")
            to_sym = params.get("to_symbol", "JPY")
            data_path = f"/srv/sandbox_workspaces/{session_dir.name}/forex/{from_sym}_{to_sym}.parquet"
            example_code = f'''# 读取外汇数据
import pandas as pd
from pathlib import Path

# 会话数据路径
data_path = Path('{data_path}')
if data_path.exists():
    df = pd.read_parquet(data_path)
    print(f"{{'{from_sym}/{to_sym}'}} 外汇数据:")
    print(f"数据形状: {{df.shape}}")
    print("\\n最近10天数据:")
    print(df.tail(10))
    
    # 计算收益率
    df['returns'] = df['close'].pct_change()
    print("\\n收益率统计:")
    print(df['returns'].describe())'''
        
        else:
            # 通用示例
            example_code = f'''# 访问会话目录中的所有数据
import pandas as pd
import json
from pathlib import Path

# 会话目录路径
session_path = Path('/srv/sandbox_workspaces/{session_dir.name}')
print("会话目录:", session_path)

# 列出所有可用文件
print("\\n可用文件:")
for file_path in session_path.rglob("*"):
    if file_path.is_file():
        rel_path = file_path.relative_to(session_path)
        size_kb = file_path.stat().st_size / 1024
        print(f"  - {{rel_path}} ({{size_kb:.1f}} KB)")'''
        
        return example_code

# ==================== 辅助函数 ====================

def get_available_functions() -> List[str]:
    """获取所有可用的AlphaVantage函数"""
    return [func.value for func in AlphaVantageFunction]

def get_function_description(function_name: str) -> str:
    """获取函数描述"""
    descriptions = {
        "fetch_weekly_adjusted": "获取股票周调整数据（开盘价、最高价、最低价、收盘价、调整后收盘价、成交量、股息）",
        "fetch_global_quote": "获取实时行情数据（当前价格、涨跌幅、成交量等）",
        "fetch_historical_options": "获取历史期权数据（需要付费API套餐）",
        "fetch_earnings_transcript": "获取财报电话会议记录",
        "fetch_insider_transactions": "获取公司内部人交易数据",
        "fetch_etf_profile": "获取ETF详细信息和持仓数据",
        "fetch_forex_daily": "获取外汇每日数据",
        "fetch_digital_currency_daily": "获取数字货币每日数据",
        "fetch_wti": "获取WTI原油价格数据",
        "fetch_brent": "获取Brent原油价格数据",
        "fetch_copper": "获取全球铜价数据",
        "fetch_treasury_yield": "获取美国国债收益率数据",
        "fetch_news_sentiment": "获取市场新闻和情绪数据"
    }
    return descriptions.get(function_name, "未知功能")