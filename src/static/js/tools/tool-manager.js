import { ApplicationError, ErrorCodes } from '../utils/error-boundary.js';
import { Logger } from '../utils/logger.js';
import { GoogleSearchTool } from './google-search.js';
import { WeatherTool } from './weather-tool.js';

/**
 * Manages the registration and execution of tools.
 * Tools are used to extend the functionality of the Gemini API, allowing it to interact with external services.
 */
export class ToolManager {
    /**
     * Creates a new ToolManager and registers default tools.
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
        Logger.info(`Tool ${name} registered successfully`);
    }

    /**
     * Returns the tool declarations for all registered tools.
     * These declarations are used by the Gemini API to understand what tools are available.
     *
     * @returns {Object[]} An array of tool declarations.
     */
    getToolDeclarations() {
        const allDeclarations = [];
        
        this.tools.forEach((tool, name) => {
            if (tool.getDeclaration) {
                const declaration = tool.getDeclaration();
                // 根据工具的类型，将其声明添加到 allDeclarations 数组中
                // Gemini API 期望的工具声明是包含 functionDeclarations 或 retrieval 的对象
                if (declaration.functionDeclarations || declaration.retrieval) {
                    allDeclarations.push(declaration);
                } else {
                    // 如果工具声明不符合预期格式，可以记录警告
                    Logger.warn(`Tool ${name} returned an unexpected declaration format:`, declaration);
                }
            }
        });

        return allDeclarations;
    }

    /**
     * Handles a tool call from the Gemini API.
     * Executes the specified tool with the given arguments.
     *
     * @param {Object} functionCall - The function call object from the Gemini API.
     * @param {string} functionCall.name - The name of the tool to execute.
     * @param {Object} functionCall.args - The arguments to pass to the tool.
     * @param {string} functionCall.id - The ID of the function call.
     * @returns {Promise<Object>} A promise that resolves with the tool's response.
     * @throws {ApplicationError} Throws an error if the tool is unknown or if the tool execution fails.
     */
    async handleToolCall(functionCall) {
        const { name, args, id } = functionCall;
        Logger.info(`Handling tool call: ${name}`, { args });

        let tool;
        // 根据 functionCall.name 查找对应的工具实例
        // 对于 Google Search，模型会调用 'googleSearch'
        // 对于 Weather Tool，模型会调用 'get_weather_on_date'
        if (name === 'get_weather_on_date') {
            tool = this.tools.get('weather');
        } else if (name === 'googleSearch') { // 明确处理 googleSearch
            tool = this.tools.get('googleSearch');
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
            return {
                functionResponses: [{
                    response: { output: result },
                    id
                }]
            };
        } catch (error) {
            Logger.error(`Tool execution failed: ${name}`, error);
            return {
                functionResponses: [{
                    response: { error: error.message },
                    id
                }]
            };
        }
    }
} 