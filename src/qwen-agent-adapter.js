/**
 * @file Qwen Agent Adapter
 * @description This module acts as an adapter to handle Qwen model requests,
 * specifically for translating tool-call intents between the OpenAI format and
 * the prompt-based format required by the Qwen model on ModelScope.
 */
import { CONFIG } from './static/js/config/config.js';

/**
 * Applies the Qwen3 chat template to a standard messages array.
 * Converts the array into a single string with special tokens.
 * @param {Array<object>} messages - The array of message objects (e.g., {role: 'user', content: '...'})
 * @param {object|null} systemInstruction - The system instruction object.
 * @returns {string} A single string formatted with the Qwen3 chat template.
 */
function applyQwenChatTemplate(messages, systemInstruction) {
  let prompt = '';
  const imStart = '<|im_start|>';
  const imEnd = '<|im_end|>';

  // Add system instruction first if it exists
  if (systemInstruction && systemInstruction.parts && systemInstruction.parts[0]?.text) {
    prompt += `${imStart}system\n${systemInstruction.parts[0].text}${imEnd}\n`;
  }

  // Process the rest of the messages
  for (const message of messages) {
    const role = message.role;
    // The content can be a string (from assistant) or an array of parts (from user)
    const content = Array.isArray(message.content)
      ? message.content.map(p => p.text || '').join('')
      : message.content;
      
    prompt += `${imStart}${role}\n${content}${imEnd}\n`;
  }

  // Add the final assistant prompt
  prompt += `${imStart}assistant\n`;
  
  return prompt;
}


/**
 * Handles requests for Qwen models by adapting them for tool use.
 * It removes the 'tools' parameter, injects a system prompt for tool instruction,
 * calls the ModelScope API, parses the response for tool calls, and formats
 * the response back to the client.
 *
 * @param {Request} request - The incoming request object from the client.
 * @param {object} env - The environment object containing secrets and other bindings.
 * @returns {Promise<Response>} A promise that resolves to the response to be sent to the client.
 */
export async function handleQwenRequest(request, env) {
  try {
    const requestClone = request.clone();
    const body = await requestClone.json();
    let finalMessages = body.messages;
    let systemInstruction = body.systemInstruction || null;

    // Check if the request is for tool use
    if (body.tools && body.tools.length > 0) {
      const tools = body.tools;
      
      // Remove OpenAI specific parameters not supported by ModelScope
      delete body.tools;
      if (body.tool_choice) {
        delete body.tool_choice;
      }

      // Get the system prompt template from config
      let systemPrompt = CONFIG.MCP.QWEN_SYSTEM_PROMPT;

      // Dynamically insert the available tools into the prompt
      const toolsJsonString = JSON.stringify(tools, null, 2);
      systemPrompt = systemPrompt.replace('{{TOOLS_JSON}}', toolsJsonString);

      // Create the new system message and prepend it
      systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    // Apply the Qwen3 chat template
    const formattedPrompt = applyQwenChatTemplate(finalMessages, systemInstruction);

    // Construct the new request body for ModelScope
    // The entire formatted prompt must be placed inside the 'content' of a single user message.
    const modelScopeBody = {
        model: body.model,
        messages: [{
            role: "user",
            content: formattedPrompt
        }],
        stream: true,
        // Parameters from the official documentation to improve quality
        temperature: 0.7,
        top_p: 0.8,
        top_k: 20,
        repetition_penalty: 1.05,
        max_tokens: 65536
    };
      
    // --- DIAGNOSTIC LOGGING START ---
    console.log("Qwen Adapter: Sending final request body to ModelScope:", JSON.stringify(modelScopeBody, null, 2));
    // --- DIAGNOSTIC LOGGING END ---

    // Forward the modified request to ModelScope API
    const response = await fetch('https://api-inference.modelscope.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.QWEN_API_KEY}`,
      },
      body: JSON.stringify(modelScopeBody)
    });

    // --- DIAGNOSTIC LOGGING START ---
    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Qwen Adapter: ModelScope API returned an error. Status: ${response.status}, Body: ${errorBody}`);
    }
    console.log(`Qwen Adapter: Received response from ModelScope with status: ${response.status}`);
    // --- DIAGNOSTIC LOGGING END ---
      
    // Intercept, parse the stream, and format the response
    let toolCall = null;
    let buffer = '';
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const decoder = new TextDecoder();
        const rawText = decoder.decode(chunk, { stream: true });
        
        // --- DIAGNOSTIC LOGGING START ---
        console.log("Qwen Adapter: Received raw chunk from ModelScope:", rawText);
        // --- DIAGNOSTIC LOGGING END ---

        buffer += rawText;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last partial line in the buffer

        for (const line of lines) {
          if (line.trim().startsWith('data:')) {
            const dataStr = line.substring(5).trim();
            if (dataStr === '[DONE]') {
              controller.enqueue(new TextEncoder().encode(line + '\n'));
              continue;
            }
            
            try {
              const data = JSON.parse(dataStr);
              // 修正：严格只从 delta.content 中获取流式文本，以避免错误解析初始元数据块。
              const textContent = data.choices?.[0]?.delta?.content || '';

              const toolCodeRegex = /<tool_code>([\s\S]*?)<\/tool_code>/;
              const match = textContent.match(toolCodeRegex);

              if (match && match[1]) {
                toolCall = JSON.parse(match[1].trim());
                console.log('Adapter found and parsed tool call:', toolCall);
                // Clean the text content by removing the tool code block
                const cleanedText = textContent.replace(toolCodeRegex, '').trim();
                if (cleanedText) {
                    // If there's text besides the tool call, send it
                    const cleanedData = { ...data };
                    if (cleanedData.choices[0].delta) cleanedData.choices[0].delta.content = cleanedText;
                    if (cleanedData.choices[0].message) cleanedData.choices[0].message.content = cleanedText;
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(cleanedData)}\n`));
                }
                return;
              } else {
                // No tool call found, pass the original SSE event through
                controller.enqueue(new TextEncoder().encode(line + '\n'));
              }
            } catch (e) {
              console.warn('Adapter failed to parse SSE chunk, passing through:', dataStr, e);
              controller.enqueue(new TextEncoder().encode(line + '\n'));
            }
          } else if (line.trim()) {
            controller.enqueue(new TextEncoder().encode(line + '\n'));
          }
        }
      },
      flush(controller) {
        if (toolCall) {
          const toolCallPayload = { tool_code: toolCall };
          const toolCallEvent = `data: ${JSON.stringify(toolCallPayload)}\n\n`;
          console.log('Adapter flushing tool call event:', toolCallEvent);
          controller.enqueue(new TextEncoder().encode(toolCallEvent));
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      }
    });

    const newBody = response.body.pipeThrough(transformStream);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(newBody, {
      status: response.status,
      headers: newHeaders,
    });

  } catch (error) {
    console.error('Error in Qwen Agent Adapter:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}