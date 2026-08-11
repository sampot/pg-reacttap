# 表情對決 (Emoji Match)

節奏反應小遊戲：螢幕顯示一個表情，你在 4 個種類（笑／哭／怒／驚）中搶拍正確答案。限時反應、連擊加速、計分與最高紀錄。

本專案為 **Playgrounds SAM 遊戲**（unlisted、獨立 repo）。純 HTML＋CSS＋JS，零依賴、零 build。

## 玩法

1. 畫面中央出現一個表情，判斷它屬於「笑／哭／怒／驚」哪一種。
2. 在限時內點選正確種類；答錯或超時結束本局。
3. 連續答對 combo 越高，倒數越快、單題分數越高。
4. 分數存為最高紀錄。

## 操作

- 點四種答案按鈕即可（觸控／滑鼠皆可）。
- 「音效開／關」切換音效。
- 「開始／再玩一次」開新一局。

## 技術

- 純函式規則邏輯在 `game.js`（題庫、出題、判定、計時、combo、結算）— 可單元測試、不碰 DOM。
- `app.js` 為 UI 層（DOM 渲染＋互動＋Web Audio），`audio.js` 用 Web Audio 合成音效並播放拷入的語音提示。
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
- GET 讀、PUT 寫（body 為純數字字串）。
- 無 KV 環境時照常遊玩，不報錯。

## 授權

- 程式碼：MIT（見 `LICENSE`，作者 Sampot）。
- 素材：見 `ATTRIBUTION.md`。
