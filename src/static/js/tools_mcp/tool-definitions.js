/**
 * @file MCP Tool Definitions
 * This file serves as a central registry for all tool schemas provided to MCP-compatible models like Qwen.
 */

// Tavily search tool definition
const tavily_search = {
    "type": "function",
    "function": {
        "name": "tavily_search",
        "description": "Uses the Tavily API to perform a web search to find real-time information, answer questions, or research topics. Returns a list of search results with summaries and links.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to execute."
                },
                "search_depth": {
                    "type": "string",
                    "description": "Search depth. 'basic' is faster, 'advanced' is more comprehensive.",
                    "enum": ["basic", "advanced"],
                    "default": "advanced"
                },
                "max_results": {
                    "type": "integer",
                    "description": "The maximum number of search results to return.",
                    "default": 5
                }
            },
            "required": ["query"]
        }
    }
};

// Existing image analysis tool definition (schema extracted from config.js)
const image_url_analyzer = {
    "type": "function",
    "function": {
        "name": "glm4v.analyze_image",
        "description": "Analyze image using GLM-4V model",
        "parameters": {
            "type": "object",
            "required": ["model", "image_url", "prompt"],
            "properties": {
                "model": {
                    "type": "string",
                    "enum": ["glm-4v-flash"],
                    "description": "Model to use"
                },
                "image_url": {
                    "type": "string",
                    "description": "Image URL to analyze"
                },
                "prompt": {
                    "type": "string",
                    "description": "Question or instruction about the image"
                }
            }
        }
    }
};

// Export all available tools in an array
export const mcpTools = [
    tavily_search,
    image_url_analyzer
    // Future tools can be added here
];

// Export a map for easy lookup by name
export const mcpToolsMap = {
    'tavily_search': tavily_search,
    'glm4v.analyze_image': image_url_analyzer
};