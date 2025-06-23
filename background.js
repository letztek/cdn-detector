let cdnDetectionEnabled = false;
let webRequestListener = null;
let beforeRequestListener = null; // 新增：請求開始監聽器
let requestStartTimes = {}; // 新增：追蹤請求開始時間
let currentTabId = null; // 新增：當前活躍標籤頁 ID
let tabDetectionData = {}; // 新增：按標籤頁分組的檢測資料

// 新增：日誌記錄函數
function logMessage(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logEntry);
  
  // 將日誌保存到 chrome.storage 供後續分析使用
  chrome.storage.local.get(['debugLogs'], (result) => {
    const logs = result.debugLogs || [];
    logs.push(logEntry);
    
    // 保持最近 1000 條日誌
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    chrome.storage.local.set({ debugLogs: logs });
  });
}

// 新增：獲取資源類型
function getResourceType(url) {
  const extension = url.split('.').pop().toLowerCase().split('?')[0];
  
  if (['js', 'mjs'].includes(extension)) return 'JavaScript';
  if (['css'].includes(extension)) return 'CSS';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(extension)) return 'Image';
  if (['woff', 'woff2', 'ttf', 'otf'].includes(extension)) return 'Font';
  if (['mp4', 'webm', 'ogg', 'avi'].includes(extension)) return 'Video';
  if (['mp3', 'wav', 'ogg', 'aac'].includes(extension)) return 'Audio';
  if (['json', 'xml'].includes(extension)) return 'Data';
  if (['html', 'htm'].includes(extension)) return 'Document';
  
  return 'Other';
}

// 新增：獲取域名
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return 'Unknown';
  }
}

