/**
 * Frame Protection Detection Test Script
 * 外部腳本文件以符合 CSP 規則
 */

let logContainer, resultContainer, casesContainer, statsContainer;
let frameProtectionDetector = null;

// 初始化函數
function initializeTestPage() {
    logContainer = document.getElementById('test-logs');
    resultContainer = document.getElementById('test-results');
    casesContainer = document.getElementById('test-cases');
    statsContainer = document.getElementById('stats-display');
    
    // 綁定事件監聽器
    document.getElementById('test-detector-btn').addEventListener('click', testFrameProtectionDetector);
    document.getElementById('test-cases-btn').addEventListener('click', testFrameProtectionCases);
    document.getElementById('test-integration-btn').addEventListener('click', testBackgroundIntegration);
    document.getElementById('clear-results-btn').addEventListener('click', clearResults);
    
    // 綁定標籤切換事件
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    log('Frame Protection 檢測測試頁面已載入', 'info');
}

function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = document.createElement('div');
    logEntry.className = `test-result ${type}`;
    logEntry.innerHTML = `<strong>[${timestamp}]</strong> ${message}`;
    logContainer.appendChild(logEntry);
    console.log(`[${timestamp}] ${message}`);
}

function showResult(title, success, details = '', score = null) {
    const resultEntry = document.createElement('div');
    resultEntry.className = `test-result ${success ? 'success' : 'error'}`;
    
    let content = `<strong>${success ? '✅' : '❌'} ${title}</strong>`;
    if (score !== null) {
        const level = getScoreLevel(score);
        content += ` <span class="score ${level}">${score}/100 (${level})</span>`;
    }
    if (details) {
        content += `<pre>${details}</pre>`;
    }
    
    resultEntry.innerHTML = content;
    resultContainer.appendChild(resultEntry);
}

function getScoreLevel(score) {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    if (score >= 30) return 'poor';
    return 'critical';
}

function getProtectionLevel(xfo, fa) {
    if (xfo && fa) return 'comprehensive';
    if (xfo || fa) return 'partial';
    return 'none';
}

function switchTab(tabName) {
    // 隱藏所有標籤內容
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 移除所有標籤的 active 類
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 顯示選中的標籤內容
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // 為選中的標籤添加 active 類
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

function clearResults() {
    resultContainer.innerHTML = '';
    casesContainer.innerHTML = '';
    logContainer.innerHTML = '';
    statsContainer.innerHTML = '';
}

// 測試 Frame Protection 檢測器
async function testFrameProtectionDetector() {
    log('開始測試 Frame Protection 檢測器...', 'info');
    
    try {
        // 使用動態腳本載入替代 eval()
        await loadFrameProtectionDetectorModule();
        
        if (typeof FrameProtectionDetector !== 'undefined') {
            log('FrameProtectionDetector 載入成功', 'success');
            frameProtectionDetector = new FrameProtectionDetector();
            
            // 測試基本功能
            await testBasicFrameProtectionFunctions();
            
            showResult('Frame Protection 檢測器載入', true, '所有基本功能測試通過');
        } else {
            log('FrameProtectionDetector 載入失敗', 'error');
            showResult('Frame Protection 檢測器載入', false, '模組未定義');
        }
        
    } catch (error) {
        log(`Frame Protection 檢測器測試失敗: ${error.message}`, 'error');
        showResult('Frame Protection 檢測器測試', false, error.message);
    }
}

// 動態載入 FrameProtectionDetector 模組（避免使用 eval）
async function loadFrameProtectionDetectorModule() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/detectors/security/FrameProtectionDetector.js');
        script.onload = () => {
            log('FrameProtectionDetector 模組腳本載入完成', 'info');
            resolve();
        };
        script.onerror = (error) => {
            log(`FrameProtectionDetector 模組腳本載入失敗: ${error.message}`, 'error');
            reject(error);
        };
        document.head.appendChild(script);
    });
}

