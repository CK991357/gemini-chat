---
name: crawl4ai
description: 功能强大的开源网页抓取和数据处理工具，支持7种工作模式，包括截图、PDF导出和智能爬取。新增异步任务模式，支持长时间运行任务的智能轮询。
tool_name: crawl4ai
category: web-crawling
priority: 9
tags: ["web-scraping", "screenshot", "pdf-export", "data-extraction", "crawling", "automation", "content-extraction","crawl4ai", "async-task"]
version: 1.2
---

# Crawl4AI 网页抓取工具指南

Crawl4AI 是一个功能强大的开源网页抓取和数据处理工具，支持 7 种不同的工作模式。所有二进制输出（截图、PDF）都以 base64 编码返回，便于模型处理。

## 🆕 【新增特性】异步任务模式

为了解决长时间运行任务的超时问题，Crawl4AI 新增了智能异步任务模式：

### 🎯 异步模式核心优势
- **突破30秒超时限制**：支持长时间运行的深度爬取任务
- **智能轮询机制**：自动跟踪任务进度和状态
- **内存优化**：专门为资源受限环境设计
- **任务状态持久化**：支持任务中断恢复

### ⚡ 异步模式适用场景与默认行为
- **`deep_crawl`**：深度网站爬取。**默认启用异步模式**，可通过 `"async_mode": false` 显式禁用。
- **`batch_crawl`**：批量URL处理。**默认启用异步模式**，可通过 `"async_mode": false` 显式禁用。
- **其他模式** (`scrape`, `extract`, `pdf_export`, `screenshot`)：默认同步执行，可通过 `"async_mode": true` 显式启用异步模式。

## 🎯 【至关重要】通用调用结构

**所有对 `crawl4ai` 的调用都必须严格遵循以下嵌套结构！** 这是一个通用规则，适用于所有模式。

```json
{
  "mode": "<模式名称>",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
    // ...具体模式的所有参数都放在这里
  }
}
```

### ❌ 常见致命错误：未嵌套参数

```json
// 这是一个绝对会导致失败的错误调用！
{
  "mode": "scrape",
  "url": "https://example.com" // 错误！'url' 必须在 'parameters' 内部
}
```

### ✅ 正确的基础调用模式

```json
{
  "mode": "scrape",
  "parameters": {
    "url": "https://example.com"
  }
}
```

## 📋 可用模式快速选择指南

| 模式 | 功能描述 | 主要用途 | 复杂度 | 推荐场景 | 异步支持 |
|------|----------|----------|---------|----------|----------|
| `scrape` | 抓取单个网页 | 获取页面内容、截图、PDF | ⭐⭐ | 单页面内容获取 | 可选 |
| `deep_crawl` | 深度智能爬取 | 使用策略深度爬取网站 | ⭐⭐⭐⭐ | 网站内容探索 | ✅ 推荐 |
| `batch_crawl` | 批量 URL 处理 | 同时处理多个 URL | ⭐⭐ | 批量数据收集 | ✅ 推荐 |
| `extract` | 结构化数据提取 | 基于 CSS 或 LLM 提取数据 | ⭐⭐⭐ | 特定数据提取 | 可选 |
| `pdf_export` | PDF 导出 | 将网页导出为 PDF | ⭐ | 文档保存 | 可选 |
| `screenshot` | 截图捕获 | 捕获网页截图 | ⭐ | 视觉证据保存 | 可选 |

## 🎯 使用场景快速指南

### 场景1：快速获取页面内容
```json
{
  "mode": "scrape", 
  "parameters": {
    "url": "https://example.com/article",
    "format": "markdown",
    "word_count_threshold": 10,
    "include_links": true,
    "include_images": true
  }
}
```

### 场景2：批量收集产品信息（异步模式）
```json
{
  "mode": "batch_crawl",
  "parameters": {
    "urls": [
      "https://example.com/product1",
      "https://example.com/product2", 
      "https://example.com/product3"
    ],
    "concurrent_limit": 3,
    "async_mode": true  // 🆕 启用异步模式
  }
}
```

### 场景3：深度研究某个网站（异步模式）
```json
{
  "mode": "deep_crawl",
  "parameters": {
    "url": "https://example.com/docs",
    "max_depth": 3,
    "keywords": ["教程", "指南", "API"],
    "strategy": "best_first",
    "async_mode": true  // 🆕 启用异步模式
  }
}
```

