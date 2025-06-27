document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM loaded, initializing...');
  
  // 檢查 Chrome API 是否可用
  if (typeof chrome === 'undefined' || !chrome.storage) {
    console.error('Chrome APIs not available');
    document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Chrome APIs 無法訪問<br><small>請重新載入擴充功能</small></div>';
    return;
  }

  // 初始化標籤頁功能
  initializeTabs();

  const enableToggle = document.getElementById('enableToggle');
  const detectionStatus = document.getElementById('detectionStatus');
  const detectionResult = document.getElementById('detectionResult');

  if (!enableToggle || !detectionStatus || !detectionResult) {
    console.error('Required DOM elements not found');
    return;
  }

  // 設置初始載入狀態
  detectionStatus.textContent = '初始化中...';
  detectionResult.textContent = '載入中...';

  // 使用 Promise 包裝初始化邏輯，提供更好的錯誤處理
  Promise.resolve().then(() => {
    // 先檢查 background script 是否正常運行
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Background script not responding:', chrome.runtime.lastError);
          reject(new Error('Background script 未響應，請重新載入擴充功能'));
          return;
        }
        resolve();
      });
    });
  }).then(() => {
    // 初始化開關狀態 - 預設啟用
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['cdnDetectionEnabled'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Storage access error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }

        // 預設啟用，只有明確設定為 false 才關閉
        const isEnabled = result.cdnDetectionEnabled !== false;
        enableToggle.checked = isEnabled;
        updateDetectionStatus(isEnabled);
        resolve(isEnabled);
      });
    });
  }).then((isEnabled) => {
    console.log('Toggle initialized, enabled:', isEnabled);
    
    // 載入當前標籤頁的檢測結果
    return loadCurrentTabDetection();
  }).then(() => {
    console.log('Current tab detection loaded');
    
    // 監聽開關變化
    enableToggle.addEventListener('change', () => {
      const isEnabled = enableToggle.checked;
      chrome.storage.local.set({ cdnDetectionEnabled: isEnabled }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to save setting:', chrome.runtime.lastError);
          return;
        }
        updateDetectionStatus(isEnabled);

        // 通知 background.js 更新狀態
        chrome.runtime.sendMessage({ type: 'toggleDetection', enabled: isEnabled });
      });
    });

    // 新增：顯示檢測日誌功能
    displayDetectionLog();
    
    // 啟用影片品質監控
    initializeVideoQuality();
    
    // 設置 QoE Dashboard 按鈕事件監聽器
    const qoeDashboardBtn = document.getElementById('openQoEDashboard');
    if (qoeDashboardBtn) {
      qoeDashboardBtn.addEventListener('click', openQoEDashboard);
      console.log('QoE Dashboard button event listener added');
    } else {
      console.warn('QoE Dashboard button not found');
    }
    
    // 設置自動刷新間隔 - 提高頻率以實現即時顯示
    // 只有在 popup 打開時才刷新，避免持續請求導致通信錯誤
    let refreshInterval = null;
    
    // 監聽 popup 的可見性變化
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log('Popup hidden, stopped auto-refresh');
      } else if (!document.hidden && !refreshInterval) {
        refreshInterval = setInterval(() => {
      loadCurrentTabDetection(); // 改為載入當前標籤頁數據
      refreshDetectionLog();
          // 即時更新影片品質數據
          if (document.getElementById('videoStatusIndicator')?.classList.contains('active')) {
            refreshVideoQuality();
          }
        }, 1000); // 提高到每1秒刷新一次以實現即時顯示
        console.log('Popup visible, started auto-refresh');
      }
    });
    
    // 初始啟動自動刷新
    refreshInterval = setInterval(() => {
      loadCurrentTabDetection();
      refreshDetectionLog();
      // 即時更新影片品質數據
      if (document.getElementById('videoStatusIndicator')?.classList.contains('active')) {
        refreshVideoQuality();
      }
    }, 1000); // 提高到每1秒刷新一次以實現即時顯示
    
    console.log('Popup initialization completed');
    
    // 添加 popup 卸載時的清理邏輯
    window.addEventListener('beforeunload', () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log('Popup unloading, cleared refresh interval');
      }
    });
    
    // 確保狀態已更新
    const detectionStatus = document.getElementById('detectionStatus');
    const detectionResult = document.getElementById('detectionResult');
    if (detectionStatus && detectionStatus.textContent === '初始化中...') {
      detectionStatus.textContent = '監聽中';
      detectionStatus.style.color = '#28a745';
    }
    if (detectionResult && detectionResult.textContent === '載入中...') {
      detectionResult.textContent = '等待檢測資料...';
    }
  }).catch((error) => {
    console.error('Popup initialization failed:', error);
    detectionStatus.textContent = '初始化失敗';
    detectionResult.textContent = `錯誤: ${error.message || error}`;
  });
});



