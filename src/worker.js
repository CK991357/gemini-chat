




const assetManifest = {};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 处理 WebSocket 连接
    if (request.headers.get('Upgrade') === 'websocket') {
      return handleWebSocket(request, env);
    }

    // 处理语音转文字请求
    if (url.pathname === '/api/transcribe-audio') {
      // 处理OPTIONS预检请求
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          }
        });
      }

      // 拒绝非POST请求
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({
          error: 'Method Not Allowed',
          message: 'Only POST requests are accepted for this endpoint'
        }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      try {
        // 直接从请求体中读取音频数据
        const audioArrayBuffer = await request.arrayBuffer();
        if (!audioArrayBuffer || audioArrayBuffer.byteLength === 0) {
          return new Response(JSON.stringify({ error: 'Missing audio data in request body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }

        // 记录音频数据信息
        console.log('音频数据信息:', {
          byteLength: audioArrayBuffer.byteLength,
          contentType: request.headers.get('Content-Type')
        });

        // 使用 SiliconFlow API
        const siliconFlowApiToken = env.SF_API_TOKEN; // 从环境变量获取 SiliconFlow API 令牌
        const siliconFlowModelName = "FunAudioLLM/SenseVoiceSmall"; // SiliconFlow 模型名称
        const siliconFlowApiUrl = "https://api.siliconflow.cn/v1/audio/transcriptions";

        // 将 ArrayBuffer 转换为 Blob
        const audioBlob = new Blob([audioArrayBuffer], { type: request.headers.get('Content-Type') || 'audio/wav' });

        // 构建 FormData
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.wav"); // 文件名可以自定义
        formData.append("model", siliconFlowModelName);

        const response = await fetch(siliconFlowApiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${siliconFlowApiToken}`,
            // 'Content-Type': 'multipart/form-data' // FormData 会自动设置正确的 Content-Type
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`SiliconFlow API请求失败: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        // SiliconFlow API 的响应结构通常是 { text: "..." }
        return new Response(JSON.stringify({ text: result.text }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (error) {
        console.error('语音转文字错误:', error);
        return new Response(JSON.stringify({
          error: error.message || '语音转文字失败',
          details: error.stack || '无堆栈信息'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }
    
    // 添加 API 请求处理
    if (url.pathname.endsWith("/chat/completions") ||
        url.pathname.endsWith("/embeddings") ||
        url.pathname.endsWith("/models")) {
      return handleAPIRequest(request, env);
    }

    // 处理静态资源
    if (url.pathname === '/' || url.pathname === '/index.html') {
      console.log('Serving index.html',env);
      return new Response(await env.__STATIC_CONTENT.get('index.html'), {
        headers: {
          'content-type': 'text/html;charset=UTF-8',
        },
      });
    }

    // 处理其他静态资源
    const asset = await env.__STATIC_CONTENT.get(url.pathname.slice(1));
    if (asset) {
      const contentType = getContentType(url.pathname);
      return new Response(asset, {
        headers: {
          'content-type': contentType,
        },
      });
    }



    return new Response('Not found', { status: 404 });
  },
};

function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const types = {
    'js': 'application/javascript',
    'css': 'text/css',
    'html': 'text/html',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif'
  };
  return types[ext] || 'text/plain';
}

/**
 * @function handleWebSocket
 * @description 处理 WebSocket 连接请求，将其转发到 api_proxy/worker.mjs。
 * @param {Request} request - 传入的请求对象。
 * @param {Object} env - 环境变量。
 * @returns {Response} WebSocket 升级响应。
 */
async function handleWebSocket(request, env) {
  // 确保请求是 WebSocket 升级请求
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket connection", { status: 400 });
  }

  // 构建指向 api_proxy/worker.mjs 的 WebSocket URL
  // 注意：这里假设 api_proxy/worker.mjs 也在同一个 Worker 中作为子模块处理 WebSocket
  // 并且其 WebSocket 路径是 /ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent
  const proxyWsUrl = `ws://localhost:8787/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`; // 假设本地开发环境端口为 8787

  // 创建 WebSocketPair 用于客户端和代理之间的通信
  const [clientWs, serverWs] = new WebSocketPair();

  // 接受客户端的 WebSocket 连接
  clientWs.accept();

  // 创建到代理 Worker 的 WebSocket 连接
  const proxyWebSocket = new WebSocket(proxyWsUrl);

  // 处理代理 WebSocket 的打开事件
  proxyWebSocket.addEventListener("open", () => {
    console.log("Connected to proxy WebSocket.");
  });

  // 处理代理 WebSocket 的消息事件
  proxyWebSocket.addEventListener("message", (event) => {
    // 将从代理接收到的消息转发给客户端
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(event.data);
    }
  });

  // 处理代理 WebSocket 的关闭事件
  proxyWebSocket.addEventListener("close", (event) => {
    console.log("Proxy WebSocket closed:", event.code, event.reason);
    // 关闭客户端 WebSocket
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(event.code, event.reason);
    }
  });

  // 处理代理 WebSocket 的错误事件
  proxyWebSocket.addEventListener("error", (error) => {
    console.error("Proxy WebSocket error:", error);
    // 关闭客户端 WebSocket
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, "Proxy error"); // 1011: Internal Error
    }
  });

  // 处理客户端 WebSocket 的消息事件
  clientWs.addEventListener("message", (event) => {
    // 将从客户端接收到的消息转发给代理
    if (proxyWebSocket.readyState === WebSocket.OPEN) {
      proxyWebSocket.send(event.data);
    } else {
      console.warn("Proxy WebSocket not open, queuing message or handling error.");
      // 这里可以添加消息队列逻辑，或者直接报错
    }
  });

  // 处理客户端 WebSocket 的关闭事件
  clientWs.addEventListener("close", (event) => {
    console.log("Client WebSocket closed:", event.code, event.reason);
    // 关闭代理 WebSocket
    if (proxyWebSocket.readyState === WebSocket.OPEN) {
      proxyWebSocket.close(event.code, event.reason);
    }
  });

  // 处理客户端 WebSocket 的错误事件
  clientWs.addEventListener("error", (error) => {
    console.error("Client WebSocket error:", error);
    // 关闭代理 WebSocket
    if (proxyWebSocket.readyState === WebSocket.OPEN) {
      proxyWebSocket.close(1011, "Client error");
    }
  });

  // 返回 WebSocket 升级响应
  return new Response(null, {
    status: 101,
    webSocket: serverWs,
  });
}

async function handleAPIRequest(request, env) {
  try {
    const worker = await import('./api_proxy/worker.mjs');
    return await worker.default.fetch(request);
  } catch (error) {
    console.error('API request error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStatus = error.status || 500;
    return new Response(errorMessage, {
      status: errorStatus,
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
      }
    });
  }
}
