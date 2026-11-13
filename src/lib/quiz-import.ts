// Turns a quiz .json (or .js) file into quiz questions. Forgiving on purpose: admins may export quizzes from
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

// ---- .js files -------------------------------------------------------------------------------
// Quizzes are often shared as JavaScript (`const questions = [{ question: 'x', ... }];`, `export default {...}`,
// `module.exports = [...]`). That isn't JSON: keys lack quotes, strings use single quotes, there are trailing
// commas and comments. The file is NEVER run; this reads only plain data (objects, arrays, strings, numbers,
// true/false/null) and rejects anything else (function calls, variables, `${}` in template strings).

class LiteralError extends Error {}

function parseJsLiteralAt(src: string, start: number): unknown {
  let i = start;
  const fail = (m: string): never => { throw new LiteralError(m); };
  const ws = () => {
    for (;;) {
      const c = src[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\ufeff" || c === "\u00a0") i++;
      else if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; }
      else if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); if (e < 0) fail("unclosed comment"); i = e + 2; }
      else return;
    }
  };
  const ident = () => { const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200)); return m ? m[0] : ""; };
  const string = (): string => {
    const q = src[i++];
    let out = "";
    while (i < src.length) {
      const c = src[i++];
      if (c === q) return out;
      if (q === "`" && c === "$" && src[i] === "{") fail("template strings with ${...} aren't supported");
      if (c !== "\\") { if (q !== "`" && c === "\n") fail("line break inside a string"); out += c; continue; }
      const e = src[i++];
      const hex = (n: number) => { const h = src.slice(i, i + n); if (!/^[0-9a-fA-F]+$/.test(h) || h.length !== n) fail("bad escape"); i += n; return parseInt(h, 16); };
      if (e === "n") out += "\n"; else if (e === "t") out += "\t"; else if (e === "r") out += "\r";
      else if (e === "b") out += "\b"; else if (e === "f") out += "\f"; else if (e === "v") out += "\v"; else if (e === "0") out += "\0";
      else if (e === "x") out += String.fromCharCode(hex(2));
      else if (e === "u" && src[i] === "{") { const end = src.indexOf("}", i); const cp = parseInt(src.slice(i + 1, end), 16); if (end < 0 || !Number.isFinite(cp) || cp > 0x10ffff) fail("bad escape"); out += String.fromCodePoint(cp); i = end + 1; }
      else if (e === "u") out += String.fromCharCode(hex(4));
      else if (e === "\r") { if (src[i] === "\n") i++; }
      else if (e !== "\n" && e !== "\u2028" && e !== "\u2029") out += e;
    }
    return fail("unclosed string");
  };
  const value = (depth: number): unknown => {
    if (depth > 50) fail("nested too deeply");
    ws();
    const c = src[i];
    if (c === "{") {
      i++;
      const o: Record<string, unknown> = {};
      for (;;) {
        ws();
        if (src[i] === "}") { i++; return o; }
        let key: string;
        if (src[i] === '"' || src[i] === "'" || src[i] === "`") key = string();
        else if ((key = ident())) i += key.length;
        else { const m = /^\d+(\.\d+)?/.exec(src.slice(i, i + 50)); if (!m) fail("expected a property name"); key = String(Number(m![0])); i += m![0].length; }
        ws();
        if (src[i] !== ":") fail(`expected ":" after ${key}`);
        i++;
        o[key] = value(depth + 1);
        ws();
        if (src[i] === ",") { i++; continue; }
        if (src[i] === "}") { i++; return o; }
        fail('expected "," or "}"');
      }
    }
    if (c === "[") {
      i++;
      const a: unknown[] = [];
      for (;;) {
        ws();
        if (src[i] === "]") { i++; return a; }
        a.push(value(depth + 1));
        ws();
        if (src[i] === ",") { i++; continue; }
        if (src[i] === "]") { i++; return a; }
        fail('expected "," or "]"');
      }
    }
    if (c === '"' || c === "'" || c === "`") return string();
    const num = /^[+-]?(0[xX][0-9a-fA-F]+|(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)([eE][+-]?\d+)?)/.exec(src.slice(i, i + 60));
    if (num) { i += num[0].length; return Number(num[0].replace(/_/g, "")); }
    const id = ident();
    const lit: Record<string, unknown> = { true: true, false: false, null: null, undefined: null };
    if (id in lit && Object.prototype.hasOwnProperty.call(lit, id)) { i += id.length; return lit[id]; }
    return fail(id ? `"${id}" isn't plain data` : "unexpected character");
  };
  return value(0);
}

// Where a data literal could start in a .js file: the very start, after `=`, after `export default`, after `return`.
function literalCandidates(src: string): number[] {
  const lead = src.length - src.trimStart().length;
  const out: number[] = src[lead] === "{" || src[lead] === "[" ? [lead] : [];
  const re = /(?:[^=!<>]=(?![=>])|\bexport\s+default\b|\breturn\b)\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && out.length < 100) {
    const p = m.index + m[0].length;
    if (src[p] === "{" || src[p] === "[") out.push(p);
  }
  return out;
}

function parseQuizText(raw: string): unknown[] {
  const text = raw.replace(/^\ufeff/, "");
  try { return [JSON.parse(text)]; } catch { /* not JSON; try it as a .js file */ }
  const found: unknown[] = [];
  let why = "";
  for (const p of literalCandidates(text)) {
    try { found.push(parseJsLiteralAt(text, p)); } catch (e) { if (!(e instanceof LiteralError)) throw e; why ||= e.message; }
  }
  if (!found.length) throw new Error(`Couldn't read the questions in this file${why ? ` (${why})` : ""}. It should be JSON, or a .js file that sets the questions as plain data, e.g. const questions = [ ... ]. See the example file.`);
  return found;
}

export function parseQuizJson(raw: string): QuizImport {
  const candidates = parseQuizText(raw);
  let firstError: Error | null = null;
  for (const data of candidates) {
    try { return parseQuizData(data); } catch (e) { firstError ??= e as Error; }
  }
  throw firstError!;
}

function parseQuizData(data: unknown): QuizImport {
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
