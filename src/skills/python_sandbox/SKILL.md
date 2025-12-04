---
name: python_sandbox
description: 在沙盒环境中执行Python代码，用于数据分析、可视化和生成Excel、Word、PDF等文件。支持数据清洗、统计分析、机器学习、图表生成、文档自动化等复杂工作流。
tool_name: python_sandbox
category: code
priority: 10
tags: ["python", "code", "visualization", "data-analysis", "chart", "document", "automation", "machine-learning", "reporting", "excel", "word", "pdf", "ppt"]
version: 2.3
references: ["matplotlib_cookbook.md", "pandas_cheatsheet.md", "report_generator_workflow.md", "ml_workflow.md", "sympy_cookbook.md","scipy_cookbook.md", "text_analysis_cookbook.md"]
---

# Python沙盒工具使用指南 (v2.3 最终完整版)

## 🎯 核心能力概览

Python沙盒是一个多功能的代码执行环境，支持：
- **数据分析与处理**: 使用Pandas进行数据清洗、转换、聚合。
- **可视化图表**: 使用Matplotlib, Seaborn, Plotly生成各种图表，并支持**自动捕获**。
- **文档自动化**: 创建并提供可下载的Excel, Word, PDF, PPT文件。
- **机器学习**: 使用scikit-learn进行模型训练和评估。
- **科学与数学计算**: 使用Sympy和SciPy进行高级计算。
- **流程图生成**: 使用Graphviz和NetworkX创建系统架构图、流程图、网络关系图
- **持久化文件操作**: 在用户会话期间，支持在工作区内读取和写入文件。

---

## 📁 文件处理指南 (重要：两种模式)

本工具根据文件类型采用不同的处理方式，理解这一点至关重要。

### **模式A: 数据文件的上传与访问 (在工作区 `/data`)**

这种方式适用于需要用代码（如Pandas）直接读取和分析的文件。

- **支持的文件类型**: `.xlsx`, `.xls`, `.parquet`, `.csv`, `.json`, `.txt`
- **工作原理**: 这些文件会被**上传到服务器的会话工作区**。
- **代码访问方式**: 在代码中，你可以通过绝对路径 `/data/文件名` 来访问这些文件。

**读取示例:**
```python
import pandas as pd
df = pd.read_excel('/data/financial_report.xlsx')
print(df.head())
```

### **模式B: 媒体文件的处理 (在上下文中)**

这种方式适用于图片、PDF等，模型可以直接“看到”内容，但代码沙盒**无法**从 `/data` 目录访问它们。

- **支持的文件类型**: 图片 (`.png`, `.jpg`), `.pdf` 等。
- **工作原理**: 这些文件会被转换成Base64格式，并直接**嵌入到给模型的指令中**。它们**不会**出现在沙盒的 `/data` 目录里。
- **使用场景**: 当你需要模型描述一张图片内容、或总结一份PDF文档时，使用此方式。

---

## 🚀 输出规范：如何从沙盒返回结果

沙盒环境非常智能，它能自动捕获和格式化多种输出。请遵循以下最佳实践。

### **1. 图表输出 (首选：自动捕获)**

你**不需要**手动将图表转为图片或Base64。这是最简单、最推荐的方式。

- **指令**: 只需像在本地环境一样使用 `matplotlib.pyplot.show()`。
- **原理**: 系统会自动检测到你生成了图表，捕获它，然后以图片形式显示给用户。
- **参考**: `references/matplotlib_cookbook.md`

### **2. 可下载文件输出 (Word, Excel, PDF, PPT)**

要生成并让用户下载一个文件，你**必须**在代码的最后，使用 `print()` 输出一个特定格式的JSON对象。

- **JSON结构**: `{"type": "文件类型", "title": "文件名.后缀", "data_base64": "文件的Base64编码字符串"}`
- **支持的`type`**: `excel`, `word`, `ppt`, `pdf`
- **参考**: `references/report_generator_workflow.md`

### **3. 文本与数据输出**

对于任何文本、数字、Pandas DataFrame或其他分析结果，直接使用 `print()` 函数输出即可。系统会将其作为标准文本结果显示。

---

## 💾 会话内文件读写

**关键特性**: 你可以在会话期间，将文件（如中间结果、模型、图片等）写入到 `/data` 目录，并在**同一次会话**的后续代码执行中再次读取它们。

- **持久性**: 文件会保留在当前会话的工作区中，直到会话超时（24小时）。**新的聊天会话会使用一个新的、空的工作区。**

**工作流示例:**
1.  **第一次运行 (写入文件)**:
    ```python
    import pandas as pd
    df = pd.read_excel('/data/uploaded_data.xlsx')
    processed_df = df[df['value'] > 100]
    processed_df.to_csv('/data/processed_data.csv', index=False)
    print("数据已处理并保存到 /data/processed_data.csv")
    ```
2.  **第二次运行 (读取文件)**:
    ```python
    import pandas as pd
    final_df = pd.read_csv('/data/processed_data.csv')
    print(final_df.head())
    ```
---

## 📚 工作流与参考指南

当你需要执行一项具体的、复杂的任务时，**请首先查阅相关的参考文件**以获取最佳实践和代码模板。

