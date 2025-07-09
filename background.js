let cdnDetectionEnabled = false;
let webRequestListener = null;
let beforeRequestListener = null; // 新增：請求開始監聽器
let requestStartTimes = {}; // 新增：追蹤請求開始時間
let currentTabId = null; // 新增：當前活躍標籤頁 ID
let tabDetectionData = {}; // 新增：按標籤頁分組的檢測資料

// 新增：安全檢查器管理器
let securityManager = null;
let securityListener = null;
let securityInitPromise; // Promise for security manager initialization

// 新增：Manifest 攔截與解析系統
let manifestMap = {}; // 儲存解析的 manifest 資料，按 tabId 分組
let manifestRequestQueue = new Map(); // 處理中的 manifest 請求佇列

// 新增：Media Segment Monitoring 系統 (Task 22.2)
let mediaSegmentMap = {}; // 儲存媒體片段監控資料，按 tabId 分組
let segmentDownloadTimes = {}; // 追蹤片段下載時間
let segmentBandwidthData = {}; // 即時頻寬計算資料

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

// 新增：初始化安全檢查器管理器
async function initializeSecurityManager() {
  try {
    // 使用 importScripts 載入模組（Service Worker 環境）
    await loadSecurityManagerModule();
    
    // 創建 SecurityManager 實例
    if (typeof SecurityManager !== 'undefined') {
      securityManager = new SecurityManager();
      logMessage('SecurityManager instance created. Waiting for initPromise...', 'info');
      // 等待 SecurityManager 內部的初始化完成
      await securityManager.initPromise;
      logMessage('SecurityManager initialized successfully', 'info');
      return true;
    } else {
      throw new Error('SecurityManager not available after loading');
    }
  } catch (error) {
    logMessage(`Failed to initialize SecurityManager: ${error.message}`, 'error');
    // 拋出錯誤，讓 Promise 進入 rejected 狀態
    throw error;
  }
}

// 載入 SecurityManager 模組（Service Worker 兼容版本）
async function loadSecurityManagerModule() {
  try {
    // 載入所有必要的安全檢測模組
    importScripts('src/detectors/security/SecurityDetectionModule.js');
    importScripts('src/detectors/security/CSPDetector.js');
    importScripts('src/detectors/security/FrameProtectionDetector.js');
    importScripts('src/core/security-manager.js');
    
    logMessage('All security modules loaded via importScripts', 'info');
  } catch (error) {
    logMessage(`Security modules loading failed: ${error.message}`, 'error');
    throw error;
  }
}

// 在 Service Worker 啟動時立即初始化 SecurityManager，並保存其 Promise
securityInitPromise = initializeSecurityManager().catch(err => {
  logMessage(`Top-level securityInitPromise caught an error: ${err.message}`, 'error');
});

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

// 新增：Manifest 檔案檢測與解析系統
function isManifestFile(url) {
  const urlPath = url.split('?')[0]; // 移除查詢參數
  return urlPath.endsWith('.mpd') || urlPath.endsWith('.m3u8');
}

function getManifestType(url) {
  const urlPath = url.split('?')[0];
  if (urlPath.endsWith('.mpd')) return 'DASH';
  if (urlPath.endsWith('.m3u8')) return 'HLS';
  return 'UNKNOWN';
}

// 新增：Media Segment 檔案檢測系統 (Task 22.2)
function isMediaSegmentFile(url) {
  const urlPath = url.split('?')[0].toLowerCase(); // 移除查詢參數並轉小寫
  return urlPath.endsWith('.m4s') || 
         urlPath.endsWith('.ts') || 
         urlPath.endsWith('.m4a') || 
         urlPath.endsWith('.m4v') ||
         urlPath.includes('/segment') || // 常見的片段 URL 模式
         urlPath.includes('/chunk');     // 常見的片段 URL 模式
}

function getMediaSegmentType(url) {
  const urlPath = url.split('?')[0].toLowerCase();
  if (urlPath.endsWith('.m4s') || urlPath.endsWith('.m4v')) return 'DASH_VIDEO';
  if (urlPath.endsWith('.m4a')) return 'DASH_AUDIO';
  if (urlPath.endsWith('.ts')) return 'HLS_SEGMENT';
  if (urlPath.includes('/segment') || urlPath.includes('/chunk')) return 'GENERIC_SEGMENT';
  return 'UNKNOWN_SEGMENT';
}

async function fetchManifestContent(url) {
  try {
    logMessage(`Fetching manifest: ${url}`, 'debug');
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    
    logMessage(`Manifest fetched successfully: ${text.length} characters`, 'debug');
    return { text, contentType };
    
  } catch (error) {
    logMessage(`Failed to fetch manifest ${url}: ${error.message}`, 'error');
    throw error;
  }
}

// Task 23: DRM 系統解析函數
function parseDRMSystem(contentProtectionMatch, fullManifestText, index) {
  try {
    // DRM 系統 UUID 對應表
    const DRM_SYSTEMS = {
      'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed': 'Widevine',
      '9a04f079-9840-4286-ab92-e65be0885f95': 'PlayReady', 
      '94ce86fb-07ff-4f43-adb8-93d2fa968ca2': 'FairPlay',
      '1077efec-c0b2-4d02-ace3-3c1e52e2fb4b': 'ClearKey',
      '5e629af5-38da-4063-8977-97ffbd9902d4': 'Marlin',
      'adb41c24-2dbf-4a6d-958b-4457c0d27b95': 'Nagra',
      '80a6be7e-1448-4c37-9e70-d5aebe04c8d2': 'Irdeto',
      '644fe7b5-1f12-4f58-b05c-4c61c9410a0a': 'VCAS',
      '29701fe4-3cc7-4a34-8c5b-ae90c7439a47': 'Verimatrix',
      '35bf197b-530e-42d7-8b65-1b4bf415070f': 'DivX',
      'b4413586-c58c-ffb0-94a5-d4896c1af6c3': 'Adobe Primetime',
      'f239e769-efa3-4850-9c16-a903c6932efb': 'Adobe Access'
    };
    
    const result = {
      system: 'Unknown',
      details: {}
    };
    
    // 提取 schemeIdUri
    const schemeMatch = contentProtectionMatch.match(/schemeIdUri="([^"]*)"/i);
    if (schemeMatch) {
      const schemeUri = schemeMatch[1];
      result.details.schemeIdUri = schemeUri;
      
      // 檢查是否為 UUID 格式的 DRM 系統
      const uuidMatch = schemeUri.match(/urn:uuid:([a-f0-9-]+)/i);
      if (uuidMatch) {
        const uuid = uuidMatch[1].toLowerCase();
        result.system = DRM_SYSTEMS[uuid] || `Unknown UUID (${uuid})`;
        result.details.uuid = uuid;
      }
      // 檢查其他已知的 scheme
      else if (schemeUri.includes('mp4protection')) {
        result.system = 'CENC (Common Encryption)';
      }
      else if (schemeUri.includes('clearkey')) {
        result.system = 'ClearKey';
      }
    }
    
    // 提取 value 屬性
    const valueMatch = contentProtectionMatch.match(/value="([^"]*)"/i);
    if (valueMatch) {
      result.details.value = valueMatch[1];
    }
    
    // 提取 default_KID
    const kidMatch = contentProtectionMatch.match(/cenc:default_KID="([^"]*)"/i);
    if (kidMatch) {
      result.details.defaultKID = kidMatch[1];
    }
    
    // 檢查是否有 PSSH 數據
    const psshRegex = new RegExp(`<cenc:pssh[^>]*>([^<]*)</cenc:pssh>`, 'gi');
    const psshMatches = fullManifestText.match(psshRegex);
    if (psshMatches && psshMatches.length > index) {
      const psshMatch = psshMatches[index].match(/>([^<]*)</);
      if (psshMatch) {
        result.details.pssh = psshMatch[1].trim();
        result.details.hasPSSH = true;
      }
    }
    
    // 檢查 PlayReady 特定數據
    if (result.system === 'PlayReady') {
      const playreadyRegex = /<mspr:pro[^>]*>([^<]*)<\/mspr:pro>/gi;
      const playreadyMatch = fullManifestText.match(playreadyRegex);
      if (playreadyMatch && playreadyMatch.length > 0) {
        result.details.playreadyHeader = playreadyMatch[0];
        result.details.hasPlayReadyHeader = true;
      }
    }
    
    return result;
    
  } catch (error) {
    logMessage(`Error parsing DRM system: ${error.message}`, 'error');
    return null;
  }
}

