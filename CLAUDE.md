# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **AI Gateway and Web Application** built entirely on **Cloudflare Workers** that serves as a unified interface for multiple AI services (Gemini, Qwen, ZhipuAI, SiliconFlow) with capabilities for chat completions, audio transcription, translation, image generation, and advanced chess AI.

## Core Architecture

### Entry Point
- **`src/worker.js`** - Cloudflare Worker entry point and central router
  - WebSocket proxy for Gemini real-time communication
  - Static file server from `src/static/`
  - AI Gateway API proxy routing to downstream services
  - History management API with KV storage
  - MCP tool proxy endpoint (`/api/mcp-proxy`)

### Frontend Structure
- **`src/static/`** - Single-page application assets
  - **`index.html`** - Main UI entry point (Font Awesome icons)
  - **`src/static/js/main.js`** - Main application logic and orchestrator

## Key Modules & Features

### Backend (Cloudflare Worker)

#### MCP Tool Handlers (`src/mcp_proxy/handlers/`)
- **`tavily-search.js`** - Web search proxy
- **`python-sandbox.js`** - Secure code execution with robust JSON parsing
- **`firecrawl.js`** - Web scraping/crawling proxy
- **`stockfish.js`** - Chess engine analysis proxy

#### External Tool Services
- **Python Sandbox Service (`/tools/`)** - FastAPI/Docker service for secure code execution
  - `code_interpreter.py` - Core FastAPI logic with matplotlib support
  - `docker-compose.yml` - Service configuration
  - `Dockerfile` - Data science libraries pre-installed

### Frontend JavaScript Modules

#### Core Communication
- **`src/static/js/chat/chat-api-handler.js`** - HTTP SSE stream processing, unified tool calling
- **`src/static/js/core/websocket-client.js`** - Gemini WebSocket real-time communication
- **`src/static/js/core/api-handler.js`** - Centralized HTTP API handler

#### Audio Processing (`src/static/js/audio/`)
- **`audio-recorder.js`** - Microphone capture with worklet processing
- **`audio-streamer.js`** - Real-time audio playback
- **`worklets/audio-processing.js`** - Audio format conversion worklet
- **`worklets/vol-meter.js`** - Volume visualization worklet

#### Vision Module (`src/static/js/vision/`)
- **`vision-core.js`** - **MAJOR UPDATE**: Now uses unified `ChatApiHandler` for API calls
  - Dedicated `ChatApiHandler` instance for Vision mode
  - Independent history management via `vision-history-manager.js`
  - Complete tool calling and reasoning chain support
  - Chess Master AI integration

#### Chess Module (`src/static/js/chess/`) - **NEW**
- **`chess-core.js`** - Board rendering, UI, game state management
- **`chess-ai-enhanced.js`** - Multi-stage AI analysis and move execution
- **`chess-rule.js`** - Complete chess rules engine with FEN support
- Shadow engine using chess.js for validation

#### Tool Management
- **`src/static/js/tools/tool-manager.js`** - Universal tool manager (instantiated twice)
  - **WebSocket Tools**: Local execution (Google Search, Weather)
  - **HTTP Tools**: MCP proxy execution (Python Sandbox, Tavily, Firecrawl, Stockfish)
- **`src/static/js/tools_mcp/tool-definitions.js`** - MCP tool definitions

#### History Management
- **`src/static/js/history/history-manager.js`** - Chat mode history
- **`src/static/js/history/vision-history-manager.js`** - Independent Vision history

#### Media Processing
- **`src/static/js/video/video-manager.js`** - Camera capture with motion detection
- **`src/static/js/video/screen-recorder.js`** - Screen sharing functionality

#### Utilities
- **`src/static/js/utils/image-compressor.js`** - **NEW**: Intelligent image compression (>1MB)
- **`src/static/js/attachments/file-attachment.js`** - Enhanced with compression integration

## API Endpoints

### Core Gateway
- **`/chat/completions`** or **`/api/request`** - Chat completions
  - Supports: Gemini, ZhipuAI, SiliconFlow, ModelScope models
- **`/api/transcribe-audio`** - Audio transcription (SiliconFlow)
- **`/api/translate`** - Translation via chat completions
- **`/api/generate-image`** - Image generation (SiliconFlow)
- **`/api/mcp-proxy`** - Unified MCP tool execution endpoint
- **`/api/history/*`** - Session management, title generation, pinning

### WebSocket Proxy
- Direct proxy to `generativelanguage.googleapis.com` for Gemini 2.0 Flash

## Configuration

### Environment Variables
- `SF_API_TOKEN` - SiliconFlow API key
- `AUTH_KEY` - Gemini proxy API key
- `ZHIPUAI_API_KEY` - ZhipuAI API key
- `QWEN_API_KEY` - ModelScope API key
- `GEMINICHAT_HISTORY_KV` - KV namespace binding

### Key Config Files
- **`wrangler.toml`** - Cloudflare deployment configuration
- **`package.json`** - Dependencies (wrangler, vitest, sass)
- **`src/static/js/config/config.js`** - Models, prompts, tool mappings
  - Includes chess-specific prompts (`chess_teacher`, `chess_summary`)
  - Model-specific system prompts (`Tool_gemini` for image rendering)

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Local development with wrangler
npm test                 # Run tests with vitest
npm run build:css        # Compile Sass to CSS (if applicable)
npm run deploy           # Deploy to Cloudflare
```

## Key Architectural Patterns

### Tool Management Dual System
1. **WebSocket Path** - Local tool execution (Gemini WebSocket models)
2. **HTTP Path** - MCP proxy execution (Gemini HTTP & Qwen models)

### Vision Module Unification
- Vision mode now fully reuses `ChatApiHandler`
- Unified streaming, tool calling, and error handling with Chat mode
- Independent state and history management
- Chess AI integration through Vision interface

### Chess Master AI
- Multi-stage analysis: AI analysis → move extraction → user selection → execution
- Dual engine: Custom rules + chess.js shadow validation
- Deep Vision module integration for visual analysis display

### Error Resilience
- Python sandbox "never-crash" parameter parser with regex rescue
- WebSocket reconnection handling
- Comprehensive error boundary system

## Important Notes

- All code modifications must pass tests and maintain functionality
- The application uses Cloudflare KV for persistent chat history
- Image compression automatically applied to files >1MB across all modes
- Chess module provides complete FEN support and game state persistence
- MCP tool calls support both Gemini and Qwen models through unified proxy