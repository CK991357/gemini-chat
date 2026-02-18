"""
财务比率工具测试脚本（增强版适配）- 自动检测 symbol
启用 include_historical_ratios，输出包含历年比率
支持命令行参数指定 symbol，否则自动从文件名推断
"""

import json
import asyncio
import sys
from pathlib import Path
from datetime import datetime

from financial_ratio import FinancialRatioAnalysisTool


def detect_symbol_from_files() -> str:
    """从当前目录的 income_statement_*.json 文件推断 symbol"""
    base_path = Path(__file__).parent
    income_files = list(base_path.glob("income_statement_*.json"))
    if not income_files:
        raise FileNotFoundError("未找到任何 income_statement_*.json 文件")
    # 取第一个文件，提取 symbol：格式 income_statement_SYMBOL.json
    filename = income_files[0].stem  # 不带扩展名
    parts = filename.split('_')
    if len(parts) >= 3:
        return parts[2]  # 假设格式为 income_statement_SYMBOL
    else:
        raise ValueError(f"无法从文件名 {filename} 推断 symbol")


async def main():
    base_path = Path(__file__).parent

    # 确定 symbol：优先从命令行参数获取，否则自动检测
    if len(sys.argv) > 1:
        symbol = sys.argv[1].upper()
        print(f"🔍 使用命令行指定的 symbol: {symbol}")
    else:
        try:
            symbol = detect_symbol_from_files()
            print(f"🔍 自动检测到 symbol: {symbol}")
        except (FileNotFoundError, ValueError) as e:
            print(f"❌ {e}")
            print("请通过命令行参数指定 symbol，例如: python test_financial_ratio.py MSFT")
            return

    # 必需文件
    required_files = {
        "income_statement": base_path / f"income_statement_{symbol}.json",
        "balance_sheet": base_path / f"balance_sheet_{symbol}.json",
        "overview": base_path / f"overview_{symbol}.json",
    }

    # 可选文件
    optional_files = {
        "global_quote": base_path / f"quote_{symbol}.json",
        "cash_flow": base_path / f"cash_flow_{symbol}.json",
        "earnings": base_path / f"earnings_{symbol}.json",
    }

    # 检查必需文件是否存在
    missing = [key for key, path in required_files.items() if not path.exists()]
    if missing:
        print(f"❌ 缺少必需文件: {', '.join(missing)}")
        return

    # 读取数据
    av_data = {}
    for key, path in required_files.items():
        with open(path, "r", encoding="utf-8") as f:
            av_data[key] = json.load(f)
        print(f"✅ 已加载: {path.name}")

    for key, path in optional_files.items():
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                av_data[key] = json.load(f)
            print(f"✅ 已加载: {path.name}")
        else:
            print(f"ℹ️ 可选文件 {path.name} 不存在，跳过")

    # 构造输入参数 —— 启用历史比率
    params = {
        "alpha_vantage_data": av_data,
        "include_interpretation": False,          # 关闭主观评级
        "include_summary": False,                 # 关闭主观总结
        "format_output": True,
        "use_advanced_metrics": True,
        "include_historical_ratios": True,        # ✅ 开启历年比率计算
    }

    tool = FinancialRatioAnalysisTool()
    input_model = tool.input_schema(**params)
    result = await tool.execute(input_model)

    if result["success"]:
        # 保存完整结果（包含 historical_ratios），文件名使用 symbol
        output_path = base_path / f"{symbol}_financial_ratios.json"
        with open(output_path, "w", encoding="utf-8") as f:
            output_data = {
                "timestamp": datetime.now().isoformat(),
                "company": av_data.get("overview", {}).get("Name", "Unknown"),
                "symbol": symbol,
                "input_files": {k: str(v) for k, v in {**required_files, **optional_files}.items()},
                **result
            }
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"\n💾 完整结果（含历年比率）已保存至: {output_path}")

        # 打印简要提示
        hist_cnt = len(result.get("historical_ratios", {}))
        print(f"📅 共计算 {hist_cnt} 个年份的历史比率")
    else:
        print(f"\n❌ 分析失败: {result.get('error')}")


if __name__ == "__main__":
    asyncio.run(main())