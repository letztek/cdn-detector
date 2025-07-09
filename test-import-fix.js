// 測試 ReferrerPolicyDetector 重複載入修復
console.log('🔧 Testing ReferrerPolicyDetector duplicate import fix...');

// 模擬 Service Worker 環境中的 importScripts
function simulateImportScripts() {
    try {
        // 模擬第一次載入
        eval(`
            if (typeof ReferrerPolicyDetector === 'undefined') {
                class ReferrerPolicyDetector {
                    constructor() {
                        this.test = 'first';
                    }
                    detect() {
                        return { test: 'working' };
                    }
                }
                console.log('✅ First load: ReferrerPolicyDetector defined');
            }
        `);
        
        // 模擬第二次載入 - 應該不會出錯
        eval(`
            if (typeof ReferrerPolicyDetector === 'undefined') {
                class ReferrerPolicyDetector {
                    constructor() {
                        this.test = 'second';
                    }
                    detect() {
                        return { test: 'working' };
                    }
                }
                console.log('✅ Second load: ReferrerPolicyDetector defined');
            } else {
                console.log('✅ Second load: ReferrerPolicyDetector already exists, skipping');
            }
        `);
        
        // 測試檢測器是否正常工作
        const detector = new ReferrerPolicyDetector();
        const result = detector.detect();
        
        console.log('✅ Test completed successfully');
        console.log('✅ Detector test result:', result);
        console.log('✅ No duplicate declaration error occurred');
        
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// 執行測試
const testResult = simulateImportScripts();
console.log(testResult ? '🎉 Import fix test PASSED' : '💥 Import fix test FAILED');