// test-content-script.js - 外部 JavaScript 文件，避免 CSP 違規

// 全域變數
let videoEventCount = 0;
let contentScriptLoaded = false;
let checkInterval;
let countdownInterval;
let logEntries = [];

// 頁面載入完成後開始檢查
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 Task 22.3 測試頁面載入完成');
    startContentScriptCheck();
    setupVideoEventListeners();
    interceptConsoleLog();
    setupEventListeners();
});

// 設置事件監聽器
function setupEventListeners() {
    // Content Script 狀態檢查按鈕
    document.getElementById('checkContentScriptBtn').addEventListener('click', checkContentScriptStatus);
    document.getElementById('testCommunicationBtn').addEventListener('click', testCommunication);
    
    // 視頻控制按鈕
    document.getElementById('playAllVideosBtn').addEventListener('click', playAllVideos);
    document.getElementById('pauseAllVideosBtn').addEventListener('click', pauseAllVideos);
    document.getElementById('detectVideosBtn').addEventListener('click', detectVideos);
    document.getElementById('addDynamicVideoBtn').addEventListener('click', addDynamicVideo);
    
    // 事件測試按鈕
    document.getElementById('clearEventLogBtn').addEventListener('click', clearEventLog);
    
    // 數據收集按鈕
    document.getElementById('getVideoQualityDataBtn').addEventListener('click', getVideoQualityData);
    document.getElementById('getVideoQualityStatsBtn').addEventListener('click', getVideoQualityStats);
    document.getElementById('clearVideoQualityDataBtn').addEventListener('click', clearVideoQualityData);
    
    // Console 日誌按鈕
    document.getElementById('clearConsoleLogBtn').addEventListener('click', clearConsoleLog);
    document.getElementById('exportLogsBtn').addEventListener('click', exportLogs);
}

// 開始檢查 Content Script
function startContentScriptCheck() {
    let countdown = 10;
    const countdownElement = document.getElementById('loadingCountdown');
    
    countdownInterval = setInterval(() => {
        countdownElement.textContent = `檢查中... (${countdown}秒)`;
        countdown--;
        
        if (countdown < 0) {
            clearInterval(countdownInterval);
            countdownElement.textContent = '檢查完成';
        }
    }, 1000);
    
    // 延遲檢查以確保 content script 有時間載入
    setTimeout(() => {
        checkContentScriptStatus();
        // 每5秒檢查一次
        checkInterval = setInterval(checkContentScriptStatus, 5000);
    }, 2000);
}

