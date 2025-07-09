// edu.tw 安全標頭檢測測試腳本
let testResults = document.getElementById('testResults');
let eduTwTabId = null;

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `test-result ${type}`;
    logEntry.innerHTML = `<strong>[${timestamp}]</strong> ${message}`;
    testResults.appendChild(logEntry);
    console.log(`[${timestamp}] ${message}`);
    
    // 自動滾動到底部
    testResults.scrollTop = testResults.scrollHeight;
}

function formatJSON(obj) {
    return `<pre>${JSON.stringify(obj, null, 2)}</pre>`;
}

function clearResults() {
    testResults.innerHTML = '';
}

// Test www.edu.tw
async function testEduTw() {
    log('🌐 開始測試 www.edu.tw...', 'info');
    
    try {
        // 開啟 edu.tw 頁面
        const tab = await chrome.tabs.create({ 
            url: 'https://www.edu.tw', 
            active: false 
        });
        
        eduTwTabId = tab.id;
        log(`✅ 已開啟 edu.tw 標籤頁 ${tab.id}`, 'success');
        
        // 等待頁面載入
        log('⏳ 等待頁面載入 (5秒)...', 'info');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 檢查是否收集到安全資料
        log('🔍 檢查是否收集到安全資料...', 'info');
        const response = await chrome.runtime.sendMessage({
            type: 'GET_SECURITY_DATA',
            tabId: tab.id
        });
        
        if (response.success && response.data) {
            log('✅ 成功檢測到安全資料！', 'success');
            log(`安全資料: ${formatJSON(response.data)}`, 'info');
            
            // 分析安全資料
            const data = response.data;
            if (data.history && data.history.length > 0) {
                const latest = data.history[data.history.length - 1];
                log(`📊 最新檢測結果: 分數 ${latest.score}/100, 等級 ${latest.level}`, 'info');
                
                if (latest.headers) {
                    let headerCount = 0;
                    if (latest.headers.csp && latest.headers.csp.present) headerCount++;
                    if (latest.headers.frameProtection && latest.headers.frameProtection.present) headerCount++;
                    if (latest.headers.contentType && latest.headers.contentType.present) headerCount++;
                    if (latest.headers.hsts && latest.headers.hsts.present) headerCount++;
                    
                    log(`🔒 檢測到 ${headerCount} 個安全標頭`, 'info');
                }
            }
        } else {
            log('⚠️ 未檢測到安全資料', 'warning');
            log(`錯誤: ${response.error || '未知錯誤'}`, 'error');
            
            // 嘗試再次檢測
            log('🔄 嘗試再次檢測...', 'info');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const retryResponse = await chrome.runtime.sendMessage({
                type: 'GET_SECURITY_DATA',
                tabId: tab.id
            });
            
            if (retryResponse.success && retryResponse.data) {
                log('✅ 重試成功檢測到安全資料！', 'success');
                log(`安全資料: ${formatJSON(retryResponse.data)}`, 'info');
            } else {
                log('❌ 重試仍然失敗', 'error');
            }
        }
        
    } catch (error) {
        log(`❌ 測試失敗: ${error.message}`, 'error');
    }
}

// Manual test www.edu.tw
async function testEduTwManual() {
    log('🔧 手動檢測 www.edu.tw...', 'info');
    
    try {
        if (!eduTwTabId) {
            log('⚠️ 請先運行 "測試 www.edu.tw" 以創建標籤頁', 'warning');
            return;
        }
        
        // 手動觸發安全檢測
        const response = await chrome.runtime.sendMessage({
            type: 'MANUAL_SECURITY_CHECK',
            tabId: eduTwTabId,
            url: 'https://www.edu.tw'
        });
        
        if (response.success && response.result) {
            log('✅ 手動檢測成功！', 'success');
            log(`檢測結果: ${formatJSON(response.result)}`, 'info');
        } else {
            log('❌ 手動檢測失敗', 'error');
            log(`錯誤: ${response.error || '未知錯誤'}`, 'error');
        }
        
    } catch (error) {
        log(`❌ 手動檢測錯誤: ${error.message}`, 'error');
    }
}

