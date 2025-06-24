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
/**
 * @function handleWebSocket
 * @description 处理 WebSocket 连接请求，直接代理到 Google Gemini Live API。
 * @param {Request} request - 传入的请求对象。
 * @param {Object} env - 环境变量。
 * @returns {Response} WebSocket 升级响应。
 */
async function handleWebSocket(request, env) {
  const url = new URL(request.url);
  const apiKey = url.searchParams.get('key');
  const modelName = url.searchParams.get('model');

  if (!apiKey || !modelName) {
    return new Response('Missing API key or model name in WebSocket URL', { status: 400 });
  }

  // 构建 Gemini Live API 的 WebSocket URL
  const geminiWsUrl = `wss://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=websocket`;

  // 创建 WebSocket 对
  const { 0: clientWs, 1: serverWs } = new WebSocketPair();

  // 接受传入的 WebSocket 连接
  const response = new Response(null, { status: 101, webSocket: clientWs });

  // 连接到 Gemini Live API
  const geminiSocket = new WebSocket(geminiWsUrl);

  // 处理 Gemini API WebSocket 的事件
  geminiSocket.addEventListener('open', () => {
    console.log('Connected to Gemini Live API WebSocket');
  });

  geminiSocket.addEventListener('message', async (event) => {
    // 将从 Gemini API 收到的消息转发给客户端
    if (event.data instanceof Blob) {
      clientWs.send(await event.data.arrayBuffer());
    } else {
      clientWs.send(event.data);
    }
  });

  geminiSocket.addEventListener('close', (event) => {
    console.log('Gemini Live API WebSocket closed:', event.code, event.reason);
    clientWs.close(event.code, event.reason);
  });

  geminiSocket.addEventListener('error', (error) => {
    console.error('Gemini Live API WebSocket error:', error);
    clientWs.close(1011, 'Gemini API Error'); // 1011: Internal Error
  });

  // 处理客户端 WebSocket 的事件
  clientWs.addEventListener('message', (event) => {
    // 将从客户端收到的消息转发给 Gemini API
    geminiSocket.send(event.data);
  });

  clientWs.addEventListener('close', (event) => {
    console.log('Client WebSocket closed:', event.code, event.reason);
    geminiSocket.close(event.code, event.reason);
  });

  clientWs.addEventListener('error', (error) => {
    console.error('Client WebSocket error:', error);
    geminiSocket.close(1011, 'Client Error');
  });

  return response;
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