### **1. 数据可视化**
- **任务**: 创建图表，如条形图、折线图、散点图、热力图等
- **指令**: **必须查阅 `references/matplotlib_cookbook.md`**。该文件包含了标准的图表生成模板，确保了高质量的、统一风格的输出

### **2. 数据清洗与分析**
- **任务**: 处理缺失值、异常值，进行描述性统计或相关性分析
- **指令**: **请参考 `references/pandas_cheatsheet.md`** 中的数据清洗流水线示例

### **3. 自动化报告生成**
- **任务**: 生成包含图表和数据的Word、Excel或PDF报告
- **指令**: **遵循 `references/report_generator_workflow.md`** 中的周报生成器工作流。它展示了如何组合数据、图表和文档库来创建复杂的报告

### **4. 机器学习**
- **任务**: 训练分类或回归模型，并评估其性能
- **指令**: **学习并使用 `references/ml_workflow.md`** 中的代码结构来训练和评估模型

### **5. 符号数学与公式证明**
- **任务**: 解代数方程、进行微积分计算、简化数学表达式、证明数学公式
- **指令**: **必须使用 `sympy` 库，并严格参考 `references/sympy_cookbook.md`** 中的函数和示例来构建你的解决方案

### **6. 科学计算与数值分析 (新增)**
- **任务**: 进行数值优化、积分、信号处理、线性代数等高级科学计算
- **指令**: **当需要进行复杂的数值计算时，请查阅 `references/scipy_cookbook.md`** 以获取正确的函数用法和示例

### 7. 文本分析与结构化提取 (新增)
- **任务**: 从爬虫获取的网页内容或文档中提取价格、规格、分类等结构化信息。
- **指令**: **必须查阅 `references/text_analysis_cookbook.md`**，并使用 `beautifulsoup4` 和 `lxml` 进行高效的HTML解析。

### 8. 流程图与架构图生成
- **任务**: 创建系统架构图、流程图、网络拓扑图
- **指令**: **请参考 `references/matplotlib_cookbook.md` 中的流程图章节**
- **适用场景**: 技术架构说明、系统设计、流程可视化

---

## 💡 核心工作流模式

### 公式证明工作流
1. **定义符号**: 使用 `sympy.symbols()` 定义所有变量
2. **构建表达式**: 将公式的左边和右边构建为两个独立的`sympy`表达式
3. **尝试直接简化**: 使用 `sympy.simplify(LHS - RHS)`，如果结果为0，则证明成立
4. **若不为0，尝试变换**: 使用 `expand()`, `factor()`, `trigsimp()` 等函数对表达式进行变换，再次尝试步骤3
5. **输出步骤**: 将你的每一步推理和使用的`sympy`代码清晰地呈现出来

### ETL管道模式 (Extract-Transform-Load)
1. **Extract**: 从数据源提取原始数据 (`/data` 目录中的文件)
2. **Transform**: 清洗、转换、处理数据 (可以将中间结果写入 `/data`)
3. **Load**: 生成输出结果（图表、可下载文档、分析报告）

### 分析报告工作流
1. **数据收集**: 获取或生成所需数据。
2. **数据处理**: 清洗、转换、分析数据。
3. **可视化**: 创建相关图表和可视化。
4. **报告生成**: 整合数据和图表到最终的可下载文档中。

---

## 📋 可用库快速参考

### 数据处理
- `pandas==2.2.2` - 数据分析核心库
- `numpy==1.26.4` - 数值计算
- `scipy==1.14.1` - 科学计算

### 网页内容处理
- `beautifulsoup4==4.12.3` - HTML/XML解析与数据提取
- `lxml==5.2.2` - 高性能HTML/XML解析器
- `tabulate==0.9.0` - 格式化表格输出

### 可视化
- `matplotlib==3.8.4` - 基础绘图库
- `seaborn==0.13.2` - 统计可视化
- `plotly==5.22.0` - 交互式图表

### 文档生成
- `python-docx==1.1.2` - Word文档
- `reportlab==4.0.7` - PDF生成
- `python-pptx==0.6.23` - PPT演示文稿
- `openpyxl==3.1.2` - Excel文件操作

### 机器学习与数学
- `scikit-learn==1.4.2` - 机器学习
- `sympy==1.12` - 符号数学
- `statsmodels==0.14.1` - 统计模型

### 流程图与网络图
- `graphviz` - 专业图表生成（自动布局，适合流程图、架构图）
- `pydot` - Graphviz接口库
- `networkx` - 复杂网络分析和可视化

---

## 🚨 重要提醒

1.  **图表优先使用 `plt.show()` (Matplotlib/Seaborn/NetworkX) 或创建 Plotly Figure 对象**，让系统自动捕获。
2.  **生成可下载文件必须 `print()` 指定的JSON格式**。
3.  **分清两种文件输入**: 上传的数据文件在 `/data` 中，附加的媒体文件在上下文中。
4.  **利用会话文件系统**: 你可以向 `/data` 目录写入和读取文件，这在多步骤的复杂分析中非常有用。
5.  **按需加载**: 对于复杂任务，优先参考对应的references文件。