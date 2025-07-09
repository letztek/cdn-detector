# CDN Detector

## 專案介紹
CDN Detector 是一個功能強大的 Google Chrome 擴充功能，整合了三大核心功能：**CDN 檢測分析**、**網站安全檢測**和**影片品質監控**。支援 Cloudflare、Amazon CloudFront、Fastly、KeyCDN、Microsoft Azure CDN、Google Cloud CDN、Akamai、AspirappsCDN 等 8 大主流 CDN 服務檢測。

**v2.4.0 重大更新**：完整實現專業級網站安全檢測器，包含 5 大安全標頭檢測（CSP、HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy）、智能評分系統（0-100 分）、統一安全檢查器 UI 以及智能建議系統。提供企業級的網站安全評估能力。

## 主要功能

### 🔐 專業安全檢測器 (v2.4.0 全新功能)
- 🛡️ **完整安全標頭檢測**：CSP、HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy 等 5 大安全標頭
- 📊 **智能評分系統**：0-100 分安全評分，提供 Excellent/Good/Fair/Poor/Critical 五級評級
- 🔒 **CSP 深度分析**：Content Security Policy 指令分析，檢查 unsafe-inline、unsafe-eval 等安全風險
- 🚫 **Frame Protection**：X-Frame-Options 和 CSP frame-ancestors 檢測，防止 Clickjacking 攻擊
- 🔐 **HSTS 配置分析**：Strict-Transport-Security 標頭檢測，分析 max-age、includeSubDomains、preload 配置
- 🛡️ **Content-Type 保護**：X-Content-Type-Options 檢測，防止 MIME 類型嗅探攻擊
- 🔍 **Referrer Policy 隱私分析**：Referrer-Policy 標頭檢測，分析隱私保護等級
- 🎯 **統一安全檢查器**：整合所有安全檢測結果的統一標籤頁
- 📊 **視覺化狀態指示**：彩色編碼的狀態徽章和評分顯示
- 🔄 **即時檢測**：即時檢測並評估網站安全配置
- 🧠 **智能建議系統**：根據檢測結果提供安全配置建議

### 📊 CDN 檢測與分析
- 🔍 **多 CDN 檢測**：自動檢測 8 大主流 CDN 服務（Cloudflare、CloudFront、Fastly、KeyCDN、Azure CDN、Google Cloud CDN、Akamai、AspirappsCDN）
- 📊 **統計儀表板**：顯示 CDN 分佈和資源使用詳細比例
- 📝 **實時日誌**：完整記錄所有檢測過程和結果
- 🎯 **資源分類**：支援 JavaScript、CSS、圖片、字體等資源類型識別
- 🔄 **智能刷新**：每 2 秒自動更新統計數據，展開詳細資訊時暫停刷新
- 🧹 **日誌管理**：支援查看、篩選、刷新和清除日誌
- ⚡ **快取狀態分析**：解析多種 CDN 的快取狀態（HIT/MISS/其他）
- 📈 **HIT Ratio 統計**：計算基於數量和檔案大小的快取命中率
- 📏 **檔案大小統計**：收集 Content-Length 並計算傳輸資料量
- ⏱️ **響應時間監控**：測量每個資源的載入時間
- 🎛️ **分標籤頁統計**：獨立追蹤每個標籤頁的 CDN 使用情況

### 🎬 影片品質監控
- 📺 **多平台支援**：支援 YouTube、Netflix、Twitch、Vimeo 等主流影音平台
- 📊 **QoE Dashboard**：專業的影片品質體驗監控儀表板
- 🎥 **串流分析**：DASH/HLS 串流格式檢測與分析
- 📈 **即時指標**：幀率、位元率、緩衝率、解析度等關鍵指標
- 🔒 **DRM 保護檢測**：全面檢測數位版權管理（DRM）系統，支援 Widevine、PlayReady、FairPlay、ClearKey
- 🛡️ **多層 DRM 檢測**：MediaKeys API、加密事件監聽、EME 支援測試、MPD URL 檢測等多重檢測機制
- 🎯 **平台特定檢測**：針對 Netflix、GagaOOLala、Disney+ 等平台的專門 DRM 檢測優化

