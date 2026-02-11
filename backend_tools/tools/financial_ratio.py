"""
财务比率分析工具 - 整合版
将calculate_ratios.py和interpret_ratios.py的核心功能整合
"""

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Union
import numpy as np
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class FinancialRatioAnalysisTool:
    """财务比率分析与解释工具"""
    
    name = "financial_ratio_analysis"
    description = "财务比率分析工具，计算关键财务指标并进行行业对比分析"
    version = "2.0.0"
    
    class InputSchema(BaseModel):
        """输入参数定义"""
        financial_data: Dict[str, Any] = Field(
            ...,
            description="财务数据，必须包含income_statement和balance_sheet"
        )
        industry: str = Field(
            default="general",
            description="行业分类，用于基准对比。可选：technology, retail, manufacturing, healthcare, financial"
        )
        include_interpretation: bool = Field(
            default=True,
            description="是否包含行业解释和评级"
        )
        include_summary: bool = Field(
            default=True,
            description="是否生成总结报告"
        )
        format_output: bool = Field(
            default=True,
            description="是否格式化输出（百分比、倍数等）"
        )
        
        class Config:
            schema_extra = {
                "example": {
                    "financial_data": {
                        "income_statement": {
                            "revenue": 1000000,
                            "cost_of_goods_sold": 600000,
                            "operating_income": 200000,
                            "ebit": 180000,
                            "interest_expense": 20000,
                            "net_income": 150000
                        },
                        "balance_sheet": {
                            "total_assets": 2000000,
                            "current_assets": 800000,
                            "cash_and_equivalents": 200000,
                            "accounts_receivable": 150000,
                            "inventory": 250000,
                            "current_liabilities": 400000,
                            "total_debt": 500000,
                            "shareholders_equity": 1500000
                        },
                        "market_data": {
                            "share_price": 50,
                            "shares_outstanding": 100000
                        }
                    },
                    "industry": "technology"
                }
            }
    
    input_schema = InputSchema
    
    def __init__(self):
        """初始化工具"""
        self.industry_benchmarks = self._load_industry_benchmarks()
        logger.info(f"初始化财务比率分析工具 v{self.version}")
    
    @staticmethod
    def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
        """安全除法，避免除零错误"""
        if denominator == 0 or denominator is None:
            return default
        return numerator / denominator
    
    async def execute(self, parameters: InputSchema) -> Dict[str, Any]:
        """执行财务比率分析"""
        start_time = datetime.now()
        
        try:
            # 提取财务数据
            income = parameters.financial_data.get("income_statement", {})
            balance = parameters.financial_data.get("balance_sheet", {})
            market = parameters.financial_data.get("market_data", {})
            cash_flow = parameters.financial_data.get("cash_flow", {})
            
            # 1. 计算所有比率
            profitability = self._calculate_profitability_ratios(income, balance)
            liquidity = self._calculate_liquidity_ratios(balance)
            leverage = self._calculate_leverage_ratios(income, balance)
            efficiency = self._calculate_efficiency_ratios(income, balance)
            valuation = self._calculate_valuation_ratios(income, balance, market)
            
            all_ratios = {
                "profitability": profitability,
                "liquidity": liquidity,
                "leverage": leverage,
                "efficiency": efficiency,
                "valuation": valuation
            }
            
            # 2. 格式化输出
            formatted_ratios = {}
            if parameters.format_output:
                for category, ratios in all_ratios.items():
                    formatted_ratios[category] = self._format_ratios(ratios, category)
            
            # 3. 行业解释
            interpretations = {}
            if parameters.include_interpretation:
                interpretations = self._interpret_all_ratios(
                    all_ratios, 
                    parameters.industry
                )
            
            # 4. 总结报告
            summary = ""
            if parameters.include_summary:
                summary = self._generate_summary(all_ratios, parameters.industry)
            
            # 5. 健康评分
            health_score = self._calculate_health_score(all_ratios, parameters.industry)
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            result = {
                "success": True,
                "execution_time": execution_time,
                "calculated_ratios": all_ratios,
                "formatted_ratios": formatted_ratios if parameters.format_output else all_ratios,
                "interpretations": interpretations if parameters.include_interpretation else None,
                "summary": summary if parameters.include_summary else None,
                "financial_health": {
                    "score": health_score["score"],
                    "rating": health_score["rating"],
                    "message": health_score["message"]
                },
                "metadata": {
                    "industry": parameters.industry,
                    "input_summary": {
                        "revenue": income.get("revenue", 0),
                        "net_income": income.get("net_income", 0),
                        "total_assets": balance.get("total_assets", 0),
                        "shareholders_equity": balance.get("shareholders_equity", 0)
                    },
                    "timestamp": datetime.now().isoformat()
                }
            }
            
            logger.info(f"财务比率分析完成，耗时: {execution_time:.2f}秒")
            return result
            
        except Exception as e:
            logger.error(f"财务比率分析失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"财务比率分析失败: {str(e)}",
                "execution_time": (datetime.now() - start_time).total_seconds(),
                "suggestion": "请检查输入数据格式和完整性"
            }
    
    def _calculate_profitability_ratios(self, income: Dict, balance: Dict) -> Dict[str, float]:
        """计算盈利能力比率"""
        ratios = {}
        
        net_income = income.get("net_income", 0)
        shareholders_equity = balance.get("shareholders_equity", 0)
        total_assets = balance.get("total_assets", 0)
        revenue = income.get("revenue", 0)
        
        # ROE (净资产收益率)
        ratios["roe"] = self.safe_divide(net_income, shareholders_equity)
        
        # ROA (总资产收益率)
        ratios["roa"] = self.safe_divide(net_income, total_assets)
        
        # 毛利率
        cogs = income.get("cost_of_goods_sold", 0)
        gross_profit = revenue - cogs
        ratios["gross_margin"] = self.safe_divide(gross_profit, revenue)
        
        # 营业利润率
        operating_income = income.get("operating_income", 0)
        ratios["operating_margin"] = self.safe_divide(operating_income, revenue)
        
        # 净利率
        ratios["net_margin"] = self.safe_divide(net_income, revenue)
        
        # EBITDA利润率
        ebitda = income.get("ebitda", operating_income)
        ratios["ebitda_margin"] = self.safe_divide(ebitda, revenue)
        
        return ratios
    
    def _calculate_liquidity_ratios(self, balance: Dict) -> Dict[str, float]:
        """计算流动性比率"""
        ratios = {}
        
        current_assets = balance.get("current_assets", 0)
        current_liabilities = balance.get("current_liabilities", 0)
        
        # 流动比率
        ratios["current_ratio"] = self.safe_divide(current_assets, current_liabilities)
        
        # 速动比率
        inventory = balance.get("inventory", 0)
        quick_assets = current_assets - inventory
        ratios["quick_ratio"] = self.safe_divide(quick_assets, current_liabilities)
        
        # 现金比率
        cash = balance.get("cash_and_equivalents", 0)
        ratios["cash_ratio"] = self.safe_divide(cash, current_liabilities)
        
        # 营运资本
        ratios["working_capital"] = current_assets - current_liabilities
        
        return ratios
    
    def _calculate_leverage_ratios(self, income: Dict, balance: Dict) -> Dict[str, float]:
        """计算杠杆比率"""
        ratios = {}
        
        total_debt = balance.get("total_debt", 0)
        shareholders_equity = balance.get("shareholders_equity", 0)
        total_assets = balance.get("total_assets", 0)
        
        # 负债权益比
        ratios["debt_to_equity"] = self.safe_divide(total_debt, shareholders_equity)
        
        # 负债资产比
        ratios["debt_to_assets"] = self.safe_divide(total_debt, total_assets)
        
        # 权益乘数
        ratios["equity_multiplier"] = self.safe_divide(total_assets, shareholders_equity)
        
        # 利息保障倍数
        ebit = income.get("ebit", income.get("operating_income", 0))
        interest_expense = income.get("interest_expense", 0)
        ratios["interest_coverage"] = self.safe_divide(ebit, interest_expense)
        
        # 债务保障倍数
        net_operating_income = income.get("operating_income", 0)
        total_debt_service = interest_expense + balance.get("current_portion_long_term_debt", 0)
        ratios["debt_service_coverage"] = self.safe_divide(net_operating_income, total_debt_service)
        
        return ratios
    
    def _calculate_efficiency_ratios(self, income: Dict, balance: Dict) -> Dict[str, float]:
        """计算效率比率"""
        ratios = {}
        
        revenue = income.get("revenue", 0)
        total_assets = balance.get("total_assets", 0)
        
        # 资产周转率
        ratios["asset_turnover"] = self.safe_divide(revenue, total_assets)
        
        # 存货周转率
        cogs = income.get("cost_of_goods_sold", 0)
        inventory = balance.get("inventory", 0)
        ratios["inventory_turnover"] = self.safe_divide(cogs, inventory)
        
        # 应收账款周转率
        accounts_receivable = balance.get("accounts_receivable", 0)
        ratios["receivables_turnover"] = self.safe_divide(revenue, accounts_receivable)
        
        # 应付账款周转率
        accounts_payable = balance.get("accounts_payable", 0)
        ratios["payables_turnover"] = self.safe_divide(cogs, accounts_payable)
        
        # 销售天数
        if ratios["receivables_turnover"] > 0:
            ratios["days_sales_outstanding"] = 365 / ratios["receivables_turnover"]
        else:
            ratios["days_sales_outstanding"] = 0
        
        # 存货天数
        if ratios["inventory_turnover"] > 0:
            ratios["days_inventory_outstanding"] = 365 / ratios["inventory_turnover"]
        else:
            ratios["days_inventory_outstanding"] = 0
        
        # 应付账款天数
        if ratios["payables_turnover"] > 0:
            ratios["days_payables_outstanding"] = 365 / ratios["payables_turnover"]
        else:
            ratios["days_payables_outstanding"] = 0
        
        # 现金转换周期
        ratios["cash_conversion_cycle"] = (
            ratios.get("days_sales_outstanding", 0) +
            ratios.get("days_inventory_outstanding", 0) -
            ratios.get("days_payables_outstanding", 0)
        )
        
        return ratios
    
    def _calculate_valuation_ratios(self, income: Dict, balance: Dict, market: Dict) -> Dict[str, float]:
        """计算估值比率"""
        ratios = {}
        
        share_price = market.get("share_price", 0)
        shares_outstanding = market.get("shares_outstanding", 1)
        market_cap = share_price * shares_outstanding
        
        net_income = income.get("net_income", 0)
        revenue = income.get("revenue", 0)
        ebitda = income.get("ebitda", income.get("operating_income", 0))
        
        # 每股收益
        ratios["eps"] = self.safe_divide(net_income, shares_outstanding)
        
        # 市盈率
        if ratios["eps"] != 0:
            ratios["pe_ratio"] = self.safe_divide(share_price, ratios["eps"])
        else:
            ratios["pe_ratio"] = 0
        
        # 市净率
        book_value = balance.get("shareholders_equity", 0)
        book_value_per_share = self.safe_divide(book_value, shares_outstanding)
        if book_value_per_share != 0:
            ratios["pb_ratio"] = self.safe_divide(share_price, book_value_per_share)
        else:
            ratios["pb_ratio"] = 0
        
        # 市销率
        ratios["ps_ratio"] = self.safe_divide(market_cap, revenue)
        
        # 企业价值/EBITDA
        total_debt = balance.get("total_debt", 0)
        cash = balance.get("cash_and_equivalents", 0)
        enterprise_value = market_cap + total_debt - cash
        ratios["ev_to_ebitda"] = self.safe_divide(enterprise_value, ebitda)
        
        # 股息收益率
        dividends = market.get("dividends", 0)
        ratios["dividend_yield"] = self.safe_divide(dividends, share_price)
        
        # PEG比率
        earnings_growth = market.get("earnings_growth_rate", 0)
        if earnings_growth > 0 and ratios["pe_ratio"] > 0:
            ratios["peg_ratio"] = self.safe_divide(ratios["pe_ratio"], earnings_growth * 100)
        
        return ratios
    
    def _format_ratios(self, ratios: Dict[str, float], category: str) -> Dict[str, Union[str, float]]:
        """格式化比率输出"""
        formatted = {}
        
        format_rules = {
            "profitability": {
                "roe": ("percentage", 4),
                "roa": ("percentage", 4),
                "gross_margin": ("percentage", 4),
                "operating_margin": ("percentage", 4),
                "net_margin": ("percentage", 4),
                "ebitda_margin": ("percentage", 4)
            },
            "liquidity": {
                "current_ratio": ("times", 2),
                "quick_ratio": ("times", 2),
                "cash_ratio": ("times", 2),
                "working_capital": ("currency", 0)
            },
            "leverage": {
                "debt_to_equity": ("times", 2),
                "debt_to_assets": ("percentage", 4),
                "equity_multiplier": ("times", 2),
                "interest_coverage": ("times", 2),
                "debt_service_coverage": ("times", 2)
            },
            "efficiency": {
                "asset_turnover": ("times", 2),
                "inventory_turnover": ("times", 2),
                "receivables_turnover": ("times", 2),
                "payables_turnover": ("times", 2),
                "days_sales_outstanding": ("days", 1),
                "days_inventory_outstanding": ("days", 1),
                "days_payables_outstanding": ("days", 1),
                "cash_conversion_cycle": ("days", 1)
            },
            "valuation": {
                "eps": ("currency", 2),
                "pe_ratio": ("times", 2),
                "pb_ratio": ("times", 2),
                "ps_ratio": ("times", 2),
                "ev_to_ebitda": ("times", 2),
                "dividend_yield": ("percentage", 2),
                "peg_ratio": ("decimal", 2)
            }
        }
        
        category_rules = format_rules.get(category, {})
        
        for ratio_name, value in ratios.items():
            if ratio_name in category_rules:
                format_type, decimals = category_rules[ratio_name]
                
                if format_type == "percentage":
                    formatted[ratio_name] = f"{value * 100:.{decimals}f}%"
                elif format_type == "times":
                    formatted[ratio_name] = f"{value:.{decimals}f}x"
                elif format_type == "days":
                    formatted[ratio_name] = f"{value:.{decimals}f} days"
                elif format_type == "currency":
                    formatted[ratio_name] = f"${value:,.{decimals}f}"
                elif format_type == "decimal":
                    formatted[ratio_name] = f"{value:.{decimals}f}"
                else:
                    formatted[ratio_name] = value
            else:
                formatted[ratio_name] = value
        
        return formatted
    
    def _load_industry_benchmarks(self) -> Dict[str, Dict[str, Dict[str, float]]]:
        """加载行业基准数据"""
        return {
            "technology": {
                "current_ratio": {"excellent": 2.5, "good": 1.8, "acceptable": 1.2, "poor": 1.0},
                "debt_to_equity": {"excellent": 0.3, "good": 0.5, "acceptable": 1.0, "poor": 2.0},
                "roe": {"excellent": 0.25, "good": 0.18, "acceptable": 0.12, "poor": 0.08},
                "gross_margin": {"excellent": 0.70, "good": 0.50, "acceptable": 0.35, "poor": 0.20},
                "pe_ratio": {"undervalued": 15, "fair": 25, "growth": 35, "expensive": 50},
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
            "general": {
                "current_ratio": {"excellent": 2.0, "good": 1.5, "acceptable": 1.0, "poor": 0.8},
                "debt_to_equity": {"excellent": 0.5, "good": 1.0, "acceptable": 1.5, "poor": 2.5},
                "roe": {"excellent": 0.20, "good": 0.15, "acceptable": 0.10, "poor": 0.05},
                "gross_margin": {"excellent": 0.40, "good": 0.30, "acceptable": 0.20, "poor": 0.10},
                "pe_ratio": {"undervalued": 15, "fair": 22, "growth": 30, "expensive": 45},
            }
        }
    
    def _interpret_all_ratios(self, ratios: Dict[str, Dict[str, float]], industry: str) -> Dict[str, Dict[str, Any]]:
        """解释所有比率"""
        interpretations = {}
        benchmarks = self.industry_benchmarks.get(industry, self.industry_benchmarks["general"])
        
        for category, category_ratios in ratios.items():
            interpretations[category] = {}
            for ratio_name, value in category_ratios.items():
                if ratio_name in benchmarks:
                    interpretation = self._interpret_single_ratio(ratio_name, value, benchmarks[ratio_name])
                    interpretations[category][ratio_name] = interpretation
        
        return interpretations
    
    def _interpret_single_ratio(self, ratio_name: str, value: float, benchmark: Dict[str, float]) -> Dict[str, Any]:
        """解释单个比率"""
        interpretation = {
            "value": value,
            "rating": "N/A",
            "message": "",
            "benchmark": benchmark,
            "recommendation": ""
        }
        
        # 判断逻辑
        if ratio_name in ["current_ratio", "quick_ratio", "cash_ratio", 
                         "roe", "roa", "gross_margin", "operating_margin", 
                         "net_margin", "interest_coverage", "debt_service_coverage"]:
            # 越高越好
            if value >= benchmark.get("excellent", 0):
                interpretation["rating"] = "优秀"
                interpretation["message"] = f"{ratio_name}显著高于行业优秀标准"
            elif value >= benchmark.get("good", 0):
                interpretation["rating"] = "良好"
                interpretation["message"] = f"{ratio_name}高于行业良好标准"
            elif value >= benchmark.get("acceptable", 0):
                interpretation["rating"] = "一般"
                interpretation["message"] = f"{ratio_name}达到行业平均水平"
            else:
                interpretation["rating"] = "较差"
                interpretation["message"] = f"{ratio_name}低于行业平均水平"
        
        elif ratio_name in ["debt_to_equity", "debt_to_assets"]:
            # 越低越好
            if value <= benchmark.get("excellent", 0):
                interpretation["rating"] = "优秀"
                interpretation["message"] = f"杠杆水平非常保守"
            elif value <= benchmark.get("good", 0):
                interpretation["rating"] = "良好"
                interpretation["message"] = f"杠杆水平适中"
            elif value <= benchmark.get("acceptable", 0):
                interpretation["rating"] = "一般"
                interpretation["message"] = f"杠杆水平偏高"
            else:
                interpretation["rating"] = "较差"
                interpretation["message"] = f"杠杆水平过高，存在风险"
        
        elif ratio_name == "pe_ratio":
            # 估值判断
            if value <= 0:
                interpretation["rating"] = "N/A"
                interpretation["message"] = "负市盈率，通常表示亏损"
            elif value < benchmark.get("undervalued", 0):
                interpretation["rating"] = "低估"
                interpretation["message"] = f"估值低于行业平均水平，可能存在投资机会"
            elif value < benchmark.get("fair", 0):
                interpretation["rating"] = "合理"
                interpretation["message"] = f"估值处于合理区间"
            elif value < benchmark.get("growth", 0):
                interpretation["rating"] = "成长溢价"
                interpretation["message"] = f"估值偏高，反映市场对成长性的预期"
            else:
                interpretation["rating"] = "高估"
                interpretation["message"] = f"估值显著高于行业水平"
        
        # 生成建议
        interpretation["recommendation"] = self._generate_recommendation(ratio_name, interpretation["rating"])
        
        return interpretation
    
    def _generate_recommendation(self, ratio_name: str, rating: str) -> str:
        """生成建议"""
        recommendations = {
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
        
        if ratio_name in recommendations and rating in recommendations[ratio_name]:
            return recommendations[ratio_name][rating]
        
        return "继续监控该指标"
    
    def _calculate_health_score(self, ratios: Dict[str, Dict[str, float]], industry: str) -> Dict[str, Any]:
        """计算财务健康评分"""
        score_mapping = {
            "优秀": 4,
            "良好": 3,
            "一般": 2,
            "较差": 1,
            "低估": 3,
            "合理": 3,
            "成长溢价": 2,
            "高估": 1,
            "N/A": 2
        }
        
        interpretations = self._interpret_all_ratios(ratios, industry)
        
        all_ratings = []
        for category in interpretations.values():
            for interpretation in category.values():
                all_ratings.append(interpretation["rating"])
        
        if not all_ratings:
            return {"score": 0, "rating": "未知", "message": "无法计算健康评分"}
        
        scores = [score_mapping.get(rating, 2) for rating in all_ratings]
        avg_score = sum(scores) / len(scores)
        
        if avg_score >= 3.5:
            rating = "非常健康"
            message = "财务状况非常健康，各方面表现优秀"
        elif avg_score >= 2.5:
            rating = "健康"
            message = "财务状况基本健康，部分指标有提升空间"
        elif avg_score >= 1.5:
            rating = "一般"
            message = "财务状况一般，需要注意多个指标"
        else:
            rating = "不健康"
            message = "财务状况不健康，需要重点关注"
        
        return {
            "score": round(avg_score, 2),
            "rating": rating,
            "message": message
        }
    
    def _generate_summary(self, ratios: Dict[str, Dict[str, float]], industry: str) -> str:
        """生成总结报告"""
        summary_parts = []
        
        # 盈利能力总结
        prof = ratios.get("profitability", {})
        if prof.get("roe", 0) > 0:
            roe_level = "优秀" if prof["roe"] > 0.15 else "良好" if prof["roe"] > 0.10 else "一般"
            summary_parts.append(f"净资产收益率(ROE)为{prof['roe']*100:.1f}%，处于{roe_level}水平。")
        
        # 流动性总结
        liq = ratios.get("liquidity", {})
        if liq.get("current_ratio", 0) > 0:
            liquidity_status = "充足" if liq["current_ratio"] > 1.5 else "适中" if liq["current_ratio"] > 1.0 else "紧张"
            summary_parts.append(f"流动比率为{liq['current_ratio']:.2f}，流动性{liquidity_status}。")
        
        # 杠杆总结
        lev = ratios.get("leverage", {})
        if lev.get("debt_to_equity", 0) >= 0:
            leverage_status = "低杠杆" if lev["debt_to_equity"] < 0.5 else "中杠杆" if lev["debt_to_equity"] < 1.0 else "高杠杆"
            summary_parts.append(f"负债权益比为{lev['debt_to_equity']:.2f}，属于{leverage_status}结构。")
        
        # 效率总结
        eff = ratios.get("efficiency", {})
        if eff.get("asset_turnover", 0) > 0:
            efficiency_status = "高效" if eff["asset_turnover"] > 0.8 else "适中" if eff["asset_turnover"] > 0.5 else "偏低"
            summary_parts.append(f"资产周转率为{eff['asset_turnover']:.2f}，资产使用效率{efficiency_status}。")
        
        # 估值总结
        val = ratios.get("valuation", {})
        if val.get("pe_ratio", 0) > 0:
            valuation_status = "低估" if val["pe_ratio"] < 15 else "合理" if val["pe_ratio"] < 25 else "高估"
            summary_parts.append(f"市盈率为{val['pe_ratio']:.1f}倍，估值{valuation_status}。")
        
        # 添加行业上下文
        if industry != "general":
            summary_parts.append(f"（基于{industry}行业基准）")
        
        return " ".join(summary_parts) if summary_parts else "无法生成总结报告"
    
    async def health_check(self) -> str:
        """健康检查"""
        return "available"