# 自动化报告生成工作流

## 📋 报告生成标准模板

### 通用文件输出函数
```python
import io
import base64
import json

def create_file_output(file_data, file_type, title, mime_type=None):
    """通用文件输出函数"""
    result = {
        "type": file_type,
        "title": title,
        "data_base64": base64.b64encode(file_data).decode('utf-8')
    }
    if mime_type:
        result["mime_type"] = mime_type
    print(json.dumps(result))
```

## 📊 周报自动生成器

```python
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
import io
import base64
import json
from datetime import datetime, timedelta
import numpy as np

def generate_weekly_report():
    """完整的周报自动生成工作流"""
    
    # 设置中文字体（如果需要）
    plt.rcParams['font.sans-serif'] = ['SimHei']
    matplotlib.use('Agg')
    
    # 1. 模拟周数据
    dates = pd.date_range(start='2024-01-01', periods=7, freq='D')
    sales_data = {
        'date': dates,
        'revenue': np.random.normal(10000, 2000, 7),
        'orders': np.random.randint(50, 200, 7),
        'customers': np.random.randint(30, 150, 7),
        'cost': np.random.normal(4000, 800, 7)
    }
    df = pd.DataFrame(sales_data)
    df['profit'] = df['revenue'] - df['cost']
    df['profit_margin'] = (df['profit'] / df['revenue'] * 100).round(2)
    
    # 2. 生成销售趋势图
    plt.figure(figsize=(15, 10))
    
    # 子图1: 收入趋势
    plt.subplot(2, 3, 1)
    plt.plot(df['date'], df['revenue'], marker='o', linewidth=2, color='#2E86AB', label='收入')
    plt.plot(df['date'], df['cost'], marker='s', linewidth=2, color='#A23B72', label='成本')
    plt.fill_between(df['date'], df['revenue'], df['cost'], alpha=0.3, color='#4ECDC4')
    plt.title('收入与成本趋势', fontweight='bold')
    plt.xticks(rotation=45)
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # 子图2: 订单量
    plt.subplot(2, 3, 2)
    plt.bar(df['date'], df['orders'], alpha=0.7, color='#F18F01')
    plt.title('每日订单量', fontweight='bold')
    plt.xticks(rotation=45)
    plt.grid(True, alpha=0.3)
    
    # 子图3: 利润率
    plt.subplot(2, 3, 3)
    plt.bar(df['date'], df['profit_margin'], alpha=0.7, color='#C73E1D')
    plt.title('每日利润率 (%)', fontweight='bold')
    plt.xticks(rotation=45)
    plt.grid(True, alpha=0.3)
    
    # 子图4: 收入分布
    plt.subplot(2, 3, 4)
    plt.pie(df['revenue'], labels=df['date'].dt.strftime('%m-%d'), autopct='%1.1f%%')
    plt.title('收入分布', fontweight='bold')
    
    # 子图5: 客户与订单关系
    plt.subplot(2, 3, 5)
    plt.scatter(df['customers'], df['orders'], s=df['revenue']/100, alpha=0.6)
    plt.xlabel('客户数')
    plt.ylabel('订单数')
    plt.title('客户-订单-收入关系', fontweight='bold')
    plt.grid(True, alpha=0.3)
    
    # 子图6: 累计指标
    plt.subplot(2, 3, 6)
    cumulative_revenue = df['revenue'].cumsum()
    cumulative_orders = df['orders'].cumsum()
    plt.plot(df['date'], cumulative_revenue, label='累计收入', linewidth=2)
    plt.plot(df['date'], cumulative_orders * 50, label='累计订单(缩放)', linewidth=2)
    plt.title('累计指标趋势', fontweight='bold')
    plt.xticks(rotation=45)
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    # 3. 将图表转为Base64
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    chart_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close('all')
    
    # 4. 生成Word报告
    doc = Document()
    
    # 标题页
    title = doc.add_heading('销售周报', 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    # 报告信息
    doc.add_paragraph(f'报告周期: {df["date"].min().strftime("%Y年%m月%d日")} - {df["date"].max().strftime("%Y年%m月%d日")}')
    doc.add_paragraph(f'生成时间: {datetime.now().strftime("%Y年%m月%d日 %H:%M")}')
    doc.add_paragraph()
    
    # 执行摘要
    doc.add_heading('执行摘要', level=1)
    total_revenue = df['revenue'].sum()
    total_orders = df['orders'].sum()
    avg_profit_margin = df['profit_margin'].mean()
    best_day = df.loc[df['revenue'].idxmax()]
    
    summary_para = doc.add_paragraph()
    summary_para.add_run('本周业绩亮点:\n').bold = True
    summary_para.add_run(f'• 总营收: ¥{total_revenue:,.2f}\n')
    summary_para.add_run(f'• 总订单: {total_orders:,} 单\n')
    summary_para.add_run(f'• 平均利润率: {avg_profit_margin:.1f}%\n')
    summary_para.add_run(f'• 最佳销售日: {best_day["date"].strftime("%m月%d日")} (¥{best_day["revenue"]:,.2f})')
    
    # 关键指标表格
    doc.add_heading('关键指标', level=1)
    metrics_data = [
        ['总营收', f'¥{total_revenue:,.2f}'],
        ['总订单量', f'{total_orders:,}'],
        ['总客户数', f'{df["customers"].sum():,}'],
        ['平均客单价', f'¥{(df["revenue"].sum()/df["orders"].sum()):.2f}'],
        ['平均利润率', f'{avg_profit_margin:.1f}%'],
        ['峰值收入日', best_day['date'].strftime('%m月%d日')]
    ]
    
    table = doc.add_table(rows=1, cols=2)
    table.style = 'Light Grid Accent 1'
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = '指标'
    hdr_cells[1].text = '数值'
    
    for metric, value in metrics_data:
        row_cells = table.add_row().cells
        row_cells[0].text = metric
        row_cells[1].text = value
    
    # 详细数据分析
    doc.add_heading('详细分析', level=1)
    doc.add_paragraph('本周销售表现总体稳定，具体分析如下:')
    
    # 添加图表引用
    doc.add_paragraph('详细趋势分析请参考附图:')
    
    # 保存Word文档
    doc_output = io.BytesIO()
    doc.save(doc_output)
    doc_output.seek(0)
    
    # 5. 输出结果
    result = {
        "type": "word",
        "title": f"销售周报_{datetime.now().strftime('%Y%m%d')}",
        "data_base64": base64.b64encode(doc_output.read()).decode('utf-8'),
        "chart_preview": chart_base64,
        "summary": {
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "avg_profit_margin": avg_profit_margin
        }
    }
    print(json.dumps(result))

# 使用示例
# generate_weekly_report()
```

