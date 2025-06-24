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

  // 根据模型名称确定 API 版本
  function getApiVersionForModel(name) {
    if (name.includes('gemini-2.5-flash-preview-05-20') || name.includes('gemini-2.5-flash-lite-preview-06-17')) {
      return 'v1beta';
    }
    return 'v1alpha'; // 默认使用 v1alpha，适用于 gemini-2.0-flash-exp
  }

  const apiVersion = getApiVersionForModel(modelName);
  const geminiWsUrl = `wss://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=websocket`;

  // 创建 WebSocket 对
  const { 0: clientWs, 1: serverWs } = new WebSocketPair();

  // 接受传入的 WebSocket 连接
  const response = new Response(null, { status: 101, webSocket: clientWs });

  // 使用 fetch API 将 serverWs 连接到 Gemini Live API
  try {
    const proxyRequest = new Request(geminiWsUrl, {
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': request.headers.get('Sec-WebSocket-Key'),
        'Sec-WebSocket-Version': request.headers.get('Sec-WebSocket-Version'),
      },
      // @ts-ignore
      webSocket: serverWs, // 将 serverWs 传递给 fetch
    });

    // 发起 WebSocket 代理请求
    const proxyResponse = await fetch(proxyRequest);

    // 如果代理响应不是 101 Switching Protocols，则表示代理失败
    if (proxyResponse.status !== 101) {
      console.error('Failed to proxy WebSocket connection:', proxyResponse.status, proxyResponse.statusText);
      clientWs.close(1011, `Failed to proxy: ${proxyResponse.statusText}`);
      return proxyResponse; // 返回代理响应的错误
    }

    // 代理成功，无需额外处理，WebSocketPair 会自动转发消息
  } catch (error) {
    console.error('WebSocket proxy error:', error);
    clientWs.close(1011, `Proxy Error: ${error.message}`);
  }

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