// CDN 檢測配置系統
// 配置驗證和管理工具
const CDN_CONFIG_VALIDATOR = {
  // 驗證單個 CDN 配置的完整性
  validateConfig(cdnKey, config) {
    const errors = [];
    
    // 必需字段檢查
    const requiredFields = ['name', 'confidence', 'priority'];
    for (const field of requiredFields) {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // 檢測方法檢查（至少要有一種檢測方法）
    const detectionMethods = [
      config.detectionHeaders?.length > 0,
      config.serverHeaders?.length > 0,
      config.viaHeaders?.length > 0,
      config.customParser
    ];
    
    if (!detectionMethods.some(method => method)) {
      errors.push('At least one detection method must be configured');
    }
    
    // 信心度驗證
    if (config.confidence && !['high', 'medium', 'low'].includes(config.confidence)) {
      errors.push('Confidence must be one of: high, medium, low');
    }
    
    // 優先級驗證
    if (config.priority && (!Number.isInteger(config.priority) || config.priority < 1)) {
      errors.push('Priority must be a positive integer');
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  },
  
  // 驗證所有配置
  validateAllConfigs(configs) {
    const results = {};
    const priorities = [];
    
    for (const [cdnKey, config] of Object.entries(configs)) {
      results[cdnKey] = this.validateConfig(cdnKey, config);
      if (config.priority) {
        priorities.push(config.priority);
      }
    }
    
    // 檢查優先級重複
    const duplicatePriorities = priorities.filter((priority, index) => 
      priorities.indexOf(priority) !== index
    );
    
    if (duplicatePriorities.length > 0) {
      for (const [cdnKey] of Object.entries(configs)) {
        if (duplicatePriorities.includes(configs[cdnKey].priority)) {
          results[cdnKey].errors.push(`Duplicate priority: ${configs[cdnKey].priority}`);
          results[cdnKey].valid = false;
        }
      }
    }
    
    return results;
  },
  
  // 動態添加 CDN 配置
  addCDNConfig(cdnKey, config) {
    const validation = this.validateConfig(cdnKey, config);
    if (!validation.valid) {
      logMessage(`Failed to add CDN config ${cdnKey}: ${validation.errors.join(', ')}`, 'error');
      return false;
    }
    
    CDN_CONFIGS[cdnKey] = config;
    logMessage(`Successfully added CDN config: ${cdnKey}`, 'info');
    return true;
  },
  
  // 移除 CDN 配置
  removeCDNConfig(cdnKey) {
    if (CDN_CONFIGS[cdnKey]) {
      delete CDN_CONFIGS[cdnKey];
      logMessage(`Successfully removed CDN config: ${cdnKey}`, 'info');
      return true;
    }
    return false;
  },
  
  // 獲取配置統計
  getConfigStats() {
    const configs = Object.values(CDN_CONFIGS);
    return {
      totalConfigs: configs.length,
      highConfidence: configs.filter(c => c.confidence === 'high').length,
      mediumConfidence: configs.filter(c => c.confidence === 'medium').length,
      lowConfidence: configs.filter(c => c.confidence === 'low').length,
      customParsers: configs.filter(c => c.customParser).length,
      priorities: configs.map(c => c.priority).sort((a, b) => a - b)
    };
  }
};

const CDN_CONFIGS = {
  cloudflare: {
    name: 'Cloudflare',
    detectionHeaders: ['cf-cache-status', 'cf-ray', 'cf-request-id'],
    serverHeaders: ['cloudflare'],
    viaHeaders: ['cloudflare'],
    cacheStatusHeader: 'cf-cache-status',
    cacheStatusMapping: {
      'hit': 'HIT',
      'miss': 'MISS', 
      'expired': 'MISS',
      'stale': 'MISS',
      'dynamic': 'OTHER',
      'bypass': 'OTHER',
      'updating': 'OTHER',
      'revalidated': 'HIT',
      'ignored': 'OTHER',
      'deferred': 'OTHER'
    },
    confidence: 'high',
    priority: 1
  },
  cloudfront: {
    name: 'Amazon CloudFront',
    detectionHeaders: ['x-amz-cf-id', 'x-amz-cf-pop', 'x-amz-server-side-encryption'],
    serverHeaders: [],
    viaHeaders: ['cloudfront.net', 'cloudfront'],
    cacheStatusHeader: 'x-cache',
    cacheStatusMapping: {
      'hit from cloudfront': 'HIT',
      'miss from cloudfront': 'MISS',
      'refreshhit from cloudfront': 'HIT',
      'redirect from cloudfront': 'OTHER',
      'error from cloudfront': 'OTHER',
      'hit': 'HIT',
      'miss': 'MISS',
      'refresh_hit': 'HIT'
    },
    confidence: 'high',
    priority: 2
  },
  fastly: {
    name: 'Fastly',
    detectionHeaders: ['fastly-debug-digest', 'x-fastly-request-id', 'x-cache-hits'],
    serverHeaders: [],
    viaHeaders: ['fastly'],
    cacheStatusHeader: 'x-cache',
    cacheStatusMapping: {
      'hit': 'HIT',
      'miss': 'MISS',
      'pass': 'OTHER',
      'stale': 'MISS',
      'updating': 'OTHER',
      'error': 'OTHER'
    },
    confidence: 'high',
    priority: 3
  },
  keycdn: {
    name: 'KeyCDN',
    detectionHeaders: ['x-edge-location', 'x-keycdn-request-id'],
    serverHeaders: ['keycdn-engine', 'keycdn'],
    viaHeaders: ['keycdn'],
    cacheStatusHeader: 'x-cache',
    cacheStatusMapping: {
      'hit': 'HIT',
      'miss': 'MISS',
      'expired': 'MISS',
      'stale': 'MISS',
      'bypass': 'OTHER'
    },
    confidence: 'medium',
    priority: 4
  },
  azure: {
    name: 'Microsoft Azure CDN',
    detectionHeaders: ['x-msedge-ref', 'x-azure-ref', 'x-ec-custom-error'],
    serverHeaders: ['ecacc'], // 移除 microsoft-iis 避免誤判
    viaHeaders: ['azure'],
    cacheStatusHeader: 'x-cache',
    cacheStatusMapping: {
      'hit': 'HIT',
      'tcp_hit': 'HIT',
      'miss': 'MISS',
      'tcp_miss': 'MISS',
      'config_nocache': 'OTHER',
      'uncacheable': 'OTHER',
      'refresh_hit': 'HIT'
    },
    confidence: 'medium',
    priority: 5
  },
  googlecloud: {
    name: 'Google Cloud CDN',
    detectionHeaders: ['x-goog-cache-status', 'x-cloud-trace-context'],
    serverHeaders: ['gfe'],
    viaHeaders: ['google'],
    cacheStatusHeader: 'x-goog-cache-status',
    cacheStatusMapping: {
      'hit': 'HIT',
      'miss': 'MISS',
      'bypass': 'OTHER',
      'expired': 'MISS',
      'stale': 'MISS',
      'refresh_hit': 'HIT'
    },
    confidence: 'high',
    priority: 6
  },
  akamai: {
    name: 'Akamai',
    detectionHeaders: ['x-akamai-request-id', 'x-akamai-session-info', 'x-check-cacheable'],
    serverHeaders: ['akamaighost', 'ags'],
    viaHeaders: ['akamai'],
    cacheStatusHeader: 'x-cache',
    cacheStatusMapping: {
      'hit': 'HIT',
      'miss': 'MISS',
      'tcp_hit': 'HIT',
      'tcp_miss': 'MISS',
      'refresh_hit': 'HIT',
      'refresh_miss': 'MISS',
      'stale': 'MISS',
      'expired': 'MISS',
      'none': 'OTHER'
    },
    confidence: 'medium',
    priority: 7
  },
  aspirappscdn: {
    name: 'AspirappsCDN',
    detectionHeaders: [],
    serverHeaders: ['aspirappscdn'],
    viaHeaders: ['aspirappscdn'],
    cacheStatusHeader: 'via',
    cacheStatusMapping: {}, // 使用特殊解析邏輯
    confidence: 'high',
    priority: 8,
    customParser: true
  }
};

// 新增：多 CDN 檢測邏輯
function detectCDN(headers, url) {
  const detectionInfo = {
    isCDN: false,
    cdnType: null,
    cdnTypes: [], // 支援多 CDN 檢測
    viaHeader: null,
    serverHeader: null,
    cacheHeaders: {},
    cacheStatus: null,
    cacheStatusCode: null,
    isHit: null,
    detectionReason: 'No CDN detected',
    confidence: 'none',
    detectionResults: [] // 詳細檢測結果
  };
  
  // 建立 header 查找映射（不區分大小寫）
  const headerMap = {};
  headers.forEach(header => {
    headerMap[header.name.toLowerCase()] = header.value;
  });
  
  // 按優先順序檢測各 CDN
  const cdnKeys = Object.keys(CDN_CONFIGS).sort((a, b) => 
    CDN_CONFIGS[a].priority - CDN_CONFIGS[b].priority
  );
  
  // 調試：記錄所有可用的 headers
  const availableHeaders = Object.keys(headerMap);
  logMessage(`Available headers for ${url}: ${availableHeaders.join(', ')}`, 'debug');
  
  for (const cdnKey of cdnKeys) {
    const config = CDN_CONFIGS[cdnKey];
    const result = detectSpecificCDN(config, headerMap, cdnKey);
    
    // 調試：記錄每個 CDN 的檢測結果
    if (result.detectionMethods.length > 0) {
      logMessage(`${config.name} detection methods: ${JSON.stringify(result.detectionMethods)}`, 'debug');
    }
    
    if (result.detected) {
      logMessage(`✅ ${config.name} detected: ${result.reason} (confidence: ${result.confidence})`, 'info');
      detectionInfo.detectionResults.push(result);
      
      // 如果是第一個檢測到的 CDN，設為主要 CDN
      if (!detectionInfo.isCDN) {
        detectionInfo.isCDN = true;
        detectionInfo.cdnType = config.name;
        detectionInfo.confidence = result.confidence;
        detectionInfo.detectionReason = result.reason;
        
        // 解析快取狀態
        const cacheResult = parseCacheStatus(config, headerMap, cdnKey);
        detectionInfo.cacheStatus = cacheResult.status;
        detectionInfo.cacheStatusCode = cacheResult.statusCode;
        detectionInfo.isHit = cacheResult.isHit;
        
        logMessage(`Cache status for ${config.name}: ${cacheResult.status} (isHit: ${cacheResult.isHit})`, 'debug');
      }
      
      // 添加到 CDN 類型列表
      detectionInfo.cdnTypes.push({
        name: config.name,
        key: cdnKey,
        confidence: result.confidence,
        reason: result.reason,
        detectionMethods: result.detectionMethods
      });
    }
  }
  
  // 保存相關 headers
  const allRelevantHeaders = ['server', 'via', 'x-cache', 'x-served-by', 'x-cdn', 
                              'cf-ray', 'cf-cache-status', 'x-amz-cf-id', 
                              'fastly-debug-digest', 'x-goog-cache-status'];
  
  allRelevantHeaders.forEach(headerName => {
    if (headerMap[headerName]) {
      detectionInfo.cacheHeaders[headerName] = headerMap[headerName];
    }
  });
  
  // 特別處理 via 和 server headers
  detectionInfo.viaHeader = headerMap['via'] || null;
  detectionInfo.serverHeader = headerMap['server'] || null;
  
  // 記錄檢測結果
  if (detectionInfo.isCDN) {
    const cdnList = detectionInfo.cdnTypes.map(cdn => cdn.name).join(', ');
    logMessage(`✅ CDN detected: ${cdnList} | Primary: ${detectionInfo.cdnType} | Cache Status: ${detectionInfo.cacheStatus}`, 'info');
  } else {
    logMessage(`❌ No CDN detected for ${url}`, 'debug');
  }
  
  return detectionInfo;
}

// 檢測特定 CDN
function detectSpecificCDN(config, headerMap, cdnKey) {
  const result = {
    detected: false,
    reason: '',
    confidence: config.confidence,
    headers: [],
    detectionMethods: []
  };
  
  let highestConfidence = 'none';
  let bestReason = '';
  let detectedHeaders = [];
  
  // 高信心度檢測：專有 headers
  for (const headerName of config.detectionHeaders) {
    if (headerMap[headerName]) {
      result.detected = true;
      result.detectionMethods.push({
        method: 'detection_header',
        header: headerName,
        value: headerMap[headerName],
        confidence: 'high'
      });
      
      if (highestConfidence !== 'high') {
        highestConfidence = 'high';
        bestReason = `${headerName} header detected`;
        detectedHeaders = [headerName];
      }
    }
  }
  
  // 中信心度檢測：server headers（支援正規表達式）
  for (const serverPattern of config.serverHeaders) {
    const serverHeader = headerMap['server'];
    if (serverHeader) {
      let isMatch = false;
      let matchType = 'contains';
      
      // 檢查是否為正規表達式（以 / 開頭和結尾）
      if (serverPattern.startsWith('/') && serverPattern.endsWith('/')) {
        try {
          const regexPattern = serverPattern.slice(1, -1); // 移除前後的 /
          const regex = new RegExp(regexPattern, 'i'); // 不區分大小寫
          isMatch = regex.test(serverHeader);
          matchType = 'regex';
        } catch (error) {
          logMessage(`Invalid regex pattern: ${serverPattern}`, 'warn');
          // 如果正規表達式無效，回退到字串包含檢查
          isMatch = serverHeader.toLowerCase().includes(serverPattern.toLowerCase());
        }
      } else {
        // 標準字串包含檢查
        isMatch = serverHeader.toLowerCase().includes(serverPattern.toLowerCase());
      }
      
      if (isMatch) {
        result.detected = true;
        result.detectionMethods.push({
          method: 'server_header',
          pattern: serverPattern,
          header: 'server',
          value: serverHeader,
          confidence: 'medium',
          matchType: matchType
        });
        
        if (highestConfidence === 'none' || (highestConfidence === 'low' && config.confidence !== 'low')) {
          highestConfidence = config.confidence === 'high' ? 'medium' : config.confidence;
          bestReason = `Server header ${matchType === 'regex' ? 'matches regex' : 'contains'} ${serverPattern}`;
          detectedHeaders = ['server'];
        }
      }
    }
  }
  
  // 低信心度檢測：via headers（支援正規表達式）
  for (const viaPattern of config.viaHeaders) {
    const viaHeader = headerMap['via'];
    if (viaHeader) {
      let isMatch = false;
      let matchType = 'contains';
      
      // 檢查是否為正規表達式（以 / 開頭和結尾）
      if (viaPattern.startsWith('/') && viaPattern.endsWith('/')) {
        try {
          const regexPattern = viaPattern.slice(1, -1); // 移除前後的 /
          const regex = new RegExp(regexPattern, 'i'); // 不區分大小寫
          isMatch = regex.test(viaHeader);
          matchType = 'regex';
        } catch (error) {
          logMessage(`Invalid regex pattern: ${viaPattern}`, 'warn');
          // 如果正規表達式無效，回退到字串包含檢查
          isMatch = viaHeader.toLowerCase().includes(viaPattern.toLowerCase());
        }
      } else {
        // 標準字串包含檢查
        isMatch = viaHeader.toLowerCase().includes(viaPattern.toLowerCase());
      }
      
      if (isMatch) {
        result.detected = true;
        result.detectionMethods.push({
          method: 'via_header',
          pattern: viaPattern,
          header: 'via',
          value: viaHeader,
          confidence: 'low',
          matchType: matchType
        });
        
        if (highestConfidence === 'none') {
          highestConfidence = 'low';
          bestReason = `Via header ${matchType === 'regex' ? 'matches regex' : 'contains'} ${viaPattern}`;
          detectedHeaders = ['via'];
        }
      }
    }
  }
  
  // 設置最終結果
  if (result.detected) {
    result.confidence = highestConfidence;
    result.reason = bestReason;
    result.headers = detectedHeaders;
  }
  
  return result;
}

// 統一的 CDN 快取狀態解析系統
function parseCacheStatus(config, headerMap, cdnKey) {
  const result = {
    status: 'Unknown',
    statusCode: null,
    isHit: null,
    confidence: 'none',
    detectionMethod: null,
    rawValue: null,
    alternativeHeaders: []
  };
  
  logMessage(`Parsing cache status for ${cdnKey}`, 'debug');
  
  // 特殊處理 AspirappsCDN
  if (cdnKey === 'aspirappscdn' && config.customParser) {
    const viaHeader = headerMap['via'];
    if (viaHeader) {
      const cacheAnalysis = parseAspirappsCDNCacheStatus(viaHeader);
      result.status = cacheAnalysis.status;
      result.statusCode = cacheAnalysis.statusCode;
      result.isHit = cacheAnalysis.isHit;
      result.confidence = 'high';
      result.detectionMethod = 'custom_via_parser';
      result.rawValue = viaHeader;
      logMessage(`AspirappsCDN cache status: ${result.status} (isHit: ${result.isHit})`, 'debug');
    }
    return result;
  }
  
  // 標準快取狀態解析 - 支援多個 header 檢測
  const possibleHeaders = [
    config.cacheStatusHeader,
    'x-cache',
    'x-cache-status', 
    'cache-status',
    'cf-cache-status',
    'x-goog-cache-status'
  ].filter(h => h); // 移除空值
  
  let bestMatch = null;
  let bestConfidence = 'none';
  
  for (const headerName of possibleHeaders) {
    const headerValue = headerMap[headerName.toLowerCase()];
    if (!headerValue) continue;
    
    logMessage(`Checking header ${headerName}: ${headerValue}`, 'debug');
    
    const normalizedStatus = headerValue.toLowerCase().trim();
    const currentMatch = {
      status: headerValue,
      statusCode: null,
      isHit: null,
      confidence: headerName === config.cacheStatusHeader ? 'high' : 'medium',
      detectionMethod: `header_${headerName}`,
      rawValue: headerValue
    };
    
    // 檢查映射表
    let foundMapping = false;
    for (const [pattern, mappedStatus] of Object.entries(config.cacheStatusMapping)) {
      const normalizedPattern = pattern.toLowerCase();
      
      // 支援精確匹配和包含匹配
      const isExactMatch = normalizedStatus === normalizedPattern;
      const isContainMatch = normalizedStatus.includes(normalizedPattern);
      
      if (isExactMatch || isContainMatch) {
        currentMatch.statusCode = pattern;
        currentMatch.confidence = isExactMatch ? 'high' : 'medium';
        
        switch (mappedStatus) {
          case 'HIT':
            currentMatch.isHit = true;
            break;
          case 'MISS':
            currentMatch.isHit = false;
            break;
          case 'OTHER':
            currentMatch.isHit = null;
            break;
        }
        
        foundMapping = true;
        logMessage(`Found mapping: ${pattern} -> ${mappedStatus} (exact: ${isExactMatch})`, 'debug');
        break;
      }
    }
    
    // 如果沒有找到映射，嘗試通用模式
    if (!foundMapping) {
      const genericMatch = parseGenericCacheStatus(normalizedStatus);
      if (genericMatch.isHit !== null) {
        currentMatch.statusCode = genericMatch.pattern;
        currentMatch.isHit = genericMatch.isHit;
        currentMatch.confidence = 'low';
        currentMatch.detectionMethod += '_generic';
        foundMapping = true;
        logMessage(`Generic pattern match: ${genericMatch.pattern} -> ${genericMatch.isHit ? 'HIT' : 'MISS'}`, 'debug');
      }
    }
    
    // 選擇最佳匹配（優先級：high > medium > low）
    if (foundMapping && (bestConfidence === 'none' || 
        (currentMatch.confidence === 'high' && bestConfidence !== 'high') ||
        (currentMatch.confidence === 'medium' && bestConfidence === 'low'))) {
      bestMatch = currentMatch;
      bestConfidence = currentMatch.confidence;
    }
    
    // 記錄替代 headers
    if (headerName !== config.cacheStatusHeader && foundMapping) {
      result.alternativeHeaders.push({
        header: headerName,
        value: headerValue,
        parsed: currentMatch
      });
    }
  }
  
  // 應用最佳匹配
  if (bestMatch) {
    Object.assign(result, bestMatch);
    logMessage(`Best cache status match: ${result.status} (isHit: ${result.isHit}, confidence: ${result.confidence})`, 'debug');
  } else {
    logMessage(`No cache status mapping found for ${cdnKey}`, 'debug');
  }
  
  return result;
}

// 通用快取狀態模式解析
function parseGenericCacheStatus(normalizedStatus) {
  const result = {
    pattern: null,
    isHit: null
  };
  
  // 常見的 HIT 模式
  const hitPatterns = [
    'hit', 'cache_hit', 'cached', 'from_cache', 'tcp_hit', 
    'refresh_hit', 'refreshhit', 'revalidated'
  ];
  
  // 常見的 MISS 模式  
  const missPatterns = [
    'miss', 'cache_miss', 'not_cached', 'tcp_miss', 
    'expired', 'stale', 'refresh_miss'
  ];
  
  // 檢查 HIT 模式
  for (const pattern of hitPatterns) {
    if (normalizedStatus.includes(pattern)) {
      result.pattern = pattern;
      result.isHit = true;
      return result;
    }
  }
  
  // 檢查 MISS 模式
  for (const pattern of missPatterns) {
    if (normalizedStatus.includes(pattern)) {
      result.pattern = pattern;
      result.isHit = false;
      return result;
    }
  }
  
  return result;
}

// 新增：解析 AspirappsCDN Via Header 快取狀態
function parseAspirappsCDNCacheStatus(viaHeaderValue) {
  const result = {
    statusCode: null,
    status: 'Unknown',
    isHit: null,
    rawViaCode: null,
    allViaCodes: []
  };
  
  try {
    // 處理多個 via header 的情況：以逗號分隔
    // 例如：https/1.1 AspirappsCDN (EQ-EDGE/9.2.3 [uScMsSf pSeN:t cCMp sS]), https/1.1 AspirappsCDN (EQ-EDGE/9.2.3 [uScMsSf pSeN:t cCMpSs ])
    const viaHeaders = viaHeaderValue.split(',').map(h => h.trim());
    
    let bestResult = null;
    let foundHit = false;
    
    for (const singleViaHeader of viaHeaders) {
      logMessage(`Processing via header: ${singleViaHeader}`, 'debug');
      
      // 解析 via header 格式：https/1.1 AspirappsCDN (EQ-EDGE/9.2.3 [uScMsSf pSeN:t cCMp sS])
      // 尋找方括號內的 via code
      const viaCodeMatch = singleViaHeader.match(/\[([^\]]+)\]/);
      if (!viaCodeMatch) {
        logMessage(`No via code found in header: ${singleViaHeader}`, 'debug');
        continue;
      }
      
      const viaCode = viaCodeMatch[1];
      result.allViaCodes.push(viaCode);
      logMessage(`Extracted via code: ${viaCode}`, 'debug');
      
      // 分割 via code 為各個部分（以空格分隔）
      const viaCodeParts = viaCode.split(/\s+/);
      if (viaCodeParts.length === 0) {
        logMessage(`Invalid via code format: ${viaCode}`, 'debug');
        continue;
      }
      
      // 檢查第一個部分，第四個字節是快取狀態
      const firstPart = viaCodeParts[0];
      if (firstPart.length >= 4) {
        const cacheStatusCode = firstPart.charAt(3); // 第四個字節 (索引 3)
        
        let currentResult = {
          statusCode: cacheStatusCode,
          status: 'Unknown',
          isHit: null,
          rawViaCode: viaCode
        };
        
        // 根據圖表映射快取狀態
        switch (cacheStatusCode.toLowerCase()) {
          case 'h':
            currentResult.status = 'HIT (fresh)';
            currentResult.isHit = true;
            foundHit = true;
            break;
          case 'm':
            currentResult.status = 'MISS';
            currentResult.isHit = false;
            break;
          case 's':
            currentResult.status = 'MISS (stale)';
            currentResult.isHit = false;
            break;
          case 'a':
            currentResult.status = 'MISS (not acceptable)';
            currentResult.isHit = false;
            break;
          case 'r':
            currentResult.status = 'HIT (fresh RAM hit)';
            currentResult.isHit = true;
            foundHit = true;
            break;
          case ' ':
          case '':
            currentResult.status = 'No cache lookup performed';
            currentResult.isHit = null;
            break;
          default:
            currentResult.status = `Unknown status code: ${cacheStatusCode}`;
            currentResult.isHit = null;
            logMessage(`Unknown cache status code: ${cacheStatusCode} in via code: ${viaCode}`, 'warn');
            break;
        }
        
        logMessage(`Parsed cache status: Code=${cacheStatusCode}, Status=${currentResult.status}, IsHit=${currentResult.isHit}`, 'debug');
        
        // 如果發現 HIT，立即使用此結果
        if (currentResult.isHit === true) {
          bestResult = currentResult;
          break; // 立即跳出循環，優先使用 HIT 結果
        }
        
        // 如果還沒找到 HIT，保存第一個有效結果
        if (!bestResult) {
          bestResult = currentResult;
        }
      } else {
        logMessage(`Via code first part too short: ${firstPart}`, 'debug');
      }
    }
    
    // 使用最佳結果
    if (bestResult) {
      result.statusCode = bestResult.statusCode;
      result.status = bestResult.status;
      result.isHit = bestResult.isHit;
      result.rawViaCode = bestResult.rawViaCode;
      
      // 如果有多個 via codes，在狀態中標註
      if (result.allViaCodes.length > 1) {
        result.status += ` (${result.allViaCodes.length} via headers)`;
        logMessage(`Multiple via headers found, using best result: ${result.status}`, 'debug');
      }
    } else {
      logMessage(`No valid via codes found in header: ${viaHeaderValue}`, 'debug');
    }
    
  } catch (error) {
    logMessage(`Error parsing AspirappsCDN cache status: ${error.message}`, 'error');
  }
  
  return result;
}

// 初始化 CDN 配置系統
function initializeCDNConfigs() {
  logMessage('Initializing CDN detection configuration system...', 'info');
  
  // 驗證所有配置
  const validationResults = CDN_CONFIG_VALIDATOR.validateAllConfigs(CDN_CONFIGS);
  let hasErrors = false;
  
  for (const [cdnKey, result] of Object.entries(validationResults)) {
    if (!result.valid) {
      logMessage(`CDN config validation failed for ${cdnKey}: ${result.errors.join(', ')}`, 'error');
      hasErrors = true;
    }
  }
  
  if (!hasErrors) {
    const stats = CDN_CONFIG_VALIDATOR.getConfigStats();
    logMessage(`CDN configurations initialized successfully. Stats: ${JSON.stringify(stats)}`, 'info');
  } else {
    logMessage('CDN configuration system initialized with errors. Some CDN detection may not work properly.', 'warn');
  }
  
  return !hasErrors;
}

// 初始化監聽狀態 - 預設啟用
chrome.storage.local.get('cdnDetectionEnabled', (result) => {
  if (chrome.runtime.lastError) {
    console.error('Failed to initialize detection state:', chrome.runtime.lastError);
    return;
  }
  
  // 預設啟用，只有明確設定為 false 才關閉
  cdnDetectionEnabled = result.cdnDetectionEnabled !== false;
  
  // 如果是第一次安裝（沒有存儲值），設定為 true
  if (result.cdnDetectionEnabled === undefined) {
    chrome.storage.local.set({ cdnDetectionEnabled: true }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to set default detection state:', chrome.runtime.lastError);
      }
    });
    cdnDetectionEnabled = true;
  }
  
  logMessage(`CDN Detection initialized: ${cdnDetectionEnabled ? 'Enabled' : 'Disabled'}`);
  
  // 初始化 CDN 配置系統
  initializeCDNConfigs();
  
  if (cdnDetectionEnabled) {
    startListening();
  }
});

