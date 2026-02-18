"""
财务比率分析工具 - 增强版 v3.0
完全兼容原接口，新增高级财务分析指标、加权健康评分、趋势分析、AlphaVantage自动转换
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List, Union, Tuple
from pydantic import BaseModel, Field, model_validator
import numpy as np

logger = logging.getLogger(__name__)


class FinancialRatioAnalysisTool:
    """增强版财务比率分析与解释工具 v3.0"""

    name = "financial_ratio_analysis"
    description = (
        "财务比率分析工具，支持单期财务数据或AlphaVantage原始数据输入。\n"
        "计算五大类20+个核心比率，并提供杜邦分析、可持续增长率、Altman Z-Score、趋势分析等高级指标。\n"
        "输出包含行业对比评级、加权财务健康评分、历史趋势（若提供多年数据）。"
    )
    version = "3.0.0"

    class InputSchema(BaseModel):
        """输入参数定义（增强版）"""

        # ---------- 兼容原接口 ----------
        financial_data: Optional[Dict[str, Any]] = Field(
            default=None,
            description="单期财务数据，必须包含income_statement, balance_sheet, market_data（若提供此字段则直接使用）"
        )
        industry: str = Field(
            default="general",
            description="行业分类，可选：technology, retail, manufacturing, healthcare, financial, energy, general"
        )
        include_interpretation: bool = Field(default=True)
        include_summary: bool = Field(default=True)
        format_output: bool = Field(default=True)

        # ---------- 新增：AlphaVantage原始数据自动转换 ----------
        alpha_vantage_data: Optional[Dict[str, Dict]] = Field(
            default=None,
            description="AlphaVantage原始数据字典，至少包含income_statement, balance_sheet, overview。"
                        "若提供此字段，将自动转换为financial_data格式，并覆盖industry"
        )

        # ---------- 新增：历史趋势分析（需提供多年财务数据）----------
        historical_data: Optional[Dict[str, List[Dict[str, Any]]]] = Field(
            default=None,
            description="多年历史财务数据，用于趋势分析。格式：{\"income_statements\": [...], \"balance_sheets\": [...], \"cash_flows\": [...]}"
        )

        # ---------- 新增：高级指标开关 ----------
        use_advanced_metrics: bool = Field(
            default=True,
            description="是否计算杜邦分析、Z-Score、可持续增长率等高级指标"
        )

        # ---------- 新增：历年比率计算开关 ----------
        include_historical_ratios: bool = Field(
            default=False,
            description="是否计算所有可用历史年份的基础财务比率（盈利能力、流动性、杠杆、效率）"
        )

        # ---------- 新增：自定义行业基准（可选）----------
        custom_benchmarks: Optional[Dict[str, Dict[str, Dict[str, float]]]] = Field(
            default=None,
            description="自定义行业基准，格式与内置benchmarks相同，会合并到内置基准中"
        )

        @model_validator(mode='after')
        def check_data_source(self):
            """验证必须提供 financial_data 或 alpha_vantage_data 之一"""
            if self.financial_data is None and self.alpha_vantage_data is None:
                raise ValueError('必须提供 financial_data 或 alpha_vantage_data 之一')
            return self

        class Config:
            json_schema_extra = {
                "example": {
                    "alpha_vantage_data": {
                        "income_statement": {...},
                        "balance_sheet": {...},
                        "overview": {...},
                        "global_quote": {...}
                    },
                    "historical_data": {
                        "income_statements": [{...}, {...}, {...}],
                        "balance_sheets": [{...}, {...}, {...}]
                    },
                    "industry": "technology",
                    "use_advanced_metrics": True
                }
            }

    input_schema = InputSchema

    def __init__(self):
        """初始化：加载行业基准、定义指标权重"""
        self.industry_benchmarks = self._load_industry_benchmarks()
        # 财务健康评分权重配置（总和100%）
        self.health_weights = {
            "profitability": 0.30,
            "liquidity": 0.20,
            "leverage": 0.20,
            "efficiency": 0.15,
            "valuation": 0.15,
        }
        logger.info(f"初始化增强版财务比率分析工具 v{self.version}")

    # ---------- 核心执行方法 ----------
    async def execute(self, parameters: InputSchema) -> Dict[str, Any]:
        start_time = datetime.now()
        try:
            # ----- 1. 输入数据准备 -----
            # 若提供了alpha_vantage_data，自动转换为financial_data
            if parameters.alpha_vantage_data:
                converted = self._convert_alpha_vantage(parameters.alpha_vantage_data)
                financial_data = converted["financial_data"]
                industry = converted["industry"]
                # 保留原始alpha_vantage_data供趋势分析使用（若未单独提供historical_data）
                raw_av = parameters.alpha_vantage_data
            else:
                financial_data = parameters.financial_data
                industry = parameters.industry
                raw_av = None

            # 提取单期数据
            income = financial_data.get("income_statement", {})
            balance = financial_data.get("balance_sheet", {})
            market = financial_data.get("market_data", {})
            cashflow = financial_data.get("cash_flow", {})  # 新增：现金流数据

            # ----- 2. 基础比率计算 -----
            ratios = self._calculate_all_ratios(income, balance, market, cashflow)

            # ----- 3. 高级指标计算（杜邦、Z-Score、可持续增长率等）-----
            advanced = {}
            if parameters.use_advanced_metrics:
                advanced = self._calculate_advanced_metrics(income, balance, market, ratios)

            # ----- 4. 历史趋势分析（若提供historical_data或可从alpha_vantage提取）-----
            trend = {}
            if parameters.historical_data:
                trend = self._calculate_trends(parameters.historical_data, industry)
            elif raw_av and "income_statement" in raw_av and "balance_sheet" in raw_av:
                # 尝试从AlphaVantage原始数据中提取多年年报进行趋势分析
                hist_data = self._extract_historical_from_av(raw_av)
                if hist_data:
                    trend = self._calculate_trends(hist_data, industry)

            # ----- 5. 新增：历年详细比率计算 -----
            historical_ratios = {}
            if parameters.include_historical_ratios and raw_av:
                historical_ratios = self._calculate_historical_ratios(raw_av)

            # ----- 6. 格式化输出（原方法）-----
            formatted_ratios = {}
            if parameters.format_output:
                for category, cat_ratios in ratios.items():
                    formatted_ratios[category] = self._format_ratios(cat_ratios, category)

            # ----- 7. 行业解释与评级（原方法 + 高级指标解释）-----
            interpretations = {}
            if parameters.include_interpretation:
                # 基础比率解释
                interpretations = self._interpret_all_ratios(ratios, industry)
                # 高级指标解释
                if advanced:
                    interpretations["advanced"] = self._interpret_advanced(advanced, industry)

            # ----- 8. 加权财务健康评分（增强版）-----
            health_score = self._calculate_weighted_health_score(
                ratios, advanced, interpretations, industry
            )

            # ----- 9. 总结报告（增强版）-----
            summary = ""
            if parameters.include_summary:
                summary = self._generate_enhanced_summary(
                    ratios, advanced, trend, health_score, industry
                )

            execution_time = (datetime.now() - start_time).total_seconds()

            # ----- 10. 组装最终输出 -----
            result = {
                "success": True,
                "execution_time": execution_time,
                "calculated_ratios": ratios,
                "formatted_ratios": formatted_ratios if parameters.format_output else ratios,
                "advanced_metrics": advanced if parameters.use_advanced_metrics else None,
                "trend_analysis": trend if trend else None,
                "historical_ratios": historical_ratios if historical_ratios else None,
                "interpretations": interpretations if parameters.include_interpretation else None,
                "summary": summary if parameters.include_summary else None,
                "financial_health": health_score,
                "metadata": {
                    "industry": industry,
                    "input_source": "alpha_vantage" if parameters.alpha_vantage_data else "financial_data",
                    "has_trend": bool(trend),
                    "has_historical_ratios": bool(historical_ratios),
                    "advanced_enabled": parameters.use_advanced_metrics,
                    "timestamp": datetime.now().isoformat(),
                    "tool_version": self.version,
                }
            }

            logger.info(f"增强版财务比率分析完成，耗时: {execution_time:.2f}秒")
            return result

        except Exception as e:
            logger.error(f"财务比率分析失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"财务比率分析失败: {str(e)}",
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "suggestion": "请检查输入数据格式或完整性"
            }

    # ---------- AlphaVantage数据转换（内部方法）----------
    @staticmethod
    def _to_float(val):
        """增强版安全转换"""
        if val is None:
            return 0.0
        if isinstance(val, (int, float)):
            return float(val)
        s = str(val).strip()
        if s == '' or s.lower() == 'none':
            return 0.0
        s = s.replace(',', '').replace('%', '')
        try:
            return float(s)
        except ValueError:
            return 0.0

    # ==================== 修复1: _convert_alpha_vantage（完整替换） ====================
    def _convert_alpha_vantage(self, av_data: Dict[str, Dict]) -> Dict[str, Any]:
        """将AlphaVantage原始数据转换为financial_data和industry（兼容标准格式与简化格式）"""
        required = ["income_statement", "balance_sheet", "overview"]
        for key in required:
            if key not in av_data:
                raise ValueError(f"AlphaVantage数据缺少必需字段: {key}")

        # 提取最新年报
        inc = av_data["income_statement"].get("annualReports", [{}])[0]
        bal = av_data["balance_sheet"].get("annualReports", [{}])[0]
        ov = av_data["overview"]

        # ----- 利润表 -----
        income_data = {
            "revenue": self._to_float(inc.get("totalRevenue")),
            "cost_of_goods_sold": self._to_float(inc.get("costOfRevenue")),
            "operating_income": self._to_float(inc.get("operatingIncome")),
            "ebit": self._to_float(inc.get("ebit", inc.get("operatingIncome"))),
            "interest_expense": self._to_float(inc.get("interestExpense")),
            "net_income": self._to_float(inc.get("netIncome")),
            "ebitda": self._to_float(inc.get("ebitda", inc.get("operatingIncome"))),
        }

        # ----- 资产负债表 -----
        short_debt = self._to_float(bal.get("shortTermDebt", 0))
        long_debt = self._to_float(bal.get("longTermDebt", 0))
        total_debt = short_debt + long_debt

        balance_data = {
            "total_assets": self._to_float(bal.get("totalAssets")),
            "current_assets": self._to_float(bal.get("totalCurrentAssets")),
            "cash_and_equivalents": self._to_float(bal.get("cashAndCashEquivalentsAtCarryingValue")),
            "accounts_receivable": self._to_float(bal.get("currentNetReceivables")),
            "inventory": self._to_float(bal.get("inventory")),
            "current_liabilities": self._to_float(bal.get("totalCurrentLiabilities")),
            "total_debt": total_debt,
            "shareholders_equity": self._to_float(bal.get("totalShareholderEquity")),
            # 修复：AlphaVantage 应付账款字段名为 currentAccountsPayable，不是 accountsPayable
            "accounts_payable": self._to_float(bal.get("currentAccountsPayable", 0)),
            "retained_earnings": self._to_float(bal.get("retainedEarnings", 0)),
            "total_liabilities": self._to_float(bal.get("totalLiabilities", 0)),  # 新增，用于Z-Score
        }

        # ----- 现金流数据（新增）-----
        cashflow_data = {}
        if "cash_flow" in av_data:
            cf = av_data["cash_flow"].get("annualReports", [{}])[0]
            cashflow_data = {
                "operating_cashflow": self._to_float(cf.get("operatingCashflow")),
                "capital_expenditures": self._to_float(cf.get("capitalExpenditures")),
            }
        else:
            # 如果没有现金流数据，初始化为0
            cashflow_data = {"operating_cashflow": 0, "capital_expenditures": 0}

        # ----- 市场数据：优先使用global_quote，兼容两种格式 -----
        share_price = 0.0

        # 1️⃣ 尝试从 overview 提取（AlphaVantage 部分账户有此字段，但您的不含，保持兼容）
        overview_price = self._to_float(ov.get("Price"))
        if overview_price != 0:
            share_price = overview_price

        # 2️⃣ 尝试从 global_quote 提取（兼容标准格式和您的简化格式）
        if share_price == 0 and "global_quote" in av_data:
            gq = av_data["global_quote"]
            # 判断是否是标准格式（有 "Global Quote" 键）
            if "Global Quote" in gq:
                quote = gq["Global Quote"]
                share_price = self._to_float(quote.get("05. price"))
            else:
                # 您的简化格式：直接取 "price" 键（小写）
                share_price = self._to_float(gq.get("price"))
                # 如果小写 price 不存在，尝试大写 Price（某些工具保存可能不同）
                if share_price == 0:
                    share_price = self._to_float(gq.get("Price"))

        # 如果仍为0，记录警告（不中断执行）
        if share_price == 0:
            logger.warning("⚠️ 股价提取失败，估值比率将不可用。请检查 overview.Price 或 global_quote 数据。")

        market_data = {
            "share_price": share_price,
            "shares_outstanding": self._to_float(ov.get("SharesOutstanding", 1)),
            "dividends": self._to_float(ov.get("DividendPerShare", 0)),
        }

        # ----- 从 earnings 数据计算 EPS 增长率（用于 PEG 比率）-----
        if "earnings" in av_data:
            earnings_reports = av_data["earnings"].get("annualEarnings", [])
            eps_list = []
            for e in earnings_reports[:4]:  # 取最近4年
                eps = self._to_float(e.get("reportedEPS"))
                if eps > 0:
                    eps_list.append(eps)
            if len(eps_list) >= 2:
                # 计算复合年增长率 (CAGR)
                try:
                    cagr = (eps_list[0] / eps_list[-1]) ** (1 / (len(eps_list)-1)) - 1
                    market_data["earnings_growth_rate"] = cagr
                except:
                    pass

        # ----- 行业映射 -----
        sector = ov.get("Sector", "").lower()
        industry_map = {
            "technology": "technology",
            "healthcare": "healthcare",
            "financial": "financial",
            "consumer": "retail",
            "industrial": "manufacturing",
            "energy": "energy",
        }
        industry = "general"
        for key, val in industry_map.items():
            if key in sector:
                industry = val
                break

        return {
            "financial_data": {
                "income_statement": income_data,
                "balance_sheet": balance_data,
                "market_data": market_data,
                "cash_flow": cashflow_data,  # 新增
            },
            "industry": industry
        }

    def _extract_historical_from_av(self, av_data: Dict) -> Optional[Dict]:
        """从AlphaVantage原始数据中提取多年年报，用于趋势分析"""
        inc_reports = av_data.get("income_statement", {}).get("annualReports", [])
        bal_reports = av_data.get("balance_sheet", {}).get("annualReports", [])
        cf_reports = av_data.get("cash_flow", {}).get("annualReports", [])
        if len(inc_reports) < 2 or len(bal_reports) < 2:
            return None
        return {
            "income_statements": inc_reports,
            "balance_sheets": bal_reports,
            "cash_flows": cf_reports,
        }

    # ---------- 新增：历年详细比率计算 ----------
    def _calculate_historical_ratios(self, av_data: Dict) -> Dict[str, Dict[str, Dict[str, str]]]:
        """
        从 AlphaVantage 原始数据中提取所有历史年份，计算基础财务比率（不含估值）
        返回结构：{ "2025": { "profitability": {...}, "liquidity": {...}, "leverage": {...}, "efficiency": {...}, "cashflow": {...} }, ... }
        """
        inc_reports = av_data.get("income_statement", {}).get("annualReports", [])
        bal_reports = av_data.get("balance_sheet", {}).get("annualReports", [])
        cf_reports = av_data.get("cash_flow", {}).get("annualReports", [])
        if not inc_reports or not bal_reports:
            return {}

        # 按 fiscalDateEnding 对齐年份（确保使用同一年的报表）
        year_map = {}
        for inc in inc_reports:
            date = inc.get("fiscalDateEnding", "")
            year = date[:4] if len(date) >= 4 else None
            if year:
                year_map.setdefault(year, {}).update({"income": inc})
        for bal in bal_reports:
            date = bal.get("fiscalDateEnding", "")
            year = date[:4] if len(date) >= 4 else None
            if year:
                year_map.setdefault(year, {}).update({"balance": bal})
        for cf in cf_reports:
            date = cf.get("fiscalDateEnding", "")
            year = date[:4] if len(date) >= 4 else None
            if year:
                year_map.setdefault(year, {}).update({"cashflow": cf})

        # 过滤出同时有利润表和资产负债表的年份（现金流可选，如果没有则置空）
        valid_years = {y: v for y, v in year_map.items() if "income" in v and "balance" in v}
        if not valid_years:
            return {}

        # 按年份排序（升序，从远到近）
        sorted_years = sorted(valid_years.keys())

        historical = {}
        for year in sorted_years:
            inc = valid_years[year]["income"]
            bal = valid_years[year]["balance"]
            cf = valid_years[year].get("cashflow", {})  # 现金流可能缺失

            # 构建单期数据字典
            income_dict = {
                "revenue": self._to_float(inc.get("totalRevenue")),
                "cost_of_goods_sold": self._to_float(inc.get("costOfRevenue")),
                "operating_income": self._to_float(inc.get("operatingIncome")),
                "ebit": self._to_float(inc.get("ebit", inc.get("operatingIncome"))),
                "interest_expense": self._to_float(inc.get("interestExpense")),
                "net_income": self._to_float(inc.get("netIncome")),
                "ebitda": self._to_float(inc.get("ebitda", inc.get("operatingIncome"))),
            }

            short_debt = self._to_float(bal.get("shortTermDebt", 0))
            long_debt = self._to_float(bal.get("longTermDebt", 0))
            total_debt = short_debt + long_debt

            balance_dict = {
                "total_assets": self._to_float(bal.get("totalAssets")),
                "current_assets": self._to_float(bal.get("totalCurrentAssets")),
                "cash_and_equivalents": self._to_float(bal.get("cashAndCashEquivalentsAtCarryingValue")),
                "accounts_receivable": self._to_float(bal.get("currentNetReceivables")),
                "inventory": self._to_float(bal.get("inventory")),
                "current_liabilities": self._to_float(bal.get("totalCurrentLiabilities")),
                "total_debt": total_debt,
                "shareholders_equity": self._to_float(bal.get("totalShareholderEquity")),
                # 修复：AlphaVantage 应付账款字段名为 currentAccountsPayable，不是 accountsPayable
                "accounts_payable": self._to_float(bal.get("currentAccountsPayable", 0)),
                "retained_earnings": self._to_float(bal.get("retainedEarnings", 0)),
            }

            # 构建现金流字典（如果存在）
            cashflow_dict = {
                "operating_cashflow": self._to_float(cf.get("operatingCashflow")),
                "capital_expenditures": self._to_float(cf.get("capitalExpenditures")),
            }

            # 计算基础比率
            profitability = self._profitability_ratios(income_dict, balance_dict)
            liquidity = self._liquidity_ratios(balance_dict)
            leverage = self._leverage_ratios(income_dict, balance_dict)
            efficiency = self._efficiency_ratios(income_dict, balance_dict)
            cashflow = self._cashflow_ratios(income_dict, balance_dict, cashflow_dict, market={})  # 市场数据不可用，传空字典

            # 格式化数值
            formatted_profit = self._format_ratios(profitability, "profitability")
            formatted_liquidity = self._format_ratios(liquidity, "liquidity")
            formatted_leverage = self._format_ratios(leverage, "leverage")
            formatted_efficiency = self._format_ratios(efficiency, "efficiency")
            formatted_cashflow = self._format_ratios(cashflow, "cashflow")

            historical[year] = {
                "profitability": formatted_profit,
                "liquidity": formatted_liquidity,
                "leverage": formatted_leverage,
                "efficiency": formatted_efficiency,
                "cashflow": formatted_cashflow,
            }

        return historical

    # ---------- 基础比率计算（保留原方法，略作增强）----------
    @staticmethod
    def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
        if denominator == 0 or denominator is None:
            return default
        return numerator / denominator

    def _calculate_all_ratios(self, income: Dict, balance: Dict, market: Dict, cashflow: Dict) -> Dict[str, Dict[str, float]]:
        profitability = self._profitability_ratios(income, balance)
        liquidity = self._liquidity_ratios(balance)
        leverage = self._leverage_ratios(income, balance)
        efficiency = self._efficiency_ratios(income, balance)
        valuation = self._valuation_ratios(income, balance, market)
        cashflow_ratios = self._cashflow_ratios(income, balance, cashflow, market)
        return {
            "profitability": profitability,
            "liquidity": liquidity,
            "leverage": leverage,
            "efficiency": efficiency,
            "valuation": valuation,
            "cashflow": cashflow_ratios,
        }

    def _profitability_ratios(self, income: Dict, balance: Dict) -> Dict[str, float]:
        ni = income.get("net_income", 0)
        eq = balance.get("shareholders_equity", 0)
        ta = balance.get("total_assets", 0)
        rev = income.get("revenue", 0)
        cogs = income.get("cost_of_goods_sold", 0)
        op = income.get("operating_income", 0)
        ebitda = income.get("ebitda", op)
        return {
            "roe": self.safe_divide(ni, eq),
            "roa": self.safe_divide(ni, ta),
            "gross_margin": self.safe_divide(rev - cogs, rev),
            "operating_margin": self.safe_divide(op, rev),
            "net_margin": self.safe_divide(ni, rev),
            "ebitda_margin": self.safe_divide(ebitda, rev),
            # 新增：资产报酬率(EBIT/总资产)
            "roic": self.safe_divide(income.get("ebit", op), ta),
        }

    def _liquidity_ratios(self, balance: Dict) -> Dict[str, float]:
        ca = balance.get("current_assets", 0)
        cl = balance.get("current_liabilities", 0)
        inv = balance.get("inventory", 0)
        cash = balance.get("cash_and_equivalents", 0)
        return {
            "current_ratio": self.safe_divide(ca, cl),
            "quick_ratio": self.safe_divide(ca - inv, cl),
            "cash_ratio": self.safe_divide(cash, cl),
            "working_capital": ca - cl,
            # 新增：营运资金比率
            "working_capital_ratio": self.safe_divide(ca - cl, balance.get("total_assets", 1)),
        }

    def _leverage_ratios(self, income: Dict, balance: Dict) -> Dict[str, float]:
        debt = balance.get("total_debt", 0)
        eq = balance.get("shareholders_equity", 0)
        ta = balance.get("total_assets", 0)
        ebit = income.get("ebit", 0)
        int_exp = income.get("interest_expense", 0)
        return {
            "debt_to_equity": self.safe_divide(debt, eq),
            "debt_to_assets": self.safe_divide(debt, ta),
            "equity_multiplier": self.safe_divide(ta, eq),
            "interest_coverage": self.safe_divide(ebit, int_exp),
            # 新增：固定费用保障倍数（简化）
            "fixed_charge_coverage": self.safe_divide(ebit + int_exp, int_exp),
        }

    def _efficiency_ratios(self, income: Dict, balance: Dict) -> Dict[str, float]:
        rev = income.get("revenue", 0)
        ta = balance.get("total_assets", 0)
        cogs = income.get("cost_of_goods_sold", 0)
        ar = balance.get("accounts_receivable", 0)
        inv = balance.get("inventory", 0)
        ap = balance.get("accounts_payable", 0)
        ratios = {
            "asset_turnover": self.safe_divide(rev, ta),
            "inventory_turnover": self.safe_divide(cogs, inv) if inv else 0,
            "receivables_turnover": self.safe_divide(rev, ar) if ar else 0,
            "payables_turnover": self.safe_divide(cogs, ap) if ap else 0,
        }
        # 天数计算
        ratios["days_sales_outstanding"] = 365 / ratios["receivables_turnover"] if ratios["receivables_turnover"] > 0 else 0
        ratios["days_inventory_outstanding"] = 365 / ratios["inventory_turnover"] if ratios["inventory_turnover"] > 0 else 0
        ratios["days_payables_outstanding"] = 365 / ratios["payables_turnover"] if ratios["payables_turnover"] > 0 else 0
        ratios["cash_conversion_cycle"] = ratios["days_sales_outstanding"] + ratios["days_inventory_outstanding"] - ratios["days_payables_outstanding"]
        return ratios

    def _valuation_ratios(self, income: Dict, balance: Dict, market: Dict) -> Dict[str, float]:
        sp = market.get("share_price", 0)
        so = market.get("shares_outstanding", 1)
        mc = sp * so
        ni = income.get("net_income", 0)
        rev = income.get("revenue", 0)
        ebitda = income.get("ebitda", income.get("operating_income", 0))
        bv = balance.get("shareholders_equity", 0)
        debt = balance.get("total_debt", 0)
        cash = balance.get("cash_and_equivalents", 0)
        ev = mc + debt - cash
        div = market.get("dividends", 0)
        eps = self.safe_divide(ni, so)
        return {
            "eps": eps,
            "pe_ratio": self.safe_divide(sp, eps) if eps != 0 else 0,
            "pb_ratio": self.safe_divide(sp, self.safe_divide(bv, so)) if bv > 0 else 0,
            "ps_ratio": self.safe_divide(mc, rev) if rev > 0 else 0,
            "ev_to_ebitda": self.safe_divide(ev, ebitda) if ebitda > 0 else 0,
            "dividend_yield": self.safe_divide(div, sp) if sp > 0 else 0,
            "peg_ratio": 0,  # 需earnings_growth_rate，在advanced中计算
        }

    # ---------- 新增：现金流与投资指标 ----------
    def _cashflow_ratios(self, income: Dict, balance: Dict, cashflow: Dict, market: Dict) -> Dict[str, float]:
        ocf = cashflow.get("operating_cashflow", 0)
        capex = cashflow.get("capital_expenditures", 0)
        fcf = ocf - capex
        rev = income.get("revenue", 0)
        ebitda = income.get("ebitda", 0)
        ni = income.get("net_income", 0)
        sp = market.get("share_price", 0)
        so = market.get("shares_outstanding", 1)
        mc = sp * so

        return {
            "capital_expenditure": capex,
            "free_cash_flow": fcf,
            "capex_to_revenue": self.safe_divide(capex, rev),
            "capex_to_ebitda": self.safe_divide(capex, ebitda) if ebitda != 0 else 0,
            "capex_to_operating_cf": self.safe_divide(capex, ocf) if ocf != 0 else 0,
            "fcf_margin": self.safe_divide(fcf, rev),
            "fcf_yield": self.safe_divide(fcf, mc) if mc != 0 else 0,
            "operating_cf_margin": self.safe_divide(ocf, rev),
            "fcf_to_net_income": self.safe_divide(fcf, ni) if ni != 0 else 0,
        }

    # ---------- 高级指标计算 ----------
    # ==================== 修复2: _calculate_advanced_metrics（完整替换） ====================
    def _calculate_advanced_metrics(self, income: Dict, balance: Dict, market: Dict, base_ratios: Dict) -> Dict[str, Any]:
        advanced = {}

        # 1. 杜邦分析（三因素）
        roe = base_ratios["profitability"]["roe"]
        net_margin = base_ratios["profitability"]["net_margin"]
        asset_turnover = base_ratios["efficiency"]["asset_turnover"]
        equity_multiplier = base_ratios["leverage"]["equity_multiplier"]

        dupont = {
            "roe": roe,
            "net_margin": net_margin,
            "asset_turnover": asset_turnover,
            "equity_multiplier": equity_multiplier,
            "decomposition": f"{net_margin:.2%} × {asset_turnover:.2f} × {equity_multiplier:.2f} = {roe:.2%}"
        }
        advanced["dupont_analysis"] = dupont

        # 2. 可持续增长率（修正：使用 EPS 计算股息支付率）
        eps = base_ratios["valuation"]["eps"]
        dividend_per_share = market.get("dividends", 0)
        if eps > 0:
            payout_ratio = self.safe_divide(dividend_per_share, eps)
        else:
            payout_ratio = 0
        retention_ratio = 1 - payout_ratio
        sustainable_growth = roe * retention_ratio
        advanced["sustainable_growth_rate"] = sustainable_growth

        # 3. Altman Z-Score（适用于制造业）
        # Z = 1.2X1 + 1.4X2 + 3.3X3 + 0.6X4 + 1.0X5
        ta = balance.get("total_assets", 1)
        # X1 = 营运资本 / 总资产
        wc = balance.get("current_assets", 0) - balance.get("current_liabilities", 0)
        x1 = self.safe_divide(wc, ta)
        # X2 = 留存收益 / 总资产
        re = balance.get("retained_earnings", 0)
        x2 = self.safe_divide(re, ta)
        # X3 = EBIT / 总资产
        ebit = income.get("ebit", income.get("operating_income", 0))
        x3 = self.safe_divide(ebit, ta)
        # X4 = 权益市值 / 负债账面价值
        market_cap = market.get("share_price", 0) * market.get("shares_outstanding", 1)
        total_liabilities = balance.get("total_liabilities", 0) or (ta - balance.get("shareholders_equity", 0))
        x4 = self.safe_divide(market_cap, total_liabilities)
        # X5 = 销售额 / 总资产
        sales = income.get("revenue", 0)
        x5 = self.safe_divide(sales, ta)

        z_score = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5
        advanced["altman_z_score"] = z_score
        # Z''-Score（适用于非制造业/新兴市场）
        z_prime = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
        advanced["altman_z_prime_score"] = z_prime

        # Z-Score 评级
        if z_score > 2.99:
            z_rating = "安全区"
        elif z_score > 1.81:
            z_rating = "灰色区"
        else:
            z_rating = "危险区"
        advanced["z_score_rating"] = z_rating

        # 4. PEG比率（需盈利增长率）
        eps_growth = market.get("earnings_growth_rate", 0)
        pe = base_ratios["valuation"]["pe_ratio"]
        if eps_growth > 0 and pe > 0:
            advanced["peg_ratio"] = self.safe_divide(pe, eps_growth * 100)
        else:
            advanced["peg_ratio"] = 0

        return advanced

    # ---------- 趋势分析 ----------
    def _calculate_trends(self, hist_data: Dict, industry: str) -> Dict[str, Any]:
        """计算多年财务趋势"""
        trends = {}
        inc_list = hist_data.get("income_statements", [])
        bal_list = hist_data.get("balance_sheets", [])

        if len(inc_list) < 2:
            return trends

        # 提取最近3年（或全部）的收入、净利润、总资产等
        revenues = []
        net_incomes = []
        total_assets = []
        years = []

        for i, inc in enumerate(inc_list):
            if i >= 3:  # 最多3年
                break
            revenues.append(self._to_float(inc.get("totalRevenue")))
            net_incomes.append(self._to_float(inc.get("netIncome")))
            # 年份从财报日期提取
            date_str = inc.get("fiscalDateEnding", "")
            year = date_str[:4] if len(date_str) >= 4 else f"Y{len(inc_list)-i}"
            years.append(year)

        for i, bal in enumerate(bal_list):
            if i >= 3:
                break
            total_assets.append(self._to_float(bal.get("totalAssets")))

        # 计算复合年增长率（CAGR）
        def cagr(series):
            if len(series) >= 2 and series[-1] > 0 and series[0] > 0:
                n = len(series) - 1
                return (series[0] / series[-1]) ** (1 / n) - 1
            return 0

        trends["revenue_cagr"] = cagr(revenues)
        trends["net_income_cagr"] = cagr(net_incomes)
        trends["assets_cagr"] = cagr(total_assets)

        # 各年比率简单列表（如需详细可计算每年比率）
        trends["years"] = years
        trends["revenues"] = revenues
        trends["net_incomes"] = net_incomes

        return trends

    # ---------- 格式化输出（原方法，略作扩展）----------
    def _format_ratios(self, ratios: Dict[str, float], category: str) -> Dict[str, Union[str, float]]:
        """格式化比率显示"""
        formatted = {}
        format_rules = self._get_format_rules()

        for ratio_name, value in ratios.items():
            if ratio_name in format_rules.get(category, {}):
                fmt_type, decimals = format_rules[category][ratio_name]
                if fmt_type == "percentage":
                    formatted[ratio_name] = f"{value * 100:.{decimals}f}%"
                elif fmt_type == "times":
                    formatted[ratio_name] = f"{value:.{decimals}f}x"
                elif fmt_type == "days":
                    formatted[ratio_name] = f"{value:.{decimals}f} days"
                elif fmt_type == "currency":
                    formatted[ratio_name] = f"${value:,.{decimals}f}"
                elif fmt_type == "decimal":
                    formatted[ratio_name] = f"{value:.{decimals}f}"
                else:
                    formatted[ratio_name] = value
            else:
                formatted[ratio_name] = value
        return formatted

    def _get_format_rules(self) -> Dict:
        return {
            "profitability": {
                "roe": ("percentage", 4), "roa": ("percentage", 4),
                "gross_margin": ("percentage", 4), "operating_margin": ("percentage", 4),
                "net_margin": ("percentage", 4), "ebitda_margin": ("percentage", 4),
                "roic": ("percentage", 4),
            },
            "liquidity": {
                "current_ratio": ("times", 2), "quick_ratio": ("times", 2),
                "cash_ratio": ("times", 2), "working_capital": ("currency", 0),
                "working_capital_ratio": ("percentage", 2),
            },
            "leverage": {
                "debt_to_equity": ("times", 2), "debt_to_assets": ("percentage", 4),
                "equity_multiplier": ("times", 2), "interest_coverage": ("times", 2),
                "fixed_charge_coverage": ("times", 2),
            },
            "efficiency": {
                "asset_turnover": ("times", 2), "inventory_turnover": ("times", 2),
                "receivables_turnover": ("times", 2), "payables_turnover": ("times", 2),
                "days_sales_outstanding": ("days", 1), "days_inventory_outstanding": ("days", 1),
                "days_payables_outstanding": ("days", 1), "cash_conversion_cycle": ("days", 1),
            },
            "valuation": {
                "eps": ("currency", 2), "pe_ratio": ("times", 2),
                "pb_ratio": ("times", 2), "ps_ratio": ("times", 2),
                "ev_to_ebitda": ("times", 2), "dividend_yield": ("percentage", 2),
                "peg_ratio": ("decimal", 2),
            },
            "cashflow": {
                "capital_expenditure": ("currency", 0),
                "free_cash_flow": ("currency", 0),
                "capex_to_revenue": ("percentage", 2),
                "capex_to_ebitda": ("percentage", 2),
                "capex_to_operating_cf": ("percentage", 2),
                "fcf_margin": ("percentage", 2),
                "fcf_yield": ("percentage", 2),
                "operating_cf_margin": ("percentage", 2),
                "fcf_to_net_income": ("decimal", 2),
            },
            "advanced": {
                "sustainable_growth_rate": ("percentage", 2),
                "altman_z_score": ("decimal", 2), "altman_z_prime_score": ("decimal", 2),
                "peg_ratio": ("decimal", 2),
            }
        }

    # ---------- 行业基准加载（增强版）----------
    def _load_industry_benchmarks(self) -> Dict[str, Dict[str, Dict[str, float]]]:
        """加载更丰富的行业基准数据"""
        benchmarks = {
            "technology": {
                "current_ratio": {"excellent": 2.5, "good": 1.8, "acceptable": 1.2, "poor": 1.0},
                "debt_to_equity": {"excellent": 0.3, "good": 0.5, "acceptable": 1.0, "poor": 2.0},
                "roe": {"excellent": 0.25, "good": 0.18, "acceptable": 0.12, "poor": 0.08},
                "gross_margin": {"excellent": 0.70, "good": 0.50, "acceptable": 0.35, "poor": 0.20},
                "pe_ratio": {"undervalued": 15, "fair": 25, "growth": 35, "expensive": 50},
                "altman_z_score": {"safe": 3.0, "grey": 1.8, "distress": 1.0},
            },
            "retail": {
                "current_ratio": {"excellent": 2.0, "good": 1.5, "acceptable": 1.0, "poor": 0.8},
                "debt_to_equity": {"excellent": 0.5, "good": 0.8, "acceptable": 1.5, "poor": 2.5},
                "roe": {"excellent": 0.20, "good": 0.15, "acceptable": 0.10, "poor": 0.05},
                "gross_margin": {"excellent": 0.40, "good": 0.30, "acceptable": 0.20, "poor": 0.10},
                "pe_ratio": {"undervalued": 12, "fair": 18, "growth": 25, "expensive": 35},
            },
            "manufacturing": {
                "current_ratio": {"excellent": 2.2, "good": 1.7, "acceptable": 1.3, "poor": 1.0},
                "debt_to_equity": {"excellent": 0.4, "good": 0.7, "acceptable": 1.2, "poor": 2.0},
                "roe": {"excellent": 0.18, "good": 0.14, "acceptable": 0.10, "poor": 0.06},
                "gross_margin": {"excellent": 0.35, "good": 0.25, "acceptable": 0.18, "poor": 0.12},
                "pe_ratio": {"undervalued": 14, "fair": 20, "growth": 28, "expensive": 40},
            },
            "healthcare": {
                "current_ratio": {"excellent": 2.3, "good": 1.8, "acceptable": 1.4, "poor": 1.0},
                "debt_to_equity": {"excellent": 0.3, "good": 0.6, "acceptable": 1.0, "poor": 1.8},
                "roe": {"excellent": 0.22, "good": 0.16, "acceptable": 0.11, "poor": 0.07},
                "gross_margin": {"excellent": 0.65, "good": 0.45, "acceptable": 0.30, "poor": 0.20},
                "pe_ratio": {"undervalued": 18, "fair": 28, "growth": 40, "expensive": 55},
            },
            "financial": {
                "current_ratio": {"excellent": 1.5, "good": 1.2, "acceptable": 1.0, "poor": 0.8},
                "debt_to_equity": {"excellent": 1.0, "good": 2.0, "acceptable": 4.0, "poor": 6.0},
                "roe": {"excellent": 0.15, "good": 0.12, "acceptable": 0.08, "poor": 0.05},
                "pe_ratio": {"undervalued": 10, "fair": 15, "growth": 20, "expensive": 30},
            },
            "energy": {
                "current_ratio": {"excellent": 1.8, "good": 1.3, "acceptable": 1.0, "poor": 0.7},
                "debt_to_equity": {"excellent": 0.4, "good": 0.7, "acceptable": 1.2, "poor": 2.0},
                "roe": {"excellent": 0.15, "good": 0.12, "acceptable": 0.08, "poor": 0.04},
                "gross_margin": {"excellent": 0.45, "good": 0.35, "acceptable": 0.25, "poor": 0.15},
                "pe_ratio": {"undervalued": 12, "fair": 18, "growth": 25, "expensive": 35},
            },
            "general": {
                "current_ratio": {"excellent": 2.0, "good": 1.5, "acceptable": 1.0, "poor": 0.8},
                "debt_to_equity": {"excellent": 0.5, "good": 1.0, "acceptable": 1.5, "poor": 2.5},
                "roe": {"excellent": 0.20, "good": 0.15, "acceptable": 0.10, "poor": 0.05},
                "gross_margin": {"excellent": 0.40, "good": 0.30, "acceptable": 0.20, "poor": 0.10},
                "pe_ratio": {"undervalued": 15, "fair": 22, "growth": 30, "expensive": 45},
            }
        }
        return benchmarks

    # ---------- 解释与评级（原方法 + 高级指标）----------
    def _interpret_all_ratios(self, ratios: Dict[str, Dict[str, float]], industry: str) -> Dict[str, Dict[str, Any]]:
        interpretations = {}
        benchmarks = self.industry_benchmarks.get(industry, self.industry_benchmarks["general"])

        for category, cat_ratios in ratios.items():
            interpretations[category] = {}
            for ratio_name, value in cat_ratios.items():
                if ratio_name in benchmarks:
                    interp = self._interpret_single_ratio(ratio_name, value, benchmarks[ratio_name])
                    interpretations[category][ratio_name] = interp
        return interpretations

    def _interpret_single_ratio(self, ratio_name: str, value: float, benchmark: Dict[str, float]) -> Dict[str, Any]:
        """改进的解释函数，支持Z-Score等特殊判断"""
        interpretation = {
            "value": value,
            "rating": "N/A",
            "message": "",
            "benchmark": benchmark,
            "recommendation": ""
        }

        # 根据比率类型选择判断逻辑
        if ratio_name in ["current_ratio", "quick_ratio", "cash_ratio", "roe", "roa", "roic",
                          "gross_margin", "operating_margin", "net_margin", "ebitda_margin",
                          "interest_coverage", "fixed_charge_coverage", "asset_turnover"]:
            # 越高越好
            if value >= benchmark.get("excellent", 0):
                interpretation["rating"] = "优秀"
                interpretation["message"] = f"{ratio_name} 显著高于行业优秀标准"
            elif value >= benchmark.get("good", 0):
                interpretation["rating"] = "良好"
                interpretation["message"] = f"{ratio_name} 高于行业良好标准"
            elif value >= benchmark.get("acceptable", 0):
                interpretation["rating"] = "一般"
                interpretation["message"] = f"{ratio_name} 达到行业平均水平"
            else:
                interpretation["rating"] = "较差"
                interpretation["message"] = f"{ratio_name} 低于行业平均水平"

        elif ratio_name in ["debt_to_equity", "debt_to_assets"]:
            # 越低越好
            if value <= benchmark.get("excellent", 0):
                interpretation["rating"] = "优秀"
                interpretation["message"] = "杠杆水平非常保守"
            elif value <= benchmark.get("good", 0):
                interpretation["rating"] = "良好"
                interpretation["message"] = "杠杆水平适中"
            elif value <= benchmark.get("acceptable", 0):
                interpretation["rating"] = "一般"
                interpretation["message"] = "杠杆水平偏高"
            else:
                interpretation["rating"] = "较差"
                interpretation["message"] = "杠杆水平过高，存在风险"

        elif ratio_name == "pe_ratio":
            if value <= 0:
                interpretation["rating"] = "N/A"
                interpretation["message"] = "负市盈率，通常表示亏损"
            elif value < benchmark.get("undervalued", 0):
                interpretation["rating"] = "低估"
                interpretation["message"] = "估值低于行业平均水平，可能存在投资机会"
            elif value < benchmark.get("fair", 0):
                interpretation["rating"] = "合理"
                interpretation["message"] = "估值处于合理区间"
            elif value < benchmark.get("growth", 0):
                interpretation["rating"] = "成长溢价"
                interpretation["message"] = "估值偏高，反映市场对成长性的预期"
            else:
                interpretation["rating"] = "高估"
                interpretation["message"] = "估值显著高于行业水平"

        interpretation["recommendation"] = self._generate_recommendation(ratio_name, interpretation["rating"])
        return interpretation

    def _generate_recommendation(self, ratio_name: str, rating: str) -> str:
        rec_map = {
            "current_ratio": {
                "优秀": "继续保持良好的流动性管理",
                "良好": "维持当前流动性水平",
                "一般": "关注流动性管理，考虑增加短期资产",
                "较差": "需要改善流动性状况，减少短期负债或增加流动资产"
            },
            "debt_to_equity": {
                "优秀": "杠杆水平保守，可考虑适度增加债务融资",
                "良好": "保持当前的资本结构",
                "一般": "关注债务水平，考虑降低负债",
                "较差": "高杠杆风险，急需降低负债水平"
            },
            "roe": {
                "优秀": "优秀的股东回报，继续保持",
                "良好": "良好的盈利能力，可寻找提升空间",
                "一般": "需要提升资产使用效率和盈利能力",
                "较差": "盈利能力不足，需要深入分析原因"
            },
            "pe_ratio": {
                "低估": "可能被市场低估，值得进一步分析",
                "合理": "估值合理，反映公司基本面",
                "成长溢价": "高估值需要高成长支撑",
                "高估": "估值偏高，注意风险"
            }
        }
        if ratio_name in rec_map and rating in rec_map[ratio_name]:
            return rec_map[ratio_name][rating]
        return "继续监控该指标"

    def _interpret_advanced(self, advanced: Dict, industry: str) -> Dict[str, Any]:
        """高级指标解释"""
        interp = {}
        if "altman_z_score" in advanced:
            z = advanced["altman_z_score"]
            if z > 2.99:
                rating = "安全"
                msg = "破产风险极低"
            elif z > 1.81:
                rating = "灰色"
                msg = "存在一定破产风险，需谨慎"
            else:
                rating = "危险"
                msg = "破产风险很高"
            interp["altman_z_score"] = {
                "value": z,
                "rating": rating,
                "message": f"Z-Score: {z:.2f}，{msg}",
                "benchmark": {"safe": 3.0, "grey": 1.8, "distress": 1.0}
            }

        if "sustainable_growth_rate" in advanced:
            sgr = advanced["sustainable_growth_rate"]
            interp["sustainable_growth_rate"] = {
                "value": sgr,
                "rating": "较高" if sgr > 0.15 else "中等" if sgr > 0.08 else "较低",
                "message": f"可持续增长率 {sgr:.2%}，表示在不改变资本结构下可实现的最大增长",
            }
        return interp

    # ---------- 加权财务健康评分（增强版）----------
    def _calculate_weighted_health_score(self, ratios: Dict, advanced: Dict,
                                         interpretations: Dict, industry: str) -> Dict[str, Any]:
        """加权综合评分，返回总分及各分项得分"""
        # 如果没有解释数据，先计算
        if not interpretations:
            interpretations = self._interpret_all_ratios(ratios, industry)

        # 评分映射
        score_map = {"优秀": 100, "良好": 75, "一般": 50, "较差": 25,
                     "低估": 80, "合理": 70, "成长溢价": 50, "高估": 30, "安全": 90, "灰色": 50, "危险": 20, "N/A": 40}

        # 分项得分初始化
        category_scores = {cat: [] for cat in self.health_weights.keys()}
        category_scores["advanced"] = []  # 高级指标单独加分项

        # 收集各指标评分
        for category, cat_interp in interpretations.items():
            if category in self.health_weights:
                for ratio_name, interp in cat_interp.items():
                    rating = interp.get("rating", "一般")
                    score = score_map.get(rating, 50)
                    category_scores[category].append(score)

        # 高级指标（Z-Score等）作为额外加分
        if advanced:
            if "altman_z_score" in advanced:
                z = advanced["altman_z_score"]
                if z > 2.99:
                    category_scores["advanced"].append(90)
                elif z > 1.81:
                    category_scores["advanced"].append(60)
                else:
                    category_scores["advanced"].append(30)
            if "sustainable_growth_rate" in advanced:
                sgr = advanced["sustainable_growth_rate"]
                if sgr > 0.15:
                    category_scores["advanced"].append(90)
                elif sgr > 0.08:
                    category_scores["advanced"].append(70)
                else:
                    category_scores["advanced"].append(40)

        # 计算各分类平均分
        weighted_sum = 0
        detail = {}

        for category, weight in self.health_weights.items():
            scores = category_scores.get(category, [])
            if scores:
                avg_score = sum(scores) / len(scores)
            else:
                avg_score = 50  # 默认分
            detail[category] = {
                "score": round(avg_score, 1),
                "weight": weight,
                "weighted_score": round(avg_score * weight, 1)
            }
            weighted_sum += avg_score * weight

        # 高级指标额外加分（最多10分）
        if category_scores["advanced"]:
            adv_avg = sum(category_scores["advanced"]) / len(category_scores["advanced"])
            adv_contribution = adv_avg * 0.1  # 额外10%权重
            weighted_sum = weighted_sum * 0.9 + adv_contribution
            detail["advanced"] = {
                "score": round(adv_avg, 1),
                "weight": 0.1,
                "weighted_score": round(adv_contribution, 1)
            }

        total_score = weighted_sum

        # 评级
        if total_score >= 80:
            rating = "非常健康"
            message = "财务状况非常健康，各项指标表现优秀"
        elif total_score >= 65:
            rating = "健康"
            message = "财务状况健康，大部分指标良好"
        elif total_score >= 50:
            rating = "一般"
            message = "财务状况一般，存在部分薄弱环节"
        elif total_score >= 35:
            rating = "较差"
            message = "财务状况较差，多项指标需关注"
        else:
            rating = "危险"
            message = "财务状况危险，可能面临偿债或经营危机"

        return {
            "score": round(total_score, 1),
            "rating": rating,
            "message": message,
            "details": detail
        }

    # ---------- 总结报告生成（增强版）----------
    def _generate_enhanced_summary(self, ratios: Dict, advanced: Dict,
                                   trend: Dict, health: Dict, industry: str) -> str:
        """生成更详细的总结报告"""
        lines = []

        # 核心指标
        prof = ratios.get("profitability", {})
        liq = ratios.get("liquidity", {})
        lev = ratios.get("leverage", {})
        eff = ratios.get("efficiency", {})
        val = ratios.get("valuation", {})

        if prof.get("roe"):
            lines.append(f"ROE: {prof['roe']*100:.1f}%")
        if liq.get("current_ratio"):
            status = "充足" if liq["current_ratio"] > 1.5 else "适中" if liq["current_ratio"] > 1.0 else "紧张"
            lines.append(f"流动比率: {liq['current_ratio']:.2f} ({status})")
        if lev.get("debt_to_equity"):
            risk = "低" if lev["debt_to_equity"] < 0.5 else "中" if lev["debt_to_equity"] < 1.0 else "高"
            lines.append(f"负债权益比: {lev['debt_to_equity']:.2f} ({risk}杠杆)")
        if eff.get("asset_turnover"):
            eff_level = "高效" if eff["asset_turnover"] > 0.8 else "适中" if eff["asset_turnover"] > 0.5 else "偏低"
            lines.append(f"资产周转率: {eff['asset_turnover']:.2f} ({eff_level})")
        if val.get("pe_ratio"):
            val_status = "低估" if val["pe_ratio"] < 15 else "合理" if val["pe_ratio"] < 25 else "高估"
            lines.append(f"市盈率: {val['pe_ratio']:.1f}x ({val_status})")

        # 高级指标摘要
        if advanced:
            if "altman_z_score" in advanced:
                z = advanced["altman_z_score"]
                lines.append(f"Altman Z-Score: {z:.2f} ({advanced.get('z_score_rating', 'N/A')})")
            if "sustainable_growth_rate" in advanced:
                sgr = advanced["sustainable_growth_rate"]
                lines.append(f"可持续增长率: {sgr*100:.1f}%")

        # 趋势
        if trend:
            if "revenue_cagr" in trend:
                lines.append(f"近3年收入CAGR: {trend['revenue_cagr']*100:.1f}%")
            if "net_income_cagr" in trend:
                lines.append(f"近3年净利润CAGR: {trend['net_income_cagr']*100:.1f}%")

        # 健康评分
        if health:
            lines.append(f"财务健康评分: {health['score']} ({health['rating']})")

        # 行业
        lines.append(f"（基于{industry}行业基准）")

        return " | ".join(lines)

    # ---------- 健康检查（保留）----------
    async def health_check(self) -> str:
        return "available"