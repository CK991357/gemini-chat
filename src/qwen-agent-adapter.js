/**
 * @file Qwen Agent Adapter
 * @description This module acts as an adapter to handle Qwen model requests,
 * specifically for translating tool-call intents between the OpenAI format and
 * the prompt-based format required by the Qwen model on ModelScope.
 */
import { CONFIG } from './static/js/config/config.js';

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

      // Create the new system message
      const systemMessage = {
        role: 'system',
        content: systemPrompt,
      };

      // Inject the system message at the beginning of the messages array
      body.messages = [systemMessage, ...body.messages];
      
      // Task T4: Forward the modified request to ModelScope API
      const response = await fetch('https://api-inference.modelscope.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.QWEN_API_KEY}`,
        },
        body: JSON.stringify({
          model: body.model,
          messages: body.messages,
          stream: true,
        })
      });
      
      // Task T5 & T6: Intercept, parse the stream, and format the response
      let toolCall = null;
      let buffer = '';
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const decoder = new TextDecoder();
          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep the last partial line in the buffer

          for (const line of lines) {
            if (line.trim().startsWith('data:')) {
              const dataStr = line.substring(5).trim();
              if (dataStr === '[DONE]') {
                // Pass [DONE] message through
                controller.enqueue(new TextEncoder().encode(line + '\n'));
                continue;
              }
              
              try {
                const data = JSON.parse(dataStr);
                // ModelScope streams text content in `data.choices[0].delta.content`
                const textContent = data.choices?.[0]?.delta?.content || '';

                const toolCodeRegex = /<tool_code>([\s\S]*?)<\/tool_code>/;
                const match = textContent.match(toolCodeRegex);

                if (match && match[1]) {
                  // Found a tool call within the text content
                  toolCall = JSON.parse(match[1].trim());
                  console.log('Adapter found and parsed tool call:', toolCall);
                  // Do not enqueue this chunk, as we will send a single tool_code event on flush
                  // We can stop processing further text chunks from the model
                  return; // Exit the transform function early
                } else {
                  // No tool call found, pass the original SSE event through
                  controller.enqueue(new TextEncoder().encode(line + '\n'));
                }
              } catch (e) {
                console.warn('Adapter failed to parse SSE chunk, passing through:', dataStr, e);
                // Pass through malformed or non-JSON data lines
                controller.enqueue(new TextEncoder().encode(line + '\n'));
              }
            } else if (line.trim()) {
              // Pass through other non-empty lines (like comments or empty data lines)
              controller.enqueue(new TextEncoder().encode(line + '\n'));
            }
          }
        },
        flush(controller) {
          // After the stream is finished, if we found a tool call,
          // we send a single, well-formatted SSE event to the client.
          if (toolCall) {
            const toolCallPayload = { tool_code: toolCall };
            const toolCallEvent = `data: ${JSON.stringify(toolCallPayload)}\n\n`;
            console.log('Adapter flushing tool call event:', toolCallEvent);
            controller.enqueue(new TextEncoder().encode(toolCallEvent));
          }
          // Always send the [DONE] message to properly close the client-side stream
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
    }

    // If not a tool use request, forward the original request directly
    const response = await fetch('https://api-inference.modelscope.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.QWEN_API_KEY}`,
        },
        body: JSON.stringify({
            model: body.model,
            messages: body.messages,
            stream: true,
        })
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(response.body, {
        status: response.status,
        headers: newHeaders
    });

  } catch (error) {
    console.error('Error in Qwen Agent Adapter:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}