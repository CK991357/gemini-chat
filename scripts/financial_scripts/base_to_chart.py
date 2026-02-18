#!/usr/bin/env python3
"""
将 *_base_financials.md 格式的基础财务数据报告转换为图表 PDF
- 自动识别各主要部分（损益表、资产负债表、现金流量表、每股数据、财务健康评分等）
- 为每个指标提取金额和同比增长率（如果存在），生成时间序列折线图
- 数值缩放：十亿美元、百万美元、百分比
- 每部分一页，子图网格布局
- 主标题置顶，避免与图表重叠
"""

import re
import argparse
from pathlib import Path

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

# 中文字体设置
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'WenQuanYi Micro Hei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False


def clean_text(text):
    """清理零宽空格、BOM 和首尾空白"""
    if not isinstance(text, str):
        return text
    text = text.replace('\u200b', '').replace('\ufeff', '')
    return text.strip()


def parse_value(val_str):
    """
    将字符串转换为浮点数，支持 B (十亿)、M (百万)、%、— 等。
    返回 (数值, 单位类型) ，单位类型用于后续缩放显示。
    """
    val_str = clean_text(val_str)
    if val_str in ('—', 'N/A', '', 'null', 'None'):
        return np.nan, None

    # 处理百分比
    if val_str.endswith('%'):
        try:
            return float(val_str[:-1]) / 100.0, 'percent'
        except:
            return np.nan, None

    # 处理十亿 (B)
    if val_str.endswith('B'):
        try:
            num = float(val_str[:-1].replace(',', ''))
            return num * 1e9, 'billion'
        except:
            return np.nan, None

    # 处理百万 (M)
    if val_str.endswith('M'):
        try:
            num = float(val_str[:-1].replace(',', ''))
            return num * 1e6, 'million'
        except:
            return np.nan, None

    # 处理纯数字（可能带千分位逗号）
    try:
        return float(val_str.replace(',', '')), 'raw'
    except:
        return np.nan, None


def scale_for_display(val, unit_type, metric_name):
    """
    根据原始单位和指标名称，返回适合显示的值（缩放后的数值）和 y 轴标签单位。
    对于货币指标统一用十亿显示，对于百分比保留原值。
    """
    if pd.isna(val):
        return val, ''
    if unit_type == 'percent':
        return val, '百分比 (%)'
    if unit_type == 'billion':
        return val / 1e9, '十亿美元'
    if unit_type == 'million':
        # 如果数值小于 10 亿，用百万显示；否则自动转十亿
        if val < 1e9:
            return val / 1e6, '百万美元'
        else:
            return val / 1e9, '十亿美元'
    # raw 类型：如果是大额货币指标，也转十亿
    if any(kw in metric_name for kw in ['营收', '成本', '毛利', '利润', 'EBITDA', '资产', '负债', '权益', '现金流', '资本支出', '股息', '回购']):
        if abs(val) >= 1e9:
            return val / 1e9, '十亿美元'
        elif abs(val) >= 1e6:
            return val / 1e6, '百万美元'
    return val, '数值'


def parse_md_table(table_lines):
    """
    解析 Markdown 表格，支持两列或三列（年份、金额、同比增长）。
    返回 (年份列表, 金额列表, 同比增长列表)
    """
    if not table_lines:
        return [], [], []

    # 第一行表头
    header_line = clean_text(table_lines[0])
    headers = [clean_text(h) for h in header_line.strip('|').split('|')]
    # 期望列数至少2（年份 + 金额）
    col_count = len(headers)

    years = []
    values = []
    growths = []

    for line in table_lines[2:]:
        line = clean_text(line)
        if not line or line.startswith('| ---'):
            continue
        cells = [clean_text(c) for c in line.strip('|').split('|')]
        if len(cells) < 2:
            continue

        year = cells[0]
        years.append(year)

        # 金额列（第二列）
        val_str = cells[1]
        val, _ = parse_value(val_str)
        values.append(val)

        # 同比增长列（第三列，如果存在）
        if col_count >= 3:
            growth_str = cells[2] if len(cells) > 2 else '—'
            growth, _ = parse_value(growth_str)
            growths.append(growth)
        else:
            growths.append(np.nan)

    return years, values, growths


def setup_xaxis(ax, years, max_labels=8):
    """设置 x 轴刻度间隔，避免重叠"""
    n = len(years)
    if n <= max_labels:
        step = 1
    else:
        step = (n + max_labels - 1) // max_labels
    indices = list(range(0, n, step))
    if n - 1 not in indices:
        indices.append(n - 1)
    ticks = [years[i] for i in indices]
    ax.set_xticks(indices)
    ax.set_xticklabels(ticks, rotation=45, ha='right')
    ax.set_xlim(-0.5, n - 0.5)


