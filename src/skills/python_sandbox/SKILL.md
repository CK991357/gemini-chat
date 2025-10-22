---
name: python_sandbox
description: 在沙盒环境中执行Python代码，用于数据分析、可视化和生成Excel、Word、PDF等文件
tool_name: python_sandbox
category: code
priority: 10
tags: ["python", "code", "visualization", "data-analysis", "chart", "document"]
version: 1.0
---

# 工具使用指南

## 重要提示

当你决定调用工具时，`arguments` 字段**必须**是一个严格有效的 JSON 字符串。

- **不要**添加额外的引号或逗号
- **不要**在 JSON 字符串内部包含任何非 JSON 格式的文本（如 Markdown 代码块的分隔符 ```）
- 确保所有键和字符串值都用双引号 `"` 包裹
- 确保 JSON 对象以 `{` 开始，以 `}` 结束
- 所有参数名和枚举值必须与工具的 `Input Schema` 严格匹配
- 在沙盒环境中使用内存流生成文件（如 Word 文档）
- 通过 Base64 编码将文件数据嵌入 JSON 结构
- 使用标准输出格式：`{"type": "file_type", "title": "文件名", "data_base64": "..."}`

## 工具调用示例（Code Interpreter / python_sandbox）

可用的 Python 库及其版本（用于 Code Interpreter / python_sandbox）：

- `fastapi`
- `uvicorn`
- `docker`
- `numpy==1.26.4`
- `scipy==1.14.1`
- `pandas==2.2.2`
- `openpyxl==3.1.2` (Excel 文件操作)
- `sympy==1.12`
- `matplotlib==3.8.4`
- `seaborn==0.13.2`
- `python-docx==1.1.2` (Word 文档操作)
- `reportlab==4.0.7` (PDF 生成)
- `python-pptx==0.6.23` (PPT 操作)

## 工具调用格式规范

### ➡️ 场景 1: 常规代码执行

当调用 `python_sandbox` 工具时，你生成的 `tool_calls` 中 `function.arguments` 字段**必须**是一个 **JSON 字符串**。该字符串在被解析后，必须是一个只包含 "code" 键的 JSON 对象。

**✅ 正确的 `arguments` 字符串内容示例:**
```json
{"code": "print('Hello, world!')"}
```

*重要提示：模型实际生成的 `arguments` 值是一个字符串，例如：`"{\"code\": \"print('Hello!')\"}"`。*

