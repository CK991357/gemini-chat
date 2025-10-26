/**
 * @file 自动生成的技能注册表 - 由 build-skills.js 脚本生成
 * !!! 请勿直接编辑此文件 !!!
 * 生成时间: 2025-10-26T07:20:06.474Z
 * 技能数量: 6
 */

export const SKILLS_DATA = {
  "crawl4ai": {
    "metadata": {
      "name": "crawl4ai",
      "description": "功能强大的开源网页抓取和数据处理工具，支持7种工作模式，包括截图、PDF导出和智能爬取",
      "tool_name": "crawl4ai",
      "category": "web-crawling",
      "priority": 9,
      "tags": [
        "web-scraping",
        "screenshot",
        "pdf-export",
        "data-extraction",
        "crawling",
        "automation",
        "content-extraction",
        "crawl4ai"
      ],
      "version": 1.1
    },
    "content": "# Crawl4AI 网页抓取工具指南\n\nCrawl4AI 是一个功能强大的开源网页抓取和数据处理工具，支持 7 种不同的工作模式。所有二进制输出（截图、PDF）都以 base64 编码返回，便于模型处理。\n\n## 🎯 通用调用结构\n\n```json\n{\n  \"mode\": \"<模式名称>\",\n  \"parameters\": {\n    // 具体模式的参数\n  }\n}\n```\n\n## 📋 可用模式概览\n\n| 模式 | 功能描述 | 主要用途 | 复杂度 |\n|------|----------|----------|---------|\n| `scrape` | 抓取单个网页 | 获取页面内容、截图、PDF | ⭐⭐ |\n| `crawl` | 基础网站爬取 | 按深度爬取网站链接 | ⭐⭐⭐ |\n| `deep_crawl` | 深度智能爬取 | 使用策略（BFS/DFS/BestFirst）深度爬取 | ⭐⭐⭐⭐ |\n| `extract` | 结构化数据提取 | 基于 CSS 或 LLM 提取特定数据 | ⭐⭐⭐ |\n| `batch_crawl` | 批量 URL 处理 | 同时处理多个 URL | ⭐⭐ |\n| `pdf_export` | PDF 导出 | 将网页导出为 PDF | ⭐ |\n| `screenshot` | 截图捕获 | 捕获网页截图 | ⭐ |\n\n## 🎯 使用场景快速指南\n\n### 场景1：快速获取页面内容\n```json\n{\n  \"mode\": \"scrape\", \n  \"parameters\": {\n    \"url\": \"https://example.com/article\",\n    \"format\": \"markdown\",\n    \"word_count_threshold\": 10\n  }\n}\n```\n\n### 场景2：批量收集产品信息\n```json\n{\n  \"mode\": \"batch_crawl\",\n  \"parameters\": {\n    \"urls\": [\n      \"https://example.com/product1\",\n      \"https://example.com/product2\", \n      \"https://example.com/product3\"\n    ],\n    \"concurrent_limit\": 3\n  }\n}\n```\n\n### 场景3：深度研究某个网站\n```json\n{\n  \"mode\": \"deep_crawl\",\n  \"parameters\": {\n    \"url\": \"https://example.com/docs\",\n    \"max_depth\": 3,\n    \"keywords\": [\"教程\", \"指南\", \"API\"],\n    \"strategy\": \"best_first\"\n  }\n}\n```\n\n### 场景4：提取结构化数据\n```json\n{\n  \"mode\": \"extract\",\n  \"parameters\": {\n    \"url\": \"https://news.example.com/article\",\n    \"schema_definition\": {\n      \"title\": \"string\",\n      \"author\": \"string\", \n      \"publish_date\": \"string\",\n      \"content\": \"string\"\n    },\n    \"extraction_type\": \"css\"\n  }\n}\n```\n\n### 场景5：保存网页证据\n```json\n{\n  \"mode\": \"scrape\",\n  \"parameters\": {\n    \"url\": \"https://example.com\",\n    \"return_screenshot\": true,\n    \"return_pdf\": true,\n    \"screenshot_quality\": 90\n  }\n}\n```\n\n## 🚀 详细模式说明\n\n### 1. 抓取单个网页 (`scrape`)\n\n抓取单个网页内容，支持多种输出格式和媒体捕获。\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"scrape\",\n  \"parameters\": {\n    \"url\": \"https://example.com\",\n    \"format\": \"markdown\",\n    \"return_screenshot\": true,\n    \"return_pdf\": false,\n    \"screenshot_quality\": 80,\n    \"screenshot_max_width\": 1200,\n    \"word_count_threshold\": 10,\n    \"exclude_external_links\": true\n  }\n}\n```\n\n**参数说明:**\n- `url` (必需): 要抓取的网页 URL\n- `format`: 输出格式，`markdown`(默认)/`html`/`text`\n- `css_selector`: 提取特定内容的 CSS 选择器\n- `return_screenshot`: 是否返回截图(base64)\n- `return_pdf`: 是否返回 PDF(base64)\n- `screenshot_quality`: 截图质量(10-100)，默认 70\n- `screenshot_max_width`: 截图最大宽度，默认 1920\n- `word_count_threshold`: 内容块最小单词数，默认 10\n- `exclude_external_links`: 是否排除外部链接，默认 true\n\n### 2. 深度网站爬取 (`deep_crawl`)\n\n使用智能策略深度爬取整个网站，支持关键词评分和 URL 过滤。\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"deep_crawl\",\n  \"parameters\": {\n    \"url\": \"https://example.com\",\n    \"max_depth\": 3,\n    \"max_pages\": 50,\n    \"strategy\": \"best_first\",\n    \"include_external\": false,\n    \"keywords\": [\"产品\", \"价格\", \"规格\"],\n    \"url_patterns\": [\"/products/\", \"/docs/\"],\n    \"stream\": false\n  }\n}\n```\n\n**参数说明:**\n- `url` (必需): 起始 URL\n- `max_depth`: 最大爬取深度，默认 2\n- `max_pages`: 最大页面数，默认 50\n- `strategy`: 爬取策略，`bfs`(默认)/`dfs`/`best_first`\n- `include_external`: 是否跟踪外部链接，默认 false\n- `keywords`: 用于相关性评分的关键词列表\n- `url_patterns`: URL 模式过滤列表\n- `stream`: 是否流式返回结果，默认 false\n\n### 3. 批量 URL 处理 (`batch_crawl`)\n\n同时处理多个 URL，适用于批量数据收集。\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"batch_crawl\",\n  \"parameters\": {\n    \"urls\": [\n      \"https://example.com/page1\",\n      \"https://example.com/page2\",\n      \"https://example.com/page3\"\n    ],\n    \"stream\": false,\n    \"concurrent_limit\": 3\n  }\n}\n```\n\n**参数说明:**\n- `urls` (必需): URL 列表\n- `stream`: 是否流式返回，默认 false\n- `concurrent_limit`: 最大并发数，默认 3\n\n### 4. 结构化数据提取 (`extract`)\n\n从网页中提取结构化数据，支持 CSS 选择器和 LLM 智能提取。\n\n**✅ 正确示例 (CSS 提取):**\n```json\n{\n  \"mode\": \"extract\",\n  \"parameters\": {\n    \"url\": \"https://news.example.com/article\",\n    \"schema_definition\": {\n      \"title\": \"string\",\n      \"author\": \"string\",\n      \"publish_date\": \"string\",\n      \"content\": \"string\"\n    },\n    \"css_selector\": \".article-content\",\n    \"extraction_type\": \"css\"\n  }\n}\n```\n\n**✅ 正确示例 (LLM 提取):**\n```json\n{\n  \"mode\": \"extract\",\n  \"parameters\": {\n    \"url\": \"https://news.example.com/article\",\n    \"schema_definition\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"title\": {\"type\": \"string\"},\n        \"author\": {\"type\": \"string\"},\n        \"summary\": {\"type\": \"string\"},\n        \"key_points\": {\"type\": \"array\", \"items\": {\"type\": \"string\"}}\n      }\n    },\n    \"extraction_type\": \"llm\",\n    \"prompt\": \"从文章中提取标题、作者、摘要和关键要点\"\n  }\n}\n```\n\n**参数说明:**\n- `url` (必需): 要提取的网页 URL\n- `schema_definition` (必需): 定义输出结构的 JSON schema\n- `css_selector`: 基础 CSS 选择器（CSS 提取时使用）\n- `extraction_type`: 提取类型，`css`(默认)/`llm`\n- `prompt`: LLM 提取的提示语\n\n### 5. PDF 导出 (`pdf_export`)\n\n将网页导出为 PDF 格式。\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"pdf_export\",\n  \"parameters\": {\n    \"url\": \"https://example.com/document\",\n    \"return_as_base64\": true\n  }\n}\n```\n\n**参数说明:**\n- `url` (必需): 要导出为 PDF 的网页 URL\n- `return_as_base64`: 是否返回 base64 编码，默认 true\n\n### 6. 截图捕获 (`screenshot`)\n\n捕获网页截图，支持质量压缩和尺寸调整。\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"screenshot\",\n  \"parameters\": {\n    \"url\": \"https://example.com\",\n    \"full_page\": true,\n    \"return_as_base64\": true,\n    \"quality\": 80,\n    \"max_width\": 1200,\n    \"max_height\": 3000\n  }\n}\n```\n\n**参数说明:**\n- `url` (必需): 要截图的网页 URL\n- `full_page`: 是否截取整个页面，默认 true\n- `return_as_base64`: 是否返回 base64 编码，默认 true\n- `quality`: 截图质量(10-100)，默认 70\n- `max_width`: 最大宽度，默认 1920\n- `max_height`: 最大高度，默认 5000\n\n## 🔄 常见工作流\n\n### 新闻文章采集工作流\n**目标**: 自动收集和分析新闻内容\n1. **发现阶段**: 使用 `deep_crawl` 发现相关文章链接\n   ```json\n   {\n     \"mode\": \"deep_crawl\",\n     \"parameters\": {\n       \"url\": \"https://news.example.com\",\n       \"max_depth\": 2,\n       \"keywords\": [\"科技\", \"人工智能\", \"AI\"],\n       \"max_pages\": 20\n     }\n   }\n   ```\n2. **采集阶段**: 使用 `batch_crawl` 批量获取内容\n   ```json\n   {\n     \"mode\": \"batch_crawl\", \n     \"parameters\": {\n       \"urls\": [\"url1\", \"url2\", \"url3\"],\n       \"concurrent_limit\": 3\n     }\n   }\n   ```\n3. **提取阶段**: 使用 `extract` 结构化提取关键信息\n   ```json\n   {\n     \"mode\": \"extract\",\n     \"parameters\": {\n       \"url\": \"https://news.example.com/article\",\n       \"schema_definition\": {\n         \"title\": \"string\",\n         \"author\": \"string\",\n         \"publish_date\": \"string\", \n         \"summary\": \"string\"\n       },\n       \"extraction_type\": \"llm\"\n     }\n   }\n   ```\n\n### 竞品分析工作流\n**目标**: 系统化分析竞争对手网站\n1. **证据收集**: 使用 `screenshot` 捕获竞品页面\n   ```json\n   {\n     \"mode\": \"screenshot\",\n     \"parameters\": {\n       \"url\": \"https://competitor.com/product\",\n       \"full_page\": true,\n       \"quality\": 90\n     }\n   }\n   ```\n2. **内容分析**: 使用 `scrape` 获取详细内容\n   ```json\n   {\n     \"mode\": \"scrape\",\n     \"parameters\": {\n       \"url\": \"https://competitor.com/product\",\n       \"format\": \"markdown\",\n       \"return_screenshot\": true\n     }\n   }\n   ```\n3. **文档保存**: 使用 `pdf_export` 保存证据\n   ```json\n   {\n     \"mode\": \"pdf_export\", \n     \"parameters\": {\n       \"url\": \"https://competitor.com/product\",\n       \"return_as_base64\": true\n     }\n   }\n   ```\n\n### 产品目录爬取工作流\n**目标**: 建立完整的产品数据库\n1. **目录探索**: 使用 `deep_crawl` 发现所有产品页面\n   ```json\n   {\n     \"mode\": \"deep_crawl\",\n     \"parameters\": {\n       \"url\": \"https://store.example.com\",\n       \"max_depth\": 3,\n       \"url_patterns\": [\"/product/\", \"/item/\"],\n       \"strategy\": \"bfs\"\n     }\n   }\n   ```\n2. **数据提取**: 使用 `extract` 提取产品信息\n   ```json\n   {\n     \"mode\": \"extract\",\n     \"parameters\": {\n       \"url\": \"https://store.example.com/product/123\",\n       \"schema_definition\": {\n         \"name\": \"string\",\n         \"price\": \"string\", \n         \"description\": \"string\",\n         \"specifications\": \"object\"\n       },\n       \"extraction_type\": \"css\"\n     }\n   }\n   ```\n\n### 学术研究资料收集工作流\n**目标**: 收集学术文献和研究资料\n1. **深度搜索**: 使用 `deep_crawl` 在学术网站搜索\n   ```json\n   {\n     \"mode\": \"deep_crawl\",\n     \"parameters\": {\n       \"url\": \"https://scholar.example.com\",\n       \"keywords\": [\"机器学习\", \"深度学习\", \"神经网络\"],\n       \"max_depth\": 2,\n       \"max_pages\": 30\n     }\n   }\n   ```\n2. **批量下载**: 使用 `batch_crawl` 获取论文页面\n   ```json\n   {\n     \"mode\": \"batch_crawl\",\n     \"parameters\": {\n       \"urls\": [\"paper1_url\", \"paper2_url\", \"paper3_url\"],\n       \"concurrent_limit\": 2\n     }\n   }\n   ```\n3. **PDF保存**: 使用 `pdf_export` 保存重要文献\n   ```json\n   {\n     \"mode\": \"pdf_export\",\n     \"parameters\": {\n       \"url\": \"https://scholar.example.com/paper/123\",\n       \"return_as_base64\": true\n     }\n   }\n   ```\n\n## 🛠️ 故障排除\n\n### 常见问题与解决方案\n\n#### 性能问题\n- **超时问题**: \n  - 减少 `max_pages` 或 `max_depth`\n  - 降低 `concurrent_limit`\n  - 启用 `stream: true` 流式处理\n  \n- **内存问题**:\n  - 启用 `stream: true`\n  - 减少批量处理的 URL 数量\n  - 降低截图质量 (`screenshot_quality`)\n\n#### 内容质量问题\n- **内容缺失**:\n  - 调整 `word_count_threshold` 降低过滤阈值\n  - 检查 `css_selector` 是否正确\n  - 尝试不同的 `format` 格式\n\n- **截图不完整**:\n  - 增加 `max_height` 值\n  - 确保 `full_page: true`\n  - 提高 `screenshot_quality`\n\n#### 网络问题\n- **连接失败**:\n  - 检查 URL 格式（必须包含 http:// 或 https://）\n  - 验证网络连接\n  - 尝试减少并发数\n\n- **被网站屏蔽**:\n  - 降低爬取速度（减少并发数）\n  - 增加请求间隔\n  - 使用合法的 User-Agent\n\n### 调试技巧\n\n1. **从简单开始**: 先用 `scrape` 模式测试单个页面\n2. **逐步增加复杂度**: 确认基础功能正常后再使用高级模式\n3. **检查参数**: 确保所有参数都正确嵌套在 `parameters` 对象内\n4. **验证输出**: 先测试小规模数据，确认输出格式符合预期\n\n## ⚠️ 重要提示\n\n### ✅ 正确做法\n- **参数嵌套**: 所有参数必须放在 `parameters` 对象内\n- **URL 格式**: 必须以 `http://` 或 `https://` 开头\n- **模式选择**: 根据需求选择合适的模式\n- **内存管理**: 大量数据时使用流式处理 (`stream: true`)\n\n### ❌ 常见错误\n\n**错误 1: 缺少嵌套参数**\n```json\n// ❌ 错误\n{\n  \"mode\": \"scrape\",\n  \"url\": \"https://example.com\"\n}\n\n// ✅ 正确\n{\n  \"mode\": \"scrape\",\n  \"parameters\": {\n    \"url\": \"https://example.com\"\n  }\n}\n```\n\n**错误 2: URL 缺少协议**\n```json\n// ❌ 错误\n{\n  \"mode\": \"scrape\",\n  \"parameters\": {\n    \"url\": \"example.com\"\n  }\n}\n\n// ✅ 正确\n{\n  \"mode\": \"scrape\",\n  \"parameters\": {\n    \"url\": \"https://example.com\"\n  }\n}\n```\n\n**错误 3: 错误的参数类型**\n```json\n// ❌ 错误 - urls 应该是数组\n{\n  \"mode\": \"batch_crawl\",\n  \"parameters\": {\n    \"urls\": \"https://example.com\"\n  }\n}\n\n// ✅ 正确\n{\n  \"mode\": \"batch_crawl\",\n  \"parameters\": {\n    \"urls\": [\"https://example.com\"]\n  }\n}\n```\n\n## 🎪 高级使用技巧\n\n### 1. 组合使用媒体捕获\n```json\n{\n  \"mode\": \"scrape\",\n  \"parameters\": {\n    \"url\": \"https://example.com\",\n    \"return_screenshot\": true,\n    \"return_pdf\": true,\n    \"screenshot_quality\": 90\n  }\n}\n```\n\n### 2. 智能深度爬取\n```json\n{\n  \"mode\": \"deep_crawl\",\n  \"parameters\": {\n    \"url\": \"https://docs.example.com\",\n    \"strategy\": \"best_first\",\n    \"keywords\": [\"API\", \"教程\", \"示例\"],\n    \"max_depth\": 3,\n    \"max_pages\": 30\n  }\n}\n```\n\n### 3. 批量处理重要页面\n```json\n{\n  \"mode\": \"batch_crawl\",\n  \"parameters\": {\n    \"urls\": [\n      \"https://example.com/home\",\n      \"https://example.com/about\",\n      \"https://example.com/contact\",\n      \"https://example.com/products\"\n    ],\n    \"concurrent_limit\": 2\n  }\n}\n```\n\n### 4. 智能内容提取\n```json\n{\n  \"mode\": \"extract\",\n  \"parameters\": {\n    \"url\": \"https://news.example.com/article\",\n    \"schema_definition\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"headline\": {\"type\": \"string\"},\n        \"author\": {\"type\": \"string\"},\n        \"publish_date\": {\"type\": \"string\"},\n        \"main_content\": {\"type\": \"string\"},\n        \"tags\": {\"type\": \"array\", \"items\": {\"type\": \"string\"}}\n      }\n    },\n    \"extraction_type\": \"llm\",\n    \"prompt\": \"提取新闻文章的标题、作者、发布日期、主要内容和标签\"\n  }\n}\n```\n\n## 📝 最佳实践总结\n\n1. **选择合适的模式**: 根据任务复杂度选择最简单有效的模式\n2. **渐进式测试**: 从小规模开始测试，逐步扩大范围\n3. **资源管理**: 注意并发数和内存使用，避免过度请求\n4. **错误处理**: 准备好处理网络错误和内容解析失败的情况\n5. **合法使用**: 遵守网站的 robots.txt 和服务条款",
    "resources": {},
    "filePath": "D:\\Github_10110531\\gemini_chat\\src\\skills\\crawl4ai",
    "lastUpdated": "2025-10-26T07:20:06.463Z"
  },
  "firecrawl": {
    "metadata": {
      "name": "firecrawl",
      "description": "多功能网页抓取和数据提取工具，支持同步抓取、搜索、网站地图获取和异步爬取",
      "tool_name": "firecrawl",
      "category": "web-crawling",
      "priority": 7,
      "tags": [
        "web-scraping",
        "data-extraction",
        "crawling",
        "automation",
        "firecrawl"
      ],
      "version": 1
    },
    "content": "# 工具调用示例（Firecrawl）\n\n`firecrawl` 是一个多功能网页抓取和数据提取工具，通过 `mode` 参数调用不同功能。其 `parameters` 结构是嵌套的。\n\n**✅ 正确的调用结构:**\n```json\n{\"mode\": \"<功能模式>\", \"parameters\": {\"<参数名>\": \"<参数值>\"}}\n```\n\n**💡 重要提示:**\n- `scrape`、`search`、`map` 是同步操作，立即返回结果\n- `crawl`、`extract` 是异步操作，返回 `job_id` 用于后续状态检查\n- 所有参数都必须在 `parameters` 对象内，不要放在顶层\n- URL 必须以 `http://` 或 `https://` 开头\n\n## 功能模式详解\n\n### ➡️ 示例 1: 抓取单个网页 (`scrape`)\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"scrape\", \n  \"parameters\": {\n    \"url\": \"https://docs.firecrawl.dev/\",\n    \"formats\": [\"markdown\"]  // 可选：[\"markdown\", \"html\"]，默认 markdown\n  }\n}\n```\n\n### ➡️ 示例 2: 网页搜索 (`search`)\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"search\", \n  \"parameters\": {\n    \"query\": \"人工智能最新发展\",\n    \"limit\": 5\n  }\n}\n```\n\n### ➡️ 示例 3: 获取网站地图 (`map`)\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"map\", \n  \"parameters\": {\n    \"url\": \"https://example.com\"\n  }\n}\n```\n\n### ➡️ 示例 4: 异步爬取网站 (`crawl`)\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"crawl\", \n  \"parameters\": {\n    \"url\": \"https://firecrawl.dev\", \n    \"limit\": 5\n  }\n}\n```\n*此调用会返回一个 `job_id`，用于后续查询。*\n\n### ➡️ 示例 5: 结构化数据提取 (`extract`)\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"extract\", \n  \"parameters\": {\n    \"urls\": [\"https://news.example.com/article\"],\n    \"prompt\": \"提取文章标题、作者和发布时间\",\n    \"schema\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"title\": {\"type\": \"string\"},\n        \"author\": {\"type\": \"string\"}, \n        \"publish_time\": {\"type\": \"string\"}\n      }\n    }\n  }\n}\n```\n\n### ➡️ 示例 6: 检查异步任务状态 (`check_status`)\n\n**✅ 正确示例:**\n```json\n{\n  \"mode\": \"check_status\", \n  \"parameters\": {\n    \"job_id\": \"some-unique-job-identifier\"\n  }\n}\n```\n\n## ❌ 错误示例 (请避免以下常见错误)\n\n- **缺少 `mode` 参数:** `{\"parameters\": {\"url\": \"...\"}}`\n- **缺少嵌套的 `parameters` 对象:** `{\"mode\": \"scrape\", \"url\": \"...\"}`\n- **将参数放在顶层:** `{\"url\": \"...\"}` \n- **使用无效的 URL 格式:** `{\"mode\": \"scrape\", \"parameters\": {\"url\": \"example.com\"}}` (缺少协议)\n- **错误的参数类型:** `{\"mode\": \"extract\", \"parameters\": {\"urls\": \"https://example.com\"}}` (urls 应该是数组)",
    "resources": {},
    "filePath": "D:\\Github_10110531\\gemini_chat\\src\\skills\\firecrawl",
    "lastUpdated": "2025-10-26T07:20:06.468Z"
  },
  "glm4v_analyze_image": {
    "metadata": {
      "name": "glm4v_analyze_image",
      "description": "智谱AI的视觉语言模型，用于图像分析、内容识别和视觉问答",
      "tool_name": "glm4v_analyze_image",
      "category": "vision",
      "priority": 7,
      "tags": [
        "image-analysis",
        "vision",
        "recognition",
        "visual-qa",
        "multimodal"
      ],
      "version": 1
    },
    "content": "# GLM-4V图像分析工具指南\n\n## 核心能力\n- 图像内容识别和描述\n- 视觉问答和推理\n- 图像细节分析\n- 多模态理解和生成\n\n## 调用规范\n```json\n{\n  \"tool_name\": \"glm4v_analyze_image\",\n  \"parameters\": {\n    \"model\": \"glm-4v-flash\",\n    \"image_url\": \"图片URL\",\n    \"prompt\": \"分析提示语\"\n  }\n}\n```\n\n以下是调用 `glm4v_analyze_image` 工具的**正确**和**错误**示例。请务必遵循正确格式。\n\n## ✅ 正确示例\n```json\n{\"model\": \"glm-4v-flash\", \"image_url\": \"https://path/to/image.jpg\", \"prompt\": \"Describe this image.\"}\n```\n\n## ❌ 错误示例 (请避免以下常见错误)\n\n- **缺少引号或逗号:** \n  ```json\n  {\"model\": \"glm-4v-flash\", \"image_url\": \"https://path/to/image.jpg\", \"prompt\": \"Describe this image.\"}\n  ```\n  (缺少 `}`)\n\n- **参数名错误:** \n  ```json\n  {\"img_url\": \"https://path/to/image.jpg\"}\n  ```\n  (应为 \"image_url\" 而非 \"img_url\")\n\n- **模型名称错误:** \n  ```json\n  {\"model\": \"glm4v-flash\", \"image_url\": \"https://path/to/image.jpg\", \"prompt\": \"Describe this image.\"}\n  ```\n  (应为 \"glm-4v-flash\")\n  \n## 关键指令\n1. **模型选择**: 使用 `glm-4v-flash` 模型\n2. **图片格式**: 支持常见图片格式（JPEG, PNG, WebP等）\n3. **提示语设计**: 清晰具体的分析指令\n4. **URL有效性**: 确保图片URL可公开访问\n\n## 使用场景\n\n### 图像描述\n```json\n{\n  \"tool_name\": \"glm4v_analyze_image\",\n  \"parameters\": {\n    \"model\": \"glm-4v-flash\", \n    \"image_url\": \"https://example.com/image.jpg\",\n    \"prompt\": \"详细描述这张图片的内容\"\n  }\n}\n```\n\n### 视觉问答\n```json\n{\n  \"tool_name\": \"glm4v_analyze_image\",\n  \"parameters\": {\n    \"model\": \"glm-4v-flash\",\n    \"image_url\": \"https://example.com/image.jpg\", \n    \"prompt\": \"图片中有多少人？他们在做什么？\"\n  }\n}\n```\n\n### 细节分析\n```json\n{\n  \"tool_name\": \"glm4v_analyze_image\",\n  \"parameters\": {\n    \"model\": \"glm-4v-flash\",\n    \"image_url\": \"https://example.com/image.jpg\",\n    \"prompt\": \"分析图片中的文字内容和技术细节\"\n  }\n}\n```\n\n## 最佳实践\n\n### 提示语设计\n- **具体明确**: \"描述图片中人物的动作和表情\"\n- **任务导向**: \"识别图片中的所有物体并分类\"\n- **细节要求**: \"注意颜色、形状、空间关系等细节\"\n\n### 错误处理\n- 检查图片URL是否有效\n- 确认图片格式支持\n- 处理网络超时情况\n\n## 能力范围\n- ✅ 物体识别和分类\n- ✅ 场景理解和描述  \n- ✅ 文字识别（OCR）\n- ✅ 情感和氛围分析\n- ✅ 技术细节提取\n\n## 限制说明\n- ❌ 不能处理敏感或不当内容\n- ❌ 图片大小和分辨率有限制\n- ❌ 实时视频流不支持\n- ❌ 3D模型分析不支持\n\n## 性能优化\n- 使用合适的图片尺寸\n- 提供具体的分析需求\n- 分步骤进行复杂分析\n- 结合其他工具进行验证",
    "resources": {},
    "filePath": "D:\\Github_10110531\\gemini_chat\\src\\skills\\glm4v_analyze_image",
    "lastUpdated": "2025-10-26T07:20:06.468Z"
  },
  "python_sandbox": {
    "metadata": {
      "name": "python_sandbox",
      "description": "在沙盒环境中执行Python代码，用于数据分析、可视化和生成Excel、Word、PDF等文件。支持数据清洗、统计分析、机器学习、图表生成、文档自动化等复杂工作流。",
      "tool_name": "python_sandbox",
      "category": "code",
      "priority": 10,
      "tags": [
        "python",
        "code",
        "visualization",
        "data-analysis",
        "chart",
        "document",
        "automation",
        "machine-learning",
        "reporting",
        "excel",
        "word",
        "pdf",
        "ppt"
      ],
      "version": 2,
      "references": [
        "matplotlib_cookbook.md",
        "pandas_cheatsheet.md",
        "report_generator_workflow.md",
        "ml_workflow.md",
        "sympy_cookbook.md",
        "scipy_cookbook.md"
      ]
    },
    "content": "# Python沙盒工具使用指南\n\n## 🎯 核心能力概览\n\nPython沙盒是一个多功能的代码执行环境，支持：\n- **数据分析与处理**: 使用Pandas进行数据清洗、转换、聚合\n- **可视化图表**: 使用Matplotlib, Seaborn, Plotly生成各种图表\n- **文档自动化**: 创建和编辑Excel, Word, PDF, PPT文件\n- **机器学习**: 使用scikit-learn进行模型训练和评估\n- **科学与数学计算**: 使用Sympy进行符号计算和公式证明\n- **工作流编排**: 复杂任务的自动化执行管道\n\n## 🚀 基础调用规范\n\n### 简单代码执行\n对于简单的、一次性的代码执行，请遵循以下格式：\n\n**调用格式:**\n```json\n{\"code\": \"print('Hello, world!')\"}\n```\n\n**输出规范:**\n- 图片：必须以包含 `type: \"image\"` 和 `image_base64` 的JSON对象形式输出\n- 文件：必须以包含 `type: \"word|excel|...\"` 和 `data_base64` 的JSON对象形式输出\n- 详细规范请参考相关 references/ 文件\n\n---\n\n## 📚 工作流与参考指南\n\n当你需要执行一项具体的、复杂的任务时，**请首先查阅相关的参考文件**以获取最佳实践和代码模板。\n\n### **1. 数据可视化**\n- **任务**: 创建图表，如条形图、折线图、散点图、热力图等\n- **指令**: **必须查阅 `references/matplotlib_cookbook.md`**。该文件包含了标准的图表生成模板，确保了高质量的、统一风格的输出\n\n### **2. 数据清洗与分析**\n- **任务**: 处理缺失值、异常值，进行描述性统计或相关性分析\n- **指令**: **请参考 `references/pandas_cheatsheet.md`** 中的数据清洗流水线示例\n\n### **3. 自动化报告生成**\n- **任务**: 生成包含图表和数据的Word、Excel或PDF报告\n- **指令**: **遵循 `references/report_generator_workflow.md`** 中的周报生成器工作流。它展示了如何组合数据、图表和文档库来创建复杂的报告\n\n### **4. 机器学习**\n- **任务**: 训练分类或回归模型，并评估其性能\n- **指令**: **学习并使用 `references/ml_workflow.md`** 中的代码结构来训练和评估模型\n\n### **5. 符号数学与公式证明**\n- **任务**: 解代数方程、进行微积分计算、简化数学表达式、证明数学公式\n- **指令**: **必须使用 `sympy` 库，并严格参考 `references/sympy_cookbook.md`** 中的函数和示例来构建你的解决方案\n\n---\n\n## 💡 核心工作流模式\n\n### 公式证明工作流\n1. **定义符号**: 使用 `sympy.symbols()` 定义所有变量\n2. **构建表达式**: 将公式的左边和右边构建为两个独立的`sympy`表达式\n3. **尝试直接简化**: 使用 `sympy.simplify(LHS - RHS)`，如果结果为0，则证明成立\n4. **若不为0，尝试变换**: 使用 `expand()`, `factor()`, `trigsimp()` 等函数对表达式进行变换，再次尝试步骤3\n5. **输出步骤**: 将你的每一步推理和使用的`sympy`代码清晰地呈现出来\n\n### ETL管道模式 (Extract-Transform-Load)\n1. **Extract**: 从数据源提取原始数据\n2. **Transform**: 清洗、转换、处理数据\n3. **Load**: 生成输出结果（图表、文档、分析报告）\n\n### 分析报告工作流\n1. **数据收集**: 获取或生成所需数据\n2. **数据处理**: 清洗、转换、分析数据\n3. **可视化**: 创建相关图表和可视化\n4. **报告生成**: 整合数据和图表到最终文档\n\n---\n\n## 📋 可用库快速参考\n\n### 数据处理\n- `pandas==2.2.2` - 数据分析核心库\n- `numpy==1.26.4` - 数值计算\n- `scipy==1.14.1` - 科学计算\n\n### 可视化\n- `matplotlib==3.8.4` - 基础绘图库\n- `seaborn==0.13.2` - 统计可视化\n- `plotly==5.18.0` - 交互式图表\n\n### 文档生成\n- `python-docx==1.1.2` - Word文档\n- `reportlab==4.0.7` - PDF生成\n- `python-pptx==0.6.23` - PPT演示文稿\n- `openpyxl==3.1.2` - Excel文件操作\n\n### 机器学习与数学\n- `scikit-learn==1.4.2` - 机器学习\n- `sympy==1.12` - 符号数学\n- `statsmodels==0.14.1` - 统计模型\n\n---\n\n## 🚨 重要提醒\n\n1. **内存管理**: 及时关闭图表和文件流，使用 `plt.close('all')`\n2. **性能优化**: 避免在循环中创建大型对象\n3. **输出纯净**: 确保输出格式正确，避免额外文本\n4. **按需加载**: 对于复杂任务，优先参考对应的references文件\n5. **错误处理**: 在关键操作中添加try-catch块\n\n通过这个结构化的指南和丰富的参考文件，您可以高效地完成各种复杂的Python编程任务。",
    "resources": {
      "references": [
        "matplotlib_cookbook.md",
        "ml_workflow.md",
        "pandas_cheatsheet.md.md",
        "report_generator_workflow.md",
        "scipy_cookbook.md",
        "sympy_cookbook.md"
      ]
    },
    "filePath": "D:\\Github_10110531\\gemini_chat\\src\\skills\\python_sandbox",
    "lastUpdated": "2025-10-26T07:20:06.471Z"
  },
  "stockfish_analyzer": {
    "metadata": {
      "name": "stockfish_analyzer",
      "description": "国际象棋引擎分析工具，提供最佳走法推荐、局面评估和多种走法选择分析。支持FEN字符串直接输入分析。",
      "tool_name": "stockfish_analyzer",
      "category": "chess",
      "priority": 6,
      "tags": [
        "chess",
        "analysis",
        "game",
        "strategy",
        "evaluation",
        "FEN",
        "SAN",
        "position",
        "move",
        "best-move",
        "top-moves",
        "chess-engine",
        "stockfish",
        "board",
        "棋局",
        "走法",
        "评估",
        "局面"
      ],
      "version": 1.1
    },
    "content": "# 国际象棋AI助教指南\n\n你是一位顶级的国际象棋AI助教。你的核心任务是作为用户和强大的 \"stockfish_analyzer\" 工具之间的智能桥梁。你 **不自己下棋**，而是 **调用工具** 并 **解释结果**。\n\n## 🎯 核心工作流程\n\n### 1. **识别FEN字符串和用户意图**\n- **FEN字符串特征**: 识别如 `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` 格式的字符串\n- **自动触发**: 当检测到有效的FEN字符串时，自动调用分析工具\n- **意图分析**: 根据用户问题选择合适模式：\n  - **最佳走法**: \"我该怎么走？\"、\"最佳走法\"、\"下一步\" → `get_best_move`\n  - **多种选择**: \"前三步推荐\"、\"有哪些选择\"、\"几个好走法\" → `get_top_moves`\n  - **局面评估**: \"谁优势\"、\"局面如何\"、\"评估\" → `evaluate_position`\n\n### 2. **调用正确工具**\n根据用户意图选择对应的分析模式。\n\n### 3. **解释工具结果**\n将专业的引擎输出转化为易懂的教学语言。\n\n## 📋 快速使用指南\n\n### 场景1：直接FEN分析\n**用户输入**: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`\n**自动响应**: 分析初始局面，提供最佳走法和评估\n\n### 场景2：FEN + 简单指令  \n**用户输入**: `r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3` 前三步推荐\n**工具调用**: `get_top_moves` with `top_n: 3`\n\n### 场景3：局面评估请求\n**用户输入**: `r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3` 现在谁优势？\n**工具调用**: `evaluate_position`\n\n## 🔧 工具调用规范\n\n**重要提示**: 当你决定调用 `stockfish_analyzer` 工具时，你的思考过程应该生成一个包含 `tool_name` 和 `parameters` 字段的JSON对象。`parameters` 字段的值必须严格遵守工具的输入模式。\n\n### ✅ 正确的调用结构\n```json\n{\n  \"tool_name\": \"stockfish_analyzer\",\n  \"parameters\": {\n    \"fen\": \"<FEN字符串>\",\n    \"mode\": \"<功能模式>\",\n    \"options\": {\n      \"<选项名>\": \"<选项值>\"\n    }\n  }\n}\n```\n\n### 功能模式详解\n\n#### 1. 获取最佳走法 (`get_best_move`)\n**适用场景**: 用户询问\"最佳走法\"、\"下一步怎么走\"\n```json\n{\n  \"tool_name\": \"stockfish_analyzer\",\n  \"parameters\": {\n    \"fen\": \"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\",\n    \"mode\": \"get_best_move\"\n  }\n}\n```\n\n#### 2. 获取多个走法选项 (`get_top_moves`)\n**适用场景**: 用户询问\"前三步\"、\"有哪些选择\"、\"几个好走法\"\n```json\n{\n  \"tool_name\": \"stockfish_analyzer\", \n  \"parameters\": {\n    \"fen\": \"r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3\",\n    \"mode\": \"get_top_moves\",\n    \"options\": {\n      \"top_n\": 3\n    }\n  }\n}\n```\n\n#### 3. 评估局面 (`evaluate_position`)\n**适用场景**: 用户询问\"局面如何\"、\"谁优势\"、\"评估一下\"\n```json\n{\n  \"tool_name\": \"stockfish_analyzer\",\n  \"parameters\": {\n    \"fen\": \"r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3\", \n    \"mode\": \"evaluate_position\"\n  }\n}\n```\n\n## ❌ 错误示例 (请避免以下常见错误)\n\n- **缺少 `fen` 参数**: `{\"tool_name\": \"stockfish_analyzer\", \"parameters\": {\"mode\": \"get_best_move\"}}`\n- **错误的 `mode` 名称**: `{\"tool_name\": \"stockfish_analyzer\", \"parameters\": {\"fen\": \"...\", \"mode\": \"best_move\"}}` (应为 \"get_best_move\")\n- **options 格式错误**: `{\"tool_name\": \"stockfish_analyzer\", \"parameters\": {\"fen\": \"...\", \"mode\": \"get_top_moves\", \"options\": 3}}` (options 必须是一个对象，如 `{\"top_n\": 3}`)\n\n## 💡 结果解释指南\n\n### 评估分数解释\n- **兵值优势**: `\"evaluation\": {\"type\": \"cp\", \"value\": 250}` → \"白方有明显优势，相当于多2.5个兵\"\n- **轻微优势**: `\"evaluation\": {\"type\": \"cp\", \"value\": -120}` → \"黑方稍占优，优势约1.2个兵\"  \n- **将死局面**: `\"evaluation\": {\"type\": \"mate\", \"value\": 3}` → \"白方3步内可将死对方\"\n\n### 走法解释\n- **UCI转SAN**: `\"best_move\": \"g1f3\"` → \"最佳走法是 **Nf3**\"\n- **战略意图**: 解释走法的目的和战略意义\n- **多走法比较**: 当有多个选项时，分析各自的优缺点\n\n## 🚀 智能识别增强\n\n### FEN字符串特征识别\n- **格式特征**: 包含 `/` 分隔的行、`w`/`b` 走子方、易位权利等\n- **自动检测**: 检测到FEN格式时自动触发分析\n- **容错处理**: 处理常见的FEN格式变体\n\n### 用户意图关键词\n- **最佳走法类**: \"最佳\"、\"最好\"、\"怎么走\"、\"下一步\"\n- **多选项类**: \"几个\"、\"哪些\"、\"选择\"、\"推荐\"、\"前三\"  \n- **评估类**: \"评估\"、\"优势\"、\"局面\"、\"谁好\"\n- **中英文混合**: 支持中文指令如\"棋局\"、\"走法\"、\"评估\"\n\n## ⚠️ 常见问题处理\n\n### FEN识别问题\n**用户输入不包含FEN**:\n```\n\"请提供当前局面的FEN字符串，格式如: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\"\n```\n\n**无效FEN格式**:\n```\n\"这个FEN字符串格式不正确，请检查并重新提供有效的FEN字符串\"\n```\n\n### 模式选择建议\n**模糊指令**:\n```\n\"您是想知道最佳走法，还是想看看多个选择？\"\n```\n\n## 📝 最佳实践\n\n### 响应模板\n1. **确认局面**: \"分析您提供的局面...\"\n2. **调用工具**: [自动调用对应模式]\n3. **解释结果**: 用通俗语言解释引擎分析\n4. **教学指导**: 提供战略建议和学习要点\n\n### 错误处理\n- **缺少FEN**: 友好提示用户提供FEN\n- **无效FEN**: 说明正确格式要求  \n- **网络问题**: 提示稍后重试\n\n---\n\n**重要提示**: 严格遵守\"不创造走法、不自行评估\"的原则，所有分析必须基于工具输出。你的价值在于将专业的引擎分析转化为易懂的教学指导。",
    "resources": {},
    "filePath": "D:\\Github_10110531\\gemini_chat\\src\\skills\\stockfish_analyzer",
    "lastUpdated": "2025-10-26T07:20:06.471Z"
  },
  "tavily_search": {
    "metadata": {
      "name": "tavily_search",
      "description": "使用Tavily API进行网络搜索，获取实时信息、回答问题或研究主题",
      "tool_name": "tavily_search",
      "category": "search",
      "priority": 8,
      "tags": [
        "search",
        "research",
        "real-time",
        "information"
      ],
      "version": 1
    },
    "content": "# 工具调用示例（Tavily Search）\n\n当您决定调用 tavily_search 工具时，您的响应应该是一个包含 tool_name 和 parameters 字段的 JSON 对象。parameters 字段的值应是工具所需的参数对象。\n\n## ✅ 正确示例\n\n**parameters 字段内容:**\n```json\n{\"query\": \"latest AI news\"}\n```\n\n**完整工具调用响应示例:**\n```json\n{\"tool_name\": \"tavily_search\", \"parameters\": {\"query\": \"latest AI news\"}}\n```\n\n## ❌ 错误示例 (请避免以下常见错误)\n\n- **在 JSON 中嵌入 Markdown 分隔符:** \n  ```json\n  \"```json\\n{\\\"query\\\": \\\"latest AI news\\\"}\\n```\"\n  ```\n  (Qwen 模型会将此作为 JSON 字符串的一部分，导致解析失败)\n\n- **参数名错误:** \n  ```json\n  {\"q\": \"latest AI news\"}\n  ```\n  (应为 \"query\" 而非 \"q\")\n\n- **参数值错误:** \n  ```json\n  {\"query\": 123}\n  ```\n  (query 参数值应为字符串，而不是数字)\n\n## 关键指令\n1. **查询构建**: 查询应该具体且相关\n2. **实时性**: 适用于需要最新信息的问题\n3. **验证**: 可用于验证其他信息来源\n\n## 使用场景\n1. 获取实时新闻和信息\n2. 回答需要最新数据的问题\n3. 研究特定主题的背景信息\n4. 验证事实和数据的准确性\n\n## 最佳实践\n- 查询应该具体且相关\n- 对于复杂问题，可以分解为多个搜索查询\n- 结合搜索结果进行综合分析\n- 优先使用英文关键词获取更准确的结果\n\n## 示例查询\n- \"2024年人工智能最新发展\"\n- \"OpenAI最新模型发布信息\"\n- \"比特币当前价格和趋势\"\n- \"Python 3.12新特性详解\"",
    "resources": {},
    "filePath": "D:\\Github_10110531\\gemini_chat\\src\\skills\\tavily_search",
    "lastUpdated": "2025-10-26T07:20:06.471Z"
  }
};

export function getSkillsRegistry() {
  const map = new Map();
  Object.entries(SKILLS_DATA).forEach(([key, value]) => {
    map.set(key, value);
  });
  return map;
}