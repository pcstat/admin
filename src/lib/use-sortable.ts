"use client";

import { useState, type DragEvent } from "react";
import { dropSide, endDrag, getDragSource, startDrag, targetIndex, type DropSide } from "./sortable";

/**
 * Drag-and-drop for one list in React.
 *
 *   const sortable = useSortable("projects.json:projects", (from, to) => move(from, to));
 *   <li {...sortable.item(i)}> <button {...sortable.handle(i)}>⠿</button> … </li>
 *
 * `handle(i)` makes the element the thing you grab; `item(i)` makes the element a drop target and shows
 * the insertion line (CSS: [data-drop="before|after"], [data-dragging]). For items that contain text inputs
 * use a separate handle; for items without inputs (chips) `grab(i)` makes the whole item the handle.
 */
export function useSortable(listId: string, onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<{ index: number; side: DropSide } | null>(null);

  const finish = () => {
    endDrag();
    setDragging(null);
    setOver(null);
  };

  const begin = (index: number, e: DragEvent<HTMLElement>) => {
    e.stopPropagation();
    startDrag(listId, index);
    setDragging(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ""); // Firefox only starts a drag when some data is set
    const image = (e.currentTarget as HTMLElement).closest("summary, [data-sortable-item]");
    if (image) e.dataTransfer.setDragImage(image, 16, 16);
  };

  return {
    /** Props for the element that is grabbed. */
    handle: (index: number) => ({ draggable: true, onDragStart: (e: DragEvent<HTMLElement>) => begin(index, e), onDragEnd: finish }),
    /** Props for an item that is both grabbed and dropped on (no text inputs inside it). */
    grab: (index: number) => ({
      draggable: true,
      "data-sortable-item": true,
      onDragStart: (e: DragEvent<HTMLElement>) => begin(index, e),
      onDragEnd: finish,
    }),
    /** Props for every item: makes it a drop target. */
    item: (index: number) => ({
      "data-drop": over?.index === index ? over.side : undefined,
      "data-dragging": dragging === index ? true : undefined,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        const source = getDragSource();
        if (!source || source.list !== listId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const side = dropSide(e, e.currentTarget);
        if (!over || over.index !== index || over.side !== side) setOver({ index, side });
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const source = getDragSource();
        if (!source || source.list !== listId) return;
        e.preventDefault();
        e.stopPropagation();
        const to = targetIndex(source.from, index, dropSide(e, e.currentTarget));
        const from = source.from;
        finish();
        if (to !== from) onMove(from, to);
      },
    }),
  };
}
