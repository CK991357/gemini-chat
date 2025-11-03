// src/static/js/agent/tools/BaseTool.js

/**
 * @class BaseTool
 * @description 所有工具的抽象基类，确保接口一致性
 */
export class BaseTool {
    constructor(chatApiHandler) {
        if (!chatApiHandler) {
            throw new Error("BaseTool必须提供chatApiHandler实例");
        }
        this.chatApiHandler = chatApiHandler;
        this.name = "";
        this.description = "";
        this.schema = {};
    }

    /**
     * 🎯 配置工具元数据
     */
    configure(metadata) {
        const { name, description, schema } = metadata;
        
        if (!name || !description) {
            throw new Error("工具配置必须包含name和description");
        }
        
        this.name = name;
        this.description = description;
        this.schema = schema || {
            type: "object",
            properties: {
                input: { 
                    type: "string", 
                    description: "工具输入参数" 
                }
            },
            required: ["input"]
        };
        
        console.log(`[BaseTool] 配置工具: ${this.name}`);
        return this;
    }

    /**
     * 🎯 统一的工具调用接口（子类必须实现）
     */
    async invoke(input, runManager) {
        throw new Error(`工具 ${this.name} 必须实现 invoke 方法`);
    }

    /**
     * 🎯 获取工具声明（用于LLM）
     */
    getDeclaration() {
        if (!this.name || !this.description) {
            throw new Error("工具未正确配置，无法生成声明");
        }
        
        return {
            type: "function",
            function: {
                name: this.name,
                description: this.description,
                parameters: this.schema
            }
        };
    }

    /**
     * 🎯 兼容性方法
     */
    async call(input, runManager) {
        return this.invoke(input, runManager);
    }

    /**
     * 🎯 获取工具状态
     */
    getStatus() {
        return {
            name: this.name,
            description: this.description,
            configured: !!this.name && !!this.description,
            type: 'base_tool'
        };
    }
}