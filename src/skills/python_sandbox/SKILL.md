---
name: python_sandbox
description: 在沙盒环境中执行Python代码，用于数据分析、可视化和生成Excel、Word、PDF等文件。支持数据清洗、统计分析、机器学习、图表生成、文档自动化等复杂工作流。
tool_name: python_sandbox
category: code
priority: 10
tags: ["python", "code", "visualization", "data-analysis", "chart", "document", "automation", "machine-learning", "reporting", "excel", "word", "pdf", "ppt"]
version: 2.0
references: ["matplotlib_cookbook.md", "pandas_cheatsheet.md", "report_generator_workflow.md", "ml_workflow.md", "sympy_cookbook.md","scipy_cookbook.md"]
---

# Python沙盒工具使用指南

## 🎯 核心能力概览

Python沙盒是一个多功能的代码执行环境，支持：
- **数据分析与处理**: 使用Pandas进行数据清洗、转换、聚合
- **可视化图表**: 使用Matplotlib, Seaborn, Plotly生成各种图表
- **文档自动化**: 创建和编辑Excel, Word, PDF, PPT文件
- **机器学习**: 使用scikit-learn进行模型训练和评估
- **科学与数学计算**: 使用Sympy进行符号计算和公式证明
- **工作流编排**: 复杂任务的自动化执行管道

## 🚀 基础调用规范

### 简单代码执行
对于简单的、一次性的代码执行，请遵循以下格式：

**调用格式:**
```json
{"code": "print('Hello, world!')"}
```

**输出规范:**
- 图片：必须以包含 `type: "image"` 和 `image_base64` 的JSON对象形式输出
- 文件：必须以包含 `type: "word|excel|..."` 和 `data_base64` 的JSON对象形式输出
- 详细规范请参考相关 references/ 文件

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

---

## 💡 核心工作流模式

### 公式证明工作流
1. **定义符号**: 使用 `sympy.symbols()` 定义所有变量
2. **构建表达式**: 将公式的左边和右边构建为两个独立的`sympy`表达式
3. **尝试直接简化**: 使用 `sympy.simplify(LHS - RHS)`，如果结果为0，则证明成立
4. **若不为0，尝试变换**: 使用 `expand()`, `factor()`, `trigsimp()` 等函数对表达式进行变换，再次尝试步骤3
5. **输出步骤**: 将你的每一步推理和使用的`sympy`代码清晰地呈现出来

### ETL管道模式 (Extract-Transform-Load)
1. **Extract**: 从数据源提取原始数据
2. **Transform**: 清洗、转换、处理数据
3. **Load**: 生成输出结果（图表、文档、分析报告）

### 分析报告工作流
1. **数据收集**: 获取或生成所需数据
2. **数据处理**: 清洗、转换、分析数据
3. **可视化**: 创建相关图表和可视化
4. **报告生成**: 整合数据和图表到最终文档

---

## 📋 可用库快速参考

### 数据处理
- `pandas==2.2.2` - 数据分析核心库
- `numpy==1.26.4` - 数值计算
- `scipy==1.14.1` - 科学计算

### 可视化
- `matplotlib==3.8.4` - 基础绘图库
- `seaborn==0.13.2` - 统计可视化
- `plotly==5.18.0` - 交互式图表

### 文档生成
- `python-docx==1.1.2` - Word文档
- `reportlab==4.0.7` - PDF生成
- `python-pptx==0.6.23` - PPT演示文稿
- `openpyxl==3.1.2` - Excel文件操作

### 机器学习与数学
- `scikit-learn==1.4.2` - 机器学习
- `sympy==1.12` - 符号数学
- `statsmodels==0.14.1` - 统计模型

---

## 🚨 重要提醒

1. **内存管理**: 及时关闭图表和文件流，使用 `plt.close('all')`
2. **性能优化**: 避免在循环中创建大型对象
3. **输出纯净**: 确保输出格式正确，避免额外文本
4. **按需加载**: 对于复杂任务，优先参考对应的references文件
5. **错误处理**: 在关键操作中添加try-catch块

通过这个结构化的指南和丰富的参考文件，您可以高效地完成各种复杂的Python编程任务。