// 新增：監聽標籤頁變化
chrome.tabs.onActivated.addListener((activeInfo) => {
  currentTabId = activeInfo.tabId;
  logMessage(`Tab activated: ${currentTabId}`, 'debug');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tabId === currentTabId) {
    logMessage(`Tab updated: ${tabId} - ${tab.url}`, 'debug');
  }
});

// 新增：計算 CDN 存取速度
function calculateCDNAccessSpeed(stats) {
  const speedStats = {
    overallSpeed: 0,
    hitSpeed: 0,
    missSpeed: 0,
    avgResponseTime: 0
  };
  
  try {
    // 確保所有數值都是數字且非負
    const hitSize = Math.max(0, parseFloat(stats.hitTotalSize) || 0);
    const missSize = Math.max(0, parseFloat(stats.missTotalSize) || 0);
    const unknownSize = Math.max(0, parseFloat(stats.unknownTotalSize) || 0);
    const hitTime = Math.max(0, parseFloat(stats.hitTotalTime) || 0);
    const missTime = Math.max(0, parseFloat(stats.missTotalTime) || 0);
    const unknownTime = Math.max(0, parseFloat(stats.unknownTotalTime) || 0);
    
    // 計算總體 CDN 速度 (MB/s)
    const totalCDNSize = hitSize + missSize + unknownSize;
    const totalCDNTime = hitTime + missTime + unknownTime;
    
    logMessage(`Speed calculation raw data: hitSize=${hitSize}, hitTime=${hitTime}, missSize=${missSize}, missTime=${missTime}, unknownSize=${unknownSize}, unknownTime=${unknownTime}`, 'info');
    logMessage(`Speed calculation totals: totalSize=${totalCDNSize} bytes, totalTime=${totalCDNTime} ms`, 'info');
    
    if (totalCDNSize > 0 && totalCDNTime > 0) {
      // 轉換為 MB/s: (bytes / milliseconds) * 1000 / (1024 * 1024)
      const bytesPerSecond = (totalCDNSize / totalCDNTime) * 1000;
      speedStats.overallSpeed = bytesPerSecond / (1024 * 1024);
      logMessage(`Overall speed calculation: ${totalCDNSize} bytes / ${totalCDNTime} ms * 1000 = ${bytesPerSecond} bytes/s = ${speedStats.overallSpeed.toFixed(4)} MB/s`, 'info');
    }
    
    // 計算 HIT 速度
    if (hitSize > 0 && hitTime > 0) {
      const hitBytesPerSecond = (hitSize / hitTime) * 1000;
      speedStats.hitSpeed = hitBytesPerSecond / (1024 * 1024);
      logMessage(`HIT speed calculation: ${hitSize} bytes / ${hitTime} ms * 1000 = ${hitBytesPerSecond} bytes/s = ${speedStats.hitSpeed.toFixed(4)} MB/s`, 'info');
    }
    
    // 計算 MISS 速度
    if (missSize > 0 && missTime > 0) {
      const missBytesPerSecond = (missSize / missTime) * 1000;
      speedStats.missSpeed = missBytesPerSecond / (1024 * 1024);
      logMessage(`MISS speed calculation: ${missSize} bytes / ${missTime} ms * 1000 = ${missBytesPerSecond} bytes/s = ${speedStats.missSpeed.toFixed(4)} MB/s`, 'info');
    }
    
    // 計算平均響應時間
    const totalCDNRequests = (stats.hitCount || 0) + (stats.missCount || 0) + (stats.unknownCacheCount || 0);
    if (totalCDNRequests > 0 && totalCDNTime > 0) {
      speedStats.avgResponseTime = totalCDNTime / totalCDNRequests;
      logMessage(`Average response time: ${totalCDNTime} ms / ${totalCDNRequests} requests = ${speedStats.avgResponseTime.toFixed(2)} ms`, 'info');
    }
    
    logMessage(`Final CDN Speed results: Overall=${speedStats.overallSpeed.toFixed(4)} MB/s, HIT=${speedStats.hitSpeed.toFixed(4)} MB/s, MISS=${speedStats.missSpeed.toFixed(4)} MB/s, AvgTime=${speedStats.avgResponseTime.toFixed(2)} ms`, 'info');
    
  } catch (error) {
    logMessage(`Error calculating CDN access speed: ${error.message}`, 'error');
    console.error('Speed calculation error:', error, stats);
  }
  
  return speedStats;
}

