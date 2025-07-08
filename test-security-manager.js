/**
 * 測試安全管理器整合
 * 
 * 這個測試文件用於驗證SecurityManager是否正確整合到background.js中
 */

// 測試SecurityManager的基本功能
async function testSecurityManager() {
  console.log('=== Security Manager Integration Test ===');
  
  try {
    // 1. 測試 SecurityManager 類別載入
    console.log('1. Testing SecurityManager class loading...');
    const securityManagerUrl = chrome.runtime.getURL('src/core/security-manager.js');
    const response = await fetch(securityManagerUrl);
    const moduleCode = await response.text();
    
    // 載入模組
    eval(moduleCode);
    
    if (typeof SecurityManager !== 'undefined') {
      console.log('✅ SecurityManager class loaded successfully');
    } else {
      console.error('❌ SecurityManager class not found');
      return false;
    }
    
    // 2. 測試 SecurityManager 實例化
    console.log('2. Testing SecurityManager instantiation...');
    const securityManager = new SecurityManager();
    
    if (securityManager) {
      console.log('✅ SecurityManager instance created successfully');
    } else {
      console.error('❌ Failed to create SecurityManager instance');
      return false;
    }
    
    // 3. 測試基本方法
    console.log('3. Testing basic methods...');
    
    // 測試狀態獲取
    const status = securityManager.getStatus();
    console.log('SecurityManager status:', status);
    
    // 測試統計資料
    const stats = securityManager.getStatistics();
    console.log('SecurityManager statistics:', stats);
    
    // 4. 測試 SecurityDetectionModule 載入
    console.log('4. Testing SecurityDetectionModule loading...');
    
    // 等待初始化完成
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (securityManager.securityModule) {
      console.log('✅ SecurityDetectionModule loaded successfully');
    } else {
      console.log('⚠️ SecurityDetectionModule not loaded yet (async loading)');
    }
    
    // 5. 測試模擬安全檢測
    console.log('5. Testing simulated security check...');
    
    const mockDetails = {
      tabId: 1,
      url: 'https://example.com',
      type: 'main_frame',
      responseHeaders: [
        { name: 'content-security-policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'" },
        { name: 'x-frame-options', value: 'DENY' },
        { name: 'x-content-type-options', value: 'nosniff' },
        { name: 'strict-transport-security', value: 'max-age=31536000; includeSubDomains' }
      ]
    };
    
    try {
      const result = await securityManager.handleSecurityCheck(mockDetails);
      if (result) {
        console.log('✅ Security check completed successfully');
        console.log('Security check result:', result);
      } else {
        console.log('⚠️ Security check returned null (may be normal during initialization)');
      }
    } catch (error) {
      console.error('❌ Security check failed:', error);
    }
    
    console.log('\n=== Test Results ===');
    console.log('✅ SecurityManager integration test completed');
    console.log('📊 Final Status:', securityManager.getStatus());
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// 測試背景腳本消息處理
async function testSecurityMessages() {
  console.log('\n=== Security Message Handler Test ===');
  
  try {
    // 測試安全狀態獲取
    console.log('1. Testing GET_SECURITY_STATUS message...');
    const statusResponse = await chrome.runtime.sendMessage({
      type: 'GET_SECURITY_STATUS'
    });
    
    console.log('Status response:', statusResponse);
    
    // 測試安全統計資料獲取
    console.log('2. Testing GET_SECURITY_STATS message...');
    const statsResponse = await chrome.runtime.sendMessage({
      type: 'GET_SECURITY_STATS'
    });
    
    console.log('Stats response:', statsResponse);
    
    // 測試安全資料獲取（需要有效的 tabId）
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      console.log('3. Testing GET_SECURITY_DATA message...');
      const dataResponse = await chrome.runtime.sendMessage({
        type: 'GET_SECURITY_DATA',
        tabId: tabs[0].id
      });
      
      console.log('Data response:', dataResponse);
    }
    
    console.log('✅ Security message handler test completed');
    
  } catch (error) {
    console.error('❌ Message handler test failed:', error);
  }
}

// 在 DevTools Console 中運行測試
if (typeof window !== 'undefined') {
  // 在 popup 或 content script 中運行
  window.testSecurityManager = testSecurityManager;
  window.testSecurityMessages = testSecurityMessages;
  
  // 自動運行測試
  console.log('Security Manager test functions loaded. Run testSecurityManager() or testSecurityMessages()');
} else {
  // 在 Service Worker 中運行
  testSecurityManager().then(() => {
    console.log('Security Manager test completed');
  });
}