/**
 * @file Qwen Agent Adapter & MCP Proxy
 * @description This module handles proxying MCP tool calls to remote servers like Tavily.
 * It ensures that API keys are handled securely on the backend.
 */

/**
 * @function handleMcpProxyRequest
 * @description Handles MCP tool call requests from the front-end, and securely proxies them to the Tavily remote server.
 * @param {Request} request - The incoming request object, which should contain tool_name, server_url, and arguments.
 * @param {object} env - The environment object, which must contain the TAVILY_API_KEY.
 * @returns {Promise<Response>} - A promise that resolves to the response from the Tavily server.
 */
export async function handleMcpProxyRequest(request, env) {
  // Ensure the request method is POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    // Parse the necessary details from the incoming request body
    const { server_url, tool_name, arguments: tool_args } = await request.json();
    const tavilyApiKey = env.TAVILY_API_KEY;

    // Validate the presence of the API key in the environment variables
    if (!tavilyApiKey) {
      throw new Error('TAVILY_API_KEY is not configured in the worker environment.');
    }

    // Validate the necessary parameters from the request
    if (!server_url || !tool_name || !tool_args) {
        return new Response(JSON.stringify({ error: 'Missing required parameters in proxy request' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    // Securely replace the placeholder API key with the actual key
    const targetUrl = server_url.replace('<your-api-key>', tavilyApiKey);

    // Construct a standard MCP `use_mcp_tool` request body.
    // This is the standardized format that remote MCP servers expect.
    // NOTE: The Tavily MCP server expects the arguments object directly as the body,
    // not wrapped in a use_mcp_tool request. We will send the arguments directly.
    const proxyRequestBody = tool_args;

    console.log(`[MCP PROXY] Forwarding to: ${targetUrl}`);
    console.log(`[MCP PROXY] Request Body: ${JSON.stringify(proxyRequestBody, null, 2)}`);

    // Fetch the response from the Tavily server
    const proxyResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(proxyRequestBody),
    });

    // Stream the response from the Tavily server directly back to the client
    return new Response(proxyResponse.body, {
      status: proxyResponse.status,
      statusText: proxyResponse.statusText,
      headers: {
        'Content-Type': proxyResponse.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*', // Ensure CORS headers are set
      },
    });

  } catch (error) {
    // Log any errors that occur during the proxy process
    console.error('MCP Proxy Error:', error);
    return new Response(JSON.stringify({
      error: 'MCP Proxy failed',
      details: error.message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}