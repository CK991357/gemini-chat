"""AlphaVantage数据获取专用模块 - 支持会话目录完整版（13个功能）"""
import os
import logging
import json
import pandas as pd
import requests
from pathlib import Path
from typing import Optional, Dict, List, Union
from tenacity import retry, stop_after_attempt, wait_exponential

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class AlphaVantageFetcher:
    """AlphaVantage数据获取器 - 完整版"""
    
    BASE_URL = "https://www.alphavantage.co/query"
    
    @staticmethod
    def get_api_key():
        """从环境变量获取API Key"""
        key = os.getenv("ALPHAVANTAGE_API_KEY")
        if not key:
            # 回退到你的默认key
            logger.warning("⚠️ ALPHAVANTAGE_API_KEY未找到，使用默认key")
            return "U5KM36DHDXR95Q7Q"  # 你的默认key
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

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "stock" / f"{symbol}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"股票数据已保存至会话目录：{file_path}")
            else:
                # 后备：保存到临时目录
                temp_dir = Path("/tmp/alphavantage_data") / "us_stock"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"{symbol}.parquet"
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

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "stock" / f"{symbol}_quote.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
                logger.info(f"实时行情已保存至会话目录：{file_path}")

            return result

        except Exception as e:
            logger.error(f"获取实时行情失败: {e}")
            raise
    
    # ============ 期权数据方法 ============
    
    @staticmethod
    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=4, max=10))  # 减少重试次数
    def fetch_historical_options(symbol: str, date: str = None, session_dir: Path = None) -> List[Dict]:
        """获取历史期权数据"""
        try:
            params = {
                "function": "HISTORICAL_OPTIONS",
                "symbol": symbol,
                "apikey": AlphaVantageFetcher.get_api_key()
            }
            if date:
                params["date"] = date

            response = requests.get(AlphaVantageFetcher.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            # 检查API返回的错误信息
            if "Information" in data:
                # 这是AlphaVantage的典型错误响应，说明需要付费API
                error_msg = data["Information"]
                logger.warning(f"AlphaVantage API限制: {error_msg}")
                raise ValueError(f"需要AlphaVantage付费API套餐才能访问期权数据: {error_msg}")
            
            if "Note" in data:
                # API调用频率限制提示
                logger.warning(f"API频率限制提示: {data['Note']}")
            
            if not data.get("data"):
                if "Error Message" in data:
                    raise ValueError(f"AlphaVantage API错误: {data['Error Message']}")
                else:
                    # 返回空列表而不是抛出异常
                    logger.warning(f"未找到{symbol}在{date}的期权数据")
                    return []

            # 转换数据类型
            for contract in data["data"]:
                for field in ["strike", "last", "mark", "bid", "ask", 
                            "implied_volatility", "delta", "gamma", 
                            "theta", "vega", "rho"]:
                    if contract.get(field):
                        contract[field] = float(contract[field])
                for field in ["bid_size", "ask_size", "volume", "open_interest"]:
                    if contract.get(field):
                        contract[field] = int(contract[field])

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "options" / f"{symbol}_{date if date else 'latest'}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                pd.DataFrame(data["data"]).to_parquet(file_path)
                logger.info(f"期权数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "options"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"{symbol}_{date if date else 'latest'}.parquet"
                pd.DataFrame(data["data"]).to_parquet(file_path)
                logger.info(f"期权数据已保存至临时目录：{file_path}")

            return data["data"]

        except Exception as e:
            logger.error(f"获取期权数据失败: {e}")
            # 返回空列表而不是抛出异常，避免中断整个流程
            return []
    
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

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "transcripts" / f"{symbol}_{quarter}.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False)
                logger.info(f"财报会议记录已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "transcripts"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"{symbol}_{quarter}.json"
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

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "insider" / f"{symbol}_insider.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(transactions, f, ensure_ascii=False)
                logger.info(f"内部人交易数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "insider"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"{symbol}_insider.json"
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

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "etf" / f"{symbol}_profile.json"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(profile, f, ensure_ascii=False, indent=2)
                logger.info(f"ETF数据已保存至会话目录：{file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "etf"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"{symbol}_profile.json"
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

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "forex" / f"{from_symbol}_{to_symbol}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"外汇数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "forex"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"{from_symbol}_{to_symbol}_daily.parquet"
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

            # 🎯 保存到会话目录
            if session_dir:
                dir_path = session_dir / "crypto"
                dir_path.mkdir(parents=True, exist_ok=True)
                
                # 特殊处理USD市场数据
                if market == "USD":
                    file_path = dir_path / f"{symbol}_USD.parquet"
                    market_df.to_parquet(file_path)
                    logger.info(f"USD市场数据已保存至会话目录: {file_path}")
                else:
                    market_file = dir_path / f"{symbol}_{market}.parquet"
                    usd_file = dir_path / f"{symbol}_USD.parquet"
                    market_df.to_parquet(market_file)
                    usd_df.to_parquet(usd_file)
                    logger.info(f"数字货币{symbol}数据已保存至会话目录: {dir_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "digital_currency"
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                if market == "USD":
                    file_path = temp_dir / "USD_market_values.parquet"
                    market_df.to_parquet(file_path)
                    logger.info(f"USD市场数据已保存至临时目录: {file_path}")
                else:
                    market_df.to_parquet(temp_dir / f"{market}_market_values.parquet")
                    usd_df.to_parquet(temp_dir / "usd_market_values.parquet")
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
            # 处理可能的无效数值（如'.'等）
            df["price"] = pd.to_numeric(df["value"], errors='coerce')
            df = df.dropna(subset=['price'])
            df["price"] = df["price"].astype(float)
            df = df.drop(columns=["value"])
            df = df.set_index("date").sort_index()

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "commodities" / f"WTI_{interval}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"WTI原油数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "commodities"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"WTI_{interval}.parquet"
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
            
            # 安全转换数值，处理各种异常情况
            df["price"] = pd.to_numeric(df["value"], errors='coerce')
            
            # 记录并过滤无效数据
            invalid_count = df["price"].isna().sum()
            if invalid_count > 0:
                logger.warning(f"过滤掉{invalid_count}条无效原油数据")
                df = df.dropna(subset=['price'])
            
            df["price"] = df["price"].astype(float)
            df = df.drop(columns=["value"])
            df = df.set_index("date").sort_index()
            
            # 检查数据完整性
            if len(df) == 0:
                raise ValueError("没有有效的原油数据可用")

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "commodities" / f"BRENT_{interval}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"Brent原油数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "commodities"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"BRENT_{interval}.parquet"
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
            
            # 安全转换数值，处理各种异常情况
            df["price"] = pd.to_numeric(df["value"], errors='coerce')
            
            # 记录并过滤无效数据
            invalid_count = df["price"].isna().sum()
            if invalid_count > 0:
                logger.warning(f"过滤掉{invalid_count}条无效铜价数据")
                df = df.dropna(subset=['price'])
            
            df["price"] = df["price"].astype(float)
            df = df.drop(columns=["value"])
            df = df.set_index("date").sort_index()
            
            # 检查数据完整性
            if len(df) == 0:
                raise ValueError("没有有效的铜价数据可用")

            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "commodities" / f"COPPER_{interval}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"铜价数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "commodities"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"COPPER_{interval}.parquet"
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
            
            # 过滤无效数据
            df = df.dropna(subset=["yield"])
            
            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "treasury" / f"TREASURY_{maturity}_{interval}.parquet"
                file_path.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(file_path)
                logger.info(f"国债收益率数据已保存至会话目录: {file_path}")
            else:
                # 后备
                temp_dir = Path("/tmp/alphavantage_data") / "treasury"
                temp_dir.mkdir(parents=True, exist_ok=True)
                file_path = temp_dir / f"TREASURY_{maturity}_{interval}.parquet"
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
            
            # 🎯 保存到会话目录
            if session_dir:
                file_path = session_dir / "news" / filename
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