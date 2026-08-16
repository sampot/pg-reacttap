/**
 * 表情對決 — 純規則邏輯（不碰 DOM）。
 *
 * 玩法：每回合抽一條規則（例「點所有『開心』」「點所有『不是藍色』」），
 * 場上鋪 6～12 個表情，玩家要在限時內把**所有**符合規則的表情點完。
 * 點到不符規則的、或時間到還沒點完 → 扣一命並重打本回合；命歸零＝落敗。
 * 連續過關累積 combo：分數加權、倒數縮短（加速）。
 * 打完 MAX_LEVEL × ROUNDS_PER_LEVEL 回合＝通關。
 */

/** 表情的「心情」分類（規則用）。 */
export const MOODS = [
  { id: "laugh", zh: "開心", icon: "😄" },
  { id: "sad", zh: "難過", icon: "😢" },
  { id: "anger", zh: "生氣", icon: "😠" },
  { id: "surprise", zh: "驚訝", icon: "😮" },
  { id: "sleep", zh: "想睡", icon: "😴" },
];

/** 表情的「顏色」分類（依 PNG 主色，規則用）。 */
export const COLORS = [
  { id: "red", zh: "紅色", hex: "#ff2f55" },
  { id: "orange", zh: "橘色", hex: "#ff9900" },
  { id: "blue", zh: "藍色", hex: "#3498db" },
  { id: "mono", zh: "黑白", hex: "#312d2d" },
];

/**
 * 題庫：assets/emotes/ 下的 PNG → 心情＋顏色。
 * 顏色取自圖檔主色（紅 #ff3300/#ff0054、橘 #ff9900、藍 #3498db、其餘黑白）。
 */
export const EMOTES = [
  { file: "emote_faceHappy.png", mood: "laugh", color: "mono" },
  { file: "emote_laugh.png", mood: "laugh", color: "mono" },
  { file: "emote_music.png", mood: "laugh", color: "mono" },
  { file: "emote_heart.png", mood: "laugh", color: "red" },
  { file: "emote_hearts.png", mood: "laugh", color: "red" },
  { file: "emote_star.png", mood: "laugh", color: "orange" },
  { file: "emote_stars.png", mood: "laugh", color: "orange" },
  { file: "emote_idea.png", mood: "laugh", color: "orange" },
  { file: "emote_cash.png", mood: "laugh", color: "orange" },
  { file: "emote_circle.png", mood: "laugh", color: "blue" },

  { file: "emote_faceSad.png", mood: "sad", color: "mono" },
  { file: "emote_cloud.png", mood: "sad", color: "mono" },
  { file: "emote_heartBroken.png", mood: "sad", color: "red" },
  { file: "emote_drop.png", mood: "sad", color: "blue" },
  { file: "emote_drops.png", mood: "sad", color: "blue" },

  { file: "emote_faceAngry.png", mood: "anger", color: "mono" },
  { file: "emote_anger.png", mood: "anger", color: "red" },
  { file: "emote_cross.png", mood: "anger", color: "red" },

  { file: "emote_exclamations.png", mood: "surprise", color: "mono" },
  { file: "emote_swirl.png", mood: "surprise", color: "mono" },
  { file: "emote_exclamation.png", mood: "surprise", color: "red" },
  { file: "emote_alert.png", mood: "surprise", color: "orange" },
  { file: "emote_question.png", mood: "surprise", color: "blue" },

  { file: "emote_sleep.png", mood: "sleep", color: "mono" },
  { file: "emote_sleeps.png", mood: "sleep", color: "mono" },
  { file: "emote_dots1.png", mood: "sleep", color: "mono" },
  { file: "emote_dots2.png", mood: "sleep", color: "mono" },
  { file: "emote_dots3.png", mood: "sleep", color: "mono" },
  { file: "emote_bars.png", mood: "sleep", color: "mono" },
];

/** 全部規則種類。 */
export const RULE_KINDS = ["mood-is", "color-is", "mood-not", "color-not"];

/** 關卡數與每關回合數。 */
export const MAX_LEVEL = 8;
export const ROUNDS_PER_LEVEL = 3;
export const TOTAL_ROUNDS = MAX_LEVEL * ROUNDS_PER_LEVEL;

/** 倒數下限（秒）；combo 再快也不會低於此值。 */
export const MIN_ROUND_TIME = 2.2;

/** 單回合最多的目標數（避免高關卡點不完）。 */
export const MAX_TARGETS = 6;

