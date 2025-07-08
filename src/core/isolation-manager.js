/**
 * 功能隔離管理器 - 確保新功能不會影響現有 CDN 檢測邏輯
 * 
 * 設計原則：
 * 1. 完全隔離新功能和現有 CDN 檢測功能
 * 2. 錯誤邊界：新功能的錯誤不會影響 CDN 檢測
 * 3. 資源隔離：防止記憶體洩漏和資源衝突
 * 4. 執行隔離：使用 try-catch 和 Promise 隔離技術
 */

class IsolationManager {
    constructor() {
        this.isolatedModules = new Map();
        this.errorBoundaries = new Map();
        this.resourceTrackers = new Map();
        this.executionQueues = new Map();
        
        this.config = {
            enableErrorBoundaries: true,
            enableResourceTracking: true,
            maxRetries: 3,
            timeoutMs: 30000,
            enableLogging: false,
            criticalModules: ['CDN_DETECTOR'] // 關鍵模組，不能被影響
        };

        this.stats = {
            errorsHandled: 0,
            modulesIsolated: 0,
            resourcesTracked: 0,
            executionsCompleted: 0
        };

        this.log('IsolationManager initialized', 'info');
    }

    /**
     * 註冊需要隔離的模組
     * @param {string} moduleId - 模組ID
     * @param {Object} moduleInstance - 模組實例
     * @param {Object} options - 隔離選項
     */
    registerModule(moduleId, moduleInstance, options = {}) {
        const isolationConfig = {
            instance: moduleInstance,
            isCritical: options.isCritical || false,
            errorBoundary: options.errorBoundary || true,
            resourceTracking: options.resourceTracking || true,
            maxExecutionTime: options.maxExecutionTime || this.config.timeoutMs,
            retryCount: 0,
            lastError: null,
            isActive: true
        };

        this.isolatedModules.set(moduleId, isolationConfig);
        
        // 為關鍵模組設置特殊保護
        if (isolationConfig.isCritical) {
            this.setupCriticalModuleProtection(moduleId, isolationConfig);
        }

        this.stats.modulesIsolated++;
        this.log(`Module ${moduleId} registered with isolation${isolationConfig.isCritical ? ' (CRITICAL)' : ''}`, 'info');
    }

    /**
     * 設置關鍵模組保護
     * @param {string} moduleId - 模組ID
     * @param {Object} config - 模組配置
     */
    setupCriticalModuleProtection(moduleId, config) {
        // 關鍵模組使用最高級別的隔離
        config.maxExecutionTime = Math.min(config.maxExecutionTime, 10000); // 最多10秒
        config.errorBoundary = true;
        config.resourceTracking = true;
        
        this.log(`Critical module protection set for ${moduleId}`, 'info');
    }

