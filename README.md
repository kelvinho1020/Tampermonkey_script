# Tampermonkey_script

個人用的 Tampermonkey / 油猴 userscript 合集，皆為純前端 DOM 操作、`@grant none`。

## 安裝

1. 瀏覽器安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. 點下表「安裝」連結，Tampermonkey 會跳出安裝頁 → 按「安裝」。
3. 開啟對應網站即可生效。之後推新版，Tampermonkey 會自動更新（或在管理面板按「檢查更新」）。

## 腳本清單

| 腳本 | 作用 | 生效網站 |
| --- | --- | --- |
| [`ai-chat-batch-deleter.user.js`](https://raw.githubusercontent.com/kelvinho1020/Tampermonkey_script/main/ai-chat-batch-deleter.user.js)（安裝） | 批次勾選並刪除 AI 對話紀錄 | ChatGPT、Gemini、Google AI Mode |
| [`google-search-language-switcher.user.js`](https://raw.githubusercontent.com/kelvinho1020/Tampermonkey_script/main/google-search-language-switcher.user.js)（安裝） | 一鍵切換 Google 搜尋語言（繁中 ⇄ 日文） | `google.com` / `.com.tw` / `.co.jp` |
| [`disable-leetcode-ctrl-enter.user.js`](https://raw.githubusercontent.com/kelvinho1020/Tampermonkey_script/main/disable-leetcode-ctrl-enter.user.js)（安裝） | 停用 LeetCode 的 Ctrl+Enter 送出，改為在下一行插入換行 | `leetcode.com` |
| [`youtube-pointer-events.user.js`](https://raw.githubusercontent.com/kelvinho1020/Tampermonkey_script/main/youtube-pointer-events.user.js)（安裝） | 對 YouTube 章節容器套用 `pointer-events:none`，並在換頁後重新套用 | `youtube.com` |

---

## ai-chat-batch-deleter.user.js

批次勾選並刪除 AI 對話紀錄，以模擬 DOM 點擊方式運作。目前支援 **ChatGPT**（`chatgpt.com`）、**Gemini**（`gemini.google.com`）與 **Google AI Mode**（各國 Google 搜尋的「AI 模式記錄」）。

### 使用

1. 開啟 ChatGPT 或 Google AI Mode，右下角出現「AI 批次刪除」面板。
2. 點「進入選取模式」，每筆對話列會出現核取方塊，面板顯示「找到 N 筆」。
3. 勾選要刪的對話（點方塊或點對話列本體皆可，會以紅框標示）。
4. 點「刪除選取 (N)」→ 確認 → 依序刪除，面板顯示進度；執行中可按「中止」。

### 設計與注意事項

- **ChatGPT 用 API**：直接呼叫 ChatGPT 自己的刪除 API，一次平行 6 筆；API 失敗才改點選單。
- **Google / Gemini 點選單**：「開選項選單 → 點刪除 →（若有）確認」後就換下一筆，不等清單更新。
- **最後統一檢查**：全部送出後等最多 15 秒，還在清單的會自動重試，最多 3 輪。
- **失敗原因顯示在面板**：Google 頁面會吃掉 console 輸出，所以不寫在 console。
- **節流**：每筆間隔由頂部 `THROTTLE_MS`（預設 100ms）控制。
- **不用 innerHTML**：Gemini 有 Trusted Types，面板用 DOM API 建立。
- **SPA 相容**：以 `MutationObserver` 讓面板與勾選狀態在路由切換 / 清單重繪後自動恢復。
- **不可復原**：刪除為永久操作，執行前有二次確認。
