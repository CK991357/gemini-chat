/**
 * @fileoverview 网络优化器，用于智能调整视频传输策略
 */

export class NetworkOptimizer {
    constructor() {
        this.metrics = {
            transmissionTimes: [],
            successRate: 1.0,
            averageLatency: 0,
            lastAdjustment: Date.now()
        };
        
        this.strategies = {
            NORMAL: { interval: 500, quality: 0.8 },
            CONSERVATIVE: { interval: 1000, quality: 0.6 },
            AGGRESSIVE: { interval: 300, quality: 0.9 }
        };
        
        this.currentStrategy = 'NORMAL';
        
        // 🔥 新增：抖动抑制配置
        this.HYSTERESIS = {
            NORMAL: { down: 0.75, up: 0.95 },
            AGGRESSIVE: { down: 0.85, up: 1.0 },
            CONSERVATIVE: { down: 0.0, up: 0.80 }
        };
    }

    recordTransmission(success, latency) {
        this.metrics.transmissionTimes.push({
            timestamp: Date.now(),
            success,
            latency
        });
        
        // 保持最近50次记录
        if (this.metrics.transmissionTimes.length > 50) {
            this.metrics.transmissionTimes.shift();
        }
        
        this.calculateMetrics();
        this.adjustStrategy();
    }

    calculateMetrics() {
        const recent = this.metrics.transmissionTimes.slice(-10);
        const successes = recent.filter(t => t.success).length;
        this.metrics.successRate = successes / recent.length;
        
        const latencies = recent.map(t => t.latency).filter(l => l > 0);
        this.metrics.averageLatency = latencies.length ? 
            latencies.reduce((a, b) => a + b) / latencies.length : 0;
    }

    /**
     * 🔥 新增：带有抖动抑制的策略调整
     */
    adjustStrategy() {
        const now = Date.now();
        if (now - this.metrics.lastAdjustment < 5000) return; // 5秒内不重复调整
        
        const { successRate } = this.metrics;
        const hysteresis = this.HYSTERESIS[this.currentStrategy];
        
        let newStrategy = this.currentStrategy;
        if (successRate < hysteresis.down) {
            // 降级
            if (this.currentStrategy === 'AGGRESSIVE') newStrategy = 'NORMAL';
            else if (this.currentStrategy === 'NORMAL') newStrategy = 'CONSERVATIVE';
        } else if (successRate > hysteresis.up) {
            // 升级  
            if (this.currentStrategy === 'CONSERVATIVE') newStrategy = 'NORMAL';
            else if (this.currentStrategy === 'NORMAL') newStrategy = 'AGGRESSIVE';
        }
        
        if (newStrategy !== this.currentStrategy) {
            this.currentStrategy = newStrategy;
            this.metrics.lastAdjustment = now;
            console.log(`Network strategy changed to: ${this.currentStrategy}`);
        }
    }

    getCurrentSettings() {
        return this.strategies[this.currentStrategy];
    }

    // 重置状态
    reset() {
        this.metrics = {
            transmissionTimes: [],
            successRate: 1.0,
            averageLatency: 0,
            lastAdjustment: Date.now()
        };
        this.currentStrategy = 'NORMAL';
    }
}