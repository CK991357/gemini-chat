---
name: python_sandbox
description: 在沙盒环境中执行Python代码，用于数据分析、可视化和生成Excel、Word、PDF等文件。支持数据清洗、统计分析、机器学习、图表生成、文档自动化等复杂工作流。
tool_name: python_sandbox
category: code
priority: 10
tags: ["python", "code", "visualization", "data-analysis", "chart", "document", "automation", "machine-learning", "reporting", "excel", "word", "pdf", "ppt"]
version: 2.5
references: ["matplotlib_cookbook.md", "pandas_cheatsheet.md", "report_generator_workflow.md", "ml_workflow.md", "sympy_cookbook.md","scipy_cookbook.md", "text_analysis_cookbook.md"]
---

# Python沙盒工具使用指南 (v2.5 最终完整版)

## 🎯 核心能力概览

Python沙盒是一个多功能的代码执行环境，支持：
- **数据分析与处理**: 使用Pandas、Polars进行数据清洗、转换、聚合。
- **高性能计算**: 使用DuckDB、Numexpr进行内存SQL查询和表达式加速。
- **可视化图表**: 使用Matplotlib、Seaborn生成各种图表，并支持**自动捕获**。
- **文档自动化**: 创建并提供可下载的Excel、Word、PDF、PPT文件。
- **机器学习**: 使用scikit-learn、LightGBM进行模型训练和评估。
- **科学与数学计算**: 使用Sympy和SciPy进行高级计算。
- **流程图生成**: 使用Graphviz和NetworkX创建系统架构图、流程图、网络关系图。
- **文本分析**: 使用BeautifulSoup4和lxml进行HTML解析和数据提取。
- **性能优化**: 内置机械硬盘优化，支持异步文件操作和内存外计算。
- **持久化文件操作**: 在用户会话期间，支持在工作区内读取和写入文件。

---

## 📁 文件处理指南 (重要：两种模式)

本工具根据文件类型采用不同的处理方式，理解这一点至关重要。

### **模式A: 数据文件的上传与访问 (在工作区 `/data`)**

这种方式适用于需要用代码（如Pandas）直接读取和分析的文件。

- **支持的文件类型**: `.xlsx`, `.xls`, `.parquet`, `.csv`, `.json`, `.txt`, `.feather`
- **工作原理**: 这些文件会被**上传到服务器的会话工作区**。
- **代码访问方式**: 在代码中，你可以通过绝对路径 `/data/文件名` 来访问这些文件。

**读取示例:**
```python
import pandas as pd
df = pd.read_excel('/data/financial_report.xlsx')
print(df.head())
```

### **模式B: 媒体文件的处理 (在上下文中)**

这种方式适用于图片、PDF等，模型可以直接"看到"内容，但代码沙盒**无法**从 `/data` 目录访问它们。

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

### **6. 科学计算与数值分析**
- **任务**: 进行数值优化、积分、信号处理、线性代数等高级科学计算
- **指令**: **当需要进行复杂的数值计算时，请查阅 `references/scipy_cookbook.md`** 以获取正确的函数用法和示例

### **7. 文本分析与结构化提取**
- **任务**: 从爬虫获取的网页内容或文档中提取价格、规格、分类等结构化信息
- **指令**: **必须查阅 `references/text_analysis_cookbook.md`**，并使用 `beautifulsoup4` 和 `lxml` 进行高效的HTML解析

### **8. 流程图与架构图生成**
- **任务**: 创建系统架构图、流程图、网络拓扑图
- **指令**: **请参考 `references/matplotlib_cookbook.md` 中的流程图章节**
- **适用场景**: 技术架构说明、系统设计、流程可视化

### **9. 性能优化与高效数据处理** *(v2.5新增)*
- **任务**: 处理大型数据集、优化计算性能、减少内存使用
- **指令**: **查阅 `references/performance_optimization.md`** 了解如何使用DuckDB、Numexpr、Polars等库进行高效数据处理

### **10. 异步文件操作与IO优化** *(v2.5新增)*
- **任务**: 处理大文件、优化磁盘IO、避免阻塞操作
- **指令**: **参考 `references/async_io_guide.md`** 了解如何使用aiofiles进行异步文件操作