### 📱 使用者體驗
- 📱 **響應式介面**：適配不同螢幕尺寸，寬敞易讀的使用者介面
- 🎛️ **分標籤頁設計**：CDN 檢測、安全檢測、影片品質三大功能區域
- 🎯 **智能提醒**：視覺化的狀態指示器和彩色編碼
- 🔄 **即時更新**：自動重新整理檢測結果，保持資料最新

## 安裝步驟
1. 下載專案檔案到本地
2. 打開 Google Chrome，進入 `chrome://extensions/`
3. 開啟「開發者模式」（右上角開關）
4. 點擊「載入未封裝項目」，選擇專案目錄
5. 確認擴充功能已成功安裝並啟用

## 使用方式

### 基本使用
1. 點擊 Chrome 工具列上的 CDN Detector 圖標
2. 擴充功能預設為**啟用狀態**，會自動開始檢測
3. 瀏覽任意網頁開始檢測
4. 查看即時統計結果和詳細日誌

### 介面說明
擴充功能採用分標籤頁設計，包含三大功能區域：

#### 🔍 CDN 檢測標籤頁
**統計摘要區**：
- CDN 使用率百分比和資源數量
- 快取 HIT Ratio（數量比例）
- 基於檔案大小的 HIT Ratio（大小比例）
- 當前標籤頁資訊

**控制按鈕區**：
- 啟用/停用 CDN 檢測開關
- 顯示 CDN 資源 / 顯示所有資源切換
- 刷新按鈕
- 清除日誌按鈕

**資源詳細列表**：
- 每個資源的 URL、類型、狀態
- CDN 服務識別（支援多種 CDN 同時檢測）
- 快取狀態指示（🟢 HIT / 🔴 MISS / ⚪ Unknown）
- 檔案大小和響應時間
- 可展開查看完整 Headers 資訊（手動控制，不會自動收起）

#### 🔐 安全檢測標籤頁
**安全評分總覽**：
- 0-100 分的整體安全評分
- Excellent/Good/Fair/Poor/Critical 五級評級
- 圓形評分顯示器，直觀展示安全狀態

**安全標頭檢測結果**：
- **CSP 檢測**：Content Security Policy 配置分析
- **Frame Protection**：X-Frame-Options 和 frame-ancestors 檢測
- **HSTS 檢測**：Strict-Transport-Security 配置分析
- **Content-Type 保護**：X-Content-Type-Options 檢測
- **Referrer Policy**：Referrer-Policy 隱私保護分析

**視覺化狀態指示**：
- 🟢 優秀配置 / 🟡 基本配置 / 🔴 缺失或弱配置
- 分數徽章顯示各項安全指標評分
- 詳細分析和建議資訊

#### 🎬 影片品質標籤頁
**影片品質統計**：
- 解析度、位元率、幀率、緩衝事件等關鍵指標
- 掉幀統計和播放資訊
- DRM 保護狀態檢測

**QoE 監控**：
- 即時影片品質監控
- 多平台支援（YouTube、Netflix、Twitch 等）
- 品質歷史記錄和趨勢分析

### 日誌功能
- **查看 CDN 資源**：預設顯示所有使用 CDN 的資源，支援多 CDN 分類顯示
- **查看所有資源**：點擊「顯示所有資源」查看完整檢測記錄
- **手動刷新**：點擊「刷新」按鈕立即更新日誌
- **清除日誌**：點擊「清除日誌」重置當前分頁的記錄
- **詳細資訊**：展開每個記錄查看完整的 URL、Headers 等資訊，完全手動控制
- **快取狀態顯示**：每個資源顯示快取狀態（🟢 HIT / 🔴 MISS / ⚪ Unknown）
- **多 CDN 標記**：顯示檢測到的 CDN 服務名稱和數量（如 "✅ Cloudflare +2"）
- **效能資訊**：顯示檔案大小和響應時間
- **HIT Ratio 摘要**：在頂部顯示整體快取命中率統計和 CDN 分佈

