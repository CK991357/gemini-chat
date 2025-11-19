# 自动化报告生成指南 (v2.2)

## 🎯 工具概述
**功能**：自动生成 Word、Excel、PDF 格式的专业报告
**输出原则**：直接生成文件，系统自动处理输出格式

## 📊 Word 报告生成

### 基础 Word 报告模板
```python
from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
import pandas as pd
import numpy as np
from datetime import datetime

def generate_simple_word_report():
    """生成基础 Word 报告"""
    
    # 创建文档
    doc = Document()
    
    # 标题页
    title = doc.add_heading('业务分析报告', 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    # 报告信息
    doc.add_paragraph(f'生成时间: {datetime.now().strftime("%Y年%m月%d日 %H:%M")}')
    doc.add_paragraph(f'报告周期: 2024年1月1日 - 2024年1月7日')
    doc.add_paragraph()
    
    # 执行摘要
    doc.add_heading('执行摘要', level=1)
    summary = doc.add_paragraph()
    summary.add_run('本周业务表现概览:\n').bold = True
    summary.add_run('• 总营收: ¥125,000\n')
    summary.add_run('• 总订单: 856 单\n')
    summary.add_run('• 平均利润率: 18.5%\n')
    summary.add_run('• 新客户增长: +12.3%\n')
    
    # 关键指标
    doc.add_heading('关键绩效指标', level=1)
    
    # 创建表格
    table = doc.add_table(rows=5, cols=3)
    table.style = 'Light Grid Accent 1'
    
    # 表头
    table.cell(0, 0).text = '指标'
    table.cell(0, 1).text = '本周'
    table.cell(0, 2).text = '环比变化'
    
    # 数据行
    data_rows = [
        ['总收入', '¥125,000', '+5.2%'],
        ['订单数量', '856', '+8.7%'],
        ['客户数量', '324', '+12.3%'],
        ['平均订单价值', '¥146', '-2.1%'],
        ['客户满意度', '92%', '+1.5%']
    ]
    
    for i, row_data in enumerate(data_rows, 1):
        table.cell(i, 0).text = row_data[0]
        table.cell(i, 1).text = row_data[1]
        table.cell(i, 2).text = row_data[2]
    
    # 分析与建议
    doc.add_heading('分析与建议', level=1)
    analysis = doc.add_paragraph()
    analysis.add_run('主要发现:\n').bold = True
    analysis.add_run('1. 客户数量显著增长，但平均订单价值略有下降\n')
    analysis.add_run('2. 周末订单量明显高于工作日\n')
    analysis.add_run('3. 新产品线表现超出预期\n\n')
    
    analysis.add_run('建议措施:\n').bold = True
    analysis.add_run('• 优化工作日营销策略\n')
    analysis.add_run('• 加强高价值客户关系维护\n')
    analysis.add_run('• 扩大新产品线库存\n')
    
    # 保存文档
    doc.save('业务分析报告.docx')
    print("Word 报告已生成: 业务分析报告.docx")

# 使用示例
# generate_simple_word_report()
```

