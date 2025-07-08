/**
 * 相容性保證層 - 確保新功能與現有 CDN 檢測功能的無縫整合
 * 
 * 設計原則：
 * 1. 作為現有 CDN 檢測和新功能之間的適配器
 * 2. 保證現有 API 介面完全不變
 * 3. 處理數據格式轉換和命名空間隔離
 * 4. 提供向後相容性支持
 */

class CompatibilityLayer {
    constructor() {
        this.legacyAPI = null;
        this.enhancedAPI = null;
        this.dataTransformers = new Map();
        this.apiMappings = new Map();
        
        // 相容性配置
        this.config = {
            preserveLegacyBehavior: true,
            enableDataTransformation: true,
            legacyAPIPrefix: 'cdn_',
            enhancedAPIPrefix: 'enhanced_',
            enableLogging: false
        };

        this.log('CompatibilityLayer initialized', 'info');
        this.initializeAPIMappings();
    }

    /**
     * 初始化 API 映射
     */
    initializeAPIMappings() {
        // 現有 CDN 檢測 API 保持不變
        this.apiMappings.set('getTabDetectionData', 'getTabDetectionData');
        this.apiMappings.set('getCDNStats', 'getCDNStats');
        this.apiMappings.set('getVideoQualityData', 'getVideoQualityData');
        this.apiMappings.set('clearDetectionLog', 'clearDetectionLog');
        
        // 新功能 API 添加前綴避免衝突
        this.apiMappings.set('getTechStackData', 'enhanced_getTechStackData');
        this.apiMappings.set('getPerformanceData', 'enhanced_getPerformanceData');
        this.apiMappings.set('getSecurityData', 'enhanced_getSecurityData');
        this.apiMappings.set('getSEOData', 'enhanced_getSEOData');
    }

    /**
     * 設置現有 CDN 檢測 API 引用
     * @param {Object} legacyAPI - 現有 CDN 檢測的 API 對象
     */
    setLegacyAPI(legacyAPI) {
        this.legacyAPI = legacyAPI;
        this.log('Legacy CDN API set', 'info');
    }

    /**
     * 設置增強功能 API 引用
     * @param {Object} enhancedAPI - 新功能的 API 對象
     */
    setEnhancedAPI(enhancedAPI) {
        this.enhancedAPI = enhancedAPI;
        this.log('Enhanced API set', 'info');
    }

    /**
     * 統一的 API 調用入口
     * @param {string} methodName - 方法名稱
     * @param {...any} args - 方法參數
     * @returns {Promise<any>} 方法執行結果
     */
    async callAPI(methodName, ...args) {
        try {
            // 檢查是否為現有 CDN API
            if (this.isLegacyAPI(methodName)) {
                return await this.callLegacyAPI(methodName, ...args);
            }
            
            // 檢查是否為新功能 API
            if (this.isEnhancedAPI(methodName)) {
                return await this.callEnhancedAPI(methodName, ...args);
            }

            throw new Error(`Unknown API method: ${methodName}`);
        } catch (error) {
            this.log(`API call failed for ${methodName}: ${error.message}`, 'error');
            
            // 如果新功能失敗，嘗試降級到現有功能
            if (this.isEnhancedAPI(methodName) && this.config.preserveLegacyBehavior) {
                return await this.fallbackToLegacy(methodName, ...args);
            }
            
            throw error;
        }
    }

    /**
     * 調用現有 CDN API
     * @param {string} methodName - 方法名稱
     * @param {...any} args - 方法參數
     * @returns {Promise<any>} 執行結果
     */
    async callLegacyAPI(methodName, ...args) {
        if (!this.legacyAPI) {
            throw new Error('Legacy API not available');
        }

        const mappedMethod = this.apiMappings.get(methodName) || methodName;
        
        if (typeof this.legacyAPI[mappedMethod] !== 'function') {
            throw new Error(`Legacy API method ${mappedMethod} not found`);
        }

        this.log(`Calling legacy API: ${mappedMethod}`, 'info');
        return await this.legacyAPI[mappedMethod](...args);
    }

    /**
     * 調用新功能 API
     * @param {string} methodName - 方法名稱
     * @param {...any} args - 方法參數
     * @returns {Promise<any>} 執行結果
     */
    async callEnhancedAPI(methodName, ...args) {
        if (!this.enhancedAPI) {
            throw new Error('Enhanced API not available');
        }

        const mappedMethod = this.apiMappings.get(methodName) || methodName;
        
        if (typeof this.enhancedAPI[mappedMethod] !== 'function') {
            throw new Error(`Enhanced API method ${mappedMethod} not found`);
        }

        this.log(`Calling enhanced API: ${mappedMethod}`, 'info');
        const result = await this.enhancedAPI[mappedMethod](...args);
        
        // 如果啟用數據轉換，轉換結果格式
        if (this.config.enableDataTransformation) {
            return this.transformData(methodName, result);
        }
        
        return result;
    }

    /**
     * 判斷是否為現有 CDN API
     * @param {string} methodName - 方法名稱
     * @returns {boolean} 是否為現有 API
     */
    isLegacyAPI(methodName) {
        const legacyMethods = [
            'getTabDetectionData',
            'getCDNStats', 
            'getVideoQualityData',
            'clearDetectionLog',
            'refreshStats',
            'detectCDN',
            'parseCacheStatus'
        ];
        return legacyMethods.includes(methodName);
    }

