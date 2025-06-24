import { Buffer } from "node:buffer";

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return handleOPTIONS();
    }

    const { pathname, searchParams } = new URL(request.url);
    const apiKey = searchParams.get("key") || request.headers.get("Authorization")?.split(" ")[1];

    if (pathname.startsWith("/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent")) {
      if (request.headers.get("Upgrade") === "websocket") {
        return handleWebSocket(request, apiKey).catch(errHandler);
      }
      throw new HttpError("Expected WebSocket upgrade", 426);
    }

    try {
      const assert = (success) => {
        if (!success) {
          throw new HttpError("The specified HTTP method is not allowed for the requested resource", 400);
        }
      };

      switch (true) {
        case pathname.endsWith("/chat/completions"):
          assert(request.method === "POST");
          return handleCompletions(await request.json(), apiKey).catch(errHandler);
        case pathname.endsWith("/embeddings"):
          assert(request.method === "POST");
          return handleEmbeddings(await request.json(), apiKey).catch(errHandler);
        case pathname.endsWith("/models"):
          assert(request.method === "GET");
          return handleModels(apiKey).catch(errHandler);
        default:
          throw new HttpError("404 Not Found", 404);
      }
    } catch (err) {
      return errHandler(err);
    }
  }
};

const errHandler = (err) => {
  console.error(err);
  return new Response(err.message, fixCors({ status: err.status ?? 500 }));
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

const BASE_URL = "https://generativelanguage.googleapis.com";
const API_VERSION = "v1beta";
const API_CLIENT = "genai-js/0.21.0";

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

const makeHeaders = (apiKey, more) => ({
  "x-goog-api-client": API_CLIENT,
  ...(apiKey && { "x-goog-api-key": apiKey }),
  ...more
});

async function handleModels(apiKey) {
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

async function handleEmbeddings(req, apiKey) {
  if (typeof req.model !== "string") {
    throw new HttpError("model is not specified", 400);
  }
  let model;
  if (req.model.startsWith("models/")) {
    model = req.model;
  } else {
    if (!req.model.startsWith("gemini-")) {
      req.model = DEFAULT_EMBEDDINGS_MODEL;
    }
    model = "models/" + req.model;
  }
  if (!Array.isArray(req.input)) {
    req.input = [req.input];
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

const DEFAULT_MODEL = "gemini-2.0-flash";

async function handleCompletions(req, apiKey) {
  let model = DEFAULT_MODEL;
  switch (true) {
    case typeof req.model !== "string":
      break;
    case req.model.startsWith("models/"):
      model = req.model.substring(7);
      break;
    case req.model.startsWith("gemini-"):
    case req.model.startsWith("gemma-"):
    case req.model.startsWith("learnlm-"):
      model = req.model;
  }
  let body = await transformRequest(req);
  switch (true) {
    case model.endsWith(":search"):
      model = model.substring(0, model.length - 7);
    case req.model.endsWith("-search-preview"):
      body.tools = body.tools || [];
      body.tools.push({ googleSearch: {} });
  }
  const TASK = req.stream ? "streamGenerateContent" : "generateContent";
  let url = `${BASE_URL}/${API_VERSION}/models/${model}:${TASK}`;
  if (req.stream) { url += "?alt=sse"; }
  const response = await fetch(url, {
    method: "POST",
    headers: makeHeaders(apiKey, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });

  body = response.body;
  if (response.ok) {
    let id = "chatcmpl-" + generateId();
    const shared = {};
    if (req.stream) {
      body = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform: parseStream,
          flush: parseStreamFlush,
          buffer: "",
          shared,
        }))
        .pipeThrough(new TransformStream({
          transform: toOpenAiStream,
          flush: toOpenAiStreamFlush,
          streamIncludeUsage: req.stream_options?.include_usage,
          model, id, last: [],
          shared,
        }))
        .pipeThrough(new TextEncoderStream());
    } else {
      body = await response.text();
      try {
        body = JSON.parse(body);
        if (!body.candidates) {
          throw new Error("Invalid completion object");
        }
      } catch (err) {
        console.error("Error parsing response:", err);
        return new Response(body, fixCors(response));
      }
      body = processCompletionsResponse(body, model, id);
    }
  }
  return new Response(body, fixCors(response));
}

const adjustProps = (schemaPart) => {
  if (typeof schemaPart !== "object" || schemaPart === null) return;
  if (Array.isArray(schemaPart)) {
    schemaPart.forEach(adjustProps);
  } else {
    if (schemaPart.type === "object" && schemaPart.properties && schemaPart.additionalProperties === false) {
      delete schemaPart.additionalProperties;
    }
    Object.values(schemaPart).forEach(adjustProps);
  }
};

const adjustSchema = (schema) => {
  const obj = schema[schema.type];
  delete obj.strict;
  return adjustProps(schema);
};

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
  frequency_penalty: "frequencyPenalty",
  max_completion_tokens: "maxOutputTokens",
  max_tokens: "maxOutputTokens",
  n: "candidateCount",
  presence_penalty: "presencePenalty",
  seed: "seed",
  stop: "stopSequences",
  temperature: "temperature",
  top_k: "topK",
  top_p: "topP",
};

const transformConfig = (req) => {
  let cfg = {};
  for (let key in req) {
    const matchedKey = fieldsMap[key];
    if (matchedKey) {
      cfg[matchedKey] = req[key];
    }
  }
  if (req.response_format) {
    switch (req.response_format.type) {
      case "json_schema":
        adjustSchema(req.response_format);
        cfg.responseSchema = req.response_format.json_schema?.schema;
        if (cfg.responseSchema && "enum" in cfg.responseSchema) {
          cfg.responseMimeType = "text/x.enum";
          break;
        }
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
      throw new HttpError("Invalid image data: " + url, 400);
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

const transformFnResponse = ({ content, tool_call_id }, parts) => {
  if (!parts.calls) {
    throw new HttpError("No function calls found in the previous message", 400);
  }
  let response;
  try {
    response = JSON.parse(content);
  } catch (err) {
    console.error("Error parsing function response content:", err);
    throw new HttpError("Invalid function response: " + content, 400);
  }
  if (typeof response !== "object" || response === null || Array.isArray(response)) {
    response = { result: response };
  }
  if (!tool_call_id) {
    throw new HttpError("tool_call_id not specified", 400);
  }
  const { i, name } = parts.calls[tool_call_id] ?? {};
  if (!name) {
    throw new HttpError("Unknown tool_call_id: " + tool_call_id, 400);
  }
  if (parts[i]) {
    throw new HttpError("Duplicated tool_call_id: " + tool_call_id, 400);
  }
  parts[i] = {
    functionResponse: {
      id: tool_call_id.startsWith("call_") ? null : tool_call_id,
      name,
      response,
    }
  };
};

const transformFnCalls = ({ tool_calls }) => {
  const calls = {};
  const parts = tool_calls.map(({ function: { arguments: argstr, name }, id, type }, i) => {
    if (type !== "function") {
      throw new HttpError(`Unsupported tool_call type: "${type}"`, 400);
    }
    let args;
    try {
      args = JSON.parse(argstr);
    } catch (err) {
      console.error("Error parsing function arguments:", err);
      throw new HttpError("Invalid function arguments: " + argstr, 400);
    }
    calls[id] = { i, name };
    return {
      functionCall: {
        id: id.startsWith("call_") ? null : id,
        name,
        args,
      }
    };
  });
  parts.calls = calls;
  return parts;
};

const transformMsg = async ({ content }) => {
  const parts = [];
  if (!Array.isArray(content)) {
    parts.push({ text: content });
    return parts;
  }
  for (const item of content) {
    switch (item.type) {
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
        throw new HttpError(`Unknown "content" item type: "${item.type}"`, 400);
    }
  }
  if (content.every(item => item.type === "image_url")) {
    parts.push({ text: "" });
  }
  return parts;
};

const transformMessages = async (messages) => {
  if (!messages) return;
  const contents = [];
  let system_instruction;
  for (const item of messages) {
    switch (item.role) {
      case "system":
        system_instruction = { parts: await transformMsg(item) };
        continue;
      case "tool":
        let { role, parts } = contents[contents.length - 1] ?? {};
        if (role !== "function") {
          const calls = parts?.calls;
          parts = []; parts.calls = calls;
          contents.push({
            role: "function",
            parts
          });
        }
        transformFnResponse(item, parts);
        continue;
      case "assistant":
        item.role = "model";
        break;
      case "user":
        break;
      default:
        throw new HttpError(`Unknown message role: "${item.role}"`, 400);
    }
    contents.push({
      role: item.role,
      parts: item.tool_calls ? transformFnCalls(item) : await transformMsg(item)
    });
  }
  if (system_instruction) {
    if (!contents[0]?.parts.some(part => part.text)) {
      contents.unshift({ role: "user", parts: { text: " " } });
    }
  }
  return { system_instruction, contents };
};

const transformTools = (req) => {
  let tools, tool_config;
  if (req.tools) {
    const funcs = req.tools.filter(tool => tool.type === "function");
    funcs.forEach(adjustSchema);
    tools = [{ function_declarations: funcs.map(schema => schema.function) }];
  }
  if (req.tool_choice) {
    const allowed_function_names = req.tool_choice?.type === "function" ? [req.tool_choice?.function?.name] : undefined;
    if (allowed_function_names || typeof req.tool_choice === "string") {
      tool_config = {
        function_calling_config: {
          mode: allowed_function_names ? "ANY" : req.tool_choice.toUpperCase(),
          allowed_function_names
        }
      };
    }
  }
  return { tools, tool_config };
};

const transformRequest = async (req) => ({
  ...await transformMessages(req.messages),
  safetySettings,
  generationConfig: transformConfig(req),
  ...transformTools(req),
});

const generateId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomChar = () => characters[Math.floor(Math.random() * characters.length)];
  return Array.from({ length: 29 }, randomChar).join("");
};

const reasonsMap = {
  "STOP": "stop",
  "MAX_TOKENS": "length",
  "SAFETY": "content_filter",
  "RECITATION": "content_filter",
};
const SEP = "\n\n|>";

const transformCandidates = (key, cand) => {
  const message = { role: "assistant", content: [] };
  for (const part of cand.content?.parts ?? []) {
    if (part.functionCall) {
      const fc = part.functionCall;
      message.tool_calls = message.tool_calls ?? [];
      message.tool_calls.push({
        id: fc.id ?? "call_" + generateId(),
        type: "function",
        function: {
          name: fc.name,
          arguments: JSON.stringify(fc.args),
        }
      });
    } else {
      message.content.push(part.text);
    }
  }
  message.content = message.content.join(SEP) || null;
  return {
    index: cand.index || 0,
    [key]: message,
    logprobs: null,
    finish_reason: message.tool_calls ? "tool_calls" : reasonsMap[cand.finishReason] || cand.finishReason,
  };
};
const transformCandidatesMessage = transformCandidates.bind(null, "message");
const transformCandidatesDelta = transformCandidates.bind(null, "delta");

const transformUsage = (data) => ({
  completion_tokens: data.candidatesTokenCount,
  prompt_tokens: data.promptTokenCount,
  total_tokens: data.totalTokenCount
});

const checkPromptBlock = (choices, promptFeedback, key) => {
  if (choices.length) return;
  if (promptFeedback?.blockReason) {
    if (promptFeedback.blockReason === "SAFETY") {
      promptFeedback.safetyRatings
        .filter(r => r.blocked)
        .forEach(r => console.log(r));
    }
    choices.push({
      index: 0,
      [key]: null,
      finish_reason: "content_filter",
    });
  }
  return true;
};

const processCompletionsResponse = (data, model, id) => {
  const obj = {
    id,
    choices: data.candidates.map(transformCandidatesMessage),
    created: Math.floor(Date.now() / 1000),
    model: data.modelVersion ?? model,
    object: "chat.completion",
    usage: data.usageMetadata && transformUsage(data.usageMetadata),
  };
  if (obj.choices.length === 0) {
    checkPromptBlock(obj.choices, data.promptFeedback, "message");
  }
  return JSON.stringify(obj);
};

const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;

function parseStream(chunk, controller) {
  this.buffer += chunk;
  do {
    const match = this.buffer.match(responseLineRE);
    if (!match) break;
    controller.enqueue(match[1]);
    this.buffer = this.buffer.substring(match[0].length);
  } while (true);
}

function parseStreamFlush(controller) {
  if (this.buffer) {
    controller.enqueue(this.buffer);
    this.shared.is_buffers_rest = true;
  }
}

const delimiter = "\n\n";

const sseline = (obj) => {
  obj.created = Math.floor(Date.now() / 1000);
  return "data: " + JSON.stringify(obj) + delimiter;
};

function toOpenAiStream(line, controller) {
  let data;
  try {
    data = JSON.parse(line);
    if (!data.candidates) {
      throw new Error("Invalid completion chunk object");
    }
  } catch (err) {
    if (!this.shared.is_buffers_rest) line = +delimiter;
    controller.enqueue(line);
    return;
  }
  const obj = {
    id: this.id,
    choices: data.candidates.map(transformCandidatesDelta),
    model: data.modelVersion ?? this.model,
    object: "chat.completion.chunk",
    usage: data.usageMetadata && this.streamIncludeUsage ? null : undefined,
  };
  if (checkPromptBlock(obj.choices, data.promptFeedback, "delta")) {
    controller.enqueue(sseline(obj));
    return;
  }
  const cand = obj.choices[0];
  cand.index = cand.index || 0;
  const finish_reason = cand.finish_reason;
  cand.finish_reason = null;
  if (!this.last[cand.index]) {
    controller.enqueue(sseline({
      ...obj,
      choices: [{ ...cand, tool_calls: undefined, delta: { role: "assistant", content: "" } }],
    }));
  }
  delete cand.delta.role;
  if ("content" in cand.delta) {
    controller.enqueue(sseline(obj));
  }
  cand.finish_reason = finish_reason;
  if (data.usageMetadata && this.streamIncludeUsage) {
    obj.usage = transformUsage(data.usageMetadata);
  }
  cand.delta = {};
  this.last[cand.index] = obj;
}

function toOpenAiStreamFlush(controller) {
  if (this.last.length > 0) {
    for (const obj of this.last) {
      controller.enqueue(sseline(obj));
    }
    controller.enqueue("data: [DONE]" + delimiter);
  }
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (typeof this.events[event] !== 'object') {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  emit(event, ...args) {
    if (typeof this.events[event] === 'object') {
      this.events[event].forEach(listener => listener.apply(this, args));
    }
  }
}

class WorkerToolManager extends EventEmitter {
  constructor() {
    super();
    this.tools = new Map();
    this.registerDefaultTools();
  }

  registerDefaultTools() {
    this.registerTool('weather', new WorkerWeatherTool());
  }

  registerTool(name, toolInstance) {
    this.tools.set(name, toolInstance);
    console.log(`Tool ${name} registered in Worker`);
  }

  async handleToolCall(functionCall) {
    const { name, args, id } = functionCall;
    let tool;
    if (name === 'get_weather_on_date') {
      tool = this.tools.get('weather');
    } else {
      tool = this.tools.get(name);
    }

    if (!tool) {
      return {
        functionResponses: [{
          response: { error: `Unknown tool: ${name}` },
          id
        }]
      };
    }

    try {
      const result = await tool.execute(args);
      return {
        functionResponses: [{
          response: { output: result },
          id
        }]
      };
    } catch (error) {
      return {
        functionResponses: [{
          response: { error: error.message },
          id
        }]
      };
    }
  }
}

class WorkerWeatherTool {
  getDeclaration() {
    return [{
      name: 'get_weather_on_date',
      description: 'Get the weather for a specific date and location.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The date for the weather forecast (e.g., "2023-10-26").'
          },
          location: {
            type: 'string',
            description: 'The location for the weather forecast (e.g., "San Francisco, CA").'
          }
        },
        required: ['date', 'location']
      }
    }];
  }

  async execute(args) {
    const { date, location } = args;
    const mockWeatherData = {
      '2023-10-26': { 'San Francisco, CA': 'Sunny, 70F' },
      '2023-10-27': { 'San Francisco, CA': 'Partly Cloudy, 65F' },
      '2023-10-28': { 'San Francisco, CA': 'Rainy, 55F' },
    };

    const weather = mockWeatherData[date]?.[location];
    return weather ? `The weather on ${date} in ${location} is: ${weather}` : 
      `Could not retrieve weather for ${location} on ${date}.`;
  }
}

class MultimodalLiveClientWorker extends EventEmitter {
  constructor(clientWs, apiKey, initialModel) {
    super();
    this.clientWs = clientWs;
    this.apiKey = apiKey;
    this.config = { model: initialModel }; // 初始化 config.model
    this.toolManager = new WorkerToolManager();
    this.conversationHistory = [];
    this.isStreaming = false;

    this.clientWs.addEventListener("message", this.handleClientMessage.bind(this));
    this.clientWs.addEventListener("close", this.handleClientClose.bind(this));
    this.clientWs.addEventListener("error", this.handleClientError.bind(this));
  }

  async handleClientMessage(event) {
    try {
      const message = JSON.parse(event.data);
      if (message.setup) {
        this.config = message.setup;
        if (this.config.tools) {
          this.config.tools.forEach(toolDeclaration => {
            if (toolDeclaration.functionDeclarations) {
              toolDeclaration.functionDeclarations.forEach(funcDecl => {
                if (funcDecl.name === 'get_weather_on_date') {
                  console.log("Weather tool declared by client.");
                }
              });
            }
          });
        }
        this.conversationHistory = [];
        this.sendSetupComplete();
      } else if (message.realtimeInput) {
        const mediaChunks = message.realtimeInput.mediaChunks;
        if (mediaChunks?.length > 0) {
          const parts = mediaChunks.map(chunk => ({
            inlineData: {
              mimeType: chunk.mimeType,
              data: chunk.data
            }
          }));
          this.sendContentToGemini(parts, false);
        }
      } else if (message.clientContent) {
        const turns = message.clientContent.turns;
        if (turns?.length > 0) {
          const parts = turns[0].parts;
          this.sendContentToGemini(parts, message.clientContent.turnComplete);
        }
      } else if (message.toolResponse) {
        this.sendToolResponseToGemini(message.toolResponse);
      }
    } catch (error) {
      this.clientWs.send(JSON.stringify({ error: error.message }));
    }
  }

  sendSetupComplete() {
    this.clientWs.send(JSON.stringify({ setupComplete: {} }));
  }

  async sendContentToGemini(parts, turnComplete) {
    const content = { role: 'user', parts: parts };
    this.conversationHistory.push(content);

      const requestBody = {
        contents: this.conversationHistory,
        generationConfig: {
          ...this.config.generationConfig,
          // 根据配置可选地添加语音输出配置
          ...(this.config.enableTTS && {
            responseModalities: ["AUDIO"],
            speechConfig: this.config.speechConfig || {
              voiceConfig: {
                name: this.config.voice || "en-US-Neural2-H" // 默认语音，或者从 config 中获取
              }
            }
          })
        },
        safetySettings: this.config.safetySettings || safetySettings,
        systemInstruction: this.config.systemInstruction,
        tools: this.config.tools
      };

    const apiVersion = getApiVersionForModel(this.config.model);
    const url = `${BASE_URL}/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${this.apiKey}&model=${encodeURIComponent(this.config.model)}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: makeHeaders(this.apiKey, { "Content-Type": "application/json" }),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          this.sendTurnComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const line = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 1);

          if (line.startsWith('data:')) {
            const jsonStr = line.substring(5).trim();
            if (jsonStr) {
              try {
                const geminiResponse = JSON.parse(jsonStr);
                this.processGeminiResponse(geminiResponse);
              } catch (parseError) {
                console.error("Error parsing Gemini API stream chunk:", parseError);
              }
            }
          }
          boundary = buffer.indexOf('\n');
        }
      }
    } catch (error) {
      this.clientWs.send(JSON.stringify({ error: error.message }));
    }
  }

  async sendToolResponseToGemini(toolResponse) {
    const content = {
      role: 'function', parts: toolResponse.functionResponses.map(fr => ({
        functionResponse: {
          name: fr.response.name,
          response: fr.response.output,
          id: fr.id
        }
      }))
    };
    this.conversationHistory.push(content);

    const requestBody = {
      contents: this.conversationHistory,
      generationConfig: this.config.generationConfig,
      safetySettings: this.config.safetySettings || safetySettings,
      systemInstruction: this.config.systemInstruction,
      tools: this.config.tools
    };

    const apiVersion = getApiVersionForModel(this.config.model);
    const url = `${BASE_URL}/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${this.apiKey}&model=${encodeURIComponent(this.config.model)}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: makeHeaders(this.apiKey, { "Content-Type": "application/json" }),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          this.sendTurnComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const line = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 1);

          if (line.startsWith('data:')) {
            const jsonStr = line.substring(5).trim();
            if (jsonStr) {
              try {
                const geminiResponse = JSON.parse(jsonStr);
                this.processGeminiResponse(geminiResponse);
              } catch (parseError) {
                console.error("Error parsing Gemini API stream chunk:", parseError);
              }
            }
          }
          boundary = buffer.indexOf('\n');
        }
      }
    } catch (error) {
      this.clientWs.send(JSON.stringify({ error: error.message }));
    }
  }

  async processGeminiResponse(geminiResponse) {
    if (geminiResponse.candidates?.length > 0) {
      const candidate = geminiResponse.candidates[0];
      const modelTurnParts = [];
      let hasFunctionCall = false;
      const audioChunks = []; // 修改：用于存储所有音频数据块

      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          // 处理文本响应
          if (part.text) {
            modelTurnParts.push({ text: part.text });
            if (this.conversationHistory.length > 0 &&
                this.conversationHistory[this.conversationHistory.length - 1].role === 'model') {
              this.conversationHistory[this.conversationHistory.length - 1].parts.push({ text: part.text });
            } else {
              this.conversationHistory.push({ role: 'model', parts: [{ text: part.text }] });
            }
          }
          // 处理函数调用
          else if (part.functionCall) {
            hasFunctionCall = true;
            this.clientWs.send(JSON.stringify({
              toolCall: {
                functionCalls: [{
                  id: part.functionCall.id || 'call_' + generateId(),
                  name: part.functionCall.name,
                  args: part.functionCall.args
                }]
              }
            }));

            const toolResponse = await this.toolManager.handleToolCall(part.functionCall);
            this.sendToolResponseToGemini(toolResponse);
          }
          // 处理音频输出
          else if (part.inlineData?.mimeType.startsWith('audio/')) {
            audioChunks.push(part.inlineData); // 收集所有音频数据块
          }
        }
      }

      // 发送音频数据到客户端
      for (const audioData of audioChunks) {
        try {
          this.clientWs.send(JSON.stringify({
            serverAudio: { // 使用新的 serverAudio 消息类型
              mimeType: audioData.mimeType,
              data: audioData.data,
              metadata: audioData.metadata // 添加元数据
            }
          }));
        } catch (sendError) {
          console.error("音频发送失败", sendError);
          this.clientWs.send(JSON.stringify({
            error: "音频传输失败"
          }));
        }
      }

      // 发送文本内容到客户端 (如果存在文本且没有函数调用)
      if (modelTurnParts.length > 0 && !hasFunctionCall) {
        this.clientWs.send(JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: modelTurnParts
            }
          }
        }));
      }
    }

    if (geminiResponse.promptFeedback?.blockReason) {
      this.clientWs.send(JSON.stringify({
        error: `Prompt blocked: ${geminiResponse.promptFeedback.blockReason}`
      }));
    }
  }

  sendTurnComplete() {
    this.clientWs.send(JSON.stringify({ serverContent: { turnComplete: {} } }));
  }

  handleClientClose(event) {
    console.log("Client WebSocket closed:", event.code, event.reason);
  }

  handleClientError(error) {
    console.error("Client WebSocket error:", error);
  }
}

async function handleWebSocket(request, apiKey) {
  const { 0: clientWs, 1: serverWs } = new WebSocketPair();
  clientWs.accept();

  // 从请求URL中解析model参数
  const url = new URL(request.url);
  const model = url.searchParams.get("model");

  // 将model参数传递给MultimodalLiveClientWorker
  new MultimodalLiveClientWorker(clientWs, apiKey, model);
  return new Response(null, {
    status: 101,
    webSocket: serverWs,
  });
}
