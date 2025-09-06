/**
 * @file Python Sandbox Tool Handler
 * @description Handles requests for the 'python_sandbox' tool by forwarding them to the Python tool server.
 */

/**
 * Attempts to parse a string that may be a JSON object or a multi-layered stringified JSON.
 * This robustly handles common model-generated formatting errors, like extra stringification.
 * @param {string | object} input - The input from the model's \`arguments\`.
 * @returns {object} The parsed JSON object.
 * @throws {Error} If parsing fails after multiple repair attempts.
 */
function parseWithRepair(input) {
    if (typeof input === 'object' && input !== null) {
        return input; // Already a valid object.
    }

    if (typeof input !== 'string') {
        throw new Error(`Invalid arguments type: expected string or object, got ${typeof input}`);
    }

    let currentString = input;
    // Attempt to parse up to 3 layers of stringification.
    for (let i = 0; i < 3; i++) {
        try {
            const result = JSON.parse(currentString);
            // If the result is another string, it was double-stringified. Continue to parse the inner string.
            if (typeof result === 'string') {
                currentString = result;
            } else {
                return result; // Successfully parsed to an object.
            }
        } catch (e) {
            // If parsing fails, throw a clear error.
            const errorContext = i > 0 ? `inner string: ${currentString}` : `original string: ${input}`;
            throw new Error(`Failed to parse arguments as JSON. Error: ${e.message}. Malformed ${errorContext}`);
        }
    }

    throw new Error(`Exceeded maximum repair attempts for arguments: ${input}`);
}


/**
 * Handles the 'python_sandbox' tool invocation.
 * Forwards the request to the external Python tool server.
 *
 * @param {string|object} parameters - The parameters for the python_sandbox tool from the model.
 * @returns {Promise<object>} - A promise that resolves to the response from the Python tool server.
 * @throws {Error} If the fetch request fails or the Python server returns an error.
 */
export async function handlePythonSandbox(parameters) {
    const pythonToolServerUrl = 'https://pythonsandbox.10110531.xyz/api/v1/python_sandbox';

    try {
        // Use the robust parser to handle potentially malformed arguments from the model.
        const parsedParameters = parseWithRepair(parameters);

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
            const errorBody = await response.json().catch(() => response.text()); // Gracefully handle non-JSON error responses
            throw new Error(`Python tool server error: ${response.status} - ${JSON.stringify(errorBody)}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error in handlePythonSandbox: ${error.message}`);
        // Re-throw the error to be caught by the calling MCP handler.
        throw error;
    }
}
