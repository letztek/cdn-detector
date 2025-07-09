/**
 * 影片品質檢測節流管理器
 * 實現智能節流機制，根據上下文自動調整檢測頻率
 */

class VideoQualityThrottlingManager {
    constructor() {
        this.config = {
            // 適應性節流間隔配置
            intervals: {
                PLAYING_VISIBLE: 2000,      // 影片播放且頁面可見：2秒
                PLAYING_HIDDEN: 8000,       // 影片播放但頁面隱藏：8秒
                PAUSED_VISIBLE: 5000,       // 影片暫停且頁面可見：5秒
                PAUSED_HIDDEN: 30000,       // 影片暫停且頁面隱藏：30秒
                POPUP_OPEN: 1500,           // Popup 開啟時：1.5秒
                BACKGROUND_UPDATE: 10000,   // 背景更新：10秒
                CLEANUP_INTERVAL: 60000     // 清理間隔：60秒
            },
            
            // 數據存儲限制（減少記憶體使用）
            storage: {
                MAX_METRICS_PER_VIDEO: 30,      // 每個影片最多存儲30個指標
                TRIM_TO_METRICS: 15,            // 清理時保留15個指標
                MAX_EVENTS: 100,                // 最多存儲100個事件
                TRIM_TO_EVENTS: 50,             // 清理時保留50個事件
                MAX_FPS_SAMPLES: 3              // 幀率計算最多使用3個樣本
            },
            
            // 性能監控閾值
            performance: {
                MAX_CALCULATION_TIME: 50,       // 計算時間超過50ms觸發優化
                MAX_MEMORY_USAGE: 10 * 1024 * 1024, // 10MB記憶體限制
                CPU_THROTTLE_THRESHOLD: 80      // CPU使用率超過80%時節流
            }
        };
        
        this.state = {
            isPageVisible: !document.hidden,
            isPopupOpen: false,
            videoStates: new Map(),     // 存儲每個影片的狀態
            performanceMetrics: new Map(),
            lastCleanup: Date.now()
        };
        
        this.timers = new Map();        // 存儲定時器引用
        this.requestQueues = new Map(); // 請求佇列管理
        
        this.initializePageVisibilityDetection();
        this.initializePerformanceMonitoring();
        this.startCleanupTimer();
    }
    
    /**
     * 初始化頁面可見性檢測
     */
    initializePageVisibilityDetection() {
        document.addEventListener('visibilitychange', () => {
            this.state.isPageVisible = !document.hidden;
            this.updateAllVideoTimers();
        });
    }
    
