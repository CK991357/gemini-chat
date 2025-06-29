//Author: PublicAffairs
//Project: https://github.com/PublicAffairs/openai-gemini
//MIT License : https://github.com/PublicAffairs/openai-gemini/blob/main/LICENSE

import { Buffer } from "node:buffer";

export default {
  async fetch (request, env) { // 添加 env 参数
    if (request.method === "OPTIONS") {
      return handleOPTIONS();
    }
    const errHandler = (err) => {
      console.error(err);
      return new Response(err.message, fixCors({ status: err.status ?? 500 }));
    };
    try {
      // 确保 request.headers 存在，并安全地获取 Authorization 头
      const auth = request.headers && request.headers.get("Authorization");
      const apiKey = auth?.split(" ")[1]; // Gemini API Key 仍然从 Authorization 头获取
      const assert = (success) => {
        if (!success) {
          throw new HttpError("The specified HTTP method is not allowed for the requested resource", 400);
        }
      };
      const { pathname } = new URL(request.url);
      switch (true) {
        case pathname.endsWith("/chat/completions"):
          assert(request.method === "POST");
          return handleCompletions(await request.json(), apiKey, env) // 传递 env
            .catch(errHandler);
        case pathname.endsWith("/embeddings"):
          assert(request.method === "POST");
          return handleEmbeddings(await request.json(), apiKey, env) // 传递 env
            .catch(errHandler);
        case pathname.endsWith("/models"):
          assert(request.method === "GET");
          return handleModels(apiKey, env) // 传递 env
            .catch(errHandler);
        case pathname.endsWith("/api/translate"): // 新增翻译API端点
          assert(request.method === "POST");
          return handleTranslate(await request.json(), env) // 智谱AI API Key 从 env 获取，不从前端传递
            .catch(errHandler);
        default:
          throw new HttpError("404 Not Found", 404);
      }
    } catch (err) {
      return errHandler(err);
    }
  }
};

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

const fixCors = ({ headers, status, statusText }) => {
  headers = new Headers(headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return { headers, status, statusText };
};

const handleOPTIONS = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    }
  });
};

const GEMINI_2_5_PROXY_URL = "https://geminiapim.10110531.xyz";

const ZHIPU_AI_API_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"; // 智谱AI API基础URL

const BASE_URL = "https://generativelanguage.googleapis.com";
const API_VERSION = "v1beta";

// https://github.com/google-gemini/generative-ai-js/blob/cf223ff4a1ee5a2d944c53cddb8976136382bee6/src/requests/request.ts#L71
const API_CLIENT = "genai-js/0.21.0"; // npm view @google/generative-ai version
const makeHeaders = (apiKey, more) => ({
  "x-goog-api-client": API_CLIENT,
  ...(apiKey && { "x-goog-api-key": apiKey }),
  ...more
});

async function handleModels (apiKey, env) { // 添加 env 参数
  const response = await fetch(`${BASE_URL}/${API_VERSION}/models`, {
    headers: makeHeaders(apiKey),
  });
  let { body } = response;
  if (response.ok) {
    const { models } = JSON.parse(await response.text());
    body = JSON.stringify({
      object: "list",
      data: models.map(({ name }) => ({
        id: name.replace("models/", ""),
        object: "model",
        created: 0,
        owned_by: "",
      })),
    }, null, "  ");
  }
  return new Response(body, fixCors(response));
}

const DEFAULT_EMBEDDINGS_MODEL = "text-embedding-004";
async function handleEmbeddings (req, apiKey, env) { // 添加 env 参数
  if (typeof req.model !== "string") {
    throw new HttpError("model is not specified", 400);
  }
  if (!Array.isArray(req.input)) {
    req.input = [ req.input ];
  }
  let model;
  if (req.model.startsWith("models/")) {
    model = req.model;
  } else {
    req.model = DEFAULT_EMBEDDINGS_MODEL;
    model = "models/" + req.model;
  }
  const response = await fetch(`${BASE_URL}/${API_VERSION}/${model}:batchEmbedContents`, {
    method: "POST",
    headers: makeHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      "requests": req.input.map(text => ({
        model,
        content: { parts: { text } },
        outputDimensionality: req.dimensions,
      }))
    })
  });
  let { body } = response;
  if (response.ok) {
    const { embeddings } = JSON.parse(await response.text());
    body = JSON.stringify({
      object: "list",
      data: embeddings.map(({ values }, index) => ({
        object: "embedding",
        index,
        embedding: values,
      })),
      model: req.model,
    }, null, "  ");
  }
  return new Response(body, fixCors(response));
}