/** mulberry32：可重現的偽亂數，方便測試與重播。 */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, rand) {
  return list[Math.floor(rand() * list.length) % list.length];
}

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** 依 id 取心情定義。 */
export function moodOf(id) {
  return MOODS.find((m) => m.id === id);
}

/** 依 id 取顏色定義。 */
export function colorOf(id) {
  return COLORS.find((c) => c.id === id);
}

/** 依檔名取表情定義。 */
export function emoteOf(file) {
  return EMOTES.find((e) => e.file === file);
}

/** 該關可出現的規則種類（難度遞增：先單一心情，再顏色，最後否定題）。 */
export function availableKinds(level) {
  if (level <= 1) return ["mood-is"];
  if (level <= 2) return ["mood-is", "color-is"];
  if (level <= 4) return ["mood-is", "color-is", "mood-not"];
  return RULE_KINDS.slice();
}

/** 關卡參數：場上表情數、基礎秒數、可用規則。 */
export function levelSpec(level) {
  const l = Math.min(MAX_LEVEL, Math.max(1, level));
  return {
    level: l,
    tiles: Math.min(12, 5 + l),
    time: round1(Math.max(3.5, 7 - (l - 1) * 0.5)),
    kinds: availableKinds(l),
  };
}

/** 本回合秒數：關卡基礎秒數隨 combo 每 3 連遞減 0.3s，不低於 MIN_ROUND_TIME。 */
export function roundTime(level, combo) {
  const base = levelSpec(level).time;
  return round1(Math.max(MIN_ROUND_TIME, base - Math.floor(combo / 3) * 0.3));
}

/** 點中一個目標的分數：基礎 10 分＋combo 加權（上限 +40）。 */
export function tapPoints(combo) {
  return 10 + Math.min(40, combo * 2);
}

/** 過關獎勵：關卡、combo 與剩餘秒數都加分。 */
export function clearBonus(level, combo, timeLeft) {
  return 20 + level * 5 + combo * 3 + Math.max(0, Math.round(timeLeft * 5));
}

/** 抽一條規則（種類與內容都受關卡限制）。 */
export function makeRule(level, rand = Math.random) {
  const kind = pick(levelSpec(level).kinds, rand);
  if (kind === "mood-is" || kind === "mood-not") {
    const mood = pick(MOODS, rand);
    const negate = kind === "mood-not";
    return {
      kind,
      value: mood.id,
      icon: mood.icon,
      hex: null,
      short: negate ? `不是${mood.zh}` : mood.zh,
      label: negate ? `點所有「不是${mood.zh}」的` : `點所有「${mood.zh}」的`,
    };
  }
  const color = pick(COLORS, rand);
  const negate = kind === "color-not";
  return {
    kind,
    value: color.id,
    icon: null,
    hex: color.hex,
    short: negate ? `不是${color.zh}` : color.zh,
    label: negate ? `點所有「不是${color.zh}」的` : `點所有「${color.zh}」的`,
  };
}

/** 這個表情是不是本規則的目標。 */
export function isTarget(rule, emote) {
  if (!rule || !emote) return false;
  switch (rule.kind) {
    case "mood-is":
      return emote.mood === rule.value;
    case "mood-not":
      return emote.mood !== rule.value;
    case "color-is":
      return emote.color === rule.value;
    case "color-not":
      return emote.color !== rule.value;
    default:
      return false;
  }
}

/** 本回合的目標數量：至少 2 個、至少留 1 個誘餌、不超過 MAX_TARGETS。 */
export function targetCountFor(tiles, rand = Math.random) {
  const min = 2;
  const max = Math.max(min, Math.min(MAX_TARGETS, tiles - 2));
  return min + Math.floor(rand() * (max - min + 1));
}

/**
 * 依規則鋪一個場面：保證同時有目標與誘餌（規則不會退化成「全點」或「全不點」）。
 * 表情可重複出現。
 */
export function buildBoard(rule, tiles, rand = Math.random) {
  const hits = EMOTES.filter((e) => isTarget(rule, e));
  const decoys = EMOTES.filter((e) => !isTarget(rule, e));
  if (!hits.length || !decoys.length) {
    throw new Error(`rule pool empty: ${rule.kind}/${rule.value}`);
  }
  const wanted = Math.min(targetCountFor(tiles, rand), tiles - 1);
  const cells = [];
  for (let i = 0; i < wanted; i++) cells.push({ ...pick(hits, rand), target: true });
  for (let i = cells.length; i < tiles; i++) cells.push({ ...pick(decoys, rand), target: false });
  shuffle(cells, rand);
  return cells.map((c, i) => ({
    id: `c${i}`,
    file: c.file,
    mood: c.mood,
    color: c.color,
    target: c.target,
    tapped: false,
    wrong: false,
  }));
}