    /**
     * 判斷是否為新功能 API
     * @param {string} methodName - 方法名稱
     * @returns {boolean} 是否為新功能 API
     */
    isEnhancedAPI(methodName) {
        const enhancedMethods = [
            'getTechStackData',
            'getPerformanceData',
            'getSecurityData',
            'getSEOData',
            'runAllDetectors',
            'getDetectorStatus'
        ];
        return enhancedMethods.includes(methodName);
    }

    /**
     * 降級到現有功能
     * @param {string} methodName - 失敗的方法名稱
     * @param {...any} args - 方法參數
     * @returns {Promise<any>} 降級結果
     */
    async fallbackToLegacy(methodName, ...args) {
        this.log(`Falling back to legacy for ${methodName}`, 'warn');
        
        // 嘗試映射到相似的現有功能
        const fallbackMappings = {
            'getTechStackData': 'getTabDetectionData',
            'getPerformanceData': 'getCDNStats',
            'getSecurityData': 'getTabDetectionData',
            'getSEOData': 'getTabDetectionData'
        };
        
        const fallbackMethod = fallbackMappings[methodName];
        if (fallbackMethod) {
            const result = await this.callLegacyAPI(fallbackMethod, ...args);
            return this.transformLegacyDataForNewAPI(methodName, result);
        }
        
        // 如果沒有合適的降級選項，返回空結果
        return this.getEmptyResult(methodName);
    }

    /**
     * 數據轉換
     * @param {string} methodName - 方法名稱
     * @param {any} data - 原始數據
     * @returns {any} 轉換後的數據
     */
    transformData(methodName, data) {
        const transformer = this.dataTransformers.get(methodName);
        if (transformer) {
            return transformer(data);
        }
        
        // 默認轉換：確保數據格式一致
        return this.standardizeDataFormat(data);
    }

    /**
     * 標準化數據格式
     * @param {any} data - 原始數據
     * @returns {Object} 標準化後的數據
     */
    standardizeDataFormat(data) {
        if (!data || typeof data !== 'object') {
            return { success: false, data: null, error: 'Invalid data format' };
        }

        return {
            success: true,
            data: data,
            timestamp: Date.now(),
            source: 'enhanced_api'
        };
    }

    /**
     * 為新 API 轉換現有數據格式
     * @param {string} methodName - 新 API 方法名
     * @param {any} legacyData - 現有數據
     * @returns {Object} 轉換後的數據
     */
    transformLegacyDataForNewAPI(methodName, legacyData) {
        const transformations = {
            'getTechStackData': (data) => ({
                technologies: [],
                frameworks: [],
                libraries: [],
                note: 'Fallback data from CDN detection',
                fallback: true
            }),
            'getPerformanceData': (data) => ({
                loadTime: data.responseTime || 0,
                resources: [],
                cacheHitRatio: data.hitRatio || 0,
                note: 'Limited performance data from CDN stats',
                fallback: true
            }),
            'getSecurityData': (data) => ({
                https: data.url ? data.url.startsWith('https://') : false,
                headers: {},
                note: 'Basic security info from CDN detection',
                fallback: true
            }),
            'getSEOData': (data) => ({
                title: document.title || '',
                description: '',
                note: 'Basic SEO info, enhanced detection unavailable',
                fallback: true
            })
        };

        const transform = transformations[methodName];
        if (transform) {
            return this.standardizeDataFormat(transform(legacyData));
        }

        return this.standardizeDataFormat({ fallback: true, originalData: legacyData });
    }

    /**
     * 獲取空結果
     * @param {string} methodName - 方法名稱
     * @returns {Object} 空結果對象
     */
    getEmptyResult(methodName) {
        return {
            success: false,
            data: null,
            error: `${methodName} not available`,
            fallback: true,
            timestamp: Date.now()
        };
    }

    /**
     * 註冊數據轉換器
     * @param {string} methodName - 方法名稱
     * @param {Function} transformer - 轉換函數
     */
    registerDataTransformer(methodName, transformer) {
        this.dataTransformers.set(methodName, transformer);
        this.log(`Data transformer registered for ${methodName}`, 'info');
    }

    /**
     * 檢查 API 可用性
     * @returns {Object} API 可用性狀態
     */
    checkAPIAvailability() {
        return {
            legacy: {
                available: this.legacyAPI !== null,
                methods: this.legacyAPI ? Object.keys(this.legacyAPI) : []
            },
            enhanced: {
                available: this.enhancedAPI !== null,
                methods: this.enhancedAPI ? Object.keys(this.enhancedAPI) : []
            }
        };
    }

    /**
     * 更新相容性配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.log('Compatibility configuration updated', 'info');
    }

    /**
     * 獲取統計信息
     * @returns {Object} 統計信息
     */
    getStats() {
        return {
            apiCallsTotal: this.apiCallCount || 0,
            legacyAPIAvailable: this.legacyAPI !== null,
            enhancedAPIAvailable: this.enhancedAPI !== null,
            transformersRegistered: this.dataTransformers.size,
            fallbacksTriggered: this.fallbackCount || 0
        };
    }

    /**
     * 日誌記錄
     * @param {string} message - 日誌消息
     * @param {string} level - 日誌級別
     */
    log(message, level = 'info') {
        if (!this.config.enableLogging) return;

        const timestamp = new Date().toISOString();
        const logMessage = `[CompatibilityLayer][${level.toUpperCase()}] ${timestamp}: ${message}`;
        
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
const compatibilityLayer = new CompatibilityLayer();

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CompatibilityLayer;
} else if (typeof window !== 'undefined') {
    window.CompatibilityLayer = CompatibilityLayer;
    window.compatibilityLayer = compatibilityLayer;
}