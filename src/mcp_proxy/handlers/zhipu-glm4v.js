/**
 * @file MCP Proxy Handler for Zhipu GLM-4V
 * @description Handles the 'glm4v.analyze_image' tool call by proxying it to the ZhipuAI API.
 * This logic was migrated from the previous implementation to ensure compatibility and modularity.
 */

const ZHIPU_API_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

/**
 * Executes the image analysis tool by calling the ZhipuAI API.
 * @param {object} tool_params - The parameters for the tool call, containing model, image_url, and prompt.
 * @param {object} env - The Cloudflare Worker environment object, containing the ZHIPUAI_API_KEY.
 * @returns {Promise<Response>} - A promise that resolves to a Response object containing the result from ZhipuAI.
 */
export async function handleZhipuImageAnalysis(tool_params, env) {
    const zhipuApiKey = env.ZHIPUAI_API_KEY;
    if (!zhipuApiKey) {
        return createJsonResponse({ success: false, error: 'ZHIPUAI_API_KEY is not configured in the worker environment.' }, 500);
    }

    if (!tool_params || !tool_params.model || !tool_params.image_url || !tool_params.prompt) {
        return createJsonResponse({ success: false, error: 'Missing required parameters for analyze_image: model, image_url, prompt' }, 400);
    }

    // This is the exact logic from the previous implementation to ensure compatibility.
    // ZhipuAI API requires Base64 to be in Data URI format.
    let formattedImageUrl = tool_params.image_url;
    if (formattedImageUrl && !formattedImageUrl.startsWith('http') && !formattedImageUrl.startsWith('data:image')) {
        formattedImageUrl = `data:image/jpeg;base64,${formattedImageUrl}`;
    }

    const zhipuRequestBody = {
        model: tool_params.model,
        messages: [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: formattedImageUrl } },
                { type: 'text', text: tool_params.prompt }
            ]
        }],
        stream: false
    };

    const targetUrl = `${ZHIPU_API_BASE_URL}/chat/completions`;
    
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
        // Return a structured error that the client-side can understand
        return createJsonResponse({
            success: false,
            error: `ZhipuAI API request failed with status ${zhipuResponse.status}`,
            details: responseData
        }, zhipuResponse.status);
    }
    
    // The final response must be structured in a way the model expects.
    // We wrap the raw ZhipuAI response to simulate the tool output.
    return createJsonResponse({
        success: true,
        data: responseData
    });
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