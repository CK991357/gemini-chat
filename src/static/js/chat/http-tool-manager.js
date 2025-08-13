import { GoogleSearchTool } from '../tools/google-search.js';
import { WeatherTool } from '../tools/weather-tool.js';
import { ApplicationError, ErrorCodes } from '../utils/error-boundary.js';
import { Logger } from '../utils/logger.js';

/**
 * Manages tools specifically for HTTP-based chat interactions.
 * This is separate from the original ToolManager to avoid conflicts with the WebSocket system.
 */
export class HttpToolManager {
    /**
     * Creates a new HttpToolManager and registers default tools.
     */
    constructor() {
        this.tools = new Map();
        this.registerDefaultTools();
    }

    /**
     * Registers the default tools: GoogleSearchTool and WeatherTool.
     */
    registerDefaultTools() {
        this.registerTool('googleSearch', new GoogleSearchTool());
        this.registerTool('weather', new WeatherTool());
    }

    /**
     * Registers a new tool.
     *
     * @param {string} name - The name of the tool.
     * @param {Object} toolInstance - The tool instance. Must have a `getDeclaration` method.
     * @throws {ApplicationError} Throws an error if a tool with the same name is already registered.
     */
    registerTool(name, toolInstance) {
        if (this.tools.has(name)) {
            throw new ApplicationError(
                `Tool ${name} is already registered`,
                ErrorCodes.INVALID_STATE
            );
        }
        this.tools.set(name, toolInstance);
        Logger.info(`HTTP Tool ${name} registered successfully`);
    }

    /**
     * Returns the tool declarations for all registered tools in a unified format
     * suitable for HTTP APIs like Gemini and other providers.
     *
     * @returns {Object[]} An array of tool declarations, typically [{ functionDeclarations: [...] }].
     */
    getToolDeclarations() {
        const allFunctionDeclarations = [];
        this.tools.forEach(tool => {
            if (tool.getDeclaration) {
                const declarations = tool.getDeclaration();
                // Ensure declarations is an array and merge it
                if (Array.isArray(declarations)) {
                    allFunctionDeclarations.push(...declarations);
                } else {
                    allFunctionDeclarations.push(declarations);
                }
            }
        });

        // Return a single object with all function declarations, a more common format.
        if (allFunctionDeclarations.length > 0) {
            return [{ functionDeclarations: allFunctionDeclarations }];
        }
        return [];
    }

    /**
     * Handles a tool call from the HTTP API.
     * Executes the specified tool with the given arguments.
     *
     * @param {Object} functionCall - The function call object from the API.
     * @param {string} functionCall.name - The name of the tool to execute.
     * @param {Object} functionCall.args - The arguments to pass to the tool.
     * @param {string} functionCall.id - The ID of the function call.
     * @returns {Promise<Object>} A promise that resolves with the tool's response.
     * @throws {ApplicationError} Throws an error if the tool is unknown or if the tool execution fails.
     */
    async handleToolCall(functionCall) {
        const { name, args, id } = functionCall;
        Logger.info(`Handling HTTP tool call: ${name}`, { args });

        let tool;
        // Special handling for weather tool name from some models
        if (name === 'get_weather_on_date') {
            tool = this.tools.get('weather');
        } else {
            tool = this.tools.get(name);
        }

        if (!tool) {
            throw new ApplicationError(
                `Unknown tool: ${name}`,
                ErrorCodes.INVALID_PARAMETER
            );
        }

        try {
            const result = await tool.execute(args);
            // This structure is formatted for Gemini API's expected tool response.
            return {
                tool_response: {
                    functionResponses: [{
                        name,
                        response: { output: result },
                        id
                    }]
                }
            };
        } catch (error) {
            Logger.error(`Tool execution failed: ${name}`, error);
            return {
                tool_response: {
                    functionResponses: [{
                        name,
                        response: { error: error.message },
                        id
                    }]
                }
            };
        }
    }
}