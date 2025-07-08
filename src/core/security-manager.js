/**
 * SecurityManager - 安全檢查器管理核心
 * 
 * 功能：
 * - 管理安全檢測模組的生命週期
 * - 提供錯誤隔離機制
 * - 實現降級機制
 * - 與現有 CDN 檢測系統並行運行
 * - 提供統一的接口給 UI
 * 
 * @class SecurityManager
 */
class SecurityManager {
  constructor() {
    this.enabled = true;
    this.degraded = false;
    this.errorCount = 0;
    this.maxErrors = 5; // 最大錯誤次數，超過則進入降級模式
    this.resetTime = 60000; // 1分鐘後重置錯誤計數
    
    // 初始化安全檢測模組
    this.securityModule = null;
    this.initPromise = this.initialize();
    
    // 監聽器管理
    this.listeners = new Map();
    
    // 錯誤統計
    this.stats = {
      totalRequests: 0,
      successfulChecks: 0,
      errors: 0,
      lastError: null,
      startTime: Date.now()
    };
    
    console.log('[SecurityManager] Initializing security manager...');
  }

  /**
   * 初始化安全管理器
   */
  async initialize() {
    try {
      // 動態載入 SecurityDetectionModule
      await this.loadSecurityModule();
      
      // 設置錯誤重置定時器
      this.setupErrorReset();
      
      // 設置監聽器
      this.setupListeners();
      
      console.log('[SecurityManager] Security manager initialized successfully');
      return true;
    } catch (error) {
      console.error('[SecurityManager] Failed to initialize:', error);
      this.handleError(error);
      return false;
    }
  }

  /**
   * 載入安全檢測模組
   */
  async loadSecurityModule() {
    try {
      // 檢查是否已在全域範圍載入
      if (typeof SecurityDetectionModule !== 'undefined') {
        this.securityModule = new SecurityDetectionModule();
        console.log('[SecurityManager] SecurityDetectionModule loaded from global scope');
        return;
      }
      
      // 嘗試動態載入
      const moduleUrl = chrome.runtime.getURL('src/detectors/security/SecurityDetectionModule.js');
      const response = await fetch(moduleUrl);
      const moduleCode = await response.text();
      
      // 使用 eval 載入模組（在擴展環境中是安全的）
      eval(moduleCode);
      
      if (typeof SecurityDetectionModule !== 'undefined') {
        this.securityModule = new SecurityDetectionModule();
        console.log('[SecurityManager] SecurityDetectionModule loaded dynamically');
      } else {
        throw new Error('SecurityDetectionModule not available after loading');
      }
    } catch (error) {
      console.error('[SecurityManager] Failed to load SecurityDetectionModule:', error);
      throw error;
    }
  }

