#!/usr/bin/env python3
"""
通用估值测试脚本
支持运行多个模型（DCF、FCFE、RIM、EVA）并输出综合报告（详尽版）。

用法:
    python test_dcf_all.py --symbol AAPL --models dcf,fcfe,rim,eva --sensitivity
    python test_dcf_all.py                     # 处理所有股票，运行默认模型
"""

import os
import sys
import asyncio
import json
import argparse
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

from dcf_auto_all import DCFAutoValuation
from dcf_valuation_tool import TerminalValueMethod
from fcfe_model import FCFEValuation
from rim_model import RIMValuation
from eva_model import EVAValuation

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def find_available_symbols(data_dir: str = "data") -> List[str]:
    data_path = Path(data_dir)
    if not data_path.exists():
        logger.error(f"数据文件夹不存在: {data_dir}")
        return []
    symbols = set()
    for file in data_path.glob("*.json"):
        parts = file.stem.split('_')
        if len(parts) >= 2:
            symbol = parts[-1]
            symbols.add(symbol)
    symbols = [s for s in symbols if s.isupper()]
    logger.info(f"发现以下股票代码: {symbols}")
    return symbols


def load_current_price(symbol: str, data_dir: str) -> float:
    quote_path = Path(data_dir) / f"quote_{symbol}.json"
    if quote_path.exists():
        with open(quote_path, 'r', encoding='utf-8') as f:
            quote = json.load(f)
            return float(quote.get('price', 0))
    return 0.0


def get_value_per_share(res: Dict[str, Any]) -> str:
    """安全获取每股价值字符串"""
    if res.get('equity_valuation'):
        return res['equity_valuation'].get('value_per_share_formatted', 'N/A')
    elif res.get('valuation'):
        return res['valuation'].get('value_per_share_formatted', 'N/A')
    return 'N/A'


