我将为您更新文档，在第9节后添加新的"Intelligent Agent and Workflow System"章节。以下是完整的更新后文档：

```markdown
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
            -   `/api/mcp-proxy`: A dedicated proxy for Multi-Cloud Platform (MCP) tool invocations. It receives tool call requests (containing `tool_name` and `parameters`) from the frontend and dispatches them to specific backend tool handlers.
        -   **History API**: Routes prefixed with `/api/history/` manage user chat sessions, including saving, loading, pinning, editing titles, and deleting. It uses Cloudflare KV storage (`env.GEMINICHAT_HISTORY_KV`) for persistence. A notable feature is `/api/history/generate-title`, which leverages a Gemini model to automatically summarize chat content into a title.

### 2.1.1 MCP Tool Handlers (`src/mcp_proxy/handlers/`)

-   **[`tavily-search.js`](src/mcp_proxy/handlers/tavily-search.js)**:
    -   **Function**: This is the backend processor for the `tavily_search` tool. It receives `tool_name` and `parameters` from `/api/mcp-proxy`, then forwards the request to an external Python toolset service (`https://tools.10110531.xyz/api/v1/execute_tool`) to execute the actual Tavily search.
    -   **Key Process**: Builds a request body containing `tool_name` and `parameters`, then sends it to the Python API using `fetch` and processes the response.

-   **[`python-sandbox.js`](src/mcp_proxy/handlers/python-sandbox.js)**:
    -   **Function**: This is the backend processor for the `python_sandbox` tool. It receives code execution requests from models and safely forwards them to an external standalone Python sandbox service.
    -   **Key Implementation**: The core of this file is a "never-crash" parameter parser (`parseWithRepair`). Since AI models sometimes generate malformed JSON parameters, this function ensures robustness through multi-layer defense mechanisms:
        1.  **Standard Parsing**: Attempts to parse input as standard JSON and can handle multi-level nested stringification issues.
        2.  **Regex Rescue**: If standard parsing fails, it uses regular expressions to try to "rescue" the core `code` field content from chaotic strings.
        3.  **Safe Fallback**: If all parsing and rescue attempts fail, it generates a Python code object containing error information to return to the model instead of throwing an exception.
    -   **Design Purpose**: This design ensures the Cloudflare Worker never crashes due to model parameter format issues, solving the root cause that leads models into retry loops. It confines the error handling loop between the frontend and the model.

-   **[`firecrawl.js`](src/mcp_proxy/handlers/firecrawl.js)**:
    -   **Function**: This is the backend processor for the `firecrawl` tool. It receives requests from `/api/mcp-proxy`, validates `mode` and `parameters`, then forwards the request to an external Python toolset service (`https://tools.10110531.xyz/api/v1/execute_tool`) to execute actual Firecrawl operations (such as scraping, searching, or crawling).
    -   **Key Process**: Validates input parameters, builds the request body, then sends it to the Python API using `fetch` and processes the response.

-   **[`stockfish.js`](src/mcp_proxy/handlers/stockfish.js)**:
    -   **Function**: This is the backend processor for the `stockfish_analyzer` tool. It receives requests from `/api/mcp-proxy`, validates `fen` and `mode` parameters, then forwards the request to an external Python toolset service (`https://tools.10110531.xyz/api/v1/execute_tool`) to execute Stockfish chess engine analysis.
    -   **Key Process**: Validates the validity of `fen` and `mode` parameters (`mode` must be one of `get_best_move`, `get_top_moves`, or `evaluate_position`), builds a request body containing `tool_name: 'stockfish_analyzer'` and complete `parameters`, then sends it to the Python API using `fetch` and processes the response.

### 2.1.2 External Tool Services (Backend)

In addition to the logic processed in the Cloudflare Worker, some tools rely on external backend services running on independent servers.

