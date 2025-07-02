// Task 23: DRM 偵測測試 JavaScript

// 全域變數
let testProgress = 0;
let totalTests = 0;
let drmResults = {};

// 日誌管理
function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logContainer = document.getElementById('logContainer');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLogs() {
    const logContainer = document.getElementById('logContainer');
    logContainer.innerHTML = '';
    addLog('日誌已清除', 'info');
}

// 進度管理
function updateProgress(current, total, text) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    const percentage = total > 0 ? (current / total) * 100 : 0;
    progressFill.style.width = `${percentage}%`;
    progressText.textContent = text || `進度: ${current}/${total} (${Math.round(percentage)}%)`;
}

// 擴充功能狀態檢查
async function checkExtensionStatus() {
    addLog('🔍 檢查 CDN Detector 擴充功能狀態...', 'info');
    const statusElement = document.getElementById('extensionStatus');
    
    try {
        // 檢查是否在 Chrome 環境中
        if (typeof chrome === 'undefined' || !chrome.runtime) {
            statusElement.className = 'status warning';
            statusElement.textContent = '⚠️ 非 Chrome 環境或擴充功能未安裝';
            addLog('⚠️ 無法檢測到 Chrome 擴充功能 API', 'warning');
            return false;
        }

        // 嘗試與背景腳本通信
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({action: 'ping'}, (response) => {
                if (chrome.runtime.lastError) {
                    statusElement.className = 'status error';
                    statusElement.textContent = '❌ 擴充功能未回應或未啟用';
                    addLog(`❌ 擴充功能通信失敗: ${chrome.runtime.lastError.message}`, 'error');
                    resolve(false);
                } else {
                    statusElement.className = 'status success';
                    statusElement.textContent = '✅ CDN Detector 擴充功能運行正常';
                    addLog('✅ 擴充功能狀態正常', 'success');
                    resolve(true);
                }
            });
        });
    } catch (error) {
        statusElement.className = 'status error';
        statusElement.textContent = `❌ 檢查失敗: ${error.message}`;
        addLog(`❌ 狀態檢查失敗: ${error.message}`, 'error');
        return false;
    }
}

// 本地 DRM 解析測試
async function testLocalDRMParsing() {
    addLog('🧪 開始本地 DRM 解析測試...', 'info');
    totalTests = 6;
    testProgress = 0;
    
    updateProgress(0, totalTests, '初始化本地 DRM 測試...');
    
    try {
        // 測試 1: Widevine 偵測
        updateProgress(++testProgress, totalTests, '測試 Widevine 偵測...');
        await testWidevineDetection();
        
        // 測試 2: PlayReady 偵測
        updateProgress(++testProgress, totalTests, '測試 PlayReady 偵測...');
        await testPlayReadyDetection();
        
        // 測試 3: FairPlay 偵測
        updateProgress(++testProgress, totalTests, '測試 FairPlay 偵測...');
        await testFairPlayDetection();
        
        // 測試 4: CENC 偵測
        updateProgress(++testProgress, totalTests, '測試 CENC 偵測...');
        await testCENCDetection();
        
        // 測試 5: 多重 DRM 系統
        updateProgress(++testProgress, totalTests, '測試多重 DRM 系統...');
        await testMultipleDRMSystems();
        
        // 測試 6: HLS DRM 偵測
        updateProgress(++testProgress, totalTests, '測試 HLS DRM 偵測...');
        await testHLSDRMDetection();
        
        updateProgress(totalTests, totalTests, '✅ 本地 DRM 解析測試完成！');
        addLog('✅ 所有本地 DRM 解析測試完成', 'success');
        
        displayDRMResults();
        
    } catch (error) {
        addLog(`❌ 本地 DRM 測試失敗: ${error.message}`, 'error');
        updateProgress(testProgress, totalTests, `❌ 測試失敗: ${error.message}`);
    }
}

// 個別 DRM 系統測試函數
async function testWidevineDetection() {
    addLog('🔐 測試 Widevine DRM 偵測...', 'info');
    
    const widevineCP = '<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">';
    const result = parseDRMSystemLocal(widevineCP, '', 0);
    
    if (result && result.system === 'Widevine') {
        addLog('✅ Widevine 偵測成功', 'success');
        drmResults.widevine = { status: 'success', details: result };
    } else {
        addLog('❌ Widevine 偵測失敗', 'error');
        drmResults.widevine = { status: 'failed', details: result };
    }
}

