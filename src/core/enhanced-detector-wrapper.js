/**
 * 增強檢測器包裝器 - 使用裝飾器模式包裝現有 CDN 檢測功能
 * 
 * 設計原則：
 * 1. 完全不修改現有 CDN 檢測邏輯
 * 2. 通過裝飾器模式添加新功能
 * 3. 確保向後相容性
 * 4. 錯誤隔離：新功能失敗不影響原有功能
 */

class EnhancedDetectorWrapper {
    constructor() {
        this.legacyCDNDetector = null;
        this.detectorEngine = null;
        this.compatibilityLayer = null;
        this.isolationManager = null;
        this.iconManager = null;
        
        this.isInitialized = false;
        this.config = {
            enableEnhancedFeatures: true,
            preserveLegacyBehavior: true,
            enableLogging: false
        };

        this.log('EnhancedDetectorWrapper initialized', 'info');
    }

    /**
     * 初始化包裝器，設置所有必要的組件引用
     * @param {Object} components - 組件對象
     */
    async initialize(components = {}) {
        try {
            // 設置組件引用（如果可用）
            if (typeof detectorEngine !== 'undefined') {
                this.detectorEngine = detectorEngine;
                this.log('DetectorEngine connected', 'info');
            }

            if (typeof compatibilityLayer !== 'undefined') {
                this.compatibilityLayer = compatibilityLayer;
                this.log('CompatibilityLayer connected', 'info');
            }

            if (typeof isolationManager !== 'undefined') {
                this.isolationManager = isolationManager;
                this.log('IsolationManager connected', 'info');
            }

            if (typeof iconManager !== 'undefined') {
                this.iconManager = iconManager;
                this.log('IconManager connected', 'info');
            }

            // 註冊現有 CDN 檢測為關鍵模組
            if (this.isolationManager) {
                this.isolationManager.registerModule('CDN_DETECTOR', {
                    detect: this.legacyCDNDetection.bind(this)
                }, {
                    isCritical: true,
                    errorBoundary: true,
                    resourceTracking: false, // CDN 檢測不需要額外的資源追蹤
                    maxExecutionTime: 5000
                });
            }

            this.isInitialized = true;
            this.log('EnhancedDetectorWrapper initialization completed', 'info');
        } catch (error) {
            this.log(`Initialization failed: ${error.message}`, 'error');
            // 初始化失敗不應該影響基本功能
        }
    }