    /**
     * 初始化性能監控
     */
    initializePerformanceMonitoring() {
        // 使用 Performance Observer 監控長任務
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.duration > this.config.performance.MAX_CALCULATION_TIME) {
                            console.warn(`[VideoQualityThrottling] 檢測到長任務: ${entry.duration}ms`);
                            this.optimizePerformance();
                        }
                    }
                });
                observer.observe({ entryTypes: ['longtask'] });
            } catch (error) {
                console.warn('[VideoQualityThrottling] Performance Observer 不可用:', error);
            }
        }
    }
    
    /**
     * 註冊影片進行監控
     */
    registerVideo(videoId, videoElement) {
        if (!this.state.videoStates.has(videoId)) {
            this.state.videoStates.set(videoId, {
                element: videoElement,
                isPlaying: !videoElement.paused,
                lastUpdate: Date.now(),
                requestCount: 0,
                totalCalculationTime: 0
            });
        }
        
        this.updateVideoTimer(videoId);
    }
    
    /**
     * 取消註冊影片
     */
    unregisterVideo(videoId) {
        // 清理定時器
        if (this.timers.has(videoId)) {
            clearInterval(this.timers.get(videoId));
            this.timers.delete(videoId);
        }
        
        // 清理請求佇列
        if (this.requestQueues.has(videoId)) {
            this.requestQueues.delete(videoId);
        }
        
        // 清理狀態
        this.state.videoStates.delete(videoId);
        this.state.performanceMetrics.delete(videoId);
    }
    
    /**
     * 更新影片狀態並調整定時器
     */
    updateVideoState(videoId, isPlaying) {
        const videoState = this.state.videoStates.get(videoId);
        if (videoState && videoState.isPlaying !== isPlaying) {
            videoState.isPlaying = isPlaying;
            this.updateVideoTimer(videoId);
        }
    }
    
    /**
     * 設置 Popup 開啟狀態
     */
    setPopupState(isOpen) {
        if (this.state.isPopupOpen !== isOpen) {
            this.state.isPopupOpen = isOpen;
            this.updateAllVideoTimers();
        }
    }
    
    /**
     * 獲取適當的檢測間隔
     */
    getDetectionInterval(videoId) {
        const videoState = this.state.videoStates.get(videoId);
        if (!videoState) return this.config.intervals.BACKGROUND_UPDATE;
        
        // Popup 開啟時使用最短間隔
        if (this.state.isPopupOpen) {
            return this.config.intervals.POPUP_OPEN;
        }
        
        // 根據播放狀態和頁面可見性決定間隔
        if (videoState.isPlaying) {
            return this.state.isPageVisible 
                ? this.config.intervals.PLAYING_VISIBLE
                : this.config.intervals.PLAYING_HIDDEN;
        } else {
            return this.state.isPageVisible
                ? this.config.intervals.PAUSED_VISIBLE
                : this.config.intervals.PAUSED_HIDDEN;
        }
    }
    
    /**
     * 更新單個影片的定時器
     */
    updateVideoTimer(videoId) {
        const newInterval = this.getDetectionInterval(videoId);
        
        // 清除舊定時器
        if (this.timers.has(videoId)) {
            clearInterval(this.timers.get(videoId));
        }
        
        // 設置新定時器
        const timer = setInterval(() => {
            this.executeVideoQualityCheck(videoId);
        }, newInterval);
        
        this.timers.set(videoId, timer);
    }
    
    /**
     * 更新所有影片的定時器
     */
    updateAllVideoTimers() {
        for (const videoId of this.state.videoStates.keys()) {
            this.updateVideoTimer(videoId);
        }
    }
    
    /**
     * 執行影片品質檢測（帶節流控制）
     */
    async executeVideoQualityCheck(videoId) {
        const videoState = this.state.videoStates.get(videoId);
        if (!videoState) return;
        
        // 檢查請求佇列，避免重複請求
        if (this.requestQueues.has(videoId)) {
            console.log(`[VideoQualityThrottling] 跳過重複請求: ${videoId}`);
            return;
        }
        
        // 記錄請求開始
        this.requestQueues.set(videoId, Date.now());
        videoState.requestCount++;
        
        const startTime = performance.now();
        
        try {
            // 執行實際的品質檢測
            await this.performQualityDetection(videoId, videoState.element);
            
        } catch (error) {
            console.error(`[VideoQualityThrottling] 品質檢測失敗:`, error);
            
        } finally {
            // 清理請求佇列並記錄性能數據
            this.requestQueues.delete(videoId);
            
            const executionTime = performance.now() - startTime;
            videoState.totalCalculationTime += executionTime;
            videoState.lastUpdate = Date.now();
            
            // 記錄性能指標
            const performanceData = this.state.performanceMetrics.get(videoId) || {
                totalTime: 0,
                requestCount: 0,
                averageTime: 0
            };
            
            performanceData.totalTime += executionTime;
            performanceData.requestCount++;
            performanceData.averageTime = performanceData.totalTime / performanceData.requestCount;
            
            this.state.performanceMetrics.set(videoId, performanceData);
            
            // 如果執行時間過長，觸發性能優化
            if (executionTime > this.config.performance.MAX_CALCULATION_TIME) {
                this.optimizePerformance();
            }
        }
    }
    
    /**
     * 執行實際的品質檢測
     */
    async performQualityDetection(videoId, videoElement) {
        // 這裡調用原有的品質檢測邏輯
        // 使用優化的幀率計算方法
        const metrics = await this.collectOptimizedMetrics(videoId, videoElement);
        
        // 發送數據到 background script
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            try {
                await chrome.runtime.sendMessage({
                    type: 'VIDEO_QUALITY_UPDATE',
                    data: {
                        videoId,
                        metrics,
                        timestamp: Date.now()
                    }
                });
            } catch (error) {
                // 忽略連接錯誤
            }
        }
    }
    
    /**
     * 收集優化的影片指標
     */
    async collectOptimizedMetrics(videoId, videoElement) {
        const metrics = {
            videoId,
            currentTime: videoElement.currentTime,
            duration: videoElement.duration,
            playbackRate: videoElement.playbackRate,
            paused: videoElement.paused,
            ended: videoElement.ended,
            buffered: this.getBufferedRanges(videoElement),
            timestamp: Date.now()
        };
        
        // 獲取播放品質（如果可用）
        if (videoElement.getVideoPlaybackQuality) {
            try {
                metrics.playbackQuality = videoElement.getVideoPlaybackQuality();
            } catch (error) {
                console.warn('[VideoQualityThrottling] 無法獲取播放品質:', error);
            }
        }
        
        // 優化的幀率計算
        metrics.frameRate = await this.calculateOptimizedFrameRate(videoId, videoElement, metrics);
        
        return metrics;
    }
    
    /**
     * 優化的幀率計算方法
     */
    async calculateOptimizedFrameRate(videoId, videoElement, currentMetrics) {
        // 使用簡化的計算方法，減少 CPU 使用
        const videoState = this.state.videoStates.get(videoId);
        if (!videoState || !videoState.lastMetrics) {
            videoState.lastMetrics = currentMetrics;
            return null;
        }
        
        const timeDiff = (currentMetrics.timestamp - videoState.lastMetrics.timestamp) / 1000;
        
        if (timeDiff < 1.0) return null; // 至少間隔1秒才計算
        
        if (currentMetrics.playbackQuality && videoState.lastMetrics.playbackQuality) {
            const frameDiff = currentMetrics.playbackQuality.totalVideoFrames - 
                             videoState.lastMetrics.playbackQuality.totalVideoFrames;
            
            if (frameDiff > 0) {
                const fps = frameDiff / timeDiff;
                if (fps >= 5 && fps <= 120) {
                    videoState.lastMetrics = currentMetrics;
                    return Math.round(fps * 10) / 10;
                }
            }
        }
        
        return null;
    }
    
    /**
     * 獲取緩衝範圍（優化版本）
     */
    getBufferedRanges(videoElement) {
        const buffered = [];
        try {
            // 限制緩衝範圍檢查數量，避免性能問題
            const maxRanges = Math.min(videoElement.buffered.length, 5);
            for (let i = 0; i < maxRanges; i++) {
                buffered.push({
                    start: videoElement.buffered.start(i),
                    end: videoElement.buffered.end(i)
                });
            }
        } catch (error) {
            // 忽略緩衝範圍獲取錯誤
        }
        return buffered;
    }
    
    /**
     * 性能優化處理
     */
    optimizePerformance() {
        console.log('[VideoQualityThrottling] 執行性能優化...');
        
        // 1. 增加檢測間隔
        for (const videoId of this.state.videoStates.keys()) {
            const currentInterval = this.getDetectionInterval(videoId);
            const optimizedInterval = Math.min(currentInterval * 1.5, 30000); // 最多30秒
            
            if (this.timers.has(videoId)) {
                clearInterval(this.timers.get(videoId));
                const timer = setInterval(() => {
                    this.executeVideoQualityCheck(videoId);
                }, optimizedInterval);
                this.timers.set(videoId, timer);
            }
        }
        
        // 2. 清理舊數據
        this.performCleanup();
        
        // 3. 記錄優化事件
        console.log(`[VideoQualityThrottling] 性能優化完成，監控 ${this.state.videoStates.size} 個影片`);
    }
    
    /**
     * 開始清理定時器
     */
    startCleanupTimer() {
        setInterval(() => {
            this.performCleanup();
        }, this.config.intervals.CLEANUP_INTERVAL);
    }
    
    /**
     * 執行數據清理
     */
    performCleanup() {
        const now = Date.now();
        const inactiveThreshold = 60000; // 60秒未更新視為不活躍
        
        // 清理不活躍的影片
        for (const [videoId, videoState] of this.state.videoStates.entries()) {
            if (now - videoState.lastUpdate > inactiveThreshold) {
                // 檢查 DOM 元素是否還存在
                if (!document.contains(videoState.element)) {
                    this.unregisterVideo(videoId);
                    console.log(`[VideoQualityThrottling] 清理已移除的影片: ${videoId}`);
                }
            }
        }
        
        this.state.lastCleanup = now;
        console.log(`[VideoQualityThrottling] 清理完成，當前監控 ${this.state.videoStates.size} 個影片`);
    }
    
    /**
     * 獲取性能統計
     */
    getPerformanceStats() {
        const stats = {
            activeVideos: this.state.videoStates.size,
            totalRequests: 0,
            averageCalculationTime: 0,
            memoryUsage: this.estimateMemoryUsage()
        };
        
        for (const [videoId, performanceData] of this.state.performanceMetrics.entries()) {
            stats.totalRequests += performanceData.requestCount;
            stats.averageCalculationTime += performanceData.averageTime;
        }
        
        if (this.state.performanceMetrics.size > 0) {
            stats.averageCalculationTime /= this.state.performanceMetrics.size;
        }
        
        return stats;
    }
    
    /**
     * 估算記憶體使用量
     */
    estimateMemoryUsage() {
        // 簡單的記憶體使用估算
        let usage = 0;
        usage += this.state.videoStates.size * 1000; // 每個影片狀態約 1KB
        usage += this.state.performanceMetrics.size * 500; // 每個性能指標約 0.5KB
        return usage;
    }
    
    /**
     * 銷毀管理器
     */
    destroy() {
        // 清理所有定時器
        for (const timer of this.timers.values()) {
            clearInterval(timer);
        }
        this.timers.clear();
        
        // 清理狀態
        this.state.videoStates.clear();
        this.state.performanceMetrics.clear();
        this.requestQueues.clear();
        
        console.log('[VideoQualityThrottling] 節流管理器已銷毀');
    }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VideoQualityThrottlingManager;
} else if (typeof window !== 'undefined') {
    window.VideoQualityThrottlingManager = VideoQualityThrottlingManager;
}