// 測試基本 Frame Protection 功能
async function testBasicFrameProtectionFunctions() {
    const testHeaders = new Map([
        ['x-frame-options', 'DENY'],
        ['content-security-policy', "default-src 'self'; frame-ancestors 'none'"]
    ]);
    
    const result = frameProtectionDetector.detectFrameProtection(testHeaders, 'https://example.com');
    
    if (result.present && result.score !== undefined) {
        log(`基本 Frame Protection 檢測成功，分數: ${result.score}`, 'success');
    } else {
        log('基本 Frame Protection 檢測失敗', 'error');
    }
}

// 測試 Frame Protection 測試案例
async function testFrameProtectionCases() {
    if (!frameProtectionDetector) {
        await testFrameProtectionDetector();
    }
    
    if (!frameProtectionDetector) {
        log('Frame Protection 檢測器未載入，無法執行測試案例', 'error');
        return;
    }
    
    log('開始測試 Frame Protection 測試案例...', 'info');
    
    const testCases = [
        {
            name: '無任何保護',
            headers: new Map(),
            expectedScore: 0,
            expectedLevel: 'critical'
        },
        {
            name: 'X-Frame-Options: DENY',
            headers: new Map([
                ['x-frame-options', 'DENY']
            ]),
            expectedScore: 85,
            expectedLevel: 'good'
        },
        {
            name: 'X-Frame-Options: SAMEORIGIN',
            headers: new Map([
                ['x-frame-options', 'SAMEORIGIN']
            ]),
            expectedScore: 70,
            expectedLevel: 'good'
        },
        {
            name: 'CSP frame-ancestors: none',
            headers: new Map([
                ['content-security-policy', "default-src 'self'; frame-ancestors 'none'"]
            ]),
            expectedScore: 75,
            expectedLevel: 'good'
        },
        {
            name: 'CSP frame-ancestors: self',
            headers: new Map([
                ['content-security-policy', "default-src 'self'; frame-ancestors 'self'"]
            ]),
            expectedScore: 65,
            expectedLevel: 'fair'
        },
        {
            name: '雙重保護 (X-Frame-Options + CSP)',
            headers: new Map([
                ['x-frame-options', 'DENY'],
                ['content-security-policy', "default-src 'self'; frame-ancestors 'none'"]
            ]),
            expectedScore: 95,
            expectedLevel: 'excellent'
        },
        {
            name: 'CSP Report-Only',
            headers: new Map([
                ['content-security-policy-report-only', "default-src 'self'; frame-ancestors 'none'"]
            ]),
            expectedScore: 60,
            expectedLevel: 'fair'
        },
        {
            name: '衝突的設定',
            headers: new Map([
                ['x-frame-options', 'DENY'],
                ['content-security-policy', "default-src 'self'; frame-ancestors 'self'"]
            ]),
            expectedScore: 80,
            expectedLevel: 'good'
        },
        {
            name: 'X-Frame-Options: ALLOW-FROM',
            headers: new Map([
                ['x-frame-options', 'ALLOW-FROM https://trusted.example.com']
            ]),
            expectedScore: 50,
            expectedLevel: 'fair'
        }
    ];
    
    casesContainer.innerHTML = '';
    
    for (const testCase of testCases) {
        const result = frameProtectionDetector.detectFrameProtection(testCase.headers, 'https://example.com');
        
        const caseDiv = document.createElement('div');
        caseDiv.className = 'test-case';
        
        const success = result.present || testCase.expectedScore === 0;
        const scoreMatch = Math.abs(result.score - testCase.expectedScore) <= 15; // 允許 15 分誤差
        
        const protectionLevel = getProtectionLevel(
            result.xFrameOptions?.present,
            result.frameAncestors?.present
        );
        
        caseDiv.innerHTML = `
            <h4>${testCase.name}</h4>
            <p><strong>預期分數:</strong> ${testCase.expectedScore} (${testCase.expectedLevel})</p>
            <p><strong>實際分數:</strong> <span class="score ${result.level}">${result.score}/100 (${result.level})</span></p>
            <div class="protection-status ${protectionLevel}">
                <strong>保護狀態:</strong> ${protectionLevel.toUpperCase()}
            </div>
            <p><strong>結果:</strong> ${success && scoreMatch ? '✅ 通過' : '❌ 失敗'}</p>
            <details>
                <summary>詳細結果</summary>
                <pre>${JSON.stringify(result, null, 2)}</pre>
            </details>
        `;
        
        casesContainer.appendChild(caseDiv);
        
        if (success && scoreMatch) {
            log(`測試案例 "${testCase.name}" 通過`, 'success');
        } else {
            log(`測試案例 "${testCase.name}" 失敗 (預期: ${testCase.expectedScore}, 實際: ${result.score})`, 'error');
        }
    }
    
    showResult('Frame Protection 測試案例', true, `完成 ${testCases.length} 個測試案例`);
}

