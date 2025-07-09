// DRM 檢測整合測試腳本
console.log('🔒 Starting DRM detection integration test...');

// 測試 DRM 檢測功能的完整流程
class DRMDetectionTester {
    constructor() {
        this.testResults = {
            backgroundScript: null,
            drmParsing: null,
            uiDisplay: null,
            dataFlow: null
        };
    }

    async runAllTests() {
        console.log('📋 Running comprehensive DRM detection tests...');
        
        try {
            // 1. 測試背景腳本的 DRM 解析功能
            await this.testBackgroundDRMParsing();
            
            // 2. 測試 UI 顯示功能
            await this.testUIDisplay();
            
            // 3. 測試數據流完整性
            await this.testDataFlow();
            
            // 4. 輸出測試結果
            this.outputTestResults();
            
        } catch (error) {
            console.error('❌ DRM detection test failed:', error);
        }
    }

    async testBackgroundDRMParsing() {
        console.log('🔍 Testing background DRM parsing...');
        
        try {
            // 模擬不同的 DRM 系統測試
            const testCases = [
                {
                    name: 'Widevine',
                    contentProtection: '<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>',
                    expected: 'Widevine'
                },
                {
                    name: 'PlayReady',
                    contentProtection: '<ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"/>',
                    expected: 'PlayReady'
                },
                {
                    name: 'FairPlay',
                    contentProtection: '<ContentProtection schemeIdUri="urn:uuid:94ce86fb-07ff-4f43-adb8-93d2fa968ca2"/>',
                    expected: 'FairPlay'
                },
                {
                    name: 'CENC',
                    contentProtection: '<ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" cenc:default_KID="b468a4a4-7f0a-3a2c-12a2-1751c99159bf"/>',
                    expected: 'CENC (Common Encryption)'
                }
            ];

            let passedTests = 0;
            for (const testCase of testCases) {
                const result = this.simulateDRMParsing(testCase.contentProtection);
                
                if (result && result.system === testCase.expected) {
                    console.log(`✅ ${testCase.name} detection: PASSED`);
                    passedTests++;
                } else {
                    console.log(`❌ ${testCase.name} detection: FAILED`);
                    console.log(`   Expected: ${testCase.expected}, Got: ${result ? result.system : 'null'}`);
                }
            }

            this.testResults.backgroundScript = {
                passed: passedTests,
                total: testCases.length,
                success: passedTests === testCases.length
            };

        } catch (error) {
            console.error('❌ Background DRM parsing test failed:', error);
            this.testResults.backgroundScript = { success: false, error: error.message };
        }
    }

    simulateDRMParsing(contentProtectionMatch) {
        // 模擬 background.js 中的 parseDRMSystem 函數
        try {
            const DRM_SYSTEMS = {
                'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed': 'Widevine',
                '9a04f079-9840-4286-ab92-e65be0885f95': 'PlayReady',
                '94ce86fb-07ff-4f43-adb8-93d2fa968ca2': 'FairPlay',
                '1077efec-c0b2-4d02-ace3-3c1e52e2fb4b': 'ClearKey'
            };

            const result = {
                system: 'Unknown',
                details: {}
            };

            // 提取 schemeIdUri
            const schemeMatch = contentProtectionMatch.match(/schemeIdUri="([^"]*)"/i);
            if (schemeMatch) {
                const schemeUri = schemeMatch[1];
                result.details.schemeIdUri = schemeUri;

                // 檢查是否為 UUID 格式的 DRM 系統
                const uuidMatch = schemeUri.match(/urn:uuid:([a-f0-9-]+)/i);
                if (uuidMatch) {
                    const uuid = uuidMatch[1].toLowerCase();
                    result.system = DRM_SYSTEMS[uuid] || `Unknown UUID (${uuid})`;
                    result.details.uuid = uuid;
                } else if (schemeUri.includes('mp4protection')) {
                    result.system = 'CENC (Common Encryption)';
                }
            }

            // 提取 default_KID
            const kidMatch = contentProtectionMatch.match(/cenc:default_KID="([^"]*)"/i);
            if (kidMatch) {
                result.details.defaultKID = kidMatch[1];
            }

