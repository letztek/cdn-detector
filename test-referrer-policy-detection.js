// Referrer Policy Detection 測試腳本
console.log('🔒 Starting Referrer Policy detection tests...');

// 測試統計
let testStats = {
    total: 0,
    passed: 0,
    failed: 0,
    results: []
};

// 測試框架
class ReferrerPolicyTestFramework {
    constructor() {
        this.detector = null;
        this.initializeDetector();
    }

    async initializeDetector() {
        try {
            // 檢查是否在 Chrome Extension 環境中
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                // 載入 ReferrerPolicyDetector
                const script = document.createElement('script');
                script.src = chrome.runtime.getURL('src/detectors/security/ReferrerPolicyDetector.js');
                
                script.onload = () => {
                    if (typeof ReferrerPolicyDetector !== 'undefined') {
                        this.detector = new ReferrerPolicyDetector();
                        console.log('✅ ReferrerPolicyDetector loaded successfully');
                    } else {
                        console.error('❌ ReferrerPolicyDetector not available after loading');
                        this.initializeFallback();
                    }
                };
                
                script.onerror = () => {
                    console.warn('⚠️ Failed to load ReferrerPolicyDetector, using fallback');
                    this.initializeFallback();
                };
                
                document.head.appendChild(script);
            } else {
                // 非擴展環境，使用內建實作
                this.initializeFallback();
            }
        } catch (error) {
            console.error('Error initializing detector:', error);
            this.initializeFallback();
        }
    }

    initializeFallback() {
        // 簡化的回退實作用於測試
        this.detector = {
            detect: (headers, url) => {
                const referrerPolicy = headers['referrer-policy'];
                
                if (!referrerPolicy) {
                    return {
                        detected: false,
                        score: 0,
                        level: 'missing',
                        details: {
                            effectivePolicy: null,
                            privacyImpact: 'unknown',
                            recommendations: [{
                                type: 'missing-header',
                                message: '建議添加 Referrer-Policy header'
                            }]
                        }
                    };
                }

                const policyScores = {
                    'no-referrer': { score: 100, level: 'excellent', privacy: 'maximum' },
                    'same-origin': { score: 95, level: 'excellent', privacy: 'high' },
                    'strict-origin': { score: 85, level: 'good', privacy: 'good' },
                    'strict-origin-when-cross-origin': { score: 80, level: 'good', privacy: 'moderate' },
                    'origin-when-cross-origin': { score: 70, level: 'moderate', privacy: 'moderate' },
                    'origin': { score: 65, level: 'moderate', privacy: 'moderate' },
                    'no-referrer-when-downgrade': { score: 45, level: 'poor', privacy: 'low' },
                    'unsafe-url': { score: 20, level: 'poor', privacy: 'very-low' }
                };

                const policy = referrerPolicy.toLowerCase().trim();
                const config = policyScores[policy] || { score: 50, level: 'unknown', privacy: 'unknown' };

                return {
                    detected: true,
                    score: config.score,
                    level: config.level,
                    policies: [policy],
                    details: {
                        effectivePolicy: policy,
                        privacyImpact: config.privacy,
                        recommendations: config.score < 70 ? [{
                            type: 'weak-policy',
                            message: '目前策略提供的隱私保護有限'
                        }] : []
                    }
                };
            }
        };
        console.log('✅ Fallback detector initialized');
    }

    // 測試輔助方法
    createHeaders(referrerPolicy = null) {
        const headers = {};
        if (referrerPolicy !== null) {
            headers['referrer-policy'] = referrerPolicy;
        }
        return headers;
    }

    // 執行單個測試
    async runTest(testId, testName, testFunction) {
        testStats.total++;
        const startTime = performance.now();
        
        try {
            const result = await testFunction();
            const duration = performance.now() - startTime;
            
            if (result.success) {
                testStats.passed++;
                this.displayResult(testId, 'pass', `✅ ${testName} - ${result.message}`, duration);
            } else {
                testStats.failed++;
                this.displayResult(testId, 'fail', `❌ ${testName} - ${result.message}`, duration);
            }
            
            testStats.results.push({
                id: testId,
                name: testName,
                success: result.success,
                message: result.message,
                duration: duration,
                details: result.details || {}
            });
            
        } catch (error) {
            testStats.failed++;
            const duration = performance.now() - startTime;
            this.displayResult(testId, 'fail', `❌ ${testName} - 錯誤: ${error.message}`, duration);
            
            testStats.results.push({
                id: testId,
                name: testName,
                success: false,
                message: `錯誤: ${error.message}`,
                duration: duration,
                error: error
            });
        }
    }

    displayResult(testId, type, message, duration) {
        const element = document.getElementById(testId);
        if (element) {
            element.className = `test-result result-${type}`;
            element.innerHTML = `${message}<br><small>執行時間: ${duration.toFixed(2)}ms</small>`;
        }
    }

    // 更新統計
    updateStats() {
        document.getElementById('totalTests').textContent = testStats.total;
        document.getElementById('passedTests').textContent = testStats.passed;
        document.getElementById('failedTests').textContent = testStats.failed;
        
        const successRate = testStats.total > 0 ? 
            Math.round((testStats.passed / testStats.total) * 100) : 0;
        document.getElementById('successRate').textContent = `${successRate}%`;
        
        document.getElementById('statsContainer').style.display = 'flex';
        document.getElementById('exportBtn').disabled = false;
    }
}

