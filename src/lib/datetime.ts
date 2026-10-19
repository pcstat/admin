/**
 * Reading and writing dates and times the way people type them.
 * Dates are stored as "2026-12-31" (or "May 23, 2026" for certificates), times as "2:30 PM" — what the website reads.
 */
export interface YMD {
  y: number;
  m: number; // 1–12
  d: number;
}
export interface HM {
  h: number; // 0–23
  m: number;
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function validYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const toISO = ({ y, m, d }: YMD) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
export const toLong = ({ y, m, d }: YMD) => `${MONTHS[m - 1]} ${d}, ${y}`;
export const today = (): YMD => {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
};
export const addDays = ({ y, m, d }: YMD, days: number): YMD => {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
export const weekday = ({ y, m, d }: YMD) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
export const dayDiff = (a: YMD, b: YMD) => Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);

function monthFrom(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return null;
  const i = MONTHS.findIndex((name) => name.toLowerCase() === w || name.toLowerCase().startsWith(w) || (w === "sept" && name === "September"));
  return i >= 0 ? i + 1 : null;
}

/** "2026-12-31", "31/12/2026", "31 Dec 2026", "December 31, 2026", "tomorrow", "next friday"… → a date, or null. */
export function parseDate(input: string, now: YMD = today()): YMD | null {
  const s = input.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!s) return null;
  if (s === "today") return now;
  if (s === "tomorrow") return addDays(now, 1);
  if (s === "yesterday") return addDays(now, -1);
  const rel = /^(next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(s);
  if (rel) {
    const target = WEEKDAYS.findIndex((w) => w.toLowerCase() === rel[2]);
    const diff = (target - weekday(now) + 7) % 7;
    return addDays(now, rel[1] === "next " && diff === 0 ? 7 : diff);
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return pick(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = +m[1]!;
    const b = +m[2]!;
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    // day first (31/12/2026) unless the second number cannot be a month (12/31/2026)
    return b > 12 && a <= 12 ? pick(y, a, b) : pick(y, b, a);
  }
  const clean = s.replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1");
  m = /^(\d{1,2}) ([a-z.]+)(?: (\d{4}))?$/.exec(clean);
  if (m && monthFrom(m[2]!)) return pick(m[3] ? +m[3] : now.y, monthFrom(m[2]!)!, +m[1]!);
  m = /^([a-z.]+) (\d{1,2})(?: (\d{4}))?$/.exec(clean);
  if (m && monthFrom(m[1]!)) return pick(m[3] ? +m[3] : now.y, monthFrom(m[1]!)!, +m[2]!);
  return null;
}
const pick = (y: number, m: number, d: number): YMD | null => (validYMD(y, m, d) ? { y, m, d } : null);

/** Reads a stored value ("2026-12-31" or "May 23, 2026"). */
export const readStored = (value: string): YMD | null => parseDate(value);

/** "Thursday, 31 December 2026" */
export const human = (v: YMD) => `${WEEKDAYS[weekday(v)]}, ${v.d} ${MONTHS[v.m - 1]} ${v.y}`;

/** "in 3 days", "tomorrow", "2 weeks ago"… */
export function relative(v: YMD, now: YMD = today()): string {
  const n = dayDiff(v, now);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  const abs = Math.abs(n);
  const span = abs < 14 ? `${abs} days` : abs < 60 ? `${Math.round(abs / 7)} weeks` : abs < 700 ? `${Math.round(abs / 30)} months` : `${Math.round(abs / 365)} years`;
  return n > 0 ? `in ${span}` : `${span} ago`;
}

/** Extra words a stored date can be found by in a search ("june", "monday", "2026"). */
export function dateWords(value: string): string {
  const v = readStored(value);
  return v ? `${WEEKDAYS[weekday(v)]} ${MONTHS[v.m - 1]} ${v.d} ${v.y}` : "";
}

/** "2pm", "14:30", "2:30 pm", "230pm", "noon", "midnight", "9" → a time, or null. */
export function parseTime(input: string): HM | null {
  const s = input.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!s) return null;
  if (s === "noon") return { h: 12, m: 0 };
  if (s === "midnight") return { h: 0, m: 0 };
  let hh: number;
  let mm: number;
  let mer: string | undefined;
  let m = /^(\d{1,2})[:h](\d{2})\s?(am|pm|a|p)?$/.exec(s);
  if (m) {
    hh = +m[1]!;
    mm = +m[2]!;
    mer = m[3];
  } else {
    m = /^(\d{1,4})\s?(am|pm|a|p)?$/.exec(s);
    if (!m) return null;
    const digits = m[1]!;
    if (digits.length <= 2) {
      hh = +digits;
      mm = 0;
    } else if (digits.length === 3) {
      hh = +digits[0]!;
      mm = +digits.slice(1);
    } else {
      hh = +digits.slice(0, 2);
      mm = +digits.slice(2);
    }
    mer = m[2];
  }
  if (mm > 59 || hh > 23) return null;
  if (mer) {
    if (hh < 1 || hh > 12) return null;
    return { h: (hh % 12) + (mer.startsWith("p") ? 12 : 0), m: mm };
  }
  if (hh === 0 || hh >= 13) return { h: hh, m: mm }; // 24-hour clock
  // no am/pm: office hours — 7 to 11 are mornings, 12 and 1 to 6 are afternoons
  return { h: hh >= 7 && hh <= 11 ? hh : hh === 12 ? 12 : hh + 12, m: mm };
}

export const formatTime = ({ h, m }: HM) => `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
