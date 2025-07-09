// Content-Type Protection 檢測測試腳本

// 測試統計
let testStats = {
    run: 0,
    pass: 0,
    fail: 0
};

// 更新測試統計
function updateTestStats() {
    document.getElementById('testsRun').textContent = testStats.run;
    document.getElementById('testsPass').textContent = testStats.pass;
    document.getElementById('testsFail').textContent = testStats.fail;
    document.getElementById('successRate').textContent = 
        testStats.run > 0 ? Math.round((testStats.pass / testStats.run) * 100) + '%' : '0%';
}

// 顯示測試結果
function showResult(elementId, content, type = 'info') {
    const element = document.getElementById(elementId);
    element.innerHTML = content;
    element.className = `result ${type}`;
    element.style.display = 'block';
}

// 記錄測試結果
function recordTest(passed, testName) {
    testStats.run++;
    if (passed) {
        testStats.pass++;
        console.log(`✓ ${testName} - 通過`);
    } else {
        testStats.fail++;
        console.log(`✗ ${testName} - 失敗`);
    }
    updateTestStats();
}

// 1. 基本功能測試
async function testContentTypeDetector() {
    console.log('Testing ContentTypeDetector...');
    
    let result = '';
    let passed = true;
    
    try {
        // 檢查 ContentTypeDetector 是否可用
        if (typeof ContentTypeDetector === 'undefined') {
            result += '❌ ContentTypeDetector 未定義\n';
            passed = false;
        } else {
            result += '✅ ContentTypeDetector 已載入\n';
            
            // 創建實例
            const detector = new ContentTypeDetector();
            result += '✅ ContentTypeDetector 實例化成功\n';
            
            // 測試基本屬性
            if (detector.scoringConfig) {
                result += '✅ 評分配置已載入\n';
            } else {
                result += '❌ 評分配置缺失\n';
                passed = false;
            }
            
            // 測試統計功能
            const stats = detector.getStats();
            result += `✅ 統計數據：${JSON.stringify(stats, null, 2)}\n`;
        }
        
        recordTest(passed, 'ContentTypeDetector 基本功能');
        showResult('basicTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, 'ContentTypeDetector 基本功能');
        showResult('basicTestResult', result, 'error');
    }
}

// 測試安全檢測整合
async function testSecurityIntegration() {
    console.log('Testing security integration...');
    
    let result = '';
    let passed = true;
    
    try {
        // 檢查 SecurityDetectionModule 是否可用
        if (typeof SecurityDetectionModule === 'undefined') {
            result += '❌ SecurityDetectionModule 未定義\n';
            passed = false;
        } else {
            result += '✅ SecurityDetectionModule 已載入\n';
            
            // 創建實例
            const securityModule = new SecurityDetectionModule();
            result += '✅ SecurityDetectionModule 實例化成功\n';
            
            // 檢查是否有 ContentTypeDetector
            if (securityModule.contentTypeDetector) {
                result += '✅ SecurityDetectionModule 已整合 ContentTypeDetector\n';
            } else {
                result += '⚠️ SecurityDetectionModule 未整合 ContentTypeDetector（將使用降級模式）\n';
            }
            
            // 測試檢測方法
            const mockHeaders = new Map([
                ['x-content-type-options', 'nosniff']
            ]);
            
            const detectionResult = securityModule.detectContentTypeOptions(mockHeaders, 'test://example.com');
            result += `✅ 檢測結果：${JSON.stringify(detectionResult, null, 2)}\n`;
        }
        
        recordTest(passed, '安全檢測整合');
        showResult('basicTestResult', result, passed ? 'success' : 'warning');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '安全檢測整合');
        showResult('basicTestResult', result, 'error');
    }
}

// 2. Header 檢測測試
async function testNosniffHeader() {
    console.log('Testing nosniff header...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof ContentTypeDetector === 'undefined') {
            result += '❌ ContentTypeDetector 未定義\n';
            recordTest(false, 'nosniff 標頭檢測');
            showResult('headerTestResult', result, 'error');
            return;
        }
        
        const detector = new ContentTypeDetector();
        const headers = [
            { name: 'X-Content-Type-Options', value: 'nosniff' },
            { name: 'Content-Type', value: 'text/html; charset=utf-8' }
        ];
        
        const detectionResult = detector.detect(headers, 'test://example.com');
        
        result += `檢測結果：\n`;
        result += `- 檢測到標頭：${detectionResult.detected}\n`;
        result += `- 評分：${detectionResult.score}/100\n`;
        result += `- 等級：${detectionResult.level}\n`;
        result += `- 保護狀態：${detectionResult.details.protection}\n`;
        result += `- 分析：${detectionResult.analysis}\n`;
        
        // 驗證結果
        if (detectionResult.detected && detectionResult.details.hasNosniff && detectionResult.score >= 90) {
            result += '\n✅ nosniff 標頭檢測正確\n';
        } else {
            result += '\n❌ nosniff 標頭檢測結果不正確\n';
            passed = false;
        }
        
        recordTest(passed, 'nosniff 標頭檢測');
        showResult('headerTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, 'nosniff 標頭檢測');
        showResult('headerTestResult', result, 'error');
    }
}