def plot_category(category_title, metrics_data, pdf, metrics_per_row=4):
    """
    绘制一个类别中的所有指标（子图网格）
    metrics_data: list of dict
        [ {'name': '总营收', 'values': [年份列表, 数值列表], 'unit': 'billion'}, ... ]
    """
    if not metrics_data:
        return

    years = metrics_data[0]['years']  # 假设所有指标使用相同年份集（实际可能不同，但应一致）
    n_metrics = len(metrics_data)

    cols = min(metrics_per_row, n_metrics)
    rows = (n_metrics + cols - 1) // cols

    fig, axes = plt.subplots(rows, cols, figsize=(5*cols, 4*rows))
    # 主标题置顶，y=0.98 靠近顶部，并调整整体布局为其预留空间
    fig.suptitle(clean_text(category_title), fontsize=16, fontweight='bold', y=0.98)

    if rows == 1 and cols == 1:
        axes = np.array([axes])
    axes_flat = axes.flatten()

    for idx, metric in enumerate(metrics_data):
        ax = axes_flat[idx]
        values = metric['values']
        unit_label = metric.get('unit_label', '数值')
        metric_name = metric['name']

        # 绘制折线
        ax.plot(range(len(years)), values, marker='o', linestyle='-', linewidth=1.5)
        ax.set_title(metric_name, fontsize=10)
        ax.grid(True, linestyle='--', alpha=0.6)
        setup_xaxis(ax, years, max_labels=8)

        # 设置 y 轴标签
        ax.set_ylabel(unit_label)

        # 标注最大值和最小值
        valid_vals = [v for v in values if not pd.isna(v)]
        if valid_vals:
            max_val = max(valid_vals)
            min_val = min(valid_vals)
            max_idx = values.index(max_val)
            min_idx = values.index(min_val)
            ax.annotate(f'{max_val:.1f}', (max_idx, max_val),
                        textcoords="offset points", xytext=(0,10), ha='center', fontsize=8)
            ax.annotate(f'{min_val:.1f}', (min_idx, min_val),
                        textcoords="offset points", xytext=(0,-15), ha='center', fontsize=8)

    # 隐藏多余子图
    for j in range(idx + 1, len(axes_flat)):
        axes_flat[j].axis('off')

    # 调整布局，为顶部标题留出空间（rect=[左, 下, 右, 上] 归一化坐标）
    plt.tight_layout(rect=[0, 0, 1, 0.95])
    pdf.savefig(fig)
    plt.close(fig)


def extract_financial_scores(lines, start_idx):
    """
    从财务健康评分模型部分提取历年总分，返回 (年份列表, 总分列表)
    """
    years = []
    scores = []
    i = start_idx
    while i < len(lines):
        line = clean_text(lines[i])
        if line.startswith('#### ') and '年' in line:
            # 四级标题，例如 "#### 2006年"
            year_match = re.search(r'(\d{4})', line)
            if year_match:
                year = year_match.group(1)
                # 向下查找总分行
                j = i + 1
                while j < len(lines) and not clean_text(lines[j]).startswith('####'):
                    content = clean_text(lines[j])
                    if '- **总分**：' in content:
                        # 格式：- **总分**：94.0 — 非常健康
                        score_match = re.search(r'总分\*\*：([\d.]+)', content)
                        if score_match:
                            score = float(score_match.group(1))
                            years.append(year)
                            scores.append(score)
                            break
                    j += 1
                i = j
            else:
                i += 1
        else:
            i += 1
    return years, scores


