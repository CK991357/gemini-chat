/**
 * @file Python Sandbox Tool Handler
 * @description Handles requests for the 'python_sandbox' tool by forwarding them to the Python tool server.
 */

/**
 * "Uncrashable" parser for model-generated arguments. It tries various strategies
 * to extract a valid object and will always return an object, never throw.
 * @param {string | object} input - The input from the model's \`arguments\`.
 * @returns {object} The parsed JSON object, or a fallback object with an error.
 */
function parseWithRepair(input) {
    if (typeof input === 'object' && input !== null) {
        return input; // Already a valid object.
    }

    if (typeof input !== 'string') {
        return {
            code: `print("Error: Tool arguments must be a string, but received type '${typeof input}'.")`
        };
    }

    let currentString = input;

    // 1. First, try to parse it as-is, handling multiple layers of stringification.
    for (let i = 0; i < 3; i++) {
        try {
            const result = JSON.parse(currentString);
            if (typeof result === 'string') {
                currentString = result;
            } else {
                return result; // Success!
            }
        } catch (e) {
            // Parsing failed, break the loop and proceed to regex fallback.
            break;
        }
    }

    // 2. If JSON.parse failed, try a regex fallback to salvage the code.
    // This looks for something that looks like a "code" key and extracts its string value.
    try {
        const match = /"code"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(input);
        if (match && match[1]) {
            // We found a code block, let's unescape it and return it.
            const code = JSON.parse(`"${match[1]}"`);
            return {
                code
            };
        }
    } catch (e) {
        // Regex or un-escaping failed, proceed to final fallback.
    }
    
    // 3. As a last resort, return an object that tells the model what went wrong.
    return {
        code: `print("FATAL ERROR: Failed to parse the provided tool arguments. The input was malformed. Please ensure you provide a valid JSON string with a 'code' key. Input received: ${JSON.stringify(input)}")`
    };
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

/**
 * Handles the 'python_sandbox' tool invocation with robust error handling.
 * This function is designed to never crash the Cloudflare Worker.
 *
 * @param {string|object} parameters - The parameters for the python_sandbox tool from the model.
 * @returns {Promise<Response>} - A promise that resolves to a JSON response for the model.
 */
export async function handlePythonSandbox(parameters, env, session_id) {
    const pythonToolServerUrl = 'https://pythonsandbox.10110531.xyz/api/v1/python_sandbox';

    try {
        // Use the "uncrashable" parser. It will always return a usable object.
        const parsedParameters = parseWithRepair(parameters);

        // 构造发往后端的请求体，包含 session_id
        const backendRequestBody = {
            parameters: parsedParameters,
            session_id: session_id, // 🎯 核心修复：透传 session_id
        };

        const response = await fetch(pythonToolServerUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(backendRequestBody),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => response.text());
            // Return a structured JSON error to the model instead of throwing.
            return createJsonResponse({
                error: `Python tool server error: ${response.status}`,
                details: errorBody
            }, response.status);
        }

        return createJsonResponse(await response.json());
    } catch (error) {
        console.error(`Fatal error in handlePythonSandbox: ${error.stack}`);
        // If a catastrophic error occurs (e.g., network failure),
        // return a structured JSON error instead of crashing the worker.
        return createJsonResponse({
            error: "An unexpected error occurred in the tool handler.",
            message: error.message
        }, 500);
    }
}
