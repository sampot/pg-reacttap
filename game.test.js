import { describe, it, expect } from "vitest";
import {
  BANK,
  CATEGORIES,
  categoryOf,
  questionsOf,
  pickQuestion,
  judge,
  timeLimit,
  pointValue,
  newGame,
  onCorrect,
  finishGame,
  shuffledCategories,
} from "./game.js";

// 可排序(nullary)偽隨機
let _seed = 1;
function seq() {
  _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0;
  return _seed / 4294967296;
}

describe("題庫與種類", () => {
  it("每個題目都屬於合法種類之一", () => {
    for (const q of BANK) {
      expect(CATEGORIES.some((c) => c.id === q.cat)).toBe(true);
    }
  });
  it("題目檔名唯一（不重複）", () => {
    const files = BANK.map((q) => q.file);
    expect(new Set(files).size).toBe(files.length);
  });
  it("四種種類都至少有一題", () => {
    for (const c of CATEGORIES) {
      expect(questionsOf(c.id).length).toBeGreaterThan(0);
    }
  });
  it("questionsOf 只回傳該種類", () => {
    for (const q of questionsOf("anger")) expect(q.cat).toBe("anger");
  });
});

describe("pickQuestion", () => {
  it("盡量不重複使用過的題目", () => {
    const used = BANK.slice(0, 5).map((q) => q.file);
    const { question, used: next } = pickQuestion(used, () => 0.1);
    expect(next.length).toBe(used.length + 1);
    expect(used.includes(question.file)).toBe(false);
  });
  it("題庫用盡後允許重複", () => {
    const { question } = pickQuestion(BANK.map((q) => q.file), () => 0);
    expect(question).toBeTruthy();
  });
  it("同 seed 出題穩定", () => {
    const a = pickQuestion([], () => 0.42).question;
    expect(a.file).toBe(pickQuestion([], () => 0.42).question.file);
  });
});

describe("judge", () => {
  it("正確種類判定為對", () => {
    expect(judge({ cat: "laugh" }, "laugh")).toBe(true);
  });
  it("錯誤種類判定為錯", () => {
    expect(judge({ cat: "laugh" }, "anger")).toBe(false);
  });
});

describe("timeLimit 與 pointValue", () => {
  it("combo 0 為基礎 3 秒", () => {
    expect(timeLimit(0)).toBe(3.0);
  });
  it("隨 combo 加速且不低於下限", () => {
    expect(timeLimit(100)).toBeCloseTo(0.9);
    expect(timeLimit(100)).toBeGreaterThanOrEqual(0.9);
  });
  it("combo 越高單題分數越高但不豪洨", () => {
    expect(pointValue(0)).toBe(10);
    expect(pointValue(50)).toBe(40);
    expect(pointValue(200)).toBe(40);
  });
});

describe("onCorrect 推進", () => {
  it("答對累加 combo 與分數", () => {
    const g = onCorrect(newGame(), () => 0.5);
    expect(g.combo).toBe(1);
    expect(g.score).toBe(12);
    expect(g.streak).toBe(1);
    expect(g.questions).toBe(1);
  });
  it("連續答對 combo 疊加且分數遞增", () => {
    let g = newGame();
    for (let i = 0; i < 5; i++) g = onCorrect(g, () => 0.3);
    expect(g.combo).toBe(5);
    expect(g.questions).toBe(5);
  });
});

describe("finishGame", () => {
  it("回傳分數、最佳 combo 與題數", () => {
    const g = newGame();
    g.score = 123;
    g.combo = 7;
    g.questions = 40;
    expect(finishGame(g)).toEqual({ score: 123, bestCombo: 7, questions: 40 });
  });
});

describe("shuffledCategories", () => {
  it("回傳四種、不重複", () => {
    const s = shuffledCategories(() => 0.4);
    expect(s.length).toBe(4);
    expect(new Set(s.map((c) => c.id)).size).toBe(4);
  });
});

describe("newGame / categoryOf", () => {
  it("newGame 起始為零", () => {
    expect(newGame().score).toBe(0);
    expect(newGame().combo).toBe(0);
  });
  it("categoryOf 找得到與找不到", () => {
    expect(categoryOf("sad").zh).toBe("哭");
    expect(categoryOf("nope")).toBeUndefined();
  });
});