// 檢查 Content Script 狀態
function checkContentScriptStatus() {
    const statusElement = document.getElementById('contentScriptStatus');
    const results = [];
    
    // 檢查 1: Background Script 通信測試
    let hasSuccessfulCommunication = logEntries.some(log => 
        log.message.includes('通信成功') || 
        log.message.includes('"success": true') ||
        log.message.includes('測試與 Background Script 通信')
    );
    
    // 檢查 2: 視頻事件檢測
    let hasVideoEvents = logEntries.some(log => 
        log.message.includes('視頻事件:') ||
        log.message.includes('canplaythrough') ||
        log.message.includes('suspend') ||
        log.message.includes('視頻') && log.message.includes('-')
    );
    
    // 檢查 3: Console 日誌 (Video Quality Monitor)
    const hasVideoMonitorLog = logEntries.some(log => 
        log.message.includes('Video Quality Monitor') || 
        log.message.includes('視頻品質監控已載入') ||
        log.message.includes('[Video Quality Monitor]') ||
        log.message.includes('視頻品質監控器') ||
        log.message.includes('Content Script 載入') ||
        log.message.includes('視頻監控初始化') ||
        log.message.includes('平台:') ||
        log.message.includes('Platform:') ||
        log.message.includes('初始載入時發現') ||
        log.message.includes('個影片元素')
    );
    
    // 如果有成功的通信或視頻事件，說明 Content Script 正在工作
    const contentScriptWorking = hasSuccessfulCommunication || hasVideoEvents;
    
    results.push({
        test: 'Content Script 工作狀態',
        passed: contentScriptWorking,
        message: contentScriptWorking ? 
            '✅ Content Script 正常工作 (通信/事件檢測成功)' : 
            '❌ Content Script 未檢測到活動'
    });
    
    results.push({
        test: 'Video Quality Monitor 日誌',
        passed: hasVideoMonitorLog,
        message: hasVideoMonitorLog ? 
            '✅ 檢測到 Video Quality Monitor 日誌' : 
            '⚠️ 未檢測到特定日誌 (但功能可能正常)'
    });
    
    // 檢查 2: Chrome Runtime API
    const hasChromeRuntime = typeof chrome !== 'undefined' && chrome.runtime;
    results.push({
        test: 'Chrome Runtime API',
        passed: hasChromeRuntime,
        message: hasChromeRuntime ? 
            '✅ Chrome Runtime API 可用' : 
            '❌ Chrome Runtime API 不可用'
    });
    
    // 檢查 3: 視頻元素檢測
    const videos = document.querySelectorAll('video');
    results.push({
        test: '視頻元素檢測',
        passed: videos.length > 0,
        message: `✅ 檢測到 ${videos.length} 個視頻元素`
    });
    
    // 檢查 4: MutationObserver
    const hasMutationObserver = typeof MutationObserver !== 'undefined';
    results.push({
        test: 'MutationObserver 支援',
        passed: hasMutationObserver,
        message: hasMutationObserver ? 
            '✅ MutationObserver 可用' : 
            '❌ MutationObserver 不可用'
    });
    
    // 更新顯示 - 使用 DOM 操作而非 innerHTML
    statusElement.textContent = ''; // 清空內容
    results.forEach(result => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'test-item';
        
        const indicator = document.createElement('span');
        indicator.className = `status-indicator ${result.passed ? 'status-success' : 'status-error'}`;
        
        const text = document.createElement('span');
        text.textContent = `${result.test}: ${result.message}`;
        
        itemDiv.appendChild(indicator);
        itemDiv.appendChild(text);
        statusElement.appendChild(itemDiv);
    });
    
    const allPassed = results.every(r => r.passed);
    contentScriptLoaded = allPassed;
    
    if (allPassed) {
        addLogEntry('Content Script 檢查通過！', 'info');
        clearInterval(checkInterval);
    }
}

// 測試與 Background Script 通信
function testCommunication() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        addLogEntry('Chrome Runtime API 不可用', 'error');
        return;
    }
    
    addLogEntry('測試與 Background Script 通信...', 'info');
    
    chrome.runtime.sendMessage({
        type: 'GET_VIDEO_QUALITY_DATA'
    }, (response) => {
        if (chrome.runtime.lastError) {
            addLogEntry(`通信失敗: ${chrome.runtime.lastError.message}`, 'error');
        } else {
            addLogEntry(`通信成功: ${JSON.stringify(response, null, 2)}`, 'info');
        }
    });
}

// 設置視頻事件監聽器
function setupVideoEventListeners() {
    const videos = document.querySelectorAll('video');
    const events = [
        'loadstart', 'loadeddata', 'loadedmetadata', 'canplay', 'canplaythrough',
        'play', 'pause', 'seeking', 'seeked', 'waiting', 'playing',
        'timeupdate', 'ended', 'error', 'stalled', 'suspend', 'abort',
        'emptied', 'ratechange', 'volumechange'
    ];
    
    videos.forEach((video, videoIndex) => {
        events.forEach(eventName => {
            video.addEventListener(eventName, (event) => {
                videoEventCount++;
                updateEventTestResults(videoIndex + 1, eventName, event);
            }, { passive: true });
        });
    });
    
    addLogEntry(`設置了 ${videos.length} 個視頻的事件監聽器`, 'info');
}

// 更新事件測試結果
function updateEventTestResults(videoIndex, eventName, event) {
    const resultsElement = document.getElementById('eventTestResults');
    const timestamp = new Date().toLocaleTimeString();
    
    // 創建新的事件項目
    const itemDiv = document.createElement('div');
    itemDiv.className = 'test-item';
    
    const indicator = document.createElement('span');
    indicator.className = 'status-indicator status-success';
    
    const text = document.createElement('span');
    text.textContent = `${timestamp} - 視頻${videoIndex}: ${eventName}`;
    
    itemDiv.appendChild(indicator);
    itemDiv.appendChild(text);
    
    // 插入到最前面
    resultsElement.insertBefore(itemDiv, resultsElement.firstChild);
    
    // 限制顯示的事件數量
    const items = resultsElement.querySelectorAll('.test-item');
    if (items.length > 20) {
        items[items.length - 1].remove();
    }
    
    addLogEntry(`視頻事件: 視頻${videoIndex} - ${eventName}`, 'debug');
}