### **11. 高级机器学习与模型优化** *(v2.5新增)*
- **任务**: 使用梯度提升树、特征编码、超参数优化
- **指令**: **查阅 `references/advanced_ml_workflow.md`** 了解LightGBM、Category Encoders等高级ML工具的使用

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

### 机械硬盘优化工作流 *(v2.5新增)*
1. **格式转换**: 将CSV转换为Feather格式，提升10-100倍读写速度
2. **分块处理**: 使用分块读取，避免一次性加载大文件到内存
3. **内存外计算**: 使用DuckDB或Vaex进行内存外查询和计算
4. **异步IO**: 使用aiofiles进行非阻塞文件操作

---

## ⚡ 性能优化与高级功能 (v2.5新增)

### 1. 异步文件操作

#### aiofiles - 异步读写
**用途**: 异步文件操作，避免IO阻塞
**优势**: 提升IO密集型任务性能，机械硬盘特别受益
```python
import aiofiles
import asyncio

async def process_large_file():
    # 异步读取，不阻塞主线程
    async with aiofiles.open('/data/large_file.csv', 'r') as f:
        content = await f.read()
    
    # 处理数据...
    
    # 异步写入
    async with aiofiles.open('/data/processed.csv', 'w') as f:
        await f.write(processed_content)

# 在异步环境中调用
await process_large_file()
```

### 2. 内存缓存与并行计算

#### joblib - 磁盘缓存和并行
**用途**: 函数结果缓存和简单并行计算
**优势**: 减少重复计算，机械硬盘友好
```python
from joblib import Memory
import time

# 创建内存缓存（可配置到磁盘）
cachedir = '/data/cache'
memory = Memory(cachedir, verbose=0)

@memory.cache
def expensive_computation(x, y):
    """计算结果会被缓存到磁盘"""
    time.sleep(2)  # 模拟耗时计算
    return x * y + x**2

# 第一次计算慢，后续从磁盘读取快
result1 = expensive_computation(10, 20)  # 慢
result2 = expensive_computation(10, 20)  # 快（从缓存）
```

### 3. 机械硬盘优化技巧

#### 使用Feather格式替代CSV
```python
import pyarrow.feather as feather
import pandas as pd

# 读取大型CSV文件并转换为高效格式
df = pd.read_csv('/data/large.csv')
feather.write_feather(df, '/data/large.feather')  # 保存为Feather格式

# 下次读取：速度极快，内存高效
df_fast = feather.read_feather('/data/large.feather')
```

#### 分块处理大文件
```python
chunk_size = 50000  # 机械硬盘建议5-10万行
results = []

for chunk in pd.read_csv('/data/huge.csv', chunksize=chunk_size):
    # 处理每个块
    processed = process_chunk(chunk)
    results.append(processed)
    
    # 及时释放内存
    del chunk
    
# 合并结果时也分块
final_result = pd.concat(results, ignore_index=True)
```

#### 使用DuckDB替代Pandas重操作
```python
import duckdb

# ❌ 耗内存的Pandas操作
# df = pd.read_csv('/data/large.csv')
# result = df.groupby('category').agg({'value': ['mean', 'sum', 'count']})

# ✅ 内存友好的DuckDB操作
result = duckdb.sql("""
    SELECT category, 
           AVG(value) as mean_value,
           SUM(value) as sum_value,
           COUNT(value) as count_value
    FROM read_csv('/data/large.csv')
    GROUP BY category
""").df()
```

---

## 📋 可用库快速参考

### 数据处理
- `pandas==2.2.2` - 数据分析核心库
- `numpy==1.26.4` - 数值计算
- `scipy==1.14.1` - 科学计算
- `pyarrow==14.0.2` - Feather格式支持，高效IO
- `duckdb==0.10.2` - 内存SQL查询引擎 *(v2.5新增)*
- `numexpr==2.10.0` - 数值表达式加速 *(v2.5新增)*
- `bottleneck==1.3.8` - 滚动统计加速 *(v2.5新增)*

