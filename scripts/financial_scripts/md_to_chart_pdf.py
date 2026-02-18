#!/usr/bin/env python3
"""
从财务比率 Markdown 报告提取表格数据并生成图表集（PDF）
- 自动识别四大类（以及新增的现金流类）所有指标
- 每类一页，子图网格布局
- 横轴年份自动间隔，避免重叠
- 去除所有可能产生乱码的字符
"""

import re
import argparse
from pathlib import Path

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

# 中文字体设置（静默模式，避免找不到字体时报警）
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'WenQuanYi Micro Hei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False


def clean_text(text):
    """彻底清理字符串中的零宽空格、BOM、不可见字符"""
    if not isinstance(text, str):
        return text
    # 移除零宽空格（U+200B）和 BOM（U+FEFF）
    text = text.replace('\u200b', '').replace('\ufeff', '')
    # 移除首尾空白和控制字符
    return text.strip()


def parse_md_table(table_lines):
    """
    解析 Markdown 表格，返回 (年份列表, 数据行列表)
    """
    # 第一行为表头
    header_line = clean_text(table_lines[0])
    header = [clean_text(h) for h in header_line.strip('|').split('|')]
    years = header[1:]  # 年份列

    data_rows = []
    for line in table_lines[2:]:
        line = clean_text(line)
        if not line or line.startswith('| ---'):
            continue
        cells = [clean_text(c) for c in line.strip('|').split('|')]
        if len(cells) < 2:
            continue
        metric = cells[0].strip('*')  # 移除加粗标记
        values = cells[1:]
        data_rows.append([metric] + values)
    return years, data_rows


def clean_value(val_str, metric_name=None):
    """将字符串转换为浮点数，支持 %、x、days、$ 等单位"""
    val_str = clean_text(val_str)
    if val_str in ('—', 'N/A', ''):
        return np.nan
    if val_str.endswith('%'):
        return float(val_str[:-1]) / 100.0
    if val_str.endswith('x'):
        return float(val_str[:-1])
    if val_str.endswith('days'):
        return float(val_str.replace('days', '').strip())
    if val_str.startswith('$'):
        num_str = val_str.replace('$', '').replace(',', '')
        return float(num_str)
    try:
        return float(val_str)
    except:
        return np.nan


def scale_value(val, metric_name):
    """
    对特大数值进行缩放，便于图表显示
    支持营运资本、资本支出、自由现金流等大额货币指标
    """
    if not pd.isna(val):
        # 将所有货币大额指标（以亿美元为单位）缩放到十亿美元
        large_monetary_keywords = ['营运资本', '资本支出', '自由现金流', '经营现金流', 'free cash flow']
        if any(kw in metric_name for kw in large_monetary_keywords):
            return val / 1e9  # 十亿美元
        # 原有的营运资本处理（兼容保留）
        if '营运资本' in metric_name:
            return val / 1e9
    return val


def setup_xaxis(ax, years, max_labels=8):
    """
    设置 x 轴刻度间隔，避免重叠
    years: 年份字符串列表
    max_labels: 最大显示标签数
    """
    n = len(years)
    if n <= max_labels:
        step = 1
    else:
        step = (n + max_labels - 1) // max_labels
    indices = list(range(0, n, step))
    # 确保最后一年总是显示
    if n - 1 not in indices:
        indices.append(n - 1)
    ticks = [years[i] for i in indices]
    ax.set_xticks(indices)
    ax.set_xticklabels(ticks, rotation=45, ha='right')
    ax.set_xlim(-0.5, n - 0.5)


