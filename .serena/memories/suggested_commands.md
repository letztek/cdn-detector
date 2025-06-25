# 建議的開發命令

## Git 操作
```bash
git add .                    # 添加所有修改
git commit -m "message"      # 提交修改
git push                     # 推送到遠端
git status                   # 查看狀態
git log --oneline           # 查看提交歷史
```

## Chrome 擴充功能開發
```bash
# 在 Chrome 中開啟擴充功能管理頁面
open "chrome://extensions/"

# 重新載入擴充功能（開發者模式）
# 在 chrome://extensions/ 中點擊重新載入按鈕
```

## 調試命令
```bash
# 開啟 debug 頁面（需要擴充功能 ID）
chrome-extension://[EXTENSION_ID]/debug-video.html

# 查看擴充功能日誌
# 在 Chrome DevTools Console 中查看
```

## 系統工具 (macOS)
```bash
ls -la                      # 列出檔案
find . -name "*.js"         # 尋找 JS 檔案
grep -r "pattern" .         # 搜尋文字
cat filename               # 查看檔案內容
open .                     # 在 Finder 中開啟目錄
```

## 專案特定操作
```bash
# 測試擴充功能
# 1. 在 Chrome 中載入擴充功能
# 2. 開啟包含 CDN 資源的網頁
# 3. 點擊擴充功能圖標查看結果
```