function parseDashManifest(manifestText, baseUrl) {
  try {
    logMessage('Starting DASH manifest parsing with regex-based parser', 'debug');
    
    // 在 Service Worker 中使用正則表達式解析 XML，因為 DOMParser 不可用
    
    const manifestData = {
      type: 'DASH',
      baseUrl: baseUrl,
      representations: [],
      segments: [],
      drmProtection: false,
      parseTime: Date.now()
    };
    
    // Task 23: 增強 DRM 保護檢測 - 使用正則表達式
    const contentProtectionRegex = /<ContentProtection[^>]*>/gi;
    const contentProtectionMatches = manifestText.match(contentProtectionRegex);
    manifestData.drmProtection = contentProtectionMatches && contentProtectionMatches.length > 0;
    manifestData.drmSystems = [];
    manifestData.drmDetails = {};
    
    if (manifestData.drmProtection) {
      logMessage(`🔒 DRM Protection detected: ${contentProtectionMatches.length} ContentProtection elements`, 'info');
      
      // 解析 DRM 系統類型
      contentProtectionMatches.forEach((match, index) => {
        const drmInfo = parseDRMSystem(match, manifestText, index);
        if (drmInfo) {
          manifestData.drmSystems.push(drmInfo.system);
          manifestData.drmDetails[drmInfo.system] = drmInfo.details;
        }
      });
      
      logMessage(`🔐 DRM Systems detected: ${manifestData.drmSystems.join(', ')}`, 'info');
    }
    
    // 解析 Representation 元素 - 使用正則表達式
    const representationRegex = /<Representation[^>]*>/gi;
    const representationMatches = manifestText.match(representationRegex);
    
    if (representationMatches) {
      representationMatches.forEach((repMatch, index) => {
        // 提取屬性
        const idMatch = repMatch.match(/id="([^"]*)"/i);
        const bandwidthMatch = repMatch.match(/bandwidth="([^"]*)"/i);
        const widthMatch = repMatch.match(/width="([^"]*)"/i);
        const heightMatch = repMatch.match(/height="([^"]*)"/i);
        const mimeTypeMatch = repMatch.match(/mimeType="([^"]*)"/i);
        
        const id = idMatch ? idMatch[1] : `rep_${index}`;
        const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
        const width = widthMatch ? parseInt(widthMatch[1], 10) : 0;
        const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : '';
        
        // 計算解析度標籤
        let resolution = 'unknown';
        if (width && height) {
          resolution = `${width}x${height}`;
          // 標準解析度對應
          if (height <= 240) resolution += ' (240p)';
          else if (height <= 360) resolution += ' (360p)';
          else if (height <= 480) resolution += ' (480p)';
          else if (height <= 720) resolution += ' (720p)';
          else if (height <= 1080) resolution += ' (1080p)';
          else if (height <= 1440) resolution += ' (1440p)';
          else if (height <= 2160) resolution += ' (4K)';
          else resolution += ' (8K+)';
        }
        
        manifestData.representations.push({
          id,
          bandwidth,
          width,
          height,
          resolution,
          mimeType,
          bitrate: Math.round(bandwidth / 1000) // kbps
        });
      });
      
      // 簡化的段落解析 - 查找 SegmentTemplate 或 SegmentList
      const segmentTemplateRegex = /<SegmentTemplate[^>]*media="([^"]*)"[^>]*>/gi;
      const segmentTemplateMatches = manifestText.match(segmentTemplateRegex);
      
      if (segmentTemplateMatches) {
        segmentTemplateMatches.forEach(match => {
          const mediaMatch = match.match(/media="([^"]*)"/i);
          if (mediaMatch) {
            manifestData.segments.push({
              template: mediaMatch[1],
              type: 'template'
            });
          }
        });
      }
    }
    
    logMessage(`DASH manifest parsed: ${manifestData.representations.length} representations, DRM: ${manifestData.drmProtection}`, 'info');
    return manifestData;
    
  } catch (error) {
    logMessage(`Failed to parse DASH manifest: ${error.message}`, 'error');
    throw error;
  }
}

// Task 23: HLS DRM Key 解析函數
function parseHLSDRMKey(keyLine) {
  try {
    const result = {
      system: 'Unknown',
      details: {}
    };
    
    // 解析 METHOD
    const methodMatch = keyLine.match(/METHOD=([^,\s]+)/i);
    if (methodMatch) {
      const method = methodMatch[1];
      result.details.method = method;
      
      // 根據 method 判斷 DRM 系統
      switch (method.toUpperCase()) {
        case 'AES-128':
          result.system = 'AES-128 (Clear Key)';
          break;
        case 'SAMPLE-AES':
          result.system = 'Sample-AES';
          break;
        case 'SAMPLE-AES-CTR':
          result.system = 'Sample-AES-CTR';
          break;
        default:
          result.system = `HLS Encryption (${method})`;
      }
    }
    
    // 解析 URI
    const uriMatch = keyLine.match(/URI="([^"]+)"/i);
    if (uriMatch) {
      result.details.keyUri = uriMatch[1];
    }
    
    // 解析 IV
    const ivMatch = keyLine.match(/IV=0x([A-Fa-f0-9]+)/i);
    if (ivMatch) {
      result.details.iv = ivMatch[1];
    }
    
    // 解析 KEYFORMAT (用於識別 DRM 系統)
    const keyformatMatch = keyLine.match(/KEYFORMAT="([^"]+)"/i);
    if (keyformatMatch) {
      const keyformat = keyformatMatch[1];
      result.details.keyformat = keyformat;
      
      // 根據 keyformat 識別特定的 DRM 系統
      if (keyformat.includes('widevine')) {
        result.system = 'Widevine (HLS)';
      } else if (keyformat.includes('playready')) {
        result.system = 'PlayReady (HLS)';
      } else if (keyformat.includes('fairplay')) {
        result.system = 'FairPlay (HLS)';
      }
    }
    
    // 解析 KEYFORMATVERSIONS
    const keyformatVersionsMatch = keyLine.match(/KEYFORMATVERSIONS="([^"]+)"/i);
    if (keyformatVersionsMatch) {
      result.details.keyformatVersions = keyformatVersionsMatch[1];
    }
    
    return result;
    
  } catch (error) {
    logMessage(`Error parsing HLS DRM key: ${error.message}`, 'error');
    return null;
  }
}