def plot_category(df, title, pdf, metrics_per_row=4):
    """
    绘制单个类别的所有指标（子图网格）
    """
    years = df.columns.astype(str).tolist()
    n_metrics = len(df.index)

    cols = min(metrics_per_row, n_metrics)
    rows = (n_metrics + cols - 1) // cols

    fig, axes = plt.subplots(rows, cols, figsize=(5*cols, 4*rows))
    # 清理标题中的多余字符
    clean_title = clean_text(title)
    fig.suptitle(clean_title, fontsize=16, fontweight='bold')

    # 统一处理 axes 为一维数组
    if rows == 1 and cols == 1:
        axes = np.array([axes])
    axes_flat = axes.flatten()

    for idx, (metric, row) in enumerate(df.iterrows()):
        ax = axes_flat[idx]
        values = row.values.astype(float)
        scaled = [scale_value(v, metric) for v in values]

        # 绘制折线
        ax.plot(range(len(years)), scaled, marker='o', linestyle='-', linewidth=1.5)
        ax.set_title(clean_text(metric), fontsize=10)
        ax.grid(True, linestyle='--', alpha=0.6)

        # 设置 x 轴刻度（自动间隔）
        setup_xaxis(ax, years, max_labels=8)

        # 根据数值特征设置 y 轴标签
        first_val_str = str(df.iloc[idx, 0])
        if '%' in first_val_str or '利润率' in metric or '收益率' in metric:
            ax.set_ylabel('百分比 (%)')
            ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'{x*100:.0f}%'))
        elif 'x' in first_val_str or '比率' in metric or '周转率' in metric or '倍数' in metric:
            ax.set_ylabel('倍数')
        elif 'days' in first_val_str or '天数' in metric:
            ax.set_ylabel('天数')
        elif '$' in first_val_str or '营运资本' in metric or '资本支出' in metric or '自由现金流' in metric:
            ax.set_ylabel('十亿美元')
            ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'{x:.0f}B'))
        else:
            ax.set_ylabel('数值')

        # 标注最大值和最小值
        if not np.all(np.isnan(scaled)):
            valid_indices = np.where(~np.isnan(scaled))[0]
            if len(valid_indices) > 0:
                max_idx = valid_indices[np.nanargmax(scaled)]
                min_idx = valid_indices[np.nanargmin(scaled)]
                ax.annotate(f'{scaled[max_idx]:.1f}',
                            (max_idx, scaled[max_idx]),
                            textcoords="offset points", xytext=(0,10), ha='center', fontsize=8)
                ax.annotate(f'{scaled[min_idx]:.1f}',
                            (min_idx, scaled[min_idx]),
                            textcoords="offset points", xytext=(0,-15), ha='center', fontsize=8)

    # 隐藏多余子图
    for j in range(idx + 1, len(axes_flat)):
        axes_flat[j].axis('off')

    plt.tight_layout()
    pdf.savefig(fig)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description='从财务比率 Markdown 报告生成图表 PDF')
    parser.add_argument('--input', '-i', required=True, help='输入 AAPL_report.md 路径')
    parser.add_argument('--output', '-o', default='financial_charts.pdf', help='输出 PDF 文件路径')
    parser.add_argument('--per-row', type=int, default=4, help='每行子图数量 (默认4)')
    parser.add_argument('--debug', action='store_true', help='打印解析到的指标列表')
    args = parser.parse_args()

    md_path = Path(args.input)
    if not md_path.exists():
        print(f'❌ 文件不存在: {md_path}')
        return

    # 检查输出文件是否可写，如果存在则尝试删除
    output_path = Path(args.output)
    if output_path.exists():
        try:
            output_path.unlink()  # 删除已存在的文件
            print(f'⚠️ 已删除现有输出文件: {output_path}')
        except PermissionError:
            print(f'❌ 输出文件 {output_path} 正在被其他程序占用，请关闭后再运行。')
            return

    with open(md_path, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()

    # 五大类标题关键词（新增：现金流与投资）
    category_titles = ['盈利能力', '流动性', '杠杆与偿债能力', '营运效率', '现金流与投资']
    tables = []

    i = 0
    while i < len(lines):
        raw_line = lines[i]
        # 使用 utf-8-sig 自动处理 BOM，这里再显式清理一次
        line = clean_text(raw_line)
        if line.startswith('###') and any(t in line for t in category_titles):
            title = line.strip('#').strip()
            # ===== 移除标题中的 Emoji 字符，避免方框乱码 =====
            for emoji in ['💰', '💧', '⚖️', '⚙️']:
                title = title.replace(emoji, '')
            title = title.strip()
            # ====================================================
            i += 1
            # 跳过空行
            while i < len(lines) and not clean_text(lines[i]):
                i += 1
            # 收集表格行
            table_lines = []
            while i < len(lines):
                current = clean_text(lines[i])
                if not current:
                    break
                if current.startswith('###'):
                    # 下一个标题，回退一行
                    i -= 1
                    break
                table_lines.append(current)
                i += 1
            if table_lines:
                tables.append((title, table_lines))
        else:
            i += 1

    if not tables:
        print('❌ 未找到任何表格，请确认 Markdown 格式')
        return

    # 调试输出
    if args.debug:
        print('📊 解析到的指标列表：')
        for title, tbl in tables:
            years, rows = parse_md_table(tbl)
            metrics = [row[0] for row in rows]
            print(f'\n【{title}】({len(metrics)}个指标)')
            for m in metrics:
                print(f'  - {m}')
        print('\n' + '='*60)

    # 生成 PDF
    with PdfPages(args.output) as pdf:
        for title, table_lines in tables:
            print(f'正在处理: {title}')
            try:
                years, data_rows = parse_md_table(table_lines)
                df = pd.DataFrame(data_rows, columns=['指标'] + years)
                df.set_index('指标', inplace=True)
                # 修复 FutureWarning: 将 applymap 改为 map (Pandas >= 2.1.0)
                df_clean = df.map(lambda x: clean_value(x))
                plot_category(df_clean, title, pdf, metrics_per_row=args.per_row)
            except Exception as e:
                print(f'⚠️ 处理 {title} 时出错: {e}')
                import traceback
                traceback.print_exc()
                continue

    print(f'✅ 图表 PDF 已保存至: {args.output}')


if __name__ == '__main__':
    main()