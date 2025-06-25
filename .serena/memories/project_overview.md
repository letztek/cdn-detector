# CDN Detector 專案概述

## 專案目的
CDN Detector 是一個 Chrome 擴充功能（Manifest V3），專門用於：
- 檢測網頁資源是否經由 CDN 服務傳遞
- 支援 8 大主流 CDN 服務（Cloudflare、Amazon CloudFront、Fastly、KeyCDN、Microsoft Azure CDN、Google Cloud CDN、Akamai、AspirappsCDN）
- 提供詳細的快取效能分析和實時日誌
- 分析 HTTP Response Header、TLS 證書 Issuer、Remote IP

## 技術架構
- **Manifest V3**: 使用最新的 Chrome 擴充功能標準
- **Service Worker**: background.js 作為背景處理
- **Popup Interface**: popup.html + popup.js 提供用戶介面
- **Content Scripts**: 目前已暫時停用影片品質監控相關功能
- **Storage API**: 儲存設定和日誌資料
- **WebRequest API**: 監聽網路請求以檢測 CDN

## 目前狀態
- 版本 2.1 專注於 CDN 檢測核心功能
- 影片品質監控功能已暫時停用但代碼保留
- 準備重新設計影片串流品質監控 (QoE) 功能