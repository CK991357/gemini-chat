---
name: crawl4ai
description: 功能强大的开源网页抓取和数据处理工具，支持7种工作模式，包括截图、PDF导出和智能爬取
tool_name: crawl4ai
category: web-crawling
priority: 9
tags: ["web-scraping", "screenshot", "pdf-export", "data-extraction", "crawling"]
version: 1.0
---

# 工具调用示例（Crawl4AI）

Crawl4AI 是一个功能强大的开源网页抓取和数据处理工具，支持 7 种不同的工作模式。所有二进制输出（截图、PDF）都以 base64 编码返回，便于模型处理。

## 🎯 通用调用结构

```json
{
  "mode": "<模式名称>",
  "parameters": {
    // 具体模式的参数
  }
}
```

## 📋 可用模式概览

| 模式 | 功能描述 | 主要用途 |
|------|----------|----------|
| `scrape` | 抓取单个网页 | 获取页面内容、截图、PDF |
| `crawl` | 基础网站爬取 | 按深度爬取网站链接 |
| `deep_crawl` | 深度智能爬取 | 使用策略（BFS/DFS/BestFirst）深度爬取 |
| `extract` | 结构化数据提取 | 基于 CSS 或 LLM 提取特定数据 |
| `batch_crawl` | 批量 URL 处理 | 同时处理多个 URL |
| `pdf_export` | PDF 导出 | 将网页导出为 PDF |
| `screenshot` | 截图捕获 | 捕获网页截图 |

## 🚀 详细模式说明

### 1. 抓取单个网页 (`scrape`)

抓取单个网页内容，支持多种输出格式和媒体捕获。

**✅ 正确示例:**
```json
{
  "mode": "scrape",
  "parameters": {
    "url": "https://example.com",
    "format": "markdown",
    "return_screenshot": true,
    "return_pdf": false,
    "screenshot_quality": 80,
    "screenshot_max_width": 1200,
    "word_count_threshold": 10,
    "exclude_external_links": true
  }
}
```

**参数说明:**
- `url` (必需): 要抓取的网页 URL
- `format`: 输出格式，`markdown`(默认)/`html`/`text`
- `css_selector`: 提取特定内容的 CSS 选择器
- `return_screenshot`: 是否返回截图(base64)
- `return_pdf`: 是否返回 PDF(base64)
- `screenshot_quality`: 截图质量(10-100)，默认 70
- `screenshot_max_width`: 截图最大宽度，默认 1920
- `word_count_threshold`: 内容块最小单词数，默认 10
- `exclude_external_links`: 是否排除外部链接，默认 true

### 2. 深度网站爬取 (`deep_crawl`)

使用智能策略深度爬取整个网站，支持关键词评分和 URL 过滤。

**✅ 正确示例:**
```json
{
  "mode": "deep_crawl",
  "parameters": {
    "url": "https://example.com",
    "max_depth": 3,
    "max_pages": 50,
    "strategy": "best_first",
    "include_external": false,
    "keywords": ["产品", "价格", "规格"],
    "url_patterns": ["/products/", "/docs/"],
    "stream": false
  }
}
```

**参数说明:**
- `url` (必需): 起始 URL
- `max_depth`: 最大爬取深度，默认 2
- `max_pages`: 最大页面数，默认 50
- `strategy`: 爬取策略，`bfs`(默认)/`dfs`/`best_first`
- `include_external`: 是否跟踪外部链接，默认 false
- `keywords`: 用于相关性评分的关键词列表
- `url_patterns`: URL 模式过滤列表
- `stream`: 是否流式返回结果，默认 false

### 3. 批量 URL 处理 (`batch_crawl`)

同时处理多个 URL，适用于批量数据收集。

**✅ 正确示例:**
```json
{
  "mode": "batch_crawl",
  "parameters": {
    "urls": [
      "https://example.com/page1",
      "https://example.com/page2",
      "https://example.com/page3"
    ],
    "stream": false,
    "concurrent_limit": 3
  }
}
```

**参数说明:**
- `urls` (必需): URL 列表
- `stream`: 是否流式返回，默认 false
- `concurrent_limit`: 最大并发数，默认 3

### 4. 结构化数据提取 (`extract`)

从网页中提取结构化数据，支持 CSS 选择器和 LLM 智能提取。

