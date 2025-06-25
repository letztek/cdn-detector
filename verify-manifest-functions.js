// 驗證 Manifest 解析功能的測試腳本
// 這個腳本可以在 Node.js 環境中運行，測試解析邏輯

// 模擬 Chrome API（用於測試）
global.chrome = {
    storage: {
        local: {
            set: (data, callback) => {
                console.log('📦 Storage set:', Object.keys(data));
                if (callback) callback();
            },
            get: (keys, callback) => {
                console.log('📦 Storage get:', keys);
                if (callback) callback({});
            }
        }
    }
};

// 從 background.js 複製關鍵函數（用於測試）
function isManifestFile(url) {
    return url.includes('.mpd') || url.includes('.m3u8');
}

function getManifestType(url) {
    if (url.includes('.mpd')) return 'DASH';
    if (url.includes('.m3u8')) return 'HLS';
    return 'UNKNOWN';
}

// 解析 DASH manifest 的函數
function parseDashManifest(xmlContent, manifestUrl) {
    console.log('🎬 開始解析 DASH manifest:', manifestUrl);
    
    try {
        // 基本資訊
        const result = {
            type: 'DASH',
            url: manifestUrl,
            timestamp: Date.now(),
            representations: [],
            hasDRM: false,
            audioTracks: [],
            videoTracks: [],
            errors: []
        };

        // 檢查 DRM 保護
        if (xmlContent.includes('<ContentProtection') || xmlContent.includes('cenc:') || xmlContent.includes('playready:')) {
            result.hasDRM = true;
            console.log('🔒 檢測到 DRM 保護');
        }

        // 解析 Representation 元素
        const representationRegex = /<Representation[^>]*>/g;
        const representations = xmlContent.match(representationRegex) || [];
        
        representations.forEach((repr, index) => {
            const representation = {
                id: index + 1,
                bandwidth: null,
                width: null,
                height: null,
                resolution: 'Unknown',
                codecs: null,
                mimeType: null
            };

            // 提取屬性
            const bandwidthMatch = repr.match(/bandwidth="([^"]+)"/i);
            const widthMatch = repr.match(/width="([^"]+)"/i);
            const heightMatch = repr.match(/height="([^"]+)"/i);
            const codecsMatch = repr.match(/codecs="([^"]+)"/i);
            const mimeTypeMatch = repr.match(/mimeType="([^"]+)"/i);

            if (bandwidthMatch) representation.bandwidth = parseInt(bandwidthMatch[1]);
            if (widthMatch) representation.width = parseInt(widthMatch[1]);
            if (heightMatch) representation.height = parseInt(heightMatch[1]);
            if (codecsMatch) representation.codecs = codecsMatch[1];
            if (mimeTypeMatch) representation.mimeType = mimeTypeMatch[1];

            // 判斷解析度
            if (representation.height) {
                if (representation.height >= 2160) representation.resolution = '4K+';
                else if (representation.height >= 1440) representation.resolution = '1440p';
                else if (representation.height >= 1080) representation.resolution = '1080p';
                else if (representation.height >= 720) representation.resolution = '720p';
                else if (representation.height >= 480) representation.resolution = '480p';
                else representation.resolution = `${representation.height}p`;
            }

            result.representations.push(representation);
        });

        console.log(`✅ DASH 解析完成，找到 ${result.representations.length} 個 representation`);
        return result;

    } catch (error) {
        console.error('❌ DASH 解析錯誤:', error.message);
        return {
            type: 'DASH',
            url: manifestUrl,
            timestamp: Date.now(),
            representations: [],
            hasDRM: false,
            error: error.message
        };
    }
}

// 解析 HLS manifest 的函數
function parseHlsManifest(content, manifestUrl) {
    console.log('🎬 開始解析 HLS manifest:', manifestUrl);
    
    try {
        const result = {
            type: 'HLS',
            url: manifestUrl,
            timestamp: Date.now(),
            streams: [],
            hasDRM: false,
            isMasterPlaylist: content.includes('#EXT-X-STREAM-INF'),
            segments: [],
            errors: []
        };

        // 檢查 DRM
        if (content.includes('#EXT-X-KEY') && content.includes('METHOD=')) {
            result.hasDRM = true;
            console.log('🔒 檢測到 DRM 保護');
        }

        if (result.isMasterPlaylist) {
            // Master playlist - 解析串流資訊
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.startsWith('#EXT-X-STREAM-INF:')) {
                    const stream = {
                        bandwidth: null,
                        resolution: 'Unknown',
                        width: null,
                        height: null,
                        codecs: null,
                        url: lines[i + 1] ? lines[i + 1].trim() : null
                    };

                    // 解析屬性
                    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
                    const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
                    const codecsMatch = line.match(/CODECS="([^"]+)"/);

                    if (bandwidthMatch) stream.bandwidth = parseInt(bandwidthMatch[1]);
                    if (resolutionMatch) {
                        stream.width = parseInt(resolutionMatch[1]);
                        stream.height = parseInt(resolutionMatch[2]);
                        
                        // 判斷解析度標籤
                        if (stream.height >= 2160) stream.resolution = '4K+';
                        else if (stream.height >= 1440) stream.resolution = '1440p';
                        else if (stream.height >= 1080) stream.resolution = '1080p';
                        else if (stream.height >= 720) stream.resolution = '720p';
                        else if (stream.height >= 480) stream.resolution = '480p';
                        else stream.resolution = `${stream.height}p`;
                    }
                    if (codecsMatch) stream.codecs = codecsMatch[1];

                    result.streams.push(stream);
                }
            }
        } else {
            // Media playlist - 計算 segments
            const segmentLines = content.split('\n').filter(line => 
                line.trim() && !line.startsWith('#') && line.includes('.')
            );
            result.segments = segmentLines.map((url, index) => ({ index, url: url.trim() }));
        }

        console.log(`✅ HLS 解析完成，${result.isMasterPlaylist ? `找到 ${result.streams.length} 個串流` : `找到 ${result.segments.length} 個片段`}`);
        return result;

    } catch (error) {
        console.error('❌ HLS 解析錯誤:', error.message);
        return {
            type: 'HLS',
            url: manifestUrl,
            timestamp: Date.now(),
            streams: [],
            hasDRM: false,
            error: error.message
        };
    }
}

