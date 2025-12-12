# 📚 文本分析与结构化提取教程 (v2.2 - 沙盒优化版)

## 🎯 文档目标
为AI助手提供一套**无需网络权限**、**安全可靠**的文本分析解决方案，专门用于处理已获取的网页内容、文档数据等结构化信息提取。

---

## 🧠 核心设计原则

### ✅ 必须遵守
1. **零网络依赖** - 所有分析基于已提供的文本数据
2. **安全第一** - 仅使用Python标准库和预装安全库
3. **格式标准化** - 输出必须符合系统可识别的JSON结构
4. **错误包容性** - 提取失败时提供合理的默认值
5. **函数式编程** - 避免使用类定义，沙盒环境对类支持有限

### ❌ 必须避免
1. 网络请求、API调用
2. 文件系统越权访问
3. 非安全的库导入
4. 无限循环或资源耗尽操作
5. 类定义（使用函数式替代）

---

## 🚀 快速开始模板

### 场景一：直接分析网页抓取内容
```python
# ===================== 基础分析模板 =====================
import json
import re
from datetime import datetime

def analyze_webpage_content(text_content: str) -> dict:
    """
    基础网页内容分析器
    输入：任何网页的文本内容
    输出：结构化提取结果
    """
    # 初始化标准输出结构
    result = {
        "type": "analysis_report",
        "title": "网页内容分析报告",
        "timestamp": datetime.now().isoformat(),
        "data": {
            "基本信息": {},
            "价格信息": {},
            "产品规格": {},
            "提取摘要": ""
        }
    }
    
    # 1. 基本信息提取（示例）
    if "产品" in text_content or "Product" in text_content:
        result["data"]["基本信息"]["类型"] = "产品页面"
    
    # 2. 价格提取（多币种支持）
    price_patterns = {
        "USD": r'\$\s*(\d+[,\d]*\.?\d*)',
        "CNY": r'¥\s*(\d+[,\d]*)',
        "HKD": r'HK\$\s*(\d+[,\d]*\.?\d*)'
    }
    
    for currency, pattern in price_patterns.items():
        match = re.search(pattern, text_content)
        if match:
            result["data"]["价格信息"][currency] = match.group(1)
    
    # 3. 关键信息摘要
    lines = text_content.split('\n')
    key_lines = [line.strip() for line in lines if len(line.strip()) > 20][:5]
    result["data"]["提取摘要"] = " | ".join(key_lines)
    
    return result

# ===================== 执行示例 =====================
if __name__ == "__main__":
    # 将您的data_context粘贴在这里
    sample_text = """
    产品名称：Jimmy Choo DIDI 45
    价格：$299.99
    材质：皮革鞋面，绸缎内衬
    跟高：45mm
    特点：尖头设计，优雅女性鞋履
    """
    
    analysis_result = analyze_webpage_content(sample_text)
    
    # 🔥 关键：必须使用print输出JSON格式
    print(json.dumps(analysis_result, ensure_ascii=False, indent=2))
```

### 场景二：多页面批量分析
```python
import json

def analyze_multiple_pages(pages_data: str) -> dict:
    """
    处理包含多个页面的文本数据
    格式：以"## 页面"分隔的不同页面
    """
    results = []
    
    # 分割页面
    if "## 页面" in pages_data:
        pages = pages_data.split("## 页面")[1:]
        
        for i, page_content in enumerate(pages[:3]):  # 限制前3页
            # 调用单页分析器
            page_result = analyze_webpage_content(page_content)
            page_result["page_number"] = i + 1
            results.append(page_result)
    else:
        # 单页情况
        results.append(analyze_webpage_content(pages_data))
    
    final_output = {
        "type": "multi_page_analysis",
        "total_pages": len(results),
        "pages": results,
        "summary": f"成功分析 {len(results)} 个页面"
    }
    
    return final_output
```

---

## 📊 输出格式规范（系统强制要求）

### ✅ 正确格式示例
```json
{
    "type": "analysis_report",  // 必须字段，定义输出类型
    "title": "分析报告标题",     // 用户可见的标题
    "data": {                  // 实际分析数据
        "field1": "value1",
        "field2": ["item1", "item2"]
    }
}
```

### ❌ 错误格式示例
```python
# 错误1：直接打印字典
print(analysis_result)  # 系统无法解析

# 错误2：非JSON字符串
print("价格：$299.99")  # 系统无法结构化处理

# 错误3：缺少type字段
{"data": {...}}  # 系统无法识别类型

# 错误4：使用类定义
class Extractor:  # 沙盒环境可能不支持
    def extract(self): pass
```

