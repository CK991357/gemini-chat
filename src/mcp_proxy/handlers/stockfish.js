/**
 * @file MCP Proxy Handler for Stockfish Analyzer
 * @description Handles the 'stockfish_analyzer' tool call by proxying it to the external Python tool server.
 */

/**
 * Executes the Stockfish analyzer tool by calling the external tool server.
 * @param {object} tool_params - The parameters for the tool call, containing fen, mode, and options.
 * @param {object} env - The Cloudflare Worker environment object (not used in this handler but kept for consistency).
 * @returns {Promise<Response>} - A promise that resolves to a Response object containing the Stockfish analysis results.
 */
export async function handleStockfishAnalyzer(tool_params, env) {
    const toolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';

    // Validate the basic structure of the parameters for Stockfish
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ 
            success: false, 
            error: 'Missing or invalid parameters object for stockfish_analyzer tool.' 
        }, 400);
    }

    const { fen, mode } = tool_params;

    // Validate required parameters
    if (!fen) {
        return createJsonResponse({ 
            success: false, 
            error: 'Missing required parameter: "fen" for stockfish_analyzer tool.' 
        }, 400);
    }
    
    if (!mode) {
        return createJsonResponse({ 
            success: false, 
            error: 'Missing required parameter: "mode" for stockfish_analyzer tool.' 
        }, 400);
    }

    // Validate mode value
    const validModes = ['get_best_move', 'get_top_moves', 'evaluate_position'];
    if (!validModes.includes(mode)) {
        return createJsonResponse({ 
            success: false, 
            error: `Invalid mode: "${mode}". Must be one of: ${validModes.join(', ')}` 
        }, 400);
    }

    const requestBody = {
        tool_name: 'stockfish_analyzer',
        parameters: tool_params // Pass the entire parameters object
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
            console.error('Stockfish Tool Server Error:', responseData);
            return createJsonResponse({
                success: false,
                error: `Stockfish tool server request failed with status ${toolResponse.status}`,
                details: responseData
            }, toolResponse.status);
        }
        
        // The external server already returns a success:true/false format,
        // so we can directly forward its response body.
        return createJsonResponse(responseData);

    } catch (error) {
        console.error('Failed to fetch from Stockfish tool server:', error);
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