### 統計面板
- **CDN 使用率**：顯示經由 CDN 傳遞的資源比例
- **多 CDN 分佈**：顯示各 CDN 服務的使用量和命中率
- **快取命中率**：
  - 數量比例：基於資源數量的 HIT Ratio
  - 大小比例：基於傳輸資料量的 HIT Ratio
- **當前標籤頁資訊**：顯示正在分析的標籤頁 URL
- **智能更新**：每 2 秒自動刷新統計數據，展開詳細資訊時暫停更新

## 檢測邏輯

### 多 CDN 支援架構
支援 8 大主流 CDN 服務的檢測，每個 CDN 都有專屬的檢測配置：

1. **Cloudflare** (優先級 1, 高信心度)
2. **Amazon CloudFront** (優先級 2, 高信心度)  
3. **Fastly** (優先級 3, 高信心度)
4. **KeyCDN** (優先級 4, 中信心度)
5. **Microsoft Azure CDN** (優先級 5, 中信心度)
6. **Google Cloud CDN** (優先級 6, 高信心度)
7. **Akamai** (優先級 7, 中信心度)
8. **AspirappsCDN** (優先級 8, 高信心度)

### 檢測方法
1. **專有 Headers 檢測**：檢查各 CDN 特有的 headers（如 cf-ray、x-amz-cf-id）
2. **Server Headers 模式匹配**：分析 server header 中的 CDN 識別碼
3. **Via Headers 檢測**：檢查 via header 中的 CDN 標識
4. **多層信心度系統**：高/中/低信心度分級，確保檢測準確性
5. **資源類型識別**：根據副檔名自動分類資源類型

### 統一快取狀態解析系統
支援多種 CDN 的快取狀態解析，每個 CDN 都有專屬的狀態映射：

**支援的快取狀態**：
- **Cloudflare**: hit, miss, expired, stale, bypass, revalidated, ignored, deferred
- **CloudFront**: hit, miss, refresh_hit, error from cloudfront
- **Fastly**: hit, miss, pass, stale, updating, error
- **KeyCDN**: hit, miss, expired, stale, bypass
- **Azure CDN**: hit, miss, config_nocache, uncacheable, refresh_hit
- **Google Cloud CDN**: hit, miss, expired, stale, refresh_hit
- **Akamai**: hit, miss, refresh_hit, refresh_miss, stale, expired, none

**AspirappsCDN Via Header 特殊解析**：
```
https/1.1 AspirappsCDN (EQ-EDGE/9.2.3 [uScMsSf pSeN:t cCMp sS])
```
Via Code 第四個字節：H=HIT, M=MISS, S=MISS(stale), A=MISS(not acceptable), R=HIT(RAM)

### 統計指標
- **數量 HIT Ratio**：`HIT 資源數量 / 總快取狀態已知資源數量 × 100%`
- **大小 HIT Ratio**：`HIT 資源總大小 / 總快取狀態已知資源大小 × 100%`
- **響應時間**：從請求開始到響應完成的時間（毫秒）
- **檔案大小**：從 Content-Length header 取得的資源大小

## 圖標狀態系統
- 🟢 **綠燈**：檢測到有資源經由任何 CDN 傳遞
- 🔴 **紅燈**：未檢測到任何 CDN 資源

## 技術特色

### 核心架構
- **Manifest V3**：使用最新的 Chrome 擴充功能標準
- **Service Worker**：高效能的背景處理
- **即時通訊**：Popup 與 Background 間的即時數據同步
- **錯誤處理**：完整的 API 錯誤處理和降級方案
- **效能最佳化**：自動日誌清理和記憶體管理
- **分標籤頁管理**：獨立追蹤每個標籤頁的資源和統計，完全隔離

