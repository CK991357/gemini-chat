/**
 * @file Code Interpreter Tool Handler
 * @description Handles requests for the 'code_interpreter' tool by forwarding them to the Python tool server.
 */

/**
 * Handles the 'code_interpreter' tool invocation.
 * Forwards the request to the external Python tool server.
 *
 * @param {object} parameters - The parameters for the code_interpreter tool.
 * @param {string} parameters.code - The Python code to be executed.
 * @returns {Promise<object>} - A promise that resolves to the response from the Python tool server.
 * @throws {Error} If the fetch request fails or the Python server returns an error.
 */
export async function handleCodeInterpreter(parameters) {
    const pythonToolServerUrl = 'https://tools.10110531.xyz/api/v1/execute_tool';
    const toolName = 'code_interpreter';

    try {
        const response = await fetch(pythonToolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                tool_name: toolName,
                parameters: parameters,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Python tool server error: ${response.status} - ${JSON.stringify(errorBody)}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error in handleCodeInterpreter: ${error.message}`);
        throw error;
    }
}
