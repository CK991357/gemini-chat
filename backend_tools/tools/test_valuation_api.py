#!/usr/bin/env python3
"""
模拟 API 调用 valuation_tool 的测试脚本
直接调用 ValuationTool.execute，传入 session_id 和参数，不经过 tool_registry 和 FastAPI。
"""

import asyncio
import logging
import sys
from pathlib import Path
from valuation_tool import ValuationTool, ValuationInput

logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SYMBOL = "MSFT"
SESSION_ID = "None"  # 使用默认 temp 目录
PARAMS = {
    "mode": "multi",
    "parameters": {
        "symbol": SYMBOL,
        "models": ["dcf", "fcfe", "rim", "eva", "apv"],
        "sensitivity": True,
        "projection_years": 5,
        "terminal_growth": 0.025,
        "risk_free_method": "latest",
        "market_premium": 0.06,
        "include_detailed": True,
        "debt_assumption": "ratio"
    }
}

async def main():
    # 确保会话目录存在
    session_dir = Path(f"/srv/sandbox_workspaces/{SESSION_ID}")
    session_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"测试会话目录: {session_dir}")

    # 检查必需文件是否存在（可选）
    required_files = [
        f"income_statement_{SYMBOL}.json",
        f"balance_sheet_{SYMBOL}.json",
        f"cash_flow_{SYMBOL}.json",
        f"overview_{SYMBOL}.json",
        f"quote_{SYMBOL}.json"
    ]
    missing = [f for f in required_files if not (session_dir / f).exists()]
    if missing:
        logger.warning(f"缺少以下文件，部分测试可能失败: {missing}")

    tool = ValuationTool()
    input_model = ValuationInput(**PARAMS)
    result = await tool.execute(input_model, session_id=SESSION_ID)
    print("执行结果：")
    print(result)

if __name__ == "__main__":
    asyncio.run(main())