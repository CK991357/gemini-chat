/**
 * @file MCP Proxy Handler for Firecrawl
 * @description Handles the 'firecrawl' tool call by proxying it to the external Python tool server.
 */

/**
 * Executes the Firecrawl tool by calling the external tool server.
 * @param {object} tool_params - The parameters for the tool call, containing mode and nested parameters.
 * @param {object} env - The Cloudflare Worker environment object (not used in this handler but kept for consistency).
 * @returns {Promise<Response>} - A promise that resolves to a Response object containing the Firecrawl results.
 */
export async function handleFirecrawl(tool_params, env) {
    const toolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';

    // Validate the basic structure of the parameters for Firecrawl
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ success: false, error: 'Missing or invalid "parameters" object for firecrawl tool.' }, 400);
    }

    const { mode, parameters } = tool_params;

    if (!mode) {
        return createJsonResponse({ success: false, error: 'Missing required parameter: "mode" for firecrawl tool.' }, 400);
    }
    if (!parameters || typeof parameters !== 'object') {
        return createJsonResponse({ success: false, error: 'Missing or invalid nested "parameters" object for firecrawl tool.' }, 400);
    }

    const requestBody = {
        tool_name: 'firecrawl',
        parameters: tool_params // Pass the entire original parameters object
    };

    try {
        const toolResponse = await fetch(toolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await toolResponse.json();

        if (!toolResponse.ok) {
            console.error('Firecrawl Tool Server Error:', responseData);
            return createJsonResponse({
                success: false,
                error: `Firecrawl tool server request failed with status ${toolResponse.status}`,
                details: responseData
            }, toolResponse.status);
        }
        
        // The external server already returns a success:true/false format,
        // so we can directly forward its response body.
        return createJsonResponse(responseData);

    } catch (error) {
        console.error('Failed to fetch from Firecrawl tool server:', error);
        return createJsonResponse({
            success: false,
            error: 'Failed to connect to the external tool server.',
            details: error.message
        }, 500);
    }
}

/**
 * Helper to create a consistent JSON response.
 * @param {object} body - The response body.
 * @param {number} status - The HTTP status code.
 * @returns {Response}
 */
function createJsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body, null, 2), {
        status: status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
    });
}