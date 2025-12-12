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

# Python沙盒工具使用指南 v2.5 (审查优化版)

## 🎯 **核心能力概览**

Python沙盒是一个**多功能的代码执行环境**，支持：

| 功能领域 | 主要用途 | 关键库 |
|---------|---------|-------|
| **数据分析** | 数据清洗、转换、聚合 | Pandas, Polars |
| **高性能计算** | 内存SQL、表达式加速 | DuckDB, Numexpr, Bottleneck |
| **可视化** | 图表生成与自动捕获 | Matplotlib, Seaborn |
| **文档自动化** | Excel/Word/PDF/PPT生成 | python-docx, reportlab, openpyxl |
| **机器学习** | 模型训练与评估 | scikit-learn, LightGBM |
| **符号数学** | 公式证明、方程求解 | SymPy |
| **科学计算** | 优化、积分、信号处理 | SciPy |
| **流程图生成** | 架构图、流程图 | Graphviz, NetworkX |
| **文本分析** | HTML解析、数据提取 | BeautifulSoup4, lxml |
| **性能优化** | 机械硬盘优化、异步IO | aiofiles, joblib |

---

## 📁 **文件处理指南 - 两种模式必须分清**

### **模式A: 工作区文件 (`/data` 目录)**
**用途**: 数据分析、处理、持久化存储
**支持格式**: `.csv`, `.xlsx`, `.xls`, `.parquet`, `.json`, `.txt`, `.feather`
**访问方式**: 绝对路径 `/data/文件名`
```python
import pandas as pd
df = pd.read_csv('/data/sales.csv')  # ✅ 正确
```

### **模式B: 上下文文件 (Base64嵌入)**
**用途**: 图片识别、PDF内容提取
**支持格式**: `.png`, `.jpg`, `.jpeg`, `.pdf`, `.txt`(小文件)
**特点**: 文件内容直接嵌入对话，**不在 `/data` 目录**
```python
# ❌ 错误：无法从/data读取上传的图片
# img = Image.open('/data/uploaded_image.png')  # 会失败
```

---

## 🚀 **输出规范 - 记住三种方式**

### **1. 图表输出 - 系统自动捕获**
```python
import matplotlib.pyplot as plt
plt.plot([1,2,3], [4,5,6])
plt.title('示例图表')
plt.show()  # 🎯 关键：自动捕获，无需手动处理
```

### **2. 可下载文件 - 必须使用JSON格式**
```python
import base64
import json

# 生成文件内容后...
file_data = base64.b64encode(content).decode('utf-8')
output = {
    "type": "excel",  # 或 "word", "pdf", "ppt"
    "title": "销售报告.xlsx",
    "data_base64": file_data
}
print(json.dumps(output))  # 🎯 必须用JSON格式打印
```

### **3. 文本/数据 - 直接print**
```python
print("分析结果:")
print(f"总计: {total}")
print(df.describe())  # Pandas DataFrame自动美化显示
```

---

## 💾 **会话持久化 - 跨代码执行的文件共享**

### **工作流示例：**
```python
# 第一步：处理数据并保存
import pandas as pd
df = pd.read_excel('/data/原始数据.xlsx')
processed = df.groupby('部门')['销售额'].sum()
processed.to_csv('/data/部门汇总.csv')  # ✅ 保存中间结果
print("已保存部门汇总数据")

# 第二步：读取中间结果继续分析
df_summary = pd.read_csv('/data/部门汇总.csv')
print(f"读取到 {len(df_summary)} 个部门的汇总数据")
```

### **重要提醒：**
- ✅ 同一会话内文件持久化（24小时超时）
- ✅ 新会话开始时 `/data` 目录为空
- ✅ 建议保存中间结果避免重复计算

---

## 📚 **工作流参考 - 按需查阅**

### **快速查找表：**

| 任务类型 | 参考文件 | 核心库 |
|---------|---------|-------|
| **创建图表** | `matplotlib_cookbook.md` | matplotlib, seaborn |
| **数据处理** | `pandas_cheatsheet.md` | pandas, duckdb |
| **生成报告** | `report_generator_workflow.md` | python-docx, reportlab |
| **机器学习** | `ml_workflow.md` | scikit-learn, lightgbm |
| **符号数学** | `sympy_cookbook.md` | sympy |
| **科学计算** | `scipy_cookbook.md` | scipy |
| **文本解析** | `text_analysis_cookbook.md` | beautifulsoup4, lxml |

