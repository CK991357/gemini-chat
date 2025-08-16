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
      
    // Forward the modified request to ModelScope API
    const response = await fetch('https://api-inference.modelscope.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.QWEN_API_KEY}`,
      },
      body: JSON.stringify(modelScopeBody)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Qwen Adapter: ModelScope API returned an error. Status: ${response.status}, Body: ${errorBody}`);
        // Pass the error response to the client
        return new Response(errorBody, {
            status: response.status,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }

    // Per user feedback, temporarily removing all tool-use logic to establish a stable baseline for chat.
    // We will now act as a pure proxy for the response stream, only adding the necessary CORS header.
    
    // Create a new Headers object from the original response to make it mutable.
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');

    // Return a new response, passing the original stream directly through, but with our modified headers.
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: headers
    });

  } catch (error) {
    console.error('Error in Qwen Agent Adapter:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}