const assetManifest = {};

const GEMINI_2_5_PROXY_HOST = "geminiapim.10110531.xyz";

/**
 * @function isGemini25Model
 * @description 判断模型名称是否属于 Gemini 2.5 系列。
 * @param {string} modelName - 模型名称，例如 'models/gemini-2.5-flash-preview-05-20'。
 * @returns {boolean} 如果是 Gemini 2.5 系列模型则返回 true，否则返回 false。
 */
const isGemini25Model = (modelName) => {
    return modelName.includes('gemini-2.5-flash-preview-05-20') || modelName.includes('gemini-2.5-flash-lite-preview-06-17');
};

/**
 * @function getApiVersionForModel
 * @description 根据模型名称获取对应的 API 版本。
 * @param {string} modelName - 模型名称，例如 'models/gemini-2.0-flash-exp'。
 * @returns {string} 对应的 API 版本，例如 'v1alpha' 或 'v1beta'。
 */
const getApiVersionForModel = (modelName) => {
    if (modelName.includes('gemini-2.5-flash-preview-05-20') || modelName.includes('gemini-2.5-flash-lite-preview-06-17')) {
        return 'v1beta';
    }
    return 'v1alpha'; // 默认使用 v1alpha
};

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
 * @description 处理 WebSocket 连接请求，根据模型名称将其代理到不同的后端。
 * @param {Request} request - 传入的请求对象。
 * @returns {Response} WebSocket 升级响应。
 */
async function handleWebSocket(request) {
  const url = new URL(request.url);
  const apiKeyFromUrl = url.searchParams.get("key");
  const modelName = url.searchParams.get("model");

  if (!apiKeyFromUrl) {
    return new Response("API Key is missing for WebSocket connection", { status: 400 });
  }
  if (!modelName) {
    return new Response("Model name is missing for WebSocket connection", { status: 400 });
  }

  let targetUrl;
  const apiVersion = getApiVersionForModel(modelName);

  if (isGemini25Model(modelName)) {
    // 2.5系列模型转发到自定义域名
    targetUrl = `wss://${GEMINI_2_5_PROXY_HOST}/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKeyFromUrl}&model=${modelName}`;
  } else {
    // 2.0及以下模型保持原路径
    targetUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKeyFromUrl}&model=${modelName}`;
  }

  console.log('Proxying WebSocket to:', targetUrl);

  const [client, proxy] = new WebSocketPair();
  proxy.accept();

  const targetWebSocket = new WebSocket(targetUrl);

  targetWebSocket.addEventListener("open", () => {
    console.log('Connected to Gemini WebSocket API');
  });

  proxy.addEventListener("message", (event) => {
    if (targetWebSocket.readyState === WebSocket.OPEN) {
      targetWebSocket.send(event.data);
    }
  });

  targetWebSocket.addEventListener("message", (event) => {
    if (proxy.readyState === WebSocket.OPEN) {
      proxy.send(event.data);
    }
  });

  targetWebSocket.addEventListener("close", (event) => {
    console.log('Gemini WebSocket closed:', event.code, event.reason);
    if (proxy.readyState === WebSocket.OPEN) {
      proxy.close(event.code, event.reason);
    }
  });

  proxy.addEventListener("close", (event) => {
    console.log('Client WebSocket closed:', event.code, event.reason);
    if (targetWebSocket.readyState === WebSocket.OPEN) {
      targetWebSocket.close(event.code, event.reason);
    }
  });

  targetWebSocket.addEventListener("error", (error) => {
    console.error('Gemini WebSocket error:', error);
    if (proxy.readyState === WebSocket.OPEN) {
      proxy.close(1011, "Gemini WebSocket error");
    }
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
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