    /**
     * 包裝現有的 CDN 檢測邏輯
     * @param {Object} requestDetails - 請求詳情
     * @returns {Promise<Object>} 檢測結果
     */
    async detectCDN(requestDetails) {
        try {
            // 優先使用現有的 CDN 檢測邏輯
            const legacyResult = await this.executeLegacyCDNDetection(requestDetails);
            
            // 如果啟用了增強功能，並行執行新檢測
            if (this.config.enableEnhancedFeatures && this.isInitialized) {
                try {
                    const enhancedResult = await this.executeEnhancedDetection(requestDetails);
                    return this.mergeDetectionResults(legacyResult, enhancedResult);
                } catch (enhancedError) {
                    // 新功能失敗時，只返回原有結果
                    this.log(`Enhanced detection failed, using legacy result: ${enhancedError.message}`, 'warn');
                    return legacyResult;
                }
            }

            return legacyResult;
        } catch (error) {
            this.log(`CDN detection failed: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * 執行現有的 CDN 檢測邏輯
     * @param {Object} requestDetails - 請求詳情
     * @returns {Promise<Object>} 現有檢測結果
     */
    async executeLegacyCDNDetection(requestDetails) {
        if (this.isolationManager) {
            // 在隔離環境中執行
            return await this.isolationManager.executeIsolated(
                'CDN_DETECTOR',
                this.legacyCDNDetection.bind(this),
                requestDetails
            );
        } else {
            // 直接執行
            return await this.legacyCDNDetection(requestDetails);
        }
    }

    /**
     * 現有的 CDN 檢測邏輯（包裝）
     * @param {Object} requestDetails - 請求詳情
     * @returns {Promise<Object>} 檢測結果
     */
    async legacyCDNDetection(requestDetails) {
        // 這裡會調用現有的 detectCDN 函數
        // 為了保持現有邏輯不變，我們將使用全域函數
        if (typeof detectCDN === 'function') {
            return await detectCDN(requestDetails);
        } else {
            // 回退到基本檢測
            return this.basicCDNDetection(requestDetails);
        }
    }

    /**
     * 基本 CDN 檢測（回退選項）
     * @param {Object} requestDetails - 請求詳情
     * @returns {Object} 基本檢測結果
     */
    basicCDNDetection(requestDetails) {
        return {
            isCDN: false,
            provider: 'Unknown',
            method: 'basic',
            confidence: 0,
            timestamp: Date.now(),
            url: requestDetails.url || '',
            fallback: true
        };
    }

    /**
     * 執行增強檢測功能
     * @param {Object} requestDetails - 請求詳情
     * @returns {Promise<Object>} 增強檢測結果
     */
    async executeEnhancedDetection(requestDetails) {
        const enhancedResults = {};

        if (this.detectorEngine) {
            try {
                // 準備檢測上下文
                const context = {
                    url: requestDetails.url,
                    method: requestDetails.method,
                    headers: requestDetails.requestHeaders,
                    timestamp: Date.now(),
                    tabId: requestDetails.tabId
                };

                // 執行所有增強檢測器
                const results = await this.detectorEngine.runAllDetectors(context);
                enhancedResults.detectorResults = results;
            } catch (error) {
                this.log(`Enhanced detector execution failed: ${error.message}`, 'warn');
                enhancedResults.detectorResults = { error: error.message };
            }
        }

        return enhancedResults;
    }

    /**
     * 合併檢測結果
     * @param {Object} legacyResult - 現有檢測結果
     * @param {Object} enhancedResult - 增強檢測結果
     * @returns {Object} 合併後的結果
     */
    mergeDetectionResults(legacyResult, enhancedResult) {
        // 確保現有結果格式不變
        const mergedResult = { ...legacyResult };

        // 在新的命名空間中添加增強功能結果
        if (enhancedResult && Object.keys(enhancedResult).length > 0) {
            mergedResult.enhanced = {
                ...enhancedResult,
                timestamp: Date.now(),
                version: '1.0.0'
            };
        }

        return mergedResult;
    }

    /**
     * 包裝 webRequest 監聽器
     * @param {Function} originalListener - 原始監聽器
     * @returns {Function} 包裝後的監聽器
     */
    wrapWebRequestListener(originalListener) {
        return async (details) => {
            try {
                // 先執行原始監聽器邏輯
                let result = null;
                if (typeof originalListener === 'function') {
                    result = await originalListener(details);
                }

                // 如果啟用增強功能，執行額外的處理
                if (this.config.enableEnhancedFeatures && this.isInitialized) {
                    try {
                        await this.processEnhancedWebRequest(details);
                    } catch (enhancedError) {
                        // 增強功能失敗不影響原始結果
                        this.log(`Enhanced web request processing failed: ${enhancedError.message}`, 'warn');
                    }
                }

                return result;
            } catch (error) {
                this.log(`Web request listener error: ${error.message}`, 'error');
                // 如果原始監聽器失敗，記錄錯誤但不阻止請求
                return undefined;
            }
        };
    }

    /**
     * 處理增強的 web 請求
     * @param {Object} details - 請求詳情
     */
    async processEnhancedWebRequest(details) {
        // 這裡可以添加額外的請求處理邏輯
        // 例如：收集更多數據用於技術棧檢測
        
        if (this.detectorEngine) {
            // 非同步處理，不阻塞主要流程
            setImmediate(() => {
                this.detectorEngine.runAllDetectors({
                    type: 'webRequest',
                    details: details,
                    timestamp: Date.now()
                }).catch(error => {
                    this.log(`Background enhanced detection failed: ${error.message}`, 'warn');
                });
            });
        }
    }

    /**
     * 包裝標籤頁更新處理
     * @param {Function} originalHandler - 原始處理器
     * @returns {Function} 包裝後的處理器
     */
    wrapTabUpdateHandler(originalHandler) {
        return async (tabId, changeInfo, tab) => {
            try {
                // 先執行原始處理邏輯
                let result = null;
                if (typeof originalHandler === 'function') {
                    result = await originalHandler(tabId, changeInfo, tab);
                }

                // 增強功能處理
                if (this.config.enableEnhancedFeatures && this.isInitialized) {
                    try {
                        await this.processEnhancedTabUpdate(tabId, changeInfo, tab);
                    } catch (enhancedError) {
                        this.log(`Enhanced tab update processing failed: ${enhancedError.message}`, 'warn');
                    }
                }

                return result;
            } catch (error) {
                this.log(`Tab update handler error: ${error.message}`, 'error');
                return undefined;
            }
        };
    }

    /**
     * 處理增強的標籤頁更新
     * @param {number} tabId - 標籤頁ID
     * @param {Object} changeInfo - 變更信息
     * @param {Object} tab - 標籤頁對象
     */
    async processEnhancedTabUpdate(tabId, changeInfo, tab) {
        // 當頁面完成載入時，觸發增強檢測
        if (changeInfo.status === 'complete' && tab.url) {
            if (this.detectorEngine) {
                setImmediate(() => {
                    this.detectorEngine.runAllDetectors({
                        type: 'pageLoad',
                        tabId: tabId,
                        url: tab.url,
                        title: tab.title,
                        timestamp: Date.now()
                    }).catch(error => {
                        this.log(`Page load enhanced detection failed: ${error.message}`, 'warn');
                    });
                });
            }
        }
    }

    /**
     * 獲取包裝器狀態
     * @returns {Object} 狀態信息
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            config: this.config,
            components: {
                detectorEngine: this.detectorEngine !== null,
                compatibilityLayer: this.compatibilityLayer !== null,
                isolationManager: this.isolationManager !== null,
                iconManager: this.iconManager !== null
            }
        };
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.log('EnhancedDetectorWrapper configuration updated', 'info');
    }

    /**
     * 啟用/停用增強功能
     * @param {boolean} enabled - 是否啟用
     */
    setEnhancedFeaturesEnabled(enabled) {
        this.config.enableEnhancedFeatures = enabled;
        this.log(`Enhanced features ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }

    /**
     * 日誌記錄
     * @param {string} message - 日誌消息
     * @param {string} level - 日誌級別
     */
    log(message, level = 'info') {
        if (!this.config.enableLogging) return;

        const timestamp = new Date().toISOString();
        const logMessage = `[EnhancedDetectorWrapper][${level.toUpperCase()}] ${timestamp}: ${message}`;
        
        switch (level) {
            case 'error':
                console.error(logMessage);
                break;
            case 'warn':
                console.warn(logMessage);
                break;
            default:
                console.log(logMessage);
        }
    }
}

// 導出單例實例
const enhancedDetectorWrapper = new EnhancedDetectorWrapper();

// 如果在 Chrome 擴展環境中，設置消息監聽器
if (typeof chrome !== 'undefined' && chrome.runtime) {
    // 延遲初始化，確保其他組件已載入
    setTimeout(() => {
        enhancedDetectorWrapper.initialize().catch(error => {
            enhancedDetectorWrapper.log(`Failed to initialize: ${error.message}`, 'error');
        });
    }, 2000);

    // 監聽來自其他腳本的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'ENHANCED_DETECTOR_COMMAND') {
            switch (request.command) {
                case 'getStatus':
                    sendResponse(enhancedDetectorWrapper.getStatus());
                    break;
                case 'setEnhancedFeaturesEnabled':
                    enhancedDetectorWrapper.setEnhancedFeaturesEnabled(request.enabled);
                    sendResponse({ success: true });
                    break;
                case 'updateConfig':
                    enhancedDetectorWrapper.updateConfig(request.config);
                    sendResponse({ success: true });
                    break;
                default:
                    sendResponse({ error: 'Unknown command' });
            }
            return true; // 保持消息通道開放
        }
    });
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnhancedDetectorWrapper;
} else if (typeof window !== 'undefined') {
    window.EnhancedDetectorWrapper = EnhancedDetectorWrapper;
    window.enhancedDetectorWrapper = enhancedDetectorWrapper;
}