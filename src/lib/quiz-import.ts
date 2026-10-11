// Turns a quiz .json file into quiz questions. Forgiving on purpose: admins may export quizzes from
// other tools, so several common shapes and key names are accepted. Safe to use in the browser.

export type ImportedQuestion = { id: string; prompt: string; image: string | null; options: { id: string; text: string }[]; correct: string };
export type QuizImport = { questions: ImportedQuestion[]; passPct: number | null; skipped: string[] };

const uid = () => Math.random().toString(36).slice(2, 8);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const pick = (o: Record<string, unknown>, keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined && v !== null && v !== "");
const LETTERS = "ABCDEFGHIJ";

export const QUIZ_JSON_EXAMPLE = {
  pass_pct: 70,
  questions: [
    {
      question: "What does the chart show?",
      image: "https://example.com/head-and-shoulders.png",
      options: ["Double bottom", "Head and shoulders", "Cup and handle", "Ascending triangle"],
      answer: "B",
    },
    {
      question: "A candle that closes above its open is…",
      options: ["Bullish", "Bearish"],
      answer: 1,
    },
    {
      question: "RSI above 70 usually signals…",
      options: [{ text: "Oversold" }, { text: "Overbought", correct: true }],
    },
  ],
};

export function parseQuizJson(raw: string): QuizImport {
  let data: unknown;
  try { data = JSON.parse(raw.replace(/^﻿/, "")); } catch { throw new Error("This file isn't valid JSON. Check it in a JSON validator and try again."); }
  const root = (Array.isArray(data) ? { questions: data } : data) as Record<string, unknown>;
  const list = pick(root ?? {}, ["questions", "quiz", "items", "data"]);
  if (!Array.isArray(list) || !list.length) throw new Error('No questions found. The file needs a "questions" list (see the example file).');

  const passRaw = Number(pick(root, ["pass_pct", "passPct", "pass_mark", "passing_score", "pass"]));
  const passPct = Number.isFinite(passRaw) && passRaw > 0 ? Math.min(100, passRaw <= 1 ? Math.round(passRaw * 100) : Math.round(passRaw)) : null;

  const questions: ImportedQuestion[] = [];
  const skipped: string[] = [];
  list.slice(0, 200).forEach((item, i) => {
    const q = (item ?? {}) as Record<string, unknown>;
    const prompt = str(pick(q, ["question", "prompt", "text", "title", "q"]));
    const rawOpts = pick(q, ["options", "answers", "choices", "alternatives"]);
    const opts = Array.isArray(rawOpts) ? rawOpts : rawOpts && typeof rawOpts === "object" ? Object.values(rawOpts) : [];
    const options: { id: string; text: string; flagged: boolean }[] = opts.map((o) => {
      if (o && typeof o === "object") {
        const r = o as Record<string, unknown>;
        return { id: uid(), text: str(pick(r, ["text", "label", "answer", "option", "value"])), flagged: r.correct === true || r.is_correct === true || r.isCorrect === true };
      }
      return { id: uid(), text: str(o), flagged: false };
    }).filter((o) => o.text);

    // the correct answer: flagged option, letter (A, B…), number (1 = first) or the option's text
    let correct = options.find((o) => o.flagged)?.id ?? "";
    const ans = pick(q, ["answer", "correct", "correct_answer", "correctAnswer", "solution", "right"]);
    if (!correct && ans !== undefined) {
      const a = str(ans);
      const byText = options.find((o) => o.text.toLowerCase() === a.toLowerCase());
      const byLetter = /^[A-J]$/i.test(a) ? options[LETTERS.indexOf(a.toUpperCase())] : undefined;
      const byNumber = /^\d+$/.test(a) ? options[Number(a) - 1] : undefined;
      correct = (byText ?? byLetter ?? byNumber)?.id ?? "";
    }
    const imageRaw = str(pick(q, ["image", "image_url", "imageUrl", "chart", "picture", "img"]));
    const image = /^https?:\/\/\S+$/i.test(imageRaw) ? imageRaw : null;

    const label = `Question ${i + 1}${prompt ? ` (“${prompt.slice(0, 40)}${prompt.length > 40 ? "…" : ""}”)` : ""}`;
    if (!prompt) return void skipped.push(`${label}: no question text`);
    if (options.length < 2) return void skipped.push(`${label}: needs at least two answers`);
    if (!correct) return void skipped.push(`${label}: couldn't tell which answer is correct`);
    questions.push({ id: uid(), prompt, image, options: options.map(({ id, text }) => ({ id, text })), correct });
  });
  if (!questions.length) throw new Error(`No questions could be imported. ${skipped.slice(0, 3).join("; ")}`);
  return { questions, passPct, skipped };
}
