"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { addDays, formatTime, human, MONTHS, parseDate, parseTime, readStored, relative, today, toISO, toLong, WEEKDAYS, type HM, type YMD } from "@/lib/datetime";
import { Icon } from "./Icon";

/**
 * Date and time fields that can be used two ways: type the value (many spellings are understood and tidied up
 * when you leave the box) or pick it from a calendar / clock. On phones the picker opens as a sheet from the bottom.
 */

function Popover({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  useEffect(() => {
    // bring the pop-up into view when it opens near the bottom of the screen
    if (open) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  if (!open) return null;
  return (
    <>
      <button type="button" className="dt-scrim" aria-label="Close" onClick={onClose} />
      <div className="dt-pop" role="dialog" aria-label={label} ref={ref}>
        {children}
        <button type="button" className="btn small dt-done" onClick={onClose}>Done</button>
      </div>
    </>
  );
}

/* ── date ─────────────────────────────────────────────────────────────── */

export function DateField({ label, help, value, format = "iso", onChange }: { label: React.ReactNode; help?: React.ReactNode; value: unknown; format?: "iso" | "long"; onChange: (v: string) => void }) {
  const stored = typeof value === "string" ? value : "";
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const write = (v: YMD) => (format === "long" ? toLong(v) : toISO(v));
  const current = stored ? readStored(stored) : null;
  const typed = draft !== null ? parseDate(draft) : current;
  const unreadable = (draft !== null && draft.trim() !== "" && !typed) || (draft === null && stored !== "" && !current);

  function commit() {
    if (draft === null) return;
    if (draft.trim() === "") onChange("");
    else if (typed) onChange(write(typed));
    else return; // keep what was typed, with the message, until it is fixed
    setDraft(null);
  }
  function pick(v: YMD) {
    onChange(write(v));
    setDraft(null);
  }

  return (
    <div className="field dt-field">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="dt-box">
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          className={`mono${unreadable ? " bad" : ""}`}
          placeholder={format === "long" ? "May 23, 2026" : "2026-12-31 or 31 Dec 2026"}
          value={draft ?? stored}
          aria-invalid={unreadable}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
        />
        <button type="button" className="icon-btn dt-btn" aria-label="Pick from calendar" title="Pick from calendar" onClick={() => setOpen((o) => !o)}>
          <Icon name="calendar" size={18} />
        </button>
        <Popover open={open} onClose={() => setOpen(false)} label="Calendar">
          <Calendar value={typed} onPick={pick} />
        </Popover>
      </div>
      {unreadable ? (
        <span className="req-msg">I can’t read that as a date. Try 2026-12-31, 31 Dec 2026 or “tomorrow”.</span>
      ) : typed ? (
        <span className="help dt-preview">{human(typed)} · {relative(typed)}{draft !== null && draft.trim() !== write(typed) ? <> · will be saved as <b>{write(typed)}</b></> : null}</span>
      ) : null}
      {help ? <span className="help">{help}</span> : null}
    </div>
  );
}

function Calendar({ value, onPick }: { value: YMD | null; onPick: (v: YMD) => void }) {
  const now = useMemo(() => today(), []);
  const start = value ?? now;
  const [view, setView] = useState({ y: start.y, m: start.m });
  const [cursor, setCursor] = useState<YMD>(start);
  const grid = useRef<HTMLDivElement>(null);
  const viaKeys = useRef(false);

  const first = { y: view.y, m: view.m, d: 1 };
  const lead = (new Date(Date.UTC(first.y, first.m - 1, 1)).getUTCDay() + 7) % 7;
  const cells: YMD[] = Array.from({ length: 42 }, (_, i) => addDays(first, i - lead));
  const key = (v: YMD) => toISO(v);

  useEffect(() => {
    // focus the day that is highlighted (when the calendar opens, and after arrow keys)
    if (!viaKeys.current && !grid.current) return;
    grid.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.focus({ preventScroll: true });
    viaKeys.current = false;
  }, [cursor, view]);
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.focus({ preventScroll: true });
  }, []);

  function go(delta: number) {
    const t = new Date(Date.UTC(view.y, view.m - 1 + delta, 1));
    setView({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 });
  }
  function move(days: number) {
    const next = addDays(cursor, days);
    viaKeys.current = true;
    setCursor(next);
    setView({ y: next.y, m: next.m });
  }
  function onKey(e: React.KeyboardEvent) {
    const map: Record<string, () => void> = {
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      ArrowUp: () => move(-7),
      ArrowDown: () => move(7),
      PageUp: () => go(-1),
      PageDown: () => go(1),
    };
    const action = map[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => go(-1)}><Icon name="chevron" size={16} /></button>
        <select aria-label="Month" value={view.m} onChange={(e) => setView({ ...view, m: +e.target.value })}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" aria-label="Year" value={view.y} min={1900} max={2200} onChange={(e) => +e.target.value > 0 && setView({ ...view, y: +e.target.value })} />
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => go(1)}><Icon name="chevron" size={16} /></button>
      </div>
      <div className="cal-week" aria-hidden="true">{WEEKDAYS.map((w) => <span key={w}>{w.slice(0, 2)}</span>)}</div>
      <div className="cal-grid" ref={grid} role="grid" onKeyDown={onKey}>
        {cells.map((c) => {
          const selected = value && key(c) === key(value);
          const isCursor = key(c) === key(cursor);
          return (
            <button
              key={key(c)}
              type="button"
              role="gridcell"
              tabIndex={isCursor ? 0 : -1}
              data-cursor={isCursor}
              aria-selected={Boolean(selected)}
              className={`cal-day${c.m !== view.m ? " dim" : ""}${selected ? " on" : ""}${key(c) === key(now) ? " now" : ""}`}
              onClick={() => onPick(c)}
              aria-label={human(c)}
            >
              {c.d}
            </button>
          );
        })}
      </div>
      <div className="cal-foot">
        <button type="button" className="btn small ghost" onClick={() => onPick(now)}>Today</button>
        {value && <span className="help">{human(value)}</span>}
      </div>
    </div>
  );
}