// Check system status
async function checkSystemStatus() {
    log('⚙️ 檢查系統狀態...', 'info');
    
    try {
        // 檢查擴展基本資訊
        const manifest = chrome.runtime.getManifest();
        log(`擴展: ${manifest.name} v${manifest.version}`, 'info');
        
        // 檢查權限
        const permissions = manifest.permissions || [];
        log(`權限: ${permissions.join(', ')}`, 'info');
        
        // 檢查 webRequest 權限
        if (permissions.includes('webRequest')) {
            log('✅ webRequest 權限已啟用', 'success');
        } else {
            log('❌ webRequest 權限缺失', 'error');
        }
        
        // 檢查 host_permissions
        const hostPermissions = manifest.host_permissions || [];
        log(`主機權限: ${hostPermissions.join(', ')}`, 'info');
        
        if (hostPermissions.includes('<all_urls>')) {
            log('✅ 所有 URL 權限已啟用', 'success');
        } else {
            log('❌ 缺少完整 URL 權限', 'error');
        }
        
        log('✅ 系統狀態檢查完成', 'success');
        
    } catch (error) {
        log(`❌ 系統狀態檢查失敗: ${error.message}`, 'error');
    }
}

// Check SecurityManager
async function checkSecurityManager() {
    log('🛡️ 檢查安全管理器...', 'info');
    
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_SECURITY_STATUS' });
        
        if (response && response.success) {
            log('✅ 安全管理器狀態獲取成功', 'success');
            log(`狀態: ${formatJSON(response.status)}`, 'info');
            
            const status = response.status;
            if (status.enabled) {
                log('✅ 安全管理器已啟用', 'success');
            } else {
                log('❌ 安全管理器未啟用', 'error');
            }
            
            if (status.degraded) {
                log('⚠️ 安全管理器處於降級模式', 'warning');
            }
            
            if (status.moduleLoaded) {
                log('✅ 安全模組已載入', 'success');
            } else {
                log('❌ 安全模組未載入', 'error');
            }
            
            // 檢查統計資料
            if (status.stats) {
                log(`📊 統計: 總請求 ${status.stats.totalRequests}, 成功 ${status.stats.successfulChecks}, 錯誤 ${status.stats.errors}`, 'info');
            }
            
        } else {
            log('❌ 無法獲取安全管理器狀態', 'error');
            log(`錯誤: ${response?.error || '未知錯誤'}`, 'error');
        }
        
    } catch (error) {
        log(`❌ 安全管理器檢查失敗: ${error.message}`, 'error');
    }
}

// Check storage data
async function checkStorageData() {
    log('💾 檢查存儲資料...', 'info');
    
    try {
        const result = await chrome.storage.local.get(null);
        
        // 過濾安全相關資料
        const securityData = {};
        Object.keys(result).forEach(key => {
            if (key.startsWith('security_')) {
                securityData[key] = result[key];
            }
        });
        
        log('✅ 存儲資料檢查完成', 'success');
        log(`安全存儲條目: ${Object.keys(securityData).length}`, 'info');
        
        if (Object.keys(securityData).length > 0) {
            log(`安全資料: ${formatJSON(securityData)}`, 'info');
            
            // 分析每個標籤頁的資料
            Object.keys(securityData).forEach(key => {
                const data = securityData[key];
                if (data.history && data.history.length > 0) {
                    const latest = data.history[data.history.length - 1];
                    log(`📊 標籤頁 ${data.tabId}: 分數 ${latest.score}/100, URL: ${latest.url}`, 'info');
                }
            });
        } else {
            log('⚠️ 未找到安全存儲資料', 'warning');
        }
        
    } catch (error) {
        log(`❌ 存儲資料檢查失敗: ${error.message}`, 'error');
    }
}

