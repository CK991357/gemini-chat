# 📚 文本分析与结构化提取教程 (v2.1 - AI优化版)

## 🎯 文档目标
为AI助手提供一套**无需网络权限**、**安全可靠**的文本分析解决方案，专门用于处理已获取的网页内容、文档数据等结构化信息提取。

---

## 🧠 核心设计原则

### ✅ 必须遵守
1. **零网络依赖** - 所有分析基于已提供的文本数据
2. **安全第一** - 仅使用Python标准库和预装安全库
3. **格式标准化** - 输出必须符合系统可识别的JSON结构
4. **错误包容性** - 提取失败时提供合理的默认值

### ❌ 必须避免
1. 网络请求、API调用
2. 文件系统越权访问
3. 非安全的库导入
4. 无限循环或资源耗尽操作

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

### 3. 规格提取器
```python
class SpecificationExtractor:
    """产品规格信息提取"""
    
    def extract_dimensions(self, text: str) -> dict:
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
                    dimensions[dim] = f"{match.group(1)}{match.group(2) if match.group(2) else ''}"
                    break
        
        return dimensions
```

### 4. 关键词分析器
```python
class KeywordAnalyzer:
    """基于关键词的分类分析"""
    
    CATEGORY_KEYWORDS = {
        "奢侈品": ["奢侈", "高端", "premium", "luxury", "designer"],
        "电子产品": ["电子", "智能", "tech", "digital", "gadget"],
        "服装鞋履": ["服装", "鞋", "wear", "apparel", "footwear"],
        "家居用品": ["家居", "家具", "home", "furniture", "decor"]
    }
    
    def categorize_content(self, text: str) -> list:
        """识别文本所属类别"""
        text_lower = text.lower()
        categories = []
        
        for category, keywords in self.CATEGORY_KEYWORDS.items():
            if any(keyword in text_lower for keyword in keywords):
                categories.append(category)
        
        return categories if categories else ["未分类"]
```

### 5. HTML结构化提取器
```python
from bs4 import BeautifulSoup
from lxml import etree

class HTMLContentExtractor:
    """
    基于BeautifulSoup和lxml的HTML结构化提取工具。
    适用于爬虫获取的原始HTML文本。
    """
    
    def extract_title_and_links(self, html_content: str) -> dict:
        """提取页面标题和前5个链接"""
        try:
            # 使用lxml解析器以获得更好的性能和容错性
            soup = BeautifulSoup(html_content, 'lxml')
            
            title = soup.title.string if soup.title else "无标题"
            
            links = []
            for a_tag in soup.find_all('a', href=True)[:5]:
                links.append({
                    "text": a_tag.get_text(strip=True),
                    "href": a_tag['href']
                })
                
            return {
                "title": title,
                "links": links
            }
        except Exception as e:
            return {
                "title": f"HTML解析失败: {e}",
                "links": []
            }
            
    def extract_table_data(self, html_content: str) -> list:
        """提取HTML中的第一个表格数据"""
        try:
            soup = BeautifulSoup(html_content, 'lxml')
            table = soup.find('table')
            if not table:
                return []
                
            data = []
            for row in table.find_all('tr'):
                cols = [ele.text.strip() for ele in row.find_all(['td', 'th'])]
                if cols:
                    data.append(cols)
            return data
        except Exception:
            return []

```

---

## 🎯 AI使用指南

### 步骤一：识别分析需求
当用户请求分析文本时，AI应：
1. 确认文本内容是否已提供
2. 识别分析目标（价格、规格、分类等）
3. 选择合适的提取器组合

