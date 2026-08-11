/**
 * 表情對決 — Web Audio 合成音效（無第三方取樣）。
 * 語音提示（correct 等）使用拷入的 assets/voice/*.ogg。
 */
export class ReacttapAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = 0.22;
    this._voices = {};
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
  }

  /** 載入語音 ogg 供提示播放（失敗不影響遊戲）。 */
  async loadVoice(name, url) {
    if (!window.fetch) return;
    const audio = this._voices[name];
    if (audio) return audio;
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      this.ensure();
      if (!this.ctx) return null;
      const decoded = await this.ctx.decodeAudioData(buf);
      this._voices[name] = decoded;
      return decoded;
    } catch {
      return null;
    }
  }

  playVoice(name) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    const buffer = this._voices[name];
    if (!ctx || !buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  tone(freq, dur, type = "sine", gain = 0.12, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.master, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.04, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise(dur, gain = 0.3, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * this.master, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t0);
  }

  select() {
    this.tone(260, 0.05, "triangle", 0.1);
    this.noise(0.03, 0.15);
  }

  good() {
    // 上揚雙音
    this.tone(523, 0.08, "sine", 0.14);
    this.tone(784, 0.12, "sine", 0.14, 0.06);
  }

  combo() {
    const base = 660 + Math.min(400, this._lastCombo * 30);
    this.tone(base, 0.09, "triangle", 0.12);
    this.tone(base * 1.5, 0.1, "triangle", 0.1, 0.05);
  }

  tick() {
    this.tone(880, 0.04, "square", 0.06);
  }

  wrong() {
    this.tone(180, 0.18, "sawtooth", 0.12);
    this.tone(140, 0.2, "square", 0.1, 0.08);
  }

  win() {
    const seq = [523, 659, 784, 1047, 1319];
    seq.forEach((f, i) => this.tone(f, 0.16, "sine", 0.14, i * 0.11));
  }
}