// 新增：獲取當前標籤頁資訊
function getCurrentTabInfo(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Failed to get current tab:', chrome.runtime.lastError);
      callback(null);
      return;
    }
    
    if (tabs.length > 0) {
      const tab = tabs[0];
      currentTabId = tab.id;
      callback(tab);
    } else {
      callback(null);
    }
  });
}

// 統一的消息處理器
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    const tabId = sender.tab ? sender.tab.id : null;
    
    // CDN 檢測相關消息
    if (message.type === 'ping') {
      sendResponse({ type: 'pong', status: 'ok' });
      return;
    }
    
    if (message.type === 'toggleDetection') {
      cdnDetectionEnabled = message.enabled;
      chrome.storage.local.set({ cdnDetectionEnabled }, () => {
        if (chrome.runtime.lastError) {
          console.error('Failed to save detection state:', chrome.runtime.lastError);
          return;
        }
      });
      
      logMessage(`CDN Detection toggled: ${cdnDetectionEnabled ? 'Enabled' : 'Disabled'}`);

      if (cdnDetectionEnabled) {
        startListening();
      } else {
        stopListening();
      }
      sendResponse({ success: true });
      return;
    }
    
    if (message.type === 'getCurrentTabDetection') {
      getCurrentTabInfo((tab) => {
        if (tab) {
          const tabData = tabDetectionData[tab.id] || {
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
            detectionLog: [],
            cdnStats: { 
              cdnCount: 0, 
              nonCdnCount: 0, 
              totalRequests: 0,
              hitCount: 0,
              missCount: 0,
              unknownCacheCount: 0,
              hitTotalSize: 0,
              missTotalSize: 0,
              unknownTotalSize: 0
            }
          };
          sendResponse({
            type: 'currentTabDetectionResponse',
            data: tabData
          });
        } else {
          sendResponse({
            type: 'currentTabDetectionResponse',
            error: 'No active tab found',
            data: null
          });
        }
      });
      return true; // 保持 sendResponse 活躍
    }
    
    if (message.type === 'getDetectionLog') {
      getCurrentTabInfo((tab) => {
        if (tab && tabDetectionData[tab.id]) {
          sendResponse({
            type: 'detectionLogResponse',
            data: tabDetectionData[tab.id].detectionLog || []
          });
        } else {
          sendResponse({
            type: 'detectionLogResponse',
            error: 'No tab data found',
            data: []
          });
        }
      });
      return true; // 保持 sendResponse 活躍
    }
    
    if (message.type === 'clearDetectionLog') {
      getCurrentTabInfo((tab) => {
        if (tab && tabDetectionData[tab.id]) {
          logMessage(`Clearing detection log for tab ${tab.id}`);
          tabDetectionData[tab.id] = {
            tabId: tab.id,
            url: tab.url,
            title: tab.title,
            detectionLog: [],
            cdnStats: { 
              cdnCount: 0, 
              nonCdnCount: 0, 
              totalRequests: 0, 
              hitCount: 0,
              missCount: 0,
              unknownCacheCount: 0,
              hitTotalSize: 0,
              missTotalSize: 0,
              unknownTotalSize: 0,
              hitTotalTime: 0,
              missTotalTime: 0,
              unknownTotalTime: 0,
              lastUpdated: new Date().toISOString() 
            }
          };
          logMessage(`Tab ${tab.id} detection data reset`);
        }
        
        chrome.storage.local.remove(['debugLogs'], () => {
          logMessage('Debug logs cleared');
        });
      });
      sendResponse({ success: true });
      return;
    }
    
    // 視頻品質監控相關消息
    switch (message.type) {
      case 'VIDEO_QUALITY_UPDATE':
        if (tabId && message.data) {
          handleVideoQualityUpdate(tabId, message.data);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Invalid data or missing tab ID' });
        }
        break;
        
      case 'VIDEO_QUALITY_LOG':
        if (tabId && message.data) {
          handleVideoQualityLog(tabId, message.data);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Invalid log data or missing tab ID' });
        }
        break;
        
      case 'GET_VIDEO_QUALITY_DATA':
        const requestedTabId = message.tabId || tabId;
        
        if (requestedTabId) {
          const data = videoQualityData.tabs[requestedTabId] || null;
          const responseData = { 
            currentTab: data, 
            activeTabId: requestedTabId,
            timestamp: Date.now()
          };
          
          logMessage(`Returning video quality data for tab ${requestedTabId}: ${data ? 'has data' : 'no data'}`, 'debug');
          sendResponse({ success: true, data: responseData });
          
        } else {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTabId = tabs[0]?.id;
            
            if (activeTabId) {
              const data = videoQualityData.tabs[activeTabId] || null;
              const responseData = {
                global: videoQualityData.global,
                currentTab: data,
                tabIds: Object.keys(videoQualityData.tabs),
                activeTabId: activeTabId,
                timestamp: Date.now()
              };
              
              logMessage(`Returning video quality data for active tab ${activeTabId}: ${data ? 'has data' : 'no data'}`, 'debug');
              sendResponse({ success: true, data: responseData });
              
            } else {
              logMessage('No active tab found for video quality request', 'warn');
              sendResponse({ 
                success: false, 
                error: 'No active tab found',
                data: {
                  global: videoQualityData.global,
                  currentTab: null,
                  tabIds: Object.keys(videoQualityData.tabs),
                  activeTabId: null,
                  timestamp: Date.now()
                }
              });
            }
          });
          
          return true; // 保持消息通道開放
        }
        break;
        
      case 'CLEAR_VIDEO_QUALITY_DATA':
        const clearTabId = message.tabId || tabId;
        if (clearTabId && videoQualityData.tabs[clearTabId]) {
          delete videoQualityData.tabs[clearTabId];
          updateGlobalVideoQualityStats();
          saveVideoQualityData();
          logMessage(`Cleared video quality data for tab ${clearTabId}`, 'info');
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Invalid tab ID or no data to clear' });
        }
        break;
        
      case 'GET_VIDEO_QUALITY_STATS':
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTabId = tabs[0]?.id;
          const stats = {
            global: videoQualityData.global,
            currentTab: activeTabId ? videoQualityData.tabs[activeTabId] : null,
            totalTabs: Object.keys(videoQualityData.tabs).length,
            activeTabId: activeTabId,
            timestamp: Date.now()
          };
          
          logMessage(`Returning video quality stats: ${stats.totalTabs} tabs monitored`, 'debug');
          sendResponse({ success: true, stats: stats });
        });
        
        return true; // 保持消息通道開放
        
      case 'PING_VIDEO_QUALITY':
        sendResponse({ 
          success: true, 
          status: 'ok', 
          tabCount: Object.keys(videoQualityData.tabs).length,
          timestamp: Date.now()
        });
        return; // 立即返回，不需要保持通道開放
        
      default:
        // 未知消息類型
        logMessage(`Unknown message type: ${message.type}`, 'warn');
        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
        break;
    }
    
  } catch (error) {
    logMessage(`Error handling message: ${error.message}`, 'error');
    sendResponse({ success: false, error: error.message, timestamp: Date.now() });
  }
  
  return false; // 對於同步處理的消息，不需要保持通道開放
});

