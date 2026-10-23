import type { LyricLine, Track } from '../types';

export type JsonObject = Record<string, unknown>;
export const object = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const string = (value: unknown): string => typeof value === 'string' ? value : '';
export function at(value: unknown, ...path: (string | number)[]): unknown {
  return path.reduce<unknown>((current, key) => typeof key === 'number' ? array(current)[key] : object(current)[key], value);
}
export function text(value: unknown): string {
  const data = object(value);
  return string(data.simpleText) || array(data.runs).map(run => string(object(run).text)).join('');
}
export function durationMs(value: string): number {
  const clean = value.trim();
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(clean)) return 0;
  const parts = clean.split(':').map(Number);
  if (parts.slice(1).some(part => part >= 60)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0) * 1000;
}

export function bestThumbnail(value: unknown): string {
  const thumbnails = array(value).map(object).filter(item => /^https?:\/\//.test(string(item.url)) || string(item.url).startsWith('//'));
  thumbnails.sort((a, b) => Number(b.width || 0) - Number(a.width || 0));
  const url = string(thumbnails[0]?.url);
  return url.startsWith('//') ? `https:${url}` : url;
}

function findVideoId(renderer: JsonObject): string {
  const candidates = [
    at(renderer, 'playlistItemData', 'videoId'),
    at(renderer, 'navigationEndpoint', 'watchEndpoint', 'videoId'),
    at(renderer, 'overlay', 'musicItemThumbnailOverlayRenderer', 'content', 'musicPlayButtonRenderer', 'playNavigationEndpoint', 'watchEndpoint', 'videoId'),
    at(renderer, 'flexColumns', 0, 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs', 0, 'navigationEndpoint', 'watchEndpoint', 'videoId'),
    at(renderer, 'onTap', 'watchEndpoint', 'videoId'),
  ];
  return candidates.map(string).find(id => /^[a-zA-Z0-9_-]{11}$/.test(id)) || '';
}

function responsiveTrack(renderer: JsonObject): Track | null {
  const id = findVideoId(renderer);
  const columns = array(renderer.flexColumns).map(column => at(column, 'musicResponsiveListItemFlexColumnRenderer', 'text'));
  const title = text(columns[0]).trim();
  if (!id || !title) return null;
  const metadata = array(at(columns[1], 'runs')).map(object);
  const linkedArtists = metadata.filter(run => {
    const browseId = string(at(run, 'navigationEndpoint', 'browseEndpoint', 'browseId'));
    const pageType = string(at(run, 'navigationEndpoint', 'browseEndpoint', 'browseEndpointContextSupportedConfigs', 'browseEndpointContextMusicConfig', 'pageType'));
    return browseId.startsWith('UC') || pageType === 'MUSIC_PAGE_TYPE_ARTIST';
  }).map(run => string(run.text));
  const metadataText = text(columns[1]);
  const parts = metadataText.split(/\s*[•·]\s*/).filter(Boolean);
  const fallbackArtist = parts.find(part => !/^(música|song|video|vídeo|álbum|album|single|ep)$/i.test(part) && !durationMs(part) && !/\d.*(views|visualiza|plays|reprodu)/i.test(part));
  const artists = [...new Set(linkedArtists)].join(', ') || fallbackArtist || 'Artista desconhecido';
  const durationTexts = [
    ...array(renderer.fixedColumns).map(column => text(at(column, 'musicResponsiveListItemFixedColumnRenderer', 'text'))),
    ...parts,
    ...columns.slice(2).map(text).flatMap(value => value.split(/\s*[•·]\s*/)),
  ];
  const album = metadata.find(run => string(at(run, 'navigationEndpoint', 'browseEndpoint', 'browseEndpointContextSupportedConfigs', 'browseEndpointContextMusicConfig', 'pageType')) === 'MUSIC_PAGE_TYPE_ALBUM');
  const badges = JSON.stringify(renderer.badges || []);
  return {
    id, title, artists,
    coverUrl: bestThumbnail(at(renderer, 'thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails')),
    durationMs: durationTexts.map(durationMs).find(value => value > 0) || 0,
    ...(album ? { albumTitle: string(album.text) } : {}),
    ...(badges.includes('MUSIC_EXPLICIT_BADGE') ? { explicit: true } : {}),
    source: 'youtube',
  };
}

/** Handles nested shelves, item sections, cards and newer responsive layouts. */
export function parseSearchTracks(value: unknown): Track[] {
  const tracks = new Map<string, Track>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 35 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(child => visit(child, depth + 1)); return; }
    const data = object(node);
    if (data.musicResponsiveListItemRenderer) {
      const track = responsiveTrack(object(data.musicResponsiveListItemRenderer));
      if (track) {
        const existing = tracks.get(track.id);
        if (!existing || (track.durationMs > 0 && existing.durationMs === 0)) tracks.set(track.id, track);
      }
      return;
    }
    Object.values(data).forEach(child => visit(child, depth + 1));
  };
  visit(value, 0);
  return [...tracks.values()];
}

