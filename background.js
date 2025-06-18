let cdnDetectionEnabled = false;
let webRequestListener = null;
let detectionLog = []; // 新增：存儲檢測日誌
let currentTabId = null; // 新增：當前活躍標籤頁 ID
let tabDetectionData = {}; // 新增：按標籤頁分組的檢測資料

// 新增：日誌記錄函數
function logMessage(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logEntry);
  
  // 將日誌保存到 chrome.storage 供後續分析使用
  chrome.storage.local.get(['debugLogs'], (result) => {
    const logs = result.debugLogs || [];
    logs.push(logEntry);
    
    // 保持最近 1000 條日誌
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    chrome.storage.local.set({ debugLogs: logs });
  });
}

// 新增：獲取資源類型
function getResourceType(url) {
  const extension = url.split('.').pop().toLowerCase().split('?')[0];
  
  if (['js', 'mjs'].includes(extension)) return 'JavaScript';
  if (['css'].includes(extension)) return 'CSS';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(extension)) return 'Image';
  if (['woff', 'woff2', 'ttf', 'otf'].includes(extension)) return 'Font';
  if (['mp4', 'webm', 'ogg', 'avi'].includes(extension)) return 'Video';
  if (['mp3', 'wav', 'ogg', 'aac'].includes(extension)) return 'Audio';
  if (['json', 'xml'].includes(extension)) return 'Data';
  if (['html', 'htm'].includes(extension)) return 'Document';
  
  return 'Other';
}

// 新增：獲取域名
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return 'Unknown';
  }
}

// 新增：增強的 CDN 檢測邏輯
function detectCDN(headers, url) {
  const detectionInfo = {
    isCDN: false,
    cdnType: null,
    viaHeader: null,
    serverHeader: null,
    cacheHeaders: {},
    detectionReason: 'No CDN detected'
  };
  
  // 檢查 Via header（主要檢測方法）
  const viaHeader = headers.find(header => header.name.toLowerCase() === 'via');
  if (viaHeader) {
    detectionInfo.viaHeader = viaHeader.value;
    logMessage(`Via header found: ${viaHeader.value}`, 'debug');
    
    // 檢測 AspirappsCDN（不區分大小寫）
    if (viaHeader.value.toLowerCase().includes('aspirappscdn')) {
      detectionInfo.isCDN = true;
      detectionInfo.cdnType = 'AspirappsCDN';
      detectionInfo.detectionReason = 'Via header contains AspirappsCDN';
      logMessage(`✅ AspirappsCDN detected in Via header: ${viaHeader.value}`, 'info');
    }
  }
  
  // 檢查其他可能的 CDN 指標 headers
  const relevantHeaders = ['server', 'x-cache', 'x-served-by', 'x-cdn', 'cf-ray', 'x-amz-cf-id'];
  headers.forEach(header => {
    const headerName = header.name.toLowerCase();
    if (relevantHeaders.includes(headerName)) {
      detectionInfo.cacheHeaders[headerName] = header.value;
      
      // 檢查 server header 中是否有 CDN 指標
      if (headerName === 'server' && header.value.toLowerCase().includes('aspirappscdn')) {
        detectionInfo.isCDN = true;
        detectionInfo.cdnType = 'AspirappsCDN';
        detectionInfo.serverHeader = header.value;
        detectionInfo.detectionReason = 'Server header contains AspirappsCDN';
      }
    }
  });
  
  return detectionInfo;
}

// 初始化監聽狀態 - 預設啟用
chrome.storage.local.get('cdnDetectionEnabled', (result) => {
  if (chrome.runtime.lastError) {
    console.error('Failed to initialize detection state:', chrome.runtime.lastError);
    return;
  }
  
  // 預設啟用，只有明確設定為 false 才關閉
  cdnDetectionEnabled = result.cdnDetectionEnabled !== false;
  
  // 如果是第一次安裝（沒有存儲值），設定為 true
  if (result.cdnDetectionEnabled === undefined) {
    chrome.storage.local.set({ cdnDetectionEnabled: true }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to set default detection state:', chrome.runtime.lastError);
      }
    });
    cdnDetectionEnabled = true;
  }
  
  logMessage(`CDN Detection initialized: ${cdnDetectionEnabled ? 'Enabled' : 'Disabled'}`);
  
  if (cdnDetectionEnabled) {
    startListening();
  }
});

