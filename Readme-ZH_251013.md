# CLAUDE.md - 深度研究代理中间件架构升级版（V2.1）

## 1. 项目概述

这是一个基于 **Cloudflare Workers** 构建的复杂 **AI 网关和 Web 应用程序**。它提供了一个单页前端应用，并作为多提供商 API 代理，为各种 AI 服务提供统一接口。

主要目标是提供与不同 AI 模型交互的统一接口，用于聊天补全、音频转录、翻译和图像生成等任务。

## 2. 核心架构与关键文件

`src` 目录是应用程序的核心，包含 Cloudflare Worker 后端和前端静态资源的所有源代码。其结构采用模块化设计，将功能组织到逻辑子目录中，以提高清晰度和可维护性。

### 2.1 后端 (Cloudflare Worker)

-   **入口点**: [`src/worker.js`](src/worker.js:1)
    -   这是 Cloudflare Worker 的主要入口点。它充当所有传入请求的中央路由器和协调器。
    -   **核心功能**: `worker.js` 中的 `fetch` 方法根据 URL 路径和请求方法将请求分派给专门的处理器函数。
    -   **路由逻辑**:
        -   **WebSocket 代理**: 处理 `Upgrade: websocket` 标头，用于与 `generativelanguage.googleapis.com`（Gemini 模型）进行实时通信，支持流式响应。
        -   **静态文件服务器**: 从 `src/static/` 提供前端资源，动态从 `env.__STATIC_CONTENT` KV 命名空间绑定中检索 `index.html` 和其他静态文件。
        -   **AI 网关 (API 代理)**: 将各种 API 请求路由到不同的下游 AI 服务提供商。这是与不同 AI 模型实现互操作性的关键组件。关键路由包括：
            -   `/chat/completions` 或 `/api/request`: 转发聊天补全和通用 AI 请求。
            -   `/api/transcribe-audio`: 处理音频转录请求，主要通过 SiliconFlow。
            -   `/api/translate`: 编排翻译任务，利用各种提供商的聊天补全端点。
            -   `/api/generate-image`: 管理图像生成请求，通常路由到 SiliconFlow。
            -   `/api/mcp-proxy`: 用于多云平台 (MCP) 工具调用的专用代理。它接收来自前端的工具调用请求（包含 `tool_name` 和 `parameters`），并将它们分派给特定的后端工具处理器。
        -   **历史 API**: 以 `/api/history/` 为前缀的路由管理用户聊天会话，包括保存、加载、固定、编辑标题和删除。它使用 Cloudflare KV 存储 (`env.GEMINICHAT_HISTORY_KV`) 进行持久化。一个显著特性是 `/api/history/generate-title`，它利用 Gemini 模型自动将聊天内容总结为标题。

### 2.1.1 MCP 工具处理器 (`src/mcp_proxy/handlers/`)

-   **[`tavily-search.js`](src/mcp_proxy/handlers/tavily-search.js)**:
    -   **职能**: 这是 `tavily_search` 工具的后端处理器。它从 `/api/mcp-proxy` 接收 `tool_name` 和 `parameters`，然后将请求转发到外部的 Python 工具集服务 (`https://tools.10110531.xyz/api/v1/execute_tool`) 以执行实际的 Tavily 搜索。
    -   **关键流程**: 构建包含 `tool_name` 和 `parameters` 的请求体，然后使用 `fetch` 将其发送到 Python API，并处理响应。

-   **[`python-sandbox.js`](src/mcp_proxy/handlers/python-sandbox.js)**:
    -   **职能**: 这是 `python_sandbox` 工具的后端处理器。它负责接收来自模型的代码执行请求，并将其安全地转发到外部独立的 Python 沙箱服务。
    -   **关键实现**: 此文件的核心是一个"永不崩溃"的参数解析器 (`parseWithRepair`)。由于 AI 模型有时会生成格式错误的 JSON 参数，此函数通过多层防御机制来确保健壮性：
        1.  **标准解析**: 尝试将输入作为标准 JSON 解析，并能处理多层嵌套的字符串化问题。
        2.  **正则救援**: 如果标准解析失败，它会使用正则表达式尝试从混乱的字符串中"抢救"出核心的 `code` 字段内容。
        3.  **安全回退**: 如果所有解析和救援尝试都失败，它会生成一个包含错误信息的 Python 代码对象返回给模型，而不是抛出异常。
    -   **设计目的**: 这种设计确保了 Cloudflare Worker 永远不会因为模型参数格式问题而崩溃，从而解决了导致模型陷入重试循环的根源问题。它将错误处理的循环限制在了前端和模型之间。

-   **[`firecrawl.js`](src/mcp_proxy/handlers/firecrawl.js)**:
    -   **职能**: 这是 `firecrawl` 工具的后端处理器。它接收来自 `/api/mcp-proxy` 的请求，验证 `mode` 和 `parameters`，然后将请求转发到外部的 Python 工具集服务 (`https://tools.10110531.xyz/api/v1/execute_tool`) 以执行实际的 Firecrawl 操作（如抓取、搜索或爬取）。
    -   **关键流程**: 验证输入参数，构建请求体，然后使用 `fetch` 将其发送到 Python API，并处理响应。

-   **[`stockfish.js`](src/mcp_proxy/handlers/stockfish.js)**:
    -   **职能**: 这是 `stockfish_analyzer` 工具的后端处理器。它接收来自 `/api/mcp-proxy` 的请求，验证 `fen` 和 `mode` 参数，然后将请求转发到外部的 Python 工具集服务 (`https://tools.10110531.xyz/api/v1/execute_tool`) 以执行 Stockfish 国际象棋引擎的分析。
    -   **关键流程**: 验证 `fen` 和 `mode` 参数的有效性（`mode` 必须是 `get_best_move`、`get_top_moves` 或 `evaluate_position` 之一），构建包含 `tool_name: 'stockfish_analyzer'` 和完整 `parameters` 的请求体，然后使用 `fetch` 将其发送到 Python API，并处理响应。

### 2.1.2 外部工具服务 (后端)

除了在 Cloudflare Worker 中处理的逻辑外，一些工具还依赖于在独立服务器上运行的外部后端服务。

