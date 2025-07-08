/**
 * 圖標管理器 - 統一管理擴充功能圖標狀態
 * 
 * 解決架構重組後的圖標路徑問題，提供穩定的圖標切換功能
 */

class IconManager {
    constructor() {
        this.icons = {
            default: '../../icon.png'
            // 移除綠色和紅色圖標引用 - 用戶要求始終使用默認圖標
        };
        
        this.currentIcon = 'default';
        this.isEnabled = true;
        
        this.log('IconManager initialized', 'info');
    }

    /**
     * 設置圖標為綠色 (檢測到 CDN) - 已停用，保持默認圖標
     * @param {number} tabId - 標籤頁 ID (可選)
     */
    async setGreenIcon(tabId = null) {
        // 保持使用默認圖標，不切換到綠色
        await this.setDefaultIcon(tabId);
        this.log(`CDN detected, keeping default icon${tabId ? ` for tab ${tabId}` : ''}`, 'info');
    }

    /**
     * 設置圖標為紅色 (未檢測到 CDN) - 已停用，保持默認圖標
     * @param {number} tabId - 標籤頁 ID (可選)
     */
    async setRedIcon(tabId = null) {
        // 保持使用默認圖標，不切換到紅色
        await this.setDefaultIcon(tabId);
        this.log(`No CDN detected, keeping default icon${tabId ? ` for tab ${tabId}` : ''}`, 'info');
    }

    /**
     * 設置圖標為默認狀態
     * @param {number} tabId - 標籤頁 ID (可選)
     */
    async setDefaultIcon(tabId = null) {
        if (!this.isEnabled) return;
        
        try {
            const iconConfig = { path: this.icons.default };
            if (tabId) {
                iconConfig.tabId = tabId;
            }
            
            await chrome.action.setIcon(iconConfig);
            this.currentIcon = 'default';
            this.log(`Icon set to default${tabId ? ` for tab ${tabId}` : ''}`, 'info');
        } catch (error) {
            this.log(`Failed to set default icon: ${error.message}`, 'error');
        }
    }

    /**
     * 根據 CDN 檢測結果自動設置圖標 - 始終保持默認圖標
     * @param {boolean} hasCDN - 是否檢測到 CDN
     * @param {number} tabId - 標籤頁 ID (可選)
     */
    async updateIconForCDNStatus(hasCDN, tabId = null) {
        // 無論檢測結果如何，都保持默認圖標
        await this.setDefaultIcon(tabId);
        this.log(`CDN status: ${hasCDN ? 'detected' : 'not detected'}, keeping default icon${tabId ? ` for tab ${tabId}` : ''}`, 'info');
    }

    /**
     * 根據 CDN 統計數據設置圖標 - 始終保持默認圖標
     * @param {Object} stats - CDN 統計數據
     * @param {number} tabId - 標籤頁 ID (可選)
     */
    async updateIconForStats(stats, tabId = null) {
        // 無論統計數據如何，都保持默認圖標
        await this.setDefaultIcon(tabId);
        
        if (stats) {
            const hasCDN = stats.cdnCount > 0;
            this.log(`Stats updated - CDN count: ${stats.cdnCount}, keeping default icon${tabId ? ` for tab ${tabId}` : ''}`, 'info');
        } else {
            this.log(`No stats available, keeping default icon${tabId ? ` for tab ${tabId}` : ''}`, 'info');
        }
    }

    /**
     * 驗證圖標文件是否存在
     * @returns {Promise<Object>} 驗證結果
     */
    async validateIcons() {
        const results = {};
        
        // 只驗證默認圖標
        try {
            const url = chrome.runtime.getURL(this.icons.default);
            const response = await fetch(url);
            results.default = {
                path: this.icons.default,
                exists: response.ok,
                url: url
            };
        } catch (error) {
            results.default = {
                path: this.icons.default,
                exists: false,
                error: error.message
            };
        }
        
        return results;
    }

    /**
     * 修復圖標路徑 (如果需要)
     * @param {Object} customPaths - 自定義路徑
     */
    updateIconPaths(customPaths) {
        this.icons = { ...this.icons, ...customPaths };
        this.log('Icon paths updated', 'info');
    }

    /**
     * 啟用/停用圖標管理器
     * @param {boolean} enabled - 是否啟用
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        this.log(`IconManager ${enabled ? 'enabled' : 'disabled'}`, 'info');
    }

    /**
     * 獲取當前圖標狀態
     * @returns {Object} 當前狀態
     */
    getStatus() {
        return {
            currentIcon: this.currentIcon,
            isEnabled: this.isEnabled,
            iconPath: this.icons.default,
            alwaysDefault: true // 標記始終使用默認圖標
        };
    }

    /**
     * 重置圖標到默認狀態
     */
    async reset() {
        await this.setDefaultIcon();
        this.log('Icon reset to default', 'info');
    }

    /**
     * 日誌記錄
     * @param {string} message - 日誌消息
     * @param {string} level - 日誌級別
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[IconManager][${level.toUpperCase()}] ${timestamp}: ${message}`;
        
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
const iconManager = new IconManager();

// 如果在 Chrome 擴展環境中，初始化默認圖標
if (typeof chrome !== 'undefined' && chrome.runtime) {
    // 延遲初始化，確保擴展完全載入
    setTimeout(() => {
        iconManager.setDefaultIcon().catch(error => {
            iconManager.log(`Failed to initialize default icon: ${error.message}`, 'error');
        });
    }, 1000);

    // 監聽來自其他腳本的圖標設置請求
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'ICON_MANAGER_COMMAND') {
            switch (request.command) {
                case 'setGreen':
                    iconManager.setGreenIcon(request.tabId).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    break;
                case 'setRed':
                    iconManager.setRedIcon(request.tabId).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    break;
                case 'setDefault':
                    iconManager.setDefaultIcon(request.tabId).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    break;
                case 'updateForStats':
                    iconManager.updateIconForStats(request.stats, request.tabId).then(() => {
                        sendResponse({ success: true });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                    break;
                case 'getStatus':
                    sendResponse(iconManager.getStatus());
                    break;
                case 'validateIcons':
                    iconManager.validateIcons().then(results => {
                        sendResponse(results);
                    }).catch(error => {
                        sendResponse({ error: error.message });
                    });
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
    module.exports = IconManager;
} else if (typeof window !== 'undefined') {
    window.IconManager = IconManager;
    window.iconManager = iconManager;
}