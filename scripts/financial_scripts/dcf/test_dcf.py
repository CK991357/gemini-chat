#!/usr/bin/env python3
"""
通用DCF估值测试脚本
自动扫描data/文件夹中的股票数据文件，运行DCF估值，输出JSON和Markdown报告。

用法:
    python test_dcf.py                     # 处理所有股票
    python test_dcf.py --symbol MSFT       # 只处理MSFT
"""

import os
import sys
import asyncio
import json
import argparse
import logging
from pathlib import Path
from datetime import datetime
from typing import List

from dcf_auto import DCFAutoValuation
from dcf_valuation_tool import TerminalValueMethod

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


def generate_markdown_report(symbol: str, result: dict) -> str:
    lines = []
    lines.append(f"# {result.get('company_name', symbol)} 估值报告")
    lines.append(f"\n**报告生成时间**：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  \n")

    if not result['success']:
        lines.append("## ❌ 估值失败")
        lines.append(f"- 错误：{result.get('error')}")
        lines.append(f"- 建议：{result.get('suggestion')}")
        return "\n".join(lines)

    # 1. 估值方法概述
    terminal_method = result['metadata']['terminal_method']
    lines.append("## 1. 估值方法概述")
    lines.append(f"本报告采用**两阶段自由现金流贴现（DCF）模型**进行估值。第一阶段为明确预测期（{result['key_assumptions']['projection_years']}年），详细预测公司未来的自由现金流；第二阶段为终值期，假设公司进入稳定增长阶段。终值采用**{terminal_method}**计算。")

    # 2. 数据来源
    lines.append("\n## 2. 数据来源")
    lines.append(f"- 历史财务数据：取自公司年报，时间范围为 {result['projections']['year'][0]} 年至最新年度（如有）。")
    lines.append("- 分析师预期：来自市场一致预期数据，包括未来收入、EPS等。")
    lines.append("- 无风险利率：采用10年期美国国债收益率，取值方式为最新交易日（或最近一年平均）。")
    lines.append("- 市场风险溢价：采用历史平均值6%。")

    # 3. 关键假设
    lines.append("\n## 3. 关键假设")
    ass = result['key_assumptions']
    lines.append(f"- **预测期年数**：{ass['projection_years']} 年")
    lines.append(f"- **平均收入增长率**：{ass['avg_revenue_growth']:.2f}%")
    lines.append(f"- **平均EBITDA利润率**：{ass['avg_ebitda_margin']:.2f}%")
    lines.append(f"- **永续增长率**：{ass['terminal_growth']:.2f}%")
    lines.append(f"- **终端价值方法**：{ass['terminal_method']}")

    assumptions_input = result.get('assumptions_input', {})
    if assumptions_input:
        lines.append("\n**详细假设（预测期逐年）**：")
        lines.append("| 年份 | 收入增长率 | EBITDA利润率 | 资本支出/收入 | 营运资本/收入 |")
        lines.append("|------|------------|--------------|----------------|----------------|")
        rev_growth_list = assumptions_input.get('revenue_growth', [])
        ebitda_margin_list = assumptions_input.get('ebitda_margin', [])
        capex_pct_list = assumptions_input.get('capex_percent', [])
        nwc_pct_list = assumptions_input.get('nwc_percent', [])
        proj_years = assumptions_input.get('projection_years', len(rev_growth_list))
        for i in range(proj_years):
            rg = rev_growth_list[i] * 100 if i < len(rev_growth_list) else 0
            em = ebitda_margin_list[i] * 100 if i < len(ebitda_margin_list) else 0
            cp = capex_pct_list[i] * 100 if i < len(capex_pct_list) else 0
            nwc = nwc_pct_list[i] * 100 if i < len(nwc_pct_list) else 0
            lines.append(f"| {i+1} | {rg:.1f}% | {em:.1f}% | {cp:.1f}% | {nwc:.1f}% |")

    # 4. WACC计算明细
    lines.append("\n## 4. 加权平均资本成本（WACC）")
    wacc_comp = result.get('wacc_components_input', {})
    if wacc_comp:
        lines.append(f"- 无风险利率：{wacc_comp.get('risk_free_rate', 0)*100:.2f}%")
        lines.append(f"- Beta：{wacc_comp.get('beta', 1.0):.2f}")
        lines.append(f"- 市场风险溢价：{wacc_comp.get('market_premium', 0.06)*100:.2f}%")
        cost_of_equity = wacc_comp.get('risk_free_rate', 0) + wacc_comp.get('beta', 1.0) * wacc_comp.get('market_premium', 0.06)
        lines.append(f"- 股权成本（CAPM）：{cost_of_equity*100:.2f}%")
        lines.append(f"- 债务成本（税前）：{wacc_comp.get('cost_of_debt', 0)*100:.2f}%")
        lines.append(f"- 税率：{wacc_comp.get('tax_rate', 0.25)*100:.2f}%")
        lines.append(f"- 债务/股权比例：{wacc_comp.get('debt_to_equity', 0.5):.2f}")
        d_e = wacc_comp.get('debt_to_equity', 0.5)
        equity_weight = 1 / (1 + d_e)
        debt_weight = d_e / (1 + d_e)
        lines.append(f"- 股权权重：{equity_weight*100:.1f}%，债务权重：{debt_weight*100:.1f}%")
    wacc_val = result['valuation']['wacc']
    lines.append(f"\n最终计算得到的WACC为 **{wacc_val*100:.2f}%**。")

    # 5. 现金流预测过程
    if 'projections' in result:
        proj = result['projections']
        lines.append("\n## 5. 自由现金流预测")
        lines.append("| 年份 | 收入 | EBITDA | 折旧 | EBIT | 税 | NOPAT | 资本支出 | 营运资本变动 | 自由现金流 |")
        lines.append("|------|------|--------|------|------|-----|-------|----------|--------------|------------|")
        for i, yr in enumerate(proj['year']):
            revenue = f"{proj['revenue'][i]/1e6:.0f}"
            ebitda = f"{proj['ebitda'][i]/1e6:.0f}"
            dep = f"{proj['depreciation'][i]/1e6:.0f}"
            ebit = f"{proj['ebit'][i]/1e6:.0f}"
            tax = f"{proj['tax'][i]/1e6:.0f}"
            nopat = f"{proj['nopat'][i]/1e6:.0f}"
            capex = f"{proj['capex'][i]/1e6:.0f}"
            nwc_change = f"{proj['nwc_change'][i]/1e6:.0f}"
            fcf = f"{proj['fcf'][i]/1e6:.0f}"
            lines.append(f"| {yr} | ${revenue} | ${ebitda} | ${dep} | ${ebit} | ${tax} | ${nopat} | ${capex} | ${nwc_change} | ${fcf} |")

    # 6. 终值计算
    lines.append("\n## 6. 终值计算")
    if result['valuation'].get('terminal_value'):
        tv = result['valuation']['terminal_value']
        lines.append(f"- 终值（未折现）：${tv:,.0f}")
        lines.append(f"- 终值现值：${result['valuation']['pv_of_terminal']:,.0f}")
        terminal_growth = result['key_assumptions']['terminal_growth'] / 100
        lines.append(f"- 计算公式（永续增长法）：终值 = 预测期末FCF × (1 + g) / (WACC - g)，其中 g = {terminal_growth:.2f}%")

    # 7. 企业价值
    lines.append("\n## 7. 企业价值")
    ev = result['valuation']['enterprise_value']
    lines.append(f"- **企业价值** = 预测期现金流现值 + 终值现值 = **${ev:,.0f}**")
    lines.append(f"- 其中终值占比：{result['valuation']['terminal_percent']:.1f}%")

    # 8. 股权价值
    if result.get('equity_valuation'):
        eq = result['equity_valuation']
        lines.append("\n## 8. 股权价值与每股价值")
        lines.append(f"- 净债务：${eq.get('net_debt', 0):,.0f}")
        lines.append(f"- 现金：${eq.get('cash', 0):,.0f}")
        lines.append(f"- 股本：{eq.get('shares_outstanding', 0):,.0f} 股")
        lines.append(f"- **股权价值** = 企业价值 - 净债务 + 现金 = **{eq['equity_value_formatted']}**")
        lines.append(f"- **每股价值** = 股权价值 / 股本 = **{eq['value_per_share_formatted']}**")
        if 'current_price' in result:
            current = result['current_price']
            vps = eq['value_per_share']
            lines.append(f"- **当前股价**：${current:.2f}")
            lines.append(f"- **估值溢价**：{(vps - current)/current*100:+.1f}%")

    # 9. 敏感性分析（增加 None 判断）
    if result.get('sensitivity_analysis') and result['sensitivity_analysis'] is not None:
        sa = result['sensitivity_analysis']
        lines.append("\n## 9. 敏感性分析")
        lines.append("以下分析WACC和永续增长率变动对企业价值的影响：")
        lines.append(f"- WACC变动 ±20% 导致企业价值变化 {sa['wacc_sensitivity']['impact']:.1f}%")
        lines.append(f"- 永续增长率在 1%~5% 之间变动导致企业价值变化 {sa['growth_sensitivity']['impact']:.1f}%")
        lines.append("\n**企业价值敏感性矩阵（单位：百万美元）**：")
        growth_range = [f"{g*100:.1f}%" for g in sa['growth_range']]
        lines.append("| WACC \\ g | " + " | ".join(growth_range) + " |")
        lines.append("|" + "---|" * (len(sa['growth_range'])+1))
        for i, w in enumerate(sa['wacc_range']):
            row = [f"{w*100:.1f}%"] + [f"{ev/1e6:.0f}" for ev in sa['ev_matrix'][i]]
            lines.append("| " + " | ".join(row) + " |")

    # 10. 情景分析
    if result.get('scenario_analysis'):
        sc = result['scenario_analysis']
        lines.append("\n## 10. 情景分析")
        lines.append("| 情景 | 概率 | 企业价值 | 平均收入增长率 | 平均EBITDA利润率 | WACC |")
        lines.append("|------|------|----------|----------------|------------------|------|")
        for s in sc['scenarios']:
            lines.append(f"| {s['name']} | {s['probability']*100:.0f}% | ${s['enterprise_value']/1e6:.0f}M | {s['avg_revenue_growth']*100:.1f}% | {s['avg_ebitda_margin']*100:.1f}% | {s['wacc']*100:.1f}% |")
        lines.append(f"\n- **期望企业价值**：${sc['expected_values']['enterprise_value']/1e6:.0f}M")
        lines.append(f"- **估值区间**：${sc['range']['min_ev']/1e6:.0f}M ~ ${sc['range']['max_ev']/1e6:.0f}M")

    # 11. 结果评估
    lines.append("\n## 11. 结果评估与风险提示")
    if result.get('equity_valuation'):
        vps = result['equity_valuation']['value_per_share']
        lines.append(f"- 模型得出的每股价值为 **${vps:.2f}**。")
    lines.append("- **风险提示**：估值结果高度依赖未来假设，特别是永续增长率和WACC。建议结合敏感性分析结果判断合理区间。")
    lines.append("- **局限性**：模型未考虑潜在并购、股份回购、可转换债券等复杂资本结构变化。")

    lines.append("\n---\n")
    lines.append(f"*报告生成时间：{result['metadata']['timestamp']}*")
    return "\n".join(lines)