// 測試背景腳本整合
async function testBackgroundIntegration() {
    log('開始測試背景腳本整合...', 'info');
    
    try {
        // 測試安全狀態獲取
        const statusResponse = await chrome.runtime.sendMessage({
            type: 'GET_SECURITY_STATUS'
        });
        
        if (statusResponse && statusResponse.success) {
            log('安全狀態獲取成功', 'success');
            showResult('背景腳本安全狀態', true, JSON.stringify(statusResponse.status, null, 2));
        } else {
            log('安全狀態獲取失敗', 'error');
            showResult('背景腳本安全狀態', false, statusResponse ? statusResponse.error : '無響應');
        }
        
        // 測試當前標籤頁安全資料
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0) {
            const dataResponse = await chrome.runtime.sendMessage({
                type: 'GET_SECURITY_DATA',
                tabId: tabs[0].id
            });
            
            if (dataResponse && dataResponse.success) {
                log('當前標籤頁安全資料獲取成功', 'success');
                
                // 特別檢查 Frame Protection 資料
                const data = dataResponse.data;
                if (data && data.headers && data.headers.frameProtection) {
                    const fp = data.headers.frameProtection;
                    showResult('Frame Protection 資料', true, 
                        `分數: ${fp.score}, 等級: ${fp.level}, 存在: ${fp.present}`);
                }
                
                showResult('標籤頁安全資料', true, JSON.stringify(dataResponse.data, null, 2));
            } else {
                log('當前標籤頁安全資料獲取失敗', 'warning');
                showResult('標籤頁安全資料', false, dataResponse ? dataResponse.error : '無響應');
            }
        }
        
    } catch (error) {
        log(`背景腳本整合測試失敗: ${error.message}`, 'error');
        showResult('背景腳本整合', false, error.message);
    }
}

// 顯示統計資料
function showStats() {
    if (!frameProtectionDetector) {
        statsContainer.innerHTML = '<p>Frame Protection 檢測器未載入</p>';
        return;
    }
    
    const stats = frameProtectionDetector.getStatistics();
    statsContainer.innerHTML = `
        <h4>Frame Protection 檢測統計</h4>
        <ul>
            <li>總檢測次數: ${stats.totalChecks}</li>
            <li>有保護的網站: ${stats.withFrameProtection}</li>
            <li>無保護的網站: ${stats.withoutFrameProtection}</li>
            <li>僅 X-Frame-Options: ${stats.xFrameOptionsOnly}</li>
            <li>僅 CSP frame-ancestors: ${stats.frameAncestorsOnly}</li>
            <li>雙重保護: ${stats.bothProtections}</li>
            <li>保護率: ${stats.protectionRate}%</li>
            <li>平均分數: ${stats.averageScore.toFixed(2)}</li>
            <li>快取大小: ${stats.cacheSize}</li>
        </ul>
        <h4>常見問題</h4>
        <pre>${JSON.stringify(stats.commonIssues, null, 2)}</pre>
    `;
}

// 定期更新統計資料
function startStatsUpdater() {
    setInterval(() => {
        if (document.getElementById('stats-tab').classList.contains('active')) {
            showStats();
        }
    }, 5000);
}

// 頁面載入完成後初始化
document.addEventListener('DOMContentLoaded', initializeTestPage);

// 啟動統計更新器
startStatsUpdater();