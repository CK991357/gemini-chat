"""AlphaVantage金融数据获取工具 - 最终优化版本"""
import os
import logging
import json
import asyncio
import pandas as pd
import requests
from pathlib import Path
from typing import Dict, Any, List, Optional, Union, Literal
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from tenacity import retry, stop_after_attempt, wait_exponential

# 配置日志
logger = logging.getLogger(__name__)

# ==================== 配置区 ====================
SESSION_WORKSPACE_ROOT = Path("/srv/sandbox_workspaces")
SESSION_TIMEOUT_HOURS = 24

# ==================== 枚举定义 ====================
class AlphaVantageMode(str, Enum):
    """AlphaVantage功能模式 - 20个完整功能"""
    WEEKLY_ADJUSTED = "weekly_adjusted"
    GLOBAL_QUOTE = "global_quote"
    # 删除付费期权功能: HISTORICAL_OPTIONS = "historical_options"
    EARNINGS_TRANSCRIPT = "earnings_transcript"
    INSIDER_TRANSACTIONS = "insider_transactions"
    ETF_PROFILE = "etf_profile"
    FOREX_DAILY = "forex_daily"
    DIGITAL_CURRENCY_DAILY = "digital_currency_daily"
    WTI = "wti"
    BRENT = "brent"
    COPPER = "copper"
    TREASURY_YIELD = "treasury_yield"
    NEWS_SENTIMENT = "news_sentiment"
    # 新增基本面数据功能
    OVERVIEW = "overview"
    INCOME_STATEMENT = "income_statement"
    BALANCE_SHEET = "balance_sheet"
    CASH_FLOW = "cash_flow"
    EARNINGS = "earnings"
    EARNINGS_ESTIMATES = "earnings_estimates"
    DIVIDENDS = "dividends"
    SHARES_OUTSTANDING = "shares_outstanding"

# ==================== 参数模型 ====================
class WeeklyAdjustedParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class GlobalQuoteParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class EarningsTranscriptParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL")
    quarter: str = Field(description="季度，格式：YYYY-Q1/Q2/Q3/Q4")

class InsiderTransactionsParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL")

class ETFProfileParams(BaseModel):
    symbol: str = Field(description="ETF代码，如：SPY, QQQ")

class ForexDailyParams(BaseModel):
    from_symbol: str = Field(default="USD", description="源货币代码，如：USD")
    to_symbol: str = Field(default="JPY", description="目标货币代码，如：JPY")
    outputsize: Literal["compact", "full"] = Field(default="full", description="数据大小")

class DigitalCurrencyDailyParams(BaseModel):
    symbol: str = Field(description="数字货币代码，如：BTC")
    market: str = Field(description="交易市场，如：USD, CNY")

class CommodityParams(BaseModel):
    interval: Literal["daily", "weekly", "monthly"] = Field(default="monthly", description="数据间隔")

class TreasuryYieldParams(BaseModel):
    interval: Literal["daily", "weekly", "monthly"] = Field(default="monthly", description="数据间隔")
    maturity: str = Field(default="10year", description="国债期限，如：3month, 2year, 10year")

class NewsSentimentParams(BaseModel):
    tickers: Optional[str] = Field(default=None, description="股票代码，多个用逗号分隔")
    topics: Optional[str] = Field(default=None, description="主题，多个用逗号分隔")
    time_from: Optional[str] = Field(default=None, description="开始时间，格式：YYYYMMDDTHHMM")
    time_to: Optional[str] = Field(default=None, description="结束时间，格式：YYYYMMDDTHHMM")
    sort: Literal["LATEST", "EARLIEST", "RELEVANCE"] = Field(default="LATEST", description="排序方式")
    limit: int = Field(default=50, ge=1, le=1000, description="返回数量限制")

# 新增基本面数据参数模型
class OverviewParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class IncomeStatementParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class BalanceSheetParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class CashFlowParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class EarningsParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class EarningsEstimatesParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class DividendsParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

class SharesOutstandingParams(BaseModel):
    symbol: str = Field(description="股票代码，如：AAPL, MSFT")

# 工具输入模型
class AlphaVantageInput(BaseModel):
    """AlphaVantage工具输入模型"""
    mode: AlphaVantageMode = Field(description="要执行的AlphaVantage功能模式")
    parameters: Dict[str, Any] = Field(description="功能参数")