---

## 🛠️ 专业分析工具箱

### 1. 价格提取器

## 🔧 价格信息提取（关键更新）

### 🚫 禁止操作
- ❌ 类定义（`class PriceExtractor:`） - 沙盒环境不支持
- ❌ 使用不存在的库（如 `PriceExtractor`）

### ✅ 推荐方案：使用正则表达式提取价格
```python
import re
import json

def extract_price_info(text):
    """从文本中提取价格信息"""
    price_patterns = [
        r'(\$\d+(?:\.\d+)?)\s*per\s*1[kK]\s*tokens?',
        r'(\d+(?:\.\d+)?)\s*USD\s*per\s*1[kK]\s*tokens?',
        r'输入\s*:\s*(\$\d+\.\d+)\s*输出\s*:\s*(\$\d+\.\d+)',
        r'(\$\d+(?:\.\d+)?)\s*/\s*1[kK]\s*tokens?'
    ]
    
    prices = []
    for pattern in price_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            prices.extend(matches)
    
    return {
        'extraction_method': 'regex',
        'price_matches': prices,
        'sample_text': text[:500]  # 保留样本用于验证
    }

# 使用示例
text_content = "从所有步骤收集的文本..."
price_info = extract_price_info(text_content)
print(json.dumps(price_info, indent=2))
```

### 2. 技术参数提取器
```python
import re

def extract_tech_specs(text):
    """提取技术参数"""
    specs = {}
    
    # 参数数量
    param_match = re.search(r'(\d+(?:\.\d+)?)\s*万亿?\s*参数', text)
    if param_match:
        specs['parameter_count'] = param_match.group(1) + '万亿'
    
    # 上下文长度
    context_match = re.search(r'(\d+(?:,\d+)?[kK]?)\s*tokens?\s*上下文', text)
    if context_match:
        specs['context_length'] = context_match.group(1)
    
    # MMLU 分数
    mmlu_match = re.search(r'MMLU\s*[:：]?\s*(\d+(?:\.\d+)?)', text)
    if mmlu_match:
        specs['mmlu_score'] = float(mmlu_match.group(1))
    
    return specs

# 使用示例
text_content = "某模型具有3.5万亿参数，支持128K tokens上下文长度，MMLU分数为85.2"
tech_specs = extract_tech_specs(text_content)
print(json.dumps(tech_specs, ensure_ascii=False, indent=2))
```

### 3. 规格提取器（函数式版本）
```python
import re

def extract_dimensions(text: str) -> dict:
    """产品规格信息提取 - 函数式版本"""
    dimensions = {}
    
    # 提取尺寸信息
    patterns = {
        "height": [r'(\d+(?:\.\d+)?)\s*(cm|mm|m)\s*高', r'高度[:：]\s*(\d+)'],
        "width": [r'(\d+(?:\.\d+)?)\s*(cm|mm|m)\s*宽', r'宽度[:：]\s*(\d+)'],
        "weight": [r'(\d+(?:\.\d+)?)\s*(kg|g)\s*重', r'重量[:：]\s*(\d+)']
    }
    
    for dim, pattern_list in patterns.items():
        for pattern in pattern_list:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                # 处理匹配组
                value = match.group(1)
                unit = match.group(2) if len(match.groups()) > 1 else ""
                dimensions[dim] = f"{value}{unit}"
                break
    
    return dimensions

# 增强版：支持更多规格类型
def extract_all_specs(text: str) -> dict:
    """提取所有规格参数"""
    specs = {}
    
    # 材质提取
    material_match = re.search(r'材质[:：]\s*([^\n，。]+)', text)
    if material_match:
        specs['material'] = material_match.group(1)
    
    # 颜色提取
    color_match = re.search(r'颜色[:：]\s*([^\n，。]+)', text)
    if color_match:
        specs['color'] = color_match.group(1)
    
    # 尺寸组合
    dimensions = extract_dimensions(text)
    if dimensions:
        specs['dimensions'] = dimensions
    
    # 型号提取
    model_match = re.search(r'型号[:：]\s*([A-Za-z0-9\-_]+)', text)
    if model_match:
        specs['model'] = model_match.group(1)
    
    return specs

# 使用示例
text_content = "产品尺寸：高度45mm，宽度30cm，重量2.5kg，材质：皮革"
specs = extract_all_specs(text_content)
print(json.dumps(specs, ensure_ascii=False, indent=2))
```