### 带数据的 Word 报告
```python
from docx import Document
from docx.shared import Inches
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime

def generate_data_driven_report():
    """生成基于数据的 Word 报告"""
    
    # 创建示例数据
    np.random.seed(42)
    dates = pd.date_range('2024-01-01', periods=7, freq='D')
    
    sales_data = pd.DataFrame({
        '日期': dates,
        '销售额': np.random.normal(10000, 2000, 7),
        '订单数': np.random.randint(50, 200, 7),
        '客户数': np.random.randint(30, 150, 7)
    })
    
    # 计算衍生指标
    sales_data['客单价'] = sales_data['销售额'] / sales_data['订单数']
    sales_data['转化率'] = (sales_data['订单数'] / sales_data['客户数'] * 100).round(2)
    
    print("=== 销售数据报告 ===")
    print(f"报告周期: {sales_data['日期'].min().strftime('%Y-%m-%d')} 至 {sales_data['日期'].max().strftime('%Y-%m-%d')}")
    print(f"总销售额: ¥{sales_data['销售额'].sum():,.2f}")
    print(f"总订单数: {sales_data['订单数'].sum():,}")
    print(f"平均客单价: ¥{sales_data['客单价'].mean():.2f}")
    print(f"平均转化率: {sales_data['转化率'].mean():.1f}%")
    
    # 创建 Word 文档
    doc = Document()
    
    # 标题
    title = doc.add_heading('销售数据报告', 0)
    
    # 基本信息
    doc.add_paragraph(f'生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    doc.add_paragraph(f'数据周期: {sales_data["日期"].min().strftime("%Y-%m-%d")} 至 {sales_data["日期"].max().strftime("%Y-%m-%d")}')
    doc.add_paragraph()
    
    # 关键指标
    doc.add_heading('关键指标', level=1)
    doc.add_paragraph(f'总销售额: ¥{sales_data["销售额"].sum():,.2f}')
    doc.add_paragraph(f'总订单数: {sales_data["订单数"].sum():,}')
    doc.add_paragraph(f'平均客单价: ¥{sales_data["客单价"].mean():.2f}')
    doc.add_paragraph(f'平均转化率: {sales_data["转化率"].mean():.1f}%')
    
    # 详细数据表格
    doc.add_heading('每日数据明细', level=1)
    
    # 创建表格
    table = doc.add_table(rows=len(sales_data)+1, cols=len(sales_data.columns))
    table.style = 'Light Grid Accent 1'
    
    # 表头
    for i, col_name in enumerate(sales_data.columns):
        table.cell(0, i).text = str(col_name)
    
    # 数据行
    for i, (_, row) in enumerate(sales_data.iterrows(), 1):
        for j, value in enumerate(row):
            if isinstance(value, (int, np.integer)):
                table.cell(i, j).text = f"{value:,}"
            elif isinstance(value, float):
                if j in [1]:  # 销售额
                    table.cell(i, j).text = f"¥{value:,.2f}"
                elif j in [4]:  # 客单价
                    table.cell(i, j).text = f"¥{value:.2f}"
                else:
                    table.cell(i, j).text = f"{value:.2f}"
            else:
                table.cell(i, j).text = str(value)
    
    # 生成可视化图表
    plt.figure(figsize=(12, 8))
    
    # 销售额趋势
    plt.subplot(2, 2, 1)
    plt.plot(sales_data['日期'], sales_data['销售额'], marker='o', linewidth=2)
    plt.title('销售额趋势')
    plt.xticks(rotation=45)
    plt.grid(True, alpha=0.3)
    
    # 订单数分布
    plt.subplot(2, 2, 2)
    plt.bar(sales_data['日期'], sales_data['订单数'], alpha=0.7)
    plt.title('订单数量')
    plt.xticks(rotation=45)
    plt.grid(True, alpha=0.3)
    
    # 客单价
    plt.subplot(2, 2, 3)
    plt.bar(sales_data['日期'], sales_data['客单价'], alpha=0.7, color='green')
    plt.title('客单价趋势')
    plt.xticks(rotation=45)
    plt.grid(True, alpha=0.3)
    
    # 转化率
    plt.subplot(2, 2, 4)
    plt.plot(sales_data['日期'], sales_data['转化率'], marker='s', linewidth=2, color='red')
    plt.title('转化率变化')
    plt.xticks(rotation=45)
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.show()
    
    # 保存文档
    doc.save('销售数据报告.docx')
    print("Word 报告已生成: 销售数据报告.docx")

# 使用示例
# generate_data_driven_report()
```

## 📈 Excel 报告生成