### CDN 檢測技術
- **多 CDN 架構**：支援 8 大 CDN 服務的同時檢測和分析
- **統一快取解析**：智慧解析各種 CDN 的快取狀態格式
- **響應時間測量**：精確測量網路請求的響應時間
- **健康檢查機制**：自動檢測 Background Script 運行狀態
- **重試機制**：連接失敗時自動重試，提升穩定性

### 安全檢測技術
- **模組化檢測器**：每個安全標頭都有專門的檢測器模組
- **加權評分系統**：基於權重的 0-100 分安全評分算法
- **智能解析**：支援各種安全標頭格式的智能解析
- **錯誤隔離**：安全檢測模組完全獨立，不影響其他功能
- **即時評估**：即時檢測並評估網站安全配置

### 影片品質監控技術
- **Content Script 注入**：即時監控影片元素
- **QoE 指標計算**：七大關鍵指標演算法，專業品質評估
- **串流格式解析**：DASH/HLS manifest 檔案解析與分析
- **多層 FPS 檢測**：MediaStream API、計算方法等多重檢測機制
- **DRM 檢測**：全面檢測數位版權管理（DRM）系統，支援 Widevine、PlayReady、FairPlay、ClearKey
- **多層 DRM 檢測**：MediaKeys API、加密事件監聽、EME 支援測試、MPD URL 檢測等多重檢測機制
- **平台特定檢測**：針對 Netflix、GagaOOLala、Disney+ 等平台的專門 DRM 檢測優化

### 使用者體驗技術
- **智能刷新**：展開詳細資訊時暫停自動刷新，提升使用體驗
- **響應式設計**：適配多種螢幕尺寸，寬敞易讀的介面
- **即時視覺化**：彩色狀態指示器，直觀呈現數據品質
- **跨平台相容**：支援多種影音串流平台的統一監控
- **分標籤頁設計**：三大功能區域的清晰分離

## 故障排除

### 常見問題
1. **擴充功能無法啟動**：
   - 確認已授予所有必要權限
   - 在 `chrome://extensions/` 中重新載入擴充功能

2. **檢測不到 CDN 資源**：
   - 確認網站確實使用支援的 CDN 服務
   - 檢查網路連線是否正常
   - 查看瀏覽器開發者工具的 Network 標籤檢查 Headers

3. **日誌不更新**：
   - 點擊「刷新」按鈕手動更新
   - 重新載入當前網頁
   - 檢查擴充功能是否處於啟用狀態

4. **畫面停留在載入中**：
   - 重新載入擴充功能（在 chrome://extensions/ 頁面）
   - 檢查 Chrome 開發者工具 Console 是否有錯誤
   - 確認 Background Script 正常運行
   - 嘗試關閉並重新開啟 Popup

5. **快取狀態顯示 Unknown**：
   - 確認資源確實來自支援的 CDN 服務
   - 檢查相關 Headers 格式是否正確
   - 某些資源可能不包含快取狀態資訊

6. **詳細資訊自動收起**：
   - 此問題已修復：詳細資訊現在完全手動控制
   - 展開的詳細資訊不會被自動刷新影響
   - 如仍有問題，請重新載入擴充功能

### 安全檢測問題
7. **安全檢測未顯示結果**：
   - 確認已切換到「安全檢測」標籤頁
   - 點擊「重新整理」按鈕重新檢測
   - 確認網站有回應標頭（某些靜態頁面可能沒有安全標頭）

8. **安全評分顯示 0 分**：
   - 網站可能確實缺少安全標頭配置
   - 檢查瀏覽器開發者工具的 Network 標籤查看 Response Headers
   - 某些網站僅在 main_frame 請求中包含安全標頭