### 4. 关键词分析器（函数式版本）
```python
def categorize_content(text: str) -> list:
    """基于关键词的分类分析 - 函数式版本"""
    CATEGORY_KEYWORDS = {
        "奢侈品": ["奢侈", "高端", "premium", "luxury", "designer"],
        "电子产品": ["电子", "智能", "tech", "digital", "gadget"],
        "服装鞋履": ["服装", "鞋", "wear", "apparel", "footwear"],
        "家居用品": ["家居", "家具", "home", "furniture", "decor"]
    }
    
    text_lower = text.lower()
    categories = []
    
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword.lower() in text_lower for keyword in keywords):
            categories.append(category)
    
    return categories if categories else ["未分类"]

# 增强版：带置信度的分类
def categorize_with_confidence(text: str) -> dict:
    """带置信度的内容分类"""
    CATEGORY_KEYWORDS = {
        "奢侈品": ["奢侈", "高端", "premium", "luxury", "designer", "豪华", "尊享"],
        "电子产品": ["电子", "智能", "tech", "digital", "gadget", "手机", "电脑", "数码"],
        "服装鞋履": ["服装", "鞋", "wear", "apparel", "footwear", "服饰", "穿戴"],
        "家居用品": ["家居", "家具", "home", "furniture", "decor", "家用", "摆设"],
        "美妆护肤": ["美妆", "护肤", "化妆品", "美容", "skincare", "makeup"]
    }
    
    text_lower = text.lower()
    scores = {}
    
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword.lower() in text_lower)
        if score > 0:
            scores[category] = min(score / 5, 1.0)  # 归一化到0-1
    
    if scores:
        # 按置信度排序
        sorted_categories = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return {
            "primary_category": sorted_categories[0][0],
            "confidence": round(sorted_categories[0][1], 2),
            "all_categories": {cat: round(conf, 2) for cat, conf in sorted_categories[:3]}
        }
    else:
        return {"primary_category": "未分类", "confidence": 0.0, "all_categories": {}}

# 使用示例
text_content = "这款奢侈品手表采用高端设计，适合商务场合"
categorization = categorize_with_confidence(text_content)
print(json.dumps(categorization, ensure_ascii=False, indent=2))
```

### 5. HTML结构化提取器（函数式版本）
```python
def extract_html_title_and_links(html_content: str) -> dict:
    """
    提取HTML页面标题和链接 - 函数式版本
    注意：沙盒环境中可能没有BeautifulSoup，使用正则表达式
    """
    # 使用正则提取标题
    title_match = re.search(r'<title[^>]*>(.*?)</title>', html_content, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else "无标题"
    
    # 使用正则提取链接
    links = []
    link_pattern = r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>'
    
    for match in re.finditer(link_pattern, html_content, re.IGNORECASE | re.DOTALL):
        href = match.group(1)
        text = re.sub(r'<[^>]+>', '', match.group(2)).strip()  # 移除HTML标签
        
        if href and (href.startswith('http://') or href.startswith('https://') or href.startswith('/')):
            links.append({
                "text": text[:50],  # 限制文本长度
                "href": href[:200]  # 限制URL长度
            })
        
        if len(links) >= 10:  # 最多提取10个链接
            break
    
    return {
        "title": title,
        "links": links,
        "total_links_found": len(links)
    }

def extract_simple_table_data(html_content: str) -> list:
    """
    简单提取HTML表格数据 - 函数式版本
    使用正则表达式，不依赖外部库
    """
    tables = []
    
    # 查找所有<table>标签
    table_pattern = r'<table[^>]*>(.*?)</table>'
    
    for table_match in re.finditer(table_pattern, html_content, re.IGNORECASE | re.DOTALL):
        table_html = table_match.group(1)
        rows = []
        
        # 提取行
        row_pattern = r'<tr[^>]*>(.*?)</tr>'
        for row_match in re.finditer(row_pattern, table_html, re.IGNORECASE | re.DOTALL):
            row_html = row_match.group(1)
            cells = []
            
            # 提取单元格
            cell_pattern = r'<t[dh][^>]*>(.*?)</t[dh]>'
            for cell_match in re.finditer(cell_pattern, row_html, re.IGNORECASE | re.DOTALL):
                cell_content = re.sub(r'<[^>]+>', '', cell_match.group(1)).strip()
                cells.append(cell_content)
            
            if cells:  # 只添加非空行
                rows.append(cells)
        
        if rows:  # 只添加有数据的表格
            tables.append({
                "row_count": len(rows),
                "col_count": len(rows[0]) if rows else 0,
                "data": rows[:20]  # 限制行数
            })
    
    return tables

# 使用示例
html_content = """
<html>
<head><title>示例页面</title></head>
<body>
    <h1>产品列表</h1>
    <a href="/products/1">产品1</a>
    <a href="/products/2">产品2</a>
    <table>
        <tr><th>名称</th><th>价格</th></tr>
        <tr><td>产品A</td><td>$100</td></tr>
    </table>
</body>
</html>
"""

title_links = extract_html_title_and_links(html_content)
tables = extract_simple_table_data(html_content)

print("标题和链接:", json.dumps(title_links, ensure_ascii=False, indent=2))
print("\n表格数据:", json.dumps(tables, ensure_ascii=False, indent=2))
```

