import type { Track } from '../types';

export interface LibraryBackup {
  format: 'hueco-sound' | 'hueco-mobile' | 'liner-mobile';
  version: 1;
  exportedAt: string;
  likedTracks: Track[];
  playlists: { name: string; description?: string; tracks: Track[] }[];
}

export function cleanRemoteTrack(value: unknown): Track | null {
  if (!value || typeof value !== 'object') return null;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== 'string' || !t.id.trim() || t.id.length > 200 || t.id.startsWith('local:') || t.source === 'local') return null;
  if (typeof t.title !== 'string' || typeof t.artists !== 'string') return null;
  return {
    id: t.id,
    title: t.title.slice(0, 1000),
    artists: t.artists.slice(0, 1000),
    coverUrl: typeof t.coverUrl === 'string' && /^https:\/\//.test(t.coverUrl) ? t.coverUrl : '',
    durationMs: typeof t.durationMs === 'number' && Number.isFinite(t.durationMs) ? Math.max(0, t.durationMs) : 0,
    ...(typeof t.albumTitle === 'string' ? { albumTitle: t.albumTitle.slice(0, 1000) } : {}),
    ...(t.source === 'youtube' || t.source === 'soundcloud' ? { source: t.source } : {}),
  };
}

export function parseBackup(text: string): LibraryBackup {
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Este arquivo não é um backup válido do Hueco Sound.');
  const b = data as Record<string, unknown>;
  const validFormats = ['hueco-sound', 'hueco-mobile', 'liner-mobile'];
  if (!validFormats.includes(String(b.format)) || b.version !== 1 || !Array.isArray(b.likedTracks) || !Array.isArray(b.playlists)) {
    throw new Error('Formato de backup inválido ou versão não suportada.');
  }
  if (b.likedTracks.length > 20000 || b.playlists.length > 500) throw new Error('O backup excede o limite de importação.');
  const tracks = (values: unknown[]) => [...new Map(values.map(cleanRemoteTrack).filter((t): t is Track => Boolean(t)).map((t) => [t.id, t])).values()];
  const playlists = b.playlists.map((p: unknown) => {
    if (!p || typeof p !== 'object') throw new Error('Playlist inválida no backup.');
    const list = p as Record<string, unknown>;
    if (typeof list.name !== 'string' || !list.name.trim() || !Array.isArray(list.tracks) || list.tracks.length > 10000) {
      throw new Error('Playlist inválida no backup.');
    }
    return {
      name: list.name.trim().slice(0, 100),
      tracks: tracks(list.tracks),
      ...(typeof list.description === 'string' ? { description: list.description.slice(0, 1000) } : {}),
    };
  });
  return {
    format: 'hueco-sound',
    version: 1,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '',
    likedTracks: tracks(b.likedTracks),
    playlists,
  };
}
