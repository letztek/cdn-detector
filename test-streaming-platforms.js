function showResult(message, type = 'info') {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

async function checkAllTabs() {
    try {
        // 獲取所有標籤頁
        const tabs = await chrome.tabs.query({});
        
        let html = '<h3>📋 所有標籤頁檢查</h3>';
        html += '<table border="1" style="width:100%; border-collapse: collapse;">';
        html += '<tr><th>標籤頁 ID</th><th>標題</th><th>URL</th><th>媒體片段資料</th></tr>';
        
        for (const tab of tabs) {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_MEDIA_SEGMENT_DATA',
                tabId: tab.id
            });
            
            const hasData = response && response.success && response.data;
            const segmentCount = hasData ? (response.data.segments?.length || 0) : 0;
            
            html += `<tr>`;
            html += `<td>${tab.id}</td>`;
            html += `<td style="max-width:200px; overflow:hidden;">${tab.title.substring(0, 50)}...</td>`;
            html += `<td style="max-width:200px; overflow:hidden;">${tab.url.substring(0, 50)}...</td>`;
            html += `<td style="color: ${hasData ? 'green' : 'red'};">${hasData ? `✅ ${segmentCount} 個片段` : '❌ 無資料'}</td>`;
            html += `</tr>`;
        }
        
        html += '</table>';
        showResult(html, 'info');
        
    } catch (error) {
        showResult(`❌ 錯誤: ${error.message}`, 'error');
    }
}

async function getStats() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_MEDIA_SEGMENT_STATS'
        });
        
        if (response && response.success) {
            let html = '<h3>📊 媒體片段統計</h3>';
            html += '<pre>' + JSON.stringify(response.stats, null, 2) + '</pre>';
            showResult(html, 'success');
        } else {
            showResult(`❌ 獲取統計失敗: ${response?.error || '未知錯誤'}`, 'error');
        }
    } catch (error) {
        showResult(`❌ 錯誤: ${error.message}`, 'error');
    }
}

async function debugMap() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'DEBUG_MEDIA_SEGMENT_MAP'
        });
        
        if (response && response.success) {
            let html = '<h3>🔍 調試：媒體片段映射狀態</h3>';
            
            const debug = response.debug;
            html += `<p><strong>有資料的標籤頁：</strong> ${debug.mediaSegmentMapKeys.length} 個</p>`;
            html += `<p><strong>標籤頁 IDs：</strong> [${debug.mediaSegmentMapKeys.join(', ')}]</p>`;
            
            if (debug.mediaSegmentMapKeys.length > 0) {
                html += '<h4>詳細資料：</h4>';
                for (const tabId of debug.mediaSegmentMapKeys) {
                    const tabData = debug.mediaSegmentMapContent[tabId];
                    html += `<div style="border: 1px solid #ccc; padding: 10px; margin: 5px;">`;
                    html += `<strong>標籤頁 ${tabId}:</strong><br>`;
                    html += `- 片段數量: ${tabData.segments?.length || 0}<br>`;
                    html += `- 總位元組: ${tabData.stats?.totalBytes || 0}<br>`;
                    html += `- DASH 片段: ${tabData.stats?.dashSegments || 0}<br>`;
                    html += `- HLS 片段: ${tabData.stats?.hlsSegments || 0}<br>`;
                    html += `- 最後更新: ${new Date(tabData.stats?.lastUpdated || 0).toLocaleString()}<br>`;
                    
                    if (tabData.segments && tabData.segments.length > 0) {
                        html += `<details><summary>最近的片段 (${Math.min(5, tabData.segments.length)} 個)</summary>`;
                        const recentSegments = tabData.segments.slice(-5);
                        for (const segment of recentSegments) {
                            html += `<div style="margin: 5px 0; padding: 5px; background: #f8f9fa;">`;
                            html += `<strong>${segment.segmentType}</strong>: ${segment.url.substring(0, 80)}...<br>`;
                            html += `大小: ${segment.contentLength} bytes, 時間: ${segment.downloadTime}ms, 頻寬: ${Math.round(segment.bandwidth/1024)} KB/s`;
                            html += `</div>`;
                        }
                        html += `</details>`;
                    }
                    html += `</div>`;
                }
            } else {
                html += '<p style="color: orange;"><strong>⚠️ 沒有找到任何媒體片段資料</strong></p>';
                html += '<p>可能的原因：</p>';
                html += '<ul>';
                html += '<li>串流平台不使用 DASH (.m4s) 或 HLS (.ts) 技術</li>';
                html += '<li>影片還沒開始播放或載入</li>';
                html += '<li>使用的是 Progressive Download (.mp4) 而不是串流</li>';
                html += '<li>擴展的媒體片段檢測有問題</li>';
                html += '</ul>';
            }
            
            showResult(html, 'info');
        } else {
            showResult(`❌ 調試失敗: ${response?.error || '未知錯誤'}`, 'error');
        }
    } catch (error) {
        showResult(`❌ 錯誤: ${error.message}`, 'error');
    }
}

async function clearData() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'CLEAR_MEDIA_SEGMENT_DATA'
        });
        
        if (response && response.success) {
            showResult('✅ 所有媒體片段資料已清除', 'success');
        } else {
            showResult(`❌ 清除失敗: ${response?.error || '未知錯誤'}`, 'error');
        }
    } catch (error) {
        showResult(`❌ 錯誤: ${error.message}`, 'error');
    }
}

// 頁面載入時設置事件監聽器
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('checkAllTabsBtn').addEventListener('click', checkAllTabs);
    document.getElementById('getStatsBtn').addEventListener('click', getStats);
    document.getElementById('debugMapBtn').addEventListener('click', debugMap);
    document.getElementById('clearDataBtn').addEventListener('click', clearData);
    
    // 顯示初始說明
    showResult('準備就緒！請按照上方步驟測試串流平台。', 'info');
}); 