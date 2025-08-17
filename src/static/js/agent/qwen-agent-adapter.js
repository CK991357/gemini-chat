/**
 * @file Qwen Agent & MCP Proxy
 * @description This module serves as a universal proxy for MCP tool calls initiated by Qwen models.
 * It currently handles the 'glm4v.analyze_image' tool by routing it to the ZhipuAI API.
 */

const ZHIPU_API_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

/**
 * @function handleMcpProxyRequest
 * @description Handles MCP tool call requests from the front-end. It validates the request
 * and routes it to the appropriate handler based on the tool_name.
 * @param {Request} request - The incoming request object from the frontend.
 * @param {object} env - The environment object, must contain necessary API keys (e.g., ZHIPUAI_API_KEY).
 * @returns {Promise<Response>} - A promise that resolves to the response from the backend service.
 */
export async function handleMcpProxyRequest(request, env) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const { tool_name, arguments: tool_args } = await request.json();

    // Route the request based on the tool name
    switch (tool_name) {
      case 'glm4v.analyze_image':
        return await handleZhipuImageAnalysis(tool_args, env);
      
      // Future tools can be added here, for example:
      // case 'tavily.search':
      //   return await handleTavilySearch(tool_args, env);

      default:
        return new Response(JSON.stringify({ error: `Unsupported tool: ${tool_name}` }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
  } catch (error) {
    console.error('[QWEN MCP PROXY] General Error:', error);
    return new Response(JSON.stringify({
      error: 'Qwen MCP Proxy failed',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

/**
 * Handles tool calls for 'glm4v.analyze_image' by proxying to the ZhipuAI API.
 * @param {object} tool_args - The arguments for the tool call.
 * @param {object} env - The environment object containing ZHIPUAI_API_KEY.
 * @returns {Promise<Response>} - The response from the ZhipuAI server, formatted for the tool.
 */
async function handleZhipuImageAnalysis(tool_args, env) {
    const zhipuApiKey = env.ZHIPUAI_API_KEY;
    if (!zhipuApiKey) {
        throw new Error('ZHIPUAI_API_KEY is not configured in the worker environment.');
    }

    if (!tool_args || !tool_args.model || !tool_args.image_url || !tool_args.prompt) {
        return new Response(JSON.stringify({ error: 'Missing required arguments for analyze_image: model, image_url, prompt' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    // Auto-format the image URL if it appears to be a Base64 string.
    // ZhipuAI API (and OpenAI compatibility) requires Base64 to be in Data URI format.
    let formattedImageUrl = tool_args.image_url;
    if (formattedImageUrl && !formattedImageUrl.startsWith('http') && !formattedImageUrl.startsWith('data:image')) {
        // Assume it's a raw Base64 string. Defaulting to jpeg.
        formattedImageUrl = `data:image/jpeg;base64,${formattedImageUrl}`;
    }

    const zhipuRequestBody = {
        model: tool_args.model,
        messages: [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: formattedImageUrl } },
                { type: 'text', text: tool_args.prompt }
            ]
        }],
        stream: false
    };

    const targetUrl = `${ZHIPU_API_BASE_URL}/chat/completions`;
    console.log(`[QWEN MCP PROXY] Forwarding to ZhipuAI: ${targetUrl}`);
    console.log(`[QWEN MCP PROXY] Request Body: ${JSON.stringify(zhipuRequestBody, null, 2)}`);

    const zhipuResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${zhipuApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(zhipuRequestBody),
    });

    const responseData = await zhipuResponse.json();

    if (!zhipuResponse.ok) {
        console.error('ZhipuAI API Error:', responseData);
        throw new Error(`ZhipuAI API request failed with status ${zhipuResponse.status}: ${JSON.stringify(responseData)}`);
    }
    
    // The tool call expects a specific JSON structure in response.
    // We simulate the MCP server's response format which is what the frontend expects.
    const toolResult = {
        content: [{
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
        }]
    };

    return new Response(JSON.stringify(toolResult), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
}