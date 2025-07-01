const assetManifest = {};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 处理 WebSocket 连接
    // if (request.headers.get('Upgrade') === 'websocket') {
    //   return handleWebSocket(request, env);
    // }

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

// async function handleWebSocket(request, env) {
// ... (function content removed)
// }

async function handleAPIRequest(request, env) {
    console.log('DEBUG: Entering handleAPIRequest'); // 新增日志
    const clonedRequest = request.clone();
    console.log('DEBUG: Request cloned. URL:', clonedRequest.url, 'Method:', clonedRequest.method, 'Content-Type:', clonedRequest.headers.get('content-type')); // 新增日志
    try {
        // 如果是翻译请求，直接处理
        if (clonedRequest.url.includes('/api/chat/completions') &&
            clonedRequest.method === 'POST' &&
            clonedRequest.headers.get('content-type') === 'application/json') {
            
            console.log('DEBUG: Attempting to parse JSON body for translation/proxy routing.'); // 新增日志
            const body = await clonedRequest.json();
            console.log('DEBUG: JSON body parsed. Model:', body.model); // 新增日志
            // 重新读取请求体，因为 request.json() 会消耗掉它
            const newRequest = new Request(clonedRequest.url, {
                method: clonedRequest.method,
                headers: clonedRequest.headers,
                body: JSON.stringify(body)
            });

            if (body.model && (body.model.includes('deepseek') || body.model.includes('GLM') || body.model.includes('Qwen') || body.model.includes('gemini-2.5-flash-lite'))) {
                console.log('DEBUG: Routing to handleTranslationRequest.'); // 新增日志
                return handleTranslationRequest(newRequest, env);
            }
        }
        
        console.log('DEBUG: Routing to api_proxy/worker.mjs.'); // 新增日志
        // 其他请求按原方式处理，这里传递原始的 request
        const worker = await import('./api_proxy/worker.mjs');
        return await worker.default.fetch(request, env);
    } catch (error) {
        console.error('API request error caught in handleAPIRequest:', error); // 改进错误日志
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

/**
 * @function handleTranslationRequest
 * @description 处理翻译请求，将请求转发到 SiliconFlow 的聊天补全API。
 * @param {Request} request - 传入的请求对象。
 * @param {Object} env - 环境变量对象，包含API令牌等。
 * @returns {Promise<Response>} - 返回一个 Promise，解析为处理后的响应。
 * @throws {Error} - 如果API Key缺失或SiliconFlow API请求失败。
 */
async function handleTranslationRequest(request, env) {
    try {
        const body = await request.json();
        
        let targetUrl;
        let apiKey;

        if (body.model === 'gemini-2.5-flash-lite-preview-06-17') {
            targetUrl = 'https://geminiapim.10110531.xyz/v1/chat/completions';
            apiKey = env.GEMINI_TRANSLATION_API_KEY;
            if (!apiKey) {
                throw new Error('GEMINI_TRANSLATION_API_KEY is not configured in environment variables for gemini-2.5-flash-lite-preview-06-17.');
            }
        } else {
            targetUrl = 'https://api.siliconflow.cn/v1/chat/completions';
            apiKey = env.SF_API_TOKEN;
            if (!apiKey) {
                throw new Error('SF_API_TOKEN is not configured in environment variables for SiliconFlow models.');
            }
        }

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`SiliconFlow API请求失败: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        
        const result = await response.json();
        return new Response(JSON.stringify(result), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (error) {
        console.error('翻译API错误:', error);
        return new Response(JSON.stringify({
            error: error.message || '翻译处理失败',
            details: error.stack || '无堆栈信息'
        }), {
            status: 500,
            headers: { 
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*' 
            },
        });
    }
}
