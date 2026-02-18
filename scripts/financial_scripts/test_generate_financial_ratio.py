#!/usr/bin/env python3
"""
整合测试脚本：直接读取原始JSON文件，调用财务比率工具，生成Markdown报告。
不保留中间 financial_ratio_result.json，所有数据均在内存中处理，最终输出 {symbol}_report.md。
"""

import json
import asyncio
import tempfile
from pathlib import Path
from datetime import datetime

from generate_financial_ratio import FinancialRatioAnalysisTool, MDFinancialReportGenerator


async def main():
    base_path = Path(__file__).parent

    # 自动检测 Symbol：寻找第一个 income_statement_*.json 文件，提取中间部分作为 Symbol
    symbol = None
    for file in base_path.glob("income_statement_*.json"):
        # 文件名格式：income_statement_AAPL.json
        parts = file.stem.split('_')
        if len(parts) >= 3:  # income_statement_AAPL
            symbol = parts[2]  # 取最后一个部分作为 Symbol
            break

    if not symbol:
        print("❌ 未找到 income_statement_*.json 文件，无法确定 Symbol。")
        return

    print(f"🔍 检测到 Symbol: {symbol}")

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
    missing = [k for k, p in required_files.items() if not p.exists()]
    if missing:
        print(f"❌ 缺少必需文件: {missing}")
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

    # 构造财务比率工具输入参数 —— 开启历史比率
    params = {
        "alpha_vantage_data": av_data,
        "include_interpretation": False,          # 关闭主观评级
        "include_summary": False,                  # 关闭主观总结
        "format_output": True,
        "use_advanced_metrics": True,
        "include_historical_ratios": True,         # ✅ 开启历年比率计算
    }

    tool = FinancialRatioAnalysisTool()
    input_model = tool.input_schema(**params)
    result = await tool.execute(input_model)

    if not result["success"]:
        print(f"\n❌ 分析失败: {result.get('error')}")
        return

    # 构建传递给报告生成器的数据字典（结构与 financial_ratio_result.json 一致）
    report_data = {
        "timestamp": datetime.now().isoformat(),
        "company": av_data.get("overview", {}).get("Name", "Unknown"),
        "symbol": symbol,
        "metadata": result.get("metadata", {}),
        "historical_ratios": result.get("historical_ratios", {}),
        # 如果报告生成器还需要其他字段，可以继续添加
    }

    hist_cnt = len(report_data["historical_ratios"])
    print(f"📅 共计算 {hist_cnt} 个年份的历史比率")

    # 将数据写入临时文件（避免修改 md_report_generator 的接口）
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.json', delete=False) as tmp:
        json.dump(report_data, tmp, indent=2, ensure_ascii=False)
        tmp_path = tmp.name

    try:
        # 使用报告生成器生成 Markdown
        generator = MDFinancialReportGenerator(tmp_path)
        output_md = base_path / f"{symbol}_report.md"
        generator.save(str(output_md))
        print(f"\n💾 最终报告已保存至: {output_md}")
    finally:
        # 删除临时文件
        Path(tmp_path).unlink()


if __name__ == "__main__":
    asyncio.run(main())