async function testPlayReadyDetection() {
    addLog('🔐 測試 PlayReady DRM 偵測...', 'info');
    
    const playreadyCP = '<ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95">';
    const result = parseDRMSystemLocal(playreadyCP, '', 0);
    
    if (result && result.system === 'PlayReady') {
        addLog('✅ PlayReady 偵測成功', 'success');
        drmResults.playready = { status: 'success', details: result };
    } else {
        addLog('❌ PlayReady 偵測失敗', 'error');
        drmResults.playready = { status: 'failed', details: result };
    }
}

async function testFairPlayDetection() {
    addLog('🔐 測試 FairPlay DRM 偵測...', 'info');
    
    const fairplayCP = '<ContentProtection schemeIdUri="urn:uuid:94ce86fb-07ff-4f43-adb8-93d2fa968ca2">';
    const result = parseDRMSystemLocal(fairplayCP, '', 0);
    
    if (result && result.system === 'FairPlay') {
        addLog('✅ FairPlay 偵測成功', 'success');
        drmResults.fairplay = { status: 'success', details: result };
    } else {
        addLog('❌ FairPlay 偵測失敗', 'error');
        drmResults.fairplay = { status: 'failed', details: result };
    }
}

async function testCENCDetection() {
    addLog('🔐 測試 CENC (Common Encryption) 偵測...', 'info');
    
    const cencCP = '<ContentProtection xmlns:cenc="urn:mpeg:cenc:2013" schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" cenc:default_KID="b468a4a4-7f0a-3a2c-12a2-1751c99159bf"/>';
    const result = parseDRMSystemLocal(cencCP, '', 0);
    
    if (result && result.system === 'CENC (Common Encryption)') {
        addLog('✅ CENC 偵測成功', 'success');
        addLog(`🔑 偵測到 KID: ${result.details.defaultKID}`, 'info');
        drmResults.cenc = { status: 'success', details: result };
    } else {
        addLog('❌ CENC 偵測失敗', 'error');
        drmResults.cenc = { status: 'failed', details: result };
    }
}

async function testHLSDRMDetection() {
    addLog('🔐 測試 HLS DRM 偵測...', 'info');
    
    // 測試 AES-128 加密
    const aesKey = '#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key.bin",IV=0x12345678901234567890123456789012';
    const aesResult = parseHLSDRMKeyLocal(aesKey);
    
    if (aesResult && aesResult.system.includes('AES-128')) {
        addLog('✅ HLS AES-128 偵測成功', 'success');
        drmResults.hls_aes = { status: 'success', details: aesResult };
    } else {
        addLog('❌ HLS AES-128 偵測失敗', 'error');
        drmResults.hls_aes = { status: 'failed', details: aesResult };
    }
    
    // 測試 Sample-AES 加密
    const sampleAesKey = '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="https://example.com/key.bin",KEYFORMAT="com.apple.streamingkeydelivery"';
    const sampleAesResult = parseHLSDRMKeyLocal(sampleAesKey);
    
    if (sampleAesResult && sampleAesResult.system.includes('Sample-AES')) {
        addLog('✅ HLS Sample-AES 偵測成功', 'success');
        drmResults.hls_sample_aes = { status: 'success', details: sampleAesResult };
    } else {
        addLog('❌ HLS Sample-AES 偵測失敗', 'error');
        drmResults.hls_sample_aes = { status: 'failed', details: sampleAesResult };
    }
}