// 測試缺少標頭
async function testMissingHeader() {
    console.log('Testing missing header...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof ContentTypeDetector === 'undefined') {
            result += '❌ ContentTypeDetector 未定義\n';
            recordTest(false, '缺少標頭檢測');
            showResult('headerTestResult', result, 'error');
            return;
        }
        
        const detector = new ContentTypeDetector();
        const headers = [
            { name: 'Content-Type', value: 'text/html; charset=utf-8' }
        ];
        
        const detectionResult = detector.detect(headers, 'test://example.com');
        
        result += `檢測結果：\n`;
        result += `- 檢測到標頭：${detectionResult.detected}\n`;
        result += `- 評分：${detectionResult.score}/100\n`;
        result += `- 等級：${detectionResult.level}\n`;
        result += `- 保護狀態：${detectionResult.details.protection}\n`;
        result += `- 問題數量：${detectionResult.issues.length}\n`;
        
        // 驗證結果
        if (!detectionResult.detected && detectionResult.score === 0 && detectionResult.issues.length > 0) {
            result += '\n✅ 缺少標頭檢測正確\n';
        } else {
            result += '\n❌ 缺少標頭檢測結果不正確\n';
            passed = false;
        }
        
        recordTest(passed, '缺少標頭檢測');
        showResult('headerTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '缺少標頭檢測');
        showResult('headerTestResult', result, 'error');
    }
}

// 測試無效標頭
async function testInvalidHeader() {
    console.log('Testing invalid header...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof ContentTypeDetector === 'undefined') {
            result += '❌ ContentTypeDetector 未定義\n';
            recordTest(false, '無效標頭檢測');
            showResult('headerTestResult', result, 'error');
            return;
        }
        
        const detector = new ContentTypeDetector();
        const headers = [
            { name: 'X-Content-Type-Options', value: 'invalid-value' }
        ];
        
        const detectionResult = detector.detect(headers, 'test://example.com');
        
        result += `檢測結果：\n`;
        result += `- 檢測到標頭：${detectionResult.detected}\n`;
        result += `- 評分：${detectionResult.score}/100\n`;
        result += `- 等級：${detectionResult.level}\n`;
        result += `- 保護狀態：${detectionResult.details.protection}\n`;
        result += `- 問題數量：${detectionResult.issues.length}\n`;
        
        // 驗證結果
        if (detectionResult.detected && !detectionResult.details.hasNosniff && detectionResult.score < 90) {
            result += '\n✅ 無效標頭檢測正確\n';
        } else {
            result += '\n❌ 無效標頭檢測結果不正確\n';
            passed = false;
        }
        
        recordTest(passed, '無效標頭檢測');
        showResult('headerTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '無效標頭檢測');
        showResult('headerTestResult', result, 'error');
    }
}

// 3. 評分系統測試
async function testScoring() {
    console.log('Testing scoring system...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof ContentTypeDetector === 'undefined') {
            result += '❌ ContentTypeDetector 未定義\n';
            recordTest(false, '評分系統');
            showResult('scoringTestResult', result, 'error');
            return;
        }
        
        const detector = new ContentTypeDetector();
        
        // 測試不同情況的評分
        const testCases = [
            {
                name: '完整 nosniff',
                headers: [{ name: 'X-Content-Type-Options', value: 'nosniff' }],
                expectedScore: 100
            },
            {
                name: '無效值',
                headers: [{ name: 'X-Content-Type-Options', value: 'invalid' }],
                expectedScore: { min: 40, max: 60 }
            },
            {
                name: '缺少標頭',
                headers: [],
                expectedScore: 0
            }
        ];
        
        for (const testCase of testCases) {
            const detectionResult = detector.detect(testCase.headers, 'test://example.com');
            
            result += `${testCase.name}：\n`;
            result += `- 實際評分：${detectionResult.score}\n`;
            
            let scoreValid = false;
            if (typeof testCase.expectedScore === 'number') {
                scoreValid = detectionResult.score === testCase.expectedScore;
            } else {
                scoreValid = detectionResult.score >= testCase.expectedScore.min && 
                           detectionResult.score <= testCase.expectedScore.max;
            }
            
            if (scoreValid) {
                result += `- ✅ 評分正確\n`;
            } else {
                result += `- ❌ 評分不正確\n`;
                passed = false;
            }
            
            result += `- 等級：${detectionResult.level}\n\n`;
        }
        
        recordTest(passed, '評分系統');
        showResult('scoringTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '評分系統');
        showResult('scoringTestResult', result, 'error');
    }
}