### **示例工作流：**

#### **A. 公式证明工作流**
```python
# 1. 定义符号
import sympy as sp
x, y = sp.symbols('x y')

# 2. 构建表达式
lhs = (x + y)**2
rhs = x**2 + 2*x*y + y**2

# 3. 验证恒等
difference = sp.simplify(lhs - rhs)
print(f"差值: {difference}")
print(f"是否恒等: {difference == 0}")
```

#### **B. ETL数据分析工作流**
```python
# Extract
df = pd.read_csv('/data/raw.csv')

# Transform
df_clean = (df
           .dropna()
           .drop_duplicates()
           .assign(profit = lambda d: d['revenue'] - d['cost']))

# Load
df_clean.to_csv('/data/cleaned.csv', index=False)
print(df_clean.describe())
```

---

## ⚡ **性能优化指南 (v2.5核心优势)**

### **1. 大文件处理策略**

#### **分块读取 (50MB+文件)**
```python
chunks = []
for chunk in pd.read_csv('/data/large.csv', chunksize=50000):
    processed = process_chunk(chunk)  # 自定义处理函数
    chunks.append(processed)
final_df = pd.concat(chunks, ignore_index=True)
```

#### **格式转换加速**
```python
# 转换CSV为Feather格式 (提速10-100倍)
import pyarrow.feather as feather
df = pd.read_csv('/data/slow.csv')
feather.write_feather(df, '/data/fast.feather')  # 保存

# 后续读取极快
df_fast = feather.read_feather('/data/fast.feather')
```

### **2. 内存外计算 (避免OOM)**

#### **DuckDB内存SQL**
```python
import duckdb

# 直接查询CSV，不加载到内存
result = duckdb.sql("""
    SELECT department, 
           AVG(salary) as avg_salary,
           COUNT(*) as count
    FROM read_csv_auto('/data/employees.csv')
    WHERE hire_date > '2024-01-01'
    GROUP BY department
    ORDER BY avg_salary DESC
    LIMIT 10
""").df()  # 最后转为DataFrame
print(result)
```

#### **Numexpr表达式加速**
```python
import numexpr as ne

# 传统方式（慢）
df['result'] = df['A'] * 2 + df['B'] ** 2 - df['C'] / 3

# Numexpr方式（快3-5倍）
df['result'] = ne.evaluate(
    "A * 2 + B ** 2 - C / 3",
    local_dict={k: df[k].values for k in ['A', 'B', 'C']}
)
```

### **3. 异步文件操作**
```python
import aiofiles
import asyncio

async def process_file_async():
    async with aiofiles.open('/data/large.txt', 'r') as f:
        content = await f.read()
    # 异步处理...
    return processed_content
```

---

## 📋 **可用库快速参考 (v2.5)**

### **数据处理核心**
```python
import pandas as pd          # 数据分析
import numpy as np           # 数值计算
import duckdb                # 内存SQL (v2.5新增)
import numexpr as ne         # 表达式加速 (v2.5新增)
import bottleneck as bn      # 滚动统计加速 (v2.5新增)
```

### **机器学习增强**
```python
from sklearn.ensemble import RandomForestClassifier
import lightgbm as lgb       # 梯度提升树 (v2.5新增)
import category_encoders as ce  # 分类编码 (v2.5新增)
from skopt import BayesSearchCV  # 贝叶斯优化 (v2.5新增)
```

### **可视化与图表**
```python
import matplotlib.pyplot as plt  # 基础绘图
import seaborn as sns            # 统计可视化
import graphviz                  # 流程图 (自动布局)
import networkx as nx            # 网络图
```

### **文档生成**
```python
from docx import Document        # Word文档
from reportlab.lib.pagesizes import letter  # PDF生成
from pptx import Presentation    # PPT演示文稿
import openpyxl                  # Excel操作
```

---

## 🚨 **重要限制与最佳实践**

