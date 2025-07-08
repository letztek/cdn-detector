/**
 * 檢測引擎 - 統一管理所有檢測器的執行和結果聚合
 * 
 * 設計原則：
 * 1. 完全不影響現有 CDN 檢測邏輯
 * 2. 採用觀察者模式，新功能並行運行
 * 3. 錯誤隔離，任何新功能失敗都不影響 CDN 檢測
 * 4. 結果聚合僅在 UI 層進行，底層數據完全分離
 */

class DetectorEngine {
    constructor() {
        this.detectors = new Map();
        this.results = new Map();
        this.isEnabled = true;
        this.config = {
            timeout: 10000, // 10秒超時
            maxRetries: 2,
            enableLogging: false
        };
        
        // 事件監聽器
        this.listeners = new Map();
        
        this.log('DetectorEngine initialized', 'info');
    }

    /**
     * 註冊檢測器
     * @param {string} name - 檢測器名稱 (tech, performance, security, seo)
     * @param {Object} detector - 檢測器實例
     */
    registerDetector(name, detector) {
        try {
            if (this.detectors.has(name)) {
                this.log(`Detector ${name} already registered, replacing`, 'warn');
            }
            
            this.detectors.set(name, {
                instance: detector,
                enabled: true,
                lastError: null,
                retryCount: 0
            });
            
            this.log(`Detector ${name} registered successfully`, 'info');
        } catch (error) {
            this.log(`Failed to register detector ${name}: ${error.message}`, 'error');
        }
    }

    /**
     * 註冊 Tech Stack 檢測器（特殊註冊方法）
     */
    async registerTechDetector() {
        try {
            // 確保 TechDetector 可用
            if (typeof techDetector !== 'undefined') {
                await techDetector.initialize();
                this.registerDetector('tech', techDetector);
                this.log('Tech Stack Detector registered and initialized', 'info');
            } else {
                this.log('TechDetector not available', 'warn');
            }
        } catch (error) {
            this.log(`Failed to register tech detector: ${error.message}`, 'error');
        }
    }

    /**
     * 啟用/停用特定檢測器
     * @param {string} name - 檢測器名稱
     * @param {boolean} enabled - 是否啟用
     */
    setDetectorEnabled(name, enabled) {
        const detector = this.detectors.get(name);
        if (detector) {
            detector.enabled = enabled;
            this.log(`Detector ${name} ${enabled ? 'enabled' : 'disabled'}`, 'info');
        }
    }

    /**
     * 執行所有啟用的檢測器
     * @param {Object} context - 檢測上下文 (tabId, url, pageData 等)
     * @returns {Promise<Object>} 聚合的檢測結果
     */
    async runAllDetectors(context) {
        if (!this.isEnabled) {
            this.log('DetectorEngine is disabled, skipping detection', 'info');
            return {};
        }

        const results = {};
        const promises = [];

        // 為每個啟用的檢測器創建獨立的執行承諾
        for (const [name, detector] of this.detectors) {
            if (!detector.enabled) {
                this.log(`Detector ${name} is disabled, skipping`, 'info');
                continue;
            }

            // 包裝每個檢測器執行，確保錯誤隔離
            const detectorPromise = this.runSingleDetector(name, detector, context)
                .then(result => {
                    results[name] = result;
                    this.results.set(name, result);
                })
                .catch(error => {
                    this.log(`Detector ${name} failed: ${error.message}`, 'error');
                    detector.lastError = error;
                    detector.retryCount++;
                    
                    // 如果重試次數超過限制，停用該檢測器
                    if (detector.retryCount > this.config.maxRetries) {
                        detector.enabled = false;
                        this.log(`Detector ${name} disabled due to repeated failures`, 'warn');
                    }
                    
                    // 錯誤情況下返回空結果，不影響其他檢測器
                    results[name] = { error: error.message, success: false };
                });

            promises.push(detectorPromise);
        }

        // 等待所有檢測器完成，即使部分失敗也不影響整體
        await Promise.allSettled(promises);

        // 觸發結果事件
        this.emitEvent('detectionComplete', {
            context,
            results,
            timestamp: Date.now()
        });

        return results;
    }