function startListening() {
  if (webRequestListener || beforeRequestListener) {
    logMessage('Listener already active, skipping start', 'warn');
    return;
  }
  
  logMessage('Starting CDN detection listener');
  
  // 新增：監聽請求開始，記錄開始時間
  beforeRequestListener = chrome.webRequest.onBeforeRequest.addListener(
    function (details) {
      try {
        // 跳過 chrome-extension:// 和 data: URLs
        if (details.url.startsWith('chrome-extension://') || details.url.startsWith('data:')) {
          return;
        }
        
        // 跳過無效的標籤頁 ID
        if (details.tabId < 0) {
          return;
        }
        
        // 記錄請求開始時間
        const requestKey = `${details.requestId}_${details.tabId}`;
        requestStartTimes[requestKey] = Date.now();
        
        logMessage(`Request started: ${details.url.substring(0, 100)}... (Tab: ${details.tabId}, RequestId: ${details.requestId})`, 'debug');
      } catch (error) {
        logMessage(`Error recording request start time: ${error.message}`, 'error');
      }
    },
    { urls: ['<all_urls>'] }
  );

  webRequestListener = chrome.webRequest.onCompleted.addListener(
    function (details) {
      try {
        const url = details.url;
        const domain = getDomain(url);
        const resourceType = getResourceType(url);
        const timestamp = new Date().toISOString();
        const tabId = details.tabId;
        
        // 跳過 chrome-extension:// 和 data: URLs
        if (url.startsWith('chrome-extension://') || url.startsWith('data:')) {
          return;
        }
        
        // 跳過無效的標籤頁 ID
        if (tabId < 0) {
          return;
        }
        
        logMessage(`Checking resource: ${url.substring(0, 100)}... [${resourceType}] from ${domain} (Tab: ${tabId})`, 'debug');
        
        const headers = details.responseHeaders || [];
        const cdnDetection = detectCDN(headers, url);
        
        // 新增：收集 Content-Length
        const contentLengthHeader = headers.find(header => header.name.toLowerCase() === 'content-length');
        const contentLength = contentLengthHeader ? parseInt(contentLengthHeader.value, 10) : null;
        
        // 新增：除錯日誌
        if (contentLength) {
          logMessage(`Content-Length: ${contentLength} bytes for ${url.substring(0, 50)}...`, 'debug');
        } else {
          logMessage(`No Content-Length header for ${url.substring(0, 50)}...`, 'debug');
        }
        
        // 新增：計算響應時間
        const requestKey = `${details.requestId}_${details.tabId}`;
        const startTime = requestStartTimes[requestKey];
        const responseTime = startTime ? Date.now() - startTime : null;
        
        // 新增：除錯日誌
        if (responseTime) {
          logMessage(`Response time calculated: ${responseTime}ms for ${url.substring(0, 50)}...`, 'debug');
        } else {
          logMessage(`No start time found for request ${requestKey}`, 'debug');
        }
        
        // 清理已完成的請求時間記錄
        if (requestStartTimes[requestKey]) {
          delete requestStartTimes[requestKey];
        }
        
        // 新增：詳細的檢測日誌（包含標籤頁 ID、快取狀態、檔案大小和響應時間）
        const detectionResult = {
          timestamp,
          url,
          domain,
          resourceType,
          statusCode: details.statusCode,
          method: details.method,
          headers: cdnDetection.cacheHeaders,
          isCDN: cdnDetection.isCDN,
          cdnType: cdnDetection.cdnType,
          cdnTypes: cdnDetection.cdnTypes, // 新增：多 CDN 支援
          confidence: cdnDetection.confidence, // 新增：檢測信心度
          detectionResults: cdnDetection.detectionResults, // 新增：詳細檢測結果
          viaHeader: cdnDetection.viaHeader,
          serverHeader: cdnDetection.serverHeader,
          detectionReason: cdnDetection.detectionReason,
          cacheStatus: cdnDetection.cacheStatus,
          cacheStatusCode: cdnDetection.cacheStatusCode,
          isHit: cdnDetection.isHit,
          contentLength: contentLength,
          responseTime: responseTime,
          tabId: tabId
        };
        
        // 記錄檢測結果
        if (cdnDetection.isCDN) {
          logMessage(`✅ CDN DETECTED: ${domain} - ${cdnDetection.detectionReason} (Tab: ${tabId})`, 'info');
        } else {
          logMessage(`❌ No CDN: ${domain} - ${cdnDetection.detectionReason} (Tab: ${tabId})`, 'debug');
        }
        
        // 初始化標籤頁資料結構（如果不存在）
        if (!tabDetectionData[tabId]) {
          tabDetectionData[tabId] = {
            tabId: tabId,
            url: '',
            title: '',
            detectionLog: [],
            cdnStats: { 
              cdnCount: 0, 
              nonCdnCount: 0, 
              totalRequests: 0,
              hitCount: 0,
              missCount: 0,
              unknownCacheCount: 0,
              hitTotalSize: 0,
              missTotalSize: 0,
              unknownTotalSize: 0,
              hitTotalTime: 0,
              missTotalTime: 0,
              unknownTotalTime: 0,
              lastUpdated: timestamp 
            }
          };
        }
        
        // 更新標籤頁資訊
        chrome.tabs.get(tabId, (tab) => {
          if (!chrome.runtime.lastError && tab) {
            tabDetectionData[tabId].url = tab.url;
            tabDetectionData[tabId].title = tab.title;
          }
        });
        
        // 更新標籤頁檢測日誌
        const tabData = tabDetectionData[tabId];
        tabData.detectionLog.push(detectionResult);
        
        // 保持最近 100 條記錄（每個標籤頁）
        if (tabData.detectionLog.length > 100) {
          tabData.detectionLog.splice(0, tabData.detectionLog.length - 100);
        }
        
        // 更新標籤頁統計資料
        if (cdnDetection.isCDN) {
          tabData.cdnStats.cdnCount++;
          
          // 新增：多 CDN 統計支援
          if (!tabData.cdnStats.cdnBreakdown) {
            tabData.cdnStats.cdnBreakdown = {};
          }
          
          // 統計主要 CDN
          const primaryCDN = cdnDetection.cdnType;
          if (!tabData.cdnStats.cdnBreakdown[primaryCDN]) {
            tabData.cdnStats.cdnBreakdown[primaryCDN] = {
              count: 0,
              hitCount: 0,
              missCount: 0,
              unknownCount: 0,
              totalSize: 0,
              hitSize: 0,
              missSize: 0,
              unknownSize: 0,
              totalTime: 0,
              hitTime: 0,
              missTime: 0,
              unknownTime: 0
            };
          }
          tabData.cdnStats.cdnBreakdown[primaryCDN].count++;
          
          // 統計所有檢測到的 CDN（多 CDN 疊加情況）
          cdnDetection.cdnTypes.forEach(cdnInfo => {
            const cdnName = cdnInfo.name;
            if (!tabData.cdnStats.cdnBreakdown[cdnName]) {
              tabData.cdnStats.cdnBreakdown[cdnName] = {
                count: 0,
                hitCount: 0,
                missCount: 0,
                unknownCount: 0,
                totalSize: 0,
                hitSize: 0,
                missSize: 0,
                unknownSize: 0,
                totalTime: 0,
                hitTime: 0,
                missTime: 0,
                unknownTime: 0
              };
            }
            
            // 只統計主要 CDN 的詳細資料，避免重複計算
            if (cdnName === primaryCDN) {
              const cdnStats = tabData.cdnStats.cdnBreakdown[cdnName];
              
              if (contentLength) {
                cdnStats.totalSize += contentLength;
              }
              if (responseTime) {
                cdnStats.totalTime += responseTime;
              }
              
              // 更新快取狀態統計
              if (cdnDetection.isHit === true) {
                cdnStats.hitCount++;
                if (contentLength) {
                  cdnStats.hitSize += contentLength;
                }
                if (responseTime) {
                  cdnStats.hitTime += responseTime;
                }
              } else if (cdnDetection.isHit === false) {
                cdnStats.missCount++;
                if (contentLength) {
                  cdnStats.missSize += contentLength;
                }
                if (responseTime) {
                  cdnStats.missTime += responseTime;
                }
              } else {
                cdnStats.unknownCount++;
                if (contentLength) {
                  cdnStats.unknownSize += contentLength;
                }
                if (responseTime) {
                  cdnStats.unknownTime += responseTime;
                }
              }
            }
          });
          
          // 保持原有的全域統計（向後相容）
          if (cdnDetection.isHit === true) {
            tabData.cdnStats.hitCount++;
            if (contentLength) {
              tabData.cdnStats.hitTotalSize += contentLength;
              logMessage(`HIT size accumulated: +${contentLength} bytes, total: ${tabData.cdnStats.hitTotalSize} bytes`, 'info');
            }
            if (responseTime) {
              tabData.cdnStats.hitTotalTime = (tabData.cdnStats.hitTotalTime || 0) + responseTime;
              logMessage(`HIT time accumulated: +${responseTime}ms, total: ${tabData.cdnStats.hitTotalTime}ms`, 'info');
            }
          } else if (cdnDetection.isHit === false) {
            tabData.cdnStats.missCount++;
            if (contentLength) {
              tabData.cdnStats.missTotalSize += contentLength;
              logMessage(`MISS size accumulated: +${contentLength} bytes, total: ${tabData.cdnStats.missTotalSize} bytes`, 'info');
            }
            if (responseTime) {
              tabData.cdnStats.missTotalTime = (tabData.cdnStats.missTotalTime || 0) + responseTime;
              logMessage(`MISS time accumulated: +${responseTime}ms, total: ${tabData.cdnStats.missTotalTime}ms`, 'info');
            }
          } else {
            tabData.cdnStats.unknownCacheCount++;
            if (contentLength) {
              tabData.cdnStats.unknownTotalSize += contentLength;
            }
            if (responseTime) {
              tabData.cdnStats.unknownTotalTime = (tabData.cdnStats.unknownTotalTime || 0) + responseTime;
            }
          }
          
          // 新增：計算 CDN 存取速度
          tabData.cdnStats.cdnAccessSpeed = calculateCDNAccessSpeed(tabData.cdnStats);
        } else {
          tabData.cdnStats.nonCdnCount++;
        }
        tabData.cdnStats.totalRequests++;
        tabData.cdnStats.lastUpdated = timestamp;
        
        // 同時保存到全域日誌（向後相容）
        chrome.storage.local.get(['detectionLog'], (result) => {
          const log = result.detectionLog || [];
          log.push(detectionResult);
          
          // 保持最近 500 條檢測記錄
          if (log.length > 500) {
            log.splice(0, log.length - 500);
          }
          
          chrome.storage.local.set({ detectionLog: log });
        });

        // 更新圖標狀態（基於當前標籤頁的 CDN 檢測結果）
        if (cdnDetection.isCDN) {
          // 暫時註解圖標設定避免錯誤
          // chrome.action.setIcon({ path: 'icon-green.png' });
          logMessage(`CDN count updated for tab ${tabId}: ${tabData.cdnStats.cdnCount}/${tabData.cdnStats.totalRequests} (${((tabData.cdnStats.cdnCount/tabData.cdnStats.totalRequests)*100).toFixed(1)}%)`, 'info');
        } else {
          // 只有在該標籤頁沒有檢測到任何 CDN 時才顯示紅色圖標
          if (tabData.cdnStats.cdnCount === 0) {
            // 暫時註解圖標設定避免錯誤
            // chrome.action.setIcon({ path: 'icon-red.png' });
          }
        }
        
        // 更新全域統計（向後相容）
        chrome.storage.local.get(['cdnStats'], (result) => {
          const stats = result.cdnStats || { 
            cdnCount: 0, 
            nonCdnCount: 0,
            hitCount: 0,
            missCount: 0,
            unknownCacheCount: 0,
            hitTotalSize: 0,
            missTotalSize: 0,
            unknownTotalSize: 0,
            hitTotalTime: 0,
            missTotalTime: 0,
            unknownTotalTime: 0,
            lastUpdated: timestamp,
            totalRequests: 0
          };

          stats.totalRequests++;
          stats.lastUpdated = timestamp;

          if (cdnDetection.isCDN) {
            stats.cdnCount++;
            
            // 新增：多 CDN 全域統計支援
            if (!stats.cdnBreakdown) {
              stats.cdnBreakdown = {};
            }
            
            // 統計主要 CDN
            const primaryCDN = cdnDetection.cdnType;
            if (!stats.cdnBreakdown[primaryCDN]) {
              stats.cdnBreakdown[primaryCDN] = {
                count: 0,
                hitCount: 0,
                missCount: 0,
                unknownCount: 0,
                totalSize: 0,
                hitSize: 0,
                missSize: 0,
                unknownSize: 0,
                totalTime: 0,
                hitTime: 0,
                missTime: 0,
                unknownTime: 0
              };
            }
            stats.cdnBreakdown[primaryCDN].count++;
            
            // 統計所有檢測到的 CDN
            cdnDetection.cdnTypes.forEach(cdnInfo => {
              const cdnName = cdnInfo.name;
              if (!stats.cdnBreakdown[cdnName]) {
                stats.cdnBreakdown[cdnName] = {
                  count: 0,
                  hitCount: 0,
                  missCount: 0,
                  unknownCount: 0,
                  totalSize: 0,
                  hitSize: 0,
                  missSize: 0,
                  unknownSize: 0,
                  totalTime: 0,
                  hitTime: 0,
                  missTime: 0,
                  unknownTime: 0
                };
              }
              
              // 只統計主要 CDN 的詳細資料
              if (cdnName === primaryCDN) {
                const cdnStats = stats.cdnBreakdown[cdnName];
                
                if (contentLength) {
                  cdnStats.totalSize += contentLength;
                }
                if (responseTime) {
                  cdnStats.totalTime += responseTime;
                }
                
                if (cdnDetection.isHit === true) {
                  cdnStats.hitCount++;
                  if (contentLength) {
                    cdnStats.hitSize += contentLength;
                  }
                  if (responseTime) {
                    cdnStats.hitTime += responseTime;
                  }
                } else if (cdnDetection.isHit === false) {
                  cdnStats.missCount++;
                  if (contentLength) {
                    cdnStats.missSize += contentLength;
                  }
                  if (responseTime) {
                    cdnStats.missTime += responseTime;
                  }
                } else {
                  cdnStats.unknownCount++;
                  if (contentLength) {
                    cdnStats.unknownSize += contentLength;
                  }
                  if (responseTime) {
                    cdnStats.unknownTime += responseTime;
                  }
                }
              }
            });
            
            // 保持原有的全域統計（向後相容）
            if (cdnDetection.isHit === true) {
              stats.hitCount++;
              if (contentLength) {
                stats.hitTotalSize += contentLength;
              }
              if (responseTime) {
                stats.hitTotalTime += responseTime;
              }
            } else if (cdnDetection.isHit === false) {
              stats.missCount++;
              if (contentLength) {
                stats.missTotalSize += contentLength;
              }
              if (responseTime) {
                stats.missTotalTime += responseTime;
              }
            } else {
              stats.unknownCacheCount++;
              if (contentLength) {
                stats.unknownTotalSize += contentLength;
              }
              if (responseTime) {
                stats.unknownTotalTime += responseTime;
              }
            }
            
            // 新增：計算全域 CDN 存取速度
            stats.cdnAccessSpeed = calculateCDNAccessSpeed(stats);
          } else {
            stats.nonCdnCount++;
          }

          chrome.storage.local.set({ cdnStats: stats });
        });
        
      } catch (error) {
        logMessage(`Error processing request: ${error.message}`, 'error');
        console.error('CDN Detection Error:', error);
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
  
  logMessage('CDN detection listener started successfully');
}

function stopListening() {
  if (!webRequestListener && !beforeRequestListener) return;

  if (webRequestListener) {
    chrome.webRequest.onCompleted.removeListener(webRequestListener);
    webRequestListener = null;
  }
  
  if (beforeRequestListener) {
    chrome.webRequest.onBeforeRequest.removeListener(beforeRequestListener);
    beforeRequestListener = null;
  }
  
  // 清理請求時間記錄
  requestStartTimes = {};
  
  chrome.action.setIcon({ path: 'icon-red.png' });
  
  logMessage('CDN detection listener stopped');
}

// 新增：定期清理舊日誌和過期的分頁資料（每小時執行一次）
setInterval(() => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const currentTime = Date.now();
  const maxAge = 30 * 60 * 1000; // 30分鐘
    
  // 清理超過 24 小時的除錯日誌
  chrome.storage.local.get(['debugLogs'], (result) => {
    if (result.debugLogs) {
      const filteredLogs = result.debugLogs.filter(entry => {
        const logTime = entry.match(/\[(.*?)\]/);
        return logTime && new Date(logTime[1]) > oneDayAgo;
      });
      
      if (filteredLogs.length !== result.debugLogs.length) {
        chrome.storage.local.set({ debugLogs: filteredLogs });
        logMessage(`Cleaned up old debug logs. Kept ${filteredLogs.length} recent entries.`);
      }
    }
  });
  
  // 清理過期的分頁資料
  Object.keys(tabDetectionData).forEach(tabId => {
    const tabData = tabDetectionData[tabId];
    if (tabData.cdnStats.lastUpdated) {
      const lastUpdated = new Date(tabData.cdnStats.lastUpdated).getTime();
      if (currentTime - lastUpdated > maxAge) {
        // 檢查分頁是否還存在
        chrome.tabs.get(parseInt(tabId), (tab) => {
          if (chrome.runtime.lastError) {
            // 分頁不存在，清理資料
            logMessage(`Cleaning up expired data for tab ${tabId}`, 'info');
            delete tabDetectionData[tabId];
          }
        });
      }
    }
  });
}, 60 * 60 * 1000); // 每小時執行一次

// ==================== 視頻品質監控系統 ====================

// 視頻品質數據存儲
let videoQualityData = {
  global: {
    totalVideos: 0,
    activeVideos: 0,
    lastUpdate: Date.now(),
    platforms: {},
    errors: []
  },
  tabs: {} // 按 tab 分組的視頻數據
};

// 視頻品質監控配置
const VIDEO_QUALITY_CONFIG = {
  MAX_VIDEOS_PER_TAB: 50,
  MAX_ERRORS: 100,
  DATA_RETENTION_HOURS: 24,
  UPDATE_INTERVAL: 5000 // 5 秒
};

// 初始化視頻品質數據結構
function initializeVideoQualityData(tabId) {
  if (!videoQualityData.tabs[tabId]) {
    videoQualityData.tabs[tabId] = {
      videos: {},
      platform: 'unknown',
      url: '',
      lastUpdate: Date.now(),
      totalVideos: 0,
      activeVideos: 0,
      errors: []
    };
  }
  return videoQualityData.tabs[tabId];
}

// 處理視頻品質更新
function handleVideoQualityUpdate(tabId, data) {
  try {
    const tabData = initializeVideoQualityData(tabId);
    
    // 更新標籤頁基本信息
    tabData.platform = data.platform || 'unknown';
    tabData.url = data.url || '';
    tabData.lastUpdate = Date.now();
    tabData.totalVideos = data.totalVideos || 0;
    tabData.activeVideos = data.activeVideos || 0;
    
    // 更新視頻數據
    if (data.videos && Array.isArray(data.videos)) {
      data.videos.forEach(video => {
        if (video.id) {
          tabData.videos[video.id] = {
            ...video,
            lastUpdate: Date.now()
          };
        }
      });
    }
    
    // 更新全域統計
    updateGlobalVideoQualityStats();
    
    // 保存到 storage
    saveVideoQualityData();
    
    logMessage(`Video quality data updated for tab ${tabId}: ${data.activeVideos} active videos`, 'info');
    
  } catch (error) {
    logMessage(`Error handling video quality update: ${error.message}`, 'error');
  }
}

// 更新全域視頻品質統計
function updateGlobalVideoQualityStats() {
  const global = videoQualityData.global;
  
  // 重置統計
  global.totalVideos = 0;
  global.activeVideos = 0;
  global.platforms = {};
  
  // 計算各標籤頁的統計
  Object.values(videoQualityData.tabs).forEach(tabData => {
    global.totalVideos += tabData.totalVideos;
    global.activeVideos += tabData.activeVideos;
    
    // 統計平台
    if (tabData.platform && tabData.platform !== 'unknown') {
      if (!global.platforms[tabData.platform]) {
        global.platforms[tabData.platform] = {
          tabs: 0,
          totalVideos: 0,
          activeVideos: 0
        };
      }
      
      global.platforms[tabData.platform].tabs++;
      global.platforms[tabData.platform].totalVideos += tabData.totalVideos;
      global.platforms[tabData.platform].activeVideos += tabData.activeVideos;
    }
  });
  
  global.lastUpdate = Date.now();
}

// 保存視頻品質數據到 storage
function saveVideoQualityData() {
  try {
    // 只保存必要的數據，避免存儲空間過大
    const dataToSave = {
      global: videoQualityData.global,
      tabCount: Object.keys(videoQualityData.tabs).length,
      lastUpdate: Date.now()
    };
    
    chrome.storage.local.set({ videoQualityData: dataToSave });
    
  } catch (error) {
    logMessage(`Error saving video quality data: ${error.message}`, 'error');
  }
}

// 獲取視頻品質數據
function getVideoQualityData(tabId = null) {
  if (tabId) {
    return videoQualityData.tabs[tabId] || null;
  }
  
  // 如果沒有指定tabId，嘗試獲取當前活躍標籤頁
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id || currentTabId;
      resolve({
        global: videoQualityData.global,
        currentTab: activeTabId ? videoQualityData.tabs[activeTabId] : null,
        tabIds: Object.keys(videoQualityData.tabs),
        activeTabId: activeTabId
      });
    });
  });
}