// 新增：載入當前標籤頁檢測結果（帶重試機制和超時）
function loadCurrentTabDetection(retryCount = 0) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime) {
      console.log('Chrome runtime not available, using default stats');
      updateDetectionResult({ 
        cdnCount: 0, 
        nonCdnCount: 0, 
        totalRequests: 0,
        hitCount: 0,
        missCount: 0,
        unknownCacheCount: 0,
        hitTotalSize: 0,
        missTotalSize: 0,
        unknownTotalSize: 0
      });
      resolve(null);
      return;
    }
    
    const maxRetries = 3;
    const retryDelay = 500; // 500ms
    const timeout = 3000; // 3秒超時
    
    // 設置超時處理
    const timeoutId = setTimeout(() => {
      console.log('loadCurrentTabDetection timeout, using default stats');
      updateDetectionResult({ 
        cdnCount: 0, 
        nonCdnCount: 0, 
        totalRequests: 0,
        hitCount: 0,
        missCount: 0,
        unknownCacheCount: 0,
        hitTotalSize: 0,
        missTotalSize: 0,
        unknownTotalSize: 0
      });
      resolve(null);
    }, timeout);
    
    chrome.runtime.sendMessage({ type: 'getCurrentTabDetection' }, (response) => {
      clearTimeout(timeoutId);
      
      if (chrome.runtime.lastError) {
        console.error('Failed to get current tab detection:', chrome.runtime.lastError);
        
        // 如果是連接錯誤且還有重試次數，則重試
        if (retryCount < maxRetries && chrome.runtime.lastError.message.includes('Could not establish connection')) {
          console.log(`Retrying connection... (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => {
            loadCurrentTabDetection(retryCount + 1).then(resolve).catch(reject);
          }, retryDelay);
          return;
        }
        
        console.log('Using default stats due to error');
        updateDetectionResult({ 
          cdnCount: 0, 
          nonCdnCount: 0, 
          totalRequests: 0,
          hitCount: 0,
          missCount: 0,
          unknownCacheCount: 0,
          hitTotalSize: 0,
          missTotalSize: 0,
          unknownTotalSize: 0
        });
        resolve(null);
        return;
      }
      
      if (response && response.type === 'currentTabDetectionResponse') {
        if (response.data) {
          console.log('Received current tab data:', response.data);
          updateDetectionResult(response.data.cdnStats);
          
          // 顯示當前標籤頁資訊
          const tabInfo = document.getElementById('tabInfo');
          if (tabInfo) {
            tabInfo.textContent = `當前標籤頁: ${response.data.title || response.data.url || '未知'}`;
          } else {
            // 創建標籤頁資訊顯示
            const tabInfoDiv = document.createElement('div');
            tabInfoDiv.id = 'tabInfo';
            tabInfoDiv.style.cssText = 'font-size: 11px; color: #666; margin-bottom: 10px; padding: 5px; background-color: #f0f0f0; border-radius: 3px; word-break: break-all';
            tabInfoDiv.textContent = `當前標籤頁: ${response.data.title || response.data.url || '未知'}`;
            
            const detectionResult = document.getElementById('detectionResult');
            if (detectionResult && detectionResult.parentNode) {
              detectionResult.parentNode.insertBefore(tabInfoDiv, detectionResult);
            }
          }
          resolve(response.data);
        } else {
          console.log('No current tab data available');
          updateDetectionResult({ 
            cdnCount: 0, 
            nonCdnCount: 0, 
            totalRequests: 0,
            hitCount: 0,
            missCount: 0,
            unknownCacheCount: 0,
            hitTotalSize: 0,
            missTotalSize: 0,
            unknownTotalSize: 0
          });
          resolve(null);
        }
      } else {
        console.log('Invalid response format, using default stats');
        updateDetectionResult({ 
          cdnCount: 0, 
          nonCdnCount: 0, 
          totalRequests: 0,
          hitCount: 0,
          missCount: 0,
          unknownCacheCount: 0,
          hitTotalSize: 0,
          missTotalSize: 0,
          unknownTotalSize: 0
        });
        resolve(null);
      }
    });
  });
}

// 新增：更新檢測狀態顯示
function updateDetectionStatus(isEnabled) {
  const detectionStatus = document.getElementById('detectionStatus');
  const statusIndicator = document.getElementById('statusIndicator');
  
  if (detectionStatus) {
    detectionStatus.textContent = isEnabled ? '監聽中' : '未啟用';
    detectionStatus.style.color = isEnabled ? '#28a745' : '#dc3545';
  }
  
  if (statusIndicator) {
    statusIndicator.className = isEnabled ? 'status-indicator active' : 'status-indicator inactive';
  }
}

// 新增：更新檢測結果顯示
function updateDetectionResult(stats) {
  const detectionResult = document.getElementById('detectionResult');
  if (detectionResult) {
    const total = stats.totalRequests || (stats.cdnCount + stats.nonCdnCount);
    const percentage = total > 0 ? ((stats.cdnCount / total) * 100).toFixed(2) : 0;
    
    // 計算數量 HIT Ratio
    const totalCacheKnown = (stats.hitCount || 0) + (stats.missCount || 0);
    const hitRatio = totalCacheKnown > 0 ? ((stats.hitCount || 0) / totalCacheKnown * 100).toFixed(1) : 0;
    
    // 計算基於檔案大小的 HIT Ratio
    const totalSizeKnown = (stats.hitTotalSize || 0) + (stats.missTotalSize || 0);
    const hitSizeRatio = totalSizeKnown > 0 ? ((stats.hitTotalSize || 0) / totalSizeKnown * 100).toFixed(1) : 0;
    
    let resultText = `${percentage}% 資源透過 CDN 傳送 (${stats.cdnCount}/${total})`;
    
    // 新增：多 CDN 分類顯示 - 使用標籤系統
    if (stats.cdnBreakdown && Object.keys(stats.cdnBreakdown).length > 0) {
      // 創建或更新 CDN 標籤容器
      let cdnTagsContainer = document.getElementById('cdnTagsContainer');
      if (!cdnTagsContainer) {
        cdnTagsContainer = document.createElement('div');
        cdnTagsContainer.id = 'cdnTagsContainer';
        cdnTagsContainer.innerHTML = `
          <div style="margin: 10px 0 5px 0; font-size: 12px; font-weight: 600; color: var(--dark-color);">
            🌐 檢測到的 CDN 服務:
          </div>
          <div class="cdn-tags" id="cdnTags"></div>
        `;
        
        // 插入到檢測結果下方
        const statusSection = document.querySelector('.status-section');
        if (statusSection && statusSection.nextSibling) {
          statusSection.parentNode.insertBefore(cdnTagsContainer, statusSection.nextSibling);
        }
      }
      
      const cdnTagsElement = document.getElementById('cdnTags');
      if (cdnTagsElement) {
        // 清空現有標籤
        cdnTagsElement.innerHTML = '';
        
        // 按使用量排序 CDN
        const cdnEntries = Object.entries(stats.cdnBreakdown)
          .sort((a, b) => b[1].count - a[1].count);
        
        cdnEntries.forEach(([cdnName, cdnStats], index) => {
          const cdnPercentage = total > 0 ? ((cdnStats.count / total) * 100).toFixed(1) : 0;
          
          // 創建 CDN 標籤
          const cdnTag = document.createElement('div');
          cdnTag.className = `cdn-tag ${index === 0 ? 'primary' : ''}`;
          
          // 計算該 CDN 的快取命中率
          const cdnCacheTotal = cdnStats.hitCount + cdnStats.missCount;
          const cdnHitRatio = cdnCacheTotal > 0 ? ((cdnStats.hitCount / cdnCacheTotal) * 100).toFixed(1) : 'N/A';
          
          cdnTag.innerHTML = `
            <span style="font-weight: 600;">${cdnName}</span>
            <span style="margin-left: 4px; opacity: 0.8;">${cdnStats.count} (${cdnPercentage}%)</span>
            ${cdnCacheTotal > 0 ? `<span style="margin-left: 4px; font-size: 9px; opacity: 0.7;">HIT: ${cdnHitRatio}%</span>` : ''}
          `;
          
          // 添加點擊事件顯示詳細資訊
          cdnTag.addEventListener('click', () => {
            showCDNDetails(cdnName, cdnStats, total);
          });
          
          cdnTagsElement.appendChild(cdnTag);
        });
      }
      
      // 簡化文字顯示
      resultText += `\n\n📊 共檢測到 ${Object.keys(stats.cdnBreakdown).length} 種 CDN 服務`;
    } else {
      // 如果沒有 CDN 數據，隱藏標籤容器
      const cdnTagsContainer = document.getElementById('cdnTagsContainer');
      if (cdnTagsContainer) {
        cdnTagsContainer.style.display = 'none';
      }
    }
    
    // 如果有快取統計資料，顯示 HIT Ratio
    if (totalCacheKnown > 0) {
      resultText += `\n\n🎯 整體快取命中率: ${hitRatio}% (${stats.hitCount || 0}/${totalCacheKnown})`;
      
      // 如果有檔案大小資料，顯示基於大小的 HIT Ratio
      if (totalSizeKnown > 0) {
        resultText += `\n📊 大小命中率: ${hitSizeRatio}% (${formatFileSize(stats.hitTotalSize || 0)}/${formatFileSize(totalSizeKnown)})`;
      }
      
      // 新增：CDN 存取速度統計
      if (stats.cdnAccessSpeed) {
        const speedStats = stats.cdnAccessSpeed;
        if (speedStats.overallSpeed > 0) {
          resultText += `\n⚡ CDN 速度: ${speedStats.overallSpeed.toFixed(2)} MB/s`;
          
          // 顯示 HIT vs MISS 速度比較
          if (speedStats.hitSpeed > 0 && speedStats.missSpeed > 0) {
            resultText += ` (HIT: ${speedStats.hitSpeed.toFixed(2)} MB/s, MISS: ${speedStats.missSpeed.toFixed(2)} MB/s)`;
          }
        }
      }
      
      if (stats.unknownCacheCount > 0) {
        resultText += ` | ⚪ 未知: ${stats.unknownCacheCount}`;
      }
      
      // 更新快取分析區域
      updateCacheAnalysis(stats);
    }
    
    detectionResult.textContent = resultText;
    detectionResult.style.whiteSpace = 'pre-line'; // 支援換行顯示
  }
}

// 新增：更新快取分析區域
function updateCacheAnalysis(stats) {
  const cacheAnalysis = document.getElementById('cacheAnalysis');
  
  // 計算統計數據
  const totalCacheKnown = (stats.hitCount || 0) + (stats.missCount || 0);
  const hitRatio = totalCacheKnown > 0 ? ((stats.hitCount || 0) / totalCacheKnown * 100) : 0;
  
  const totalSizeKnown = (stats.hitTotalSize || 0) + (stats.missTotalSize || 0);
  const hitSizeRatio = totalSizeKnown > 0 ? ((stats.hitTotalSize || 0) / totalSizeKnown * 100) : 0;
  
  // 如果有快取資料，顯示分析區域
  if (totalCacheKnown > 0 && cacheAnalysis) {
    cacheAnalysis.style.display = 'block';
    
    // 更新統計卡片
    const hitRatioElement = document.getElementById('hitRatio');
    const sizeRatioElement = document.getElementById('sizeRatio');
    const overallSpeedElement = document.getElementById('overallSpeed');
    const totalSizeElement = document.getElementById('totalSize');
    
    if (hitRatioElement) hitRatioElement.textContent = `${hitRatio.toFixed(1)}%`;
    if (sizeRatioElement) sizeRatioElement.textContent = `${hitSizeRatio.toFixed(1)}%`;
    if (totalSizeElement) totalSizeElement.textContent = formatFileSize(totalSizeKnown + (stats.unknownTotalSize || 0));
    
    // 更新速度資訊
    if (stats.cdnAccessSpeed && overallSpeedElement) {
      const speedStats = stats.cdnAccessSpeed;
      overallSpeedElement.textContent = `${speedStats.overallSpeed.toFixed(2)} MB/s`;
      
      // 更新速度比較
      const speedComparison = document.getElementById('speedComparison');
      const hitSpeedElement = document.getElementById('hitSpeed');
      const missSpeedElement = document.getElementById('missSpeed');
      
      if (speedStats.hitSpeed > 0 && speedStats.missSpeed > 0 && speedComparison) {
        speedComparison.style.display = 'flex';
        if (hitSpeedElement) hitSpeedElement.textContent = speedStats.hitSpeed.toFixed(2);
        if (missSpeedElement) missSpeedElement.textContent = speedStats.missSpeed.toFixed(2);
      }
    }
    
    // 更新進度條
    const hitRatioText = document.getElementById('hitRatioText');
    const hitProgressBar = document.getElementById('hitProgressBar');
    
    if (hitRatioText) {
      hitRatioText.textContent = `${hitRatio.toFixed(1)}% (${stats.hitCount || 0}/${totalCacheKnown})`;
    }
    
    if (hitProgressBar) {
      hitProgressBar.style.width = `${hitRatio}%`;
    }
  } else if (cacheAnalysis) {
    cacheAnalysis.style.display = 'none';
  }
}

// 新增：刷新統計資料
function refreshStats() {
  if (!chrome.storage) return;
  
  chrome.storage.local.get(['cdnStats'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to refresh stats:', chrome.runtime.lastError);
      return;
    }
    const stats = result.cdnStats || { 
      cdnCount: 0, 
      nonCdnCount: 0, 
      totalRequests: 0,
      hitCount: 0,
      missCount: 0,
      unknownCacheCount: 0,
      hitTotalSize: 0,
      missTotalSize: 0,
      unknownTotalSize: 0,
      hitTotalTime: 0,
      missTotalTime: 0,
      unknownTotalTime: 0
    };
    updateDetectionResult(stats);
  });
}

// 新增：刷新檢測日誌（基於當前標籤頁）
function refreshDetectionLog() {
  const logContent = document.getElementById('logContent');
  if (logContent && !logContent.classList.contains('manual-refresh')) {
    // 檢查是否有展開的詳細資訊
    const openDetails = logContent.querySelectorAll('details[open]');
    if (openDetails.length > 0) {
      // 如果有展開的詳細資訊，則跳過自動刷新以避免收起
      return;
    }
    
    const showCdnOnlyBtn = document.getElementById('showCdnOnly');
    const isCdnOnly = showCdnOnlyBtn && showCdnOnlyBtn.classList.contains('active');
    showCurrentTabFilteredLog(isCdnOnly);
  }
}

// 新增：顯示檢測日誌的函數
function displayDetectionLog() {
  if (!chrome.storage) return;

  chrome.storage.local.get(['detectionLog'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load detection log:', chrome.runtime.lastError);
      return;
    }

    const log = result.detectionLog || [];
    
    // 過濾出使用 CDN 的資源
    const cdnResources = log.filter(entry => entry.isCDN);
    
    // 創建日誌顯示區域
    const logContainer = document.createElement('div');
    logContainer.id = 'logContainer';
    logContainer.innerHTML = `
      <div style="margin-top: 15px; border-top: 1px solid #ccc; padding-top: 10px;">
        <h3>CDN 檢測日誌 (當前標籤頁)</h3>
        <div style="margin: 10px 0;">
          <button id="showCdnOnly" class="log-btn active" style="margin-right: 5px; padding: 5px 10px; font-size: 12px;">顯示 CDN 資源</button>
          <button id="showAllResources" class="log-btn" style="margin-right: 5px; padding: 5px 10px; font-size: 12px;">顯示所有資源</button>
          <button id="refreshLog" class="log-btn" style="margin-right: 5px; padding: 5px 10px; font-size: 12px; background-color: #2196F3; color: white;">刷新</button>
          <button id="clearLog" class="log-btn" style="padding: 5px 10px; font-size: 12px; background-color: #ff4444; color: white;">清除日誌</button>
        </div>
        <div id="logContent" style="max-height: 200px; overflow-y: auto; font-size: 11px; background-color: #f5f5f5; padding: 8px; border: 1px solid #ddd; border-radius: 3px;">
          載入中...
        </div>
        <div id="logSummary" style="margin-top: 8px; font-size: 12px; color: #666;">
          總共檢測到 ${cdnResources.length} 個使用 AspirappsCDN 的資源
        </div>
      </div>
    `;
    
    const existingContainer = document.getElementById('logContainer');
    if (existingContainer) {
      existingContainer.remove();
    }
    
    // 只在CDN檢測標籤頁中顯示日誌
    const cdnTab = document.getElementById('cdn-tab');
    if (cdnTab) {
      cdnTab.appendChild(logContainer);
    } else {
    document.body.appendChild(logContainer);
    }
    
    // 添加按鈕事件監聽器
    document.getElementById('showCdnOnly').addEventListener('click', (e) => {
      setActiveButton(e.target);
      showCurrentTabFilteredLog(true);
    });
    document.getElementById('showAllResources').addEventListener('click', (e) => {
      setActiveButton(e.target);
      showCurrentTabFilteredLog(false);
    });
    document.getElementById('refreshLog').addEventListener('click', () => {
      const logContent = document.getElementById('logContent');
      if (logContent) {
        logContent.classList.add('manual-refresh');
        logContent.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">正在刷新...</div>';
      }
      
      // 強制重新載入當前標籤頁統計和日誌
      loadCurrentTabDetection();
      
      const showCdnOnlyBtn = document.getElementById('showCdnOnly');
      const isCdnOnly = showCdnOnlyBtn && showCdnOnlyBtn.classList.contains('active');
      
      // 延遲一點再載入日誌，確保資料已更新
      setTimeout(() => {
        showCurrentTabFilteredLog(isCdnOnly);
        if (logContent) {
          setTimeout(() => logContent.classList.remove('manual-refresh'), 500);
        }
      }, 100);
    });
    document.getElementById('clearLog').addEventListener('click', clearDetectionLog);
    
    // 默認顯示當前標籤頁 CDN 資源
    showCurrentTabFilteredLog(true);
  });
}

// 新增：格式化檔案大小
function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return 'Unknown';
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 新增：計算個別資源的下載速度
function calculateIndividualSpeed(contentLength, responseTime) {
  if (!contentLength || !responseTime || contentLength <= 0 || responseTime <= 0) {
    return 'Unknown';
  }
  
  try {
    // 計算速度：(bytes / milliseconds) * 1000 / (1024 * 1024) = MB/s
    const bytesPerSecond = (contentLength / responseTime) * 1000;
    const mbPerSecond = bytesPerSecond / (1024 * 1024);
    
    if (mbPerSecond >= 1) {
      return `${mbPerSecond.toFixed(2)} MB/s`;
    } else {
      const kbPerSecond = bytesPerSecond / 1024;
      if (kbPerSecond >= 1) {
        return `${kbPerSecond.toFixed(2)} KB/s`;
      } else {
        return `${bytesPerSecond.toFixed(0)} B/s`;
      }
    }
  } catch (error) {
    console.error('Error calculating individual speed:', error);
    return 'Error';
  }
}

// 新增：設置活躍按鈕
function setActiveButton(activeBtn) {
  document.querySelectorAll('.log-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.style.backgroundColor = '#f5f5f5';
    btn.style.color = '#333';
  });
  activeBtn.classList.add('active');
  activeBtn.style.backgroundColor = '#4CAF50';
  activeBtn.style.color = 'white';
  
  // 保持特殊按鈕的顏色
  const refreshBtn = document.getElementById('refreshLog');
  const clearBtn = document.getElementById('clearLog');
  if (refreshBtn && !refreshBtn.classList.contains('active')) {
    refreshBtn.style.backgroundColor = '#2196F3';
    refreshBtn.style.color = 'white';
  }
  if (clearBtn && !clearBtn.classList.contains('active')) {
    clearBtn.style.backgroundColor = '#ff4444';
    clearBtn.style.color = 'white';
  }
}

// 新增：顯示當前標籤頁的過濾日誌
function showCurrentTabFilteredLog(cdnOnly = true) {
  if (!chrome.runtime) return;

  chrome.runtime.sendMessage({ type: 'getCurrentTabDetection' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to load current tab filtered log:', chrome.runtime.lastError);
      return;
    }

    const logContent = document.getElementById('logContent');
    if (!logContent) return;

    if (!response || !response.data || !response.data.detectionLog) {
      logContent.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">暫無當前分頁檢測記錄<br><small>請確保已啟用檢測功能並瀏覽網站<br>每個分頁的檢測結果是獨立的</small></div>';
      
      const summaryDiv = document.getElementById('logSummary');
      if (summaryDiv) {
        summaryDiv.textContent = '當前分頁暫無檢測記錄';
      }
      return;
    }

    const log = response.data.detectionLog;
    let filteredLog = cdnOnly ? log.filter(entry => entry.isCDN) : log;
    
    // 按時間排序（最新優先）
    filteredLog = filteredLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 取最近的 50 條記錄
    filteredLog = filteredLog.slice(0, 50);
    
    if (filteredLog.length === 0) {
      logContent.innerHTML = cdnOnly ? 
        '<div style="color: #999; text-align: center; padding: 20px;">當前標籤頁暫無檢測到使用 CDN 的資源<br><small>請訪問包含 CDN 資源的網站（支援 Cloudflare、CloudFront、Fastly 等）</small></div>' :
        '<div style="color: #999; text-align: center; padding: 20px;">當前標籤頁暫無檢測記錄<br><small>請確保已啟用檢測功能</small></div>';
      
      // 更新摘要
      const summaryDiv = document.getElementById('logSummary');
      if (summaryDiv) {
        summaryDiv.textContent = cdnOnly ? '當前標籤頁暫無 CDN 資源檢測記錄' : '當前標籤頁暫無檢測記錄';
      }
      return;
    }
    
    const logHtml = filteredLog.map(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      const domain = entry.domain;
      const resourceType = entry.resourceType;
      
      // 新增：多 CDN 支援的狀態顯示
      let status = '❌ No CDN';
      let statusColor = '#f44336';
      let cdnTypeDisplay = '';
      
      if (entry.isCDN) {
        // 顯示主要 CDN
        const primaryCDN = entry.cdnType || 'Unknown CDN';
        status = `✅ ${primaryCDN}`;
        statusColor = '#4CAF50';
        
        // 如果檢測到多個 CDN，顯示所有 CDN
        if (entry.cdnTypes && entry.cdnTypes.length > 1) {
          const allCDNs = entry.cdnTypes.map(cdn => cdn.name).join(', ');
          cdnTypeDisplay = `<div style="color: #2196F3; margin: 2px 0; font-size: 11px;"><strong>檢測到:</strong> ${allCDNs}</div>`;
          
          // 如果有多個 CDN，在狀態中加上 "+" 標記
          status = `✅ ${primaryCDN} +${entry.cdnTypes.length - 1}`;
        }
      }
      
      // 處理快取狀態顯示
      let cacheStatusDisplay = '';
      let cacheStatusColor = '#666';
      if (entry.isCDN && entry.cacheStatus) {
        if (entry.isHit === true) {
          cacheStatusDisplay = `🎯 ${entry.cacheStatus}`;
          cacheStatusColor = '#4CAF50'; // 綠色表示 HIT
        } else if (entry.isHit === false) {
          cacheStatusDisplay = `❌ ${entry.cacheStatus}`;
          cacheStatusColor = '#FF9800'; // 橙色表示 MISS
        } else {
          cacheStatusDisplay = `⚪ ${entry.cacheStatus}`;
          cacheStatusColor = '#9E9E9E'; // 灰色表示未知狀態
        }
      }
      
      // 從 URL 中提取檔案名稱
      const fileName = entry.url.split('/').pop().split('?')[0] || 'unknown';
      const displayFileName = fileName.length > 30 ? fileName.substring(0, 30) + '...' : fileName;
      
      // 計算個別速度
      const individualSpeed = (entry.contentLength && entry.responseTime) ? 
        calculateIndividualSpeed(entry.contentLength, entry.responseTime) : null;
      

      
      return `
        <div style="margin-bottom: 8px; padding: 8px; border-left: 3px solid ${statusColor}; background-color: white; border-radius: 3px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="font-weight: bold; color: ${statusColor};">
            ${status} - ${displayFileName} - ${resourceType}
          </div>
          ${cdnTypeDisplay}
          ${cacheStatusDisplay ? `<div style="color: ${cacheStatusColor}; margin: 2px 0; font-size: 11px; font-weight: bold;"><strong>快取狀態:</strong> ${cacheStatusDisplay}</div>` : ''}
          <div style="color: #333; margin: 2px 0; font-size: 10px;"><strong>域名:</strong> ${domain}</div>
          <div style="color: #666; font-size: 10px;"><strong>時間:</strong> ${time}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 4px 0;">
            ${entry.contentLength ? `<div style="color: #555; font-size: 10px;"><strong>📦 大小:</strong> ${formatFileSize(entry.contentLength)}</div>` : ''}
            ${entry.responseTime ? `<div style="color: #555; font-size: 10px;"><strong>⏱️ 響應:</strong> ${entry.responseTime}ms</div>` : ''}
            ${individualSpeed ? `<div style="color: #2196F3; font-size: 10px; font-weight: bold;"><strong>🚀 速度:</strong> ${individualSpeed}</div>` : ''}
          </div>
          ${entry.viaHeader ? `<div style="color: #888; font-size: 9px; margin-top: 2px;"><strong>Via:</strong> ${entry.viaHeader.substring(0, 60)}${entry.viaHeader.length > 60 ? '...' : ''}</div>` : ''}
          <details style="margin-top: 4px;">
            <summary style="font-size: 10px; color: #666; cursor: pointer;" onclick="event.stopPropagation();">查看詳細資訊</summary>
            <div style="font-size: 9px; color: #555; margin-top: 4px; background-color: #f9f9f9; padding: 4px; border-radius: 2px;">
              <div style="word-break: break-all; margin-bottom: 4px;"><strong>完整檔名:</strong> ${fileName}</div>
              <div style="word-break: break-all; margin-bottom: 4px;"><strong>完整 URL:</strong> ${entry.url}</div>
              <div><strong>狀態碼:</strong> ${entry.statusCode}</div>
              <div><strong>請求方法:</strong> ${entry.method}</div>
              ${entry.cacheStatusCode ? `<div><strong>快取代碼:</strong> ${entry.cacheStatusCode}</div>` : ''}
              ${entry.contentLength ? `<div><strong>檔案大小:</strong> ${formatFileSize(entry.contentLength)}</div>` : ''}
              ${entry.responseTime ? `<div><strong>響應時間:</strong> ${entry.responseTime}ms</div>` : ''}
              ${entry.contentLength && entry.responseTime ? `<div><strong>下載速度:</strong> ${calculateIndividualSpeed(entry.contentLength, entry.responseTime)}</div>` : ''}
              ${Object.keys(entry.headers || {}).length > 0 ? 
                `<div style="margin-top: 4px;"><strong>相關 Headers:</strong><br>${Object.entries(entry.headers).map(([k, v]) => `<span style="color: #666;">${k}:</span> ${v}`).join('<br>')}</div>` : 
                ''}
            </div>
          </details>
        </div>
      `;
    }).join('');
    
    logContent.innerHTML = logHtml;
    
    // 更新摘要
    const summaryDiv = document.getElementById('logSummary');
    if (summaryDiv) {
      if (cdnOnly) {
        // 計算 HIT/MISS 統計
        const hitEntries = filteredLog.filter(entry => entry.isHit === true);
        const missEntries = filteredLog.filter(entry => entry.isHit === false);
        const unknownEntries = filteredLog.filter(entry => entry.isHit === null);
        
        let summaryText = `當前標籤頁最近 ${filteredLog.length} 個使用 CDN 的資源`;
        
        if (hitEntries.length > 0 || missEntries.length > 0) {
          const totalKnownCache = hitEntries.length + missEntries.length;
          const hitRatio = totalKnownCache > 0 ? ((hitEntries.length / totalKnownCache) * 100).toFixed(1) : 0;
          
          // 計算基於檔案大小的 HIT Ratio
          const hitTotalSize = hitEntries.reduce((sum, entry) => sum + (entry.contentLength || 0), 0);
          const missTotalSize = missEntries.reduce((sum, entry) => sum + (entry.contentLength || 0), 0);
          const totalSize = hitTotalSize + missTotalSize;
          const hitSizeRatio = totalSize > 0 ? ((hitTotalSize / totalSize) * 100).toFixed(1) : 0;
          
          // 計算平均速度
          const entriesWithSpeed = filteredLog.filter(entry => entry.contentLength && entry.responseTime);
          if (entriesWithSpeed.length > 0) {
            const totalBytes = entriesWithSpeed.reduce((sum, entry) => sum + entry.contentLength, 0);
            const totalTime = entriesWithSpeed.reduce((sum, entry) => sum + entry.responseTime, 0);
            const avgSpeed = (totalBytes / totalTime) * 1000 / (1024 * 1024); // MB/s
            
            summaryText += ` | 🎯 HIT: ${hitEntries.length} ❌ MISS: ${missEntries.length} | HIT Ratio: ${hitRatio}%`;
            
            if (totalSize > 0) {
              summaryText += ` | 📊 Size Ratio: ${hitSizeRatio}%`;
            }
            
            summaryText += ` | ⚡ 平均速度: ${avgSpeed.toFixed(2)} MB/s`;
          } else {
            summaryText += ` | 🎯 HIT: ${hitEntries.length} ❌ MISS: ${missEntries.length} | HIT Ratio: ${hitRatio}%`;
            
            if (totalSize > 0) {
              summaryText += ` | 📊 Size Ratio: ${hitSizeRatio}%`;
            }
          }
        }
        
        if (unknownEntries.length > 0) {
          summaryText += ` | ⚪ 未知: ${unknownEntries.length}`;
        }
        
        summaryDiv.innerHTML = summaryText;
        summaryDiv.style.color = '#4CAF50';
      } else {
        const cdnCount = filteredLog.filter(entry => entry.isCDN).length;
        // 新增：多 CDN 統計摘要
        const cdnBreakdown = {};
        filteredLog.forEach(entry => {
          if (entry.isCDN) {
            const primaryCDN = entry.cdnType || 'Unknown CDN';
            cdnBreakdown[primaryCDN] = (cdnBreakdown[primaryCDN] || 0) + 1;
          }
        });
        
        let summaryText = `當前標籤頁最近 ${filteredLog.length} 個資源`;
        if (Object.keys(cdnBreakdown).length > 0) {
          const cdnSummary = Object.entries(cdnBreakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([cdnName, count]) => `${cdnName}: ${count}`)
            .join(', ');
          summaryText += ` | CDN 分佈: ${cdnSummary}`;
        } else {
          summaryText += ` | 無 CDN 資源`;
        }
        
        summaryDiv.textContent = summaryText;
        summaryDiv.style.color = '#666';
      }
    }
  });
}


// 新增：顯示 CDN 詳細資訊
function showCDNDetails(cdnName, cdnStats, totalRequests) {
  const modal = document.createElement('div');
  modal.id = 'cdnDetailsModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;
  
  const cdnPercentage = totalRequests > 0 ? ((cdnStats.count / totalRequests) * 100).toFixed(1) : 0;
  const cdnCacheTotal = cdnStats.hitCount + cdnStats.missCount;
  const cdnHitRatio = cdnCacheTotal > 0 ? ((cdnStats.hitCount / cdnCacheTotal) * 100).toFixed(1) : 'N/A';
  
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 8px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <h3 style="margin: 0; color: var(--dark-color);">🌐 ${cdnName} 詳細資訊</h3>
        <button id="closeModal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #999;">&times;</button>
      </div>
      
      <div class="stats-grid" style="margin-bottom: 15px;">
        <div class="stat-card">
          <div class="stat-value">${cdnStats.count}</div>
          <div class="stat-label">資源數量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${cdnPercentage}%</div>
          <div class="stat-label">佔比</div>
        </div>
        <div class="stat-card hit">
          <div class="stat-value">${cdnStats.hitCount || 0}</div>
          <div class="stat-label">快取命中</div>
        </div>
        <div class="stat-card miss">
          <div class="stat-value">${cdnStats.missCount || 0}</div>
          <div class="stat-label">快取未命中</div>
        </div>
      </div>
      
      ${cdnCacheTotal > 0 ? `
        <div style="margin-bottom: 15px;">
          <div style="font-size: 12px; margin-bottom: 5px; color: var(--text-muted);">快取命中率</div>
          <div style="background: #f0f0f0; border-radius: 10px; height: 20px; overflow: hidden;">
            <div style="background: var(--success-color); height: 100%; width: ${cdnHitRatio}%; transition: width 0.3s ease;"></div>
          </div>
          <div style="font-size: 11px; margin-top: 2px; color: var(--text-muted);">${cdnHitRatio}% (${cdnStats.hitCount}/${cdnCacheTotal})</div>
        </div>
      ` : ''}
      
      ${cdnStats.totalSize ? `
        <div style="margin-bottom: 15px;">
          <div style="font-size: 12px; color: var(--text-muted);">總傳輸大小: ${formatFileSize(cdnStats.totalSize)}</div>
          ${cdnStats.totalTime ? `<div style="font-size: 12px; color: var(--text-muted);">平均速度: ${(cdnStats.totalSize / cdnStats.totalTime / 1024 / 1024 * 1000).toFixed(2)} MB/s</div>` : ''}
        </div>
      ` : ''}
      
      <button id="closeModalBtn" style="width: 100%; padding: 8px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer;">關閉</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 關閉模態框事件
  const closeModal = () => {
    document.body.removeChild(modal);
  };
  
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// 新增：清除檢測日誌
function clearDetectionLog() {
  if (!chrome.runtime) return;

  if (confirm('確定要清除所有檢測日誌嗎？')) {
    chrome.runtime.sendMessage({ type: 'clearDetectionLog' });
    
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
          unknownTotalSize: 0
        }
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to clear stats:', chrome.runtime.lastError);
      }
    });
    
    // 隱藏 CDN 標籤容器
    const cdnTagsContainer = document.getElementById('cdnTagsContainer');
    if (cdnTagsContainer) {
      cdnTagsContainer.style.display = 'none';
    }
    
    // 清除顯示
    const logContent = document.getElementById('logContent');
    const summaryDiv = document.getElementById('logSummary');
    const detectionResult = document.getElementById('detectionResult');
    
    if (logContent) {
      logContent.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">日誌已清除</div>';
    }
    if (summaryDiv) {
      summaryDiv.textContent = '日誌已清除';
    }
    if (detectionResult) {
      detectionResult.textContent = '0% of resources are delivered via CDN (0/0)';
    }
  }
}

// =============================================================================
// 標籤頁功能
// =============================================================================

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // 移除所有活動狀態
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.style.display = 'none');
      
      // 設置當前活動標籤
      button.classList.add('active');
      const targetContent = document.getElementById(`${targetTab}-tab`);
      if (targetContent) {
        targetContent.style.display = 'block';
      }
      
      // 當切換到影片標籤時，刷新影片品質數據
      if (targetTab === 'video') {
        refreshVideoQuality();
      }
    });
  });
}

// =============================================================================
// 影片品質監控功能
// =============================================================================

function initializeVideoQuality() {
  // 綁定按鈕事件
  const clearVideoHistoryBtn = document.getElementById('clearVideoHistory');
  const refreshVideoDataBtn = document.getElementById('refreshVideoData');
  const openQoEDashboardBtn = document.getElementById('openQoEDashboard');
  
  if (clearVideoHistoryBtn) {
    clearVideoHistoryBtn.addEventListener('click', clearVideoHistory);
  }
  
  if (refreshVideoDataBtn) {
    refreshVideoDataBtn.addEventListener('click', refreshVideoQuality);
  }
  
  if (openQoEDashboardBtn) {
    openQoEDashboardBtn.addEventListener('click', openQoEDashboard);
  }
  
  // 初始載入影片品質數據（僅在第一次載入時）
  console.log('Initializing video quality monitoring...');
  // 不立即刷新，等待用戶操作或檢測到實際視頻
}

// 添加請求狀態追蹤，防止重複請求
let isVideoQualityRequesting = false;
let videoQualityRequestCount = 0;

function refreshVideoQuality() {
  // 防止重複請求
  if (isVideoQualityRequesting) {
    console.log('Video quality request already in progress, skipping...');
    return;
  }
  
  // 檢查請求頻率，避免過度請求
  videoQualityRequestCount++;
  if (videoQualityRequestCount > 10) {
    console.warn('Too many video quality requests, throttling...');
    setTimeout(() => {
      videoQualityRequestCount = Math.max(0, videoQualityRequestCount - 5);
    }, 10000);
    return;
  }
  
  isVideoQualityRequesting = true;
  console.log('Requesting video quality data...');
  
  try {
    // 首先檢查 Chrome runtime 是否可用
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      console.warn('Chrome runtime not available for video quality request');
      updateVideoQualityDisplay(null);
      isVideoQualityRequesting = false;
      return;
    }
    
    // 設置整體超時機制
    const requestTimeout = setTimeout(() => {
      console.warn('Video quality request timed out');
      isVideoQualityRequesting = false;
      updateVideoQualityDisplay(null);
    }, 8000);
    
    // 發送 PING 檢查
    chrome.runtime.sendMessage({ type: 'PING_VIDEO_QUALITY' }, (pingResponse) => {
      if (chrome.runtime.lastError) {
        console.log('Background script ping failed (expected if no videos):', chrome.runtime.lastError);
        // 清除超時器並重置狀態
        clearTimeout(requestTimeout);
        isVideoQualityRequesting = false;
        updateVideoQualityDisplay(null);
        return;
      }
      
      console.log('Background script ping successful:', pingResponse);
      
      // 發送視頻品質數據請求
      chrome.runtime.sendMessage({ type: 'GET_VIDEO_QUALITY_DATA' }, (response) => {
        // 清除超時器
        clearTimeout(requestTimeout);
        isVideoQualityRequesting = false;
        
        if (chrome.runtime.lastError) {
          console.log('Video quality data request failed (expected if no videos):', chrome.runtime.lastError);
          updateVideoQualityDisplay(null);
          return;
        }
        
        console.log('Video quality response received:', response);
        
        if (response) {
          if (response.success) {
            console.log('Video quality data retrieved successfully:', response.data);
            updateVideoQualityDisplay(response.data);
          } else {
            console.log('Video quality request failed:', response.error);
            // 即使請求失敗，也嘗試使用返回的數據
            updateVideoQualityDisplay(response.data || null);
          }
        } else {
          console.log('No response received from background script');
          updateVideoQualityDisplay(null);
        }
      });
    });
    
  } catch (error) {
    console.error('Error sending video quality message:', error);
    isVideoQualityRequesting = false;
    updateVideoQualityDisplay(null);
  }
}

function updateVideoQualityDisplay(data) {
  // 減少日誌輸出，只在有實際視頻數據時才詳細記錄
  const hasVideoData = data && data.currentTab && data.currentTab.videos && Object.keys(data.currentTab.videos).length > 0;
  
  if (hasVideoData) {
    console.log('Updating video quality display with active video data');
  }
  
  const videoStatusIndicator = document.getElementById('videoStatusIndicator');
  const videoStatus = document.getElementById('videoStatus');
  const videoPlatform = document.getElementById('videoPlatform');
  const videoQualityStats = document.getElementById('videoQualityStats');
  
  if (!data || !data.currentTab || !data.currentTab.videos || Object.keys(data.currentTab.videos).length === 0) {
    // 沒有影片數據 - 靜默處理，避免過多日誌
    console.log('No video data available (this is normal if no videos are playing)');
    
    if (videoStatusIndicator) videoStatusIndicator.className = 'status-indicator inactive';
    if (videoStatus) videoStatus.textContent = '未檢測到影片';
    if (videoPlatform) videoPlatform.textContent = 'N/A';
    if (videoQualityStats) videoQualityStats.style.display = 'none';
    
    updateVideoHistory([]);
    return;
  }
  
  // 將videos物件轉換為陣列，並獲取最新的影片數據
  const videosArray = Object.values(data.currentTab.videos);
  const latestVideo = videosArray[videosArray.length - 1];
  
  console.log(`Using latest video data: ${latestVideo.platform} platform, ${latestVideo.latestMetrics ? latestVideo.latestMetrics.length : 0} metrics`);
  
  // 更新狀態指示器
  if (videoStatusIndicator) videoStatusIndicator.className = 'status-indicator active';
  if (videoStatus) videoStatus.textContent = '檢測到影片播放';
  if (videoPlatform) videoPlatform.textContent = data.currentTab.platform || '未知平台';
  if (videoQualityStats) videoQualityStats.style.display = 'block';
  
  // 更新影片品質統計
  updateVideoStats(latestVideo);
  
  // 更新歷史記錄
  updateVideoHistory(videosArray);
}

function updateVideoStats(videoData) {
  // 從latestMetrics中獲取最新的指標數據
  const latestMetric = videoData.latestMetrics && videoData.latestMetrics.length > 0 
    ? videoData.latestMetrics[videoData.latestMetrics.length - 1] 
    : null;
  
  // 基本品質指標
  const videoResolution = document.getElementById('videoResolution');
  const videoBitrate = document.getElementById('videoBitrate');
  const videoFps = document.getElementById('videoFps');
  const bufferEvents = document.getElementById('bufferEvents');
  
  if (videoResolution) {
    const timestamp = new Date().toLocaleTimeString();
    if (latestMetric && latestMetric.videoWidth && latestMetric.videoHeight) {
      videoResolution.textContent = `${latestMetric.videoWidth}x${latestMetric.videoHeight}`;
      videoResolution.style.color = '#28a745'; // 綠色：有效數據
      videoResolution.title = `影片解析度 (更新: ${timestamp})`;
    } else {
      videoResolution.textContent = 'N/A';
      videoResolution.style.color = '#6c757d'; // 灰色：無數據
      videoResolution.title = '無法取得解析度資訊';
    }
  }
  
  if (videoBitrate) {
    const timestamp = new Date().toLocaleTimeString();
    
    // 顯示網路下行速度作為位元率參考
    if (latestMetric && latestMetric.networkInfo && latestMetric.networkInfo.downlink) {
      videoBitrate.textContent = `${latestMetric.networkInfo.downlink} Mbps`;
      videoBitrate.style.color = '#28a745'; // 綠色：網路數據
      videoBitrate.title = `網路下行速度 (更新: ${timestamp})`;
    } else if (latestMetric && latestMetric.estimatedBitrate && latestMetric.estimatedBitrate.bufferRatio) {
      // 如果沒有網路信息，顯示緩衝比例作為參考
      const bufferPercent = (latestMetric.estimatedBitrate.bufferRatio * 100).toFixed(1);
      videoBitrate.textContent = `緩衝: ${bufferPercent}%`;
      videoBitrate.style.color = '#ffc107'; // 黃色：估算數據
      videoBitrate.title = `緩衝區使用率 (更新: ${timestamp})`;
    } else {
      videoBitrate.textContent = 'N/A';
      videoBitrate.style.color = '#6c757d'; // 灰色：無數據
      videoBitrate.title = '無法取得位元率資訊';
    }
  }
  
  if (videoFps) {
    const timestamp = new Date().toLocaleTimeString();
    
    // 嘗試從最新指標中獲取幀率信息
    if (latestMetric && latestMetric.frameRate && latestMetric.frameRate > 0) {
      let fpsText = `${latestMetric.frameRate.toFixed(1)} fps`;
      
      // 顯示計算來源和即時狀態
      if (latestMetric.frameRateSource) {
        switch (latestMetric.frameRateSource) {
          case 'MediaStream API':
            fpsText += ' (API)';
            videoFps.style.color = '#28a745'; // 綠色：API數據
            videoFps.title = `MediaStream API 數據 (更新: ${timestamp})`;
            break;
          case 'Calculated (averaged)':
            const samples = latestMetric.frameRateSamples || 0;
            fpsText += ` (計算/${samples}樣本)`;
            videoFps.style.color = samples >= 3 ? '#28a745' : '#ffc107'; // 綠色：足夠樣本，黃色：樣本不足
            videoFps.title = `真實計算 (${samples}個樣本, 更新: ${timestamp})`;
            break;
          case 'Firefox mozFrameDelay':
            fpsText += ' (Firefox)';
            videoFps.style.color = '#17a2b8'; // 藍色：Firefox專用
            videoFps.title = `Firefox API 數據 (更新: ${timestamp})`;
            break;
          default:
            videoFps.style.color = '#6c757d'; // 灰色：其他來源
            videoFps.title = `未知來源 (更新: ${timestamp})`;
            break;
        }
      } else {
        videoFps.style.color = '#6c757d';
        videoFps.title = `幀率數據 (更新: ${timestamp})`;
      }
      
      videoFps.textContent = fpsText;
    } else if (latestMetric && latestMetric.streamSettings && latestMetric.streamSettings.frameRate) {
      videoFps.textContent = `${latestMetric.streamSettings.frameRate} fps (設定)`;
      videoFps.style.color = '#fd7e14'; // 橙色：配置數據
      videoFps.title = `串流設定值 (更新: ${timestamp})`;
    } else {
      videoFps.textContent = 'N/A';
      videoFps.style.color = '#6c757d'; // 灰色：無數據
      videoFps.title = '無法計算幀率，需要更多數據點';
    }
  }
  
  if (bufferEvents) {
    const timestamp = new Date().toLocaleTimeString();
    
    // 計算緩衝事件數量
    const bufferCount = videoData.recentEvents 
      ? videoData.recentEvents.filter(event => event.type === 'waiting' || event.type === 'stalled').length 
      : 0;
    bufferEvents.textContent = bufferCount;
    bufferEvents.title = `緩衝事件統計 (更新: ${timestamp})`;
    
    // 根據緩衝事件數量調整顏色
    if (bufferCount === 0) {
      bufferEvents.style.color = '#28a745'; // 綠色：無緩衝
    } else if (bufferCount <= 3) {
      bufferEvents.style.color = '#ffc107'; // 黃色：少量緩衝
    } else {
      bufferEvents.style.color = '#dc3545'; // 紅色：頻繁緩衝
    }
  }
  
  // 掉幀統計
  updateFrameStats(latestMetric);
  
  // 播放資訊
  updatePlaybackInfo(latestMetric);
}

function updateFrameStats(latestMetric) {
  const frameStats = document.getElementById('frameStats');
  const droppedFrames = document.getElementById('droppedFrames');
  const totalFrames = document.getElementById('totalFrames');
  const dropRatio = document.getElementById('dropRatio');
  
  const playbackQuality = latestMetric && latestMetric.playbackQuality;
  const hasFrameData = playbackQuality && 
    (playbackQuality.droppedVideoFrames !== undefined || playbackQuality.totalVideoFrames !== undefined);
  
  if (frameStats) {
    frameStats.style.display = hasFrameData ? 'block' : 'none';
  }
  
  if (hasFrameData) {
    const dropped = playbackQuality.droppedVideoFrames || 0;
    const total = playbackQuality.totalVideoFrames || 0;
    const ratio = total > 0 ? ((dropped / total) * 100).toFixed(2) : 0;
    
    if (droppedFrames) droppedFrames.textContent = dropped;
    if (totalFrames) totalFrames.textContent = total;
    if (dropRatio) dropRatio.textContent = `${ratio}%`;
  }
}

function updatePlaybackInfo(latestMetric) {
  const currentTime = document.getElementById('currentTime');
  const duration = document.getElementById('duration');
  const playbackState = document.getElementById('playbackState');
  
  if (currentTime) {
    currentTime.textContent = formatTime(latestMetric ? latestMetric.currentTime || 0 : 0);
  }
  
  if (duration) {
    duration.textContent = formatTime(latestMetric ? latestMetric.duration || 0 : 0);
  }
  
  if (playbackState) {
    let state = '未知';
    if (latestMetric) {
      if (latestMetric.paused === false) {
        state = '播放中';
      } else if (latestMetric.paused === true) {
        state = '暫停';
      }
    }
    playbackState.textContent = state;
  }
  
  // 移除音量顯示，因為無法穩定獲取
}

function updateVideoHistory(videos) {
  const historyContent = document.getElementById('videoHistoryContent');
  if (!historyContent) return;
  
  if (!videos || videos.length === 0) {
    historyContent.innerHTML = '<div class="no-data">暫無影片品質資料</div>';
    return;
  }
  
  const historyHtml = videos.slice(-10).reverse().map(video => {
    const timestamp = new Date(video.startTime || Date.now()).toLocaleTimeString();
    
    // 從最新的metrics中獲取解析度
    const latestMetric = video.latestMetrics && video.latestMetrics.length > 0 
      ? video.latestMetrics[video.latestMetrics.length - 1] 
      : null;
    
    const resolution = latestMetric && latestMetric.videoWidth && latestMetric.videoHeight
      ? `${latestMetric.videoWidth}x${latestMetric.videoHeight}`
      : 'N/A';
    
    const bitrate = 'N/A'; // 位元率暫時無法從當前數據獲取
    
    // 計算緩衝事件數量
    const bufferCount = video.recentEvents 
      ? video.recentEvents.filter(event => event.type === 'waiting' || event.type === 'stalled').length 
      : 0;
    
    return `
      <div class="history-item" style="background: white; border-radius: 6px; padding: 10px; margin-bottom: 8px; border-left: 3px solid var(--info-color);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 500; font-size: 12px;">影片 ${video.id.substring(0, 8)}...</span>
          <span style="font-size: 11px; color: #666;">${timestamp}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
          <div>解析度: ${resolution}</div>
          <div>狀態: ${video.active ? '活動中' : '已停止'}</div>
        </div>
        ${bufferCount > 0 ? `<div style="font-size: 10px; color: #dc3545; margin-top: 4px;">緩衝事件: ${bufferCount}</div>` : ''}
        <div style="font-size: 10px; color: #666; margin-top: 4px;">指標數: ${video.metricsCount || 0}</div>
      </div>
    `;
  }).join('');
  
  historyContent.innerHTML = historyHtml;
}

function clearVideoHistory() {
  chrome.runtime.sendMessage({ type: 'CLEAR_VIDEO_QUALITY_DATA' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to clear video history:', chrome.runtime.lastError);
      return;
    }
    
    console.log('Video history cleared');
    refreshVideoQuality();
  });
}

// =============================================================================
// 輔助函數
// =============================================================================

function formatBitrate(bitrate) {
  if (bitrate >= 1000000) {
    return `${(bitrate / 1000000).toFixed(1)} Mbps`;
  } else if (bitrate >= 1000) {
    return `${(bitrate / 1000).toFixed(0)} Kbps`;
  } else {
    return `${bitrate} bps`;
  }
}

function formatTime(seconds) {
  if (!seconds || seconds === 0) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

function openQoEDashboard() {
  console.log('Opening QoE Performance Dashboard...');
  
  // 顯示載入提示
  const button = document.getElementById('openQoEDashboard');
  if (button) {
    const originalText = button.innerHTML;
    button.innerHTML = '⏳ 正在開啟...';
    button.disabled = true;
    
    // 2秒後恢復按鈕狀態
    setTimeout(() => {
      button.innerHTML = originalText;
      button.disabled = false;
    }, 2000);
  }
  
  try {
    // 檢查 QoE Dashboard 是否存在
    const dashboardUrl = chrome.runtime.getURL('qoe-dashboard.html');
    console.log('Dashboard URL:', dashboardUrl);
    
    // 先測試檔案是否可存取
    fetch(dashboardUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Dashboard file not accessible: ${response.status}`);
        }
        console.log('✅ QoE Dashboard file is accessible');
        
        // 嘗試開啟新標籤頁
        chrome.tabs.create({
          url: dashboardUrl,
          active: true
        }, (tab) => {
          if (chrome.runtime.lastError) {
            console.error('❌ Error creating tab:', chrome.runtime.lastError);
            
            // 嘗試備用方法：直接在新視窗開啟
            try {
              const newWindow = window.open(dashboardUrl, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
              if (newWindow) {
                console.log('✅ QoE Dashboard opened in new window');
                window.close();
              } else {
                throw new Error('Popup blocked or failed to open');
              }
            } catch (fallbackError) {
              console.error('❌ Fallback method failed:', fallbackError);
              
              // 最後備用方案：顯示手動開啟指示
              const userConfirm = confirm(
                '無法自動開啟 QoE Dashboard。\n\n' +
                '您可以手動複製以下網址到新標籤頁：\n' +
                dashboardUrl + '\n\n' +
                '點擊「確定」複製網址到剪貼簿'
              );
              
              if (userConfirm) {
                navigator.clipboard.writeText(dashboardUrl).then(() => {
                  alert('✅ 網址已複製到剪貼簿！\n請貼到新標籤頁的網址列。');
                }).catch(() => {
                  alert('📋 請手動複製此網址：\n' + dashboardUrl);
                });
              }
            }
          } else {
            console.log('✅ QoE Dashboard opened successfully in tab:', tab.id);
            // 關閉 popup
            window.close();
          }
        });
      })
      .catch(error => {
        console.error('❌ QoE Dashboard file check failed:', error);
        alert(
          '❌ QoE Dashboard 檔案無法存取\n\n' +
          '可能原因：\n' +
          '1. 檔案不存在或損壞\n' +
          '2. 擴充功能權限不足\n' +
          '3. 瀏覽器安全限制\n\n' +
          '請嘗試重新載入擴充功能。'
        );
      });
      
  } catch (error) {
    console.error('❌ Critical error in openQoEDashboard:', error);
    alert(
      '❌ 開啟 QoE Dashboard 時發生錯誤\n\n' +
      '錯誤詳情：' + error.message + '\n\n' +
      '請檢查擴充功能是否正常運作。'
    );
  }
}