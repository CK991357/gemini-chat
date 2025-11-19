
# 自动化报告生成指南 (v2.2 - 可下载版)

## 🚀 核心输出协议 (强制遵循)

**重要提示**: 要生成一个可供用户下载的文件（Word, Excel, PDF等），你的Python代码**必须**将文件内容进行Base64编码，并将其包裹在一个特定格式的JSON对象中，然后 `print` 这个JSON对象。

**工作流**:
1.  **导入必要库**: `io`, `base64`, `json`。
2.  **在内存中创建文件**: 使用 `io.BytesIO()` 创建一个内存缓冲区。
3.  **保存到内存**: 调用相应库的 `.save(buffer)` 方法将文件内容写入内存缓冲区。
4.  **编码**: 将缓冲区中的二进制数据编码为Base64字符串。
5.  **打包并打印**: 构建一个包含 `type` 和 `data_base64` 字段的字典，并使用 `json.dumps()` 打印出来。

---

## 📊 Word 报告生成 (.docx)

### ✅ 可直接使用的代码模板
```python
import io
import base64
import json
from docx import Document
from docx.shared import Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from datetime import datetime

# --- 1. 在内存中构建 Word 文档 ---
doc = Document()
doc.add_heading('业务分析报告', 0)
doc.add_paragraph(f'生成时间: {datetime.now().strftime("%Y-%m-%d")}')
doc.add_paragraph('这是一个由代码解释器生成的Word文档示例。')
# ... (添加更多内容, 如表格、图片等) ...

# --- 2. 保存到内存缓冲区 ---
buffer = io.BytesIO()
doc.save(buffer)
buffer.seek(0) # 重置指针到开头

# --- 3. Base64 编码并打包为 JSON ---
data_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
result = {
    "type": "word",
    "title": f"业务分析报告_{datetime.now().strftime('%Y%m%d')}.docx",
    "data_base64": data_base64
}

# --- 4. 打印最终的 JSON 对象 ---
print(json.dumps(result))
📈 Excel 报告生成 (.xlsx)
✅ 可直接使用的代码模板
code
Python
import io
import base64
import json
import pandas as pd
from datetime import datetime

# --- 1. 创建 DataFrame 并准备 Excel 内容 ---
data = {'Department': ['Sales', 'R&D'], 'Budget':, 'Actual_Spend':}
df = pd.DataFrame(data)

# --- 2. 使用 ExcelWriter 将 DataFrame 写入内存缓冲区 ---
output_buffer = io.BytesIO()
with pd.ExcelWriter(output_buffer, engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name='Budget Report', index=False)
    # 你可以在这里使用 writer.book 和 writer.sheets[sheet_name] 添加更复杂的格式
output_buffer.seek(0)

# --- 3. Base64 编码并打包为 JSON ---
data_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
result = {
    "type": "excel",
    "title": f"部门预算报告_{datetime.now().strftime('%Y%m%d')}.xlsx",
    "data_base64": data_base64
}

# --- 4. 打印最终的 JSON 对象 ---
print(json.dumps(result))
📄 PDF 报告生成 (.pdf)
✅ 可直接使用的代码模板
code
Python
import io
import base64
import json
from reportlab.platypus import SimpleDocTemplate, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from datetime import datetime

# --- 1. 在内存中构建 PDF 文档 ---
buffer = io.BytesIO()
doc = SimpleDocTemplate(buffer)
styles = getSampleStyleSheet()
story = [
    Paragraph("PDF 报告标题", styles['Title']),
    Paragraph(f"生成时间: {datetime.now().strftime('%Y-%m-%d')}", styles['Normal']),
    Paragraph("这是一个由代码解释器生成的PDF文档示例。", styles['BodyText'])
]
doc.build(story)
buffer.seek(0)

# --- 2. Base64 编码并打包为 JSON ---
data_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
result = {
    "type": "pdf",
    "title": f"示例PDF报告_{datetime.now().strftime('%Y%m%d')}.pdf",
    "data_base64": data_base64
}

# --- 3. 打印最终的 JSON 对象 ---
print(json.dumps(result))
⚠️ 重要注意事项
✅ 必须做的:
所有文件生成都必须遵循“保存到内存 -> Base64编码 -> 打印JSON”的流程。
最终的 print 语句只能输出一个标准的JSON对象。
❌ 绝对禁止:
禁止调用 doc.save('filename.docx') 或 wb.save('filename.xlsx') 将文件保存到本地路径。
禁止在打印最终的JSON对象之后，再 print 任何其他内容（如 "文件已生成"）。