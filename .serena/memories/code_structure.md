# 程式碼結構

## 核心檔案
- **manifest.json**: 擴充功能配置檔案
- **background.js**: Service Worker，處理 CDN 檢測邏輯
- **popup.html**: 用戶介面 HTML
- **popup.js**: 用戶介面邏輯和數據顯示
- **video-quality-monitor.js**: Content Script（目前停用）

## 輔助檔案
- **debug-video.html**: 調試工具頁面
- **test-video.html**: 測試頁面
- **debug-instructions.md**: 調試使用說明
- **README.md**: 專案說明文件

## 圖標資源
- **icon.png**: 主要圖標
- **icon-green.png/svg**: 檢測到 CDN 時的圖標
- **icon-red.png/svg**: 未檢測到 CDN 時的圖標

## 設定目錄
- **.cursor/**: Cursor 編輯器設定
- **.serena/**: Serena AI 專案設定
- **.taskmaster/**: Task Master AI 設定

## 主要功能模組
### background.js
- CDN 檢測邏輯 (detectCDN, detectSpecificCDN)
- 快取狀態解析 (parseCacheStatus)
- 網路請求監聽 (webRequestListener)
- 數據儲存管理

### popup.js
- 用戶介面控制
- 數據顯示和格式化
- 標籤頁切換邏輯
- 統計資料更新