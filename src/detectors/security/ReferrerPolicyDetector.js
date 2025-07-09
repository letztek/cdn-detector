if (typeof ReferrerPolicyDetector === 'undefined') {
/**
 * ReferrerPolicyDetector - Referrer-Policy 安全 Header 檢測器
 * 
 * 功能：
 * - 檢測 Referrer-Policy header 是否存在
 * - 分析隱私保護等級和策略配置
 * - 提供詳細的安全評分和建議
 * 
 * 支援的 Referrer Policy 值：
 * - no-referrer: 完全不發送 referrer 資訊
 * - no-referrer-when-downgrade: HTTPS->HTTP 時不發送
 * - same-origin: 僅同源請求發送
 * - origin: 僅發送 origin 部分
 * - strict-origin: 嚴格的 origin-only，HTTPS->HTTP 時不發送
 * - origin-when-cross-origin: 跨域時僅發送 origin
 * - strict-origin-when-cross-origin: 預設值，平衡安全與功能
 * - unsafe-url: 總是發送完整 URL（不安全）
 */
class ReferrerPolicyDetector {
  constructor() {
    // 策略配置定義
    this.policyConfigs = {
      'no-referrer': {
        level: 'excellent',
        score: 100,
        description: '完全不發送 referrer 資訊，最高隱私保護',
        security: 'maximum',
        privacy: 'maximum',
        compatibility: 'may-break-features'
      },
      'same-origin': {
        level: 'excellent',
        score: 95,
        description: '僅同源請求發送 referrer，優秀的隱私保護',
        security: 'high',
        privacy: 'high', 
        compatibility: 'good'
      },
      'strict-origin': {
        level: 'good',
        score: 85,
        description: '僅發送 origin，HTTPS 降級時不發送',
        security: 'good',
        privacy: 'good',
        compatibility: 'excellent'
      },
      'strict-origin-when-cross-origin': {
        level: 'good',
        score: 80,
        description: '預設策略，跨域時僅發送 origin',
        security: 'good',
        privacy: 'moderate',
        compatibility: 'excellent'
      },
      'origin-when-cross-origin': {
        level: 'moderate',
        score: 70,
        description: '跨域時僅發送 origin，同域發送完整 URL',
        security: 'moderate',
        privacy: 'moderate',
        compatibility: 'excellent'
      },
      'origin': {
        level: 'moderate', 
        score: 65,
        description: '總是僅發送 origin 部分',
        security: 'moderate',
        privacy: 'moderate',
        compatibility: 'good'
      },
      'no-referrer-when-downgrade': {
        level: 'poor',
        score: 45,
        description: '僅 HTTPS 降級時不發送，保護有限',
        security: 'low',
        privacy: 'low',
        compatibility: 'excellent'
      },
      'unsafe-url': {
        level: 'poor',
        score: 20,
        description: '總是發送完整 URL，隱私風險高',
        security: 'very-low',
        privacy: 'very-low',
        compatibility: 'excellent'
      }
    };

    // 評分權重配置
    this.scoringConfig = {
      weights: {
        headerPresence: 30,     // Header 存在性
        policyStrength: 50,     // 策略強度
        multipleValues: 10,     // 多重值支援
        headerSyntax: 10        // Header 語法正確性
      }
    };

    // 結果快取
    this.cache = new Map();
    this.cacheTimeout = 300000; // 5分鐘快取
  }

  /**
   * 檢測 Referrer-Policy header
   * @param {Object} headers - HTTP headers 物件
   * @param {string} url - 檢測的 URL
   * @returns {Object} 檢測結果
   */
  detect(headers, url) {
    const cacheKey = this.generateCacheKey(headers, url);
    
    // 檢查快取
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.result;
      }
      this.cache.delete(cacheKey);
    }

    const result = this.analyzeReferrerPolicy(headers, url);
    
    // 快取結果
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    return result;
  }

  /**
   * 分析 Referrer-Policy header
   * @param {Object} headers - HTTP headers
   * @param {string} url - URL
   * @returns {Object} 分析結果
   */
  analyzeReferrerPolicy(headers, url) {
    const analysis = {
      detected: false,
      header: null,
      policies: [],
      level: 'missing',
      score: 0,
      details: {
        headerValue: null,
        parsedPolicies: [],
        effectivePolicy: null,
        recommendations: [],
        securityImplications: [],
        privacyImpact: 'unknown'
      },
      timestamp: Date.now()
    };

    try {
      // 尋找 Referrer-Policy header（不區分大小寫）
      const headerKey = this.findReferrerPolicyHeader(headers);
      
      if (!headerKey) {
        analysis.details.recommendations.push({
          type: 'missing-header',
          message: '建議添加 Referrer-Policy header 以控制 referrer 資訊洩露',
          suggestion: 'Referrer-Policy: strict-origin-when-cross-origin'
        });
        return analysis;
      }

      const headerValue = headers[headerKey];
      analysis.detected = true;
      analysis.header = headerKey;
      analysis.details.headerValue = headerValue;

      // 解析策略值
      const parsedPolicies = this.parseReferrerPolicies(headerValue);
      analysis.details.parsedPolicies = parsedPolicies;

      if (parsedPolicies.length === 0) {
        analysis.level = 'invalid';
        analysis.details.recommendations.push({
          type: 'invalid-syntax',
          message: 'Referrer-Policy header 語法無效',
          suggestion: '請使用有效的策略值，如 strict-origin-when-cross-origin'
        });
        return analysis;
      }

      // 確定有效策略（瀏覽器會使用最後一個有效策略）
      const effectivePolicy = this.determineEffectivePolicy(parsedPolicies);
      analysis.details.effectivePolicy = effectivePolicy;
      analysis.policies = parsedPolicies;

      if (effectivePolicy && this.policyConfigs[effectivePolicy]) {
        const config = this.policyConfigs[effectivePolicy];
        analysis.level = config.level;
        analysis.details.privacyImpact = config.privacy;
        
        // 計算評分
        analysis.score = this.calculateScore(parsedPolicies, effectivePolicy, headerValue);
        
        // 生成建議和安全影響分析
        this.generateRecommendations(analysis, effectivePolicy, parsedPolicies);
        this.analyzeSecurityImplications(analysis, effectivePolicy);
      }

    } catch (error) {
      console.error('[ReferrerPolicyDetector] Analysis error:', error);
      analysis.details.error = error.message;
    }

    return analysis;
  }

  /**
   * 尋找 Referrer-Policy header
   * @param {Object} headers - HTTP headers
   * @returns {string|null} Header 鍵名
   */
  findReferrerPolicyHeader(headers) {
    const possibleHeaders = [
      'referrer-policy',
      'Referrer-Policy',
      'REFERRER-POLICY'
    ];

    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'referrer-policy') {
        return key;
      }
    }

    return null;
  }

  /**
   * 解析 Referrer-Policy 值
   * @param {string} headerValue - Header 值
   * @returns {Array} 解析後的策略陣列
   */
  parseReferrerPolicies(headerValue) {
    if (!headerValue || typeof headerValue !== 'string') {
      return [];
    }

    // 清理並分割策略值
    const policies = headerValue
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .split(/[,\s]+/)
      .filter(policy => policy.length > 0);

    // 驗證策略值
    const validPolicies = policies.filter(policy => 
      this.policyConfigs.hasOwnProperty(policy)
    );

    return validPolicies;
  }

  /**
   * 確定有效策略
   * @param {Array} policies - 策略陣列
   * @returns {string|null} 有效策略
   */
  determineEffectivePolicy(policies) {
    if (policies.length === 0) return null;
    
    // 瀏覽器通常使用最後一個有效策略
    return policies[policies.length - 1];
  }

  /**
   * 計算安全評分
   * @param {Array} policies - 策略陣列
   * @param {string} effectivePolicy - 有效策略
   * @param {string} headerValue - 原始 header 值
   * @returns {number} 評分 (0-100)
   */
  calculateScore(policies, effectivePolicy, headerValue) {
    let score = 0;
    const weights = this.scoringConfig.weights;

    // 1. Header 存在性評分
    score += weights.headerPresence;

    // 2. 策略強度評分
    if (effectivePolicy && this.policyConfigs[effectivePolicy]) {
      const policyScore = this.policyConfigs[effectivePolicy].score;
      score += (weights.policyStrength * policyScore) / 100;
    }

    // 3. 多重值支援評分（如果有多個有效策略，會有額外分數）
    if (policies.length > 1) {
      score += weights.multipleValues * 0.5; // 部分分數
    }

    // 4. Header 語法正確性評分
    const syntaxScore = this.evaluateHeaderSyntax(headerValue, policies);
    score += weights.headerSyntax * syntaxScore;

    return Math.min(Math.round(score), 100);
  }

  /**
   * 評估 header 語法正確性
   * @param {string} headerValue - 原始值
   * @param {Array} validPolicies - 有效策略
   * @returns {number} 語法評分 (0-1)
   */
  evaluateHeaderSyntax(headerValue, validPolicies) {
    if (!headerValue) return 0;

    const allPolicies = headerValue
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .split(/[,\s]+/)
      .filter(policy => policy.length > 0);

    if (allPolicies.length === 0) return 0;

    // 計算有效策略比例
    return validPolicies.length / allPolicies.length;
  }

  /**
   * 生成建議
   * @param {Object} analysis - 分析結果
   * @param {string} effectivePolicy - 有效策略
   * @param {Array} policies - 所有策略
   */
  generateRecommendations(analysis, effectivePolicy, policies) {
    const config = this.policyConfigs[effectivePolicy];
    
    if (config.level === 'poor') {
      analysis.details.recommendations.push({
        type: 'weak-policy',
        message: `目前策略 "${effectivePolicy}" 隱私保護較弱`,
        suggestion: '建議使用 "strict-origin-when-cross-origin" 或 "same-origin"'
      });
    }

    if (effectivePolicy === 'unsafe-url') {
      analysis.details.recommendations.push({
        type: 'security-risk',
        message: 'unsafe-url 策略會洩露完整 URL 資訊，存在隱私風險',
        suggestion: '立即更換為更安全的策略，如 "strict-origin-when-cross-origin"'
      });
    }

    if (policies.length > 3) {
      analysis.details.recommendations.push({
        type: 'optimization',
        message: '策略值過多可能造成混淆',
        suggestion: '建議簡化為單一明確的策略值'
      });
    }

    if (config.compatibility === 'may-break-features') {
      analysis.details.recommendations.push({
        type: 'compatibility-warning',
        message: '此策略可能影響某些功能（如分析工具）的正常運作',
        suggestion: '請確保相關功能仍能正常運作'
      });
    }
  }

  /**
   * 分析安全影響
   * @param {Object} analysis - 分析結果
   * @param {string} effectivePolicy - 有效策略
   */
  analyzeSecurityImplications(analysis, effectivePolicy) {
    const config = this.policyConfigs[effectivePolicy];

    analysis.details.securityImplications = [
      {
        aspect: '隱私保護',
        level: config.privacy,
        description: config.description
      },
      {
        aspect: '安全性',
        level: config.security,
        description: this.getSecurityDescription(config.security)
      },
      {
        aspect: '相容性',
        level: config.compatibility,
        description: this.getCompatibilityDescription(config.compatibility)
      }
    ];
  }

  /**
   * 獲取安全性描述
   * @param {string} level - 安全等級
   * @returns {string} 描述
   */
  getSecurityDescription(level) {
    const descriptions = {
      'maximum': '提供最高等級的安全保護',
      'high': '提供良好的安全保護',
      'good': '提供適度的安全保護',
      'moderate': '提供基本的安全保護',
      'low': '安全保護有限',
      'very-low': '幾乎無安全保護'
    };

    return descriptions[level] || '安全等級未知';
  }

  /**
   * 獲取相容性描述
   * @param {string} level - 相容性等級
   * @returns {string} 描述
   */
  getCompatibilityDescription(level) {
    const descriptions = {
      'excellent': '與現有功能相容性極佳',
      'good': '與大部分功能相容',
      'may-break-features': '可能影響某些依賴 referrer 的功能'
    };

    return descriptions[level] || '相容性未知';
  }

  /**
   * 生成快取鍵
   * @param {Object} headers - Headers 物件
   * @param {string} url - URL
   * @returns {string} 快取鍵
   */
  generateCacheKey(headers, url) {
    const headerKey = this.findReferrerPolicyHeader(headers);
    const headerValue = headerKey ? headers[headerKey] : '';
    return `referrer-policy:${headerValue}:${url}`;
  }

  /**
   * 清理快取
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 獲取支援的策略列表
   * @returns {Array} 策略配置陣列
   */
  getSupportedPolicies() {
    return Object.entries(this.policyConfigs).map(([policy, config]) => ({
      policy,
      ...config
    }));
  }
}

// 模組匯出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReferrerPolicyDetector;
} else if (typeof window !== 'undefined') {
  window.ReferrerPolicyDetector = ReferrerPolicyDetector;
}

} // 結束 if (typeof ReferrerPolicyDetector === 'undefined') 條件