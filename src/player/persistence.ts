import { Playlist, RepeatMode, Track } from "../types";
import { MAX_QUEUE, uniqueTracks } from "./queue";

export const STORAGE_KEY = "@liner_player_v2";
export const LEGACY_LIKES_KEY = "@liner_liked_tracks";
export const LEGACY_RECENTS_KEY = "@liner_recent_tracks";

export interface SavedPlayerData {
  version: 2;
  likedTracks: Track[];
  likedTrackIds: string[];
  recentTracks: Track[];
  playlists: Playlist[];
  queue: Track[];
  currentTrackId: string | null;
  positionMs: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  volume: number;
  playbackRate: number;
  reducedMotion: boolean;
  lyricsOffsetMs: number;
}

export function finite(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function validatedTrack(value: unknown): Track | null {
  if (!value || typeof value !== "object") return null;
  const track = value as Record<string, unknown>;
  if (typeof track.id !== "string" || !track.id.trim() || typeof track.title !== "string" || !track.title.trim()) return null;
  const source = track.source === "local" || track.source === "soundcloud" || track.source === "youtube" ? track.source : undefined;
  return {
    id: track.id.slice(0, 500), title: track.title.slice(0, 1000),
    artists: typeof track.artists === "string" ? track.artists.slice(0, 1000) : "Artista desconhecido",
    coverUrl: typeof track.coverUrl === "string" ? track.coverUrl.slice(0, 4000) : "",
    durationMs: finite(track.durationMs, 0, 0, 86_400_000),
    albumTitle: typeof track.albumTitle === "string" ? track.albumTitle.slice(0, 1000) : undefined,
    explicit: typeof track.explicit === "boolean" ? track.explicit : undefined,
    streamUrl: typeof track.streamUrl === "string" && /^(https?:|file:|content:|asset:)/.test(track.streamUrl) ? track.streamUrl.slice(0, 12000) : undefined,
    source,
  };
}

export function validatedTracks(value: unknown, limit = MAX_QUEUE): Track[] {
  if (!Array.isArray(value)) return [];
  return uniqueTracks(value.slice(0, limit).map(validatedTrack).filter((track): track is Track => track !== null), limit);
}

export function validatedIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 500))].slice(0, 10000) : [];
}

export function parseSavedData(raw: string): SavedPlayerData {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object" || (data as { version?: unknown }).version !== 2) throw new Error("Formato de biblioteca inválido.");
  const saved = data as Record<string, unknown>;
  const playlists: Playlist[] = [];
  const playlistIds = new Set<string>();
  if (Array.isArray(saved.playlists)) {
    for (const value of saved.playlists.slice(0, 500)) {
      if (!value || typeof value !== "object") continue;
      const playlist = value as Record<string, unknown>;
      if (typeof playlist.id !== "string" || !playlist.id || playlistIds.has(playlist.id) || typeof playlist.name !== "string" || !playlist.name.trim()) continue;
      playlistIds.add(playlist.id);
      playlists.push({
        id: playlist.id.slice(0, 500), name: playlist.name.trim().slice(0, 120),
        description: typeof playlist.description === "string" ? playlist.description.slice(0, 1000) : undefined,
        tracks: validatedTracks(playlist.tracks),
        createdAt: finite(playlist.createdAt, Date.now()), updatedAt: finite(playlist.updatedAt, Date.now()),
      });
    }
  }
  const likedTracks = validatedTracks(saved.likedTracks, 10000);
  return {
    version: 2, likedTracks, likedTrackIds: [...new Set([...validatedIds(saved.likedTrackIds), ...likedTracks.map((track) => track.id)])],
    recentTracks: validatedTracks(saved.recentTracks, 100), playlists, queue: validatedTracks(saved.queue),
    currentTrackId: typeof saved.currentTrackId === "string" ? saved.currentTrackId : null,
    positionMs: finite(saved.positionMs, 0, 0, 86_400_000), shuffle: saved.shuffle === true,
    repeatMode: saved.repeatMode === "all" || saved.repeatMode === "one" ? saved.repeatMode : "off",
    volume: finite(saved.volume, 1, 0, 1), playbackRate: finite(saved.playbackRate, 1, 0.5, 2), reducedMotion: saved.reducedMotion === true,
    lyricsOffsetMs: finite(saved.lyricsOffsetMs, 0, -30_000, 30_000),
  };
}
