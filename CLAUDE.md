# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Project Overview

This project is a sophisticated **AI Gateway and Web Application** built entirely on **Cloudflare Workers**. It serves a single-page frontend application and provides a robust backend that acts as a multi-provider API proxy for various AI services.

The primary goal is to offer a unified interface for interacting with different AI models for tasks like chat completions, audio transcription, translation, and image generation.

## 2. Core Architecture & Key Files

The `src` directory is the heart of the application, containing all source code for both the Cloudflare Worker backend and the frontend static assets. Its structure is modular, organizing functionalities into logical subdirectories for clarity and maintainability.

### 2.1 Backend (Cloudflare Worker)

-   **Entry Point**: [`src/worker.js`](src/worker.js:1)
    -   This is the primary entry point for the Cloudflare Worker. It acts as the central router and orchestrator for all incoming requests.
    -   **Core Functionality**: The `fetch` method within `worker.js` dispatches requests to specialized handler functions based on URL paths and request methods.
    -   **Routing Logic**:
        -   **WebSocket Proxy**: Handles `Upgrade: websocket` headers for real-time communication directly with `generativelanguage.googleapis.com` (Gemini models), enabling streaming responses.
        -   **Static File Server**: Serves frontend assets from `src/static/`, dynamically retrieving `index.html` and other static files from the `env.__STATIC_CONTENT` KV namespace binding.
        -   **AI Gateway (API Proxy)**: Routes diverse API requests to various downstream AI service providers. This is a crucial component for interoperability with different AI models. Key routes include:
            -   `/chat/completions` or `/api/request`: Forwards chat completion and general AI requests.
            -   `/api/transcribe-audio`: Handles audio transcription requests, primarily via SiliconFlow.
            -   `/api/translate`: Orchestrates translation tasks, leveraging chat completion endpoints of various providers.
            -   `/api/generate-image`: Manages image generation requests, typically routed to SiliconFlow.
            -   `/api/mcp-proxy`: A dedicated proxy for Multi-Cloud Platform (MCP) tool invocations. It receives tool call requests (containing `tool_name` and `parameters`) from the frontend (via `src/static/js/chat/chat-api-handler.js` and `src/static/js/agent/qwen-agent-adapter.js`) and dispatches them to specific backend tool handlers (e.g., `src/mcp_proxy/handlers/tavily-search.js`).
        -   **History API**: Routes prefixed with `/api/history/` manage user chat sessions, including saving, loading, pinning, editing titles, and deleting. It uses Cloudflare KV storage (`env.GEMINICHAT_HISTORY_KV`) for persistence. A notable feature is `/api/history/generate-title`, which leverages a Gemini model to automatically summarize chat content into a title.

### 2.1.1 MCP Tool Handlers (`src/mcp_proxy/handlers/`)

-   **[`tavily-search.js`](src/mcp_proxy/handlers/tavily-search.js)**:
    -   **职能**: 这是 `tavily_search` 工具的后端处理器。它从 `/api/mcp-proxy` 接收 `tool_name` 和 `parameters`，然后将请求转发到外部的 Python 工具集服务 (`https://tools.10110531.xyz/api/v1/execute_tool`) 以执行实际的 Tavily 搜索。
    -   **关键流程**: 构建包含 `tool_name` 和 `parameters` 的请求体，然后使用 `fetch` 将其发送到 Python API，并处理响应。

-   **[`python-sandbox.js`](src/mcp_proxy/handlers/python-sandbox.js)**:
    -   **职能**: 这是 `python_sandbox` 工具的后端处理器。它负责接收来自模型的代码执行请求，并将其安全地转发到外部独立的 Python 沙箱服务。
    -   **关键实现**: 此文件的核心是一个“永不崩溃”的参数解析器 (`parseWithRepair`)。由于 AI 模型有时会生成格式错误的 JSON 参数，此函数通过多层防御机制来确保健壮性：
        1.  **标准解析**: 尝试将输入作为标准 JSON 解析，并能处理多层嵌套的字符串化问题。
        2.  **正则救援**: 如果标准解析失败，它会使用正则表达式尝试从混乱的字符串中“抢救”出核心的 `code` 字段内容。
        3.  **安全回退**: 如果所有解析和救援尝试都失败，它会生成一个包含错误信息的 Python 代码对象返回给模型，而不是抛出异常。
    -   **设计目的**: 这种设计确保了 Cloudflare Worker 永远不会因为模型参数格式问题而崩溃，从而解决了导致模型陷入重试循环的根源问题。它将错误处理的循环限制在了前端和模型之间。

-   **[`firecrawl.js`](src/mcp_proxy/handlers/firecrawl.js)**:
    -   **职能**: 这是 `firecrawl` 工具的后端处理器。它接收来自 `/api/mcp-proxy` 的请求，验证 `mode` 和 `parameters`，然后将请求转发到外部的 Python 工具集服务 (`https://tools.10110531.xyz/api/v1/execute_tool`) 以执行实际的 Firecrawl 操作（如抓取、搜索或爬取）。
    -   **关键流程**: 验证输入参数，构建请求体，然后使用 `fetch` 将其发送到 Python API，并处理响应。


### 2.1.2 External Tool Services (Backend)

除了在 Cloudflare Worker 中处理的逻辑外，一些工具还依赖于在独立服务器上运行的外部后端服务。

-   **Python Sandbox Service (`/tools/`)**
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

### 2.2 Frontend (Static Assets)

