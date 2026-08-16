/**
 * 表情對決 — 音效層。
 *
 * 以 Web Audio 播放實際取樣（Kenney CC0 的 .ogg，見 ATTRIBUTION.md）：
 * 點擊、失誤、超時、過關、升關、勝負，加上關鍵時刻的語音提示。
 * 瀏覽器不支援 ogg 解碼時，退回同名的合成音，遊戲照常有聲。
 */

const SFX = {
  hit1: "assets/sfx/hit1.ogg",
  hit2: "assets/sfx/hit2.ogg",
  hit3: "assets/sfx/hit3.ogg",
  hit4: "assets/sfx/hit4.ogg",
  hit5: "assets/sfx/hit5.ogg",
  miss: "assets/sfx/miss.ogg",
  timeout: "assets/sfx/timeout.ogg",
  clear: "assets/sfx/clear.ogg",
  levelup: "assets/sfx/levelup.ogg",
  win: "assets/sfx/win.ogg",
  lose: "assets/sfx/lose.ogg",
  tick: "assets/sfx/tick.ogg",
  start: "assets/sfx/start.ogg",
  ui: "assets/sfx/ui.ogg",
};

const VOICE = {
  ready: "assets/voice/ready.ogg",
  correct: "assets/voice/correct.ogg",
  hurry_up: "assets/voice/hurry_up.ogg",
  game_over: "assets/voice/game_over.ogg",
  congratulations: "assets/voice/congratulations.ogg",
  new_highscore: "assets/voice/new_highscore.ogg",
};

/** 取樣載入失敗時的替身：用振盪器合成近似的音。 */
const FALLBACK = {
  hit1: { freq: 660, dur: 0.09, type: "triangle" },
  hit2: { freq: 740, dur: 0.09, type: "triangle" },
  hit3: { freq: 830, dur: 0.09, type: "triangle" },
  hit4: { freq: 990, dur: 0.09, type: "triangle" },
  hit5: { freq: 1170, dur: 0.09, type: "triangle" },
  miss: { freq: 165, dur: 0.22, type: "sawtooth" },
  timeout: { freq: 130, dur: 0.3, type: "square" },
  clear: { freq: 880, dur: 0.16, type: "sine", up: 1.5 },
  levelup: { freq: 700, dur: 0.2, type: "sine", up: 2 },
  win: { freq: 523, dur: 0.24, type: "sine", up: 2 },
  lose: { freq: 200, dur: 0.4, type: "sawtooth", up: 0.5 },
  tick: { freq: 1200, dur: 0.04, type: "square", gain: 0.5 },
  start: { freq: 523, dur: 0.12, type: "sine", up: 1.5 },
  ui: { freq: 420, dur: 0.05, type: "triangle", gain: 0.6 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = 0.5;
    this.buffers = new Map();
    this.loading = null;
  }

  /** 使用者手勢後呼叫：建立／恢復 AudioContext 並開始載入取樣。 */
  async unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.master;
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* 使用者尚未互動 */
      }
    }
    return this.preload();
  }

  /** 背景載入全部取樣；個別失敗不影響其他音。 */
  preload() {
    if (this.loading) return this.loading;
    const all = { ...SFX, ...VOICE };
    this.loading = Promise.all(
      Object.entries(all).map(([name, url]) => this.#load(name, url)),
    ).then(() => this.buffers.size);
    return this.loading;
  }

  async #load(name, url) {
    if (!this.ctx || this.buffers.has(name)) return;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const raw = await res.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(raw);
      this.buffers.set(name, decoded);
    } catch {
      /* 缺檔或瀏覽器不支援 ogg → 用合成音替代 */
    }
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (this.gain) this.gain.gain.value = this.enabled ? this.master : 0;
  }

  /** 播一個音；rate 可微調音高（combo 上升時用）。 */
  play(name, { rate = 1, gain = 1 } = {}) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const buffer = this.buffers.get(name);
    if (!buffer) {
      this.#synth(name, gain);
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.gain);
    src.start();
  }

  /** 點中目標：combo 越高音越亮。 */
  hit(combo = 0) {
    const step = Math.min(4, Math.floor(combo / 2));
    this.play(`hit${step + 1}`, { rate: 1 + Math.min(0.35, combo * 0.01) });
  }

  #synth(name, gain = 1) {
    const spec = FALLBACK[name];
    if (!spec || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.freq, t0);
    if (spec.up) {
      osc.frequency.exponentialRampToValueAtTime(spec.freq * spec.up, t0 + spec.dur);
    }
    const peak = 0.22 * gain * (spec.gain ?? 1);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.dur);
    osc.connect(g);
    g.connect(this.gain);
    osc.start(t0);
    osc.stop(t0 + spec.dur + 0.05);
  }
}
