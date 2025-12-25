"""AlphaVantage金融数据获取工具 - 最终版（仅从.env读取API Key）"""
import os
import json
import logging
import shutil
import pandas as pd
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime, timedelta
from pathlib import Path

# 导入AlphaVantage数据获取器
from src.core.data_fetcher_alphavantage import AlphaVantageFetcher

logger = logging.getLogger(__name__)

# ==================== 配置区 ====================
# 🎯 核心：与代码解释器共享的工作区根目录
SESSION_WORKSPACE_ROOT = Path("/srv/sandbox_workspaces")
SESSION_TIMEOUT_HOURS = 24  # 与代码解释器保持一致的会话超时时间

# ==================== Pydantic模型定义 ====================

class AlphaVantageFunction(str, Enum):
    """支持的AlphaVantage功能列表"""
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
        "从AlphaVantage获取金融数据的工具。支持股票、外汇、加密货币、大宗商品、"
        "国债收益率、新闻情绪等多种数据类型。数据会保存到会话工作区，以便后续使用代码解释器进行分析和可视化。"
    )
    input_schema = AlphaVantageInput
    
    def __init__(self):
        # 确保工作区根目录存在
        SESSION_WORKSPACE_ROOT.mkdir(exist_ok=True, parents=True)
        logger.info(f"AlphaVantage工具初始化，工作区目录: {SESSION_WORKSPACE_ROOT}")
        
        # 验证API Key是否已配置
        self._validate_api_key()
    
    def _validate_api_key(self):
        """验证API Key是否配置"""
        # 检查data_fetcher_alphavantage.py中的API Key获取逻辑
        try:
            from src.core.data_fetcher_alphavantage import AlphaVantageFetcher
            api_key = AlphaVantageFetcher.get_api_key()
            if api_key and api_key != "U5KM36DHDXR95Q7Q":  # 不是默认key
                logger.info("✅ AlphaVantage API Key 已正确配置")
            else:
                logger.warning("⚠️ AlphaVantage API Key 未配置或使用默认值，请检查.env文件")
        except Exception as e:
            logger.error(f"验证API Key时出错: {e}")
    
    def _ensure_session_workspace(self, session_id: str) -> Path:
        """确保会话工作区存在并返回路径"""
        if not session_id:
            # 如果没有session_id，使用临时目录
            temp_dir = SESSION_WORKSPACE_ROOT / "temp" / str(int(datetime.now().timestamp()))
            temp_dir.mkdir(parents=True, exist_ok=True)
            return temp_dir
        
        session_dir = SESSION_WORKSPACE_ROOT / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建数据子目录
        data_subdirs = ["alphavantage", "stock", "forex", "crypto", "commodities", "news"]
        for subdir in data_subdirs:
            (session_dir / subdir).mkdir(exist_ok=True)
        
        return session_dir
    
    def _cleanup_old_sessions(self):
        """清理过期的会话工作区（与代码解释器保持一致）"""
        try:
            current_time = datetime.now()
            cleaned_count = 0
            
            for session_dir in SESSION_WORKSPACE_ROOT.iterdir():
                if session_dir.is_dir():
                    # 跳过temp目录
                    if session_dir.name == "temp":
                        # 清理temp目录（创建超过1小时的）
                        temp_creation_time = datetime.fromtimestamp(session_dir.stat().st_ctime)
                        if current_time - temp_creation_time > timedelta(hours=1):
                            try:
                                shutil.rmtree(session_dir)
                                logger.info(f"清理临时目录: {session_dir.name}")
                            except Exception as e:
                                logger.error(f"清理临时目录失败 {session_dir.name}: {e}")
                        continue
                    
                    # 检查目录修改时间
                    stat = session_dir.stat()
                    modify_time = datetime.fromtimestamp(stat.st_mtime)
                    if current_time - modify_time > timedelta(hours=SESSION_TIMEOUT_HOURS):
                        try:
                            shutil.rmtree(session_dir)
                            logger.info(f"清理过期会话: {session_dir.name}")
                            cleaned_count += 1
                        except Exception as e:
                            logger.error(f"清理会话失败 {session_dir.name}: {e}")
            
            if cleaned_count > 0:
                logger.info(f"会话清理完成: 移除了 {cleaned_count} 个过期会话")
                
        except Exception as e:
            logger.error(f"会话清理过程失败: {e}")
    
    async def execute(self, parameters: AlphaVantageInput, session_id: str = None) -> dict:
        """
        执行AlphaVantage数据获取
        """
        try:
            function_name = parameters.function.value
            function_params = parameters.parameters
            
            # 确保会话工作区存在
            session_dir = self._ensure_session_workspace(session_id)
            logger.info(f"使用会话目录: {session_dir}")
            
            # 根据function_name调用不同的方法
            result = None
            metadata = {
                "function": function_name,
                "parameters": function_params,
                "session_id": session_id,
                "timestamp": datetime.now().isoformat(),
                "saved_files": [],
                "data_type": self._get_data_type(function_name)
            }
            
            # 🎯 核心：调用AlphaVantage数据获取器
            try:
                # 动态调用对应的方法
                method = getattr(AlphaVantageFetcher, function_name)
                
                # 特殊处理不同函数的数据保存
                if function_name == "fetch_weekly_adjusted":
                    symbol = function_params.get("symbol", "")
                    result = method(symbol)
                    # 文件已由data_fetcher_alphavantage.py保存到data/raw/us_stock/
                    # 我们需要复制到会话目录
                    source_file = Path("data/raw/us_stock") / f"{symbol}.parquet"
                    if source_file.exists():
                        dest_file = session_dir / "alphavantage" / f"{symbol}_weekly.parquet"
                        dest_file.parent.mkdir(exist_ok=True)
                        shutil.copy2(source_file, dest_file)
                        metadata["saved_files"].append(str(dest_file))
                
                elif function_name == "fetch_global_quote":
                    symbol = function_params.get("symbol", "")
                    result = method(symbol)
                    # 保存到JSON文件
                    if result:
                        json_file = session_dir / "alphavantage" / f"{symbol}_quote.json"
                        json_file.parent.mkdir(exist_ok=True)
                        with open(json_file, 'w', encoding='utf-8') as f:
                            json.dump(result, f, ensure_ascii=False, indent=2)
                        metadata["saved_files"].append(str(json_file))
                
                elif function_name == "fetch_forex_daily":
                    from_symbol = function_params.get("from_symbol", "USD")
                    to_symbol = function_params.get("to_symbol", "JPY")
                    outputsize = function_params.get("outputsize", "full")
                    result = method(from_symbol, to_symbol, outputsize)
                    # 复制Parquet文件
                    source_file = Path("data/raw/forex") / f"{from_symbol}_{to_symbol}_daily.parquet"
                    if source_file.exists():
                        dest_file = session_dir / "forex" / f"{from_symbol}_{to_symbol}.parquet"
                        dest_file.parent.mkdir(exist_ok=True)
                        shutil.copy2(source_file, dest_file)
                        metadata["saved_files"].append(str(dest_file))
                
                elif function_name == "fetch_digital_currency_daily":
                    symbol = function_params.get("symbol", "BTC")
                    market = function_params.get("market", "USD")
                    result = method(symbol, market)
                    # 处理数字货币数据
                    if result and isinstance(result, dict):
                        for key, df in result.items():
                            if hasattr(df, 'to_parquet'):
                                parquet_file = session_dir / "crypto" / f"{symbol}_{market}_{key}.parquet"
                                parquet_file.parent.mkdir(exist_ok=True)
                                df.to_parquet(parquet_file)
                                metadata["saved_files"].append(str(parquet_file))
                
                elif function_name == "fetch_news_sentiment":
                    tickers = function_params.get("tickers")
                    topics = function_params.get("topics")
                    limit = function_params.get("limit", 50)
                    result = method(
                        tickers=tickers,
                        topics=topics,
                        limit=limit,
                        sort=function_params.get("sort", "LATEST"),
                        time_from=function_params.get("time_from"),
                        time_to=function_params.get("time_to")
                    )
                    # 保存到JSON文件
                    if result:
                        safe_name = (tickers or "news").replace(',', '_')[:50]
                        json_file = session_dir / "news" / f"{safe_name}_{int(datetime.now().timestamp())}.json"
                        json_file.parent.mkdir(exist_ok=True)
                        with open(json_file, 'w', encoding='utf-8') as f:
                            json.dump(result, f, ensure_ascii=False, indent=2)
                        metadata["saved_files"].append(str(json_file))
                
                # 处理其他通用函数
                elif function_name in ["fetch_wti", "fetch_brent", "fetch_copper"]:
                    interval = function_params.get("interval", "monthly")
                    result = method(interval)
                    # 保存到Parquet文件
                    if hasattr(result, 'to_parquet'):
                        commodity_name = function_name.replace("fetch_", "").upper()
                        parquet_file = session_dir / "commodities" / f"{commodity_name}_{interval}.parquet"
                        parquet_file.parent.mkdir(exist_ok=True)
                        result.to_parquet(parquet_file)
                        metadata["saved_files"].append(str(parquet_file))
                
                elif function_name == "fetch_treasury_yield":
                    interval = function_params.get("interval", "monthly")
                    maturity = function_params.get("maturity", "10year")
                    result = method(interval, maturity)
                    # 保存到Parquet文件
                    if hasattr(result, 'to_parquet'):
                        parquet_file = session_dir / "alphavantage" / f"treasury_{maturity}_{interval}.parquet"
                        parquet_file.parent.mkdir(exist_ok=True)
                        result.to_parquet(parquet_file)
                        metadata["saved_files"].append(str(parquet_file))
                
                # 其他函数使用通用处理
                else:
                    result = method(**function_params)
                    
                    # 尝试查找并复制相关文件
                    data_raw_dir = Path("data/raw")
                    if data_raw_dir.exists():
                        for root, dirs, files in os.walk(data_raw_dir):
                            for file in files:
                                if "parquet" in file or "json" in file:
                                    # 简单判断是否是本次生成的文件（通过时间戳）
                                    file_path = Path(root) / file
                                    try:
                                        stat = file_path.stat()
                                        file_time = datetime.fromtimestamp(stat.st_mtime)
                                        if (datetime.now() - file_time).total_seconds() < 60:  # 1分钟内创建的
                                            rel_path = file_path.relative_to(data_raw_dir)
                                            dest_file = session_dir / "alphavantage" / rel_path
                                            dest_file.parent.mkdir(parents=True, exist_ok=True)
                                            shutil.copy2(file_path, dest_file)
                                            metadata["saved_files"].append(str(dest_file))
                                    except Exception:
                                        continue
                
            except AttributeError:
                return {
                    "success": False,
                    "error": f"不支持的函数: {function_name}",
                    "available_functions": [name for name in dir(AlphaVantageFetcher) 
                                          if name.startswith("fetch_")]
                }
            except Exception as e:
                logger.error(f"AlphaVantage API调用失败: {e}", exc_info=True)
                return {
                    "success": False,
                    "error": f"数据获取失败: {str(e)}",
                    "function": function_name
                }
            
            # 处理返回结果
            processed_result = self._process_result(result, function_name)
            
            # 构建成功响应
            response = {
                "success": True,
                "data": processed_result,
                "metadata": metadata
            }
            
            # 添加数据目录信息，便于前端和代码解释器使用
            if session_id:
                response["metadata"]["session_dir"] = str(session_dir)
                response["metadata"]["data_dir"] = str(session_dir / "alphavantage")
                
                # 提供Python代码示例，展示如何在代码解释器中读取这些数据
                example_code = self._generate_example_code(function_name, function_params, session_dir)
                response["metadata"]["example_code"] = example_code
            
            # 定期清理旧会话
            self._cleanup_old_sessions()
            
            logger.info(f"AlphaVantage工具执行成功: {function_name}, 保存文件数: {len(metadata['saved_files'])}")
            return response
            
        except Exception as e:
            logger.error(f"AlphaVantage工具执行失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"工具执行失败: {str(e)}",
                "function": parameters.function.value if hasattr(parameters, 'function') else "unknown"
            }
    
    def _process_result(self, result, function_name: str):
        """处理不同类型的返回结果"""
        if result is None:
            return {"message": "未获取到数据"}
        
        # 对于DataFrame，转换为列表字典格式
        if hasattr(result, 'to_dict'):
            try:
                if hasattr(result, 'index'):
                    # 如果是时间序列数据
                    df = result.reset_index()
                    if 'index' in df.columns:
                        df = df.rename(columns={'index': 'date'})
                    
                    # 限制返回数据量，避免响应过大
                    if len(df) > 100:
                        summary = {
                            "total_records": len(df),
                            "date_range": {
                                "start": str(df['date'].min()) if 'date' in df.columns else None,
                                "end": str(df['date'].max()) if 'date' in df.columns else None
                            },
                            "sample_data": df.head(10).to_dict(orient='records'),
                            "message": f"数据过多，只显示前10条记录，共{len(df)}条"
                        }
                        return summary
                    else:
                        return df.to_dict(orient='records')
                else:
                    return result.to_dict(orient='records')
            except Exception as e:
                logger.warning(f"DataFrame转换失败: {e}")
                return {"raw_result": str(result), "error": "数据转换失败"}
        
        # 对于字典或列表，直接返回
        if isinstance(result, (dict, list)):
            # 如果数据量过大，也进行限制
            if isinstance(result, list) and len(result) > 100:
                return {
                    "total_records": len(result),
                    "sample_data": result[:10],
                    "message": f"数据过多，只显示前10条记录，共{len(result)}条"
                }
            return result
        
        # 其他类型转换为字符串
        return {"result": str(result)}
    
    def _get_data_type(self, function_name: str) -> str:
        """获取数据类型标签"""
        type_map = {
            "fetch_weekly_adjusted": "stock_weekly_data",
            "fetch_global_quote": "stock_realtime_quote",
            "fetch_historical_options": "options_data",
            "fetch_earnings_transcript": "earnings_transcript",
            "fetch_insider_transactions": "insider_transactions",
            "fetch_etf_profile": "etf_profile",
            "fetch_forex_daily": "forex_daily",
            "fetch_digital_currency_daily": "crypto_daily",
            "fetch_wti": "commodity_wti",
            "fetch_brent": "commodity_brent",
            "fetch_copper": "commodity_copper",
            "fetch_treasury_yield": "treasury_yield",
            "fetch_news_sentiment": "news_sentiment"
        }
        return type_map.get(function_name, "unknown")
    
    def _generate_example_code(self, function_name: str, params: dict, session_dir: Path) -> str:
        """生成Python代码示例，展示如何在代码解释器中读取数据"""
        symbol = params.get("symbol", "")
        
        if function_name == "fetch_weekly_adjusted":
            return f'''# 读取股票数据并进行简单分析
import pandas as pd
import matplotlib.pyplot as plt

# 读取数据
df = pd.read_parquet('{session_dir}/alphavantage/{symbol}_weekly.parquet')
print(f"数据形状: {{df.shape}}")
print("前5行数据:")
print(df.head())

# 简单的可视化
plt.figure(figsize=(12, 6))
plt.plot(df['date'], df['close'], label='收盘价', color='blue')
plt.title('{symbol} 周收盘价走势')
plt.xlabel('日期')
plt.ylabel('价格 (USD)')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

# 基本统计
print("\\n基本统计信息:")
print(df[['open', 'high', 'low', 'close', 'volume']].describe())
'''
        
        elif function_name == "fetch_global_quote":
            return f'''# 读取实时行情数据
import json

with open('{session_dir}/alphavantage/{symbol}_quote.json', 'r') as f:
    quote_data = json.load(f)

print("实时行情数据:")
print("-" * 40)
for key, value in quote_data.items():
    print(f"{{key:20s}}: {{value}}")
print("-" * 40)

# 计算涨跌幅
if quote_data.get('previous_close') and quote_data.get('price'):
    prev_close = float(quote_data['previous_close'])
    current_price = float(quote_data['price'])
    change_pct = ((current_price - prev_close) / prev_close) * 100
    print(f"\\n涨跌幅: {{change_pct:.2f}}%")
'''
        
        elif function_name == "fetch_forex_daily":
            from_sym = params.get("from_symbol", "USD")
            to_sym = params.get("to_symbol", "JPY")
            return f'''# 读取外汇数据并分析
import pandas as pd
import matplotlib.pyplot as plt

# 读取数据
df = pd.read_parquet('{session_dir}/forex/{from_sym}_{to_sym}.parquet')
df.index = pd.to_datetime(df.index)
df = df.sort_index()

print(f"外汇数据 {{from_sym}}/{{to_sym}} 形状: {{df.shape}}")
print("最近5天数据:")
print(df.tail())

# 绘制汇率走势
plt.figure(figsize=(14, 7))
plt.plot(df.index, df['close'], label=f'{{from_sym}}/{{to_sym}}', color='green')
plt.title('汇率走势图')
plt.xlabel('日期')
plt.ylabel('汇率')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

# 计算移动平均
df['MA_20'] = df['close'].rolling(window=20).mean()
df['MA_50'] = df['close'].rolling(window=50).mean()

plt.figure(figsize=(14, 7))
plt.plot(df.index, df['close'], label='收盘价', alpha=0.5)
plt.plot(df.index, df['MA_20'], label='20日移动平均', linewidth=2)
plt.plot(df.index, df['MA_50'], label='50日移动平均', linewidth=2)
plt.title('汇率移动平均分析')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()
'''
        
        elif function_name == "fetch_news_sentiment":
            tickers = params.get("tickers", "general")
            return f'''# 读取新闻情绪数据
import json
import pandas as pd

with open('{session_dir}/news/{tickers}_*.json', 'r') as f:  # * 替换为实际时间戳
    news_data = json.load(f)

print(f"新闻数量: {{news_data.get('items', 0)}}")
print("\\n最新新闻标题:")
for i, item in enumerate(news_data.get('feed', [])[:5]):
    print(f"{{i+1}}. {{item.get('title', 'No title')}}")
    print(f"   情绪: {{item.get('overall_sentiment_label', 'N/A')}}")
    print()

# 情绪分析
if news_data.get('feed'):
    sentiments = [item.get('overall_sentiment_label', 'Neutral') for item in news_data['feed']]
    sentiment_counts = pd.Series(sentiments).value_counts()
    print("情绪分布:")
    print(sentiment_counts)
'''
        
        return f'''# 数据已保存到会话目录
# 您可以使用以下代码读取数据：
import pandas as pd
import json
from pathlib import Path

# 列出会话目录中的所有文件
session_path = Path('{session_dir}')
print("可用文件:")
for file_path in session_path.rglob('*'):
    if file_path.is_file():
        print(f"  - {{file_path.relative_to(session_path)}}")

# 根据文件类型读取数据
# 对于Parquet文件: pd.read_parquet('文件路径')
# 对于JSON文件: json.load(open('文件路径', 'r'))
'''

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