### 基础 Excel 报告
```python
import pandas as pd
import numpy as np
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from datetime import datetime

def generate_excel_report():
    """生成格式化的 Excel 报告"""
    
    # 创建示例数据
    np.random.seed(42)
    departments = ['销售部', '市场部', '技术部', '人事部', '财务部']
    months = ['1月', '2月', '3月', '4月', '5月', '6月']
    
    data = []
    for dept in departments:
        for month in months:
            data.append({
                '部门': dept,
                '月份': month,
                '预算': np.random.randint(100000, 500000),
                '实际支出': np.random.randint(80000, 450000),
                '员工数': np.random.randint(10, 50)
            })
    
    df = pd.DataFrame(data)
    df['支出差异'] = df['实际支出'] - df['预算']
    df['差异率'] = (df['支出差异'] / df['预算'] * 100).round(2)
    
    print("=== 部门预算报告 ===")
    print(f"数据期间: {months[0]} - {months[-1]}")
    print(f"涉及部门: {len(departments)} 个")
    print(f"总预算: ¥{df['预算'].sum():,}")
    print(f"总支出: ¥{df['实际支出'].sum():,}")
    print(f"总体差异: ¥{df['支出差异'].sum():,}")
    
    # 部门汇总
    dept_summary = df.groupby('部门').agg({
        '预算': 'sum',
        '实际支出': 'sum',
        '支出差异': 'sum',
        '员工数': 'mean'
    }).round(2)
    
    print("\n各部门汇总:")
    print(dept_summary)
    
    # 创建 Excel 工作簿
    wb = Workbook()
    ws = wb.active
    ws.title = "部门预算报告"
    
    # 设置标题
    ws['A1'] = '部门预算执行报告'
    ws['A1'].font = Font(size=16, bold=True)
    ws.merge_cells('A1:F1')
    ws['A1'].alignment = Alignment(horizontal='center')
    
    # 报告信息
    ws['A2'] = f'生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M")}'
    ws.merge_cells('A2:F2')
    
    # 写入数据表头
    headers = ['部门', '月份', '预算', '实际支出', '支出差异', '差异率%']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=4, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="DDDDDD", end_color="DDDDDD", fill_type="solid")
    
    # 写入数据
    for row, (_, record) in enumerate(df.iterrows(), 5):
        ws.cell(row=row, column=1, value=record['部门'])
        ws.cell(row=row, column=2, value=record['月份'])
        ws.cell(row=row, column=3, value=record['预算'])
        ws.cell(row=row, column=4, value=record['实际支出'])
        ws.cell(row=row, column=5, value=record['支出差异'])
        ws.cell(row=row, column=6, value=record['差异率'])
    
    # 添加汇总行
    summary_row = len(df) + 7
    ws[f'A{summary_row}'] = '总计'
    ws[f'C{summary_row}'] = df['预算'].sum()
    ws[f'D{summary_row}'] = df['实际支出'].sum()
    ws[f'E{summary_row}'] = df['支出差异'].sum()
    
    # 设置数字格式
    for row in range(5, len(df) + 5):
        for col in [3, 4, 5]:  # 预算、实际支出、支出差异列
            ws.cell(row=row, column=col).number_format = '#,##0'
        ws.cell(row=row, column=6).number_format = '0.00%'
    
    # 保存文件
    wb.save('部门预算报告.xlsx')
    print("Excel 报告已生成: 部门预算报告.xlsx")

# 使用示例
# generate_excel_report()
```

## 📄 PDF 报告生成

