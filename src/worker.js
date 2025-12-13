import { handleMcpProxyRequest } from './mcp_proxy/mcp-handler.js';
// ✅ 引入技能管理器 - 构建时已初始化完成
import { skillManager } from './static/js/tool-spec-system/skill-manager.js';

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

    // 技能系统状态检查端点
    if (url.pathname === '/api/skills/status' && request.method === 'GET') {
      return handleSkillsStatus(request);
    }

    if (url.pathname.endsWith("/chat/completions") ||
        url.pathname.endsWith("/embeddings") ||
        url.pathname.endsWith("/models") ||
        url.pathname === '/api/request') {
      return handleAPIRequest(request, env);
    }

    // 处理历史记录API请求
    if (url.pathname.startsWith('/api/history/')) {
      return handleHistoryRequest(request, env);
    }

    // 新增：处理 MCP 工具调用代理请求
    if (url.pathname === '/api/mcp-proxy') {
      return handleMcpProxyRequest(request, env);
    }

    // 新增：处理国际象棋保存功能
    if (url.pathname.startsWith('/api/chess/')) {
      return handleChessRequest(request, env);
    }

// 🎯 [新增功能] 添加密码验证接口
if (url.pathname === '/api/verify-password' && request.method === 'POST') {
  try {
    const { password } = await request.json();
    const correctPassword = env.FILE_MANAGER_PASSWORD;

    // 安全地比较密码 (避免时序攻击，虽然在这里影响不大，但是好习惯)
    if (password && correctPassword && password.length === correctPassword.length && crypto.subtle.timingSafeEqual(
          new TextEncoder().encode(password),
          new TextEncoder().encode(correctPassword)
        )) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ success: false, message: "Incorrect password." }), { status: 401 }); // 401 Unauthorized
    }
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Invalid request." }), { status: 400 }); // Bad Request
  }
}
// 🎯 最终的、极简的修复：直接请求已有的公共主机名
if (url.pathname.startsWith('/api/v1/')) {
  // 直接使用您工具调用后端已经验证过的公共主机名
  const backendHostname = 'pythonsandbox.10110531.xyz';

  // 构造目标的URL
  const targetUrl = new URL(request.url);
  targetUrl.hostname = backendHostname;
  targetUrl.protocol = 'https:';

  // 直接创建一个新的请求进行转发
  const proxyRequest = new Request(targetUrl, request);

  try {
    // 将请求发往公共主机名，Cloudflare会自动路由到您的隧道
    return await fetch(proxyRequest);
  } catch (error) {
    console.error('Failed to forward request to backend hostname:', error);
    return new Response('Failed to connect to the backend service.', { status: 502 });
  }
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
  
  // 用于存储在连接建立前收到的消息（带元数据、重试和超时）
  let pendingMessages = [];
  let pendingMessageCounter = 0;
  const PENDING_QUEUE_MAX = 2000; // 队列上限，避免内存耗尽（可配置）

  const targetWebSocket = new WebSocket(targetUrl);

  function makeMessageEntry(data) {
    return {
      id: `msg_${Date.now()}_${pendingMessageCounter++}`,
      timestamp: Date.now(),
      data,
      retries: 0,
      maxRetries: 3,
      status: 'pending', // pending | sending | sent | failed | expired
      attemptAt: Date.now()
    };
  }

  function scheduleExpiry(entry) {
    // 30s 后过期（如果仍未发送）
    setTimeout(() => {
      const idx = pendingMessages.findIndex(m => m.id === entry.id && m.status === 'pending');
      if (idx !== -1) {
        const expired = pendingMessages[idx];
        expired.status = 'expired';
        try {
          if (proxy && proxy.readyState === WebSocket.OPEN) {
            proxy.send(JSON.stringify({ type: 'message_expired', messageId: expired.id }));
          }
        } catch (e) {
          // 忽略发送错误
          console.warn('Notify client of expiry failed', e);
        }
      }
    }, 30000);
  }

  function queueMessage(data) {
    try {
      if (pendingMessages.length >= PENDING_QUEUE_MAX) {
        // 队列已满，直接告知客户端失败
        if (proxy && proxy.readyState === WebSocket.OPEN) {
          proxy.send(JSON.stringify({ type: 'message_rejected', reason: 'queue_full' }));
        }
        return null;
      }
      const entry = makeMessageEntry(data);
      pendingMessages.push(entry);
      scheduleExpiry(entry);
      return entry;
    } catch (e) {
      console.error('queueMessage error', e);
      return null;
    }
  }

  function backoffFor(retries) {
    // 指数退避 (ms)，基数 500ms
    return Math.min(500 * Math.pow(2, retries), 30000);
  }

  function flushPendingMessages() {
    if (!pendingMessages.length) return;

    // 按时间排序，优先发送到期的
    const now = Date.now();
    const toAttempt = pendingMessages.filter(m => m.status === 'pending' && m.attemptAt <= now);

    for (const msg of toAttempt) {
      try {
        if (targetWebSocket && targetWebSocket.readyState === WebSocket.OPEN) {
          msg.status = 'sending';
          targetWebSocket.send(msg.data);
          msg.status = 'sent';
          // 发送成功后，从队列中移除（后续统一清理）
        } else {
          // 目标不可用，安排重试
          msg.retries++;
          if (msg.retries >= msg.maxRetries) {
            msg.status = 'failed';
            if (proxy && proxy.readyState === WebSocket.OPEN) {
              proxy.send(JSON.stringify({ type: 'message_failed', messageId: msg.id, reason: 'max_retries_exceeded' }));
            }
          } else {
            msg.attemptAt = Date.now() + backoffFor(msg.retries);
          }
        }
      } catch (err) {
        console.error(`Failed to send pending message ${msg.id}:`, err);
        msg.retries++;
        msg.status = 'pending';
        if (msg.retries >= msg.maxRetries) {
          msg.status = 'failed';
          if (proxy && proxy.readyState === WebSocket.OPEN) {
            proxy.send(JSON.stringify({ type: 'message_failed', messageId: msg.id, reason: err.message || 'send_error' }));
          }
        } else {
          msg.attemptAt = Date.now() + backoffFor(msg.retries);
        }
      }
    }

    // 清理已发送/失败/过期的消息，保留 pending 的
    pendingMessages = pendingMessages.filter(m => m.status === 'pending');
  }
 
  console.log('Initial targetWebSocket readyState:', targetWebSocket.readyState);
 
  targetWebSocket.addEventListener("open", () => {
    console.log('Connected to target server');
    console.log('targetWebSocket readyState after open:', targetWebSocket.readyState);

    // 连接建立后，触发队列刷新（含重试/退避策略）
    try {
      console.log(`Processing ${pendingMessages.length} pending messages`);
      flushPendingMessages();
    } catch (e) {
      console.error('Error flushing pending messages on open:', e);
    }
  });
 
  proxy.addEventListener("message", (event) => {
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
        console.error('Error sending to gemini, queueing for retry:', error);
        // 发送失败，改为入队并触发后续重试
  queueMessage(event.data);
        // 立即触发一次刷新尝试
        flushPendingMessages();
      }
    } else {
      // 如果连接还未建立，将消息加入待处理队列
      console.log('Connection not ready, queueing message');
      queueMessage(event.data);
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
    
    // 生成请求ID
    const requestId = crypto.randomUUID();
    
    try {
        // 仅当请求是 POST 且包含 JSON 体时才尝试解析
        if (clonedRequest.method === 'POST' && clonedRequest.headers.get('content-type')?.includes('application/json')) {
            const body = await clonedRequest.json();
            
            // 🔥🔥🔥 技能注入核心逻辑 🔥🔥🔥
            if (skillManager.isInitialized && body.messages) {
                await injectSkillsIntoRequest(body, requestId);
            }
            // 🔥🔥🔥 技能注入结束 🔥🔥🔥

            const model = body.model || '';

            // 🎯 1. 摘要子代理的专用路由 (最高优先级)
            if (model === 'gemini-2.0-flash-exp-summarizer') {
                console.log(`✅ [API路由] 检测到摘要子代理请求，路由到高速模型`);
                // 使用一个快速、便宜的模型来处理摘要任务
                body.model = 'gemini-2.5-flash-lite-preview-09-2025';
                const targetUrl = 'https://geminiapicode.10110531.xyz/v1/chat/completions';
                const apiKey = env.AUTH_KEY;
                
                if (!apiKey) {
                    throw new Error('AUTH_KEY is not configured for summarizer.');
                }

                // 统一的转发逻辑
                const proxyResponse = await fetch(targetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body)
                });
                
                return new Response(proxyResponse.body, {
                    status: proxyResponse.status,
                    statusText: proxyResponse.statusText,
                    headers: {
                        'Content-Type': proxyResponse.headers.get('Content-Type') || 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
            
            // 路由到新的聊天/搜索请求处理器
            if (
                model === 'models/gemini-2.5-pro' ||
                model === 'models/gemini-2.0-flash'||
                model === 'models/gemini-2.5-flash' ||
                model === 'models/gemini-2.5-flash-lite' ||
                model === 'gemini-2.5-flash-preview-09-2025'

            ) {                
                console.log(`DEBUG: Routing to custom chat proxy for model: ${model}`);
                const targetUrl = 'https://geminiapim.10110531.xyz/v1/chat/completions';
                const apiKey = env.AUTH_KEY;

                if (!apiKey) {
                    throw new Error('AUTH_KEY is not configured in environment variables.');
                }

                // 检查请求是否明确要求非流式响应
                if (body.stream === false) {
                    console.log(`[Worker] 检测到非流式请求，将聚合响应并确保格式正确。`);
                    
                    const proxyResponse = await fetch(targetUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: JSON.stringify(body)
                    });

                    if (!proxyResponse.ok) {
                        // 如果上游返回错误，直接返回错误响应
                        return new Response(proxyResponse.body, {
                            status: proxyResponse.status,
                            statusText: proxyResponse.statusText,
                            headers: {
                                'Content-Type': proxyResponse.headers.get('Content-Type') || 'application/json',
                                'Access-Control-Allow-Origin': '*'
                            }
                        });
                    }

                    const result = await proxyResponse.json();
                    
                    // ✨ 核心：主动构建一个格式绝对正确的JSON对象
                    const finalContent = result?.choices?.[0]?.message?.content || '（无法解析响应）';
                    const correctlyFormattedResponse = {
                        choices: [{
                            message: { content: finalContent },
                            finish_reason: result?.choices?.[0]?.finish_reason || 'stop'
                        }],
                        usage: result?.usage || { /* 占位符 */ }
                    };

                    return new Response(JSON.stringify(correctlyFormattedResponse), {
                        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                    });

                } else {
                    // 对于流式请求，保持原有的直接代理逻辑
                    console.log(`[Worker] 检测到流式请求或未指定流式，直接代理。`);
                    
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
                }
            } else if (model === 'glm-4.1v-thinking-flash' || model === 'glm-4v-flash' || model === 'glm-4.6v-flash' || model === 'GLM-4.5-Flash') {
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
            
            // ================================================================
            // 🎯 新增：DeepSeek-V3.2 模型路由
            // ================================================================
            } else if (model === 'deepseek-chat' || model === 'deepseek-reasoner') {
                console.log(`DEBUG: Routing to DeepSeek chat proxy for model: ${model}`);
                
                // 根据 DeepSeek API 文档，base_url 为 https://api.deepseek.com
                const targetUrl = 'https://api.deepseek.com/v1/chat/completions';
                const apiKey = env.DEEPSEEK_API_KEY; // 需要添加环境变量

                if (!apiKey) {
                    throw new Error('DEEPSEEK_API_KEY is not configured in environment variables.');
                }

                // 处理思考模式：如果模型是 deepseek-reasoner，确保开启思考模式
                if (model === 'deepseek-reasoner') {
                    // 确保请求体包含 thinking 参数
                    if (!body.thinking) {
                        body.thinking = { type: "enabled" };
                    }
                    console.log(`[Worker] DeepSeek 思考模式已启用`);
                }

                // 直接将请求体转发到 DeepSeek API
                const proxyResponse = await fetch(targetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body)
                });

                // 将 DeepSeek API 的响应直接返回给客户端
                return new Response(proxyResponse.body, {
                    status: proxyResponse.status,
                    statusText: proxyResponse.statusText,
                    headers: {
                        'Content-Type': proxyResponse.headers.get('Content-Type') || 'application/json',
                        'Access-Control-Allow-Origin': '*' // 确保CORS头部
                    }
                });
            // ================================================================
            // 🎯 DeepSeek 模型路由结束
            // ================================================================
            
            } else if (model === 'deepseek-ai/DeepSeek-OCR') {
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
            
            } else if (model === 'Qwen/Qwen3-Coder-480B-A35B-Instruct') {
                console.log(`DEBUG: Routing to ModelScope chat proxy for model: ${model}`);
                const targetUrl = 'https://api-inference.modelscope.cn/v1/chat/completions';
                const apiKey = env.QWEN_API_KEY;

                if (!apiKey) {
                    throw new Error('QWEN_API_KEY is not configured in environment variables.');
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
            } else if (model === 'Qwen/Qwen3-Next-80B-A3B-Thinking') {
                console.log(`DEBUG: Routing to ModelScope chat proxy for model: ${model}`);
                const targetUrl = 'https://api-inference.modelscope.cn/v1/chat/completions';
                const apiKey = env.QWEN_API_KEY;

                if (!apiKey) {
                    throw new Error('QWEN_API_KEY is not configured in environment variables.');
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
            } else if (model === 'Qwen/Qwen3-235B-A22B-Thinking-2507') {
                console.log(`DEBUG: Routing to ModelScope chat proxy for model: ${model}`);
                const targetUrl = 'https://api-inference.modelscope.cn/v1/chat/completions';
                const apiKey = env.QWEN_API_KEY;

                if (!apiKey) {
                    throw new Error('QWEN_API_KEY is not configured in environment variables.');
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
        console.error(`❌ [API请求] 请求 ${requestId} 处理失败:`, error);
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

// ✅ 技能系统状态检查端点
async function handleSkillsStatus(request) {
  const status = skillManager.getSystemStatus();
  
  return new Response(JSON.stringify({
    success: true,
    data: status,
    message: skillManager.isInitialized ? 
      `技能系统运行正常，已加载 ${status.skillCount} 个技能` : 
      '技能系统未初始化'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ✅ 独立的技能注入函数 - 更新版本
async function injectSkillsIntoRequest(body, requestId) {
    try {
        const userMessages = body.messages.filter(m => m.role === 'user');
        const latestUserMessage = userMessages[userMessages.length - 1]?.content;

        if (!latestUserMessage || typeof latestUserMessage !== 'string') {
            return;
        }

        // 检查是否已注入，避免重复
        const hasInjection = body.messages.some(m => m.metadata?.skill_injection === true);
        if (hasInjection) {
            console.log('🔁 [技能注入] 检测到已有技能注入，跳过重复注入');
            return;
        }

        // 使用增强的匹配算法
        const relevantSkills = skillManager.findRelevantSkills(latestUserMessage, {
            model: body.model,
            timestamp: new Date().toISOString(),
            requestId: requestId
        });

        if (relevantSkills.length > 0) {
            const injectionContent = skillManager.generateMultiSkillInjection(relevantSkills, latestUserMessage);
            
            const skillMessage = {
                role: 'system',
                content: injectionContent,
                metadata: { 
                    skill_injection: true,
                    injected_skills: relevantSkills.map(s => s.toolName),
                    match_scores: relevantSkills.map(s => s.score),
                    injected_at: new Date().toISOString(),
                    request_id: requestId
                }
            };
            
            // 智能插入消息 - 在最后一个系统消息之后插入
            let insertIndex = body.messages.length;
            for (let i = body.messages.length - 1; i >= 0; i--) {
                if (body.messages[i].role === 'system') {
                    insertIndex = i + 1;
                    break;
                }
            }
            
            body.messages.splice(insertIndex, 0, skillMessage);
            
            // 记录监控日志
            console.log('📊 [技能监控]', JSON.stringify({
                request_id: requestId,
                user_query: latestUserMessage.substring(0, 200), // 截取前200字符
                matched_skills: relevantSkills.map(s => ({
                    name: s.name,
                    tool_name: s.toolName,
                    score: s.score
                })),
                injection_strategy: relevantSkills.length > 1 ? 'multi' : 'single',
                timestamp: new Date().toISOString()
            }));
            
            console.log(`🎯 [技能注入] 已为请求 ${requestId} 注入 ${relevantSkills.length} 个技能指南`);
            
        } else {
            console.log(`🔍 [技能注入] 请求 ${requestId} 未找到相关技能匹配`);
        }
    } catch (error) {
        console.error(`❌ [技能注入] 请求 ${requestId} 过程中出错:`, error);
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
        const modelName = body.model;
        
        let targetUrl;
        let apiKey;
        let provider = ''; // 用于错误信息

        if (modelName.startsWith('gemini-')) {
            provider = 'Gemini';
            targetUrl = 'https://geminiapim.10110531.xyz/v1/chat/completions';
            apiKey = env.AUTH_KEY;
            if (!apiKey) {
                throw new Error('AUTH_KEY is not configured in environment variables for Gemini models.');
            }
        } else if (modelName.startsWith('GLM-')) {
            provider = 'Zhipu';
            targetUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
            apiKey = env.ZHIPUAI_API_KEY;
            if (!apiKey) {
                throw new Error('ZHIPUAI_API_KEY is not configured in environment variables for Zhipu models.');
            }
        } else { // 默认为 SiliconFlow (用于 THUDM 等)
            provider = 'SiliconFlow';
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
            throw new Error(`${provider} API请求失败: ${response.status} - ${JSON.stringify(errorData)}`);
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

/**
 * @function handleHistoryRequest
 * @description 处理所有与聊天历史记录相关的API请求。
 * @param {Request} request - 传入的请求对象。
 * @param {Object} env - 环境变量对象，包含KV命名空间等。
 * @returns {Promise<Response>} - 返回一个 Promise，解析为处理后的响应。
 */
async function handleHistoryRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 路由: 保存会话
  if (path === '/api/history/save' && request.method === 'POST') {
    try {
      const sessionData = await request.json();
      if (!sessionData || !sessionData.sessionId) {
        return new Response(JSON.stringify({ error: 'Missing session data or sessionId' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      // 确保 sessionData 包含 is_pinned 字段，如果不存在则默认为 false
      const dataToSave = {
        ...sessionData,
        is_pinned: sessionData.is_pinned === true // 确保是布尔值
      };
      const key = `history:${sessionData.sessionId}`;
      await env.GEMINICHAT_HISTORY_KV.put(key, JSON.stringify(dataToSave));
      return new Response(JSON.stringify({ status: 'success' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (error) {
      console.error('Failed to save history:', error);
      return new Response(JSON.stringify({ error: 'Failed to save history', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // 路由: 加载会话
  const loadMatch = path.match(/^\/api\/history\/load\/(.+)$/);
  if (loadMatch && request.method === 'GET') {
    try {
      const sessionId = loadMatch[1];
      const key = `history:${sessionId}`;
      const sessionData = await env.GEMINICHAT_HISTORY_KV.get(key);

      if (sessionData === null) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const parsedSessionData = JSON.parse(sessionData);
      // 确保 is_pinned 字段存在，如果不存在则默认为 false
      if (typeof parsedSessionData.is_pinned === 'undefined') {
        parsedSessionData.is_pinned = false;
      }
      return new Response(JSON.stringify(parsedSessionData), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (error) {
      console.error('Failed to load history:', error);
      return new Response(JSON.stringify({ error: 'Failed to load history', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // 路由: 置顶/取消置顶会话
  const pinMatch = path.match(/^\/api\/history\/(.+)\/pin$/);
  if (pinMatch && request.method === 'PATCH') {
    try {
      const sessionId = pinMatch[1];
      const key = `history:${sessionId}`;
      const existingData = await env.GEMINICHAT_HISTORY_KV.get(key);

      if (existingData === null) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const sessionData = JSON.parse(existingData);
      const { is_pinned } = await request.json();

      if (typeof is_pinned !== 'boolean') {
        return new Response(JSON.stringify({ error: 'Invalid value for is_pinned, must be boolean' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      sessionData.is_pinned = is_pinned;
      await env.GEMINICHAT_HISTORY_KV.put(key, JSON.stringify(sessionData));

      return new Response(JSON.stringify({ status: 'success', is_pinned: sessionData.is_pinned }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (error) {
      console.error('Failed to update pin status:', error);
      return new Response(JSON.stringify({ error: 'Failed to update pin status', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // 路由: 编辑会话标题
  const titleMatch = path.match(/^\/api\/history\/(.+)\/title$/);
  if (titleMatch && request.method === 'PATCH') {
    try {
      const sessionId = titleMatch[1];
      const key = `history:${sessionId}`;
      const existingData = await env.GEMINICHAT_HISTORY_KV.get(key);

      if (existingData === null) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const sessionData = JSON.parse(existingData);
      const { title } = await request.json();

      if (typeof title !== 'string' || title.trim().length === 0 || title.length > 50) { // 标题长度限制
        return new Response(JSON.stringify({ error: 'Invalid title provided. Title must be a non-empty string up to 50 characters.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      sessionData.current_title = title.trim(); // 更新标题
      await env.GEMINICHAT_HISTORY_KV.put(key, JSON.stringify(sessionData));

      return new Response(JSON.stringify({ status: 'success', new_title: sessionData.current_title }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (error) {
      console.error('Failed to update title:', error);
      return new Response(JSON.stringify({ error: 'Failed to update title', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // 路由: 删除会话
  const deleteMatch = path.match(/^\/api\/history\/(.+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    try {
      const sessionId = deleteMatch[1];
      const key = `history:${sessionId}`;
      await env.GEMINICHAT_HISTORY_KV.delete(key);

      return new Response(null, {
        status: 204, // No Content
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    } catch (error) {
      console.error('Failed to delete history:', error);
      return new Response(JSON.stringify({ error: 'Failed to delete history', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // 路由: 批量删除会话
  if (path === '/api/history/batch-delete' && request.method === 'DELETE') {
    try {
      const { sessionIds } = await request.json();
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid or empty sessionIds array provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const deletePromises = sessionIds.map(id => {
        const key = `history:${id}`;
        return env.GEMINICHAT_HISTORY_KV.delete(key);
      });
      
      await Promise.all(deletePromises);

      return new Response(null, {
        status: 204, // No Content
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    } catch (error) {
      console.error('Failed to batch delete history:', error);
      return new Response(JSON.stringify({ error: 'Failed to batch delete history', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }
 
  // 路由: 生成标题
  if (path === '/api/history/generate-title' && request.method === 'POST') {
    try {
        const { messages } = await request.json();
        if (!messages || messages.length === 0) {
            return new Response(JSON.stringify({ error: 'Missing messages for title generation' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }

        // 使用 gemini-2.0-flash 模型进行总结
        const model = 'models/gemini-2.5-flash-lite-preview-09-2025';
        const apiKey = env.AUTH_KEY;
        const targetUrl = 'https://geminiapicode.10110531.xyz/v1/chat/completions';

        if (!apiKey) {
            throw new Error('AUTH_KEY is not configured in environment variables.');
        }

        const systemPrompt = "你是一个对话总结专家。请根据以下对话内容，生成一个不超过10个字的、简洁明了的标题。只返回标题本身，不要任何多余的文字。";
        const userContent = messages.map(m => `${m.role}: ${m.content}`).join('\n');

        const proxyResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userContent }
                ],
                stream: false
            })
        });

        if (!proxyResponse.ok) {
            const errorData = await proxyResponse.text();
            throw new Error(`AI title generation failed: ${proxyResponse.status} - ${errorData}`);
        }

        const result = await proxyResponse.json();
        const title = result.choices[0]?.message?.content.trim() || '无标题对话';

        return new Response(JSON.stringify({ title: title }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });

    } catch (error) {
        console.error('Failed to generate title:', error);
        return new Response(JSON.stringify({ error: 'Failed to generate title', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
  }

  // 路由: 列出所有会话元数据
  if (path === '/api/history/list-all-meta' && request.method === 'GET') {
    try {
      const { keys } = await env.GEMINICHAT_HISTORY_KV.list({ prefix: 'history:' });
      const sessionMetas = [];
      for (const keyInfo of keys) {
        const sessionData = await env.GEMINICHAT_HISTORY_KV.get(keyInfo.name);
        if (sessionData) {
          const parsedSessionData = JSON.parse(sessionData);
          sessionMetas.push({
            id: parsedSessionData.sessionId,
            title: parsedSessionData.title || '无标题聊天',
            createdAt: parsedSessionData.createdAt,
            updatedAt: parsedSessionData.updatedAt,
            is_pinned: parsedSessionData.is_pinned === true, // 确保是布尔值
          });
        }
      }
      return new Response(JSON.stringify(sessionMetas), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (error) {
      console.error('Failed to list all history meta:', error);
      return new Response(JSON.stringify({ error: 'Failed to list all history meta', details: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }
 
   return new Response(JSON.stringify({ error: 'History API route not found' }), {
     status: 404,
     headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
   });
}

// worker.js

/**
 * @function handleChessRequest
 * @description 处理国际象棋相关的API请求（保存、列表、加载）- 【已修复】
 * @param {Request} request - 传入的请求对象
 * @param {Object} env - 环境变量对象，包含D1数据库绑定等
 * @returns {Promise<Response>} - 返回处理后的响应
 */
async function handleChessRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  // 路由: 保存棋局
  if (path === '/api/chess/save' && request.method === 'POST') {
    try {
      const gameData = await request.json(); // gameData 是驼峰命名

      // 数据校验
      if (!gameData.name || !gameData.fen) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: '缺少必要参数：name 和 fen' 
        }), { status: 400 });
      }

      // FIX 1: 使用正确的 D1 .run() API，并直接从返回结果中获取 last_row_id
      const { meta } = await env.CHAT_DB.prepare(
        `INSERT INTO chess_games (name, fen, full_history, move_history, current_turn,
                               castling, en_passant, half_move_clock, full_move_number, metadata, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(
        gameData.name,
        gameData.fen,
        JSON.stringify(gameData.fullHistory || []), // 将数组/对象转为JSON字符串
        JSON.stringify(gameData.moveHistory || []),
        gameData.currentTurn || 'w',
        gameData.castling || 'KQkq',
        gameData.enPassant || '-',
        gameData.halfMoveClock || 0,
        gameData.fullMoveNumber || 1,
        JSON.stringify(gameData.metadata || {})
      ).run();

      return new Response(JSON.stringify({
        success: true,
        gameId: meta.last_row_id // FIX 2: 正确获取最后插入的ID
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      console.error('保存棋局失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '服务器内部错误: ' + error.message
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }
  }

  // 路由: 获取棋局列表
  if (path === '/api/chess/list' && request.method === 'GET') {
    try {
      const { results } = await env.CHAT_DB.prepare(
        "SELECT id, name, fen, metadata, created_at, updated_at FROM chess_games ORDER BY updated_at DESC LIMIT 50"
      ).all();

      return new Response(JSON.stringify({
        success: true,
        games: results || []
      }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
      console.error('获取棋局列表失败:', error);
      return new Response(JSON.stringify({
        success: false, error: '服务器内部错误: ' + error.message
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // 路由: 加载指定棋局
  const loadMatch = path.match(/^\/api\/chess\/load\/(.+)$/);
  if (loadMatch && request.method === 'GET') {
    try {
      const gameId = loadMatch[1];
      if (!gameId) {
        return new Response(JSON.stringify({ success: false, error: '缺少棋局ID' }), { status: 400 });
      }

      const game = await env.CHAT_DB.prepare("SELECT * FROM chess_games WHERE id = ?").bind(gameId).first();

      if (!game) {
        return new Response(JSON.stringify({ success: false, error: '未找到指定棋局' }), { status: 404 });
      }

      // FIX 3: 在后端将TEXT字段解析回JSON/Array，再发送给前端
      try {
        game.full_history = JSON.parse(game.full_history || '[]');
        game.move_history = JSON.parse(game.move_history || '[]');
        game.metadata = JSON.parse(game.metadata || '{}');
      } catch (parseError) {
        console.error('解析JSON字段失败:', parseError);
        game.full_history = [];
        game.move_history = [];
        game.metadata = {};
      }

      return new Response(JSON.stringify({
        success: true,
        game: game
      }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    } catch (error) {
      console.error('加载棋局失败:', error);
      return new Response(JSON.stringify({
        success: false, error: '服务器内部错误: ' + error.message
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // 【新增】路由: 删除指定棋局
  const deleteMatch = path.match(/^\/api\/chess\/delete\/(.+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    try {
      const gameId = deleteMatch[1];
      if (!gameId) {
        return new Response(JSON.stringify({ success: false, error: '缺少棋局ID' }), { status: 400 });
      }

      await env.CHAT_DB.prepare("DELETE FROM chess_games WHERE id = ?").bind(gameId).run();

      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }); // 204 No Content 表示成功

    } catch (error) {
      console.error('删除棋局失败:', error);
      return new Response(JSON.stringify({
        success: false, error: '服务器内部错误: ' + error.message
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // 【新增】路由: 重命名指定棋局
  const renameMatch = path.match(/^\/api\/chess\/rename\/(.+)$/);
  if (renameMatch && request.method === 'PATCH') {
    try {
      const gameId = renameMatch[1];
      const { name } = await request.json();

      if (!gameId || !name || name.trim() === '') {
        return new Response(JSON.stringify({ success: false, error: '缺少棋局ID或新名称' }), { status: 400 });
      }

      await env.CHAT_DB.prepare(
        "UPDATE chess_games SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(name.trim(), gameId).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });

    } catch (error) {
      console.error('重命名棋局失败:', error);
      return new Response(JSON.stringify({
        success: false, error: '服务器内部错误: ' + error.message
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // 未匹配的路由
  return new Response(JSON.stringify({ success: false, error: '国际象棋API路由未找到' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}