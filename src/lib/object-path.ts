export type PathSegment = string | number;

export function getAtPath(obj: unknown, path: PathSegment[]): unknown {
  return path.reduce<unknown>((acc, seg) => {
    if (acc == null) return acc;
    return (acc as Record<PathSegment, unknown>)[seg];
  }, obj);
}

/** Returns a new object/array with `value` set at `path`, cloning only the spine that changed. */
export function setAtPath<T>(obj: T, path: PathSegment[], value: unknown): T {
  if (path.length === 0) return value as T;
  const head = path[0] as PathSegment;
  const rest = path.slice(1);
  const source = obj as unknown;
  const clone: Record<PathSegment, unknown> | unknown[] = Array.isArray(source)
    ? [...source]
    : { ...(source as Record<PathSegment, unknown>) };
  const child = (clone as Record<PathSegment, unknown>)[head];
  (clone as Record<PathSegment, unknown>)[head] = rest.length === 0 ? value : setAtPath(child, rest, value);
  return clone as T;
}

export function insertAtPath<T>(obj: T, path: PathSegment[], index: number, value: unknown): T {
  const arr = (getAtPath(obj, path) as unknown[]) ?? [];
  const next = [...arr.slice(0, index), value, ...arr.slice(index)];
  return setAtPath(obj, path, next);
}

export function appendAtPath<T>(obj: T, path: PathSegment[], value: unknown): T {
  const arr = (getAtPath(obj, path) as unknown[]) ?? [];
  return insertAtPath(obj, path, arr.length, value);
}

export function removeAtPath<T>(obj: T, path: PathSegment[], index: number): T {
  const arr = (getAtPath(obj, path) as unknown[]) ?? [];
  const next = arr.filter((_, i) => i !== index);
  return setAtPath(obj, path, next);
}

export function moveAtPath<T>(obj: T, path: PathSegment[], from: number, to: number): T {
  const arr = [...((getAtPath(obj, path) as unknown[]) ?? [])];
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) {
    return setAtPath(obj, path, arr);
  }
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return setAtPath(obj, path, arr);
}