const DEFAULT_MODEL = "gemini-1.5-pro-latest";
/**
 * @function handleCompletions
 * @description 处理聊天补全请求，将请求转发到 Gemini API 或中转 Worker。
 * @param {object} req - 原始请求体。
 * @param {string} apiKey - API 密钥。
 * @param {object} env - Cloudflare Worker 环境变量。
 * @returns {Promise<Response>} - 返回一个 Promise，解析为处理后的响应。
 * @throws {HttpError} - 如果请求格式无效。
 */
async function handleCompletions (req, apiKey, env) { // 添加 env 参数
  let model = DEFAULT_MODEL;
  switch(true) {
    case typeof req.model !== "string":
      break;
    case req.model.startsWith("models/"):
      model = req.model.substring(7);
      break;
    case req.model.startsWith("gemini-"):
    case req.model.startsWith("learnlm-"):
      model = req.model;
  }
  const TASK = req.stream ? "streamGenerateContent" : "generateContent";

  // 动态选择基础 URL
  let targetBaseUrl = BASE_URL;
  let isGemini25ProxyModel = false;
  if (model.startsWith("gemini-2.5")) { // 匹配所有 gemini-2.5 开头的模型
      targetBaseUrl = GEMINI_2_5_PROXY_URL;
      isGemini25ProxyModel = true;
  }

  let url;
  let requestBody;
  if (isGemini25ProxyModel) {
      url = `${targetBaseUrl}/v1/chat/completions`; // OpenAI 兼容代理的路径
      requestBody = JSON.stringify(req); // 直接使用原始请求体
  } else {
      url = `${targetBaseUrl}/${API_VERSION}/models/${model}:${TASK}`;
      if (req.stream) { url += "?alt=sse"; }
      try {
        requestBody = JSON.stringify(await transformRequest(req));
      } catch (err) {
        console.error("Error transforming request body:", err);
        throw new HttpError(`Invalid request format: ${err.message}`, 400);
      }
  }

  const headers = isGemini25ProxyModel
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` }
    : makeHeaders(apiKey, { "Content-Type": "application/json" });

  const response = await fetch(url, {
    method: "POST",
    headers: headers,
    body: requestBody,
  });

  let body = response.body;
  if (response.ok) {
    let id = generateChatcmplId();
    if (req.stream) { // 无论是否是 gemini-2.5 模型，都尝试作为流处理
      if (isGemini25ProxyModel) { // 如果是 gemini-2.5 模型，直接返回原始响应流
          body = response.body;
      } else { // 否则，进行 Gemini API 到 OpenAI 格式的转换
          body = response.body
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new TransformStream({
              transform: parseStream,
              flush: parseStreamFlush,
              buffer: "",
            }))
            .pipeThrough(new TransformStream({
              transform: toOpenAiStream,
              flush: toOpenAiStreamFlush,
              streamIncludeUsage: req.stream_options?.include_usage,
              model, id, last: [],
            }))
            .pipeThrough(new TextEncoderStream());
      }
    } else { // 非流式响应
      if (isGemini25ProxyModel) { // 如果是 gemini-2.5 模型，直接返回原始响应体
          body = response.body; // 理论上 OpenAI 兼容代理的非流式响应也是 JSON
      } else {
          body = await response.text();
          try {
            body = processCompletionsResponse(JSON.parse(body), model, id);
          } catch (err) {
            console.error("Error parsing Gemini API response:", err);
            throw new HttpError(`Invalid Gemini API response: ${err.message}`, 500);
          }
      }
    }
  }
  return new Response(body, fixCors(response));
}

const harmCategory = [
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_CIVIC_INTEGRITY",
];
const safetySettings = harmCategory.map(category => ({
  category,
  threshold: "BLOCK_NONE",
}));
const fieldsMap = {
  stop: "stopSequences",
  n: "candidateCount", // not for streaming
  max_tokens: "maxOutputTokens",
  max_completion_tokens: "maxOutputTokens",
  temperature: "temperature",
  top_p: "topP",
  top_k: "topK", // non-standard
  frequency_penalty: "frequencyPenalty",
  presence_penalty: "presencePenalty",
};
const transformConfig = (req) => {
  let cfg = {};
  //if (typeof req.stop === "string") { req.stop = [req.stop]; } // no need
  for (let key in req) {
    const matchedKey = fieldsMap[key];
    if (matchedKey) {
      cfg[matchedKey] = req[key];
    }
  }
  if (req.response_format) {
    switch(req.response_format.type) {
      case "json_schema":
        cfg.responseSchema = req.response_format.json_schema?.schema;
        if (cfg.responseSchema && "enum" in cfg.responseSchema) {
          cfg.responseMimeType = "text/x.enum";
          break;
        }
        // eslint-disable-next-line no-fallthrough
      case "json_object":
        cfg.responseMimeType = "application/json";
        break;
      case "text":
        cfg.responseMimeType = "text/plain";
        break;
      default:
        throw new HttpError("Unsupported response_format.type", 400);
    }
  }
  return cfg;
};

const parseImg = async (url) => {
  let mimeType, data;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} (${url})`);
      }
      mimeType = response.headers.get("content-type");
      data = Buffer.from(await response.arrayBuffer()).toString("base64");
    } catch (err) {
      throw new Error("Error fetching image: " + err.toString());
    }
  } else {
    const match = url.match(/^data:(?<mimeType>.*?)(;base64)?,(?<data>.*)$/);
    if (!match) {
      throw new Error("Invalid image data: " + url);
    }
    ({ mimeType, data } = match.groups);
  }
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
};

