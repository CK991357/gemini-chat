#!/usr/bin/env python3
"""
量化主程序：基于估值偏差的统计套利策略
独立于原有估值系统，但复用其生成的历史估值文件。
支持训练、预测、回测、拐点分析。
"""

import argparse
import logging
import sys
from pathlib import Path

from quant_strategy import train_quant_model, predict_quant, run_quant_strategy

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def analyze_thresholds(symbol: str, data_dir: str, valuation_file: str,
                       horizon_weeks: int = 12, bins=None):
    """
    分析不同偏差区间的胜率和平均收益，找出关键拐点。
    直接输出区间统计，不保存模型。
    """
    from quant_strategy import QuantStrategy
    qs = QuantStrategy(symbol, data_dir, valuation_file)
    bias_df = qs.build_bias_series()
    if bias_df.empty:
        logger.error("无法构建偏差序列")
        return
    stats = qs.calculate_conditional_stats(bias_df, horizon_weeks, bins)
    print(f"\n{symbol} 偏差区间统计（未来{horizon_weeks}周）")
    print("区间\t样本数\t胜率\t平均收益\t盈亏比")
    for _, row in stats.iterrows():
        print(f"{row['bias_bin']}\t{row['count']}\t{row['win_rate']*100:.1f}%\t{row['mean_return']*100:.2f}%\t{row['profit_loss_ratio']:.2f}")


def main():
    parser = argparse.ArgumentParser(description="量化策略工具")
    parser.add_argument("--symbol", required=True, help="股票代码")
    parser.add_argument("--data-dir", default="data", help="数据目录（包含 stock_{symbol}.parquet）")
    parser.add_argument("--output-dir", default="output", help="输出目录（回测报告/估值报告）")
    parser.add_argument("--model-dir", default="models", help="模型保存/加载目录")
    parser.add_argument("--valuation-file", help="历史估值JSON文件路径（训练/回测必需）")
    parser.add_argument("--horizon-weeks", type=int, default=12, help="持有周数")
    parser.add_argument("--bins", type=str, default="-0.5,-0.4,-0.3,-0.2,-0.1,0,0.1,0.2,0.3,0.4,0.5",
                        help="偏差区间边界，逗号分隔")

    # 子命令
    parser.add_argument("--train", action="store_true", help="训练模型")
    parser.add_argument("--predict", action="store_true", help="实时预测")
    parser.add_argument("--backtest", action="store_true", help="回测")
    parser.add_argument("--thresholds", action="store_true", help="分析拐点（不保存模型）")

    parser.add_argument("--current-price", type=float, help="当前股价（用于预测）")
    parser.add_argument("--current-value", type=float, help="最新估值（用于预测）")

    args = parser.parse_args()

    # 解析区间
    bins = [float(x) for x in args.bins.split(',')]

    # 训练模式
    if args.train:
        if not args.valuation_file:
            logger.error("训练模式需要提供 --valuation-file")
            sys.exit(1)
        train_quant_model(
            symbol=args.symbol,
            data_dir=args.data_dir,
            model_dir=args.model_dir,
            valuation_file=args.valuation_file,
            horizon_weeks=args.horizon_weeks,
            bins=bins
        )
        logger.info(f"模型训练完成，保存至 {args.model_dir}/{args.symbol}_quant_model.pkl")
        return

    # 预测模式
    if args.predict:
        if args.current_price is None or args.current_value is None:
            logger.error("预测模式需要提供 --current-price 和 --current-value")
            sys.exit(1)
        try:
            result = predict_quant(
                symbol=args.symbol,
                data_dir=args.data_dir,
                model_dir=args.model_dir,
                current_price=args.current_price,
                current_value=args.current_value,
                output_dir=args.output_dir  # 新增参数
            )
            if result['success']:
                print(result['message'])
                print(f"建议动作: {result['suggested_action']}, 仓位: {result['half_kelly_fraction']*100:.1f}%")
            else:
                print(f"错误: {result['error']}")
        except Exception as e:
            logger.error(f"预测失败: {e}")
            sys.exit(1)
        return

    # 回测模式
    if args.backtest:
        if not args.valuation_file:
            logger.error("回测模式需要提供 --valuation-file")
            sys.exit(1)
        run_quant_strategy(
            symbol=args.symbol,
            data_dir=args.data_dir,
            output_dir=args.output_dir,
            valuation_file=args.valuation_file,
            horizon_weeks=args.horizon_weeks,
            bins=bins
        )
        logger.info(f"回测完成，报告已保存至 {args.output_dir}")
        return

    # 拐点分析模式
    if args.thresholds:
        if not args.valuation_file:
            logger.error("拐点分析需要提供 --valuation-file")
            sys.exit(1)
        analyze_thresholds(
            symbol=args.symbol,
            data_dir=args.data_dir,
            valuation_file=args.valuation_file,
            horizon_weeks=args.horizon_weeks,
            bins=bins
        )
        return

    # 若无任何模式，显示帮助
    parser.print_help()


if __name__ == "__main__":
    main()