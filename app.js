/**
 * 表情對決 — 介面層：把 game.js 的規則狀態畫成可點的場面，並接上音效與最高分。
 * 所有確認／提示都在頁內（不使用 alert／confirm／prompt）。
 */
import {
  COLORS,
  EMOTES,
  MOODS,
  ROUNDS_PER_LEVEL,
  TOTAL_ROUNDS,
  colorOf,
  moodOf,
  newGame,
  nextRound,
  progress,
  revealTargets,
  startRound,
  summary,
  tapTile,
  tickTime,
} from "./game.js";
import { GameAudio } from "./audio.js";

const KV_BEST = "pg-reacttap-best";
const KV_CLEARED = "pg-reacttap-cleared";

const el = (id) => document.getElementById(id);
const ui = {
  level: el("stat-level"),
  score: el("stat-score"),
  combo: el("stat-combo"),
  lives: el("stat-lives"),
  ruleBadge: el("rule-badge"),
  ruleText: el("rule-text"),
  ruleLeft: el("rule-left"),
  timebar: el("timebar"),
  timefill: el("timefill"),
  timeText: el("time-text"),
  board: el("board"),
  flash: el("flash"),
  progressFill: el("progress-fill"),
  progressText: el("progress-text"),
  best: el("best"),
  overlay: el("overlay"),
  ovEyebrow: el("ov-eyebrow"),
  ovTitle: el("ov-title"),
  ovBody: el("ov-body"),
  ovStats: el("ov-stats"),
  ovAction: el("ov-action"),
  btnSound: el("btn-sound"),
  btnRestart: el("btn-restart"),
  confirmBar: el("confirm-bar"),
  confirmYes: el("confirm-yes"),
  confirmNo: el("confirm-no"),
  legendMood: el("legend-mood"),
  legendColor: el("legend-color"),
};

const audio = new GameAudio();

let state = newGame();
let tiles = new Map();
let boardRound = -1;
let best = 0;
let everCleared = false;
let pending = new Set();
let nextTickAt = 0;
let hurried = false;
let lastFrame = 0;
let raf = 0;

/* ---------- 最高分（/api/kv；沒有後端時靜默跳過） ---------- */

