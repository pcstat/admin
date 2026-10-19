"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { norm, queryWords, wordIn } from "@/lib/smart-search";
import { Icon } from "./Icon";

export interface PickerOption {
  value: string;
  label: string;
  /** Second line: year, status, role… */
  sub?: string;
  /** Extra words that match the search but are not shown. */
  keywords?: string;
}

const MAX_SHOWN = 40;

/**
 * A search box with a result list — used to pin projects and members. Type to filter (every word has to match
 * the title, id, year, status, tags…), move with ↑ ↓, choose with Enter or a click.
 */
export function Picker({ options, onPick, placeholder, emptyText, ariaLabel }: { options: PickerOption[]; onPick: (value: string) => void; placeholder: string; emptyText: string; ariaLabel: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    // every word must be found (typos and accents are forgiven); the title counts most, so those come first
    const words = queryWords(query);
    if (words.length === 0) return options;
    const scored: [number, PickerOption][] = [];
    for (const o of options) {
      const title = norm(o.label);
      const hay = norm(`${o.label} ${o.sub ?? ""} ${o.keywords ?? ""}`);
      let score = 0;
      let all = true;
      for (const w of words) {
        const inTitle = wordIn(title, w);
        const inAny = inTitle ?? wordIn(hay, w);
        if (!inAny) {
          all = false;
          break;
        }
        score += inTitle === "exact" ? 3 : inTitle ? 2 : inAny === "exact" ? 1 : 0;
      }
      if (all) scored.push([score, o]);
    }
    return scored.sort((a, b) => b[0] - a[0]).map(([, o]) => o);
  }, [options, query]);
  const shown = results.slice(0, MAX_SHOWN);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(value: string) {
    onPick(value);
    setQuery("");
    setActive(0);
  }

  return (
    <div className="picker" ref={root}>
      <div className="picker-box">
        <Icon name="search" size={16} />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const choice = shown[active];
              if (choice) pick(choice.value);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {query && (
          <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQuery("")}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      {open && (
        <div className="picker-pop">
          <p className="picker-count">
            {results.length === 0 ? emptyText : query ? `${results.length} match${results.length === 1 ? "" : "es"}` : `${options.length} available — type to narrow down`}
          </p>
          <ul id={listId} role="listbox">
            {shown.map((o, i) => (
              <li key={o.value} role="option" aria-selected={i === active}>
                <button type="button" className={i === active ? "on" : ""} onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)}>
                  <span className="picker-label">{o.label}</span>
                  {o.sub && <span className="picker-sub">{o.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
          {results.length > shown.length && <p className="picker-count">{results.length - shown.length} more — keep typing to narrow the list.</p>}
        </div>
      )}
    </div>
  );
}