async def process_symbol(symbol: str, data_dir: str, output_dir: str,
                         projection_years: int = 5,
                         terminal_growth: float = 0.025,
                         risk_free_method: str = "latest",
                         market_premium: float = 0.06,
                         sensitivity: bool = True,
                         scenario: bool = True,
                         include_detailed: bool = True) -> bool:
    logger.info(f"开始处理股票: {symbol}")
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    try:
        val = DCFAutoValuation(data_dir=data_dir)
        result = await val.run_valuation(
            symbol=symbol,
            projection_years=projection_years,
            terminal_growth=terminal_growth,
            risk_free_method=risk_free_method,
            market_premium=market_premium,
            terminal_method=TerminalValueMethod.PERPETUITY_GROWTH,
            sensitivity=sensitivity,
            scenario=scenario,
            include_detailed=include_detailed
        )

        # 读取当前股价
        quote_path = Path(data_dir) / f"quote_{symbol}.json"
        if quote_path.exists():
            with open(quote_path, 'r', encoding='utf-8') as f:
                quote = json.load(f)
                result['current_price'] = float(quote.get('price', 0))

        # 保存JSON
        json_path = Path(output_dir) / f"valuation_{symbol}.json"
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, default=str, ensure_ascii=False)
        logger.info(f"JSON报告已保存: {json_path}")

        # 保存Markdown
        md_path = Path(output_dir) / f"valuation_{symbol}.md"
        md_content = generate_markdown_report(symbol, result)
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(md_content)
        logger.info(f"Markdown报告已保存: {md_path}")

        return True

    except Exception as e:
        logger.error(f"处理股票 {symbol} 时发生错误: {str(e)}", exc_info=True)
        return False