// GagaOOLala MPD 測試
async function testGagaOOLalaMPD() {
    addLog('📺 開始測試 GagaOOLala MPD 解析...', 'info');
    totalTests = 1;
    testProgress = 0;
    
    updateProgress(0, totalTests, '載入 GagaOOLala MPD 範例...');
    
    const gagaoolalaMPD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" xmlns:ns2="http://www.w3.org/1999/xlink" id="cff56590-d157-488d-bfc6-81359cfc45df" profiles="urn:mpeg:dash:profile:isoff-live:2011,urn:com:dashif:dash264" type="static" mediaPresentationDuration="P0Y0M0DT0H47M41.960S" minBufferTime="P0Y0M0DT0H0M2.000S">
  <Period id="ebec6043-3c60-4e9d-9d02-8d87c026ba8e">
    <AdaptationSet segmentAlignment="true" mimeType="video/mp4">
      <ContentProtection xmlns:cenc="urn:mpeg:cenc:2013" schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc" cenc:default_KID="b468a4a4-7f0a-3a2c-12a2-1751c99159bf"/>
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
        <cenc:pssh xmlns:cenc="urn:mpeg:cenc:2013">AAAAQ3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAACMIARIQAAECAwQFBgcICQoLDA0ODxoKaW50ZXJ0cnVzdCIBKg==</cenc:pssh>
      </ContentProtection>
      <ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95">
        <cenc:pssh xmlns:cenc="urn:mpeg:cenc:2013">AAACxnBzc2gAAAAAmgTweZhAQoarkuZb4IhflQAAAqamAgAAAQABAJwCPABXAFIATQBIAEUAQQBEAEUAUgAgAHgAbQBsAG4AcwA9ACIAaAB0AHQAcAA6AC8ALwBzAGMAaABlAG0AYQBzAC4AbQBpAGMAcgBvAHMAbwBmAHQALgBjAG8AbQAvAEQAUgBNAC8AMgAwADAANwAvADAAMwAvAFAAbABhAHkAUgBlAGEAZAB5AEgAZQBhAGQAZQByACIAIAB2AGUAcgBzAGkAbwBuAD0AIgA0AC4AMAAuADAALgAwACIAPgA8AEQAQQBUAEEAPgA8AFAAUgBPAFQARQBDAFQASQBOAEYATwA+ADwASwBFAFkATABFAE4APgAxADYAPAAvAEsARQBZAEwARQBOAD4APABBAEwARwBJAEQAPgBBAEUAUwBDAFQAUgA8AC8AQQBMAEcASQBEAD4APAAvAFAAUgBPAFQARQBDAFQASQBOAEYATwA+ADwASwBJAEQAPgBwAEsAUgBvAHQAQQBwAC8ATABEAG8AUwBvAGgAZABSAHkAWgBGAFoAdgB3AD0APQA8AC8ASwBJAEQAPgA8AEMASABFAEMASwBTAFUATQA+AEEAVwB1AG4AdQBKAHMAcQBwAHoAYwA9ADwALwBDAEgARQBDAEsAUwBVAE0APgA8AEwAQQBfAFUAUgBMAD4AaAB0AHQAcABzADoALwAvAHAAcgAuAHMAZQByAHYAaQBjAGUALgBlAHgAcAByAGUAcwBzAHAAbABhAHkALgBjAG8AbQAvAHAAbABhAHkAcgBlAGEAZAB5AC8AUgBpAGcAaAB0AHMATQBhAG4AYQBnAGUAcgAuAGEAcwBtAHgAPAAvAEwAQQBfAFUAUgBMAD4APAAvAEQAQQBUAEEAPgA8AC8AVwBSAE0ASABFAEEARABFAFIAPgA=</cenc:pssh>
        <mspr:pro xmlns:mspr="urn:microsoft:playready">pgIAAAEAAQCcAjwAVwBSAE0ASABFAEEARABFAFIAIAB4AG0AbABuAHMAPQAiAGgAdAB0AHAAOgAvAC8AcwBjAGgAZQBtAGEAcwAuAG0AaQBjAHIAbwBzAG8AZgB0AC4AYwBvAG0ALwBEAFIATQAvADIAMAAwADcALwAwADMALwBQAGwAYQB5AFIAZQBhAGQAeQBIAGUAYQBkAGUAcgAiACAAdgBlAHIAcwBpAG8AbgA9ACIANAAuADAALgAwAC4AMAAiAD4APABEAEEAVABBAD4APABQAFIATwBUAEUAQwBUAEkATgBGAE8APgA8AEsARQBZAEwARQBOAD4AMQA2ADwALwBLAEUAWQBMAEUATgA+ADwAQQBMAEcASQBEAD4AQQBFAFMAQwBUAFIAPAAvAEEATABHAEkARAA+ADwALwBQAFIATwBUAEUAQwBUAEkATgBGAE8APgA8AEsASQBEAD4AcABLAFIAbwB0AEEAcAAvAEwARABvAFMAbwBoAGQAUgB5AFoARgBaAHYAdwA9AD0APAAvAEsASQBEAD4APABDAEgARQBDAEsAUwBVAE0APgBBAFcAdQBuAHUASgBzAHEAcAB6AGMAPQA8AC8AQwBIAEUAQwBLAFMAVQBNAD4APABMAEEAXwBVAFIATAA+AGgAdAB0AHAAcwA6AC8ALwBwAHIALgBzAGUAcgB2AGkAYwBlAC4AZQB4AHAAcgBlAHMAcwBwAGwAYQB5AC4AYwBvAG0ALwBwAGwAYQB5AHIAZQBhAGQAeQAvAFIAaQBnAGgAdABzAE0AYQBuAGEAZwBlAHIALgBhAHMAbQB4ADwALwBMAEEAXwBVAFIATAA+ADwALwBEAEEAVABBAD4APAAvAFcAUgBNAEgARQBBAEQARQBSAD4A</mspr:pro>
      </ContentProtection>
      <Representation id="8788d20f-17ea-449a-8e7b-054b0fb2cb10" bandwidth="4300000" width="1920" height="1080" frameRate="25" codecs="avc1.640028">
        <SegmentTemplate media="video/1080p/dash/segment_$Number$.m4s" initialization="video/1080p/dash/init.mp4" duration="100000" startNumber="0" timescale="25000"/>
      </Representation>
      <Representation id="54ec4e65-f39b-4029-87c5-a0c1feec2742" bandwidth="2400000" width="1280" height="720" frameRate="25" codecs="avc1.64001F">
        <SegmentTemplate media="video/720p/dash/segment_$Number$.m4s" initialization="video/720p/dash/init.mp4" duration="100000" startNumber="0" timescale="25000"/>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    try {
        updateProgress(++testProgress, totalTests, '解析 MPD 內容...');
        await analyzeMPDContent(gagaoolalaMPD, 'GagaOOLala');
        
        updateProgress(totalTests, totalTests, '✅ GagaOOLala MPD 解析完成！');
        addLog('✅ GagaOOLala MPD 解析測試完成', 'success');
        
        displayDRMResults();
        
    } catch (error) {
        addLog(`❌ GagaOOLala MPD 測試失敗: ${error.message}`, 'error');
        updateProgress(testProgress, totalTests, `❌ 測試失敗: ${error.message}`);
    }
}

