# 表情對決 (Emoji Match)

節奏反應小遊戲：每回合依照「點所有開心的」「點所有藍色的」「點所有不是難過的」等規則，在倒數內找完場上全部目標。

本專案為 **Playgrounds SAM 遊戲**（unlisted、獨立 repo）。純 HTML＋CSS＋JS，零依賴、零 build。

## 玩法

1. 每回合會顯示一條心情或顏色規則，後期也會出現「不是⋯⋯」的否定題。
2. 在倒數結束前點完所有符合規則的表情；每盤一定同時有目標與誘餌。
3. 點錯或超時會扣一命並重打該回合；三條命歸零即落敗。
4. 連續過關會累積 combo、提高分數，也會加快倒數。
5. 共八關、每關三回合；完成 24 回合即明確通關。
6. 最高分與曾否通關透過 `/api/kv` 儲存；沒有 KV 的本機環境仍可遊玩。

## 操作

- 直接點場上的表情（觸控、滑鼠與鍵盤皆可）。
- 右上角可切換聲音或重新開始；遊玩中重新開始會先顯示頁內確認面。

## 技術

- 純函式規則邏輯在 `game.js`（題庫、出題、判定、計時、combo、結算）— 可單元測試、不碰 DOM。
- `app.js` 為 UI 層（DOM 渲染、計時迴圈、互動與 KV），`audio.js` 播放已拷入且署名的 Kenney 音效／語音，並提供 Web Audio 合成備援。
- `game.test.js` 為 Vitest 單元測試。

## 試玩

```bash
npx --yes serve .
```

開啟伺服器提示的網址（通常 `http://localhost:3000`）。

## 測試

```bash
npx --yes vitest@latest run
```

## 最高分（KV）

前端以 `fetch('/api/kv/<key>')` 讀寫最高分：

- key：`pg-reacttap-best`
- key：`pg-reacttap-cleared`
- GET 讀、PUT 寫（body 為純文字）。
- 無 KV 環境時照常遊玩，不報錯。

## 授權

- 程式碼：MIT（見 `LICENSE`，作者 Sampot）。
- 素材：見 `ATTRIBUTION.md`。
