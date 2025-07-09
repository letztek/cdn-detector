// 優化的影片品質監控 Content Script
// 支援多平台：YouTube、Netflix、Twitch、Vimeo、HTML5 video
// 集成智能節流管理器

(function() {
    'use strict';
    
    // 嘗試載入節流管理器
    let throttlingManager = null;
    
    // 動態載入節流管理器
    async function loadThrottlingManager() {
        try {
            // 如果在擴展環境中，使用 chrome.runtime.getURL
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('src/core/VideoQualityThrottlingManager.js');
                script.onload = () => {
                    if (typeof VideoQualityThrottlingManager !== 'undefined') {
                        throttlingManager = new VideoQualityThrottlingManager();
                        log('節流管理器載入成功', 'info');
                        initializeWithThrottling();
                    }
                };
                script.onerror = () => {
                    log('節流管理器載入失敗，使用傳統模式', 'warn');
                    initializeTraditionalMode();
                };
                document.head.appendChild(script);
            } else {
                // 非擴展環境，直接使用傳統模式
                initializeTraditionalMode();
            }
        } catch (error) {
            log(`節流管理器載入錯誤: ${error.message}`, 'error');
            initializeTraditionalMode();
        }
    }
    
    // 平台檢測
    const PLATFORMS = {
        YOUTUBE: 'youtube',
        NETFLIX: 'netflix', 
        TWITCH: 'twitch',
        VIMEO: 'vimeo',
        HTML5: 'html5'
    };
    
    // 當前平台
    let currentPlatform = detectPlatform();
    
    // 優化的配置參數
    const CONFIG = {
        // 傳統模式配置（如果節流管理器不可用）
        TRADITIONAL: {
            UPDATE_INTERVAL: 3000,      // 增加到3秒減少負載
            MAX_ERRORS: 30,             // 減少錯誤存儲
            MAX_METRICS: 20,            // 減少指標存儲
            TRIM_TO: 10                 // 清理時保留的指標數量
        },
        
        // 通用配置
        DEBUG_MODE: false,
        PERFORMANCE_MONITORING: true
    };
    
    // 監控數據存儲（優化版本）
    let videoQualityData = {
        platform: currentPlatform,
        videos: new Map(),
        lastUpdate: Date.now(),
        errors: [],
        performanceStats: {
            totalCollections: 0,
            totalCalculationTime: 0,
            averageTime: 0
        }
    };
    
    // 日誌功能（優化版本）
    function log(message, level = 'info') {
        if (CONFIG.DEBUG_MODE) {
            console.log(`[VideoQualityMonitor] [${level.toUpperCase()}] ${message}`);
        }
        
        // 非阻塞發送日誌
        setTimeout(() => {
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
                try {
                    chrome.runtime.sendMessage({
                        type: 'VIDEO_QUALITY_LOG',
                        data: { message, level, timestamp: Date.now() }
                    }).catch(() => {});
                } catch (error) {
                    // 忽略連接錯誤
                }
            }
        }, 0);
    }
    
    // 平台檢測
    function detectPlatform() {
        const hostname = window.location.hostname.toLowerCase();
        const pageTitle = document.title || '';
        
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        } else if (hostname.includes('netflix.com')) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        } else if (hostname.includes('twitch.tv')) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        } else if (hostname.includes('vimeo.com')) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        }
        
        if (pageTitle && pageTitle.trim().length > 0) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        }
        
        return hostname || 'html5';
    }
    
    // 生成優化的視頻 ID
    function generateVideoId(videoElement) {
        if (videoElement.dataset && videoElement.dataset.videoMonitorId) {
            return videoElement.dataset.videoMonitorId;
        }
        
        const src = videoElement.src || videoElement.currentSrc || '';
        const id = videoElement.id || '';
        const className = videoElement.className || '';
        const tagName = videoElement.tagName || 'VIDEO';
        
        // 使用更簡單的 ID 生成方式
        const hash = src + id + className;
        const stableId = `${currentPlatform}_${tagName}_${btoa(hash).substring(0, 8)}`;
        
        if (videoElement.dataset) {
            videoElement.dataset.videoMonitorId = stableId;
        }
        
        return stableId;
    }
    
    // 優化的指標收集
    async function collectOptimizedVideoMetrics(videoElement) {
        const startTime = performance.now();
        const videoId = generateVideoId(videoElement);
        
        try {
            const metrics = {
                videoId,
                currentTime: videoElement.currentTime,
                duration: videoElement.duration,
                playbackRate: videoElement.playbackRate,
                paused: videoElement.paused,
                ended: videoElement.ended,
                readyState: videoElement.readyState,
                networkState: videoElement.networkState,
                timestamp: Date.now(),
                
                // 簡化的緩衝範圍檢查
                buffered: getOptimizedBufferedRanges(videoElement),
                
                // 基本視頻屬性
                videoWidth: videoElement.videoWidth,
                videoHeight: videoElement.videoHeight,
                volume: videoElement.volume,
                muted: videoElement.muted
            };
            
            // 獲取播放品質（如果可用）
            if (videoElement.getVideoPlaybackQuality) {
                try {
                    metrics.playbackQuality = videoElement.getVideoPlaybackQuality();
                } catch (error) {
                    // 忽略播放品質獲取錯誤
                }
            }
            
            // 簡化的幀率計算
            metrics.frameRate = calculateSimplifiedFrameRate(videoId, metrics);
            
            // 更新性能統計
            const executionTime = performance.now() - startTime;
            updatePerformanceStats(executionTime);
            
            return metrics;
            
        } catch (error) {
            log(`指標收集錯誤: ${error.message}`, 'error');
            return null;
        }
    }
    
    // 優化的緩衝範圍獲取
    function getOptimizedBufferedRanges(videoElement) {
        try {
            const buffered = [];
            const maxRanges = Math.min(videoElement.buffered.length, 3); // 限制為3個範圍
            
            for (let i = 0; i < maxRanges; i++) {
                buffered.push({
                    start: Math.round(videoElement.buffered.start(i) * 10) / 10,
                    end: Math.round(videoElement.buffered.end(i) * 10) / 10
                });
            }
            
            return buffered;
        } catch (error) {
            return [];
        }
    }
    
    // 簡化的幀率計算
    function calculateSimplifiedFrameRate(videoId, currentMetrics) {
        const videoData = videoQualityData.videos.get(videoId);
        
        if (!videoData || !videoData.lastMetrics) {
            return null;
        }
        
        const timeDiff = (currentMetrics.timestamp - videoData.lastMetrics.timestamp) / 1000;
        
        if (timeDiff < 2.0) return videoData.lastFrameRate; // 至少2秒間隔
        
        if (currentMetrics.playbackQuality && videoData.lastMetrics.playbackQuality) {
            const frameDiff = currentMetrics.playbackQuality.totalVideoFrames - 
                             videoData.lastMetrics.playbackQuality.totalVideoFrames;
            
            if (frameDiff > 0) {
                const fps = frameDiff / timeDiff;
                if (fps >= 5 && fps <= 120) {
                    videoData.lastFrameRate = Math.round(fps);
                    return videoData.lastFrameRate;
                }
            }
        }
        
        return videoData.lastFrameRate || null;
    }
    
    // 更新性能統計
    function updatePerformanceStats(executionTime) {
        const stats = videoQualityData.performanceStats;
        stats.totalCollections++;
        stats.totalCalculationTime += executionTime;
        stats.averageTime = stats.totalCalculationTime / stats.totalCollections;
        
        // 如果平均執行時間過長，記錄警告
        if (stats.averageTime > 20) {
            log(`性能警告: 平均執行時間 ${stats.averageTime.toFixed(2)}ms`, 'warn');
        }
    }
    
    // 使用節流管理器的初始化
    function initializeWithThrottling() {
        log('使用智能節流管理器模式', 'info');
        
        // 檢測 popup 狀態變化
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'POPUP_STATE_CHANGE' && throttlingManager) {
                throttlingManager.setPopupState(message.isOpen);
            }
        });
        
        // 開始監控視頻
        startVideoMonitoring();
    }
    
    // 傳統模式初始化
    function initializeTraditionalMode() {
        log('使用傳統節流模式', 'info');
        
        // 使用固定間隔監控
        setInterval(() => {
            startVideoMonitoring();
        }, CONFIG.TRADITIONAL.UPDATE_INTERVAL);
    }
    
    // 開始視頻監控
    function startVideoMonitoring() {
        const videos = document.querySelectorAll('video');
        
        videos.forEach(async (videoElement) => {
            const videoId = generateVideoId(videoElement);
            
            // 使用節流管理器或傳統模式
            if (throttlingManager) {
                // 註冊到節流管理器
                throttlingManager.registerVideo(videoId, videoElement);
                
                // 監聽播放狀態變化
                const updatePlayingState = () => {
                    throttlingManager.updateVideoState(videoId, !videoElement.paused);
                };
                
                videoElement.addEventListener('play', updatePlayingState);
                videoElement.addEventListener('pause', updatePlayingState);
            } else {
                // 傳統模式：直接收集指標
                const metrics = await collectOptimizedVideoMetrics(videoElement);
                if (metrics) {
                    updateVideoData(videoId, metrics);
                    sendVideoDataToBackground(videoId, metrics);
                }
            }
        });
        
        // 清理不存在的視頻
        performVideoCleanup();
    }
    
    // 更新視頻數據
    function updateVideoData(videoId, metrics) {
        let videoData = videoQualityData.videos.get(videoId);
        
        if (!videoData) {
            videoData = {
                metrics: [],
                lastMetrics: null,
                lastFrameRate: null,
                errors: []
            };
            videoQualityData.videos.set(videoId, videoData);
        }
        
        // 添加新指標並限制數量
        videoData.metrics.push(metrics);
        if (videoData.metrics.length > CONFIG.TRADITIONAL.MAX_METRICS) {
            videoData.metrics = videoData.metrics.slice(-CONFIG.TRADITIONAL.TRIM_TO);
        }
        
        videoData.lastMetrics = metrics;
        videoQualityData.lastUpdate = Date.now();
    }
    
    // 發送數據到背景腳本
    async function sendVideoDataToBackground(videoId, metrics) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            try {
                await chrome.runtime.sendMessage({
                    type: 'VIDEO_QUALITY_UPDATE',
                    data: {
                        videoId,
                        metrics,
                        platform: currentPlatform,
                        timestamp: Date.now()
                    }
                });
            } catch (error) {
                // 忽略連接錯誤
            }
        }
    }
    
    // 清理不存在的視頻
    function performVideoCleanup() {
        const currentVideos = new Set();
        document.querySelectorAll('video').forEach(video => {
            currentVideos.add(generateVideoId(video));
        });
        
        // 移除不存在的視頻數據
        for (const videoId of videoQualityData.videos.keys()) {
            if (!currentVideos.has(videoId)) {
                videoQualityData.videos.delete(videoId);
                if (throttlingManager) {
                    throttlingManager.unregisterVideo(videoId);
                }
            }
        }
    }
    
    // 錯誤處理
    window.addEventListener('error', (event) => {
        if (event.error && event.error.message.includes('VideoQuality')) {
            log(`腳本錯誤: ${event.error.message}`, 'error');
        }
    });
    
    // 頁面卸載時清理
    window.addEventListener('beforeunload', () => {
        if (throttlingManager) {
            throttlingManager.destroy();
        }
    });
    
    // 外部 API
    window.VideoQualityMonitor = {
        getData: () => videoQualityData,
        getPerformanceStats: () => throttlingManager ? 
            throttlingManager.getPerformanceStats() : 
            videoQualityData.performanceStats,
        forceUpdate: startVideoMonitoring,
        setDebugMode: (enabled) => {
            CONFIG.DEBUG_MODE = enabled;
        }
    };
    
    // 初始化
    log('影片品質監控器啟動', 'info');
    
    // 等待 DOM 載入後開始
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadThrottlingManager);
    } else {
        loadThrottlingManager();
    }
    
    // 使用 MutationObserver 監控新增的視頻
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'VIDEO' || node.querySelector('video')) {
                        setTimeout(startVideoMonitoring, 500); // 延遲執行避免過於頻繁
                    }
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
})();