### 基础 PDF 报告
```python
import pandas as pd
import numpy as np
from datetime import datetime
import matplotlib.pyplot as plt

def generate_pdf_report_content():
    """生成 PDF 报告内容（通过控制台输出，可复制到 PDF 生成工具）"""
    
    # 创建示例数据
    np.random.seed(42)
    products = ['产品A', '产品B', '产品C', '产品D', '产品E']
    
    performance_data = pd.DataFrame({
        '产品': products,
        'Q1销售额': np.random.randint(100000, 500000, 5),
        'Q2销售额': np.random.randint(120000, 550000, 5),
        '增长率': np.random.uniform(0.05, 0.25, 5),
        '市场份额': np.random.uniform(0.08, 0.25, 5)
    })
    
    performance_data['总销售额'] = performance_data['Q1销售额'] + performance_data['Q2销售额']
    
    print("=" * 60)
    print("                 产品绩效分析报告")
    print("=" * 60)
    print(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"报告周期: 2024年第一季度 - 第二季度")
    print()
    
    print("执行摘要:")
    print("• 总体销售额呈现稳定增长趋势")
    print("• 产品B表现突出，增长率达25%")
    print("• 市场份额分布相对均衡")
    print()
    
    print("关键绩效指标:")
    print(f"• 总销售额: ¥{performance_data['总销售额'].sum():,}")
    print(f"• 平均增长率: {performance_data['增长率'].mean():.1%}")
    print(f"• 最高市场份额: {performance_data['市场份额'].max():.1%}")
    print()
    
    print("产品绩效明细:")
    print("-" * 80)
    print(f"{'产品':<10} {'Q1销售额':<12} {'Q2销售额':<12} {'增长率':<8} {'市场份额':<8} {'总销售额':<12}")
    print("-" * 80)
    
    for _, row in performance_data.iterrows():
        print(f"{row['产品']:<10} ¥{row['Q1销售额']:<11,} ¥{row['Q2销售额']:<11,} {row['增长率']:<7.1%} {row['市场份额']:<7.1%} ¥{row['总销售额']:<11,}")
    
    print("-" * 80)
    print()
    
    print("分析与建议:")
    print("1. 产品B表现优异，建议加大资源投入")
    print("2. 产品D增长缓慢，需要重新评估市场策略")
    print("3. 整体产品线健康，建议维持当前发展节奏")
    print("4. 关注新兴市场机会，考虑产品线扩展")
    
    # 生成可视化图表
    plt.figure(figsize=(12, 8))
    
    # 销售额对比
    plt.subplot(2, 2, 1)
    x_pos = np.arange(len(products))
    width = 0.35
    
    plt.bar(x_pos - width/2, performance_data['Q1销售额'], width, label='Q1', alpha=0.7)
    plt.bar(x_pos + width/2, performance_data['Q2销售额'], width, label='Q2', alpha=0.7)
    plt.xticks(x_pos, products)
    plt.title('各产品季度销售额对比')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # 增长率
    plt.subplot(2, 2, 2)
    colors = ['green' if x > 0.15 else 'orange' for x in performance_data['增长率']]
    plt.bar(performance_data['产品'], performance_data['增长率'] * 100, color=colors, alpha=0.7)
    plt.title('产品增长率 (%)')
    plt.grid(True, alpha=0.3)
    
    # 市场份额
    plt.subplot(2, 2, 3)
    plt.pie(performance_data['市场份额'], labels=performance_data['产品'], autopct='%1.1f%%')
    plt.title('市场份额分布')
    
    # 总销售额排名
    plt.subplot(2, 2, 4)
    sorted_data = performance_data.sort_values('总销售额', ascending=True)
    plt.barh(sorted_data['产品'], sorted_data['总销售额'], alpha=0.7)
    plt.title('总销售额排名')
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.show()

# 使用示例
# generate_pdf_report_content()
```

## 🚀 综合报告工作流

