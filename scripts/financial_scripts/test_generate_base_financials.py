#!/usr/bin/env python3
"""
test_generate_base_financials.py
测试脚本：自动捕获当前目录下所有相关的 JSON 文件（balance_sheet_*.json,
cash_flow_*.json, earnings_*.json, income_statement_*.json），
提取 symbol，并生成对应的详细基础财务数据报告（symbol_base_financials.md）。
"""

import json
import glob
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate_base_financials import BaseFinancialsGenerator


def detect_symbol_from_files():
    """从当前目录的 income_statement_*.json 文件推断 symbol"""
    income_files = glob.glob("income_statement_*.json")
    if not income_files:
        raise FileNotFoundError("未找到任何 income_statement_*.json 文件")
    # 取第一个文件，提取 symbol：格式 income_statement_SYMBOL.json
    filename = income_files[0]
    stem = Path(filename).stem  # 不带扩展名
    parts = stem.split('_')
    if len(parts) >= 3:
        return parts[2]  # 假设格式为 income_statement_SYMBOL
    else:
        raise ValueError(f"无法从文件名 {filename} 推断 symbol")


def find_json_files(symbol: str):
    pattern_balance = f"balance_sheet_{symbol}.json"
    pattern_cash = f"cash_flow_{symbol}.json"
    pattern_earnings = f"earnings_{symbol}.json"
    pattern_income = f"income_statement_{symbol}.json"

    files = {
        "balance": glob.glob(pattern_balance),
        "cashflow": glob.glob(pattern_cash),
        "earnings": glob.glob(pattern_earnings),
        "income": glob.glob(pattern_income),
    }

    missing = [name for name, paths in files.items() if not paths]
    if missing:
        raise FileNotFoundError(f"缺少以下 JSON 文件: {', '.join(missing)}")

    return {k: v[0] for k, v in files.items()}


def main():
    # 获取 symbol：优先从命令行参数，否则自动检测
    if len(sys.argv) > 1:
        symbol = sys.argv[1].upper()
        print(f"🔍 使用命令行指定的 symbol: {symbol}")
    else:
        try:
            symbol = detect_symbol_from_files()
            print(f"🔍 自动检测到 symbol: {symbol}")
        except (FileNotFoundError, ValueError) as e:
            print(f"❌ {e}")
            print("请通过命令行参数指定 symbol，例如: python test_generate_base_financials.py MSFT")
            return

    try:
        json_files = find_json_files(symbol)
    except FileNotFoundError as e:
        print(f"❌ {e}")
        return

    data = {}
    for key, path in json_files.items():
        with open(path, 'r', encoding='utf-8') as f:
            data[key] = json.load(f)
        print(f"  已加载 {path}")

    # 行业推断（可扩展）
    industry = "technology" if symbol == "AAPL" else "general"

    generator = BaseFinancialsGenerator(
        income_json=data["income"],
        balance_json=data["balance"],
        cashflow_json=data["cashflow"],
        earnings_json=data["earnings"],
        symbol=symbol,
        industry=industry
    )

    output_filename = f"{symbol.lower()}_base_financials.md"
    generator.save_report(output_filename)


if __name__ == "__main__":
    main()