import { Track } from "../types";

export const MAX_QUEUE = 500;

/** Queue entries are unique so edits and native transitions have stable identities. */
export function uniqueTracks(tracks: Track[], limit = MAX_QUEUE): Track[] {
  const ids = new Set<string>();
  return tracks.filter((track) => {
    if (!track?.id || ids.has(track.id) || ids.size >= limit) return false;
    ids.add(track.id);
    return true;
  });
}

export function moved<T>(items: T[], from: number, to: number): T[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

/** Fisher–Yates visits every remaining track exactly once in a shuffle cycle. */
export function shuffledIds(tracks: Track[], excluded: string[] = [], random = Math.random): string[] {
  const excludedIds = new Set(excluded);
  const result = tracks.filter((track) => !excludedIds.has(track.id)).map((track) => track.id);
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