// Check debug logs
async function checkDebugLogs() {
    log('📝 檢查調試日誌...', 'info');
    
    try {
        const result = await chrome.storage.local.get(['debugLogs']);
        const logs = result.debugLogs || [];
        
        log(`✅ 獲取到 ${logs.length} 條調試日誌`, 'success');
        
        if (logs.length > 0) {
            // 過濾安全相關日誌
            const securityLogs = logs.filter(log => 
                log.includes('Security') || 
                log.includes('security') || 
                log.includes('edu.tw')
            );
            
            log(`🔍 找到 ${securityLogs.length} 條安全相關日誌`, 'info');
            
            if (securityLogs.length > 0) {
                const recentSecurityLogs = securityLogs.slice(-10);
                log(`最近安全日誌: ${formatJSON(recentSecurityLogs)}`, 'info');
            }
            
            // 顯示最近的日誌
            const recentLogs = logs.slice(-5);
            log(`最近日誌: ${formatJSON(recentLogs)}`, 'info');
            
        } else {
            log('⚠️ 未找到調試日誌', 'warning');
        }
        
    } catch (error) {
        log(`❌ 調試日誌檢查失敗: ${error.message}`, 'error');
    }
}

// Simulate edu.tw request
async function simulateEduTw() {
    log('🧪 模擬 edu.tw 請求...', 'info');
    
    try {
        // 模擬 edu.tw 的響應標頭
        const simulatedDetails = {
            url: 'https://www.edu.tw',
            type: 'main_frame',
            tabId: 9999, // 模擬標籤頁 ID
            responseHeaders: [
                { name: 'Content-Security-Policy', value: 'default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\';' },
                { name: 'X-Frame-Options', value: 'SAMEORIGIN' },
                { name: 'X-Content-Type-Options', value: 'nosniff' },
                { name: 'X-XSS-Protection', value: '1; mode=block' },
                { name: 'Server', value: 'Apache/2.4.41 (Ubuntu)' },
                { name: 'Content-Type', value: 'text/html; charset=UTF-8' }
            ]
        };
        
        log('📡 發送模擬請求...', 'info');
        log(`模擬資料: ${formatJSON(simulatedDetails)}`, 'info');
        
        const response = await chrome.runtime.sendMessage({
            type: 'SIMULATE_SECURITY_REQUEST',
            details: simulatedDetails
        });
        
        if (response.success && response.result) {
            log('✅ 模擬請求成功！', 'success');
            log(`模擬結果: ${formatJSON(response.result)}`, 'info');
            
            const result = response.result;
            if (result) {
                log(`📊 模擬檢測: 分數 ${result.score}/100, 等級 ${result.level}`, 'info');
                
                if (result.headers) {
                    let headerCount = 0;
                    if (result.headers.csp && result.headers.csp.present) headerCount++;
                    if (result.headers.frameProtection && result.headers.frameProtection.present) headerCount++;
                    if (result.headers.contentType && result.headers.contentType.present) headerCount++;
                    
                    log(`🔒 模擬檢測到 ${headerCount} 個安全標頭`, 'info');
                }
            }
        } else {
            log('❌ 模擬請求失敗', 'error');
            log(`錯誤: ${response.error || '未知錯誤'}`, 'error');
        }
        
    } catch (error) {
        log(`❌ 模擬請求錯誤: ${error.message}`, 'error');
    }
}

// 初始化事件監聽器
document.addEventListener('DOMContentLoaded', () => {
    log('🎯 edu.tw 安全標頭檢測測試工具已載入', 'info');
    log('這個工具專門用於測試 www.edu.tw 的安全檢測功能', 'info');
    
    // 綁定事件監聽器
    document.getElementById('testEduTw').addEventListener('click', testEduTw);
    document.getElementById('testEduTwManual').addEventListener('click', testEduTwManual);
    document.getElementById('checkSystemStatus').addEventListener('click', checkSystemStatus);
    document.getElementById('checkSecurityManager').addEventListener('click', checkSecurityManager);
    document.getElementById('checkStorageData').addEventListener('click', checkStorageData);
    document.getElementById('checkDebugLogs').addEventListener('click', checkDebugLogs);
    document.getElementById('simulateEduTw').addEventListener('click', simulateEduTw);
    document.getElementById('clearResults').addEventListener('click', clearResults);
});

// 頁面關閉前清理
window.addEventListener('beforeunload', async () => {
    if (eduTwTabId) {
        try {
            await chrome.tabs.remove(eduTwTabId);
        } catch (error) {
            // 忽略錯誤
        }
    }
});