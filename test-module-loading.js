/**
 * 測試模組載入修復
 * 驗證 importScripts 是否解決了 CSP eval 問題
 */

function testModuleLoading() {
  console.log('🔧 開始測試模組載入修復...');
  
  // 檢查擴展狀態
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    console.log('✅ Chrome Extension 環境檢測正常');
    
    // 發送健康檢查
    chrome.runtime.sendMessage({
      type: 'health-check'
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ Health check 失敗:', chrome.runtime.lastError);
        return;
      }
      
      console.log('📊 擴展狀態:', response);
      
      if (response.modulesLoaded) {
        console.log('✅ 模組載入成功！');
        testSecurityModule();
      } else {
        console.log('⚠️ 模組尚未載入，檢查背景腳本');
        if (response.legacyBackgroundLoaded) {
          console.log('✅ Legacy 模式已啟動');
        }
      }
    });
    
  } else {
    console.error('❌ 不在 Chrome Extension 環境中');
  }
}

function testSecurityModule() {
  console.log('\n🔒 測試安全檢測模組...');
  
  // 測試獲取安全檢測結果
  chrome.runtime.sendMessage({
    type: 'getSecurityDetection'
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ 安全檢測測試失敗:', chrome.runtime.lastError);
      return;
    }
    
    console.log('📋 安全檢測回應:', response);
    
    if (response.type === 'securityDetectionResponse') {
      console.log('✅ 安全檢測模組回應正常');
    } else {
      console.log('⚠️ 安全檢測模組回應異常');
    }
  });
  
  // 測試切換安全檢測
  chrome.runtime.sendMessage({
    type: 'toggleSecurityDetection',
    enabled: true
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ 安全檢測切換失敗:', chrome.runtime.lastError);
      return;
    }
    
    console.log('🔄 安全檢測切換回應:', response);
    
    if (response.success) {
      console.log('✅ 安全檢測切換成功');
    } else {
      console.log('❌ 安全檢測切換失敗');
    }
  });
}

// 自動執行測試
setTimeout(() => {
  testModuleLoading();
}, 1000);

// 匯出供手動調用
if (typeof window !== 'undefined') {
  window.testModuleLoading = testModuleLoading;
  window.testSecurityModule = testSecurityModule;
} else if (typeof self !== 'undefined') {
  self.testModuleLoading = testModuleLoading;
  self.testSecurityModule = testSecurityModule;
}

console.log('🚀 模組載入測試工具已準備好');
console.log('💡 在控制台執行 testModuleLoading() 開始測試');