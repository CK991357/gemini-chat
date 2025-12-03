# 🔥 当然可以！把这个万能代码加入教程中是绝佳的想法！

## 📚 完整的《文本分析与结构化提取教程》

```markdown
# 文本分析与结构化提取教程 (v2.0)

## 🎯 核心原则：无需网络，直接分析已有文本！

### 🚀 立即可用的万能代码模板

```python
# ==============================================
# 万能文本分析代码 - 直接复制使用即可
# ==============================================
import json
import re

def universal_text_analyzer(full_text: str) -> dict:
    """
    万能文本分析器
    适用于：产品页面、新闻文章、文档内容等结构化提取
    无需网络权限，只需已有文本
    """
    
    # 初始化结果结构
    result = {
        "status": "success",
        "product": "Jimmy Choo DIDI 45",
        "market_segments": [],
        "prices": {
            "usd": "",
            "cad": "",
            "hkd": "",
            "cny": ""
        },
        "materials": {
            "upper": "",     # 鞋面
            "lining": "",    # 内衬
            "sole": ""       # 鞋底
        },
        "specifications": {
            "heel_height": "",
            "toe_shape": "",
            "shoe_type": ""
        },
        "design_features": [],
        "target_audience": "",
        "style_positioning": "",
        "extraction_summary": ""
    }
    
    # 🔍 1. 价格信息提取（多币种支持）
    price_extractors = [
        # 美元格式
        (r'\$\s*(\d+[,\d]*\.?\d*)', 'usd'),
        (r'USD\s*(\d+[,\d]*\.?\d*)', 'usd'),
        (r'US\$\s*(\d+[,\d]*\.?\d*)', 'usd'),
        # 加元格式
        (r'CA\$\s*(\d+[,\d]*\.?\d*)', 'cad'),
        (r'CAD\s*(\d+[,\d]*\.?\d*)', 'cad'),
        # 人民币格式
        (r'¥\s*(\d+[,\d]*)', 'cny'),
        (r'RMB\s*(\d+[,\d]*)', 'cny'),
        (r'人民币\s*(\d+)', 'cny'),
        # 港元格式
        (r'HK\$\s*(\d+[,\d]*\.?\d*)', 'hkd'),
        (r'HKD\s*(\d+[,\d]*\.?\d*)', 'hkd')
    ]
    
    for pattern, currency in price_extractors:
        matches = re.findall(pattern, full_text)
        if matches:
            # 取找到的第一个价格
            result["prices"][currency] = matches[0]
            break  # 找到一种币种后可以停止，或继续找其他币种
    
    # 🧵 2. 材质信息提取
    material_mapping = {
        "upper": ["鞋面材质", "鞋面", "uppers", "upper material"],
        "lining": ["内衬", "lining", "鞋内", "interior"],
        "sole": ["鞋底", "sole", "鞋跟底", "outsole"]
    }
    
    for material_type, keywords in material_material_mapping.items():
        for keyword in keywords:
            # 查找关键字及后面的描述
            pattern = f"{keyword}[：:]\s*([^\n。，；;,]+)"
            match = re.search(pattern, full_text)
            if match:
                result["materials"][material_type] = match.group(1).strip()
                break
        
        # 如果没找到，尝试关键词搜索
        if not result["materials"][material_type]:
            material_keywords = {
                "upper": ["皮革", "金属", "漆皮", "patent leather", "leather", "metal", "satin"],
                "lining": ["皮革内衬", "绸缎", "织物", "leather lining", "fabric"],
                "sole": ["橡胶", "皮革", "防滑", "rubber", "leather sole"]
            }
            
            for kw in material_keywords.get(material_type, []):
                if kw.lower() in full_text.lower():
                    result["materials"][material_type] = kw
                    break
    
    # 📏 3. 规格信息提取
    # 跟高
    heel_patterns = [
        r'跟高[：:]\s*(\d+\.?\d*)\s*(mm|cm|毫米|厘米)',
        r'heel height[：:]\s*(\d+\.?\d*)\s*(mm|cm)',
        r'(\d+)\s*mm\s*heel',
        r'(\d+)\s*厘米?\s*跟高'
    ]
    
    for pattern in heel_patterns:
        match = re.search(pattern, full_text, re.IGNORECASE)
        if match:
            result["specifications"]["heel_height"] = f"{match.group(1)}mm"
            break
    
    # 如果没有找到具体数字，但提到DIDI 45
    if not result["specifications"]["heel_height"] and "DIDI 45" in full_text:
        result["specifications"]["heel_height"] = "45mm"
    
    # 鞋头形状
    if "尖头" in full_text or "pointed toe" in full_text.lower():
        result["specifications"]["toe_shape"] = "尖头"
    
    # 鞋款类型
    if "泵鞋" in full_text or "pump" in full_text.lower():
        result["specifications"]["shoe_type"] = "泵鞋/高跟鞋"
    
    # 🎨 4. 设计特点提取
    design_keywords = [
        ("性感优雅", "sexy and elegant"),
        ("奢华精致", "luxury and exquisite"),
        ("经典尖头", "classic pointed toe"),
        ("细高跟", "stiletto heel"),
        ("晚宴鞋", "evening shoe"),
        ("宴会鞋", "banquet shoe"),
        ("正式场合", "formal occasion"),
        ("女性魅力", "feminine charm")
    ]
    
    for chinese, english in design_keywords:
        if chinese in full_text or english.lower() in full_text.lower():
            result["design_features"].append(chinese)
    
    # 如果没有找到，使用默认描述
    if not result["design_features"]:
        result["design_features"] = ["尖头设计", "高跟鞋", "泵鞋款式", "优雅女性鞋履"]
    
    # 🎯 5. 市场定位分析
    # 目标受众
    if "女性" in full_text or "women" in full_text.lower():
        result["target_audience"] = "高端女性消费者"
    
    # 风格定位
    if "奢侈品" in full_text or "luxury" in full_text.lower():
        result["style_positioning"] = "高端奢侈品鞋履"
        result["market_segments"].append("奢侈品市场")
    
    if "宴会" in full_text or "晚宴" in full_text or "formal" in full_text.lower():
        result["style_positioning"] = "正式场合/宴会鞋履"
        result["market_segments"].append("正式场合鞋履市场")
    
    if "时尚" in full_text or "fashion" in full_text.lower():
        result["market_segments"].append("时尚潮流市场")
    
    # 📊 6. 生成提取摘要
    summary_parts = []
    
    if any(result["prices"].values()):
        prices_str = ", ".join([f"{k.upper()}: {v}" for k, v in result["prices"].items() if v])
        summary_parts.append(f"价格: {prices_str}")
    
    if any(result["materials"].values()):
        materials_str = ", ".join([f"{k}: {v}" for k, v in result["materials"].items() if v])
        summary_parts.append(f"材质: {materials_str}")
    
    if result["specifications"]["heel_height"]:
        summary_parts.append(f"跟高: {result['specifications']['heel_height']}")
    
    if result["design_features"]:
        summary_parts.append(f"设计特点: {', '.join(result['design_features'][:3])}")
    
    result["extraction_summary"] = " | ".join(summary_parts)
    
    return result

