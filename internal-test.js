function showResult(message, type = 'info') {
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
}

async function testConnection() {
    try {
        // 內部頁面可以直接使用 chrome.runtime.sendMessage
        const response = await chrome.runtime.sendMessage({
            type: 'PING'
        });
        
        if (response && response.status === 'ok') {
            showResult('✅ 連接成功！擴展正常運作。', 'success');
            console.log('Response:', response);
        } else {
            showResult('❌ 擴展回應異常', 'error');
        }
    } catch (error) {
        showResult(`❌ 錯誤: ${error.message}`, 'error');
        console.error('Error:', error);
    }
}

async function getMediaSegmentStats() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_MEDIA_SEGMENT_STATS'
        });
        
        if (response && response.success) {
            const stats = response.stats;
            let html = '<h3>媒體片段統計</h3>';
            html += '<pre>' + JSON.stringify(stats, null, 2) + '</pre>';
            showResult(html, 'success');
        } else {
            showResult(`❌ 獲取統計失敗: ${response?.error || '未知錯誤'}`, 'error');
        }
    } catch (error) {
        showResult(`❌ 錯誤: ${error.message}`, 'error');
    }
}

async function getMediaSegmentData() {
    try {
        // 獲取當前活躍標籤頁的 ID
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTabId = tabs[0]?.id;
        
        console.log('Active tab ID:', activeTabId);
        
        const response = await chrome.runtime.sendMessage({
            type: 'GET_MEDIA_SEGMENT_DATA',
            tabId: activeTabId
        });
        
        console.log('Response:', response);
        
        if (response && response.success) {
            let html = '<h3>媒體片段資料</h3>';
            html += '<pre>' + JSON.stringify(response.data, null, 2) + '</pre>';
            showResult(html, 'success');
        } else {
            let errorHtml = `❌ 獲取資料失敗: ${response?.error || '未知錯誤'}<br><br>`;
            errorHtml += '<strong>💡 提示：</strong><br>';
            errorHtml += '• 此功能需要在播放影片的標籤頁中才有資料<br>';
            errorHtml += '• 建議前往 YouTube 播放影片，然後再測試<br>';
            errorHtml += '• 或使用測試頁面：<a href="test-video-simple.html" target="_blank">test-video-simple.html</a><br>';
            errorHtml += `• 當前標籤頁 ID: ${activeTabId}`;
            showResult(errorHtml, 'error');
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
            showResult('✅ 資料已清除', 'success');
        } else {
            showResult(`❌ 清除失敗: ${response?.error || '未知錯誤'}`, 'error');
        }
    } catch (error) {
        showResult(`❌ 錯誤: ${error.message}`, 'error');
    }
}

async function debugMediaSegmentMap() {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'DEBUG_MEDIA_SEGMENT_MAP'
        });
        
        if (response && response.success) {
            let html = '<h3>調試：媒體片段映射狀態</h3>';
            html += '<pre>' + JSON.stringify(response.debug, null, 2) + '</pre>';
            showResult(html, 'info');
        } else {
            showResult(`❌ 調試失敗: ${response?.error || '未知錯誤'}`, 'error');
        }
    } catch (error) {
        showResult(`❌ 錯誤: ${error.message}`, 'error');
    }
}

// 頁面載入時設置事件監聽器和自動測試
document.addEventListener('DOMContentLoaded', () => {
    // 設置按鈕事件監聽器
    document.getElementById('testConnectionBtn').addEventListener('click', testConnection);
    document.getElementById('getStatsBtn').addEventListener('click', getMediaSegmentStats);
    document.getElementById('getDataBtn').addEventListener('click', getMediaSegmentData);
    document.getElementById('clearDataBtn').addEventListener('click', clearData);
    
    // 添加調試按鈕
    const debugBtn = document.createElement('button');
    debugBtn.textContent = '調試映射狀態';
    debugBtn.className = 'button';
    debugBtn.addEventListener('click', debugMediaSegmentMap);
    document.querySelector('h2').parentNode.insertBefore(debugBtn, document.getElementById('result'));
    
    // 延遲自動測試連接
    setTimeout(testConnection, 500);
}); 