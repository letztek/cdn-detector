if (typeof FrameProtectionDetector === 'undefined') {
/**
 * FrameProtectionDetector - Frame Protection Headers 檢測器
 * 
 * 功能：
 * - 檢測 X-Frame-Options header
 * - 檢測 CSP frame-ancestors 指令
 * - 評估 Clickjacking 防護狀態
 * - 實現 0-100 分的評分機制
 * - 詳細的安全分析
 * 
 * @class FrameProtectionDetector
 */
class FrameProtectionDetector {
  constructor() {
    // Frame Protection 評分配置
    this.scoringConfig = {
      weights: {
        xFrameOptions: 60,        // X-Frame-Options header 權重
        frameAncestors: 50,       // CSP frame-ancestors 權重
        combination: 20           // 同時使用兩者的加分
      },
      
      // X-Frame-Options 值的評分
      xFrameOptionsScores: {
        'DENY': 100,              // 完全拒絕嵌入
        'SAMEORIGIN': 80,         // 只允許同源嵌入
        'ALLOW-FROM': 60          // 允許特定來源（已棄用）
      },
      
      // CSP frame-ancestors 值的評分
      frameAncestorsScores: {
        'none': 100,              // 完全拒絕嵌入
        'self': 85,               // 只允許同源嵌入
        'https:': 70,             // 只允許 HTTPS 來源
        'http:': 40,              // 允許 HTTP 來源（較不安全）
        '*': 0                    // 允許任何來源（無防護）
      }
    };
    
    // 檢測結果快取
    this.detectionCache = new Map();
    
    // 統計資料
    this.stats = {
      totalChecks: 0,
      withFrameProtection: 0,
      withoutFrameProtection: 0,
      xFrameOptionsOnly: 0,
      frameAncestorsOnly: 0,
      bothProtections: 0,
      averageScore: 0,
      commonIssues: new Map()
    };
  }

  /**
   * 檢測 Frame Protection Headers - 主要入口點
   * @param {Map} headers - HTTP headers
   * @param {string} url - 請求 URL
   * @returns {Object} 檢測結果
   */
  detectFrameProtection(headers, url) {
    try {
      this.stats.totalChecks++;
      
      // 檢查快取
      const cacheKey = this.generateCacheKey(headers, url);
      if (this.detectionCache.has(cacheKey)) {
        return this.detectionCache.get(cacheKey);
      }
      
      // 執行檢測
      const result = this.performFrameProtectionDetection(headers, url);
      
      // 更新統計資料
      this.updateStats(result);
      
      // 存入快取
      this.detectionCache.set(cacheKey, result);
      
      // 清理過期快取
      this.cleanupCache();
      
      return result;
      
    } catch (error) {
      console.error('[FrameProtectionDetector] Error in detectFrameProtection:', error);
      return this.createErrorResult(error);
    }
  }

  /**
   * 執行 Frame Protection 檢測
   * @param {Map} headers
   * @param {string} url
   * @returns {Object}
   */
  performFrameProtectionDetection(headers, url) {
    const timestamp = new Date().toISOString();
    
    // 1. 檢測 X-Frame-Options
    const xFrameOptions = this.analyzeXFrameOptions(headers);
    
    // 2. 檢測 CSP frame-ancestors
    const frameAncestors = this.analyzeFrameAncestors(headers);
    
    // 3. 綜合分析
    const analysis = this.performCombinedAnalysis(xFrameOptions, frameAncestors);
    
    // 4. 計算評分
    const score = this.calculateFrameProtectionScore(xFrameOptions, frameAncestors, analysis);
    
    // 5. 生成建議
    const recommendations = this.generateRecommendations(xFrameOptions, frameAncestors, analysis);
    
    // 6. 記錄問題
    this.recordIssues(analysis.issues);
    
    const hasProtection = xFrameOptions.present || frameAncestors.present;
    
    if (!hasProtection) {
      this.stats.withoutFrameProtection++;
    } else {
      this.stats.withFrameProtection++;
      
      if (xFrameOptions.present && frameAncestors.present) {
        this.stats.bothProtections++;
      } else if (xFrameOptions.present) {
        this.stats.xFrameOptionsOnly++;
      } else if (frameAncestors.present) {
        this.stats.frameAncestorsOnly++;
      }
    }

    return {
      present: hasProtection,
      score: score,
      level: this.getSecurityLevel(score),
      url: url,
      timestamp: timestamp,
      xFrameOptions: xFrameOptions,
      frameAncestors: frameAncestors,
      analysis: analysis,
      recommendations: recommendations,
      protection: {
        clickjacking: this.assessClickjackingProtection(score),
        coverage: this.assessProtectionCoverage(xFrameOptions, frameAncestors)
      },
      debug: {
        cacheKey: this.generateCacheKey(headers, url),
        processingTime: Date.now() - new Date(timestamp).getTime()
      }
    };
  }

  /**
   * 分析 X-Frame-Options Header
   * @param {Map} headers
   * @returns {Object}
   */
  analyzeXFrameOptions(headers) {
    const xFrameOptions = headers.get('x-frame-options');
    
    if (!xFrameOptions) {
      return {
        present: false,
        score: 0,
        value: null,
        issues: ['X-Frame-Options header not present'],
        recommendations: ['Add X-Frame-Options header for clickjacking protection']
      };
    }

    const value = xFrameOptions.trim().toUpperCase();
    const analysis = {
      present: true,
      value: value,
      originalValue: xFrameOptions,
      score: 0,
      issues: [],
      recommendations: [],
      strengths: []
    };

    // 評分和分析
    if (value === 'DENY') {
      analysis.score = 100;
      analysis.strengths.push('DENY provides maximum clickjacking protection');
      analysis.description = 'Prevents the page from being displayed in any frame';
    } else if (value === 'SAMEORIGIN') {
      analysis.score = 80;
      analysis.strengths.push('SAMEORIGIN allows framing by same origin only');
      analysis.description = 'Allows framing only by pages from the same origin';
    } else if (value.startsWith('ALLOW-FROM ')) {
      analysis.score = 60;
      analysis.issues.push('ALLOW-FROM is deprecated and not supported by all browsers');
      analysis.recommendations.push('Consider migrating to CSP frame-ancestors directive');
      analysis.description = 'Allows framing by specified origin (deprecated)';
      
      // 提取允許的來源
      const allowedOrigin = value.substring(11).trim();
      analysis.allowedOrigin = allowedOrigin;
      
      if (!allowedOrigin.startsWith('https://')) {
        analysis.score -= 20;
        analysis.issues.push('ALLOW-FROM uses non-HTTPS origin');
      }
    } else {
      analysis.score = 0;
      analysis.issues.push(`Invalid X-Frame-Options value: ${value}`);
      analysis.recommendations.push('Use valid X-Frame-Options value: DENY or SAMEORIGIN');
    }

    return analysis;
  }

  /**
   * 分析 CSP frame-ancestors 指令
   * @param {Map} headers
   * @returns {Object}
   */
  analyzeFrameAncestors(headers) {
    const csp = headers.get('content-security-policy') || 
                headers.get('content-security-policy-report-only');
    
    if (!csp) {
      return {
        present: false,
        score: 0,
        cspPresent: false,
        issues: ['No CSP header found'],
        recommendations: ['Consider implementing CSP with frame-ancestors directive']
      };
    }

    // 解析 CSP 指令
    const directives = this.parseCSPDirectives(csp);
    const frameAncestorsDirective = directives['frame-ancestors'];

    if (!frameAncestorsDirective) {
      return {
        present: false,
        score: 0,
        cspPresent: true,
        cspType: headers.get('content-security-policy') ? 'enforced' : 'report-only',
        issues: ['CSP present but no frame-ancestors directive'],
        recommendations: ['Add frame-ancestors directive to CSP for clickjacking protection']
      };
    }

    const analysis = {
      present: true,
      score: 0,
      cspPresent: true,
      cspType: headers.get('content-security-policy') ? 'enforced' : 'report-only',
      directive: frameAncestorsDirective,
      values: frameAncestorsDirective.values,
      issues: [],
      recommendations: [],
      strengths: []
    };

    // 評分邏輯
    if (frameAncestorsDirective.normalizedValues.includes("'none'")) {
      analysis.score = 100;
      analysis.strengths.push('frame-ancestors \'none\' provides maximum protection');
      analysis.description = 'Completely prevents framing from any source';
    } else if (frameAncestorsDirective.normalizedValues.includes("'self'")) {
      analysis.score = 85;
      analysis.strengths.push('frame-ancestors \'self\' allows same-origin framing only');
      analysis.description = 'Allows framing only from the same origin';
    } else {
      // 分析具體的來源
      let maxScore = 0;
      const origins = frameAncestorsDirective.normalizedValues.filter(v => 
        !v.startsWith("'") || v.startsWith("'sha") || v.startsWith("'nonce")
      );

      if (origins.length === 0) {
        // 只有關鍵字，沒有具體來源
        analysis.score = 50;
        analysis.description = 'Uses keywords for frame-ancestors control';
      } else {
        // 分析每個來源
        origins.forEach(origin => {
          if (origin.startsWith('https://')) {
            maxScore = Math.max(maxScore, 70);
          } else if (origin.startsWith('http://')) {
            maxScore = Math.max(maxScore, 40);
            analysis.issues.push(`HTTP origin in frame-ancestors: ${origin}`);
          } else if (origin === '*') {
            maxScore = 0;
            analysis.issues.push('Wildcard (*) in frame-ancestors allows any origin');
          } else if (origin.includes('*')) {
            maxScore = Math.max(maxScore, 30);
            analysis.issues.push(`Wildcard pattern in frame-ancestors: ${origin}`);
          }
        });
        
        analysis.score = maxScore;
        analysis.description = `Allows framing from ${origins.length} specified origin(s)`;
      }
    }

    // CSP Report-Only 降分
    if (analysis.cspType === 'report-only') {
      analysis.score = Math.round(analysis.score * 0.8);
      analysis.issues.push('CSP is in report-only mode, not enforced');
    }

    return analysis;
  }

  /**
   * 執行綜合分析
   * @param {Object} xFrameOptions
   * @param {Object} frameAncestors
   * @returns {Object}
   */
  performCombinedAnalysis(xFrameOptions, frameAncestors) {
    const analysis = {
      issues: [],
      recommendations: [],
      strengths: [],
      conflicts: [],
      coverage: 'none'
    };

    // 檢查保護覆蓋範圍
    if (!xFrameOptions.present && !frameAncestors.present) {
      analysis.coverage = 'none';
      analysis.issues.push('No frame protection headers present - vulnerable to clickjacking');
      analysis.recommendations.push('Implement either X-Frame-Options or CSP frame-ancestors');
    } else if (xFrameOptions.present && frameAncestors.present) {
      analysis.coverage = 'both';
      analysis.strengths.push('Both X-Frame-Options and CSP frame-ancestors present');
      
      // 檢查衝突
      this.checkForConflicts(xFrameOptions, frameAncestors, analysis);
    } else if (xFrameOptions.present) {
      analysis.coverage = 'x-frame-options-only';
      analysis.recommendations.push('Consider adding CSP frame-ancestors for modern browser support');
    } else if (frameAncestors.present) {
      analysis.coverage = 'frame-ancestors-only';
      analysis.recommendations.push('Consider adding X-Frame-Options for legacy browser support');
    }

    // 瀏覽器兼容性建議
    if (frameAncestors.present && !xFrameOptions.present) {
      analysis.recommendations.push('Add X-Frame-Options for IE support (CSP not fully supported)');
    }

    return analysis;
  }

  /**
   * 檢查 X-Frame-Options 和 frame-ancestors 之間的衝突
   * @param {Object} xFrameOptions
   * @param {Object} frameAncestors
   * @param {Object} analysis
   */
  checkForConflicts(xFrameOptions, frameAncestors, analysis) {
    const xfoValue = xFrameOptions.value;
    const faValues = frameAncestors.values || [];

    // DENY vs frame-ancestors
    if (xfoValue === 'DENY') {
      if (!faValues.includes("'none'")) {
        analysis.conflicts.push('X-Frame-Options DENY conflicts with frame-ancestors (not \'none\')');
      }
    }

    // SAMEORIGIN vs frame-ancestors
    if (xfoValue === 'SAMEORIGIN') {
      if (!faValues.includes("'self'") && !faValues.includes("'none'")) {
        analysis.conflicts.push('X-Frame-Options SAMEORIGIN conflicts with frame-ancestors values');
      }
    }

    // ALLOW-FROM vs frame-ancestors
    if (xfoValue && xfoValue.startsWith('ALLOW-FROM ')) {
      const allowedOrigin = xfoValue.substring(11).trim();
      if (!faValues.includes(allowedOrigin)) {
        analysis.conflicts.push('X-Frame-Options ALLOW-FROM origin not in frame-ancestors');
      }
    }
  }

  /**
   * 計算 Frame Protection 評分
   * @param {Object} xFrameOptions
   * @param {Object} frameAncestors
   * @param {Object} analysis
   * @returns {number}
   */
  calculateFrameProtectionScore(xFrameOptions, frameAncestors, analysis) {
    if (!xFrameOptions.present && !frameAncestors.present) {
      return 0;
    }

    let totalScore = 0;
    let totalWeight = 0;

    // X-Frame-Options 評分
    if (xFrameOptions.present) {
      totalScore += (xFrameOptions.score / 100) * this.scoringConfig.weights.xFrameOptions;
      totalWeight += this.scoringConfig.weights.xFrameOptions;
    }

    // CSP frame-ancestors 評分
    if (frameAncestors.present) {
      totalScore += (frameAncestors.score / 100) * this.scoringConfig.weights.frameAncestors;
      totalWeight += this.scoringConfig.weights.frameAncestors;
    }

    // 組合加分
    if (xFrameOptions.present && frameAncestors.present) {
      totalScore += this.scoringConfig.weights.combination;
      totalWeight += this.scoringConfig.weights.combination;
    }

    // 衝突懲罰
    if (analysis.conflicts.length > 0) {
      totalScore *= 0.8; // 20% 懲罰
    }

    // 正規化分數
    const normalizedScore = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
    
    return Math.round(Math.max(0, Math.min(100, normalizedScore)));
  }

  /**
   * 生成建議
   * @param {Object} xFrameOptions
   * @param {Object} frameAncestors
   * @param {Object} analysis
   * @returns {Array}
   */
  generateRecommendations(xFrameOptions, frameAncestors, analysis) {
    const recommendations = [];

    // 收集各項分析的建議
    if (xFrameOptions.recommendations) {
      recommendations.push(...xFrameOptions.recommendations);
    }
    if (frameAncestors.recommendations) {
      recommendations.push(...frameAncestors.recommendations);
    }
    if (analysis.recommendations) {
      recommendations.push(...analysis.recommendations);
    }

    // 基於分析狀況的額外建議
    if (analysis.conflicts.length > 0) {
      recommendations.push('Resolve conflicts between X-Frame-Options and CSP frame-ancestors');
    }

    if (analysis.coverage === 'none') {
      recommendations.push('URGENT: Implement clickjacking protection immediately');
      recommendations.push('Recommended: Start with X-Frame-Options: DENY or SAMEORIGIN');
    }

    // 最佳實踐建議
    if (analysis.coverage !== 'none') {
      recommendations.push('Test frame protection with browser developer tools');
      recommendations.push('Monitor for any legitimate framing requirements');
    }

    return [...new Set(recommendations)]; // 去重
  }

  /**
   * 評估 Clickjacking 防護等級
   * @param {number} score
   * @returns {Object}
   */
  assessClickjackingProtection(score) {
    if (score >= 90) {
      return {
        level: 'excellent',
        description: 'Excellent clickjacking protection',
        risk: 'very-low'
      };
    } else if (score >= 70) {
      return {
        level: 'good',
        description: 'Good clickjacking protection',
        risk: 'low'
      };
    } else if (score >= 50) {
      return {
        level: 'moderate',
        description: 'Moderate clickjacking protection',
        risk: 'medium'
      };
    } else if (score > 0) {
      return {
        level: 'weak',
        description: 'Weak clickjacking protection',
        risk: 'high'
      };
    } else {
      return {
        level: 'none',
        description: 'No clickjacking protection',
        risk: 'critical'
      };
    }
  }

  /**
   * 評估保護覆蓋範圍
   * @param {Object} xFrameOptions
   * @param {Object} frameAncestors
   * @returns {Object}
   */
  assessProtectionCoverage(xFrameOptions, frameAncestors) {
    return {
      xFrameOptions: xFrameOptions.present,
      frameAncestors: frameAncestors.present,
      modernBrowsers: frameAncestors.present ? 'excellent' : 'partial',
      legacyBrowsers: xFrameOptions.present ? 'good' : 'none',
      overall: this.calculateOverallCoverage(xFrameOptions, frameAncestors)
    };
  }

  /**
   * 計算整體覆蓋範圍
   * @param {Object} xFrameOptions
   * @param {Object} frameAncestors
   * @returns {string}
   */
  calculateOverallCoverage(xFrameOptions, frameAncestors) {
    if (xFrameOptions.present && frameAncestors.present) {
      return 'comprehensive';
    } else if (xFrameOptions.present || frameAncestors.present) {
      return 'partial';
    } else {
      return 'none';
    }
  }

  /**
   * 解析 CSP 指令
   * @param {string} csp
   * @returns {Object}
   */
  parseCSPDirectives(csp) {
    const directives = {};
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
    const xfo = headers.get('x-frame-options') || 'none';
    const csp = headers.get('content-security-policy') || 
                headers.get('content-security-policy-report-only') || 'none';
    const domain = new URL(url).hostname;
    
    // 提取 frame-ancestors 部分
    const frameAncestorsPart = csp.includes('frame-ancestors') ? 
      csp.substring(csp.indexOf('frame-ancestors'), csp.indexOf(';', csp.indexOf('frame-ancestors'))) : 
      'none';
    
    return `${domain}:xfo=${xfo.substring(0, 50)}:fa=${frameAncestorsPart.substring(0, 50)}`;
  }

  /**
   * 清理過期快取
   */
  cleanupCache() {
    if (this.detectionCache.size > 500) {
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
      this.stats.averageScore = (this.stats.averageScore * (this.stats.withFrameProtection - 1) + result.score) / this.stats.withFrameProtection;
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
      protectionRate: this.stats.totalChecks > 0 ? 
        (this.stats.withFrameProtection / this.stats.totalChecks * 100).toFixed(2) : 0,
      commonIssues: Object.fromEntries(this.stats.commonIssues)
    };
  }

  /**
   * 重置統計資料
   */
  resetStatistics() {
    this.stats = {
      totalChecks: 0,
      withFrameProtection: 0,
      withoutFrameProtection: 0,
      xFrameOptionsOnly: 0,
      frameAncestorsOnly: 0,
      bothProtections: 0,
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
  module.exports = FrameProtectionDetector;
} else if (typeof window !== 'undefined') {
  window.FrameProtectionDetector = FrameProtectionDetector;
}
}