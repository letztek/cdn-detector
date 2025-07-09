if (typeof CSPDetector === 'undefined') {
/**
 * CSPDetector - Content Security Policy 檢測器
 * 
 * 功能：
 * - 檢測 CSP header 存在性
 * - 分析 default-src 和 script-src 指令
 * - 實現 0-100 分的評分機制
 * - 可配置的評分權重
 * - 詳細的檢測日誌
 * 
 * @class CSPDetector
 */
class CSPDetector {
  constructor() {
    // CSP 評分配置
    this.scoringConfig = {
      weights: {
        headerPresence: 20,        // Header 存在性
        defaultSrc: 25,            // default-src 指令品質
        scriptSrc: 25,             // script-src 指令品質
        unsafeInline: -30,         // unsafe-inline 懲罰
        unsafeEval: -20,           // unsafe-eval 懲罰
        frameAncestors: 10,        // frame-ancestors 指令
        objectSrc: 10,             // object-src 指令
        baseUri: 5,                // base-uri 指令
        upgradeInsecureRequests: 5 // upgrade-insecure-requests 指令
      },
      
      // 各指令值的評分標準
      directiveScores: {
        'none': 100,
        'self': 80,
        'unsafe-inline': 0,
        'unsafe-eval': 0,
        'https:': 60,
        'http:': 20,
        '*': 0
      }
    };
    
    // 檢測結果快取
    this.detectionCache = new Map();
    
    // 統計資料
    this.stats = {
      totalChecks: 0,
      withCSP: 0,
      withoutCSP: 0,
      averageScore: 0,
      commonIssues: new Map()
    };
  }

  /**
   * 檢測 CSP Header - 主要入口點
   * @param {Map} headers - HTTP headers
   * @param {string} url - 請求 URL
   * @returns {Object} 檢測結果
   */
  detectCSP(headers, url) {
    try {
      this.stats.totalChecks++;
      
      // 檢查快取
      const cacheKey = this.generateCacheKey(headers, url);
      if (this.detectionCache.has(cacheKey)) {
        return this.detectionCache.get(cacheKey);
      }
      
      // 執行檢測
      const result = this.performCSPDetection(headers, url);
      
      // 更新統計資料
      this.updateStats(result);
      
      // 存入快取
      this.detectionCache.set(cacheKey, result);
      
      // 清理過期快取
      this.cleanupCache();
      
      return result;
      
    } catch (error) {
      console.error('[CSPDetector] Error in detectCSP:', error);
      return this.createErrorResult(error);
    }
  }

  /**
   * 執行 CSP 檢測
   * @param {Map} headers
   * @param {string} url
   * @returns {Object}
   */
  performCSPDetection(headers, url) {
    const timestamp = new Date().toISOString();
    
    // 1. 檢查 CSP header 存在性
    const cspHeader = this.extractCSPHeader(headers);
    
    if (!cspHeader.present) {
      this.stats.withoutCSP++;
      return {
        present: false,
        score: 0,
        level: 'critical',
        url: url,
        timestamp: timestamp,
        details: 'No CSP header found',
        recommendations: this.getNoCSPRecommendations()
      };
    }
    
    this.stats.withCSP++;
    
    // 2. 解析 CSP 指令
    const directives = this.parseCSPDirectives(cspHeader.value);
    
    // 3. 分析關鍵指令
    const analysis = this.analyzeDirectives(directives);
    
    // 4. 計算評分
    const score = this.calculateCSPScore(analysis);
    
    // 5. 生成建議
    const recommendations = this.generateRecommendations(analysis);
    
    // 6. 記錄問題
    this.recordIssues(analysis.issues);
    
    return {
      present: true,
      score: score,
      level: this.getSecurityLevel(score),
      url: url,
      timestamp: timestamp,
      header: {
        type: cspHeader.type,
        value: cspHeader.value,
        truncated: cspHeader.truncated
      },
      directives: {
        parsed: directives,
        count: Object.keys(directives).length,
        list: Object.keys(directives)
      },
      analysis: analysis,
      recommendations: recommendations,
      debug: {
        cacheKey: this.generateCacheKey(headers, url),
        processingTime: Date.now() - new Date(timestamp).getTime()
      }
    };
  }

  /**
   * 提取 CSP Header
   * @param {Map} headers
   * @returns {Object}
   */
  extractCSPHeader(headers) {
    const csp = headers.get('content-security-policy');
    const cspReportOnly = headers.get('content-security-policy-report-only');
    
    if (csp) {
      return {
        present: true,
        type: 'enforced',
        value: csp,
        truncated: csp.length > 1000
      };
    }
    
    if (cspReportOnly) {
      return {
        present: true,
        type: 'report-only',
        value: cspReportOnly,
        truncated: cspReportOnly.length > 1000
      };
    }
    
    return {
      present: false,
      type: null,
      value: null,
      truncated: false
    };
  }

  /**
   * 解析 CSP 指令
   * @param {string} csp
   * @returns {Object}
   */
  parseCSPDirectives(csp) {
    const directives = {};
    
    // 分割指令（以分號分隔）
    const parts = csp.split(';').map(part => part.trim()).filter(part => part);
    
    parts.forEach(part => {
      const tokens = part.split(/\s+/);
      if (tokens.length > 0) {
        const directive = tokens[0].toLowerCase();
        const values = tokens.slice(1);
        
        directives[directive] = {
          raw: part,
          values: values,
          normalizedValues: values.map(v => v.toLowerCase()),
          count: values.length
        };
      }
    });
    
    return directives;
  }

  /**
   * 分析指令
   * @param {Object} directives
   * @returns {Object}
   */
  analyzeDirectives(directives) {
    const analysis = {
      defaultSrc: this.analyzeDefaultSrc(directives),
      scriptSrc: this.analyzeScriptSrc(directives),
      styleSrc: this.analyzeStyleSrc(directives),
      objectSrc: this.analyzeObjectSrc(directives),
      frameAncestors: this.analyzeFrameAncestors(directives),
      baseUri: this.analyzeBaseUri(directives),
      upgradeInsecureRequests: this.analyzeUpgradeInsecureRequests(directives),
      issues: [],
      strengths: []
    };
    
    // 檢查危險配置
    this.checkDangerousConfigurations(directives, analysis);
    
    // 檢查缺失的重要指令
    this.checkMissingDirectives(directives, analysis);
    
    // 檢查最佳實踐
    this.checkBestPractices(directives, analysis);
    
    return analysis;
  }

  /**
   * 分析 default-src 指令
   * @param {Object} directives
   * @returns {Object}
   */
  analyzeDefaultSrc(directives) {
    const directive = directives['default-src'];
    
    if (!directive) {
      return {
        present: false,
        score: 0,
        issues: ['Missing default-src directive - fallback for all other directives'],
        recommendations: ['Add default-src directive to set fallback policy']
      };
    }
    
    const analysis = {
      present: true,
      values: directive.values,
      score: 0,
      issues: [],
      recommendations: []
    };
    
    // 評分邏輯
    if (directive.normalizedValues.includes("'none'")) {
      analysis.score = 100;
      analysis.strengths = ['Very strict - blocks all resources by default'];
    } else if (directive.normalizedValues.includes("'self'")) {
      analysis.score = 80;
      analysis.strengths = ['Good - only allows same-origin resources'];
    } else if (directive.normalizedValues.includes('https:')) {
      analysis.score = 60;
      analysis.strengths = ['Moderate - requires HTTPS'];
    } else if (directive.normalizedValues.includes('*')) {
      analysis.score = 0;
      analysis.issues.push('Wildcard (*) allows all origins - very permissive');
    }
    
    // 檢查不安全的值
    if (directive.normalizedValues.includes("'unsafe-inline'")) {
      analysis.score = Math.max(0, analysis.score - 30);
      analysis.issues.push('Contains unsafe-inline - allows inline scripts/styles');
    }
    
    if (directive.normalizedValues.includes("'unsafe-eval'")) {
      analysis.score = Math.max(0, analysis.score - 20);
      analysis.issues.push('Contains unsafe-eval - allows eval() function');
    }
    
    return analysis;
  }

  /**
   * 分析 script-src 指令
   * @param {Object} directives
   * @returns {Object}
   */
  analyzeScriptSrc(directives) {
    const directive = directives['script-src'];
    
    if (!directive) {
      return {
        present: false,
        score: 0,
        fallbackToDefault: true,
        note: 'Falls back to default-src directive'
      };
    }
    
    const analysis = {
      present: true,
      values: directive.values,
      score: 0,
      issues: [],
      recommendations: []
    };
    
    // 評分邏輯
    if (directive.normalizedValues.includes("'none'")) {
      analysis.score = 100;
      analysis.strengths = ['Excellent - blocks all scripts'];
    } else if (directive.normalizedValues.includes("'self'")) {
      analysis.score = 80;
      analysis.strengths = ['Good - only same-origin scripts'];
    } else if (directive.normalizedValues.some(v => v.startsWith('https:'))) {
      analysis.score = 60;
      analysis.strengths = ['Moderate - requires HTTPS'];
    }
    
    // 檢查不安全的值
    if (directive.normalizedValues.includes("'unsafe-inline'")) {
      analysis.score = Math.max(0, analysis.score - 40);
      analysis.issues.push('CRITICAL: unsafe-inline allows inline scripts - major XSS risk');
    }
    
    if (directive.normalizedValues.includes("'unsafe-eval'")) {
      analysis.score = Math.max(0, analysis.score - 30);
      analysis.issues.push('HIGH: unsafe-eval allows eval() - code injection risk');
    }
    
    // 檢查 nonce 或 hash 的使用
    const hasNonce = directive.normalizedValues.some(v => v.startsWith("'nonce-"));
    const hasHash = directive.normalizedValues.some(v => v.startsWith("'sha"));
    
    if (hasNonce || hasHash) {
      analysis.score = Math.min(100, analysis.score + 20);
      analysis.strengths = analysis.strengths || [];
      analysis.strengths.push('Uses nonce or hash - modern CSP approach');
    }
    
    return analysis;
  }

  /**
   * 分析其他指令（簡化版）
   */
  analyzeStyleSrc(directives) {
    const directive = directives['style-src'];
    return this.analyzeGenericDirective(directive, 'style-src');
  }

  analyzeObjectSrc(directives) {
    const directive = directives['object-src'];
    if (!directive) {
      return {
        present: false,
        score: 0,
        recommendation: 'Add object-src \'none\' to prevent plugin content'
      };
    }
    
    if (directive.normalizedValues.includes("'none'")) {
      return {
        present: true,
        score: 100,
        strength: 'Blocks all plugin content - excellent security'
      };
    }
    
    return this.analyzeGenericDirective(directive, 'object-src');
  }

  analyzeFrameAncestors(directives) {
    const directive = directives['frame-ancestors'];
    if (!directive) {
      return {
        present: false,
        score: 0,
        recommendation: 'Add frame-ancestors to prevent clickjacking'
      };
    }
    
    if (directive.normalizedValues.includes("'none'")) {
      return {
        present: true,
        score: 100,
        strength: 'Prevents all framing - excellent clickjacking protection'
      };
    }
    
    return this.analyzeGenericDirective(directive, 'frame-ancestors');
  }

  analyzeBaseUri(directives) {
    const directive = directives['base-uri'];
    return this.analyzeGenericDirective(directive, 'base-uri');
  }

  analyzeUpgradeInsecureRequests(directives) {
    const directive = directives['upgrade-insecure-requests'];
    return {
      present: !!directive,
      score: directive ? 20 : 0,
      strength: directive ? 'Automatically upgrades HTTP to HTTPS' : null
    };
  }

  /**
   * 通用指令分析
   * @param {Object} directive
   * @param {string} name
   * @returns {Object}
   */
  analyzeGenericDirective(directive, name) {
    if (!directive) {
      return {
        present: false,
        score: 0
      };
    }
    
    let score = 50; // 基礎分數
    
    if (directive.normalizedValues.includes("'none'")) {
      score = 100;
    } else if (directive.normalizedValues.includes("'self'")) {
      score = 80;
    } else if (directive.normalizedValues.includes('*')) {
      score = 0;
    }
    
    return {
      present: true,
      values: directive.values,
      score: score
    };
  }

  /**
   * 檢查危險配置
   * @param {Object} directives
   * @param {Object} analysis
   */
  checkDangerousConfigurations(directives, analysis) {
    // 檢查全域 unsafe-inline
    Object.keys(directives).forEach(key => {
      const directive = directives[key];
      if (directive.normalizedValues.includes("'unsafe-inline'")) {
        analysis.issues.push(`CRITICAL: ${key} contains unsafe-inline`);
      }
      if (directive.normalizedValues.includes("'unsafe-eval'")) {
        analysis.issues.push(`HIGH: ${key} contains unsafe-eval`);
      }
    });
  }

  /**
   * 檢查缺失的重要指令
   * @param {Object} directives
   * @param {Object} analysis
   */
  checkMissingDirectives(directives, analysis) {
    const importantDirectives = [
      'default-src',
      'script-src',
      'object-src',
      'frame-ancestors'
    ];
    
    importantDirectives.forEach(directive => {
      if (!directives[directive]) {
        analysis.issues.push(`Missing important directive: ${directive}`);
      }
    });
  }

  /**
   * 檢查最佳實踐
   * @param {Object} directives
   * @param {Object} analysis
   */
  checkBestPractices(directives, analysis) {
    // 檢查是否有 upgrade-insecure-requests
    if (!directives['upgrade-insecure-requests']) {
      analysis.recommendations = analysis.recommendations || [];
      analysis.recommendations.push('Consider adding upgrade-insecure-requests');
    }
    
    // 檢查 report-uri 或 report-to
    if (!directives['report-uri'] && !directives['report-to']) {
      analysis.recommendations = analysis.recommendations || [];
      analysis.recommendations.push('Consider adding report-uri for violation reporting');
    }
  }

  /**
   * 計算 CSP 總分
   * @param {Object} analysis
   * @returns {number}
   */
  calculateCSPScore(analysis) {
    let totalScore = 0;
    let totalWeight = 0;
    
    // Header 存在性
    totalScore += this.scoringConfig.weights.headerPresence;
    totalWeight += this.scoringConfig.weights.headerPresence;
    
    // default-src 權重
    if (analysis.defaultSrc.present) {
      totalScore += (analysis.defaultSrc.score / 100) * this.scoringConfig.weights.defaultSrc;
    }
    totalWeight += this.scoringConfig.weights.defaultSrc;
    
    // script-src 權重
    if (analysis.scriptSrc.present) {
      totalScore += (analysis.scriptSrc.score / 100) * this.scoringConfig.weights.scriptSrc;
    }
    totalWeight += this.scoringConfig.weights.scriptSrc;
    
    // 其他指令
    if (analysis.frameAncestors.present) {
      totalScore += (analysis.frameAncestors.score / 100) * this.scoringConfig.weights.frameAncestors;
    }
    totalWeight += this.scoringConfig.weights.frameAncestors;
    
    if (analysis.objectSrc.present) {
      totalScore += (analysis.objectSrc.score / 100) * this.scoringConfig.weights.objectSrc;
    }
    totalWeight += this.scoringConfig.weights.objectSrc;
    
    // 正規化分數
    const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
    
    return Math.round(Math.max(0, Math.min(100, normalizedScore)));
  }

  /**
   * 生成建議
   * @param {Object} analysis
   * @returns {Array}
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    
    // 收集所有分析中的建議
    Object.values(analysis).forEach(item => {
      if (item.recommendations) {
        recommendations.push(...item.recommendations);
      }
      if (item.recommendation) {
        recommendations.push(item.recommendation);
      }
    });
    
    // 基於問題生成建議
    if (analysis.issues.length > 0) {
      recommendations.push('Review and fix identified security issues');
    }
    
    return [...new Set(recommendations)]; // 去重
  }

  /**
   * 獲取安全等級
   * @param {number} score
   * @returns {string}
   */
  getSecurityLevel(score) {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
    if (score >= 30) return 'poor';
    return 'critical';
  }

  /**
   * 生成快取鍵
   * @param {Map} headers
   * @param {string} url
   * @returns {string}
   */
  generateCacheKey(headers, url) {
    const cspValue = headers.get('content-security-policy') || 
                     headers.get('content-security-policy-report-only') || 
                     'none';
    const domain = new URL(url).hostname;
    return `${domain}:${cspValue.substring(0, 100)}`;
  }

  /**
   * 清理過期快取
   */
  cleanupCache() {
    if (this.detectionCache.size > 1000) {
      // 清理最舊的一半條目
      const entries = Array.from(this.detectionCache.entries());
      const toDelete = entries.slice(0, Math.floor(entries.length / 2));
      toDelete.forEach(([key]) => this.detectionCache.delete(key));
    }
  }

  /**
   * 更新統計資料
   * @param {Object} result
   */
  updateStats(result) {
    if (result.present && result.score !== undefined) {
      this.stats.averageScore = (this.stats.averageScore * (this.stats.withCSP - 1) + result.score) / this.stats.withCSP;
    }
  }

  /**
   * 記錄問題
   * @param {Array} issues
   */
  recordIssues(issues) {
    issues.forEach(issue => {
      const count = this.stats.commonIssues.get(issue) || 0;
      this.stats.commonIssues.set(issue, count + 1);
    });
  }

  /**
   * 獲取沒有 CSP 的建議
   * @returns {Array}
   */
  getNoCSPRecommendations() {
    return [
      'Implement Content Security Policy to prevent XSS attacks',
      'Start with a restrictive policy and gradually relax as needed',
      'Use CSP report-only mode for testing before enforcement',
      'Consider using nonces or hashes for inline scripts/styles'
    ];
  }

  /**
   * 創建錯誤結果
   * @param {Error} error
   * @returns {Object}
   */
  createErrorResult(error) {
    return {
      present: false,
      score: 0,
      level: 'critical',
      error: true,
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 獲取統計資料
   * @returns {Object}
   */
  getStatistics() {
    return {
      ...this.stats,
      cacheSize: this.detectionCache.size,
      detectionRate: this.stats.totalChecks > 0 ? (this.stats.withCSP / this.stats.totalChecks * 100).toFixed(2) : 0,
      commonIssues: Object.fromEntries(this.stats.commonIssues)
    };
  }

  /**
   * 重置統計資料
   */
  resetStatistics() {
    this.stats = {
      totalChecks: 0,
      withCSP: 0,
      withoutCSP: 0,
      averageScore: 0,
      commonIssues: new Map()
    };
  }

  /**
   * 清理快取
   */
  clearCache() {
    this.detectionCache.clear();
  }
}

// 導出模組
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CSPDetector;
} else if (typeof window !== 'undefined') {
  window.CSPDetector = CSPDetector;
}
}