  /**
   * 設置監聽器
   */
  setupListeners() {
    // 監聽標籤頁關閉事件
    if (chrome.tabs && chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId) => {
        this.cleanupTab(tabId);
      });
    }
    
    // 監聽標籤頁更新事件
    if (chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'loading' && changeInfo.url) {
          // 重置該標籤頁的安全檢測資料
          this.resetTabData(tabId);
        }
      });
    }
  }

  /**
   * 設置錯誤重置定時器
   */
  setupErrorReset() {
    setInterval(() => {
      if (this.errorCount > 0) {
        this.errorCount = Math.max(0, this.errorCount - 1);
        
        // 如果錯誤計數降到閾值以下，退出降級模式
        if (this.degraded && this.errorCount < this.maxErrors / 2) {
          this.degraded = false;
          console.log('[SecurityManager] Exiting degraded mode');
        }
      }
    }, this.resetTime);
  }

  /**
   * 處理 HTTP 響應的安全檢測
   * @param {Object} details - Chrome webRequest 的 details 物件
   * @returns {Promise<Object|null>} 檢測結果
   */
  async handleSecurityCheck(details) {
    // 快速檢查：模組是否可用
    if (!this.enabled || this.degraded || !this.securityModule) {
      return null;
    }

    // 等待初始化完成
    if (!await this.initPromise) {
      return null;
    }

    try {
      this.stats.totalRequests++;
      
      // 執行安全檢測（包裝在錯誤隔離中）
      const result = await this.executeSecurityCheck(details);
      
      if (result) {
        this.stats.successfulChecks++;
        console.log(`[SecurityManager] Security check completed for ${details.url}`);
      }
      
      return result;
      
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  /**
   * 執行安全檢測（帶錯誤隔離）
   * @param {Object} details
   * @returns {Promise<Object|null>}
   */
  async executeSecurityCheck(details) {
    try {
      // 設定超時機制（5秒）
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Security check timeout')), 5000);
      });

      // 執行安全檢測
      const checkPromise = this.securityModule.detectSecurityHeaders(details);
      
      // 競賽：檢測完成 vs 超時
      return await Promise.race([checkPromise, timeoutPromise]);
      
    } catch (error) {
      console.error('[SecurityManager] Error in security check:', error);
      throw error;
    }
  }

  /**
   * 處理錯誤
   * @param {Error} error
   */
  handleError(error) {
    this.errorCount++;
    this.stats.errors++;
    this.stats.lastError = {
      message: error.message,
      timestamp: new Date().toISOString()
    };

    console.error(`[SecurityManager] Error handled (${this.errorCount}/${this.maxErrors}):`, error);

    // 檢查是否需要進入降級模式
    if (this.errorCount >= this.maxErrors && !this.degraded) {
      this.enterDegradedMode();
    }
  }

  /**
   * 進入降級模式
   */
  enterDegradedMode() {
    this.degraded = true;
    console.warn('[SecurityManager] Entering degraded mode due to excessive errors');
    
    // 通知其他組件（如 UI）
    this.notifyDegradation();
  }

  /**
   * 通知降級狀態
   */
  notifyDegradation() {
    // 使用 Chrome 消息系統通知 popup
    chrome.runtime.sendMessage({
      type: 'SECURITY_DEGRADED',
      timestamp: Date.now(),
      errorCount: this.errorCount
    }).catch(() => {
      // 忽略消息發送錯誤（popup 可能未打開）
    });
  }

  /**
   * 清理標籤頁資料
   * @param {number} tabId
   */
  async cleanupTab(tabId) {
    try {
      if (this.securityModule) {
        await this.securityModule.cleanupTab(tabId);
      }
      console.log(`[SecurityManager] Cleaned up tab ${tabId}`);
    } catch (error) {
      console.error('[SecurityManager] Error cleaning up tab:', error);
    }
  }

  /**
   * 重置標籤頁資料
   * @param {number} tabId
   */
  resetTabData(tabId) {
    try {
      // 清除該標籤頁的檢測結果
      if (this.securityModule && this.securityModule.detectionResults) {
        this.securityModule.detectionResults.delete(tabId);
      }
    } catch (error) {
      console.error('[SecurityManager] Error resetting tab data:', error);
    }
  }

  /**
   * 獲取標籤頁的安全檢測資料
   * @param {number} tabId
   * @returns {Promise<Object|null>}
   */
  async getTabSecurityData(tabId) {
    try {
      if (!this.securityModule) {
        return null;
      }

      const key = `security_tab_${tabId}`;
      return await this.securityModule.getStoredData(key);
    } catch (error) {
      console.error('[SecurityManager] Error getting tab security data:', error);
      return null;
    }
  }

  /**
   * 獲取所有安全檢測資料
   * @returns {Promise<Object>}
   */
  async getAllSecurityData() {
    try {
      if (!this.securityModule) {
        return {};
      }

      return await this.securityModule.getAllSecurityData();
    } catch (error) {
      console.error('[SecurityManager] Error getting all security data:', error);
      return {};
    }
  }

  /**
   * 獲取管理器狀態
   * @returns {Object}
   */
  getStatus() {
    return {
      enabled: this.enabled,
      degraded: this.degraded,
      errorCount: this.errorCount,
      maxErrors: this.maxErrors,
      stats: {
        ...this.stats,
        uptime: Date.now() - this.stats.startTime
      },
      moduleLoaded: !!this.securityModule
    };
  }

  /**
   * 啟用/停用安全管理器
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    
    if (this.securityModule) {
      this.securityModule.setEnabled(enabled);
    }
    
    console.log(`[SecurityManager] Security manager ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 手動退出降級模式
   */
  exitDegradedMode() {
    this.degraded = false;
    this.errorCount = 0;
    console.log('[SecurityManager] Manually exited degraded mode');
  }

  /**
   * 獲取統計資料
   * @returns {Object}
   */
  getStatistics() {
    const uptime = Date.now() - this.stats.startTime;
    const successRate = this.stats.totalRequests > 0 
      ? (this.stats.successfulChecks / this.stats.totalRequests * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      uptime: uptime,
      successRate: parseFloat(successRate),
      averageChecksPerMinute: this.stats.totalRequests / (uptime / 60000)
    };
  }
}

// 導出 SecurityManager
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityManager;
} else if (typeof window !== 'undefined') {
  window.SecurityManager = SecurityManager;
}