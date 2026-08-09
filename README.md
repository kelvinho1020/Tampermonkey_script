# AI 對話批次刪除器

批次勾選並刪除 AI 對話紀錄，以模擬 DOM 點擊方式運作。目前支援：

- **ChatGPT**（`chatgpt.com`）— 側邊欄對話。
- **Google AI Mode**（`www.google.com/search` 的「AI 模式記錄」）— 討論串清單。

## 安裝

1. 瀏覽器安裝 [Tampermonkey](https://www.tampermonkey.net/)。
2. Tampermonkey → 新增腳本 → 貼上 `ai-chat-batch-deleter.user.js` 全部內容 → 儲存。
3. 開啟 ChatGPT 或 Google AI Mode 頁面，右下角會出現「AI 批次刪除」面板。

## 使用

1. 點「進入選取模式」，每筆對話列左上角會出現核取方塊，面板顯示「找到 N 筆」。
2. 勾選要刪的對話（點方塊或點對話列本體皆可，會以紅框標示）。
3. 點「刪除選取 (N)」→ 確認 → 依序刪除，面板顯示進度。
4. 執行中可按「中止」停止；未刪的仍保留勾選。

## 運作方式與設計

- **純 DOM 點擊**：不呼叫任何內部 API。每筆流程為「開選項選單 → 點刪除 →（若有）確認 → 等待該筆消失」。
- **節流**：每筆間隔 1 秒，降低觸發站台防濫用機制的風險。
- **選擇器策略**：
  - Google 以穩定屬性定位：`ul[data-xid="threads-list-root"]`（清單）、`button[data-thread-id]`（單筆與 id）、`.uQv1Ce`（標題）、`#actions-button-{id}`（選項按鈕）。
  - 刪除選單項與確認鈕以文字比對（`刪除` / `删除` / `Delete`），不綁定亂數 class name，較耐改版。
- **SPA 相容**：以 `MutationObserver` 監聽，面板與勾選高亮在路由切換或清單重繪後自動恢復。

## 已知限制

- **不可復原**：刪除為永久操作，執行前有二次確認。
- **ChatGPT 選擇器為 best-effort**：側邊欄選項按鈕以 `data-testid$="options"` 與 `aria-label` 猜測；若站台改版找不到按鈕，面板會在 console 記錄失敗，屆時調整 `chatgptAdapter.deleteFlow` 內的選擇器即可。
- **Google 刪除選單**：以文字比對定位刪除項；若未來介面文字改變，補進 `DELETE_WORDS` / `CONFIRM_WORDS` 常數即可。
- 僅處理目前已載入清單；需先在側邊欄捲動 / 點「顯示更多」載入要刪的對話。
