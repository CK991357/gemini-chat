# quant_valuation_history_utils.py
"""
工具函数：为历史财年生成估值，使用截至该年的数据。
依赖于 quant_dcf_auto_all.DCFAutoValuation。
"""

import asyncio
from typing import Dict, Any

from quant_dcf_auto_all import DCFAutoValuation


async def run_valuation_up_to_year(
    val_loader: DCFAutoValuation,
    symbol: str,
    year: int,
    **kwargs
) -> Dict[str, Any]:
    """
    运行截至指定年份的估值（使用该年之前的数据）。
    直接调用 run_valuation 并传入 as_of_year 参数。
    """
    return await val_loader.run_valuation(symbol, as_of_year=year, **kwargs)