/** LRC timestamps are milliseconds; metadata offset applies to every actual tag. */
export function parseLrc(content: string): LyricLine[] {
  const offsetMatch = content.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
  const result: LyricLine[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d{1,3}:\d{2}(?:\.\d{1,3})?>/g, '').trim();
    if (!words) continue;
    for (const tag of tags) {
      const seconds = Number(tag[2]);
      if (seconds >= 60) continue;
      const fraction = Number((tag[3] || '').padEnd(3, '0'));
      result.push({ startTimeMs: Math.max(0, Number(tag[1]) * 60000 + seconds * 1000 + fraction + offset), words, synced: true });
    }
  }
  const seen = new Set<string>();
  return result.sort((a, b) => a.startTimeMs - b.startTimeMs).filter(line => {
    const key = `${line.startTimeMs}:${line.words}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseLyricsResponse(value: unknown): LyricLine[] {
  const data = object(value);
  const synced = parseLrc(string(data.syncedLyrics));
  if (synced.length) return synced;
  return string(data.plainLyrics).split(/\r?\n/).map(words => words.trim()).filter(Boolean)
    .map(words => ({ startTimeMs: 0, words, synced: false }));
}

export function normalizeIdentity(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(official\s*(music\s*)?(video|audio|visualizer)|audio oficial|video oficial|lyrics|lyric video)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const VARIANT = /\b(remix|remixed|cover|karaoke|instrumental|live|ao vivo|acoustic|acustic[oa]|sped up|slowed|reverb|nightcore|mashup|edit|8d|extended)\b/;

/** Cross-provider fallback must prove title, credited artist and compatible duration. */
export function soundCloudMatches(candidate: unknown, title: string, artist: string, expectedDurationMs = 0): boolean {
  const track = object(candidate);
  if (track.streamable === false || track.policy === 'BLOCK' || track.policy === 'SNIP') return false;
  const expectedTitle = normalizeIdentity(title);
  const actualTitle = normalizeIdentity(string(track.title));
  const requestedArtist = normalizeIdentity(artist.split(/[,•&]/)[0]);
  if (!expectedTitle || !actualTitle || !requestedArtist) return false;
  const expectedVariant = expectedTitle.match(VARIANT)?.[0];
  const actualVariant = actualTitle.match(VARIANT)?.[0];
  if (actualVariant !== expectedVariant) return false;
  const publisher = object(track.publisher_metadata);
  const creditedArtists = string(publisher.artist).split(/\s*(?:,|&|feat\.?|ft\.?)\s*/i).map(normalizeIdentity);
  const uploader = normalizeIdentity(string(at(track, 'user', 'username'))).replace(/\s*(official|music|vevo)$/, '').trim();
  // Uploader alone cannot verify a different song; title must still be exact.
  const artistMatches = creditedArtists.includes(requestedArtist) || uploader === requestedArtist ||
    actualTitle.startsWith(`${requestedArtist} `) || actualTitle.endsWith(` ${requestedArtist}`);
  if (!artistMatches) return false;
  const titleMatches = actualTitle === expectedTitle || actualTitle === `${requestedArtist} ${expectedTitle}` || actualTitle === `${expectedTitle} ${requestedArtist}`;
  if (!titleMatches) return false;
  const actualDuration = Number(track.duration);
  const isPreview = array(at(track, 'media', 'transcodings')).length > 0 &&
    array(at(track, 'media', 'transcodings')).every(value => object(value).snipped === true);
  if (isPreview) return false;
  if (expectedDurationMs > 0 && (!Number.isFinite(actualDuration) || Math.abs(actualDuration - expectedDurationMs) > Math.max(5000, expectedDurationMs * 0.04))) return false;
  return true;
}

