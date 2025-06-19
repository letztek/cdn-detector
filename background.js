let cdnDetectionEnabled = false;
let webRequestListener = null;
let beforeRequestListener = null; // 新增：請求開始監聽器
let requestStartTimes = {}; // 新增：追蹤請求開始時間
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
    cacheStatus: null,
    cacheStatusCode: null,
    isHit: null,
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
      
      // 解析快取狀態碼
      const cacheAnalysis = parseAspirappsCDNCacheStatus(viaHeader.value);
      detectionInfo.cacheStatus = cacheAnalysis.status;
      detectionInfo.cacheStatusCode = cacheAnalysis.statusCode;
      detectionInfo.isHit = cacheAnalysis.isHit;
      
      logMessage(`✅ AspirappsCDN detected in Via header: ${viaHeader.value} | Cache Status: ${cacheAnalysis.status} (${cacheAnalysis.statusCode})`, 'info');
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

// 新增：解析 AspirappsCDN Via Header 快取狀態
function parseAspirappsCDNCacheStatus(viaHeaderValue) {
  const result = {
    statusCode: null,
    status: 'Unknown',
    isHit: null,
    rawViaCode: null,
    allViaCodes: []
  };
  
  try {
    // 處理多個 via header 的情況：以逗號分隔
    // 例如：https/1.1 AspirappsCDN (EQ-EDGE/9.2.3 [uScMsSf pSeN:t cCMp sS]), https/1.1 AspirappsCDN (EQ-EDGE/9.2.3 [uScMsSf pSeN:t cCMpSs ])
    const viaHeaders = viaHeaderValue.split(',').map(h => h.trim());
    
    let bestResult = null;
    let foundHit = false;
    
    for (const singleViaHeader of viaHeaders) {
      logMessage(`Processing via header: ${singleViaHeader}`, 'debug');
      
      // 解析 via header 格式：https/1.1 AspirappsCDN (EQ-EDGE/9.2.3 [uScMsSf pSeN:t cCMp sS])
      // 尋找方括號內的 via code
      const viaCodeMatch = singleViaHeader.match(/\[([^\]]+)\]/);
      if (!viaCodeMatch) {
        logMessage(`No via code found in header: ${singleViaHeader}`, 'debug');
        continue;
      }
      
      const viaCode = viaCodeMatch[1];
      result.allViaCodes.push(viaCode);
      logMessage(`Extracted via code: ${viaCode}`, 'debug');
      
      // 分割 via code 為各個部分（以空格分隔）
      const viaCodeParts = viaCode.split(/\s+/);
      if (viaCodeParts.length === 0) {
        logMessage(`Invalid via code format: ${viaCode}`, 'debug');
        continue;
      }
      
      // 檢查第一個部分，第四個字節是快取狀態
      const firstPart = viaCodeParts[0];
      if (firstPart.length >= 4) {
        const cacheStatusCode = firstPart.charAt(3); // 第四個字節 (索引 3)
        
        let currentResult = {
          statusCode: cacheStatusCode,
          status: 'Unknown',
          isHit: null,
          rawViaCode: viaCode
        };
        
        // 根據圖表映射快取狀態
        switch (cacheStatusCode.toLowerCase()) {
          case 'h':
            currentResult.status = 'HIT (fresh)';
            currentResult.isHit = true;
            foundHit = true;
            break;
          case 'm':
            currentResult.status = 'MISS';
            currentResult.isHit = false;
            break;
          case 's':
            currentResult.status = 'MISS (stale)';
            currentResult.isHit = false;
            break;
          case 'a':
            currentResult.status = 'MISS (not acceptable)';
            currentResult.isHit = false;
            break;
          case 'r':
            currentResult.status = 'HIT (fresh RAM hit)';
            currentResult.isHit = true;
            foundHit = true;
            break;
          case ' ':
          case '':
            currentResult.status = 'No cache lookup performed';
            currentResult.isHit = null;
            break;
          default:
            currentResult.status = `Unknown status code: ${cacheStatusCode}`;
            currentResult.isHit = null;
            logMessage(`Unknown cache status code: ${cacheStatusCode} in via code: ${viaCode}`, 'warn');
            break;
        }
        
        logMessage(`Parsed cache status: Code=${cacheStatusCode}, Status=${currentResult.status}, IsHit=${currentResult.isHit}`, 'debug');
        
        // 如果發現 HIT，立即使用此結果
        if (currentResult.isHit === true) {
          bestResult = currentResult;
          break; // 立即跳出循環，優先使用 HIT 結果
        }
        
        // 如果還沒找到 HIT，保存第一個有效結果
        if (!bestResult) {
          bestResult = currentResult;
        }
      } else {
        logMessage(`Via code first part too short: ${firstPart}`, 'debug');
      }
    }
    
    // 使用最佳結果
    if (bestResult) {
      result.statusCode = bestResult.statusCode;
      result.status = bestResult.status;
      result.isHit = bestResult.isHit;
      result.rawViaCode = bestResult.rawViaCode;
      
      // 如果有多個 via codes，在狀態中標註
      if (result.allViaCodes.length > 1) {
        result.status += ` (${result.allViaCodes.length} via headers)`;
        logMessage(`Multiple via headers found, using best result: ${result.status}`, 'debug');
      }
    } else {
      logMessage(`No valid via codes found in header: ${viaHeaderValue}`, 'debug');
    }
    
  } catch (error) {
    logMessage(`Error parsing AspirappsCDN cache status: ${error.message}`, 'error');
  }
  
  return result;
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
  // 新增：健康檢查
  if (message.type === 'ping') {
    sendResponse({ type: 'pong', status: 'ok' });
    return;
  }
  
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
          cdnStats: { 
        cdnCount: 0, 
        nonCdnCount: 0, 
        totalRequests: 0,
        hitCount: 0,
        missCount: 0,
        unknownCacheCount: 0,
        hitTotalSize: 0,
        missTotalSize: 0,
        unknownTotalSize: 0
      }
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
        cdnStats: { 
      cdnCount: 0, 
      nonCdnCount: 0, 
      totalRequests: 0, 
      hitCount: 0,
      missCount: 0,
      unknownCacheCount: 0,
      hitTotalSize: 0,
      missTotalSize: 0,
      unknownTotalSize: 0,
      lastUpdated: new Date().toISOString() 
    }
      });
    });
  }
});

