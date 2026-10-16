/**
 * Drag-and-drop reordering helpers shared by the form editor (components/FieldRenderer) and the member-file
 * mirrors (mirror/edit.tsx). Built on the browser's native drag events, so there is no extra dependency.
 * Touch screens do not fire drag events — every sortable list therefore also has ↑ ↓ (or ‹ ›) buttons.
 *
 * A drag belongs to one list (identified by a string id); items of other lists ignore it. Nested lists work
 * because each has its own id.
 */

export type DropSide = "before" | "after";

interface DragSource {
  list: string;
  from: number;
}

// Only one drag can be in progress at a time, so a module-level variable is enough.
let source: DragSource | null = null;

export const getDragSource = (): DragSource | null => source;
export const startDrag = (list: string, from: number): void => {
  source = { list, from };
};
export const endDrag = (): void => {
  source = null;
};

/** Is the list laid out left-to-right (chips, pills, grids) rather than top-to-bottom? */
export function isHorizontal(el: Element): boolean {
  if (getComputedStyle(el).display.startsWith("inline")) return true;
  const parent = el.parentElement;
  if (!parent) return false;
  const p = getComputedStyle(parent);
  if (p.display.includes("flex")) return p.flexDirection.startsWith("row");
  return p.display.includes("grid");
}

/** Which half of `el` the pointer is over — decides whether the dragged item lands before or after it. */
export function dropSide(point: { clientX: number; clientY: number }, el: Element): DropSide {
  const rect = el.getBoundingClientRect();
  const ratio = isHorizontal(el) ? (point.clientX - rect.left) / (rect.width || 1) : (point.clientY - rect.top) / (rect.height || 1);
  return ratio > 0.5 ? "after" : "before";
}

/** Index (in the list *without* the dragged item) where the dragged item ends up — the `to` of moveAtPath. */
export function targetIndex(from: number, over: number, side: DropSide): number {
  const slot = side === "after" ? over + 1 : over;
  return from < slot ? slot - 1 : slot;
}