// 清理視頻品質數據
function cleanupVideoQualityData() {
  const now = Date.now();
  const maxAge = VIDEO_QUALITY_CONFIG.DATA_RETENTION_HOURS * 60 * 60 * 1000;
  
  Object.keys(videoQualityData.tabs).forEach(tabId => {
    const tabData = videoQualityData.tabs[tabId];
    
    // 檢查數據是否過期
    if (now - tabData.lastUpdate > maxAge) {
      // 檢查標籤頁是否還存在
      chrome.tabs.get(parseInt(tabId), (tab) => {
        if (chrome.runtime.lastError) {
          // 標籤頁不存在，刪除數據
          delete videoQualityData.tabs[tabId];
          logMessage(`Cleaned up video quality data for closed tab ${tabId}`, 'info');
        }
      });
    }
  });
  
  // 清理過期錯誤
  videoQualityData.global.errors = videoQualityData.global.errors.filter(
    error => now - error.timestamp < maxAge
  );
  
  // 更新全域統計
  updateGlobalVideoQualityStats();
}

// 處理視頻品質日誌
function handleVideoQualityLog(tabId, logData) {
  try {
    const tabData = initializeVideoQualityData(tabId);
    
    const logEntry = {
      ...logData,
      tabId: tabId,
      timestamp: Date.now()
    };
    
    // 添加到標籤頁錯誤列表
    if (logData.level === 'error') {
      tabData.errors.push(logEntry);
      
      // 限制錯誤數量
      if (tabData.errors.length > VIDEO_QUALITY_CONFIG.MAX_ERRORS) {
        tabData.errors = tabData.errors.slice(-50);
      }
      
      // 添加到全域錯誤列表
      videoQualityData.global.errors.push(logEntry);
      
      if (videoQualityData.global.errors.length > VIDEO_QUALITY_CONFIG.MAX_ERRORS) {
        videoQualityData.global.errors = videoQualityData.global.errors.slice(-50);
      }
    }
    
    logMessage(`Video quality log from tab ${tabId}: ${logData.message}`, logData.level);
    
  } catch (error) {
    logMessage(`Error handling video quality log: ${error.message}`, 'error');
  }
}