function parseHlsManifest(manifestText, baseUrl) {
  try {
    const lines = manifestText.split('\n').map(line => line.trim()).filter(line => line);
    
    const manifestData = {
      type: 'HLS',
      baseUrl: baseUrl,
      representations: [],
      segments: [],
      drmProtection: false,
      parseTime: Date.now()
    };
    
    let currentStream = null;
    let isMainPlaylist = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 檢查是否為主播放列表
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        isMainPlaylist = true;
        const attributes = parseHlsAttributes(line);
        
        currentStream = {
          bandwidth: parseInt(attributes.BANDWIDTH) || 0,
          resolution: attributes.RESOLUTION || 'unknown',
          codecs: attributes.CODECS || '',
          bitrate: Math.round((parseInt(attributes.BANDWIDTH) || 0) / 1000)
        };
        
        // 解析解析度
        if (attributes.RESOLUTION) {
          const [width, height] = attributes.RESOLUTION.split('x').map(Number);
          currentStream.width = width;
          currentStream.height = height;
          
          // 標準解析度標籤
          let resolutionLabel = attributes.RESOLUTION;
          if (height <= 240) resolutionLabel += ' (240p)';
          else if (height <= 360) resolutionLabel += ' (360p)';
          else if (height <= 480) resolutionLabel += ' (480p)';
          else if (height <= 720) resolutionLabel += ' (720p)';
          else if (height <= 1080) resolutionLabel += ' (1080p)';
          else if (height <= 1440) resolutionLabel += ' (1440p)';
          else if (height <= 2160) resolutionLabel += ' (4K)';
          else resolutionLabel += ' (8K+)';
          
          currentStream.resolution = resolutionLabel;
        }
        
      } else if (currentStream && !line.startsWith('#')) {
        // 這是 stream URL
        currentStream.url = line;
        currentStream.id = `stream_${manifestData.representations.length}`;
        manifestData.representations.push(currentStream);
        currentStream = null;
      }
      
      // Task 23: 檢查 HLS DRM 保護
      if (line.startsWith('#EXT-X-KEY:')) {
        manifestData.drmProtection = true;
        
        // 初始化 DRM 系統陣列（如果尚未初始化）
        if (!manifestData.drmSystems) {
          manifestData.drmSystems = [];
          manifestData.drmDetails = {};
        }
        
        // 解析 HLS DRM 資訊
        const hlsDrmInfo = parseHLSDRMKey(line);
        if (hlsDrmInfo && !manifestData.drmSystems.includes(hlsDrmInfo.system)) {
          manifestData.drmSystems.push(hlsDrmInfo.system);
          manifestData.drmDetails[hlsDrmInfo.system] = hlsDrmInfo.details;
        }
      }
      
      // 檢查媒體片段（如果是媒體播放列表）
      if (line.startsWith('#EXTINF:')) {
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith('#')) {
          manifestData.segments.push({
            duration: parseFloat(line.split(':')[1]),
            url: nextLine
          });
          i++; // 跳過下一行，因為已經處理了
        }
      }
    }
    
    // 如果沒有找到 stream 資訊，可能是媒體播放列表
    if (!isMainPlaylist && manifestData.segments.length > 0) {
      manifestData.representations.push({
        id: 'default',
        bandwidth: 0,
        resolution: 'unknown',
        url: baseUrl
      });
    }
    
    logMessage(`HLS manifest parsed: ${manifestData.representations.length} streams, ${manifestData.segments.length} segments, DRM: ${manifestData.drmProtection}`, 'info');
    return manifestData;
    
  } catch (error) {
    logMessage(`Failed to parse HLS manifest: ${error.message}`, 'error');
    throw error;
  }
}

function parseHlsAttributes(line) {
  const attributes = {};
  const attributeString = line.split(':')[1];
  
  // 簡單的屬性解析（處理引號內的值）
  const regex = /([A-Z-]+)=([^,]+|"[^"]*")/g;
  let match;
  
  while ((match = regex.exec(attributeString)) !== null) {
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1); // 移除引號
    }
    attributes[match[1]] = value;
  }
  
  return attributes;
}

async function processManifestFile(url, tabId) {
  try {
    // 檢查是否已經在處理中
    const requestKey = `${tabId}_${url}`;
    if (manifestRequestQueue.has(requestKey)) {
      logMessage(`Manifest already being processed: ${url}`, 'debug');
      return;
    }
    
    manifestRequestQueue.set(requestKey, true);
    
    const manifestType = getManifestType(url);
    logMessage(`Processing ${manifestType} manifest: ${url}`, 'info');
    
    // 獲取 manifest 內容
    const { text } = await fetchManifestContent(url);
    
    // 解析 manifest
    let manifestData;
    if (manifestType === 'DASH') {
      manifestData = parseDashManifest(text, url);
    } else if (manifestType === 'HLS') {
      manifestData = parseHlsManifest(text, url);
    } else {
      throw new Error(`Unsupported manifest type: ${manifestType}`);
    }
    
    // 初始化標籤頁的 manifest 資料
    if (!manifestMap[tabId]) {
      manifestMap[tabId] = {
        tabId: tabId,
        manifests: {},
        lastUpdated: Date.now()
      };
    }
    
    // 儲存解析結果
    manifestMap[tabId].manifests[url] = manifestData;
    manifestMap[tabId].lastUpdated = Date.now();
    
    logMessage(`Manifest processed and stored for tab ${tabId}: ${url}`, 'info');
    
    // 移除處理佇列
    manifestRequestQueue.delete(requestKey);
    
    return manifestData;
    
  } catch (error) {
    logMessage(`Error processing manifest ${url}: ${error.message}`, 'error');
    manifestRequestQueue.delete(`${tabId}_${url}`);
    throw error;
  }
}

// Task 23: 增強媒體段 DRM 偵測功能
function detectSegmentDRM(url, responseHeaders) {
  try {
    const drmInfo = {
      protected: false,
      systems: [],
      details: {}
    };
    
    // 檢查 HTTP 標頭中的 DRM 相關資訊
    if (responseHeaders) {
      responseHeaders.forEach(header => {
        const headerName = header.name.toLowerCase();
        const headerValue = header.value;
        
        // 檢查常見的 DRM 相關標頭
        if (headerName === 'content-protection' || 
            headerName === 'x-content-protection' ||
            headerName === 'drm-system') {
          drmInfo.protected = true;
          drmInfo.details.headers = drmInfo.details.headers || {};
          drmInfo.details.headers[headerName] = headerValue;
        }
        
        // 檢查 Content-Type 中的加密指示
        if (headerName === 'content-type' && headerValue.includes('encrypted')) {
          drmInfo.protected = true;
          drmInfo.details.encryptedContentType = headerValue;
        }
        
        // 檢查 Widevine 相關標頭
        if (headerName.includes('widevine') || headerValue.includes('widevine')) {
          drmInfo.protected = true;
          drmInfo.systems.push('Widevine');
          drmInfo.details.widevine = headerValue;
        }
        
        // 檢查 PlayReady 相關標頭
        if (headerName.includes('playready') || headerValue.includes('playready')) {
          drmInfo.protected = true;
          drmInfo.systems.push('PlayReady');
          drmInfo.details.playready = headerValue;
        }
      });
    }
    
    // 基於 URL 模式的 DRM 偵測
    const urlLower = url.toLowerCase();
    if (urlLower.includes('drm') || 
        urlLower.includes('encrypted') || 
        urlLower.includes('protected')) {
      drmInfo.protected = true;
      drmInfo.details.urlPattern = 'DRM pattern detected in URL';
    }
    
    // 檢查 m4s 檔案的特定 DRM 模式
    if (url.endsWith('.m4s')) {
      // DASH 加密段通常包含特定的路徑模式
      if (urlLower.includes('enc') || 
          urlLower.includes('cenc') ||
          urlLower.includes('cbcs')) {
        drmInfo.protected = true;
        drmInfo.systems.push('CENC');
        drmInfo.details.encryptionScheme = 'Common Encryption';
      }
    }
    
    // 去重 DRM 系統
    drmInfo.systems = [...new Set(drmInfo.systems)];
    
    return drmInfo;
    
  } catch (error) {
    logMessage(`Error detecting segment DRM: ${error.message}`, 'error');
    return { protected: false, systems: [], details: {} };
  }
}

