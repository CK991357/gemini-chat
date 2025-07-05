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
    if (url.pathname === '/api/translate') {
      return handleTranslationRequest(request, env);
    }

    if (url.pathname.endsWith("/chat/completions") ||
        url.pathname.endsWith("/embeddings") ||
        url.pathname.endsWith("/models") ||
        url.pathname === '/api/request') {
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



        // 添加文生图API路由
        if (url.pathname === '/api/generate-image') {
            return handleImageGenerationRequest(request, env);
        }

        // ... 其他路由 ...

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

async function handleWebSocket(request, env) {


  if (request.headers.get("Upgrade") !== "websocket") {
		return new Response("Expected WebSocket connection", { status: 400 });
	}
  
	const url = new URL(request.url);
	const pathAndQuery = url.pathname + url.search;
	const targetUrl = `wss://generativelanguage.googleapis.com${pathAndQuery}`;
	  
	console.log('Target URL:', targetUrl);
  
  const [client, proxy] = new WebSocketPair();
  proxy.accept();
  
   // 用于存储在连接建立前收到的消息
   let pendingMessages = [];
  
   const targetWebSocket = new WebSocket(targetUrl);
 
   console.log('Initial targetWebSocket readyState:', targetWebSocket.readyState);
 
   targetWebSocket.addEventListener("open", () => {
     console.log('Connected to target server');
     console.log('targetWebSocket readyState after open:', targetWebSocket.readyState);
     
     // 连接建立后，发送所有待处理的消息
     console.log(`Processing ${pendingMessages.length} pending messages`);
     for (const message of pendingMessages) {
      try {
        targetWebSocket.send(message);
        console.log('Sent pending message:', message);
      } catch (error) {
        console.error('Error sending pending message:', error);
      }
     }
     pendingMessages = []; // 清空待处理消息队列
   });
 
   proxy.addEventListener("message", async (event) => {
     console.log('Received message from client:', {
       dataPreview: typeof event.data === 'string' ? event.data.slice(0, 200) : 'Binary data',
       dataType: typeof event.data,
       timestamp: new Date().toISOString()
     });
     
     console.log("targetWebSocket.readyState"+targetWebSocket.readyState)
     if (targetWebSocket.readyState === WebSocket.OPEN) {
        try {
          targetWebSocket.send(event.data);
          console.log('Successfully sent message to gemini');
        } catch (error) {
          console.error('Error sending to gemini:', error);
        }
     } else {
       // 如果连接还未建立，将消息加入待处理队列
       console.log('Connection not ready, queueing message');
       pendingMessages.push(event.data);
     }
   });
 
   targetWebSocket.addEventListener("message", (event) => {
     console.log('Received message from gemini:', {
     dataPreview: typeof event.data === 'string' ? event.data.slice(0, 200) : 'Binary data',
     dataType: typeof event.data,
     timestamp: new Date().toISOString()
     });
     
     try {
     if (proxy.readyState === WebSocket.OPEN) {
       proxy.send(event.data);
       console.log('Successfully forwarded message to client');
     }
     } catch (error) {
     console.error('Error forwarding to client:', error);
     }
   });
 
   targetWebSocket.addEventListener("close", (event) => {
     console.log('Gemini connection closed:', {
     code: event.code,
     reason: event.reason || 'No reason provided',
     wasClean: event.wasClean,
     timestamp: new Date().toISOString(),
     readyState: targetWebSocket.readyState
     });
     if (proxy.readyState === WebSocket.OPEN) {
     proxy.close(event.code, event.reason);
     }
   });
 
   proxy.addEventListener("close", (event) => {
     console.log('Client connection closed:', {
     code: event.code,
     reason: event.reason || 'No reason provided',
     wasClean: event.wasClean,
     timestamp: new Date().toISOString()
     });
     if (targetWebSocket.readyState === WebSocket.OPEN) {
     targetWebSocket.close(event.code, event.reason);
     }
   });
 
   targetWebSocket.addEventListener("error", (error) => {
     console.error('Gemini WebSocket error:', {
     error: error.message || 'Unknown error',
     timestamp: new Date().toISOString(),
     readyState: targetWebSocket.readyState
     });
   });

 
   return new Response(null, {
   status: 101,
   webSocket: client,
   });
}

async function handleAPIRequest(request, env) {
    const clonedRequest = request.clone();
    try {
        // 仅当请求是 POST 且包含 JSON 体时才尝试解析
        if (clonedRequest.method === 'POST' && clonedRequest.headers.get('content-type')?.includes('application/json')) {
            const body = await clonedRequest.json();
            const model = body.model || '';

            // 路由到新的聊天/搜索请求处理器
            if (
                model === 'models/gemini-2.5-flash-preview-05-20' ||
                model === 'models/gemini-2.5-flash-lite-preview-06-17' ||
                model === 'models/gemini-2.0-flash'
            ) {
                console.log(`DEBUG: Routing to custom chat proxy for model: ${model}`);
                const targetUrl = 'https://geminiapim.10110531.xyz/v1/chat/completions';
                const apiKey = env.GEMINI_CHAT_API_KEY;

                if (!apiKey) {
                    throw new Error('GEMINI_CHAT_API_KEY is not configured in environment variables.');
                }

                // 直接将请求体转发到中转端点
                const proxyResponse = await fetch(targetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body)
                });

                // 将中转端点的响应（包括流）直接返回给客户端
                return new Response(proxyResponse.body, {
                    status: proxyResponse.status,
                    statusText: proxyResponse.statusText,
                    headers: {
                        'Content-Type': proxyResponse.headers.get('Content-Type'),
                        'Access-Control-Allow-Origin': '*' // 确保CORS头部
                    }
                });
            } else if (model === 'glm-4.1v-thinking-flash' || model === 'glm-4v-flash') {
                console.log(`DEBUG: Routing to Zhipu chat proxy for model: ${model}`);
                const targetUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
                const apiKey = env.ZHIPUAI_API_KEY;

                if (!apiKey) {
                    throw new Error('ZHIPUAI_API_KEY is not configured in environment variables.');
                }

                // 直接将请求体转发到中转端点
                const proxyResponse = await fetch(targetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body)
                });

                // 将中转端点的响应（包括流）直接返回给客户端
                return new Response(proxyResponse.body, {
                    status: proxyResponse.status,
                    statusText: proxyResponse.statusText,
                    headers: {
                        'Content-Type': proxyResponse.headers.get('Content-Type') || 'application/json',
                        'Access-Control-Allow-Origin': '*' // 确保CORS头部
                    }
                });
            } else if (model === 'THUDM/GLM-4.1V-9B-Thinking') {
                console.log(`DEBUG: Routing to SiliconFlow chat proxy for model: ${model}`);
                const targetUrl = 'https://api.siliconflow.cn/v1/chat/completions';
                const apiKey = env.SF_API_TOKEN;

                if (!apiKey) {
                    throw new Error('SF_API_TOKEN is not configured in environment variables.');
                }

                // 直接将请求体转发到中转端点
                const proxyResponse = await fetch(targetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body)
                });

                // 将中转端点的响应（包括流）直接返回给客户端
                return new Response(proxyResponse.body, {
                    status: proxyResponse.status,
                    statusText: proxyResponse.statusText,
                    headers: {
                        'Content-Type': proxyResponse.headers.get('Content-Type') || 'application/json',
                        'Access-Control-Allow-Origin': '*' // 确保CORS头部
                    }
                });
            }
        }

        // 如果没有匹配的路由，返回错误或默认行为
        // 由于 api_proxy/worker.mjs 将被移除，这里不再需要调用它
        return new Response('API route not found or invalid request.', {
            status: 404,
            headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error('API request error in handleAPIRequest:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorStatus = error.status || 500;
        return new Response(JSON.stringify({ error: errorMessage }), {
            status: errorStatus,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
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

        if (body.model === 'gemini-2.5-flash-lite-preview-06-17' || body.model === 'gemini-2.0-flash') {
            targetUrl = 'https://geminiapim.10110531.xyz/v1/chat/completions';
            apiKey = env.GEMINI_TRANSLATION_API_KEY;
            if (!apiKey) {
                throw new Error('GEMINI_TRANSLATION_API_KEY is not configured in environment variables for Gemini models.');
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

// 添加文生图API处理函数
async function handleImageGenerationRequest(request, env) {
    try {
        const body = await request.json();
        const siliconFlowApiToken = env.SF_API_TOKEN; // 从环境变量获取 SiliconFlow API 令牌
        const siliconFlowApiUrl = "https://api.siliconflow.cn/v1/images/generations";

        if (!siliconFlowApiToken) {
            throw new Error('SF_API_TOKEN is not configured in environment variables.');
        }

        const response = await fetch(siliconFlowApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${siliconFlowApiToken}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`SiliconFlow 图像生成API请求失败: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        return new Response(JSON.stringify(result), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // 确保CORS头部
            }
        });

    } catch (error) {
        console.error('图像生成API错误:', error);
        return new Response(JSON.stringify({
            error: error.message || '图像生成失败',
            details: error.stack || '无堆栈信息'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