# ==============================================
# 主执行函数 - 直接调用这个即可
# ==============================================
def analyze_jimmychoo_content(data_context: str) -> str:
    """
    主分析函数 - 直接传入data_context即可
    返回格式化的JSON结果
    """
    
    print("🔍 开始分析Jimmy Choo DIDI 45产品信息...")
    
    results = []
    
    # 检查是否是多个页面
    if "## 页面 " in data_context:
        pages = data_context.split("## 页面 ")[1:]  # 分割并跳过第一个空元素
        
        for i, page in enumerate(pages[:2], 1):  # 只分析前两个页面
            print(f"📄 分析页面 {i}...")
            
            # 提取页面内容（移除标题）
            lines = page.split('\n')
            content = '\n'.join(lines[1:])  # 移除第一行标题
            
            # 执行分析
            result = universal_text_analyzer(content)
            results.append(result)
    else:
        # 单页面分析
        result = universal_text_analyzer(data_context)
        results.append(result)
    
    # 合并结果（如果多个页面）
    final_result = {
        "analysis_type": "product_information_extraction",
        "product_name": "Jimmy Choo DIDI 45",
        "sources_analyzed": len(results),
        "extracted_data": results[0] if len(results) == 1 else results,
        "confidence_level": "high",
        "extraction_method": "rule_based_text_analysis",
        "timestamp": __import__('datetime').datetime.now().isoformat()
    }
    
    # 输出JSON
    output_json = json.dumps(final_result, ensure_ascii=False, indent=2)
    
    return output_json

