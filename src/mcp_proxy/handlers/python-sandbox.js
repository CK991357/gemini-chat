/**
 * @file Python Sandbox Tool Handler
 * @description Handles requests for the 'python_sandbox' tool by forwarding them to the Python tool server.
 */

/**
 * Handles the 'python_sandbox' tool invocation.
 * Forwards the request to the external Python tool server.
 *
 * @param {object} parameters - The parameters for the python_sandbox tool.
 * @param {string} parameters.code - The Python code to be executed.
 * @returns {Promise<object>} - A promise that resolves to the response from the Python tool server.
 * @throws {Error} If the fetch request fails or the Python server returns an error.
 */
export async function handlePythonSandbox(parameters) {
    const pythonToolServerUrl = 'https://pythonsandbox.10110531.xyz/api/v1/python_sandbox';

    let parsedParameters = parameters;
    // If parameters is a string, attempt to parse it as JSON.
    // This handles cases where the model might stringify the arguments.
    if (typeof parameters === 'string') {
        try {
            parsedParameters = JSON.parse(parameters);
        } catch (e) {
            console.error(`Error parsing parameters string: ${e.message}`);
            throw new Error(`Invalid parameters format for python_sandbox: ${parameters}`);
        }
    }

    try {
        const response = await fetch(pythonToolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                parameters: parsedParameters,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Python tool server error: ${response.status} - ${JSON.stringify(errorBody)}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error in handlePythonSandbox: ${error.message}`); // Changed function name
        throw error;
    }
}