---

## 🎯 AI使用指南

### 步骤一：识别分析需求
当用户请求分析文本时，AI应：
1. 确认文本内容是否已提供
2. 识别分析目标（价格、规格、分类等）
3. 选择合适的提取器组合
4. **避免使用类定义，使用函数式编程**

### 步骤二：生成执行代码
```python
def generate_analysis_code_for_ai(user_text: str, analysis_type: str) -> str:
    """
    AI调用此函数生成可执行的沙盒代码
    注意：这是给AI看的模板，不是直接在沙盒中执行的代码
    """
    # 示例代码模板
    code_template = f'''
import json
import re
from datetime import datetime

# 用户提供的分析文本
TEXT_TO_ANALYZE = """{user_text}"""

def analyze_content(text):
    """分析函数 - 函数式版本"""
    result = {{
        "type": "analysis_report",
        "title": "{analysis_type}分析结果",
        "timestamp": datetime.now().isoformat(),
        "data": {{}}
    }}
    
    # 价格提取
    price_match = re.search(r'\\$\\s*(\\d+[,\\d]*\\.?\\d*)', text)
    if price_match:
        result["data"]["price_usd"] = price_match.group(1)
    
    # 规格提取
    dimensions = {{
        "height": re.search(r'(\\d+(?:\\.\\d+)?)\\s*(cm|mm|m)\\s*高', text, re.IGNORECASE),
        "width": re.search(r'(\\d+(?:\\.\\d+)?)\\s*(cm|mm|m)\\s*宽', text, re.IGNORECASE)
    }}
    
    for key, match in dimensions.items():
        if match:
            result["data"][key] = match.group(1) + (match.group(2) if match.group(2) else "")
    
    return result

# 执行分析
analysis_result = analyze_content(TEXT_TO_ANALYZE)

# 🔥 必须：以JSON格式输出
print(json.dumps(analysis_result, ensure_ascii=False, indent=2))
'''
    return code_template
```

### 步骤三：处理返回结果
AI收到沙盒执行结果后：
1. 验证输出格式是否正确
2. 提取关键信息呈现给用户
3. 提供进一步分析建议

---

## 🔧 故障排除与最佳实践

### 常见问题解决方案

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 无输出 | 代码未执行print | 确保最后一行是print(json.dumps(...)) |
| 格式错误 | 非JSON输出 | 使用json.dumps()而非str() |
| 提取为空 | 文本格式不匹配 | 添加更灵活的正则表达式 |
| 编码问题 | 中文字符乱码 | 使用ensure_ascii=False参数 |
| 类定义错误 | 沙盒不支持类 | 使用函数式编程替代 |

### 优化建议
1. **增量提取**：先尝试简单规则，再逐步复杂化
2. **错误恢复**：提取失败时提供默认值而非中断
3. **性能优化**：限制正则表达式复杂度
4. **结果验证**：检查提取结果的合理性
5. **函数式优先**：避免类定义，使用纯函数

---

## 📋 完整工作流示例