-   **Python Sandbox Service (`/tools/`)**
    -   **Function**: This is an independent backend service based on FastAPI and Docker, providing a secure, isolated environment to execute arbitrary Python code generated by AI models. It has now been upgraded to a fully-featured **data science code interpreter**, supporting data visualization using libraries like [`matplotlib`](https://matplotlib.org/) and [`seaborn`](https://seaborn.pydata.org/), and can generate Base64-encoded PNG images.
    -   **Key Files**:
        -   **[`code_interpreter.py`](tools/code_interpreter.py)**: Contains the core logic of the FastAPI application. It receives code snippets, uses the Docker SDK to create a temporary, disposable Docker container to execute the code, captures `stdout`, `stderr`, and now specifically handles Base64-encoded image output. To solve the issue of `matplotlib` being unable to create cache in a read-only filesystem, it configures the `MPLCONFIGDIR` environment variable to `/tmp` and uses `tmpfs` to mount the `/tmp` directory as a memory filesystem.
        -   **[`docker-compose.yml`](tools/docker-compose.yml)**: Used to define and run the sandbox service. Configured with `restart: unless-stopped` policy to ensure the service automatically recovers after server restarts or unexpected crashes.
        -   **[`Dockerfile`](tools/Dockerfile)**: Customizes the Docker image, pre-installing a series of key data science libraries on top of `python:3.11-slim`, including `numpy`, `pandas`, `matplotlib`, `seaborn`, and `openpyxl`.
    -   **Key Upgrades**:
        -   **Data Science Library Pre-installation**: The service now comes pre-installed with `numpy`, `pandas`, `matplotlib`, `seaborn`, and `openpyxl`, significantly enhancing its capabilities in data analysis, processing, and visualization.
        -   **Resource Increase and Environment Configuration**: To support these libraries and `matplotlib` caching, the memory limit for each container has been increased from `512MB` to `1GB`. Simultaneously, through the `MPLCONFIGDIR=/tmp` environment variable and `tmpfs={'/tmp': 'size=100M,mode=1777'}` mount, `matplotlib` is ensured to have a writable workspace.
        -   **Synchronous Execution**: The initial implementation used asynchronous Docker `run(detach=True)`, which caused a race condition: the application sometimes tried to fetch logs after the container had finished executing and was automatically deleted, resulting in a "404 Container Not Found" error.
        -   **Solution**: We modified it to synchronous execution `run(detach=False)`. This simplifies the logic, as the program waits for code execution to complete and directly obtains output from the return value of the `run` command, completely resolving this race condition.

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
        -   **Agent Module (`src/static/js/agent/`)**: Contains logic for integrating with AI agents and proxying their tool calls.
            -   [`qwen-agent-adapter.js`](src/static/js/agent/qwen-agent-adapter.js): Acts as a client-side adapter for Multi-Cloud Platform (MCP) tool calls initiated by Qwen models. It receives tool call requests (containing `tool_name` and `parameters`) from `chat-api-handler.js` and proxies them to the `/api/mcp-proxy` endpoint in the backend. This is crucial for enabling flexible AI agent capabilities within the application.
            -   **Intelligent Agent System**: A comprehensive agent framework for workflow automation and tool orchestration, including:
                -   [`CallbackManager.js`](src/static/js/agent/CallbackManager.js): Structured event management system for workflow execution tracking
                -   [`EnhancedSkillManager.js`](src/static/js/agent/EnhancedSkillManager.js): Advanced skill matching with execution history and performance analytics
                -   [`Orchestrator.js`](src/static/js/agent/Orchestrator.js): Main orchestrator coordinating workflows and tool execution
                -   [`WorkflowEngine.js`](src/static/js/agent/WorkflowEngine.js): Stream-based workflow execution engine with event streaming
                -   [`WorkflowTemplates.js`](src/static/js/agent/WorkflowTemplates.js): Predefined workflow templates for common tasks
                -   [`WorkflowUI.js`](src/static/js/agent/WorkflowUI.js): User interface components for workflow visualization
                -   **Event Handlers**:
                    -   [`AnalyticsHandler.js`](src/static/js/agent/handlers/AnalyticsHandler.js): Metrics collection and analysis
                    -   [`LearningHandler.js`](src/static/js/agent/handlers/LearningHandler.js): Performance learning and optimization
                    -   [`LoggingHandler.js`](src/static/js/agent/handlers/LoggingHandler.js): Structured logging system
                    -   [`WorkflowUIHandler.js`](src/static/js/agent/handlers/WorkflowUIHandler.js): UI state management for workflows
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
            -   **[`vision-history-manager.js`](src/static/js/history/vision-history-manager.js)**: **NEW MODULE** - Dedicated history manager for Vision mode, providing independent session management, message storage, and local storage functionality. Created via the `createVisionHistoryManager()` factory function, working in conjunction with the Vision mode `ChatApiHandler` instance.
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
            -   [`translation-core.js`](src/static/js/translation/translation-core.js): Provides the core logic for translation functionality, handling UI initialization, API calls to backend translation endpoints, and mode switching within the application. It manages language and model selection, and coordinates voice input for transcription before translation.
            -   [`translation-audio.js`](src/static/js/translation/translation-audio.js): **NEW MODULE** - Responsible for voice input processing in translation mode. It provides the same user experience as chat mode, supporting hold-to-record, converting PCM data to WAV format, and sending audio to the `/api/transcribe-audio` backend API for speech-to-text conversion.
            -   [`translation-ocr.js`](src/static/js/translation/translation-ocr.js): Manages the OCR (Optical Character Recognition) process for translation functionality. It handles user image uploads, converts images to Base64, sends them to the backend for text recognition using Gemini models, and displays the extracted text in the input area. It also controls the visibility of the OCR button based on the selected translation model.
        -   **Utils Module (`src/static/js/utils/`)**: Contains general utility functions, error handling, and logging.
            -   [`error-boundary.js`](src/static/js/utils/error-boundary.js): Defines an error boundary for handling various types of application errors. It provides a set of predefined `ErrorCodes` and a custom `ApplicationError` class for consistent and structured error reporting throughout the application.
            -   [`logger.js`](src/static/js/utils/logger.js): A singleton logger that logs messages to the console and emits events for real-time logging. It also stores a limited number of logs in memory and provides a method to export them, aiding in debugging and monitoring.
            -   [`utils.js`](src/static/js/utils/utils.js): Provides common utility functions, such as converting Blob objects to JSON and base64 strings to ArrayBuffers, which are essential for data manipulation within the frontend.
        -   **Video Module (`src/static/js/video/`)**: Manages video recording and streaming.
            -   [`screen-recorder.js`](src/static/js/video/screen-recorder.js): Implements a screen recorder for capturing and processing screen frames. It supports previewing the screen capture and sending frames to a callback function, with configurable FPS, quality, and frame size.
            -   [`video-manager.js`](src/static/js/video/video-manager.js): Manages video capture and processing from a camera, including motion detection and frame preview. It orchestrates the `VideoRecorder` to capture frames, applies motion detection to optimize frame sending, and handles camera toggling (front/rear).
            -   [`video-recorder.js`](src/static/js/video/video-recorder.js): Implements a video recorder for capturing and processing video frames from a camera. It supports previewing the video stream and sending frames as base64 encoded JPEG data to a callback function, with configurable FPS and quality.
        -   **Vision Module (`src/static/js/vision/`)**: Contains core logic for vision-related functionalities, now enhanced with **Chess Master AI** capabilities.
            -   **[`vision-core.js`](src/static/js/vision/vision-core.js)**: **MAJOR ARCHITECTURAL UPDATE** - Now fully reuses the `ChatApiHandler` class to handle Vision mode API calls, achieving a unified streaming experience with Chat mode. Key features include:
                - **Dedicated API Handler**: Uses an independent `ChatApiHandler` instance (`visionApiHandler`) to handle Vision mode requests
                - **Independent History Management**: Integrates `vision-history-manager.js` to provide independent session and message storage
                - **Unified Tool Calling**: Supports complete tool calling, reasoning chains, and search functionality through `ChatApiHandler`
                - **Chess Integration**: Retains complete Chess Master AI functionality, including game summarization and analysis
                - **UI Adapter**: Provides Vision-specific UI update interface through `createVisionUIAdapter()`
                - **History Cleanup**: New `clearVisionHistory()` function for external cleanup of Vision chat history
        -   **Chess Module (`src/static/js/chess/`)**: **NEW MODULE** - Complete chess functionality implementation, including board rendering, rule engine, and AI enhancement.
            -   **[`chess-core.js`](src/static/js/chess/chess-core.js)**: Core logic for chess functionality, handling board rendering, piece movement, and FEN generation. Refactored to use separate ChessRules module for game rules.
                - **Shadow Engine**: Introduces chess.js as a shadow engine for validation and state synchronization
                - **AI Integration**: Integrates with `chess-ai-enhanced.js` to provide AI move analysis and execution
                - **Game State Management**: Complete game state management, including history, undo/redo, and local storage
                - **User Interface**: Complete board UI, including piece selection, move highlighting, and game end detection
            -   **[`chess-ai-enhanced.js`](src/static/js/chess/chess-ai-enhanced.js)**: Enhanced chess AI module providing multi-stage AI analysis and move execution.
                - **Multi-stage Analysis**: First stage gets AI detailed analysis, second stage precisely extracts best moves
                - **Intelligent Degradation**: Generates alternative moves when preferred moves fail
                - **Move Validation**: Comprehensive move validation and legality checking
                - **Vision Integration**: Deep integration with Vision module to display analysis process in visual chat
            -   **[`chess-rule.js`](src/static/js/chess/chess-rule.js)**: Chess rules module containing all chess rule logic, including piece movement, special moves, and game state validation.
                - **Piece Movement Rules**: Legal move rule validation for all pieces
                - **Special Moves**: Special rules like castling, en passant, pawn promotion
                - **Game State Checking**: Check, checkmate, draw condition detection
                - **FEN Generation**: Generate and validate standard FEN strings
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
        -   **ModelScope**: For models like `Qwen/Qwen3-235B-A22B-Thinking-2507`.
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

-   **Build Dynamic Skill System**:
    ```bash
    npm run build:skills
    ```
    This command runs [`scripts/build-skills.js`](scripts/build-skills.js), scans `src/skills/` for `SKILL.md` files, and generates [`src/tool-spec-system/generated-skills.js`](src/tool-spec-system/generated-skills.js).

-   **Run the application locally**:
    ```bash
    npm run dev
    ```
    This command first runs the skill build, then starts a local development server using `wrangler`, simulating the Cloudflare environment.

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
    This command first runs the skill build, then builds the CSS, and finally deploys the application to your Cloudflare account using `wrangler`.

## 6. Vision Module Architecture Update

### 6.1 Unified API Processing Architecture

**MAJOR ARCHITECTURAL CHANGE**: The Vision module now fully reuses the `ChatApiHandler` class, achieving a unified API calling and streaming experience with Chat mode.

#### 6.1.1 Core Architecture Components

-   **Dedicated API Handler**: Vision mode uses an independent `ChatApiHandler` instance (`visionApiHandler`)
-   **Independent History Management**: Provides independent session and message storage through `vision-history-manager.js`
-   **Unified Tool Calling**: Supports complete tool calling, reasoning chains, and search functionality through `ChatApiHandler`
-   **UI Adapter**: Provides Vision-specific UI update interface through `createVisionUIAdapter()`

#### 6.1.2 Initialization Process

Initialization process in `main.js`:

```javascript
// 1. Create Vision History Manager
const visionHistoryManager = createVisionHistoryManager();

// 2. Initialize Vision mode ChatApiHandler
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

// 3. Define visionHandlers
const visionHandlers = {
    showToast: showToast,
    showSystemMessage: showSystemMessage,
    chatApiHandler: visionApiHandler,
    historyManager: visionHistoryManager
};

// 4. Initialize vision functionality
initializeVisionCore(visionElements, attachmentManager, visionHandlers);
```

#### 6.1.3 UI Adapter System

The `createVisionUIAdapter()` function creates a Vision-specific UI adapter:

```javascript
function createVisionUIAdapter() {
    return {
        createAIMessageElement: createVisionAIMessageElement,
        displayUserMessage: displayVisionUserMessage,
        displayToolCallStatus: (toolName, args) => {
            // Vision-specific tool call status display
        },
        displayImageResult: (base64Image, altText, fileName) => {
            // Vision-specific image result display
        },
        scrollToBottom: scrollVisionToBottom,
        logMessage: (message, type) => {
            // Vision-specific logging
        }
    };
}
```

### 6.2 Chess Master AI Feature

#### 6.2.1 Core Architecture Update

The chess functionality is now fully integrated into the unified Vision architecture:

-   **API Calls**: All chess-related AI requests are handled through `visionApiHandler.streamChatCompletion()`
-   **Tool Calling**: Supports complete tool calling functionality, including `python_sandbox` image generation
-   **Streaming Responses**: Displays AI analysis and move recommendations through unified SSE streaming processing
-   **History Management**: Uses Vision-specific history manager to store chess sessions

#### 6.2.2 Game Summary Function

The `generateGameSummary()` function now uses unified API processing:

```javascript
async function generateGameSummary() {
    // Get complete game history
    const fenHistory = chessGame.getFullGameHistory();
    
    // Use visionApiHandler to send request
    await chatApiHandlerInstance.streamChatCompletion(requestBody, apiKey, visionUiAdapter);
}
```

#### 6.2.3 History Cleanup Function

New `clearVisionHistory()` function for external cleanup of Vision chat history:

```javascript
export function clearVisionHistory() {
    if (chatApiHandlerInstance) {
        // Clear internal state of dedicated handler
        chatApiHandlerInstance.state.chatHistory = [];
        chatApiHandlerInstance.state.currentSessionId = null;
        // ... other state resets
    }
    // Also clear current session in history manager
    if (handlers.historyManager && handlers.historyManager.clearCurrentSession) {
        handlers.historyManager.clearCurrentSession();
    }
}
```

### 6.3 Advantages and Improvements

#### 6.3.1 Architectural Advantages

-   **Code Reuse**: Eliminates duplicate API processing logic, reducing code maintenance costs
-   **Consistency**: Vision and Chat modes use the same tool calling and streaming processing logic
-   **Maintainability**: Unified error handling and state management
-   **Scalability**: New features can benefit in both modes simultaneously

#### 6.3.2 Functional Improvements

-   **Complete Tool Support**: Vision mode now supports all tools available in Chat mode
-   **Reasoning Chain Display**: Supports real-time display of reasoning chain content for Gemini models
-   **Image Generation**: Supports data visualization image generation through `python_sandbox` tool
-   **Search Functionality**: Supports enabling or disabling Google search functionality

#### 6.3.3 Performance Optimization

-   **Independent State**: Vision and Chat mode states are completely isolated, avoiding mutual interference
-   **Dedicated History**: Independent session storage, improving data management efficiency
-   **Memory Optimization**: Resource initialization on demand, reducing memory footprint

## 7. Chess Module Technical Implementation

### 7.1 Core Architecture Components

#### 7.1.1 Board Engine System

The chess functionality adopts a dual-engine architecture to ensure rule accuracy:

-   **Custom Rule Engine**: [`chess-rule.js`](src/static/js/chess/chess-rule.js) implements complete chess rules
-   **Shadow Engine**: Uses chess.js library as an authoritative source for validation and synchronization
-   **State Synchronization**: Ensures consistent state between both engines through `syncAndVerifyShadowEngine()`

#### 7.1.2 AI Enhancement System

[`chess-ai-enhanced.js`](src/static/js/chess/chess-ai-enhanced.js) implements multi-stage AI analysis:

```javascript
// Four-stage AI analysis process
1. First stage: Get detailed AI analysis
2. Second stage: Use second AI to precisely extract best moves
3. Third stage: Verify and decide (user selection)
4. Fourth stage: Execute the finalized move
```

#### 7.1.3 User Interface Integration

-   **Board Rendering**: Complete HTML5 chess board interface supporting click and drag
-   **Game State Management**: Complete game lifecycle management
-   **Multi-mode Interaction**: Supports manual moves and AI-assisted analysis

### 7.2 Key Functional Features

#### 7.2.1 Complete Rule Support

-   **Basic Movement**: Standard movement rules for all pieces
-   **Special Moves**: Castling, en passant, pawn promotion
-   **Game States**: Check, checkmate, draw condition detection
-   **FEN Support**: Complete FEN string generation and parsing

#### 7.2.2 AI Analysis Features

-   **Multi-model Analysis**: Supports using different AI models for position analysis
-   **Move Recommendations**: Intelligent move extraction and validation
-   **User Selection**: Provides multiple candidate moves for user selection
-   **Execution Verification**: Complete legality checking before move execution

#### 7.2.3 History and Persistence

-   **Complete History**: Records complete game history
-   **Local Storage**: Automatically saves game state to localStorage
-   **Undo/Redo**: Complete move history management
-   **Session Recovery**: Automatically restores game state after page refresh

### 7.3 Deep Integration with Vision Module

#### 7.3.1 Unified Message System

Chess AI analysis is displayed through the Vision module's message system:

```javascript
// Display AI analysis process in visual chat area
this.displayVisionMessage('**♟️ Chess AI Analysis**', { id: analysisId, create: true });
```

#### 7.3.2 Tool Calling Support

Supports advanced functionality through Vision module's tool calling system:

-   **Python Sandbox**: For data visualization and complex calculations
-   **Search Integration**: Supports game background and history queries
-   **Image Generation**: Generates position analysis diagrams through tool calls

#### 7.3.3 Unified API Processing

All chess-related AI requests are processed through the Vision module's dedicated `ChatApiHandler`, ensuring:

-   **Consistent Error Handling**
-   **Unified Streaming Responses**
-   **Tool Calling Compatibility**
-   **History Management Consistency**

### 7.4 Developer Experience

#### 7.4.1 Modular Design

-   **Clear Separation of Responsibilities**: Rules, AI, UI logic separation
-   **Easy Testing**: Independent modules facilitate unit testing
-   **Scalability**: Easy to add new features or modify existing behavior

#### 7.4.2 Debugging Support

-   **Detailed Logging**: Complete move and state change logs
-   **Shadow Engine Verification**: Automatically detects and fixes state inconsistencies
-   **Error Recovery**: Robust error handling and state recovery mechanisms

#### 7.4.3 Configuration Flexibility

-   **Model Configuration**: Supports using different AI models for analysis
-   **Prompt Management**: Configurable analysis prompts and system instructions
-   **UI Customization**: Customizable board appearance and interaction behavior

This chess module provides a complete, robust, and user-friendly chess experience, while being deeply integrated into the application's unified architecture, fully leveraging existing AI infrastructure and tool calling capabilities.

## 8. Dynamic Skill System

This architectural upgrade introduces a dynamic skill system, aiming to decouple tool usage guidelines from hardcoded system prompts. This enables on-demand, dynamic provision of precise contextual instructions to the Large Language Model (LLM), significantly boosting the success rate and accuracy of tool calls.

### 8.1 Core Components and Workflow

1.  **Skill Files**:
    *   Detailed usage guidelines for all tools are stored as individual `SKILL.md` files within the [`src/skills/<tool_name>/`](src/skills/) directory structure.
    *   Each `SKILL.md` contains structured metadata (frontmatter) and LLM-optimized Markdown content.

2.  **Pre-build Script**:
    *   The [`scripts/build-skills.js`](scripts/build-skills.js) script runs automatically before build or development startup.
    *   It scans the `src/skills/` directory and parses all `SKILL.md` files.
    *   It generates a static [`src/tool-spec-system/generated-skills.js`](src/tool-spec-system/generated-skills.js) file, inlining all skill data into a JavaScript object, which is suited for the filesystem-less Cloudflare Workers environment.

3.  **Runtime Manager**:
    *   [`src/tool-spec-system/skill-manager.js`](src/tool-spec-system/skill-manager.js) serves as a pure runtime logic unit. It loads data from `generated-skills.js` upon initialization.
    *   The `SkillManager` is responsible for matching the most relevant skill based on the user's real-time query, using a weighted scoring algorithm.

4.  **Dynamic Context Injection**:
    *   The skill injection logic is integrated into the `handleAPIRequest` function in the main entry point, [`src/worker.js`](src/worker.js).
    *   For each chat request, the system performs a skill match. If a match is found, the core instructions of that skill are dynamically injected as a `system` message into the `messages` array sent to the LLM.

### 8.2 Benefits

*   **Improved Success Rate**: Providing the LLM with a highly relevant, just-in-time "cheat sheet" significantly reduces hallucinations and errors in tool invocation.
*   **Superior Maintainability**: Adding or modifying a tool's capabilities now only requires editing the corresponding `.md` file, without touching any core business logic.
*   **Performance Optimization**: All file I/O is handled at build-time, and runtime execution is a zero-overhead, in-memory operation.

### 8.3 Python Sandbox Skill Enhancement and Architectural Refactoring

To significantly enhance the capabilities and maintainability of our AI's code execution skills, the python-sandbox skill has undergone a major architectural and content upgrade. This update transforms the skill from a single instruction file into a comprehensive and modular capability hub.

#### 8.3.1 Key Architectural Changes: Skill as a Module

The most significant change is the adoption of a modular file structure, following the "Progressive Disclosure" design principle. The monolithic SKILL.md has been refactored into a high-level entrypoint supported by a library of detailed reference documents.

The new structure is as follows:

```
skills/python-sandbox/
│
├── SKILL.md                 # Core Guide: The new high-level entrypoint and dispatcher.
│
└── references/              # Knowledge Base: A library of detailed "cookbooks" and workflows.
    ├── matplotlib_cookbook.md # Guide for advanced data visualization.
    ├── pandas_cheatsheet.md   # Guide for data cleaning and analysis pipelines.
    ├── report_generator_workflow.md # Guide for automated document generation.
    ├── ml_workflow.md         # Guide for machine learning model training.
    └── sympy_cookbook.md      # Guide for symbolic math and formula proving.
```

**SKILL.md: The Entrypoint & Dispatcher**
- The main SKILL.md file no longer contains lengthy code examples
- Provides a high-level overview of the skill's core capabilities
- Acts as a directory or index, instructing the AI on which reference file to consult for specific, complex tasks
- Defines the basic tool invocation and output specifications

**references/ Directory: The Knowledge Base**
- Houses detailed, task-specific guides, or "cookbooks"
- Allows the AI to load deep knowledge on-demand without cluttering its initial context
- Each workflow or library guide can be updated independently without altering the core SKILL.md

#### 8.3.2 Enhanced Capabilities

This new architecture formally introduces and supports the following advanced capabilities:

- **Advanced Data Visualization**: Beyond simple plots, with best practices for creating high-quality, standardized business charts
- **Complex Workflow Automation**: Full examples of multi-step tasks, such as the "Weekly Report Generator" which combines data simulation, chart creation, and Word document assembly
- **Robust Data Pipelines**: A complete guide to data cleaning and analysis workflows using Pandas
- **Machine Learning**: A standardized workflow for training, evaluating, and visualizing the results of scikit-learn models
- **Scientific and Symbolic Computing**: Dedicated guidance on using the Sympy library for advanced mathematical tasks, including solving equations, performing calculus, and formally proving mathematical formulas

#### 8.3.3 New Interaction Model

Interacting with the enhanced python-sandbox skill now follows a more intelligent, multi-step process orchestrated by the AI:

1. **Request Analysis**: The user provides a high-level request (e.g., "Analyze this dataset and create a report" or "Help me prove this trigonometric identity")
2. **Dispatcher Consultation**: The AI first consults the main SKILL.md to understand the general task category and identify the appropriate reference guide
3. **Knowledge Base Deep-Dive**: The AI then loads the relevant file from the references/ directory (e.g., report_generator_workflow.md or sympy_cookbook.md) to access detailed code templates and best practices
4. **Code Generation & Execution**: Armed with expert-level knowledge, the AI generates high-quality, robust code to fulfill the user's request

**Example Walkthrough: Formula Proving**
- User Prompt: "Prove that sin(x)**2 + cos(x)**2 = 1 using symbolic computation"
- AI Action:
  1. The skill-manager identifies python-sandbox as the relevant skill
  2. The AI reads SKILL.md and sees the section on "Symbolic Math and Formula Proving"
  3. The instructions direct it to consult references/sympy_cookbook.md
  4. The AI reads the cookbook, learns the best-practice workflow for formula proving (e.g., using sympy.simplify(LHS - RHS))
  5. The AI generates the correct Sympy code and provides a step-by-step explanation of the proof

This upgrade represents a significant leap forward in the python-sandbox skill's intelligence and utility. By adopting a modular, knowledge-driven architecture, we have created a platform that is not only more powerful but also more scalable and easier to maintain. This lays the foundation for introducing even more complex expert-level skills in the future.

---

## 9. Tool Management Mechanism and Connection Differences

This project implements a sophisticated tool management and invocation mechanism tailored for different AI models and connection types. The core principle is that the `ToolManager` class (defined in [`src/static/js/tools/tool-manager.js`](src/static/js/tools/tool-manager.js)) is a universal wrapper for tool declaration and execution logic. However, it is instantiated twice in the frontend code, serving both WebSocket and HTTP connection paths, thereby forming two logically distinct "systems."

#### 9.1 WebSocket Connection Method (Gemini WebSocket API)

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
    *   **Modify Tool Execution Logic**: Adjust the `execute()` method in the respective tool class (e.g., `src/static/js/tools/google-search.js`).

#### 9.2 HTTP Connection Method (Gemini HTTP API & Qwen HTTP API)

*   **Models**: Primarily used for HTTP models like `models/gemini-2.5-flash` and Qwen models such as `Qwen/Qwen3-235B-A22B-Thinking-2507`. This path is designed for maximum flexibility, allowing different models to use different sets of tools.
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

## 10. Intelligent Agent and Workflow System

This major architectural upgrade introduces a comprehensive intelligent agent system that enables sophisticated workflow automation, tool orchestration, and adaptive task execution. The system leverages the existing skill infrastructure while adding advanced capabilities for complex multi-step operations.

### 10.1 System Overview

The intelligent agent system is designed to handle complex user requests that require multiple tools, conditional logic, and adaptive execution. It automatically analyzes task complexity and determines whether to use single-step tool execution or multi-step workflows.

#### 10.1.1 Core Architecture Components

- **Orchestrator**: The central coordinator that manages the entire agent lifecycle
- **WorkflowEngine**: Stream-based workflow execution engine with event streaming
- **CallbackManager**: Structured event management system for workflow tracking
- **EnhancedSkillManager**: Advanced skill matching with execution history analytics
- **WorkflowUI**: User interface components for workflow visualization and interaction

### 10.2 Core Components

#### 10.2.1 Orchestrator (`src/static/js/agent/Orchestrator.js`)

The main orchestrator coordinates all agent activities:

```javascript
// Key responsibilities:
- Task complexity analysis and routing
- Workflow creation and execution management
- Integration with ChatApiHandler for tool execution
- Event system coordination through CallbackManager
- User interface state management
```

**Key Features:**
- **Intelligent Routing**: Automatically determines whether to use single-step or workflow execution
- **Real-time Progress Tracking**: Monitors workflow execution with detailed progress updates
- **Error Recovery**: Implements sophisticated error handling and fallback mechanisms
- **Performance Analytics**: Collects execution metrics for continuous improvement

#### 10.2.2 WorkflowEngine (`src/static/js/agent/WorkflowEngine.js`)

Stream-based workflow execution engine:

```javascript
// Core execution pattern:
async* stream(workflow, context) {
  // Event-driven workflow execution with real-time streaming
  yield { event: 'on_workflow_start', ... };
  
  for (const step of workflow.steps) {
    yield { event: 'on_step_start', ... };
    // Execute step and stream events
    yield { event: 'on_step_end', ... };
  }
  
  yield { event: 'on_workflow_end', ... };
}
```

**Key Features:**
- **Event Streaming**: Real-time event emission for UI updates and monitoring
- **Step Dependencies**: Support for data passing between workflow steps
- **Conditional Execution**: Dynamic step execution based on previous results
- **Critical Step Management**: Special handling for mission-critical steps

#### 10.2.3 CallbackManager (`src/static/js/agent/CallbackManager.js`)

Structured event management system aligned with LangChain patterns:

```javascript
// Event structure:
const event = {
  event: 'on_workflow_start', // LangChain-compatible event names
  name: 'workflow_name',
  run_id: 'unique_execution_id',
  timestamp: 'ISO_timestamp',
  data: { workflow, steps_count, workflow_type },
  metadata: { source, complexity }
};
```

**Supported Event Types:**
- Workflow lifecycle events (`on_workflow_start`, `on_workflow_end`)
- Step execution events (`on_step_start`, `on_step_end`)
- Tool invocation events (`on_tool_start`, `on_tool_end`)
- AI processing events (`on_ai_start`, `on_ai_stream`, `on_ai_end`)
- Error handling events (`on_error`)
- Learning and analytics events (`on_learning_update`)

#### 10.2.4 EnhancedSkillManager (`src/static/js/agent/EnhancedSkillManager.js`)

Advanced skill matching with execution history:

```javascript
// Enhanced skill matching with performance analytics
async findOptimalSkill(userQuery, context) {
  // Multi-factor scoring including:
  // - Semantic relevance
  // - Historical success rates
  // - Execution performance
  // - Contextual appropriateness
}
```

**Key Features:**
- **Performance-Based Scoring**: Prioritizes tools with higher success rates
- **Execution History**: Maintains detailed tool execution records
- **Adaptive Learning**: Improves recommendations based on historical performance
- **Multi-dimensional Matching**: Considers semantic, contextual, and performance factors

#### 10.2.5 Workflow Templates (`src/static/js/agent/WorkflowTemplates.js`)

Predefined workflow templates for common tasks:

```javascript
export const WORKFLOW_TEMPLATES = {
  web_analysis: {
    name: 'Web Analysis Workflow',
    steps: [
      { name: 'Web Content Crawling', toolName: 'firecrawl' },
      { name: 'Content Analysis', toolName: 'standard_ai' }
    ]
  },
  data_visualization: {
    name: 'Data Visualization Workflow',
    steps: [
      { name: 'Data Preparation', toolName: 'python_sandbox' },
      { name: 'Result Interpretation', toolName: 'standard_ai' }
    ]
  }
};
```

### 10.3 Event Handlers System

#### 10.3.1 AnalyticsHandler (`src/static/js/agent/handlers/AnalyticsHandler.js`)

Metrics collection and performance analysis:

- Tracks workflow execution metrics
- Monitors tool performance and success rates
- Provides execution analytics and insights

#### 10.3.2 LearningHandler (`src/static/js/agent/handlers/LearningHandler.js`)

Performance optimization and adaptive learning:

- Records tool execution outcomes
- Updates skill performance metrics
- Enables continuous system improvement

#### 10.3.3 LoggingHandler (`src/static/js/agent/handlers/LoggingHandler.js`)

Structured logging and event tracking:

- Maintains detailed execution logs
- Supports debugging and troubleshooting
- Provides audit trail for workflow executions

#### 10.3.4 WorkflowUIHandler (`src/static/js/agent/handlers/WorkflowUIHandler.js`)

User interface state management:

- Updates workflow visualization in real-time
- Manages progress indicators and status displays
- Handles user interactions and controls

### 10.4 Integration with Existing Systems

#### 10.4.1 Skill System Integration

The agent system deeply integrates with the existing dynamic skill system:

```javascript
// Enhanced skill matching builds upon the base skill manager
this.skillManager = new EnhancedSkillManager();
this.baseSkillManager = await skillManagerPromise;
```

**Integration Benefits:**
- **Unified Skill Discovery**: Combines static skill definitions with dynamic performance data
- **Enhanced Recommendations**: Adds execution history and success rates to skill matching
- **Continuous Improvement**: Learns from tool execution outcomes to improve future recommendations

#### 10.4.2 Tool Execution Integration

Seamless integration with existing tool infrastructure:

```javascript
// Reuses existing ChatApiHandler for tool execution
async callTool(toolName, parameters, context = {}) {
  const result = await this.chatApiHandler.callTool(toolName, parameters);
  return {
    success: true,
    output: result.output || result.content || result.data || 'Tool execution successful',
    rawResult: result
  };
}
```

### 10.5 Workflow Execution Patterns

#### 10.5.1 Simple Tool Execution

For straightforward requests, the system uses optimized single-step execution:

```javascript
async handleWithEnhancedSingleStep(userMessage, files, context) {
  const optimalSkill = await this.skillManager.findOptimalSkill(userMessage, context);
  if (optimalSkill) {
    return await this.executeToolWithOptimization(optimalSkill, userMessage, context);
  }
}
```

#### 10.5.2 Complex Workflow Execution

For complex multi-step tasks, the system creates and executes structured workflows:

```javascript
async handleWithWorkflow(userMessage, taskAnalysis, files, context) {
  this.currentWorkflow = await this.workflowEngine.createWorkflow(userMessage, {
    ...context,
    files,
    callbackManager: this.callbackManager
  });
  
  // Stream-based workflow execution
  const workflowStream = this.workflowEngine.stream(this.currentWorkflow, context);
}
```

### 10.6 User Experience Features

#### 10.6.1 Real-time Progress Visualization

The WorkflowUI provides comprehensive progress tracking:

- **Step-by-step Progress**: Visual indicators for each workflow step
- **Real-time Status Updates**: Live updates as steps execute
- **Execution Metrics**: Performance data and completion statistics
- **Interactive Controls**: User controls for workflow management

#### 10.6.2 Intelligent Fallback Mechanisms

Robust error handling and recovery:

- **Automatic Fallback**: Falls back to standard processing when workflows fail
- **Error Recovery**: Attempts to recover from intermediate failures
- **User Notification**: Clear communication of issues and resolutions

### 10.7 Performance and Scalability

#### 10.7.1 Event-Driven Architecture

The stream-based architecture ensures efficient resource usage:

- **Non-blocking Execution**: Asynchronous event processing
- **Memory Efficiency**: Stream-based processing minimizes memory footprint
- **Scalable Event Handling**: Efficient handling of large workflow event streams

#### 10.7.2 Analytics and Optimization

Continuous performance improvement:

- **Execution Analytics**: Detailed metrics on workflow performance
- **Tool Performance Tracking**: Historical data on tool success rates
- **Adaptive Routing**: Intelligent routing based on performance data

### 10.8 Development and Debugging

#### 10.8.1 Comprehensive Monitoring

Extensive debugging and monitoring capabilities:

```javascript
// Debugging utilities
getCurrentRunStats() // Current execution statistics
getAllEventHistory() // Complete event history
exportEventLogs() // Export logs for analysis
getAnalyticsMetrics() // Performance metrics
```

#### 10.8.2 Structured Event System

Consistent event structure for easy debugging:

- **Standardized Event Format**: Consistent event structure across all components
- **Detailed Event Metadata**: Rich context for debugging and analysis
- **Event Correlation**: Run IDs for correlating related events

This intelligent agent system represents a significant advancement in the application's capabilities, enabling sophisticated workflow automation while maintaining seamless integration with existing tool infrastructure and user interfaces.

## 11. Vision Module Technical Implementation Details

### 11.1 Core Functions and Architecture

#### 11.1.1 Initialization System

```javascript
// Key functions in vision-core.js:

// Initialize Vision functionality core
export function initializeVisionCore(el, manager, handlersObj)

// Set vision mode activation status
export function setVisionActive(active)

// Clear Vision chat history
export function clearVisionHistory()

// Internal core message sending logic
async function _sendMessage(text, files)

// Handle vision message sending
async function handleSendVisionMessage()
```

#### 11.1.2 UI Adapter System

```javascript
// Create Vision-specific UI adapter
function createVisionUIAdapter() {
    return {
        createAIMessageElement: createVisionAIMessageElement,
        displayUserMessage: displayVisionUserMessage,
        displayToolCallStatus: (toolName, args) => {
            // Vision-specific tool call status display
        },
        displayImageResult: (base64Image, altText, fileName) => {
            // Vision-specific image result display
        },
        scrollToBottom: scrollVisionToBottom,
        logMessage: (message, type) => {
            // Vision-specific logging
        }
    };
}
```

#### 11.1.3 Chess Integration

```javascript
// Generate game summary - reuse ChatApiHandler
async function generateGameSummary()

// Display message in visual chat interface
export function displayVisionMessage(markdownContent)

// Direct message sending function for external modules
window.sendVisionMessageDirectly = async function(messageText)
```

### 11.2 Configuration and State Management

#### 11.2.1 Model Configuration

Vision mode uses dedicated model configuration:

```javascript
// Vision configuration in config.js
VISION: {
    MODELS: [
        // Dedicated vision model list
    ],
    PROMPTS: [
        // Including chess-specific prompts
        {
            id: 'chess_teacher',
            name: 'Chess Master',
            description: 'Game guidance and position analysis'
        },
        {
            id: 'chess_summary',
            name: 'Post-Game Summary (Button Only)',
            description: 'Dedicated post-game analysis and summary'
        }
    ]
}
```

#### 11.2.2 State Isolation

Vision mode maintains completely independent state:

```javascript
// Module-level state for Vision
let elements = {};
let attachmentManager = null;
let showToastHandler = null;
let chatApiHandlerInstance = null; // Vision mode exclusive API Handler
let isVisionActive = false; // Vision mode activation status
let handlers = {}; // Save handlers object
```

### 11.3 Advantages Summary

#### 11.3.1 Architectural Advantages

-   **Unification**: Vision and Chat modes use the same underlying API processing mechanism
-   **Modularity**: Clear separation of responsibilities, easy to maintain and extend
-   **Consistency**: Unified error handling, tool calling, and streaming responses
-   **Performance**: Independent state management, avoiding interference between modes

#### 11.3.2 Functional Completeness

-   **Complete Tool Chain**: Supports all MCP tool calls
-   **Chess Integration**: Complete Chess Master AI functionality
-   **Multimodal Support**: Multimodal processing of images, video, text
-   **History Management**: Independent session storage and recovery

#### 11.3.3 Developer Experience

-   **Clear Documentation**: Comprehensive code comments and architectural explanations
-   **Easy Extension**: Modular design facilitates adding new features
-   **Debugging Friendly**: Unified logging system and error handling
-   **Flexible Configuration**: Supports dynamic configuration of models and prompts