-   **Root Directory**: `src/static/`
    -   This directory contains all static files for the single-page application, which are served directly by the Cloudflare Worker.
    -   **Main Page**: [`index.html`](src/static/index.html:1) is the entry point for the user interface.
     -   **Icons**: The user interface now uses [Font Awesome](https://fontawesome.com/) for all icons, loaded via a reliable CDN link in [`index.html`](src/static/index.html:1). This replaces the previous dependency on Google Fonts (Material Symbols) to ensure stable and fast icon loading in all network environments.
    -   **CSS**: `src/static/css/` holds compiled CSS files, with `style.css` being the main stylesheet. If Sass is used, `src/static/scss` is the source.
    -   **JavaScript Modules**: `src/static/js/` is a highly modularized directory containing the client-side logic.
        -   [`main.js`](src/static/js/main.js): The main client-side application logic and entry point for the frontend. This file is responsible for initializing and managing the core UI components, handling user interactions, and orchestrating communication with the backend. It integrates various modules such as `AttachmentManager`, `AudioRecorder`, `AudioStreamer`, `ChatApiHandler`, `chatUI`, `CONFIG`, `initializePromptSelect`, `MultimodalLiveClient`, `HistoryManager`, `ScreenHandler`, `VideoHandler`, `ToolManager`, `initializeTranslationCore`, `Logger`, and `initializeVisionCore`. It also manages global event listeners, connection status (WebSocket and HTTP), UI state updates, and handles the overall application flow.
        -   **Audio Module (`src/static/js/audio/`)**: Manages all client-side audio functionalities, crucial for voice input/output in the application.
            -   [`audio-recorder.js`](src/static/js/audio/audio-recorder.js): Handles microphone audio capture, processing, and encoding. It uses Web Audio API and `audio-processing.js` worklet to prepare audio chunks (e.g., as Base64 or raw ArrayBuffer) for sending to the backend, especially relevant for WebSocket-based transcription services.
            -   [`audio-streamer.js`](src/static/js/audio/audio-streamer.js): Manages the playback of streamed audio data received from the backend. It queues, schedules, and plays audio buffers, and can integrate with audio worklets like `vol-meter.js` for real-time effects or visualization. This is key for playing back AI-generated speech.
            -   `worklets/`: Contains Web Audio API Worklet processors that run in a separate thread, preventing UI blocking during intensive audio operations.
                -   [`audio-processing.js`](src/static/js/audio/worklets/audio-processing.js): A custom AudioWorkletProcessor used by `audio-recorder.js` to convert raw microphone audio (Float32Array) to Int16Array format and chunk it for efficient transmission.
                -   [`vol-meter.js`](src/static/js/audio/worklets/vol-meter.js): An AudioWorkletProcessor that calculates the real-time volume level (RMS) of an audio stream, useful for visual feedback during recording or playback.
        -   `src/static/js/main.js`: The main client-side application logic.
        -   **Agent Module (`src/static/js/agent/`)**: Contains logic for integrating with AI agents and proxying their tool calls.
            -   [`qwen-agent-adapter.js`](src/static/js/agent/qwen-agent-adapter.js): Acts as a client-side adapter for Multi-Cloud Platform (MCP) tool calls initiated by Qwen models. It receives tool call requests (containing `tool_name` and `parameters`) from `chat-api-handler.js` and proxies them to the `/api/mcp-proxy` endpoint in the backend. This is crucial for enabling flexible AI agent capabilities within the application.
        -   `src/static/js/attachments/`: Handles file attachment functionalities, like `file-attachment.js`.
            -   [`file-attachment.js`](src/static/js/attachments/file-attachment.js): Defines the `AttachmentManager` class, which manages all logic for file attachments (selection, validation, Base64 conversion, and UI preview display) for both single-file ("chat" mode) and multi-file ("vision" mode) scenarios. **ENHANCED**: Now integrates with `ImageCompressor` to automatically compress images >1MB across all modes, providing compression feedback and maintaining file type consistency. Features `toggleCompression()` method for runtime control.
        -   **Chat Module (`src/static/js/chat/`)**: Contains the core logic for managing chat UI, API interactions, and processing AI responses, including tool calls.
            -   [`chat-api.js`](src/static/js/chat/chat-api.js): Serves as the high-level interface for all frontend-to-backend chat API communications. It handles sending messages, initiating and processing Server-Sent Events (SSE) streams from the AI gateway, and recursively managing conversational turns, especially after tool executions. It's decoupled from the UI.
            -   [`chat-api-handler.js`](src/static/js/chat/chat-api-handler.js): Implements the business logic for processing streaming chat completion responses. It parses streamed data, detects and dispatches both Gemini function calls and Qwen Multi-Cloud Platform (MCP) tool calls. For Qwen MCP tool calls, it robustly parses the tool arguments and constructs a `tool_name` and `parameters` payload before sending it to the `/api/mcp-proxy` backend proxy via `QwenAgentAdapter`. It orchestrates UI updates and manages the chat history state.
            -   [`chat-ui.js`](src/static/js/chat/chat-ui.js): Dedicated to rendering and managing the visual elements of the chat interface. It handles displaying user and AI messages (including streamed content, reasoning, and tool call statuses), audio messages, and system logs. It provides functions for UI initialization, message logging, and scrolling.
        -   **Config Module (`src/static/js/config/`)**: Contains configuration files and prompt management logic.
            -   [`config.js`](src/static/js/config/config.js): Defines the application's global configurations, including available AI models (Gemini, Qwen, etc.), API versions, default models, system prompt options, audio settings, translation models, and vision models. **ENHANCED**: Now includes specialized `VISION.PROMPTS` array with chess-specific prompt configurations: `chess_teacher` (for gameplay guidance) and `chess_summary` (for post-game analysis). Features intelligent prompt switching and dual-mode chess instruction capabilities.
            -   [`prompt-manager.js`](src/static/js/config/prompt-manager.js): Manages the frontend's prompt mode selection and system instruction updates. It retrieves the appropriate system prompt from `config.js` based on the user's selection in a dropdown menu, updates a hidden textarea with this prompt, and handles local storage to remember user preferences.
        -   **Core Module (`src/static/js/core/`)**: Contains core utility functions, API handlers, and WebSocket client logic.
            -   [`api-handler.js`](src/static/js/core/api-handler.js): Provides a centralized handler for making HTTP API requests, standardizing JSON POST requests and handling streaming responses (Server-Sent Events). It manages headers, error responses, and ensures robust communication with backend services.
            -   [`websocket-client.js`](src/static/js/core/websocket-client.js): Manages WebSocket connections for real-time interaction with the Gemini 2.0 Flash Multimodal Live API. It handles connection setup, sending and receiving messages (including audio and video chunks), processing tool calls, and emitting various connection-related events.
            -   [`worklet-registry.js`](src/static/js/core/worklet-registry.js): Provides a registry for managing Web Audio API worklets. It facilitates the dynamic creation of worklet URLs from source code, enabling the loading and use of custom audio processors in a separate thread to prevent UI blocking.
        -   **History Module (`src/static/js/history/`)**: Manages client-side chat history interactions with the backend history API.
            -   [`history-manager.js`](src/static/js/history/history-manager.js): Encapsulates all functionality related to chat history management, including loading, saving, pinning, editing titles, and deleting chat sessions. It interacts with both `localStorage` for session metadata and the backend API for full chat history data, ensuring persistence and proper display of chat sessions.
        -   **Image Gallery Module (`src/static/js/image-gallery/`)**: Manages image display and modal interactions.
            -   [`image-manager.js`](src/static/js/image-gallery/image-manager.js): Provides functions to initialize the image modal, open it with specific image data (Base64 source, title, dimensions, size, type), and handle actions like copying image URL and downloading.
        -   **Media Module (`src/static/js/media/`)**: Deals with screen and video handling.
            -   [`screen-handlers.js`](src/static/js/media/screen-handlers.js): Manages screen sharing logic, including starting/stopping screen capture and updating the UI. It uses `ScreenRecorder` to capture frames and sends them to the WebSocket client, with throttling to control the frame rate.
            -   [`video-handlers.js`](src/static/js/media/video-handlers.js): Manages camera control logic, including starting/stopping video streams and updating the UI. It utilizes `VideoManager` to handle video capture and streaming, and supports toggling between front and rear cameras on mobile devices.
        -   **Tools Module (`src/static/js/tools/`)**: Implements client-side tools and their management.
            -   [`google-search.js`](src/static/js/tools/google-search.js): Represents a placeholder tool for performing Google searches. It provides the tool declaration for the Gemini API, but the actual search functionality is handled server-side by the Gemini API itself.
            -   [`tool-manager.js`](src/static/js/tools/tool-manager.js): Manages the registration and execution of various tools. It registers default tools like Google Search and Weather, provides their declarations to the Gemini API, and handles incoming tool call requests from the API by executing the corresponding tool's logic.
            -   [`weather-tool.js`](src/static/js/tools/weather-tool.js): Represents a mock tool for retrieving weather forecasts. It defines a function `get_weather_on_date` with parameters for location and date, and returns simulated weather data for demonstration purposes.
        -   **Translation Module (`src/static/js/translation/`)**: Contains logic for translation, including OCR capabilities.
            -   [`translation-core.js`](src/static/js/translation/translation-core.js): Provides the core logic for the translation feature, handling UI initialization, API calls to the backend translation endpoint, and mode switching within the application. It manages language and model selections, and orchestrates voice input for transcription before translation.
            -   [`translation-ocr.js`](src/static/js/translation/translation-ocr.js): Manages the OCR (Optical Character Recognition) process for the translation feature. It handles user image uploads, converts images to Base64, sends them to the backend for text recognition using a Gemini model, and displays the extracted text in the input area. It also controls the visibility of the OCR button based on the selected translation model.
        -   **Utils Module (`src/static/js/utils/`)**: Contains general utility functions, error handling, and logging.
            -   [`error-boundary.js`](src/static/js/utils/error-boundary.js): Defines an error boundary for handling various types of application errors. It provides a set of predefined `ErrorCodes` and a custom `ApplicationError` class for consistent and structured error reporting throughout the application.
            -   [`logger.js`](src/static/js/utils/logger.js): A singleton logger that logs messages to the console and emits events for real-time logging. It also stores a limited number of logs in memory and provides a method to export them, aiding in debugging and monitoring.
            -   [`utils.js`](src/static/js/utils/utils.js): Provides common utility functions, such as converting Blob objects to JSON and base64 strings to ArrayBuffers, which are essential for data manipulation within the frontend.
        -   **Video Module (`src/static/js/video/`)**: Manages video recording and streaming.
            -   [`screen-recorder.js`](src/static/js/video/screen-recorder.js): Implements a screen recorder for capturing and processing screen frames. It supports previewing the screen capture and sending frames to a callback function, with configurable FPS, quality, and frame size.
            -   [`video-manager.js`](src/static/js/video/video-manager.js): Manages video capture and processing from a camera, including motion detection and frame preview. It orchestrates the `VideoRecorder` to capture frames, applies motion detection to optimize frame sending, and handles camera toggling (front/rear).
            -   [`video-recorder.js`](src/static/js/video/video-recorder.js): Implements a video recorder for capturing and processing video frames from a camera. It supports previewing the video stream and sending frames as base64 encoded JPEG data to a callback function, with configurable FPS and quality.
        -   **Vision Module (`src/static/js/vision/`)**: Contains core logic for vision-related functionalities, now enhanced with **Chess Master AI** capabilities.
            -   [`vision-core.js`](src/static/js/vision/vision-core.js): Provides the core logic for the Vision feature, handling UI initialization, API calls to the backend for multimodal vision chat, and message display. It manages vision model selection, integrates with the `AttachmentManager` for handling image/video attachments, and processes streaming responses from the AI model, including reasoning content. **NEW**: Now includes specialized chess analysis functionality with `generateGameSummary()` function and intelligent history filtering via `_getRelevantHistory()`.
        -   **Utils Module Enhanced**: New image compression capabilities added.
            -   [`image-compressor.js`](src/static/js/utils/image-compressor.js): **NEW MODULE** - Implements intelligent image compression with 1MB threshold using Canvas API. Features include format preservation, configurable quality settings, and automatic compression for all modes (not just vision). Supports both JPEG conversion and original format retention.

### 2.3 Cloudflare Configuration & Dependencies

-   **Cloudflare Configuration**: [`wrangler.toml`](wrangler.toml:1)
    -   Defines the project name, the `src/worker.js` as the entry point, compatibility settings, and the `src/static` directory as the asset directory for Cloudflare deployment. This file is crucial for how the Worker is deployed and interacts with Cloudflare services like KV storage.

-   **Dependencies**: [`package.json`](package.json:1)
    -   Lists all Node.js dependencies required for development, testing, and building assets. This includes `wrangler` for local development and deployment, `vitest` for testing, and potentially `sass` for CSS pre-processing.


## 3. Key Features & API Endpoints

The [`src/worker.js`](src/worker.js:1) script manages several key functionalities:

-   **Static File Server**: Serves the frontend application from the `src/static` directory.
-   **WebSocket Proxy**: Proxies WebSocket connections directly to `generativelanguage.googleapis.com` for real-time communication with Gemini models.
-   **AI Gateway (API Proxy)**: Routes API requests to the appropriate downstream AI service based on the `model` specified in the request body.
    -   **Chat Completions**: `/chat/completions` or `/api/request`
        -   **Gemini**: For models like `gemini-1.5-pro-latest`, `gemini-2.5-pro`, `gemini-2.5-flash-preview-05-20`, `gemini-2.5-flash-lite-preview-06-17`, `gemini-2.0-flash`.
        -   **ZhipuAI**: For models like `glm-4v`, `glm-4.1v-thinking-flash`, `glm-4v-flash`, `GLM-4.5-Flash`.
        -   **SiliconFlow**: For models like `THUDM/GLM-4-9B-Chat`, `THUDM/GLM-4.1V-9B-Thinking`.
        -   **ModelScope**: For models like `qwen/qwen-max`, `Qwen/Qwen3-Coder-480B-A35B-Instruct`, `Qwen/Qwen3-235B-A22B-Thinking-2507`.
    -   **Audio Transcription**: `/api/transcribe-audio`
        -   Forwards audio data to the **SiliconFlow** transcription API (model: `FunAudioLLM/SenseVoiceSmall`).
    -   **Translation**: `/api/translate`
        -   Uses the chat completion endpoints of various providers (Gemini, Zhipu, SiliconFlow) for translation tasks.
    -   **Image Generation**: `/api/generate-image`
        -   Forwards requests to the **SiliconFlow** image generation API.
    -   **History Management**: `/api/history/*`
        -   Provides endpoints for saving, loading, pinning, unpinning, editing titles, deleting chat sessions, and generating titles for sessions using an AI model.
    -   **MCP Proxy**: `/api/mcp-proxy`
        -   Proxies requests for Multi-Cloud Platform (MCP) tool invocations.

## 4. Configuration & Secrets

The application relies on environment variables for API keys and other secrets. These must be configured in your Cloudflare project's settings (or in a `.dev.vars` file for local development).

-   `SF_API_TOKEN`: API key for SiliconFlow.
-   `AUTH_KEY`: API key for the Gemini API proxy (`geminiapim.10110531.xyz`).
-   `ZHIPUAI_API_KEY`: API key for ZhipuAI (bigmodel.cn).
-   `QWEN_API_KEY`: API key for ModelScope (qwen).
-   `GEMINICHAT_HISTORY_KV`: KV namespace binding for chat history storage.

## 5. Common Development Commands

All commands are run using Node.js and npm.

-   **Install dependencies**:
    ```bash
    npm install
    ```

-   **Run the application locally**:
    ```bash
    npm run dev
    ```
    This command starts a local development server using `wrangler`, simulating the Cloudflare environment.

-   **Run all tests**:
    ```bash
    npm test
    ```
    This executes the test suite using Vitest (configuration in [`vitest.config.js`](vitest.config.js:1)).

-   **Run a single test**:
    ```bash
    npm test <path/to/your/test/file.spec.js>
    ```
    Replace `<path/to/your/test/file.spec.js>` with the actual path to the test file you want to run.

-   **Build CSS (if using Sass)**:
    ```bash
    npm run build:css
    ```
    This compiles Sass files from `src/static/scss` to `src/static/css`.

-   **Deploy to Cloudflare**:
    ```bash
    npm run deploy
    ```
    This command first builds the CSS and then deploys the application to your Cloudflare account using `wrangler`.
## 6. Tool Management Mechanism and Connection Differences

This project implements a sophisticated tool management and invocation mechanism tailored for different AI models and connection types. The core principle is that the `ToolManager` class (defined in [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js)) is a universal wrapper for tool declaration and execution logic. However, it is instantiated twice in the frontend code, serving both WebSocket and HTTP connection paths, thereby forming two logically distinct "systems."

#### 6.1 WebSocket Connection Method (Gemini WebSocket API)

*   **Models**: Primarily used for Gemini models connected via WebSocket, such as `models/gemini-2.0-flash-exp`.
*   **Core Modules and Files**:
    *   [`src/static/js/main.js`](src/static/js/main.js): Frontend entry point; **does not directly handle WebSocket tool management** but initializes `MultimodalLiveClient`.
    *   [`src/static/js/core/websocket-client.js`](src/static/js/core/websocket-client.js) ([`src/static/js/core/websocket-client.js:28`](src/static/js/core/websocket-client.js:28)): The core WebSocket client, responsible for establishing real-time communication with `generativelanguage.googleapis.com`. **Within this module, an independent `ToolManager` instance is instantiated** (`this.toolManager = new ToolManager();`).
    *   [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js): Defines the `ToolManager` class and its logic for registering and executing default tools (Google Search, Weather).
    *   [`src/static/js/tools/google-search.js`](src/static/js/tools/google-search.js), [`src/static/js/tools/weather-tool.js`](src/static/js/tools/weather-tool.js): Default tools registered by `ToolManager`.
    *   [`src/worker.js`](src/worker.js): Acts as a WebSocket proxy ([`src/worker.js:10`](src/worker.js:10) `handleWebSocket(request, env);`), directly forwarding WebSocket connections to `generativelanguage.googleapis.com`.
*   **Workflow for Tool Invocation**:
    1.  The `MultimodalLiveClient` ([`src/static/js/core/websocket-client.js`](src/static/js/core/websocket-client.js)), upon establishing a WebSocket connection, sends tool declarations obtained via `this.toolManager.getToolDeclarations()` ([`src/static/js/core/websocket-client.js:62`](src/static/js/core/websocket-client.js:62)) from its **internal `ToolManager` instance** as part of a `setup` message to the Gemini WebSocket API.
    2.  When the Gemini WebSocket API returns a `functionCall` (e.g., calling `googleSearch` or `get_weather_on_date`), the `MultimodalLiveClient`'s `receive` method captures this invocation.
    3.  The `MultimodalLiveClient` then invokes the `handleToolCall()` method ([`src/static/js/core/websocket-client.js:285`](src/static/js/core/websocket-client.js:285)) of its internal `ToolManager` instance to **execute the corresponding tool logic locally in the frontend**.
    4.  The result of the tool's execution is sent back to the Gemini WebSocket API via `MultimodalLiveClient.sendToolResponse()`, completing the tool invocation cycle.
*   **Default Toolset**: `GoogleSearchTool`, `WeatherTool`.
*   **How to Improve Tools for WebSocket Connections**:
    *   **Add/Modify New Tools**: Modify [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js) to register new tool classes and create corresponding tool implementation files (e.g., `src/static/js/tools/new-tool.js`).
    *   **Modify Tool Declarations**: Adjust the `getDeclaration()` method in the respective tool class (e.g., `src/static/js/tools/google-search.js`).
    *   **Modify Tool Execution Logic**: Adjust the `execute()` method in the respective tool class.

#### 6.2 HTTP Connection Method (Gemini HTTP API & Qwen HTTP API)

*   **Models**: Primarily used for HTTP models like `models/gemini-2.5-flash` and Qwen models such as `Qwen/Qwen3-Coder-480B-A35B-Instruct`. This path is designed for maximum flexibility, allowing different models to use different sets of tools.
*   **Core Modules and Files**:
    *   [`src/static/js/main.js`](src/static/js/main.js) ([`src/static/js/main.js:24`](src/static/js/main.js:24)): Frontend entry point; **here, a global `ToolManager` instance is instantiated** (`const toolManager = new ToolManager();`). This global instance is injected into `ChatApiHandler`.
    *   [`src/static/js/chat/chat-api-handler.js`](src/static/js/chat/chat-api-handler.js): The core module for handling HTTP SSE streams. It is injected with the **global `ToolManager` instance** and is responsible for merging and forwarding tool declarations, as well as dispatching tool calls to the appropriate handlers.
    *   [`src/static/js/config/config.js`](src/static/js/config/config.js): Defines model configurations. The `tools` property for each model entry points to a specific toolset array, enabling fine-grained control. This file also defines model-specific **system prompts** (e.g., `Tool_gemini`), which are crucial for guiding model behavior, especially for complex tasks like image generation.
    *   [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js): As above, its class definition is universal. **In this path, the global `ToolManager` instance also manages `GoogleSearchTool` and `WeatherTool`.**
    *   [`src/static/js/tools_mcp/tool-definitions.js`](src/static/js/tools_mcp/tool-definitions.js): Defines various MCP toolsets. This now includes the general `mcpTools` for Qwen and a specialized, schema-compatible `geminiMcpTools` array for Gemini models.
    *   [`src/worker.js`](src/worker.js): Cloudflare Worker backend, acting as an HTTP API proxy. It now has a unified logic path where both Gemini and Qwen tool calls are routed through the `/api/mcp-proxy` endpoint.
*   **Workflow for Tool Invocation (Gemini & Qwen)**:
    1.  **Frontend Request Construction**: When `ChatApiHandler` sends an HTTP request, it reads the selected model's configuration from `config.js`. It then **merges** the default tool declarations (Google Search, Weather) from the global `ToolManager` with the specific toolset (e.g., `geminiMcpTools` or `mcpTools`) assigned to that model. This combined list is sent in the request.
    2.  The request is forwarded by `worker.js` to the appropriate downstream service.
    3.  When the model returns a tool call, `ChatApiHandler` captures it.
    4.  **Unified Dispatch**: `ChatApiHandler` now uses a unified `_handleMcpToolCall` method to process tool calls for both Gemini and Qwen. It constructs a request containing the `tool_name` and `parameters` and sends it to the `/api/mcp-proxy` endpoint. This simplifies the frontend logic significantly.
    5.  The backend MCP proxy (`/api/mcp-proxy`) routes the request to the correct handler (e.g., `python-sandbox.js`), which executes the tool.
    6.  The tool result is streamed back to the frontend, and `ChatApiHandler` sends it back to the model to continue the conversation.
*   **Special Considerations for Gemini Image Rendering**:
    *   **Problem**: The `python_sandbox` tool can generate Base64 images. Initially, Gemini models failed to render these images because the default system prompt (`Tool_assistant`) instructed models *not* to include the full Base64 string in the final reply to save tokens, an instruction that Qwen's architecture could handle but Gemini's could not.
    *   **Solution**: A dedicated system prompt, `Tool_gemini`, was created in `config.js`. This prompt **omits the restrictive instruction**, allowing the Gemini model to correctly include the full Base64 image data in its final Markdown output, which the frontend can then render. This highlights the importance of prompt engineering for managing model-specific behaviors.
*   **Complete Toolset (Model-Dependent)**:
    *   **Default Tools (All Models)**: `GoogleSearchTool`, `WeatherTool`.
    *   **Qwen Models**: The full `mcpTools` set, including `tavily_search`, `python_sandbox`, `firecrawl`, etc.
    *   **Gemini Models (`gemini-2.5-flash`)**: A curated `geminiMcpTools` set containing only `tavily_search`, `python_sandbox`, and `firecrawl`.
*   **How to Improve Tools for HTTP Connections**:
    *   **Add/Modify New Tools (e.g., MCP Tools)**:
        1.  Define new tool declarations in [`src/static/js/tools_mcp/tool-definitions.js`](src/static/js/tools_mcp/tool-definitions.js) and add them to the `mcpTools` array.
        2.  In [`src/static/js/config/config.js`](src/static/js/config/config.js), add or modify the `tools: mcpTools` property for the target HTTP model's configuration object (e.g., `gemini-2.5-flash-lite-preview-06-17`).
        3.  If new MCP tools require custom backend handling, it may be necessary to modify `src/mcp_proxy/mcp-handler.js` or add new handlers under `src/mcp_proxy/handlers/`.
    *   **Add/Modify Default Tools (Google Search, Weather)**:
        1.  Modify [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js) to register new tool classes and create corresponding tool implementation files (e.g., `src/static/js/tools/new-tool.js`).
        2.  Modify the `getDeclaration()` and `execute()` methods in the respective tool class (e.g., `src/static/js/tools/google-search.js`).
    *   **Modify Tool Declaration or Execution Logic**: Adjust the `getDeclaration()` or `execute()` methods in the respective tool class (e.g., `src/static/js/tools/google-search.js` or tools defined in `src/static/js/tools_mcp/tool-definitions.js`).
    *   **Modify Frontend Tool Merging Logic**: If the merging strategy for tool declarations under HTTP connections needs adjustment, modify the relevant logic in [`src/static/js/chat/chat-api-handler.js`](src/static/js/chat/chat-api-handler.js).

## 6. 国际象棋大师 AI 功能 (Chess Master AI Feature)

### 6.1 概述

视觉模块已通过专业的 **国际象棋大师 AI 系统** 得到显著增强，该系统提供智能的国际象棋指导、分析和教练功能。此功能将应用程序转变为一个全面的国际象棋学习平台，同时保留了现有的视觉能力。

### 6.2 核心组件

#### 6.2.1 双提示词架构

国际象棋功能建立在一个复杂的双提示词系统之上：

-   **`chess_teacher` 提示词** (`id: 'chess_teacher'`):
    -   **目的**: 实时对弈指导和局面分析
    -   **显示名称**: '国际象棋老师' (Chess Master)
    -   **功能**:
        -   **默认模式**: 提供单一最佳走法推荐及简洁解释
        -   **分析模式**: 通过关键词如 "实况分析", "局面分析" 触发 - 提供详细的局面分析
    -   **关键特性**:
        -   **注重精确**: 只给出最佳走法，不提供多种选择
        -   **FEN 集成**: 始终提供 Forsyth-Edwards Notation (FEN) 以跟踪局面
        -   **新手友好**: 使用简单语言和类比
        -   **关键词智能**: 自动在指导和分析模式之间切换

-   **`chess_summary` 提示词** (`id: 'chess_summary'`):
    -   **目的**: 全面的赛后分析和改进建议
    -   **显示名称**: '赛后总结（仅用于总结按钮）' (Post-Game Summary - Button Only)
    -   **功能**: 对整个对局历史进行深入分析，提供个性化教练
    -   **关键特性**:
        -   **整体分析**: 回顾关键转折点和战略主题
        -   **技术深入**: 识别错失的战术机会
        -   **学习导向**: 提供具体的改进建议和训练计划
        -   **技能评估**: 评估开局、中局、残局的表现

#### 6.2.2 国际象棋棋盘 UI 与交互

-   **文件**: [`src/static/index.html`](src/static/index.html), [`src/static/js/chess/chess-core.js`](src/static/js/chess/chess-core.js), [`src/static/css/style.css`](src/static/css/style.css)
-   **目的**: 提供一个可交互的国际象棋棋盘界面，支持棋子移动、FEN 记录和游戏控制。
-   **关键特性**:
    -   **双视图模式**: 在视觉聊天 (`vision-chat-fullscreen`) 和国际象棋棋盘 (`chess-fullscreen`) 之间无缝切换。
        -   通过导航栏的国际象棋图标 (<i class="fas fa-chess-king"></i>) 或视觉模式内的 "切换到棋盘" 按钮 (`#toggle-to-chess-button`) 进入棋盘视图。
        -   在棋盘视图中，通过 "切换到聊天" 按钮 (`#toggle-to-vision-button`) 返回视觉聊天。
    -   **棋盘渲染**:
        -   使用 `div` 元素动态生成 8x8 的棋盘格子，并根据行和列的奇偶性应用 `light` 或 `dark` 样式。
        -   棋子通过 Unicode 字符 (`PIECES` 对象) 渲染，并支持拖放移动。
        -   选中格子和可移动目标格子会进行高亮显示。
    -   **FEN 管理**:
        -   实时生成并显示当前棋局的 FEN (Forsyth-Edwards Notation) 字符串在 `#fen-output` 文本区域。
        -   提供 "复制 FEN" (`#copy-fen-button`)、"新游戏" (`#reset-chess-button`) 和 "上一步" (`#undo-move-button`) 按钮，方便用户操作。
        -   `loadFEN()` 方法支持从 FEN 字符串加载棋局状态。
    -   **游戏逻辑**:
        -   `ChessGame` 类 (`chess-core.js`) 封装了所有游戏状态和逻辑，包括当前回合、易位权利、过路兵、半回合计数和完整回合数。
        -   支持棋子点击移动和拖放移动。
        -   实现了基本的走法验证（如不能吃己方棋子）。
        -   处理王车易位、兵升变和过路兵规则。
        -   `isSquareAttacked()` 方法用于检查某个格子是否被敌方棋子攻击，为王车易位等复杂规则提供支持。
    -   **响应式设计**:
        -   棋盘和信息面板的布局在桌面、平板和手机端进行了优化，确保在不同屏幕尺寸下都能良好显示和交互。
        -   棋盘尺寸会根据视口宽度自适应调整。

#### 6.2.3 智能图像压缩系统

-   **文件**: [`src/static/js/utils/image-compressor.js`](src/static/js/utils/image-compressor.js)
-   **目的**: 优化国际象棋棋盘图像，以实现更快的分析，同时保持图像质量。
-   **关键特性**:
    -   **1MB 阈值**: 自动压缩大于 1MB 的图像。
    -   **格式保留**: 默认保留原始图像格式（可配置）。
    -   **质量控制**: 可配置的压缩质量（默认为 80%）。
    -   **全局应用**: 适用于所有模式（聊天、视觉、翻译）。
    -   **基于 Canvas**: 使用浏览器 Canvas API 进行客户端处理。
    -   **渐进增强**: 如果压缩失败，则优雅地回退。

#### 6.2.4 智能历史记录管理

-   **函数**: [`_getRelevantHistory()`](src/static/js/vision/vision-core.js:354) 在 [`vision-core.js`](src/static/js/vision/vision-core.js) 中
-   **目的**: 智能选择最相关的对局历史进行分析。
-   **算法**:
    -   **短对局** (≤15 步): 保留完整历史记录。
    -   **长对局** (>15 步): 策略性采样：
        -   **开局**: 前 3 步（理解开局选择）。
        -   **关键时刻**: 最多 5 个上传了图像的局面（关键决策）。
        -   **近期走法**: 最后 10 步（当前局面）。
-   **优势**:
    -   **Token 效率**: 在保持上下文的同时，防止超出 API 限制。
    -   **聚焦相关性**: 优先处理带有视觉证据的局面。
    -   **可扩展性**: 处理任意长度的对局。

### 6.3 用户界面增强

#### 6.3.1 响应式布局设计

-   **两行布局**:
    -   **第 1 行**: 模型选择 (GLM-4.1V-Thinking-Flash 等)。
    -   **第 2 行**: 模式选择 (国际象棋老师) + 赛后总结按钮。
-   **移动端优化**: 防止在小屏幕上 UI 破裂。
-   **CSS 类**:
    -   `.vision-control-row`: 单独的行容器。
    -   `.vision-controls`: 带有 flexbox 列布局的父容器。

#### 6.3.2 按钮集成

-   **总结按钮**: `#vision-summary-button`
    -   **位置**: 模式选择器旁边的第二行。
    -   **功能**: 触发全面的赛后分析。
    -   **状态管理**: 在分析期间显示加载指示器。
    -   **错误处理**: 优雅回退并提供用户反馈。

### 6.4 技术实现

#### 6.4.1 核心函数

```javascript
// vision-core.js 中的关键函数:

// 生成全面的赛后分析
async function generateGameSummary()

// 智能过滤对局历史进行分析
function _getRelevantHistory()

// 管理提示词选择和切换
function getSelectedPrompt()

// 填充国际象棋专用提示词选项
function populatePromptSelect()

// chess-core.js 中的关键函数:

// 初始化国际象棋核心功能
function initializeChessCore()

// 获取当前 FEN 字符串
function getCurrentFEN()

// 加载 FEN 字符串
function loadFEN(fen)
```

#### 6.4.2 配置结构

```javascript
// 在 config.js 中:
VISION: {
    PROMPTS: [
        {
            id: 'chess_teacher',
            name: '国际象棋老师',
            description: '对弈指导和局面分析',
            systemPrompt: '...' // 专业的国际象棋指导提示词
        },
        {
            id: 'chess_summary',
            name: '赛后总结（仅用于总结按钮）',
            description: '专门的赛后分析和总结',
            systemPrompt: '...' // 全面分析提示词
        }
    ]
}
```

### 6.5 使用工作流程

1.  **设置**: 用户在视觉界面中选择 "国际象棋老师" 模式。
2.  **对弈指导**:
    -   上传棋盘图像 → 接收最佳走法推荐。
    -   输入 "实况分析" → 获取详细局面分析。
3.  **赛后分析**: 点击 "对局总结" 按钮 → 全面对局回顾。
4.  **图像优化**: 大图像自动压缩以加快处理速度。
5.  **棋盘交互**:
    -   在棋盘视图中，用户可以点击或拖放棋子进行移动。
    -   随时复制当前 FEN，开始新游戏或撤销上一步。

### 6.6 优势

-   **教育性**: 通过 AI 驱动的教练功能，改变国际象棋学习方式。
-   **高效性**: 智能压缩和历史记录管理优化性能。
-   **用户友好**: 直观的界面和响应式设计。
-   **全面性**: 涵盖从逐步指导到战略分析的所有方面。
-   **可扩展性**: 通过智能采样处理任意长度的对局。
-   **交互性**: 提供完整的国际象棋棋盘交互体验。

## 7（zh-CN）. 工具管理机制与连接差异

本项目针对不同 AI 模型和连接方式，实现了精妙的工具管理和调用机制。核心在于，`ToolManager` 类（定义在 [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js)）本身是一个通用的工具声明和执行逻辑封装，但在前端代码中被实例化了两次，分别服务于 WebSocket 和 HTTP 连接路径，从而构成了逻辑上的“两套系统”。

#### 6.1 WebSocket 连接方式 (Gemini WebSocket API)

*   **模型**：主要用于 `models/gemini-2.0-flash-exp` 等通过 WebSocket 连接的 Gemini 模型。
*   **核心模块与文件**：
    *   [`src/static/js/main.js`](src/static/js/main.js): 前端入口，**不直接处理 WebSocket 工具管理**，但初始化了 `MultimodalLiveClient`。
    *   [`src/static/js/core/websocket-client.js`](src/static/js/core/websocket-client.js) ([`src/static/js/core/websocket-client.js:28`](src/static/js/core/websocket-client.js:28)): WebSocket 连接的核心客户端，负责与 `generativelanguage.googleapis.com` 建立实时通信。**在此模块内部实例化了一个独立的 `ToolManager` 实例**（`this.toolManager = new ToolManager();`）。
    *   [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js): 定义 `ToolManager` 类及其默认工具（Google Search, Weather）的注册和执行逻辑。
    *   [`src/static/js/tools/google-search.js`](src/static/js/tools/google-search.js), [`src/static/js/tools/weather-tool.js`](src/static/js/tools/weather-tool.js): `ToolManager` 默认注册的工具。
    *   [`src/worker.js`](src/worker.js): 充当 WebSocket 代理 ([`src/worker.js:10`](src/worker.js:10) `handleWebSocket(request, env);`)，将 WebSocket 连接直接转发给 `generativelanguage.googleapis.com`。
*   **工作调用机制**：
    1.  `MultimodalLiveClient` ([`src/static/js/core/websocket-client.js`](src/static/js/core/websocket-client.js)) 在建立 WebSocket 连接时，会将**其内部 `ToolManager` 实例**通过 `this.toolManager.getToolDeclarations()` ([`src/static/js/core/websocket-client.js:62`](src/static/js/core/websocket-client.js:62)) 获取的工具声明，作为 `setup` 消息的一部分发送给 Gemini WebSocket API。
    2.  当 Gemini WebSocket API 返回 `functionCall`（例如调用 `googleSearch` 或 `get_weather_on_date`）时，`MultimodalLiveClient` 的 `receive` 方法会捕获该调用。
    3.  `MultimodalLiveClient` 随后调用其内部 `ToolManager` 实例的 `handleToolCall()` 方法 ([`src/static/js/core/websocket-client.js:285`](src/static/js/core/websocket-client.js:285)) **在前端本地执行**相应的工具逻辑。
    4.  工具执行的结果通过 `MultimodalLiveClient.sendToolResponse()` 发送回 Gemini WebSocket API，完成工具调用循环。
*   **默认工具集**：`GoogleSearchTool`, `WeatherTool`。
*   **如何改进 WebSocket 连接下的工具**：
    *   **添加/修改新工具**：需要修改 [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js) 来注册新的工具类，并创建对应的工具实现文件（例如 `src/static/js/tools/new-tool.js`）。
    *   **修改工具声明**：修改对应工具类（例如 `src/static/js/tools/google-search.js`）中的 `getDeclaration()` 方法。
    *   **修改工具执行逻辑**：修改对应工具类中的 `execute()` 方法。

#### 6.2 HTTP 连接方式 (Gemini HTTP API & Qwen HTTP API)

*   **模型**：主要用于 `models/gemini-2.5-flash` 等 HTTP 模型，以及 `Qwen/Qwen3-Coder-480B-A35B-Instruct` 等 Qwen 模型。此路径经过精心设计，具有高度灵活性，允许不同模型使用不同的工具集。
*   **核心模块与文件**：
    *   [`src/static/js/main.js`](src/static/js/main.js) ([`src/static/js/main.js:24`](src/static/js/main.js:24)): 前端入口，**在此处实例化了一个全局的 `ToolManager` 实例**（`const toolManager = new ToolManager();`）。这个全局实例被注入 `ChatApiHandler`。
    *   [`src/static/js/chat/chat-api-handler.js`](src/static/js/chat/chat-api-handler.js): 处理 HTTP SSE 流的核心模块。它被注入**全局 `ToolManager` 实例**，负责合并与转发工具声明，并将工具调用分派给相应的处理器。
    *   [`src/static/js/config/config.js`](src/static/js/config/config.js): 定义模型配置。每个模型条目下的 `tools` 属性指向一个特定的工具集数组，实现了精细化的控制。该文件还定义了模型专用的**系统提示词**（例如 `Tool_gemini`），这对于指导模型行为（尤其是在处理图像生成等复杂任务时）至关重要。
    *   [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js): 同上，其类定义是通用的。**在此路径下，全局 `ToolManager` 实例也管理 `GoogleSearchTool` 和 `WeatherTool`。**
    *   [`src/static/js/tools_mcp/tool-definitions.js`](src/static/js/tools_mcp/tool-definitions.js): 定义了多个 MCP 工具集。现在包括了供 Qwen 使用的通用 `mcpTools`，以及一个为 Gemini 模型定制的、兼容其 Schema 的 `geminiMcpTools` 数组。
    *   [`src/worker.js`](src/worker.js): Cloudflare Worker 后端，充当 HTTP API 代理。现在，它采用统一的逻辑路径，将来自 Gemini 和 Qwen 的工具调用请求都路由到 `/api/mcp-proxy` 端点。
*   **工作调用机制 (Gemini & Qwen)**：
    1.  **前端请求构建**：`ChatApiHandler` 在发送 HTTP 请求时，会从 `config.js` 读取所选模型的配置。然后，它将全局 `ToolManager` 提供的默认工具声明（Google Search, Weather）与该模型指定的特定工具集（例如 `geminiMcpTools` 或 `mcpTools`）进行**合并**。这个合并后的完整列表被包含在请求中。
    2.  请求由 `worker.js` 转发到相应的下游服务。
    3.  当模型返回工具调用时，`ChatApiHandler` 会捕获它。
    4.  **统一分派**：现在，`ChatApiHandler` 使用一个统一的 `_handleMcpToolCall` 方法来处理 Gemini 和 Qwen 的工具调用。它构建一个包含 `tool_name` 和 `parameters` 的请求，并将其发送到 `/api/mcp-proxy` 端点。这极大地简化了前端逻辑。
    5.  后端 MCP 代理 (`/api/mcp-proxy`) 将请求路由到正确的处理器（例如 `python-sandbox.js`）来执行工具。
    6.  工具执行的结果以流式方式返回给前端，`ChatApiHandler` 再将其发送回模型，以继续对话。
*   **针对 Gemini 图像渲染的特殊处理**：
    *   **问题**：`python_sandbox` 工具能够生成 Base64 编码的图像。最初，Gemini 模型无法渲染这些图像，因为默认的系统提示词 (`Tool_assistant`) 为了节省 token 而指示模型**不要**在最终回复中包含完整的 Base64 字符串。Qwen 的架构可以处理这种指令，但 Gemini 的架构不行。
    *   **解决方案**：我们在 `config.js` 中创建了一个专用的系统提示词 `Tool_gemini`。这个提示词**移除了那条限制性指令**，使得 Gemini 模型能够正确地在其最终的 Markdown 输出中包含完整的 Base64 图像数据，从而让前端可以成功渲染。这凸显了提示词工程在管理模型特定行为方面的重要性。
*   **完整工具集 (依赖于模型)**：
    *   **默认工具 (所有模型)**：`GoogleSearchTool`, `WeatherTool`。
    *   **Qwen 模型**：完整的 `mcpTools` 集合，包括 `tavily_search`, `python_sandbox`, `firecrawl` 等。
    *   **Gemini 模型 (`gemini-2.5-flash`)**：一个经过筛选的 `geminiMcpTools` 集合，仅包含 `tavily_search`, `python_sandbox`, 和 `firecrawl`。
*   **如何改进 HTTP 连接下的工具**：
    *   **添加/修改新工具 (例如 MCP 工具)**：
        1.  在 [`src/static/js/tools_mcp/tool-definitions.js`](src/static/js/tools_mcp/tool-definitions.js) 中定义新的工具声明，并添加到 `mcpTools` 数组。
        2.  在 [`src/static/js/config/config.js`](src/static/js/config/config.js) 中，为目标 HTTP 模型（例如 `gemini-2.5-flash-lite-preview-06-17`）的配置对象添加或修改 `tools: mcpTools` 属性。
        3.  如果新的 MCP 工具需要自定义的后端处理，可能需要修改 `src/mcp_proxy/mcp-handler.js` 或在 `src/mcp_proxy/handlers/` 下添加新的处理器。
    *   **添加/修改默认工具 (Google Search, Weather)**：
        1.  修改 [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js) 来注册新的工具类，并创建对应的工具实现文件（例如 `src/static/js/tools/new-tool.js`）。
        2.  修改对应工具类（例如 `src/static/js/tools/google-search.js`）中的 `getDeclaration()` 和 `execute()` 方法。
    *   **修改工具声明或执行逻辑**：修改对应工具类（例如 `src/static/js/tools/google-search.js` 或 `src/static/js/tools_mcp/tool-definitions.js` 中定义的工具）的 `getDeclaration()` 或 `execute()` 方法。
    *   **修改前端工具合并逻辑**：若需调整 HTTP 连接下工具声明的合并方式，则修改 [`src/static/js/chat/chat-api-handler.js`](src/static/js/chat/chat-api-handler.js) 中的相关逻辑。