### **✅ 必须遵守的规则**
1. **图表输出**: 总是使用 `plt.show()`，系统自动捕获
2. **文件生成**: 必须输出特定JSON格式给可下载文件
3. **文件访问**: 数据文件在 `/data` 目录，媒体文件在上下文中
4. **内存管理**: 容器限制6GB，避免使用swap

### **❌ 禁止的操作**
```python
# 以下操作会被阻止：
exec("危险代码")                 # ❌ 动态执行
__import__('os').system('rm')   # ❌ 系统命令
open('/etc/passwd')             # ❌ 访问系统文件
```

### **⚠️ 性能警告**
1. **大文件**: >50MB时使用分块处理
2. **复杂计算**: 使用DuckDB或Numexpr加速
3. **重复操作**: 使用Feather格式缓存中间结果
4. **内存监控**: 及时删除大变量 `del large_df`

---

## 🔧 **故障排除与调试**

### **常见问题解决**

#### **问题1: 内存不足**
```python
# ❌ 错误做法
df = pd.read_csv('/data/huge.csv')  # 可能崩溃

# ✅ 正确做法
# 方案A: 分块处理
for chunk in pd.read_csv('/data/huge.csv', chunksize=50000):
    process(chunk)

# 方案B: 使用DuckDB内存外查询
result = duckdb.sql("SELECT * FROM read_csv_auto('/data/huge.csv') LIMIT 10000").df()
```

#### **问题2: 处理速度慢**
```python
# ❌ 慢速Pandas操作
df['result'] = df['A'] * 2 + df['B'] ** 2 - df['C'] / 3

# ✅ 使用Numexpr加速
df['result'] = ne.evaluate("A * 2 + B ** 2 - C / 3", 
                          {k: df[k].values for k in ['A', 'B', 'C']})
```

#### **问题3: 图表不显示**
```python
# ❌ 缺少show()
plt.plot(x, y)
plt.title('图表')

# ✅ 必须调用show()
plt.plot(x, y)
plt.title('图表')
plt.show()  # 🎯 关键！
```

---

## 📈 **版本更新日志**

### **v2.5 核心升级**
1. **性能库新增**: DuckDB (内存SQL)、Numexpr (表达式加速)、Bottleneck (滚动统计)
2. **ML增强**: LightGBM、Category Encoders、scikit-optimize (贝叶斯优化)
3. **工具完善**: tqdm进度条、joblib缓存、aiofiles异步IO
4. **机械硬盘优化**: Feather格式指南、分块处理策略、内存外计算

### **v2.4 主要功能**
- 文本分析能力 (BeautifulSoup4 + lxml)
- 图表自动捕获系统完善
- 会话文件管理优化

---

## 🎯 **快速开始模板**

### **模板1: 基础数据分析**
```python
import pandas as pd
import matplotlib.pyplot as plt

# 1. 读取数据
df = pd.read_csv('/data/data.csv')

# 2. 快速分析
print(f"数据形状: {df.shape}")
print(df.describe())

# 3. 简单可视化
df.groupby('category')['value'].mean().plot(kind='bar')
plt.title('各分类平均值')
plt.tight_layout()
plt.show()
```

### **模板2: 完整报告生成**
```python
# 参考: report_generator_workflow.md
# 包含数据读取、分析、图表、文档生成全流程
```

### **模板3: 机器学习建模**
```python
# 参考: ml_workflow.md
# 包含数据预处理、特征工程、模型训练、评估
```

---

## 💡 **终极提示**

1. **优先查阅参考文件** - 不要重新发明轮子
2. **利用会话持久化** - 保存中间结果，分步执行复杂任务
3. **信任自动化系统** - 图表、输出格式等交给后端处理
4. **性能敏感用优化库** - 大文件用DuckDB，复杂计算用Numexpr
5. **测试代码片段** - 复杂逻辑先小规模测试

---

## 🔗 **相关资源**

- **完整示例库**: 所有参考文件中的代码示例
- **性能测试**: 对比不同方法的执行效率
- **最佳实践**: 各领域的标准化工作流
- **故障案例**: 常见问题及解决方案

**记住**: 这个沙盒环境已经预配置了所有库和优化，你只需要专注于业务逻辑！系统会自动处理技术细节，让你像在本地环境一样顺畅工作。