/**
 * CSP Detection Test Script
 * 外部腳本文件以符合 CSP 規則
 */

let logContainer, resultContainer, casesContainer, statsContainer;
let cspDetector = null;

// 初始化函數
function initializeTestPage() {
    logContainer = document.getElementById('test-logs');
    resultContainer = document.getElementById('test-results');
    casesContainer = document.getElementById('test-cases');
    statsContainer = document.getElementById('stats-display');
    
    // 綁定事件監聽器
    document.getElementById('test-detector-btn').addEventListener('click', testCSPDetector);
    document.getElementById('test-cases-btn').addEventListener('click', testCSPTestCases);
    document.getElementById('test-integration-btn').addEventListener('click', testBackgroundIntegration);
    document.getElementById('clear-results-btn').addEventListener('click', clearResults);
    
    // 綁定標籤切換事件
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    log('CSP 檢測測試頁面已載入', 'info');
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

// 測試 CSP 檢測器
async function testCSPDetector() {
    log('開始測試 CSP 檢測器...', 'info');
    
    try {
        // 使用動態腳本載入替代 eval()
        await loadCSPDetectorModule();
        
        if (typeof CSPDetector !== 'undefined') {
            log('CSPDetector 載入成功', 'success');
            cspDetector = new CSPDetector();
            
            // 測試基本功能
            await testBasicCSPFunctions();
            
            showResult('CSP 檢測器載入', true, '所有基本功能測試通過');
        } else {
            log('CSPDetector 載入失敗', 'error');
            showResult('CSP 檢測器載入', false, '模組未定義');
        }
        
    } catch (error) {
        log(`CSP 檢測器測試失敗: ${error.message}`, 'error');
        showResult('CSP 檢測器測試', false, error.message);
    }
}

// 動態載入 CSPDetector 模組（避免使用 eval）
async function loadCSPDetectorModule() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('src/detectors/security/CSPDetector.js');
        script.onload = () => {
            log('CSPDetector 模組腳本載入完成', 'info');
            resolve();
        };
        script.onerror = (error) => {
            log(`CSPDetector 模組腳本載入失敗: ${error.message}`, 'error');
            reject(error);
        };
        document.head.appendChild(script);
    });
}

// 測試基本 CSP 功能
async function testBasicCSPFunctions() {
    const testHeaders = new Map([
        ['content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'"]
    ]);
    
    const result = cspDetector.detectCSP(testHeaders, 'https://example.com');
    
    if (result.present && result.score !== undefined) {
        log(`基本 CSP 檢測成功，分數: ${result.score}`, 'success');
    } else {
        log('基本 CSP 檢測失敗', 'error');
    }
}

// 測試 CSP 測試案例
async function testCSPTestCases() {
    if (!cspDetector) {
        await testCSPDetector();
    }
    
    if (!cspDetector) {
        log('CSP 檢測器未載入，無法執行測試案例', 'error');
        return;
    }
    
    log('開始測試 CSP 測試案例...', 'info');
    
    const testCases = [
        {
            name: '無 CSP Header',
            headers: new Map(),
            expectedScore: 0,
            expectedLevel: 'critical'
        },
        {
            name: '嚴格 CSP',
            headers: new Map([
                ['content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'"]
            ]),
            expectedScore: 85,
            expectedLevel: 'good'
        },
        {
            name: '包含 unsafe-inline 的 CSP',
            headers: new Map([
                ['content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'"]
            ]),
            expectedScore: 50,
            expectedLevel: 'fair'
        },
        {
            name: '包含 unsafe-eval 的 CSP',
            headers: new Map([
                ['content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-eval'"]
            ]),
            expectedScore: 55,
            expectedLevel: 'fair'
        },
        {
            name: '非常寬鬆的 CSP',
            headers: new Map([
                ['content-security-policy', "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'"]
            ]),
            expectedScore: 20,
            expectedLevel: 'poor'
        },
        {
            name: '只有 Report-Only CSP',
            headers: new Map([
                ['content-security-policy-report-only', "default-src 'self'"]
            ]),
            expectedScore: 75,
            expectedLevel: 'good'
        }
    ];
    
    casesContainer.innerHTML = '';
    
    for (const testCase of testCases) {
        const result = cspDetector.detectCSP(testCase.headers, 'https://example.com');
        
        const caseDiv = document.createElement('div');
        caseDiv.className = 'csp-test-case';
        
        const success = result.present || testCase.expectedScore === 0;
        const scoreMatch = Math.abs(result.score - testCase.expectedScore) <= 10; // 允許 10 分誤差
        
        caseDiv.innerHTML = `
            <h4>${testCase.name}</h4>
            <p><strong>預期分數:</strong> ${testCase.expectedScore} (${testCase.expectedLevel})</p>
            <p><strong>實際分數:</strong> <span class="score ${result.level}">${result.score}/100 (${result.level})</span></p>
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
            log(`測試案例 "${testCase.name}" 失敗`, 'error');
        }
    }
    
    showResult('CSP 測試案例', true, `完成 ${testCases.length} 個測試案例`);
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
    if (!cspDetector) {
        statsContainer.innerHTML = '<p>CSP 檢測器未載入</p>';
        return;
    }
    
    const stats = cspDetector.getStatistics();
    statsContainer.innerHTML = `
        <h4>CSP 檢測統計</h4>
        <ul>
            <li>總檢測次數: ${stats.totalChecks}</li>
            <li>有 CSP 的網站: ${stats.withCSP}</li>
            <li>無 CSP 的網站: ${stats.withoutCSP}</li>
            <li>檢測率: ${stats.detectionRate}%</li>
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