/** 新對局初始狀態（尚未開打）。 */
export function newGame({ lives = 3 } = {}) {
  return {
    status: "ready",
    level: 1,
    roundIndex: 0,
    round: 0,
    rule: null,
    board: [],
    remaining: 0,
    timeLimit: 0,
    timeLeft: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    lives,
    maxLives: lives,
    cleared: 0,
    misses: 0,
    timeouts: 0,
    levelUp: false,
    lastEvent: null,
    lastFailure: null,
  };
}

/** 開始（或重打）目前這一回合。 */
export function startRound(state, rand = Math.random) {
  if (state.status === "won" || state.status === "lost") return state;
  const spec = levelSpec(state.level);
  const rule = makeRule(state.level, rand);
  const board = buildBoard(rule, spec.tiles, rand);
  const limit = roundTime(state.level, state.combo);
  return {
    ...state,
    status: "playing",
    rule,
    board,
    remaining: board.filter((c) => c.target).length,
    timeLimit: limit,
    timeLeft: limit,
    round: state.round + 1,
    lastEvent: "round",
  };
}

function failRound(state, reason) {
  const lives = state.lives - 1;
  const base = { ...state, combo: 0, lives: Math.max(0, lives), lastFailure: reason };
  if (lives <= 0) return { ...base, status: "lost", lastEvent: "lose" };
  return { ...base, status: "roundFail", lastEvent: reason };
}

/** 點一格：命中目標得分，點到誘餌扣命並判本回合失敗。 */
export function tapTile(state, id) {
  if (state.status !== "playing") return state;
  const idx = state.board.findIndex((c) => c.id === id);
  if (idx < 0) return state;
  const cell = state.board[idx];
  if (cell.tapped) return state;

  const board = state.board.slice();

  if (!cell.target) {
    board[idx] = { ...cell, tapped: true, wrong: true };
    return failRound({ ...state, board, misses: state.misses + 1 }, "miss");
  }

  board[idx] = { ...cell, tapped: true };
  const remaining = state.remaining - 1;
  const score = state.score + tapPoints(state.combo);
  if (remaining > 0) {
    return { ...state, board, remaining, score, lastEvent: "hit" };
  }

  const combo = state.combo + 1;
  return {
    ...state,
    board,
    remaining: 0,
    status: "roundClear",
    score: score + clearBonus(state.level, combo, state.timeLeft),
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    cleared: state.cleared + 1,
    lastEvent: "clear",
  };
}

/** 推進倒數；歸零＝超時扣命。dt 以秒計，直接相減（不四捨五入，避免逐幀小步進被抹平）。 */
export function tickTime(state, dt) {
  if (state.status !== "playing") return state;
  const timeLeft = Math.max(0, state.timeLeft - dt);
  if (timeLeft > 0) return { ...state, timeLeft };
  return failRound({ ...state, timeLeft: 0, timeouts: state.timeouts + 1 }, "timeout");
}

/** 過關就前進下一回合／下一關（打完全部＝通關）；失敗則重打同一回合。 */
export function nextRound(state, rand = Math.random) {
  if (state.status === "won" || state.status === "lost") return state;
  if (state.status !== "roundClear") {
    return { ...startRound(state, rand), levelUp: false };
  }
  let level = state.level;
  let roundIndex = state.roundIndex + 1;
  let levelUp = false;
  if (roundIndex >= ROUNDS_PER_LEVEL) {
    level += 1;
    roundIndex = 0;
    levelUp = true;
  }
  if (level > MAX_LEVEL) {
    return { ...state, status: "won", levelUp: false, lastEvent: "win" };
  }
  return { ...startRound({ ...state, level, roundIndex }, rand), levelUp };
}

/** 失敗時把還沒點到的目標標出來（給 UI 提示正解用）。 */
export function revealTargets(board) {
  return board.filter((c) => c.target && !c.tapped).map((c) => c.id);
}

/** 進度：已過關回合／總回合。 */
export function progress(state) {
  return { cleared: state.cleared, total: TOTAL_ROUNDS };
}

/** 結算摘要。 */
export function summary(state) {
  return {
    won: state.status === "won",
    score: state.score,
    bestCombo: state.bestCombo,
    cleared: state.cleared,
    level: state.level,
    misses: state.misses,
    timeouts: state.timeouts,
  };
}