### 场景4：提取结构化数据
```json
{
  "mode": "extract",
  "parameters": {
    "url": "https://news.example.com/article",
    "schema_definition": {
      "name": "Article",
      "baseSelector": ".article-content",
      "fields": [
        {
          "name": "title",
          "selector": "h1",
          "type": "text"
        },
        {
          "name": "author",
          "selector": ".author",
          "type": "text"
        },
        {
          "name": "content",
          "selector": ".content",
          "type": "text"
        }
      ]
    },
    "extraction_type": "css"
  }
}
```

### 场景5：保存网页证据
```json
{
  "mode": "scrape",
  "parameters": {
    "url": "https://example.com",
    "return_screenshot": true,
    "return_pdf": true,
    "screenshot_quality": 90,
    "screenshot_max_width": 1200
  }
}
```

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
    "css_selector": ".article-content",
    "include_links": true,
    "include_images": true,
    "return_screenshot": true,
    "return_pdf": false,
    "screenshot_quality": 80,
    "screenshot_max_width": 1200,
    "word_count_threshold": 10,
    "exclude_external_links": true,
    "async_mode": false  // 🆕 可选异步模式
  }
}
```

**❌ 错误示例（参数未嵌套）:**
```json
{
  "mode": "scrape",
  "url": "https://example.com", // 错误！缺少parameters包装
  "format": "markdown"
}
```

**参数说明:**
- `url` (必需): 要抓取的网页 URL，必须以 `http://` 或 `https://` 开头
- `format`: 输出格式，`markdown`(默认)/`html`/`text`
- `css_selector`: 提取特定内容的 CSS 选择器
- `include_links`: 是否在输出中包含链接，默认 true
- `include_images`: 是否在输出中包含图片，默认 true
- `return_screenshot`: 是否返回截图(base64)，默认 false
- `return_pdf`: 是否返回 PDF(base64)，默认 false
- `screenshot_quality`: 截图质量(10-100)，默认 70
- `screenshot_max_width`: 截图最大宽度，默认 1920
- `word_count_threshold`: 内容块最小单词数，默认 10
- `exclude_external_links`: 是否排除外部链接，默认 true
- `async_mode`: 🆕 是否启用异步模式，默认 false

### 2. 深度网站爬取 (`deep_crawl`)

使用智能策略深度爬取整个网站，支持关键词评分和 URL 过滤。

**✅ 正确示例（推荐异步模式）:**
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
    "stream": false,
    "async_mode": true  // 🆕 推荐启用异步模式
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
- `async_mode`: 🆕 是否启用异步模式，**默认 true**（推荐）。可通过 `false` 显式禁用。

### 3. 批量 URL 处理 (`batch_crawl`)

同时处理多个 URL，适用于批量数据收集。