9. **部分安全檢測結果缺失**：
   - 這是正常現象，不是所有網站都會配置所有安全標頭
   - 可參考檢測結果中的建議進行安全配置改進

### 調試模式
開啟瀏覽器開發者工具（F12），查看 Console 標籤中的詳細日誌輸出。

## 權限說明
- **webRequest**：監聽網路請求以檢測 CDN
- **activeTab**：存取當前標籤頁資訊
- **storage**：儲存設定和日誌資料
- **host_permissions**：存取所有網站的請求資料

## 版本資訊
- **版本**：2.4.0
- **Manifest 版本**：V3
- **相容性**：Chrome 88+

### 更新歷史

**v2.4.0** (2025-01-09) - 🔐 **安全檢測器完整版本**
- 🛡️ **完整安全標頭檢測系統**：全新實現 5 大安全標頭檢測（CSP、HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy）
- 📊 **智能評分系統**：0-100 分的安全評分，提供 Excellent/Good/Fair/Poor/Critical 五級評級
- 🎯 **專門檢測器模組**：每個安全標頭都有專門的檢測器模組，提供詳細分析和建議
- 🔒 **CSP 深度分析**：檢查 unsafe-inline、unsafe-eval 等安全風險，分析指令配置
- 🚫 **Frame Protection 防護**：X-Frame-Options 和 CSP frame-ancestors 檢測，防止 Clickjacking 攻擊
- 🔐 **HSTS 配置分析**：詳細分析 max-age、includeSubDomains、preload 等配置
- 🛡️ **Content-Type 保護**：X-Content-Type-Options 檢測，防止 MIME 類型嗅探攻擊
- 🔍 **Referrer Policy 隱私分析**：詳細分析隱私保護等級（maximum、high、moderate、low、very-low）
- 🎛️ **統一安全檢查器**：整合所有安全檢測結果的統一標籤頁，圓形評分顯示器
- 📊 **視覺化狀態指示**：彩色編碼的狀態徽章（🟢🟡🔴）和評分顯示
- 🧠 **智能建議系統**：根據檢測結果提供具體的安全配置建議
- 🔄 **即時檢測**：即時檢測並評估網站安全配置，支援手動重新整理
- 🚀 **錯誤隔離機制**：安全檢測模組完全獨立，不影響其他功能
- 📋 **完整測試覆蓋**：每個檢測器都有完整的測試檔案和驗證機制
**v2.3.0** (2024-12-23)
- 🔒 **DRM 檢測功能**：全新實現數位版權管理（DRM）系統檢測
- 🛡️ **多層 DRM 檢測**：支援 MediaKeys API、加密事件監聽、EME 支援測試、MPD URL 檢測
- 🎯 **多 DRM 系統支援**：完整支援 Widevine、PlayReady、FairPlay、ClearKey 四大 DRM 系統
- 🔧 **Robustness Level 修復**：修復 EME 檢測中的 robustness level 警告問題
- 📊 **檢測方法追蹤**：新增檢測方法記錄，提供詳細的檢測來源資訊
- 🧪 **測試基礎設施**：創建 DRM 檢測測試頁面和完整驗證清單
- 🎬 **平台特定優化**：針對 Netflix、GagaOOLala、Disney+ 等平台的專門檢測優化
- 🚀 **錯誤處理改進**：增強 DRM 檢測的錯誤處理機制和回退策略

**v2.2.1** (2024-12-23)
- 🔧 **權限修復**：移除未使用的 management 權限，符合 Chrome Web Store 要求
- 🐛 **位元率顯示修復**：修正位元率固定顯示 10Mbps 的問題
- 🎯 **請求節流最佳化**：改進影片品質請求的節流機制，避免過度請求
- 📊 **位元率智能顯示**：優先顯示真實串流位元率，無數據時根據解析度估算
- 🚀 **性能最佳化**：請求計數器每 30 秒重置，最少間隔 2 秒，上限 15 次請求
- 🧹 **專案清理**：移除所有測試和調試檔案，簡化 GitHub repository 結構