// 新增：監聽標籤頁變化
chrome.tabs.onActivated.addListener((activeInfo) => {
  currentTabId = activeInfo.tabId;
  logMessage(`Tab activated: ${currentTabId}`, 'debug');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tabId === currentTabId) {
    logMessage(`Tab updated: ${tabId} - ${tab.url}`, 'debug');
  }
});

// 新增：獲取當前標籤頁資訊
function getCurrentTabInfo(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to get current tab:', chrome.runtime.lastError);
      callback(null);
      return;
    }
    
    if (tabs.length > 0) {
      const tab = tabs[0];
      currentTabId = tab.id;
      callback(tab);
    } else {
      callback(null);
    }
  });
}

// 監聽開關狀態變化
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggleDetection') {
    cdnDetectionEnabled = message.enabled;
    chrome.storage.local.set({ cdnDetectionEnabled }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to save detection state:', chrome.runtime.lastError);
        return;
      }
    });
    
    logMessage(`CDN Detection toggled: ${cdnDetectionEnabled ? 'Enabled' : 'Disabled'}`);

    if (cdnDetectionEnabled) {
      startListening();
    } else {
      stopListening();
    }
  }
  
  // 新增：處理獲取當前標籤頁檢測結果的請求
  if (message.type === 'getCurrentTabDetection') {
    getCurrentTabInfo((tab) => {
      if (tab) {
        const tabData = tabDetectionData[tab.id] || {
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          detectionLog: [],
          cdnStats: { cdnCount: 0, nonCdnCount: 0, totalRequests: 0 }
        };
        sendResponse({
          type: 'currentTabDetectionResponse',
          data: tabData
        });
      } else {
        sendResponse({
          type: 'currentTabDetectionResponse',
          error: 'No active tab found',
          data: null
        });
      }
    });
    return true; // 保持 sendResponse 活躍
  }
  
  // 新增：處理獲取日誌的請求
  if (message.type === 'getDetectionLog') {
    chrome.storage.local.get(['detectionLog'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to get detection log:', chrome.runtime.lastError);
        sendResponse({
          type: 'detectionLogResponse',
          error: chrome.runtime.lastError.message,
          data: []
        });
        return;
      }
      
      sendResponse({
        type: 'detectionLogResponse',
        data: result.detectionLog || []
      });
    });
    return true; // 保持 sendResponse 活躍
  }
  
  // 新增：處理清除日誌的請求
  if (message.type === 'clearDetectionLog') {
    chrome.storage.local.remove(['detectionLog', 'debugLogs'], () => {
      logMessage('Detection log cleared');
      // 重置統計
      chrome.storage.local.set({ 
        cdnStats: { cdnCount: 0, nonCdnCount: 0, totalRequests: 0, lastUpdated: new Date().toISOString() }
      });
    });
  }
});

