/**
 * 安全檢測模組整合測試
 * 簡單的集成測試來驗證模組是否正確載入和整合
 */

// 測試資料：模擬一個具有良好安全 Headers 的響應
const mockGoodSecurityHeaders = [
  { name: 'Content-Security-Policy', value: 'default-src \'self\'; script-src \'self\'; object-src \'none\'; frame-ancestors \'self\'' },
  { name: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { name: 'X-Content-Type-Options', value: 'nosniff' },
  { name: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { name: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { name: 'Set-Cookie', value: 'sessionid=abc123; Secure; HttpOnly; SameSite=Strict' },
  { name: 'Content-Type', value: 'text/html; charset=utf-8' }
];

// 測試資料：模擬一個安全性較差的響應
const mockPoorSecurityHeaders = [
  { name: 'Server', value: 'Apache/2.4.41' },
  { name: 'Set-Cookie', value: 'sessionid=abc123' }, // 沒有安全屬性
  { name: 'Content-Type', value: 'text/html; charset=utf-8' }
];

/**
 * 測試安全檢測模組功能
 */
function testSecurityDetection() {
  console.log('🔒 開始安全檢測模組測試...');
  
  // 檢查模組是否已載入
  if (typeof self.SecurityDetectionModule === 'undefined') {
    console.error('❌ SecurityDetectionModule 未載入');
    return false;
  }
  
  console.log('✅ SecurityDetectionModule 已載入');
  
  try {
    // 創建測試實例（不需要 messageRouter 用於單元測試）
    const mockRouter = {
      registerRoute: (type, handler, priority) => {
        console.log(`📋 註冊路由: ${type} (優先級: ${priority})`);
      }
    };
    
    const securityModule = new self.SecurityDetectionModule(mockRouter);
    console.log('✅ SecurityDetectionModule 實例創建成功');
    
    // 測試 Header 解析
    console.log('\n🧪 測試 Header 解析功能...');
    
    const headerMap = securityModule.createHeaderMap(mockGoodSecurityHeaders);
    console.log('Header Map:', headerMap);
    
    // 測試 CSP 分析
    const cspAnalysis = securityModule.analyzeCSP(headerMap);
    console.log('CSP 分析結果:', cspAnalysis);
    
    // 測試 Frame Options 分析
    const frameAnalysis = securityModule.analyzeFrameOptions(headerMap);
    console.log('Frame Options 分析:', frameAnalysis);
    
    // 測試 HSTS 分析
    const hstsAnalysis = securityModule.analyzeHSTS(headerMap);
    console.log('HSTS 分析:', hstsAnalysis);
    
    // 測試完整安全分析
    console.log('\n🏆 測試完整安全分析...');
    
    const fullAnalysis = {
      headers: {
        csp: cspAnalysis,
        frameOptions: frameAnalysis,
        contentTypeOptions: securityModule.analyzeContentTypeOptions(headerMap),
        hsts: hstsAnalysis,
        referrerPolicy: securityModule.analyzeReferrerPolicy(headerMap)
      },
      httpsAnalysis: securityModule.analyzeHTTPS('https://example.com'),
      cookieAnalysis: securityModule.analyzeCookies(mockGoodSecurityHeaders)
    };
    
    const score = securityModule.calculateSecurityScore(fullAnalysis);
    const level = securityModule.determineSecurityLevel(score);
    
    console.log(`🎯 安全評分: ${score}/100 (${level})`);
    
    // 測試較差的安全配置
    console.log('\n📉 測試較差安全配置...');
    const poorHeaderMap = securityModule.createHeaderMap(mockPoorSecurityHeaders);
    const poorAnalysis = {
      headers: {
        csp: securityModule.analyzeCSP(poorHeaderMap),
        frameOptions: securityModule.analyzeFrameOptions(poorHeaderMap),
        contentTypeOptions: securityModule.analyzeContentTypeOptions(poorHeaderMap),
        hsts: securityModule.analyzeHSTS(poorHeaderMap),
        referrerPolicy: securityModule.analyzeReferrerPolicy(poorHeaderMap)
      },
      httpsAnalysis: securityModule.analyzeHTTPS('http://example.com'), // HTTP
      cookieAnalysis: securityModule.analyzeCookies(mockPoorSecurityHeaders)
    };
    
    const poorScore = securityModule.calculateSecurityScore(poorAnalysis);
    const poorLevel = securityModule.determineSecurityLevel(poorScore);
    
    console.log(`📊 較差配置評分: ${poorScore}/100 (${poorLevel})`);
    
    console.log('\n✅ 所有測試通過！安全檢測模組運作正常');
    return true;
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
    return false;
  }
}

/**
 * 測試與 CDN 檢測模組的整合
 */
function testCDNIntegration() {
  console.log('\n🔗 測試與 CDN 檢測模組整合...');
  
  if (typeof self.CDNDetectionModule === 'undefined') {
    console.error('❌ CDNDetectionModule 未載入');
    return false;
  }
  
  try {
    const mockRouter = {
      registerRoute: (type, handler, priority) => {
        console.log(`📋 CDN 註冊路由: ${type} (優先級: ${priority})`);
      }
    };
    
    const cdnModule = new self.CDNDetectionModule(mockRouter);
    const securityModule = new self.SecurityDetectionModule(mockRouter);
    
    // 測試整合
    cdnModule.setSecurityModule(securityModule);
    console.log('✅ 安全模組已整合到 CDN 檢測模組');
    
    // 檢查整合狀態
    if (cdnModule.securityModule === securityModule) {
      console.log('✅ 模組整合驗證通過');
      return true;
    } else {
      console.error('❌ 模組整合驗證失敗');
      return false;
    }
    
  } catch (error) {
    console.error('❌ 整合測試失敗:', error);
    return false;
  }
}

// 如果在瀏覽器環境中運行，自動執行測試
if (typeof window !== 'undefined' || typeof self !== 'undefined') {
  // 延遲執行以確保模組已載入
  setTimeout(() => {
    const securityTestResult = testSecurityDetection();
    const integrationTestResult = testCDNIntegration();
    
    if (securityTestResult && integrationTestResult) {
      console.log('\n🎉 所有測試通過！安全檢測系統準備就緒');
    } else {
      console.error('\n💥 測試失敗，需要檢查模組載入');
    }
  }, 1000);
}

// 匯出測試函數供手動呼叫
if (typeof self !== 'undefined') {
  self.testSecurityDetection = testSecurityDetection;
  self.testCDNIntegration = testCDNIntegration;
}