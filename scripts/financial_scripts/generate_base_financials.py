#!/usr/bin/env python3
"""
generate_base_financials.py（最终版）
从原始财务报表（利润表、资产负债表、现金流量表、盈利数据）提取所有历史年份的原始数据，
生成详尽的基础财务数据报告，包含同比变化、复合增长率以及详细的财务健康评分模型。
新增指标：有效税率、EBITDA利润率、资本支出/折旧、营运资本变动。
"""

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