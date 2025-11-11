# CLAUDE.md

该文件为 Claude Code (claude.ai/code) 在处理此仓库代码时提供指导。

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
            -   **深度研究代理 (`src/static/js/agent/deepresearch/`)**: **新增模块** - 专注于深度研究任务的代理系统。
                -   [`DeepResearchAgent.js`](src/static/js/agent/deepresearch/DeepResearchAgent.js): **新增模块** - 深度研究代理的核心执行器，负责管理整个研究过程，包括规划、执行和生成报告。
                -   [`AgentLogic.js`](src/static/js/agent/deepresearch/AgentLogic.js): **新增模块** - 深度研究代理的思考核心，负责生成研究计划和每一步的决策。
                -   [`OutputParser.js`](src/static/js/agent/deepresearch/OutputParser.js): **新增模块** - 解析 LLM 响应，决定下一步行动（ReAct 格式），支持最终答案和工具调用解析。
                -   [`ReportTemplates.js`](src/static/js/agent/deepresearch/ReportTemplates.js): **新增模块** - 提供不同研究模式的报告模板，包括深度研究、学术论文、商业分析、技术文档和标准报告。
            -   [`CallbackManager.js`](src/static/js/agent/CallbackManager.js): **新增模块** - 增强的回调管理器，支持中间件和 Agent 事件系统，提供结构化事件流管理。
            -   [`Orchestrator.js`](src/static/js/agent/Orchestrator.js): **新增模块** - 智能代理协调器，负责分析用户请求并决定使用标准模式还是深度研究模式。
            -   [`EnhancedSkillManager.js`](src/static/js/agent/EnhancedSkillManager.js): **新增模块** - 增强技能管理器，基于工具执行历史提供智能的技能匹配和优化。
            -   [`AgentThinkingDisplay.js`](src/static/js/agent/AgentThinkingDisplay.js): **新增模块** - 代理思考过程显示组件，实时展示深度研究代理的思考过程、研究进度和工具调用状态。
            -   **工具模块 (`src/static/js/agent/tools/`)**: **新增模块** - Agent 工具系统。
                -   [`BaseTool.js`](src/static/js/agent/tools/BaseTool.js): 所有工具的抽象基类，确保接口一致性
                -   [`ToolImplementations.js`](src/static/js/agent/tools/ToolImplementations.js): 通用代理工具实现，处理所有通过 MCP 代理的工具，支持标准模式和深度研究模式。
            -   [`qwen-agent-adapter.js`](src/static/js/agent/qwen-agent-adapter.js): 充当由 Qwen 模型发起的多云平台 (MCP) 工具调用的客户端适配器。它从 `chat-api-handler.js` 接收工具调用请求（包含 `tool_name` 和 `parameters`），并将它们代理到后端的 `/api/mcp-proxy` 端点。这对于在应用程序内启用灵活的 AI 代理功能至关重要。
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

-   **多模型分析**: 支持使用不同 AI 模型进行局面分析
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

## 10. 深度研究代理系统 (Deep Research Agent System)

本次架构升级引入了一个专注于深度研究任务的代理系统，能够自动分析用户请求，并根据关键词触发不同的研究模式，生成高质量的研究报告。

### 10.1 系统概述

深度研究代理系统是一个模块化的、事件驱动的架构，旨在：

- **多模式研究**: 支持深度研究、学术论文、商业分析、技术文档和标准报告五种研究模式
- **关键词触发**: 通过用户消息中的关键词自动识别和切换研究模式
- **智能规划**: 自动生成详细的研究计划，包括多个研究步骤和搜索关键词
- **自适应执行**: 根据研究进展动态调整研究策略和工具使用
- **结构化报告**: 根据不同研究模式生成符合专业标准的报告

### 10.2 核心组件架构

#### 10.2.1 DeepResearchAgent - 深度研究执行器

[`DeepResearchAgent.js`](src/static/js/agent/deepresearch/DeepResearchAgent.js) 是深度研究代理的核心执行器：

- **研究流程管理**: 管理整个研究过程，包括规划、执行和报告生成
- **迭代控制**: 智能控制研究迭代次数，避免无限循环
- **工具调用协调**: 协调多个工具（如tavily_search、crawl4ai、python_sandbox）进行信息收集
- **进度追踪**: 实时追踪研究进度和收集的信息
- **Token 追踪**: 实时追踪 Token 使用情况，优化成本

```javascript
// 核心研究流程
async conductResearch(researchRequest) {
    // 阶段1：智能规划
    // 阶段2：自适应执行  
    // 阶段3：报告生成
}
```