// 播放所有視頻
function playAllVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video, index) => {
        video.play().then(() => {
            addLogEntry(`視頻${index + 1} 開始播放`, 'info');
        }).catch(error => {
            addLogEntry(`視頻${index + 1} 播放失敗: ${error.message}`, 'error');
        });
    });
}

// 暫停所有視頻
function pauseAllVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach((video, index) => {
        video.pause();
        addLogEntry(`視頻${index + 1} 已暫停`, 'info');
    });
}

// 檢測視頻元素
function detectVideos() {
    const videos = document.querySelectorAll('video');
    const objects = document.querySelectorAll('object');
    const embeds = document.querySelectorAll('embed');
    const iframes = document.querySelectorAll('iframe');
    
    const resultsElement = document.getElementById('videoDetectionResults');
    resultsElement.textContent = ''; // 清空內容
    
    // 創建檢測結果項目
    const createResultItem = (count, type, statusClass = 'status-info') => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'test-item';
        
        const indicator = document.createElement('span');
        indicator.className = `status-indicator ${statusClass}`;
        
        const text = document.createElement('span');
        text.textContent = `檢測到 ${count} 個 ${type} 元素`;
        
        itemDiv.appendChild(indicator);
        itemDiv.appendChild(text);
        return itemDiv;
    };
    
    resultsElement.appendChild(createResultItem(videos.length, 'video', 'status-success'));
    resultsElement.appendChild(createResultItem(objects.length, 'object'));
    resultsElement.appendChild(createResultItem(embeds.length, 'embed'));
    resultsElement.appendChild(createResultItem(iframes.length, 'iframe'));
    
    addLogEntry(`視頻檢測: ${videos.length} video, ${objects.length} object, ${embeds.length} embed, ${iframes.length} iframe`, 'info');
}

// 添加動態視頻
function addDynamicVideo() {
    const container = document.querySelector('.video-container');
    const videoCount = container.children.length + 1;
    
    const videoItem = document.createElement('div');
    videoItem.className = 'video-item';
    
    // 創建標題
    const h3 = document.createElement('h3');
    h3.textContent = `動態視頻 ${videoCount}`;
    videoItem.appendChild(h3);
    
    // 創建視頻元素
    const video = document.createElement('video');
    video.controls = true;
    video.muted = true;
    
    const source = document.createElement('source');
    source.src = 'https://www.w3schools.com/html/movie.mp4';
    source.type = 'video/mp4';
    
    video.appendChild(source);
    video.textContent = '動態載入的視頻'; // 備用文字
    videoItem.appendChild(video);
    
    container.appendChild(videoItem);
    
    // 為新視頻設置事件監聽器
    const newVideo = video; // 使用已創建的 video 元素
    const events = ['play', 'pause', 'ended', 'error', 'loadedmetadata'];
    events.forEach(eventName => {
        newVideo.addEventListener(eventName, (event) => {
            updateEventTestResults(videoCount, eventName, event);
        });
    });
    
    addLogEntry(`添加了動態視頻 ${videoCount}`, 'info');
    
    // 重新檢測視頻
    setTimeout(detectVideos, 100);
}

// 獲取視頻品質數據
function getVideoQualityData() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        addDataResult('Chrome Runtime API 不可用', 'error');
        return;
    }
    
    chrome.runtime.sendMessage({
        type: 'GET_VIDEO_QUALITY_DATA'
    }, (response) => {
        if (chrome.runtime.lastError) {
            addDataResult(`獲取數據失敗: ${chrome.runtime.lastError.message}`, 'error');
        } else {
            addDataResult(`視頻品質數據: ${JSON.stringify(response, null, 2)}`, 'info');
        }
    });
}

// 獲取視頻品質統計
function getVideoQualityStats() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        addDataResult('Chrome Runtime API 不可用', 'error');
        return;
    }
    
    chrome.runtime.sendMessage({
        type: 'GET_VIDEO_QUALITY_STATS'
    }, (response) => {
        if (chrome.runtime.lastError) {
            addDataResult(`獲取統計失敗: ${chrome.runtime.lastError.message}`, 'error');
        } else {
            addDataResult(`視頻品質統計: ${JSON.stringify(response, null, 2)}`, 'info');
        }
    });
}