// 新增：Media Segment 處理函數 (Task 22.2 + Task 23 DRM 增強)
function processMediaSegment(details) {
  try {
    const { url, tabId, requestId, fromCache, responseHeaders, statusCode } = details;
    const segmentType = getMediaSegmentType(url);
    const timestamp = Date.now();
    
    logMessage(`📺 Media segment detected: ${url.substring(0, 100)}... [${segmentType}] (Tab: ${tabId})`, 'info');
    
    // Task 23: 檢測媒體段的 DRM 保護
    const segmentDRM = detectSegmentDRM(url, responseHeaders);
    if (segmentDRM.protected) {
      logMessage(`🔒 DRM protected segment detected: ${segmentDRM.systems.join(', ')}`, 'info');
    }
    
    // 初始化標籤頁的媒體片段資料
    if (!mediaSegmentMap[tabId]) {
      mediaSegmentMap[tabId] = {
        tabId: tabId,
        segments: [],
        stats: {
          totalSegments: 0,
          totalBytes: 0,
          totalDownloadTime: 0,
          averageBandwidth: 0,
          dashSegments: 0,
          hlsSegments: 0,
          failedSegments: 0,
          cachedSegments: 0,
          drmProtectedSegments: 0, // Task 23: 新增 DRM 保護段計數
          lastUpdated: timestamp
        },
        drmInfo: { // Task 23: 新增 DRM 資訊追蹤
          hasProtectedSegments: false,
          detectedSystems: [],
          protectionDetails: {}
        }
      };
    }
    
    // 獲取 Content-Length
    const contentLengthHeader = responseHeaders?.find(header => 
      header.name.toLowerCase() === 'content-length'
    );
    const contentLength = contentLengthHeader ? parseInt(contentLengthHeader.value, 10) : 0;
    
    // 計算下載時間
    const requestKey = `${requestId}_${tabId}`;
    const startTime = requestStartTimes[requestKey];
    const downloadTime = startTime ? timestamp - startTime : 0;
    
    // 計算即時頻寬 (bytes per second)
    let bandwidth = 0;
    if (downloadTime > 0 && contentLength > 0) {
      bandwidth = (contentLength * 1000) / downloadTime; // bytes/second
    }
    
    // 建立片段資料物件
    const segmentData = {
      url: url,
      segmentType: segmentType,
      drmProtected: segmentDRM.protected, // Task 23: 新增 DRM 保護狀態
      drmSystems: segmentDRM.systems,     // Task 23: 新增 DRM 系統資訊
      drmDetails: segmentDRM.details,     // Task 23: 新增 DRM 詳細資訊
      timestamp: timestamp,
      requestId: requestId,
      contentLength: contentLength,
      downloadTime: downloadTime,
      bandwidth: bandwidth,
      statusCode: statusCode,
      fromCache: fromCache || false,
      headers: responseHeaders || []
    };
    
    // 儲存片段資料
    const tabData = mediaSegmentMap[tabId];
    tabData.segments.push(segmentData);
    
    // 保持最近 200 個片段記錄
    if (tabData.segments.length > 200) {
      tabData.segments.splice(0, tabData.segments.length - 200);
    }
    
    // 更新統計資料
    updateMediaSegmentStats(tabId, segmentData);
    
    // 計算即時頻寬趨勢
    updateBandwidthTrend(tabId, bandwidth, timestamp);
    
    logMessage(`Segment processed: ${contentLength} bytes, ${downloadTime}ms, ${Math.round(bandwidth/1024)} KB/s`, 'debug');
    
  } catch (error) {
    logMessage(`Failed to process media segment: ${error.message}`, 'error');
  }
}

function updateMediaSegmentStats(tabId, segmentData) {
  const stats = mediaSegmentMap[tabId].stats;
  const drmInfo = mediaSegmentMap[tabId].drmInfo;
  
  stats.totalSegments++;
  stats.totalBytes += segmentData.contentLength || 0;
  stats.totalDownloadTime += segmentData.downloadTime || 0;
  stats.lastUpdated = segmentData.timestamp;
  
  // 計算平均頻寬
  if (stats.totalDownloadTime > 0) {
    stats.averageBandwidth = (stats.totalBytes * 1000) / stats.totalDownloadTime; // bytes/second
  }
  
  // 統計不同類型的片段
  if (segmentData.segmentType.includes('DASH')) {
    stats.dashSegments++;
  } else if (segmentData.segmentType.includes('HLS')) {
    stats.hlsSegments++;
  }
  
  // 統計失敗和快取的片段
  if (segmentData.statusCode >= 400) {
    stats.failedSegments++;
  }
  
  if (segmentData.fromCache) {
    stats.cachedSegments++;
  }
  
  // Task 23: 更新 DRM 相關統計
  if (segmentData.drmProtected) {
    stats.drmProtectedSegments++;
    drmInfo.hasProtectedSegments = true;
    
    // 更新偵測到的 DRM 系統列表
    segmentData.drmSystems.forEach(system => {
      if (!drmInfo.detectedSystems.includes(system)) {
        drmInfo.detectedSystems.push(system);
        logMessage(`🔐 New DRM system detected in segments: ${system}`, 'info');
      }
    });
    
    // 更新保護詳細資訊
    Object.assign(drmInfo.protectionDetails, segmentData.drmDetails);
  }
}