### 完整业务报告生成
```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime

def generate_comprehensive_business_report():
    """生成完整的业务分析报告"""
    
    print("=== 开始生成业务分析报告 ===")
    
    # 1. 数据准备
    np.random.seed(42)
    months = ['1月', '2月', '3月', '4月', '5月', '6月']
    
    # 销售数据
    sales_data = pd.DataFrame({
        '月份': months,
        '销售额': np.random.normal(1000000, 200000, 6),
        '订单数': np.random.randint(5000, 8000, 6),
        '新客户': np.random.randint(200, 500, 6),
        '市场费用': np.random.normal(200000, 50000, 6)
    })
    
    # 计算衍生指标
    sales_data['毛利率'] = (sales_data['销售额'] - sales_data['市场费用']) / sales_data['销售额']
    sales_data['客单价'] = sales_data['销售额'] / sales_data['订单数']
    sales_data['获客成本'] = sales_data['市场费用'] / sales_data['新客户']
    
    print("数据准备完成")
    print(f"分析期间: {months[0]} - {months[-1]}")
    print(f"总销售额: ¥{sales_data['销售额'].sum():,.2f}")
    print(f"总订单数: {sales_data['订单数'].sum():,}")
    print(f"新增客户: {sales_data['新客户'].sum():,}")
    
    # 2. 关键指标分析
    print("\n=== 关键业务指标 ===")
    print(f"平均月销售额: ¥{sales_data['销售额'].mean():,.2f}")
    print(f"平均客单价: ¥{sales_data['客单价'].mean():.2f}")
    print(f"平均毛利率: {sales_data['毛利率'].mean():.1%}")
    print(f"平均获客成本: ¥{sales_data['获客成本'].mean():.2f}")
    
    # 3. 趋势分析
    print("\n=== 业务趋势分析 ===")
    sales_growth = (sales_data['销售额'].iloc[-1] - sales_data['销售额'].iloc[0]) / sales_data['销售额'].iloc[0]
    order_growth = (sales_data['订单数'].iloc[-1] - sales_data['订单数'].iloc[0]) / sales_data['订单数'].iloc[0]
    
    print(f"销售额增长: {sales_growth:+.1%}")
    print(f"订单数增长: {order_growth:+.1%}")
    print(f"客户增长: {sales_data['新客户'].sum() / len(months):.0f} 人/月")
    
    # 4. 生成可视化报告
    plt.figure(figsize=(15, 10))
    
    # 销售额趋势
    plt.subplot(2, 3, 1)
    plt.plot(sales_data['月份'], sales_data['销售额']/10000, marker='o', linewidth=2)
    plt.title('销售额趋势 (万元)')
    plt.grid(True, alpha=0.3)
    
    # 订单数量
    plt.subplot(2, 3, 2)
    plt.bar(sales_data['月份'], sales_data['订单数'], alpha=0.7)
    plt.title('订单数量')
    plt.grid(True, alpha=0.3)
    
    # 毛利率
    plt.subplot(2, 3, 3)
    plt.bar(sales_data['月份'], sales_data['毛利率']*100, alpha=0.7, color='green')
    plt.title('毛利率 (%)')
    plt.grid(True, alpha=0.3)
    
    # 客单价
    plt.subplot(2, 3, 4)
    plt.plot(sales_data['月份'], sales_data['客单价'], marker='s', linewidth=2, color='orange')
    plt.title('客单价趋势')
    plt.grid(True, alpha=0.3)
    
    # 新客户获取
    plt.subplot(2, 3, 5)
    plt.bar(sales_data['月份'], sales_data['新客户'], alpha=0.7, color='purple')
    plt.title('新客户数量')
    plt.grid(True, alpha=0.3)
    
    # 获客成本
    plt.subplot(2, 3, 6)
    plt.bar(sales_data['月份'], sales_data['获客成本'], alpha=0.7, color='red')
    plt.title('获客成本')
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.show()
    
    # 5. 业务建议
    print("\n=== 业务建议 ===")
    print("1. 基于当前增长趋势，建议加大营销投入")
    print("2. 客单价稳定，可考虑推出高端产品线")
    print("3. 获客成本可控，可扩大市场覆盖范围")
    print("4. 建议优化运营效率，进一步提升毛利率")
    
    print("\n=== 报告生成完成 ===")
    print("所有分析和图表已准备就绪")

# 使用示例
# generate_comprehensive_business_report()
```

## ⚠️ 使用注意事项

### ✅ 推荐做法：
- 使用标准的 Python 库：`python-docx`, `pandas`, `matplotlib`
- 直接使用 `print()` 输出文本内容
- 使用 `plt.show()` 显示图表
- 使用文件保存功能生成文档

### ❌ 避免的操作：
- 不要手动构建 JSON 输出
- 不要使用 `base64` 编码
- 不要创建复杂的自定义输出格式

### 🔧 错误处理：
```python
try:
    from docx import Document
    # Word 文档生成代码
except ImportError:
    print("python-docx 库不可用，无法生成 Word 文档")

try:
    import pandas as pd
    # 数据处理代码
except ImportError:
    print("pandas 库不可用")
```

**记住**：系统会自动处理图表输出，您只需要专注于报告内容的生成逻辑！