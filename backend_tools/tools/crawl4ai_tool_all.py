import asyncio
import base64
import io
import gc
import psutil
import time
import json
from typing import Dict, Any, List, Optional, Literal
import random
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

# 1. 扩展输入模型以支持新功能
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
    max_depth: int = Field(default=3, description="Maximum crawl depth. (从 2 增加到 3)")
    max_pages: int = Field(default=80, description="Maximum pages to crawl. (从 50 增加到 80)")
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
    concurrent_limit: int = Field(default=4, description="Maximum concurrent crawls.")

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

# 2. 扩展总的工具输入模型
class Crawl4AIInput(BaseModel):
    mode: Literal['scrape', 'crawl', 'deep_crawl', 'extract', 'batch_crawl', 'pdf_export', 'screenshot'] = Field(
        description="The Crawl4AI function to execute."
    )
    parameters: Dict[str, Any] = Field(
        description="Parameters for the selected mode, matching the respective schema."
    )

class ScreenshotCompressor:
    """截图压缩器"""
    
    @staticmethod
    def compress_screenshot(base64_data: str, quality: int = 70, max_width: int = 1920, max_height: int = 5000) -> str:
        """压缩base64格式的截图"""
        try:
            image_data = base64.b64decode(base64_data)
            
            with Image.open(io.BytesIO(image_data)) as img:
                original_format = img.format
                original_size = img.size
                
                if img.size[0] > max_width or img.size[1] > max_height:
                    img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
                    logger.info(f"Resized screenshot from {original_size} to {img.size}")
                
                if img.mode in ('RGBA', 'LA'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    background.paste(img, mask=img.split()[-1])
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')
                
                output_buffer = io.BytesIO()
                img.save(output_buffer, format='JPEG', quality=quality, optimize=True)
                compressed_data = output_buffer.getvalue()
                
                compressed_base64 = base64.b64encode(compressed_data).decode('utf-8')
                
                original_size_kb = len(image_data) // 1024
                compressed_size_kb = len(compressed_data) // 1024
                compression_ratio = (1 - len(compressed_data) / len(image_data)) * 100
                
                logger.info(f"Screenshot compressed: {original_size_kb}KB -> {compressed_size_kb}KB "
                           f"({compression_ratio:.1f}% reduction)")
                
                return compressed_base64
                
        except Exception as e:
            logger.error(f"Screenshot compression failed: {str(e)}")
            return base64_data

    @staticmethod
    def get_screenshot_info(base64_data: str) -> Dict[str, Any]:
        """获取截图信息"""
        try:
            image_data = base64.b64decode(base64_data)
            with Image.open(io.BytesIO(image_data)) as img:
                return {
                    "format": img.format,
                    "size": img.size,
                    "mode": img.mode,
                    "data_size_kb": len(image_data) // 1024
                }
        except Exception as e:
            logger.error(f"Failed to get screenshot info: {str(e)}")
            return {"error": str(e)}

# 3. 优化内存管理的 Crawl4AI 工具类
class EnhancedCrawl4AITool:
    name = "crawl4ai"
    description = (
        "A powerful open-source tool to scrape, crawl, extract structured data, export PDFs, and capture screenshots from web pages. "
        "Supports deep crawling with multiple strategies (BFS, DFS, BestFirst), batch URL processing, AI-powered extraction, "
        "and advanced content filtering. All outputs are returned as memory streams (base64 for binary data)."
    )
    input_schema = Crawl4AIInput

    def __init__(self):
        self.crawler = None
        self._initialized = False
        self._task_count = 0
        self._cleanup_interval = 10  # 延长清理间隔 (从 5 增加到 10)
        self._memory_threshold = 80  # 提高内存阈值
        self._max_memory_mb = 6000   # 增加内存限制 (从 1500 提升至 6000MB)
        self._browser_start_time = None
        self._max_browser_uptime = 1800 # 延长浏览器最大运行时间 (从 1200 增加到 1800)
        self._last_memory_check = 0
        self._memory_check_interval = 90 # 延长内存检查间隔 (从 60 增加到 90秒)
        self._browser_lock = asyncio.Lock()
        self.compressor = ScreenshotCompressor()
        logger.info("EnhancedCrawl4AITool instance created")

    async def _check_memory_health(self) -> bool:
        """检查系统内存健康状态 - 优化版本"""
        current_time = time.time()
        
        # 减少内存检查频率
        if current_time - self._last_memory_check < self._memory_check_interval:
            return True
            
        self._last_memory_check = current_time
        
        try:
            memory = psutil.virtual_memory()
            process = psutil.Process()
            process_memory_mb = process.memory_info().rss / 1024 / 1024
            
            logger.info(f"内存状态 - 系统: {memory.percent}%, 进程: {process_memory_mb:.1f}MB")
            
            # 只有在内存使用率非常高时才进行清理
            if memory.percent > 95:  # 紧急情况阈值
                logger.warning(f"⚠️ 系统内存使用率过高: {memory.percent}%")
                return False
                
            if process_memory_mb > self._max_memory_mb:
                logger.warning(f"⚠️ 进程内存使用过高: {process_memory_mb:.1f}MB")
                return False
                
            if (self._browser_start_time and 
                current_time - self._browser_start_time > self._max_browser_uptime):
                logger.warning("🕒 浏览器实例运行时间过长")
                return False
                
            return True
            
        except Exception as e:
            logger.error(f"内存检查失败: {str(e)}")
            return True

    async def _get_system_memory_info(self) -> Dict[str, Any]:
        """获取系统内存信息"""
        try:
            memory = psutil.virtual_memory()
            process = psutil.Process()
            return {
                "system_memory_percent": memory.percent,
                "system_memory_used_mb": memory.used / 1024 / 1024,
                "system_memory_total_mb": memory.total / 1024 / 1024,
                "process_memory_mb": process.memory_info().rss / 1024 / 1024,
                "browser_uptime_seconds": time.time() - self._browser_start_time if self._browser_start_time else 0
            }
        except Exception as e:
            logger.error(f"获取内存信息失败: {str(e)}")
            return {"error": str(e)}

    async def initialize(self):
        """初始化浏览器实例"""
        async with self._browser_lock:
            if not self._initialized:
                logger.info("🚀 初始化 crawl4ai 浏览器...")
                await self._create_crawler()
                self._initialized = True
                logger.info("✅ crawl4ai 浏览器初始化成功")

    async def _create_crawler(self):
        """创建新的爬虫实例 - 升级版"""
        logger.info("🆕 创建新的 AsyncWebCrawler 实例...")
        try:
            # 增强浏览器参数，提升反爬能力
            browser_args = [
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--memory-pressure-off',
                '--window-size=1280,720',
                # 新增反爬参数
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-web-security',
                '--disable-site-isolation-trials',
                '--disable-3d-apis',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-component-extensions-with-background-pages',
                '--disable-domain-reliability',
                '--disable-extensions',
                '--disable-features=AudioServiceOutOfProcess',
                '--disable-hang-monitor',
                '--disable-ipc-flooding-protection',
                '--disable-notifications',
                '--disable-renderer-backgrounding',
                '--disable-sync',
                '--force-color-profile=srgb',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--no-pings',
                '--password-store=basic',
                '--use-mock-keychain',
                '--disable-popup-blocking',
                '--disable-default-apps',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-speech-api',
                '--hide-scrollbars',
                '--disable-logging',
                '--disable-dev-tools',
            ]
            
            # 随机User-Agent和Viewport
            user_agents = [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            ]
            
            self.crawler = AsyncWebCrawler(
                browser_type="chromium",
                headless=True,
                verbose=False,
                browser_args=browser_args,
                # 新增随机化配置
                user_agent=random.choice(user_agents),
                viewport={"width": random.randint(1280, 1920),
                         "height": random.randint(720, 1080)},
                # 增强JS执行环境
                java_script_enabled=True,
                ignore_https_errors=True,
                # 启用隐身模式，减少指纹追踪
                incognito=True,
            )
            await self.crawler.__aenter__()
            self._browser_start_time = time.time()
            logger.info("✅ AsyncWebCrawler 实例创建并启动（增强模式）")
        except Exception as e:
            logger.error(f"❌ 创建爬虫实例失败: {e}")
            self.crawler = None
            raise

    async def _get_crawler(self):
        """获取爬虫实例，确保不为None"""
        async with self._browser_lock:
            if self.crawler is None:
                logger.warning("🔄 爬虫实例为None，重新创建...")
                await self._create_crawler()
            return self.crawler

    async def _handle_browser_crash(self, error: Exception):
        """处理浏览器崩溃"""
        logger.error(f"🔄 浏览器崩溃，尝试恢复: {str(error)}")
        async with self._browser_lock:
            if self.crawler:
                try:
                    await self.crawler.__aexit__(None, None, None)
                except:
                    pass
            self.crawler = None
            self._initialized = False
            self._browser_start_time = None
        
        gc.collect()
        await asyncio.sleep(2)
        
        try:
            await self.initialize()
            logger.info("✅ 浏览器崩溃恢复成功")
        except Exception as e:
            logger.error(f"❌ 浏览器崩溃恢复失败: {e}")
            raise

    async def _cleanup_after_task(self):
        """任务后清理页面资源 - 优化版本"""
        try:
            # ✅ 1. 主动清理：每次都尝试关闭多余页面
            crawler = await self._get_crawler()
            if crawler and hasattr(crawler, 'browser') and crawler.browser and crawler.browser.is_connected():
                try:
                    pages = await crawler.browser.pages()
                    # 保留第一个页面（通常是 about:blank），关闭其他所有页面
                    if len(pages) > 1:
                        for page in pages[1:]:
                            await page.close()
                except Exception as e:
                    logger.warning(f"清理页面时出错: {e}")

            # ✅ 2. 定期深度检查：达到清理间隔时才检查内存
            if self._task_count % self._cleanup_interval == 0:
                if not await self._check_memory_health():
                    logger.warning("内存健康检查失败，执行强制清理。")
                    await self._force_memory_cleanup()
            
            gc.collect()
            
        except Exception as e:
            logger.warning(f"任务后清理出现警告: {e}")

    async def _force_memory_cleanup(self):
        """强制内存清理 - 重启浏览器实例"""
        async with self._browser_lock:
            if self.crawler:
                logger.info("🔄 执行强制内存清理 - 重启浏览器实例")
                try:
                    await self.crawler.__aexit__(None, None, None)
                except Exception as e:
                    logger.error(f"关闭旧浏览器实例时出错: {e}")
                finally:
                    self.crawler = None
                    self._initialized = False
                    self._browser_start_time = None
            
            gc.collect()
            await asyncio.sleep(1) # 短暂等待资源释放
            
            # ✅ 3. 重建实例：清理后立即重建，确保下一次调用可用
            try:
                await self.initialize()
                logger.info("✅ 浏览器实例重启完成")
            except Exception as e:
                logger.error(f"❌ 重启浏览器实例失败: {e}")

    async def _execute_with_timeout(self, coro, timeout: int = 60):
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
        """抓取单个URL - 使用文档推荐的最佳实践"""
        try:
            crawler = await self._get_crawler()
            if crawler is None:
                return {
                    "success": False, 
                    "error": "浏览器实例未正确初始化",
                    "memory_info": await self._get_system_memory_info()
                }
            
            # 使用文档推荐的 CrawlerRunConfig 配置
            config_kwargs = {
                "cache_mode": CacheMode.BYPASS,
                "css_selector": params.css_selector,
                "exclude_external_links": params.exclude_external_links,
                "exclude_external_images": not params.include_images,
                "pdf": params.return_pdf,
                "screenshot": params.return_screenshot,
                "word_count_threshold": params.word_count_threshold,
                "remove_overlay_elements": True,
                "process_iframes": True
            }
            
            config = CrawlerRunConfig(**config_kwargs)
            
            logger.info(f"🌐 抓取 URL: {params.url}")
            
            result = await self._execute_with_timeout(
                crawler.arun(url=params.url, config=config),
                timeout=90 # 缩短超时时间至 90 秒，以避免 Cloudflare 524 错误
            )
            
            # 🎯 核心修复：增加对结果和内容的双重检查
            content = getattr(result, 'markdown', '') or getattr(result, 'cleaned_html', '')
            if not result.success or not content.strip():
                error_message = result.error_message or "抓取成功但未能提取到任何有效文本内容。"
                logger.error(f"❌ 抓取失败 {params.url}: {error_message}")
                return {"success": False, "error": f"抓取失败: {error_message}", "memory_info": await self._get_system_memory_info()}
            
            # 构建响应数据
            output_data = {
                "success": True,
                "url": params.url,
                "content": content, # 使用已校验的内容
                "cleaned_html": getattr(result, 'cleaned_html', ''),
                "metadata": {
                    "title": getattr(result, 'title', ''),
                    "description": getattr(result, 'description', ''),
                    "word_count": len(content),
                    "status_code": getattr(result, 'status_code', 200)
                },
                "memory_info": await self._get_system_memory_info()
            }
            
            # 添加链接信息
            if hasattr(result, 'links'):
                output_data["links"] = {
                    "internal": getattr(result, 'internal_links', []),
                    "external": getattr(result, 'external_links', [])
                }
                
            # 添加截图（带压缩）
            if params.return_screenshot and hasattr(result, 'screenshot') and result.screenshot:
                compressed_screenshot = self.compressor.compress_screenshot(
                    result.screenshot,
                    quality=params.screenshot_quality,
                    max_width=params.screenshot_max_width
                )
                
                original_info = self.compressor.get_screenshot_info(result.screenshot)
                compressed_info = self.compressor.get_screenshot_info(compressed_screenshot)
                
                output_data["screenshot"] = {
                    "data": compressed_screenshot,
                    "format": "base64",
                    "type": "image/jpeg",
                    "compression_info": {
                        "original": original_info,
                        "compressed": compressed_info
                    }
                }
                
            # 添加PDF
            if params.return_pdf and hasattr(result, 'pdf') and result.pdf:
                pdf_base64 = base64.b64encode(result.pdf).decode('utf-8')
                output_data["pdf"] = {
                    "data": pdf_base64,
                    "format": "base64",
                    "type": "application/pdf",
                    "size_bytes": len(result.pdf)
                }
                
            logger.info(f"✅ 成功抓取 {params.url}, 内容长度: {len(output_data['content'])}")
            return output_data
            
        except asyncio.TimeoutError:
            logger.error(f"⏰ 抓取操作超时: {params.url}")
            return {
                "success": False,
                "error": "抓取操作超时（90秒）",
                "memory_info": await self._get_system_memory_info()
            }
        except Exception as e:
            logger.error(f"❌ _scrape_single_url 错误: {str(e)}")
            if "browser" in str(e).lower() or "context" in str(e).lower() or "NoneType" in str(e):
                await self._handle_browser_crash(e)
            return {
                "success": False, 
                "error": f"抓取错误: {str(e)}",
                "memory_info": await self._get_system_memory_info()
            }
        finally:
            await self._cleanup_after_task()

    async def _deep_crawl_website(self, params: DeepCrawlParams) -> Dict[str, Any]:
        """深度爬取网站 - 修复Context错误版本"""
        logger.info(f"🕷️ 开始深度网站爬取: {params.url}, 深度: {params.max_depth}, 最大页面: {params.max_pages}")
        
        try:
            crawler = await self._get_crawler()
            if crawler is None:
                return {
                    "success": False, 
                    "error": "浏览器实例未正确初始化",
                    "memory_info": await self._get_system_memory_info()
                }
            
            # 根据策略选择深度爬取方法
            if params.strategy == 'bfs':
                deep_crawl_strategy = BFSDeepCrawlStrategy(
                    max_depth=params.max_depth,
                    include_external=params.include_external,
                    max_pages=params.max_pages
                )
            elif params.strategy == 'dfs':
                deep_crawl_strategy = DFSDeepCrawlStrategy(
                    max_depth=params.max_depth,
                    include_external=params.include_external,
                    max_pages=params.max_pages
                )
            elif params.strategy == 'best_first':
                # 为BestFirst策略添加关键词评分器
                scorer = None
                if params.keywords:
                    scorer = KeywordRelevanceScorer(
                        keywords=params.keywords,
                        weight=0.7
                    )
                
                deep_crawl_strategy = BestFirstCrawlingStrategy(
                    max_depth=params.max_depth,
                    include_external=params.include_external,
                    max_pages=params.max_pages,
                    url_scorer=scorer
                )
            else:
                deep_crawl_strategy = BFSDeepCrawlStrategy(
                    max_depth=params.max_depth,
                    include_external=params.include_external,
                    max_pages=params.max_pages
                )
            
            # 构建过滤器链（如果提供了URL模式）
            filter_chain = None
            if params.url_patterns:
                url_filter = URLPatternFilter(patterns=params.url_patterns)
                filter_chain = FilterChain([url_filter])
                deep_crawl_strategy.filter_chain = filter_chain
            
            # 🎯 强制启用流式模式，以便在爬取过程中发送进度更新，避免 Cloudflare 524 错误
            config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                deep_crawl_strategy=deep_crawl_strategy,
                scraping_strategy=LXMLWebScrapingStrategy(),
                stream=True,  # 强制流式
                verbose=False # 减少详细日志
            )
            
            crawled_pages = []
            total_pages = 0
            progress_report_count = 0
            start_time = time.time()
            
            # 🎯 发送开始进度
            logger.info(f"DeepCrawl Started: {params.url}")
            
            # 🎯 使用流式处理收集结果
            # 使用 _execute_with_timeout 包装 arun，以确保整个流式操作在 400 秒内完成
            try:
                # 🔥 核心修复：捕获ContextVar错误
                async for result in await self._execute_with_timeout(
                    crawler.arun(params.url, config=config),
                    timeout=400
                ):
                    if result.success:
                        page_data = {
                            "url": result.url,
                            "title": getattr(result, 'title', ''),
                            "content": getattr(result, 'markdown', ''),
                            "depth": result.metadata.get('depth', 0),
                            "score": result.metadata.get('score', 0),
                            "metadata": {
                                "word_count": len(getattr(result, 'markdown', '')),
                            }
                        }
                        crawled_pages.append(page_data)
                        total_pages += 1
                        progress_report_count += 1
                        
                        # 🎯 定期发送进度心跳（每2个页面或每30秒）
                        current_time = time.time()
                        if progress_report_count % 2 == 0 or (current_time - start_time) > 30:
                            elapsed = current_time - start_time
                            logger.info(f"DeepCrawl Progress: Crawled {total_pages} pages in {elapsed:.1f}s")
                            start_time = current_time  # 重置计时器
                        
                        # 安全限制
                        if total_pages >= params.max_pages:
                            logger.info(f"DeepCrawl Max Pages limit reached: {params.max_pages}")
                            break
                            
            except ValueError as e:
                if "was created in a different Context" in str(e):
                    logger.warning(f"⚠️ 捕获到Crawl4AI内部Context错误，已成功获取{total_pages}个页面")
                    # 不抛出异常，返回已收集的结果
                else:
                    raise e
            except Exception as e:
                # 其他异常正常处理
                logger.error(f"深度爬取迭代错误: {str(e)}")
                raise
            
            logger.info(f"✅ DeepCrawl Completed: {total_pages} pages")
            
            return {
                "success": True,
                "crawled_pages": crawled_pages,
                "total_pages": total_pages,
                "summary": {
                    "start_url": params.url,
                    "max_depth": params.max_depth,
                    "strategy": params.strategy,
                    "pages_crawled": total_pages
                },
                "memory_info": await self._get_system_memory_info()
            }
            
        except asyncio.TimeoutError:
            logger.warning(f"⏰ DeepCrawl Timeout, returning {total_pages} pages as partial result.")
            return {
                "success": True, # 即使超时，也返回部分结果
                "error": f"深度爬取操作超时（400秒），返回部分结果 ({total_pages} 页)",
                "crawled_pages": crawled_pages,
                "total_pages": total_pages,
                "partial_result": True,
                "memory_info": await self._get_system_memory_info()
            }
        except Exception as e:
            logger.error(f"❌ 深度爬取错误: {str(e)}")
            if "browser" in str(e).lower() or "context" in str(e).lower() or "NoneType" in str(e):
                await self._handle_browser_crash(e)
            return {
                "success": False, 
                "error": f"深度爬取错误: {str(e)}",
                "memory_info": await self._get_system_memory_info()
            }
        finally:
            await self._cleanup_after_task()

    async def _batch_crawl_urls(self, params: BatchCrawlParams) -> Dict[str, Any]:
        """批量爬取多个URL - 优化版本"""
        logger.info(f"🔗 开始批量爬取 {len(params.urls)} 个URL")
        
        # 🎯 整体超时控制
        start_time = time.time()
        overall_timeout = 300  # 5分钟整体超时
        
        try:
            crawler = await self._get_crawler()
            if crawler is None:
                return {
                    "success": False,
                    "error": "浏览器实例未正确初始化",
                    "memory_info": await self._get_system_memory_info()
                }
            
            # 🎯 强制启用流式模式，并使用 arun_many 进行真正的批量处理
            config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                word_count_threshold=10,
                stream=True # 强制流式
            )
            
            crawled_results = []
            successful_crawls = 0
            progress_counter = 0
            
            # 🎯 发送开始进度
            logger.info(f"BatchCrawl Started: {len(params.urls)} URLs")
            
            # 🎯 使用 arun_many 进行批量流式处理
            # 🎯 安全限制：并发数不超过 4，以保证服务器稳定性
            async for result in await crawler.arun_many(
                urls=params.urls,
                config=config,
                concurrent_limit=min(params.concurrent_limit, 4)
            ):
                progress_counter += 1
                
                # 🎯 检查整体超时
                current_time = time.time()
                elapsed = current_time - start_time
                if elapsed > overall_timeout:
                    logger.warning(f"⏰ BatchCrawl overall timeout after {overall_timeout}s. Returning partial results.")
                    break
                
                if result.success:
                    page_data = {
                        "url": result.url,
                        "title": getattr(result, 'title', ''),
                        "content": getattr(result, 'markdown', ''),
                        "metadata": {
                            "word_count": len(getattr(result, 'markdown', '')),
                            "status_code": getattr(result, 'status_code', 200)
                        }
                    }
                    crawled_results.append(page_data)
                    successful_crawls += 1
                else:
                    crawled_results.append({
                        "url": result.url,
                        "error": result.error_message or "Unknown error during crawl",
                        "success": False
                    })
                
                # 🎯 每个URL处理后发送进度心跳
                logger.info(f"BatchCrawl Progress: {progress_counter}/{len(params.urls)} URLs processed in {elapsed:.1f}s")
                
                # 安全限制
                if progress_counter >= 20:
                    logger.info(f"BatchCrawl Max Pages limit reached: 20")
                    break
            
            logger.info(f"✅ BatchCrawl Completed: {successful_crawls}/{len(params.urls)} successful")
            
            # 确定最终成功状态
            final_success = True
            final_error = None
            if elapsed > overall_timeout:
                final_success = False
                final_error = f"批量爬取操作超时（{overall_timeout}秒），返回部分结果 ({successful_crawls} 成功)"
            
            return {
                "success": final_success,
                "error": final_error,
                "results": crawled_results,
                "summary": {
                    "total_urls": len(params.urls),
                    "successful_crawls": successful_crawls,
                    "failed_crawls": len(params.urls) - successful_crawls,
                    "success_rate": (successful_crawls / len(params.urls)) * 100 if params.urls else 0
                },
                "memory_info": await self._get_system_memory_info()
            }
            
        except Exception as e:
            logger.error(f"❌ 批量爬取错误: {str(e)}")
            if "browser" in str(e).lower() or "context" in str(e).lower() or "NoneType" in str(e):
                await self._handle_browser_crash(e)
            return {
                "success": False,
                "error": f"批量爬取错误: {str(e)}",
                "memory_info": await self._get_system_memory_info()
            }
        finally:
            await self._cleanup_after_task()

    async def _extract_structured_data(self, params: ExtractParams) -> Dict[str, Any]:
        """提取结构化数据 - 最终修复版（使用正确的非流式处理）"""
        logger.info(f"🔍 从页面提取结构化数据: {params.url}, 类型: {params.extraction_type}")
        
        try:
            crawler = await self._get_crawler()
            if crawler is None:
                return {"success": False, "error": "浏览器实例未正确初始化", "memory_info": await self._get_system_memory_info()}
            
            # 🔥 核心修复：为 extract 模式特别处理 schema
            schema = params.schema_definition.copy()
            
            # 自动修复常见的 schema 格式问题
            if params.extraction_type == 'css':
                # 如果 schema 是数组格式，转换为对象格式
                if isinstance(schema, list):
                    schema = {
                        "name": "ExtractedData",
                        "baseSelector": params.css_selector or "body",
                        "fields": schema
                    }
                    logger.info(f"🔧 自动转换数组格式 schema 为对象格式")
                
                # 确保有必要的字段
                if not isinstance(schema, dict):
                    schema = {"fields": []} if schema is None else schema
                
                if 'name' not in schema:
                    schema['name'] = "ExtractedData"
                
                if 'baseSelector' not in schema:
                    schema['baseSelector'] = params.css_selector or "body"
                    logger.info(f"🔧 自动添加 baseSelector: {schema['baseSelector']}")
                
                if 'fields' not in schema or not schema['fields']:
                    schema['fields'] = [
                        {
                            "name": "content",
                            "selector": schema['baseSelector'],
                            "type": "text",
                            "multiple": True
                        }
                    ]
                    logger.info(f"🔧 自动添加默认 fields")
            
            # 🎯 核心配置：extract 模式使用非流式调用
            config_kwargs = {
                "cache_mode": CacheMode.BYPASS,
                "word_count_threshold": 0,
                "excluded_tags": [],
                "remove_forms": False,
                "remove_overlay_elements": False,
                "css_selector": params.css_selector or 'body',
                "stream": False,  # 🔥 关键：extract 使用非流式
            }
            
            # 配置提取策略
            if params.extraction_type == 'css':
                try:
                    extraction_strategy = JsonCssExtractionStrategy(schema=schema)
                    config_kwargs["extraction_strategy"] = extraction_strategy
                except Exception as e:
                    logger.error(f"❌ 创建 CSS 提取策略失败: {e}")
                    return {
                        "success": False,
                        "error": f"创建提取策略失败: {str(e)}",
                        "memory_info": await self._get_system_memory_info()
                    }
                    
            elif params.extraction_type == 'llm':
                logger.warning("⚠️ LLM 提取模式需要有效的 LLM 实例")
                try:
                    extraction_strategy = LLMExtractionStrategy(
                        schema=schema,
                        instruction=params.prompt or "Extract structured data from the content",
                        llm=None  # 需要实际的 LLM 实例
                    )
                    config_kwargs["extraction_strategy"] = extraction_strategy
                except Exception as e:
                    logger.error(f"❌ 创建 LLM 提取策略失败: {e}")
                    return {
                        "success": False,
                        "error": f"创建 LLM 提取策略失败: {str(e)}",
                        "memory_info": await self._get_system_memory_info()
                    }
            
            config = CrawlerRunConfig(**config_kwargs)
            
            logger.info(f"🚀 开始数据提取: {params.url}")
            logger.info(f"📋 Schema 配置: {json.dumps(schema, ensure_ascii=False)[:500]}...")
            
            # 🎯 核心修复：使用非流式调用，获取单个结果
            try:
                result = await self._execute_with_timeout(
                    crawler.arun(url=params.url, config=config),
                    timeout=90  # extract 模式不需要太长时间
                )
            except asyncio.TimeoutError:
                logger.warning(f"⏰ Extract Timeout for {params.url}")
                return {
                    "success": False,
                    "error": "数据提取超时（90秒）",
                    "memory_info": await self._get_system_memory_info()
                }
            
            # 处理结果
            if not result.success:
                error_msg = result.error_message or "提取失败，未知原因"
                logger.error(f"❌ 数据提取失败: {params.url} - {error_msg}")
                return {
                    "success": False,
                    "error": f"数据提取失败: {error_msg}",
                    "memory_info": await self._get_system_memory_info()
                }
            
            # 检查提取的内容
            extracted_data = None
            if hasattr(result, 'extracted_content') and result.extracted_content:
                try:
                    # 尝试解析为 JSON
                    extracted_data = json.loads(result.extracted_content)
                    logger.info(f"✅ 成功提取结构化数据，格式: JSON")
                except (json.JSONDecodeError, TypeError):
                    # 如果不是 JSON，保留原始格式
                    extracted_data = result.extracted_content
                    logger.info(f"✅ 成功提取数据，格式: {type(extracted_data).__name__}")
            else:
                # 如果没有 extracted_content，尝试从 markdown 或 cleaned_html 中提取
                content = getattr(result, 'markdown', '') or getattr(result, 'cleaned_html', '')
                if content:
                    extracted_data = {
                        "raw_content": content[:1000] + "..." if len(content) > 1000 else content,
                        "note": "未使用提取策略，返回原始内容"
                    }
                    logger.info(f"⚠️ 未找到提取内容，返回原始内容片段")
            
            if extracted_data is None:
                error_msg = "未能提取到任何内容。可能的原因：1) 页面结构不匹配 schema，2) 页面需要 JavaScript 渲染，3) 提取策略配置错误"
                logger.error(f"❌ 数据提取无结果: {params.url} - {error_msg}")
                return {
                    "success": False,
                    "error": error_msg,
                    "memory_info": await self._get_system_memory_info()
                }
            
            logger.info(f"✅ Extract 成功: {params.url}")
            
            return {
                "success": True,
                "url": params.url,
                "extracted_data": extracted_data,
                "metadata": {
                    "extraction_type": params.extraction_type,
                    "schema_used": schema,
                    "success": True
                },
                "memory_info": await self._get_system_memory_info()
            }
            
        except Exception as e:
            logger.error(f"❌ 数据提取时发生意外错误: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": f"数据提取时发生意外错误: {str(e)}",
                "memory_info": await self._get_system_memory_info()
            }
        finally:
            await self._cleanup_after_task()

    async def _export_pdf(self, params: PdfExportParams) -> Dict[str, Any]:
        """导出PDF为base64"""
        try:
            crawler = await self._get_crawler()
            if crawler is None:
                return {
                    "success": False, 
                    "error": "浏览器实例未正确初始化",
                    "memory_info": await self._get_system_memory_info()
                }
            
            logger.info(f"📄 导出PDF: {params.url}")
            config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                pdf=True
            )
            
            result = await self._execute_with_timeout(
                crawler.arun(url=params.url, config=config),
                timeout=90 # 缩短超时时间至 90 秒，以避免 Cloudflare 524 错误
            )
            
            if not result.success or not result.pdf:
                logger.error(f"❌ PDF导出失败: {params.url}")
                return {
                    "success": False, 
                    "error": "PDF导出失败",
                    "memory_info": await self._get_system_memory_info()
                }
            
            if params.return_as_base64:
                pdf_base64 = base64.b64encode(result.pdf).decode('utf-8')
                return {
                    "success": True,
                    "url": params.url,
                    "pdf_data": pdf_base64,
                    "format": "base64",
                    "type": "application/pdf",
                    "size_bytes": len(result.pdf),
                    "message": "PDF成功导出为base64字符串",
                    "memory_info": await self._get_system_memory_info()
                }
            else:
                return {
                    "success": True,
                    "url": params.url,
                    "size_bytes": len(result.pdf),
                    "message": "PDF数据以二进制格式提供",
                    "memory_info": await self._get_system_memory_info()
                }
        except asyncio.TimeoutError:
            return {
                "success": False, 
                "error": "PDF导出超时（120秒）",
                "memory_info": await self._get_system_memory_info()
            }
        except Exception as e:
            logger.error(f"❌ PDF导出错误: {str(e)}")
            if "browser" in str(e).lower() or "context" in str(e).lower() or "NoneType" in str(e):
                await self._handle_browser_crash(e)
            return {
                "success": False, 
                "error": f"PDF导出错误: {str(e)}",
                "memory_info": await self._get_system_memory_info()
            }
        finally:
            await self._cleanup_after_task()

    async def _capture_screenshot(self, params: ScreenshotParams) -> Dict[str, Any]:
        """捕获截图为base64（带压缩）"""
        try:
            crawler = await self._get_crawler()
            if crawler is None:
                return {
                    "success": False, 
                    "error": "浏览器实例未正确初始化",
                    "memory_info": await self._get_system_memory_info()
                }
            
            logger.info(f"📸 捕获截图: {params.url}")
            config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                screenshot=True
            )
            
            result = await self._execute_with_timeout(
                crawler.arun(url=params.url, config=config),
                timeout=120
            )
            
            if not result.success or not result.screenshot:
                logger.error(f"❌ 截图捕获失败: {params.url}")
                return {
                    "success": False, 
                    "error": "截图捕获失败",
                    "memory_info": await self._get_system_memory_info()
                }
            
            # 压缩截图
            compressed_screenshot = self.compressor.compress_screenshot(
                result.screenshot,
                quality=params.quality,
                max_width=params.max_width,
                max_height=params.max_height
            )
            
            # 获取压缩信息
            original_info = self.compressor.get_screenshot_info(result.screenshot)
            compressed_info = self.compressor.get_screenshot_info(compressed_screenshot)
            
            if params.return_as_base64:
                return {
                    "success": True,
                    "url": params.url,
                    "screenshot_data": compressed_screenshot,
                    "format": "base64", 
                    "type": "image/jpeg",
                    "size_bytes": len(base64.b64decode(compressed_screenshot)),
                    "compression_info": {
                        "original": original_info,
                        "compressed": compressed_info
                    },
                    "message": "截图成功捕获并压缩为base64字符串",
                    "memory_info": await self._get_system_memory_info()
                }
            else:
                return {
                    "success": True,
                    "url": params.url,
                    "size_bytes": len(base64.b64decode(compressed_screenshot)),
                    "compression_info": {
                        "original": original_info,
                        "compressed": compressed_info
                    },
                    "message": "截图数据以base64格式提供",
                    "memory_info": await self._get_system_memory_info()
                }
        except asyncio.TimeoutError:
            return {
                "success": False, 
                "error": "截图捕获超时（120秒）",
                "memory_info": await self._get_system_memory_info()
            }
        except Exception as e:
            logger.error(f"❌ 截图捕获错误: {str(e)}")
            if "browser" in str(e).lower() or "context" in str(e).lower() or "NoneType" in str(e):
                await self._handle_browser_crash(e)
            return {
                "success": False, 
                "error": f"截图捕获错误: {str(e)}",
                "memory_info": await self._get_system_memory_info()
            }
        finally:
            await self._cleanup_after_task()

    async def execute(self, parameters: Crawl4AIInput) -> dict:
        """执行工具的主要方法"""
        try:
            mode = parameters.mode
            params = parameters.parameters

            logger.info(f"🚀 执行 Crawl4AI 模式: {mode}")

            # 🔥 自动修复常见参数问题
            if mode == 'extract':
                # 修复 schema_definition 参数名
                if 'schema' in params and 'schema_definition' not in params:
                    params['schema_definition'] = params.pop('schema')
                    logger.info("🔧 自动修复: 将 'schema' 重命名为 'schema_definition'")
                
                # 确保有 url 参数
                if 'url' not in params:
                    # 尝试从其他位置获取
                    for key in ['target_url', 'page_url', 'source']:
                        if key in params:
                            params['url'] = params.pop(key)
                            logger.info(f"🔧 自动修复: 将 '{key}' 重命名为 'url'")
                            break
            
            elif mode == 'deep_crawl':
                # 修复 strategy 大小写问题
                if 'strategy' in params and isinstance(params['strategy'], str):
                    params['strategy'] = params['strategy'].lower()
                    logger.info(f"🔧 自动修复: strategy 转换为小写: {params['strategy']}")

            # 任务计数和定期强制清理
            self._task_count += 1

            # 只有在达到清理间隔时才执行内存检查
            if self._task_count % self._cleanup_interval == 0:
                memory_ok = await self._check_memory_health()
                if not memory_ok:
                    logger.warning("⚠️ 执行前内存检查失败，先执行清理")
                    await self._force_memory_cleanup()

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
                    "memory_info": await self._get_system_memory_info()
                }

            return result

        except Exception as e:
            logger.error(f"❌ Crawl4AI 工具执行错误: {str(e)}")
            return {
                "success": False, 
                "error": f"发生错误: {str(e)}",
                "memory_info": await self._get_system_memory_info()
            }

    async def cleanup(self):
        """清理资源"""
        async with self._browser_lock:
            if self.crawler:
                try:
                    logger.info("🔚 关闭 crawl4ai 浏览器实例...")
                    await self.crawler.__aexit__(None, None, None)
                    self.crawler = None
                    self._initialized = False
                    self._task_count = 0
                    self._browser_start_time = None
                    
                    collected = gc.collect()
                    logger.info(f"最终垃圾回收释放了 {collected} 个对象")
                    
                    logger.info("✅ crawl4ai 浏览器实例关闭成功")
                except Exception as e:
                    logger.error(f"❌ 关闭 crawl4ai 浏览器时出错: {str(e)}")
                    self.crawler = None
                    self._initialized = False
                    self._task_count = 0
                    self._browser_start_time = None