    /**
     * 在隔離環境中執行函數
     * @param {string} moduleId - 模組ID
     * @param {Function} func - 要執行的函數
     * @param {...any} args - 函數參數
     * @returns {Promise<any>} 執行結果
     */
    async executeIsolated(moduleId, func, ...args) {
        const module = this.isolatedModules.get(moduleId);
        if (!module) {
            throw new Error(`Module ${moduleId} not registered`);
        }

        if (!module.isActive) {
            throw new Error(`Module ${moduleId} is deactivated due to repeated failures`);
        }

        const executionId = `${moduleId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            this.startResourceTracking(executionId, moduleId);
            
            const result = await this.executeWithErrorBoundary(
                executionId,
                moduleId,
                func,
                module.maxExecutionTime,
                ...args
            );

            // 重置錯誤計數器（成功執行）
            module.retryCount = 0;
            module.lastError = null;
            
            this.stats.executionsCompleted++;
            this.log(`Execution completed for ${moduleId}`, 'info');
            
            return result;

        } catch (error) {
            return await this.handleExecutionError(moduleId, module, error, func, ...args);
        } finally {
            this.stopResourceTracking(executionId);
        }
    }

    /**
     * 帶錯誤邊界的執行
     * @param {string} executionId - 執行ID
     * @param {string} moduleId - 模組ID
     * @param {Function} func - 要執行的函數
     * @param {number} timeout - 超時時間
     * @param {...any} args - 函數參數
     * @returns {Promise<any>} 執行結果
     */
    async executeWithErrorBoundary(executionId, moduleId, func, timeout, ...args) {
        return new Promise(async (resolve, reject) => {
            let timeoutHandle;
            let isCompleted = false;

            // 設置超時
            if (timeout > 0) {
                timeoutHandle = setTimeout(() => {
                    if (!isCompleted) {
                        isCompleted = true;
                        clearTimeout(timeoutHandle);
                        reject(new Error(`Execution timeout for ${moduleId} after ${timeout}ms`));
                    }
                }, timeout);
            }

            try {
                // 在隔離的上下文中執行
                const result = await this.isolateExecution(func, args);
                
                if (!isCompleted) {
                    isCompleted = true;
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    resolve(result);
                }
            } catch (error) {
                if (!isCompleted) {
                    isCompleted = true;
                    if (timeoutHandle) clearTimeout(timeoutHandle);
                    reject(error);
                }
            }
        });
    }

    /**
     * 隔離執行
     * @param {Function} func - 要執行的函數
     * @param {Array} args - 函數參數
     * @returns {Promise<any>} 執行結果
     */
    async isolateExecution(func, args) {
        // 在 try-catch 中執行，防止意外錯誤
        try {
            if (typeof func !== 'function') {
                throw new Error('Invalid function provided for isolated execution');
            }

            // 執行函數
            const result = await func.apply(null, args);
            return result;
        } catch (error) {
            // 包裝錯誤，提供更多上下文
            const isolatedError = new Error(`Isolated execution failed: ${error.message}`);
            isolatedError.originalError = error;
            isolatedError.stack = error.stack;
            throw isolatedError;
        }
    }

    /**
     * 處理執行錯誤
     * @param {string} moduleId - 模組ID
     * @param {Object} module - 模組配置
     * @param {Error} error - 錯誤對象
     * @param {Function} func - 原函數
     * @param {...any} args - 原參數
     * @returns {Promise<any>} 處理結果
     */
    async handleExecutionError(moduleId, module, error, func, ...args) {
        module.lastError = error;
        module.retryCount++;
        
        this.stats.errorsHandled++;
        this.log(`Error in module ${moduleId}: ${error.message}`, 'error');

        // 如果是關鍵模組，立即報告錯誤但不停用
        if (module.isCritical) {
            this.log(`CRITICAL MODULE ERROR - ${moduleId}: ${error.message}`, 'error');
            
            // 關鍵模組錯誤不應該重試，而是立即失敗
            throw new Error(`Critical module ${moduleId} failed: ${error.message}`);
        }

        // 非關鍵模組可以重試
        if (module.retryCount <= this.config.maxRetries) {
            this.log(`Retrying execution for ${moduleId} (attempt ${module.retryCount}/${this.config.maxRetries})`, 'warn');
            
            // 指數退避重試
            const delay = Math.pow(2, module.retryCount - 1) * 1000;
            await this.sleep(delay);
            
            return await this.executeIsolated(moduleId, func, ...args);
        } else {
            // 超過重試次數，停用模組
            module.isActive = false;
            this.log(`Module ${moduleId} deactivated after ${this.config.maxRetries} failed attempts`, 'error');
            
            throw new Error(`Module ${moduleId} deactivated: ${error.message}`);
        }
    }

    /**
     * 開始資源追蹤
     * @param {string} executionId - 執行ID
     * @param {string} moduleId - 模組ID
     */
    startResourceTracking(executionId, moduleId) {
        if (!this.config.enableResourceTracking) return;

        const tracker = {
            moduleId,
            startTime: Date.now(),
            startMemory: this.getMemoryUsage(),
            isActive: true
        };

        this.resourceTrackers.set(executionId, tracker);
        this.stats.resourcesTracked++;
    }

    /**
     * 停止資源追蹤
     * @param {string} executionId - 執行ID
     */
    stopResourceTracking(executionId) {
        if (!this.config.enableResourceTracking) return;

        const tracker = this.resourceTrackers.get(executionId);
        if (!tracker) return;

        tracker.endTime = Date.now();
        tracker.endMemory = this.getMemoryUsage();
        tracker.duration = tracker.endTime - tracker.startTime;
        tracker.memoryDelta = tracker.endMemory - tracker.startMemory;
        tracker.isActive = false;

        // 檢查是否有記憶體洩漏
        if (tracker.memoryDelta > 10 * 1024 * 1024) { // 10MB
            this.log(`Potential memory leak detected in ${tracker.moduleId}: ${tracker.memoryDelta} bytes`, 'warn');
        }

        // 檢查執行時間
        if (tracker.duration > 5000) { // 5秒
            this.log(`Long execution detected in ${tracker.moduleId}: ${tracker.duration}ms`, 'warn');
        }

        this.resourceTrackers.delete(executionId);
    }

    /**
     * 獲取記憶體使用量
     * @returns {number} 記憶體使用量（估算）
     */
    getMemoryUsage() {
        if (typeof performance !== 'undefined' && performance.memory) {
            return performance.memory.usedJSHeapSize;
        }
        return 0; // 無法獲取時返回 0
    }

    /**
     * 睡眠函數
     * @param {number} ms - 毫秒數
     * @returns {Promise<void>} Promise
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 重新啟用模組
     * @param {string} moduleId - 模組ID
     */
    reactivateModule(moduleId) {
        const module = this.isolatedModules.get(moduleId);
        if (module) {
            module.isActive = true;
            module.retryCount = 0;
            module.lastError = null;
            this.log(`Module ${moduleId} reactivated`, 'info');
        }
    }

    /**
     * 獲取模組狀態
     * @param {string} moduleId - 模組ID
     * @returns {Object|null} 模組狀態
     */
    getModuleStatus(moduleId) {
        const module = this.isolatedModules.get(moduleId);
        if (!module) return null;

        return {
            isActive: module.isActive,
            isCritical: module.isCritical,
            retryCount: module.retryCount,
            lastError: module.lastError?.message || null,
            hasErrorBoundary: module.errorBoundary,
            hasResourceTracking: module.resourceTracking
        };
    }

    /**
     * 獲取所有模組狀態
     * @returns {Object} 所有模組狀態
     */
    getAllModuleStatus() {
        const status = {};
        for (const [moduleId] of this.isolatedModules) {
            status[moduleId] = this.getModuleStatus(moduleId);
        }
        return status;
    }

    /**
     * 清理資源
     */
    cleanup() {
        // 停止所有活躍的資源追蹤
        for (const [executionId, tracker] of this.resourceTrackers) {
            if (tracker.isActive) {
                this.stopResourceTracking(executionId);
            }
        }

        this.log('IsolationManager cleanup completed', 'info');
    }

    /**
     * 獲取統計信息
     * @returns {Object} 統計信息
     */
    getStats() {
        return {
            ...this.stats,
            activeModules: Array.from(this.isolatedModules.values()).filter(m => m.isActive).length,
            totalModules: this.isolatedModules.size,
            activeResourceTrackers: Array.from(this.resourceTrackers.values()).filter(t => t.isActive).length,
            criticalModules: Array.from(this.isolatedModules.values()).filter(m => m.isCritical).length
        };
    }

    /**
     * 更新配置
     * @param {Object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.log('IsolationManager configuration updated', 'info');
    }

    /**
     * 日誌記錄
     * @param {string} message - 日誌消息
     * @param {string} level - 日誌級別
     */
    log(message, level = 'info') {
        if (!this.config.enableLogging) return;

        const timestamp = new Date().toISOString();
        const logMessage = `[IsolationManager][${level.toUpperCase()}] ${timestamp}: ${message}`;
        
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
const isolationManager = new IsolationManager();

// 如果在 Chrome 擴展環境中，設置消息監聽器
if (typeof chrome !== 'undefined' && chrome.runtime) {
    // 監聽來自其他腳本的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'ISOLATION_MANAGER_COMMAND') {
            switch (request.command) {
                case 'getModuleStatus':
                    sendResponse(isolationManager.getModuleStatus(request.moduleId));
                    break;
                case 'getAllModuleStatus':
                    sendResponse(isolationManager.getAllModuleStatus());
                    break;
                case 'getStats':
                    sendResponse(isolationManager.getStats());
                    break;
                case 'reactivateModule':
                    isolationManager.reactivateModule(request.moduleId);
                    sendResponse({ success: true });
                    break;
                case 'cleanup':
                    isolationManager.cleanup();
                    sendResponse({ success: true });
                    break;
                default:
                    sendResponse({ error: 'Unknown command' });
            }
            return true; // 保持消息通道開放
        }
    });

    // 擴展卸載時清理資源
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
            isolationManager.cleanup();
        });
    }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IsolationManager;
} else if (typeof window !== 'undefined') {
    window.IsolationManager = IsolationManager;
    window.isolationManager = isolationManager;
}