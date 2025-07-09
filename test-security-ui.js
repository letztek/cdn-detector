// 測試安全檢測 UI 顯示功能
console.log('Starting security detection UI test...');

// 模擬 edu.tw 的安全檢測數據
const testSecurityData = {
  tabId: 1,
  url: 'https://www.edu.tw/Default.aspx',
  lastUpdate: '2024-01-15T10:30:00.000Z',
  currentScore: 76,
  currentLevel: 'good',
  history: [
    {
      tabId: 1,
      url: 'https://www.edu.tw/Default.aspx',
      timestamp: '2024-01-15T10:30:00.000Z',
      headers: {
        csp: {
          present: true,
          score: 80,
          level: 'good',
          details: 'CSP detected with good configuration',
          directives: ['default-src', 'script-src', 'style-src'],
          issues: ['unsafe-inline detected'],
          raw: "default-src 'self'; script-src 'self' 'unsafe-inline'",
          enhanced: true
        },
        frameProtection: {
          present: true,
          score: 90,
          level: 'excellent',
          details: {
            xFrameOptions: 'SAMEORIGIN',
            frameAncestors: true,
            protection: 'strong'
          },
          issues: [],
          enhanced: true
        },
        hsts: {
          present: true,
          score: 100,
          details: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
          },
          raw: 'max-age=31536000; includeSubDomains; preload'
        },
        contentType: {
          present: true,
          score: 100,
          value: 'nosniff',
          correct: true
        },
        cookies: {
          present: true,
          score: 60,
          cookieCount: 3,
          issues: ['Cookie missing Secure flag']
        },
        referrerPolicy: {
          present: false,
          score: 0
        }
      },
      score: 76,
      level: 'good',
      recommendations: [
        {
          priority: 'medium',
          category: 'csp',
          message: 'CSP Issue: unsafe-inline detected'
        },
        {
          priority: 'low',
          category: 'referrerPolicy',
          message: 'Consider adding Referrer-Policy header for privacy protection'
        }
      ]
    }
  ]
};

// 測試函數
function testSecurityUI() {
  console.log('Testing security UI with data:', testSecurityData);
  
  // 檢查是否有 updateSecurityResults 函數
  if (typeof updateSecurityResults === 'function') {
    console.log('✅ updateSecurityResults function exists');
    
    try {
      // 測試更新安全結果
      updateSecurityResults(testSecurityData);
      console.log('✅ Security results updated successfully');
      
      // 檢查各個顯示區域是否正確顯示
      const testElements = [
        'cspDetectionResult',
        'frameProtectionResult', 
        'hstsResult',
        'contentTypeResult',
        'securityScoreOverview'
      ];
      
      let allElementsVisible = true;
      testElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element && element.style.display !== 'none') {
          console.log(`✅ ${elementId} is visible`);
        } else {
          console.log(`❌ ${elementId} is not visible or not found`);
          allElementsVisible = false;
        }
      });
      
      if (allElementsVisible) {
        console.log('✅ All security UI elements are visible');
      } else {
        console.log('❌ Some security UI elements are missing');
      }
      
      // 檢查分數和等級是否正確顯示
      const scoreElement = document.getElementById('overallSecurityScore');
      const levelElement = document.getElementById('overallSecurityLevel');
      
      if (scoreElement && scoreElement.textContent === '76') {
        console.log('✅ Security score displayed correctly (76)');
      } else {
        console.log('❌ Security score not displayed correctly');
      }
      
      if (levelElement && levelElement.textContent === '良好') {
        console.log('✅ Security level displayed correctly (良好)');
      } else {
        console.log('❌ Security level not displayed correctly');
      }
      
    } catch (error) {
      console.error('❌ Error testing security UI:', error);
    }
  } else {
    console.log('❌ updateSecurityResults function not found');
  }
}

// 測試 showNoSecurityData 函數
function testShowNoSecurityData() {
  if (typeof showNoSecurityData === 'function') {
    console.log('✅ showNoSecurityData function exists');
    
    try {
      showNoSecurityData();
      console.log('✅ showNoSecurityData executed successfully');
      
      // 檢查無數據提示是否顯示
      const noDataElement = document.getElementById('noSecurityData');
      if (noDataElement && noDataElement.style.display !== 'none') {
        console.log('✅ No security data message is visible');
      } else {
        console.log('❌ No security data message is not visible');
      }
      
    } catch (error) {
      console.error('❌ Error testing showNoSecurityData:', error);
    }
  } else {
    console.log('❌ showNoSecurityData function not found');
  }
}

// 測試安全管理器狀態
function testSecurityManagerStatus() {
  if (typeof updateSecurityStatus === 'function') {
    console.log('✅ updateSecurityStatus function exists');
    
    try {
      // 測試啟用狀態
      updateSecurityStatus({ enabled: true });
      console.log('✅ Security manager enabled status updated');
      
      // 測試禁用狀態
      updateSecurityStatus({ enabled: false, error: 'Test error' });
      console.log('✅ Security manager disabled status updated');
      
    } catch (error) {
      console.error('❌ Error testing security manager status:', error);
    }
  } else {
    console.log('❌ updateSecurityStatus function not found');
  }
}

// 運行所有測試
function runAllTests() {
  console.log('🔬 Running all security UI tests...');
  
  // 等待 DOM 載入
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(runTests, 1000);
    });
  } else {
    setTimeout(runTests, 1000);
  }
}

function runTests() {
  console.log('--- Security UI Test Results ---');
  
  testSecurityManagerStatus();
  console.log('');
  
  testShowNoSecurityData();
  console.log('');
  
  testSecurityUI();
  console.log('');
  
  console.log('--- Test Complete ---');
  console.log('Open browser DevTools Console to see test results');
}

// 自動運行測試
runAllTests();