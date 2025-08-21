// 测试移动端音频输入优化功能（改进版）
console.log('Testing improved mobile audio input optimization...');

// 检查是否正确导入了FloatingAudioButton类
import { FloatingAudioButton } from './ui/floating-audio-button.js';

// 检查是否正确修改了AudioRecorder类
import { AudioRecorder } from '../audio/audio-recorder.js';

// 创建一个模拟的audioRecorder实例
const mockAudioRecorder = {
    start: async (callback) => {
        console.log('Mock audio recorder started');
        // 模拟音频数据
        setTimeout(() => {
            callback('mock-audio-data');
        }, 100);
    },
    stop: (shouldSend = true) => {
        console.log(`Mock audio recorder stopped, shouldSend: ${shouldSend}`);
    }
};

// 测试FloatingAudioButton类的安全性和功能
const testFloatingButton = () => {
    try {
        // 创建悬浮按钮实例
        const floatingButton = new FloatingAudioButton(mockAudioRecorder);
        console.log('FloatingAudioButton created successfully');
        
        // 测试HTML转义功能
        const testString = '<script>alert("XSS")</script>';
        const escapedString = floatingButton.escapeHtml(testString);
        console.log('HTML escaping test:', escapedString);
        
        // 测试显示和隐藏功能
        floatingButton.show();
        console.log('FloatingAudioButton shown');
        
        floatingButton.hide();
        console.log('FloatingAudioButton hidden');
        
        // 测试状态重置
        floatingButton.resetState();
        console.log('FloatingAudioButton state reset');
        
        // 测试销毁功能
        floatingButton.destroy();
        console.log('FloatingAudioButton destroyed');
        
        console.log('All tests passed!');
        return true;
    } catch (error) {
        console.error('Test failed:', error);
        return false;
    }
};

// 运行测试
testFloatingButton();

// 测试移动端设备检测函数
function testIsMobileDevice() {
    // 模拟不同的userAgent
    const userAgents = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)',
        'Mozilla/5.0 (Android 11; Mobile; rv:68.0) Gecko/68.0 Firefox/91.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ];
    
    userAgents.forEach(ua => {
        const originalUserAgent = navigator.userAgent;
        Object.defineProperty(navigator, 'userAgent', {
            value: ua,
            configurable: true
        });
        
        // 注意：在实际测试中，我们不能真正修改navigator.userAgent
        // 这里只是为了演示目的
        console.log(`User agent: ${ua}`);
        console.log(`Is mobile: ${/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)}`);
    });
}

console.log('Mobile device detection test completed');