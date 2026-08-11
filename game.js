/**
 * 表情對決 — 純邏輯：題庫、出題、判定、計時、combo、結算。
 * 純函式設計，方便單元測試；不碰 DOM。
 *
 * 出題機制：螢幕顯示一個表情，玩家在 4 個種類（笑／哭／怒／驚）中搶拍
 * 正確種類；限時反應（秒數隨 combo 遞減，不會低於下限），答對累積 combo。
 */

/** 四個種類（選項）。 */
export const CATEGORIES = [
  { id: "laugh", zh: "笑", icon: "😄" },
  { id: "sad", zh: "哭", icon: "😢" },
  { id: "anger", zh: "怒", icon: "😠" },
  { id: "surprise", zh: "驚", icon: "😮" },
];

/**
 * 題庫：表情檔名（assets/emotes/ 下的 PNG）→ 正確種類。
 * 每個表情恰好屬於一種；此對應也是判定依據。
 */
export const BANK = [
  { file: "emote_laugh.png", cat: "laugh" },
  { file: "emote_faceHappy.png", cat: "laugh" },
  { file: "emote_heart.png", cat: "laugh" },
  { file: "emote_hearts.png", cat: "laugh" },
  { file: "emote_star.png", cat: "laugh" },
  { file: "emote_stars.png", cat: "laugh" },
  { file: "emote_music.png", cat: "laugh" },
  { file: "emote_idea.png", cat: "laugh" },

  { file: "emote_faceSad.png", cat: "sad" },
  { file: "emote_heartBroken.png", cat: "sad" },
  { file: "emote_drop.png", cat: "sad" },
  { file: "emote_drops.png", cat: "sad" },
  { file: "emote_sleep.png", cat: "sad" },
  { file: "emote_sleeps.png", cat: "sad" },

  { file: "emote_faceAngry.png", cat: "anger" },
  { file: "emote_anger.png", cat: "anger" },
  { file: "emote_bars.png", cat: "anger" },

  { file: "emote_exclamation.png", cat: "surprise" },
  { file: "emote_exclamations.png", cat: "surprise" },
  { file: "emote_alert.png", cat: "surprise" },
  { file: "emote_question.png", cat: "surprise" },
  { file: "emote_swirl.png", cat: "surprise" },
  { file: "emote_circle.png", cat: "surprise" },
  { file: "emote_cloud.png", cat: "surprise" },
];

/** 給定種類 id，回傳種類物件；無則 undefined。 */
export function categoryOf(id) {
  return CATEGORIES.find((c) => c.id === id);
}

/** 回傳某個種類的所有題目。 */
export function questionsOf(catId) {
  return BANK.filter((q) => q.cat === catId);
}

/**
 * 從題庫中挑一題（盡量不與 used 重複；題庫用完才重複）。
 * 回傳 { question, used }。
 */
export function pickQuestion(used = [], rand = Math.random) {
  const avoid = new Set(used);
  const fresh = BANK.filter((q) => !avoid.has(q.file));
  const pool = fresh.length ? fresh : BANK;
  const q = pool[Math.floor(rand() * pool.length)];
  return { question: q, used: [...used, q.file] };
}

/** 判定：答案種類是否等於題目的正確種類。 */
export function judge(question, answerCat) {
  return question.cat === answerCat;
}

/**
 * 限時（秒）隨 combo 遞減加速，但不低於下限。
 * combo 0 → 3.0s；每 5 combo 縮短一次，最低 0.9s。
 */
export function timeLimit(combo, { base = 3.0, min = 0.9, step = 0.2 } = {}) {
  return Math.max(min, base - Math.floor(combo / 5) * step);
}

/** 當題得分：基礎 10 分 + combo 加權（combo 越高每題越多分）。 */
export function pointValue(combo) {
  return 10 + Math.min(30, combo * 2);
}

/** 新對局初始狀態。 */
export function newGame() {
  return { score: 0, combo: 0, streak: 0, used: [], questions: 0, time: 3.0 };
}

/**
 * 答對時推進：累加分數與 combo。
 * 回傳更新後的狀態。
 */
export function onCorrect(state, rand = Math.random) {
  const combo = state.combo + 1;
  const score = state.score + pointValue(combo);
  const used = [...state.used];
  const { question, used: nextUsed } = pickQuestion(used, rand);
  return {
    ...state,
    score,
    combo,
    streak: state.streak + 1,
    used: nextUsed,
    questions: state.questions + 1,
    time: timeLimit(combo),
    current: question,
  };
}

/** 答錯或超時時結算本局：回傳 { score, bestCombo }。 */
export function finishGame(state) {
  return { score: state.score, bestCombo: state.combo, questions: state.questions };
}

/** 生成 4 種答案選項（洗牌）。 */
export function shuffledCategories(rand = Math.random) {
  const arr = CATEGORIES.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