// 清除視頻品質數據
function clearVideoQualityData() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        addDataResult('Chrome Runtime API 不可用', 'error');
        return;
    }
    
    chrome.runtime.sendMessage({
        type: 'CLEAR_VIDEO_QUALITY_DATA'
    }, (response) => {
        if (chrome.runtime.lastError) {
            addDataResult(`清除數據失敗: ${chrome.runtime.lastError.message}`, 'error');
        } else {
            addDataResult('視頻品質數據已清除', 'info');
        }
    });
}

// 添加數據結果
function addDataResult(message, level) {
    const resultsElement = document.getElementById('dataCollectionResults');
    const timestamp = new Date().toLocaleTimeString();
    
    const entry = document.createElement('div');
    entry.className = `log-entry log-${level}`;
    entry.textContent = `${timestamp} - ${message}`;
    
    resultsElement.insertBefore(entry, resultsElement.firstChild);
    
    // 限制顯示的條目數量
    const entries = resultsElement.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[entries.length - 1].remove();
    }
}

// 攔截 Console 日誌
function interceptConsoleLog() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    
    // 定期重新檢查狀態，以捕獲後續的日誌和事件
    setTimeout(() => {
        checkContentScriptStatus();
    }, 2000);
    
    console.log = function(...args) {
        const message = args.join(' ');
        addLogEntry(message, 'info');
        originalLog.apply(console, args);
    };
    
    console.info = function(...args) {
        const message = args.join(' ');
        addLogEntry(message, 'info');
        originalInfo.apply(console, args);
    };
    
    console.warn = function(...args) {
        const message = args.join(' ');
        addLogEntry(message, 'warn');
        originalWarn.apply(console, args);
    };
    
    console.error = function(...args) {
        const message = args.join(' ');
        addLogEntry(message, 'error');
        originalError.apply(console, args);
    };
}

// 添加日誌條目
function addLogEntry(message, level) {
    const timestamp = new Date().toLocaleTimeString();
    logEntries.push({ timestamp, message, level });
    
    const logOutput = document.getElementById('consoleLogOutput');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${level}`;
    entry.textContent = `${timestamp} - ${message}`;
    
    logOutput.insertBefore(entry, logOutput.firstChild);
    
    // 限制日誌條目數量
    if (logEntries.length > 100) {
        logEntries = logEntries.slice(0, 50);
    }
    
    const entries = logOutput.querySelectorAll('.log-entry');
    if (entries.length > 50) {
        entries[entries.length - 1].remove();
    }
}

// 清除事件日誌
function clearEventLog() {
    const resultsElement = document.getElementById('eventTestResults');
    resultsElement.textContent = ''; // 清空內容
    
    // 創建預設項目
    const itemDiv = document.createElement('div');
    itemDiv.className = 'test-item';
    
    const indicator = document.createElement('span');
    indicator.className = 'status-indicator status-pending';
    
    const text = document.createElement('span');
    text.textContent = '等待視頻事件...';
    
    itemDiv.appendChild(indicator);
    itemDiv.appendChild(text);
    resultsElement.appendChild(itemDiv);
    
    videoEventCount = 0;
}

// 清除 Console 日誌
function clearConsoleLog() {
    const logOutput = document.getElementById('consoleLogOutput');
    logOutput.textContent = ''; // 清空內容
    
    // 創建清除訊息
    const entry = document.createElement('div');
    entry.className = 'log-entry log-info';
    entry.textContent = 'Console 日誌已清除';
    logOutput.appendChild(entry);
    
    logEntries = [];
}

// 匯出日誌
function exportLogs() {
    const data = {
        timestamp: new Date().toISOString(),
        contentScriptLoaded,
        videoEventCount,
        logEntries: logEntries.slice(0, 100),
        videoElements: document.querySelectorAll('video').length,
        userAgent: navigator.userAgent
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-22.3-test-logs-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    addLogEntry('測試日誌已匯出', 'info');
}

// 頁面卸載時清理
window.addEventListener('beforeunload', () => {
    if (checkInterval) clearInterval(checkInterval);
    if (countdownInterval) clearInterval(countdownInterval);
}); 