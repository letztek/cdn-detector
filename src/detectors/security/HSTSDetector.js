if (typeof HSTSDetector === 'undefined') {
/**
 * HSTSDetector - Strict-Transport-Security 檢測器
 * 
 * 功能：
 * - 檢測 Strict-Transport-Security header 存在性
 * - 分析 max-age、includeSubDomains 和 preload 指令
 * - 實現 0-100 分的評分機制
 * - 評估 HSTS 配置強度和安全性
 * - 詳細的檢測日誌和建議
 * 
 * @class HSTSDetector
 */
class HSTSDetector {
  constructor() {
    // HSTS 評分配置
    this.scoringConfig = {
      weights: {
        headerPresence: 30,        // Header 存在性權重
        maxAge: 40,                // max-age 值權重
        includeSubDomains: 15,     // includeSubDomains 指令權重
        preload: 15                // preload 指令權重
      },
      
      // max-age 評分標準（秒）
      maxAgeScores: {
        excellent: 31536000,       // 1 年以上 (365 天)
        good: 15768000,            // 6 個月以上 (182.5 天)
        average: 2592000,          // 1 個月以上 (30 天)
        poor: 86400,               // 1 天以上
        dangerous: 0               // 小於 1 天
      },
      
      // 最小推薦值
      minimumRecommended: {
        maxAge: 31536000,          // 1 年
        includeSubDomains: true,   // 建議啟用
        preload: false             // 可選，但建議啟用
      }
    };
    
    // 檢測結果快取
    this.detectionCache = new Map();
    
    // 統計資料
    this.stats = {
      totalChecks: 0,
      withHSTS: 0,
      withoutHSTS: 0,
      withIncludeSubDomains: 0,
      withPreload: 0,
      averageScore: 0,
      averageMaxAge: 0,
      commonIssues: new Map()
    };
    
    // 常見問題類型
    this.issueTypes = {
      MISSING_HEADER: 'missing_header',
      SHORT_MAX_AGE: 'short_max_age',
      MISSING_INCLUDE_SUBDOMAINS: 'missing_include_subdomains',
      MISSING_PRELOAD: 'missing_preload',
      INVALID_SYNTAX: 'invalid_syntax',
      INVALID_MAX_AGE: 'invalid_max_age'
    };
    
    this.logger = {
      log: (message) => console.log(`[HSTSDetector] ${message}`),
      warn: (message) => console.warn(`[HSTSDetector] ${message}`),
      error: (message) => console.error(`[HSTSDetector] ${message}`)
    };
  }
  
  /**
   * 檢測 Strict-Transport-Security header
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
      
      // 查找 Strict-Transport-Security header
      const hstsHeader = this.findHSTSHeader(headers);
      
      // 建立檢測結果
      const result = {
        detected: !!hstsHeader,
        header: hstsHeader,
        score: 0,
        level: 'poor',
        issues: [],
        directives: {
          maxAge: null,
          includeSubDomains: false,
          preload: false
        },
        details: {
          headerValue: null,
          maxAgeSeconds: 0,
          maxAgeDays: 0,
          isValid: false,
          strength: 'none'
        },
        analysis: '',
        recommendations: [],
        timestamp: Date.now(),
        url: url
      };
      
      if (hstsHeader) {
        this.stats.withHSTS++;
        this.analyzeHSTSHeader(hstsHeader, result);
      } else {
        this.stats.withoutHSTS++;
        this.handleMissingHeader(result);
      }
      
      // 計算最終評分
      this.calculateScore(result);
      
      // 生成分析和建議
      this.generateAnalysis(result);
      this.generateRecommendations(result);
      
      // 更新統計
      this.updateStats(result);
      
      // 快取結果
      this.detectionCache.set(cacheKey, result);
      
      this.logger.log(`HSTS detection completed for ${url}. Score: ${result.score}`);
      
      return result;
      
    } catch (error) {
      this.logger.error(`Detection failed for ${url}: ${error.message}`);
      return this.createErrorResult(url, error);
    }
  }
  
  /**
   * 查找 Strict-Transport-Security header
   * @param {Array} headers - HTTP 響應標頭數組
   * @returns {Object|null} 找到的 header 或 null
   */
  findHSTSHeader(headers) {
    if (!Array.isArray(headers)) {
      return null;
    }
    
    return headers.find(header => 
      header && 
      header.name && 
      header.name.toLowerCase() === 'strict-transport-security'
    );
  }
  
  /**
   * 分析 HSTS header
   * @param {Object} header - Header 物件
   * @param {Object} result - 檢測結果物件
   */
  analyzeHSTSHeader(header, result) {
    const value = header.value ? header.value.trim() : '';
    
    result.details.headerValue = header.value;
    result.detected = true;
    
    if (!value) {
      result.issues.push({
        type: this.issueTypes.INVALID_SYNTAX,
        message: 'HSTS header 有空值',
        severity: 'high'
      });
      return;
    }
    
    // 解析指令
    const directives = this.parseDirectives(value);
    
    // 處理 max-age
    if (directives.maxAge !== null) {
      result.directives.maxAge = directives.maxAge;
      result.details.maxAgeSeconds = directives.maxAge;
      result.details.maxAgeDays = Math.round(directives.maxAge / 86400);
      
      // 檢查 max-age 是否合理
      if (directives.maxAge < this.scoringConfig.maxAgeScores.poor) {
        result.issues.push({
          type: this.issueTypes.SHORT_MAX_AGE,
          message: `max-age 值過短: ${directives.maxAge} 秒 (${result.details.maxAgeDays} 天)`,
          severity: 'medium'
        });
      }
    } else {
      result.issues.push({
        type: this.issueTypes.INVALID_MAX_AGE,
        message: 'max-age 指令缺失或無效',
        severity: 'high'
      });
    }
    
    // 處理 includeSubDomains
    if (directives.includeSubDomains) {
      result.directives.includeSubDomains = true;
      this.stats.withIncludeSubDomains++;
    } else {
      result.issues.push({
        type: this.issueTypes.MISSING_INCLUDE_SUBDOMAINS,
        message: '缺少 includeSubDomains 指令',
        severity: 'low'
      });
    }
    
    // 處理 preload
    if (directives.preload) {
      result.directives.preload = true;
      this.stats.withPreload++;
    } else {
      result.issues.push({
        type: this.issueTypes.MISSING_PRELOAD,
        message: '缺少 preload 指令',
        severity: 'low'
      });
    }
    
    // 設置驗證狀態
    result.details.isValid = directives.maxAge !== null && directives.maxAge > 0;
    
    // 計算強度等級
    result.details.strength = this.calculateStrength(result.directives, result.details.maxAgeSeconds);
  }
  
  /**
   * 解析 HSTS 指令
   * @param {string} value - Header 值
   * @returns {Object} 解析結果
   */
  parseDirectives(value) {
    const directives = {
      maxAge: null,
      includeSubDomains: false,
      preload: false
    };
    
    // 分割指令
    const parts = value.split(';').map(part => part.trim());
    
    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      
      if (lowerPart.startsWith('max-age=')) {
        const maxAgeStr = part.substring(8).trim();
        const maxAgeNum = parseInt(maxAgeStr, 10);
        
        if (!isNaN(maxAgeNum) && maxAgeNum >= 0) {
          directives.maxAge = maxAgeNum;
        }
      } else if (lowerPart === 'includesubdomains') {
        directives.includeSubDomains = true;
      } else if (lowerPart === 'preload') {
        directives.preload = true;
      }
    }
    
    return directives;
  }
  
  /**
   * 計算 HSTS 配置強度
   * @param {Object} directives - 解析的指令
   * @param {number} maxAgeSeconds - max-age 值（秒）
   * @returns {string} 強度等級
   */
  calculateStrength(directives, maxAgeSeconds) {
    if (!directives.maxAge || maxAgeSeconds <= 0) {
      return 'none';
    }
    
    const scores = this.scoringConfig.maxAgeScores;
    
    if (maxAgeSeconds >= scores.excellent && directives.includeSubDomains && directives.preload) {
      return 'excellent';
    } else if (maxAgeSeconds >= scores.good && directives.includeSubDomains) {
      return 'good';
    } else if (maxAgeSeconds >= scores.average) {
      return 'average';
    } else if (maxAgeSeconds >= scores.poor) {
      return 'poor';
    } else {
      return 'weak';
    }
  }
  
  /**
   * 處理缺少 header 的情況
   * @param {Object} result - 檢測結果物件
   */
  handleMissingHeader(result) {
    result.issues.push({
      type: this.issueTypes.MISSING_HEADER,
      message: '缺少 Strict-Transport-Security header',
      severity: 'high'
    });
    result.details.strength = 'none';
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
    
    // max-age 評分
    if (result.directives.maxAge !== null && result.details.maxAgeSeconds > 0) {
      const maxAgeScore = this.calculateMaxAgeScore(result.details.maxAgeSeconds);
      score += (maxAgeScore / 100) * weights.maxAge;
    }
    
    // includeSubDomains 評分
    if (result.directives.includeSubDomains) {
      score += weights.includeSubDomains;
    }
    
    // preload 評分
    if (result.directives.preload) {
      score += weights.preload;
    }
    
    // 確保評分在 0-100 範圍內
    result.score = Math.max(0, Math.min(100, Math.round(score)));
    
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
   * 計算 max-age 評分
   * @param {number} maxAgeSeconds - max-age 值（秒）
   * @returns {number} 評分（0-100）
   */
  calculateMaxAgeScore(maxAgeSeconds) {
    const scores = this.scoringConfig.maxAgeScores;
    
    if (maxAgeSeconds >= scores.excellent) {
      return 100;
    } else if (maxAgeSeconds >= scores.good) {
      return 80;
    } else if (maxAgeSeconds >= scores.average) {
      return 60;
    } else if (maxAgeSeconds >= scores.poor) {
      return 40;
    } else {
      return 20;
    }
  }
  
  /**
   * 生成分析報告
   * @param {Object} result - 檢測結果物件
   */
  generateAnalysis(result) {
    const analyses = [];
    
    if (result.detected) {
      analyses.push(`✓ 檢測到 HSTS header，配置強度: ${result.details.strength}`);
      
      if (result.directives.maxAge !== null) {
        analyses.push(`max-age: ${result.details.maxAgeSeconds} 秒 (${result.details.maxAgeDays} 天)`);
      }
      
      if (result.directives.includeSubDomains) {
        analyses.push('✓ 包含 includeSubDomains 指令');
      }
      
      if (result.directives.preload) {
        analyses.push('✓ 包含 preload 指令');
      }
    } else {
      analyses.push('✗ 未檢測到 HSTS header');
    }
    
    // 根據強度等級提供總結
    switch (result.details.strength) {
      case 'excellent':
        analyses.push('🛡️ 優秀的 HSTS 配置，提供最佳保護');
        break;
      case 'good':
        analyses.push('🔒 良好的 HSTS 配置，提供強力保護');
        break;
      case 'average':
        analyses.push('⚠️ 基本的 HSTS 配置，可以改進');
        break;
      case 'poor':
      case 'weak':
        analyses.push('⚠️ 弱的 HSTS 配置，需要改進');
        break;
      case 'none':
        analyses.push('❌ 無 HSTS 保護，建議添加');
        break;
    }
    
    result.analysis = analyses.join('\n');
  }
  
  /**
   * 生成改進建議
   * @param {Object} result - 檢測結果物件
   */
  generateRecommendations(result) {
    const recommendations = [];
    
    if (!result.detected) {
      recommendations.push('添加 Strict-Transport-Security header');
      recommendations.push('設置 max-age 為至少 31536000 秒（1年）');
      recommendations.push('考慮添加 includeSubDomains 指令');
      recommendations.push('考慮添加 preload 指令並提交到 HSTS preload list');
    } else {
      if (result.details.maxAgeSeconds < this.scoringConfig.minimumRecommended.maxAge) {
        recommendations.push(`增加 max-age 值至少為 ${this.scoringConfig.minimumRecommended.maxAge} 秒`);
      }
      
      if (!result.directives.includeSubDomains) {
        recommendations.push('添加 includeSubDomains 指令以保護子域名');
      }
      
      if (!result.directives.preload) {
        recommendations.push('考慮添加 preload 指令並提交到 HSTS preload list');
      }
    }
    
    result.recommendations = recommendations;
  }
  
  /**
   * 更新統計資料
   * @param {Object} result - 檢測結果物件
   */
  updateStats(result) {
    // 更新平均分數
    this.stats.averageScore = (this.stats.averageScore * (this.stats.totalChecks - 1) + result.score) / this.stats.totalChecks;
    
    // 更新平均 max-age
    if (result.details.maxAgeSeconds > 0) {
      this.stats.averageMaxAge = (this.stats.averageMaxAge * (this.stats.withHSTS - 1) + result.details.maxAgeSeconds) / this.stats.withHSTS;
    }
    
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
    const hstsHeader = this.findHSTSHeader(headers);
    const headerValue = hstsHeader ? hstsHeader.value : 'none';
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
      directives: {
        maxAge: null,
        includeSubDomains: false,
        preload: false
      },
      details: {
        headerValue: null,
        maxAgeSeconds: 0,
        maxAgeDays: 0,
        isValid: false,
        strength: 'unknown'
      },
      analysis: `檢測過程中發生錯誤: ${error.message}`,
      recommendations: ['請檢查網絡連接和 header 格式'],
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
      commonIssues: Object.fromEntries(this.stats.commonIssues),
      averageMaxAgeDays: Math.round(this.stats.averageMaxAge / 86400)
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
      withHSTS: 0,
      withoutHSTS: 0,
      withIncludeSubDomains: 0,
      withPreload: 0,
      averageScore: 0,
      averageMaxAge: 0,
      commonIssues: new Map()
    };
    this.logger.log('Statistics reset');
  }
  
  /**
   * 格式化時間期間
   * @param {number} seconds - 秒數
   * @returns {string} 格式化的時間字符串
   */
  static formatDuration(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days} 天 ${hours} 小時`;
    } else if (hours > 0) {
      return `${hours} 小時 ${minutes} 分鐘`;
    } else {
      return `${minutes} 分鐘`;
    }
  }
}

// 全域匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HSTSDetector;
} else if (typeof window !== 'undefined') {
  window.HSTSDetector = HSTSDetector;
}

} // End of typeof check