---
name: crawl4ai
description: 轻量级网页抓取工具，专为低内存环境优化。支持文本内容提取，自动处理内存限制和网络错误。保持原有接口完全兼容。
tool_name: crawl4ai
category: web-crawling
priority: 9
tags: ["web-scraping", "lightweight", "low-memory", "text-extraction", "compatible", "crawl4ai"]
version: 2.0
compatibility: "专为4GB内存服务器优化"
---

# Crawl4AI 轻量版使用指南

专为低内存服务器环境优化的网页抓取工具，**保持原有接口完全兼容**，所有模式参数都接受但部分功能会智能降级。

## 🎯 核心特性

### ✅ 完全兼容
- **接口不变**: 所有原有参数和模式都接受
- **结构一致**: 返回数据格式与完整版相同
- **无缝替换**: 无需修改其他代码文件

### 🚀 轻量优化  
- **内存控制**: 自动内存监控和限制
- **智能降级**: 高级功能自动降级为基础功能
- **错误恢复**: 浏览器崩溃自动重启
- **友好提示**: 详细的错误信息和使用建议

## 🔄 智能降级策略

| 模式/格式 | 轻量版行为 | 建议 |
|------|------------|------|
| `scrape` | ✅ 完全支持文本抓取 | 主要使用模式 |
| **`format: 'text'`** | 🔄 自动映射为 `markdown` | 避免使用 `text` 格式 |
| **PDF URL** | ❌ 返回错误提示 | 避免抓取以 `.pdf` 结尾的 URL |
| `deep_crawl` | 🔄 降级为单页面抓取 | 使用 `tavily_search` 进行深度探索 |
| `batch_crawl` | 🔄 限制最多3个URL | 分批处理或使用 `tavily_search` |
| `extract` | 🔄 降级为普通抓取 | 使用完整版进行结构化提取 |
| `pdf_export` | ❌ 返回错误提示 | 直接访问网页或使用完整版 |
| `screenshot` | ❌ 返回错误提示 | 使用完整版进行截图 |
 
## 🚨 轻量版限制说明
 
### 配置参数限制
**不支持的参数**：
- `remove_scripts`, `remove_styles`, `remove_forms`
- `process_iframes`, `remove_overlay_elements`
- `advanced_cleaning`, `javascript_execution`
- `include_math`, `include_code`, `include_tables`
 
**支持的参数**：
- `url`, `format`, `css_selector`
- `include_links`, `word_count_threshold`
- `exclude_external_links`, `headers`
- `remove_selectors` (有限支持)
 
### 功能限制
- **仅文本抓取**: 不支持截图、PDF导出
- **基础清理**: 仅支持选择器级别的元素移除
- **内存优化**: 移除高级功能以降低内存使用
 
##  推荐用法

### 基础文本抓取（完全支持）
```json
{
  "mode": "scrape",
  "parameters": {
    "url": "https://example.com/article",
    "format": "markdown",
    "word_count_threshold": 10
  }
}
```

### 深度研究替代方案
```json
// 先用 tavily_search 探索
{
  "mode": "tavily_search", 
  "parameters": {
    "query": "研究主题 深度分析",
    "max_results": 10
  }
}

// 再用 crawl4ai 抓取关键页面
{
  "mode": "scrape",
  "parameters": {
    "url": "从tavily结果中选择的最相关URL"
  }
}
```

## 📊 性能保障

### 内存保护
- 自动拒绝内存超限请求
- 浏览器10分钟自动重启
- 内容长度自动优化（20,000字符限制）

### 错误处理
```json
// 内存不足时的友好响应
{
  "success": false,
  "error": "系统内存不足，无法执行爬取任务",
  "suggestion": "请稍后重试或使用 tavily_search 获取摘要信息",
  "memory_info": {
    "system_memory_percent": 96.2,
    "lightweight_mode": true
  }
}

// 网站访问失败的建议
{
  "success": false, 
  "error": "抓取超时（30秒）",
  "suggestion": "目标网站响应较慢，请尝试使用 tavily_search 获取摘要信息"
}
```

## 🛠️ 故障排除

### 立即解决方案：
1. **内存不足** → 使用 `tavily_search`
2. **网站超时** → 更换URL或使用 `tavily_search`  
3. **功能不支持** → 使用推荐替代方案

### 最佳实践组合：
```javascript
// 1. 先用搜索探索
const searchResult = await tavily_search({query: "研究主题"});

// 2. 精选1-2个最相关URL  
const bestUrl = searchResult.sources.url;

// 3. 轻量抓取关键内容
const content = await crawl4ai({
  mode: "scrape", 
  parameters: {url: bestUrl}
});

// 4. 基于内容继续研究
```

## 💡 智能提示

系统会自动在以下情况提供建议：

- 🟡 **内存紧张**时建议使用 `tavily_search`
- 🟡 **网站超时**时建议更换信息来源  
- 🔴 **功能不支持**时提示替代方案
- 🟢 **操作成功**时包含轻量版标识

## 🔧 技术细节

### 保持兼容的字段：
```json
{
  "success": true,
  "url": "https://example.com",
  "content": "抓取的文本内容...", 
  "metadata": {
    "title": "页面标题",
    "word_count": 1500,
    "lightweight_mode": true  // 新增标识字段
  },
  "links": {
    "internal": [],  // 轻量版为空
    "external": []
  },
  "screenshot": {    // 结构存在但数据为空
    "data": "",
    "note": "轻量版不支持截图功能"
  }
}
```

### 资源限制：
- **超时时间**: 30秒
- **内容长度**: 20,000字符
- **并发请求**: 顺序处理
- **浏览器内存**: 800MB限制

---

*轻量版在保持兼容性的同时，通过智能降级确保在4GB内存服务器上的稳定运行。推荐与 `tavily_search` 配合使用以获得最佳研究体验。*
