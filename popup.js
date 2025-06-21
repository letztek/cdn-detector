document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM loaded, initializing...');
  
  // 檢查 Chrome API 是否可用
  if (typeof chrome === 'undefined' || !chrome.storage) {
    console.error('Chrome APIs not available');
    document.body.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Chrome APIs 無法訪問<br><small>請重新載入擴充功能</small></div>';
    return;
  }

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
    
    // 新增：定期刷新統計和日誌
    setInterval(() => {
      loadCurrentTabDetection(); // 改為載入當前標籤頁數據
      refreshDetectionLog();
    }, 2000); // 每2秒刷新一次
    
    console.log('Popup initialization completed');
    
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
    
    document.body.appendChild(logContainer);
    
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

 