function startListening() {
  if (webRequestListener || beforeRequestListener) {
    logMessage('Listener already active, skipping start', 'warn');
    return;
  }
  
  logMessage('Starting CDN detection listener');
  
  // 新增：監聽請求開始，記錄開始時間
  beforeRequestListener = chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
      try {
        // 跳過 chrome-extension:// 和 data: URLs
        if (details.url.startsWith('chrome-extension://') || details.url.startsWith('data:')) {
          return;
        }
        
        // 跳過無效的標籤頁 ID
        if (details.tabId < 0) {
          return;
        }
        
        // 記錄請求開始時間
        const requestKey = `${details.requestId}_${details.tabId}`;
        requestStartTimes[requestKey] = Date.now();
        
        logMessage(`Request started: ${details.url.substring(0, 100)}... (Tab: ${details.tabId}, RequestId: ${details.requestId})`, 'debug');
      } catch (error) {
        logMessage(`Error recording request start time: ${error.message}`, 'error');
      }
    },
    { urls: ['<all_urls>'] }
  );

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
        
        // 新增：收集 Content-Length
        const contentLengthHeader = headers.find(header => header.name.toLowerCase() === 'content-length');
        const contentLength = contentLengthHeader ? parseInt(contentLengthHeader.value, 10) : null;
        
        // 新增：計算響應時間
        const requestKey = `${details.requestId}_${details.tabId}`;
        const startTime = requestStartTimes[requestKey];
        const responseTime = startTime ? Date.now() - startTime : null;
        
        // 清理已完成的請求時間記錄
        if (requestStartTimes[requestKey]) {
          delete requestStartTimes[requestKey];
        }
        
        // 新增：詳細的檢測日誌（包含標籤頁 ID、快取狀態、檔案大小和響應時間）
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
          cacheStatus: cdnDetection.cacheStatus,
          cacheStatusCode: cdnDetection.cacheStatusCode,
          isHit: cdnDetection.isHit,
          contentLength: contentLength,
          responseTime: responseTime,
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
                    cdnStats: { 
          cdnCount: 0, 
          nonCdnCount: 0, 
          totalRequests: 0,
          hitCount: 0,
          missCount: 0,
          unknownCacheCount: 0,
          hitTotalSize: 0,
          missTotalSize: 0,
          unknownTotalSize: 0,
          lastUpdated: timestamp 
        }
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
          
          // 新增：更新快取狀態統計
          if (cdnDetection.isHit === true) {
            tabData.cdnStats.hitCount++;
            if (contentLength) {
              tabData.cdnStats.hitTotalSize += contentLength;
            }
          } else if (cdnDetection.isHit === false) {
            tabData.cdnStats.missCount++;
            if (contentLength) {
              tabData.cdnStats.missTotalSize += contentLength;
            }
          } else {
            tabData.cdnStats.unknownCacheCount++;
            if (contentLength) {
              tabData.cdnStats.unknownTotalSize += contentLength;
            }
          }
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
            hitCount: 0,
            missCount: 0,
            unknownCacheCount: 0,
            hitTotalSize: 0,
            missTotalSize: 0,
            unknownTotalSize: 0,
            lastUpdated: timestamp,
            totalRequests: 0
          };

          stats.totalRequests++;
          stats.lastUpdated = timestamp;

          if (cdnDetection.isCDN) {
            stats.cdnCount++;
            
            // 新增：更新全域快取狀態統計
            if (cdnDetection.isHit === true) {
              stats.hitCount++;
              if (contentLength) {
                stats.hitTotalSize += contentLength;
              }
            } else if (cdnDetection.isHit === false) {
              stats.missCount++;
              if (contentLength) {
                stats.missTotalSize += contentLength;
              }
            } else {
              stats.unknownCacheCount++;
              if (contentLength) {
                stats.unknownTotalSize += contentLength;
              }
            }
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
  if (!webRequestListener && !beforeRequestListener) return;

  if (webRequestListener) {
    chrome.webRequest.onCompleted.removeListener(webRequestListener);
    webRequestListener = null;
  }
  
  if (beforeRequestListener) {
    chrome.webRequest.onBeforeRequest.removeListener(beforeRequestListener);
    beforeRequestListener = null;
  }
  
  // 清理請求時間記錄
  requestStartTimes = {};
  
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