**v2.2** (2024-12-23)
- 🎬 **影片品質監控**：全新實現影片播放品質監控系統
- 📊 **QoE 指標引擎**：七大關鍵 QoE 指標計算與分析
- 📺 **多平台支援**：支援 YouTube、Netflix、Twitch、Vimeo 等主流平台
- 🎥 **串流檢測**：DASH (.mpd) 和 HLS (.m3u8) 格式解析
- 📈 **即時監控**：真實幀率計算、位元率估算、緩衝狀態追蹤
- 🎛️ **QoE Dashboard**：專業影片品質體驗監控儀表板
- 🔧 **穩定性修復**：修復 Video ID 生成問題，確保數據一致性
- 📊 **即時顯示**：彩色狀態指示器，直觀顯示數據品質
- 🎯 **性能最佳化**：優化更新頻率，提升即時性

**v2.1** (2024-12-23)
- 🎯 **功能精簡**：專注於 CDN 檢測核心功能，暫時移除影片品質監控
- 🚀 **效能最佳化**：減少不必要的背景處理，提升擴充功能穩定性
- 🔧 **通信最佳化**：修復 popup 與 background script 間的通信問題
- 💅 **介面最佳化**：簡化用戶介面，專注於 CDN 檢測功能
- 📊 **快取分析增強**：改進快取效能分析的準確性和可讀性

**v2.0** (2024-12-20)
- 🚀 **重大更新**：支援 8 大主流 CDN 服務檢測
- ✨ 新增多 CDN 同時檢測和分析功能
- ✨ 實現統一快取狀態解析系統
- ✨ 新增 CDN 分佈統計和可視化
- 🐛 修復分頁間檢測結果互相影響問題
- 🐛 修復詳細資訊自動收起問題
- 💅 響應式介面設計，適配多種螢幕尺寸
- ⚡ 智能刷新機制，展開詳細資訊時暫停更新
- 🎯 改進檢測準確性和信心度分級系統

**v1.1** (2024-12-19)
- ✨ 新增 AspirappsCDN Via Header 快取狀態解析
- ✨ 新增 HIT/MISS 統計和 HIT Ratio 計算
- ✨ 新增檔案大小收集和基於大小的 HIT Ratio
- ✨ 新增響應時間監控
- ✨ 新增分標籤頁資源追蹤
- 🐛 修復擴充功能載入問題
- 🐛 新增健康檢查和重試機制
- 💅 改善使用者介面和錯誤處理

**v1.0** (2024-12-18)
- 🎉 初始版本發布
- ✨ 基本 CDN 檢測功能
- ✨ 即時日誌和統計面板
- ✨ 資源分類和過濾功能

## 開發計畫

### 已完成功能
- [x] ~~AspirappsCDN 快取狀態分析~~
- [x] ~~HIT Ratio 統計功能~~
- [x] ~~檔案大小和響應時間監控~~
- [x] ~~分標籤頁資源追蹤~~
- [x] ~~支援多種 CDN 提供商檢測~~
- [x] ~~分頁隔離功能~~
- [x] ~~響應式介面設計~~
- [x] ~~智能刷新機制~~
- [x] ~~影片品質監控系統~~
- [x] ~~QoE 指標計算引擎~~
- [x] ~~多平台影音串流支援~~
- [x] ~~DASH/HLS 串流格式解析~~
- [x] ~~即時 FPS 和位元率監控~~
- [x] ~~QoE Performance Dashboard~~
- [x] ~~DRM 保護檢測系統~~
- [x] ~~多層 DRM 檢測機制~~
- [x] ~~Widevine、PlayReady、FairPlay、ClearKey 支援~~
- [x] ~~完整安全檢測器系統 (v2.4.0)~~
- [x] ~~安全標頭檢測（CSP、HSTS、Frame Protection、Content-Type、Referrer Policy）~~
- [x] ~~安全評分系統 (0-100 分，五級評級)~~
- [x] ~~統一安全檢查器 UI（圓形評分顯示器）~~
- [x] ~~專門檢測器模組（每個安全標頭獨立檢測器）~~
- [x] ~~智能建議系統（根據檢測結果提供安全配置建議）~~
- [x] ~~完整測試覆蓋（每個檢測器的測試檔案）~~