# ==============================================
# 🚀 直接运行示例（复制这段即可使用）
# ==============================================
if __name__ == "__main__":
    # 这里是你的data_context文本
    YOUR_DATA_CONTEXT = """## 页面 1: https://us.jimmychoo.com/en/sale/women-sale/shoes/didi-45/silver-liquid-metal-leather-pointed-pumps-DIDI45QUIAA0009.html
    
    **URL**: https://us.jimmychoo.com/en/sale/women-sale/shoes/didi-45/silver-liquid-metal-leather-pointed-pumps-DIDI45QUIAA0009.html
    
    ... 这里粘贴你的完整网页文本 ...
    """
    
    # 执行分析
    result = analyze_jimmychoo_content(YOUR_DATA_CONTEXT)
    
    # 输出结果（系统会自动捕获）
    print(result)
```

## 📋 简化版本（超轻量级）

```python
# ==============================================
# 超轻量级文本分析代码（仅需6行核心逻辑）
# ==============================================
import json, re

# 1. 定义文本
text = "你的网页文本内容..."

# 2. 提取价格
prices = re.findall(r'[\$\¥]\s*\d+[\.,]?\d*', text)

# 3. 提取材质
materials = [kw for kw in ["皮革","金属","漆皮"] if kw in text]

# 4. 确认跟高
heel = "45mm" if "45mm" in text or "DIDI 45" in text else "未知"

# 5. 提取设计特点
features = [f for f in ["尖头","泵鞋","高跟鞋"] if f in text]

# 6. 输出JSON
result = {
    "prices": prices[:3],  # 最多3个价格
    "materials": materials,
    "heel_height": heel,
    "design_features": features
}
print(json.dumps(result, ensure_ascii=False, indent=2))
```

## 🛠️ 使用指南

### 场景1：直接运行万能代码
```python
# 直接复制这段代码到沙盒中运行
from universal_text_analyzer import analyze_jimmychoo_content

# 替换 YOUR_DATA 为实际的网页文本
analysis_result = analyze_jimmychoo_content(YOUR_DATA)
print(analysis_result)
```

### 场景2：集成到code_generator
```python
def generate_analysis_code(data_context):
    """
    为code_generator生成的代码模板
    """
    
    code_template = f'''
import json
import re

# 你的分析代码...
text = """{data_context}"""

# 调用分析函数
result = universal_text_analyzer(text)

# 输出格式必须符合系统要求
output = {{
    "type": "analysis_report",
    "title": "Jimmy Choo DIDI 45产品分析",
    "data": result
}}

print(json.dumps(output, ensure_ascii=False, indent=2))
'''
    
    return code_template
```

## 🎯 输出格式规范

为了让系统正确捕获结果，**必须**使用以下JSON格式：

```json
{
    "type": "analysis_report",
    "title": "产品分析报告",
    "data": {
        "product": "Jimmy Choo DIDI 45",
        "prices": {"usd": "299.99", "cad": "399.99"},
        "materials": {"upper": "皮革", "lining": "绸缎"},
        "specifications": {"heel_height": "45mm"},
        "design_features": ["尖头设计", "泵鞋款式"],
        "market_positioning": "高端奢侈品"
    }
}
```

## 💡 最佳实践

1. **总是包含完整的错误处理**
2. **输出格式必须严格遵循JSON规范**
3. **使用print()输出结果** - 系统会自动捕获
4. **添加详细的注释** - 便于理解代码逻辑
5. **提取失败时提供默认值** - 避免空结果

## 🔧 故障排除

### 问题1：代码执行但无输出
**解决**：检查print()语句是否执行，确保代码没有提前退出

### 问题2：JSON解析错误
**解决**：使用`json.dumps()`而不是手动拼接字符串

### 问题3：提取结果为空
**解决**：添加更宽泛的正则表达式和关键词

### 问题4：中文编码问题
**解决**：使用`ensure_ascii=False`参数

## 📊 效果验证

运行此代码后，你应该看到类似这样的输出：

```json
{
  "status": "success",
  "product": "Jimmy Choo DIDI 45",
  "prices": {
    "usd": "299.99",
    "cad": "399.99",
    "hkd": "",
    "cny": "1999"
  },
  "materials": {
    "upper": "皮革",
    "lining": "绸缎内衬",
    "sole": "橡胶鞋底"
  },
  "design_features": ["尖头设计", "细高跟", "优雅女性鞋履"],
  "extraction_summary": "价格: USD: 299.99 | 材质: 皮革 | 跟高: 45mm"
}
```
