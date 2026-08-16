import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  COLORS,
  EMOTES,
  MAX_LEVEL,
  MAX_TARGETS,
  MIN_ROUND_TIME,
  MOODS,
  ROUNDS_PER_LEVEL,
  RULE_KINDS,
  TOTAL_ROUNDS,
  availableKinds,
  buildBoard,
  clearBonus,
  colorOf,
  emoteOf,
  isTarget,
  levelSpec,
  makeRng,
  makeRule,
  moodOf,
  newGame,
  nextRound,
  progress,
  revealTargets,
  roundTime,
  startRound,
  summary,
  tapPoints,
  tapTile,
  targetCountFor,
  tickTime,
} from "./game.js";

const here = dirname(fileURLToPath(import.meta.url));

/** 用固定 seed 開一局並發完第一回合。 */
function fresh(seed = 7, opts) {
  return startRound(newGame(opts), makeRng(seed));
}

/** 依序點完場上所有目標（回傳過關後的狀態）。 */
function clearRound(state) {
  let s = state;
  for (const cell of state.board.filter((c) => c.target)) {
    s = tapTile(s, cell.id);
  }
  return s;
}

/** 點第一個誘餌。 */
function tapDecoy(state) {
  return tapTile(state, state.board.find((c) => !c.target && !c.tapped).id);
}

describe("題庫", () => {
  it("每個表情的 PNG 都真的存在", () => {
    for (const e of EMOTES) {
      expect(existsSync(join(here, "assets", "emotes", e.file)), e.file).toBe(true);
    }
  });

  it("每個表情都有合法的心情與顏色，且檔名不重複", () => {
    const moodIds = MOODS.map((m) => m.id);
    const colorIds = COLORS.map((c) => c.id);
    for (const e of EMOTES) {
      expect(moodIds, e.file).toContain(e.mood);
      expect(colorIds, e.file).toContain(e.color);
    }
    expect(new Set(EMOTES.map((e) => e.file)).size).toBe(EMOTES.length);
  });

  it("每個心情與顏色都至少有兩個表情，也都留得下誘餌", () => {
    for (const m of MOODS) {
      const n = EMOTES.filter((e) => e.mood === m.id).length;
      expect(n, m.id).toBeGreaterThanOrEqual(2);
      expect(n, m.id).toBeLessThan(EMOTES.length);
    }
    for (const c of COLORS) {
      const n = EMOTES.filter((e) => e.color === c.id).length;
      expect(n, c.id).toBeGreaterThanOrEqual(2);
      expect(n, c.id).toBeLessThan(EMOTES.length);
    }
  });

  it("查表 helper 可用", () => {
    expect(moodOf("laugh").zh).toBe("開心");
    expect(colorOf("blue").zh).toBe("藍色");
    expect(emoteOf("emote_heart.png")).toMatchObject({ mood: "laugh", color: "red" });
    expect(emoteOf("nope.png")).toBeUndefined();
  });
});

describe("音訊素材", () => {
  it("每個遊戲事件都有實際 Kenney 音效檔", () => {
    const names = [
      "hit1",
      "hit2",
      "hit3",
      "hit4",
      "hit5",
      "miss",
      "timeout",
      "clear",
      "levelup",
      "win",
      "lose",
      "tick",
      "start",
      "ui",
    ];
    for (const name of names) {
      expect(existsSync(join(here, "assets", "sfx", `${name}.ogg`)), name).toBe(true);
    }
  });

  it("所有語音提示與三份音訊授權檔都存在", () => {
    const voices = ["ready", "correct", "hurry_up", "game_over", "congratulations", "new_highscore"];
    for (const name of voices) {
      expect(existsSync(join(here, "assets", "voice", `${name}.ogg`)), name).toBe(true);
    }
    for (const file of [
      "assets/voice/License.txt",
      "assets/sfx/License-digital-audio.txt",
      "assets/sfx/License-interface-sounds.txt",
    ]) {
      expect(existsSync(join(here, file)), file).toBe(true);
    }
  });
});