// 標籤頁事件監聽
chrome.tabs.onRemoved.addListener((tabId) => {
  if (videoQualityData.tabs[tabId]) {
    delete videoQualityData.tabs[tabId];
    updateGlobalVideoQualityStats();
    logMessage(`Cleaned up video quality data for removed tab ${tabId}`, 'info');
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 當標籤頁 URL 改變時，清理該標籤頁的視頻數據
  if (changeInfo.url && videoQualityData.tabs[tabId]) {
    const tabData = videoQualityData.tabs[tabId];
    if (tabData.url && tabData.url !== changeInfo.url) {
      // URL 改變，清理舊的視頻數據
      tabData.videos = {};
      tabData.totalVideos = 0;
      tabData.activeVideos = 0;
      tabData.url = changeInfo.url;
      tabData.lastUpdate = Date.now();
      
      logMessage(`URL changed for tab ${tabId}, cleared video data`, 'info');
    }
  }
});

// 定期清理視頻品質數據
setInterval(() => {
  cleanupVideoQualityData();
}, 10 * 60 * 1000); // 每 10 分鐘執行一次

// 初始化時載入保存的視頻品質數據
chrome.storage.local.get(['videoQualityData'], (result) => {
  if (result.videoQualityData) {
    videoQualityData.global = result.videoQualityData.global || videoQualityData.global;
    logMessage(`Loaded video quality data: ${result.videoQualityData.tabCount || 0} tabs`, 'info');
  }
});

logMessage('Video Quality Monitoring System initialized', 'info'); 