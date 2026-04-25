/**
 * Returns a new Set that has `id` added if it was absent, or removed if it
 * was already present.  The original set is never mutated.
 */
export function toggleExpandedId(set: Set<number>, id: number): Set<number> {
  const next = new Set(set);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