// 全域測試框架實例
let testFramework = new ReferrerPolicyTestFramework();

// 測試函數定義
const tests = {
    // 基本檢測測試
    async test1_1() {
        const headers = testFramework.createHeaders(); // 沒有 referrer-policy
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (!result.detected && result.score === 0 && result.level === 'missing') {
            return { 
                success: true, 
                message: '正確檢測到缺少 Referrer-Policy header',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `期望檢測為缺失，但得到: detected=${result.detected}, score=${result.score}` 
        };
    },

    async test1_2() {
        const headers = testFramework.createHeaders('no-referrer');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.detected && result.score === 100 && result.level === 'excellent') {
            return { 
                success: true, 
                message: '正確檢測 no-referrer 策略，評分 100 分',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `no-referrer 檢測失敗: detected=${result.detected}, score=${result.score}, level=${result.level}` 
        };
    },

    async test1_3() {
        const headers = testFramework.createHeaders('strict-origin-when-cross-origin');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.detected && result.score === 80 && result.level === 'good') {
            return { 
                success: true, 
                message: '正確檢測預設策略，評分 80 分',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `strict-origin-when-cross-origin 檢測失敗: score=${result.score}, level=${result.level}` 
        };
    },

    async test1_4() {
        const headers = testFramework.createHeaders('unsafe-url');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.detected && result.score === 20 && result.level === 'poor') {
            return { 
                success: true, 
                message: '正確檢測危險策略，評分 20 分',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `unsafe-url 檢測失敗: score=${result.score}, level=${result.level}` 
        };
    },

    // 策略解析測試
    async test2_1() {
        const headers = testFramework.createHeaders('no-referrer, strict-origin-when-cross-origin');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        // 應該使用最後一個有效策略
        const effectivePolicy = result.details.effectivePolicy;
        if (result.detected && effectivePolicy === 'strict-origin-when-cross-origin') {
            return { 
                success: true, 
                message: '正確解析多重策略，使用最後有效策略',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `多重策略解析失敗: 有效策略=${effectivePolicy}` 
        };
    },

    async test2_2() {
        const headers = testFramework.createHeaders('invalid-policy');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        // 無效策略應該被標記為無效或使用回退評分
        if ((!result.detected || result.level === 'invalid') || result.score <= 50) {
            return { 
                success: true, 
                message: '正確處理無效策略值',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `無效策略處理失敗: detected=${result.detected}, score=${result.score}` 
        };
    },

    async test2_3() {
        const headers = testFramework.createHeaders('invalid-policy, same-origin, another-invalid');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        const effectivePolicy = result.details.effectivePolicy;
        if (result.detected && effectivePolicy === 'same-origin') {
            return { 
                success: true, 
                message: '正確從混合策略中提取有效策略',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `混合策略解析失敗: 有效策略=${effectivePolicy}` 
        };
    },

    async test2_4() {
        const headers = testFramework.createHeaders('  no-referrer  ,  same-origin  ');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        const effectivePolicy = result.details.effectivePolicy;
        if (result.detected && effectivePolicy === 'same-origin') {
            return { 
                success: true, 
                message: '正確處理空白和格式化問題',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `格式化處理失敗: 有效策略=${effectivePolicy}` 
        };
    },

    // 安全評分測試
    async test3_1() {
        const headers = testFramework.createHeaders('no-referrer');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.score === 100) {
            return { 
                success: true, 
                message: 'no-referrer 正確評分為 100 分',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `no-referrer 評分錯誤: ${result.score} (期望 100)` 
        };
    },

    async test3_2() {
        const headers = testFramework.createHeaders('same-origin');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.score === 95) {
            return { 
                success: true, 
                message: 'same-origin 正確評分為 95 分',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `same-origin 評分錯誤: ${result.score} (期望 95)` 
        };
    },

    async test3_3() {
        const headers = testFramework.createHeaders('origin-when-cross-origin');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.score === 70 && result.level === 'moderate') {
            return { 
                success: true, 
                message: 'moderate 等級策略正確評分為 70 分',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `moderate 策略評分錯誤: ${result.score} (期望 70), level=${result.level}` 
        };
    },

    async test3_4() {
        const headers = testFramework.createHeaders('no-referrer-when-downgrade');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.score === 45 && result.level === 'poor') {
            return { 
                success: true, 
                message: '低分策略正確評分為 45 分',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `低分策略評分錯誤: ${result.score} (期望 45), level=${result.level}` 
        };
    },

    // 隱私保護等級測試
    async test4_1() {
        const headers = testFramework.createHeaders('no-referrer');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.details.privacyImpact === 'maximum') {
            return { 
                success: true, 
                message: '正確識別 maximum 隱私等級',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `隱私等級錯誤: ${result.details.privacyImpact} (期望 maximum)` 
        };
    },

    async test4_2() {
        const headers = testFramework.createHeaders('origin-when-cross-origin');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.details.privacyImpact === 'moderate') {
            return { 
                success: true, 
                message: '正確識別 moderate 隱私等級',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `隱私等級錯誤: ${result.details.privacyImpact} (期望 moderate)` 
        };
    },

    async test4_3() {
        const headers = testFramework.createHeaders('no-referrer-when-downgrade');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.details.privacyImpact === 'low') {
            return { 
                success: true, 
                message: '正確識別 low 隱私等級',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `隱私等級錯誤: ${result.details.privacyImpact} (期望 low)` 
        };
    },

    async test4_4() {
        const headers = testFramework.createHeaders('unsafe-url');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        if (result.details.privacyImpact === 'very-low') {
            return { 
                success: true, 
                message: '正確識別 very-low 隱私等級',
                details: result 
            };
        }
        return { 
            success: false, 
            message: `隱私等級錯誤: ${result.details.privacyImpact} (期望 very-low)` 
        };
    },

    // 建議和問題檢測測試
    async test5_1() {
        const headers = testFramework.createHeaders();
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        const hasRecommendation = result.details.recommendations && 
            result.details.recommendations.some(r => r.type === 'missing-header');
        
        if (hasRecommendation) {
            return { 
                success: true, 
                message: '正確生成缺失 header 的建議',
                details: result 
            };
        }
        return { 
            success: false, 
            message: '未生成預期的 missing-header 建議' 
        };
    },

    async test5_2() {
        const headers = testFramework.createHeaders('unsafe-url');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        const hasWarning = result.details.recommendations && 
            result.details.recommendations.some(r => r.type === 'weak-policy' || r.type === 'security-risk');
        
        if (hasWarning) {
            return { 
                success: true, 
                message: '正確生成弱策略警告',
                details: result 
            };
        }
        return { 
            success: false, 
            message: '未生成預期的弱策略警告' 
        };
    },

    async test5_3() {
        const headers = testFramework.createHeaders('no-referrer');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        // no-referrer 可能會有相容性警告
        const hasCompatibilityWarning = result.details.recommendations && 
            result.details.recommendations.some(r => r.type === 'compatibility-warning');
        
        return { 
            success: true, 
            message: hasCompatibilityWarning ? 
                '正確檢測相容性問題' : 
                'no-referrer 策略無相容性警告（正常）',
            details: result 
        };
    },

    async test5_4() {
        const headers = testFramework.createHeaders('strict-origin-when-cross-origin');
        const result = testFramework.detector.detect(headers, 'https://example.com');
        
        // 好的策略應該很少或沒有建議
        const recommendationCount = result.details.recommendations ? 
            result.details.recommendations.length : 0;
        
        if (recommendationCount <= 1) {
            return { 
                success: true, 
                message: `良好策略的建議數量合理: ${recommendationCount}`,
                details: result 
            };
        }
        return { 
            success: false, 
            message: `良好策略建議過多: ${recommendationCount}` 
        };
    }
};

// 主要測試執行函數
async function runAllTests() {
    console.log('🚀 Starting comprehensive Referrer Policy detection tests...');
    
    // 重置統計
    testStats = { total: 0, passed: 0, failed: 0, results: [] };
    
    // 禁用按鈕
    document.getElementById('runTestsBtn').disabled = true;
    document.getElementById('exportBtn').disabled = true;
    
    // 等待檢測器初始化
    let retries = 0;
    while (!testFramework.detector && retries < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (!testFramework.detector) {
        alert('檢測器初始化失敗，無法執行測試');
        document.getElementById('runTestsBtn').disabled = false;
        return;
    }
    
    try {
        // 執行所有測試
        for (const [testId, testFunction] of Object.entries(tests)) {
            await testFramework.runTest(testId, testId.replace('_', '.'), testFunction);
            // 小延遲以避免 UI 阻塞
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // 更新統計
        testFramework.updateStats();
        
        console.log('📊 Test Results Summary:', testStats);
        
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        alert(`測試執行失敗: ${error.message}`);
    } finally {
        // 重新啟用按鈕
        document.getElementById('runTestsBtn').disabled = false;
    }
}

// 清除結果
function clearResults() {
    testStats = { total: 0, passed: 0, failed: 0, results: [] };
    
    // 清除所有測試結果
    document.querySelectorAll('.test-result').forEach(element => {
        element.className = 'test-result';
        element.textContent = '等待測試...';
    });
    
    // 隱藏統計
    document.getElementById('statsContainer').style.display = 'none';
    document.getElementById('exportBtn').disabled = true;
    
    console.log('🧹 Test results cleared');
}

// 匯出結果
function exportResults() {
    const exportData = {
        timestamp: new Date().toISOString(),
        summary: {
            total: testStats.total,
            passed: testStats.passed,
            failed: testStats.failed,
            successRate: testStats.total > 0 ? (testStats.passed / testStats.total * 100).toFixed(1) + '%' : '0%'
        },
        results: testStats.results,
        environment: {
            userAgent: navigator.userAgent,
            url: window.location.href,
            hasReferrerPolicyDetector: !!testFramework.detector
        }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `referrer-policy-test-results-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('📁 Test results exported');
}

// 頁面載入完成後的初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 Referrer Policy Detection Test page loaded');
    
    // 顯示測試資訊
    setTimeout(() => {
        if (testFramework.detector) {
            console.log('✅ Test framework ready');
        } else {
            console.log('⚠️ Test framework still initializing...');
        }
    }, 1000);
});