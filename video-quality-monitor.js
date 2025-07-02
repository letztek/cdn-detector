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
        UPDATE_INTERVAL: 2000, // 2秒更新間隔，減少對播放的影響
        MAX_ERRORS: 50,
        DEBUG_MODE: false // 關閉調試模式以減少控制台輸出
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
        const pageTitle = document.title || '';
        
        // 檢測主要影片平台
        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        } else if (hostname.includes('netflix.com')) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        } else if (hostname.includes('twitch.tv')) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        } else if (hostname.includes('vimeo.com')) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        }
        
        // 對於其他網站，返回域名和頁面標題的組合
        if (pageTitle && pageTitle.trim().length > 0) {
            return `${hostname} (${pageTitle.substring(0, 50)}${pageTitle.length > 50 ? '...' : ''})`;
        }
        
        return hostname || 'html5';
    }
    
    // 生成唯一 ID
    function generateVideoId(videoElement) {
        // 如果已經有保存的 ID，直接返回
        if (videoElement.dataset && videoElement.dataset.videoMonitorId) {
            return videoElement.dataset.videoMonitorId;
        }
        
        // 生成穩定的 ID（基於視頻的穩定屬性）
        const src = videoElement.src || videoElement.currentSrc || '';
        const id = videoElement.id || '';
        const className = videoElement.className || '';
        const tagName = videoElement.tagName || 'VIDEO';
        
        // 創建穩定的 ID（移除 Date.now()）
        const stableId = `${currentPlatform}_${tagName}_${btoa(src + id + className).substring(0, 10)}`;
        
        // 保存 ID 到視頻元素上，確保後續使用相同的 ID
        if (videoElement.dataset) {
            videoElement.dataset.videoMonitorId = stableId;
        }
        
        log(`生成穩定視頻ID: ${stableId}`);
        return stableId;
    }
    
    // DRM 偵測函數
    function detectDRMProtection(videoElement) {
        const drmInfo = {
            isProtected: false,
            systems: [],
            keySystem: null,
            mediaKeys: null,
            mpdInfo: null,
            detectionMethods: []
        };
        
        try {
            // 方法1: 檢查 MediaKeys API
            if (videoElement.mediaKeys) {
                drmInfo.isProtected = true;
                drmInfo.mediaKeys = {
                    keySystem: videoElement.mediaKeys.keySystem || 'Unknown'
                };
                drmInfo.keySystem = videoElement.mediaKeys.keySystem;
                drmInfo.detectionMethods.push('MediaKeys API');
                
                // 識別 DRM 系統
                if (drmInfo.keySystem) {
                    if (drmInfo.keySystem.includes('widevine')) {
                        drmInfo.systems.push('Widevine');
                    } else if (drmInfo.keySystem.includes('playready')) {
                        drmInfo.systems.push('PlayReady');
                    } else if (drmInfo.keySystem.includes('fairplay')) {
                        drmInfo.systems.push('FairPlay');
                    } else if (drmInfo.keySystem.includes('clearkey')) {
                        drmInfo.systems.push('ClearKey');
                    }
                }
                
                log(`DRM 偵測 (MediaKeys): ${drmInfo.keySystem}`, 'info');
            }
            
            // 方法2: 監聽 encrypted 事件
            if (!drmInfo.isProtected) {
                const handleEncrypted = (event) => {
                    drmInfo.isProtected = true;
                    drmInfo.detectionMethods.push('Encrypted Event');
                    if (event.initDataType) {
                        drmInfo.initDataType = event.initDataType;
                    }
                    log(`DRM 偵測 (Encrypted Event): ${event.initDataType || 'Unknown'}`, 'info');
                };
                
                // 檢查是否已經有 encrypted 事件監聽器
                if (!videoElement.hasAttribute('data-drm-listener')) {
                    videoElement.addEventListener('encrypted', handleEncrypted, { once: true });
                    videoElement.setAttribute('data-drm-listener', 'true');
                }
            }
            
            // 方法3: 檢查 EME 支援
            if (navigator.requestMediaKeySystemAccess) {
                drmInfo.detectionMethods.push('EME Support Check');
                
                // 檢查常見的 DRM 系統
                const keySystems = [
                    'com.widevine.alpha',
                    'com.microsoft.playready',
                    'com.apple.fps.1_0',
                    'org.w3.clearkey'
                ];
                
                // 嘗試檢測支援的 DRM 系統
                keySystems.forEach(keySystem => {
                    try {
                        const testConfig = [{
                            initDataTypes: ['cenc'],
                            videoCapabilities: [{
                                contentType: 'video/mp4; codecs="avc1.42E01E"',
                                robustness: 'SW_SECURE_CRYPTO'
                            }],
                            audioCapabilities: [{
                                contentType: 'audio/mp4; codecs="mp4a.40.2"',
                                robustness: 'SW_SECURE_CRYPTO'
                            }]
                        }];
                        
                        navigator.requestMediaKeySystemAccess(keySystem, testConfig)
                            .then(() => {
                                // 系統支援此 DRM
                                const systemName = getDRMSystemName(keySystem);
                                if (!drmInfo.systems.includes(systemName)) {
                                    drmInfo.systems.push(systemName);
                                    log(`DRM 系統支援確認: ${systemName}`, 'info');
                                }
                            })
                            .catch(() => {
                                // 系統不支援此 DRM，嘗試較低的 robustness level
                                const fallbackConfig = [{
                                    initDataTypes: ['cenc'],
                                    videoCapabilities: [{
                                        contentType: 'video/mp4; codecs="avc1.42E01E"',
                                        robustness: ''
                                    }],
                                    audioCapabilities: [{
                                        contentType: 'audio/mp4; codecs="mp4a.40.2"',
                                        robustness: ''
                                    }]
                                }];
                                
                                return navigator.requestMediaKeySystemAccess(keySystem, fallbackConfig);
                            })
                            .then(() => {
                                // 使用 fallback 配置成功
                                const systemName = getDRMSystemName(keySystem);
                                if (!drmInfo.systems.includes(systemName)) {
                                    drmInfo.systems.push(systemName);
                                    log(`DRM 系統支援確認 (fallback): ${systemName}`, 'info');
                                }
                            })
                            .catch(() => {
                                // 完全不支援此 DRM 系統
                                log(`DRM 系統不支援: ${getDRMSystemName(keySystem)}`, 'debug');
                            });
                    } catch (e) {
                        log(`DRM 系統檢測錯誤 (${keySystem}): ${e.message}`, 'debug');
                    }
                });
            }
            
            // 方法4: 檢查 MPD 檔案中的 ContentProtection (針對 DASH)
            const currentSrc = videoElement.src || videoElement.currentSrc;
            if (currentSrc && currentSrc.includes('.mpd')) {
                // 嘗試從 MPD URL 獲取 DRM 資訊
                drmInfo.mpdInfo = {
                    url: currentSrc,
                    detected: true
                };
                drmInfo.detectionMethods.push('MPD URL Detection');
                
                // 從網路請求記錄中查找 MPD 內容
                log(`檢測到 MPD 串流: ${currentSrc.substring(0, 100)}...`, 'info');
                drmInfo.isProtected = true; // MPD 通常表示有 DRM 保護
                
                // 檢查 URL 是否包含已知的 DRM 相關參數
                if (currentSrc.includes('drm') || currentSrc.includes('license') || 
                    currentSrc.includes('token') || currentSrc.includes('auth')) {
                    drmInfo.urlIndicatesDRM = true;
                    drmInfo.detectionMethods.push('URL DRM Indicators');
                }
            }
            
            // 方法5: 平台特定檢測
            switch (currentPlatform) {
                case PLATFORMS.NETFLIX:
                    // Netflix 總是使用 DRM
                    drmInfo.isProtected = true;
                    drmInfo.systems.push('Widevine');
                    drmInfo.detectionMethods.push('Netflix Platform Detection');
                    if (navigator.userAgent.includes('Edge') || navigator.userAgent.includes('Safari')) {
                        drmInfo.systems.push('PlayReady');
                    }
                    break;
                    
                case PLATFORMS.GAGAOOLALA:
                    // GagaOOLala 使用 DRM
                    if (currentSrc && currentSrc.includes('gagaoolala')) {
                        drmInfo.isProtected = true;
                        drmInfo.detectionMethods.push('GagaOOLala Platform Detection');
                        // 根據您提供的 MPD，他們使用 Widevine 和 PlayReady
                        drmInfo.systems.push('Widevine', 'PlayReady');
                    }
                    break;
                    
                case PLATFORMS.DISNEY_PLUS:
                case PLATFORMS.AMAZON_PRIME:
                case PLATFORMS.HULU:
                    // 這些平台通常使用 DRM
                    drmInfo.isProtected = true;
                    drmInfo.systems.push('Widevine');
                    drmInfo.detectionMethods.push('Premium Platform Detection');
                    break;
            }
            
            // 去重 DRM 系統列表
            drmInfo.systems = [...new Set(drmInfo.systems)];
            
            // 如果有任何 DRM 系統被檢測到，標記為受保護
            if (drmInfo.systems.length > 0) {
                drmInfo.isProtected = true;
            }
            
            // 記錄 DRM 偵測結果
            if (drmInfo.isProtected) {
                log(`✅ DRM 保護已偵測: ${drmInfo.systems.join(', ')} (方法: ${drmInfo.detectionMethods.join(', ')})`, 'info');
            } else {
                log(`❌ 未偵測到 DRM 保護`, 'debug');
            }
            
        } catch (error) {
            log(`DRM 偵測錯誤: ${error.message}`, 'error');
            // 即使出錯也返回部分結果
            drmInfo.error = error.message;
        }
        
        return drmInfo;
    }
    
    // 獲取 DRM 系統名稱
    function getDRMSystemName(keySystem) {
        const systemMap = {
            'com.widevine.alpha': 'Widevine',
            'com.microsoft.playready': 'PlayReady',
            'com.apple.fps.1_0': 'FairPlay',
            'org.w3.clearkey': 'ClearKey'
        };
        return systemMap[keySystem] || keySystem;
    }
    
    // 收集視頻品質指標
    function collectVideoQualityMetrics(videoElement, videoId) {
        try {
            log(`收集視頻指標，使用videoId: ${videoId}`);
            
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
                
                // DRM 保護資訊
                drmProtection: detectDRMProtection(videoElement),
                
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
            
            // 收集位元率和幀率數據
            try {
                // 方法1: 從 MediaStream API 獲取幀率
                if (videoElement.srcObject && videoElement.srcObject.getVideoTracks) {
                    try {
                        const tracks = videoElement.srcObject.getVideoTracks();
                        if (tracks.length > 0) {
                            const settings = tracks[0].getSettings();
                            if (settings.frameRate) {
                                metrics.frameRate = Math.round(settings.frameRate);
                                metrics.frameRateSource = 'MediaStream API';
                                log(`幀率來源: MediaStream API - ${metrics.frameRate} fps`);
                            }
                        }
                    } catch (e) {
                        log(`MediaStream API 失敗: ${e.message}`);
                    }
                }
                
                // 方法2: 真實幀率計算 (使用最近5個測量點，嚴格按照 FPS = 幀數/經過時間)
                if (!metrics.frameRate && metrics.playbackQuality) {
                    const currentTime = Date.now();
                    // 使用傳入的 videoId 參數，不要重新生成
                    const videoData = videoQualityData.videos.get(videoId);
                    
                    log(`FPS計算使用videoId: ${videoId}, 找到videoData: ${!!videoData}`);
                    
                    if (videoData && videoData.metrics && videoData.metrics.length > 0) {
                        // 獲取最近5個有效的測量點
                        const recentMetrics = videoData.metrics
                            .filter(m => m.playbackQuality && m.playbackQuality.totalVideoFrames > 0)
                            .slice(-5); // 最近5個測量點
                        
                        if (recentMetrics.length >= 1) { // 至少需要1個歷史測量點
                            const validSamples = [];
                            
                            // 檢查每個測量點，計算有效樣本
                            for (let i = 0; i < recentMetrics.length; i++) {
                                const prevMetric = recentMetrics[i];
                                const timeDiff = (currentTime - prevMetric.timestamp) / 1000; // 秒
                                const frameDiff = metrics.playbackQuality.totalVideoFrames - prevMetric.playbackQuality.totalVideoFrames;
                                
                                // 樣本間隔至少0.5秒，且有幀數變化
                                if (timeDiff >= 0.5 && frameDiff > 0) {
                                    const sampleFPS = frameDiff / timeDiff;
                                    // 只接受合理的幀率值 (5-120 FPS)
                                    if (sampleFPS >= 5 && sampleFPS <= 120) {
                                        validSamples.push({
                                            fps: sampleFPS,
                                            timeDiff: timeDiff,
                                            frameDiff: frameDiff,
                                            timestamp: prevMetric.timestamp
                                        });
                                        log(`有效FPS樣本: ${sampleFPS.toFixed(2)} fps (幀差=${frameDiff}, 時差=${timeDiff.toFixed(2)}s)`);
                                    }
                                }
                            }
                            
                            // 至少需要2個有效樣本才能計算平均值
                            if (validSamples.length >= 2) {
                                // 計算加權平均值（較新的樣本權重更高）
                                let totalWeightedFPS = 0;
                                let totalWeight = 0;
                                
                                validSamples.forEach((sample, index) => {
                                    const weight = index + 1; // 越新的樣本權重越高
                                    totalWeightedFPS += sample.fps * weight;
                                    totalWeight += weight;
                                });
                                
                                const averageFPS = totalWeightedFPS / totalWeight;
                                metrics.frameRate = Math.round(averageFPS * 10) / 10; // 保留1位小數
                                metrics.frameRateSource = 'Calculated (averaged)';
                                metrics.frameRateSamples = validSamples.length;
                                
                                log(`✅ 真實FPS計算完成: ${metrics.frameRate} fps (基於${validSamples.length}個樣本的加權平均)`);
                                
                                // 記錄計算詳情用於調試
                                metrics.frameRateDetails = {
                                    samples: validSamples.map(s => ({
                                        fps: Math.round(s.fps * 10) / 10,
                                        timeDiff: Math.round(s.timeDiff * 100) / 100,
                                        frameDiff: s.frameDiff
                                    })),
                                    average: Math.round(averageFPS * 10) / 10,
                                    method: 'weighted_average_of_recent_samples'
                                };
                            } else if (validSamples.length === 1) {
                                // 只有1個樣本，暫時使用但標記為不完整
                                metrics.frameRate = Math.round(validSamples[0].fps * 10) / 10;
                                metrics.frameRateSource = 'Calculated (single sample)';
                                metrics.frameRateSamples = 1;
                                log(`⚠️ 暫時FPS計算: ${metrics.frameRate} fps (僅1個樣本，需要更多數據)`);
                            } else {
                                log(`❌ 無法計算FPS: 沒有足夠的有效樣本 (需要至少2個，間隔≥0.5秒)`);
                            }
                        } else {
                            log(`📊 FPS計算等待中: 需要歷史測量點進行比較`);
                        }
                    }
                }
                
                // 方法3: 從視頻元素屬性獲取
                if (!metrics.frameRate) {
                    // 嘗試從 videoElement 的各種屬性獲取
                    if (videoElement.mozPaintedFrames !== undefined && videoElement.mozFrameDelay !== undefined) {
                        // Firefox 特有屬性
                        const fps = Math.round(1000 / videoElement.mozFrameDelay);
                        if (fps >= 5 && fps <= 120) {
                            metrics.frameRate = fps;
                            metrics.frameRateSource = 'Firefox mozFrameDelay';
                            log(`幀率來源: Firefox mozFrameDelay - ${metrics.frameRate} fps`);
                        }
                    }
                }
                
                // 如果無法通過任何方法獲得真實幀率，就不提供值
                if (!metrics.frameRate) {
                    log(`❌ 無法獲得真實幀率數據 - 不提供推測值`);
                    metrics.frameRateSource = 'Not available';
                }
                
                // 嘗試從網路層推算位元率 (基於下載速度)
                if (videoElement.buffered && videoElement.buffered.length > 0) {
                    const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
                    const bufferedStart = videoElement.buffered.start(0);
                    const bufferedDuration = bufferedEnd - bufferedStart;
                    
                    // 估算位元率 (這是一個粗略的估算)
                    if (bufferedDuration > 0 && videoElement.duration > 0) {
                        metrics.estimatedBitrate = {
                            bufferedDuration: bufferedDuration,
                            totalDuration: videoElement.duration,
                            bufferRatio: bufferedDuration / videoElement.duration
                        };
                    }
                }
                
                // 收集網路狀態信息
                if (navigator.connection) {
                    metrics.networkInfo = {
                        effectiveType: navigator.connection.effectiveType,
                        downlink: navigator.connection.downlink,
                        rtt: navigator.connection.rtt,
                        saveData: navigator.connection.saveData
                    };
                }
                
            } catch (error) {
                log(`Error collecting bitrate/framerate data: ${error.message}`, 'error');
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
        
        // 只監聽關鍵事件，避免過度監聽
        const criticalEvents = ['play', 'pause', 'ended', 'error', 'loadedmetadata', 'canplay'];
        
        criticalEvents.forEach(eventName => {
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
                    if (videoData.events.length > 100) {
                        videoData.events = videoData.events.slice(-50);
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
        
        // 定期收集指標 - 降低頻率以避免影響播放
        const metricsInterval = setInterval(() => {
            if (!videoData.active || !document.contains(videoElement)) {
                clearInterval(metricsInterval);
                cleanupVideoMonitoring(videoId);
                return;
            }
            
            // 只在影片播放時收集詳細指標
            if (!videoElement.paused && videoElement.readyState >= 2) {
                const metrics = collectVideoQualityMetrics(videoElement, videoId);
                if (metrics) {
                    videoData.metrics.push(metrics);
                    
                    // 限制指標數量
                    if (videoData.metrics.length > 200) {
                        videoData.metrics = videoData.metrics.slice(-100);
                    }
                }
            }
        }, Math.max(CONFIG.UPDATE_INTERVAL * 2, 1000)); // 至少1秒間隔
        
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
        
        log('Starting video element search...', 'info');
        log(`Current URL: ${window.location.href}`, 'debug');
        log(`Document ready state: ${document.readyState}`, 'debug');
        
        // 方法1：標準 HTML5 video 元素
        const htmlVideos = document.querySelectorAll('video');
        log(`Method 1 - Standard HTML5 videos: ${htmlVideos.length}`, 'debug');
        
        htmlVideos.forEach((video, index) => {
            // 驗證是否為有效的影片元素
            if (isValidVideoElement(video) && !foundElements.has(video)) {
                foundElements.add(video);
                videos.push(video);
                log(`  Valid Video ${index + 1}: ${video.tagName} - src: ${video.src || video.currentSrc || 'no src'} - dimensions: ${video.videoWidth || 0}x${video.videoHeight || 0}`, 'debug');
            } else if (!isValidVideoElement(video)) {
                log(`  Skipped invalid video ${index + 1}: no src or dimensions`, 'debug');
            }
        });
        
        // 方法2：查找嵌入在 iframe 中的視頻（僅限同源）
        const iframes = document.querySelectorAll('iframe');
        log(`Method 2 - Checking ${iframes.length} iframes`, 'debug');
        iframes.forEach((iframe, index) => {
            try {
                log(`  Iframe ${index + 1}: src=${iframe.src}`, 'debug');
                if (iframe.contentDocument) {
                    const iframeVideos = iframe.contentDocument.querySelectorAll('video');
                    log(`    Found ${iframeVideos.length} videos in iframe`, 'debug');
                    iframeVideos.forEach(video => {
                        if (isValidVideoElement(video) && !foundElements.has(video)) {
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
        
        // 方法3：查找真正的影片 object 和 embed 元素
        const objects = document.querySelectorAll('object, embed');
        log(`Method 3 - Checking ${objects.length} object/embed elements`, 'debug');
        objects.forEach((obj, index) => {
            log(`  Object/Embed ${index + 1}: type=${obj.type || 'no type'} data=${obj.data || 'no data'}`, 'debug');
            if (obj.type && (obj.type.includes('video') || obj.type.includes('application/x-shockwave-flash'))) {
                // 驗證是否有實際的影片內容
                if (obj.data && obj.data.length > 0 && !foundElements.has(obj)) {
                    foundElements.add(obj);
                    videos.push(obj);
                    log(`    Added valid video object/embed`, 'debug');
                }
            }
        });
        
        // 方法4：動態內容檢測（針對 JavaScript 載入的視頻）
        log(`Method 4 - Setting up delayed detection for dynamic content`, 'debug');
        setTimeout(() => {
            const delayedVideos = document.querySelectorAll('video');
            let newValidVideos = 0;
            
            delayedVideos.forEach(video => {
                if (isValidVideoElement(video) && !foundElements.has(video)) {
                    foundElements.add(video);
                    videos.push(video);
                    monitorVideoElement(video);
                    newValidVideos++;
                }
            });
            
            if (newValidVideos > 0) {
                log(`Found ${newValidVideos} additional valid videos after delay`, 'info');
                sendVideoQualityUpdate();
            }
        }, 3000);
        
        // 最終報告
        log(`=== Video Detection Summary ===`, 'info');
        log(`Total valid video elements found: ${videos.length}`, 'info');
        
        videos.forEach((video, index) => {
            const info = {
                index: index + 1,
                tag: video.tagName,
                src: video.src || video.currentSrc || video.data || 'no src',
                id: video.id || 'no id',
                className: video.className || 'no class',
                dimensions: `${video.videoWidth || 0}x${video.videoHeight || 0}`,
                readyState: video.readyState !== undefined ? video.readyState : 'N/A',
                networkState: video.networkState !== undefined ? video.networkState : 'N/A',
                duration: video.duration || 0,
                hasContent: video.src || video.currentSrc || video.srcObject ? 'Yes' : 'No'
            };
            
            log(`Video ${info.index}: ${info.tag} | src: ${info.src.substring(0, 60)}${info.src.length > 60 ? '...' : ''} | size: ${info.dimensions} | duration: ${info.duration.toFixed(2)}s | content: ${info.hasContent}`, 'info');
        });
        
        if (videos.length === 0) {
            log('No valid video elements detected.', 'info');
        }
        
        return videos;
    }
    
    // 新增：驗證影片元素是否有效
    function isValidVideoElement(video) {
        // 必須是 VIDEO 元素
        if (video.tagName !== 'VIDEO') {
            return false;
        }
        
        // 必須有影片來源
        const hasSrc = video.src || video.currentSrc || video.srcObject;
        if (!hasSrc) {
            return false;
        }
        
        // 檢查是否為隱藏的或極小的元素（可能是追蹤像素）
        const style = window.getComputedStyle(video);
        const isHidden = style.display === 'none' || 
                        style.visibility === 'hidden' || 
                        style.opacity === '0' ||
                        video.offsetWidth <= 1 || 
                        video.offsetHeight <= 1;
        
        if (isHidden) {
            log(`Skipping hidden/tiny video element: ${video.offsetWidth}x${video.offsetHeight}`, 'debug');
            return false;
        }
        
        // 檢查是否為廣告或追蹤影片（常見的小尺寸）
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            if (video.videoWidth <= 2 || video.videoHeight <= 2) {
                log(`Skipping tracking video: ${video.videoWidth}x${video.videoHeight}`, 'debug');
                return false;
            }
        }
        
        // 檢查影片時長（排除極短的廣告或追蹤影片）
        if (video.duration > 0 && video.duration < 1) {
            log(`Skipping very short video: ${video.duration}s`, 'debug');
            return false;
        }
        
        return true;
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
        }, Math.max(CONFIG.UPDATE_INTERVAL * 3, 5000)); // 至少5秒間隔
        
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