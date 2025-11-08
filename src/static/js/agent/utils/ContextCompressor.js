// src/static/js/agent/specialized/ContentCompressor.js
export class ContentCompressor {
    static compressContent(content, maxLength = 1000) {
        if (!content || content.length <= maxLength) {
            return content;
        }
        
        // 简单的内容压缩：取开头、中间和结尾
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        if (sentences.length <= 3) {
            return content.substring(0, maxLength) + '...';
        }
        
        const compressed = [
            sentences[0],
            sentences[Math.floor(sentences.length / 2)],
            sentences[sentences.length - 1]
        ].join('. ') + '.';
        
        return compressed.length > maxLength ? compressed.substring(0, maxLength) + '...' : compressed;
    }

    static extractKeyPoints(content, maxPoints = 5) {
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
        return sentences.slice(0, maxPoints).map(s => s.trim());
    }
}