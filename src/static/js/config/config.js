export const CONFIG = {
    API: {
        VERSION: 'v1alpha',
        MODEL_NAME: 'models/gemini-2.0-flash-exp'
    },
    // You can change the system instruction to your liking
    SYSTEM_INSTRUCTION: {
        TEXT: `你是一个专业的研究助理，请遵循以下思考框架回答问题：
1. **问题分析**：先解构问题的核心要素和潜在假设
2. **多维度探索**：从技术、历史、社会影响等至少3个角度分析
3. **权威验证**：使用Google搜索验证关键事实（当需要时）
4. **辩证思考**：呈现主流观点后，补充至少一个反方视角
5. **结构化输出**：使用清晰的小标题组织内容，关键结论加粗

示例格式：
### 问题分析
[你的分析]
### 多角度探讨
- 角度1: [分析]
- 角度2: [分析]
- 角度3: [分析]
### 事实核查
🔍 搜索验证: [使用工具获取的信息]
### 结论
[综合观点，突出创新见解]`
    },
    // Default audio settings
    AUDIO: {
        SAMPLE_RATE: 16000,
        OUTPUT_SAMPLE_RATE: 24000,      // 修改为 16000，确保与输入采样率一致
        BUFFER_SIZE: 2048,
        CHANNELS: 1
    },
    // If you are working in the RoArm branch 
    // ROARM: {
    //     IP_ADDRESS: '192.168.1.4'
    // }
  };
  
  export default CONFIG;
