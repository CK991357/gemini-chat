#!/usr/bin/env python3
"""
构建历史估值文件（异步版本）
为指定股票的每个历史财年运行 DCF 估值（使用截至该年的数据），输出 JSON 文件。
用法: python build_valuation_history.py --symbol MSFT --data-dir data --output-file msft_valuations.json
"""

import asyncio
import argparse
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

from quant_dcf_auto_all import DCFAutoValuation
from quant_valuation_history_utils import run_valuation_up_to_year  # 新增导入

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def get_fiscal_years(symbol: str, data_dir: str) -> list:
    """从利润表中提取所有财年年份和财年结束日期"""
    data_path = Path(data_dir)
    inc_file = data_path / f"income_statement_{symbol}.json"
    if not inc_file.exists():
        raise FileNotFoundError(f"利润表文件不存在: {inc_file}")
    with open(inc_file, 'r', encoding='utf-8') as f:
        inc_data = json.load(f)
    annual_reports = inc_data.get('annualReports', [])
    fiscal_data = []
    for report in annual_reports:
        fiscal_date = report.get('fiscalDateEnding')
        if fiscal_date and len(fiscal_date) >= 10:
            year = int(fiscal_date[:4])
            # 财报发布日期一般比财年结束日晚2-3个月，这里取90天后（可根据实际情况调整）
            report_date = datetime.strptime(fiscal_date, '%Y-%m-%d') + timedelta(days=90)
            fiscal_data.append({
                'year': year,
                'fiscal_end': fiscal_date,
                'report_date': report_date.strftime('%Y-%m-%d')
            })
    fiscal_data.sort(key=lambda x: x['year'])
    return fiscal_data


async def process_year(val_loader: DCFAutoValuation, symbol: str, year_info: dict, **kwargs) -> dict:
    """处理单个财年，返回估值记录或 None"""
    year = year_info['year']
    report_date = year_info['report_date']
    logger.info(f"正在处理财年 {year}...")
    try:
        # 使用独立函数，而非 val_loader 的方法
        result = await run_valuation_up_to_year(
            val_loader, symbol, year, **kwargs
        )
        if result.get('success'):
            if 'equity_valuation' in result and 'value_per_share' in result['equity_valuation']:
                value = result['equity_valuation']['value_per_share']
                logger.info(f"财年 {year} 估值: {value:.2f}")
                return {
                    'fiscal_year': year,
                    'report_date': report_date,
                    'value': value
                }
            else:
                logger.error(f"无法从结果中提取每股价值: {result}")
                return None
        else:
            logger.error(f"财年 {year} 估值失败: {result.get('error')}")
    except Exception as e:
        logger.error(f"处理财年 {year} 时出错: {e}")
    return None


async def build_valuation_history(symbol: str, data_dir: str, output_file: str, **kwargs):
    """主协程：为所有财年生成估值"""
    fiscal_years_info = get_fiscal_years(symbol, data_dir)
    if not fiscal_years_info:
        logger.error("未找到任何财年数据")
        return

    val_loader = DCFAutoValuation(data_dir)

    # 并发执行所有年份的估值计算
    tasks = [process_year(val_loader, symbol, info, **kwargs) for info in fiscal_years_info]
    results = await asyncio.gather(*tasks)

    valuations = [r for r in results if r is not None]

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(valuations, f, indent=2, ensure_ascii=False)
    logger.info(f"历史估值已保存至 {output_file}，共 {len(valuations)} 条记录")


def main():
    parser = argparse.ArgumentParser(description='生成历史估值文件')
    parser.add_argument('--symbol', required=True, help='股票代码')
    parser.add_argument('--data-dir', default='data', help='数据目录')
    parser.add_argument('--output-file', required=True, help='输出JSON文件路径')
    parser.add_argument('--projection-years', type=int, default=5, help='预测年数')
    parser.add_argument('--terminal-growth', type=float, default=0.025, help='永续增长率')
    parser.add_argument('--risk-free-method', default='latest', help='无风险利率取值方式')
    parser.add_argument('--market-premium', type=float, default=0.06, help='市场风险溢价')
    args = parser.parse_args()

    kwargs = {
        'projection_years': args.projection_years,
        'terminal_growth': args.terminal_growth,
        'risk_free_method': args.risk_free_method,
        'market_premium': args.market_premium,
    }

    # 运行主协程
    asyncio.run(build_valuation_history(
        symbol=args.symbol,
        data_dir=args.data_dir,
        output_file=args.output_file,
        **kwargs
    ))


if __name__ == '__main__':
    main()