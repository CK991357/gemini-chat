# Matplotlib 图表菜谱

## 🚀【强制协议】图像输出的唯一正确方法

当你需要使用 Matplotlib 生成任何图表（条形图、折线图等）时，你的 Python 代码**必须**严格遵循以下模板的最后一部分，以确保图像能够被正确显示。

**绝对禁止**调用 `plt.show()` 或将图表保存到文件名中。

---

## 📊 标准图表模板 (必须遵循)

这是一个生成专业条形图的完整、可直接使用的示例。

```python
import matplotlib.pyplot as plt
import pandas as pd
import io
import base64
import json

# --- 1. 数据准备 (你可以修改这部分) ---
# 例如，使用 Pandas DataFrame
data = {'Category': ['A', 'B', 'C', 'D'], 'Values':}
df = pd.DataFrame(data)

# --- 2. 图表绘制 (你可以修改这部分) ---
plt.figure(figsize=(10, 6))
plt.bar(df['Category'], df['Values'], color=['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'])
plt.title('产品销售额对比', fontsize=14, fontweight='bold')
plt.xlabel('产品类别')
plt.ylabel('销售额 (万元)')
plt.grid(True, alpha=0.3)
plt.tight_layout()

# ======================================================================
# --- 3. 标准化输出模块 (复制并粘贴此部分，不要修改！) ---
# ======================================================================
buf = io.BytesIO()
# 将图表“画”到内存缓冲区中
plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
# 关闭图表以释放内存
plt.close('all')
# 重置缓冲区的指针到开头
buf.seek(0)
# 将内存中的图像数据编码为 Base64
image_base64 = base64.b64encode(buf.read()).decode('utf-8')

# 构建并打印最终的、标准的 JSON 对象
result = {
    "type": "image",
    "title": "产品销售额对比图", # ‼️ 重要：请将此处的标题修改为你的图表标题
    "image_base64": image_base64
}
print(json.dumps(result))
# ======================================================================
🎨 其他图表类型
当你需要绘制折线图、散点图等其他图表时，请复用上述模板中的“数据准备”、“标准化输出模块”，仅修改“图表绘制”部分即可。
例如，绘制折线图:
code
Python
# ... (复用模板中的 import 和数据准备) ...

# --- 2. 图表绘制 (修改部分) ---
plt.figure(figsize=(10, 6))
# 假设 df 中有 'Time' 和 'Value' 两列
plt.plot(df['Time'], df['Value'], marker='o', linestyle='-')
plt.title('数据随时间变化趋势')
# ... (其他 plt 设置) ...
plt.tight_layout()

# --- 3. 标准化输出模块 (完全复用，只需修改 title) ---
# ... (完全复制粘贴上面的标准化输出模块代码) ...
# result['title'] = "数据随时间变化趋势图"
# print(json.dumps(result))

## 🎨 图表类型指南

### 何时使用何种图表

- **条形图**: 用于比较不同类别的数据
- **折线图**: 用于显示数据随时间的变化趋势
- **散点图**: 用于观察两个变量之间的关系
- **箱线图**: 用于展示数据分布和识别异常值
- **热力图**: 用于显示矩阵数据的颜色编码
- **饼图**: 用于显示各部分占总体的比例