describe("規則判定", () => {
  const happyMono = { mood: "laugh", color: "mono" };
  const sadBlue = { mood: "sad", color: "blue" };

  it("mood-is 只認同一心情", () => {
    const rule = { kind: "mood-is", value: "laugh" };
    expect(isTarget(rule, happyMono)).toBe(true);
    expect(isTarget(rule, sadBlue)).toBe(false);
  });

  it("mood-not 認所有其他心情", () => {
    const rule = { kind: "mood-not", value: "laugh" };
    expect(isTarget(rule, happyMono)).toBe(false);
    expect(isTarget(rule, sadBlue)).toBe(true);
  });

  it("color-is / color-not 認顏色", () => {
    expect(isTarget({ kind: "color-is", value: "blue" }, sadBlue)).toBe(true);
    expect(isTarget({ kind: "color-is", value: "blue" }, happyMono)).toBe(false);
    expect(isTarget({ kind: "color-not", value: "blue" }, sadBlue)).toBe(false);
    expect(isTarget({ kind: "color-not", value: "blue" }, happyMono)).toBe(true);
  });

  it("未知規則與缺參數一律不算目標", () => {
    expect(isTarget({ kind: "nope", value: "laugh" }, happyMono)).toBe(false);
    expect(isTarget(null, happyMono)).toBe(false);
    expect(isTarget({ kind: "mood-is", value: "laugh" }, null)).toBe(false);
  });

  it("任何規則都同時有目標與誘餌（不會出現全點／全不點的題）", () => {
    for (const kind of RULE_KINDS) {
      const values = kind.startsWith("mood") ? MOODS : COLORS;
      for (const v of values) {
        const rule = { kind, value: v.id };
        const hits = EMOTES.filter((e) => isTarget(rule, e)).length;
        expect(hits, `${kind}/${v.id}`).toBeGreaterThan(0);
        expect(hits, `${kind}/${v.id}`).toBeLessThan(EMOTES.length);
      }
    }
  });
});