/**
 * @function transformMsg
 * @description 转换消息内容为 Gemini API 所需的格式。
 * @param {object} message - 原始消息对象，包含 role 和 content。
 * @param {string} message.role - 消息角色（如 "user", "assistant", "system"）。
 * @param {string|Array<object>} message.content - 消息内容，可以是字符串或包含不同类型内容的数组。
 * @returns {Promise<object>} - 返回一个 Promise，解析为转换后的消息对象，包含 role 和 parts。
 * @throws {TypeError} - 如果遇到无法识别的内容项类型。
 */
const transformMsg = async ({ role, content }) => {
  const parts = [];

  // 处理纯字符串内容
  if (typeof content === "string") {
    parts.push({ text: content });
    return { role, parts };
  }

  // 处理数组内容
  if (Array.isArray(content)) {
    for (const item of content) {
      // 默认为文本类型，以增强容错性
      const itemType = item.type || "text";

      switch (itemType) {
        case "text":
          parts.push({ text: item.text });
          break;
        case "image_url":
          parts.push(await parseImg(item.image_url.url));
          break;
        case "input_audio":
          parts.push({
            inlineData: {
              mimeType: "audio/" + item.input_audio.format,
              data: item.input_audio.data,
            }
          });
          break;
        default:
          // 如果类型未知且没有文本内容，则记录警告并跳过该项
          console.warn(`Unknown or undefined content item type: "${item.type}", skipping this item.`);
          break; // 跳过当前项
      }
    }
  } else {
    // 如果 content 既不是字符串也不是数组，或者为 undefined/null，则记录警告并跳过
    console.warn(`Unexpected or undefined content type: "${typeof content}", skipping this item.`);
    // 可以选择添加一个空文本部分，或者完全跳过，取决于具体需求
    // parts.push({ text: "" }); 
  }

  // 如果所有内容都是图片 URL，添加一个空文本部分以避免 API 错误
  if (Array.isArray(content) && content.every(item => item.type === "image_url")) {
    parts.push({ text: "" });
  }
  return { role, parts };
};

const transformMessages = async (messages) => {
  if (!messages) { return; }
  const contents = [];
  let system_instruction;
  for (const item of messages) {
    if (item.role === "system") {
      delete item.role;
      system_instruction = await transformMsg(item);
    } else {
      item.role = item.role === "assistant" ? "model" : "user";
      contents.push(await transformMsg(item));
    }
  }
  if (system_instruction && contents.length === 0) {
    contents.push({ role: "model", parts: { text: " " } });
  }
  //console.info(JSON.stringify(contents, 2));
  return { system_instruction, contents };
};

const transformRequest = async (req) => ({
  ...await transformMessages(req.messages),
  safetySettings,
  generationConfig: transformConfig(req),
  tools: req.tools, // 新增：将 tools 字段直接传递
});

const generateChatcmplId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomChar = () => characters[Math.floor(Math.random() * characters.length)];
  return "chatcmpl-" + Array.from({ length: 29 }, randomChar).join("");
};

const reasonsMap = { //https://ai.google.dev/api/rest/v1/GenerateContentResponse#finishreason
  //"FINISH_REASON_UNSPECIFIED": // Default value. This value is unused.
  "STOP": "stop",
  "MAX_TOKENS": "length",
  "SAFETY": "content_filter",
  "RECITATION": "content_filter",
  //"OTHER": "OTHER",
  // :"function_call",
};
const SEP = "\n\n|>";
const transformCandidates = (key, cand) => ({
  index: cand.index || 0, // 0-index is absent in new -002 models response
  [key]: {
    role: "assistant",
    content: cand.content?.parts.map(p => p.text).join(SEP) },
  logprobs: null,
  finish_reason: reasonsMap[cand.finishReason] || cand.finishReason,
});
const transformCandidatesMessage = transformCandidates.bind(null, "message");
const transformCandidatesDelta = transformCandidates.bind(null, "delta");

