document.addEventListener('DOMContentLoaded', () => {
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

  // 初始化開關狀態 - 預設啟用
  chrome.storage.local.get(['cdnDetectionEnabled'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Storage access error:', chrome.runtime.lastError);
      return;
    }

    // 預設啟用，只有明確設定為 false 才關閉
    const isEnabled = result.cdnDetectionEnabled !== false;
    enableToggle.checked = isEnabled;
    updateDetectionStatus(isEnabled);
  });
  
  // 載入當前標籤頁的檢測結果
  loadCurrentTabDetection();

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
});

// 新增：載入當前標籤頁檢測結果
function loadCurrentTabDetection() {
  if (!chrome.runtime) return;
  
  chrome.runtime.sendMessage({ type: 'getCurrentTabDetection' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to get current tab detection:', chrome.runtime.lastError);
      return;
    }
    
    if (response && response.type === 'currentTabDetectionResponse') {
      if (response.data) {
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
      } else {
        console.log('No current tab data available');
        updateDetectionResult({ cdnCount: 0, nonCdnCount: 0, totalRequests: 0 });
      }
    }
  });
}

// 新增：更新檢測狀態顯示
function updateDetectionStatus(isEnabled) {
  const detectionStatus = document.getElementById('detectionStatus');
  if (detectionStatus) {
    detectionStatus.textContent = isEnabled ? '監聽中' : '未啟用';
    detectionStatus.style.color = isEnabled ? '#4CAF50' : '#f44336';
  }
}

// 新增：更新檢測結果顯示
function updateDetectionResult(stats) {
  const detectionResult = document.getElementById('detectionResult');
  if (detectionResult) {
    const total = stats.totalRequests || (stats.cdnCount + stats.nonCdnCount);
    const percentage = total > 0 ? ((stats.cdnCount / total) * 100).toFixed(2) : 0;
    detectionResult.textContent = `${percentage}% of resources are delivered via CDN (${stats.cdnCount}/${total})`;
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
    const stats = result.cdnStats || { cdnCount: 0, nonCdnCount: 0, totalRequests: 0 };
    updateDetectionResult(stats);
  });
}

// 新增：刷新檢測日誌（基於當前標籤頁）
function refreshDetectionLog() {
  const logContent = document.getElementById('logContent');
  if (logContent && !logContent.classList.contains('manual-refresh')) {
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
      logContent.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">暫無當前標籤頁檢測記錄<br><small>請確保已啟用檢測功能並瀏覽網站</small></div>';
      
      const summaryDiv = document.getElementById('logSummary');
      if (summaryDiv) {
        summaryDiv.textContent = '暫無當前標籤頁檢測記錄';
      }
      return;
    }

    const log = response.data.detectionLog;
    let filteredLog = cdnOnly ? log.filter(entry => entry.isCDN) : log;
    
    // 按時間倒序排列（最新的在前）
    filteredLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 取最近的 50 條記錄
    filteredLog = filteredLog.slice(0, 50);
    
    if (filteredLog.length === 0) {
      logContent.innerHTML = cdnOnly ? 
        '<div style="color: #999; text-align: center; padding: 20px;">當前標籤頁暫無檢測到使用 AspirappsCDN 的資源<br><small>請訪問包含 CDN 資源的網站</small></div>' :
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
      const status = entry.isCDN ? '✅ CDN' : '❌ No CDN';
      const statusColor = entry.isCDN ? '#4CAF50' : '#f44336';
      
      // 從 URL 中提取檔案名稱
      const fileName = entry.url.split('/').pop().split('?')[0] || 'unknown';
      const displayFileName = fileName.length > 30 ? fileName.substring(0, 30) + '...' : fileName;
      
      return `
        <div style="margin-bottom: 8px; padding: 6px; border-left: 3px solid ${statusColor}; background-color: white; border-radius: 3px;">
          <div style="font-weight: bold; color: ${statusColor};">${status} - ${displayFileName} - ${resourceType}</div>
          <div style="color: #333; margin: 2px 0; font-size: 10px;"><strong>域名:</strong> ${domain}</div>
          <div style="color: #666; font-size: 10px;"><strong>時間:</strong> ${time}</div>
          ${entry.viaHeader ? `<div style="color: #888; font-size: 9px; margin-top: 2px;"><strong>Via:</strong> ${entry.viaHeader.substring(0, 60)}${entry.viaHeader.length > 60 ? '...' : ''}</div>` : ''}
          <details style="margin-top: 4px;" open>
            <summary style="font-size: 10px; color: #666; cursor: pointer;">查看詳細資訊</summary>
            <div style="font-size: 9px; color: #555; margin-top: 4px; background-color: #f9f9f9; padding: 4px; border-radius: 2px;">
              <div style="word-break: break-all; margin-bottom: 4px;"><strong>完整檔名:</strong> ${fileName}</div>
              <div style="word-break: break-all; margin-bottom: 4px;"><strong>完整 URL:</strong> ${entry.url}</div>
              <div><strong>狀態碼:</strong> ${entry.statusCode}</div>
              <div><strong>請求方法:</strong> ${entry.method}</div>
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
        summaryDiv.textContent = `當前標籤頁最近 ${filteredLog.length} 個使用 AspirappsCDN 的資源`;
        summaryDiv.style.color = '#4CAF50';
      } else {
        const cdnCount = filteredLog.filter(entry => entry.isCDN).length;
        summaryDiv.textContent = `當前標籤頁最近 ${filteredLog.length} 個資源，其中 ${cdnCount} 個使用 AspirappsCDN`;
        summaryDiv.style.color = '#666';
      }
    }
  });
}

// 新增：清除檢測日誌
function clearDetectionLog() {
  if (!chrome.runtime) return;

  if (confirm('確定要清除所有檢測日誌嗎？')) {
    chrome.runtime.sendMessage({ type: 'clearDetectionLog' });
    
    // 重置統計
    chrome.storage.local.set({ 
      cdnStats: { cdnCount: 0, nonCdnCount: 0, totalRequests: 0 }
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to clear stats:', chrome.runtime.lastError);
      }
    });
    
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