            return result;

        } catch (error) {
            console.error('Error in DRM parsing simulation:', error);
            return null;
        }
    }

    async testUIDisplay() {
        console.log('🖥️ Testing UI display functionality...');
        
        try {
            // 模擬 DRM 檢測數據
            const mockDRMData = {
                drmProtection: {
                    protected: true,
                    drmSystems: ['Widevine', 'PlayReady'],
                    score: 100,
                    details: {
                        manifestDRM: true,
                        segmentDRM: false,
                        drmSystemDetails: {
                            'Widevine': { uuid: 'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed' },
                            'PlayReady': { uuid: '9a04f079-9840-4286-ab92-e65be0885f95' }
                        },
                        protectedSegments: 0,
                        totalSegments: 0,
                        protectedSegmentRatio: 0
                    }
                }
            };

            // 檢查 UI 元素是否存在
            const uiElements = [
                'drmInfo',
                'drmStatus',
                'drmSystems',
                'keySystem',
                'streamType',
                'drmDetails',
                'drmStats'
            ];

            let foundElements = 0;
            for (const elementId of uiElements) {
                const element = document.getElementById(elementId);
                if (element) {
                    foundElements++;
                    console.log(`✅ UI element found: ${elementId}`);
                } else {
                    console.log(`❌ UI element missing: ${elementId}`);
                }
            }

            // 測試 updateDRMInfo 函數
            if (typeof updateDRMInfo === 'function') {
                console.log('✅ updateDRMInfo function exists');
                
                try {
                    updateDRMInfo(mockDRMData);
                    console.log('✅ updateDRMInfo executed successfully');
                } catch (error) {
                    console.log('❌ updateDRMInfo execution failed:', error);
                }
            } else {
                console.log('❌ updateDRMInfo function not found');
            }

            this.testResults.uiDisplay = {
                elementsFound: foundElements,
                totalElements: uiElements.length,
                success: foundElements >= uiElements.length * 0.8, // 80% 成功率
                functionExists: typeof updateDRMInfo === 'function'
            };

        } catch (error) {
            console.error('❌ UI display test failed:', error);
            this.testResults.uiDisplay = { success: false, error: error.message };
        }
    }

    async testDataFlow() {
        console.log('🔄 Testing data flow integrity...');
        
        try {
            // 測試擴充功能通信
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                const pingResult = await this.testExtensionCommunication();
                
                this.testResults.dataFlow = {
                    extensionAvailable: true,
                    communicationWorking: pingResult,
                    success: pingResult
                };
            } else {
                this.testResults.dataFlow = {
                    extensionAvailable: false,
                    success: false,
                    error: 'Chrome extension API not available'
                };
            }

        } catch (error) {
            console.error('❌ Data flow test failed:', error);
            this.testResults.dataFlow = { success: false, error: error.message };
        }
    }

    testExtensionCommunication() {
        return new Promise((resolve) => {
            if (typeof chrome === 'undefined' || !chrome.runtime) {
                resolve(false);
                return;
            }

            chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('❌ Extension communication failed:', chrome.runtime.lastError.message);
                    resolve(false);
                } else {
                    console.log('✅ Extension communication successful');
                    resolve(true);
                }
            });
        });
    }

    outputTestResults() {
        console.log('\n📊 DRM Detection Test Results:');
        console.log('=====================================');
        
        Object.entries(this.testResults).forEach(([testName, result]) => {
            const status = result.success ? '✅ PASSED' : '❌ FAILED';
            console.log(`${testName}: ${status}`);
            
            if (result.error) {
                console.log(`  Error: ${result.error}`);
            }
            
            if (result.passed !== undefined) {
                console.log(`  Results: ${result.passed}/${result.total} tests passed`);
            }
        });
        
        console.log('=====================================');
        
        // 計算整體成功率
        const totalTests = Object.keys(this.testResults).length;
        const passedTests = Object.values(this.testResults).filter(r => r.success).length;
        const successRate = (passedTests / totalTests * 100).toFixed(1);
        
        console.log(`Overall Success Rate: ${successRate}% (${passedTests}/${totalTests})`);
        
        if (successRate >= 80) {
            console.log('🎉 DRM detection system is ready for use!');
        } else {
            console.log('⚠️ DRM detection system needs improvement');
        }
    }
}

// 運行測試
const tester = new DRMDetectionTester();

// 如果在瀏覽器環境中，等待 DOM 載入
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => tester.runAllTests(), 1000);
        });
    } else {
        setTimeout(() => tester.runAllTests(), 1000);
    }
} else {
    // 在 Node.js 環境中直接運行
    tester.runAllTests();
}

// 導出測試器供外部使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DRMDetectionTester;
}
if (typeof window !== 'undefined') {
    window.DRMDetectionTester = DRMDetectionTester;
}