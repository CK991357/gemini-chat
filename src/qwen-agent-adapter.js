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
      const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.DASHSCOPE_API_KEY}`,
          'X-DashScope-SSE': 'enable'
        },
        body: JSON.stringify({
          model: body.model,
          input: {
            messages: body.messages
          },
          parameters: {
            ...body.parameters,
            stream: true,
          }
        })
      });
      
      // Task T5 & T6: Intercept, parse the stream, and format the response
      let toolCall = null;
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const decoder = new TextDecoder();
          const text = decoder.decode(chunk);
          
          // Simple buffer and regex to find the tool code block
          // A more robust solution might handle streaming XML parsing
          const toolCodeRegex = /<tool_code>([\s\S]*?)<\/tool_code>/;
          const match = text.match(toolCodeRegex);

          if (match && match[1]) {
            try {
              toolCall = JSON.parse(match[1].trim());
              // Remove the tool code from the output stream so it's not displayed
              const cleanedText = text.replace(toolCodeRegex, '');
              if (cleanedText) {
                controller.enqueue(new TextEncoder().encode(cleanedText));
              }
            } catch (e) {
              console.error("Failed to parse tool code JSON:", e);
              // If parsing fails, pass the original text through
              controller.enqueue(chunk);
            }
          } else {
            // If no tool code found, just pass the chunk through
            controller.enqueue(chunk);
          }
        },
        flush(controller) {
          // After the stream is finished, if we found a tool call,
          // we send a special SSE event to the client.
          if (toolCall) {
            const toolCallEvent = `event: tool_code\ndata: ${JSON.stringify({ tool_code: toolCall })}\n\n`;
            controller.enqueue(new TextEncoder().encode(toolCallEvent));
          }
        }
      });

      const newBody = response.body.pipeThrough(transformStream);
      return new Response(newBody, {
        status: response.status,
        headers: response.headers,
      });
    }

    // If not a tool use request, forward the original request directly
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.DASHSCOPE_API_KEY}`,
          'X-DashScope-SSE': 'enable'
        },
        body: JSON.stringify({
            model: body.model,
            input: {
              messages: body.messages
            },
            parameters: {
              ...body.parameters,
              stream: true,
            }
        })
    });

    return response;

  } catch (error) {
    console.error('Error in Qwen Agent Adapter:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}