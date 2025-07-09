if (typeof SecurityDetectionModule === 'undefined') {
/**
 * SecurityDetectionModule - 核心安全檢測模組
 * 
 * 功能：
 * - 檢測網站安全相關的 HTTP Headers
 * - 提供 0-100 分的安全評分
 * - 完全獨立於現有 CDN 檢測系統
 * - 錯誤隔離機制確保零影響
 * 
 * @class SecurityDetectionModule
 */
class SecurityDetectionModule {
  constructor() {
    // 初始化安全檢測配置
    this.enabled = true;
    this.storagePrefix = 'security_';
    
    // 安全 Headers 權重配置
    this.headerWeights = {
      csp: 25,              // Content-Security-Policy
      https: 20,            // HTTPS 相關
      frameProtection: 15,  // X-Frame-Options / frame-ancestors
      contentType: 10,      // X-Content-Type-Options
      hsts: 10,            // Strict-Transport-Security
      cookies: 10,         // Cookie 安全性
      others: 10           // 其他安全 Headers
    };
    
    // 初始化檢測結果存儲
    this.detectionResults = new Map();
    
    // 初始化專門的檢測器
    this.cspDetector = null;
    this.frameProtectionDetector = null;
    this.initializeCSPDetector();
    this.initializeFrameProtectionDetector();
  }

  /**
   * 初始化 CSP 檢測器
   */
  initializeCSPDetector() {
    try {
      // 檢查 CSPDetector 是否已載入（應該通過 importScripts 載入）
      if (typeof CSPDetector !== 'undefined') {
        this.cspDetector = new CSPDetector();
        console.log('[SecurityDetectionModule] CSPDetector initialized from global scope');
      } else {
        console.warn('[SecurityDetectionModule] CSPDetector not available');
      }
    } catch (error) {
      console.error('[SecurityDetectionModule] Failed to initialize CSPDetector:', error);
    }
  }

  /**
   * 初始化 Frame Protection 檢測器
   */
  initializeFrameProtectionDetector() {
    try {
      // 檢查 FrameProtectionDetector 是否已載入（應該通過 importScripts 載入）
      if (typeof FrameProtectionDetector !== 'undefined') {
        this.frameProtectionDetector = new FrameProtectionDetector();
        console.log('[SecurityDetectionModule] FrameProtectionDetector initialized from global scope');
      } else {
        console.warn('[SecurityDetectionModule] FrameProtectionDetector not available');
      }
    } catch (error) {
      console.error('[SecurityDetectionModule] Failed to initialize FrameProtectionDetector:', error);
    }
  }

  /**
   * 檢測安全 Headers - 主入口函數
   * @param {Object} details - Chrome webRequest 的 details 物件
   * @returns {Object|null} 檢測結果或 null（發生錯誤時）
   */
  detectSecurityHeaders(details) {
    console.log(`[SecurityDetectionModule] Processing security headers for ${details.url} (Type: ${details.type}, Tab: ${details.tabId})`);
    
    try {
      // 只處理主文檔請求
      if (details.type !== 'main_frame' && details.type !== 'sub_frame') {
        console.log(`[SecurityDetectionModule] Skipping non-frame request type: ${details.type}`);
        return null;
      }

      const headers = this.parseHeaders(details.responseHeaders);
      console.log(`[SecurityDetectionModule] Parsed ${headers.size} headers from response`);
      
      const timestamp = new Date().toISOString();
      
      // 執行各項安全檢測
      const detectionResult = {
        tabId: details.tabId,
        url: details.url,
        timestamp: timestamp,
        headers: {
          csp: this.detectCSP(headers, details.url),
          frameProtection: this.detectFrameProtection(headers, details.url),
          contentType: this.detectContentTypeOptions(headers),
          hsts: this.detectHSTS(headers),
          referrerPolicy: this.detectReferrerPolicy(headers),
          permissionsPolicy: this.detectPermissionsPolicy(headers),
          cookies: this.detectCookieSecurity(headers)
        },
        score: 0, // 將在後續計算
        level: '', // 將在後續計算
        recommendations: []
      };
      
      // 計算總分
      detectionResult.score = this.calculateScore(detectionResult.headers);
      detectionResult.level = this.getSecurityLevel(detectionResult.score);
      detectionResult.recommendations = this.generateRecommendations(detectionResult.headers);
      
      // 存儲結果
      console.log(`[SecurityDetectionModule] Storing detection result for tab ${details.tabId}, score: ${detectionResult.score}/100`);
      this.storeResult(details.tabId, detectionResult);
      
      console.log(`[SecurityDetectionModule] Security detection completed for ${details.url}`);
      return detectionResult;
      
    } catch (error) {
      // 錯誤隔離 - 記錄但不影響系統
      console.error('[SecurityDetectionModule] Error in detectSecurityHeaders:', error);
      return null;
    }
  }

  /**
   * 解析 Headers 為 Map 結構
   * @param {Array} responseHeaders - Chrome 的 responseHeaders 陣列
   * @returns {Map} headers Map
   */
  parseHeaders(responseHeaders) {
    const headers = new Map();
    
    if (!responseHeaders || !Array.isArray(responseHeaders)) {
      return headers;
    }
    
    responseHeaders.forEach(header => {
      if (header.name && header.value) {
        // 轉換為小寫以便統一處理
        headers.set(header.name.toLowerCase(), header.value);
      }
    });
    
    return headers;
  }

  /**
   * 檢測 Content-Security-Policy
   * @param {Map} headers
   * @param {string} url - 請求 URL
   * @returns {Object} CSP 檢測結果
   */
  detectCSP(headers, url = '') {
    try {
      // 使用專門的 CSP 檢測器（如果可用）
      if (this.cspDetector) {
        const result = this.cspDetector.detectCSP(headers, url);
        
        // 轉換為舊格式以保持兼容性
        return {
          present: result.present,
          score: result.score,
          level: result.level,
          details: result.details || (result.analysis ? this.formatCSPAnalysis(result.analysis) : ''),
          directives: result.directives ? result.directives.list : [],
          issues: result.analysis ? result.analysis.issues : [],
          raw: result.header ? result.header.value : '',
          enhanced: true, // 標記為增強版檢測
          fullResult: result // 保留完整結果
        };
      }
      
      // 降級到基本 CSP 檢測
      return this.detectCSPBasic(headers);
      
    } catch (error) {
      console.error('[SecurityDetectionModule] Error in detectCSP:', error);
      return { present: false, score: 0, error: true };
    }
  }

  /**
   * 基本 CSP 檢測（降級版本）
   * @param {Map} headers
   * @returns {Object}
   */
  detectCSPBasic(headers) {
    const csp = headers.get('content-security-policy') || 
                headers.get('content-security-policy-report-only');
    
    if (!csp) {
      return {
        present: false,
        score: 0,
        details: 'No CSP header found'
      };
    }
    
    // 解析 CSP 指令
    const directives = this.parseCSPDirectives(csp);
    let score = 100;
    const issues = [];
    
    // 檢查關鍵指令
    if (!directives['default-src']) {
      score -= 20;
      issues.push('Missing default-src directive');
    }
    
    // 檢查 unsafe-inline
    if (this.containsUnsafeInline(directives)) {
      score -= 30;
      issues.push('Contains unsafe-inline');
    }
    
    // 檢查 unsafe-eval
    if (this.containsUnsafeEval(directives)) {
      score -= 20;
      issues.push('Contains unsafe-eval');
    }
    
    // 檢查 frame-ancestors
    if (!directives['frame-ancestors']) {
      score -= 10;
      issues.push('Missing frame-ancestors directive');
    }
    
    return {
      present: true,
      score: Math.max(0, score),
      directives: Object.keys(directives),
      issues: issues,
      raw: csp.substring(0, 200) + (csp.length > 200 ? '...' : ''),
      enhanced: false // 標記為基本檢測
    };
  }

  /**
   * 格式化 CSP 分析結果
   * @param {Object} analysis
   * @returns {string}
   */
  formatCSPAnalysis(analysis) {
    const details = [];
    
    if (analysis.defaultSrc) {
      details.push(`default-src: ${analysis.defaultSrc.present ? 'Present' : 'Missing'}`);
    }
    
    if (analysis.scriptSrc) {
      details.push(`script-src: ${analysis.scriptSrc.present ? 'Present' : 'Falls back to default-src'}`);
    }
    
    if (analysis.issues.length > 0) {
      details.push(`Issues: ${analysis.issues.length}`);
    }
    
    return details.join(', ');
  }

  /**
   * 檢測 Frame Protection Headers
   * @param {Map} headers
   * @param {string} url - 請求 URL
   * @returns {Object} Frame Protection 檢測結果
   */
  detectFrameProtection(headers, url = '') {
    try {
      // 使用專門的 Frame Protection 檢測器（如果可用）
      if (this.frameProtectionDetector) {
        const result = this.frameProtectionDetector.detectFrameProtection(headers, url);
        
        // 轉換為舊格式以保持兼容性
        return {
          present: result.present,
          score: result.score,
          level: result.level,
          details: {
            xFrameOptions: result.xFrameOptions?.value || null,
            frameAncestors: result.frameAncestors?.present || false,
            protection: result.protection,
            analysis: result.analysis
          },
          issues: this.extractIssues(result),
          enhanced: true, // 標記為增強版檢測
          fullResult: result // 保留完整結果
        };
      }
      
      // 降級到基本 Frame Protection 檢測
      return this.detectFrameProtectionBasic(headers);
      
    } catch (error) {
      console.error('[SecurityDetectionModule] Error in detectFrameProtection:', error);
      return { present: false, score: 0, error: true };
    }
  }

  /**
   * 基本 Frame Protection 檢測（降級版本）
   * @param {Map} headers
   * @returns {Object}
   */
  detectFrameProtectionBasic(headers) {
    const xFrameOptions = headers.get('x-frame-options');
    const csp = headers.get('content-security-policy');
    
    let score = 0;
    const details = {};
    
    // 檢查 X-Frame-Options
    if (xFrameOptions) {
      const value = xFrameOptions.toUpperCase();
      details.xFrameOptions = value;
      
      if (value === 'DENY') {
        score = 100;
      } else if (value === 'SAMEORIGIN') {
        score = 80;
      } else if (value.startsWith('ALLOW-FROM')) {
        score = 60;
      }
    }
    
    // 檢查 CSP frame-ancestors
    if (csp && csp.includes('frame-ancestors')) {
      details.frameAncestors = true;
      score = Math.max(score, 90);
    }
    
    return {
      present: score > 0,
      score: score,
      details: details,
      enhanced: false // 標記為基本檢測
    };
  }

  /**
   * 從檢測結果中提取問題列表
   * @param {Object} result
   * @returns {Array}
   */
  extractIssues(result) {
    const issues = [];
    
    if (result.xFrameOptions?.issues) {
      issues.push(...result.xFrameOptions.issues);
    }
    
    if (result.frameAncestors?.issues) {
      issues.push(...result.frameAncestors.issues);
    }
    
    if (result.analysis?.issues) {
      issues.push(...result.analysis.issues);
    }
    
    if (result.analysis?.conflicts) {
      issues.push(...result.analysis.conflicts);
    }
    
    return issues;
  }

  /**
   * 檢測 X-Content-Type-Options
   * @param {Map} headers
   * @returns {Object} Content Type Options 檢測結果
   */
  detectContentTypeOptions(headers) {
    try {
      const contentTypeOptions = headers.get('x-content-type-options');
      
      if (!contentTypeOptions) {
        return {
          present: false,
          score: 0,
          details: 'Header not present'
        };
      }
      
      const value = contentTypeOptions.toLowerCase();
      
      return {
        present: true,
        score: value === 'nosniff' ? 100 : 50,
        value: value,
        correct: value === 'nosniff'
      };
      
    } catch (error) {
      console.error('[SecurityDetectionModule] Error in detectContentTypeOptions:', error);
      return { present: false, score: 0, error: true };
    }
  }

  /**
   * 檢測 Strict-Transport-Security (HSTS)
   * @param {Map} headers
   * @returns {Object} HSTS 檢測結果
   */
  detectHSTS(headers) {
    try {
      const hsts = headers.get('strict-transport-security');
      
      if (!hsts) {
        return {
          present: false,
          score: 0,
          details: 'HSTS not enabled'
        };
      }
      
      let score = 50; // 基礎分數
      const details = {};
      
      // 解析 max-age
      const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
      if (maxAgeMatch) {
        const maxAge = parseInt(maxAgeMatch[1]);
        details.maxAge = maxAge;
        
        // 根據時長給分
        if (maxAge >= 31536000) { // 1 年
          score += 30;
        } else if (maxAge >= 2592000) { // 30 天
          score += 20;
        } else if (maxAge >= 86400) { // 1 天
          score += 10;
        }
      }
      
      // 檢查 includeSubDomains
      if (/includeSubDomains/i.test(hsts)) {
        score += 10;
        details.includeSubDomains = true;
      }
      
      // 檢查 preload
      if (/preload/i.test(hsts)) {
        score += 10;
        details.preload = true;
      }
      
      return {
        present: true,
        score: Math.min(100, score),
        details: details,
        raw: hsts
      };
      
    } catch (error) {
      console.error('[SecurityDetectionModule] Error in detectHSTS:', error);
      return { present: false, score: 0, error: true };
    }
  }

  /**
   * 檢測 Referrer-Policy
   * @param {Map} headers
   * @returns {Object} Referrer Policy 檢測結果
   */
  detectReferrerPolicy(headers) {
    try {
      const referrerPolicy = headers.get('referrer-policy');
      
      if (!referrerPolicy) {
        return {
          present: false,
          score: 0,
          details: 'No Referrer-Policy header'
        };
      }
      
      const value = referrerPolicy.toLowerCase();
      let score = 50; // 基礎分數
      
      // 根據策略嚴格程度評分
      const policyScores = {
        'no-referrer': 100,
        'strict-origin-when-cross-origin': 90,
        'strict-origin': 80,
        'same-origin': 80,
        'origin-when-cross-origin': 70,
        'origin': 60,
        'no-referrer-when-downgrade': 50,
        'unsafe-url': 0
      };
      
      score = policyScores[value] || 50;
      
      return {
        present: true,
        score: score,
        value: value,
        privacy: score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'
      };
      
    } catch (error) {
      console.error('[SecurityDetectionModule] Error in detectReferrerPolicy:', error);
      return { present: false, score: 0, error: true };
    }
  }

  /**
   * 檢測 Permissions-Policy / Feature-Policy
   * @param {Map} headers
   * @returns {Object} Permissions Policy 檢測結果
   */
  detectPermissionsPolicy(headers) {
    try {
      const permissionsPolicy = headers.get('permissions-policy') || 
                               headers.get('feature-policy');
      
      if (!permissionsPolicy) {
        return {
          present: false,
          score: 0,
          details: 'No Permissions/Feature Policy'
        };
      }
      
      // 解析策略
      const policies = permissionsPolicy.split(',').map(p => p.trim());
      let score = 50; // 基礎分數
      
      // 檢查關鍵功能是否被限制
      const restrictedFeatures = policies.filter(p => 
        p.includes('none') || p.includes('self')
      );
      
      score += Math.min(50, restrictedFeatures.length * 10);
      
      return {
        present: true,
        score: Math.min(100, score),
        policiesCount: policies.length,
        restrictedCount: restrictedFeatures.length,
        sample: policies.slice(0, 3)
      };
      
    } catch (error) {
      console.error('[SecurityDetectionModule] Error in detectPermissionsPolicy:', error);
      return { present: false, score: 0, error: true };
    }
  }

  /**
   * 檢測 Cookie 安全性
   * @param {Map} headers
   * @returns {Object} Cookie 安全性檢測結果
   */
  detectCookieSecurity(headers) {
    try {
      const setCookieHeaders = [];
      
      // 收集所有 Set-Cookie headers
      headers.forEach((value, name) => {
        if (name === 'set-cookie') {
          setCookieHeaders.push(value);
        }
      });
      
      if (setCookieHeaders.length === 0) {
        return {
          present: false,
          score: 100, // 沒有 Cookie 反而安全
          details: 'No cookies set'
        };
      }
      
      let totalScore = 0;
      const issues = [];
      
      setCookieHeaders.forEach(cookie => {
        let cookieScore = 0;
        
        // 檢查 Secure 屬性
        if (/;\s*Secure/i.test(cookie)) {
          cookieScore += 40;
        } else {
          issues.push('Cookie missing Secure flag');
        }
        
        // 檢查 HttpOnly 屬性
        if (/;\s*HttpOnly/i.test(cookie)) {
          cookieScore += 30;
        } else {
          issues.push('Cookie missing HttpOnly flag');
        }
        
        // 檢查 SameSite 屬性
        const sameSiteMatch = cookie.match(/;\s*SameSite=(\w+)/i);
        if (sameSiteMatch) {
          const sameSiteValue = sameSiteMatch[1].toLowerCase();
          if (sameSiteValue === 'strict') {
            cookieScore += 30;
          } else if (sameSiteValue === 'lax') {
            cookieScore += 20;
          } else if (sameSiteValue === 'none') {
            cookieScore += 10;
          }
        } else {
          issues.push('Cookie missing SameSite attribute');
        }
        
        totalScore += cookieScore;
      });
      
      // 計算平均分數
      const averageScore = totalScore / setCookieHeaders.length;
      
      return {
        present: true,
        score: Math.round(averageScore),
        cookieCount: setCookieHeaders.length,
        issues: [...new Set(issues)] // 去重
      };
      
    } catch (error) {
      console.error('[SecurityDetectionModule] Error in detectCookieSecurity:', error);
      return { present: false, score: 0, error: true };
    }
  }

  /**
   * 解析 CSP 指令
   * @param {string} csp
   * @returns {Object} 指令對象
   */
  parseCSPDirectives(csp) {
    const directives = {};
    const parts = csp.split(';').map(p => p.trim());
    
    parts.forEach(part => {
      const [directive, ...values] = part.split(/\s+/);
      if (directive) {
        directives[directive] = values.join(' ');
      }
    });
    
    return directives;
  }

  /**
   * 檢查是否包含 unsafe-inline
   * @param {Object} directives
   * @returns {boolean}
   */
  containsUnsafeInline(directives) {
    const checkDirectives = ['default-src', 'script-src', 'style-src'];
    
    return checkDirectives.some(directive => {
      const value = directives[directive];
      return value && value.includes("'unsafe-inline'");
    });
  }

  /**
   * 檢查是否包含 unsafe-eval
   * @param {Object} directives
   * @returns {boolean}
   */
  containsUnsafeEval(directives) {
    const checkDirectives = ['default-src', 'script-src'];
    
    return checkDirectives.some(directive => {
      const value = directives[directive];
      return value && value.includes("'unsafe-eval'");
    });
  }

  /**
   * 計算總體安全分數
   * @param {Object} headers - 各項檢測結果
   * @returns {number} 0-100 的分數
   */
  calculateScore(headers) {
    let totalScore = 0;
    let totalWeight = 0;
    
    // CSP 權重
    if (headers.csp) {
      totalScore += (headers.csp.score || 0) * (this.headerWeights.csp / 100);
      totalWeight += this.headerWeights.csp;
    }
    
    // Frame Protection 權重
    if (headers.frameProtection) {
      totalScore += (headers.frameProtection.score || 0) * (this.headerWeights.frameProtection / 100);
      totalWeight += this.headerWeights.frameProtection;
    }
    
    // Content Type 權重
    if (headers.contentType) {
      totalScore += (headers.contentType.score || 0) * (this.headerWeights.contentType / 100);
      totalWeight += this.headerWeights.contentType;
    }
    
    // HSTS 權重
    if (headers.hsts) {
      totalScore += (headers.hsts.score || 0) * (this.headerWeights.hsts / 100);
      totalWeight += this.headerWeights.hsts;
    }
    
    // Cookies 權重
    if (headers.cookies) {
      totalScore += (headers.cookies.score || 0) * (this.headerWeights.cookies / 100);
      totalWeight += this.headerWeights.cookies;
    }
    
    // 其他 Headers（Referrer Policy, Permissions Policy）
    let othersScore = 0;
    let othersCount = 0;
    
    if (headers.referrerPolicy && headers.referrerPolicy.present) {
      othersScore += headers.referrerPolicy.score || 0;
      othersCount++;
    }
    
    if (headers.permissionsPolicy && headers.permissionsPolicy.present) {
      othersScore += headers.permissionsPolicy.score || 0;
      othersCount++;
    }
    
    if (othersCount > 0) {
      totalScore += (othersScore / othersCount) * (this.headerWeights.others / 100);
      totalWeight += this.headerWeights.others;
    }
    
    // 正規化分數
    if (totalWeight > 0) {
      return Math.round(totalScore * (100 / totalWeight));
    }
    
    return 0;
  }

  /**
   * 根據分數獲取安全等級
   * @param {number} score
   * @returns {string} 安全等級
   */
  getSecurityLevel(score) {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    if (score >= 30) return 'poor';
    return 'critical';
  }

  /**
   * 生成安全建議
   * @param {Object} headers
   * @returns {Array} 建議列表
   */
  generateRecommendations(headers) {
    const recommendations = [];
    
    // CSP 建議
    if (!headers.csp || !headers.csp.present) {
      recommendations.push({
        priority: 'high',
        category: 'csp',
        message: 'Implement Content Security Policy to prevent XSS attacks'
      });
    } else if (headers.csp.issues && headers.csp.issues.length > 0) {
      headers.csp.issues.forEach(issue => {
        recommendations.push({
          priority: 'medium',
          category: 'csp',
          message: `CSP Issue: ${issue}`
        });
      });
    }
    
    // Frame Protection 建議
    if (!headers.frameProtection || !headers.frameProtection.present) {
      recommendations.push({
        priority: 'high',
        category: 'frameProtection',
        message: 'Add X-Frame-Options or CSP frame-ancestors to prevent clickjacking'
      });
    }
    
    // HSTS 建議
    if (!headers.hsts || !headers.hsts.present) {
      recommendations.push({
        priority: 'high',
        category: 'hsts',
        message: 'Enable HSTS to force HTTPS connections'
      });
    } else if (headers.hsts.details) {
      if (!headers.hsts.details.includeSubDomains) {
        recommendations.push({
          priority: 'medium',
          category: 'hsts',
          message: 'Add includeSubDomains to HSTS header'
        });
      }
      if (headers.hsts.details.maxAge < 31536000) {
        recommendations.push({
          priority: 'medium',
          category: 'hsts',
          message: 'Increase HSTS max-age to at least 1 year (31536000 seconds)'
        });
      }
    }
    
    // Cookie 建議
    if (headers.cookies && headers.cookies.issues && headers.cookies.issues.length > 0) {
      headers.cookies.issues.forEach(issue => {
        recommendations.push({
          priority: 'medium',
          category: 'cookies',
          message: issue
        });
      });
    }
    
    // Content Type 建議
    if (!headers.contentType || !headers.contentType.present) {
      recommendations.push({
        priority: 'low',
        category: 'contentType',
        message: 'Add X-Content-Type-Options: nosniff to prevent MIME sniffing'
      });
    }
    
    // Referrer Policy 建議
    if (!headers.referrerPolicy || !headers.referrerPolicy.present) {
      recommendations.push({
        priority: 'low',
        category: 'referrerPolicy',
        message: 'Consider adding Referrer-Policy header for privacy protection'
      });
    }
    
    return recommendations;
  }

  /**
   * 存儲檢測結果
   * @param {number} tabId
   * @param {Object} result
   */
  async storeResult(tabId, result) {
    console.log(`[SecurityDetectionModule] Storing result for tab ${tabId}`);
    
    try {
      const key = `${this.storagePrefix}tab_${tabId}`;
      console.log(`[SecurityDetectionModule] Storage key: ${key}`);
      
      // 獲取現有資料
      const existing = await this.getStoredData(key);
      const history = existing?.history || [];
      console.log(`[SecurityDetectionModule] Found ${history.length} existing history entries`);
      
      // 添加新結果到歷史
      history.push(result);
      
      // 保持最近 50 條記錄
      if (history.length > 50) {
        history.splice(0, history.length - 50);
      }
      
      // 存儲更新後的資料
      const dataToStore = {
        tabId: tabId,
        lastUpdate: result.timestamp,
        currentScore: result.score,
        currentLevel: result.level,
        history: history
      };
      
      console.log(`[SecurityDetectionModule] Storing data with ${history.length} history entries`);
      await chrome.storage.local.set({ [key]: dataToStore });
      console.log(`[SecurityDetectionModule] Successfully stored result for tab ${tabId}`);
      
    } catch (error) {
      console.error('[SecurityDetectionModule] Error storing result:', error);
    }
  }

  /**
   * 獲取存儲的資料
   * @param {string} key
   * @returns {Promise<Object>}
   */
  async getStoredData(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || null);
      });
    });
  }

  /**
   * 清理標籤頁資料
   * @param {number} tabId
   */
  async cleanupTab(tabId) {
    try {
      const key = `${this.storagePrefix}tab_${tabId}`;
      await chrome.storage.local.remove([key]);
      this.detectionResults.delete(tabId);
    } catch (error) {
      console.error('[SecurityDetectionModule] Error cleaning up tab:', error);
    }
  }

  /**
   * 獲取所有安全檢測資料
   * @returns {Promise<Object>}
   */
  async getAllSecurityData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        const securityData = {};
        
        // 過濾出安全檢測相關的資料
        Object.keys(items).forEach(key => {
          if (key.startsWith(this.storagePrefix)) {
            securityData[key] = items[key];
          }
        });
        
        resolve(securityData);
      });
    });
  }

  /**
   * 檢查模組是否啟用
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * 啟用/停用模組
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[SecurityDetectionModule] Module ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecurityDetectionModule;
}

// 為了在 Service Worker 中使用，將其附加到全域對象
if (typeof self !== 'undefined') {
  self.SecurityDetectionModule = SecurityDetectionModule;
}
}