const transformUsage = (data) => ({
  completion_tokens: data.candidatesTokenCount,
  prompt_tokens: data.promptTokenCount,
  total_tokens: data.totalTokenCount
});

const processCompletionsResponse = (data, model, id) => {
  return JSON.stringify({
    id,
    choices: data.candidates.map(transformCandidatesMessage),
    created: Math.floor(Date.now()/1000),
    model,
    //system_fingerprint: "fp_69829325d0",
    object: "chat.completion",
    usage: transformUsage(data.usageMetadata),
  });
};

const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
async function parseStream (chunk, controller) {
  chunk = await chunk;
  if (!chunk) { return; }
  this.buffer += chunk;
  do {
    const match = this.buffer.match(responseLineRE);
    if (!match) { break; }
    // 确保在 enqueue 之前对匹配到的 JSON 字符串进行 trim()
    controller.enqueue(match[1].trim());
    this.buffer = this.buffer.substring(match[0].length);
  } while (true); // eslint-disable-line no-constant-condition
}
async function parseStreamFlush (controller) {
  if (this.buffer) {
    console.error("Invalid data:", this.buffer);
    controller.enqueue(this.buffer.trim()); // 确保 flush 时也 trim()
  }
}

function transformResponseStream (data, stop, first) {
  const item = transformCandidatesDelta(data.candidates[0]);
  if (stop) { item.delta = {}; } else { item.finish_reason = null; }
  if (first) { item.delta.content = ""; } else { delete item.delta.role; }
  const output = {
    id: this.id,
    choices: [item],
    created: Math.floor(Date.now()/1000),
    model: this.model,
    //system_fingerprint: "fp_69829325d0",
    object: "chat.completion.chunk",
  };
  if (data.usageMetadata && this.streamIncludeUsage) {
    output.usage = stop ? transformUsage(data.usageMetadata) : null;
  }
  return "data: " + JSON.stringify(output) + delimiter;
}
const delimiter = "\n\n";
async function toOpenAiStream (chunk, controller) {
  const transform = transformResponseStream.bind(this);
  const line = await chunk;
  if (!line) { return; }
  let data;
  try {
    // 确保在 JSON.parse 之前对行进行 trim()
    data = JSON.parse(line.trim());
  } catch (err) {
    console.error("Error parsing JSON from stream:", err);
    console.error("Problematic line content:", line); // 记录原始行内容
    const length = this.last.length || 1; // at least 1 error msg
    const candidates = Array.from({ length }, (_, index) => ({
      finishReason: "error",
      content: { parts: [{ text: `JSON parse error: ${err.message}` }] }, // 更具体的错误信息
      index,
    }));
    data = { candidates };
  }
  const cand = data.candidates[0];
  console.assert(data.candidates.length === 1, "Unexpected candidates count: %d", data.candidates.length);
  cand.index = cand.index || 0; // absent in new -002 models response
  if (!this.last[cand.index]) {
    controller.enqueue(transform(data, false, "first"));
  }
  this.last[cand.index] = data;
  if (cand.content) { // prevent empty data (e.g. when MAX_TOKENS)
    controller.enqueue(transform(data));
  }
}
async function toOpenAiStreamFlush (controller) {
  if (this.last.length > 0) {
    for (const data of this.last) {
      controller.enqueue(transform(data, "stop"));
    }
    controller.enqueue("data: [DONE]" + delimiter);
  }
  
  /**
   * @function handleTranslate
   * @description 处理翻译请求，将请求转发到智谱AI API。
   * @param {object} req - 原始请求体，包含 model 和 messages。
   * @param {object} env - Cloudflare Worker 环境变量。
   * @returns {Promise<Response>} - 返回一个 Promise，解析为处理后的响应。
   * @throws {HttpError} - 如果请求格式无效或API请求失败。
   */
  async function handleTranslate(req, env) { // 接收 env 参数
    if (!req.model || !req.messages) {
      throw new HttpError("Invalid request: model and messages are required.", 400);
    }
  
    const zhipuApiKey = env.ZHIPUAI_API_KEY; // 从环境变量获取智谱AI API Key
    if (!zhipuApiKey) {
      throw new HttpError("ZHIPUAI_API_KEY is not set in environment variables.", 500);
    }
  
    const url = `${ZHIPU_AI_API_BASE_URL}/chat/completions`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${zhipuApiKey}`, // 使用从 env 获取的 API Key
    };
  
    const requestBody = JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: false, // 翻译功能使用同步调用
    });
  
    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: requestBody,
    });
  
    let body = await response.text();
    if (!response.ok) {
      console.error("智谱AI翻译API请求失败:", response.status, body);
      throw new HttpError(`智谱AI翻译API请求失败: ${response.status} - ${body}`, response.status);
    }
  
    return new Response(body, fixCors(response));
  }
}
