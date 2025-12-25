/**
 * @file MCP Proxy Handler for AlphaVantage
 * @description Handles the 'alphavantage' tool call by proxying it to the external Python tool server.
 * 支持与代码解释器的会话目录共享。
 */

/**
 * Executes the AlphaVantage tool by calling the external tool server.
 * @param {object} tool_params - The parameters for the tool call.
 * @param {object} env - The Cloudflare Worker environment object.
 * @param {string} session_id - 会话ID，用于数据文件共享
 * @returns {Promise<Response>} - A promise that resolves to a Response object containing the AlphaVantage results.
 */
export async function handleAlphaVantage(tool_params, env, session_id = null) {
    const toolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';

    // Validate the basic structure of the parameters
    if (!tool_params || typeof tool_params !== 'object') {
        return createJsonResponse({ 
            success: false, 
            error: 'Missing or invalid "parameters" object for alphavantage tool.' 
        }, 400);
    }

    const { function: functionName, parameters } = tool_params;

    if (!functionName) {
        return createJsonResponse({ 
            success: false, 
            error: 'Missing required parameter: "function" for alphavantage tool.' 
        }, 400);
    }

    // 验证参数，确保parameters存在（即使为空对象）
    const finalParameters = parameters || {};

    // 构建请求体，包含session_id
    const requestBody = {
        tool_name: 'alphavantage',
        parameters: {
            function: functionName,
            parameters: finalParameters
        }
    };

    // 🎯 核心：如果提供了session_id，添加到请求中
    if (session_id) {
        requestBody.session_id = session_id;
    }

    try {
        console.log(`[AlphaVantage] Calling tool server for function: ${functionName}`, {
            parameters: finalParameters,
            session_id: session_id || 'none'
        });
        
        const toolResponse = await fetch(toolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        const responseData = await toolResponse.json();

        if (!toolResponse.ok) {
            console.error('AlphaVantage Tool Server Error:', responseData);
            return createJsonResponse({
                success: false,
                error: `AlphaVantage tool server request failed with status ${toolResponse.status}`,
                details: responseData
            }, toolResponse.status);
        }
        
        // 🎯 增强响应：添加会话文件信息
        if (responseData.success && responseData.metadata && responseData.metadata.session_id) {
            const sessionId = responseData.metadata.session_id;
            const savedFiles = responseData.metadata.saved_files || [];
            
            console.log(`[AlphaVantage] 数据已保存到会话 ${sessionId}，文件数量: ${savedFiles.length}`);
            
            // 如果存在示例代码，也记录日志
            if (responseData.metadata.example_code) {
                console.log(`[AlphaVantage] 生成了处理示例代码，长度: ${responseData.metadata.example_code.length}`);
            }
        }
        
        return createJsonResponse(responseData);

    } catch (error) {
        console.error('Failed to fetch from AlphaVantage tool server:', error);
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