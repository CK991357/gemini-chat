import asyncio
import base64
import io
import gc
import psutil
import time
import json
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel, Field
from crawl4ai import AsyncWebCrawler
from crawl4ai import CrawlerRunConfig, CacheMode
from crawl4ai.deep_crawling import BFSDeepCrawlStrategy, DFSDeepCrawlStrategy, BestFirstCrawlingStrategy
from crawl4ai.deep_crawling.filters import FilterChain, URLPatternFilter, DomainFilter, ContentTypeFilter
from crawl4ai.deep_crawling.scorers import KeywordRelevanceScorer
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy, LLMExtractionStrategy
from crawl4ai.content_scraping_strategy import LXMLWebScrapingStrategy
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
from crawl4ai.content_filter_strategy import PruningContentFilter
import logging
from PIL import Image

# 配置日志
logger = logging.getLogger(__name__)

# 1. 保持原有的输入模型不变（确保接口兼容）
class ScrapeParams(BaseModel):
    url: str = Field(description="The URL of the page to scrape.")
    format: Literal['markdown', 'html', 'text'] = Field(default='markdown', description="Output format.")
    css_selector: Optional[str] = Field(default=None, description="CSS selector to extract specific content.")
    include_links: bool = Field(default=True, description="Whether to include links in the output.")
    include_images: bool = Field(default=True, description="Whether to include images in the output.")
    return_screenshot: bool = Field(default=False, description="Whether to return screenshot as base64.")
    return_pdf: bool = Field(default=False, description="Whether to return PDF as base64.")
    screenshot_quality: int = Field(default=70, ge=10, le=100, description="JPEG quality for screenshot (10-100).")
    screenshot_max_width: int = Field(default=1920, description="Maximum width for screenshot.")
    word_count_threshold: int = Field(default=10, description="Minimum words per content block.")
    exclude_external_links: bool = Field(default=True, description="Remove external links from content.")

class CrawlParams(BaseModel):
    url: str = Field(description="The starting URL for the crawl.")
    max_pages: int = Field(default=10, description="Maximum number of pages to crawl.")
    same_domain: bool = Field(default=True, description="Whether to only crawl same domain URLs.")
    depth: int = Field(default=2, description="Crawl depth.")
    strategy: Literal['bfs', 'dfs', 'best_first'] = Field(default='bfs', description="Crawl strategy.")
    include_external: bool = Field(default=False, description="Include external domains.")
    stream_results: bool = Field(default=False, description="Stream results as they complete.")

class DeepCrawlParams(BaseModel):
    url: str = Field(description="The starting URL for deep crawl.")
    max_depth: int = Field(default=2, description="Maximum crawl depth.")
    max_pages: int = Field(default=50, description="Maximum pages to crawl.")
    strategy: Literal['bfs', 'dfs', 'best_first'] = Field(default='bfs', description="Crawl strategy.")
    include_external: bool = Field(default=False, description="Follow external links.")
    keywords: Optional[List[str]] = Field(default=None, description="Keywords for relevance scoring.")
    url_patterns: Optional[List[str]] = Field(default=None, description="URL patterns to include.")
    stream: bool = Field(default=False, description="Stream results progressively.")

class ExtractParams(BaseModel):
    url: str = Field(description="The URL to extract structured data from.")
    schema_definition: Dict[str, Any] = Field(description="JSON schema for data extraction.")
    css_selector: Optional[str] = Field(default=None, description="Base CSS selector for extraction.")
    extraction_type: Literal['css', 'llm'] = Field(default='css', description="Extraction strategy type.")
    prompt: Optional[str] = Field(default=None, description="Prompt for LLM extraction.")

class BatchCrawlParams(BaseModel):
    urls: List[str] = Field(description="List of URLs to crawl.")
    stream: bool = Field(default=False, description="Stream results as they complete.")
    concurrent_limit: int = Field(default=3, description="Maximum concurrent crawls.")

class PdfExportParams(BaseModel):
    url: str = Field(description="The URL to export as PDF.")
    return_as_base64: bool = Field(default=True, description="Return PDF as base64 string.")

class ScreenshotParams(BaseModel):
    url: str = Field(description="The URL to capture screenshot.")
    full_page: bool = Field(default=True, description="Whether to capture full page.")
    return_as_base64: bool = Field(default=True, description="Return screenshot as base64 string.")
    quality: int = Field(default=70, ge=10, le=100, description="JPEG quality for screenshot (10-100).")
    max_width: int = Field(default=1920, description="Maximum width for screenshot.")
    max_height: int = Field(default=5000, description="Maximum height for screenshot.")