function startListening() {
  if (webRequestListener) {
    logMessage('Listener already active, skipping start', 'warn');
    return;
  }
  
  logMessage('Starting CDN detection listener');

  webRequestListener = chrome.webRequest.onCompleted.addListener(
    function (details) {
      try {
        const url = details.url;
        const domain = getDomain(url);
        const resourceType = getResourceType(url);
        const timestamp = new Date().toISOString();
        const tabId = details.tabId;
        
        // 跳過 chrome-extension:// 和 data: URLs
        if (url.startsWith('chrome-extension://') || url.startsWith('data:')) {
          return;
        }
        
        // 跳過無效的標籤頁 ID
        if (tabId < 0) {
          return;
        }
        
        logMessage(`Checking resource: ${url.substring(0, 100)}... [${resourceType}] from ${domain} (Tab: ${tabId})`, 'debug');
        
        const headers = details.responseHeaders || [];
        const cdnDetection = detectCDN(headers, url);
        
        // 新增：詳細的檢測日誌（包含標籤頁 ID）
        const detectionResult = {
          timestamp,
          url,
          domain,
          resourceType,
          statusCode: details.statusCode,
          method: details.method,
          headers: cdnDetection.cacheHeaders,
          isCDN: cdnDetection.isCDN,
          cdnType: cdnDetection.cdnType,
          viaHeader: cdnDetection.viaHeader,
          serverHeader: cdnDetection.serverHeader,
          detectionReason: cdnDetection.detectionReason,
          tabId: tabId
        };
        
        // 記錄檢測結果
        if (cdnDetection.isCDN) {
          logMessage(`✅ CDN DETECTED: ${domain} - ${cdnDetection.detectionReason} (Tab: ${tabId})`, 'info');
        } else {
          logMessage(`❌ No CDN: ${domain} - ${cdnDetection.detectionReason} (Tab: ${tabId})`, 'debug');
        }
        
        // 初始化標籤頁資料結構（如果不存在）
        if (!tabDetectionData[tabId]) {
          tabDetectionData[tabId] = {
            tabId: tabId,
            url: '',
            title: '',
            detectionLog: [],
            cdnStats: { cdnCount: 0, nonCdnCount: 0, totalRequests: 0, lastUpdated: timestamp }
          };
        }
        
        // 更新標籤頁資訊
        chrome.tabs.get(tabId, (tab) => {
          if (!chrome.runtime.lastError && tab) {
            tabDetectionData[tabId].url = tab.url;
            tabDetectionData[tabId].title = tab.title;
          }
        });
        
        // 更新標籤頁檢測日誌
        const tabData = tabDetectionData[tabId];
        tabData.detectionLog.push(detectionResult);
        
        // 保持最近 100 條記錄（每個標籤頁）
        if (tabData.detectionLog.length > 100) {
          tabData.detectionLog.splice(0, tabData.detectionLog.length - 100);
        }
        
        // 更新標籤頁統計資料
        if (cdnDetection.isCDN) {
          tabData.cdnStats.cdnCount++;
        } else {
          tabData.cdnStats.nonCdnCount++;
        }
        tabData.cdnStats.totalRequests++;
        tabData.cdnStats.lastUpdated = timestamp;
        
        // 同時保存到全域日誌（向後相容）
        chrome.storage.local.get(['detectionLog'], (result) => {
          const log = result.detectionLog || [];
          log.push(detectionResult);
          
          // 保持最近 500 條檢測記錄
          if (log.length > 500) {
            log.splice(0, log.length - 500);
          }
          
          chrome.storage.local.set({ detectionLog: log });
        });

        // 更新圖標狀態（基於當前標籤頁的 CDN 檢測結果）
        if (cdnDetection.isCDN) {
          chrome.action.setIcon({ path: 'icon-green.png' });
          logMessage(`CDN count updated for tab ${tabId}: ${tabData.cdnStats.cdnCount}/${tabData.cdnStats.totalRequests} (${((tabData.cdnStats.cdnCount/tabData.cdnStats.totalRequests)*100).toFixed(1)}%)`, 'info');
        } else {
          // 只有在該標籤頁沒有檢測到任何 CDN 時才顯示紅色圖標
          if (tabData.cdnStats.cdnCount === 0) {
            chrome.action.setIcon({ path: 'icon-red.png' });
          }
        }
        
        // 更新全域統計（向後相容）
        chrome.storage.local.get(['cdnStats'], (result) => {
          const stats = result.cdnStats || { 
            cdnCount: 0, 
            nonCdnCount: 0,
            lastUpdated: timestamp,
            totalRequests: 0
          };

          stats.totalRequests++;
          stats.lastUpdated = timestamp;

          if (cdnDetection.isCDN) {
            stats.cdnCount++;
          } else {
            stats.nonCdnCount++;
          }

          chrome.storage.local.set({ cdnStats: stats });
        });
        
      } catch (error) {
        logMessage(`Error processing request: ${error.message}`, 'error');
        console.error('CDN Detection Error:', error);
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
  
  logMessage('CDN detection listener started successfully');
}

function stopListening() {
  if (!webRequestListener) return;

  chrome.webRequest.onCompleted.removeListener(webRequestListener);
  webRequestListener = null;
  chrome.action.setIcon({ path: 'icon-red.png' });
  
  logMessage('CDN detection listener stopped');
}

// 新增：定期清理舊日誌（每小時執行一次）
setInterval(() => {
  chrome.storage.local.get(['detectionLog', 'debugLogs'], (result) => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // 清理超過 24 小時的檢測日誌
    if (result.detectionLog) {
      const filteredLog = result.detectionLog.filter(entry => 
        new Date(entry.timestamp) > oneDayAgo
      );
      
      if (filteredLog.length !== result.detectionLog.length) {
        chrome.storage.local.set({ detectionLog: filteredLog });
        logMessage(`Cleaned up old detection logs. Kept ${filteredLog.length} recent entries.`);
      }
    }
  });
}, 60 * 60 * 1000); // 每小時執行一次 