**✅ 正确示例（推荐异步模式）:**
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
    "concurrent_limit": 3,
    "async_mode": true  // 🆕 推荐启用异步模式
  }
}
```

**❌ 错误示例（urls不是数组）:**
```json
{
  "mode": "batch_crawl",
  "parameters": {
    "urls": "https://example.com/page1" // 错误！urls必须是数组
  }
}
```

**参数说明:**
- `urls` (必需): URL 列表，必须是数组格式
- `stream`: 是否流式返回，默认 false
- `concurrent_limit`: 最大并发数，默认 3
- `async_mode`: 🆕 是否启用异步模式，**默认 true**（推荐）。可通过 `false` 显式禁用。

### 4. 结构化数据提取 (`extract`)

从网页中提取结构化数据，支持 CSS 选择器和 LLM 智能提取。

**✅ 正确示例 (CSS 提取):**
```json
{
  "mode": "extract",
  "parameters": {
    "url": "https://news.example.com/article",
    "schema_definition": {
      "name": "Article",
      "baseSelector": ".article-content",
      "fields": [
        {
          "name": "title",
          "selector": "h1",
          "type": "text"
        },
        {
          "name": "author",
          "selector": ".author",
          "type": "text"
        },
        {
          "name": "publish_date",
          "selector": ".date",
          "type": "text"
        },
        {
          "name": "content",
          "selector": ".content",
          "type": "text"
        }
      ]
    },
    "css_selector": ".article-content",
    "extraction_type": "css",
    "async_mode": false  // 🆕 可选异步模式
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
    "prompt": "从文章中提取标题、作者、摘要和关键要点",
    "async_mode": false  // 🆕 可选异步模式
  }
}
```

**🛡️ 自动修复机制：**
我们的工具会自动确保 `schema_definition` 包含所有必需字段：
- 如果缺少 `baseSelector`，自动设置为 `css_selector` 或 `'body'`
- 如果缺少 `fields`，自动创建默认字段配置  
- 如果缺少 `name`，自动设置为 `"ExtractedData"`

**💡 最佳实践：** 虽然工具会自动修复，但提供完整的 schema 可以获得更精确的提取结果。

**⚠️ 重要提示:**
- **参数名称**: 用于定义提取结构的参数必须命名为 `schema_definition`
- **常见错误**: 请勿使用 `schema` 作为参数名，这会导致调用失败

**参数说明:**
- `url` (必需): 要提取的网页 URL
- `schema_definition` (必需): 定义输出结构的 JSON schema
- `css_selector`: 基础 CSS 选择器（CSS 提取时使用）
- `extraction_type`: 提取类型，`css`(默认)/`llm`
- `prompt`: LLM 提取的提示语
- `async_mode`: 🆕 是否启用异步模式，默认 false

### 5. PDF 导出 (`pdf_export`)

将网页导出为 PDF 格式。

**✅ 正确示例:**
```json
{
  "mode": "pdf_export",
  "parameters": {
    "url": "https://example.com/document",
    "return_as_base64": true,
    "async_mode": false  // 🆕 可选异步模式
  }
}
```

**参数说明:**
- `url` (必需): 要导出为 PDF 的网页 URL
- `return_as_base64`: 是否返回 base64 编码，默认 true
- `async_mode`: 🆕 是否启用异步模式，默认 false

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
    "max_height": 3000,
    "async_mode": false  // 🆕 可选异步模式
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
- `async_mode`: 🆕 是否启用异步模式，默认 false

## 🔄 异步任务模式详解

### 🎯 异步任务工作流程

1. **任务启动**: 设置 `async_mode: true` 启动异步任务
2. **立即返回**: 获得任务ID和轮询信息
3. **状态轮询**: 定期查询任务状态
4. **结果获取**: 任务完成后获取完整结果

### 📋 异步任务调用示例

**启动异步深度爬取:**
```json
{
  "mode": "deep_crawl",
  "parameters": {
    "url": "https://example.com/docs",
    "max_depth": 3,
    "max_pages": 50,
    "async_mode": true
  }
}
```

**异步任务响应:**
```json
{
  "success": true,
  "async": true,
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "异步任务已启动",
  "polling_interval": 3
}
```

### 🔍 异步任务状态查询

**查询任务状态:**
```json
{
  "mode": "async_task_status",
  "parameters": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**状态响应示例:**
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "progress": 45,
  "message": "任务执行中...",
  "created_at": "2024-01-15T10:30:00"
}
```

### 🎪 异步任务状态说明

| 状态 | 描述 | 处理建议 |
|------|------|----------|
| `pending` | 任务已创建，等待执行 | 继续轮询 |
| `running` | 任务执行中 | 继续轮询，关注进度 |
| `completed` | 任务完成 | 获取结果数据 |
| `failed` | 任务失败 | 查看错误信息 |

## 🔄 常见工作流

### 新闻文章采集工作流
**目标**: 自动收集和分析新闻内容
1. **发现阶段**: 使用 `deep_crawl` 发现相关文章链接（推荐异步模式）
2. **采集阶段**: 使用 `batch_crawl` 批量获取内容（推荐异步模式）  
3. **提取阶段**: 使用 `extract` 结构化提取关键信息

### 竞品分析工作流
**目标**: 系统化分析竞争对手网站
1. **证据收集**: 使用 `screenshot` 捕获竞品页面
2. **内容分析**: 使用 `scrape` 获取详细内容
3. **文档保存**: 使用 `pdf_export` 保存证据

### 产品目录爬取工作流  
**目标**: 建立完整的产品数据库
1. **目录探索**: 使用 `deep_crawl` 发现所有产品页面（推荐异步模式）
2. **数据提取**: 使用 `extract` 提取产品信息

## 🛠️ 故障排除

### 常见问题与解决方案

#### 性能问题
- **超时问题**: 减少 `max_pages` 或 `max_depth`，降低 `concurrent_limit`，启用异步模式
- **内存问题**: 启用 `stream: true`，减少批量处理的 URL 数量
- **长时间任务**: 使用异步模式避免超时

#### 内容质量问题  
- **内容缺失**: 调整 `word_count_threshold`，检查 `css_selector`
- **截图不完整**: 增加 `max_height` 值，确保 `full_page: true`

#### 网络问题
- **连接失败**: 检查 URL 格式，验证网络连接
- **被网站屏蔽**: 降低爬取速度，增加请求间隔

#### Extract 模式特定问题
- **空结果**: 检查 `fields` 数组中的 `selector` 是否准确匹配页面元素
- **字段缺失**: 确保 `schema_definition` 包含完整的 `name`、`baseSelector`、`fields` 结构
- **自动修复**: 工具会自动补全缺失字段，但手动提供完整 schema 效果更好

#### 异步任务问题
- **任务丢失**: 检查任务ID是否正确，任务是否已过期（默认1小时）
- **进度停滞**: 检查网络连接，重新查询任务状态
- **内存不足**: 系统会自动优化，减少并发任务数量

### 调试技巧

1. **从简单开始**: 先用 `scrape` 模式测试单个页面
2. **逐步增加复杂度**: 确认基础功能正常后再使用高级模式  
3. **检查参数**: 确保所有参数都正确嵌套在 `parameters` 对象内
4. **验证输出**: 先测试小规模数据，确认输出格式符合预期
5. **异步任务**: 先用小规模测试异步流程，再处理大数据量

## ⚠️ 重要提示

### ✅ 正确做法
- **参数嵌套**: 所有参数必须放在 `parameters` 对象内
- **URL 格式**: 必须以 `http://` 或 `https://` 开头  
- **模式选择**: 根据需求选择合适的模式
- **内存管理**: 大量数据时使用流式处理 (`stream: true`)
- **Schema 完整性**: 为 CSS 提取提供完整的 `name`、`baseSelector`、`fields` 结构
- **异步模式**: 长时间任务启用 `async_mode: true`

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