class Crawl4AIInput(BaseModel):
    mode: Literal['scrape', 'crawl', 'deep_crawl', 'extract', 'batch_crawl', 'pdf_export', 'screenshot'] = Field(
        description="The Crawl4AI function to execute."
    )
    parameters: Dict[str, Any] = Field(
        description="Parameters for the selected mode, matching the respective schema."
    )

class ScreenshotCompressor:
    """截图压缩器 - 保持原有结构但不实际使用"""
    
    @staticmethod
    def compress_screenshot(base64_data: str, quality: int = 70, max_width: int = 1920, max_height: int = 5000) -> str:
        """轻量版不处理截图，直接返回空字符串"""
        return ""

    @staticmethod
    def get_screenshot_info(base64_data: str) -> Dict[str, Any]:
        """轻量版不处理截图信息"""
        return {"error": "轻量版不支持截图功能"}

# 3. 完全兼容的轻量级 Crawl4AI 工具类
class EnhancedCrawl4AITool:
    name = "crawl4ai"
    description = (
        "轻量级网页抓取工具，专为低内存环境优化。支持文本内容提取，自动处理内存限制和网络错误。"
    )
    input_schema = Crawl4AIInput

    def __init__(self):
        self.crawler = None
        self._initialized = False
        self._memory_threshold = 85  # 提高内存阈值
        self._max_memory_mb = 800   # 降低内存限制
        self._browser_start_time = None
        self._max_browser_uptime = 600  # 10分钟重启
        self.compressor = ScreenshotCompressor()
        logger.info("轻量级 Crawl4AI 工具实例创建")

    async def _check_memory_health(self) -> bool:
        """简化内存检查"""
        try:
            memory = psutil.virtual_memory()
            process = psutil.Process()
            process_memory_mb = process.memory_info().rss / 1024 / 1024
            
            logger.info(f"内存状态 - 系统: {memory.percent}%, 进程: {process_memory_mb:.1f}MB")
            
            if memory.percent > 95:
                logger.warning(f"⚠️ 系统内存使用率过高: {memory.percent}%")
                return False
                
            if process_memory_mb > self._max_memory_mb:
                logger.warning(f"⚠️ 进程内存使用过高: {process_memory_mb:.1f}MB")
                return False
                
            if (self._browser_start_time and 
                time.time() - self._browser_start_time > self._max_browser_uptime):
                logger.warning("🕒 浏览器实例运行时间过长，需要重启")
                return False
                
            return True
            
        except Exception as e:
            logger.error(f"内存检查失败: {str(e)}")
            return True

    async def _get_memory_info(self) -> Dict[str, Any]:
        """获取内存信息"""
        try:
            memory = psutil.virtual_memory()
            process = psutil.Process()
            return {
                "system_memory_percent": memory.percent,
                "system_memory_used_mb": memory.used / 1024 / 1024,
                "system_memory_total_mb": memory.total / 1024 / 1024,
                "process_memory_mb": process.memory_info().rss / 1024 / 1024,
                "browser_uptime_seconds": time.time() - self._browser_start_time if self._browser_start_time else 0,
                "lightweight_mode": True
            }
        except Exception as e:
            logger.error(f"获取内存信息失败: {str(e)}")
            return {"error": str(e), "lightweight_mode": True}

    async def initialize(self):
        """轻量级初始化"""
        if not self._initialized:
            logger.info("🚀 初始化轻量级爬虫...")
            try:
                # 最简配置，最小化内存使用
                self.crawler = AsyncWebCrawler(
                    browser_type="chromium",
                    headless=True,
                    verbose=False,
                    browser_args=[
                        '--disable-dev-shm-usage',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--memory-pressure-off',
                        '--window-size=1024,768',
                        '--disable-extensions',
                        '--disable-plugins',
                        '--disable-background-networking',
                        '--disable-default-apps',
                        '--disable-translate',
                        '--disable-sync'
                    ]
                )
                await self.crawler.__aenter__()
                self._browser_start_time = time.time()
                self._initialized = True
                logger.info("✅ 轻量级爬虫初始化成功")
            except Exception as e:
                logger.error(f"❌ 轻量级爬虫初始化失败: {e}")
                self.crawler = None
                raise

    async def _restart_browser(self):
        """重启浏览器实例"""
        logger.info("🔄 重启浏览器实例...")
        try:
            if self.crawler:
                await self.crawler.__aexit__(None, None, None)
        except Exception as e:
            logger.error(f"关闭旧浏览器时出错: {e}")
        finally:
            self.crawler = None
            self._initialized = False
        
        gc.collect()
        await asyncio.sleep(2)
        
        try:
            await self.initialize()
            logger.info("✅ 浏览器重启成功")
        except Exception as e:
            logger.error(f"❌ 浏览器重启失败: {e}")

    async def _execute_with_timeout(self, coro, timeout: int = 30):
        """带超时的协程执行"""
        try:
            return await asyncio.wait_for(coro, timeout=timeout)
        except asyncio.TimeoutError:
            logger.error(f"⏰ 操作超时 ({timeout}秒)")
            raise
        except Exception as e:
            logger.error(f"❌ 操作执行失败: {str(e)}")
            raise

    async def _scrape_single_url(self, params: ScrapeParams) -> Dict[str, Any]:
        """抓取单个URL - 轻量级版本"""
        # 内存检查
        if not await self._check_memory_health():
            return {
                "success": False, 
                "error": "系统内存不足，无法执行爬取任务",
                "suggestion": "请稍后重试或使用 tavily_search 获取摘要信息",
                "memory_info": await self._get_memory_info()
            }

        try:
            await self.initialize()
            if self.crawler is None:
                return {
                    "success": False, 
                    "error": "浏览器实例未正确初始化",
                    "memory_info": await self._get_memory_info()
                }

            # 轻量级配置 - 只获取文本，禁用所有额外功能
            config_kwargs = {
                "cache_mode": CacheMode.BYPASS,
                "css_selector": params.css_selector,
                "exclude_external_links": params.exclude_external_links,
                "exclude_external_images": not params.include_images,
                "pdf": False,  # 轻量版禁用PDF
                "screenshot": False,  # 轻量版禁用截图
                "word_count_threshold": params.word_count_threshold,
                "remove_overlay_elements": True,
                "process_iframes": False,  # 禁用iframe处理以节省内存
                "remove_forms": True,
                "remove_scripts": True,
                "remove_styles": True
            }
            
            config = CrawlerRunConfig(**config_kwargs)
            
            logger.info(f"🌐 轻量抓取 URL: {params.url}")
            
            result = await self._execute_with_timeout(
                crawler.arun(url=params.url, config=config),
                timeout=30
            )
            
            content = getattr(result, 'markdown', '') or getattr(result, 'cleaned_html', '')
            if not result.success or not content.strip():
                error_message = result.error_message or "抓取成功但未能提取到任何有效文本内容。"
                logger.error(f"❌ 抓取失败 {params.url}: {error_message}")
                return {
                    "success": False, 
                    "error": f"抓取失败: {error_message}", 
                    "memory_info": await self._get_memory_info()
                }
            
            # 优化内容长度
            optimized_content = self._optimize_content(content)
            
            # 构建响应数据 - 保持原有结构但移除不支持的功能
            output_data = {
                "success": True,
                "url": params.url,
                "content": optimized_content,
                "cleaned_html": getattr(result, 'cleaned_html', ''),
                "metadata": {
                    "title": getattr(result, 'title', ''),
                    "description": getattr(result, 'description', ''),
                    "word_count": len(optimized_content),
                    "status_code": getattr(result, 'status_code', 200),
                    "lightweight_mode": True
                },
                "memory_info": await self._get_memory_info()
            }
            
            # 轻量版不包含链接信息
            output_data["links"] = {
                "internal": [],
                "external": []
            }
                
            # 轻量版不处理截图和PDF，但保持字段存在
            if params.return_screenshot:
                output_data["screenshot"] = {
                    "data": "",
                    "format": "base64",
                    "type": "image/jpeg",
                    "compression_info": {
                        "original": {"error": "轻量版不支持截图"},
                        "compressed": {"error": "轻量版不支持截图"}
                    },
                    "note": "轻量版不支持截图功能，请使用完整版"
                }
                
            if params.return_pdf:
                output_data["pdf"] = {
                    "data": "",
                    "format": "base64", 
                    "type": "application/pdf",
                    "size_bytes": 0,
                    "note": "轻量版不支持PDF导出，请使用完整版"
                }
                
            logger.info(f"✅ 成功抓取 {params.url}, 内容长度: {len(output_data['content'])}")
            return output_data
            
        except asyncio.TimeoutError:
            logger.error(f"⏰ 抓取操作超时: {params.url}")
            return {
                "success": False, 
                "error": "抓取操作超时（30秒）",
                "suggestion": "目标网站响应较慢，请尝试使用 tavily_search 获取摘要信息",
                "memory_info": await self._get_memory_info()
            }
        except Exception as e:
            logger.error(f"❌ _scrape_single_url 错误: {str(e)}")
            if "browser" in str(e).lower() or "context" in str(e).lower() or "NoneType" in str(e):
                await self._restart_browser()
            return {
                "success": False, 
                "error": f"抓取错误: {str(e)}",
                "suggestion": "请尝试使用 tavily_search 获取摘要信息",
                "memory_info": await self._get_memory_info()
            }

    def _optimize_content(self, content: str) -> str:
        """优化内容，移除冗余信息"""
        if not content or len(content) < 100:
            return content
            
        # 移除过长的内容
        if len(content) > 20000:
            content = content[:20000] + "\n\n[内容过长已优化...]"
            
        # 移除重复的空行
        import re
        content = re.sub(r'\n\s*\n', '\n\n', content)
        
        return content

    async def _deep_crawl_website(self, params: DeepCrawlParams) -> Dict[str, Any]:
        """深度爬取网站 - 轻量版降级为单页面抓取"""
        logger.info(f"🕷️ 轻量版深度爬取降级: {params.url}")
        
        # 深度爬取在轻量版中降级为单页面抓取
        scrape_params = ScrapeParams(url=params.url)
        result = await self._scrape_single_url(scrape_params)
        
        if result["success"]:
            return {
                "success": True,
                "crawled_pages": [
                    {
                        "url": params.url,
                        "title": result["metadata"]["title"],
                        "content": result["content"],
                        "depth": 1,
                        "score": 1.0,
                        "metadata": {
                            "word_count": len(result["content"]),
                        }
                    }
                ],
                "total_pages": 1,
                "summary": {
                    "start_url": params.url,
                    "max_depth": 1,
                    "strategy": "lightweight",
                    "pages_crawled": 1,
                    "note": "轻量版将深度爬取降级为单页面抓取"
                },
                "memory_info": await self._get_memory_info()
            }
        else:
            return {
                "success": False,
                "error": f"深度爬取降级失败: {result.get('error', '未知错误')}",
                "suggestion": "请使用 tavily_search 进行深度信息收集",
                "memory_info": await self._get_memory_info()
            }

    async def _batch_crawl_urls(self, params: BatchCrawlParams) -> Dict[str, Any]:
        """批量爬取多个URL - 轻量版限制数量"""
        logger.info(f"🔗 轻量版批量爬取 {len(params.urls)} 个URL")
        
        # 轻量版限制最多处理3个URL
        urls_to_process = params.urls[:3]
        crawled_results = []
        successful_crawls = 0
        
        for url in urls_to_process:
            scrape_params = ScrapeParams(url=url)
            result = await self._scrape_single_url(scrape_params)
            
            if result["success"]:
                page_data = {
                    "url": result["url"],
                    "title": result["metadata"]["title"],
                    "content": result["content"],
                    "metadata": {
                        "word_count": len(result["content"]),
                        "status_code": result["metadata"]["status_code"]
                    }
                }
                crawled_results.append(page_data)
                successful_crawls += 1
            else:
                crawled_results.append({
                    "url": url,
                    "error": result.get("error", "未知错误"),
                    "success": False
                })
                
            # 每个URL之间短暂延迟
            await asyncio.sleep(1)
        
        return {
            "success": True,
            "results": crawled_results,
            "summary": {
                "total_urls": len(params.urls),
                "successful_crawls": successful_crawls,
                "failed_crawls": len(params.urls) - successful_crawls,
                "success_rate": (successful_crawls / len(params.urls)) * 100 if params.urls else 0,
                "note": f"轻量版只处理了前{len(urls_to_process)}个URL"
            },
            "memory_info": await self._get_memory_info()
        }

    async def _extract_structured_data(self, params: ExtractParams) -> Dict[str, Any]:
        """提取结构化数据 - 轻量版降级为普通抓取"""
        logger.info(f"🔍 轻量版数据提取降级: {params.url}")
        
        # 结构化提取在轻量版中降级为普通抓取
        scrape_params = ScrapeParams(
            url=params.url,
            css_selector=params.css_selector
        )
        result = await self._scrape_single_url(scrape_params)
        
        if result["success"]:
            return {
                "success": True, 
                "url": params.url, 
                "extracted_data": {
                    "content": result["content"],
                    "note": "轻量版将结构化提取降级为普通文本抓取"
                },
                "metadata": {
                    "extraction_type": "lightweight_fallback",
                    "success": True
                },
                "memory_info": await self._get_memory_info()
            }
        else:
            return {
                "success": False, 
                "error": f"数据提取降级失败: {result.get('error', '未知错误')}",
                "suggestion": "请使用完整版 crawl4ai 进行结构化数据提取",
                "memory_info": await self._get_memory_info()
            }

    async def _export_pdf(self, params: PdfExportParams) -> Dict[str, Any]:
        """导出PDF - 轻量版不支持"""
        logger.info(f"📄 轻量版PDF导出不支持: {params.url}")
        
        return {
            "success": False,
            "error": "轻量版不支持PDF导出功能",
            "suggestion": "请使用完整版 crawl4ai 或直接访问网页获取内容",
            "memory_info": await self._get_memory_info()
        }

    async def _capture_screenshot(self, params: ScreenshotParams) -> Dict[str, Any]:
        """捕获截图 - 轻量版不支持"""
        logger.info(f"📸 轻量版截图捕获不支持: {params.url}")
        
        return {
            "success": False,
            "error": "轻量版不支持截图捕获功能",
            "suggestion": "请使用完整版 crawl4ai 进行截图",
            "memory_info": await self._get_memory_info()
        }

    async def execute(self, parameters: Crawl4AIInput) -> dict:
        """执行工具的主要方法 - 保持接口完全兼容"""
        try:
            mode = parameters.mode
            params = parameters.parameters

            logger.info(f"🚀 执行 Crawl4AI 轻量版模式: {mode}")

            # 内存检查
            if not await self._check_memory_health():
                return {
                    "success": False, 
                    "error": "系统内存不足，无法执行爬取任务",
                    "suggestion": "请稍后重试或使用 tavily_search 获取摘要信息",
                    "memory_info": await self._get_memory_info()
                }

            # 确保浏览器已初始化
            await self.initialize()

            if mode == 'scrape':
                validated_params = ScrapeParams(**params)
                result = await self._scrape_single_url(validated_params)
                
            elif mode == 'deep_crawl':
                validated_params = DeepCrawlParams(**params)
                result = await self._deep_crawl_website(validated_params)
                
            elif mode == 'batch_crawl':
                validated_params = BatchCrawlParams(**params)
                result = await self._batch_crawl_urls(validated_params)
                
            elif mode == 'extract':
                validated_params = ExtractParams(**params)
                result = await self._extract_structured_data(validated_params)
                
            elif mode == 'pdf_export':
                validated_params = PdfExportParams(**params)
                result = await self._export_pdf(validated_params)
                
            elif mode == 'screenshot':
                validated_params = ScreenshotParams(**params)
                result = await self._capture_screenshot(validated_params)
                
            else:
                logger.error(f"❌ 无效的模式请求: {mode}")
                return {
                    "success": False, 
                    "error": f"无效的模式 '{mode}'.",
                    "memory_info": await self._get_memory_info()
                }

            return result

        except Exception as e:
            logger.error(f"❌ Crawl4AI 轻量版工具执行错误: {str(e)}")
            return {
                "success": False, 
                "error": f"发生错误: {str(e)}",
                "suggestion": "请尝试使用 tavily_search 获取摘要信息",
                "memory_info": await self._get_memory_info()
            }

    async def cleanup(self):
        """清理资源"""
        if self.crawler:
            try:
                logger.info("🔚 关闭轻量级爬虫实例...")
                await self.crawler.__aexit__(None, None, None)
                self.crawler = None
                self._initialized = False
                self._browser_start_time = None
                
                gc.collect()
                logger.info("✅ 轻量级爬虫实例关闭成功")
            except Exception as e:
                logger.error(f"❌ 关闭轻量级爬虫时出错: {str(e)}")
                self.crawler = None
                self._initialized = False