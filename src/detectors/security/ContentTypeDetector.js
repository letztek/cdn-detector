if (typeof ContentTypeDetector === 'undefined') {
/**
 * ContentTypeDetector - X-Content-Type-Options 檢測器
 * 
 * 功能：
 * - 檢測 X-Content-Type-Options header 存在性
 * - 分析 nosniff 指令配置
 * - 實現 0-100 分的評分機制
 * - 評估 MIME 類型嗅探攻擊防護狀態
 * - 詳細的檢測日誌
 * 
 * @class ContentTypeDetector
 */
class ContentTypeDetector {
  constructor() {
    // Content-Type Options 評分配置
    this.scoringConfig = {
      weights: {
        headerPresence: 50,        // Header 存在性權重
        nosniffDirective: 40,      // nosniff 指令權重
        headerSyntax: 10           // Header 語法正確性權重
      },
      
      // 各指令值的評分標準
      directiveScores: {
        'nosniff': 100,            // 完整的 nosniff 指令
        'invalid': 0               // 無效的指令值
      }
    };
    
    // 檢測結果快取
    this.detectionCache = new Map();
    
    // 統計資料
    this.stats = {
      totalChecks: 0,
      withHeader: 0,
      withoutHeader: 0,
      withNosniff: 0,
      averageScore: 0,
      commonIssues: new Map()
    };
    
    // 常見問題類型
    this.issueTypes = {
      MISSING_HEADER: 'missing_header',
      INVALID_VALUE: 'invalid_value',
      SYNTAX_ERROR: 'syntax_error'
    };
    
    this.logger = {
      log: (message) => console.log(`[ContentTypeDetector] ${message}`),
      warn: (message) => console.warn(`[ContentTypeDetector] ${message}`),
      error: (message) => console.error(`[ContentTypeDetector] ${message}`)
    };
  }
  
  /**
   * 檢測 X-Content-Type-Options header
   * @param {Array} headers - HTTP 響應標頭數組
   * @param {string} url - 請求的 URL
   * @returns {Object} 檢測結果
   */
  detect(headers, url) {
    try {
      this.stats.totalChecks++;
      
      // 檢查快取
      const cacheKey = this.generateCacheKey(headers, url);
      if (this.detectionCache.has(cacheKey)) {
        return this.detectionCache.get(cacheKey);
      }
      
      // 查找 X-Content-Type-Options header
      const contentTypeHeader = this.findContentTypeHeader(headers);
      
      // 建立檢測結果
      const result = {
        detected: !!contentTypeHeader,
        header: contentTypeHeader,
        score: 0,
        level: 'poor',
        issues: [],
        details: {
          hasNosniff: false,
          headerValue: null,
          isValid: false,
          protection: 'none'
        },
        analysis: '',
        timestamp: Date.now(),
        url: url
      };
      
      if (contentTypeHeader) {
        this.stats.withHeader++;
        this.analyzeHeader(contentTypeHeader, result);
      } else {
        this.stats.withoutHeader++;
        this.handleMissingHeader(result);
      }
      
      // 計算最終評分
      this.calculateScore(result);
      
      // 生成分析報告
      this.generateAnalysis(result);
      
      // 更新統計
      this.updateStats(result);
      
      // 快取結果
      this.detectionCache.set(cacheKey, result);
      
      this.logger.log(`Content-Type Options detection completed for ${url}. Score: ${result.score}`);
      
      return result;
      
    } catch (error) {
      this.logger.error(`Detection failed for ${url}: ${error.message}`);
      return this.createErrorResult(url, error);
    }
  }
  
  /**
   * 查找 X-Content-Type-Options header
   * @param {Array} headers - HTTP 響應標頭數組
   * @returns {Object|null} 找到的 header 或 null
   */
  findContentTypeHeader(headers) {
    if (!Array.isArray(headers)) {
      return null;
    }
    
    return headers.find(header => 
      header && 
      header.name && 
      header.name.toLowerCase() === 'x-content-type-options'
    );
  }
  
  /**
   * 分析 X-Content-Type-Options header
   * @param {Object} header - Header 物件
   * @param {Object} result - 檢測結果物件
   */
  analyzeHeader(header, result) {
    const value = header.value ? header.value.trim().toLowerCase() : '';
    
    result.details.headerValue = header.value;
    result.detected = true;
    
    if (value === 'nosniff') {
      result.details.hasNosniff = true;
      result.details.isValid = true;
      result.details.protection = 'full';
      this.stats.withNosniff++;
    } else if (value === '') {
      result.issues.push({
        type: this.issueTypes.SYNTAX_ERROR,
        message: 'X-Content-Type-Options header 有空值',
        severity: 'high'
      });
      result.details.protection = 'none';
    } else {
      result.issues.push({
        type: this.issueTypes.INVALID_VALUE,
        message: `無效的 X-Content-Type-Options 值: ${header.value}`,
        severity: 'medium'
      });
      result.details.protection = 'partial';
    }
  }
  
  /**
   * 處理缺少 header 的情況
   * @param {Object} result - 檢測結果物件
   */
  handleMissingHeader(result) {
    result.issues.push({
      type: this.issueTypes.MISSING_HEADER,
      message: '缺少 X-Content-Type-Options header',
      severity: 'high'
    });
    result.details.protection = 'none';
  }
  
  /**
   * 計算安全評分
   * @param {Object} result - 檢測結果物件
   */
  calculateScore(result) {
    let score = 0;
    const weights = this.scoringConfig.weights;
    
    // Header 存在性評分
    if (result.detected) {
      score += weights.headerPresence;
    }
    
    // nosniff 指令評分
    if (result.details.hasNosniff) {
      score += weights.nosniffDirective;
    }
    
    // Header 語法正確性評分
    if (result.details.isValid) {
      score += weights.headerSyntax;
    }
    
    // 確保評分在 0-100 範圍內
    result.score = Math.max(0, Math.min(100, score));
    
    // 計算安全等級
    if (result.score >= 90) {
      result.level = 'excellent';
    } else if (result.score >= 70) {
      result.level = 'good';
    } else if (result.score >= 50) {
      result.level = 'average';
    } else if (result.score >= 30) {
      result.level = 'poor';
    } else {
      result.level = 'dangerous';
    }
  }
  
  /**
   * 生成分析報告
   * @param {Object} result - 檢測結果物件
   */
  generateAnalysis(result) {
    const analyses = [];
    
    if (result.detected) {
      if (result.details.hasNosniff) {
        analyses.push('✓ 已正確設定 nosniff 指令，可防止 MIME 類型嗅探攻擊');
      } else {
        analyses.push('⚠ X-Content-Type-Options header 值無效或不完整');
      }
    } else {
      analyses.push('✗ 缺少 X-Content-Type-Options header，容易受到 MIME 類型嗅探攻擊');
    }
    
    // 根據保護等級提供建議
    switch (result.details.protection) {
      case 'full':
        analyses.push('🛡️ 完整的 MIME 類型嗅探防護');
        break;
      case 'partial':
        analyses.push('⚠️ 部分防護，建議檢查 header 配置');
        break;
      case 'none':
        analyses.push('⚠️ 無防護，建議新增 X-Content-Type-Options: nosniff');
        break;
    }
    
    result.analysis = analyses.join('\n');
  }
  
  /**
   * 更新統計資料
   * @param {Object} result - 檢測結果物件
   */
  updateStats(result) {
    // 更新平均分數
    this.stats.averageScore = (this.stats.averageScore * (this.stats.totalChecks - 1) + result.score) / this.stats.totalChecks;
    
    // 統計常見問題
    result.issues.forEach(issue => {
      const count = this.stats.commonIssues.get(issue.type) || 0;
      this.stats.commonIssues.set(issue.type, count + 1);
    });
  }
  
  /**
   * 生成快取鍵
   * @param {Array} headers - HTTP 響應標頭數組
   * @param {string} url - 請求的 URL
   * @returns {string} 快取鍵
   */
  generateCacheKey(headers, url) {
    const contentTypeHeader = this.findContentTypeHeader(headers);
    const headerValue = contentTypeHeader ? contentTypeHeader.value : 'none';
    return `${url}:${headerValue}`;
  }
  
  /**
   * 建立錯誤結果
   * @param {string} url - 請求的 URL
   * @param {Error} error - 錯誤物件
   * @returns {Object} 錯誤結果物件
   */
  createErrorResult(url, error) {
    return {
      detected: false,
      header: null,
      score: 0,
      level: 'error',
      issues: [{
        type: 'detection_error',
        message: `檢測失敗: ${error.message}`,
        severity: 'critical'
      }],
      details: {
        hasNosniff: false,
        headerValue: null,
        isValid: false,
        protection: 'unknown'
      },
      analysis: `檢測過程中發生錯誤: ${error.message}`,
      timestamp: Date.now(),
      url: url,
      error: true
    };
  }
  
  /**
   * 獲取統計資料
   * @returns {Object} 統計資料物件
   */
  getStats() {
    return {
      ...this.stats,
      commonIssues: Object.fromEntries(this.stats.commonIssues)
    };
  }
  
  /**
   * 清除快取
   */
  clearCache() {
    this.detectionCache.clear();
    this.logger.log('Detection cache cleared');
  }
  
  /**
   * 重置統計資料
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      withHeader: 0,
      withoutHeader: 0,
      withNosniff: 0,
      averageScore: 0,
      commonIssues: new Map()
    };
    this.logger.log('Statistics reset');
  }
}

// 全域匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentTypeDetector;
} else if (typeof window !== 'undefined') {
  window.ContentTypeDetector = ContentTypeDetector;
}

} // End of typeof check