#### 10.2.2 AgentLogic - 研究逻辑核心

[`AgentLogic.js`](src/static/js/agent/deepresearch/AgentLogic.js) 负责深度研究代理的思考规划：

- **研究计划生成**: 根据主题和研究模式生成详细的研究计划
- **步骤决策**: 在每一步决定下一步行动（继续研究或生成最终答案）
- **多模式支持**: 为不同研究模式提供定制化的提示词和规划逻辑
- **关键词检测**: 自动检测用户消息中的研究模式关键词

```javascript
// 多模式研究计划生成
_getPlannerPrompt(topic, researchMode) {
    const modeConfigs = {
        deep: { ... },      // 深度研究模式
        academic: { ... },  // 学术论文模式
        business: { ... },  // 商业分析模式
        technical: { ... }, // 技术文档模式
        standard: { ... }   // 标准报告模式
    };
}
```

#### 10.2.3 OutputParser - 输出解析器

[`OutputParser.js`](src/static/js/agent/deepresearch/OutputParser.js) 解析 LLM 响应：

- **ReAct 格式解析**: 识别最终答案和工具调用
- **严格格式验证**: 确保 LLM 响应符合预期的行动格式
- **错误恢复**: 解析失败时提供清晰的错误信息和降级方案
- **宽松解析**: 在严格解析失败时尝试宽松解析

#### 10.2.4 ReportTemplates - 报告模板系统

[`ReportTemplates.js`](src/static/js/agent/deepresearch/ReportTemplates.js) 提供多模式报告模板：

- **模板化报告结构**: 为每种研究模式提供专业的报告结构
- **可配置输出**: 支持字数、风格、结构等配置
- **质量要求**: 定义每种模式的质量标准和引用要求

```javascript
// 报告模板配置
export const ReportTemplates = {
    deep: {
        name: "深度研究模式",
        description: "全面的深度分析报告，适合复杂问题研究",
        config: {
            structure: [ ... ],
            wordCount: "2500-3500字",
            style: "专业、深度、辩证",
            requirements: "所有关键数据必须验证并标注来源，包含反对观点"
        }
    },
    // ... 其他模式
};
```

#### 10.2.5 Orchestrator - 智能协调器

[`Orchestrator.js`](src/static/js/agent/Orchestrator.js) 是整个系统的协调器：

- **请求分析**: 分析用户请求，检测研究模式关键词
- **模式路由**: 决定使用标准模式还是深度研究模式
- **资源管理**: 按需初始化深度研究代理组件
- **事件转发**: 将深度研究代理的事件转发到 UI 系统
- **使用指南**: 提供用户指南，帮助用户了解不同研究模式的使用方法

```javascript
// 关键词检测和路由
_detectAndExtractTopic(userMessage) {
    const keywords = {
        '学术论文': 'academic', 
        '商业分析': 'business',
        '技术文档': 'technical',
        '深度研究': 'deep',
        '标准报告': 'standard'
    };
    // 检测逻辑...
}
```

#### 10.2.6 EnhancedSkillManager - 增强技能管理器

[`EnhancedSkillManager.js`](src/static/js/agent/EnhancedSkillManager.js) 在基础技能管理系统之上提供智能优化：

- **执行历史学习**: 基于工具执行成功率动态调整技能匹配权重
- **研究模式优化**: 为深度研究模式优先选择研究相关工具
- **性能分析**: 提供工具使用统计和成功率分析

#### 10.2.7 CallbackManager - 回调管理器

[`CallbackManager.js`](src/static/js/agent/CallbackManager.js) 是整个代理系统的事件中枢：

- **结构化事件流**: 提供标准化的研究事件流
- **中间件系统**: 支持性能监控、智能重试等中间件
- **UI 集成**: 将研究进度和状态实时转发到 UI 组件
- **内存管理**: 自动清理事件历史，防止内存泄漏

#### 10.2.8 AgentThinkingDisplay - 思考过程显示

[`AgentThinkingDisplay.js`](src/static/js/agent/AgentThinkingDisplay.js) 实时展示深度研究代理的思考过程：

- **研究进度可视化**: 显示当前迭代、完成度、收集的来源数量等
- **工具调用记录**: 记录和展示所有工具调用的状态和结果
- **执行日志**: 提供详细的研究执行日志
- **实时统计**: 显示搜索次数、来源数量、Token 消耗等统计信息

#### 10.2.9 工具系统

**BaseTool** ([`BaseTool.js`](src/static/js/agent/tools/BaseTool.js)):
- 所有工具的抽象基类，确保接口一致性
- 统一的工具声明和调用接口