async function kvGet(key) {
  try {
    const res = await fetch(`/api/kv/${key}`);
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

async function kvPut(key, value) {
  try {
    await fetch(`/api/kv/${key}`, { method: "PUT", body: String(value) });
  } catch {
    /* 無 KV 環境：不影響遊玩 */
  }
}

async function loadSaved() {
  const [bestRaw, clearedRaw] = await Promise.all([kvGet(KV_BEST), kvGet(KV_CLEARED)]);
  if (bestRaw && /^\d+$/.test(bestRaw)) best = Number(bestRaw);
  everCleared = clearedRaw === "1";
  renderBest();
}

function renderBest() {
  ui.best.textContent = best ? `${best}${everCleared ? " ·通關" : ""}` : "—";
}

/* ---------- 畫面 ---------- */

function renderStats() {
  ui.level.textContent = `${state.level}-${state.roundIndex + 1}`;
  ui.score.textContent = String(state.score);
  ui.combo.textContent = String(state.combo);
  ui.lives.textContent =
    "♥".repeat(state.lives) + "♡".repeat(Math.max(0, state.maxLives - state.lives));
}

function bump(node) {
  node.classList.remove("bump");
  void node.offsetWidth;
  node.classList.add("bump");
}

function renderRule() {
  const rule = state.rule;
  if (!rule) {
    ui.ruleBadge.className = "rule-badge";
    ui.ruleBadge.textContent = "😄";
    ui.ruleBadge.style.background = "";
    ui.ruleText.textContent = "按「開始遊戲」出題";
    ui.ruleLeft.textContent = "";
    return;
  }
  if (rule.icon) {
    ui.ruleBadge.className = "rule-badge";
    ui.ruleBadge.style.background = "";
    ui.ruleBadge.textContent = rule.icon;
  } else {
    ui.ruleBadge.className = `rule-badge swatch ${rule.value}`;
    ui.ruleBadge.textContent = "";
    ui.ruleBadge.style.background = rule.value === "mono" ? "" : rule.hex;
  }
  const negate = rule.kind.endsWith("-not");
  ui.ruleText.innerHTML = negate
    ? `點所有<span class="neg">「${escapeHtml(rule.short)}」</span>的`
    : `點所有「${escapeHtml(rule.short)}」的`;
  ui.ruleLeft.textContent = `還剩 ${state.remaining}`;
}

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function describe(cell) {
  const mood = moodOf(cell.mood);
  const color = colorOf(cell.color);
  return `${color?.zh ?? ""}的${mood?.zh ?? ""}表情`;
}

function renderBoard() {
  if (boardRound === state.round) {
    syncTiles();
    return;
  }
  boardRound = state.round;
  tiles = new Map();
  ui.board.replaceChildren();
  for (const cell of state.board) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.dataset.id = cell.id;
    const img = document.createElement("img");
    img.src = `assets/emotes/${cell.file}`;
    img.alt = describe(cell);
    img.draggable = false;
    btn.appendChild(img);
    ui.board.appendChild(btn);
    tiles.set(cell.id, btn);
  }
  syncTiles();
}

function syncTiles() {
  const reveal = state.status === "roundFail" || state.status === "lost";
  const missed = reveal ? new Set(revealTargets(state.board)) : null;
  for (const cell of state.board) {
    const btn = tiles.get(cell.id);
    if (!btn) continue;
    btn.classList.toggle("hit", cell.tapped && !cell.wrong);
    btn.classList.toggle("wrong", !!cell.wrong);
    btn.classList.toggle("reveal", !!missed?.has(cell.id));
    btn.disabled = state.status !== "playing" || cell.tapped;
  }
}

function renderTime() {
  const pct = state.timeLimit > 0 ? Math.max(0, state.timeLeft / state.timeLimit) : 0;
  ui.timefill.style.transform = `scaleX(${pct})`;
  ui.timefill.classList.toggle("warn", pct <= 0.5 && pct > 0.25);
  ui.timefill.classList.toggle("urgent", pct <= 0.25);
  ui.timeText.textContent = state.timeLimit ? `${state.timeLeft.toFixed(1)} 秒` : "—";
  ui.timebar.setAttribute("aria-valuenow", state.timeLeft.toFixed(1));
  ui.timebar.setAttribute("aria-valuemax", String(state.timeLimit || 0));
}

function renderProgress() {
  const p = progress(state);
  ui.progressFill.style.width = `${(p.cleared / p.total) * 100}%`;
  ui.progressText.textContent = `${p.cleared} / ${p.total}`;
}

function flash(msg, tone = "") {
  ui.flash.textContent = msg || "\u00a0";
  ui.flash.dataset.tone = tone;
}

function render() {
  renderStats();
  renderRule();
  renderBoard();
  renderTime();
  renderProgress();
}

/* ---------- 遊戲迴圈 ---------- */

function loop(ts) {
  raf = requestAnimationFrame(loop);
  const dt = lastFrame ? Math.min(0.12, (ts - lastFrame) / 1000) : 0;
  lastFrame = ts;
  if (state.status !== "playing") return;
  state = tickTime(state, dt);
  renderTime();
  if (state.status === "playing") {
    if (!hurried && state.timeLeft <= 2.2) {
      hurried = true;
      audio.play("hurry_up", { gain: 0.72 });
    }
    if (state.timeLeft <= 1.2 && ts >= nextTickAt) {
      nextTickAt = ts + 380;
      audio.play("tick", { gain: 0.5 });
    }
    return;
  }
  onRoundEnd();
}

function schedule(ms, fn) {
  const timer = setTimeout(() => {
    pending.delete(timer);
    fn();
  }, ms);
  pending.add(timer);
}

function clearSchedules() {
  for (const timer of pending) clearTimeout(timer);
  pending.clear();
}

function onRoundEnd() {
  syncTiles();
  renderStats();
  renderProgress();

  if (state.status === "roundClear") {
    audio.play("clear");
    audio.play("correct", { gain: 0.7 });
    flash(`過關！連擊 ${state.combo}`, "good");
    schedule(620, advance);
    return;
  }

  const timedOut = state.lastFailure === "timeout";
  audio.play(timedOut ? "timeout" : "miss");
  bump(ui.lives);

  if (state.status === "lost") {
    flash(timedOut ? "時間到…" : "出局了…", "bad");
    audio.play("lose");
    schedule(500, () => audio.play("game_over", { gain: 0.9 }));
    schedule(1100, () => finish(false));
    return;
  }

  flash(timedOut ? "時間到！還剩沒點完的" : "點錯了！看一下正解", "bad");
  schedule(1150, advance);
}

function advance() {
  const before = state.status;
  state = nextRound(state);
  if (state.status === "won") {
    finish(true);
    return;
  }
  if (before === "roundClear" && state.levelUp) {
    audio.play("levelup");
    flash(`第 ${state.level} 關`, "level");
  } else {
    flash("");
  }
  nextTickAt = 0;
  hurried = false;
  render();
}

/* ---------- 開始／結束 ---------- */

function beginGame() {
  clearSchedules();
  hideConfirm();
  state = startRound(newGame());
  boardRound = -1;
  nextTickAt = 0;
  hurried = false;
  lastFrame = 0;
  ui.overlay.hidden = true;
  flash("");
  render();
  audio.play("start");
  audio.play("ready", { gain: 0.8 });
}

async function finish(won) {
  const result = summary(state);
  const record = result.score > best;
  if (record) best = result.score;
  if (won) everCleared = true;
  renderBest();
  if (record) void kvPut(KV_BEST, best);
  if (won) void kvPut(KV_CLEARED, "1");

  if (won) {
    audio.play("win");
    schedule(350, () => audio.play("congratulations", { gain: 0.9 }));
  } else if (record) {
    schedule(700, () => audio.play("new_highscore", { gain: 0.9 }));
  }

  showOverlay({
    eyebrow: won ? "全關通過" : "本局結束",
    title: won ? "通關了！" : record ? "新紀錄！" : "出局",
    body: won
      ? `八關 ${TOTAL_ROUNDS} 回合全數過關，反應力驚人。`
      : `撐到第 ${result.level} 關第 ${state.roundIndex + 1} 回合。${record ? "" : `最高分 ${best}。`}`,
    stats: [
      ["分數", result.score],
      ["最高連擊", result.bestCombo],
      ["過關回合", `${result.cleared} / ${TOTAL_ROUNDS}`],
      ["失誤／超時", `${result.misses} / ${result.timeouts}`],
    ],
    action: "再玩一次",
  });
}

function showOverlay({ eyebrow, title, body, stats, action }) {
  ui.ovEyebrow.textContent = eyebrow;
  ui.ovTitle.textContent = title;
  ui.ovBody.textContent = body;
  if (stats?.length) {
    ui.ovStats.hidden = false;
    ui.ovStats.replaceChildren(
      ...stats.map(([k, v]) => {
        const li = document.createElement("li");
        const key = document.createElement("span");
        key.className = "k";
        key.textContent = k;
        const val = document.createElement("span");
        val.className = "v";
        val.textContent = String(v);
        li.append(key, val);
        return li;
      }),
    );
  } else {
    ui.ovStats.hidden = true;
  }
  ui.ovAction.textContent = action;
  ui.overlay.hidden = false;
  ui.ovAction.focus();
}

/* ---------- 互動 ---------- */

function onBoardClick(event) {
  const btn = event.target.closest(".tile");
  if (!btn || state.status !== "playing") return;
  const before = state.remaining;
  const next = tapTile(state, btn.dataset.id);
  if (next === state) return;
  state = next;
  if (state.lastEvent === "hit") {
    audio.hit(state.combo + (before - state.remaining) - 1);
    syncTiles();
    renderStats();
    renderRule();
    return;
  }
  if (state.status === "roundClear") renderRule();
  onRoundEnd();
}

function showConfirm() {
  ui.confirmBar.hidden = false;
  ui.confirmYes.focus();
}

function hideConfirm() {
  ui.confirmBar.hidden = true;
}

function bindEvents() {
  ui.board.addEventListener("click", onBoardClick);

  ui.ovAction.addEventListener("click", () => {
    void audio.unlock();
    beginGame();
  });

  ui.btnRestart.addEventListener("click", () => {
    void audio.unlock();
    audio.play("ui");
    if (state.status === "ready" || state.status === "won" || state.status === "lost") {
      beginGame();
      return;
    }
    if (ui.confirmBar.hidden) showConfirm();
    else hideConfirm();
  });

  ui.confirmYes.addEventListener("click", beginGame);
  ui.confirmNo.addEventListener("click", () => {
    hideConfirm();
    ui.btnRestart.focus();
  });

  ui.btnSound.addEventListener("click", () => {
    const on = !audio.enabled;
    audio.setEnabled(on);
    ui.btnSound.setAttribute("aria-pressed", String(on));
    ui.btnSound.textContent = on ? "🔊" : "🔇";
    if (on) {
      void audio.unlock();
      audio.play("ui");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) lastFrame = 0;
  });
}

function buildLegend() {
  ui.legendMood.replaceChildren(
    ...MOODS.map((mood) => {
      const li = document.createElement("li");
      const samples = EMOTES.filter((e) => e.mood === mood.id).slice(0, 4);
      li.append(`${mood.icon} ${mood.zh}`);
      for (const s of samples) {
        const img = document.createElement("img");
        img.src = `assets/emotes/${s.file}`;
        img.alt = "";
        li.appendChild(img);
      }
      return li;
    }),
  );
  ui.legendColor.replaceChildren(
    ...COLORS.map((color) => {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = `dot ${color.id}`;
      if (color.id !== "mono") dot.style.background = color.hex;
      li.append(dot, color.zh);
      const samples = EMOTES.filter((e) => e.color === color.id).slice(0, 3);
      for (const s of samples) {
        const img = document.createElement("img");
        img.src = `assets/emotes/${s.file}`;
        img.alt = "";
        li.appendChild(img);
      }
      return li;
    }),
  );
}

function init() {
  bindEvents();
  buildLegend();
  render();
  flash("");
  void loadSaved();
  raf = requestAnimationFrame(loop);
}

init();

export { ROUNDS_PER_LEVEL };
