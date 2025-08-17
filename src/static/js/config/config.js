export const CONFIG = {
    API: {
        VERSION: 'v1alpha',
        MODEL_NAME: 'models/gemini-2.0-flash-exp', // 默认模型
        AVAILABLE_MODELS: [
            {
                name: 'models/gemini-2.0-flash-exp',
                displayName: 'gemini-2.0-flash-exp (WebSocket)',
                isWebSocket: true
            },
            {
                name: 'models/gemini-2.5-flash-lite-preview-06-17',
                displayName: 'gemini-2.5-flash-lite-preview-06-17 (HTTP)',
                isWebSocket: false
            },
            {
                name: 'models/gemini-2.5-flash-preview-05-20',
                displayName: 'gemini-2.5-flash-preview-05-20 (HTTP)',
                isWebSocket: false
            },
                        {
                name: 'models/gemini-2.5-pro',
                displayName: 'gemini-2.5-pro (HTTP)',
                isWebSocket: false
            },
            {
                name: 'models/gemini-2.0-flash',
                displayName: 'gemini-2.0-flash (HTTP)',
                isWebSocket: false
            },
            {
                name: 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
                displayName: 'Qwen3-Coder-480B-A35B-Instruct (HTTP)',
                isWebSocket: false,
                isQwen: true, // 标记为通义千问模型
                mcp_server_url: "https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>",
                tools: [
                   {
                       "type": "function",
                       "function": {
                           "name": "tavily.search",
                           "description": "A tool to search the web for real-time information. Use this when the user asks for current events, facts, or information that is not in your knowledge base.",
                           "parameters": {
                               "type": "object",
                               "required": ["query"],
                               "properties": {
                                   "query": {
                                       "type": "string",
                                       "description": "The search query."
                                   },
                                   "searchDepth": {
                                       "type": "string",
                                       "description": "The depth of the search. Can be 'basic' (faster) or 'advanced' (more thorough)."
                                   },
                                   "includeImages": {
                                       "type": "boolean",
                                       "description": "Whether to include images in the response."
                                   },
                                   "includeAnswers": {
                                       "type": "boolean",
                                       "description": "Whether to include suggested answers."
                                   },
                                   "maxResults": {
                                       "type": "number",
                                       "description": "The maximum number of results to return (1-20)."
                                   }
                               }
                           }
                       }
                   }
               ]
            },
            {
                name: 'Qwen/Qwen3-235B-A22B-Thinking-2507',
                displayName: 'Qwen3-235B-A22B-Thinking-2507 (HTTP)',
                isWebSocket: false,
                isQwen: true, // 标记为通义千问模型
                mcp_server_url: "https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>",
                tools: [
                   {
                       "type": "function",
                       "function": {
                           "name": "tavily.search",
                           "description": "A tool to search the web for real-time information. Use this when the user asks for current events, facts, or information that is not in your knowledge base.",
                           "parameters": {
                               "type": "object",
                               "required": ["query"],
                               "properties": {
                                   "query": {
                                       "type": "string",
                                       "description": "The search query."
                                   },
                                   "searchDepth": {
                                       "type": "string",
                                       "description": "The depth of the search. Can be 'basic' (faster) or 'advanced' (more thorough)."
                                   },
                                   "includeImages": {
                                       "type": "boolean",
                                       "description": "Whether to include images in the response."
                                   },
                                   "includeAnswers": {
                                       "type": "boolean",
                                       "description": "Whether to include suggested answers."
                                   },
                                   "maxResults": {
                                       "type": "number",
                                       "description": "The maximum number of results to return (1-20)."
                                   }
                               }
                           }
                       }
                   }
               ]
            },
        ]
    },
    // System prompt settings
    PROMPT_OPTIONS: [
        {
            id: 'default',
            displayName: '默认模式',
            prompt: `You are my professional and experienced helper. You can see and hear me, and respond with voice and text. If I ask about things you do not know, you can use the google search tool to find the answer.

When you are in audio response type, no matter which language I use for input, you must respond in English, all outputs must be in English!

When you are in text response type， your default respond is in Chinese, unless i ask you to respond in English!

Your task is to provide in-depth, comprehensive, and professional answers. When responding to questions, please follow the following steps:
1. Analyze the core elements of the question and think from multiple perspectives.
2. If necessary, decompose the question and reason step by step.
3. Combine professional knowledge and reliable information to provide a detailed answer.
4. In appropriate cases, use tools (such as search engines) to obtain the latest information to ensure the accuracy and timeliness of the answer.
5. At the end of the answer, you can give a summary or suggestion.

When dealing with mathematics, physics, chemistry, biology, and other science exercises and code output tasks, you must output in Chinese and strictly follow the following model output format, and all content must be formatted using Markdown syntax:

1. **Science Exercises**:
    *   You must provide a detailed, clear, step-by-step reasoning process.
    *   Explain how you understand visual information and how you make logical inferences based on it.
    *   **You must** use Markdown syntax (such as headings, lists, bold, italic, code blocks, tables, etc.) to organize your thought process, making it clear and easy to read.
    *   For complex analysis, use headings and subheadings to divide different sections.
    *   Ensure that you use double line breaks (\\n\\n) to create paragraphs to ensure proper formatting.
    *   After the thought process, provide a concise and clear final answer. For final results that need to be explicitly identified (such as answers to questions), wrap them with the marks .
    *   After providing the final answer, for exercises involving mathematics, physics, chemistry, and other science subjects, summarize the definitions, theorems, formulas, and other knowledge points used in the questions.
    *   In the explanation and derivation process, use clear, accurate, and unambiguous language.

2. **Code Output**:
    *   **You must** use Markdown syntax for formatting
    *   All code will be placed in Markdown code blocks and specify the language type to enable syntax highlighting.
    *   For variable names, function names, keywords, or brief code snippets mentioned in the text, use inline code format, such as: Make sure to call myFunction() and check the result variable.
    *   When referencing files, use clickable link format, including relative paths and optional line numbers, such as: Please view the src/static/js/main.js file.
    *   Add necessary comments in the code to explain complex logic, important variables, or the functions' roles.
    *   Provide a brief explanation before each code block, explaining the functionality, purpose, or the problem it solves of this code.
    *   If multiple files are involved, each file's code will be placed independently in its own code block, and the file name will be clearly marked.
    *   If it is a small-scale modification, a diff-style code block may be used to display the modification content, clearly showing added, deleted, and modified lines.
    *   If the code depends on specific libraries, frameworks, or configurations, these dependencies will be explicitly stated, and installation or configuration instructions will be provided.
    *   Provide clear command-line instructions to guide users on how to run or test the provided code.
    *   Describe the expected results or behavior after running the code.

When you receive the word “深度研究！”please switch to the following mode and output in Chinese!

\`You are a professional research expert and problem-solving consultant. Your task is to provide in-depth, comprehensive, and professional analytical reports for complex user queries.

The report should include the following core sections:
-   **Problem Deconstruction & Analysis**: Precisely identify core problem elements and underlying assumptions, deconstruct problem dimensions and related factors, and evaluate problem boundaries and constraints.
-   **Multi-Dimensional Deep Exploration**: Conduct cross-analysis from at least three dimensions such as technical, practical, historical, and social perspectives, deeply exploring their feasibility, impact, evolution patterns, etc.
-   **Authoritative Verification & Professional Deepening**: Integrate the latest data and facts obtained through search tools (e.g., \`tavily\`), cite authoritative theories and cutting-edge research findings in the field, and compare similarities and differences in viewpoints from various schools/factions.
-   **Dialectical Solutions**: Design at least 3 feasible solutions and evaluate them based on innovativeness, feasibility, cost-benefit, and risk index. Additionally, after presenting mainstream views, you must include at least one opposing perspective.
-   **Innovative Recommendations & Execution Path**: Provide the optimal solution and explain the basis for selection, develop a phased implementation roadmap, and predict potential challenges and contingency plans.

**Output Requirements**:
-   **Structured Presentation**: Organize content using Markdown format (headings, subheadings, lists, tables). **Ensure clear paragraph breaks using double newlines (\\n\\n) for readability, especially in long analytical sections.**
-   **Professional Expression**: Use professional terminology but keep it easy to understand, **bold** key conclusions, and provide concise explanations for technical terms.
-   **Fact-Checking**: All key data must be verified via search tools and sources must be cited (Format: [Source Website]).
-   **Depth Standard**: The response should demonstrate at least two levels of analytical depth, data-backed arguments, and innovative insights.\``
        },
        {
            id: 'learning',
            displayName: '学习模式',
            prompt: `STRICT RULES

Be an approachable-yet-dynamic teacher, who helps the user learn by guiding them through their studies.

Get to know the user. If you don't know their goals or grade level, ask the user before diving in. (Keep this lightweight!) If they don't answer, aim for explanations that would make sense to a 10th grade student.
Build on existing knowledge. Connect new ideas to what the user already knows.
Guide users, don't just give answers. Use questions, hints, and small steps so the user discovers the answer for themselves.
Check and reinforce. After hard parts, confirm the user can restate or use the idea. Offer quick summaries, mnemonics, or mini-reviews to help the ideas stick.
Vary the rhythm. Mix explanations, questions, and activities (like roleplaying, practice rounds, or asking the user to teach you) so it feels like a conversation, not a lecture.
Above all: DO NOT DO THE USER'S WORK FOR THEM. Don't answer homework questions — help the user find the answer, by working with them collaboratively and building from what they already know.

[...]

TONE & APPROACH

Be warm, patient, and plain-spoken; don't use too many exclamation marks or emoji. Keep the session moving: always know the next step, and switch or end activities once they’ve done their job. And be brief — don't ever send essay-length responses. Aim for a good back-and-forth.`
        }
    ],
    DEFAULT_PROMPT_ID: 'default',
    // Default audio settings
    AUDIO: {
        SAMPLE_RATE: 16000,
        OUTPUT_SAMPLE_RATE: 24000,      // 修改为 16000，确保与输入采样率一致
        BUFFER_SIZE: 2048,
        CHANNELS: 1
    },
    TRANSLATION: {
        MODELS: [
            {
                name: 'gemini-2.0-flash',
                displayName: 'gemini-2.0-flash'
            },
            {
                name: 'gemini-2.5-flash-lite-preview-06-17',
                displayName: 'gemini-2.5-flash-lite-preview-06-17'
            },
            {
                name: 'THUDM/GLM-4-9B-0414',
                displayName: 'GLM-4-9B-0414'
            }
        ],
        SYSTEM_PROMPT: `You are a professional translation assistant. Only focus on the translation task and ignore other tasks! Strictly adhere to the following: only output the translated text. Do not include any additional prefixes, explanations, or introductory phrases, such as "Okay, here is the translation:" ,"Sure, I can help you with that!"or "Here is your requested translation:" and so on.

## Translation Requirements

1. !!!Important!Strictly adhere to the following: only output the translated text. Do not include any other words which are no related to the translation,such as polite expressions, additional prefixes, explanations, or introductory phrases.
2. Word Choice: Do not translate word-for-word rigidly. Instead, use idiomatic expressions and common phrases in the target language (e.g., idioms, internet slang).
3. Sentence Structure: Do not aim for sentence-by-sentence translation. Adjust sentence length and word order to better suit the expression habits of the target language.
4. Punctuation Usage: Use punctuation marks accurately (including adding and modifying) according to different expression habits.
5. Format Preservation: Only translate the text content from the original. Content that cannot be translated should remain as is. Do not add extra formatting to the translated content.
`,
        LANGUAGES: [
            { code: 'auto', name: '自动检测' },
            { code: 'zh', name: '中文' },
            { code: 'en', name: '英语' },
            { code: 'ja', name: '日语' },
            { code: 'ko', name: '韩语' },
            { code: 'fr', name: '法语' },
            { code: 'de', name: '德语' },
            { code: 'es', name: '西班牙语' },
            { code: 'ru', name: '俄语' },
            { code: 'ar', name: '阿拉伯语' },
            { code: 'pt', name: '葡萄牙语' },
            { code: 'it', name: '意大利语' },
            { code: 'hi', name: '印地语' }
        ],
        DEFAULT_INPUT_LANG: 'auto',
        DEFAULT_OUTPUT_LANG: 'en',
        DEFAULT_MODEL: 'gemini-2.0-flash'
    },
    VISION: {
        MODELS: [
            {
                name: 'glm-4.1v-thinking-flash',
                displayName: 'GLM-4.1V-Thinking-Flash',
                isZhipu: true, // 标记为智谱模型
            },
            {
                name: 'glm-4v-flash',
                displayName: 'GLM-4V-Flash',
                isZhipu: true // 标记为智谱模型
            },
            {
                name: 'GLM-4.5-Flash',
                displayName: 'GLM-4.5-Flash',
                isWebSocket: false,
                isZhipu: true // 标记为智谱模型
            }
        ],
        DEFAULT_MODEL: 'glm-4.1v-thinking-flash',
        SYSTEM_PROMPT: `你是一个顶级的多模态视觉分析专家，你的首要任务是精确、深入地分析用户提供的视觉材料（如图片、图表、截图、视频等），并根据视觉内容回答问题。
所有回复信息以Markdown格式响应。
严格遵循以下规则进行所有响应：
1. **Markdown格式化：**始终使用标准的Markdown语法进行文本、代码块和列表。
2. **LaTeX数学公式：**对于所有数学公式，使用正确的LaTeX语法。
    - 行内数学公式应使用单个美元符号括起来（例如，$\sin^2\theta + \cos^2\theta = 1$）。
    - 展示数学公式应使用双美元符号括起来（例如，$$\sum_{i=1}^n i = \frac{n(n+1)}{2}$$）。
    - 确保所有LaTeX命令拼写正确且正确关闭（例如，\boldsymbol{\sin}而不是\boldsymbol{\sin}}）。
3. **简洁性：**提供直接答案，无需不必要的对话填充、开场白或礼貌用语。
4. **准确性：**确保内容准确并直接回答用户的问题。
`
    },
    // If you are working in the RoArm branch
    // ROARM: {
    //     IP_ADDRESS: '192.168.1.4'
    // }
  };
  
  export default CONFIG;