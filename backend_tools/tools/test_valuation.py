#!/usr/bin/env python3
"""
valuation_tool 完整功能测试脚本
测试所有模式（single, multi, monte_carlo）及所有模型（dcf, fcfe, rim, eva, apv）。
确保在执行前，所需的 AlphaVantage 数据文件已存在于会话目录中（如 /srv/sandbox_workspaces/temp）。
"""

import asyncio
import logging
import sys
from pathlib import Path
from valuation_tool import ValuationTool  # 直接导入，因为在同一目录

# 配置日志，输出到控制台
logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 设置测试参数
SYMBOL = "MSFT"                     # 修改为您的股票代码
SESSION_ID = None                   # 使用默认 temp 目录（普通模式），如需测试 Agent 模式可设为 "session_xxx"
PROJECTION_YEARS = 5                 # 预测年数
TERMINAL_GROWTH = 0.025              # 永续增长率
RISK_FREE_METHOD = "latest"          # 无风险利率取值方式
MARKET_PREMIUM = 0.06                 # 市场风险溢价
SENSITIVITY = True                    # 是否进行敏感性分析
INCLUDE_DETAILED = True                # 是否包含详细预测表
DEBT_ASSUMPTION = "ratio"              # APV 债务假设

# 蒙特卡洛参数（设为较小值以便快速测试）
MC_SIMULATIONS = 10
MC_SEED = 42


async def run_single_model_test(tool, model_name):
    """测试 single 模式运行单个模型"""
    logger.info(f"\n=== 测试 single 模式：{model_name.upper()} ===")
    params = {
        "mode": "single",
        "parameters": {
            "symbol": SYMBOL,
            "model": model_name,
            "projection_years": PROJECTION_YEARS,
            "terminal_growth": TERMINAL_GROWTH,
            "risk_free_method": RISK_FREE_METHOD,
            "market_premium": MARKET_PREMIUM,
            "sensitivity": SENSITIVITY,
            "include_detailed": INCLUDE_DETAILED,
            "debt_assumption": DEBT_ASSUMPTION
        }
    }
    try:
        result = await tool.execute(params, session_id=SESSION_ID)
        # 正确判断模型是否成功：查看 data.model_results 中对应模型的值
        if result.get("success") and result.get("data", {}).get("model_results", {}).get(model_name):
            logger.info(f"✅ {model_name.upper()} 成功")
            logger.info(f"   生成文件: {result.get('generated_files')}")
        else:
            error = result.get("error") or result.get("data", {}).get("model_results", {}).get(model_name, "未知错误")
            logger.error(f"❌ {model_name.upper()} 失败: {error}")
    except Exception as e:
        logger.error(f"❌ {model_name.upper()} 异常: {e}")


async def run_multi_model_test(tool):
    """测试 multi 模式运行所有模型"""
    logger.info("\n=== 测试 multi 模式：运行所有模型 ===")
    params = {
        "mode": "multi",
        "parameters": {
            "symbol": SYMBOL,
            "models": ["dcf", "fcfe", "rim", "eva", "apv"],
            "projection_years": PROJECTION_YEARS,
            "terminal_growth": TERMINAL_GROWTH,
            "risk_free_method": RISK_FREE_METHOD,
            "market_premium": MARKET_PREMIUM,
            "sensitivity": SENSITIVITY,
            "include_detailed": INCLUDE_DETAILED,
            "debt_assumption": DEBT_ASSUMPTION
        }
    }
    try:
        result = await tool.execute(params, session_id=SESSION_ID)
        if result.get("success"):
            logger.info(f"✅ multi 模式成功")
            logger.info(f"   生成文件: {result.get('generated_files')}")
            model_results = result.get('data', {}).get('model_results', {})
            for model, success in model_results.items():
                logger.info(f"   - {model}: {'✅' if success else '❌'}")
        else:
            logger.error(f"❌ multi 模式失败: {result.get('error')}")
    except Exception as e:
        logger.error(f"❌ multi 模式异常: {e}")


async def run_monte_carlo_test(tool):
    """测试 monte_carlo 模式"""
    logger.info("\n=== 测试 monte_carlo 模式 ===")
    params = {
        "mode": "monte_carlo",
        "parameters": {
            "symbol": SYMBOL,
            "n_simulations": MC_SIMULATIONS,
            "seed": MC_SEED,
            "projection_years": PROJECTION_YEARS,
            "terminal_growth": TERMINAL_GROWTH,
            "risk_free_method": RISK_FREE_METHOD,
            "market_premium": MARKET_PREMIUM
        }
    }
    try:
        result = await tool.execute(params, session_id=SESSION_ID)
        if result.get("success"):
            logger.info(f"✅ monte_carlo 模式成功")
            logger.info(f"   生成文件: {result.get('generated_files')}")
            stats = result.get('data', {}).get('statistics', {})
            if stats:
                logger.info(f"   均值: ${stats.get('mean', 0):.2f}, 中位数: ${stats.get('median', 0):.2f}")
        else:
            logger.error(f"❌ monte_carlo 模式失败: {result.get('error')}")
    except Exception as e:
        logger.error(f"❌ monte_carlo 模式异常: {e}")


async def main():
    # 初始化工具
    tool = ValuationTool()
    logger.info("valuation_tool 已初始化")

    # 检查会话目录
    session_dir = tool._ensure_session_workspace(SESSION_ID)
    logger.info(f"会话目录: {session_dir}")

    # 检查必需的数据文件是否存在（可选）
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

    # 运行 single 模式测试（每个模型单独测试）
    models_to_test = ["dcf", "fcfe", "rim", "eva", "apv"]
    for model in models_to_test:
        await run_single_model_test(tool, model)

    # 运行 multi 模式测试
    await run_multi_model_test(tool)

    # 运行 monte_carlo 模式测试
    await run_monte_carlo_test(tool)

    logger.info("\n=== 所有测试完成 ===")


if __name__ == "__main__":
    asyncio.run(main())