def main():
    parser = argparse.ArgumentParser(description='从基础财务数据 Markdown 报告生成图表 PDF')
    parser.add_argument('--input', '-i', required=True, help='输入 *_base_financials.md 路径')
    parser.add_argument('--output', '-o', default='base_financials_charts.pdf', help='输出 PDF 文件路径')
    parser.add_argument('--per-row', type=int, default=4, help='每行子图数量 (默认4)')
    args = parser.parse_args()

    md_path = Path(args.input)
    if not md_path.exists():
        print(f'❌ 文件不存在: {md_path}')
        return

    # 检查输出文件
    output_path = Path(args.output)
    if output_path.exists():
        try:
            output_path.unlink()
            print(f'⚠️ 已删除现有输出文件: {output_path}')
        except PermissionError:
            print(f'❌ 输出文件 {output_path} 正在被占用，请关闭后再运行。')
            return

    with open(md_path, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()

    # 识别二级标题作为分类
    categories = []
    current_category = None
    current_tables = []  # 每个元素是 (指标名, 表格行列表)

    i = 0
    while i < len(lines):
        line = clean_text(lines[i])
        if line.startswith('## '):
            # 新分类开始
            if current_category is not None:
                categories.append((current_category, current_tables))
            current_category = line[3:].strip()
            current_tables = []
            i += 1
        elif line.startswith('### ') and current_category is not None:
            # 指标名
            metric_name = line[4:].strip()
            i += 1
            # 跳过空行
            while i < len(lines) and not clean_text(lines[i]):
                i += 1
            # 收集表格行（直到下一个 ### 或 ## 或空行）
            table_lines = []
            while i < len(lines):
                next_line = clean_text(lines[i])
                if not next_line:
                    break
                if next_line.startswith('###') or next_line.startswith('##'):
                    i -= 1  # 回退一步，让外层循环处理
                    break
                table_lines.append(lines[i])  # 保留原始行，用于解析
                i += 1
            if table_lines:
                current_tables.append((metric_name, table_lines))
        else:
            i += 1

    # 添加最后一个分类
    if current_category is not None:
        categories.append((current_category, current_tables))

    # 准备所有要绘制的数据
    all_metrics = []  # 每个元素是 (category_title, metrics_list)
    for cat_title, tables in categories:
        cat_metrics = []
        for metric_name, table_lines in tables:
            try:
                years, values, growths = parse_md_table(table_lines)
                if not years:
                    continue

                # 处理金额指标
                # 找出数值的单位类型（从第一个非空值推断）
                first_val = next((v for v in values if not pd.isna(v)), None)
                unit_type = None
                if first_val is not None:
                    # 重新解析第一个值的字符串以获取单位类型
                    first_str = None
                    for line in table_lines[2:]:
                        cells = clean_text(line).strip('|').split('|')
                        if len(cells) >= 2:
                            first_str = cells[1]
                            break
                    if first_str:
                        _, unit_type = parse_value(first_str)
                # 缩放并获取单位标签
                scaled_vals = []
                unit_label = '数值'
                for v in values:
                    if pd.isna(v):
                        scaled_vals.append(np.nan)
                    else:
                        sv, lbl = scale_for_display(v, unit_type, metric_name)
                        scaled_vals.append(sv)
                        unit_label = lbl
                cat_metrics.append({
                    'name': metric_name,
                    'years': years,
                    'values': scaled_vals,
                    'unit_label': unit_label
                })

                # 处理同比增长率（如果存在且至少有一个非空）
                if any(not pd.isna(g) for g in growths):
                    cat_metrics.append({
                        'name': f'{metric_name} 同比增长率',
                        'years': years,
                        'values': growths,  # 已经是小数，无需缩放
                        'unit_label': '百分比 (%)'
                    })
            except Exception as e:
                print(f'⚠️ 解析指标 {metric_name} 时出错: {e}')
                continue

        if cat_metrics:
            all_metrics.append((cat_title, cat_metrics))

    # 处理财务健康评分模型（单独提取总分）
    # 查找“财务健康评分模型”分类
    score_category = None
    for cat_title, tables in categories:
        if '财务健康评分模型' in cat_title:
            # 从该分类的文本中提取总分
            # 简单方法：在原始 lines 中定位该分类的起始位置，然后调用 extract_financial_scores
            # 由于 tables 中可能没有总分表格，需要单独处理
            # 重新扫描 lines 找到该分类的起始
            start_idx = None
            for idx, line in enumerate(lines):
                if clean_text(line).startswith('## ') and '财务健康评分模型' in line:
                    start_idx = idx
                    break
            if start_idx is not None:
                years, scores = extract_financial_scores(lines, start_idx)
                if years and scores:
                    score_category = ('财务健康总分', [{
                        'name': '财务健康总分',
                        'years': years,
                        'values': scores,
                        'unit_label': '分数'
                    }])
            break

    # 生成 PDF
    with PdfPages(args.output) as pdf:
        for cat_title, metrics in all_metrics:
            print(f'正在处理: {cat_title}')
            plot_category(cat_title, metrics, pdf, metrics_per_row=args.per_row)

        if score_category:
            print('正在处理: 财务健康总分')
            plot_category(score_category[0], score_category[1], pdf, metrics_per_row=args.per_row)

    print(f'✅ 图表 PDF 已保存至: {args.output}')


if __name__ == '__main__':
    main()