    /**
     * 執行單個檢測器（帶超時和錯誤處理）
     * @param {string} name - 檢測器名稱
     * @param {Object} detector - 檢測器配置
     * @param {Object} context - 檢測上下文
     * @returns {Promise<Object>} 檢測結果
     */
    async runSingleDetector(name, detector, context) {
        return new Promise(async (resolve, reject) => {
            // 設置超時
            const timeout = setTimeout(() => {
                reject(new Error(`Detector ${name} timed out after ${this.config.timeout}ms`));
            }, this.config.timeout);

            try {
                this.log(`Running detector: ${name}`, 'info');
                
                // 執行檢測器
                const result = await detector.instance.detect(context);
                
                clearTimeout(timeout);
                
                // 重置錯誤計數
                detector.retryCount = 0;
                detector.lastError = null;
                
                resolve({
                    success: true,
                    data: result,
                    timestamp: Date.now(),
                    detector: name
                });

            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * 獲取特定檢測器的結果
     * @param {string} name - 檢測器名稱
     * @returns {Object|null} 檢測結果
     */
    getResult(name) {
        return this.results.get(name) || null;
    }

    /**
     * 獲取所有檢測結果
     * @returns {Object} 所有檢測結果
     */
    getAllResults() {
        const results = {};
        for (const [name, result] of this.results) {
            results[name] = result;
        }
        return results;
    }

    /**
     * 清除所有檢測結果
     */
    clearResults() {
        this.results.clear();
        this.log('All detection results cleared', 'info');
    }

    /**
     * 獲取檢測器狀態
     * @returns {Object} 所有檢測器的狀態
     */
    getDetectorStatus() {
        const status = {};
        for (const [name, detector] of this.detectors) {
            status[name] = {
                enabled: detector.enabled,
                lastError: detector.lastError?.message || null,
                retryCount: detector.retryCount
            };
        }
        return status;
    }

    /**
     * 註冊事件監聽器
     * @param {string} event - 事件名稱
     * @param {Function} callback - 回調函數
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * 觸發事件
     * @param {string} event - 事件名稱
     * @param {*} data - 事件數據
     */
    emitEvent(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this.log(`Event callback error for ${event}: ${error.message}`, 'error');
            }
        });
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.log('Configuration updated', 'info');
    }

    /**
     * 啟用/停用整個檢測引擎
     * @param {boolean} enabled - 是否啟用
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.log(`DetectorEngine ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }

    /**
     * 日誌記錄
     * @param {string} message - 日誌消息
     * @param {string} level - 日誌級別
     */
    log(message, level = 'info') {
        if (!this.config.enableLogging) return;

        const timestamp = new Date().toISOString();
        const logMessage = `[DetectorEngine][${level.toUpperCase()}] ${timestamp}: ${message}`;
        
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

        // 可選：發送日誌到 background script
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            try {
                chrome.runtime.sendMessage({
                    type: 'DETECTOR_ENGINE_LOG',
                    data: { message, level, timestamp }
                }).catch(() => {}); // 忽略連接錯誤
            } catch (error) {
                // 忽略擴展上下文失效的錯誤
            }
        }
    }

    /**
     * 獲取引擎統計信息
     * @returns {Object} 統計信息
     */
    getStats() {
        return {
            totalDetectors: this.detectors.size,
            enabledDetectors: Array.from(this.detectors.values()).filter(d => d.enabled).length,
            totalResults: this.results.size,
            engineEnabled: this.isEnabled,
            uptime: Date.now() - (this.startTime || Date.now())
        };
    }
}

// 導出單例實例
const detectorEngine = new DetectorEngine();
detectorEngine.startTime = Date.now();

// 如果在 Chrome 擴展環境中，設置消息監聽器
if (typeof chrome !== 'undefined' && chrome.runtime) {
    // 監聽來自其他腳本的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'DETECTOR_ENGINE_COMMAND') {
            switch (request.command) {
                case 'getStatus':
                    sendResponse(detectorEngine.getDetectorStatus());
                    break;
                case 'getResults':
                    sendResponse(detectorEngine.getAllResults());
                    break;
                case 'getStats':
                    sendResponse(detectorEngine.getStats());
                    break;
                case 'setEnabled':
                    detectorEngine.setEnabled(request.enabled);
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
    module.exports = DetectorEngine;
} else if (typeof window !== 'undefined') {
    window.DetectorEngine = DetectorEngine;
    window.detectorEngine = detectorEngine;
}