**❌ 错误示例 (请避免以下常见错误):**
- **`arguments` 不是有效的 JSON 字符串:** `'print("hello")'` (错误：必须是 JSON 格式的字符串)
- **在 JSON 字符串中嵌入 Markdown 分隔符:** `"```json\n{\"code\": \"print(1)\"}\n```"` (错误：这会破坏 JSON 字符串的结构)
- **参数名错误:** `{"script": "print('hello')"}` (错误：参数名必须是 "code")
- **参数值类型错误:** `{"code": 123}` (错误：`code` 的值必须是字符串)

### ➡️ 场景 2: 数据可视化与绘图

当用户明确要求数据可视化，或你认为通过图表展示数据更清晰时，你必须使用 `python_sandbox` 工具生成 Python 代码来创建图表。

**请严格遵循以下代码生成规范：**

1. **导入和后端设置**: 你的 Python 代码必须在开头包含 `import matplotlib; matplotlib.use('Agg')` 以确保在无头服务器环境正常运行
2. **库使用**: 优先使用 `matplotlib.pyplot` 和 `seaborn` 进行绘图。`pandas` 可用于数据处理
3. **无文件保存**: **绝不**将图表保存为物理文件。**必须**将图表保存到一个内存字节流（`io.BytesIO`）中，格式为 PNG。最终回复中只需要向用户确认图片已经生成，**绝不**在最终回复中重复完整的 Base64 字符串
4. **输出格式要求**：
   - **推荐使用 JSON 格式**（与文件输出保持一致）：
     ```python
     result = {
         "type": "image",
         "title": "图表标题",
         "image_base64": "iVBORw0KGgoAAAANSUhEUg..."
     }
     print(json.dumps(result))
     ```
   - **或者继续使用纯 Base64 字符串**（保持向后兼容）

**以下是一个完整且正确的代码结构示例，请严格遵守来生成你的 Python 代码：**

```python
import matplotlib
matplotlib.use('Agg') # 确保在无头服务器环境正常运行
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import io
import base64
import json  # 必须导入 json

# --- 在此区域编写你的数据处理和绘图代码 ---
# 示例：假设用户提供了以下数据
# data = {'产品': ['A', 'B', 'C'], '销量': [150, 200, 100]}
# df = pd.DataFrame(data)
# plt.figure(figsize=(8, 6)) # 设置图表大小
# sns.barplot(x='产品', y='销量', data=df)
# plt.title('产品销量柱状图')
# plt.xlabel('产品类型')
# plt.ylabel('销量')
# --- 绘图代码结束 ---

# --- 以下是用于将图片转为 Base64 并输出的固定模板代码，请直接包含 ---
buf = io.BytesIO()
plt.savefig(buf, format='png', bbox_inches='tight')
buf.seek(0)
image_base64 = base64.b64encode(buf.read()).decode('utf-8')
buf.close()
plt.close('all') # 关闭所有图表以释放内存，重要！

# 使用 JSON 格式输出（推荐）
result = {
    "type": "image",
    "title": "产品销量柱状图",
    "image_base64": image_base64
}
print(json.dumps(result))
```

**传统 Base64 格式（仍然支持）：**
```python
# 如果使用传统 Base64 格式，直接输出字符串
print(image_base64)
```

### ➡️ 场景 3: 生成 Office 文档和 PDF 文件

**功能说明**：支持生成 Excel、Word、PPT 和 PDF 文件，前端会自动提供下载链接。

**生成 Office 文档和 PDF 的规范：**

1. **输出格式要求**：
   - **必须使用 JSON 格式输出**，前端支持以下两种格式：

   **格式一（标准格式 - 推荐）：**
   ```json
   {
       "type": "word",  // 必须是 "excel", "word", "ppt", "pdf" 之一
       "title": "文档标题", 
       "data_base64": "UEsDBBQAAAA..."
   }
   ```

   **格式二（自定义格式 - 也支持）：**
   ```json
   {
       "file": {
           "name": "hello.docx",
           "content": "UEsDBBQAAAA...",
           "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
       }
   }
   ```

   - **重要**：必须使用 `json.dumps()` 将对象转换为 JSON 字符串输出
   - **不要**直接输出纯 base64 字符串

2. **完整示例（生成 Word 文档 - 标准格式）：**
```python
from docx import Document
import io
import base64
import json  # 必须导入 json

# 创建 Word 文档
doc = Document()
doc.add_paragraph('hello word')  # 按用户要求的内容

# 保存到内存字节流
output = io.BytesIO()
doc.save(output)
output.seek(0)

# 编码为 Base64 并输出 JSON 格式
result = {
    "type": "word",
    "title": "测试文档", 
    "data_base64": base64.b64encode(output.read()).decode('utf-8')
}
print(json.dumps(result))  # 关键：必须使用 json.dumps()
```

3. **Excel 文件生成示例：**
```python
import pandas as pd
import io
import base64
import json

# 创建数据
data = {
    '产品': ['A', 'B', 'C', 'D'],
    '销量': [150, 200, 100, 250],
    '利润': [45, 60, 30, 75]
}
df = pd.DataFrame(data)

# 将 DataFrame 保存到内存字节流
output = io.BytesIO()
with pd.ExcelWriter(output, engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name='销售数据', index=False)
output.seek(0)

# 编码为 Base64
excel_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
output.close()

# 输出 JSON 对象
result = {
    "type": "excel",
    "title": "销售报告",
    "data_base64": excel_base64
}
print(json.dumps(result))
```

4. **PDF 生成示例：**
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import io
import base64
import json

# 创建 PDF
buffer = io.BytesIO()
c = canvas.Canvas(buffer, pagesize=letter)
c.drawString(100, 750, "PDF 报告标题")
c.drawString(100, 730, "这是通过 Python 自动生成的 PDF 文档")
c.save()

buffer.seek(0)
pdf_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
buffer.close()

# 输出 JSON 对象
result = {
    "type": "pdf",
    "title": "数据分析报告",
    "data_base64": pdf_base64
}
print(json.dumps(result))
```

5. **PPT 生成示例：**
```python
from pptx import Presentation
import io
import base64
import json

# 创建 PPT
prs = Presentation()
slide_layout = prs.slide_layouts[0]  # 标题幻灯片
slide = prs.slides.add_slide(slide_layout)
title = slide.shapes.title
subtitle = slide.placeholders[1]

title.text = "演示文稿标题"
subtitle.text = "自动生成的 PPT 内容"

# 保存到内存字节流
output = io.BytesIO()
prs.save(output)
output.seek(0)

# 编码为 Base64
ppt_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
output.close()

# 输出 JSON 对象
result = {
    "type": "ppt",
    "title": "业务演示",
    "data_base64": ppt_base64
}
print(json.dumps(result))
```

## 前端处理逻辑说明

### 图片处理
- **JSON 格式图片**：自动解析并在聊天界面中显示
- **纯 Base64 图片**：自动检测并在聊天界面中显示（向后兼容）
- **支持格式**：PNG、JPEG 等
- **显示方式**：内嵌在消息流中

### 文件下载
- **支持格式**：Excel (.xlsx)、Word (.docx)、PPT (.pptx)、PDF (.pdf)
- **处理方式**：自动生成下载链接，用户点击即可下载
- **用户体验**：带有文件类型图标、清晰的文件名和成功提示消息
- **支持格式**：标准 JSON 格式和自定义 JSON 格式

### 错误处理
- 如果代码执行出错，错误信息会显示在聊天界面
- 文件生成失败时会显示具体的错误原因
- 前端会自动滚动到最新内容

## 重要提醒

1. **内存管理**：使用 `plt.close('all')` 释放图表内存，及时关闭文件流
2. **编码规范**：确保 Base64 编码正确，避免数据损坏
3. **输出纯净**：除 Base64 字符串或 JSON 对象外，不要输出其他文本
4. **性能考虑**：大型文件可能会影响性能，建议控制文件大小
5. **格式验证**：生成的 Office 文档和 PDF 应确保格式正确
6. **指针重置**：在读取 BytesIO 内容前使用 `.seek(0)`
7. **JSON 输出**：所有文件输出都必须使用 `json.dumps()` 包装

### 错误示例 vs 正确示例：

**❌ 错误（不会被前端识别为文件）：**
```python
print(base64.b64encode(buffer.read()).decode('utf-8'))
```

**✅ 正确（会被前端识别并创建下载链接）：**
```python
result = {
    "type": "word",
    "title": "测试文档",
    "data_base64": base64.b64encode(buffer.read()).decode('utf-8')
}
print(json.dumps(result))
```

现在，请根据用户的需求和提供的任何数据，选择合适的工具并生成响应。记住前端会自动处理图片显示和文件下载，你只需要专注于生成正确的代码和输出格式。

**统一输出策略建议**：
为了保持一致性，建议所有输出都使用 JSON 格式：
- **图片**：`{"type": "image", "title": "...", "image_base64": "..."}`
- **文件**：`{"type": "word", "title": "...", "data_base64": "..."}`

这样前端处理逻辑会更加统一和清晰。