# CDN Detector 架構說明

## 專案結構重組 (v2.3.0 → Web Technology Analyzer)

### 目錄結構

```
src/
├── core/                    # 核心功能模組
│   ├── legacy-cdn-detector.js      # 現有 CDN 檢測功能 (保持不變)
│   ├── detector-engine.js          # 新功能統一引擎 (計劃中)
│   ├── compatibility-layer.js      # 相容性保證層 (計劃中)
│   └── isolation-manager.js        # 功能隔離管理 (計劃中)
├── detectors/               # 檢測器模組
│   ├── cdn/                # CDN 檢測 (現有功能隔離)
│   ├── tech/               # 技術棧檢測 (新功能)
│   ├── performance/        # 效能分析 (新功能)
│   ├── security/           # 安全檢查 (新功能)
│   └── seo/               # SEO 分析 (新功能)
├── storage/                # 儲存管理
│   ├── cdn-storage.js     # CDN 資料儲存 (包裝現有邏輯)
│   ├── tech-storage.js    # 技術棧資料儲存 (新功能)
│   ├── performance-storage.js # 效能資料儲存 (新功能)
│   └── storage-namespace.js # 命名空間隔離 (防止 key 衝突)
└── ui/                     # 使用者介面
    ├── legacy/             # 現有介面 (完全保持)
    │   ├── popup.html      # 原始彈出視窗
    │   ├── popup.js        # 原始介面邏輯
    │   └── video-quality-monitor.js # 影片品質監控
    ├── enhanced/           # 增強介面 (新功能)
    │   ├── enhanced-popup.html
    │   ├── enhanced-popup.js
    │   └── tab-manager.js
    └── components/         # UI 組件 (新功能)
        ├── tech-tab.js
        ├── performance-tab.js
        ├── security-tab.js
        └── seo-tab.js
```

## 架構重組原則

### 1. 零破壞性擴展
- 現有 CDN 檢測功能完全保持不變
- 所有新功能採用獨立模組設計
- 使用裝飾器模式包裝現有功能

### 2. 命名空間隔離
- 新功能使用完全不同的 storage key 前綴
- 事件監聽器完全隔離
- 錯誤隔離機制確保新功能失敗不影響 CDN 檢測

### 3. 漸進式載入
- 保留原始 CDN UI 優先載入
- 新功能 Tab 延遲載入
- 載入失敗時回退到 Legacy 模式

## 檔案路徑更新

### manifest.json 更新
- `background.service_worker`: `src/core/legacy-cdn-detector.js`
- `content_scripts.js`: `src/ui/legacy/video-quality-monitor.js`
- `action.default_popup`: `src/ui/legacy/popup.html`

### 向後相容性
- 所有現有功能保持 100% 相容性
- 使用者資料和設定完全保留
- API 介面完全不變

## 開發階段

### 已完成
✅ 目錄結構建立
✅ 現有檔案遷移
✅ manifest.json 路徑更新

### 進行中
🔄 架構重組驗證測試

### 計劃中
⏳ 核心架構擴展實現
⏳ 技術棧檢測器開發
⏳ UI 整合與測試

## 測試驗證

使用 `test-restructure.html` 進行架構重組驗證：
- 檔案結構檢查
- 擴充功能狀態檢查  
- CDN 檢測功能測試

確保重組後的架構完全不影響現有功能的穩定性。