### 步骤二：生成执行代码
```python
def generate_analysis_code_for_ai(user_text: str, analysis_type: str) -> str:
    """
    AI调用此函数生成可执行的沙盒代码
    """
    code_template = f'''
import json
import re
from datetime import datetime

# 用户提供的分析文本
TEXT_TO_ANALYZE = """{user_text}"""

# 根据分析类型选择工具
def analyze_content(text):
    result = {{
        "type": "analysis_report",
        "title": "{analysis_type}分析结果",
        "timestamp": datetime.now().isoformat(),
        "data": {{}}
    }}
    
    # 这里插入具体的分析逻辑
    # 示例：提取价格
    price_match = re.search(r'\\$\\s*(\\d+\\.?\\d*)', text)
    if price_match:
        result["data"]["price_usd"] = price_match.group(1)
    
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

### 优化建议
1. **增量提取**：先尝试简单规则，再逐步复杂化
2. **错误恢复**：提取失败时提供默认值而非中断
3. **性能优化**：限制正则表达式复杂度
4. **结果验证**：检查提取结果的合理性

---

## 📋 完整工作流示例

```python
# ===================== 完整分析工作流 =====================
def complete_analysis_workflow(data_context: str) -> str:
    """
    端到端的文本分析工作流
    输入：爬虫获取的文本数据
    输出：标准化的分析报告
    """
    
    # 1. 初始化工具
    price_extractor = PriceExtractor()
    spec_extractor = SpecificationExtractor()
    keyword_analyzer = KeywordAnalyzer()
    
    # 2. 并行提取各类信息
    prices = price_extractor.extract_all_prices(data_context)
    specs = spec_extractor.extract_dimensions(data_context)
    categories = keyword_analyzer.categorize_content(data_context)
    
    # 3. 构建结果
    report = {
        "type": "comprehensive_analysis",
        "title": "综合文本分析报告",
        "data": {
            "价格信息": prices,
            "规格参数": specs,
            "内容分类": categories,
            "文本长度": len(data_context),
            "关键句子": extract_key_sentences(data_context)
        },
        "metadata": {
            "分析工具": "沙盒内置分析套件",
            "分析时间": datetime.now().isoformat(),
            "置信度": calculate_confidence(prices, specs)  # 自定义置信度计算
        }
    }
    
    # 4. 标准化输出 (使用tabulate格式化表格数据作为辅助信息)
    # 假设我们有一个表格数据需要美化输出
    sample_table_data = [
        ["货币", "价格", "置信度"],
        ["USD", prices.get("USD", "N/A"), "高"],
        ["CNY", prices.get("CNY", "N/A"), "中"]
    ]
    
    try:
        from tabulate import tabulate
        table_output = tabulate(sample_table_data, headers="firstrow", tablefmt="pipe")
        report["metadata"]["格式化表格示例"] = table_output
    except ImportError:
        report["metadata"]["格式化表格示例"] = "tabulate库未导入或不可用"
        
    return json.dumps(report, ensure_ascii=False, indent=2)

# 辅助函数
def extract_key_sentences(text: str, max_sentences: int = 3) -> list:
    """提取关键句子"""
    sentences = [s.strip() for s in text.split('。') if len(s.strip()) > 10]
    return sentences[:max_sentences]

def calculate_confidence(prices: dict, specs: dict) -> str:
    """计算分析置信度"""
    if prices and specs:
        return "高"
    elif prices or specs:
        return "中"
    else:
        return "低"
```

---

## ✅ 验证测试

运行以下代码验证您的分析器：

```python
# 测试用例
test_cases = [
    ("Jimmy Choo DIDI 45 价格 $299.99 材质皮革", "产品页面分析"),
    ("iPhone 15 Pro Max 售价 ¥9999 重量 221g", "电子产品分析"),
    ("实木餐桌 尺寸 180x90cm 价格 €459", "家居产品分析")
]

for test_text, expected_type in test_cases:
    result = analyze_webpage_content(test_text)
    print(f"测试: {expected_type}")
    print(f"结果: {json.dumps(result, ensure_ascii=False, indent=2)}")
    print("-" * 50)
```

---

## 📌 总结要点

1. **安全第一**：所有代码在沙盒中运行，无网络无文件风险
2. **格式为王**：输出必须符合标准JSON结构，包含type字段
3. **渐进提取**：从简单规则开始，逐步增加复杂性
4. **错误处理**：提取失败时提供合理默认值
5. **性能意识**：避免复杂正则和无限循环

---
