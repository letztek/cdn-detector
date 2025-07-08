/**
 * 測試 SecurityDetectionModule 的基本功能
 * 這個檔案用於驗證安全檢測模組的核心功能
 */

// 載入模組
const SecurityDetectionModule = require('./SecurityDetectionModule.js');

// 創建測試資料
const mockGoodHeaders = [
  { name: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; frame-ancestors 'none';" },
  { name: 'X-Frame-Options', value: 'DENY' },
  { name: 'X-Content-Type-Options', value: 'nosniff' },
  { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { name: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
  { name: 'Set-Cookie', value: 'session=abc123; Secure; HttpOnly; SameSite=Strict' }
];

const mockPoorHeaders = [
  { name: 'Content-Security-Policy', value: "default-src *; script-src * 'unsafe-inline' 'unsafe-eval';" },
  { name: 'Set-Cookie', value: 'session=abc123' }
];

// 測試函數
async function testSecurityDetection() {
  console.log('=== 開始測試 SecurityDetectionModule ===\n');
  
  // 創建模組實例
  const securityModule = new SecurityDetectionModule();
  console.log('✅ 模組初始化成功');
  console.log(`   - 存儲前綴: ${securityModule.storagePrefix}`);
  console.log(`   - 啟用狀態: ${securityModule.isEnabled()}`);
  
  // 測試良好的安全配置
  console.log('\n📋 測試良好的安全配置:');
  const goodDetails = {
    tabId: 1,
    url: 'https://secure-example.com',
    type: 'main_frame',
    responseHeaders: mockGoodHeaders
  };
  
  const goodResult = securityModule.detectSecurityHeaders(goodDetails);
  if (goodResult) {
    console.log(`   - 總分: ${goodResult.score}/100`);
    console.log(`   - 等級: ${goodResult.level}`);
    console.log(`   - CSP 分數: ${goodResult.headers.csp.score}`);
    console.log(`   - HSTS 分數: ${goodResult.headers.hsts.score}`);
    console.log(`   - Cookie 安全分數: ${goodResult.headers.cookies.score}`);
    console.log(`   - 建議數量: ${goodResult.recommendations.length}`);
  }
  
  // 測試較差的安全配置
  console.log('\n📋 測試較差的安全配置:');
  const poorDetails = {
    tabId: 2,
    url: 'http://insecure-example.com',
    type: 'main_frame',
    responseHeaders: mockPoorHeaders
  };
  
  const poorResult = securityModule.detectSecurityHeaders(poorDetails);
  if (poorResult) {
    console.log(`   - 總分: ${poorResult.score}/100`);
    console.log(`   - 等級: ${poorResult.level}`);
    console.log(`   - CSP 分數: ${poorResult.headers.csp.score}`);
    console.log(`   - 建議數量: ${poorResult.recommendations.length}`);
    
    console.log('\n   建議內容:');
    poorResult.recommendations.forEach(rec => {
      console.log(`   - [${rec.priority}] ${rec.category}: ${rec.message}`);
    });
  }
  
  // 測試錯誤處理
  console.log('\n📋 測試錯誤處理:');
  const invalidDetails = {
    tabId: 3,
    url: 'https://test.com',
    type: 'main_frame',
    responseHeaders: null // 無效的 headers
  };
  
  const errorResult = securityModule.detectSecurityHeaders(invalidDetails);
  console.log(`   - 錯誤情況返回: ${errorResult === null ? 'null (正確)' : '非 null (錯誤)'}`);
  
  // 測試非主框架請求的過濾
  console.log('\n📋 測試請求類型過濾:');
  const imageDetails = {
    tabId: 4,
    url: 'https://example.com/image.png',
    type: 'image',
    responseHeaders: mockGoodHeaders
  };
  
  const imageResult = securityModule.detectSecurityHeaders(imageDetails);
  console.log(`   - 圖片請求返回: ${imageResult === null ? 'null (正確過濾)' : '非 null (未過濾)'}`);
  
  console.log('\n=== 測試完成 ===');
}

// 執行測試
if (typeof window === 'undefined') {
  // Node.js 環境
  testSecurityDetection().catch(console.error);
} else {
  // 瀏覽器環境
  console.log('請在 Node.js 環境中執行此測試檔案');
}