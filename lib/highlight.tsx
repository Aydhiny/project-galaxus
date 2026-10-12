// A small syntax highlighter for code blocks — no dependency, safe React output.
// Good enough for TS/JS, C#, Python, SQL, JSON, HTML/CSS, Bash: comments,
// strings, numbers, keywords, types (Capitalised) and function calls.

import type { ReactNode } from "react";

export const CODE_LANGS = ["plain", "typescript", "javascript", "csharp", "python", "sql", "json", "html", "css", "bash", "java", "cpp"] as const;

const KW: Record<string, string[]> = {
  typescript: "const let var function return if else for while do switch case break continue new class extends implements interface type enum import from export default async await try catch finally throw typeof instanceof in of as public private protected readonly static this super null undefined true false void any unknown never".split(" "),
  csharp: "using namespace class struct interface enum public private protected internal static readonly const var new return if else for foreach while do switch case break continue try catch finally throw async await void int string bool double decimal float long object null true false this base get set init record override virtual abstract sealed partial where select from in is as".split(" "),
  python: "def class return if elif else for while in not and or is import from as try except finally raise with lambda yield pass break continue None True False self async await global nonlocal".split(" "),
  sql: "select from where and or not insert into values update set delete create table alter drop index join left right inner outer on group by order having limit offset as distinct null is in like between case when then else end primary key foreign references default".split(" "),
  bash: "if then else elif fi for in do done while case esac function return export local echo cd ls sudo npm npx git node".split(" "),
  java: "public private protected class interface extends implements static final void int boolean new return if else for while try catch finally throw this super null true false import package".split(" "),
  cpp: "int char float double bool void auto const static struct class public private protected return if else for while switch case break continue new delete nullptr true false include namespace using std template typename".split(" "),
};
KW.javascript = KW.typescript;
const sets = Object.fromEntries(Object.entries(KW).map(([k, v]) => [k, new Set(v)]));

const RULES = /(\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][\w$]*\b|<\/?[A-Za-z][\w-]*|[{}()\[\];,.=+\-*\/<>!&|:?]+)/g;

export function highlight(code: string, lang = "plain"): ReactNode[] {
  if (lang === "plain") return [code];
  const kw = sets[lang] ?? sets.typescript;
  const hashComments = lang === "python" || lang === "bash";
  const dashComments = lang === "sql";
  const out: ReactNode[] = [];
  let last = 0, n = 0;
  for (const m of code.matchAll(RULES)) {
    const t = m[0], at = m.index ?? 0;
    if (at > last) out.push(code.slice(last, at));
    const k = n++;
    const next = code.slice(at + t.length).match(/^\s*\(/);
    let cls = "";
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("<!--") || (t.startsWith("#") && hashComments) || (t.startsWith("--") && dashComments)) cls = "text-zinc-400 italic";
    else if (t.startsWith("#") || t.startsWith("--")) cls = "";
    else if (/^["'`]/.test(t)) cls = "text-emerald-600 dark:text-emerald-400";
    else if (/^\d/.test(t)) cls = "text-orange-600 dark:text-orange-400";
    else if (/^<\/?[A-Za-z]/.test(t)) cls = "text-rose-600 dark:text-rose-400";
    else if (/^[A-Za-z_]/.test(t)) cls = kw.has(lang === "sql" ? t.toLowerCase() : t) ? "text-violet-600 dark:text-violet-400 font-medium" : next ? "text-blue-600 dark:text-blue-400" : /^[A-Z]/.test(t) ? "text-amber-700 dark:text-amber-300" : "";
    else cls = "text-zinc-500";
    out.push(cls ? <span key={k} className={cls}>{t}</span> : t);
    last = at + t.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
