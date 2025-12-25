"""AlphaVantage金融数据获取工具 - 简化版"""
import os
import logging
import json
import shutil
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
SESSION_WORKSPACE_ROOT = Path("/srv/sandbox_workspaces")  # 改为绝对路径
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
        "数字货币、大宗商品、国债收益率、新闻情绪等13种数据类型。"
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
        
        # 创建子目录
        for subdir in ["raw_data", "alphavantage", "stock", "forex", "crypto", 
                      "commodities", "treasury", "news", "etf", "insider", 
                      "transcripts", "options", "digital_currency"]:
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
                "data_type": function_name
            }
            
            # 调用对应的方法
            try:
                method = getattr(AlphaVantageFetcher, function_name)
                result = method(**function_params)
                
                # 将原始数据目录复制到会话工作区
                raw_data_source = Path("data/raw")
                raw_data_dest = session_dir / "raw_data"
                
                if raw_data_source.exists():
                    # 先清理目标目录
                    if raw_data_dest.exists():
                        shutil.rmtree(raw_data_dest)
                    
                    # 复制整个raw目录
                    shutil.copytree(raw_data_source, raw_data_dest)
                    logger.info(f"原始数据已复制到: {raw_data_dest}")
                    
                    # 记录复制的文件
                    for root, dirs, files in os.walk(raw_data_dest):
                        for file in files:
                            file_path = Path(root) / file
                            metadata["saved_files"].append(str(file_path))
                
                # 处理返回结果
                processed_result = self._process_result(result, function_name)
                
                # 构建响应
                response = {
                    "success": True,
                    "data": processed_result,
                    "metadata": metadata
                }
                
                # 添加目录信息
                if session_id:
                    response["metadata"]["session_dir"] = str(session_dir)
                    response["metadata"]["raw_data_dir"] = str(raw_data_dest)
                    
                    # 生成示例代码
                    example_code = self._generate_example_code(function_name, function_params, session_dir)
                    response["metadata"]["example_code"] = example_code
                
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
    
    def _process_result(self, result, function_name: str):
        """处理返回结果"""
        if result is None:
            return {"message": "未获取到数据"}
        
        # 特殊处理fetch_digital_currency_daily的返回结构
        if function_name == "fetch_digital_currency_daily":
            if isinstance(result, dict) and "market" in result and "usd" in result:
                processed_result = {}
                
                # 处理market DataFrame
                if hasattr(result["market"], 'to_dict'):
                    market_df = result["market"]
                    if hasattr(market_df, 'index'):
                        market_df = market_df.reset_index()
                        if 'index' in market_df.columns:
                            market_df = market_df.rename(columns={'index': 'date'})
                    
                    if len(market_df) > 100:
                        processed_result["market"] = {
                            "total_records": len(market_df),
                            "date_range": {
                                "start": str(market_df['date'].min()) if 'date' in market_df.columns else None,
                                "end": str(market_df['date'].max()) if 'date' in market_df.columns else None
                            },
                            "sample_data": market_df.head(10).to_dict(orient='records'),
                            "message": f"市场数据过多，显示前10条，共{len(market_df)}条"
                        }
                    else:
                        processed_result["market"] = market_df.to_dict(orient='records')
                
                # 处理usd DataFrame
                if hasattr(result["usd"], 'to_dict'):
                    usd_df = result["usd"]
                    if hasattr(usd_df, 'index'):
                        usd_df = usd_df.reset_index()
                        if 'index' in usd_df.columns:
                            usd_df = usd_df.rename(columns={'index': 'date'})
                    
                    if len(usd_df) > 100:
                        processed_result["usd"] = {
                            "total_records": len(usd_df),
                            "date_range": {
                                "start": str(usd_df['date'].min()) if 'date' in usd_df.columns else None,
                                "end": str(usd_df['date'].max()) if 'date' in usd_df.columns else None
                            },
                            "sample_data": usd_df.head(10).to_dict(orient='records'),
                            "message": f"美元计价数据过多，显示前10条，共{len(usd_df)}条"
                        }
                    else:
                        processed_result["usd"] = usd_df.to_dict(orient='records')
                
                return processed_result
        
        # 原有的处理逻辑
        # DataFrame转换为列表
        if hasattr(result, 'to_dict'):
            try:
                if hasattr(result, 'index'):
                    df = result.reset_index()
                    # 修复列重复的警告
                    columns_to_rename = {}
                    if 'index' in df.columns:
                        columns_to_rename['index'] = 'date'
                    # 如果有重复的'date'列，重命名索引列
                    elif 'date' in df.columns and df.index.name == 'date':
                        df = df.reset_index(drop=True)
                    
                    if columns_to_rename:
                        df = df.rename(columns=columns_to_rename)
                    
                    if len(df) > 100:
                        return {
                            "total_records": len(df),
                            "date_range": {
                                "start": str(df['date'].min()) if 'date' in df.columns else None,
                                "end": str(df['date'].max()) if 'date' in df.columns else None
                            },
                            "sample_data": df.head(10).to_dict(orient='records'),
                            "message": f"数据过多，显示前10条，共{len(df)}条"
                        }
                    else:
                        return df.to_dict(orient='records')
                else:
                    return result.to_dict(orient='records')
            except Exception as e:
                logger.warning(f"DataFrame转换失败: {e}")
                return {"raw_result": str(result)}
        
        # 字典或列表
        if isinstance(result, (dict, list)):
            if isinstance(result, list) and len(result) > 100:
                return {
                    "total_records": len(result),
                    "sample_data": result[:10],
                    "message": f"数据过多，显示前10条，共{len(result)}条"
                }
            return result
        
        return {"result": str(result)}
    
    def _generate_example_code(self, function_name: str, params: dict, session_dir: Path) -> str:
        """生成Python代码示例"""
        base_code = f'''# AlphaVantage数据分析示例
import pandas as pd
import json
from pathlib import Path

# 会话目录
session_path = Path('{session_dir}')
raw_data_path = session_path / 'raw_data'

print("会话目录:", session_path)
print("原始数据目录:", raw_data_path)

# 列出所有可用文件
print("\\n可用文件:")
for file_path in raw_data_path.rglob("*"):
    if file_path.is_file():
        rel_path = file_path.relative_to(raw_data_path)
        size_kb = file_path.stat().st_size / 1024
        print(f"  - {{rel_path}} ({{size_kb:.1f}} KB)")
'''
        
        # 根据不同功能添加特定代码
        if function_name == "fetch_weekly_adjusted":
            symbol = params.get("symbol", "UNKNOWN")
            base_code += f'''
# 读取股票数据
stock_file = raw_data_path / 'us_stock' / '{symbol}.parquet'
if stock_file.exists():
    df = pd.read_parquet(stock_file)
    print(f"\\n{{'{symbol}'}} 股票数据:")
    print(f"数据形状: {{df.shape}}")
    print(f"日期范围: {{df.index.min()}} 到 {{df.index.max()}}")
    print("\\n前5行数据:")
    print(df.head())
'''
        
        elif function_name == "fetch_forex_daily":
            from_sym = params.get("from_symbol", "USD")
            to_sym = params.get("to_symbol", "JPY")
            base_code += f'''
# 读取外汇数据
forex_file = raw_data_path / 'forex' / '{from_sym}_{to_sym}_daily.parquet'
if forex_file.exists():
    df = pd.read_parquet(forex_file)
    print(f"\\n{{'{from_sym}/{to_sym}'}} 外汇数据:")
    print(f"数据形状: {{df.shape}}")
    print("\\n最近5天数据:")
    print(df.tail())
'''
        
        elif function_name == "fetch_news_sentiment":
            tickers = params.get("tickers", "general")
            base_code += f'''
# 读取新闻数据
import json
news_files = list(raw_data_path.rglob("*news*.json"))
if news_files:
    latest_news = max(news_files, key=lambda x: x.stat().st_mtime)
    with open(latest_news, 'r', encoding='utf-8') as f:
        news_data = json.load(f)
    
    print(f"\\n新闻数据:")
    if 'feed' in news_data:
        print(f"新闻数量: {{len(news_data['feed'])}}")
        for i, item in enumerate(news_data['feed'][:3]):
            print(f"{{i+1}}. {{item.get('title', 'No title')[:80]}}...")
            print(f"   情绪: {{item.get('overall_sentiment_label', 'N/A')}}")
'''
        
        return base_code

# ==================== 辅助函数 ====================

def get_available_functions() -> List[str]:
    """获取所有可用的AlphaVantage函数"""
    return [func.value for func in AlphaVantageFunction]

def get_function_description(function_name: str) -> str:
    """获取函数描述"""
    descriptions = {
        "fetch_weekly_adjusted": "获取股票周调整数据（开盘价、最高价、最低价、收盘价、调整后收盘价、成交量、股息）",
        "fetch_global_quote": "获取实时行情数据（当前价格、涨跌幅、成交量等）",
        "fetch_historical_options": "获取历史期权数据",
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