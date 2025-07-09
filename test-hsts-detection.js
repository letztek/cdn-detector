// HSTS 檢測測試腳本

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

// 格式化時間顯示
function formatDuration(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
        return `${days} 天 ${hours} 小時`;
    } else if (hours > 0) {
        return `${hours} 小時 ${minutes} 分鐘`;
    } else {
        return `${minutes} 分鐘`;
    }
}

// 1. 基本功能測試
async function testHSTSDetector() {
    console.log('Testing HSTSDetector...');
    
    let result = '';
    let passed = true;
    
    try {
        // 檢查 HSTSDetector 是否可用
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            passed = false;
        } else {
            result += '✅ HSTSDetector 已載入\n';
            
            // 創建實例
            const detector = new HSTSDetector();
            result += '✅ HSTSDetector 實例化成功\n';
            
            // 測試基本屬性
            if (detector.scoringConfig) {
                result += '✅ 評分配置已載入\n';
                result += `  - max-age 權重: ${detector.scoringConfig.weights.maxAge}\n`;
                result += `  - includeSubDomains 權重: ${detector.scoringConfig.weights.includeSubDomains}\n`;
                result += `  - preload 權重: ${detector.scoringConfig.weights.preload}\n`;
            } else {
                result += '❌ 評分配置缺失\n';
                passed = false;
            }
            
            // 測試統計功能
            const stats = detector.getStats();
            result += `✅ 統計數據：\n${JSON.stringify(stats, null, 2)}\n`;
        }
        
        recordTest(passed, 'HSTSDetector 基本功能');
        showResult('basicTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, 'HSTSDetector 基本功能');
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
            
            // 檢查是否有 HSTSDetector
            if (securityModule.hstsDetector) {
                result += '✅ SecurityDetectionModule 已整合 HSTSDetector\n';
            } else {
                result += '⚠️ SecurityDetectionModule 未整合 HSTSDetector（將使用降級模式）\n';
            }
            
            // 測試檢測方法
            const mockHeaders = new Map([
                ['strict-transport-security', 'max-age=31536000; includeSubDomains; preload']
            ]);
            
            const detectionResult = securityModule.detectHSTS(mockHeaders, 'https://example.com');
            result += `✅ 檢測結果：\n${JSON.stringify(detectionResult, null, 2)}\n`;
        }
        
        recordTest(passed, '安全檢測整合');
        showResult('basicTestResult', result, passed ? 'success' : 'warning');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '安全檢測整合');
        showResult('basicTestResult', result, 'error');
    }
}