describe("出題與關卡", () => {
  it("第 1 關只出肯定的心情題", () => {
    expect(availableKinds(1)).toEqual(["mood-is"]);
    const rand = makeRng(3);
    for (let i = 0; i < 60; i++) expect(makeRule(1, rand).kind).toBe("mood-is");
  });

  it("難度遞增會解鎖顏色題與否定題", () => {
    expect(availableKinds(2)).toContain("color-is");
    expect(availableKinds(3)).toContain("mood-not");
    expect(availableKinds(MAX_LEVEL).sort()).toEqual(RULE_KINDS.slice().sort());
    const rand = makeRng(11);
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(makeRule(MAX_LEVEL, rand).kind);
    expect([...seen].sort()).toEqual(RULE_KINDS.slice().sort());
  });

  it("規則帶得出可顯示的中文敘述", () => {
    const rand = makeRng(5);
    for (let i = 0; i < 100; i++) {
      const rule = makeRule(MAX_LEVEL, rand);
      expect(rule.label).toMatch(/^點所有「.+」的$/);
      expect(rule.short.length).toBeGreaterThan(0);
      if (rule.kind.startsWith("mood")) expect(rule.icon).toBeTruthy();
      else expect(rule.hex).toMatch(/^#[0-9a-f]{6}$/i);
      if (rule.kind.endsWith("-not")) expect(rule.label).toContain("不是");
    }
  });

  it("關卡越高：格子越多、基礎時間越短", () => {
    for (let l = 2; l <= MAX_LEVEL; l++) {
      expect(levelSpec(l).tiles).toBeGreaterThanOrEqual(levelSpec(l - 1).tiles);
      expect(levelSpec(l).time).toBeLessThan(levelSpec(l - 1).time);
    }
    expect(levelSpec(1).tiles).toBe(6);
    expect(levelSpec(MAX_LEVEL).tiles).toBe(12);
    expect(levelSpec(0).level).toBe(1);
    expect(levelSpec(99).level).toBe(MAX_LEVEL);
  });

  it("combo 會加速倒數，但有下限", () => {
    expect(roundTime(1, 0)).toBe(levelSpec(1).time);
    expect(roundTime(1, 3)).toBeLessThan(roundTime(1, 0));
    expect(roundTime(1, 6)).toBeLessThan(roundTime(1, 3));
    expect(roundTime(MAX_LEVEL, 99)).toBe(MIN_ROUND_TIME);
  });

  it("combo 會加分，但有上限", () => {
    expect(tapPoints(0)).toBe(10);
    expect(tapPoints(5)).toBeGreaterThan(tapPoints(0));
    expect(tapPoints(999)).toBe(50);
  });

  it("過關獎勵隨關卡、combo 與剩餘時間增加", () => {
    expect(clearBonus(2, 0, 0)).toBeGreaterThan(clearBonus(1, 0, 0));
    expect(clearBonus(1, 5, 0)).toBeGreaterThan(clearBonus(1, 0, 0));
    expect(clearBonus(1, 0, 3)).toBeGreaterThan(clearBonus(1, 0, 0));
  });
});

describe("場面生成", () => {
  it("目標數在合理範圍：至少 2、至少留一個誘餌、不超過上限", () => {
    const rand = makeRng(13);
    for (const tiles of [6, 8, 10, 12]) {
      for (let i = 0; i < 200; i++) {
        const n = targetCountFor(tiles, rand);
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(Math.min(MAX_TARGETS, tiles - 2));
      }
    }
  });

  it("場面格數正確，且目標／誘餌都符合規則", () => {
    const rand = makeRng(21);
    for (let l = 1; l <= MAX_LEVEL; l++) {
      const spec = levelSpec(l);
      for (let i = 0; i < 30; i++) {
        const rule = makeRule(l, rand);
        const board = buildBoard(rule, spec.tiles, rand);
        expect(board).toHaveLength(spec.tiles);
        const targets = board.filter((c) => c.target);
        expect(targets.length).toBeGreaterThanOrEqual(1);
        expect(targets.length).toBeLessThan(board.length);
        for (const cell of board) {
          expect(isTarget(rule, cell), `${rule.kind}/${rule.value} ${cell.file}`).toBe(cell.target);
        }
      }
    }
  });

  it("每格有唯一 id、初始未點擊", () => {
    const board = buildBoard({ kind: "mood-is", value: "laugh" }, 9, makeRng(4));
    expect(new Set(board.map((c) => c.id)).size).toBe(9);
    expect(board.every((c) => c.tapped === false && c.wrong === false)).toBe(true);
  });

  it("規則湊不出誘餌時直接報錯（防呆）", () => {
    expect(() => buildBoard({ kind: "nope", value: "x" }, 6, makeRng(1))).toThrow(/rule pool empty/);
  });
});

describe("對局流程", () => {
  it("newGame 是尚未開打的乾淨狀態", () => {
    const s = newGame();
    expect(s).toMatchObject({ status: "ready", level: 1, score: 0, combo: 0, lives: 3, cleared: 0 });
    expect(s.board).toEqual([]);
    expect(newGame({ lives: 5 }).lives).toBe(5);
  });

  it("startRound 發題並起算倒數", () => {
    const s = fresh();
    expect(s.status).toBe("playing");
    expect(s.rule).toBeTruthy();
    expect(s.board.length).toBe(levelSpec(1).tiles);
    expect(s.remaining).toBe(s.board.filter((c) => c.target).length);
    expect(s.timeLeft).toBe(s.timeLimit);
    expect(s.round).toBe(1);
  });

  it("點中目標：扣掉一個待點、加分、不扣命", () => {
    const s = fresh();
    const target = s.board.find((c) => c.target);
    const after = tapTile(s, target.id);
    expect(after.remaining).toBe(s.remaining - 1);
    expect(after.score).toBe(tapPoints(0));
    expect(after.lives).toBe(s.lives);
    expect(after.board.find((c) => c.id === target.id).tapped).toBe(true);
    expect(after.lastEvent).toBe("hit");
  });

  it("同一格重複點不會重複計分", () => {
    const s = fresh();
    const target = s.board.find((c) => c.target);
    const once = tapTile(s, target.id);
    const twice = tapTile(once, target.id);
    expect(twice).toBe(once);
  });

  it("點不存在的 id 沒有作用", () => {
    const s = fresh();
    expect(tapTile(s, "nope")).toBe(s);
  });

  it("點完所有目標＝過關，combo＋1 並給獎勵分", () => {
    const s = fresh();
    const done = clearRound(s);
    expect(done.status).toBe("roundClear");
    expect(done.remaining).toBe(0);
    expect(done.combo).toBe(1);
    expect(done.bestCombo).toBe(1);
    expect(done.cleared).toBe(1);
    expect(done.lastEvent).toBe("clear");
    expect(done.score).toBeGreaterThan(tapPoints(0) * s.remaining);
  });

  it("點錯：扣一命、combo 歸零、本回合判失敗", () => {
    let s = fresh();
    s = clearRound(s);
    s = nextRound(s, makeRng(2));
    expect(s.combo).toBe(1);
    const missed = tapDecoy(s);
    expect(missed.status).toBe("roundFail");
    expect(missed.lastEvent).toBe("miss");
    expect(missed.lastFailure).toBe("miss");
    expect(missed.lives).toBe(2);
    expect(missed.combo).toBe(0);
    expect(missed.misses).toBe(1);
    expect(missed.board.some((c) => c.wrong)).toBe(true);
  });

  it("失敗後可以看出還沒點到的正解", () => {
    const s = fresh();
    const missed = tapDecoy(s);
    expect(revealTargets(missed.board).sort()).toEqual(
      s.board.filter((c) => c.target).map((c) => c.id).sort(),
    );
  });

  it("倒數會遞減；歸零＝超時扣命", () => {
    const s = fresh();
    const mid = tickTime(s, 0.5);
    expect(mid.timeLeft).toBeCloseTo(s.timeLimit - 0.5, 5);
    expect(mid.status).toBe("playing");
    const out = tickTime(mid, 99);
    expect(out.timeLeft).toBe(0);
    expect(out.status).toBe("roundFail");
    expect(out.lastEvent).toBe("timeout");
    expect(out.lastFailure).toBe("timeout");
    expect(out.lives).toBe(2);
    expect(out.timeouts).toBe(1);
  });

  it("非遊玩中不吃 tick 與點擊", () => {
    const done = clearRound(fresh());
    expect(tickTime(done, 5)).toBe(done);
    expect(tapTile(done, done.board[0].id)).toBe(done);
  });

  it("失敗後 nextRound 重打同一關同一回合", () => {
    const s = fresh();
    const missed = tapDecoy(s);
    const retry = nextRound(missed, makeRng(9));
    expect(retry.status).toBe("playing");
    expect(retry.level).toBe(s.level);
    expect(retry.roundIndex).toBe(s.roundIndex);
    expect(retry.round).toBe(s.round + 1);
    expect(retry.levelUp).toBe(false);
  });

  it("過關 ROUNDS_PER_LEVEL 次後升關並標記 levelUp", () => {
    let s = fresh();
    const rand = makeRng(31);
    for (let i = 0; i < ROUNDS_PER_LEVEL - 1; i++) {
      s = nextRound(clearRound(s), rand);
      expect(s.level).toBe(1);
      expect(s.levelUp).toBe(false);
    }
    s = nextRound(clearRound(s), rand);
    expect(s.level).toBe(2);
    expect(s.roundIndex).toBe(0);
    expect(s.levelUp).toBe(true);
  });

  it("combo 會跨回合累積，讓倒數變短", () => {
    let s = fresh();
    const rand = makeRng(33);
    const first = s.timeLimit;
    for (let i = 0; i < 3; i++) s = nextRound(clearRound(s), rand);
    expect(s.combo).toBe(3);
    expect(s.timeLimit).toBeLessThan(first);
  });
});

describe("勝負", () => {
  it("三次點錯＝落敗，之後不再吃操作", () => {
    let s = fresh();
    const rand = makeRng(41);
    s = nextRound(tapDecoy(s), rand);
    expect(s.lives).toBe(2);
    s = nextRound(tapDecoy(s), rand);
    expect(s.lives).toBe(1);
    s = tapDecoy(s);
    expect(s.status).toBe("lost");
    expect(s.lives).toBe(0);
    expect(s.lastEvent).toBe("lose");
    expect(s.lastFailure).toBe("miss");
    expect(nextRound(s, rand)).toBe(s);
    expect(tapTile(s, s.board[0].id)).toBe(s);
    expect(summary(s).won).toBe(false);
  });

  it("三次超時也會落敗", () => {
    let s = fresh();
    const rand = makeRng(43);
    for (let i = 0; i < 2; i++) s = nextRound(tickTime(s, 99), rand);
    s = tickTime(s, 99);
    expect(s.status).toBe("lost");
    expect(s.timeouts).toBe(3);
    expect(s.lastFailure).toBe("timeout");
  });

  it("打完全部回合＝通關，分數與進度都對", () => {
    let s = fresh(101);
    const rand = makeRng(101);
    let cleared = 0;
    while (s.status !== "won" && s.status !== "lost" && cleared < TOTAL_ROUNDS + 5) {
      s = clearRound(s);
      cleared++;
      s = nextRound(s, rand);
    }
    expect(s.status).toBe("won");
    expect(s.lastEvent).toBe("win");
    expect(s.lives).toBe(3);
    expect(s.cleared).toBe(TOTAL_ROUNDS);
    expect(s.combo).toBe(TOTAL_ROUNDS);
    expect(s.bestCombo).toBe(TOTAL_ROUNDS);
    expect(s.score).toBeGreaterThan(0);
    expect(progress(s)).toEqual({ cleared: TOTAL_ROUNDS, total: TOTAL_ROUNDS });
    expect(summary(s)).toMatchObject({ won: true, misses: 0, timeouts: 0 });
  });

  it("受傷後仍可通關（掉命不等於出局）", () => {
    let s = fresh(202);
    const rand = makeRng(202);
    s = nextRound(tapDecoy(s), rand);
    expect(s.lives).toBe(2);
    let guard = 0;
    while (s.status !== "won" && s.status !== "lost" && guard++ < TOTAL_ROUNDS + 5) {
      s = nextRound(clearRound(s), rand);
    }
    expect(s.status).toBe("won");
    expect(s.lives).toBe(2);
    expect(summary(s).misses).toBe(1);
  });
});

describe("亂數", () => {
  it("同 seed 產出同樣的場面，不同 seed 會不同", () => {
    const a = fresh(77);
    const b = fresh(77);
    const c = fresh(78);
    expect(a.board.map((x) => x.file + x.target)).toEqual(b.board.map((x) => x.file + x.target));
    expect(a.board.map((x) => x.file + x.target)).not.toEqual(c.board.map((x) => x.file + x.target));
  });

  it("makeRng 落在 [0,1)", () => {
    const rand = makeRng(5);
    for (let i = 0; i < 500; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