### 网页内容处理
- `beautifulsoup4==4.12.3` - HTML/XML解析与数据提取
- `lxml==5.2.2` - 高性能HTML/XML解析器
- `tabulate==0.9.0` - 格式化表格输出

### 可视化
- `matplotlib==3.8.4` - 基础绘图库
- `seaborn==0.13.2` - 统计可视化

### 文档生成
- `python-docx==1.1.2` - Word文档
- `reportlab==4.0.7` - PDF生成
- `python-pptx==0.6.23` - PPT演示文稿
- `openpyxl==3.1.2` - Excel文件操作

### 机器学习与数学
- `scikit-learn==1.5.0` - 机器学习核心库 *(v2.5升级)*
- `sympy==1.12` - 符号数学
- `statsmodels==0.14.1` - 统计模型
- `lightgbm==4.3.0` - 高效梯度提升 *(v2.5新增)*
- `category_encoders==2.6.3` - 分类特征编码 *(v2.5新增)*
- `scikit-optimize==0.9.0` - 贝叶斯超参数优化 *(v2.5新增)*

### 流程图与网络图
- `graphviz` - 专业图表生成（自动布局，适合流程图、架构图）
- `pydot` - Graphviz接口库
- `networkx` - 复杂网络分析和可视化

### 性能优化与工具
- `tqdm==4.66.4` - 进度条显示 *(v2.5新增)*
- `joblib==1.3.2` - 磁盘缓存和并行 *(v2.5新增)*
- `aiofiles==24.1.0` - 异步文件操作 *(v2.5新增)*

---

## 🚫 环境限制说明

**禁止以下操作**:
- ❌ 类定义 (`class MyClass:`)
- ❌ 动态代码执行 (`exec()`, `eval()`)
- ❌ 文件系统访问（除 `/data` 目录外）

**推荐做法**:
- ✅ 使用纯函数式编程
- ✅ 将复杂逻辑拆分为多个小函数
- ✅ 使用字典和列表组织数据

---

## 🚨 重要提醒

1.  **图表优先使用 `plt.show()`**，让系统自动捕获。
2.  **生成可下载文件必须 `print()` 指定的JSON格式**。
3.  **分清两种文件输入**: 上传的数据文件在 `/data` 中，附加的媒体文件在上下文中。
4.  **利用会话文件系统**: 你可以向 `/data` 目录写入和读取文件，这在多步骤的复杂分析中非常有用。
5.  **按需加载**: 对于复杂任务，优先参考对应的references文件。
6.  **机械硬盘优化**: 使用Feather格式、分块处理、DuckDB替代重Pandas操作。
7.  **内存限制**: 容器内存限制为5GB，避免使用swap，确保稳定性。
8.  **新库使用**: v2.5新增库无需特殊配置，直接导入即可使用。

---

## 📈 版本更新说明

### v2.5 (当前版本) 主要更新：
1. **性能优化库**: 新增DuckDB、Numexpr、Bottleneck，提升数据处理性能3-10倍
2. **机器学习增强**: 升级scikit-learn到1.5.0，新增LightGBM、Category Encoders、scikit-optimize
3. **实用工具**: 新增tqdm进度条、joblib缓存、aiofiles异步IO
4. **机械硬盘优化**: 内置Feather格式支持、分块处理指南、内存外计算策略
5. **文档完善**: 新增性能优化、异步IO、高级ML三个reference文件

### v2.4 (上一版本) 主要更新：
- 新增文本分析能力（BeautifulSoup4、lxml）
- 完善图表自动捕获系统
- 优化会话文件管理

---

## 🔧 技术支持与故障排除

### 常见问题
1. **内存不足错误**: 使用分块处理、DuckDB内存外查询、Feather格式
2. **处理速度慢**: 启用Numexpr表达式加速、使用Bottleneck滚动统计
3. **大型文件处理**: 使用分块读取、异步IO、内存外计算
4. **模型训练慢**: 使用LightGBM替代传统算法，启用scikit-optimize自动调参

### 性能监控命令
```bash
# 监控内存使用
watch -n 2 "free -h | grep -E 'Mem|Swap'"

# 监控磁盘IO（机械硬盘关键指标）
iostat -x 2

# 监控Docker容器
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
```