def generate_combined_report(symbol: str, results: Dict[str, Any], current_price: float) -> str:
    lines = []
    company_name = results.get(list(results.keys())[0], {}).get('company_name', symbol)
    lines.append(f"# {company_name} 多模型估值报告（详尽版）")
    lines.append(f"\n**报告生成时间**：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  \n")
    lines.append(f"**当前股价**：${current_price:.2f}  \n")
    lines.append("本报告综合运用四种经典估值模型，从不同视角评估公司价值。以下为各模型的详细计算过程与结果。\n")

    # 汇总表
    lines.append("## 模型估值结果汇总")
    lines.append("| 模型 | 每股价值 | 股权价值 | 折现率 | 终值占比 | 状态 |")
    lines.append("|------|----------|----------|--------|----------|------|")
    for model_name, res in results.items():
        vps = "N/A"
        ev = "N/A"
        disc = "N/A"
        term_pct = "N/A"
        status = "✅" if res.get('success') else "❌"

        if res.get('success'):
            if 'equity_valuation' in res and res['equity_valuation']:
                vps = res['equity_valuation'].get('value_per_share_formatted', 'N/A')
                ev = res['equity_valuation'].get('equity_value_formatted', 'N/A')
            elif 'valuation' in res:
                vps = res['valuation'].get('value_per_share_formatted', 'N/A')
                ev = res['valuation'].get('equity_value_formatted', 'N/A')

            if 'valuation' in res:
                disc = res['valuation'].get('wacc_formatted', res['valuation'].get('cost_of_equity_formatted', 'N/A'))
                term_pct = f"{res['valuation'].get('terminal_percent', 0):.1f}%"

        lines.append(f"| {model_name.upper()} | {vps} | {ev} | {disc} | {term_pct} | {status} |")

    lines.append("\n---\n")

    # 详细结果
    for model_name, res in results.items():
        lines.append(f"\n## {model_name.upper()} 模型详细解析")
        if not res.get('success'):
            lines.append(f"**错误**：{res.get('error')}")
            lines.append(f"**建议**：{res.get('suggestion')}")
            continue

        # 通用信息
        company = res.get('company_name', symbol)
        lines.append(f"**公司**：{company}\n")

        # 根据模型类型展开详细解释
        if model_name == 'dcf':
            v = res['valuation']
            eq = res.get('equity_valuation', {})
            proj = res.get('projections', {})
            ass_in = res.get('assumptions_input', {})
            wacc_comp = res.get('wacc_components_input', {})
            key_ass = res.get('key_assumptions', {})
            scenario = res.get('scenario_analysis')

            lines.append("### 1. 估值方法概述")
            lines.append("本报告采用**两阶段自由现金流贴现（FCFF）模型**进行估值。第一阶段为明确预测期（{}年），详细预测公司未来的自由现金流；第二阶段为终值期，假设公司进入稳定增长阶段。终值采用**永续增长法**计算。".format(key_ass.get('projection_years', 5)))

            lines.append("\n### 2. 数据来源")
            lines.append("- 历史财务数据：取自公司年报（利润表、资产负债表、现金流量表）。")
            lines.append("- 未来收入增长率：基于分析师一致预期（若无则使用历史平均增长率）。")
            lines.append("- 无风险利率：10年期美国国债收益率（取值方式：{}）。".format(res.get('metadata', {}).get('risk_free_method', 'latest')))
            lines.append("- 市场风险溢价：{}%（历史平均值）。".format(res.get('metadata', {}).get('market_premium', 0.06)*100))
            lines.append("- Beta：取自公司概览。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- **预测期年数**：{key_ass.get('projection_years', 5)} 年")
            lines.append(f"- **平均收入增长率**：{key_ass.get('avg_revenue_growth', 0):.2f}%")
            lines.append(f"- **平均EBITDA利润率**：{key_ass.get('avg_ebitda_margin', 0):.2f}%（取自历史5年平均值）")
            lines.append(f"- **永续增长率**：{key_ass.get('terminal_growth', 2.5):.2f}%（经合理性检查，不超过5%且低于WACC）")
            lines.append(f"- **平均资本支出/收入**：{ass_in.get('capex_percent', [0])[0]*100:.2f}%（历史平均）")
            lines.append(f"- **平均营运资本/收入**：{ass_in.get('nwc_percent', [0])[0]*100:.2f}%（历史平均）")
            lines.append(f"- **税率**：{wacc_comp.get('tax_rate', 0.25)*100:.2f}%（历史平均）")
            lines.append(f"- **折旧率**：{ass_in.get('depreciation_rate', 0.03)*100:.2f}%（历史平均）")

            # 逐年假设表格
            lines.append("\n**详细假设（预测期逐年）**：")
            lines.append("| 年份 | 收入增长率 | EBITDA利润率 | 资本支出/收入 | 营运资本/收入 |")
            lines.append("|------|------------|--------------|----------------|----------------|")
            rev_growth_list = ass_in.get('revenue_growth', [])
            ebitda_margin_list = ass_in.get('ebitda_margin', [])
            capex_pct_list = ass_in.get('capex_percent', [])
            nwc_pct_list = ass_in.get('nwc_percent', [])
            proj_years = ass_in.get('projection_years', len(rev_growth_list))
            for i in range(proj_years):
                rg = rev_growth_list[i] * 100 if i < len(rev_growth_list) else 0
                em = ebitda_margin_list[i] * 100 if i < len(ebitda_margin_list) else 0
                cp = capex_pct_list[i] * 100 if i < len(capex_pct_list) else 0
                nwc = nwc_pct_list[i] * 100 if i < len(nwc_pct_list) else 0
                lines.append(f"| {i+1} | {rg:.1f}% | {em:.1f}% | {cp:.1f}% | {nwc:.1f}% |")

            lines.append("\n### 4. WACC计算明细")
            lines.append(f"- 无风险利率：{wacc_comp.get('risk_free_rate', 0)*100:.2f}%")
            lines.append(f"- Beta：{wacc_comp.get('beta', 1.0):.2f}")
            lines.append(f"- 市场风险溢价：{wacc_comp.get('market_premium', 0.06)*100:.2f}%")
            cost_of_equity = wacc_comp.get('risk_free_rate', 0) + wacc_comp.get('beta', 1.0) * wacc_comp.get('market_premium', 0.06)
            lines.append(f"- 股权成本（CAPM）：{cost_of_equity:.2%}")
            lines.append(f"- 债务成本（税前）：{wacc_comp.get('cost_of_debt', 0)*100:.2f}%")
            lines.append(f"- 税率：{wacc_comp.get('tax_rate', 0.25)*100:.2f}%")
            lines.append(f"- 债务/股权比例：{wacc_comp.get('debt_to_equity', 0.5):.2f}")
            d_e = wacc_comp.get('debt_to_equity', 0.5)
            equity_weight = 1 / (1 + d_e)
            debt_weight = d_e / (1 + d_e)
            lines.append(f"- 股权权重：{equity_weight*100:.1f}%，债务权重：{debt_weight*100:.1f}%")
            lines.append(f"- **WACC**：{v['wacc_formatted']}")

            lines.append("\n### 5. 自由现金流预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | EBITDA | 折旧 | EBIT | 税 | NOPAT | 资本支出 | 营运资本变动 | 自由现金流 |")
            lines.append("|------|------|--------|------|------|-----|-------|----------|--------------|------------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                ebitda = f"{proj['ebitda'][i]/1e6:.0f}"
                dep = f"{proj['depreciation'][i]/1e6:.0f}"
                ebit = f"{proj['ebit'][i]/1e6:.0f}"
                tax = f"{proj['tax'][i]/1e6:.0f}"
                nopat = f"{proj['nopat'][i]/1e6:.0f}"
                capex = f"{proj['capex'][i]/1e6:.0f}"
                nwc_change = f"{proj['nwc_change'][i]/1e6:.0f}"
                fcf = f"{proj['fcf'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${ebitda} | ${dep} | ${ebit} | ${tax} | ${nopat} | ${capex} | ${nwc_change} | ${fcf} |")

            lines.append("\n### 6. 终值计算")
            tv = v['terminal_value']
            pv_terminal = v['pv_of_terminal']
            g = key_ass.get('terminal_growth', 2.5) / 100
            wacc_val = v['wacc']
            lines.append(f"- 预测期末自由现金流：${proj['fcf'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{g:.2%}")
            lines.append(f"- 终值（未折现）= FCF₅ × (1+g) / (WACC - g) = {tv/1e6:.0f} 百万")
            lines.append(f"- 终值现值 = 终值 / (1+WACC)^5 = ${pv_terminal/1e6:.0f} 百万")

            lines.append("\n### 7. 企业价值")
            ev_total = v['enterprise_value']
            pv_fcf = v['pv_of_fcf']
            lines.append(f"- 预测期现金流现值：${pv_fcf/1e6:.0f} 百万")
            lines.append(f"- 终值现值：${pv_terminal/1e6:.0f} 百万")
            lines.append(f"- **企业价值** = 预测期现值 + 终值现值 = ${ev_total/1e6:.0f} 百万")
            lines.append(f"- 终值占比：{v['terminal_percent']:.1f}%")

            lines.append("\n### 8. 股权价值与每股价值")
            net_debt = eq.get('net_debt', 0)
            cash = eq.get('cash', 0)
            shares = eq.get('shares_outstanding', 1)
            equity_val = eq.get('equity_value')
            vps = eq.get('value_per_share')
            lines.append(f"- 净债务：${net_debt/1e6:.0f} 百万")
            lines.append(f"- 现金：${cash/1e6:.0f} 百万")
            lines.append(f"- 股本：{shares/1e6:.2f} 百万股")
            lines.append(f"- **股权价值** = 企业价值 - 净债务 + 现金 = ${equity_val/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = 股权价值 / 股本 = ${vps:.2f}")

            # 敏感性分析
            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 9. 敏感性分析")
                lines.append("对WACC和永续增长率进行二维敏感性分析，变动范围分别为±20%和1%~5%。")
                lines.append(f"- WACC变动 ±20% 导致企业价值变化 {sa['wacc_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致企业价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                lines.append("\n**企业价值敏感性矩阵（单位：百万美元）**：")
                growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                lines.append("| WACC \\ g | " + " | ".join(growth_range) + " |")
                lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                for i, w in enumerate(sa['wacc_range']):
                    row = [f"{w*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['ev_matrix'][i]]
                    lines.append("| " + " | ".join(row) + " |")

            # 情景分析
            if scenario:
                lines.append("\n### 10. 情景分析")
                lines.append("| 情景 | 概率 | 企业价值 | 平均收入增长率 | 平均EBITDA利润率 | WACC |")
                lines.append("|------|------|----------|----------------|------------------|------|")
                for s in scenario['scenarios']:
                    lines.append(f"| {s['name']} | {s['probability']*100:.0f}% | ${s['enterprise_value']/1e6:.0f}M | {s['avg_revenue_growth']*100:.1f}% | {s['avg_ebitda_margin']*100:.1f}% | {s['wacc']*100:.1f}% |")
                lines.append(f"\n- **期望企业价值**：${scenario['expected_values']['enterprise_value']/1e6:.0f}M")
                lines.append(f"- **估值区间**：${scenario['range']['min_ev']/1e6:.0f}M ~ ${scenario['range']['max_ev']/1e6:.0f}M")

            lines.append("\n### 11. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${vps:.2f}**。")
            lines.append("- **风险提示**：估值结果高度依赖未来假设，特别是永续增长率和WACC。建议结合敏感性分析结果判断合理区间。")
            lines.append("- **局限性**：模型未考虑潜在并购、股份回购、可转换债券等复杂资本结构变化。")

        elif model_name == 'fcfe':
            v = res['valuation']
            proj = res.get('projections', {})
            key_ass = res.get('key_assumptions', {})
            meta = res.get('metadata', {})

            lines.append("### 1. 模型简介")
            lines.append("股权自由现金流模型（FCFE）：直接计算股东可获得的现金流，包括净利润、折旧、资本支出、营运资本变动和净借款。使用股权成本折现。")

            lines.append("\n### 2. 数据来源")
            lines.append("同DCF模型，另使用净利润预测（优先分析师EPS，否则历史净利润率）和净借款预测（历史净借款/收入比例）。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- 收入增长率：同DCF（平均 {key_ass.get('avg_revenue_growth', 0):.2f}%）")
            lines.append(f"- 净利润预测方法：{'分析师EPS' if '使用分析师EPS' in res.get('metadata', {}).get('notes', '') else '历史平均净利润率'}，平均净利润率 {key_ass.get('avg_net_income_margin', 0):.2f}%")
            lines.append(f"- 折旧率：{proj['depreciation'][0]/proj['revenue'][0]:.2%}（同DCF）")
            lines.append(f"- 资本支出/收入：{proj['capex'][0]/proj['revenue'][0]:.2%}（同DCF）")
            lines.append(f"- 营运资本变动/收入：{proj['nwc_change'][0]/proj['revenue'][0]:.2%}（近似）")
            lines.append(f"- 净借款/收入：{proj['net_borrowing'][0]/proj['revenue'][0]:.2%}（历史平均）")
            lines.append(f"- 股权成本：{v['cost_of_equity_formatted']}（CAPM）")
            lines.append(f"- 永续增长率：{v['terminal_growth_formatted']}（经上限检查）")

            lines.append("\n### 4. FCFE预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | 净利润 | 折旧 | 资本支出 | NWC变动 | 净借款 | FCFE | PV(FCFE) |")
            lines.append("|------|------|--------|------|----------|---------|--------|------|----------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                ni = f"{proj['net_income'][i]/1e6:.0f}"
                dep = f"{proj['depreciation'][i]/1e6:.0f}"
                capex = f"{proj['capex'][i]/1e6:.0f}"
                nwc = f"{proj['nwc_change'][i]/1e6:.0f}"
                nb = f"{proj['net_borrowing'][i]/1e6:.0f}"
                fcfe = f"{proj['fcfe'][i]/1e6:.0f}"
                pv = f"{proj['pv_fcfe'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${ni} | ${dep} | ${capex} | ${nwc} | ${nb} | ${fcfe} | ${pv} |")

            lines.append("\n### 5. 终值计算")
            lines.append(f"- 预测期末FCFE：${proj['fcfe'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{v['terminal_growth']:.2%}")
            lines.append(f"- 终值 = FCFE₅ × (1+g) / (r_e - g) = {v['pv_of_terminal']/1e6:.0f} 百万（现值）")

            lines.append("\n### 6. 股权价值")
            lines.append(f"- 预测期现值：${v['pv_of_fcfe']/1e6:.0f} 百万")
            lines.append(f"- 终值现值：${v['pv_of_terminal']/1e6:.0f} 百万")
            lines.append(f"- 股权价值 = 预测期现值 + 终值现值 = ${v['equity_value']/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = 股权价值 / 股本 = ${v['value_per_share']:.2f}")

            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 7. 敏感性分析")
                lines.append(f"- 股权成本变动 ±20% 导致股权价值变化 {sa['cost_of_equity_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致股权价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                # 输出矩阵
                if 'equity_matrix' in sa:
                    lines.append("\n**股权价值敏感性矩阵（单位：百万美元）**：")
                    growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                    lines.append("| 股权成本 \\ g | " + " | ".join(growth_range) + " |")
                    lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                    for i, coe in enumerate(sa['coe_range']):
                        row = [f"{coe*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['equity_matrix'][i]]
                        lines.append("| " + " | ".join(row) + " |")

            lines.append("\n### 8. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${v['value_per_share']:.2f}**。")
            lines.append("- **风险提示**：FCFE模型对净利润预测和净借款假设敏感，适用于资本结构变化较大的公司。")
            lines.append("- **局限性**：净借款预测基于历史比例，可能不反映未来融资计划。")

        elif model_name == 'rim':
            v = res['valuation']
            proj = res.get('projections', {})
            key_ass = res.get('key_assumptions', {})

            lines.append("### 1. 模型简介")
            lines.append("剩余收益模型（RIM）：权益价值 = 期初账面价值 + 未来剩余收益现值。剩余收益 = 净利润 - 股权成本 × 期初账面价值。")

            lines.append("\n### 2. 数据来源")
            lines.append("期初账面价值取自最新资产负债表，净利润预测同FCFE，股利预测基于历史支付率。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- 收入增长率：同DCF（平均 {key_ass.get('avg_revenue_growth', 0):.2f}%）")
            lines.append(f"- 净利润预测：同FCFE，平均净利润率 {key_ass.get('avg_roe', 0)/100:.2%}（ROE近似）")
            lines.append(f"- 股利支付率：历史平均 {proj['dividends'][0]/proj['net_income'][0] if proj['net_income'][0]!=0 else 0:.2%}（若无则为0）")
            lines.append(f"- 股权成本：{v['cost_of_equity_formatted']}")
            lines.append(f"- 永续增长率：{v['terminal_growth_formatted']}")

            lines.append("\n### 4. 剩余收益预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | 净利润 | 股利 | 期初BV | 剩余收益 | PV(RI) |")
            lines.append("|------|------|--------|------|--------|----------|--------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                ni = f"{proj['net_income'][i]/1e6:.0f}"
                div = f"{proj['dividends'][i]/1e6:.0f}"
                bv = f"{proj['book_value_begin'][i]/1e6:.0f}"
                ri = f"{proj['residual_income'][i]/1e6:.0f}"
                pv = f"{proj['pv_ri'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${ni} | ${div} | ${bv} | ${ri} | ${pv} |")

            lines.append("\n### 5. 终值计算")
            lines.append(f"- 预测期末剩余收益：${proj['residual_income'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{v['terminal_growth']:.2%}")
            lines.append(f"- 终值 = 剩余收益₅ × (1+g) / (r_e - g) = {v['pv_of_terminal']/1e6:.0f} 百万（现值）")

            lines.append("\n### 6. 股权价值")
            lines.append(f"- 期初账面价值 BV0：${v['beginning_book_value']/1e6:.0f} 百万")
            lines.append(f"- 剩余收益现值：${v['pv_of_ri']/1e6:.0f} 百万")
            lines.append(f"- 终值现值：${v['pv_of_terminal']/1e6:.0f} 百万")
            lines.append(f"- 股权价值 = BV0 + PV(RI) + PV(终值) = ${v['equity_value']/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = ${v['value_per_share']:.2f}")

            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 7. 敏感性分析")
                lines.append(f"- 股权成本变动 ±20% 导致股权价值变化 {sa['cost_of_equity_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致股权价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                if 'equity_matrix' in sa:
                    lines.append("\n**股权价值敏感性矩阵（单位：百万美元）**：")
                    growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                    lines.append("| 股权成本 \\ g | " + " | ".join(growth_range) + " |")
                    lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                    for i, coe in enumerate(sa['coe_range']):
                        row = [f"{coe*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['equity_matrix'][i]]
                        lines.append("| " + " | ".join(row) + " |")

            lines.append("\n### 8. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${v['value_per_share']:.2f}**。")
            lines.append("- **风险提示**：RIM模型对账面价值和净利润预测敏感，适用于盈利稳定的公司。")
            lines.append("- **局限性**：股利支付率假设可能偏离实际，影响账面价值递推。")

        elif model_name == 'eva':
            v = res['valuation']
            proj = res.get('projections', {})
            key_ass = res.get('key_assumptions', {})

            lines.append("### 1. 模型简介")
            lines.append("经济增加值模型（EVA）：企业价值 = 期初投入资本 + 未来EVA现值。EVA = NOPAT - WACC × 期初投入资本。")

            lines.append("\n### 2. 数据来源")
            lines.append("投入资本取自资产负债表（总负债+股东权益），NOPAT基于EBIT利润率预测，WACC同DCF。")

            lines.append("\n### 3. 关键假设")
            lines.append(f"- 收入增长率：同DCF（平均 {key_ass.get('avg_revenue_growth', 0):.2f}%）")
            lines.append(f"- EBIT利润率：{key_ass.get('avg_ebit_margin', 0):.2f}%（历史平均，EBIT = EBITDA - 折旧）")
            lines.append(f"- 投入资本周转率：{key_ass.get('avg_invested_capital_turnover', 0):.2f}（收入/投入资本，历史平均）")
            lines.append(f"- 税率：{v.get('wacc', 0):.2%}中的税率部分")
            lines.append(f"- WACC：{v['wacc_formatted']}")
            lines.append(f"- 永续增长率：{v['terminal_growth_formatted']}（经上限检查）")

            lines.append("\n### 4. EVA预测（单位：百万美元）")
            lines.append("| 年份 | 收入 | NOPAT | 期初投入资本 | EVA | PV(EVA) |")
            lines.append("|------|------|-------|--------------|-----|---------|")
            for i, yr in enumerate(proj['year']):
                rev = f"{proj['revenue'][i]/1e6:.0f}"
                nopat = f"{proj['nopat'][i]/1e6:.0f}"
                ic = f"{proj['invested_capital'][i]/1e6:.0f}"
                eva = f"{proj['eva'][i]/1e6:.0f}"
                pv = f"{proj['pv_eva'][i]/1e6:.0f}"
                lines.append(f"| {yr} | ${rev} | ${nopat} | ${ic} | ${eva} | ${pv} |")

            lines.append("\n### 5. 终值计算")
            lines.append(f"- 预测期末EVA：${proj['eva'][-1]/1e6:.0f} 百万")
            lines.append(f"- 永续增长率 g：{v['terminal_growth']:.2%}")
            lines.append(f"- 终值 = EVA₅ × (1+g) / (WACC - g) = {v['pv_of_terminal']/1e6:.0f} 百万（现值）")

            lines.append("\n### 6. 企业价值与股权价值")
            lines.append(f"- 期初投入资本：${v['beginning_invested_capital']/1e6:.0f} 百万")
            lines.append(f"- EVA现值合计：${v['pv_of_eva']/1e6:.0f} 百万")
            lines.append(f"- 终值现值：${v['pv_of_terminal']/1e6:.0f} 百万")
            lines.append(f"- 企业价值 = 期初投入资本 + EVA现值 + 终值现值 = ${v['enterprise_value']/1e6:.0f} 百万")
            lines.append(f"- 股权价值 = 企业价值 - 净债务 + 现金 = ${v['equity_value']/1e6:.0f} 百万")
            lines.append(f"- **每股价值** = ${v['value_per_share']:.2f}")

            if res.get('sensitivity_analysis'):
                sa = res['sensitivity_analysis']
                lines.append("\n### 7. 敏感性分析")
                lines.append(f"- WACC变动 ±20% 导致股权价值变化 {sa['wacc_sensitivity']['impact']:.1f}%")
                lines.append(f"- 永续增长率在 1%~5% 之间变动导致股权价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
                if 'equity_matrix' in sa:
                    lines.append("\n**股权价值敏感性矩阵（单位：百万美元）**：")
                    growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
                    lines.append("| WACC \\ g | " + " | ".join(growth_range) + " |")
                    lines.append("|" + "---|" * (len(sa['growth_range'])+1))
                    for i, w in enumerate(sa['wacc_range']):
                        row = [f"{w*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['equity_matrix'][i]]
                        lines.append("| " + " | ".join(row) + " |")

            lines.append("\n### 8. 结果评估与风险提示")
            lines.append(f"- 模型得出的每股价值为 **${v['value_per_share']:.2f}**。")
            lines.append("- **风险提示**：EVA模型对投入资本周转率和EBIT利润率假设敏感，适用于资本密集型公司。")
            lines.append("- **局限性**：简化EVA未对研发、商誉等进行复杂调整，可能低估真实经济利润。")

    # DCF/FCFE/RIM 联合研判
    dcf_fcfe_rim = [model for model in ['dcf', 'fcfe', 'rim'] if model in results and results[model].get('success')]
    if len(dcf_fcfe_rim) >= 2:
        lines.append("\n## DCF/FCFE/RIM 联合研判")
        lines.append("| 模型 | 每股价值 | 折现率 | 终值占比 |")
        lines.append("|------|----------|--------|----------|")
        for model in ['dcf', 'fcfe', 'rim']:
            if model in results and results[model].get('success'):
                res = results[model]
                vps = get_value_per_share(res)
                # 获取折现率
                if 'valuation' in res:
                    disc = res['valuation'].get('wacc_formatted', res['valuation'].get('cost_of_equity_formatted', 'N/A'))
                    term_pct = f"{res['valuation'].get('terminal_percent', 0):.1f}%"
                else:
                    disc = 'N/A'
                    term_pct = 'N/A'
                lines.append(f"| {model.upper()} | {vps} | {disc} | {term_pct} |")
        lines.append("\n**差异分析**：")
        lines.append("- DCF（企业自由现金流）反映整体企业价值，对资本结构敏感。")
        lines.append("- FCFE（股权自由现金流）直接衡量股东回报，适用于高杠杆公司。")
        lines.append("- RIM（剩余收益）基于会计数据，对盈利稳定公司更可靠。")
        lines.append("三者结果差异提示估值需结合公司特点综合判断。")

    # 综合对比分析（所有成功模型）
    lines.append("\n## 综合对比分析")
    successful = [(model, res) for model, res in results.items() if res.get('success')]
    if len(successful) > 1:
        values = []
        model_names = []
        for model_name, res in successful:
            if 'equity_valuation' in res and res['equity_valuation']:
                v = res['equity_valuation'].get('value_per_share')
            else:
                v = res.get('valuation', {}).get('value_per_share')
            if v is not None:
                values.append(v)
                model_names.append(model_name)
        if values:
            avg_val = sum(values) / len(values)
            min_val = min(values)
            max_val = max(values)
            lines.append(f"- **平均值**：${avg_val:.2f}")
            lines.append(f"- **最小值**：${min_val:.2f}（{model_names[values.index(min_val)]}）")
            lines.append(f"- **最大值**：${max_val:.2f}（{model_names[values.index(max_val)]}）")
            lines.append(f"- **区间宽度**：${max_val - min_val:.2f} ({(max_val - min_val)/avg_val*100:.1f}%)")
            if current_price > 0:
                if current_price < min_val:
                    lines.append(f"- **当前股价 ${current_price:.2f} 低于所有模型估值**，可能存在低估。")
                elif current_price > max_val:
                    lines.append(f"- **当前股价 ${current_price:.2f} 高于所有模型估值**，可能存在高估。")
                else:
                    lines.append(f"- **当前股价 ${current_price:.2f} 落在估值区间内**。")

    lines.append("\n## 风险提示与使用说明")
    lines.append("- 所有估值结果均基于对未来财务表现的假设，实际结果可能存在差异。")
    lines.append("- 模型对永续增长率、折现率等参数敏感，建议结合敏感性分析判断合理区间。")
    lines.append("- 不同模型的假设基础相同（收入增长率一致），确保可比性。")
    lines.append("- 本报告旨在提供多维度估值视角，不构成投资建议。")
    lines.append("- 对于缺少数据（如股息）的模型，已采用保守默认值并提示。")

    lines.append("\n---\n")
    lines.append(f"*报告生成时间：{datetime.now().isoformat()}*")
    return "\n".join(lines)


async def process_symbol(
    symbol: str,
    data_dir: str,
    output_dir: str,
    models: List[str],
    projection_years: int = 5,
    terminal_growth: float = 0.025,
    risk_free_method: str = "latest",
    market_premium: float = 0.06,
    include_detailed: bool = True,
    sensitivity: bool = True,
) -> bool:
    logger.info(f"开始处理股票: {symbol}, 模型: {models}")
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    results = {}
    current_price = load_current_price(symbol, data_dir)

    # 运行 DCF 模型
    if 'dcf' in models:
        try:
            val = DCFAutoValuation(data_dir=data_dir)
            dcf_result = await val.run_valuation(
                symbol=symbol,
                projection_years=projection_years,
                terminal_growth=terminal_growth,
                risk_free_method=risk_free_method,
                market_premium=market_premium,
                terminal_method=TerminalValueMethod.PERPETUITY_GROWTH,
                sensitivity=sensitivity,
                scenario=False,
                include_detailed=include_detailed
            )
            results['dcf'] = dcf_result
        except Exception as e:
            logger.error(f"DCF 模型运行失败: {e}")
            results['dcf'] = {"success": False, "error": str(e)}

    # 运行 FCFE 模型
    if 'fcfe' in models:
        try:
            fcfe_val = FCFEValuation(data_dir=data_dir)
            fcfe_result = await fcfe_val.run_valuation(
                symbol=symbol,
                projection_years=projection_years,
                terminal_growth=terminal_growth,
                risk_free_method=risk_free_method,
                market_premium=market_premium,
                include_detailed=include_detailed,
                sensitivity=sensitivity
            )
            results['fcfe'] = fcfe_result
        except Exception as e:
            logger.error(f"FCFE 模型运行失败: {e}")
            results['fcfe'] = {"success": False, "error": str(e)}

    # 运行 RIM 模型
    if 'rim' in models:
        try:
            rim_val = RIMValuation(data_dir=data_dir)
            rim_result = await rim_val.run_valuation(
                symbol=symbol,
                projection_years=projection_years,
                terminal_growth=terminal_growth,
                risk_free_method=risk_free_method,
                market_premium=market_premium,
                include_detailed=include_detailed,
                sensitivity=sensitivity
            )
            results['rim'] = rim_result
        except Exception as e:
            logger.error(f"RIM 模型运行失败: {e}")
            results['rim'] = {"success": False, "error": str(e)}

    # 运行 EVA 模型
    if 'eva' in models:
        try:
            eva_val = EVAValuation(data_dir=data_dir)
            eva_result = await eva_val.run_valuation(
                symbol=symbol,
                projection_years=projection_years,
                terminal_growth=terminal_growth,
                risk_free_method=risk_free_method,
                market_premium=market_premium,
                include_detailed=include_detailed,
                sensitivity=sensitivity
            )
            results['eva'] = eva_result
        except Exception as e:
            logger.error(f"EVA 模型运行失败: {e}")
            results['eva'] = {"success": False, "error": str(e)}

    # 保存 JSON 结果
    json_path = Path(output_dir) / f"valuation_{symbol}_multi.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, default=str, ensure_ascii=False)
    logger.info(f"JSON 报告已保存: {json_path}")

    # 生成综合 Markdown 报告
    md_path = Path(output_dir) / f"valuation_{symbol}_multi.md"
    md_content = generate_combined_report(symbol, results, current_price)
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(md_content)
    logger.info(f"Markdown 综合报告已保存: {md_path}")

    # 统计成功数量
    success_count = sum(1 for r in results.values() if r.get('success', False))
    logger.info(f"{symbol} 处理完成，成功模型: {success_count}/{len(models)}")
    return success_count > 0


async def main():
    parser = argparse.ArgumentParser(description="多模型估值工具")
    parser.add_argument("--symbol", type=str, help="指定股票代码，例如 AAPL。不指定则处理所有可用股票。")
    parser.add_argument("--models", type=str, default="dcf,fcfe,rim,eva", help="要运行的模型，逗号分隔，例如 dcf,fcfe,rim,eva")
    parser.add_argument("--data_dir", type=str, default="data", help="数据文件夹路径，默认为 data")
    parser.add_argument("--output_dir", type=str, default="output", help="输出文件夹路径，默认为 output")
    parser.add_argument("--projection_years", type=int, default=5, help="预测年数，默认5")
    parser.add_argument("--terminal_growth", type=float, default=0.025, help="永续增长率，默认0.025")
    parser.add_argument("--risk_free_method", type=str, default="latest", choices=["latest", "1y_avg"], help="无风险利率取值方式")
    parser.add_argument("--market_premium", type=float, default=0.06, help="市场风险溢价，默认0.06")
    parser.add_argument("--no_sensitivity", action="store_true", help="禁用所有模型的敏感性分析")
    parser.add_argument("--no_detailed", action="store_true", help="不包含详细预测表")

    args = parser.parse_args()
    models = [m.strip().lower() for m in args.models.split(',')]
    sensitivity = not args.no_sensitivity

    symbols = []
    if args.symbol:
        symbols = [args.symbol.upper()]
        logger.info(f"处理指定股票: {symbols[0]}, 模型: {models}, 敏感性分析: {sensitivity}")
    else:
        symbols = find_available_symbols(args.data_dir)
        if not symbols:
            logger.error("在数据文件夹中未找到任何股票代码，请检查文件命名格式。")
            sys.exit(1)

    success_count = 0
    for sym in symbols:
        ok = await process_symbol(
            symbol=sym,
            data_dir=args.data_dir,
            output_dir=args.output_dir,
            models=models,
            projection_years=args.projection_years,
            terminal_growth=args.terminal_growth,
            risk_free_method=args.risk_free_method,
            market_premium=args.market_premium,
            include_detailed=not args.no_detailed,
            sensitivity=sensitivity
        )
        if ok:
            success_count += 1

    logger.info(f"所有处理完成，成功股票数: {success_count}/{len(symbols)}")


if __name__ == "__main__":
    asyncio.run(main())