-   **Python 沙箱服务 (`/tools/`)**
    -   **职能**: 这是一个基于 FastAPI 和 Docker 的独立后端服务，提供一个安全的、隔离的环境来执行由 AI 模型生成的任意 Python 代码。现在它已升级为一个功能齐全的 **数据科学代码解释器**，支持使用 [`matplotlib`](https://matplotlib.org/) 和 [`seaborn`](https://seaborn.pydata.org/) 等库进行数据可视化，并能生成 Base64 编码的 PNG 图像。
    -   **关键文件**:
        -   **[`code_interpreter.py`](tools/code_interpreter.py)**: 包含 FastAPI 应用的核心逻辑。它接收代码片段，使用 Docker SDK 创建一个临时的、一次性的 Docker 容器来执行代码，捕获 `stdout`, `stderr`，并现在特别处理 Base64 编码的图像输出。为了解决 `matplotlib` 在只读文件系统中无法创建缓存的问题，它配置了 `MPLCONFIGDIR` 环境变量为 `/tmp`，并使用 `tmpfs` 将 `/tmp` 目录挂载为内存文件系统。
        -   **[`docker-compose.yml`](tools/docker-compose.yml)**: 用于定义和运行沙箱服务。配置了 `restart: unless-stopped` 策略，以确保服务在服务器重启或意外崩溃后能自动恢复。
        -   **[`Dockerfile`](tools/Dockerfile)**: 自定义了 Docker 镜像，在 `python:3.11-slim` 的基础上预装了一系列关键的数据科学库，包括 `numpy`, `pandas`, `matplotlib`, `seaborn`, 和 `openpyxl`。
    -   **关键升级**:
        -   **数据科学库预装**: 服务现在预装了 `numpy`, `pandas`, `matplotlib`, `seaborn`, 和 `openpyxl`，极大地增强了其在数据分析、处理和可视化方面的能力。
        -   **资源增加与环境配置**: 为支持这些库和 `matplotlib` 缓存，每个容器的内存限制已从 `512MB` 提高到 `1GB`。同时，通过 `MPLCONFIGDIR=/tmp` 环境变量和 `tmpfs={'/tmp': 'size=100M,mode=1777'}` 挂载，确保 `matplotlib` 拥有可写的工作空间。
        -   **同步执行**: 最初的实现使用了异步的 Docker `run(detach=True)`，这导致了一个竞态条件：应用有时会在容器执行完毕并被自动删除后才去尝试获取日志，从而导致 "404 Container Not Found" 错误。
        -   **解决方案**: 我们将其修改为同步执行 `run(detach=False)`。这简化了逻辑，程序会等待代码执行完成并直接从 `run` 命令的返回值中获得输出，从而彻底解决了该竞态条件。

### 2.2 前端 (静态资源)

-   **根目录**: `src/static/`
    -   该目录包含单页应用程序的所有静态文件，由 Cloudflare Worker 直接提供。
    -   **主页面**: [`index.html`](src/static/index.html:1) 是用户界面的入口点。
     -   **图标**: 用户界面现在使用 [Font Awesome](https://fontawesome.com/) 作为所有图标，通过 [`index.html`](src/static/index.html:1) 中的可靠 CDN 链接加载。这取代了之前对 Google Fonts (Material Symbols) 的依赖，以确保在所有网络环境中稳定快速地加载图标。
    -   **CSS**: `src/static/css/` 存放编译后的 CSS 文件，`style.css` 是主样式表。如果使用 Sass，`src/static/scss` 是源代码。
    -   **JavaScript 模块**: `src/static/js/` 是一个高度模块化的目录，包含客户端逻辑。
        -   [`main.js`](src/static/js/main.js): 主要的客户端应用程序逻辑和前端入口点。该文件负责初始化和管理核心 UI 组件，处理用户交互，并协调与后端的通信。它集成了各种模块，如 `AttachmentManager`、`AudioRecorder`、`AudioStreamer`、`ChatApiHandler`、`chatUI`、`CONFIG`、`initializePromptSelect`、`MultimodalLiveClient`、`HistoryManager`、`ScreenHandler`、`VideoHandler`、`ToolManager`、`initializeTranslationCore`、`Logger` 和 `initializeVisionCore`。它还管理全局事件监听器、连接状态（WebSocket 和 HTTP）、UI 状态更新，并处理整体应用程序流程。
        -   **音频模块 (`src/static/js/audio/`)**: 管理所有客户端音频功能，对应用程序中的语音输入/输出至关重要。
            -   [`audio-recorder.js`](src/static/js/audio/audio-recorder.js): 处理麦克风音频捕获、处理和编码。它使用 Web Audio API 和 `audio-processing.js` worklet 来准备音频块（例如，作为 Base64 或原始 ArrayBuffer）以发送到后端，特别是与基于 WebSocket 的转录服务相关。
            -   [`audio-streamer.js`](src/static/js/audio/audio-streamer.js): 管理从后端接收的流式音频数据的播放。它对音频缓冲区进行排队、调度和播放，并可以与 `vol-meter.js` 等音频 worklet 集成以进行实时效果处理或可视化。这是播放 AI 生成语音的关键。
            -   `worklets/`: 包含在单独线程中运行的 Web Audio API Worklet 处理器，防止在密集音频操作期间阻塞 UI。
                -   [`audio-processing.js`](src/static/js/audio/worklets/audio-processing.js): 由 `audio-recorder.js` 使用的自定义 AudioWorkletProcessor，用于将原始麦克风音频 (Float32Array) 转换为 Int16Array 格式并分块以便高效传输。
                -   [`vol-meter.js`](src/static/js/audio/worklets/vol-meter.js): 计算音频流实时音量级别 (RMS) 的 AudioWorkletProcessor，用于在录制或播放期间提供视觉反馈。
        -   `src/static/js/main.js`: 主要的客户端应用程序逻辑。
        -   **代理模块 (`src/static/js/agent/`)**: 包含集成 AI 代理和代理其工具调用的逻辑。
            -   **深度研究代理 (`src/static/js/agent/deepresearch/`)**: **核心升级模块** - 专注于深度研究任务的代理系统，已升级为包含数据总线、相似性检测和模式感知策略的智能系统。
                -   [`AgentLogic.js`](src/static/js/agent/deepresearch/AgentLogic.js): **核心升级** - 深度研究代理的思考核心，新增了数据总线集成、相似性检测、模式感知爬取策略、PDF智能规避、严格JSON格式纪律等功能。
                -   [`DeepResearchAgent.js`](src/static/js/agent/deepresearch/DeepResearchAgent.js): **核心更新** - 深度研究代理的核心执行器，已重构为协调器角色，集成了多个中间件和服务模块。
                -   **中间件系统 (核心架构升级)**:
                    -   `middleware/ToolExecutionMiddleware.js`: **新架构** - 工具执行中间件，处理所有工具调用逻辑，包括虚拟专家接管系统和代码急诊室
                    -   `middleware/ReportGeneratorMiddleware.js`: **新架构** - 报告生成中间件，处理报告生成、后处理和时效性质量评估
                -   **服务模块**:
                    -   `services/StateManager.js`: **新增模块** - 统一状态管理器，管理所有共享状态和数据总线
                -   [`OutputParser.js`](src/static/js/agent/deepresearch/OutputParser.js): 解析 LLM 响应，决定下一步行动（ReAct 格式），支持最终答案和工具调用解析。
                -   [`ReportTemplates.js`](src/static/js/agent/deepresearch/ReportTemplates.js): 提供不同研究模式的报告模板，包括深度研究、学术论文、商业分析、技术文档、标准报告和数据挖掘模式。
                -   [`DataMiningEngine.js`](src/static/js/agent/deepresearch/DataMiningEngine.js): **新增模块** - 数据挖掘引擎，专门处理数据挖掘模式的研究任务。
                -   [`AgentThinkingDisplay.js`](src/static/js/agent/AgentThinkingDisplay.js): **新增模块** - 代理思考过程显示组件，实时展示深度研究代理的思考过程、研究进度和工具调用状态。
            -   [`CallbackManager.js`](src/static/js/agent/CallbackManager.js): 增强的回调管理器，支持中间件和 Agent 事件系统，提供结构化事件流管理。
            -   [`Orchestrator.js`](src/static/js/agent/Orchestrator.js): 智能代理协调器，负责分析用户请求并决定使用标准模式还是深度研究模式。
            -   [`EnhancedSkillManager.js`](src/static/js/agent/EnhancedSkillManager.js): 增强技能管理器，基于工具执行历史提供智能的技能匹配和优化。
            -   **工具模块 (`src/static/js/agent/tools/`)**: Agent 工具系统。
                -   [`BaseTool.js`](src/static/js/agent/tools/BaseTool.js): 所有工具的抽象基类，确保接口一致性
                -   [`ToolImplementations.js`](src/static/js/agent/tools/ToolImplementations.js): 通用代理工具实现，处理所有通过 MCP 代理的工具，支持标准模式和深度研究模式。
        -   `src/static/js/attachments/`: 处理文件附件功能，如 `file-attachment.js`。
            -   [`file-attachment.js`](src/static/js/attachments/file-attachment.js): 定义 `AttachmentManager` 类，该类管理文件附件的所有逻辑（选择、验证、Base64 转换和 UI 预览显示），适用于单文件（"chat" 模式）和多文件（"vision" 模式）场景。**增强**: 现在与 `ImageCompressor` 集成，自动压缩所有模式下大于 1MB 的图像，提供压缩反馈并保持文件类型一致性。具有 `toggleCompression()` 方法用于运行时控制。
        -   **聊天模块 (`src/static/js/chat/`)**: 包含管理聊天 UI、API 交互和处理 AI 响应（包括工具调用）的核心逻辑。
            -   [`chat-api.js`](src/static/js/chat/chat-api.js): 作为所有前端到后端聊天 API 通信的高级接口。它处理发送消息、启动和处理来自 AI 网关的服务器发送事件 (SSE) 流，并递归管理对话轮次，尤其是在工具执行之后。它与 UI 解耦。
            -   [`chat-api-handler.js`](src/static/js/chat/chat-api-handler.js): 实现处理流式聊天补全响应的业务逻辑。它解析流数据，检测并分派 Gemini 函数调用和 Qwen 多云平台 (MCP) 工具调用。对于 Qwen MCP 工具调用，它会稳健地解析工具参数，并在通过 `QwenAgentAdapter` 将其发送到 `/api/mcp-proxy` 后端代理之前，构建 `tool_name` 和 `parameters` 负载。它编排 UI 更新并管理聊天历史状态。
            -   [`chat-ui.js`](src/static/js/chat/chat-ui.js): 专门用于渲染和管理聊天界面的视觉元素。它处理显示用户和 AI 消息（包括流式内容、思维链和工具调用状态）、音频消息和系统日志。它提供 UI 初始化、消息记录和滚动的函数。
        -   **配置模块 (`src/static/js/config/`)**: 包含配置文件和管理提示词逻辑。
            -   [`config.js`](src/static/js/config/config.js): 定义应用程序的全局配置，包括可用的 AI 模型（Gemini、Qwen 等）、API 版本、默认模型、系统提示词选项、音频设置、翻译模型和视觉模型。**增强**: 现在包含专门的 `VISION.PROMPTS` 数组，具有国际象棋特定的提示词配置：`chess_teacher`（用于游戏指导）和 `chess_summary`（用于赛后分析）。具有智能提示词切换和双模式国际象棋指导功能。
            -   [`prompt-manager.js`](src/static/js/config/prompt-manager.js): 管理前端的提示词模式选择和系统指令更新。它根据用户在下拉菜单中的选择从 `config.js` 中检索适当的系统提示词，使用此提示词更新隐藏的文本区域，并处理本地存储以记住用户偏好。
        -   **核心模块 (`src/static/js/core/`)**: 包含核心实用函数、API 处理器和 WebSocket 客户端逻辑。
            -   [`api-handler.js`](src/static/js/core/api-handler.js): 提供用于发出 HTTP API 请求的集中处理器，标准化 JSON POST 请求并处理流式响应（服务器发送事件）。它管理标头、错误响应，并确保与后端服务的稳健通信。
            -   [`websocket-client.js`](src/static/js/core/websocket-client.js): 管理 WebSocket 连接，用于与 Gemini 2.0 Flash Multimodal Live API 进行实时交互。它处理连接设置、发送和接收消息（包括音频和视频块）、处理工具调用以及发出各种与连接相关的事件。
            -   [`worklet-registry.js`](src/static/js/core/worklet-registry.js): 提供用于管理 Web Audio API worklet 的注册表。它便于从源代码动态创建工作 URL，从而能够在单独的线程中加载和使用自定义音频处理器以防止 UI 阻塞。
        -   **历史模块 (`src/static/js/history/`)**: 管理与后端历史 API 的客户端聊天历史交互。
            -   [`history-manager.js`](src/static/js/history/history-manager.js): 封装与聊天历史管理相关的所有功能，包括加载、保存、固定、编辑标题和删除聊天会话。它与 `localStorage`（用于会话元数据）和后端 API（用于完整聊天历史数据）交互，确保聊天会话的持久性和正确显示。
            -   **[`vision-history-manager.js`](src/static/js/history/vision-history-manager.js)**: **新增模块** - Vision 模式专用的历史管理器，提供独立的会话管理、消息存储和本地存储功能。通过 `createVisionHistoryManager()` 工厂函数创建，与 Vision 模式的 `ChatApiHandler` 实例配合使用。
        -   **图像库模块 (`src/static/js/image-gallery/`)**: 管理图像显示和模态框交互。
            -   [`image-manager.js`](src/static/js/image-gallery/image-manager.js): 提供初始化图像模态框、使用特定图像数据（Base64 源、标题、尺寸、大小、类型）打开它以及处理操作（如复制图像 URL 和下载）的函数。
        -   **媒体模块 (`src/static/js/media/`)**: 处理屏幕和视频处理。
            -   [`screen-handlers.js`](src/static/js/media/screen-handlers.js): 管理屏幕共享逻辑，包括开始/停止屏幕捕获和更新 UI。它使用 `ScreenRecorder` 捕获帧并将其发送到 WebSocket 客户端，并通过节流控制帧率。
            -   [`video-handlers.js`](src/static/js/media/video-handlers.js): 管理摄像头控制逻辑，包括开始/停止视频流和更新 UI。它利用 `VideoManager` 处理视频捕获和流式传输，并支持在移动设备上在前置和后置摄像头之间切换。
        -   **工具模块 (`src/static/js/tools/`)**: 实现客户端工具及其管理。
            -   [`google-search.js`](src/static/js/tools/google-search.js): 表示用于执行 Google 搜索的占位符工具。它为 Gemini API 提供工具声明，但实际的搜索功能由 Gemini API 本身在服务器端处理。
            -   [`tool-manager.js`](src/static/js/tools/tool-manager.js): 管理各种工具的注册和执行。它注册默认工具（如 Google Search 和 Weather），向 Gemini API 提供它们的声明，并通过执行相应工具的逻辑来处理来自 API 的传入工具调用请求。
            -   [`weather-tool.js`](src/static/js/tools/weather-tool.js): 表示用于检索天气预报的模拟工具。它定义了一个带有位置和日期参数的函数 `get_weather_on_date`，并返回模拟的天气数据用于演示目的。
        -   **翻译模块 (`src/static/js/translation/`)**: 包含翻译逻辑，包括 OCR 功能。
            -   [`translation-core.js`](src/static/js/translation/translation-core.js): 提供翻译功能的核心逻辑，处理 UI 初始化、对后端翻译端点的 API 调用以及应用程序内的模式切换。它管理语言和模型选择，并协调语音输入以在翻译前进行转录。
            -   [`translation-audio.js`](src/static/js/translation/translation-audio.js): **新增模块** - 负责翻译模式下的语音输入处理。它提供与聊天模式相同的用户体验，支持按住录音、将 PCM 数据转换为 WAV 格式，并将音频发送到 `/api/transcribe-audio` 后端 API 进行语音转文字。
            -   [`translation-ocr.js`](src/static/js/translation/translation-ocr.js): 管理翻译功能的 OCR（光学字符识别）过程。它处理用户图像上传，将图像转换为 Base64，发送到后端使用 Gemini 模型进行文本识别，并在输入区域显示提取的文本。它还根据所选的翻译模型控制 OCR 按钮的可见性。
        -   **工具模块 (`src/static/js/tools/`)**: 实现客户端工具及其管理。
            -   [`google-search.js`](src/static/js/tools/google-search.js): 表示用于执行 Google 搜索的占位符工具。它为 Gemini API 提供工具声明，但实际的搜索功能由 Gemini API 本身在服务器端处理。
            -   [`tool-manager.js`](src/static/js/tools/tool-manager.js): 管理各种工具的注册和执行。它注册默认工具（如 Google Search 和 Weather），向 Gemini API 提供它们的声明，并通过执行相应工具的逻辑来处理来自 API 的传入工具调用请求。
            -   [`weather-tool.js`](src/static/js/tools/weather-tool.js): 表示用于检索天气预报的模拟工具。它定义了一个带有位置和日期参数的函数 `get_weather_on_date`，并返回模拟的天气数据用于演示目的。
        -   **实用工具模块 (`src/static/js/utils/`)**: 包含通用实用函数、错误处理和日志记录。
            -   [`error-boundary.js`](src/static/js/utils/error-boundary.js): 定义用于处理各种类型应用程序错误的错误边界。它提供一组预定义的 `ErrorCodes` 和一个自定义的 `ApplicationError` 类，用于在整个应用程序中一致且结构化地报告错误。
            -   [`logger.js`](src/static/js/utils/logger.js): 一个单例记录器，将消息记录到控制台并发出事件以进行实时日志记录。它还在内存中存储有限数量的日志，并提供导出它们的方法，有助于调试和监控。
            -   [`utils.js`](src/static/js/utils/utils.js): 提供常见的实用函数，例如将 Blob 对象转换为 JSON 和将 base64 字符串转换为 ArrayBuffer，这对于前端内的数据操作至关重要。
        -   **视频模块 (`src/static/js/video/`)**: 管理视频录制和流式传输。
            -   [`screen-recorder.js`](src/static/js/video/screen-recorder.js): 实现用于捕获和处理屏幕帧的屏幕录制器。它支持预览屏幕捕获并将帧发送到回调函数，具有可配置的 FPS、质量和帧大小。
            -   [`video-manager.js`](src/static/js/video/video-manager.js): 管理来自摄像头的视频捕获和处理，包括运动检测和帧预览。它协调 `VideoRecorder` 捕获帧，应用运动检测以优化帧发送，并处理摄像头切换（前置/后置）。
            -   [`video-recorder.js`](src/static/js/video/video-recorder.js): 实现用于捕获和处理来自摄像头的视频帧的视频录制器。它支持预览视频流并将帧作为 base64 编码的 JPEG 数据发送到回调函数，具有可配置的 FPS 和质量。
        -   **视觉模块 (`src/static/js/vision/`)**: 包含视觉相关功能的核心逻辑，现在增强了 **国际象棋大师 AI** 功能。
            -   **[`vision-core.js`](src/static/js/vision/vision-core.js)**: **架构重大更新** - 现在完全复用 `ChatApiHandler` 类来处理 Vision 模式的 API 调用，实现了与 Chat 模式统一的流式处理体验。关键特性包括：
                - **专用 API Handler**: 使用独立的 `ChatApiHandler` 实例处理 Vision 模式请求
                - **独立历史管理**: 集成 `vision-history-manager.js` 提供独立的会话和消息存储
                - **统一工具调用**: 通过 `ChatApiHandler` 支持完整的工具调用、思维链和搜索功能
                - **国际象棋集成**: 保留完整的国际象棋大师 AI 功能，包括对局总结和分析
                - **UI 适配器**: 通过 `createVisionUIAdapter()` 提供 Vision 专用的 UI 更新接口
                - **历史清理**: 新增 `clearVisionHistory()` 函数用于外部清理 Vision 聊天历史
        -   **国际象棋模块 (`src/static/js/chess/`)**: **新增模块** - 完整的国际象棋功能实现，包括棋盘渲染、规则引擎和 AI 增强。
            -   **[`chess-core.js`](src/static/js/chess/chess-core.js)**: 国际象棋功能的核心逻辑，处理棋盘渲染、棋子移动和 FEN 生成。重构为使用单独的 ChessRules 模块处理游戏规则。
                - **影子引擎**: 引入 chess.js 作为影子引擎，用于验证和同步游戏状态
                - **AI 集成**: 与 `chess-ai-enhanced.js` 集成，提供 AI 走法分析和执行
                - **游戏状态管理**: 完整的游戏状态管理，包括历史记录、撤销/重做和本地存储
                - **用户界面**: 完整的棋盘 UI，包括棋子选择、移动高亮和游戏结束检测
            -   **[`chess-ai-enhanced.js`](src/static/js/chess/chess-ai-enhanced.js)**: 增强的国际象棋 AI 模块，提供多阶段 AI 分析和走法执行。
                - **多阶段分析**: 第一阶段获取 AI 详细分析，第二阶段精确提取最佳走法
                - **智能降级**: 当首选走法失败时生成替代走法
                - **走法验证**: 全面的走法验证和合法性检查
                - **视觉集成**: 与 Vision 模块深度集成，在视觉聊天中显示分析过程
            -   **[`chess-rule.js`](src/static/js/chess/chess-rule.js)**: 国际象棋规则模块，包含所有象棋规则逻辑，包括棋子移动、特殊走法和游戏状态验证。
                - **棋子移动规则**: 所有棋子的合法移动规则验证
                - **特殊走法**: 王车易位、吃过路兵、兵升变等特殊规则
                - **游戏状态检查**: 将军、将死、和棋条件检测
                - **FEN 生成**: 生成和验证标准 FEN 字符串
        -   **实用工具模块增强**: 新增图像压缩功能。
            -   [`image-compressor.js`](src/static/js/utils/image-compressor.js): **新模块** - 使用 Canvas API 实现智能图像压缩，阈值为 1MB。特性包括格式保留、可配置的质量设置以及所有模式（不仅仅是视觉模式）的自动压缩。支持 JPEG 转换和原始格式保留。

### 2.3 Cloudflare 配置与依赖

-   **Cloudflare 配置**: [`wrangler.toml`](wrangler.toml:1)
    -   定义项目名称、`src/worker.js` 作为入口点、兼容性设置以及 `src/static` 目录作为 Cloudflare 部署的资源目录。此文件对于 Worker 的部署方式以及与 Cloudflare 服务（如 KV 存储）的交互方式至关重要。

-   **依赖**: [`package.json`](package.json:1)
    -   列出开发、测试和构建资源所需的所有 Node.js 依赖项。这包括用于本地开发和部署的 `wrangler`、用于测试的 `vitest`，以及可能用于 CSS 预处理的 `sass`。

## 3. 关键特性与 API 端点

[`src/worker.js`](src/worker.js:1) 脚本管理几个关键功能：

-   **静态文件服务器**: 从 `src/static` 目录提供前端应用程序。
-   **WebSocket 代理**: 将 WebSocket 连接直接代理到 `generativelanguage.googleapis.com`，用于与 Gemini 模型进行实时通信。
-   **AI 网关 (API 代理)**: 根据请求体中指定的 `model` 将 API 请求路由到适当的下游 AI 服务。
    -   **聊天补全**: `/chat/completions` 或 `/api/request`
        -   **Gemini**: 用于模型如 `gemini-1.5-pro-latest`、`gemini-2.5-pro`、`gemini-2.5-flash-preview-05-20`、`gemini-2.5-flash-lite-preview-06-17`、`gemini-2.0-flash`。
        -   **ZhipuAI**: 用于模型如 `glm-4v`、`glm-4.1v-thinking-flash`、`glm-4v-flash`、`GLM-4.5-Flash`。
        -   **SiliconFlow**: 用于模型如 `THUDM/GLM-4-9B-Chat`、`THUDM/GLM-4.1V-9B-Thinking`。
        -   **ModelScope**: 用于模型如 `Qwen/Qwen3-235B-A22B-Thinking-2507`。
    -   **音频转录**: `/api/transcribe-audio`
        -   将音频数据转发到 **SiliconFlow** 转录 API（模型：`FunAudioLLM/SenseVoiceSmall`）。
    -   **翻译**: `/api/translate`
        -   使用各种提供商（Gemini、Zhipu、SiliconFlow）的聊天补全端点进行翻译任务。
    -   **图像生成**: `/api/generate-image`
        -   将请求转发到 **SiliconFlow** 图像生成 API。
    -   **历史管理**: `/api/history/*`
        -   提供用于保存、加载、固定、取消固定、编辑标题、删除聊天会话以及使用 AI 模型为会话生成标题的端点。
    -   **MCP 代理**: `/api/mcp-proxy`
        -   代理多云平台 (MCP) 工具调用的请求。

## 4. 配置与密钥

应用程序依赖环境变量来获取 API 密钥和其他密钥。这些必须在您的 Cloudflare 项目设置中配置（或在本地开发的 `.dev.vars` 文件中配置）。

-   `SF_API_TOKEN`: SiliconFlow 的 API 密钥。
-   `AUTH_KEY`: Gemini API 代理 (`geminiapim.10110531.xyz`) 的 API 密钥。
-   `ZHIPUAI_API_KEY`: ZhipuAI (bigmodel.cn) 的 API 密钥。
-   `QWEN_API_KEY`: ModelScope (qwen) 的 API 密钥。
-   `GEMINICHAT_HISTORY_KV`: 用于聊天历史存储的 KV 命名空间绑定。

## 5. 常用开发命令

所有命令都使用 Node.js 和 npm 运行。

-   **安装依赖**:
    ```bash
    npm install
    ```

-   **构建动态技能系统**:
    ```bash
    npm run build:skills
    ```
    此命令运行 [`scripts/build-skills.js`](scripts/build-skills.js)，扫描 `src/skills/` 目录下的 `SKILL.md` 文件，并生成 [`src/tool-spec-system/generated-skills.js`](src/tool-spec-system/generated-skills.js)。

-   **在本地运行应用程序**:
    ```bash
    npm run dev
    ```
    此命令首先运行技能构建，然后使用 `wrangler` 启动本地开发服务器，模拟 Cloudflare 环境。

-   **运行所有测试**:
    ```bash
    npm test
    ```
    这使用 Vitest（在 [`vitest.config.js`](vitest.config.js:1) 中配置）执行测试套件。

-   **运行单个测试**:
    ```bash
    npm test <path/to/your/test/file.spec.js>
    ```
    将 `<path/to/your/test/file.spec.js>` 替换为您要运行的实际测试文件路径。

-   **构建 CSS (如果使用 Sass)**:
    ```bash
    npm run build:css
    ```
    这将 Sass 文件从 `src/static/scss` 编译到 `src/static/css`。

-   **部署到 Cloudflare**:
    ```bash
    npm run deploy
    ```
    此命令首先运行技能构建，然后构建 CSS，最后使用 `wrangler` 将应用程序部署到您的 Cloudflare 帐户。

## 6. Vision 模块架构更新

### 6.1 统一的 API 处理架构

**重大架构变更**: Vision 模块现在完全复用 `ChatApiHandler` 类，实现了与 Chat 模式统一的 API 调用和流式处理体验。

#### 6.1.1 核心架构组件

-   **专用 API Handler**: Vision 模式使用独立的 `ChatApiHandler` 实例 (`visionApiHandler`)
-   **独立历史管理**: 通过 `vision-history-manager.js` 提供独立的会话和消息存储
-   **统一工具调用**: 通过 `ChatApiHandler` 支持完整的工具调用、思维链和搜索功能
-   **UI 适配器**: 通过 `createVisionUIAdapter()` 提供 Vision 专用的 UI 更新接口

#### 6.1.2 初始化流程

在 `main.js` 中的初始化流程：

```javascript
// 1. 创建 Vision 历史管理器
const visionHistoryManager = createVisionHistoryManager();

// 2. 初始化 Vision 模式的 ChatApiHandler
visionApiHandler = new ChatApiHandler({
    toolManager: toolManager,
    historyManager: visionHistoryManager,
    state: {
        chatHistory: visionHistoryManager.getCurrentSessionMessages(),
        currentSessionId: visionHistoryManager.getCurrentSessionId(),
        currentAIMessageContentDiv: null,
        isUsingTool: false
    },
    libs: {
        marked: window.marked,
        MathJax: window.MathJax
    },
    config: CONFIG,
    elements: {
        messageHistory: visionElements.visionMessageHistory,
        logsContainer: document.getElementById('logs-container')
    }
});

// 3. 定义 visionHandlers
const visionHandlers = {
    showToast: showToast,
    showSystemMessage: showSystemMessage,
    chatApiHandler: visionApiHandler,
    historyManager: visionHistoryManager
};

// 4. 初始化视觉功能
initializeVisionCore(visionElements, attachmentManager, visionHandlers);
```

#### 6.1.3 UI 适配器系统

`createVisionUIAdapter()` 函数创建 Vision 专用的 UI 适配器：

```javascript
function createVisionUIAdapter() {
    return {
        createAIMessageElement: createVisionAIMessageElement,
        displayUserMessage: displayVisionUserMessage,
        displayToolCallStatus: (toolName, args) => {
            // Vision 专用的工具调用状态显示
        },
        displayImageResult: (base64Image, altText, fileName) => {
            // Vision 专用的图像结果显示
        },
        scrollToBottom: scrollVisionToBottom,
        logMessage: (message, type) => {
            // Vision 专用的日志记录
        }
    };
}
```

### 6.2 国际象棋大师 AI 功能 (Chess Master AI Feature)

#### 6.2.1 核心架构更新

国际象棋功能现在完全集成到统一的 Vision 架构中：

-   **API 调用**: 通过 `visionApiHandler.streamChatCompletion()` 处理所有国际象棋相关的 AI 请求
-   **工具调用**: 支持完整的工具调用功能，包括 `python_sandbox` 图像生成
-   **流式响应**: 通过统一的 SSE 流式处理显示 AI 分析和走法推荐
-   **历史管理**: 使用 Vision 专用的历史管理器存储国际象棋会话

#### 6.2.2 对局总结功能

`generateGameSummary()` 函数现在使用统一的 API 处理：

```javascript
async function generateGameSummary() {
    // 获取完整的对局历史
    const fenHistory = chessGame.getFullGameHistory();
    
    // 使用 visionApiHandler 发送请求
    await chatApiHandlerInstance.streamChatCompletion(requestBody, apiKey, visionUiAdapter);
}
```

#### 6.2.3 历史清理功能

新增 `clearVisionHistory()` 函数用于外部清理 Vision 聊天历史：

```javascript
export function clearVisionHistory() {
    if (chatApiHandlerInstance) {
        // 清空专属 handler 内部的状态
        chatApiHandlerInstance.state.chatHistory = [];
        chatApiHandlerInstance.state.currentSessionId = null;
        // ... 其他状态重置
    }
    // 同时清除历史管理器中的当前会话
    if (handlers.historyManager && handlers.historyManager.clearCurrentSession) {
        handlers.historyManager.clearCurrentSession();
    }
}
```

### 6.3 优势与改进

#### 6.3.1 架构优势

-   **代码复用**: 消除重复的 API 处理逻辑，减少代码维护成本
-   **一致性**: Vision 和 Chat 模式使用相同的工具调用和流式处理逻辑
-   **可维护性**: 统一的错误处理和状态管理
-   **扩展性**: 新功能可以同时在两个模式中受益

#### 6.3.2 功能改进

-   **完整工具支持**: Vision 模式现在支持所有 Chat 模式可用的工具
-   **思维链显示**: 支持 Gemini 模型的思维链内容实时显示
-   **图像生成**: 通过 `python_sandbox` 工具支持数据可视化图像生成
-   **搜索功能**: 支持启用或禁用 Google 搜索功能

#### 6.3.3 性能优化

-   **独立状态**: Vision 和 Chat 模式的状态完全隔离，避免相互干扰
-   **专用历史**: 独立的会话存储，提高数据管理效率
-   **内存优化**: 按需初始化资源，减少内存占用

## 7. 国际象棋模块技术实现

### 7.1 核心架构组件

#### 7.1.1 棋盘引擎系统

国际象棋功能采用双引擎架构确保规则准确性：

-   **自定义规则引擎**: [`chess-rule.js`](src/static/js/chess/chess-rule.js) 实现完整的国际象棋规则
-   **影子引擎**: 使用 chess.js 库作为验证和同步的权威来源
-   **状态同步**: 通过 `syncAndVerifyShadowEngine()` 确保两个引擎状态一致

#### 7.1.2 AI 增强系统

[`chess-ai-enhanced.js`](src/static/js/chess/chess-ai-enhanced.js) 实现多阶段 AI 分析：

```javascript
// 四阶段 AI 分析流程
1. 第一阶段：获取 AI 的详细分析
2. 第二阶段：使用第二个 AI 精确提取最佳走法  
3. 第三阶段：验证并决策（用户选择）
4. 第四阶段：执行最终确定的走法
```

#### 7.1.3 用户界面集成

-   **棋盘渲染**: 完整的 HTML5 棋盘界面，支持点击和拖放
-   **游戏状态管理**: 完整的游戏生命周期管理
-   **多模式交互**: 支持手动走棋和 AI 辅助分析

### 7.2 关键功能特性

#### 7.2.1 完整的规则支持

-   **基本移动**: 所有棋子的标准移动规则
-   **特殊走法**: 王车易位、吃过路兵、兵升变
-   **游戏状态**: 将军、将死、和棋条件检测
-   **FEN 支持**: 完整的 FEN 字符串生成和解析

#### 7.2.2 AI 分析功能

-   **多模型分析**: 支持使用不同的 AI 模型进行局面分析
-   **走法推荐**: 智能走法提取和验证
-   **用户选择**: 提供多个候选走法供用户选择
-   **执行验证**: 走法执行前的完整合法性检查

#### 7.2.3 历史与持久化

-   **完整历史记录**: 记录完整的对局历史
-   **本地存储**: 自动保存游戏状态到 localStorage
-   **撤销/重做**: 完整的移动历史管理
-   **会话恢复**: 页面刷新后自动恢复游戏状态

### 7.3 与 Vision 模块的深度集成

#### 7.3.1 统一的消息系统

国际象棋 AI 分析通过 Vision 模块的消息系统显示：

```javascript
// 在视觉聊天区显示 AI 分析过程
this.displayVisionMessage('**♟️ 国际象棋AI分析**', { id: analysisId, create: true });
```

#### 7.3.2 工具调用支持

通过 Vision 模块的工具调用系统支持高级功能：

-   **Python 沙箱**: 用于数据可视化和复杂计算
-   **搜索集成**: 支持棋局背景和历史查询
-   **图像生成**: 通过工具调用生成局面分析图

#### 7.3.3 统一的 API 处理

所有国际象棋相关的 AI 请求都通过 Vision 模块的专用 `ChatApiHandler` 处理，确保：

-   **一致的错误处理**
-   **统一的流式响应**
-   **工具调用兼容性**
-   **历史管理一致性**

### 7.4 开发者体验

#### 7.4.1 模块化设计

-   **清晰的职责分离**: 规则、AI、UI 逻辑分离
-   **易于测试**: 独立的模块便于单元测试
-   **可扩展性**: 易于添加新功能或修改现有行为

#### 7.4.2 调试支持

-   **详细的日志记录**: 完整的移动和状态变更日志
-   **影子引擎验证**: 自动检测和修复状态不一致
-   **错误恢复**: 健壮的错误处理和状态恢复机制

#### 7.4.3 配置灵活性

-   **模型配置**: 支持使用不同的 AI 模型进行分析
-   **提示词管理**: 可配置的分析提示词和系统指令
-   **UI 定制**: 可定制的棋盘外观和交互行为

这个国际象棋模块提供了一个完整、健壮且用户友好的国际象棋体验，同时深度集成到应用程序的统一架构中，充分利用了现有的 AI 基础设施和工具调用能力。

---

## 8. 动态技能系统 (Dynamic Skill System)

本次架构升级引入了动态技能系统，旨在将工具使用指南从硬编码的系统提示词中解耦，实现按需、动态地为大语言模型（LLM）提供精准的上下文指令，从而大幅提升工具调用的成功率和准确性。

### 8.1 核心组件与工作流

1.  **技能文件**:
    *   所有工具的详细使用指南以独立的 `SKILL.md` 文件形式存储在 [`src/skills/<tool_name>/`](src/skills/) 目录中。
    *   每个 `SKILL.md` 包含结构化的元数据（frontmatter）和为模型优化的 Markdown 内容。

2.  **预构建脚本**:
    *   [`scripts/build-skills.js`](scripts/build-skills.js) 脚本在构建或开发启动前自动运行。
    *   它扫描 `src/skills/` 目录，解析所有 `SKILL.md` 文件。
    *   生成一个静态的 [`src/tool-spec-system/generated-skills.js`](src/tool-spec-system/generated-skills.js) 文件，将所有技能数据内联为一个 JavaScript 对象，适配 Cloudflare Workers 的无文件系统环境。

3.  **运行时管理器**:
    *   [`src/tool-spec-system/skill-manager.js`](src/tool-spec-system/skill-manager.js) 作为纯粹的运行时逻辑单元。它从 `generated-skills.js` 加载数据并完成初始化。
    *   `SkillManager` 负责根据用户的实时查询，通过一个加权评分算法匹配最相关的技能。

4.  **动态上下文注入**:
    *   在主入口 [`src/worker.js`](src/worker.js) 的 `handleAPIRequest` 函数中集成了技能注入逻辑。
    *   对于每个聊天请求，系统会先进行技能匹配。如果匹配成功，会将该技能的核心指令动态地作为一个 `system` 消息插入到发送给 LLM 的 `messages` 数组中。

### 8.2 带来的优势

*   **成功率提升**: 向 LLM 提供高度相关、即时生成的"小抄"，显著降低了其调用工具时的幻觉和错误。
*   **卓越的可维护性**: 增加或修改工具能力，现在只需编辑对应的 `.md` 文件，无需触碰任何核心业务逻辑代码。
*   **性能优化**: 所有文件 I/O 都在构建时完成，运行时是零开销的内存操作。

### 8.3 Python沙箱技能增强与架构重构

为了显著提升AI代码执行能力的上限和可维护性，我们对 python-sandbox 技能进行了一次重大的架构和内容升级。本次更新将该技能从一个单一的指令文件，转变为一个全面且模块化的能力中枢。

#### 8.3.1 核心架构变更：技能即模块

最重要的变更是采用了一种模块化的文件结构，遵循"渐进式披露"的设计原则。原有的单体 SKILL.md 文件被重构为一个高层级的入口，并由一个包含详细参考文档的库作为支持。

新的目录结构如下：

```
skills/python-sandbox/
│
├── SKILL.md                 # 核心指南：新的高层级入口与调度器。
│
└── references/              # 知识库：一个包含详细"菜谱"和工作流的库。
    ├── matplotlib_cookbook.md # 高级数据可视化指南。
    ├── pandas_cheatsheet.md   # 数据清洗与分析流水线指南。
    ├── report_generator_workflow.md # 自动化文档生成工作流指南。
    ├── ml_workflow.md         # 机器学习模型训练指南。
    └── sympy_cookbook.md      # 符号数学与公式证明指南。
```

**SKILL.md: 入口与调度器**
- 主 SKILL.md 文件不再包含冗长的代码示例
- 提供对技能核心能力的高层级概览
- 充当目录或索引，指导AI在处理特定的复杂任务时，应该查阅哪一个参考文件
- 定义基础的工具调用方式和输出规范

**references/ 目录: 知识库**
- 存放详细的、针对特定任务的指南，或称为"菜谱"
- 使得AI可以在不污染其初始上下文的情况下，按需加载深度知识
- 每个工作流或库的指南都可以被独立更新，而无需改动核心的 SKILL.md

#### 8.3.2 增强的能力

这套新架构正式引入并支持了以下高级能力：

- **高级数据可视化**: 超越简单的绘图，提供创建高质量、标准化商业图表的最佳实践
- **复杂工作流自动化**: 提供多步骤任务的完整示例，如"周报生成器"，它结合了数据模拟、图表创建和Word文档组装
- **健壮的数据流水线**: 一份关于使用Pandas进行数据清洗和分析的完整工作流指南
- **机器学习**: 一个用于训练、评估和可视化scikit-learn模型结果的标准化工作流
- **科学与符号计算**: 使用 Sympy 库执行高级数学任务的专属指南，包括解方程、执行微积分和进行严谨的数学公式证明

#### 8.3.3 新的交互模型

与增强后的 python-sandbox 技能交互，现在遵循一个由AI编排的、更智能的多步骤流程：

1. **请求分析**: 用户提出一个高层级的请求（例如，"分析这个数据集并创建一份报告"或"帮我证明这个三角恒等式"）
2. **查阅调度器**: AI首先查阅主 SKILL.md 文件，以理解任务的大致类别，并确定应使用的参考指南
3. **深入知识库**: AI接着加载 references/ 目录下的相关文件（例如 report_generator_workflow.md 或 sympy_cookbook.md），以获取详细的代码模板和最佳实践
4. **生成并执行代码**: 借助专家级的知识，AI生成高质量、健壮的代码来完成用户的请求

**示例演练：公式证明**
- 用户提示："使用符号计算证明 sin(x)**2 + cos(x)**2 = 1。"
- AI行动：
  1. skill-manager 识别出 python-sandbox 是相关技能
  2. AI读取 SKILL.md，并注意到关于"符号数学与公式证明"的部分
  3. 指令引导它去查阅 references/sympy_cookbook.md
  4. AI阅读该"菜谱"，学习到证明公式的最佳实践工作流（例如，使用 sympy.simplify(LHS - RHS)）
  5. AI生成正确的 Sympy 代码，并附上证明过程的详细分步解释

本次升级代表了 python-sandbox 技能在智能性和实用性上的一次重大飞跃。通过采用模块化的、由知识驱动的架构，我们创建了一个不仅功能更强大，而且扩展性更强、更易于维护的平台。这为未来引入更多、更复杂的专家级技能奠定了坚实的基础。

---

## 9. 工具管理机制和连接差异

该项目实现了一个复杂的工具管理和调用机制，针对不同的 AI 模型和连接类型进行了定制。核心原则是 `ToolManager` 类（定义在 [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js)）是工具声明和执行逻辑的通用包装器。然而，它在前端代码中被实例化了两次，服务于 WebSocket 和 HTTP 连接路径，从而形成了两个逻辑上不同的"系统"。

#### 9.1 WebSocket 连接方法 (Gemini WebSocket API)

*   **模型**: 主要用于通过 WebSocket 连接的 Gemini 模型，例如 `models/gemini-2.0-flash-exp`。
*   **核心模块和文件**:
    *   [`src/static/js/main.js`](src/static/js/main.js): 前端入口点；**不直接处理 WebSocket 工具管理**，但初始化 `MultimodalLiveClient`。
    *   [`src/static/js/core/websocket-client.js`](src/static/js/core/websocket-client.js) ([`src/static/js/core/websocket-client.js:28`](src/static/js/core/websocket-client.js:28)): 核心 WebSocket 客户端，负责与 `generativelanguage.googleapis.com` 建立实时通信。**在此模块内，实例化了一个独立的 `ToolManager` 实例** (`this.toolManager = new ToolManager();`)。
    *   [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js): 定义 `ToolManager` 类及其注册和执行默认工具（Google Search, Weather）的逻辑。
    *   [`src/static/js/tools/google-search.js`](src/static/js/tools/google-search.js), [`src/static/js/tools/weather-tool.js`](src/static/js/tools/weather-tool.js): 由 `ToolManager` 注册的默认工具。
    *   [`src/worker.js`](src/worker.js): 充当 WebSocket 代理 ([`src/worker.js:10`](src/worker.js:10) `handleWebSocket(request, env);`)，直接将 WebSocket 连接转发到 `generativelanguage.googleapis.com`。
*   **工具调用工作流程**:
    1.  `MultimodalLiveClient` ([`src/static/js/core/websocket-client.js`](src/static/js/core/websocket-client.js)) 在建立 WebSocket 连接后，从其**内部的 `ToolManager` 实例**通过 `this.toolManager.getToolDeclarations()` ([`src/static/js/core/websocket-client.js:62`](src/static/js/core/websocket-client.js:62)) 获取工具声明，并将其作为 `setup` 消息的一部分发送给 Gemini WebSocket API。
    2.  当 Gemini WebSocket API 返回一个 `functionCall`（例如调用 `googleSearch` 或 `get_weather_on_date`）时，`MultimodalLiveClient` 的 `receive` 方法会捕获此调用。
    3.  `MultimodalLiveClient` 然后调用其内部 `ToolManager` 实例的 `handleToolCall()` 方法 ([`src/static/js/core/websocket-client.js:285`](src/static/js/core/websocket-client.js:285])，以**在前端本地执行相应的工具逻辑**。
    4.  工具执行的结果通过 `MultimodalLiveClient.sendToolResponse()` 发送回 Gemini WebSocket API，完成工具调用循环。
*   **默认工具集**: `GoogleSearchTool`, `WeatherTool`。
*   **如何改进 WebSocket 连接的工具**:
    *   **添加/修改新工具**: 修改 [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js) 以注册新的工具类，并创建相应的工具实现文件（例如 `src/static/js/tools/new-tool.js`）。
    *   **修改工具声明**: 调整相应工具类（例如 `src/static/js/tools/google-search.js`）中的 `getDeclaration()` 方法。
    *   **修改工具执行逻辑**: 调整相应工具类中的 `execute()` 方法。

#### 9.2 HTTP 连接方法 (Gemini HTTP API & Qwen HTTP API)

*   **模型**: 主要用于 HTTP 模型，如 `models/gemini-2.5-flash` 和 Qwen 模型，如 `Qwen/Qwen3-235B-A22B-Thinking-2507`。此路径旨在实现最大灵活性，允许不同的模型使用不同的工具集。
*   **核心模块和文件**:
    *   [`src/static/js/main.js`](src/static/js/main.js) ([`src/static/js/main.js:24`](src/static/js/main.js:24)): 前端入口点；**在这里，实例化了一个全局 `ToolManager` 实例** (`const toolManager = new ToolManager();`)。这个全局实例被注入到 `ChatApiHandler` 中。
    *   [`src/static/js/chat/chat-api-handler.js`](src/static/js/chat/chat-api-handler.js): 处理 HTTP SSE 流的核心模块。它被注入了**全局 `ToolManager` 实例**，并负责合并和转发工具声明，以及将工具调用分派给适当的处理器。
    *   [`src/static/js/config/config.js`](src/static/js/config/config.js): 定义模型配置。每个模型条目的 `tools` 属性指向一个特定的工具集数组，实现了细粒度控制。此文件还定义了模型特定的**系统提示词**（例如 `Tool_gemini`），这对于指导模型行为至关重要，特别是对于像图像生成这样的复杂任务。
    *   [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js): 同上，其类定义是通用的。**在此路径中，全局 `ToolManager` 实例也管理 `GoogleSearchTool` 和 `WeatherTool`。**
    *   [`src/static/js/tools_mcp/tool-definitions.js`](src/static/js/tools_mcp/tool-definitions.js): 定义各种 MCP 工具集。现在包括用于 Qwen 的通用 `mcpTools` 和一个专门的、模式兼容的用于 Gemini 模型的 `geminiMcpTools` 数组。
    *   [`src/worker.js`](src/worker.js): Cloudflare Worker 后端，充当 HTTP API 代理。它现在有一个统一的逻辑路径，其中 Gemini 和 Qwen 的工具调用都通过 `/api/mcp-proxy` 端点进行路由。
*   **工具调用工作流程 (Gemini & Qwen)**:
    1.  **前端请求构造**: 当 `ChatApiHandler` 发送 HTTP 请求时，它从 `config.js` 读取所选模型的配置。然后它**合并**来自全局 `ToolManager` 的默认工具声明（Google Search, Weather）与分配给该模型的特定工具集（例如 `geminiMcpTools` 或 `mcpTools`）。这个合并后的列表在请求中发送。
    2.  请求由 `worker.js` 转发到适当的下游服务。
    3.  当模型返回一个工具调用时，`ChatApiHandler` 会捕获它。
    4.  **统一分派**: `ChatApiHandler` 现在使用统一的 `_handleMcpToolCall` 方法来处理 Gemini 和 Qwen 的工具调用。它构建一个包含 `tool_name` 和 `parameters` 的请求，并将其发送到 `/api/mcp-proxy` 端点。这显著简化了前端逻辑。
    5.  后端 MCP 代理 (`/api/mcp-proxy`) 将请求路由到正确的处理器（例如 `python-sandbox.js`），该处理器执行工具。
    6.  工具结果流式传输回前端，`ChatApiHandler` 将其发送回模型以继续对话。
*   **Gemini 图像渲染的特殊考虑**:
    *   **问题**: `python_sandbox` 工具可以生成 Base64 图像。最初，Gemini 模型无法渲染这些图像，因为默认的系统提示词 (`Tool_assistant`) 指示模型*不要*在最终回复中包含完整的 Base64 字符串以节省 token，这个指令 Qwen 的架构可以处理，但 Gemini 的无法处理。
    *   **解决方案**: 在 `config.js` 中创建了一个专用的系统提示词 `Tool_gemini`。这个提示词**省略了限制性指令**，允许 Gemini 模型在其最终的 Markdown 输出中正确包含完整的 Base64 图像数据，然后前端可以渲染该图像。这突显了提示词工程对于管理模型特定行为的重要性。
*   **完整工具集 (模型相关)**:
    *   **默认工具 (所有模型)**: `GoogleSearchTool`, `WeatherTool`。
    *   **Qwen 模型**: 完整的 `mcpTools` 集，包括 `tavily_search`, `python_sandbox`, `firecrawl` 等。
    *   **Gemini 模型 (`gemini-2.5-flash`)**: 一个精选的 `geminiMcpTools` 集，仅包含 `tavily_search`, `python_sandbox` 和 `firecrawl`。
*   **如何改进 HTTP 连接的工具**:
    *   **添加/修改新工具 (例如 MCP 工具)**:
        1.  在 [`src/static/js/tools_mcp/tool-definitions.js`](src/static/js/tools_mcp/tool-definitions.js) 中定义新的工具声明，并将它们添加到 `mcpTools` 数组中。
        2.  在 [`src/static/js/config/config.js`](src/static/js/config/config.js) 中，为目标 HTTP 模型的配置对象（例如 `gemini-2.5-flash-lite-preview-06-17`）添加或修改 `tools: mcpTools` 属性。
        3.  如果新的 MCP 工具需要自定义后端处理，可能需要修改 `src/mcp_proxy/mcp-handler.js` 或在 `src/mcp_proxy/handlers/` 下添加新的处理器。
    *   **添加/修改默认工具 (Google Search, Weather)**:
        1.  修改 [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js) 以注册新的工具类，并创建相应的工具实现文件（例如 `src/static/js/tools/new-tool.js`）。
        2.  修改相应工具类（例如 `src/static/js/tools/google-search.js`）中的 `getDeclaration()` 和 `execute()` 方法。
    *   **修改工具声明或执行逻辑**: 调整相应工具类（例如 `src/static/js/tools/google-search.js` 或在 `src/static/js/tools_mcp/tool-definitions.js` 中定义的工具）中的 `getDeclaration()` 或 `execute()` 方法。
    *   **修改前端工具合并逻辑**: 如果需要调整 HTTP 连接下工具声明的合并策略，请修改 [`src/static/js/chat/chat-api-handler.js`](src/static/js/chat/chat-api-handler.js) 中的相关逻辑。

## 10. 深度研究代理系统 (Deep Research Agent System) - 中间件架构升级版（V2.1）

### 10.1 系统概述与架构重构

深度研究代理系统已经过重大重构，从单体架构演进为**模块化中间件架构**。新的架构将核心功能拆分为独立的中间件和服务模块，由 `DeepResearchAgent` 作为协调器进行统一管理。

#### 10.1.1 重构后的核心组件

1. **DeepResearchAgent (协调器)**: 
   - 负责整体研究流程的协调和控制
   - 管理迭代循环和终止条件
   - 处理错误恢复和重试逻辑
   - 提供向后兼容的代理方法

2. **ToolExecutionMiddleware (工具执行中间件)**:
   - **核心功能**: 处理所有工具调用的执行和错误处理
   - **虚拟专家接管系统**: 专门处理 `code_generator` 委托，调用专家模型生成高质量代码
   - **代码急诊室**: 智能修复有问题的Python代码，自动处理空赋值和语法错误
   - **知识集成**: 与联邦知识系统集成，提供工具使用指南
   - **URL去重系统**: 防止重复访问相同或相似的URL
   - **智能摘要**: 对工具输出进行智能摘要，优化信息密度
   - **状态同步**: 实时同步工具执行状态到StateManager

3. **ReportGeneratorMiddleware (报告生成中间件)**:
   - **核心功能**: 处理报告生成、后处理和时效性质量评估
   - **多模式报告生成**: 支持深度研究、学术论文、商业分析、技术文档、标准报告和数据挖掘模式
   - **模板系统集成**: 动态加载报告模板，提供专业化的报告结构
   - **智能数据管理**: 从数据总线中智能提取和优化证据数据
   - **时效性质量评估**: 生成详细的时效性质量评估报告
   - **计划完成度计算**: 智能计算研究计划的完成程度
   - **引用映射系统**: 自动处理文中引用和来源映射

4. **StateManager (状态服务)**:
   - **统一状态管理**: 集中管理所有共享状态（数据总线、访问URL、生成图像等）
   - **数据总线系统**: 提供智能数据存储和检索，支持结构化数据处理
   - **运行状态跟踪**: 管理研究运行的元数据和性能指标
   - **状态持久化和清理**: 自动清理过期数据，防止内存泄漏

5. **DataMiningEngine (数据挖掘引擎)**:
   - **专门的数据挖掘模式**: 处理需要结构化数据收集和呈现的研究任务
   - **数据质量评估**: 自动评估收集数据的完整性和质量
   - **结构化报告生成**: 生成包含数据表格的标准化报告
   - **完成条件检查**: 智能判断数据挖掘任务的完成度
   - **模板兼容性**: 完全兼容ReportTemplates.js中的数据挖掘模板
   - **实时监控**: 支持AgentThinkingDisplay的实时数据展示

6. **AgentThinkingDisplay (代理思考过程显示器)**:
   - **实时监控面板**: 提供可视化界面展示深度研究代理的思考过程
   - **研究状态可视化**: 显示研究统计、搜索记录和执行日志
   - **工具调用跟踪**: 实时跟踪工具调用状态和成功率
   - **事件系统集成**: 与CallbackManager深度集成，支持结构化事件流
   - **折叠状态管理**: 智能的界面折叠状态管理，提升用户体验
   - **性能指标展示**: 显示Token消耗、执行时间等关键性能指标

#### 10.1.2 AgentThinkingDisplay 核心功能

AgentThinkingDisplay 提供了以下关键功能：

1. **研究监控面板**:
   - 实时显示研究进度和状态
   - 展示搜索记录和工具调用统计
   - 提供执行日志查看功能

2. **状态同步修复**:
   - 修复工具调用状态同步问题
   - 确保成功率统计的准确性
   - 优化折叠状态管理，避免状态丢失

3. **事件监听系统**:
   - 监听深度研究代理的所有关键事件
   - 实时更新界面状态
   - 提供详细的研究完成总结

4. **用户友好的界面**:
   - 可折叠的界面设计，节省屏幕空间
   - 响应式布局，支持移动端
   - 直观的数据可视化展示

#### 10.1.3 DataMiningEngine 核心功能

DataMiningEngine 提供了以下关键功能：

1. **数据挖掘模式支持**:
   - 专门处理数据密集型研究任务
   - 智能检测用户场景（科技产品对比、金融数据、商业市场分析等）
   - 完全兼容ReportTemplates中的数据挖掘模板

2. **结构化数据收集**:
   - 智能表格数据提取和整理
   - 数据质量评估和分级
   - 来源标注和引用管理

3. **完成条件智能判断**:
   - 基于数据质量、表格数量和来源多样性的终止条件
   - 自适应迭代控制
   - 信息增益检测

4. **纯数据报告生成**:
   - 生成无描述性语言的纯数据报告
   - 支持质量等级标注
   - 保持数据原始性和完整性

#### 10.1.4 中间件架构优势

新的中间件架构提供了以下关键优势：

- **职责分离**: 每个中间件专注于单一职责，提高代码可维护性
- **可测试性**: 独立的模块便于单元测试和集成测试
- **可扩展性**: 容易添加新的中间件或修改现有功能
- **并行处理潜力**: 中间件架构支持未来的并行处理优化
- **错误隔离**: 一个中间件的错误不会影响其他中间件的运行
- **实时监控**: AgentThinkingDisplay提供全面的实时监控能力
- **数据驱动**: DataMiningEngine增强了对数据密集型任务的支持

### 10.2 AgentLogic 智能升级

#### 10.2.1 数据总线集成系统

`AgentLogic.js` 新增了强大的数据总线集成系统，为Agent提供智能记忆库：

```javascript
// 数据总线智能激活协议
const dataBusIntelligenceProtocol = `
## 🧠 数据总线智能激活协议 (Data Bus Intelligence Protocol)

### 📊 你有一个隐藏的"记忆库"：数据总线 (Data Bus)
**重要发现**：系统已经为你存储了先前步骤的关键数据！这些数据可以：
- ✅ 避免重复搜索相同信息
- ✅ 快速回顾历史发现
- ✅ 建立信息之间的关联
- ✅ 提升研究效率30%以上

### 🎯 智能数据复用策略

#### 策略A：关键词匹配复用
**当你计划搜索时，先检查数据总线：**
1. **提取搜索关键词**：从查询中提取核心名词
2. **扫描数据总线**：查找包含相同关键词的历史数据
3. **复用决策**：
   - 如果历史数据相关度>80%，直接复用并补充新角度
   - 如果相关度50-80%，快速浏览后决定是否需要新搜索
   - 如果相关度<50%，执行新搜索
`;

// 相似性检测系统
_buildSimilarityDetectionSystem(researchPlan, intermediateSteps, currentStep) {
    // 智能检测历史步骤的相似性，避免重复工作
}
```

#### 10.2.2 PDF 智能规避系统

新增PDF智能处理协议，解决crawl4ai无法处理PDF文件的问题：

```javascript
const pdfIntelligentBypassProtocol = `
## 📄 PDF 智能规避与曲线救国协议 (PDF Bypass Protocol)

### 🚨 核心认知：你无法直接抓取PDF文件
**重要事实**：crawl4ai 工具**无法处理PDF文件**。PDF是二进制文件，不是HTML网页。

### 🧠 智能决策框架：三层次处理策略

#### 第一层：学术论文专用策略（针对arXiv、学术会议）
**场景**：https://arxiv.org/pdf/2501.12345.pdf
**方案**：提取论文ID，访问摘要页 (https://arxiv.org/abs/2501.12345)

#### 第二层：技术报告与文档
**场景**：https://company.com/reports/2025-whitepaper.pdf
**方案**：搜索"公司名 2025 技术报告 摘要"或"whitepaper key findings"

#### 第三层：统计数据与政府报告
**场景**：https://data.gov/statistics/2025-report.pdf
**方案**：搜索"数据名 在线表格"或"交互式数据"
`;
```

#### 10.2.3 模式感知爬取策略

针对不同研究模式提供专门的爬取策略：

```javascript
// 通用爬取核心原则
const universalCrawlPrinciples = `
## 🌐 通用网页抓取核心原则（所有模式共享）

### 🎯 核心目标：质量 > 数量
- **研究目的**：获取**深度信息**，不是收集大量页面
- **成功标准**：抓取到**有实质内容的页面**，不是简单的页面加载成功

### 📊 URL 质量评估体系（通用）
**高质量URL特征（优先选择）：**
1. **新闻报道/深度文章**：URL包含 \`/news/\`、\`/article/\`、\`/blog/\`、\`/posts/\`
2. **静态HTML页面**：URL以 \`.html\` 结尾，参数简单
3. **权威媒体**：知名媒体（OSCHINA、InfoQ、36kr、CSDN、知乎专栏）
4. **发布时间近**：包含 \`2024\`、\`2025\` 等年份，或 \`latest\`、\`recently\`

**低质量URL特征（避免选择）：**
1. **文档模板页面**：URL包含 \`docs.\`、\`api-docs.\`、\`/docs/\`、\`/guide/\`
2. **动态查询页面**：URL包含 \`?query=\`、\`search=\`、\`database=\`
3. **用户交互页面**：URL包含 \`login\`、\`signin\`、\`dashboard\`、\`account\`
4. **侧边栏/导航页**：页面标题模糊（"首页"、"文档"、"目录"）
5. **Google系网站（网络障碍）**：URL包含 \`blog.google\`、\`developers.google.com\`、\`cloud.google.com\`
`;
```

#### 10.2.4 严格格式纪律

新增严格的输出格式纪律，确保Agent响应能被正确解析：

```javascript
const strictFormatProtocol = `
## 🚨【最高优先级】输出格式绝对纪律 (Absolute Format Discipline)

### 你的响应必须且只能是以下三种格式之一：

### 格式A：继续研究（工具调用）
思考: [你的详细推理过程...]
行动: tool_name_here
行动输入: {"parameter1": "value1", "parameter2": "value2"}

### 格式B：生成报告大纲
思考: [判断信息已足够...]
行动: generate_outline
行动输入: {"topic": "报告主题", "key_findings": ["要点1", "要点2"]}

### 格式C：最终答案
思考: [确认研究已完成...]
最终答案:
# 报告标题
## 章节一
内容...
`;
```

#### 10.2.5 工具优化策略

新增工具使用优化策略，特别是针对crawl4ai的限制：

```javascript
const toolOptimizationProtocol = `
## 🛠️ 工具使用策略优化 (Agent Optimization Protocol)

### 🕷️ crawl4ai 使用禁忌与最佳实践:
- **避开交互式页面**: 严禁抓取 URL 中包含 \`query\`, \`search\`, \`database\`, \`easyquery\` 等字样的动态查询页面
- **避开Google系网站**: 严禁尝试抓取 URL 中包含 \`blog.google\`、\`developers.google.com\`、\`cloud.google.com\` 的页面
- **Google官方替代方案**: 当搜索到Google官方内容时，立即寻找第三方权威媒体报道
- **URL健康检查**: 每次选择URL时，先检查是否包含已知问题域名
- **优先选择静态页面**: 优先抓取包含"公报"、"报告"、"文章"、"新闻"字样的 URL
`;

const crawl4aiExtractProtocol = `
## 🚨 【强制约束】crawl4ai Extract 模式使用禁令
 
### 核心限制：
- **Extract 模式** 仅适用于**静态、结构简单**的网页，且必须依赖**精确的 CSS 选择器**
- **Extract 模式** 无法处理复杂的 JavaScript 动态加载内容（如产品详情页）
 
### 🚫 绝对禁止：
- **严禁**对**奢侈品官网、电商平台、复杂新闻网站**的产品详情页使用 \`extract\` 模式
- **严禁**在 \`scrape\` 模式失败后，立即尝试 \`extract\` 模式
`;
```

### 10.3 ToolExecutionMiddleware 详细功能

#### 10.3.1 虚拟专家接管系统

`ToolExecutionMiddleware` 的核心创新是虚拟专家接管系统，专门处理 `code_generator` 工具：

```javascript
// 虚拟专家接管流程
async _delegateToCodeExpert(parameters, detectedMode, recordToolCall) {
    // 1. 从联邦知识库获取完整技能包
    // 2. 智能数据上下文构建（从数据总线获取实际数据）
    // 3. 构建专家提示词（融合知识库）
    // 4. 呼叫专家模型生成高质量代码
    // 5. 自动转发给沙盒执行
    // 6. 包装结果反馈给经理
}
```

**关键特性**:
- **联邦知识集成**: 从 SkillManager 获取专家知识库
- **数据上下文增强**: 智能从数据总线获取实际数据，避免空赋值
- **代码质量保证**: 激进移除中文标点，增强语法验证
- **自动修复机制**: 代码急诊室自动修复常见错误

#### 10.3.2 代码急诊室

增强的代码急诊室提供多层修复机制：

```javascript
async _repairCodeWithLLM(brokenCode, errorType) {
    // 1. 获取最佳修复上下文（从数据总线提取相关数据）
    // 2. 多层重试机制（最多3次）
    // 3. 增强提示词，明确数据来源和要求
    // 4. 代码质量验证和修复
    // 5. 最小化后备代码生成
}
```

**修复策略**:
- **智能上下文提取**: 从数据总线提取最近的crawl4ai或结构化数据
- **表格优先**: 优先提取和保留表格数据
- **智能截断**: 对超长数据使用智能分段策略
- **格式保留**: 保持数据的结构和格式完整性

#### 10.3.3 URL去重系统

智能URL去重防止重复研究：

```javascript
_checkURLDuplicate(url) {
    // 1. 计算URL相似度（Levenshtein距离）
    // 2. 相似度阈值检查（默认0.85）
    // 3. 重访次数限制（默认2次）
    // 4. 智能缓存查找和返回
}
```

**去重算法**:
- **路径相似度计算**: 基于URL路径的字符串相似度
- **域名匹配**: 相同域名和路径视为相同URL
- **重访计数**: 允许有限次数的重访，避免无限循环
- **缓存优化**: 快速查找已访问URL的缓存结果

### 10.4 ReportGeneratorMiddleware 详细功能

#### 10.4.1 证据集合构建系统

智能证据收集和优化：

```javascript
_buildEvidenceCollection(intermediateSteps, plan, researchMode) {
    // 1. 数据策略选择：根据内容类型、数据长度和研究模式
    // 2. 智能数据选择：从数据总线获取原始数据或增强摘要
    // 3. 结构化数据处理：JSON、表格等结构化数据增强
    // 4. 呈现优化：格式优化但不压缩内容
    // 5. 数据利用率统计：跟踪数据使用效率
}
```

**数据策略类型**:
- **full_original**: 完整原始数据（小于15000字符）
- **enhanced_summary**: 增强摘要（补充关键数据）
- **structured_only**: 仅结构化数据（表格、JSON）
- **hybrid**: 混合模式（摘要+关键部分）
- **step_observation**: 降级到步骤观察

#### 10.4.2 时效性质量评估系统

全面的时效性质量分析：

```javascript
_generateTemporalQualityReport(researchPlan, intermediateSteps, topic, researchMode) {
    // 1. 模型自主评估（来自研究计划的敏感性分析）
    // 2. 系统程序化评估（基于关键词和模式）
    // 3. 计划质量分析（敏感度分布、时序查询覆盖率）
    // 4. 执行质量分析（时序关键词使用、官方来源访问）
    // 5. 综合评分和改进建议
}
```

**评估维度**:
- **模型vs系统一致性**: 检查模型判断与系统评估的一致性
- **计划覆盖度**: 研究计划对时效性的考虑程度
- **执行验证率**: 实际工具调用中的时效性验证行为
- **关键词使用**: 时序性关键词（最新、2024、版本）的使用频率

#### 10.4.3 引用映射系统

智能引用管理和映射：

```javascript
_generateIndependentCitationMapping(reportContent, uniqueSources) {
    // 1. 提取引用标记（支持多种格式：[1]、[1,2]、[来源1]）
    // 2. 处理引用（去重、验证范围）
    // 3. 生成独立引用映射表
    // 4. 附加到报告末尾
}
```

**引用格式支持**:
- **标准格式**: [1]、[2]、[3]
- **多引用格式**: [1, 2, 3]、[1,2,3]
- **中文格式**: [来源1]、[来源2]
- **混合格式**: [1，2]、[1,2，3]

### 10.5 DataMiningEngine 详细功能

#### 10.5.1 智能场景检测系统

DataMiningEngine提供智能的场景检测功能：

```javascript
// 🔥 完全与模板匹配的场景检测器
this.scenarioDetector = {
    scenarios: {
        // 1. 科技产品对比 - 与模板完全一致
        tech_comparison: {
            triggers: ['对比', '比较', 'vs', '哪个好', '参数对比', '规格', '测评', '评测', '对比分析'],
            keywords: ['手机', '电脑', '处理器', 'GPU', '显卡', '相机', '电池', '续航', '价格'],
            priority: 10,
            templateKey: 'tech_comparison' // 与模板中的key完全一致
        },
        // 2. 金融数据 - 与模板完全一致
        financial: {
            triggers: ['股票', '股价', '财报', '财务', '收益', '利润率', '估值', '市盈率', '市净率'],
            keywords: ['营业收入', '净利润', '毛利率', '净资产收益率', '市盈率', '市净率'],
            priority: 9,
            templateKey: 'financial' // 与模板中的key完全一致
        },
        // 3. 商业市场分析 - 与模板完全一致
        business_data: {
            triggers: ['市场', '规模', '份额', '增长率', '竞争格局', '产业链', '行业分析', '投资分析'],
            keywords: ['市场规模', '市场份额', '企业排名', '产业链', '上下游', '财务数据'],
            priority: 8,
            templateKey: 'business_data' // 与模板中的key完全一致
        },
        // 4. 学术研究 - 与模板完全一致
        academic_data: {
            triggers: ['论文', '研究', '实验', '方法', '引用', '学术', '期刊', '会议', '参考文献'],
            keywords: ['实验数据', '研究方法', '引用次数', '作者', '发表时间', '期刊影响因子'],
            priority: 7,
            templateKey: 'academic_data' // 与模板中的key完全一致
        },
        // 5. 通用数据（默认） - 与模板完全一致
        generic: {
            triggers: [],
            keywords: [],
            priority: 0,
            templateKey: 'generic' // 与模板中的key完全一致
        }
    },
    detectionCache: new Map()
};
```

#### 10.5.2 数据挖掘完成条件检查

智能判断数据挖掘任务何时完成：

```javascript
checkDataMiningCompletion(intermediateSteps, allSources, iterations) {
    // 检查是否达到最小表格要求
    const totalTables = this.extractAllStructuredData(intermediateSteps, false).length;
    const hasEnoughTables = totalTables >= this.config.minDataTables;
    
    // 检查是否达到最小来源要求
    const hasEnoughSources = allSources.length >= this.config.minSources;
    
    // 检查数据质量（使用模板兼容的评级）
    const dataQuality = this.assessDataQuality(intermediateSteps, allSources);
    const hasGoodQuality = dataQuality.overall_score >= this.config.dataQualityThreshold;
    
    // 决策矩阵
    const shouldTerminate = (
        (hasEnoughTables && hasEnoughSources && hasGoodQuality) ||
        (hasReachedMaxIterations && hasEnoughSources) ||
        (!hasRecentGain && iterations >= 3)
    );
    
    return shouldTerminate;
}
```

#### 10.5.3 纯数据报告生成

生成无描述性语言的纯数据报告：

```javascript
buildDataMiningPrompt(topic, intermediateSteps, plan, sources, userInstruction, template, promptFragment, dataBus = null) {
    // 1. 智能场景检测（兼容模板版本）
    const detectedScenario = this.detectUserScenarioCompatible(topic, userInstruction, intermediateSteps, template);
    
    // 2. 数据模式检测
    const detectedPattern = this.detectDataPattern(intermediateSteps);
    
    // 3. 提取所有结构化数据
    const structuredData = this.extractAllStructuredData(intermediateSteps, true, dataBus);
    
    // 4. 数据质量评估（使用模板兼容的评级）
    const dataQuality = this.assessDataQuality(intermediateSteps, sources);
    
    // 5. 构建数据挖掘专用提示词
    // ...
}
```

### 10.6 AgentThinkingDisplay 详细功能

#### 10.6.1 状态同步修复

AgentThinkingDisplay 解决了关键的状态同步问题：

```javascript
// ✨✨✨ 核心修复1：每次渲染时即时计算成功调用次数 ✨✨✨
renderSession() {
    // 🎯 修复：正确计算工具调用统计数据
    const queryCount = researchState.queryLog?.length || 0;
    const sourcesCount = researchState.collectedSources?.length || 0;
    const toolCallsCount = researchState.toolCalls?.length || 0;
    
    // ✨✨✨ 核心修复1：每次渲染时即时计算成功调用次数 ✨✨✨
    const successfulTools = researchState.toolCalls?.filter(t => {
        // 多种方式确保成功状态的正确识别
        if (t.success === true) return true;
        if (t.success === 'true') return true;
        if (String(t.success).toLowerCase() === 'true') return true;
        return false;
    })?.length || 0;
    
    // ... 渲染界面
}
```

#### 10.6.2 折叠状态管理

智能的折叠状态管理系统：

```javascript
// 🎯 修复：折叠状态管理 - 只在会话开始时初始化
startSession(userMessage, maxIterations = 6, researchData = {}) {
    // 🎯 修复：只在会话开始时初始化折叠状态
    // 如果已经有折叠状态，保持现有状态；否则初始化默认状态
    if (Object.keys(this.sectionStates).length === 0) {
        this.sectionStates = {
            'user-query-content': false, // 研究主题 - 默认展开（新增）
            'stats-content': false,      // 研究统计 - 默认展开
            'query-log-content': false,  // 搜索记录 - 默认折叠
            'execution-log-content': false // 执行日志 - 默认折叠
        };
    }
    
    // 🎯 修复：只在启动时自动折叠整个面板
    this.container.classList.add('minimized');
}
```

#### 10.6.3 事件监听系统

完整的深度研究事件监听：

```javascript
setupEventListeners() {
    const handlers = {
        'research:start': (event) => {
            // 开始研究会话
        },
        'research:plan_generated': (event) => {
            // 研究计划生成
        },
        'research:progress': (event) => {
            // 研究进度更新
        },
        'research:tool_start': (event) => {
            // 工具开始执行
        },
        'research:tool_end': (event) => {
            // 工具执行结束
        },
        'research:stats_updated': (event) => {
            // 统计信息更新
        },
        'research:tool_called': (event) => {
            // 工具调用记录
        },
        'research:end': (event) => {
            // 研究结束
        }
    };
}
```

#### 10.6.4 研究完成总结

提供详细的研究完成总结：

```javascript
addDeepResearchSummary(finalResult = {}) {
    const { researchState, startTime, endTime } = this.currentSession;
    const totalTime = ((endTime - startTime) / 1000).toFixed(1);
    
    const queryCount = researchState.queryLog?.length || 0;
    const sourcesCount = researchState.collectedSources?.length || 0;
    const toolCallsCount = researchState.toolCalls?.length || 0;
    const successfulTools = researchState.toolCalls?.filter(t => t.success === true)?.length || 0;
    const tokenUsage = researchState.metrics?.tokenUsage || { total_tokens: 0 };
    
    const summary = `
🔍 DeepResearch 执行完成！
• 研究主题: ${this.currentSession.userMessage}
• 搜索次数: ${queryCount}次
• 收集来源: ${sourcesCount}个
• 工具调用: ${toolCallsCount}次 (成功: ${successfulTools}次)
• Token消耗: ${tokenUsage.total_tokens.toLocaleString()}
• 总用时: ${totalTime}秒
• 完成时间: ${new Date().toLocaleTimeString()}`;
    
    this.addExecutionLog(summary, 'summary');
}
```

### 10.7 核心研究流程

#### 10.7.1 研究执行流程

```javascript
async conductResearch(researchRequest) {
    // 阶段1：研究初始化
    // - 创建运行ID，初始化状态管理器
    // - 设置中间件运行上下文
    // - 重置知识注入状态
    // - 初始化AgentThinkingDisplay会话
    
    // 阶段2：智能规划
    // - 使用AgentLogic生成研究计划
    // - 传递历史上下文和用户原始指令
    // - 计算研究模式和完成度评估
    
    // 阶段3：自适应执行
    // - 迭代执行研究计划（最多maxIterations次）
    // - 在每一步：思考->解析->执行工具->存储结果
    // - 实时更新AgentThinkingDisplay状态
    // - 智能终止条件：信息增益阈值、计划完成度、数据挖掘完成条件
    
    // 阶段4：报告生成
    // - 数据挖掘模式使用DataMiningEngine生成纯数据报告
    // - 其他模式使用ReportGeneratorMiddleware生成标准报告
    // - 生成时效性质量评估
    // - 发送完成事件并返回结果
    // - 更新AgentThinkingDisplay完成状态
}
```

#### 10.7.2 工具执行流程

```javascript
// 工具执行由ToolExecutionMiddleware处理，同时更新监控面板
const { rawObservation, toolSources, toolSuccess } = 
    await this.toolExecutor.executeToolWithKnowledge(
        toolName,
        parameters,
        thought,
        this.intermediateSteps,
        detectedMode,
        recordToolCall,
        iterations
    );

// 发送工具调用事件到监控面板
this.callbackManager.emitEvent('research:tool_called', {
    toolName: toolName,
    parameters: parameters,
    success: toolSuccess,
    result: rawObservation
});

// 智能摘要处理
const summarizedObservation = await this._smartSummarizeObservation(
    internalTopic, 
    rawObservation, 
    detectedMode, 
    toolName
);
```

### 10.8 多模式研究支持

#### 10.8.1 研究模式

系统支持六种研究模式，每种有特定的配置和要求：

1. **深度研究模式 (deep)**: 全面深入的分析，多角度辩证思考
2. **学术论文模式 (academic)**: 严谨的学术结构，文献综述和引用
3. **商业分析模式 (business)**: 市场洞察，商业影响和战略建议
4. **技术文档模式 (technical)**: 技术架构，实现细节和性能评估
5. **标准报告模式 (standard)**: 清晰的结构，易于理解的报告
6. **数据挖掘模式 (data_mining)**: 结构化数据收集，表格化呈现（DataMiningEngine专用）

#### 10.8.2 数据挖掘引擎

专门的数据挖掘模式处理：

```javascript
// 数据挖掘完成条件检查
checkDataMiningCompletion(intermediateSteps, allSources, iterations) {
    // 检查是否收集到足够的数据表格
    // 检查数据质量是否达到阈值
    // 检查是否达到最大迭代次数
}

// 数据挖掘报告生成
buildDataMiningPrompt(topic, intermediateSteps, researchPlan, sources, instruction, template, promptFragment, dataBus) {
    // 生成纯数据报告的专用提示词
    // 支持数据质量评估和来源标注
    // 完全兼容ReportTemplates模板
}
```

### 10.9 错误处理和恢复

#### 10.9.1 解析错误重试

智能处理LLM输出解析错误：

```javascript
// L1智能重试机制
if (this._isParserError(error)) {
    if (this.parserRetryAttempt < 1) {
        // 生成修正提示词，注入到下一次思考中
        const correctionPrompt = this._generateCorrectionPrompt(
            this.lastDecisionText,
            this.lastParserError.message
        );
        // 重新尝试解析
    }
}
```

#### 10.9.2 重复URL检测

防止重复访问相同或相似的URL：

```javascript
// 重复URL错误修正
if (error.message.includes('[DUPLICATE_URL_ERROR]')) {
    // 强制更换为新URL
    // 或转向研究计划中的下一个子问题
}
```

#### 10.9.3 速率限制处理

智能处理API速率限制：

```javascript
// 遭遇速率限制时
if (error.message.includes('429') || error.message.includes('rate limit')) {
    // 暂停当前操作，调整策略
    // 强制增加"无增益"计数，加速跳出无效循环
    consecutiveNoGain++;
}
```

### 10.10 性能优化

#### 10.10.1 Token使用追踪

实时追踪和优化Token消耗：

```javascript
_updateTokenUsage(usage) {
    this.metrics.tokenUsage.prompt_tokens += usage.prompt_tokens || 0;
    this.metrics.tokenUsage.completion_tokens += usage.completion_tokens || 0;
    this.metrics.tokenUsage.total_tokens += usage.total_tokens || 0;
    
    // 更新监控面板的Token统计
    this.callbackManager.emitEvent('research:stats_updated', {
        metrics: { tokenUsage: this.metrics.tokenUsage }
    });
}
```

#### 10.10.2 内存管理

通过中间件进行智能内存管理：

```javascript
// 数据总线自动清理（在ReportGeneratorMiddleware中）
_cleanupDataBus() {
    // 保留最近N个步骤的数据
    // 清理过期数据，释放内存
}
```

#### 10.10.3 延迟优化

根据研究模式添加智能延迟：

```javascript
// 非标准模式添加延迟，降低请求频率
if (researchMode && researchMode !== 'standard') {
    await new Promise(resolve => setTimeout(resolve, 500));
}
```

### 10.11 向后兼容性

系统提供完整的向后兼容代理方法：

```javascript
// 代理方法确保现有代码继续工作
async _executeToolCall(toolName, parameters, detectedMode, recordToolCall) {
    console.warn(`使用已弃用的方法，请更新为使用toolExecutor`);
    return await this.toolExecutor.executeToolCall(...);
}

async _generateFinalReport(...) {
    console.warn(`使用已弃用的方法，请更新为使用reportGenerator`);
    return await this.reportGenerator.generateFinalReport(...);
}
```

### 10.12 使用指南

用户可以通过关键词触发不同的研究模式：

```javascript
// 关键词映射
const keywords = {
    '学术论文': 'academic', 
    '商业分析': 'business',
    '技术文档': 'technical',
    '深度研究': 'deep',
    '标准报告': 'standard',
    '数据挖掘': 'data_mining'
};

// 使用示例
// "人工智能伦理问题 深度研究"
// "机器学习算法比较 学术论文"
// "电动汽车市场分析 商业分析"
// "微服务架构设计 技术文档"
// "莎士比亚生平介绍 标准报告"
// "股票价格数据分析 数据挖掘"
```

### 10.13 架构优势

#### 10.13.1 模块化优势

- **职责分离**: 每个中间件专注于单一职责
- **可测试性**: 独立的模块便于单元测试
- **可维护性**: 修改一个模块不影响其他模块
- **可扩展性**: 容易添加新的中间件或服务

#### 10.13.2 性能优势

- **状态统一管理**: 避免状态不一致和内存泄漏
- **智能资源管理**: 按需加载和清理资源
- **并行处理潜力**: 中间件架构支持未来的并行处理
- **实时监控**: AgentThinkingDisplay提供全面的性能监控

#### 10.13.3 数据驱动优势

- **专业数据挖掘**: DataMiningEngine提供专业的数据挖掘能力
- **结构化数据处理**: 智能表格提取和质量评估
- **模板兼容性**: 完全兼容现有报告模板系统
- **纯数据输出**: 支持无描述性语言的纯数据报告

#### 10.13.4 开发体验

- **清晰的事件流**: 通过CallbackManager提供结构化事件
- **完善的日志**: 详细的执行日志便于调试
- **向后兼容**: 确保现有代码继续工作
- **配置灵活**: 支持动态配置和运行时调整
- **实时监控**: AgentThinkingDisplay提供可视化调试界面

深度研究代理系统的中间件架构重构显著提升了系统的可维护性、性能和扩展性。新增的AgentThinkingDisplay和DataMiningEngine模块分别提供了实时监控和专业数据挖掘能力，同时保持了与现有系统的完全兼容性，为用户提供更加稳定和高效的研究体验。

---

## 11. Vision 模块技术实现细节

### 11.1 核心函数与架构

#### 11.1.1 初始化系统

```javascript
// vision-core.js 中的关键函数:

// 初始化 Vision 功能核心
export function initializeVisionCore(el, manager, handlersObj)

// 设置视觉模式激活状态
export function setVisionActive(active)

// 清空 Vision 聊天历史
export function clearVisionHistory()

// 内部核心消息发送逻辑
async function _sendMessage(text, files)

// 处理视觉消息发送
async function handleSendVisionMessage()
```

#### 11.1.2 UI 适配器系统

```javascript
// 创建 Vision 专用的 UI 适配器
function createVisionUIAdapter() {
    return {
        createAIMessageElement: createVisionAIMessageElement,
        displayUserMessage: displayVisionUserMessage,
        displayToolCallStatus: (toolName, args) => {
            // Vision 专用的工具调用状态显示
        },
        displayImageResult: (base64Image, altText, fileName) => {
            // Vision 专用的图像结果显示
        },
        scrollToBottom: scrollVisionToBottom,
        logMessage: (message, type) => {
            // Vision 专用的日志记录
        }
    };
}
```

#### 11.1.3 国际象棋集成

```javascript
// 生成对局总结 - 复用 ChatApiHandler
async function generateGameSummary()

// 在视觉聊天界面显示消息
export function displayVisionMessage(markdownContent)

// 供外部模块调用的直接消息发送函数
window.sendVisionMessageDirectly = async function(messageText)
```

### 11.2 配置与状态管理

#### 11.2.1 模型配置

Vision 模式使用专用的模型配置：

```javascript
// config.js 中的 Vision 配置
VISION: {
    MODELS: [
        // 专门的视觉模型列表
    ],
    PROMPTS: [
        // 包括国际象棋专用提示词
        {
            id: 'chess_teacher',
            name: '国际象棋老师',
            description: '对弈指导和局面分析'
        },
        {
            id: 'chess_summary', 
            name: '赛后总结（仅用于总结按钮）',
            description: '专门的赛后分析和总结'
        }
    ]
}
```

#### 11.2.2 状态隔离

Vision 模式维护完全独立的状态：

```javascript
// Module-level state for Vision
let elements = {};
let attachmentManager = null;
let showToastHandler = null;
let chatApiHandlerInstance = null; // Vision 模式专属的 API Handler
let isVisionActive = false; // 视觉模式激活状态
let handlers = {}; // 保存 handlers 对象
```

### 11.3 优势总结

#### 11.3.1 架构优势

-   **统一性**: Vision 和 Chat 模式使用相同的底层 API 处理机制
-   **模块化**: 清晰的职责分离，易于维护和扩展
-   **一致性**: 统一的错误处理、工具调用和流式响应
-   **性能**: 独立的状态管理，避免模式间相互干扰

#### 11.3.2 功能完整性

-   **完整工具链**: 支持所有 MCP 工具调用
-   **国际象棋集成**: 完整的国际象棋大师 AI 功能
-   **多模态支持**: 图像、视频、文本的多模态处理
-   **历史管理**: 独立的会话存储和恢复

#### 11.3.3 开发者体验

-   **清晰文档**: 完善的代码注释和架构说明
-   **易于扩展**: 模块化的设计便于添加新功能
-   **调试友好**: 统一的日志系统和错误处理
-   **配置灵活**: 支持模型和提示词的动态配置

---

## 12. 增强技能管理器 (EnhancedSkillManager) - 联邦知识系统升级版

### 12.1 核心架构概述

`EnhancedSkillManager` 已从简单的技能匹配器升级为**联邦知识系统**，实现了智能知识检索、压缩和按需注入的能力。系统现在支持跨工具的知识共享和动态优化，显著提升了Agent在处理复杂任务时的表现。

#### 12.1.1 主要升级功能

1. **联邦知识库**: 集成 `knowledgeFederation` 系统，支持跨工具的知识共享
2. **智能压缩算法**: 根据研究模式和上下文自动压缩知识内容
3. **缓存系统**: 多级缓存机制减少重复检索
4. **执行历史增强**: 基于历史数据优化工具选择
5. **研究专用匹配**: 为DeepResearch模式提供优化的技能匹配算法

### 12.2 联邦知识检索系统

#### 12.2.1 智能检索流程

```javascript
async retrieveFederatedKnowledge(toolName, context = {}, options = {}) {
    // 1. 检查是否已经注入过（同一个会话中）
    if (this.hasBeenInjected(sessionId, toolName) && iteration > 0) {
        return this.getKnowledgeReference(toolName, context);
    }

    // 2. 检查缓存（5分钟内有效）
    if (this.knowledgeCache.has(cacheKey)) {
        return this.formatKnowledgeForIteration(cached, context, iteration);
    }

    // 3. 获取原始知识
    const rawKnowledge = await this._getRawFederatedKnowledge(toolName, context);

    // 4. 智能压缩内容（核心优化）
    const compressedContent = await this.compressKnowledge(
        rawKnowledge.content,
        compression,
        maxChars,
        context.userQuery
    );

    // 5. 缓存并记录
    this.knowledgeCache.set(cacheKey, processed);
    this.recordInjection(sessionId, toolName);

    // 6. 根据迭代次数格式化输出
    return this.formatKnowledgeForIteration(processed, context, iteration);
}
```

#### 12.2.2 智能章节推断

增强的章节推断系统使用混合策略匹配：

```javascript
_inferRelevantSections(context) {
    // 1. 精确关键词匹配 + 优先级评分
    const keywordPatterns = [
        { patterns: ['数据清洗'], sections: ['数据清洗与分析', 'pandas_cheatsheet'], score: 1.0 },
        { patterns: ['数据分析'], sections: ['数据清洗与分析', 'pandas_cheatsheet'], score: 0.9 },
        // ... 更多模式
    ];

    // 2. 模糊匹配（分词+语义相似度）
    const semanticGroups = {
        'data': ['数据', 'dataset', 'dataframe'],
        'analysis': ['分析', 'analyze', 'process'],
        // ... 更多语义组
    };

    // 3. 上下文增强（考虑之前的工具调用历史）
    const recentTools = toolCallHistory.slice(-3).map(h => h.toolName);
    
    // 4. 章节存在性验证
    return Array.from(sections);
}
```

### 12.3 智能压缩算法

#### 12.3.1 多层次压缩策略

系统支持三种压缩级别：

```javascript
async compressKnowledge(content, level, maxChars, userQuery = '') {
    switch (level) {
        case 'minimal':
            // 最小化：只保留最关键的部分
            compressed = this.extractMinimalGuide(content);
            break;
            
        case 'reference':
            // 引用模式：不注入内容，只给提示
            compressed = this.createKnowledgeReference(content);
            break;
            
        case 'smart':
        default:
            // 智能压缩：根据查询提取相关部分
            compressed = await this.smartCompress(content, maxChars, userQuery);
            break;
    }
    
    return compressed;
}
```

#### 12.3.2 最小化指南提取

```javascript
extractMinimalGuide(content) {
    // 1. 提取通用调用结构（最重要！）
    const structureMatch = content.match(/## 🎯 【至关重要】通用调用结构[\s\S]*?(?=\n##\s|$)/i);
    
    // 2. 提取常见错误（第二重要）
    const errorsMatch = content.match(/### ❌ 常见致命错误[\s\S]*?(?=\n##\s|$)/i);
    
    // 3. 提取关键指令
    const instructionsMatch = content.match(/##\s+关键指令[\s\S]*?(?=##|$)/i);
    
    // 4. 后备：返回前3000字符
    if (minimal.length < 500) {
        minimal = content.substring(0, Math.min(3000, content.length)) + '...';
    }
    
    return minimal;
}
```

### 12.4 研究模式专用功能

#### 12.4.1 DeepResearch模式专用技能匹配

```javascript
async findResearchSkills(userQuery, context = {}) {
    // 🎯 获取基础匹配
    const basicMatches = await this.baseSkillManager.findRelevantSkills(userQuery, {
        ...context,
        // 🎯 DeepResearch模式优先使用研究相关工具
        preferredTools: ['tavily_search', 'crawl4ai', 'python_sandbox']
    });
    
    // 🎯 为DeepResearch模式添加研究优化评分
    const researchMatches = basicMatches.map(match => ({
        ...match,
        researchScore: this.calculateResearchScore(match, userQuery),
        researchSuitability: this.assessResearchSuitability(match.toolName)
    })).sort((a, b) => b.researchScore - a.researchScore);
    
    return researchMatches;
}
```

#### 12.4.2 查询复杂度分析

```javascript
analyzeQueryComplexity(userQuery) {
    let complexity = 0;
    
    // 长度复杂度
    if (userQuery.length > 100) complexity += 1;
    if (userQuery.length > 200) complexity += 1;
    
    // 主题复杂度
    const topicSeparators = /[、，,;；]/g;
    const topicCount = (userQuery.match(topicSeparators) || []).length + 1;
    if (topicCount > 2) complexity += 1;
    
    // 关键词复杂度
    const researchKeywords = ['研究', '分析', '调查', '报告', '趋势', '发展', '深度'];
    const keywordCount = researchKeywords.filter(keyword => 
        userQuery.includes(keyword)
    ).length;
    if (keywordCount > 1) complexity += 1;
    
    return Math.min(complexity, 4);
}
```

### 12.5 执行历史增强系统

#### 12.5.1 增强评分算法

```javascript
calculateEnhancedScore(match) {
    const baseScore = match.score;
    const successRate = this.getToolSuccessRate(match.toolName);
    const usage = this.getToolUsage(match.toolName);
    
    if (usage.totalExecutions < 2) {
        return baseScore * 0.7; // 新工具降低权重
    } else if (successRate > 0.8) {
        return baseScore * (0.6 + 0.4 * successRate); // 高成功率工具提升权重
    } else {
        return baseScore * (0.7 + 0.3 * successRate); // 中等成功率工具
    }
}
```

#### 12.5.2 工具使用统计

```javascript
getToolUsage(toolName) {
    const history = this.executionHistory[toolName] || [];
    const successfulExecutions = history.filter(entry => entry.success).length;
    
    return {
        totalExecutions: history.length,
        successfulExecutions,
        lastUsed: history.length > 0 ? Math.max(...history.map(e => e.timestamp)) : null,
        averageExecutionTime: history.length > 0 
            ? history.reduce((sum, e) => sum + (e.executionTime || 0), 0) / history.length 
            : 0,
        // 🎯 新增：模式使用统计
        modeUsage: this.getModeUsage(toolName)
    };
}
```

### 12.6 工具执行记录

#### 12.6.1 结构化记录系统

```javascript
recordToolExecution(toolName, parameters, success, result, error = null) {
    const entry = {
        timestamp: Date.now(),
        toolName,
        parameters: this.sanitizeParameters(parameters),
        success,
        executionTime: result?.executionTime || 0,
        error: error?.message,
        context: {
            userQuery: parameters?.query || parameters?.prompt || 'unknown',
            outputLength: result?.output?.length || 0,
            mode: result?.mode || 'standard' // 🎯 记录调用模式
        }
    };
    
    this.saveExecution(entry);
    console.log(`[EnhancedSkillManager] 记录工具执行: ${toolName}, 模式: ${entry.context.mode}, 成功: ${success}`);
}
```

### 12.7 缓存与状态管理

#### 12.7.1 多级缓存系统

```javascript
// 知识缓存：tool -> {full, summary, compressed, timestamp}
this.knowledgeCache = new Map();

// 注入历史：sessionId -> [toolNames]
this.injectionHistory = new Map();

// 最大知识库字符数
this.maxKnowledgeChars = 15000;
```

#### 12.7.2 压缩状态跟踪

```javascript
formatKnowledgeForIteration(knowledge, context, iteration) {
    // 第一次迭代：详细指南
    if (iteration === 0) {
        return {
            tool: knowledge.tool,
            metadata,
            content: `## 🛠️ 详细工具指南: ${metadata.name}\n\n` +
                    `**核心功能**: ${metadata.description}\n\n` +
                    `📖 **操作指南** (已智能压缩: ${originalLength} → ${compressedLength} 字符):\n\n` +
                    content,
            isCompressed: true
        };
    }
    
    // 后续迭代：只给关键提示
    return {
        tool: knowledge.tool,
        metadata,
        content: `## 🛠️ 工具提示: ${metadata.name}\n\n` +
                `**关键提醒**: ${this.extractKeyBulletPoints(content, 2)}\n\n` +
                `*完整指南已在步骤0提供。*`,
        isReference: true
    };
}
```

### 12.8 降级和容错机制

#### 12.8.1 备用技能管理器

```javascript
createFallbackSkillManager() {
    return {
        findRelevantSkills: async (userQuery, context = {}) => {
            try {
                const baseSkillManager = await getBaseSkillManager();
                if (baseSkillManager && baseSkillManager.findRelevantSkills) {
                    return baseSkillManager.findRelevantSkills(userQuery, context);
                }
            } catch (error) {
                console.warn('重用技能系统失败，使用简化降级:', error);
            }
            
            // 🎯 真正的降级：极简匹配
            return this.simplifiedFallback(userQuery, context);
        }
    };
}
```

#### 12.8.2 极简匹配算法

```javascript
simplifiedFallback(userQuery, context = {}) {
    const availableTools = context.availableTools || [];
    const matches = [];
    const lowerQuery = userQuery.toLowerCase();
    
    // 🎯 只做最基本的工具名匹配
    availableTools.forEach(toolName => {
        if (lowerQuery.includes(toolName.replace('_', ' '))) {
            matches.push({
                toolName,
                score: 0.8,
                category: this.getToolCategory(toolName)
            });
        }
    });
    
    return matches;
}
```

### 12.9 性能优化

#### 12.9.1 异步初始化

```javascript
constructor() {
    // ... 初始化属性
    
    this.initializationPromise = this.initialize();
    this.initializationResolve = null;
    this.initializationReject = null;
    
    // 🎯 创建等待机制
    this.readyPromise = new Promise((resolve, reject) => {
        this.initializationResolve = resolve;
        this.initializationReject = reject;
    });
}

// 🎯 新增：等待初始化完成的方法
async waitUntilReady() {
    return this.readyPromise;
}
```

#### 12.9.2 按需知识检索

系统采用按需检索策略，避免一次性加载所有知识：

1. **首次使用**: 提供完整的工具指南
2. **后续使用**: 提供引用和关键提示
3. **会话内重复**: 避免重复注入相同内容
4. **缓存优化**: 5分钟缓存有效期内复用结果

### 12.10 与深度研究代理的集成

#### 12.10.1 在Orchestrator中的使用

```javascript
// Orchestrator.js 中的集成
constructor(chatApiHandler, config = {}) {
    this.skillManager = null;
    // ...
}

async _realInitialize() {
    this.skillManager = new EnhancedSkillManager();
    await this.skillManager.waitUntilReady();
    // ...
}
```

#### 12.10.2 知识注入策略

```javascript
// 优化版技能注入生成 - 为Agent模式完全跳过普通技能系统
async generateOptimizedInjection(userQuery, detectedMode) {
    console.log(`\n[Orchestrator] 🎯 AGENT管道启动`);
    console.log(`  模式: ${detectedMode}`);
    console.log(`  查询: ${userQuery.substring(0, 80)}...`);
    console.log(`  策略: Agent专用联邦知识库，按需自主检索`);
    
    // 🚀 直接返回空，让Agent使用自己的知识注入系统
    return { 
        injectionContent: '', 
        relevantSkills: [],
        skipReason: 'agent_dedicated_pipeline'
    };
}
```

### 12.11 优势总结

#### 12.11.1 性能优势

- **智能缓存**: 减少重复的知识检索和处理
- **压缩优化**: 根据使用场景动态压缩知识内容
- **按需加载**: 避免一次性加载所有知识，减少内存占用
- **异步初始化**: 不阻塞主应用程序启动

#### 12.11.2 功能优势

- **联邦知识**: 支持跨工具的知识共享和复用
- **智能匹配**: 基于历史和上下文的优化匹配算法
- **研究专用**: 为DeepResearch模式提供定制化支持
- **降级容错**: 确保在基础系统不可用时的功能连续性

#### 12.11.3 开发体验

- **模块化设计**: 清晰的职责分离，易于维护
- **可扩展性**: 支持新的知识和压缩算法
- **调试友好**: 详细的日志和状态追踪
- **向后兼容**: 保持与现有系统的兼容性

`EnhancedSkillManager` 的升级显著提升了系统的知识管理能力，为复杂的AI代理任务提供了强大的知识支持和优化工具选择能力。