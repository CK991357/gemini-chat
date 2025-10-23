// scripts/analyze-logs.js

/**
 * 简单的日志分析工具
 */
function analyzeLogs() {
  console.log('📈 开始分析技能系统日志...');
  
  // 这里可以扩展为从文件或数据库读取日志
  // 目前只是展示分析逻辑
  
  const analysis = {
    totalRequests: 0,
    injections: 0,
    toolCalls: 0,
    matchedPairs: 0,
    skillPerformance: {}
  };
  
  console.log(`
技能系统监控报告:
================

关键指标:
- 总请求数: ${analysis.totalRequests}
- 技能注入次数: ${analysis.injections}
- 工具调用次数: ${analysis.toolCalls}
- 注入-调用匹配率: ${analysis.matchedPairs}/${analysis.injections} (${((analysis.matchedPairs/analysis.injections)*100).toFixed(1)}%)

建议:
1. 关注匹配率低于30%的技能
2. 检查零注入但高调用的工具
3. 优化同义词库覆盖范围
  `);
}

analyzeLogs();