### 待開發功能
- [ ] 提供 TLS 憑證資訊檢測
- [ ] 多語言介面支援
- [ ] 資料匯出功能（CSV/JSON）
- [ ] 深色模式支援
- [ ] 歷史資料分析和趨勢圖表
- [ ] 快取效能最佳化建議
- [ ] CDN 效能比較分析
- [ ] 自訂 CDN 檢測規則
- [ ] 影片品質歷史記錄
- [ ] QoE 報告匯出功能
- [ ] 安全配置建議系統擴展
- [ ] 更多安全標頭支援（Permissions-Policy、Feature-Policy 等）
- [ ] 安全檢測歷史記錄和趨勢分析

## 授權條款
本專案採用 MIT 授權條款。

## 聯絡資訊
如有問題或建議，請透過專案 Issues 頁面回報。 

---

## 🎯 核心特色總結

### 🔍 多 CDN 檢測支援
- **8 大主流 CDN**：Cloudflare、Amazon CloudFront、Fastly、KeyCDN、Microsoft Azure CDN、Google Cloud CDN、Akamai、AspirappsCDN
- **同時檢測**：支援單一資源被多個 CDN 服務檢測
- **信心度分級**：高/中/低信心度檢測，確保準確性
- **統一快取解析**：支援各 CDN 的快取狀態格式
- **多維度統計**：數量比例、大小比例、響應時間分析

### 🔐 全面安全檢測 (v2.4.0 完整實現)
- **五大安全標頭**：CSP、HSTS、X-Frame-Options、X-Content-Type-Options、Referrer-Policy
- **智能評分系統**：0-100 分安全評分，五級評級（Excellent/Good/Fair/Poor/Critical）
- **專門檢測器模組**：每個安全標頭都有專門的檢測器模組，提供詳細分析
- **即時分析**：即時檢測並評估網站安全配置，支援手動重新整理
- **視覺化指示**：彩色編碼的狀態徽章（🟢🟡🔴）和評分顯示
- **智能建議系統**：根據檢測結果提供具體的安全配置建議
- **錯誤隔離機制**：完全獨立的安全檢測模組，不影響其他功能

### 🎬 影片品質監控
- **多平台支援**：YouTube、Netflix、Twitch、Vimeo 等主流平台
- **QoE 指標計算**：七大關鍵指標演算法
- **DRM 檢測**：Widevine、PlayReady、FairPlay、ClearKey 支援
- **串流格式解析**：DASH/HLS manifest 檔案解析
- **即時監控**：幀率、位元率、緩衝狀態追蹤

### 📱 智能使用者體驗
- **分標籤頁設計**：CDN 檢測、安全檢測、影片品質三大功能區域
- **響應式設計**：適配多種螢幕尺寸，寬敞易讀
- **智能刷新**：展開詳細資訊時暫停自動更新
- **手動控制**：詳細資訊完全由使用者控制展開/收起
- **即時統計**：CDN 分佈、命中率、效能指標一目了然

### 🚀 技術架構優勢
- **完全隔離**：每個分頁的檢測結果獨立儲存，互不影響
- **自動清理**：分頁關閉時自動清理對應的檢測資料
- **導航重置**：分頁導航到新網址時自動重置檢測資料
- **記憶體管理**：定期清理過期分頁資料，避免記憶體洩漏
- **錯誤隔離**：各功能模組完全獨立，互不影響 