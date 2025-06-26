// 影片品質監控 Content Script
// 支援多平台：YouTube、Netflix、Twitch、Vimeo、HTML5 video

(function() {
    'use strict';
    
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
    
    // 監控數據存儲
    let videoQualityData = {
        platform: currentPlatform,
        videos: new Map(),
        lastUpdate: Date.now(),
        errors: []
    };
    
    // 配置參數
    const CONFIG = {
        UPDATE_INTERVAL: 3000, // 3秒更新間隔
        MAX_ERRORS: 50,
        DEBUG_MODE: true
    };
    
    // 日誌功能
    function log(message, level = 'info') {
        if (CONFIG.DEBUG_MODE) {
            console.log(`[Video Quality Monitor] [${level.toUpperCase()}] ${message}`);
        }
        
        // 發送日誌到 background script
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            try {
                chrome.runtime.sendMessage({
                    type: 'VIDEO_QUALITY_LOG',
                    data: { message, level, timestamp: Date.now() }
                }).catch(() => {}); // 忽略連接錯誤
            } catch (error) {
                // 忽略擴展上下文失效的錯誤
            }
        }
    }
    
    // 平台檢測
    function detectPlatform() {
        const hostname = window.location.hostname.toLowerCase();
        
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            return PLATFORMS.YOUTUBE;
        } else if (hostname.includes('netflix.com')) {
            return PLATFORMS.NETFLIX;
        } else if (hostname.includes('twitch.tv')) {
            return PLATFORMS.TWITCH;
        } else if (hostname.includes('vimeo.com')) {
            return PLATFORMS.VIMEO;
        }
        
        return PLATFORMS.HTML5;
    }
    
    // 生成唯一 ID
    function generateVideoId(videoElement) {
        const src = videoElement.src || videoElement.currentSrc || '';
        const id = videoElement.id || '';
        const className = videoElement.className || '';
        return `${currentPlatform}_${Date.now()}_${btoa(src + id + className).substring(0, 10)}`;
    }
    
    // 視頻品質數據收集
    function collectVideoQualityMetrics(videoElement, videoId) {
        try {
            const metrics = {
                id: videoId,
                platform: currentPlatform,
                timestamp: Date.now(),
                
                // 基本屬性
                src: videoElement.src || videoElement.currentSrc || '',
                duration: videoElement.duration || 0,
                currentTime: videoElement.currentTime || 0,
                paused: videoElement.paused,
                ended: videoElement.ended,
                
                // 品質指標
                videoWidth: videoElement.videoWidth || 0,
                videoHeight: videoElement.videoHeight || 0,
                
                // 網路狀態
                networkState: videoElement.networkState,
                readyState: videoElement.readyState,
                
                // 緩衝範圍
                buffered: [],
                
                // 播放品質 (如果可用)
                playbackQuality: null,
                
                // 錯誤資訊
                error: videoElement.error ? {
                    code: videoElement.error.code,
                    message: videoElement.error.message
                } : null
            };
            
            // 收集緩衝範圍資訊
            if (videoElement.buffered) {
                for (let i = 0; i < videoElement.buffered.length; i++) {
                    metrics.buffered.push({
                        start: videoElement.buffered.start(i),
                        end: videoElement.buffered.end(i)
                    });
                }
            }
            
            // 收集播放品質資訊 (如果支援 getVideoPlaybackQuality)
            if (videoElement.getVideoPlaybackQuality) {
                const quality = videoElement.getVideoPlaybackQuality();
                metrics.playbackQuality = {
                    droppedVideoFrames: quality.droppedVideoFrames || 0,
                    totalVideoFrames: quality.totalVideoFrames || 0,
                    corruptedVideoFrames: quality.corruptedVideoFrames || 0,
                    creationTime: quality.creationTime || 0
                };
            }
            
            // 平台特定數據收集
            metrics.platformSpecific = collectPlatformSpecificData(videoElement);
            
            return metrics;
            
        } catch (error) {
            log(`Error collecting metrics for video ${videoId}: ${error.message}`, 'error');
            return null;
        }
    }
    
    // 平台特定數據收集
    function collectPlatformSpecificData(videoElement) {
        const data = {};
        
        try {
            switch (currentPlatform) {
                case PLATFORMS.YOUTUBE:
                    // YouTube 特定數據
                    if (window.ytInitialPlayerResponse) {
                        data.ytPlayerResponse = {
                            videoDetails: window.ytInitialPlayerResponse.videoDetails ? {
                                videoId: window.ytInitialPlayerResponse.videoDetails.videoId,
                                title: window.ytInitialPlayerResponse.videoDetails.title
                            } : null
                        };
                    }
                    
                    // YouTube 實驗標誌 (如果可用)
                    if (window.yt && window.yt.config_ && window.yt.config_.EXPERIMENT_FLAGS) {
                        data.experimentFlags = Object.keys(window.yt.config_.EXPERIMENT_FLAGS).slice(0, 10); // 限制數量
                    }
                    break;
                    
                case PLATFORMS.NETFLIX:
                    // Netflix 可能有內部播放器狀態
                    data.netflixSpecific = {
                        hasMediaSource: !!window.MediaSource,
                        userAgent: navigator.userAgent
                    };
                    break;
                    
                case PLATFORMS.TWITCH:
                    // Twitch 特定檢查
                    data.twitchSpecific = {
                        hasPlayerAPI: !!window.Twitch
                    };
                    break;
                    
                case PLATFORMS.VIMEO:
                    // Vimeo 特定檢查
                    data.vimeoSpecific = {
                        hasVimeoPlayer: !!window.Vimeo
                    };
                    break;
            }
        } catch (error) {
            log(`Error collecting platform-specific data: ${error.message}`, 'error');
        }
        
        return data;
    }
    
    // 監控單個視頻元素
    function monitorVideoElement(videoElement) {
        const videoId = generateVideoId(videoElement);
        
        if (videoQualityData.videos.has(videoId)) {
            return; // 已經在監控中
        }
        
        log(`開始監控視頻元素: ${videoId}`);
        
        // 初始化視頻數據
        const videoData = {
            element: videoElement,
            id: videoId,
            startTime: Date.now(),
            metrics: [],
            events: [],
            active: true
        };
        
        videoQualityData.videos.set(videoId, videoData);
        
        // 事件監聽器
        const events = [
            'loadstart', 'loadeddata', 'loadedmetadata', 'canplay', 'canplaythrough',
            'play', 'pause', 'seeking', 'seeked', 'waiting', 'playing',
            'timeupdate', 'ended', 'error', 'stalled', 'suspend', 'abort',
            'emptied', 'ratechange', 'volumechange'
        ];
        
        const eventHandlers = {};
        
        events.forEach(eventName => {
            const handler = function(event) {
                try {
                    const eventData = {
                        type: eventName,
                        timestamp: Date.now(),
                        currentTime: videoElement.currentTime,
                        duration: videoElement.duration,
                        readyState: videoElement.readyState,
                        networkState: videoElement.networkState
                    };
                    
                    videoData.events.push(eventData);
                    
                    // 限制事件數量
                    if (videoData.events.length > 1000) {
                        videoData.events = videoData.events.slice(-500);
                    }
                    
                    log(`視頻事件 ${eventName} - ${videoId}`);
                    
                } catch (error) {
                    log(`Error handling ${eventName} event: ${error.message}`, 'error');
                }
            };
            
            eventHandlers[eventName] = handler;
            videoElement.addEventListener(eventName, handler, { passive: true });
        });
        
        // 保存事件處理器引用以便後續清理
        videoData.eventHandlers = eventHandlers;
        
        // 定期收集指標
        const metricsInterval = setInterval(() => {
            if (!videoData.active || !document.contains(videoElement)) {
                clearInterval(metricsInterval);
                cleanupVideoMonitoring(videoId);
                return;
            }
            
            const metrics = collectVideoQualityMetrics(videoElement, videoId);
            if (metrics) {
                videoData.metrics.push(metrics);
                
                // 限制指標數量
                if (videoData.metrics.length > 200) {
                    videoData.metrics = videoData.metrics.slice(-100);
                }
            }
        }, CONFIG.UPDATE_INTERVAL);
        
        videoData.metricsInterval = metricsInterval;
    }
    
    // 清理視頻監控
    function cleanupVideoMonitoring(videoId) {
        const videoData = videoQualityData.videos.get(videoId);
        if (!videoData) return;
        
        log(`清理視頻監控: ${videoId}`);
        
        // 移除事件監聽器
        if (videoData.eventHandlers && videoData.element) {
            Object.entries(videoData.eventHandlers).forEach(([eventName, handler]) => {
                try {
                    videoData.element.removeEventListener(eventName, handler);
                } catch (error) {
                    log(`Error removing ${eventName} listener: ${error.message}`, 'error');
                }
            });
        }
        
        // 清理定時器
        if (videoData.metricsInterval) {
            clearInterval(videoData.metricsInterval);
        }
        
        // 標記為非活躍
        videoData.active = false;
        
        // 可選：完全移除 (或者保留用於歷史分析)
        // videoQualityData.videos.delete(videoId);
    }
    
    // 找到所有視頻元素
    function findAllVideoElements() {
        const videos = [];
        const foundElements = new Set(); // 防止重複
        
        log('Starting comprehensive video element search...', 'info');
        log(`Current URL: ${window.location.href}`, 'debug');
        log(`Document ready state: ${document.readyState}`, 'debug');
        
        // 方法1：標準 HTML5 video 元素
        const htmlVideos = document.querySelectorAll('video');
        log(`Method 1 - Standard HTML5 videos: ${htmlVideos.length}`, 'debug');
        htmlVideos.forEach((video, index) => {
            if (!foundElements.has(video)) {
                foundElements.add(video);
                videos.push(video);
                log(`  Video ${index + 1}: ${video.tagName} - src: ${video.src || video.currentSrc || 'no src'} - dimensions: ${video.videoWidth || 0}x${video.videoHeight || 0}`, 'debug');
            }
        });
        
        // 方法2：查找嵌入在 iframe 中的視頻
        const iframes = document.querySelectorAll('iframe');
        log(`Method 2 - Checking ${iframes.length} iframes`, 'debug');
        iframes.forEach((iframe, index) => {
            try {
                log(`  Iframe ${index + 1}: src=${iframe.src}`, 'debug');
                if (iframe.contentDocument) {
                    const iframeVideos = iframe.contentDocument.querySelectorAll('video');
                    log(`    Found ${iframeVideos.length} videos in iframe`, 'debug');
                    iframeVideos.forEach(video => {
                        if (!foundElements.has(video)) {
                            foundElements.add(video);
                            videos.push(video);
                        }
                    });
                } else {
                    log(`    Cannot access iframe content (cross-origin)`, 'debug');
                }
            } catch (e) {
                log(`    Error accessing iframe: ${e.message}`, 'debug');
            }
        });
        
        // 方法3：查找 object 和 embed 元素
        const objects = document.querySelectorAll('object, embed');
        log(`Method 3 - Checking ${objects.length} object/embed elements`, 'debug');
        objects.forEach((obj, index) => {
            log(`  Object/Embed ${index + 1}: type=${obj.type || 'no type'} data=${obj.data || 'no data'}`, 'debug');
            if (obj.type && (obj.type.includes('video') || obj.type.includes('application/x-shockwave-flash'))) {
                if (!foundElements.has(obj)) {
                    foundElements.add(obj);
                    videos.push(obj);
                    log(`    Added as video element`, 'debug');
                }
            }
        });
        
        // 方法4：教育網站特殊檢測
        const educationalSelectors = [
            // 通用視頻容器
            '[class*="video"]', '[id*="video"]',
            '[class*="player"]', '[id*="player"]',
            '[class*="media"]', '[id*="media"]',
            
            // 教育平台特定
            '[class*="jwplayer"]', '[id*="jwplayer"]',
            '[class*="flowplayer"]', '[id*="flowplayer"]',
            '[class*="videojs"]', '[id*="videojs"]',
            
            // 可能的視頻容器
            '.video-container', '.media-container', '.player-container',
            '.video-wrapper', '.media-wrapper', '.player-wrapper',
            
            // 數據屬性
            '[data-video]', '[data-player]', '[data-media]',
            '[data-video-id]', '[data-player-id]'
        ];
        
        log(`Method 4 - Checking educational video selectors`, 'debug');
        educationalSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    log(`  Selector "${selector}": ${elements.length} elements`, 'debug');
                }
                
                elements.forEach((element, index) => {
                    // 檢查元素本身是否是視頻
                    if (element.tagName === 'VIDEO' && !foundElements.has(element)) {
                        foundElements.add(element);
                        videos.push(element);
                        log(`    Direct video element found`, 'debug');
                        return;
                    }
                    
                    // 檢查是否包含視頻內容
                    const childVideos = element.querySelectorAll('video, object[type*="video"], embed[type*="video"]');
                    if (childVideos.length > 0) {
                        log(`    Found ${childVideos.length} child videos in container`, 'debug');
                        childVideos.forEach(childVideo => {
                            if (!foundElements.has(childVideo)) {
                                foundElements.add(childVideo);
                                videos.push(childVideo);
                            }
                        });
                    }
                    
                    // 檢查是否有視頻相關屬性但沒有找到實際視頻元素
                    if (childVideos.length === 0) {
                        const hasVideoAttributes = element.hasAttribute('data-video') || 
                                                 element.hasAttribute('data-player') ||
                                                 element.className.toLowerCase().includes('video') ||
                                                 element.id.toLowerCase().includes('video');
                        
                        if (hasVideoAttributes) {
                            log(`    Video container detected but no actual video element found: ${element.tagName}.${element.className}#${element.id}`, 'debug');
                        }
                    }
                });
            } catch (e) {
                log(`Error checking selector ${selector}: ${e.message}`, 'debug');
            }
        });
        
        // 方法5：動態內容檢測（針對 JavaScript 載入的視頻）
        log(`Method 5 - Checking for dynamically loaded content`, 'debug');
        setTimeout(() => {
            const delayedVideos = document.querySelectorAll('video');
            const newVideosFound = delayedVideos.length - htmlVideos.length;
            if (newVideosFound > 0) {
                log(`Found ${newVideosFound} additional videos after delay`, 'info');
                delayedVideos.forEach(video => {
                    if (!foundElements.has(video)) {
                        foundElements.add(video);
                        videos.push(video);
                        monitorVideoElement(video);
                    }
                });
                sendVideoQualityUpdate();
            }
        }, 3000);
        
        // 最終報告
        log(`=== Video Detection Summary ===`, 'info');
        log(`Total video elements found: ${videos.length}`, 'info');
        
        videos.forEach((video, index) => {
            const info = {
                index: index + 1,
                tag: video.tagName,
                src: video.src || video.currentSrc || video.data || 'no src',
                id: video.id || 'no id',
                className: video.className || 'no class',
                dimensions: `${video.videoWidth || 0}x${video.videoHeight || 0}`,
                readyState: video.readyState !== undefined ? video.readyState : 'N/A',
                networkState: video.networkState !== undefined ? video.networkState : 'N/A'
            };
            
            log(`Video ${info.index}: ${info.tag} | src: ${info.src.substring(0, 80)}${info.src.length > 80 ? '...' : ''} | id: ${info.id} | class: ${info.className} | size: ${info.dimensions}`, 'info');
        });
        
        if (videos.length === 0) {
            log('No video elements detected. This might be due to:', 'warn');
            log('1. Videos are loaded dynamically after page load', 'warn');
            log('2. Videos are in cross-origin iframes', 'warn');
            log('3. Custom video players not using standard HTML5 video tags', 'warn');
            log('4. Page content is still loading', 'warn');
        }
        
        return videos;
    }
    
    // 增強的視頻監控初始化
    function initializeVideoMonitoring(retryCount = 0) {
        log(`Initializing video monitoring (attempt ${retryCount + 1})`, 'info');
        
        // 等待頁面完全載入
        if (document.readyState !== 'complete') {
            log('Page not fully loaded, waiting...', 'debug');
            setTimeout(() => initializeVideoMonitoring(retryCount), 1000);
            return;
        }
        
        const videos = findAllVideoElements();
        
        if (videos.length === 0) {
            log('No video elements found, setting up mutation observer', 'info');
            setupMutationObserver();
            
            // 重試機制
            if (retryCount < 5) {
                setTimeout(() => initializeVideoMonitoring(retryCount + 1), 2000);
            }
        } else {
            log(`Starting monitoring for ${videos.length} video elements`, 'info');
            videos.forEach(video => {
                monitorVideoElement(video);
            });
            setupMutationObserver();
            
            // 啟動定期數據更新
            startPeriodicUpdates();
        }
        
        // 設置通信
        setupBackgroundCommunication();
        
        // 發送初始化完成消息
        sendVideoQualityUpdate();
    }
    
    // 增強的監控變化觀察器
    function setupMutationObserver() {
        if (typeof MutationObserver === 'undefined') {
            log('MutationObserver not supported', 'warn');
            return;
        }
        
        const observer = new MutationObserver((mutations) => {
            let foundNewVideos = false;
            
            mutations.forEach((mutation) => {
                // 檢查新增的節點
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 檢查是否是視頻元素
                        if (node.tagName === 'VIDEO' || node.tagName === 'OBJECT' || node.tagName === 'EMBED') {
                            log(`New video element detected: ${node.tagName}`, 'info');
                            monitorVideoElement(node);
                            foundNewVideos = true;
                        }
                        
                        // 檢查子元素中是否有視頻
                        const childVideos = node.querySelectorAll ? node.querySelectorAll('video, object[type*="video"], embed[type*="video"]') : [];
                        if (childVideos.length > 0) {
                            log(`Found ${childVideos.length} video elements in new content`, 'info');
                            childVideos.forEach(video => {
                                monitorVideoElement(video);
                                foundNewVideos = true;
                            });
                        }
                    }
                });
            });
            
            if (foundNewVideos) {
                sendVideoQualityUpdate();
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'currentSrc']
        });
        
        log('MutationObserver setup complete', 'debug');
    }
    
    // 啟動定期更新
    function startPeriodicUpdates() {
        if (window.videoQualityUpdateInterval) {
            clearInterval(window.videoQualityUpdateInterval);
        }
        
        window.videoQualityUpdateInterval = setInterval(() => {
            if (videoQualityData.videos.size > 0) {
                sendVideoQualityUpdate();
                cleanupInactiveMonitoring();
            }
        }, CONFIG.UPDATE_INTERVAL);
        
        log('Periodic updates started', 'debug');
    }
    
    // 設置與 background script 的通信
    function setupBackgroundCommunication() {
        // 監聽來自 background script 的消息
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                try {
                    switch (message.type) {
                        case 'GET_VIDEO_QUALITY_DATA':
                            sendResponse({
                                success: true,
                                data: getVideoQualityDataForBackground()
                            });
                            break;
                            
                        case 'CLEAR_VIDEO_QUALITY_DATA':
                            clearAllVideoData();
                            sendResponse({ success: true });
                            break;
                            
                        case 'GET_VIDEO_COUNT':
                            sendResponse({
                                success: true,
                                count: videoQualityData.videos.size
                            });
                            break;
                            
                        default:
                            sendResponse({ success: false, error: 'Unknown message type' });
                    }
                } catch (error) {
                    log(`Error handling message: ${error.message}`, 'error');
                    sendResponse({ success: false, error: error.message });
                }
                
                return true; // 保持消息通道開放
            });
        }
        
        // 定期向 background script 發送更新
        setInterval(() => {
            sendVideoQualityUpdate();
        }, 5000); // 5秒發送一次更新
    }
    
    // 獲取用於背景腳本的視頻品質數據
    function getVideoQualityDataForBackground() {
        const data = {
            platform: currentPlatform,
            url: window.location.href,
            timestamp: Date.now(),
            totalVideos: videoQualityData.videos.size,
            activeVideos: 0,
            videos: []
        };
        
        videoQualityData.videos.forEach((videoData, videoId) => {
            if (videoData.active) {
                data.activeVideos++;
            }
            
            // 只發送最新的指標和事件
            const latestMetrics = videoData.metrics.slice(-5); // 最新 5 個指標
            const recentEvents = videoData.events.slice(-20); // 最近 20 個事件
            
            data.videos.push({
                id: videoId,
                active: videoData.active,
                startTime: videoData.startTime,
                metricsCount: videoData.metrics.length,
                eventsCount: videoData.events.length,
                latestMetrics: latestMetrics,
                recentEvents: recentEvents
            });
        });
        
        return data;
    }
    
    // 發送視頻品質更新到 background script
    function sendVideoQualityUpdate() {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            try {
                const data = getVideoQualityDataForBackground();
                
                chrome.runtime.sendMessage({
                    type: 'VIDEO_QUALITY_UPDATE',
                    data: data
                }).catch(error => {
                    // 連接可能已斷開，這是正常的
                    if (error.message && !error.message.includes('Extension context invalidated')) {
                        log(`Failed to send update: ${error.message}`, 'debug');
                    }
                });
            } catch (error) {
                // 擴展上下文可能已失效
                if (!error.message || !error.message.includes('Extension context invalidated')) {
                    log(`Error in sendVideoQualityUpdate: ${error.message}`, 'debug');
                }
            }
        }
    }
    
    // 清理無效的監控
    function cleanupInactiveMonitoring() {
        const toRemove = [];
        
        videoQualityData.videos.forEach((videoData, videoId) => {
            if (!videoData.active || !document.contains(videoData.element)) {
                toRemove.push(videoId);
            }
        });
        
        toRemove.forEach(videoId => {
            cleanupVideoMonitoring(videoId);
        });
        
        if (toRemove.length > 0) {
            log(`清理了 ${toRemove.length} 個無效的視頻監控`);
        }
    }
    
    // 清除所有視頻數據
    function clearAllVideoData() {
        videoQualityData.videos.forEach((videoData, videoId) => {
            cleanupVideoMonitoring(videoId);
        });
        
        videoQualityData.videos.clear();
        videoQualityData.errors = [];
        videoQualityData.lastUpdate = Date.now();
        
        log('已清除所有視頻品質數據');
    }
    
    // 錯誤處理
    window.addEventListener('error', (event) => {
        if (event.filename && event.filename.includes('video-quality-monitor')) {
            const error = {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: Date.now()
            };
            
            videoQualityData.errors.push(error);
            
            if (videoQualityData.errors.length > CONFIG.MAX_ERRORS) {
                videoQualityData.errors = videoQualityData.errors.slice(-25);
            }
            
            log(`JavaScript Error: ${event.message}`, 'error');
        }
    });
    
    // 頁面可見性變化處理
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            log('頁面變為隱藏狀態');
        } else {
            log('頁面變為可見狀態');
            // 重新檢查視頻元素
            setTimeout(() => {
                const videoElements = findAllVideoElements();
                videoElements.forEach(videoElement => {
                    if (!Array.from(videoQualityData.videos.values()).some(data => data.element === videoElement)) {
                        monitorVideoElement(videoElement);
                    }
                });
            }, 1000);
        }
    });
    
    // 頁面卸載清理
    window.addEventListener('beforeunload', () => {
        log('頁面即將卸載，清理視頻監控');
        clearAllVideoData();
    });
    
    // 等待 DOM 準備就緒後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeVideoMonitoring, 1000); // 延遲 1 秒確保頁面載入完成
        });
    } else {
        // DOM 已經準備就緒
        setTimeout(initializeVideoMonitoring, 1000);
    }
    
    // 對於 SPA，也監聽 URL 變化
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            log('URL 變化檢測到，重新初始化監控');
            
            // 清理現有監控
            clearAllVideoData();
            
            // 重新檢測平台
            currentPlatform = detectPlatform();
            videoQualityData.platform = currentPlatform;
            
            // 延遲重新初始化
            setTimeout(initializeVideoMonitoring, 2000);
        }
    }).observe(document, { subtree: true, childList: true });
    
    log(`視頻品質監控已載入 - 平台: ${currentPlatform}`);
    
    // 向background script報告載入狀態
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        try {
            chrome.runtime.sendMessage({
                type: 'VIDEO_QUALITY_LOG',
                data: {
                    message: `Video quality monitor loaded on ${window.location.href} - Platform: ${currentPlatform}`,
                    level: 'info'
                }
            }).then(() => {
                console.log('Successfully reported load status to background script');
            }).catch(error => {
                if (!error.message || !error.message.includes('Extension context invalidated')) {
                    console.log('Failed to send load status:', error);
                }
            });
        } catch (error) {
            // 忽略擴展上下文失效的錯誤
            if (!error.message || !error.message.includes('Extension context invalidated')) {
                console.log('Error sending load status:', error);
            }
        }
    }
    
    // 立即檢查是否有影片元素
    const initialVideoElements = findAllVideoElements();
    log(`初始載入時發現 ${initialVideoElements.length} 個影片元素`);
    
    // 額外的調試信息
    log(`頁面準備狀態: ${document.readyState}`);
    log(`當前URL: ${window.location.href}`);
    log(`Chrome runtime 可用: ${typeof chrome !== 'undefined' && !!chrome.runtime}`);
    
})(); 