**✅ 正确示例 (CSS 提取):**
```json
{
  "mode": "extract",
  "parameters": {
    "url": "https://news.example.com/article",
    "schema_definition": {
      "title": "string",
      "author": "string",
      "publish_date": "string",
      "content": "string"
    },
    "css_selector": ".article-content",
    "extraction_type": "css"
  }
}
```

**✅ 正确示例 (LLM 提取):**
```json
{
  "mode": "extract",
  "parameters": {
    "url": "https://news.example.com/article",
    "schema_definition": {
      "type": "object",
      "properties": {
        "title": {"type": "string"},
        "author": {"type": "string"},
        "summary": {"type": "string"},
        "key_points": {"type": "array", "items": {"type": "string"}}
      }
    },
    "extraction_type": "llm",
    "prompt": "从文章中提取标题、作者、摘要和关键要点"
  }
}
```

**参数说明:**
- `url` (必需): 要提取的网页 URL
- `schema_definition` (必需): 定义输出结构的 JSON schema
- `css_selector`: 基础 CSS 选择器（CSS 提取时使用）
- `extraction_type`: 提取类型，`css`(默认)/`llm`
- `prompt`: LLM 提取的提示语

### 5. PDF 导出 (`pdf_export`)

将网页导出为 PDF 格式。

**✅ 正确示例:**
```json
{
  "mode": "pdf_export",
  "parameters": {
    "url": "https://example.com/document",
    "return_as_base64": true
  }
}
```

**参数说明:**
- `url` (必需): 要导出为 PDF 的网页 URL
- `return_as_base64`: 是否返回 base64 编码，默认 true

### 6. 截图捕获 (`screenshot`)

捕获网页截图，支持质量压缩和尺寸调整。

**✅ 正确示例:**
```json
{
  "mode": "screenshot",
  "parameters": {
    "url": "https://example.com",
    "full_page": true,
    "return_as_base64": true,
    "quality": 80,
    "max_width": 1200,
    "max_height": 3000
  }
}
```

**参数说明:**
- `url` (必需): 要截图的网页 URL
- `full_page`: 是否截取整个页面，默认 true
- `return_as_base64`: 是否返回 base64 编码，默认 true
- `quality`: 截图质量(10-100)，默认 70
- `max_width`: 最大宽度，默认 1920
- `max_height`: 最大高度，默认 5000

## ⚠️ 重要提示

### ✅ 正确做法
- **参数嵌套**: 所有参数必须放在 `parameters` 对象内
- **URL 格式**: 必须以 `http://` 或 `https://` 开头
- **模式选择**: 根据需求选择合适的模式
- **内存管理**: 大量数据时使用流式处理 (`stream: true`)

### ❌ 常见错误

**错误 1: 缺少嵌套参数**
```json
// ❌ 错误
{
  "mode": "scrape",
  "url": "https://example.com"
}

// ✅ 正确
{
  "mode": "scrape",
  "parameters": {
    "url": "https://example.com"
  }
}
```

**错误 2: URL 缺少协议**
```json
// ❌ 错误
{
  "mode": "scrape",
  "parameters": {
    "url": "example.com"
  }
}

// ✅ 正确
{
  "mode": "scrape",
  "parameters": {
    "url": "https://example.com"
  }
}
```

**错误 3: 错误的参数类型**
```json
// ❌ 错误 - urls 应该是数组
{
  "mode": "batch_crawl",
  "parameters": {
    "urls": "https://example.com"
  }
}

// ✅ 正确
{
  "mode": "batch_crawl",
  "parameters": {
    "urls": ["https://example.com"]
  }
}
```

## 🎪 高级使用技巧

### 1. 组合使用媒体捕获
```json
{
  "mode": "scrape",
  "parameters": {
    "url": "https://example.com",
    "return_screenshot": true,
    "return_pdf": true,
    "screenshot_quality": 90
  }
}
```

### 2. 智能深度爬取
```json
{
  "mode": "deep_crawl",
  "parameters": {
    "url": "https://docs.example.com",
    "strategy": "best_first",
    "keywords": ["API", "教程", "示例"],
    "max_depth": 3,
    "max_pages": 30
  }
}
```

### 3. 批量处理重要页面
```json
{
  "mode": "batch_crawl",
  "parameters": {
    "urls": [
      "https://example.com/home",
      "https://example.com/about",
      "https://example.com/contact",
      "https://example.com/products"
    ],
    "concurrent_limit": 2
  }
}
```