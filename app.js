/**
 * 表情對決 — 介面與互動。
 * 顯示表情，玩家在 4 種種類中搶拍正確答案；限時、combo 加速、計分。
 */
import {
  newGame,
  judge,
  onCorrect,
  finishGame,
  pickQuestion,
  shuffledCategories,
  categoryOf,
} from "./game.js";
import { ReacttapAudio } from "./audio.js";

const audio = new ReacttapAudio();

const els = {
  status: document.getElementById("status"),
  emote: document.getElementById("emote"),
  options: document.getElementById("options"),
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  timebar: document.getElementById("timebar"),
  best: document.getElementById("best-label"),
  btnNew: document.getElementById("btn-new"),
  btnMute: document.getElementById("btn-mute"),
  endPanel: document.getElementById("end-panel"),
  endTitle: document.getElementById("end-title"),
  endScore: document.getElementById("end-score"),
  endBest: document.getElementById("end-best"),
  btnAgain: document.getElementById("btn-again"),
};

const BEST_KEY = "pg-reacttap-best";

let state = null;
let phase = "title"; // title | playing | solved | over
let current = null; // { question, cats }
let timer = null;
let timeLeft = 0;
let best = 0;
let voiceLoaded = false;

async function loadBest() {
  try {
    const res = await fetch(`/api/kv/${BEST_KEY}`);
    if (res.ok) {
      const t = (await res.text()).trim();
      if (/^\d+$/.test(t)) {
        best = Number(t);
        els.best.textContent = `${best}`;
        return;
      }
    }
  } catch {
    /* 無 KV */
  }
  els.best.textContent = "—";
}

async function saveBest() {
  els.best.textContent = `${best}`;
  try {
    await fetch(`/api/kv/${BEST_KEY}`, { method: "PUT", body: String(best) });
  } catch {
    /* 無 KV */
  }
}

function setStatus(msg, tone = "") {
  els.status.textContent = msg;
  els.status.dataset.tone = tone;
}

function startGame() {
  audio.unlock();
  state = newGame();
  current = null;
  phase = "playing";
  els.endPanel.classList.add("hidden");
  loadCanonical();
  setStatus("準備…");
  setTimeout(() => {
    if (phase !== "playing") return;
    nextQuestion();
  }, 600);
}

/** 取一個「正確答案能被 4 種選項覆蓋」的題目。 */
function loadCanonical() {
  const { question, used } = pickQuestion(state.used);
  state.used = used;
  current = { question, cats: shuffledCategories() };
}

function nextQuestion() {
  if (phase !== "playing") return;
  clearInterval(timer);
  loadCanonical();
  state.time = timeLimitNow();
  timeLeft = state.time;
  renderQuestion();
  startTimer();
}

function timeLimitNow() {
  // 隨 combo 遞減（與 game.timeLimit 一致但避免 import 重複載入成本）
  const base = 3.0;
  const min = 0.9;
  const step = 0.2;
  return Math.max(min, base - Math.floor(state.combo / 5) * step);
}

function startTimer() {
  updateTimerBar();
  timer = setInterval(() => {
    timeLeft -= 0.05;
    updateTimerBar();
    if (timeLeft <= 0) {
      clearInterval(timer);
      onTimeout();
    }
  }, 50);
}

function updateTimerBar() {
  const pct = Math.max(0, (timeLeft / state.time) * 100);
  els.timebar.style.width = `${pct}%`;
  if (timeLeft <= 1) {
    els.timebar.classList.add("urgent");
    audio.tick();
  } else {
    els.timebar.classList.remove("urgent");
  }
}

function renderQuestion() {
  els.emote.innerHTML = "";
  const img = document.createElement("img");
  img.src = `assets/emotes/${current.question.file}`;
  img.alt = "表情";
  img.draggable = false;
  els.emote.appendChild(img);

  els.options.innerHTML = "";
  for (const cat of current.cats) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.dataset.cat = cat.id;
    btn.textContent = `${cat.icon} ${cat.zh}`;
    btn.addEventListener("click", () => answer(cat.id));
    els.options.appendChild(btn);
  }
  renderHud();
}

function renderHud() {
  els.score.textContent = String(state.score);
  els.combo.textContent = `${state.combo} combo`;
}

function answer(catId) {
  if (phase !== "playing") return;
  clearInterval(timer);
  const ok = judge(current.question, catId);
  if (ok) {
    audio.good();
    state = onCorrect(state);
    audio._lastCombo = state.combo;
    audio.combo();
    if (!voiceLoaded) {
      voiceLoaded = true;
      audio.loadVoice("correct", "assets/voice/correct.ogg").then(() => audio.playVoice("correct"));
    } else {
      audio.playVoice("correct");
    }
    setStatus(`答對！ +${state.combo * 2 + 10}`, "win");
    highlightOption(catId, true);
    phase = "solved";
    setTimeout(() => {
      if (phase === "solved") nextQuestion();
    }, 350);
  } else {
    audio.wrong();
    highlightAnswer();
    setStatus("答錯…", "lose");
    endGame();
  }
}

function highlightOption(catId, correct) {
  for (const btn of els.options.querySelectorAll("button")) {
    if (btn.dataset.cat === catId) btn.classList.add("flash");
    else if (!correct) btn.classList.add("dim");
  }
}

function highlightAnswer() {
  const correctCat = current.question.cat;
  for (const btn of els.options.querySelectorAll("button")) {
    if (btn.dataset.cat === correctCat) btn.classList.add("correct");
  }
}

function onTimeout() {
  if (phase !== "playing") return;
  audio.wrong();
  highlightAnswer();
  setStatus("時間到！", "lose");
  endGame();
}

function endGame() {
  phase = "over";
  const res = finishGame(state);
  const isRecord = res.score > best;
  if (isRecord) {
    best = res.score;
    saveBest();
  }
  els.endPanel.classList.remove("hidden");
  els.endTitle.textContent = isRecord ? "新紀錄！" : "本局結束";
  els.endScore.textContent = `${res.score} 分`;
  els.endBest.textContent = `${res.bestCombo} combo`;
  setTimeout(() => {
    if (phase === "over") audio.playVoice("game_over");
  }, 400);
}

function newGameBtn() {
  startGame();
}

function bindEvents() {
  els.btnNew.addEventListener("click", newGameBtn);
  els.btnAgain.addEventListener("click", newGameBtn);
  els.btnMute.addEventListener("click", () => {
    const on = audio.enabled;
    audio.setEnabled(!on);
    els.btnMute.setAttribute("aria-pressed", String(!on));
    els.btnMute.textContent = on ? "音效關" : "音效開";
  });
}

async function init() {
  bindEvents();
  await loadBest();
  startGame();
}

init();