// 測試資料
const testCases = [
    {
        name: 'DASH Manifest 測試',
        url: 'https://example.com/video.mpd',
        content: `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <ContentProtection schemeIdUri="urn:mpeg:dash:mp4protection:2011" value="cenc"/>
      <Representation id="1" bandwidth="500000" width="854" height="480" codecs="avc1.42c01e">
      </Representation>
      <Representation id="2" bandwidth="1000000" width="1280" height="720" codecs="avc1.42c01f">
      </Representation>
      <Representation id="3" bandwidth="2000000" width="1920" height="1080" codecs="avc1.42c032">
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`
    },
    {
        name: 'HLS Master Playlist 測試',
        url: 'https://example.com/playlist.m3u8',
        content: `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=854x480,CODECS="avc1.42c01e,mp4a.40.2"
480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,CODECS="avc1.42c01f,mp4a.40.2"
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080,CODECS="avc1.42c032,mp4a.40.2"
1080p.m3u8
#EXT-X-KEY:METHOD=AES-128,URI="https://example.com/key"`
    },
    {
        name: 'HLS Media Playlist 測試',
        url: 'https://example.com/720p.m3u8',
        content: `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment-0.ts
#EXTINF:10.0,
segment-1.ts
#EXTINF:10.0,
segment-2.ts
#EXT-X-ENDLIST`
    }
];

// 執行測試
console.log('🧪 開始執行 Manifest 解析功能測試\n');
console.log('=' .repeat(60));

testCases.forEach((testCase, index) => {
    console.log(`\n📋 測試 ${index + 1}: ${testCase.name}`);
    console.log('-'.repeat(40));
    
    // 檢查是否為 manifest 檔案
    const isManifest = isManifestFile(testCase.url);
    console.log(`🔍 檔案檢測: ${isManifest ? '✅ 是 Manifest 檔案' : '❌ 不是 Manifest 檔案'}`);
    
    if (isManifest) {
        const manifestType = getManifestType(testCase.url);
        console.log(`📝 類型: ${manifestType}`);
        
        let result;
        if (manifestType === 'DASH') {
            result = parseDashManifest(testCase.content, testCase.url);
        } else if (manifestType === 'HLS') {
            result = parseHlsManifest(testCase.content, testCase.url);
        }
        
        if (result) {
            console.log('📊 解析結果:');
            console.log(`   - 類型: ${result.type}`);
            console.log(`   - DRM 保護: ${result.hasDRM ? '✅ 是' : '❌ 否'}`);
            
            if (result.type === 'DASH') {
                console.log(`   - Representations: ${result.representations.length} 個`);
                result.representations.forEach((repr, i) => {
                    console.log(`     ${i + 1}. ${repr.resolution} (${repr.bandwidth} bps)`);
                });
            } else if (result.type === 'HLS') {
                if (result.isMasterPlaylist) {
                    console.log(`   - 串流數量: ${result.streams.length} 個`);
                    result.streams.forEach((stream, i) => {
                        console.log(`     ${i + 1}. ${stream.resolution} (${stream.bandwidth} bps)`);
                    });
                } else {
                    console.log(`   - 片段數量: ${result.segments.length} 個`);
                }
            }
            
            if (result.error) {
                console.log(`   - ❌ 錯誤: ${result.error}`);
            }
        }
    }
});

console.log('\n' + '='.repeat(60));
console.log('🎉 測試完成！');
console.log('\n💡 接下來的驗證步驟：');
console.log('1. 在 Chrome 中載入擴充功能');
console.log('2. 開啟 test-manifest-parsing.html 進行互動測試');
console.log('3. 訪問有串流影片的網站（如 YouTube、Netflix）');
console.log('4. 檢查 Chrome DevTools Console 查看 manifest 檢測日誌');
console.log('5. 使用擴充功能 popup 查看檢測結果'); 