**ToolImplementations** ([`ToolImplementations.js`](src/static/js/agent/tools/ToolImplementations.js)):
- 通用代理工具实现，处理所有通过 MCP 代理的工具
- 支持标准模式和深度研究模式的参数适配
- 智能超时策略和错误处理

### 10.3 工作流程

#### 10.3.1 深度研究流程

1. **请求接收**: Orchestrator 接收用户请求并检测研究模式关键词
2. **模式识别**: 根据关键词识别研究模式（深度研究、学术论文等）
3. **研究规划**: AgentLogic 生成详细的研究计划，包括多个研究步骤
4. **迭代执行**: DeepResearchAgent 执行研究计划，在每一步：
   - 思考下一步行动（使用工具或生成报告）
   - 执行工具调用（搜索、网页抓取等）
   - 收集和整理信息
5. **报告生成**: 根据收集的信息和研究模式生成结构化报告
6. **结果返回**: 将最终报告返回给用户

#### 10.3.2 关键词触发流程

1. **用户输入**: 用户发送包含研究模式关键词的消息
2. **关键词检测**: Orchestrator 检测消息中的关键词并确定研究模式
3. **话题清理**: 从用户消息中移除关键词，得到纯净的研究主题
4. **代理启动**: 启动深度研究代理并传递研究模式和研究主题
5. **研究执行**: 深度研究代理按照指定模式执行研究任务

#### 10.3.3 多模式研究流程

1. **模式配置**: 每种研究模式有特定的配置（步骤数、深度要求、工具偏好）
2. **定制化规划**: 根据研究模式生成定制化的研究计划
3. **专用提示词**: 使用模式专用的提示词和思考框架
4. **模板化报告**: 按照模式专用的模板生成最终报告

### 10.4 集成优势

#### 10.4.1 与现有架构的深度集成

- **统一工具调用**: 复用现有的 MCP 工具调用基础设施
- **共享配置系统**: 使用统一的模型配置和 API 密钥管理
- **兼容现有UI**: 与现有的聊天界面无缝集成，通过事件系统更新研究状态
- **统一错误处理**: 复用现有的错误处理机制

#### 10.4.2 性能优化特性

- **智能迭代控制**: 基于信息增益和计划完成度的提前终止
- **自适应摘要**: 对过长内容进行智能摘要，节省 Token 消耗
- **资源优化**: 按需加载研究组件，减少内存占用
- **Token 追踪**: 实时追踪 Token 使用情况，优化成本

#### 10.4.3 用户体验提升

- **实时进度展示**: 通过 AgentThinkingDisplay 实时展示研究进度
- **透明化过程**: 用户可以看到完整的研究过程和工具调用
- **多模式选择**: 用户可以通过关键词选择不同的研究深度和风格
- **高质量输出**: 生成结构完整、引用准确的专业报告

### 10.5 使用指南

用户可以通过在消息中添加关键词来触发不同的研究模式：

- **深度研究**: "人工智能对未来教育行业的影响 深度研究"
- **学术论文**: "机器学习在医疗诊断中的应用 学术论文"  
- **商业分析**: "2025年电动汽车市场趋势 商业分析"
- **技术文档**: "微服务架构最佳实践 技术文档"
- **标准报告**: "摇滚红与黑的故事和主创 标准报告"

深度研究代理系统显著提升了应用程序处理复杂研究任务的能力，通过智能的研究规划、多模式支持和专业的报告生成，为用户提供了更加深入和结构化的信息获取体验。

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

*文档更新完成：整合了深度研究代理系统的完整架构说明，包括新增的深度研究代理组件、多模式研究支持、关键词触发机制和实时进度监控系统。*
```

主要更新内容：

1. **完全替换第10节**：将原来的"智能代理系统"替换为新的"深度研究代理系统"
2. **更新代理模块文件列表**：在2.2节中添加了新的深度研究代理相关文件
3. **新增组件描述**：
   - DeepResearchAgent.js - 深度研究执行器
   - AgentLogic.js - 研究逻辑核心  
   - OutputParser.js - 输出解析器
   - ReportTemplates.js - 报告模板系统
   - AgentThinkingDisplay.js - 思考过程显示组件
4. **移除旧组件**：移除了WorkflowEngine、WorkflowUI等旧的工作流相关组件
5. **新增功能描述**：
   - 多模式研究支持（深度研究、学术论文、商业分析、技术文档、标准报告）
   - 关键词触发机制
   - 实时进度监控
   - Token使用追踪
   - 使用指南功能

这个更新后的文档准确反映了最新的深度研究代理系统架构，保持了与现有系统的兼容性，同时提供了完整的系统说明。