async def main():
    parser = argparse.ArgumentParser(description="通用DCF估值工具")
    parser.add_argument("--symbol", type=str, help="指定股票代码，例如 MSFT。不指定则处理所有可用股票。")
    parser.add_argument("--data_dir", type=str, default="data", help="数据文件夹路径，默认为 data")
    parser.add_argument("--output_dir", type=str, default="output", help="输出文件夹路径，默认为 output")
    parser.add_argument("--projection_years", type=int, default=5, help="预测年数，默认5")
    parser.add_argument("--terminal_growth", type=float, default=0.025, help="永续增长率，默认0.025")
    parser.add_argument("--risk_free_method", type=str, default="latest", choices=["latest", "1y_avg"], help="无风险利率取值方式")
    parser.add_argument("--market_premium", type=float, default=0.06, help="市场风险溢价，默认0.06")
    parser.add_argument("--no_sensitivity", action="store_true", help="禁用敏感性分析")
    parser.add_argument("--no_scenario", action="store_true", help="禁用情景分析")
    parser.add_argument("--no_detailed", action="store_true", help="不包含详细预测表")

    args = parser.parse_args()

    symbols = []
    if args.symbol:
        symbols = [args.symbol.upper()]
        logger.info(f"处理指定股票: {symbols[0]}")
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
            projection_years=args.projection_years,
            terminal_growth=args.terminal_growth,
            risk_free_method=args.risk_free_method,
            market_premium=args.market_premium,
            sensitivity=not args.no_sensitivity,
            scenario=not args.no_scenario,
            include_detailed=not args.no_detailed
        )
        if ok:
            success_count += 1

    logger.info(f"处理完成，成功: {success_count}/{len(symbols)}")


if __name__ == "__main__":
    asyncio.run(main())