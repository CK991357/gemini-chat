#!/usr/bin/env python3
"""
财务报告生成工具 - 整合版
包含基础财务数据生成器（BaseFinancialsGenerator）和财务比率分析工具（FinancialRatioAnalysisTool）
以及对应的 Markdown 报告生成器。此工具可直接被后端调用，根据模式生成相应的报告文件并保存到会话工作区。
"""

import os
import json
import tempfile
import logging
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional, List, Union
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

# 配置日志
logger = logging.getLogger(__name__)

# ==================== 以下为 generate_base_financials.py 的完整内容 ====================

import json
from datetime import datetime
from typing import Dict, List, Any, Optional


class BaseFinancialsGenerator:
    """最终版基础财务数据生成器"""

    # 健康评分权重
    HEALTH_WEIGHTS = {
        "profitability": 0.30,  # 盈利能力
        "liquidity": 0.20,       # 流动性
        "leverage": 0.20,        # 杠杆
        "efficiency": 0.15,      # 效率
        "cashflow": 0.15,        # 现金流
    }

    def __init__(self,
                 income_json: Dict,
                 balance_json: Dict,
                 cashflow_json: Dict,
                 earnings_json: Dict,
                 company_name: Optional[str] = None,
                 symbol: Optional[str] = None,
                 industry: str = "general"):
        self.income_json = income_json
        self.balance_json = balance_json
        self.cashflow_json = cashflow_json
        self.earnings_json = earnings_json
        self.company_name = company_name or self._infer_company_name()
        self.symbol = symbol or self._infer_symbol()
        self.industry = industry

    # ---------- 辅助方法 ----------
    @staticmethod
    def _to_float(val) -> float:
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

    def _infer_company_name(self) -> str:
        symbol = self._infer_symbol()
        common_names = {
            "AAPL": "Apple Inc.",
            "MSFT": "Microsoft Corporation",
            "GOOGL": "Alphabet Inc.",
            "AMZN": "Amazon.com Inc.",
            "TSLA": "Tesla Inc.",
        }
        return common_names.get(symbol, f"{symbol} Inc.")

    def _infer_symbol(self) -> str:
        for js in [self.income_json, self.balance_json, self.cashflow_json, self.earnings_json]:
            if js and isinstance(js, dict) and "symbol" in js:
                return js["symbol"]
        return "UNKNOWN"

    @staticmethod
    def _safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
        if denominator == 0 or denominator is None:
            return default
        return numerator / denominator

    # ---------- 数据提取与对齐 ----------
    def _get_yearly_data(self) -> Dict[str, Dict[str, Any]]:
        """将四个 JSON 中的 annualReports 按年份对齐，返回字典 year -> {income, balance, cashflow, earnings}"""
        inc_reports = self.income_json.get("annualReports", [])
        bal_reports = self.balance_json.get("annualReports", [])
        cf_reports = self.cashflow_json.get("annualReports", [])
        earn_reports = self.earnings_json.get("annualEarnings", [])

        data_by_year = {}

        for rep in inc_reports:
            year = rep.get("fiscalDateEnding", "")[:4]
            if year:
                data_by_year.setdefault(year, {})["income"] = rep
        for rep in bal_reports:
            year = rep.get("fiscalDateEnding", "")[:4]
            if year:
                data_by_year.setdefault(year, {})["balance"] = rep
        for rep in cf_reports:
            year = rep.get("fiscalDateEnding", "")[:4]
            if year:
                data_by_year.setdefault(year, {})["cashflow"] = rep
        for rep in earn_reports:
            year = rep.get("fiscalDateEnding", "")[:4]
            if year:
                data_by_year.setdefault(year, {})["earnings"] = rep

        # 只保留至少包含利润表和资产负债表的年份
        filtered = {}
        for year, rec in data_by_year.items():
            if "income" in rec and "balance" in rec:
                filtered[year] = rec
        return filtered

    # ---------- 提取所有原始字段 ----------
    def _extract_all_fields(self, data: Dict[str, Any]) -> Dict[str, float]:
        """从单年数据中提取所有可用字段，返回扁平字典，并计算衍生指标"""
        inc = data.get("income", {})
        bal = data.get("balance", {})
        cf = data.get("cashflow", {})
        earn = data.get("earnings", {})

        fields = {}

        # 利润表字段
        income_fields = [
            "totalRevenue", "costOfRevenue", "grossProfit", "operatingIncome",
            "netIncome", "ebitda", "ebit", "interestExpense", "incomeTaxExpense",
            "researchAndDevelopment", "sellingGeneralAndAdministrative",
            "depreciationAndAmortization", "interestIncome"
        ]
        for f in income_fields:
            fields[f] = self._to_float(inc.get(f))

        # 资产负债表字段
        balance_fields = [
            "totalAssets", "totalLiabilities", "totalShareholderEquity",
            "totalCurrentAssets", "totalCurrentLiabilities",
            "cashAndCashEquivalentsAtCarryingValue", "inventory",
            "currentNetReceivables", "currentAccountsPayable",
            "shortTermDebt", "longTermDebt", "retainedEarnings",
            "propertyPlantEquipment", "intangibleAssets", "goodwill",
            "accumulatedDepreciationAmortizationPPE"
        ]
        for f in balance_fields:
            fields[f] = self._to_float(bal.get(f))

        # 现金流量表字段
        cashflow_fields = [
            "operatingCashflow", "capitalExpenditures",
            "cashflowFromInvestment", "cashflowFromFinancing",
            "dividendPayout", "proceedsFromRepurchaseOfEquity",
            "changeInCashAndCashEquivalents"
        ]
        for f in cashflow_fields:
            fields[f] = self._to_float(cf.get(f))

        # 盈利数据字段
        earnings_fields = [
            "reportedEPS"
        ]
        for f in earnings_fields:
            fields[f] = self._to_float(earn.get(f))

        # 计算衍生字段
        fields["total_debt"] = fields["shortTermDebt"] + fields["longTermDebt"]
        fields["working_capital"] = fields["totalCurrentAssets"] - fields["totalCurrentLiabilities"]
        fields["free_cash_flow"] = fields["operatingCashflow"] - fields["capitalExpenditures"]
        if fields["ebit"] == 0 and fields["operatingIncome"] != 0:
            fields["ebit"] = fields["operatingIncome"]

        # 新增指标：有效税率 = 所得税 / (净利润 + 所得税)
        ebt = fields["netIncome"] + fields["incomeTaxExpense"]
        fields["effective_tax_rate"] = self._safe_divide(fields["incomeTaxExpense"], ebt) if ebt != 0 else 0.0

        # 新增指标：EBITDA利润率
        fields["ebitda_margin"] = self._safe_divide(fields["ebitda"], fields["totalRevenue"])

        # 新增指标：资本支出/折旧
        fields["capex_to_depreciation"] = self._safe_divide(fields["capitalExpenditures"], fields["depreciationAndAmortization"])

        return fields

    def get_all_years_data(self) -> List[Dict[str, Any]]:
        """返回按年份升序排列的所有历史数据列表，每个元素包含 year 和所有字段"""
        yearly = self._get_yearly_data()
        years = sorted(yearly.keys())
        result = []
        for year in years:
            data = yearly[year]
            fields = self._extract_all_fields(data)
            fields["year"] = year
            result.append(fields)
        return result

    # ---------- 计算同比 ----------
    def add_yoy(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """为每个数值字段添加同比增长率（字段名_yoy）"""
        for i in range(1, len(data)):
            prev = data[i-1]
            curr = data[i]
            for key in list(curr.keys()):
                if key == "year" or key.endswith("_yoy"):
                    continue
                prev_val = prev.get(key, 0)
                if prev_val != 0:
                    curr[f"{key}_yoy"] = (curr[key] - prev_val) / prev_val
                else:
                    curr[f"{key}_yoy"] = None
        return data

    # ---------- 计算 CAGR ----------
    def calculate_cagr(self, values: List[float]) -> Optional[float]:
        values = [v for v in values if v and v > 0]
        if len(values) < 2:
            return None
        n = len(values) - 1
        return (values[-1] / values[0]) ** (1 / n) - 1

    # ---------- 格式化 ----------
    def format_number(self, num: float) -> str:
        if abs(num) >= 1e12:
            return f"{num/1e12:.2f}T"
        elif abs(num) >= 1e9:
            return f"{num/1e9:.2f}B"
        elif abs(num) >= 1e6:
            return f"{num/1e6:.2f}M"
        elif abs(num) >= 1e3:
            return f"{num/1e3:.1f}K"
        else:
            return f"{num:.0f}"

    def format_percent(self, value: Optional[float]) -> str:
        if value is None:
            return "—"
        return f"{value*100:.2f}%"

    # ---------- 财务健康评分模型（详细说明）----------
    def health_score_model(self, data: Dict[str, float]) -> Dict[str, Any]:
        """评分模型与之前相同，未作改动"""
        revenue = data.get("totalRevenue", 0)
        net_income = data.get("netIncome", 0)
        total_assets = data.get("totalAssets", 0)
        equity = data.get("totalShareholderEquity", 0)
        current_assets = data.get("totalCurrentAssets", 0)
        current_liabilities = data.get("totalCurrentLiabilities", 0)
        total_debt = data.get("total_debt", 0)
        operating_cf = data.get("operatingCashflow", 0)
        capex = data.get("capitalExpenditures", 0)
        ebit = data.get("ebit", 0)
        interest_expense = data.get("interestExpense", 0)

        roe = self._safe_divide(net_income, equity)
        current_ratio = self._safe_divide(current_assets, current_liabilities)
        debt_to_equity = self._safe_divide(total_debt, equity)
        asset_turnover = self._safe_divide(revenue, total_assets)
        fcf_margin = self._safe_divide(operating_cf - capex, revenue)

        def score_profitability():
            if roe > 0.20:
                score = 100
                desc = f"ROE {roe:.2%} > 20%，盈利能力优秀"
            elif roe > 0.15:
                score = 80
                desc = f"ROE {roe:.2%} 在15%-20%之间，盈利能力良好"
            elif roe > 0.10:
                score = 60
                desc = f"ROE {roe:.2%} 在10%-15%之间，盈利能力一般"
            elif roe > 0.05:
                score = 40
                desc = f"ROE {roe:.2%} 在5%-10%之间，盈利能力较弱"
            else:
                score = 20
                desc = f"ROE {roe:.2%} <5%，盈利能力差"
            return score, desc

        def score_liquidity():
            if current_ratio > 2.0:
                score = 100
                desc = f"流动比率 {current_ratio:.2f} > 2.0，流动性非常充裕"
            elif current_ratio > 1.5:
                score = 80
                desc = f"流动比率 {current_ratio:.2f} 在1.5-2.0之间，流动性良好"
            elif current_ratio > 1.0:
                score = 60
                desc = f"流动比率 {current_ratio:.2f} 在1.0-1.5之间，流动性一般"
            elif current_ratio > 0.8:
                score = 40
                desc = f"流动比率 {current_ratio:.2f} 在0.8-1.0之间，流动性紧张"
            else:
                score = 20
                desc = f"流动比率 {current_ratio:.2f} <0.8，流动性风险高"
            return score, desc

        def score_leverage():
            if debt_to_equity < 0.3:
                score = 100
                desc = f"负债权益比 {debt_to_equity:.2f} < 0.3，杠杆水平极低"
            elif debt_to_equity < 0.6:
                score = 80
                desc = f"负债权益比 {debt_to_equity:.2f} 在0.3-0.6之间，杠杆健康"
            elif debt_to_equity < 1.0:
                score = 60
                desc = f"负债权益比 {debt_to_equity:.2f} 在0.6-1.0之间，杠杆适中"
            elif debt_to_equity < 2.0:
                score = 40
                desc = f"负债权益比 {debt_to_equity:.2f} 在1.0-2.0之间，杠杆偏高"
            else:
                score = 20
                desc = f"负债权益比 {debt_to_equity:.2f} > 2.0，杠杆过高风险"
            return score, desc

        def score_efficiency():
            if asset_turnover > 1.0:
                score = 100
                desc = f"资产周转率 {asset_turnover:.2f} > 1.0，资产使用效率极高"
            elif asset_turnover > 0.8:
                score = 80
                desc = f"资产周转率 {asset_turnover:.2f} 在0.8-1.0之间，效率良好"
            elif asset_turnover > 0.5:
                score = 60
                desc = f"资产周转率 {asset_turnover:.2f} 在0.5-0.8之间，效率一般"
            elif asset_turnover > 0.3:
                score = 40
                desc = f"资产周转率 {asset_turnover:.2f} 在0.3-0.5之间，效率偏低"
            else:
                score = 20
                desc = f"资产周转率 {asset_turnover:.2f} <0.3，效率低下"
            return score, desc

        def score_cashflow():
            if fcf_margin > 0.15:
                score = 100
                desc = f"自由现金流利润率 {fcf_margin:.2%} > 15%，现金生成能力极强"
            elif fcf_margin > 0.10:
                score = 80
                desc = f"自由现金流利润率 {fcf_margin:.2%} 在10%-15%之间，现金生成能力强"
            elif fcf_margin > 0.05:
                score = 60
                desc = f"自由现金流利润率 {fcf_margin:.2%} 在5%-10%之间，现金生成能力一般"
            elif fcf_margin > 0:
                score = 40
                desc = f"自由现金流利润率 {fcf_margin:.2%} 在0%-5%之间，现金生成能力较弱"
            else:
                score = 20
                desc = f"自由现金流利润率 {fcf_margin:.2%} 为负，现金流失"
            return score, desc

        profit_score, profit_desc = score_profitability()
        liq_score, liq_desc = score_liquidity()
        lev_score, lev_desc = score_leverage()
        eff_score, eff_desc = score_efficiency()
        cf_score, cf_desc = score_cashflow()

        weighted_sum = (
            profit_score * self.HEALTH_WEIGHTS["profitability"] +
            liq_score * self.HEALTH_WEIGHTS["liquidity"] +
            lev_score * self.HEALTH_WEIGHTS["leverage"] +
            eff_score * self.HEALTH_WEIGHTS["efficiency"] +
            cf_score * self.HEALTH_WEIGHTS["cashflow"]
        )
        total = weighted_sum

        if total >= 80:
            rating = "非常健康"
            msg = "财务状况非常健康，各维度表现优秀"
        elif total >= 65:
            rating = "健康"
            msg = "财务状况健康，大部分维度良好"
        elif total >= 50:
            rating = "一般"
            msg = "财务状况一般，存在部分薄弱环节"
        elif total >= 35:
            rating = "较差"
            msg = "财务状况较差，多个维度需关注"
        else:
            rating = "危险"
            msg = "财务状况危险，可能面临偿债或经营危机"

        return {
            "total_score": round(total, 1),
            "rating": rating,
            "summary": msg,
            "dimensions": {
                "profitability": {"score": profit_score, "description": profit_desc, "weight": self.HEALTH_WEIGHTS["profitability"]},
                "liquidity": {"score": liq_score, "description": liq_desc, "weight": self.HEALTH_WEIGHTS["liquidity"]},
                "leverage": {"score": lev_score, "description": lev_desc, "weight": self.HEALTH_WEIGHTS["leverage"]},
                "efficiency": {"score": eff_score, "description": eff_desc, "weight": self.HEALTH_WEIGHTS["efficiency"]},
                "cashflow": {"score": cf_score, "description": cf_desc, "weight": self.HEALTH_WEIGHTS["cashflow"]},
            }
        }

    # ---------- 生成 Markdown ----------
    def generate_markdown(self, data: List[Dict[str, Any]]) -> str:
        lines = []

        # 标题和基本信息
        lines.append(f"# 📊 {self.company_name} ({self.symbol}) 基础财务数据详表\n")
        lines.append(f"**报告生成时间**：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"**行业分类**：{self.industry}")
        lines.append(f"**数据覆盖年份**：{data[0]['year']} — {data[-1]['year']}（共 {len(data)} 年）\n")
        lines.append("---\n")

        # 1. 损益表核心数据
        lines.append("## 1. 损益表核心数据\n")
        income_fields = [
            ("totalRevenue", "总营收"),
            ("costOfRevenue", "营业成本"),
            ("grossProfit", "毛利"),
            ("operatingIncome", "营业利润"),
            ("netIncome", "净利润"),
            ("ebitda", "EBITDA"),
            ("ebitda_margin", "EBITDA利润率"),      # 新增
            ("ebit", "EBIT"),
            ("interestExpense", "利息费用"),
            ("incomeTaxExpense", "所得税"),
            ("effective_tax_rate", "有效税率"),     # 新增
            ("researchAndDevelopment", "研发费用"),
            ("sellingGeneralAndAdministrative", "销售管理费用"),
            ("depreciationAndAmortization", "折旧摊销"),
            ("interestIncome", "利息收入"),
        ]
        for field_en, field_cn in income_fields:
            if not any(d.get(field_en, 0) for d in data):
                continue
            lines.append(f"### {field_cn} ({field_en})\n")
            header = "| 年份 | 金额 | 同比增长 |"
            lines.append(header)
            lines.append("|------|------|----------|")
            for d in data:
                val = d.get(field_en, 0)
                yoy = d.get(f"{field_en}_yoy")
                # 对于比率指标（EBITDA利润率、有效税率），用百分比格式化
                if field_en in ["ebitda_margin", "effective_tax_rate"]:
                    lines.append(f"| {d['year']} | {self.format_percent(val)} | {self.format_percent(yoy)} |")
                else:
                    lines.append(f"| {d['year']} | {self.format_number(val)} | {self.format_percent(yoy)} |")
            lines.append("\n")

        # 2. 资产负债表核心数据
        lines.append("## 2. 资产负债表核心数据\n")
        balance_fields = [
            ("totalAssets", "总资产"),
            ("totalLiabilities", "总负债"),
            ("totalShareholderEquity", "股东权益"),
            ("totalCurrentAssets", "流动资产"),
            ("totalCurrentLiabilities", "流动负债"),
            ("cashAndCashEquivalentsAtCarryingValue", "现金及等价物"),
            ("inventory", "存货"),
            ("currentNetReceivables", "应收账款"),
            ("currentAccountsPayable", "应付账款"),
            ("shortTermDebt", "短期债务"),
            ("longTermDebt", "长期债务"),
            ("total_debt", "总债务"),
            ("retainedEarnings", "留存收益"),
            ("propertyPlantEquipment", "固定资产"),
            ("intangibleAssets", "无形资产"),
            ("goodwill", "商誉"),
            ("working_capital", "营运资本"),
        ]
        for field_en, field_cn in balance_fields:
            if not any(d.get(field_en, 0) for d in data):
                continue
            lines.append(f"### {field_cn} ({field_en})\n")
            header = "| 年份 | 金额 | 同比增长 |"
            lines.append(header)
            lines.append("|------|------|----------|")
            for d in data:
                val = d.get(field_en, 0)
                yoy = d.get(f"{field_en}_yoy")
                lines.append(f"| {d['year']} | {self.format_number(val)} | {self.format_percent(yoy)} |")
            lines.append("\n")

        # 新增：营运资本变动（绝对值）
        lines.append("### 营运资本变动 (Working Capital Change)\n")
        header = "| 年份 | 变动值 |"
        lines.append(header)
        lines.append("|------|--------|")
        for d in data:
            change = d.get("working_capital_change")
            if change is None:
                lines.append(f"| {d['year']} | — |")
            else:
                lines.append(f"| {d['year']} | {self.format_number(change)} |")
        lines.append("\n")

        # 3. 现金流量表核心数据
        lines.append("## 3. 现金流量表核心数据\n")
        cashflow_fields = [
            ("operatingCashflow", "经营活动现金流"),
            ("capitalExpenditures", "资本支出"),
            ("capex_to_depreciation", "资本支出/折旧"),   # 新增
            ("free_cash_flow", "自由现金流"),
            ("cashflowFromInvestment", "投资活动现金流"),
            ("cashflowFromFinancing", "筹资活动现金流"),
            ("dividendPayout", "股息支付"),
            ("proceedsFromRepurchaseOfEquity", "股份回购"),
            ("changeInCashAndCashEquivalents", "现金变动"),
        ]
        for field_en, field_cn in cashflow_fields:
            if not any(d.get(field_en, 0) for d in data):
                continue
            lines.append(f"### {field_cn} ({field_en})\n")
            header = "| 年份 | 金额 | 同比增长 |"
            lines.append(header)
            lines.append("|------|------|----------|")
            for d in data:
                val = d.get(field_en, 0)
                yoy = d.get(f"{field_en}_yoy")
                if field_en == "capex_to_depreciation":
                    # 比率指标，用数字格式化（保留两位小数），也可用百分比，但通常是倍数
                    lines.append(f"| {d['year']} | {val:.2f} | {self.format_percent(yoy)} |")
                else:
                    lines.append(f"| {d['year']} | {self.format_number(val)} | {self.format_percent(yoy)} |")
            lines.append("\n")

        # 4. 每股数据
        lines.append("## 4. 每股数据\n")
        if any(d.get("reportedEPS", 0) for d in data):
            lines.append("### 每股收益 (EPS)\n")
            header = "| 年份 | EPS | 同比增长 |"
            lines.append(header)
            lines.append("|------|-----|----------|")
            for d in data:
                eps = d.get("reportedEPS", 0)
                yoy = d.get("reportedEPS_yoy")
                lines.append(f"| {d['year']} | {eps:.2f} | {self.format_percent(yoy)} |")
            lines.append("\n")

        # 5. 复合年增长率 (CAGR)
        lines.append("## 5. 复合年增长率 (CAGR)\n")
        cagr_fields = [
            ("totalRevenue", "营收"),
            ("netIncome", "净利润"),
            ("totalAssets", "总资产"),
            ("totalShareholderEquity", "股东权益"),
            ("operatingCashflow", "经营现金流"),
            ("free_cash_flow", "自由现金流"),
            ("reportedEPS", "每股收益"),
        ]
        for field_en, field_cn in cagr_fields:
            values = [d.get(field_en, 0) for d in data]
            if not any(values):
                continue
            cagr_3 = self.calculate_cagr(values[-3:]) if len(values) >= 3 else None
            cagr_5 = self.calculate_cagr(values[-5:]) if len(values) >= 5 else None
            cagr_all = self.calculate_cagr(values) if len(values) >= 2 else None
            lines.append(f"**{field_cn}**：")
            lines.append(f"- 近3年 CAGR：{self.format_percent(cagr_3)}")
            lines.append(f"- 近5年 CAGR：{self.format_percent(cagr_5)}")
            lines.append(f"- 全部年份 CAGR：{self.format_percent(cagr_all)}\n")

        # 6. 财务健康评分模型
        lines.append("## 6. 财务健康评分模型\n")
        lines.append("本报告采用多维度加权评分模型评估公司财务健康度，每个维度基于关键财务比率，按阈值打分（0-100分），最终加权得出总分。\n")
        lines.append("### 评分维度与权重\n")
        lines.append("| 维度 | 权重 | 评价指标 | 评分规则 |")
        lines.append("|------|------|----------|----------|")
        lines.append("| 盈利能力 | 30% | 净资产收益率 (ROE) | >20%:100, 15-20%:80, 10-15%:60, 5-10%:40, <5%:20 |")
        lines.append("| 流动性 | 20% | 流动比率 | >2.0:100, 1.5-2.0:80, 1.0-1.5:60, 0.8-1.0:40, <0.8:20 |")
        lines.append("| 杠杆 | 20% | 负债权益比 | <0.3:100, 0.3-0.6:80, 0.6-1.0:60, 1.0-2.0:40, >2.0:20 |")
        lines.append("| 效率 | 15% | 资产周转率 | >1.0:100, 0.8-1.0:80, 0.5-0.8:60, 0.3-0.5:40, <0.3:20 |")
        lines.append("| 现金流 | 15% | 自由现金流利润率 | >15%:100, 10-15%:80, 5-10%:60, 0-5%:40, <0:20 |\n")

        lines.append("### 历年评分结果\n")
        for d in data:
            score_result = self.health_score_model(d)
            year = d['year']
            lines.append(f"#### {year}年\n")
            lines.append(f"- **总分**：{score_result['total_score']} — {score_result['rating']}")
            lines.append(f"- **综合解读**：{score_result['summary']}")
            lines.append("  各维度得分及依据：")
            for dim, info in score_result['dimensions'].items():
                dim_name = {"profitability":"盈利能力","liquidity":"流动性","leverage":"杠杆","efficiency":"效率","cashflow":"现金流"}[dim]
                lines.append(f"  - {dim_name}（权重{info['weight']*100:.0f}%）：{info['score']}分，{info['description']}")
            lines.append("")

        lines.append("---\n")
        lines.append("## 📘 指标说明\n")
        lines.append("- **自由现金流** = 经营现金流 - 资本支出")
        lines.append("- **CAGR**：复合年增长率，计算公式为 (期末值/期初值)^(1/n) - 1")
        lines.append("- **财务健康评分**：基于上述五个维度的加权评分，详细规则见第6节。")
        lines.append("- **有效税率** = 所得税 / (净利润 + 所得税)")
        lines.append("- **EBITDA利润率** = EBITDA / 营收")
        lines.append("- **资本支出/折旧** = 资本支出 / 折旧与摊销，衡量投资力度")
        lines.append("- **营运资本变动** = 本年营运资本 - 上年营运资本，反映运营资金变化")
        lines.append("\n*报告生成完毕，仅供参考。*\n")

        return "\n".join(lines)

    def save_report(self, output_path: str):
        data = self.get_all_years_data()
        if not data:
            print("⚠️ 未找到任何年度数据，无法生成报告。")
            return
        data = self.add_yoy(data)
        # 添加营运资本变动（不参与同比计算）
        for i in range(1, len(data)):
            data[i]["working_capital_change"] = data[i]["working_capital"] - data[i-1]["working_capital"]
        if data:
            data[0]["working_capital_change"] = None
        md_content = self.generate_markdown(data)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(md_content)
        print(f"✅ 基础财务数据报告已生成：{output_path}")


# ==================== 以下为 generate_financial_ratio.py 的完整内容 ====================

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


#!/usr/bin/env python3
"""
MD 财务比率报告生成器（修正表格格式）
读取 financial_ratio_result.json，生成多年度对比表格（Markdown 标准语法），无主观评级，文末附指标解释。
"""

import json
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any


class MDFinancialReportGenerator:
    """纯 Markdown 财务报告生成器（多年度）"""

    def __init__(self, json_path: str):
        with open(json_path, 'r', encoding='utf-8') as f:
            self.data = json.load(f)

        self.company = self.data.get('company', '未知公司')
        self.symbol = self.data.get('symbol', '')
        self.metadata = self.data.get('metadata', {})
        self.timestamp = self.data.get('timestamp', datetime.now().isoformat())
        self.historical = self.data.get('historical_ratios', {})

    def _format_cell(self, value: Any) -> str:
        """统一格式化单元格内容"""
        if value is None or value == '' or value == 'N/A':
            return '—'
        return str(value)

    def _generate_table(self, category: str, title: str, metric_names: Dict[str, str]) -> str:
        """
        生成某个类别的多年度对比表格（标准 Markdown 格式）
        category: profitability / liquidity / leverage / efficiency / cashflow
        title: 表格标题（中文）
        metric_names: 指标英文名 -> 中文名映射
        """
        if not self.historical:
            return f"\n⚠️ 无历史比率数据，无法生成 {title} 表格。\n"

        # 获取所有年份（已排序）
        years = sorted(self.historical.keys())
        if not years:
            return ""

        # 收集该类别下所有出现的指标（取第一年为准）
        first_year = years[0]
        metrics_in_category = self.historical[first_year].get(category, {})
        if not metrics_in_category:
            return f"\n⚠️ 类别 {category} 无数据。\n"

        lines = []
        lines.append(f"\n### {title}\n")

        # ----- 表头：| 指标 | 2006 | 2007 | ... | 2025 | -----
        header = "| 指标 | " + " | ".join(years) + " |"
        lines.append(header)

        # ----- 分隔行：| --- | --- | --- | ... | --- | -----
        separator = "| --- | " + " | ".join(["---"] * len(years)) + " |"
        lines.append(separator)

        # ----- 数据行：每个指标一行 -----
        for metric_en, _ in metrics_in_category.items():
            metric_cn = metric_names.get(metric_en, metric_en)
            row_values = []
            for y in years:
                val = self.historical[y].get(category, {}).get(metric_en, '—')
                row_values.append(self._format_cell(val))
            row = "| **{}** | ".format(metric_cn) + " | ".join(row_values) + " |"
            lines.append(row)

        return "\n".join(lines)

    def generate(self) -> str:
        """生成完整 Markdown 报告"""
        lines = []

        # ----- 标题与元信息 -----
        lines.append(f"# 📊 {self.company} ({self.symbol}) 财务比率历史数据\n")
        lines.append(f"**报告生成时间**：{self.timestamp[:10]} {self.timestamp[11:19]}")
        lines.append(f"**数据来源**：AlphaVantage 年报")
        lines.append(f"**行业分类**：{self.metadata.get('industry', 'N/A')}\n")
        lines.append("---\n")

        if not self.historical:
            lines.append("⚠️ **提示**：当前数据不包含历年比率，请设置 `include_historical_ratios=True` 重新运行分析。\n")
        else:
            # 指标中英文映射
            metric_names = {
                # 盈利能力
                "roe": "净资产收益率 (ROE)",
                "roa": "总资产收益率 (ROA)",
                "gross_margin": "毛利率",
                "operating_margin": "营业利润率",
                "net_margin": "净利率",
                "ebitda_margin": "EBITDA 利润率",
                "roic": "投入资本回报率 (ROIC)",
                # 流动性
                "current_ratio": "流动比率",
                "quick_ratio": "速动比率",
                "cash_ratio": "现金比率",
                "working_capital": "营运资本",
                "working_capital_ratio": "营运资本比率",
                # 杠杆
                "debt_to_equity": "负债权益比",
                "debt_to_assets": "资产负债率",
                "equity_multiplier": "权益乘数",
                "interest_coverage": "利息保障倍数",
                "fixed_charge_coverage": "固定费用保障倍数",
                # 效率
                "asset_turnover": "资产周转率",
                "inventory_turnover": "存货周转率",
                "receivables_turnover": "应收账款周转率",
                "payables_turnover": "应付账款周转率",
                "days_sales_outstanding": "应收账款周转天数 (DSO)",
                "days_inventory_outstanding": "存货周转天数 (DIO)",
                "days_payables_outstanding": "应付账款周转天数 (DPO)",
                "cash_conversion_cycle": "现金转换周期",
                # 现金流与投资（新增）
                "capital_expenditure": "资本支出",
                "free_cash_flow": "自由现金流",
                "capex_to_revenue": "资本支出/收入",
                "capex_to_ebitda": "资本支出/EBITDA",
                "capex_to_operating_cf": "资本支出/经营现金流",
                "fcf_margin": "自由现金流利润率",
                "fcf_yield": "自由现金流收益率",
                "operating_cf_margin": "经营现金流利润率",
                "fcf_to_net_income": "自由现金流/净利润",
            }

            # ----- 生成五大类表格 -----
            lines.append(self._generate_table("profitability", "💰 盈利能力", metric_names))
            lines.append(self._generate_table("liquidity", "💧 流动性", metric_names))
            lines.append(self._generate_table("leverage", "⚖️ 杠杆与偿债能力", metric_names))
            lines.append(self._generate_table("efficiency", "⚙️ 营运效率", metric_names))
            lines.append(self._generate_table("cashflow", "💰 现金流与投资", metric_names))  # 新增

        # ----- 指标解释附录 -----
        lines.append("\n---\n")
        lines.append("## 📘 指标解释\n")
        explanations = {
            "roe": "**净资产收益率 (ROE)** = 净利润 / 股东权益。衡量股东权益的回报率，越高代表盈利能力越强。",
            "roa": "**总资产收益率 (ROA)** = 净利润 / 总资产。衡量公司利用全部资产创造利润的效率。",
            "gross_margin": "**毛利率** = (营业收入 - 营业成本) / 营业收入。反映产品或服务的初始盈利能力。",
            "operating_margin": "**营业利润率** = 营业利润 / 营业收入。反映主营业务盈利能力。",
            "net_margin": "**净利率** = 净利润 / 营业收入。反映最终的盈利水平。",
            "ebitda_margin": "**EBITDA 利润率** = EBITDA / 营业收入。衡量经营现金流生成能力。",
            "roic": "**投入资本回报率 (ROIC)** = EBIT / (总资产 - 现金 - 无息流动负债)。衡量资本使用效率。",
            "current_ratio": "**流动比率** = 流动资产 / 流动负债。衡量短期偿债能力，一般>1.5为良好。",
            "quick_ratio": "**速动比率** = (流动资产 - 存货) / 流动负债。更严格的短期偿债能力指标。",
            "cash_ratio": "**现金比率** = 现金及等价物 / 流动负债。最保守的短期偿债能力指标。",
            "working_capital": "**营运资本** = 流动资产 - 流动负债。反映企业日常经营所需的流动资金。",
            "debt_to_equity": "**负债权益比** = 总负债 / 股东权益。衡量财务杠杆水平。",
            "debt_to_assets": "**资产负债率** = 总负债 / 总资产。反映总资产中由负债提供的比例。",
            "equity_multiplier": "**权益乘数** = 总资产 / 股东权益。财务杠杆倍率。",
            "interest_coverage": "**利息保障倍数** = EBIT / 利息费用。衡量支付利息的能力。",
            "asset_turnover": "**资产周转率** = 营业收入 / 总资产。衡量资产运营效率。",
            "inventory_turnover": "**存货周转率** = 营业成本 / 存货。反映存货管理效率。",
            "receivables_turnover": "**应收账款周转率** = 营业收入 / 应收账款。反映回款效率。",
            "days_sales_outstanding": "**应收账款周转天数 (DSO)** = 365 / 应收账款周转率。反映平均回款天数。",
            "days_inventory_outstanding": "**存货周转天数 (DIO)** = 365 / 存货周转率。反映存货销售平均天数。",
            "days_payables_outstanding": "**应付账款周转天数 (DPO)** = 365 / 应付账款周转率。反映付款周期。",
            "cash_conversion_cycle": "**现金转换周期** = DSO + DIO - DPO。反映从付出现金到收回现金所需天数。",
            # 现金流指标解释（新增）
            "capital_expenditure": "**资本支出** = 购建固定资产、无形资产支付的现金。反映企业再投资力度。",
            "free_cash_flow": "**自由现金流** = 经营现金流 - 资本支出。衡量企业可自由支配的现金。",
            "capex_to_revenue": "**资本支出/收入** = 资本支出 / 营业收入。反映收入中用于再投资的比例。",
            "capex_to_ebitda": "**资本支出/EBITDA** = 资本支出 / EBITDA。衡量EBITDA中用于资本支出的比例。",
            "capex_to_operating_cf": "**资本支出/经营现金流** = 资本支出 / 经营现金流。反映经营现金流中用于资本支出的比例。",
            "fcf_margin": "**自由现金流利润率** = 自由现金流 / 营业收入。衡量收入转化为自由现金流的效率。",
            "fcf_yield": "**自由现金流收益率** = 自由现金流 / 市值。衡量投资回报的现金收益。",
            "operating_cf_margin": "**经营现金流利润率** = 经营现金流 / 营业收入。衡量收入转化为经营现金流的效率。",
            "fcf_to_net_income": "**自由现金流/净利润** = 自由现金流 / 净利润。衡量盈利的现金实现质量。",
        }
        for term, desc in explanations.items():
            lines.append(f"- {desc}")

        lines.append("\n---\n")
        lines.append("*报告生成完毕，仅供参考。*")

        return "\n".join(lines)

    def save(self, output_path: str):
        """保存 Markdown 文件"""
        md_content = self.generate()
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(md_content)
        print(f"✅ Markdown 报告已保存至：{output_path}")


# ==================== 新增：后端工具外壳 ====================

class FinancialReportMode(str, Enum):
    """财务报告生成模式"""
    BASE = "base"           # 仅生成基础财务数据报告
    RATIO = "ratio"         # 仅生成财务比率历史数据报告
    BOTH = "both"           # 同时生成两种报告


class FinancialReportParams(BaseModel):
    """财务报告工具参数模型"""
    symbol: Optional[str] = Field(
        default=None,
        description="股票代码，如 AAPL。若未提供，将自动从会话目录中的 JSON 文件推断。"
    )


class FinancialReportInput(BaseModel):
    """财务报告工具输入模型"""
    mode: FinancialReportMode = Field(
        description="要生成的报告类型：base（基础财务数据）、ratio（财务比率历史数据）、both（两者）"
    )
    parameters: Dict[str, Any] = Field(
        description="参数，当前支持可选的 'symbol'"
    )


class FinancialReportGeneratorTool:
    """
    财务报告生成工具
    从会话工作区中读取 AlphaVantage 获取的原始 JSON 文件，
    生成基础财务数据报告（*_base_financials.md）和/或财务比率历史数据报告（*_report.md）。
    """
    name = "financial_report_generator"
    description = (
        "从会话工作区中读取 AlphaVantage 获取的原始 JSON 文件（如 income_statement_*.json, balance_sheet_*.json 等），"
        "生成两种财务报告：基础财务数据详表（包含同比、CAGR、健康评分）和财务比率历史数据表格（多年度对比）。"
        "模式 base 仅生成基础财务报告，ratio 仅生成比率历史报告，both 同时生成两者。"
        "参数中可指定 symbol，若不指定则自动从文件名推断。"
    )
    input_schema = FinancialReportInput

    def __init__(self):
        logger.info("FinancialReportGeneratorTool 初始化完成")

    def _ensure_session_workspace(self, session_id: str = None) -> Path:
        """
        确保会话工作区存在，返回目录路径。
        逻辑与代码解释器保持一致：若 session_id 有效（以 'session_' 开头）则使用该 ID，否则使用 'temp'。
        """
        if session_id and session_id.startswith("session_"):
            session_dir = Path("/srv/sandbox_workspaces") / session_id
        else:
            session_dir = Path("/srv/sandbox_workspaces") / "temp"
        session_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 使用会话目录: {session_dir}")
        return session_dir

    def _detect_symbol_from_files(self, session_dir: Path) -> str:
        """
        从会话目录中的 income_statement_*.json 文件推断 symbol。
        若目录中没有此类文件，或文件名格式不符，则抛出异常。
        """
        pattern = "income_statement_*.json"
        files = list(session_dir.glob(pattern))
        if not files:
            raise FileNotFoundError(f"在目录 {session_dir} 中未找到任何 income_statement_*.json 文件，无法推断 symbol。")
        # 取第一个文件，提取 symbol：格式 income_statement_SYMBOL.json
        filename = files[0].stem  # 不带扩展名
        parts = filename.split('_')
        if len(parts) >= 3:
            # 例如 "income_statement_AAPL" -> "AAPL"
            return parts[2]
        else:
            raise ValueError(f"无法从文件名 {filename} 推断 symbol，请显式提供 symbol 参数。")

    def _build_av_data(self, session_dir: Path, symbol: str) -> Dict[str, Any]:
        """
        从会话目录中加载指定 symbol 的所有相关 JSON 文件，构建 alpha_vantage_data 字典。
        文件命名规则参考 AlphaVantage 工具的保存逻辑。
        """
        required_files = {
            "income_statement": session_dir / f"income_statement_{symbol}.json",
            "balance_sheet": session_dir / f"balance_sheet_{symbol}.json",
            "overview": session_dir / f"overview_{symbol}.json",
        }
        optional_files = {
            "global_quote": session_dir / f"quote_{symbol}.json",
            "cash_flow": session_dir / f"cash_flow_{symbol}.json",
            "earnings": session_dir / f"earnings_{symbol}.json",
        }

        av_data = {}
        # 必需文件
        for key, path in required_files.items():
            if not path.exists():
                raise FileNotFoundError(f"必需文件 {path.name} 不存在，无法生成报告。")
            with open(path, 'r', encoding='utf-8') as f:
                av_data[key] = json.load(f)
            logger.debug(f"已加载必需文件: {path.name}")

        # 可选文件（不存在则跳过）
        for key, path in optional_files.items():
            if path.exists():
                with open(path, 'r', encoding='utf-8') as f:
                    av_data[key] = json.load(f)
                logger.debug(f"已加载可选文件: {path.name}")
            else:
                logger.debug(f"可选文件 {path.name} 不存在，跳过。")

        return av_data

    async def execute(self, parameters: FinancialReportInput, session_id: str = None) -> dict:
        """
        执行财务报告生成。
        """
        try:
            mode = parameters.mode
            params = parameters.parameters
            symbol = params.get("symbol")  # 可能为 None

            logger.info(f"🚀 执行财务报告生成，模式: {mode.value}")

            # 确定会话工作区目录
            session_dir = self._ensure_session_workspace(session_id)

            # 若未提供 symbol，则自动检测
            if not symbol:
                try:
                    symbol = self._detect_symbol_from_files(session_dir)
                    logger.info(f"自动检测到 symbol: {symbol}")
                except (FileNotFoundError, ValueError) as e:
                    return {
                        "success": False,
                        "error": f"无法自动推断 symbol，请显式提供 symbol 参数: {str(e)}",
                        "session_dir": str(session_dir)
                    }

            # 生成的文件列表
            generated_files = []

                        # ----- 1. 基础财务数据报告（base）-----
            if mode in [FinancialReportMode.BASE, FinancialReportMode.BOTH]:
                try:
                    # 加载基础报告所需的四个 JSON 文件
                    income_file = session_dir / f"income_statement_{symbol}.json"
                    balance_file = session_dir / f"balance_sheet_{symbol}.json"
                    cashflow_file = session_dir / f"cash_flow_{symbol}.json"
                    earnings_file = session_dir / f"earnings_{symbol}.json"

                    # 检查必需文件
                    missing = []
                    for f in [income_file, balance_file, cashflow_file, earnings_file]:
                        if not f.exists():
                            missing.append(f.name)
                    if missing:
                        raise FileNotFoundError(f"缺少基础财务报告必需文件: {missing}")

                    with open(income_file, 'r') as f:
                        income_json = json.load(f)
                    with open(balance_file, 'r') as f:
                        balance_json = json.load(f)
                    with open(cashflow_file, 'r') as f:
                        cashflow_json = json.load(f)
                    with open(earnings_file, 'r') as f:
                        earnings_json = json.load(f)

                    # 🎯 从 overview 中提取行业信息，与比率报告保持一致
                    overview_file = session_dir / f"overview_{symbol}.json"
                    industry = "general"  # 默认值
                    if overview_file.exists():
                        with open(overview_file, 'r') as f:
                            overview_json = json.load(f)
                        sector = overview_json.get("Sector", "").lower()
                        industry_map = {
                            "technology": "technology",
                            "healthcare": "healthcare",
                            "financial": "financial",
                            "consumer": "retail",
                            "industrial": "manufacturing",
                            "energy": "energy",
                        }
                        for key, val in industry_map.items():
                            if key in sector:
                                industry = val
                                break
                    else:
                        logger.warning(f"overview 文件 {overview_file} 不存在，基础财务报告行业将使用默认值 'general'")

                    # 实例化生成器并生成报告，使用提取的 industry
                    generator = BaseFinancialsGenerator(
                        income_json=income_json,
                        balance_json=balance_json,
                        cashflow_json=cashflow_json,
                        earnings_json=earnings_json,
                        symbol=symbol,
                        industry=industry  # 现在从 overview 动态获取
                    )
                    base_output = session_dir / f"{symbol.lower()}_base_financials.md"
                    generator.save_report(str(base_output))
                    generated_files.append(str(base_output))
                    logger.info(f"✅ 基础财务报告生成成功: {base_output} (行业: {industry})")
                except Exception as e:
                    logger.error(f"基础财务报告生成失败: {e}", exc_info=True)
                    return {
                        "success": False,
                        "error": f"基础财务报告生成失败: {str(e)}",
                        "session_dir": str(session_dir)
                    }

            # ----- 2. 财务比率历史数据报告（ratio）-----
            if mode in [FinancialReportMode.RATIO, FinancialReportMode.BOTH]:
                try:
                    # 构建 AlphaVantage 数据字典
                    av_data = self._build_av_data(session_dir, symbol)

                    # 准备比率工具输入参数（开启历史比率计算）
                    tool_params = {
                        "alpha_vantage_data": av_data,
                        "include_interpretation": False,      # 关闭主观评级
                        "include_summary": False,              # 关闭主观总结
                        "format_output": True,
                        "use_advanced_metrics": True,
                        "include_historical_ratios": True,     # 关键：计算历年比率
                    }

                    # 实例化比率分析工具
                    ratio_tool = FinancialRatioAnalysisTool()
                    input_model = ratio_tool.input_schema(**tool_params)
                    result = await ratio_tool.execute(input_model)

                    if not result["success"]:
                        raise RuntimeError(f"比率分析工具执行失败: {result.get('error')}")

                    # 构建报告所需数据（与 test_generate_financial_ratio.py 一致）
                    report_data = {
                        "timestamp": datetime.now().isoformat(),
                        "company": av_data.get("overview", {}).get("Name", "Unknown"),
                        "symbol": symbol,
                        "metadata": result.get("metadata", {}),
                        "historical_ratios": result.get("historical_ratios", {}),
                    }

                    # 将 report_data 写入临时 JSON 文件（供 MDFinancialReportGenerator 读取）
                    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.json', delete=False) as tmp:
                        json.dump(report_data, tmp, indent=2, ensure_ascii=False)
                        tmp_path = tmp.name

                    try:
                        # 生成 Markdown 报告
                        generator = MDFinancialReportGenerator(tmp_path)
                        ratio_output = session_dir / f"{symbol}_report.md"
                        generator.save(str(ratio_output))
                        generated_files.append(str(ratio_output))
                        logger.info(f"✅ 财务比率历史报告生成成功: {ratio_output}")
                    finally:
                        # 删除临时文件
                        Path(tmp_path).unlink(missing_ok=True)

                except Exception as e:
                    logger.error(f"财务比率历史报告生成失败: {e}", exc_info=True)
                    return {
                        "success": False,
                        "error": f"财务比率历史报告生成失败: {str(e)}",
                        "session_dir": str(session_dir)
                    }

            # 构建成功响应
            return {
                "success": True,
                "message": f"报告生成成功，共生成 {len(generated_files)} 个文件",
                "generated_files": generated_files,
                "session_dir": str(session_dir),
                "mode": mode.value,
                "symbol": symbol,
                "timestamp": datetime.now().isoformat()
            }

        except Exception as e:
            logger.error(f"❌ 财务报告工具执行失败: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"工具执行失败: {str(e)}"
            }


# 保留原始脚本的入口（不影响作为工具导入）
if __name__ == "__main__":
    # 可以保留测试代码，但通常不会执行
    print("此文件为后端工具模块，请通过工具调用方式使用。")