# ==================== AlphaVantage数据获取器 ====================
class AlphaVantageFetcher:
    """AlphaVantage数据获取器 - 完整版"""
    
    BASE_URL = "https://www.alphavantage.co/query"
    
    @staticmethod
    def get_api_key():
        """从环境变量获取API Key"""
        key = os.getenv("ALPHAVANTAGE_API_KEY")
        if not key:
            logger.warning("⚠️ ALPHAVANTAGE_API_KEY未找到，使用默认key")
            return "U5KM36DHDXR95Q7Q"  # 默认key
        return key
    
    # ============ 股票数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_weekly_adjusted(symbol: str, session_dir: Path = None) -> pd.DataFrame:
        """获取周调整后数据"""
        try:
            params = {
                "function": "TIME_SERIES_WEEKLY_ADJUSTED",
                "symbol": symbol, 
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            time_series = data.get("Weekly Adjusted Time Series", {})
            if not time_series:
                raise ValueError("No weekly data found in response")

            df = pd.DataFrame.from_dict(time_series, orient="index")
            df.index = pd.to_datetime(df.index)
            df = df.sort_index()

            df = df.rename(columns={
                "1. open": "open",
                "2. high": "high",
                "3. low": "low",
                "4. close": "close",
                "5. adjusted close": "adjusted_close",
                "6. volume": "volume",
                "7. dividend amount": "dividend"
            })

            df = df.astype({
                "open": float,
                "high": float,
                "low": float,
                "close": float,
                "adjusted_close": float,
                "volume": int,
                "dividend": float
            })

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"stock_{symbol}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"股票数据已保存至会话目录：{file_path}")
            else:
                # 后备：保存到临时目录
                temp_dir = Path("/tmp/alphavantage_data") / "us_stock"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"stock_{symbol}.parquet"
                df.to_parquet(file_path)
                logger.info(f"股票数据已保存至临时目录：{file_path}")

            return df[["open", "high", "low", "close", "adjusted_close", "volume", "dividend"]]

        except Exception as e:
            logger.error(f"获取AlphaVantage数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_global_quote(symbol: str, session_dir: Path = None) -> Dict[str, Union[str, float, int]]:
        """获取实时行情数据"""
        try:
            params = {
                "function": "GLOBAL_QUOTE",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            quote = data.get("Global Quote", {})
            if not quote:
                raise ValueError("No quote data found in response")

            result = {
                'symbol': quote.get('01. symbol'),
                'open': float(quote.get('02. open', 0)) if quote.get('02. open', '') != '' else 0.0,
                'high': float(quote.get('03. high', 0)) if quote.get('03. high', '') != '' else 0.0,
                'low': float(quote.get('04. low', 0)) if quote.get('04. low', '') != '' else 0.0,
                'price': float(quote.get('05. price', 0)) if quote.get('05. price', '') != '' else 0.0,
                'volume': int(quote.get('06. volume', 0)) if quote.get('06. volume', '') != '' else 0,
                'latest_trading_day': quote.get('07. latest trading day'),
                'previous_close': float(quote.get('08. previous close', 0)) if quote.get('08. previous close', '') != '' else 0.0,
                'change': float(quote.get('09. change', 0)) if quote.get('09. change', '') != '' else 0.0,
                'change_percent': quote.get('10. change percent', '0%')
            }

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"quote_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                logger.info(f"实时行情已保存至会话目录：{file_path}")

            return result

        except Exception as e:
            logger.error(f"获取实时行情失败: {e}")
            raise
    
    # ============ 财报数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_earnings_transcript(symbol: str, quarter: str, session_dir: Path = None) -> Dict:
        """获取财报电话会议记录"""
        try:
            params = {
                "function": "EARNINGS_CALL_TRANSCRIPT",
                "symbol": symbol,
                "quarter": quarter,
                "apikey": AlphaVantageFetcher.get_api_key()
            }
            
            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"transcript_{symbol}_{quarter}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False)
                logger.info(f"财报会议记录已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "transcripts"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"transcript_{symbol}_{quarter}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False)
                logger.info(f"财报会议记录已保存至临时目录：{file_path}")

            return data
            
        except Exception as e:
            logger.error(f"获取财报会议记录失败: {e}")
            raise
    
    # ============ 内部交易数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_insider_transactions(symbol: str, session_dir: Path = None) -> List[Dict]:
        """获取公司内部人交易数据"""
        try:
            params = {
                "function": "INSIDER_TRANSACTIONS",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }
            
            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 转换数据类型
            transactions = []
            for item in data.get("data", []):
                transactions.append({
                    "transaction_date": item.get("transaction_date"),
                    "ticker": item.get("ticker"),
                    "executive": item.get("executive"),
                    "executive_title": item.get("executive_title"),
                    "security_type": item.get("security_type"),
                    "acquisition_or_disposal": item.get("acquisition_or_disposal"),
                    "trade_type": "买入" if item.get("acquisition_or_disposal") == "A" else "卖出",
                    "shares": float(item.get("shares", 0)) if item.get("shares") else 0,
                    "share_price": float(item.get("share_price", 0)) if item.get("share_price") else 0,
                    "total_value": float(item.get("shares", 0)) * float(item.get("share_price", 0)) if item.get("shares") and item.get("share_price") else 0
                })

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"insider_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(transactions, f, ensure_ascii=False)
                logger.info(f"内部人交易数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "insider"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"insider_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(transactions, f, ensure_ascii=False)
                logger.info(f"内部人交易数据已保存至临时目录：{file_path}")

            return transactions
            
        except Exception as e:
            logger.error(f"获取内部人交易数据失败: {e}")
            raise
    
    # ============ ETF数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_etf_profile(symbol: str, session_dir: Path = None) -> Dict:
        """获取ETF详细信息和持仓数据"""
        try:
            params = {
                "function": "ETF_PROFILE",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 标准化数据结构
            profile = {
                "symbol": data.get("symbol", symbol),
                "name": data.get("name"),
                "description": data.get("description"),
                "exchange": data.get("exchange"),
                "net_assets": float(data.get("net_assets", 0)),
                "expense_ratio": float(data.get("expense_ratio", 0)),
                "portfolio_turnover": float(data.get("portfolio_turnover", 0)),
                "dividend_yield": float(data.get("dividend_yield", 0)),
                "inception_date": data.get("inception_date"),
                "leveraged": data.get("leveraged", "").upper() == "YES",
                "sectors": [],
                "holdings": []
            }

            # 处理行业配置数据
            if isinstance(data.get("sectors"), list):
                for sector in data["sectors"]:
                    if isinstance(sector, dict):
                        profile["sectors"].append({
                            "sector": sector.get("sector"),
                            "weight": float(sector.get("weight", 0))
                        })

            # 处理持仓数据
            if isinstance(data.get("holdings"), list):
                for holding in data["holdings"]:
                    if isinstance(holding, dict):
                        profile["holdings"].append({
                            "symbol": holding.get("symbol"),
                            "name": holding.get("name"),
                            "weight": float(holding.get("weight", 0)),
                            "shares": int(holding.get("shares", 0)) 
                        })

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"etf_{symbol}_profile.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(profile, f, ensure_ascii=False, indent=2)
                logger.info(f"ETF数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "etf"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"etf_{symbol}_profile.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(profile, f, ensure_ascii=False, indent=2)
                logger.info(f"ETF数据已保存至临时目录：{file_path}")
            
            return profile
            
        except Exception as e:
            logger.error(f"获取ETF数据失败: {e}")
            raise
    
    # ============ 外汇数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_forex_daily(
        from_symbol: str = "USD",
        to_symbol: str = "JPY",
        outputsize: str = "full",
        session_dir: Path = None
    ) -> pd.DataFrame:
        """获取外汇每日数据"""
        try:
            params = {
                "function": "FX_DAILY",
                "from_symbol": from_symbol,
                "to_symbol": to_symbol,
                "outputsize": outputsize,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            time_series = data.get("Time Series FX (Daily)", {})
            if not time_series:
                raise ValueError(f"未获取到外汇数据，响应: {data}")

            df = pd.DataFrame.from_dict(time_series, orient="index")
            df.index = pd.to_datetime(df.index)
            df = df.sort_index()

            df = df.rename(columns={
                "1. open": "open",
                "2. high": "high", 
                "3. low": "low",
                "4. close": "close"
            })

            df = df.astype({
                "open": float,
                "high": float,
                "low": float,
                "close": float
            })

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"forex_{from_symbol}_{to_symbol}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"外汇数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "forex"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"forex_{from_symbol}_{to_symbol}_daily.parquet"
                df.to_parquet(file_path)
                logger.info(f"外汇数据已保存至临时目录: {file_path}")

            return df

        except Exception as e:
            logger.error(f"获取{from_symbol}/{to_symbol}外汇数据失败: {e}")
            raise
    
    # ============ 数字货币数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_digital_currency_daily(
        symbol: str,
        market: str,
        session_dir: Path = None
    ) -> Dict[str, pd.DataFrame]:
        """获取数字货币每日数据"""
        try:
            params = {
                "function": "DIGITAL_CURRENCY_DAILY",
                "symbol": symbol,
                "market": market,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            time_series = data.get("Time Series (Digital Currency Daily)", {})
            if not time_series:
                raise ValueError(f"未获取到数字货币数据，响应: {data}")

            # 转换为DataFrame并处理数据
            df = pd.DataFrame.from_dict(time_series, orient="index")
            df.index = pd.to_datetime(df.index)
            df = df.sort_index()

            # 处理市场货币数据
            if market == "USD":
                # USD市场使用基本列名
                market_df = df[[
                    "1. open",
                    "2. high",
                    "3. low",
                    "4. close",
                    "5. volume"
                ]].rename(columns={
                    "1. open": "open",
                    "2. high": "high",
                    "3. low": "low",
                    "4. close": "close",
                    "5. volume": "volume"
                })
                usd_df = market_df[["open", "high", "low", "close"]].copy()
            else:
                def get_column(df, prefix, currency):
                    """辅助函数获取指定前缀和大小的列"""
                    for col in df.columns:
                        if f"{prefix}. " in col and f"({currency})" in col and not "(convert)" in col:
                            return col
                    raise ValueError(f"找不到{prefix} {currency}列")

                # 获取市场货币计价数据列
                market_open = get_column(df, "1a", market)
                market_high = get_column(df, "2a", market)
                market_low = get_column(df, "3a", market)
                market_close = get_column(df, "4a", market)
                volume_col = "5. volume"

                market_df = df[[
                    market_open,
                    market_high,
                    market_low,
                    market_close,
                    volume_col
                ]].rename(columns={
                    market_open: "open",
                    market_high: "high", 
                    market_low: "low",
                    market_close: "close",
                    volume_col: "volume"
                })

                # 获取美元计价数据列
                usd_open = get_column(df, "1b", "USD")
                usd_high = get_column(df, "2b", "USD")
                usd_low = get_column(df, "3b", "USD")
                usd_close = get_column(df, "4b", "USD")

                usd_df = df[[
                    usd_open,
                    usd_high,
                    usd_low,
                    usd_close
                ]].rename(columns={
                    usd_open: "open",
                    usd_high: "high",
                    usd_low: "low",
                    usd_close: "close"
                })

            # 转换数据类型
            market_df = market_df.astype({
                "open": float, "high": float, "low": float, 
                "close": float, "volume": float
            })
            usd_df = usd_df.astype({
                "open": float, "high": float, "low": float, "close": float
            })

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                # 直接保存到会话目录
                if market == "USD":
                    file_path = session_dir / f"crypto_{symbol}_USD.parquet"
                    market_df.to_parquet(file_path)
                    logger.info(f"USD市场数据已保存至会话目录: {file_path}")
                else:
                    market_file = session_dir / f"crypto_{symbol}_{market}.parquet"
                    usd_file = session_dir / f"crypto_{symbol}_USD.parquet"
                    market_df.to_parquet(market_file)
                    usd_df.to_parquet(usd_file)
                    logger.info(f"数字货币{symbol}数据已保存至会话目录: {session_dir}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "digital_currency"
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                if market == "USD":
                    file_path = temp_dir / f"crypto_{symbol}_USD.parquet"
                    market_df.to_parquet(file_path)
                    logger.info(f"USD市场数据已保存至临时目录: {file_path}")
                else:
                    market_file = temp_dir / f"crypto_{symbol}_{market}.parquet"
                    usd_file = temp_dir / f"crypto_{symbol}_USD.parquet"
                    market_df.to_parquet(market_file)
                    usd_df.to_parquet(usd_file)
                    logger.info(f"数字货币{symbol}数据已保存至临时目录: {temp_dir}")

            return {
                "market": market_df,
                "usd": usd_df
            }

        except Exception as e:
            logger.error(f"获取{symbol}/{market}数字货币数据失败: {e}")
            raise
    
    # ============ 大宗商品数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_wti(
        interval: str = "monthly",
        session_dir: Path = None
    ) -> pd.DataFrame:
        """获取WTI原油价格数据"""
        try:
            params = {
                "function": "WTI",
                "interval": interval,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if not data.get("data"):
                raise ValueError("No WTI data found in response")

            # 转换为DataFrame
            df = pd.DataFrame(data["data"])
            df["date"] = pd.to_datetime(df["date"])
            df["price"] = pd.to_numeric(df["value"], errors='coerce')
            df = df.dropna(subset=['price'])
            df["price"] = df["price"].astype(float)
            df = df.drop(columns=["value"])
            df = df.set_index("date").sort_index()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"commodity_WTI_{interval}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"WTI原油数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "commodities"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"commodity_WTI_{interval}.parquet"
                df.to_parquet(file_path)
                logger.info(f"WTI原油数据已保存至临时目录: {file_path}")

            return df

        except Exception as e:
            logger.error(f"获取WTI原油数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_brent(
        interval: str = "monthly",
        session_dir: Path = None
    ) -> pd.DataFrame:
        """获取Brent原油价格数据"""
        try:
            params = {
                "function": "BRENT",
                "interval": interval,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if not data.get("data"):
                raise ValueError("No Brent data found in response")

            # 转换为DataFrame并严格处理数据
            df = pd.DataFrame(data["data"])
            df["date"] = pd.to_datetime(df["date"])
            df["price"] = pd.to_numeric(df["value"], errors='coerce')
            invalid_count = df["price"].isna().sum()
            if invalid_count > 0:
                logger.warning(f"过滤掉{invalid_count}条无效原油数据")
                df = df.dropna(subset=['price'])
            
            df["price"] = df["price"].astype(float)
            df = df.drop(columns=["value"])
            df = df.set_index("date").sort_index()
            
            if len(df) == 0:
                raise ValueError("没有有效的原油数据可用")

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"commodity_BRENT_{interval}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"Brent原油数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "commodities"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"commodity_BRENT_{interval}.parquet"
                df.to_parquet(file_path)
                logger.info(f"Brent原油数据已保存至临时目录: {file_path}")

            return df

        except Exception as e:
            logger.error(f"获取Brent原油数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_copper(
        interval: str = "monthly",
        session_dir: Path = None
    ) -> pd.DataFrame:
        """获取全球铜价数据"""
        try:
            params = {
                "function": "COPPER",
                "interval": interval,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if not data.get("data"):
                raise ValueError("No copper price data found in response")

            # 转换为DataFrame并严格处理数据
            df = pd.DataFrame(data["data"])
            df["date"] = pd.to_datetime(df["date"])
            df["price"] = pd.to_numeric(df["value"], errors='coerce')
            invalid_count = df["price"].isna().sum()
            if invalid_count > 0:
                logger.warning(f"过滤掉{invalid_count}条无效铜价数据")
                df = df.dropna(subset=['price'])
            
            df["price"] = df["price"].astype(float)
            df = df.drop(columns=["value"])
            df = df.set_index("date").sort_index()
            
            if len(df) == 0:
                raise ValueError("没有有效的铜价数据可用")

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"commodity_COPPER_{interval}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"铜价数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "commodities"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"commodity_COPPER_{interval}.parquet"
                df.to_parquet(file_path)
                logger.info(f"铜价数据已保存至临时目录: {file_path}")

            return df

        except Exception as e:
            logger.error(f"获取铜价数据失败: {e}")
            raise
    
    # ============ 国债收益率数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10)) 
    def fetch_treasury_yield(
        interval: str = "monthly",
        maturity: str = "10year",
        session_dir: Path = None
    ) -> pd.DataFrame:
        """获取美国国债收益率数据"""
        try:
            params = {
                "function": "TREASURY_YIELD",
                "interval": interval,
                "maturity": maturity,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if not data.get("data"):
                raise ValueError("未获取到国债收益率数据")
                
            # 转换为DataFrame并处理数据
            df = pd.DataFrame(data["data"])
            df["date"] = pd.to_datetime(df["date"])
            df["yield"] = pd.to_numeric(df["value"], errors="coerce")
            df = df.dropna(subset=["yield"])
            
            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"treasury_{maturity}_{interval}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"国债收益率数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "treasury"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"treasury_{maturity}_{interval}.parquet"
                df.to_parquet(file_path)
                logger.info(f"国债收益率数据已保存至临时目录: {file_path}")
            
            return df[["date", "yield"]]
            
        except Exception as e:
            logger.error(f"获取国债收益率数据失败: {e}")
            raise
    
    # ============ 新闻情绪数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_news_sentiment(
        tickers: str = None,
        topics: str = None,
        time_from: str = None,
        time_to: str = None,
        sort: str = "LATEST",
        limit: int = 50,
        session_dir: Path = None
    ) -> Dict:
        """获取市场新闻和情绪数据"""
        try:
            params = {
                "function": "NEWS_SENTIMENT",
                "apikey": AlphaVantageFetcher.get_api_key(),
                "sort": sort,
                "limit": limit
            }
            if tickers:
                params["tickers"] = tickers
            if topics:
                params["topics"] = topics
            if time_from:
                params["time_from"] = time_from
            if time_to:
                params["time_to"] = time_to

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            filename_parts = []
            if tickers:
                filename_parts.append(tickers.replace(',','_'))
            if topics:
                filename_parts.append(topics.replace(',','_'))
            if time_from:
                filename_parts.append(f"from_{time_from}")
            if time_to:
                filename_parts.append(f"to_{time_to}")
            if not filename_parts:
                filename_parts.append("latest")
            
            safe_filename = '_'.join(filename_parts).replace(':', '_').replace('/', '_').replace(' ', '_')
            filename = f"news_{safe_filename}.json"
            
            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / filename
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False)
                logger.info(f"新闻数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "news"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / filename
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False)
                logger.info(f"新闻数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取新闻数据失败: {e}")
            raise
    
    # ============ 新增：基本面数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_overview(symbol: str, session_dir: Path = None) -> Dict:
        """获取公司概况和财务比率数据"""
        try:
            params = {
                "function": "OVERVIEW",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"overview_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"公司概况数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "fundamental"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"overview_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"公司概况数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取公司概况数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_income_statement(symbol: str, session_dir: Path = None) -> Dict:
        """获取利润表数据（年报和季报）"""
        try:
            params = {
                "function": "INCOME_STATEMENT",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"income_statement_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"利润表数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "fundamental"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"income_statement_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"利润表数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取利润表数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_balance_sheet(symbol: str, session_dir: Path = None) -> Dict:
        """获取资产负债表数据（年报和季报）"""
        try:
            params = {
                "function": "BALANCE_SHEET",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"balance_sheet_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"资产负债表数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "fundamental"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"balance_sheet_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"资产负债表数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取资产负债表数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_cash_flow(symbol: str, session_dir: Path = None) -> Dict:
        """获取现金流量表数据（年报和季报）"""
        try:
            params = {
                "function": "CASH_FLOW",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"cash_flow_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"现金流量表数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "fundamental"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"cash_flow_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"现金流量表数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取现金流量表数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_earnings(symbol: str, session_dir: Path = None) -> Dict:
        """获取每股收益(EPS)数据（年报和季报）"""
        try:
            params = {
                "function": "EARNINGS",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"earnings_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"每股收益数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "fundamental"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"earnings_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"每股收益数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取每股收益数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_earnings_estimates(symbol: str, session_dir: Path = None) -> Dict:
        """获取盈利预测数据"""
        try:
            params = {
                "function": "EARNINGS_ESTIMATES",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"earnings_estimates_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"盈利预测数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "fundamental"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"earnings_estimates_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"盈利预测数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取盈利预测数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_dividends(symbol: str, session_dir: Path = None) -> Dict:
        """获取股息历史数据"""
        try:
            params = {
                "function": "DIVIDENDS",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"dividends_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"股息历史数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "fundamental"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"dividends_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"股息历史数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取股息历史数据失败: {e}")
            raise
    
    @staticmethod
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def fetch_shares_outstanding(symbol: str, session_dir: Path = None) -> Dict:
        """获取流通股数量数据"""
        try:
            params = {
                "function": "SHARES_OUTSTANDING",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 🎯 关键修改：始终保存到 session_dir（如果提供）
            if session_dir:
                file_path = session_dir / f"shares_outstanding_{symbol}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"流通股数量数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "fundamental"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"shares_outstanding_{symbol}.json"
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                logger.info(f"流通股数量数据已保存至临时目录：{file_path}")

            return data

        except Exception as e:
            logger.error(f"获取流通股数量数据失败: {e}")
            raise

# ==================== 工具类 ====================
class AlphaVantageTool:
    """AlphaVantage金融数据获取工具 - 最终优化版"""
    
    name = "alphavantage"
    description = (
        "从AlphaVantage获取金融数据的完整工具。支持股票、期权、财报、内部交易、ETF、外汇、"
        "数字货币、大宗商品、国债收益率、新闻情绪等20种数据类型。数据会保存到会话工作区。"
    )
    input_schema = AlphaVantageInput
    
    def __init__(self):
        # 确保工作区根目录存在
        SESSION_WORKSPACE_ROOT.mkdir(exist_ok=True, parents=True)
        logger.info(f"AlphaVantage工具初始化，工作区目录: {SESSION_WORKSPACE_ROOT}")
        
        # 验证API Key
        self._validate_api_key()
        
        # 模式到方法映射
        self._mode_to_method = {
            AlphaVantageMode.WEEKLY_ADJUSTED: {
                "method": AlphaVantageFetcher.fetch_weekly_adjusted,
                "params_model": WeeklyAdjustedParams,
                "timeout": 30
            },
            AlphaVantageMode.GLOBAL_QUOTE: {
                "method": AlphaVantageFetcher.fetch_global_quote,
                "params_model": GlobalQuoteParams,
                "timeout": 30
            },
            AlphaVantageMode.EARNINGS_TRANSCRIPT: {
                "method": AlphaVantageFetcher.fetch_earnings_transcript,
                "params_model": EarningsTranscriptParams,
                "timeout": 45
            },
            AlphaVantageMode.INSIDER_TRANSACTIONS: {
                "method": AlphaVantageFetcher.fetch_insider_transactions,
                "params_model": InsiderTransactionsParams,
                "timeout": 30
            },
            AlphaVantageMode.ETF_PROFILE: {
                "method": AlphaVantageFetcher.fetch_etf_profile,
                "params_model": ETFProfileParams,
                "timeout": 30
            },
            AlphaVantageMode.FOREX_DAILY: {
                "method": AlphaVantageFetcher.fetch_forex_daily,
                "params_model": ForexDailyParams,
                "timeout": 30
            },
            AlphaVantageMode.DIGITAL_CURRENCY_DAILY: {
                "method": AlphaVantageFetcher.fetch_digital_currency_daily,
                "params_model": DigitalCurrencyDailyParams,
                "timeout": 30
            },
            AlphaVantageMode.WTI: {
                "method": AlphaVantageFetcher.fetch_wti,
                "params_model": CommodityParams,
                "timeout": 30
            },
            AlphaVantageMode.BRENT: {
                "method": AlphaVantageFetcher.fetch_brent,
                "params_model": CommodityParams,
                "timeout": 30
            },
            AlphaVantageMode.COPPER: {
                "method": AlphaVantageFetcher.fetch_copper,
                "params_model": CommodityParams,
                "timeout": 30
            },
            AlphaVantageMode.TREASURY_YIELD: {
                "method": AlphaVantageFetcher.fetch_treasury_yield,
                "params_model": TreasuryYieldParams,
                "timeout": 30
            },
            AlphaVantageMode.NEWS_SENTIMENT: {
                "method": AlphaVantageFetcher.fetch_news_sentiment,
                "params_model": NewsSentimentParams,
                "timeout": 45
            },
            # 新增基本面数据映射
            AlphaVantageMode.OVERVIEW: {
                "method": AlphaVantageFetcher.fetch_overview,
                "params_model": OverviewParams,
                "timeout": 30
            },
            AlphaVantageMode.INCOME_STATEMENT: {
                "method": AlphaVantageFetcher.fetch_income_statement,
                "params_model": IncomeStatementParams,
                "timeout": 30
            },
            AlphaVantageMode.BALANCE_SHEET: {
                "method": AlphaVantageFetcher.fetch_balance_sheet,
                "params_model": BalanceSheetParams,
                "timeout": 30
            },
            AlphaVantageMode.CASH_FLOW: {
                "method": AlphaVantageFetcher.fetch_cash_flow,
                "params_model": CashFlowParams,
                "timeout": 30
            },
            AlphaVantageMode.EARNINGS: {
                "method": AlphaVantageFetcher.fetch_earnings,
                "params_model": EarningsParams,
                "timeout": 30
            },
            AlphaVantageMode.EARNINGS_ESTIMATES: {
                "method": AlphaVantageFetcher.fetch_earnings_estimates,
                "params_model": EarningsEstimatesParams,
                "timeout": 30
            },
            AlphaVantageMode.DIVIDENDS: {
                "method": AlphaVantageFetcher.fetch_dividends,
                "params_model": DividendsParams,
                "timeout": 30
            },
            AlphaVantageMode.SHARES_OUTSTANDING: {
                "method": AlphaVantageFetcher.fetch_shares_outstanding,
                "params_model": SharesOutstandingParams,
                "timeout": 30
            }
        }
    
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
    
    def _ensure_session_workspace(self, session_id: str = None) -> Path:
        """
        确保会话工作区存在，并设置权限为777，以便不同服务进程均可读写。
        
        核心修改：与代码解释器完全一致的会话目录逻辑，并添加权限设置。
        """
        if not session_id:
            # ✅ 核心修复：与代码解释器完全一致，直接创建temp目录
            # 这样代码解释器就能访问到相同目录
            session_id = "temp"  # 固定为temp目录
            session_dir = SESSION_WORKSPACE_ROOT / session_id
            session_dir.mkdir(parents=True, exist_ok=True)
            # 设置权限为777，确保不同用户可写
            try:
                os.chmod(session_dir, 0o777)
                logger.info(f"📁 设置临时会话目录权限: {session_dir} (777)")
            except Exception as e:
                logger.warning(f"⚠️ 无法设置临时目录权限: {e}")
            logger.info(f"📁 创建/使用临时会话目录: {session_dir}")
            return session_dir
        
        # 如果提供了session_id，使用该ID创建目录
        session_dir = SESSION_WORKSPACE_ROOT / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        # 设置权限为777
        try:
            os.chmod(session_dir, 0o777)
            logger.info(f"📂 设置会话目录权限: {session_dir} (777)")
        except Exception as e:
            logger.warning(f"⚠️ 无法设置目录权限: {e}")
        
        logger.info(f"📂 使用指定会话目录: {session_dir}")
        return session_dir
    
    async def _execute_with_timeout(self, func, timeout: int = 60):
        """带超时的函数执行"""
        try:
            # 将同步函数包装为异步
            return await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, func),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.error(f"⏰ 操作超时 ({timeout}秒)")
            raise
    
    # ============ 重新添加的重要方法 ============
    
    def _get_saved_file_paths(self, session_dir: Path, mode: AlphaVantageMode, params: dict) -> List[str]:
        """获取已保存的文件路径"""
        try:
            if mode == AlphaVantageMode.WEEKLY_ADJUSTED:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"stock_{symbol}.parquet"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.GLOBAL_QUOTE:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"quote_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.FOREX_DAILY:
                from_sym = params.get("from_symbol", "USD")
                to_sym = params.get("to_symbol", "JPY")
                file_path = session_dir / f"forex_{from_sym}_{to_sym}.parquet"
                return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.NEWS_SENTIMENT:
                tickers = params.get("tickers", "general")
                safe_tickers = tickers.replace(',', '_').replace(' ', '_') if tickers else "general"
                file_path = session_dir / f"news_{safe_tickers}.json"
                return [str(file_path)] if file_path.exists() else []
            
            # 新增基本面数据文件路径
            elif mode == AlphaVantageMode.OVERVIEW:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"overview_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.INCOME_STATEMENT:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"income_statement_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.BALANCE_SHEET:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"balance_sheet_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.CASH_FLOW:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"cash_flow_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.EARNINGS:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"earnings_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.EARNINGS_ESTIMATES:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"earnings_estimates_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.DIVIDENDS:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"dividends_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            elif mode == AlphaVantageMode.SHARES_OUTSTANDING:
                symbol = params.get("symbol")
                if symbol:
                    file_path = session_dir / f"shares_outstanding_{symbol}.json"
                    return [str(file_path)] if file_path.exists() else []
            
            # 其他模式可以类似添加...
            
            return []
        except Exception as e:
            logger.warning(f"获取保存文件路径失败: {e}")
            return []
    
    def _generate_example_code(self, mode: AlphaVantageMode, params: dict, saved_files: List[Dict]) -> str:
        """简化的代码示例 - 只返回基本信息"""
        if not saved_files:
            return "# 数据获取完成，文件已保存"
        
        # 取第一个文件作为示例
        file_info = saved_files[0]
        filename = file_info['filename']
        
        # ✅ 简化为基本信息，不提供具体代码
        return f"# 数据文件已保存: {filename}\n# 后续处理请在代码解释器中进行"
    
    async def execute(self, parameters: AlphaVantageInput, session_id: str = None) -> dict:
        """执行AlphaVantage数据获取 - 主入口"""
        try:
            mode = parameters.mode
            params = parameters.parameters
            
            logger.info(f"🚀 执行 AlphaVantage 模式: {mode.value}")
            
            # 检查模式是否支持
            if mode not in self._mode_to_method:
                return {
                    "success": False,
                    "error": f"不支持的AlphaVantage模式: {mode.value}",
                    "available_modes": [m.value for m in AlphaVantageMode]
                }
            
            # ✅ 核心修复：使用固定temp目录，与代码解释器共享
            # 这样代码解释器就能访问到相同文件
            session_dir = self._ensure_session_workspace(session_id)
            
            # 获取模式配置
            mode_config = self._mode_to_method[mode]
            method = mode_config["method"]
            params_model = mode_config["params_model"]
            timeout = mode_config["timeout"]
            
            # 验证参数
            try:
                validated_params = params_model(**params)
            except Exception as e:
                logger.error(f"❌ 参数验证失败: {e}")
                return {
                    "success": False,
                    "error": f"参数验证失败: {str(e)}",
                    "mode": mode.value
                }
            
            # 🎯 执行API调用
            try:
                result = await self._execute_with_timeout(
                    lambda: method(**validated_params.dict(), session_dir=session_dir),
                    timeout=timeout
                )
            except Exception as e:
                logger.error(f"❌ API调用失败: {e}")
                return {
                    "success": False,
                    "error": f"API调用失败: {str(e)}",
                    "mode": mode.value
                }
            
            # ✅ 获取保存的文件列表
            saved_files = []
            if session_dir.exists():
                for file_path in session_dir.glob("*"):
                    if file_path.is_file():
                        saved_files.append({
                            "filename": file_path.name,
                            "host_path": str(file_path),  # 宿主机路径
                            "container_path": f"/srv/sandbox_workspaces/{session_dir.name}/{file_path.name}",  # ✅ 统一路径
                            "size_kb": file_path.stat().st_size / 1024,
                            "session_id": session_dir.name
                        })

            # 生成简化的示例代码
            example_code = self._generate_example_code(mode, params, saved_files)
            
            # 构建元数据
            metadata = {
                "mode": mode.value,
                "parameters": params,
                "session_id": session_id or "temp",
                "timestamp": datetime.now().isoformat(),
                "session_dir": str(session_dir),
                "saved_files": saved_files,
                "example_code": example_code,
                "access_instructions": f"数据已保存到工作区目录"
            }
            
            # 处理结果
            processed_result = self._process_result(result, mode)
            
            # 构建响应
            response = {
                "success": True,
                "data": processed_result,
                "metadata": metadata
            }
            
            logger.info(f"✅ AlphaVantage工具执行成功: {mode.value}")
            return response
            
        except Exception as e:
            logger.error(f"❌ AlphaVantage工具执行失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"工具执行失败: {str(e)}",
                "mode": parameters.mode.value if hasattr(parameters, 'mode') else "unknown"
            }
    
    def _process_result(self, result, mode: AlphaVantageMode):
        """处理返回结果，确保可序列化"""
        if result is None:
            return {"message": "未获取到数据"}
        
        # 特殊处理数字货币数据
        if mode == AlphaVantageMode.DIGITAL_CURRENCY_DAILY:
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

# ==================== 辅助函数 ====================
def get_available_modes() -> List[str]:
    """获取所有可用的AlphaVantage模式"""
    return [mode.value for mode in AlphaVantageMode]

def get_mode_description(mode_name: str) -> str:
    """获取模式描述"""
    descriptions = {
        "weekly_adjusted": "获取股票周调整数据（开盘价、最高价、最低价、收盘价、调整后收盘价、成交量、股息）",
        "global_quote": "获取实时行情数据（当前价格、涨跌幅、成交量等）",
        # 删除付费期权功能: "historical_options": "获取历史期权数据（需要付费API套餐）",
        "earnings_transcript": "获取财报电话会议记录",
        "insider_transactions": "获取公司内部人交易数据",
        "etf_profile": "获取ETF详细信息和持仓数据",
        "forex_daily": "获取外汇每日数据",
        "digital_currency_daily": "获取数字货币每日数据",
        "wti": "获取WTI原油价格数据",
        "brent": "获取Brent原油价格数据",
        "copper": "获取全球铜价数据",
        "treasury_yield": "获取美国国债收益率数据",
        "news_sentiment": "获取市场新闻和情绪数据",
        # 新增基本面数据描述
        "overview": "获取公司概况和财务比率数据（市值、市盈率、股息收益率等）",
        "income_statement": "获取利润表数据（年报和季报）",
        "balance_sheet": "获取资产负债表数据（年报和季报）",
        "cash_flow": "获取现金流量表数据（年报和季报）",
        "earnings": "获取每股收益(EPS)数据（年报和季报）",
        "earnings_estimates": "获取盈利预测数据",
        "dividends": "获取股息历史数据",
        "shares_outstanding": "获取流通股数量数据"
    }
    return descriptions.get(mode_name, "未知功能")