// 多重 DRM 系統測試
async function testMultipleDRMSystems() {
    addLog('🔐 測試多重 DRM 系統偵測...', 'info');
    
    const multipleDRMMPD = `
    <AdaptationSet>
        <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"/>
        <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>
        <ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95"/>
        <ContentProtection schemeIdUri="urn:uuid:94ce86fb-07ff-4f43-adb8-93d2fa968ca2"/>
    </AdaptationSet>`;
    
    await analyzeMPDContent(multipleDRMMPD, '多重 DRM 系統');
}

// MPD 內容分析
async function analyzeMPDContent(mpdContent, source) {
    addLog(`🔍 分析 ${source} MPD 內容...`, 'info');
    
    try {
        // 檢測 ContentProtection 元素
        const contentProtectionRegex = /<ContentProtection[^>]*>/gi;
        const matches = mpdContent.match(contentProtectionRegex);
        
        if (matches && matches.length > 0) {
            addLog(`🔒 發現 ${matches.length} 個 ContentProtection 元素`, 'success');
            
            const detectedSystems = [];
            
            matches.forEach((match, index) => {
                const drmInfo = parseDRMSystemLocal(match, mpdContent, index);
                if (drmInfo) {
                    addLog(`🔐 DRM 系統 ${index + 1}: ${drmInfo.system}`, 'success');
                    detectedSystems.push(drmInfo.system);
                    
                    if (drmInfo.details.uuid) {
                        addLog(`  📋 UUID: ${drmInfo.details.uuid}`, 'info');
                    }
                    if (drmInfo.details.defaultKID) {
                        addLog(`  🔑 KID: ${drmInfo.details.defaultKID}`, 'info');
                    }
                    if (drmInfo.details.value) {
                        addLog(`  📊 Value: ${drmInfo.details.value}`, 'info');
                    }
                }
            });
            
            // 儲存結果
            drmResults[source.toLowerCase().replace(/\s+/g, '_')] = {
                status: 'success',
                systems: detectedSystems,
                count: matches.length
            };
            
        } else {
            addLog(`❌ 在 ${source} 中未發現 DRM 保護`, 'warning');
            drmResults[source.toLowerCase().replace(/\s+/g, '_')] = {
                status: 'no_drm',
                systems: [],
                count: 0
            };
        }
        
        // 解析 Representation 資訊
        const representationRegex = /<Representation[^>]*>/gi;
        const repMatches = mpdContent.match(representationRegex);
        if (repMatches) {
            addLog(`📺 發現 ${repMatches.length} 個 Representation`, 'info');
            repMatches.forEach((rep, index) => {
                const bandwidthMatch = rep.match(/bandwidth="([^"]*)"/i);
                const widthMatch = rep.match(/width="([^"]*)"/i);
                const heightMatch = rep.match(/height="([^"]*)"/i);
                
                if (bandwidthMatch || widthMatch || heightMatch) {
                    const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
                    const resolution = (widthMatch && heightMatch) ? 
                        `${widthMatch[1]}x${heightMatch[1]}` : 'N/A';
                    const bitrateMbps = bandwidth > 0 ? (bandwidth / 1000000).toFixed(1) : 'N/A';
                    addLog(`  📊 Rep ${index + 1}: ${resolution}, ${bitrateMbps} Mbps`, 'info');
                }
            });
        }
        
    } catch (error) {
        addLog(`❌ ${source} MPD 解析錯誤: ${error.message}`, 'error');
        throw error;
    }
}