## 📈 Excel报告生成

```python
import pandas as pd
import numpy as np
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.chart import BarChart, Reference
import io
import base64
import json

def generate_excel_report():
    """生成格式化的Excel报告"""
    
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
    
    # 创建Excel工作簿
    wb = Workbook()
    ws = wb.active
    ws.title = "部门预算报告"
    
    # 设置标题
    ws['A1'] = '部门预算执行报告'
    ws['A1'].font = Font(size=16, bold=True)
    ws.merge_cells('A1:F1')
    ws['A1'].alignment = Alignment(horizontal='center')
    
    # 写入数据
    headers = ['部门', '月份', '预算', '实际支出', '支出差异', '差异率']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=3, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="DDDDDD", end_color="DDDDDD", fill_type="solid")
    
    for row, (_, record) in enumerate(df.iterrows(), 4):
        for col, value in enumerate(record.values, 1):
            ws.cell(row=row, column=col, value=value)
    
    # 添加汇总行
    summary_row = len(df) + 5
    ws[f'A{summary_row}'] = '总计'
    ws[f'C{summary_row}'] = df['预算'].sum()
    ws[f'D{summary_row}'] = df['实际支出'].sum()
    ws[f'E{summary_row}'] = df['支出差异'].sum()
    
    # 保存到内存流
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    # 输出结果
    result = {
        "type": "excel",
        "title": "部门预算执行报告",
        "data_base64": base64.b64encode(output.getvalue()).decode('utf-8')
    }
    print(json.dumps(result))

# generate_excel_report()
```

## 📄 PDF报告生成

```python
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
import io
import base64
import json

def generate_pdf_report():
    """生成专业的PDF报告"""
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, 
                          rightMargin=72, leftMargin=72,
                          topMargin=72, bottomMargin=18)
    
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Center', alignment=1))
    
    # 构建文档内容
    story = []
    
    # 标题
    title = Paragraph("业务分析报告", styles['Title'])
    story.append(title)
    story.append(Spacer(1, 12))
    
    # 报告摘要
    story.append(Paragraph("执行摘要", styles['Heading2']))
    story.append(Paragraph("本报告详细分析了近期的业务表现，包括关键指标趋势、部门表现对比以及未来建议。", styles['BodyText']))
    story.append(Spacer(1, 12))
    
    # 关键指标表格
    story.append(Paragraph("关键绩效指标", styles['Heading2']))
    data = [
        ['指标', '当前值', '环比变化', '目标值'],
        ['总收入', '¥1,234,567', '+5.2%', '¥1,200,000'],
        ['新客户', '245', '+12.3%', '220'],
        ['客户满意度', '92%', '+2.1%', '90%'],
        ['项目完成率', '88%', '+3.5%', '85%']
    ]
    
    table = Table(data, colWidths=[1.5*inch, 1.2*inch, 1.2*inch, 1.2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(table)
    story.append(Spacer(1, 12))
    
    # 分析与建议
    story.append(Paragraph("分析与建议", styles['Heading2']))
    analysis_text = """
    基于当前数据分析，我们提出以下建议：
    
    1. 继续加强新客户获取策略，当前增长势头良好
    2. 优化客户服务流程，进一步提升客户满意度
    3. 关注项目交付质量，确保完成率持续提升
    4. 加强部门间协作，提高整体运营效率
    """
    story.append(Paragraph(analysis_text, styles['BodyText']))
    
    # 生成PDF
    doc.build(story)
    buffer.seek(0)
    
    result = {
        "type": "pdf",
        "title": "业务分析报告",
        "data_base64": base64.b64encode(buffer.getvalue()).decode('utf-8')
    }
    print(json.dumps(result))

# generate_pdf_report()
```

这个工作流文件提供了完整的报告生成解决方案，从数据准备到最终文档输出，支持多种格式的专业报告。