**错误 4: extract模式使用错误的参数名**
```json
// ❌ 错误 - 应该使用 schema_definition
{
  "mode": "extract", 
  "parameters": {
    "url": "https://example.com",
    "schema": { // 错误！应该是 schema_definition
      "title": "string"
    }
  }
}

// ✅ 正确
{
  "mode": "extract",
  "parameters": {
    "url": "https://example.com", 
    "schema_definition": {
      "name": "Article",
      "baseSelector": ".content",
      "fields": [
        {
          "name": "title",
          "selector": "h1",
          "type": "text"
        }
      ]
    }
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
    "include_links": true,
    "include_images": true,
    "return_screenshot": true,
    "return_pdf": true,
    "screenshot_quality": 90,
    "screenshot_max_width": 1200,
    "word_count_threshold": 15
  }
}
```

### 2. 智能深度爬取（异步模式）
```json
{
  "mode": "deep_crawl",
  "parameters": {
    "url": "https://docs.example.com",
    "strategy": "best_first",
    "keywords": ["API", "教程", "示例"],
    "max_depth": 3,
    "max_pages": 30,
    "async_mode": true  // 🆕 启用异步模式避免超时
  }
}
```

### 3. 批量处理重要页面（异步模式）
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
    "concurrent_limit": 2,
    "async_mode": true  // 🆕 启用异步模式确保完成
  }
}
```

### 4. 智能内容提取
```json
{
  "mode": "extract",
  "parameters": {
    "url": "https://news.example.com/article",
    "schema_definition": {
      "name": "NewsArticle",
      "baseSelector": ".article-container",
      "fields": [
        {
          "name": "headline",
          "selector": "h1.news-title",
          "type": "text"
        },
        {
          "name": "author",
          "selector": ".author-name",
          "type": "text"
        },
        {
          "name": "publish_date",
          "selector": ".publish-date",
          "type": "text"
        },
        {
          "name": "main_content",
          "selector": ".article-body",
          "type": "text"
        },
        {
          "name": "tags",
          "selector": ".tag",
          "type": "text",
          "multiple": true
        }
      ]
    },
    "extraction_type": "css"
  }
}
```

## 📝 最佳实践总结

1. **选择合适的模式**: 根据任务复杂度选择最简单有效的模式
2. **渐进式测试**: 从小规模开始测试，逐步扩大范围  
3. **资源管理**: 注意并发数和内存使用，避免过度请求
4. **错误处理**: 准备好处理网络错误和内容解析失败的情况
5. **合法使用**: 遵守网站的 robots.txt 和服务条款
6. **格式检查**: 每次调用前确认参数正确嵌套在 `parameters` 对象内
7. **参数验证**: 确保 URL 包含协议，数组参数正确格式
8. **命名规范**: extract模式必须使用 `schema_definition` 参数名
9. **内容控制**: 使用 `include_links` 和 `include_images` 控制输出内容
10. **质量优化**: 使用 `word_count_threshold` 过滤低质量内容块
11. **Schema 完整性**: 为 CSS 提取提供完整的 schema 结构以获得最佳结果
12. **异步策略**: 长时间任务（deep_crawl、batch_crawl）启用异步模式避免超时
13. **任务监控**: 异步任务使用状态查询跟踪进度
14. **超时预防**: 大数据量处理优先选择异步模式
