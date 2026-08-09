# Tampermonkey_script

個人用的 Tampermonkey / 油猴 userscript 合集，皆為純前端 DOM 操作、`@grant none`。

## 安裝

1. 瀏覽器安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. Tampermonkey → 新增腳本 → 貼上想用的 `.js` 內容 → 儲存。
3. 開啟對應網站即可生效。

## 腳本清單

| 腳本 | 作用 | 生效網站 |
| --- | --- | --- |
| `ai-chat-batch-deleter.user.js` | 批次勾選並刪除 AI 對話紀錄（模擬 DOM 點擊） | ChatGPT、Google AI Mode |
| `google-search-language-switcher.js` | 一鍵切換 Google 搜尋語言（繁中 ⇄ 日文） | `google.com` / `.com.tw` / `.co.jp` |
| `disable-leetcode-ctrl-enter.js` | 停用 LeetCode 的 Ctrl+Enter 送出，改為在下一行插入換行 | `leetcode.com` |
| `youtube-pointer-events.js` | 對 YouTube 章節容器套用 `pointer-events:none`，並在換頁後重新套用 | `youtube.com` |

---

## ai-chat-batch-deleter.user.js

批次勾選並刪除 AI 對話紀錄，以模擬 DOM 點擊方式運作。目前支援 **ChatGPT**（`chatgpt.com`）與 **Google AI Mode**（`www.google.com/search` 的「AI 模式記錄」）。

### 使用

1. 開啟 ChatGPT 或 Google AI Mode，右下角出現「AI 批次刪除」面板。
2. 點「進入選取模式」，每筆對話列會出現核取方塊，面板顯示「找到 N 筆」。
3. 勾選要刪的對話（點方塊或點對話列本體皆可，會以紅框標示）。
4. 點「刪除選取 (N)」→ 確認 → 依序刪除，面板顯示進度；執行中可按「中止」。

### 設計與注意事項

- **純 DOM 點擊**：不呼叫任何內部 API。每筆流程為「開選項選單 → 點刪除 →（若有）確認 → 等待該筆消失」，失敗會自動重試一次。
- **節流**：每筆間隔由頂部 `THROTTLE_MS`（預設 400ms）控制，太快可能觸發站台防濫用機制。
- **選擇器策略**：Google 以穩定屬性定位（`ul[data-xid="threads-list-root"]`、`button[data-thread-id]`、`#actions-button-{id}`）；刪除項與確認鈕以文字比對（`刪除` / `删除` / `Delete`），較耐改版。
- **SPA 相容**：以 `MutationObserver` 讓面板與勾選狀態在路由切換 / 清單重繪後自動恢復。
- **不可復原**：刪除為永久操作，執行前有二次確認。
- ChatGPT 側邊欄選項按鈕以 `data-testid$="options"` 與 `aria-label` 猜測，若站台改版找不到按鈕，console 會記錄失敗，屆時調整 `chatgptAdapter.deleteFlow` 內選擇器即可。