// 分析頁面中的 MPD 範例
function analyzeMPDSample() {
    const mpdSample = document.getElementById('mpdSample').textContent;
    // 將 HTML 實體轉換回 XML
    const mpdContent = mpdSample
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
    
    addLog('🔍 分析頁面中的 MPD 範例...', 'info');
    analyzeMPDContent(mpdContent, 'MPD 範例');
}

// 顯示 DRM 測試結果
function displayDRMResults() {
    const resultsContainer = document.getElementById('drmResults');
    
    if (Object.keys(drmResults).length === 0) {
        resultsContainer.innerHTML = '<div class="status info">尚未執行 DRM 偵測測試</div>';
        return;
    }
    
    let html = '<div class="test-result">';
    html += '<h4>🔒 DRM 偵測測試結果</h4>';
    
    let successCount = 0;
    let totalCount = 0;
    
    Object.entries(drmResults).forEach(([key, result]) => {
        totalCount++;
        const systemName = key.replace(/_/g, ' ').toUpperCase();
        
        if (result.status === 'success') {
            successCount++;
            html += `<div class="drm-system">✅ ${systemName}: ${result.details?.system || result.systems?.join(', ') || '偵測成功'}</div>`;
        } else if (result.status === 'no_drm') {
            html += `<div class="drm-system">ℹ️ ${systemName}: 無 DRM 保護</div>`;
        } else {
            html += `<div class="drm-system">❌ ${systemName}: 偵測失敗</div>`;
        }
    });
    
    html += `<div style="margin-top: 15px; font-weight: bold;">`;
    html += `📊 總結: ${successCount}/${totalCount} 項測試通過`;
    html += `</div></div>`;
    
    resultsContainer.innerHTML = html;
}

// 本地 DRM 解析函數（簡化版，對應背景腳本中的實作）
function parseDRMSystemLocal(contentProtectionMatch, fullManifestText, index) {
    try {
        const DRM_SYSTEMS = {
            'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed': 'Widevine',
            '9a04f079-9840-4286-ab92-e65be0885f95': 'PlayReady',
            '94ce86fb-07ff-4f43-adb8-93d2fa968ca2': 'FairPlay',
            '1077efec-c0b2-4d02-ace3-3c1e52e2fb4b': 'ClearKey',
            '5e629af5-38da-4063-8977-97ffbd9902d4': 'Marlin',
            'adb41c24-2dbf-4a6d-958b-4457c0d27b95': 'Nagra',
            '80a6be7e-1448-4c37-9e70-d5aebe04c8d2': 'Irdeto'
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
            } else if (schemeUri.includes('mp4protection')) {
                result.system = 'CENC (Common Encryption)';
            } else if (schemeUri.includes('clearkey')) {
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
        
        return result;
        
    } catch (error) {
        addLog(`❌ DRM 解析錯誤: ${error.message}`, 'error');
        return null;
    }
}

// HLS DRM 解析函數（簡化版）
function parseHLSDRMKeyLocal(keyLine) {
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
        
        // 解析 KEYFORMAT
        const keyformatMatch = keyLine.match(/KEYFORMAT="([^"]+)"/i);
        if (keyformatMatch) {
            const keyformat = keyformatMatch[1];
            result.details.keyformat = keyformat;
            
            if (keyformat.includes('widevine')) {
                result.system = 'Widevine (HLS)';
            } else if (keyformat.includes('playready')) {
                result.system = 'PlayReady (HLS)';
            } else if (keyformat.includes('fairplay')) {
                result.system = 'FairPlay (HLS)';
            }
        }
        
        return result;
        
    } catch (error) {
        addLog(`❌ HLS DRM 解析錯誤: ${error.message}`, 'error');
        return null;
    }
}

// 頁面載入完成後的初始化
document.addEventListener('DOMContentLoaded', function() {
    addLog('🚀 Task 23 DRM 偵測測試頁面已載入', 'info');
    addLog('📋 請點擊上方按鈕開始測試', 'info');
    
    // 自動檢查擴充功能狀態
    checkExtensionStatus();
});

// 將函數暴露到全域範圍供 HTML 按鈕使用
window.checkExtensionStatus = checkExtensionStatus;
window.testLocalDRMParsing = testLocalDRMParsing;
window.testGagaOOLalaMPD = testGagaOOLalaMPD;
window.testMultipleDRMSystems = testMultipleDRMSystems;
window.analyzeMPDSample = analyzeMPDSample;
window.clearLogs = clearLogs; 