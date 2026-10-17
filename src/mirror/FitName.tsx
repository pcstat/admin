'use client';

import React, { useLayoutEffect, useRef } from 'react';

/** A name needs the compact, natural-case treatment when it is long overall or contains a very long word. */
export function isLongName(name: string) {
  const longestWord = Math.max(0, ...name.split(/\s+/).map((w) => w.length));
  return longestWord > 11 || name.length > 26;
}

interface FitNameProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'style' | 'className' | 'id'> {
  /** The name — what is measured, and what is shown unless `children` are given. */
  text: string;
  /** Rendered instead of `text` when given (the admin panel passes its inline editor here). */
  children?: React.ReactNode;
  id?: string;
  className?: string;
  /** Tag to render. */
  as?: 'h1' | 'h2' | 'div';
  /** The name may wrap onto at most this many lines. */
  maxLines?: number;
  /** Smallest size (px) used while whole words must stay unbroken. */
  minSize?: number;
  /** Largest size (px). */
  maxSize?: number;
  /** Largest size as a share of the available width — keeps short names from towering on phones. */
  maxWidthRatio?: number;
  /** Unitless line-height. */
  lineHeight?: number;
}

/**
 * A heading whose font size adapts to its text.
 *
 * Short names get the full display size. A long name — many words, or one very long word — is scaled down
 * until it fits its box on at most `maxLines` lines without clipping. If even the smallest size cannot keep a
 * single word whole (think of a 35-letter surname), that word is allowed to break instead, so nothing is
 * ever cut off or pushed outside the page.
 */
export function FitName({
  text,
  children,
  id,
  className,
  as: Tag = 'h1',
  maxLines = 4,
  minSize = 34,
  maxSize = 112,
  maxWidthRatio = 0.2,
  lineHeight = 0.95,
  ...rest
}: FitNameProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;

    let lastWidth = -1;

    let allowedLines = maxLines;

    const fits = (size: number) => {
      el.style.fontSize = `${size}px`;
      return el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().height <= size * lineHeight * allowedLines + 1;
    };

    const largestThatFits = (lo: number, hi: number) => {
      if (fits(hi)) return hi;
      if (!fits(lo)) return null;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };

    const fit = () => {
      const width = el.clientWidth;
      if (!width || width === lastWidth) return;
      lastWidth = width;

      const top = Math.max(minSize, Math.min(maxSize, width * maxWidthRatio));
      allowedLines = maxLines;
      el.style.overflowWrap = 'normal';
      el.style.hyphens = 'manual';
      let size = largestThatFits(minSize, top);
      if (size === null) {
        // A single word is wider than the box even at the smallest size: let it break — hyphenated where
        // the browser knows how, anywhere otherwise — and keep the result compact.
        allowedLines = Math.min(maxLines, 3);
        el.style.overflowWrap = 'anywhere';
        el.style.hyphens = 'auto';
        size = largestThatFits(Math.max(18, minSize * 0.6), top) ?? Math.max(18, minSize * 0.6);
      }
      el.style.fontSize = `${size}px`;
    };

    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(host);
    void document.fonts?.ready.then(() => {
      lastWidth = -1;
      fit();
    });
    return () => observer.disconnect();
  }, [text, maxLines, minSize, maxSize, maxWidthRatio, lineHeight]);

  return (
    <Tag ref={ref as React.RefObject<never>} id={id} className={className} style={{ lineHeight, minWidth: 0 }} {...rest}>
      {children ?? text}
    </Tag>
  );
}