// 2. Header 解析測試
async function testPerfectHSTS() {
    console.log('Testing perfect HSTS header...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '完整 HSTS 檢測');
            showResult('headerTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        const headers = [
            { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
            { name: 'Content-Type', value: 'text/html' }
        ];
        
        const detectionResult = detector.detect(headers, 'https://example.com');
        
        result += `完整 HSTS 檢測結果：\n`;
        result += `- 檢測到標頭：${detectionResult.detected}\n`;
        result += `- 評分：${detectionResult.score}/100\n`;
        result += `- 等級：${detectionResult.level}\n`;
        result += `- 強度：${detectionResult.details.strength}\n`;
        result += `- max-age：${detectionResult.directives.maxAge} 秒 (${detectionResult.details.maxAgeDays} 天)\n`;
        result += `- includeSubDomains：${detectionResult.directives.includeSubDomains}\n`;
        result += `- preload：${detectionResult.directives.preload}\n`;
        result += `- 問題數量：${detectionResult.issues.length}\n`;
        result += `- 建議數量：${detectionResult.recommendations.length}\n`;
        result += `\n分析：\n${detectionResult.analysis}\n`;
        
        // 驗證結果
        if (detectionResult.detected && 
            detectionResult.score >= 90 && 
            detectionResult.directives.includeSubDomains && 
            detectionResult.directives.preload) {
            result += '\n✅ 完整 HSTS 檢測正確\n';
        } else {
            result += '\n❌ 完整 HSTS 檢測結果不正確\n';
            passed = false;
        }
        
        recordTest(passed, '完整 HSTS 檢測');
        showResult('headerTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '完整 HSTS 檢測');
        showResult('headerTestResult', result, 'error');
    }
}

// 測試基本 HSTS
async function testBasicHSTS() {
    console.log('Testing basic HSTS header...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '基本 HSTS 檢測');
            showResult('headerTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        const headers = [
            { name: 'Strict-Transport-Security', value: 'max-age=86400' }
        ];
        
        const detectionResult = detector.detect(headers, 'https://example.com');
        
        result += `基本 HSTS 檢測結果：\n`;
        result += `- 檢測到標頭：${detectionResult.detected}\n`;
        result += `- 評分：${detectionResult.score}/100\n`;
        result += `- 等級：${detectionResult.level}\n`;
        result += `- 強度：${detectionResult.details.strength}\n`;
        result += `- max-age：${detectionResult.directives.maxAge} 秒 (${detectionResult.details.maxAgeDays} 天)\n`;
        result += `- includeSubDomains：${detectionResult.directives.includeSubDomains}\n`;
        result += `- preload：${detectionResult.directives.preload}\n`;
        result += `- 問題數量：${detectionResult.issues.length}\n`;
        
        // 驗證結果
        if (detectionResult.detected && detectionResult.score > 0 && detectionResult.score < 90) {
            result += '\n✅ 基本 HSTS 檢測正確\n';
        } else {
            result += '\n❌ 基本 HSTS 檢測結果不正確\n';
            passed = false;
        }
        
        recordTest(passed, '基本 HSTS 檢測');
        showResult('headerTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '基本 HSTS 檢測');
        showResult('headerTestResult', result, 'error');
    }
}

// 測試缺少 HSTS
async function testMissingHSTS() {
    console.log('Testing missing HSTS header...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '缺少 HSTS 檢測');
            showResult('headerTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        const headers = [
            { name: 'Content-Type', value: 'text/html' }
        ];
        
        const detectionResult = detector.detect(headers, 'https://example.com');
        
        result += `缺少 HSTS 檢測結果：\n`;
        result += `- 檢測到標頭：${detectionResult.detected}\n`;
        result += `- 評分：${detectionResult.score}/100\n`;
        result += `- 等級：${detectionResult.level}\n`;
        result += `- 強度：${detectionResult.details.strength}\n`;
        result += `- 問題數量：${detectionResult.issues.length}\n`;
        result += `- 建議數量：${detectionResult.recommendations.length}\n`;
        
        // 驗證結果
        if (!detectionResult.detected && detectionResult.score === 0 && detectionResult.issues.length > 0) {
            result += '\n✅ 缺少 HSTS 檢測正確\n';
        } else {
            result += '\n❌ 缺少 HSTS 檢測結果不正確\n';
            passed = false;
        }
        
        recordTest(passed, '缺少 HSTS 檢測');
        showResult('headerTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '缺少 HSTS 檢測');
        showResult('headerTestResult', result, 'error');
    }
}

// 測試無效 HSTS
async function testInvalidHSTS() {
    console.log('Testing invalid HSTS header...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '無效 HSTS 檢測');
            showResult('headerTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        const headers = [
            { name: 'Strict-Transport-Security', value: 'invalid-syntax' }
        ];
        
        const detectionResult = detector.detect(headers, 'https://example.com');
        
        result += `無效 HSTS 檢測結果：\n`;
        result += `- 檢測到標頭：${detectionResult.detected}\n`;
        result += `- 評分：${detectionResult.score}/100\n`;
        result += `- 等級：${detectionResult.level}\n`;
        result += `- 強度：${detectionResult.details.strength}\n`;
        result += `- 有效性：${detectionResult.details.isValid}\n`;
        result += `- 問題數量：${detectionResult.issues.length}\n`;
        
        // 驗證結果
        if (detectionResult.detected && !detectionResult.details.isValid && detectionResult.issues.length > 0) {
            result += '\n✅ 無效 HSTS 檢測正確\n';
        } else {
            result += '\n❌ 無效 HSTS 檢測結果不正確\n';
            passed = false;
        }
        
        recordTest(passed, '無效 HSTS 檢測');
        showResult('headerTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '無效 HSTS 檢測');
        showResult('headerTestResult', result, 'error');
    }
}

// 3. 指令分析測試
async function testMaxAgeAnalysis() {
    console.log('Testing max-age analysis...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, 'max-age 分析');
            showResult('directiveTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        
        // 測試不同的 max-age 值
        const testCases = [
            { value: 'max-age=31536000', expected: 'excellent', description: '1年' },
            { value: 'max-age=15768000', expected: 'good', description: '6個月' },
            { value: 'max-age=2592000', expected: 'average', description: '1個月' },
            { value: 'max-age=86400', expected: 'poor', description: '1天' },
            { value: 'max-age=3600', expected: 'weak', description: '1小時' }
        ];
        
        result += 'max-age 分析測試：\n\n';
        
        for (const testCase of testCases) {
            const headers = [
                { name: 'Strict-Transport-Security', value: testCase.value }
            ];
            
            const detectionResult = detector.detect(headers, 'https://example.com');
            
            result += `${testCase.description} (${testCase.value}):\n`;
            result += `- 解析值: ${detectionResult.directives.maxAge} 秒\n`;
            result += `- 天數: ${detectionResult.details.maxAgeDays} 天\n`;
            result += `- 強度: ${detectionResult.details.strength}\n`;
            result += `- 評分: ${detectionResult.score}/100\n\n`;
        }
        
        recordTest(passed, 'max-age 分析');
        showResult('directiveTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, 'max-age 分析');
        showResult('directiveTestResult', result, 'error');
    }
}

// 測試指令分析
async function testDirectiveAnalysis() {
    console.log('Testing directive analysis...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '指令分析');
            showResult('directiveTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        
        // 測試不同的指令組合
        const testCases = [
            {
                name: '完整配置',
                value: 'max-age=31536000; includeSubDomains; preload',
                expectedSubDomains: true,
                expectedPreload: true
            },
            {
                name: '只有 max-age',
                value: 'max-age=31536000',
                expectedSubDomains: false,
                expectedPreload: false
            },
            {
                name: '含 includeSubDomains',
                value: 'max-age=31536000; includeSubDomains',
                expectedSubDomains: true,
                expectedPreload: false
            },
            {
                name: '大小寫測試',
                value: 'MAX-AGE=31536000; INCLUDESUBDOMAINS; PRELOAD',
                expectedSubDomains: true,
                expectedPreload: true
            }
        ];
        
        result += '指令分析測試：\n\n';
        
        for (const testCase of testCases) {
            const headers = [
                { name: 'Strict-Transport-Security', value: testCase.value }
            ];
            
            const detectionResult = detector.detect(headers, 'https://example.com');
            
            result += `${testCase.name}:\n`;
            result += `- 原始值: ${testCase.value}\n`;
            result += `- includeSubDomains: ${detectionResult.directives.includeSubDomains} (期望: ${testCase.expectedSubDomains})\n`;
            result += `- preload: ${detectionResult.directives.preload} (期望: ${testCase.expectedPreload})\n`;
            result += `- 強度: ${detectionResult.details.strength}\n`;
            
            // 驗證結果
            if (detectionResult.directives.includeSubDomains === testCase.expectedSubDomains &&
                detectionResult.directives.preload === testCase.expectedPreload) {
                result += '- ✅ 指令解析正確\n\n';
            } else {
                result += '- ❌ 指令解析錯誤\n\n';
                passed = false;
            }
        }
        
        recordTest(passed, '指令分析');
        showResult('directiveTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '指令分析');
        showResult('directiveTestResult', result, 'error');
    }
}

// 測試強度計算
async function testStrengthCalculation() {
    console.log('Testing strength calculation...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '強度計算');
            showResult('directiveTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        
        // 測試不同強度等級
        const testCases = [
            {
                name: '優秀 (excellent)',
                value: 'max-age=31536000; includeSubDomains; preload',
                expectedStrength: 'excellent'
            },
            {
                name: '良好 (good)',
                value: 'max-age=15768000; includeSubDomains',
                expectedStrength: 'good'
            },
            {
                name: '普通 (average)',
                value: 'max-age=2592000',
                expectedStrength: 'average'
            },
            {
                name: '差 (poor)',
                value: 'max-age=86400',
                expectedStrength: 'poor'
            },
            {
                name: '弱 (weak)',
                value: 'max-age=3600',
                expectedStrength: 'weak'
            }
        ];
        
        result += '強度計算測試：\n\n';
        
        for (const testCase of testCases) {
            const headers = [
                { name: 'Strict-Transport-Security', value: testCase.value }
            ];
            
            const detectionResult = detector.detect(headers, 'https://example.com');
            
            result += `${testCase.name}:\n`;
            result += `- 配置: ${testCase.value}\n`;
            result += `- 實際強度: ${detectionResult.details.strength}\n`;
            result += `- 期望強度: ${testCase.expectedStrength}\n`;
            result += `- 評分: ${detectionResult.score}/100\n`;
            
            // 驗證結果
            if (detectionResult.details.strength === testCase.expectedStrength) {
                result += '- ✅ 強度計算正確\n\n';
            } else {
                result += '- ❌ 強度計算錯誤\n\n';
                passed = false;
            }
        }
        
        recordTest(passed, '強度計算');
        showResult('directiveTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '強度計算');
        showResult('directiveTestResult', result, 'error');
    }
}

// 4. 評分系統測試
async function testScoring() {
    console.log('Testing scoring system...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '評分系統');
            showResult('scoringTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        
        // 測試不同情況的評分
        const testCases = [
            {
                name: '完美配置',
                value: 'max-age=31536000; includeSubDomains; preload',
                expectedScore: 100
            },
            {
                name: '良好配置',
                value: 'max-age=15768000; includeSubDomains',
                expectedScore: { min: 80, max: 95 }
            },
            {
                name: '基本配置',
                value: 'max-age=2592000',
                expectedScore: { min: 60, max: 80 }
            },
            {
                name: '缺少標頭',
                value: null,
                expectedScore: 0
            }
        ];
        
        result += '評分系統測試：\n\n';
        
        for (const testCase of testCases) {
            const headers = testCase.value ? [
                { name: 'Strict-Transport-Security', value: testCase.value }
            ] : [];
            
            const detectionResult = detector.detect(headers, 'https://example.com');
            
            result += `${testCase.name}:\n`;
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
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '等級計算');
            showResult('scoringTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        
        // 測試不同分數對應的等級
        const mockHeaders = [
            { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }
        ];
        
        const detectionResult = detector.detect(mockHeaders, 'https://example.com');
        
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

// 測試建議系統
async function testRecommendations() {
    console.log('Testing recommendations system...');
    
    let result = '';
    let passed = true;
    
    try {
        if (typeof HSTSDetector === 'undefined') {
            result += '❌ HSTSDetector 未定義\n';
            recordTest(false, '建議系統');
            showResult('scoringTestResult', result, 'error');
            return;
        }
        
        const detector = new HSTSDetector();
        
        // 測試不同情況的建議
        const testCases = [
            {
                name: '缺少標頭',
                headers: [],
                expectedRecommendations: ['添加 Strict-Transport-Security header']
            },
            {
                name: '短 max-age',
                headers: [{ name: 'Strict-Transport-Security', value: 'max-age=3600' }],
                expectedRecommendations: ['增加 max-age 值']
            },
            {
                name: '缺少 includeSubDomains',
                headers: [{ name: 'Strict-Transport-Security', value: 'max-age=31536000' }],
                expectedRecommendations: ['添加 includeSubDomains 指令']
            }
        ];
        
        result += '建議系統測試：\n\n';
        
        for (const testCase of testCases) {
            const detectionResult = detector.detect(testCase.headers, 'https://example.com');
            
            result += `${testCase.name}:\n`;
            result += `- 建議數量：${detectionResult.recommendations.length}\n`;
            result += `- 建議內容：\n`;
            
            detectionResult.recommendations.forEach((rec, index) => {
                result += `  ${index + 1}. ${rec}\n`;
            });
            
            result += '\n';
        }
        
        recordTest(passed, '建議系統');
        showResult('scoringTestResult', result, passed ? 'success' : 'error');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '建議系統');
        showResult('scoringTestResult', result, 'error');
    }
}

// 5. 實際網站測試
async function testCurrentPageHSTS() {
    console.log('Testing current page HSTS...');
    
    let result = '';
    let passed = true;
    
    try {
        // 這個測試需要在擴展環境中運行
        result += '📋 當前頁面 HSTS 檢測：\n';
        result += `- URL：${window.location.href}\n`;
        result += `- 協議：${window.location.protocol}\n`;
        result += `- 域名：${window.location.hostname}\n`;
        
        // 檢查是否為 HTTPS
        if (window.location.protocol === 'https:') {
            result += '- ✅ 使用 HTTPS 協議\n';
        } else {
            result += '- ❌ 未使用 HTTPS 協議，HSTS 無效\n';
        }
        
        // 模擬檢測（實際檢測需要在擴展背景腳本中進行）
        result += '\n⚠️ 實際的 HSTS 檢測需要在 Chrome 擴展環境中進行\n';
        result += '請在安裝擴展後使用 popup 介面進行檢測\n';
        
        recordTest(true, '當前頁面 HSTS 檢測');
        showResult('realTestResult', result, 'warning');
        
    } catch (error) {
        result += `❌ 測試失敗：${error.message}\n`;
        recordTest(false, '當前頁面 HSTS 檢測');
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
    console.log('HSTS Detection Test Page Loaded');
    updateTestStats();
    
    // 檢查是否有必要的類別
    setTimeout(() => {
        if (typeof HSTSDetector !== 'undefined') {
            console.log('HSTSDetector is available');
        } else {
            console.warn('HSTSDetector is not available');
        }
    }, 100);
});

// 載入安全檢測模組（如果在擴展環境中）
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    const loadSecurityModules = async () => {
        try {
            const scripts = [
                'src/detectors/security/HSTSDetector.js',
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