function updateBandwidthTrend(tabId, bandwidth, timestamp) {
  if (!segmentBandwidthData[tabId]) {
    segmentBandwidthData[tabId] = {
      samples: [],
      recentAverage: 0,
      peakBandwidth: 0,
      minBandwidth: Infinity
    };
  }
  
  const trendData = segmentBandwidthData[tabId];
  
  // 只記錄有效的頻寬數據
  if (bandwidth > 0) {
    trendData.samples.push({
      bandwidth: bandwidth,
      timestamp: timestamp
    });
    
    // 保持最近 50 個樣本
    if (trendData.samples.length > 50) {
      trendData.samples.splice(0, trendData.samples.length - 50);
    }
    
    // 更新統計
    trendData.peakBandwidth = Math.max(trendData.peakBandwidth, bandwidth);
    trendData.minBandwidth = Math.min(trendData.minBandwidth, bandwidth);
    
    // 計算最近 10 個樣本的平均頻寬
    const recentSamples = trendData.samples.slice(-10);
    const totalBandwidth = recentSamples.reduce((sum, sample) => sum + sample.bandwidth, 0);
    trendData.recentAverage = totalBandwidth / recentSamples.length;
    
    logMessage(`Bandwidth trend updated: Recent avg ${Math.round(trendData.recentAverage/1024)} KB/s, Peak ${Math.round(trendData.peakBandwidth/1024)} KB/s`, 'debug');
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

    // 安全檢測相關消息
    if (message.type === 'GET_SECURITY_STATUS') {
      securityInitPromise.then(() => {
        if (securityManager) {
          sendResponse({ success: true, status: securityManager.getStatus() });
        } else {
          sendResponse({ success: false, error: 'Security manager failed to initialize.' });
        }
      }).catch(error => {
        sendResponse({ success: false, error: `Security manager initialization failed: ${error.message}` });
      });
      return true; // 異步響應
    }

    if (message.type === 'GET_SECURITY_DATA') {
      getCurrentTabInfo(async (tab) => {
        if (!tab) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }
        try {
          await securityInitPromise; // 等待初始化
          if (!securityManager) {
            throw new Error('Security manager is not available after initialization.');
          }
          const data = await securityManager.getTabSecurityData(tab.id);
          sendResponse({ success: true, data: data });
        } catch (error) {
          logMessage(`Error getting security data: ${error.message}`, 'error');
          sendResponse({ success: false, error: error.message });
        }
      });
      return true; // 異步響應
    }
    
    // CDN 檢測相關消息
    if (message.type === 'ping' || message.type === 'PING') {
      sendResponse({ type: 'pong', status: 'ok', extensionId: chrome.runtime.id });
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
        
      // 新增：Manifest 相關訊息處理
      case 'GET_MANIFEST_DATA':
        const manifestTabId = message.tabId || tabId;
        
        if (manifestTabId && manifestMap[manifestTabId]) {
          const manifestData = manifestMap[manifestTabId];
          sendResponse({ 
            success: true, 
            data: manifestData,
            timestamp: Date.now()
          });
        } else {
          sendResponse({ 
            success: false, 
            error: 'No manifest data found for tab',
            data: null 
          });
        }
        break;
        
      case 'CLEAR_MANIFEST_DATA':
        const clearManifestTabId = message.tabId || tabId;
        if (clearManifestTabId && manifestMap[clearManifestTabId]) {
          delete manifestMap[clearManifestTabId];
          logMessage(`Cleared manifest data for tab ${clearManifestTabId}`, 'info');
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'No manifest data to clear' });
        }
        break;
        
      case 'GET_MANIFEST_STATS':
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTabId = tabs[0]?.id;
          const stats = {
            totalTabs: Object.keys(manifestMap).length,
            activeTabData: activeTabId ? manifestMap[activeTabId] : null,
            activeTabId: activeTabId,
            timestamp: Date.now()
          };
          
          // 計算總 manifest 數量
          let totalManifests = 0;
          let dashCount = 0;
          let hlsCount = 0;
          let drmCount = 0;
          
          Object.values(manifestMap).forEach(tabData => {
            Object.values(tabData.manifests).forEach(manifest => {
              totalManifests++;
              if (manifest.type === 'DASH') dashCount++;
              if (manifest.type === 'HLS') hlsCount++;
              if (manifest.drmProtection) drmCount++;
            });
          });
          
          stats.summary = {
            totalManifests,
            dashCount,
            hlsCount,
            drmCount
          };
          
          logMessage(`Returning manifest stats: ${totalManifests} manifests across ${stats.totalTabs} tabs`, 'debug');
          sendResponse({ success: true, stats: stats });
        });
        
        return true; // 保持消息通道開放
        break;
        
      // 新增：Media Segment 相關訊息處理 (Task 22.2)
      case 'GET_MEDIA_SEGMENT_DATA':
        const segmentTabId = message.tabId || tabId;
        
        if (segmentTabId && mediaSegmentMap[segmentTabId]) {
          const segmentData = mediaSegmentMap[segmentTabId];
          const bandwidthData = segmentBandwidthData[segmentTabId] || null;
          
          sendResponse({ 
            success: true, 
            data: {
              segments: segmentData,
              bandwidth: bandwidthData
            },
            timestamp: Date.now()
          });
        } else {
          sendResponse({ 
            success: false, 
            error: 'No media segment data found for tab',
            data: null 
          });
        }
        break;
        
      case 'CLEAR_MEDIA_SEGMENT_DATA':
        const clearSegmentTabId = message.tabId || tabId;
        if (clearSegmentTabId) {
          if (mediaSegmentMap[clearSegmentTabId]) {
            delete mediaSegmentMap[clearSegmentTabId];
          }
          if (segmentBandwidthData[clearSegmentTabId]) {
            delete segmentBandwidthData[clearSegmentTabId];
          }
          logMessage(`Cleared media segment data for tab ${clearSegmentTabId}`, 'info');
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Invalid tab ID' });
        }
        break;
        
      case 'DEBUG_MEDIA_SEGMENT_MAP':
        const debugInfo = {
          mediaSegmentMapKeys: Object.keys(mediaSegmentMap),
          segmentBandwidthDataKeys: Object.keys(segmentBandwidthData),
          mediaSegmentMapContent: mediaSegmentMap,
          segmentBandwidthDataContent: segmentBandwidthData,
          requestedTabId: message.tabId,
          messageTabId: tabId,
          timestamp: Date.now()
        };
        
        logMessage(`Debug media segment map: ${JSON.stringify(debugInfo, null, 2)}`, 'debug');
        sendResponse({ success: true, debug: debugInfo });
        break;
        
      case 'GET_MEDIA_SEGMENT_STATS':
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTabId = tabs[0]?.id;
          const stats = {
            totalTabs: Object.keys(mediaSegmentMap).length,
            activeTabData: activeTabId ? mediaSegmentMap[activeTabId] : null,
            activeTabBandwidth: activeTabId ? segmentBandwidthData[activeTabId] : null,
            activeTabId: activeTabId,
            timestamp: Date.now()
          };
          
          // 計算全域統計
          let totalSegments = 0;
          let totalBytes = 0;
          let totalDashSegments = 0;
          let totalHlsSegments = 0;
          let totalFailedSegments = 0;
          let totalCachedSegments = 0;
          
          Object.values(mediaSegmentMap).forEach(tabData => {
            const tabStats = tabData.stats;
            totalSegments += tabStats.totalSegments;
            totalBytes += tabStats.totalBytes;
            totalDashSegments += tabStats.dashSegments;
            totalHlsSegments += tabStats.hlsSegments;
            totalFailedSegments += tabStats.failedSegments;
            totalCachedSegments += tabStats.cachedSegments;
          });
          
          stats.summary = {
            totalSegments,
            totalBytes,
            totalDashSegments,
            totalHlsSegments,
            totalFailedSegments,
            totalCachedSegments,
            averageSegmentSize: totalSegments > 0 ? Math.round(totalBytes / totalSegments) : 0
          };
          
          logMessage(`Returning media segment stats: ${totalSegments} segments across ${stats.totalTabs} tabs`, 'debug');
          sendResponse({ success: true, stats: stats });
        });
        
        return true; // 保持消息通道開放
        break;
        
      // Task 22.4: QoE 指標相關訊息處理
      case 'GET_QOE_METRICS':
        const qoeTabId = message.tabId || tabId;
        
        if (qoeTabId && videoQualityData.tabs[qoeTabId]) {
          const qoeMetrics = qoeCalculator.calculateAllMetrics(qoeTabId);
          sendResponse({ 
            success: true, 
            qoeMetrics: qoeMetrics,
            tabId: qoeTabId,
            timestamp: Date.now()
          });
        } else {
          sendResponse({ 
            success: false, 
            error: 'No video quality data available for this tab',
            tabId: qoeTabId
          });
        }
        break;
        
      case 'GET_ALL_QOE_METRICS':
        try {
          const allQoEMetrics = {};
          
          Object.keys(videoQualityData.tabs).forEach(tabId => {
            const qoeMetrics = qoeCalculator.calculateAllMetrics(tabId);
            if (qoeMetrics) {
              allQoEMetrics[tabId] = qoeMetrics;
            }
          });
          
          sendResponse({ 
            success: true, 
            allQoEMetrics: allQoEMetrics,
            tabCount: Object.keys(allQoEMetrics).length,
            timestamp: Date.now()
          });
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
        break;
        
      case 'GET_QOE_THRESHOLDS':
        sendResponse({
          success: true,
          thresholds: qoeCalculator.thresholds,
          timestamp: Date.now()
        });
        break;
        
      case 'UPDATE_QOE_THRESHOLDS':
        if (message.thresholds) {
          Object.assign(qoeCalculator.thresholds, message.thresholds);
          sendResponse({
            success: true,
            updatedThresholds: qoeCalculator.thresholds,
            timestamp: Date.now()
          });
        } else {
          sendResponse({
            success: false,
            error: 'No thresholds provided'
          });
        }
        break;
        
      // 安全檢查器相關消息
      case 'GET_SECURITY_DATA':
        (async () => {
          try {
            if (!securityManager) {
              // 嘗試初始化 SecurityManager
              const success = await initializeSecurityManager();
              if (!success || !securityManager) {
                sendResponse({ 
                  success: false, 
                  error: 'Security manager not available' 
                });
                return;
              }
            }
            
            const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
            if (!tabId) {
              sendResponse({ 
                success: false, 
                error: 'No tab ID provided' 
              });
              return;
            }
            
            const securityData = await securityManager.getTabSecurityData(tabId);
            sendResponse({
              success: true,
              data: securityData,
              timestamp: Date.now()
            });
          } catch (error) {
            sendResponse({ 
              success: false, 
              error: error.message 
            });
          }
        })();
        return true; // 保持 sendResponse 活躍
        
      case 'GET_SECURITY_STATUS':
        try {
          if (securityManager) {
            const status = securityManager.getStatus();
            sendResponse({
              success: true,
              status: status,
              timestamp: Date.now()
            });
          } else {
            // SecurityManager 尚未初始化，嘗試重新初始化
            initializeSecurityManager().then(success => {
              const status = success && securityManager ? 
                securityManager.getStatus() : 
                { enabled: false, error: 'Security manager initialization failed' };
              
              sendResponse({
                success: true,
                status: status,
                timestamp: Date.now()
              });
            }).catch(error => {
              sendResponse({
                success: true,
                status: { enabled: false, error: `Security manager initialization error: ${error.message}` },
                timestamp: Date.now()
              });
            });
            return true; // 保持 sendResponse 活躍
          }
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
        break;
        
      case 'TOGGLE_SECURITY_MANAGER':
        try {
          if (!securityManager) {
            sendResponse({ 
              success: false, 
              error: 'Security manager not initialized' 
            });
            return;
          }
          
          const enabled = message.enabled;
          securityManager.setEnabled(enabled);
          
          sendResponse({
            success: true,
            enabled: enabled,
            timestamp: Date.now()
          });
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
        break;
        
      case 'GET_SECURITY_STATS':
        try {
          if (!securityManager) {
            sendResponse({ 
              success: false, 
              error: 'Security manager not initialized' 
            });
            return;
          }
          
          const stats = securityManager.getStatistics();
          sendResponse({
            success: true,
            stats: stats,
            timestamp: Date.now()
          });
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
        break;
        
      case 'GET_ALL_SECURITY_DATA':
        (async () => {
          try {
            if (!securityManager) {
              sendResponse({ 
                success: false, 
                error: 'Security manager not available' 
              });
              return;
            }
            
            const allData = await securityManager.getAllSecurityData();
            sendResponse({
              success: true,
              data: allData,
              timestamp: Date.now()
            });
          } catch (error) {
            sendResponse({ 
              success: false, 
              error: error.message 
            });
          }
        })();
        return true;
        
      case 'CHECK_LISTENERS':
        try {
          const listenerStatus = {
            securityListener: !!securityListener,
            webRequestListener: !!webRequestListener,
            beforeRequestListener: !!beforeRequestListener,
            securityManagerAvailable: !!securityManager
          };
          
          sendResponse({
            success: true,
            listeners: listenerStatus,
            timestamp: Date.now()
          });
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        }
        break;
        
      case 'MANUAL_SECURITY_CHECK':
        (async () => {
          try {
            if (!securityManager) {
              sendResponse({ 
                success: false, 
                error: 'Security manager not available' 
              });
              return;
            }
            
            const tabId = message.tabId;
            const url = message.url;
            
            if (!tabId || !url) {
              sendResponse({ 
                success: false, 
                error: 'Tab ID and URL are required' 
              });
              return;
            }
            
            // Get current tab to get real response headers
            const tab = await chrome.tabs.get(tabId);
            if (!tab) {
              sendResponse({ 
                success: false, 
                error: 'Tab not found' 
              });
              return;
            }
            
            // Simulate manual security check by re-requesting data
            const securityData = await securityManager.getTabSecurityData(tabId);
            
            sendResponse({
              success: true,
              result: securityData,
              timestamp: Date.now()
            });
          } catch (error) {
            sendResponse({ 
              success: false, 
              error: error.message 
            });
          }
        })();
        return true;
        
      case 'SIMULATE_SECURITY_REQUEST':
        (async () => {
          try {
            if (!securityManager) {
              sendResponse({ 
                success: false, 
                error: 'Security manager not available' 
              });
              return;
            }
            
            const simulatedDetails = message.details;
            if (!simulatedDetails) {
              sendResponse({ 
                success: false, 
                error: 'Details object is required' 
              });
              return;
            }
            
            // Manually trigger security check with simulated data
            const result = await securityManager.handleSecurityCheck(simulatedDetails);
            
            sendResponse({
              success: true,
              result: result,
              timestamp: Date.now()
            });
          } catch (error) {
            sendResponse({ 
              success: false, 
              error: error.message 
            });
          }
        })();
        return true;
        
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

// 新增：獨立的安全檢測監聽器
function startSecurityListener() {
  if (securityListener) {
    logMessage('Security listener already active, skipping start', 'warn');
    return;
  }
  
  if (!securityManager) {
    logMessage('SecurityManager not available, cannot start security listener', 'error');
    return;
  }
  
  logMessage('Starting independent security detection listener');
  
  securityListener = chrome.webRequest.onHeadersReceived.addListener(
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
        
        // 只處理主框架和子框架請求（包含安全標頭）
        if (details.type === 'main_frame' || details.type === 'sub_frame') {
          // 執行安全檢測（不阻塞）
          if (securityManager) {
            securityManager.handleSecurityCheck(details).catch(error => {
              logMessage(`Security check failed: ${error.message}`, 'error');
            });
          }
        }
      } catch (error) {
        logMessage(`Security listener error: ${error.message}`, 'error');
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
  
  logMessage('Security detection listener started successfully');
}

function stopSecurityListener() {
  if (securityListener) {
    chrome.webRequest.onHeadersReceived.removeListener(securityListener);
    securityListener = null;
    logMessage('Security detection listener stopped');
  }
}

function startListening() {
  if (webRequestListener || beforeRequestListener) {
    logMessage('Listener already active, skipping start', 'warn');
    return;
  }
  
  logMessage('Starting CDN detection listener');
  
  // 新增：初始化安全檢查器管理器
  initializeSecurityManager().then(success => {
    if (success) {
      logMessage('Security manager ready for operation', 'info');
      // 在這裡啟動安全監聽器
      if (!securityListener && securityManager) {
        securityListener = (details) => {
          // 非同步處理，不阻塞請求
          securityManager.handleSecurityCheck(details).catch(err => {
            logMessage(`Security check execution failed: ${err.message}`, 'error');
          });
        };
        chrome.webRequest.onHeadersReceived.addListener(
          securityListener,
          { urls: ['<all_urls>'], types: ['main_frame', 'sub_frame'] },
          ['responseHeaders']
        );
        logMessage('Security listener started for main_frame and sub_frame.');
      }
    } else {
      logMessage('Security manager failed to initialize, continuing without security checks', 'warn');
    }
  });
  
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
        
        // 新增：檢測並處理 manifest 檔案
        if (isManifestFile(url)) {
          logMessage(`🎬 Manifest file detected: ${url}`, 'info');
          // 異步處理 manifest，避免阻塞主要的 CDN 檢測流程
          processManifestFile(url, tabId).catch(error => {
            logMessage(`Manifest processing failed: ${error.message}`, 'error');
          });
        }
        
        const headers = details.responseHeaders || [];
        
        // 新增：檢測並處理媒體片段檔案 (Task 22.2)
        if (isMediaSegmentFile(url)) {
          logMessage(`🎵 Media segment detected: ${url}`, 'info');
          // 處理媒體片段，計算頻寬和下載時間
          processMediaSegment({
            url: url,
            tabId: tabId,
            requestId: details.requestId,
            fromCache: details.fromCache,
            responseHeaders: headers,
            statusCode: details.statusCode
          });
        } else {
          // 調試：記錄非媒體片段檔案
          if (url.includes('.m4s') || url.includes('.ts') || url.includes('.m4a') || url.includes('.m4v') || url.includes('segment') || url.includes('chunk')) {
            logMessage(`⚠️ URL contains media keywords but not detected as segment: ${url}`, 'warn');
          }
        }
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
            // chrome.action.setIcon({ path: 'icon.png' });
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
  if (!webRequestListener && !beforeRequestListener && !securityListener) return;

  if (securityListener) {
    chrome.webRequest.onHeadersReceived.removeListener(securityListener);
    securityListener = null;
    logMessage('Security listener stopped.');
  }

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
  
  chrome.action.setIcon({ path: 'icon.png' });
  
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

// Task 22.4: QoE Metric Calculation Engine
// 七個關鍵 QoE 指標計算引擎

const QOE_METRICS = {
  STREAM_DETECTION: 'stream_detection',
  RESOLUTION: 'resolution',
  DRM_PROTECTION: 'drm_protection',
  STARTUP_TIME: 'startup_time',
  REBUFFERING_RATIO: 'rebuffering_ratio',
  BITRATE_VS_BANDWIDTH: 'bitrate_vs_bandwidth',
  ERROR_RATE: 'error_rate',
  DOWNLOADED_DATA: 'downloaded_data'
};

// QoE 指標計算引擎
class QoEMetricCalculator {
  constructor() {
    this.metrics = new Map();
    this.thresholds = {
      goodStartupTime: 2000, // 2 秒
      acceptableStartupTime: 5000, // 5 秒
      lowRebufferingRatio: 0.01, // 1%
      highRebufferingRatio: 0.05, // 5%
      goodBandwidthUtilization: 0.8, // 80%
      lowErrorRate: 0.001, // 0.1%
      highErrorRate: 0.01 // 1%
    };
  }

  // 1. 串流檢測指標
  calculateStreamDetection(videoData, manifestData, segmentData) {
    try {
      const metric = {
        type: QOE_METRICS.STREAM_DETECTION,
        timestamp: Date.now(),
        detected: false,
        streamType: 'unknown',
        confidence: 0,
        score: 0,
        details: {}
      };

      // 檢查是否有視頻元素
      if (videoData && Object.keys(videoData).length > 0) {
        metric.detected = true;
        metric.confidence += 30;
      }

      // 檢查是否有 manifest 數據
      if (manifestData && Object.keys(manifestData).length > 0) {
        metric.detected = true;
        metric.confidence += 40;
        
        // 判斷串流類型
        const manifestTypes = Object.values(manifestData).map(m => m.type);
        if (manifestTypes.includes('DASH')) {
          metric.streamType = 'DASH';
        } else if (manifestTypes.includes('HLS')) {
          metric.streamType = 'HLS';
        }
      }

      // 檢查是否有媒體片段數據
      if (segmentData && Object.keys(segmentData).length > 0) {
        metric.detected = true;
        metric.confidence += 30;
      }

      metric.confidence = Math.min(metric.confidence, 100);
      metric.score = metric.detected ? (metric.confidence / 100) * 100 : 0;

      return metric;
    } catch (error) {
      logMessage(`Error calculating stream detection: ${error.message}`, 'error');
      return null;
    }
  }

  // 2. 即時串流解析度指標
  calculateResolution(videoData, manifestData) {
    try {
      const metric = {
        type: QOE_METRICS.RESOLUTION,
        timestamp: Date.now(),
        currentResolution: null,
        availableResolutions: [],
        adaptiveStreaming: false,
        score: 0,
        details: {}
      };

      // 從視頻元素獲取當前解析度
      if (videoData) {
        Object.values(videoData).forEach(video => {
          if (video.videoWidth && video.videoHeight) {
            const resolution = `${video.videoWidth}x${video.videoHeight}`;
            metric.currentResolution = resolution;
            
            // 計算解析度分數 (基於常見解析度標準)
            const height = video.videoHeight;
            if (height >= 2160) metric.score = 100; // 4K
            else if (height >= 1440) metric.score = 90; // 1440p
            else if (height >= 1080) metric.score = 80; // 1080p
            else if (height >= 720) metric.score = 70; // 720p
            else if (height >= 480) metric.score = 50; // 480p
            else metric.score = 30; // 低解析度
          }
        });
      }

      // 從 manifest 獲取可用解析度
      if (manifestData) {
        Object.values(manifestData).forEach(manifest => {
          if (manifest.representations) {
            manifest.representations.forEach(rep => {
              if (rep.width && rep.height) {
                const resolution = `${rep.width}x${rep.height}`;
                if (!metric.availableResolutions.includes(resolution)) {
                  metric.availableResolutions.push(resolution);
                }
              }
            });
          }
        });
        
        metric.adaptiveStreaming = metric.availableResolutions.length > 1;
      }

      return metric;
    } catch (error) {
      logMessage(`Error calculating resolution: ${error.message}`, 'error');
      return null;
    }
  }

  // 3. DRM 保護狀態指標 (Task 23 增強版)
  calculateDRMProtection(manifestData, videoData, segmentData) {
    try {
      const metric = {
        type: QOE_METRICS.DRM_PROTECTION,
        timestamp: Date.now(),
        protected: false,
        drmSystems: [],
        score: 100, // 預設為 100，DRM 不影響品質分數
        details: {
          manifestDRM: false,
          segmentDRM: false,
          drmSystemDetails: {},
          protectedSegmentRatio: 0,
          totalSegments: 0,
          protectedSegments: 0
        }
      };

      // 檢查 manifest 中的 DRM 資訊
      if (manifestData) {
        Object.values(manifestData).forEach(manifest => {
          if (manifest.drmProtection) {
            metric.protected = true;
            metric.details.manifestDRM = true;
            
            if (manifest.drmSystems) {
              metric.drmSystems = [...new Set([...metric.drmSystems, ...manifest.drmSystems])];
              
              // 收集 DRM 系統詳細資訊
              if (manifest.drmDetails) {
                Object.assign(metric.details.drmSystemDetails, manifest.drmDetails);
              }
            }
          }
        });
      }

      // Task 23: 檢查媒體段中的 DRM 資訊
      if (segmentData) {
        Object.values(segmentData).forEach(segmentInfo => {
          if (segmentInfo.drmInfo && segmentInfo.drmInfo.hasProtectedSegments) {
            metric.protected = true;
            metric.details.segmentDRM = true;
            
            // 合併媒體段偵測到的 DRM 系統
            if (segmentInfo.drmInfo.detectedSystems) {
              metric.drmSystems = [...new Set([...metric.drmSystems, ...segmentInfo.drmInfo.detectedSystems])];
            }
            
            // 收集媒體段保護詳細資訊
            if (segmentInfo.drmInfo.protectionDetails) {
              Object.assign(metric.details.drmSystemDetails, segmentInfo.drmInfo.protectionDetails);
            }
          }
          
          // 統計保護段比例
          if (segmentInfo.stats) {
            metric.details.totalSegments += segmentInfo.stats.totalSegments || 0;
            metric.details.protectedSegments += segmentInfo.stats.drmProtectedSegments || 0;
          }
        });
        
        // 計算保護段比例
        if (metric.details.totalSegments > 0) {
          metric.details.protectedSegmentRatio = 
            metric.details.protectedSegments / metric.details.totalSegments;
        }
      }

      // 去重 DRM 系統
      metric.drmSystems = [...new Set(metric.drmSystems)];
      
      // 記錄詳細的 DRM 偵測結果
      if (metric.protected) {
        logMessage(`🔒 DRM Protection Summary:`, 'info');
        logMessage(`  - Systems: ${metric.drmSystems.join(', ')}`, 'info');
        logMessage(`  - Manifest DRM: ${metric.details.manifestDRM}`, 'info');
        logMessage(`  - Segment DRM: ${metric.details.segmentDRM}`, 'info');
        if (metric.details.totalSegments > 0) {
          logMessage(`  - Protected segments: ${metric.details.protectedSegments}/${metric.details.totalSegments} (${Math.round(metric.details.protectedSegmentRatio * 100)}%)`, 'info');
        }
      }

      return metric;
    } catch (error) {
      logMessage(`Error calculating DRM protection: ${error.message}`, 'error');
      return null;
    }
  }

  // 4. 視頻啟動時間指標
  calculateStartupTime(videoData, eventHistory) {
    try {
      const metric = {
        type: QOE_METRICS.STARTUP_TIME,
        timestamp: Date.now(),
        startupTime: null,
        score: 0,
        details: {}
      };

      if (eventHistory && eventHistory.length > 0) {
        // 尋找 loadstart 到 canplay 或 play 事件的時間差
        const loadStartEvent = eventHistory.find(e => e.type === 'loadstart');
        const playableEvent = eventHistory.find(e => e.type === 'canplay' || e.type === 'play');

        if (loadStartEvent && playableEvent) {
          metric.startupTime = playableEvent.timestamp - loadStartEvent.timestamp;
          
          // 計算啟動時間分數
          if (metric.startupTime <= this.thresholds.goodStartupTime) {
            metric.score = 100;
          } else if (metric.startupTime <= this.thresholds.acceptableStartupTime) {
            metric.score = 80 - ((metric.startupTime - this.thresholds.goodStartupTime) / 
                                (this.thresholds.acceptableStartupTime - this.thresholds.goodStartupTime)) * 30;
          } else {
            metric.score = Math.max(20, 50 - (metric.startupTime - this.thresholds.acceptableStartupTime) / 1000 * 5);
          }
        }
      }

      return metric;
    } catch (error) {
      logMessage(`Error calculating startup time: ${error.message}`, 'error');
      return null;
    }
  }

  // 主要計算函數
  calculateAllMetrics(tabId) {
    try {
      const tabData = videoQualityData.tabs[tabId];
      if (!tabData) {
        return null;
      }

      const manifestData = manifestMap[tabId] || {};
      const segmentData = mediaSegmentMap[tabId] || {};
      const videoData = tabData.videos || {};
      const eventHistory = tabData.eventHistory || [];
      const errorHistory = tabData.errors || [];

      const metrics = [
        this.calculateStreamDetection(videoData, manifestData, segmentData),
        this.calculateResolution(videoData, manifestData),
        this.calculateDRMProtection(manifestData, videoData, segmentData), // Task 23: 傳遞媒體段資料
        this.calculateStartupTime(videoData, eventHistory)
      ].filter(metric => metric !== null);

      // 計算綜合分數
      let totalScore = 0;
      let validMetrics = 0;
      
      metrics.forEach(metric => {
        if (metric.score !== undefined) {
          totalScore += metric.score;
          validMetrics++;
        }
      });

      const overallScore = validMetrics > 0 ? Math.round(totalScore / validMetrics) : 0;

      return {
        tabId: tabId,
        metrics: metrics,
        overallScore: { score: overallScore, timestamp: Date.now() },
        timestamp: Date.now()
      };
    } catch (error) {
      logMessage(`Error calculating QoE metrics for tab ${tabId}: ${error.message}`, 'error');
      return null;
    }
  }
}

// 建立 QoE 計算器實例
const qoeCalculator = new QoEMetricCalculator();

// 視頻品質數據存儲
let videoQualityData = {
  global: {
    totalVideos: 0,
    activeVideos: 0,
    platforms: {},
    lastUpdate: Date.now(),
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
    
    // 更新事件歷史
    if (data.events && Array.isArray(data.events)) {
      if (!tabData.eventHistory) {
        tabData.eventHistory = [];
      }
      tabData.eventHistory.push(...data.events);
      
      // 限制事件歷史長度
      if (tabData.eventHistory.length > 1000) {
        tabData.eventHistory = tabData.eventHistory.slice(-500);
      }
    }
    
    // Task 22.4: 計算 QoE 指標
    if (tabData.activeVideos > 0) {
      const qoeMetrics = qoeCalculator.calculateAllMetrics(tabId);
      if (qoeMetrics) {
        tabData.qoeMetrics = qoeMetrics;
        logMessage(`QoE metrics calculated for tab ${tabId}: Overall score ${qoeMetrics.overallScore.score}`, 'info');
      }
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



// 標籤頁事件監聽（移至初始化區塊統一管理）

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

// ==================== 初始化系統 ====================

// 初始化 CDN 配置
initializeCDNConfigs();

// 監聽標籤頁更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 更新當前活躍標籤頁 ID
  if (changeInfo.status === 'complete' && tab.active) {
    currentTabId = tabId;
  }
  
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

// 監聽標籤頁切換事件
chrome.tabs.onActivated.addListener((activeInfo) => {
  currentTabId = activeInfo.tabId;
});

// 監聽標籤頁關閉事件
chrome.tabs.onRemoved.addListener((tabId) => {
  // 清理標籤頁相關資料
  delete tabDetectionData[tabId];
  delete manifestMap[tabId];
  delete mediaSegmentMap[tabId];
  delete segmentBandwidthData[tabId];
  
  // 清理視頻品質資料
  if (videoQualityData.tabs[tabId]) {
    delete videoQualityData.tabs[tabId];
    updateGlobalVideoQualityStats();
  }
  
  // 清理請求時間記錄
  Object.keys(requestStartTimes).forEach(key => {
    if (key.includes(`_${tabId}`)) {
      delete requestStartTimes[key];
    }
  });
  
  logMessage(`Cleaned up all data for closed tab ${tabId}`, 'info');
});

// 初始化時載入保存的配置
chrome.storage.local.get(['cdnDetectionEnabled'], (result) => {
  cdnDetectionEnabled = result.cdnDetectionEnabled || false;
  
  if (cdnDetectionEnabled) {
    startListening();
    logMessage('CDN detection enabled on startup', 'info');
  } else {
    logMessage('CDN detection disabled on startup', 'info');
  }
});

// 獨立初始化 SecurityManager（不依賴 CDN 檢測狀態）
initializeSecurityManager().then(success => {
  if (success) {
    logMessage('SecurityManager initialized independently on startup', 'info');
    // 啟動獨立的安全檢測監聽器
    startSecurityListener();
  } else {
    logMessage('SecurityManager failed to initialize on startup', 'warn');
  }
}).catch(error => {
  logMessage(`SecurityManager startup initialization error: ${error.message}`, 'error');
});

chrome.action.setIcon({ path: 'icon.png' });

logMessage('Background script initialized successfully', 'info'); 