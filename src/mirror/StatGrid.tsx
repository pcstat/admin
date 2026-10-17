'use client';

import React, { useLayoutEffect, useRef } from 'react';

export interface StatItem {
  value: string;
  label: string;
}

interface StatGridProps {
  items: StatItem[];
  /** Columns on wide screens (default: chosen from the number of boxes). */
  columns?: number;
  /** Columns on narrow screens, if different — the page's CSS reads `--cols-sm`. */
  mobileColumns?: number;
  classes: { grid: string; card: string; value: string; label: string };
  /** Value size range in px. */
  valueSize?: [min: number, max: number];
  /** Label size range in px. */
  labelSize?: [min: number, max: number];
  valueLineHeight?: number;
  labelLineHeight?: number;
}

/** How many columns look best for this many boxes. */
function columnsFor(count: number) {
  if (count <= 3) return Math.max(1, count);
  return count === 4 ? 2 : 3;
}

type Mode = { wrap: 'nowrap' | 'words' | 'anywhere'; lines: number; floor: number };

/**
 * Finds ONE font size that suits every element in the group — the largest at which all of them fit — and
 * applies it to all of them. A word is only ever split as a last resort.
 */
function fitGroup(els: HTMLElement[], [min, max]: [number, number], lineHeight: number): { size: number; oneLine: boolean } {
  const apply = (mode: Mode) => {
    for (const el of els) {
      el.style.whiteSpace = mode.wrap === 'nowrap' ? 'nowrap' : 'normal';
      el.style.overflowWrap = mode.wrap === 'anywhere' ? 'anywhere' : 'normal';
      el.style.hyphens = mode.wrap === 'anywhere' ? 'auto' : 'manual';
    }
  };
  const fits = (size: number, lines: number) => {
    for (const el of els) el.style.fontSize = `${size}px`;
    return els.every((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().height <= size * lineHeight * lines + 1);
  };
  const largest = (mode: Mode) => {
    apply(mode);
    const lo0 = Math.min(min, mode.floor);
    if (fits(max, mode.lines)) return max;
    if (!fits(lo0, mode.lines)) return null;
    let lo = lo0;
    let hi = max;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, mode.lines)) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  // 1. everything on a single line · 2. whole words on up to two / three lines · 3. split words as a last resort
  const lastResort: Mode = { wrap: 'anywhere', lines: 3, floor: min * 0.7 };
  const ladder: Mode[] = [
    { wrap: 'nowrap', lines: 1, floor: min },
    { wrap: 'words', lines: 2, floor: min },
    { wrap: 'words', lines: 3, floor: min * 0.85 },
    lastResort,
  ];
  for (const mode of ladder) {
    const size = largest(mode);
    if (size !== null) {
      for (const el of els) el.style.fontSize = `${size}px`;
      return { size, oneLine: mode.wrap === 'nowrap' };
    }
  }
  apply(lastResort);
  for (const el of els) el.style.fontSize = `${min * 0.7}px`;
  return { size: min * 0.7, oneLine: false };
}

interface FitOptions {
  /** Number of boxes. */
  count: number;
  columns?: number;
  mobileColumns?: number;
  valueSize: [number, number];
  labelSize: [number, number];
  valueLineHeight: number;
  labelLineHeight: number;
}

/** Inline CSS variables the grid's stylesheet reads (`--cols`, `--cols-sm`). */
export function statGridVars(count: number, columns?: number, mobileColumns?: number): React.CSSProperties {
  const cols = columns ?? columnsFor(count);
  return { ['--cols' as string]: cols, ['--cols-sm' as string]: mobileColumns ?? cols };
}

/**
 * The fitting itself, as a hook so that other markup (the admin panel's editable mirror) can use it too.
 * The grid's value and label elements must carry `data-stat="value"` / `data-stat="label"`.
 */
export function useStatGridFit(gridRef: React.RefObject<HTMLElement | null>, signature: string, opts: FitOptions) {
  const { count, columns, mobileColumns, valueSize, labelSize, valueLineHeight, labelLineHeight } = opts;

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let lastWidth = -1;

    const run = () => {
      const width = grid.clientWidth;
      if (!width || width === lastWidth) return;
      lastWidth = width;
      const values = Array.from(grid.querySelectorAll<HTMLElement>('[data-stat="value"]'));
      const labels = Array.from(grid.querySelectorAll<HTMLElement>('[data-stat="label"]'));

      // Start from the preferred number of columns; if the values would have to shrink a lot, use fewer,
      // wider columns instead (down to a single stack) before shrinking any further.
      const narrow = window.matchMedia('(max-width: 520px)').matches;
      const preferred = Math.max(1, narrow ? (mobileColumns ?? columns ?? columnsFor(count)) : (columns ?? columnsFor(count)));
      const goodSize = valueSize[1] * 0.45;
      let best = { cols: preferred, size: -1 };
      for (let c = preferred; c >= 1; c--) {
        grid.style.setProperty('--cols-eff', String(c));
        grid.style.setProperty('--cols-eff-sm', String(c));
        const { size, oneLine } = fitGroup(values, valueSize, valueLineHeight);
        if (oneLine && size >= goodSize) {
          best = { cols: c, size };
          break;
        }
        if (size > best.size) best = { cols: c, size };
      }
      grid.style.setProperty('--cols-eff', String(best.cols));
      grid.style.setProperty('--cols-eff-sm', String(best.cols));
      fitGroup(values, valueSize, valueLineHeight);
      fitGroup(labels, labelSize, labelLineHeight);
    };

    run();
    const observer = new ResizeObserver(() => run());
    observer.observe(grid);
    void document.fonts?.ready.then(() => {
      lastWidth = -1;
      run();
    });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, count, columns, mobileColumns, valueSize[0], valueSize[1], labelSize[0], labelSize[1], valueLineHeight, labelLineHeight]);
}

/**
 * A row/grid of equal boxes (a number or word plus a caption). All boxes are the same size, and all values
 * share one font size — so when one value is long, every box shrinks together instead of one box growing
 * or a word being cut in the middle. If values are long the grid also uses fewer, wider columns first.
 */
export function StatGrid({ items, columns, mobileColumns, classes, valueSize = [14, 48], labelSize = [8, 11], valueLineHeight = 1.1, labelLineHeight = 1.45 }: StatGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const signature = items.map((i) => `${i.value}\u0000${i.label}`).join('\u0001');
  useStatGridFit(gridRef, signature, { count: items.length, columns, mobileColumns, valueSize, labelSize, valueLineHeight, labelLineHeight });

  return (
    <div ref={gridRef} className={classes.grid} style={statGridVars(items.length, columns, mobileColumns)}>
      {items.map((item, idx) => (
        <div key={idx} className={classes.card}>
          <span data-stat="value" className={classes.value}>
            {item.value}
          </span>
          <span data-stat="label" className={classes.label}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