// 測試等級計算
async function testLevelCalculation() {
    console.log('Testing level calculation...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof ContentTypeDetector === 'undefined') {
            result += '❌ ContentTypeDetector 未定義\n';
            recordTest(false, '等級計算');
            showResult('scoringTestResult', result, 'error');
            return;
        }
        
        const detector = new ContentTypeDetector();
        
        // 測試不同分數的等級
        const mockHeaders = [{ name: 'X-Content-Type-Options', value: 'nosniff' }];
        const detectionResult = detector.detect(mockHeaders, 'test://example.com');
        
        result += `等級計算測試：\n`;
        result += `- 分數：${detectionResult.score}\n`;
        result += `- 等級：${detectionResult.level}\n`;
        
        // 驗證等級邏輯
        const expectedLevel = detectionResult.score >= 90 ? 'excellent' :
                             detectionResult.score >= 70 ? 'good' :
                             detectionResult.score >= 50 ? 'average' :
                             detectionResult.score >= 30 ? 'poor' : 'dangerous';
        
        if (detectionResult.level === expectedLevel) {
            result += `- ✅ 等級計算正確\n`;
        } else {
            result += `- ❌ 等級計算不正確，期望：${expectedLevel}\n`;
            passed = false;
        }
        
        recordTest(passed, '等級計算');
        showResult('scoringTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '等級計算');
        showResult('scoringTestResult', result, 'error');
    }
}

// 4. 實際網站測試
async function testCurrentPageHeaders() {
    console.log('Testing current page headers...');
    
    let result = '';
    let passed = true;
    
    try {
        // 這個測試需要在擴展環境中運行
        result += '📋 當前頁面標頭檢測：\n';
        result += `- URL：${window.location.href}\n`;
        result += `- 協議：${window.location.protocol}\n`;
        result += `- 域名：${window.location.hostname}\n`;
        
        // 嘗試檢測 Content-Type
        const contentType = document.contentType || 'unknown';
        result += `- Content-Type：${contentType}\n`;
        
        // 模擬檢測（實際檢測需要在擴展背景腳本中進行）
        result += '\n⚠️ 實際的 HTTP 標頭檢測需要在 Chrome 擴展環境中進行\n';
        result += '請在安裝擴展後使用 popup 介面進行檢測\n';
        
        recordTest(true, '當前頁面檢測');
        showResult('realTestResult', result, 'warning');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '當前頁面檢測');
        showResult('realTestResult', result, 'error');
    }
}

// 檢查擴展狀態
async function testExtensionStatus() {
    console.log('Testing extension status...');
    
    let result = '';
    let passed = true;
    
    try {
        result += '🔍 擴展狀態檢查：\n';
        
        // 檢查是否在擴展環境中
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
            result += `- ✅ 在 Chrome 擴展環境中\n`;
            result += `- 擴展 ID：${chrome.runtime.id}\n`;
            
            // 檢查權限
            if (chrome.tabs) {
                result += `- ✅ 有 tabs 權限\n`;
            } else {
                result += `- ❌ 缺少 tabs 權限\n`;
                passed = false;
            }
            
            if (chrome.webRequest) {
                result += `- ✅ 有 webRequest 權限\n`;
            } else {
                result += `- ❌ 缺少 webRequest 權限\n`;
                passed = false;
            }
            
        } else {
            result += `- ⚠️ 不在 Chrome 擴展環境中\n`;
            result += `- 請在擴展的 popup 或選項頁中運行此測試\n`;
        }
        
        recordTest(passed, '擴展狀態檢查');
        showResult('realTestResult', result, passed ? 'success' : 'warning');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '擴展狀態檢查');
        showResult('realTestResult', result, 'error');
    }
}

// 頁面載入時自動執行基本測試
document.addEventListener('DOMContentLoaded', function() {
    console.log('Content-Type Protection Detection Test Page Loaded');
    updateTestStats();
    
    // 檢查是否有必要的類別
    setTimeout(() => {
        if (typeof ContentTypeDetector !== 'undefined') {
            console.log('ContentTypeDetector is available');
        } else {
            console.warn('ContentTypeDetector is not available');
        }
    }, 100);
});

// 載入安全檢測模組（如果在擴展環境中）
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    const loadSecurityModules = async () => {
        try {
            const scripts = [
                'src/detectors/security/ContentTypeDetector.js',
                'src/detectors/security/SecurityDetectionModule.js'
            ];
            
            for (const script of scripts) {
                const scriptElement = document.createElement('script');
                scriptElement.src = chrome.runtime.getURL(script);
                document.head.appendChild(scriptElement);
            }
            
            console.log('Security modules loaded');
        } catch (error) {
            console.error('Failed to load security modules:', error);
        }
    };
    
    loadSecurityModules();
}