/* ── time ─────────────────────────────────────────────────────────────── */

const PRESETS: HM[] = [{ h: 9, m: 0 }, { h: 12, m: 0 }, { h: 15, m: 0 }, { h: 18, m: 0 }];

export function TimeField({ label, help, value, onChange }: { label: React.ReactNode; help?: React.ReactNode; value: unknown; onChange: (v: string) => void }) {
  const stored = typeof value === "string" ? value : "";
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const current = stored ? parseTime(stored) : null;
  const typed = draft !== null ? parseTime(draft) : current;
  const unreadable = (draft !== null && draft.trim() !== "" && !typed) || (draft === null && stored !== "" && !current);

  function commit() {
    if (draft === null) return;
    if (draft.trim() === "") onChange("");
    else if (typed) onChange(formatTime(typed));
    else return;
    setDraft(null);
  }
  function pick(t: HM) {
    onChange(formatTime(t));
    setDraft(null);
  }

  return (
    <div className="field dt-field">
      <label className="label" htmlFor={id}>{label}</label>
      <div className="dt-box">
        <input
          id={id}
          type="text"
          autoComplete="off"
          className={`mono${unreadable ? " bad" : ""}`}
          placeholder="2:00 PM"
          value={draft ?? stored}
          aria-invalid={unreadable}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
        />
        <button type="button" className="icon-btn dt-btn" aria-label="Pick from clock" title="Pick from clock" onClick={() => setOpen((o) => !o)}>
          <Icon name="clock" size={18} />
        </button>
        <Popover open={open} onClose={() => setOpen(false)} label="Clock">
          <Clock value={typed} onPick={pick} />
        </Popover>
      </div>
      {unreadable ? (
        <span className="req-msg">I can’t read that as a time. Try 2:30 PM, 14:30 or “2pm”.</span>
      ) : draft !== null && typed && draft.trim() !== formatTime(typed) ? (
        <span className="help dt-preview">will be saved as <b>{formatTime(typed)}</b></span>
      ) : null}
      {help ? <span className="help">{help}</span> : null}
    </div>
  );
}

function Clock({ value, onPick }: { value: HM | null; onPick: (t: HM) => void }) {
  const t = value ?? { h: 9, m: 0 };
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  const pm = t.h >= 12;
  const set = (h12n: number, m: number, isPm: boolean) => onPick({ h: (h12n % 12) + (isPm ? 12 : 0), m });
  return (
    <div className="clock">
      <div className="clock-presets">
        {PRESETS.map((p) => (
          <button key={p.h} type="button" className="check-chip" onClick={() => onPick(p)}>{formatTime(p)}</button>
        ))}
      </div>
      <p className="clock-label">Hour</p>
      <div className="clock-grid hours">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <button key={h} type="button" className={`clock-cell${value && h === h12 ? " on" : ""}`} onClick={() => set(h, t.m, pm)}>{h}</button>
        ))}
      </div>
      <p className="clock-label">Minute</p>
      <div className="clock-grid minutes">
        {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
          <button key={m} type="button" className={`clock-cell${value && m === t.m ? " on" : ""}`} onClick={() => set(h12, m, pm)}>{String(m).padStart(2, "0")}</button>
        ))}
      </div>
      <div className="clock-ampm" role="group" aria-label="AM or PM">
        <button type="button" className={`clock-cell${value && !pm ? " on" : ""}`} onClick={() => set(h12, t.m, false)}>AM</button>
        <button type="button" className={`clock-cell${value && pm ? " on" : ""}`} onClick={() => set(h12, t.m, true)}>PM</button>
      </div>
    </div>
  );
}