```python
# ===================== 完整分析工作流（函数式版本）=====================
import json
import re
from datetime import datetime

def complete_analysis_workflow(data_context: str) -> str:
    """
    端到端的文本分析工作流 - 函数式版本
    输入：爬虫获取的文本数据
    输出：标准化的分析报告
    """
    
    # 1. 并行提取各类信息（使用函数而非类）
    price_info = extract_price_info(data_context)
    dimensions = extract_dimensions(data_context)
    categories = categorize_with_confidence(data_context)
    
    # 2. 构建结果
    report = {
        "type": "comprehensive_analysis",
        "title": "综合文本分析报告",
        "data": {
            "价格信息": price_info,
            "规格参数": dimensions,
            "内容分类": categories,
            "文本长度": len(data_context),
            "关键句子": extract_key_sentences(data_context)
        },
        "metadata": {
            "分析工具": "沙盒内置分析套件",
            "分析时间": datetime.now().isoformat(),
            "置信度": calculate_confidence(price_info, dimensions)
        }
    }
    
    return json.dumps(report, ensure_ascii=False, indent=2)

# 辅助函数
def extract_key_sentences(text: str, max_sentences: int = 3) -> list:
    """提取关键句子"""
    # 简单分句逻辑
    sentences = []
    current = ""
    
    for char in text:
        current += char
        if char in '。！？.!?':
            sentence = current.strip()
            if len(sentence) > 10:
                sentences.append(sentence)
            current = ""
        
        if len(sentences) >= max_sentences:
            break
    
    # 如果没找到足够句子，按换行分割
    if len(sentences) < max_sentences:
        lines = [line.strip() for line in text.split('\n') if len(line.strip()) > 10]
        sentences.extend(lines[:max_sentences - len(sentences)])
    
    return sentences[:max_sentences]

def calculate_confidence(price_info: dict, dimensions: dict) -> str:
    """计算分析置信度"""
    price_matches = price_info.get('price_matches', [])
    has_dimensions = bool(dimensions)
    
    if price_matches and has_dimensions:
        return "高"
    elif price_matches or has_dimensions:
        return "中"
    else:
        return "低"

# 主执行逻辑
if __name__ == "__main__":
    # 示例文本
    sample_text = """
    产品：高端智能手表
    价格：$299.99
    尺寸：高度45mm，宽度38mm
    材质：不锈钢表壳，蓝宝石玻璃
    功能：心率监测，GPS定位
    """
    
    result = complete_analysis_workflow(sample_text)
    print(result)
```

---

## ✅ 验证测试

运行以下代码验证您的分析器：

```python
# 测试用例 - 函数式版本
import json

test_cases = [
    ("Jimmy Choo DIDI 45 价格 $299.99 材质皮革 高度45mm", "产品页面分析"),
    ("iPhone 15 Pro Max 售价 ¥9999 重量 221g 宽度78mm", "电子产品分析"),
    ("实木餐桌 尺寸 180x90cm 价格 €459 高度75cm", "家居产品分析")
]

for test_text, expected_type in test_cases:
    # 使用函数式分析器
    dimensions = extract_dimensions(test_text)
    categories = categorize_content(test_text)
    
    result = {
        "type": "test_result",
        "test_case": expected_type,
        "dimensions": dimensions,
        "categories": categories,
        "has_price": "$" in test_text or "¥" in test_text or "€" in test_text
    }
    
    print(f"测试: {expected_type}")
    print(f"结果: {json.dumps(result, ensure_ascii=False, indent=2)}")
    print("-" * 50)
```

---

## 📌 总结要点

1. **安全第一**：所有代码在沙盒中运行，无网络无文件风险
2. **格式为王**：输出必须符合标准JSON结构，包含type字段
3. **函数式优先**：避免类定义，使用纯函数进行数据提取
4. **渐进提取**：从简单规则开始，逐步增加复杂性
5. **错误处理**：提取失败时提供合理默认值
6. **性能意识**：避免复杂正则和无限循环

## 🔄 从类到函数的转换指南

| 原类定义 | 转换后的函数 | 使用方式 |
|---------|------------|---------|
| `class Extractor:`<br>`def extract(self, text):` | `def extract_data(text):` | `result = extract_data(text)` |
| `obj = Extractor()`<br>`obj.extract(text)` | 直接调用函数 | `extract_data(text)` |
| 类属性（`self.config`） | 函数参数或全局常量 | `def func(text, config={})` |
| 多个相关方法 | 多个独立函数或主函数调用子函数 | `def main_func():`<br>`data1 = func1()`<br>`data2 = func2()` |

## 🎯 最终检查清单

在生成沙盒代码前，请确认：
- [ ] 没有`class`关键字
- [ ] 所有功能都是函数
- [ ] 输出包含`type`字段
- [ ] 使用`json.dumps()`输出
- [ ] 没有网络请求或文件系统访问
- [ ] 正则表达式有限制（避免ReDoS）

---
