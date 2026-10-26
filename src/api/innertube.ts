import type { Track, LyricLine } from '../types';
import { ApiError, RequestCache, isAbortError, request, requestJson, throwIfAborted, withDeadline } from './transport';
import { array, at, bestThumbnail, normalizeIdentity, object, parseLyricsResponse, parseSearchTracks, soundCloudMatches, string } from './parsers';

export { ApiError, isAbortError } from './transport';
export { parseLrc } from './parsers';

export interface ApiConfiguration {
  backendUrl?: string;
  /** Return an authorized session token; never embed a secret in the application. */
  getAccessToken?: () => string | null | Promise<string | null>;
  soundCloudClientId?: string;
}

export interface StreamOptions {
  signal?: AbortSignal;
  durationMs?: number;
  forceRefresh?: boolean;
  excludeUrls?: string[];
}

const DEFAULT_CLIENT_ID = 'GytJkwrLebfCWmFfWOuDf7WObQo2BND9';
export const DEFAULT_PRIMARY_API = 'https://api.tryliner.fun';
let configuration: ApiConfiguration = { backendUrl: DEFAULT_PRIMARY_API };
let cachedSoundCloudClientId = DEFAULT_CLIENT_ID;
const searchCache = new RequestCache<Track[]>(40);
const streamCache = new RequestCache<string>(60);
const lyricCache = new RequestCache<LyricLine[]>(80);
const visitorCache = new RequestCache<string | null>(1);
const clientIdCache = new RequestCache<string>(1);
const metadataCache = new RequestCache<Track>(50);

export function clearApiCaches(): void {
  searchCache.clear(); streamCache.clear(); lyricCache.clear(); visitorCache.clear(); clientIdCache.clear(); metadataCache.clear();
}

/** Optional server adapter configuration for audio playback. */
export function configureApi(config: ApiConfiguration): void {
  if (config.backendUrl) {
    let url: URL;
    try { url = new URL(config.backendUrl); }
    catch { throw new ApiError('Endereço do servidor inválido.', 'configuration'); }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new ApiError('Use HTTPS para o servidor.', 'configuration');
    }
    if (url.username || url.password || url.search || url.hash) throw new ApiError('Endereço do servidor inválido.', 'configuration');
  }
  configuration = { backendUrl: DEFAULT_PRIMARY_API, ...config };
  cachedSoundCloudClientId = config.soundCloudClientId || DEFAULT_CLIENT_ID;
  clearApiCaches();
}

const MUSIC_CLIENT = { clientName: 'WEB_REMIX', clientVersion: '1.20260911.08.00', hl: 'pt', gl: 'BR' };

const PLAYBACK_CLIENTS = [
  {
    origin: 'https://music.youtube.com', id: '101',
    userAgent: 'com.google.visionos.youtube/1.04(RealityDevice17,1; U; CPU visionOS 26_6_0 like Mac OS X; en_US)',
    client: { clientName: 'VISIONOS', clientVersion: '1.04', hl: 'pt', gl: 'BR', osName: 'visionOS', osVersion: '26.6.0.23O770', deviceMake: 'Apple', deviceModel: 'RealityDevice17,1', platform: 'MOBILE' },
  },
  {
    origin: 'https://www.youtube.com', id: '28',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    client: { clientName: 'ANDROID_VR', clientVersion: '1.65.10', hl: 'pt', gl: 'BR', osName: 'Android', osVersion: '12L', deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, buildId: 'SQ3A.220605.009.A1', packageName: 'com.google.android.apps.youtube.vr.oculus' },
  },
];

export function getVisitorData(signal?: AbortSignal): Promise<string | null> {
  return visitorCache.get('visitor', 60 * 60 * 1000, async sharedSignal => {
    try {
      const body = await request('https://www.youtube.com/sw.js_data', response => response.text(), { signal: sharedSignal, timeoutMs: 3000 });
      return body.match(/Cg[s-v][A-Za-z0-9_-]{20,}(?:%3D|=){0,2}/)?.[0] || null;
    } catch (error) {
      if (isAbortError(error)) throw error;
      return null;
    }
  }, signal);
}

async function refreshSoundCloudClientId(signal?: AbortSignal): Promise<string> {
  if (configuration.soundCloudClientId) return configuration.soundCloudClientId;
  return clientIdCache.get('client-id', 60 * 60 * 1000, async sharedSignal => {
    const html = await request('https://soundcloud.com', response => response.text(), { signal: sharedSignal, timeoutMs: 6000 });
    const scripts = [...html.matchAll(/src="((?:https:)?\/\/a-v2\.sndcdn\.com\/assets\/[^"?]+\.js[^"]*)"/g)].map(match => match[1]).reverse().slice(0, 3);
    for (const script of scripts) {
      const source = await request(script.startsWith('//') ? `https:${script}` : script, response => response.text(), { signal: sharedSignal, timeoutMs: 6000 });
      const id = source.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/)?.[1];
      if (id) { cachedSoundCloudClientId = id; return id; }
    }
    throw new ApiError('O SoundCloud alterou o acesso ao catálogo.', 'unavailable');
  }, signal);
}

export async function getSoundCloudClientId(signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  return configuration.soundCloudClientId || cachedSoundCloudClientId;
}

async function soundCloudRequest(path: string, signal?: AbortSignal): Promise<unknown> {
  let id = await getSoundCloudClientId(signal);
  const fetchWithId = (clientId: string) => {
    const url = new URL(path.startsWith('https:') ? path : `https://api-v2.soundcloud.com${path}`);
    url.searchParams.set('client_id', clientId);
    return requestJson(url.toString(), { signal, timeoutMs: 8000 });
  };
  try { return await fetchWithId(id); }
  catch (error) {
    if (!(error instanceof ApiError) || ![401, 403].includes(error.status || 0) || configuration.soundCloudClientId) throw error;
    id = await refreshSoundCloudClientId(signal);
    return fetchWithId(id);
  }
}

async function streamFromSoundCloudTrack(value: unknown, signal?: AbortSignal): Promise<string | null> {
  const data = object(value);
  if (data.streamable === false || data.policy === 'BLOCK' || data.policy === 'SNIP') return null;
  const transcodings = array(at(data, 'media', 'transcodings')).map(object).filter(item => item.snipped !== true && string(item.url).startsWith('https://'));
  const selected = transcodings.find(item => at(item, 'format', 'protocol') === 'hls' && /mpeg|aac/.test(string(at(item, 'format', 'mime_type')))) ||
    transcodings.find(item => at(item, 'format', 'protocol') === 'hls') || transcodings.find(item => at(item, 'format', 'protocol') === 'progressive');
  if (!selected) return null;
  const response = await soundCloudRequest(string(selected.url), signal);
  return validAudioUrl(string(object(response).url));
}

export async function searchSoundCloudTracks(query: string, signal?: AbortSignal): Promise<Track[]> {
  const clean = query.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!clean) { throwIfAborted(signal); return []; }
  try {
    const data = await soundCloudRequest(`/search/tracks?q=${encodeURIComponent(clean)}&limit=25`, signal);
    const collection = array(object(data).collection);
    const tracks: Track[] = [];
    for (const item of collection) {
      const d = object(item);
      const id = string(d.id);
      const title = string(d.title);
      const user = object(d.user);
      const artists = string(user.username) || 'SoundCloud';
      const rawCover = string(d.artwork_url) || string(user.avatar_url);
      const coverUrl = rawCover ? rawCover.replace(/-large\./, '-t500x500.') : '';
      const duration = Number(d.duration) || 0;
      if (id && title) {
        tracks.push({
          id: `sc:${id}`,
          title,
          artists,
          coverUrl,
          durationMs: duration,
          source: 'soundcloud',
        });
      }
    }
    return tracks;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return [];
  }
}

export async function resolveSoundCloudStream(title: string, artist: string, options: StreamOptions = {}): Promise<string | null> {
  const query = `${title} ${artist}`.trim();
  if (!title.trim() || !artist.trim()) return null;
  const data = await soundCloudRequest(`/search/tracks?q=${encodeURIComponent(query)}&limit=10`, options.signal);
  const candidate = array(object(data).collection).find(track => soundCloudMatches(track, title, artist, options.durationMs));
  return candidate ? streamFromSoundCloudTrack(candidate, options.signal) : null;
}

function validAudioUrl(url: string): string | null {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null; }
  catch { return null; }
}

function streamTtl(url: string): number {
  try {
    const expires = Number(new URL(url).searchParams.get('expire')) * 1000;
    // Signed URLs are ephemeral; keep a minute of safety before provider expiry.
    return expires > 0 ? Math.min(5 * 60 * 1000, Math.max(0, expires - Date.now() - 60000)) : 2 * 60 * 1000;
  } catch { return 0; }
}

// Refreshing a signed URL changes its signature, not its codec/container.
// Do not retry the same failed Google media format under a new signature.
function excludedFormat(url: string, excluded: string[]): boolean {
  if (excluded.includes(url)) return true;
  try {
    const candidate = new URL(url);
    const itag = candidate.searchParams.get('itag');
    if (!itag || !candidate.hostname.endsWith('.googlevideo.com')) return false;
    return excluded.some(previous => {
      try {
        const failed = new URL(previous);
        const failedClient = failed.searchParams.get('c');
        const candidateClient = candidate.searchParams.get('c');
        return failed.hostname.endsWith('.googlevideo.com') && failed.searchParams.get('itag') === itag &&
          (!failedClient || !candidateClient || failedClient === candidateClient);
      } catch { return false; }
    });
  } catch { return false; }
}

async function resolveBackendStream(videoId: string, signal: AbortSignal): Promise<string | null> {
  if (!configuration.backendUrl || !configuration.getAccessToken) return null;
  try {
    const token = await configuration.getAccessToken();
    throwIfAborted(signal);
    if (!token) return null;
    const data = await requestJson(`${configuration.backendUrl!.replace(/\/+$/, '')}/v1/tracks/${encodeURIComponent(videoId)}/playback`, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, signal, timeoutMs: 5000,
    });
    const url = validAudioUrl(string(object(data).url));
    if (!url) throw new ApiError('O servidor não retornou um endereço de áudio.', 'invalid_response');
    return url;
  } catch (error) {
    if (isAbortError(error)) throw error;
    // The desktop contract permits direct-provider fallback for missing cached audio.
    return null;
  }
}

async function resolveYoutubeStream(videoId: string, signal: AbortSignal, excludeUrls: string[] = []): Promise<string> {
  const visitorData = await getVisitorData(signal);
  let lastError: unknown;
  for (const profile of PLAYBACK_CLIENTS) {
    try {
      const data = await requestJson(`${profile.origin}/youtubei/v1/player?prettyPrint=false`, {
        method: 'POST', signal, timeoutMs: 8000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': profile.userAgent, 'X-YouTube-Client-Name': profile.id, 'X-YouTube-Client-Version': profile.client.clientVersion, Origin: profile.origin, Referer: `${profile.origin}/`, ...(visitorData ? { 'X-Goog-Visitor-Id': visitorData } : {}) },
        body: JSON.stringify({ videoId, contentCheckOk: true, racyCheckOk: true, context: { client: { ...profile.client, ...(profile.id === '28' ? { userAgent: profile.userAgent } : {}), ...(visitorData ? { visitorData } : {}) }, user: { lockedSafetyMode: false } } }),
      });
      const returnedId = string(at(data, 'videoDetails', 'videoId'));
      if (returnedId && returnedId !== videoId) throw new ApiError('O provedor retornou outra música.', 'invalid_response');
      const status = string(at(data, 'playabilityStatus', 'status'));
      if (status && status !== 'OK') throw new ApiError(string(at(data, 'playabilityStatus', 'reason')) || 'Esta música está indisponível no provedor.', 'unavailable');
      const formats = [...array(at(data, 'streamingData', 'adaptiveFormats')), ...array(at(data, 'streamingData', 'formats'))].map(object)
        .filter(format => string(format.mimeType).startsWith('audio/') && validAudioUrl(string(format.url)));
      // AAC is supported reliably by Android's native player and generally costs less data.
      formats.sort((a, b) => Number(string(b.mimeType).startsWith('audio/mp4')) - Number(string(a.mimeType).startsWith('audio/mp4')) || Number(b.bitrate || 0) - Number(a.bitrate || 0));
      for (const format of formats.slice(0, 4)) {
        const url = string(format.url);
        if (excludedFormat(url, excludeUrls)) continue;
        try {
          const probe = new URL(url);
          const length = Number(format.contentLength) || Number(probe.searchParams.get('clen'));
          const offset = length > 0 ? length - 1 : 0;
          probe.searchParams.set('range', `${offset}-${offset}`);
          await request(probe.toString(), async response => {
            if (typeof response.body?.cancel === 'function') await response.body.cancel();
            return true;
          }, { signal, timeoutMs: 3500 });
          return url;
        } catch (error) { if (isAbortError(error)) throw error; lastError = error; }
      }
      throw lastError || new ApiError('O provedor não disponibilizou áudio para esta música.', 'unavailable');
    } catch (error) {
      if (isAbortError(error)) throw error;
      visitorCache.clear();
      lastError = error;
    }
  }
  visitorCache.clear();
  throw lastError || new ApiError('Esta música está indisponível.', 'unavailable');
}

export function resolveAudioStream(trackId: string, title?: string, artist?: string, options: StreamOptions = {}): Promise<string> {
  const key = `${trackId}:${normalizeIdentity(title || '')}:${normalizeIdentity(artist || '')}:${options.durationMs || 0}:${(options.excludeUrls || []).join('|')}`;
  if (options.forceRefresh) streamCache.delete(key);
  return streamCache.get(key, streamTtl, sharedSignal => withDeadline(async signal => {
    const soundCloudId = trackId.match(/^sc:(\d+)$/)?.[1];
    if (soundCloudId) {
      const track = await soundCloudRequest(`/tracks/${soundCloudId}`, signal);
      const stream = await streamFromSoundCloudTrack(track, signal);
      if (stream) return stream;
      throw new ApiError('Esta música está indisponível no SoundCloud.', 'unavailable');
    }
    const videoId = trackId.replace(/^yt:/, '');
    let firstError: unknown;
    if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      const backend = await resolveBackendStream(videoId, signal);
      if (backend && !options.excludeUrls?.includes(backend)) return backend;
      try { return await resolveYoutubeStream(videoId, signal, options.excludeUrls); }
      catch (error) { if (isAbortError(error)) throw error; firstError = error; }
    }
    // Never pick the first search hit: only a verified recording may substitute.
    if (title && artist) {
      try {
        const soundCloud = await resolveSoundCloudStream(title, artist, { ...options, signal });
        if (soundCloud && !options.excludeUrls?.includes(soundCloud)) return soundCloud;
      } catch (error) {
        if (isAbortError(error)) throw error;
        firstError ||= error;
      }

      try {
        const hits = await searchTracks(`${title} ${artist}`, { signal });
        const match = hits.find(h => {
          const hitId = h.id.replace(/^yt:/, '');
          return /^[a-zA-Z0-9_-]{11}$/.test(hitId) && hitId !== videoId;
        });
        if (match) {
          const standInId = match.id.replace(/^yt:/, '');
          const stream = await resolveYoutubeStream(standInId, signal, options.excludeUrls);
          if (stream) return stream;
        }
      } catch (standInError) {
        if (isAbortError(standInError)) throw standInError;
      }
    }
    if (firstError instanceof ApiError && (firstError.code === 'network' || firstError.code === 'timeout')) throw firstError;
    throw new ApiError('Não foi possível obter esta gravação. O provedor pode restringir o áudio. Tente outra música ou tente novamente mais tarde.', 'unavailable');
  }, sharedSignal, 30000), options.signal);
}

export type SearchFilterMode = 'all' | 'songs' | 'videos';

export interface SearchTracksOptions {
  signal?: AbortSignal;
  mode?: SearchFilterMode;
}

export function searchTracks(query: string, signalOrOptions?: AbortSignal | SearchTracksOptions): Promise<Track[]> {
  const signal = signalOrOptions instanceof AbortSignal ? signalOrOptions : signalOrOptions?.signal;
  const mode = signalOrOptions instanceof AbortSignal ? 'all' : signalOrOptions?.mode || 'all';
  const clean = query.trim().replace(/\s+/g, ' ').slice(0, 300);
  if (!clean) { throwIfAborted(signal); return Promise.resolve([]); }
  const cacheKey = `${mode}:${clean.toLowerCase()}`;
  return searchCache.get(cacheKey, 3 * 60 * 1000, async sharedSignal => {
    const params = mode === 'videos'
      ? 'EgWKAQIQAWoKEAkQBRAKEAMQBA%3D%3D'
      : mode === 'songs'
        ? 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'
        : undefined;

    const data = await requestJson('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST', signal: sharedSignal, timeoutMs: 10000, retries: 1,
      headers: { 'Content-Type': 'application/json', 'X-YouTube-Client-Name': '67', 'X-YouTube-Client-Version': MUSIC_CLIENT.clientVersion, Origin: 'https://music.youtube.com' },
      body: JSON.stringify({ query: clean, ...(params ? { params } : {}), context: { client: MUSIC_CLIENT } }),
    });
    if (!object(data).contents && !object(data).continuationContents) throw new ApiError('O catálogo enviou uma resposta inesperada.', 'invalid_response');
    return parseSearchTracks(data);
  }, signal);
}

export function fetchLyrics(title: string, artist: string, signal?: AbortSignal, expectedDurationMs?: number): Promise<LyricLine[]> {
  const cleanTitle = title.replace(/\s*[\[(](?:official.*?|video oficial|audio oficial|lyrics?)[\])]/gi, '').trim();
  const cleanArtist = artist.split(/[,•&]/)[0].trim();
  if (!cleanTitle || !cleanArtist) { throwIfAborted(signal); return Promise.resolve([]); }
  const key = `${cleanTitle.toLowerCase()}:${cleanArtist.toLowerCase()}:${expectedDurationMs || 0}`;
  return lyricCache.get(key, lines => lines.length ? 60 * 60 * 1000 : 5 * 60 * 1000, async sharedSignal => {
    const params = new URLSearchParams({ track_name: cleanTitle, artist_name: cleanArtist });
    if (expectedDurationMs && expectedDurationMs > 0) params.set('duration', String(Math.round(expectedDurationMs / 1000)));
    try {
      const data = await requestJson(`https://lrclib.net/api/get?${params}`, { signal: sharedSignal, timeoutMs: 8000, retries: 1 });
      return parseLyricsResponse(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return [];
      throw error;
    }
  }, signal);
}

/** Resolves true canonical metadata without confusing the description with the artist. */
export function fetchTrackDetails(trackId: string, signal?: AbortSignal): Promise<Track> {
  return metadataCache.get(trackId, 15 * 60 * 1000, async sharedSignal => {
    const videoId = trackId.replace(/^yt:/, '');
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) throw new ApiError('Identificador de música inválido.', 'configuration');
    const data = await requestJson('https://music.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST', signal: sharedSignal, timeoutMs: 8000,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, context: { client: MUSIC_CLIENT } }),
    });
    const details = object(object(data).videoDetails);
    if (string(details.videoId) !== videoId || !string(details.title)) throw new ApiError('Metadados da música indisponíveis.', 'unavailable');
    return { id: trackId, title: string(details.title), artists: string(details.author).replace(/\s*-\s*Topic$/, ''), coverUrl: bestThumbnail(at(details, 'thumbnail', 'thumbnails')), durationMs: Math.max(0, Number(details.lengthSeconds) || 0) * 1000, source: 'youtube' };
  }, signal);
}

export async function getRadioTracks(trackId: string, signal?: AbortSignal): Promise<Track[]> {
  const cleanId = trackId.replace(/^yt:/, '');
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    try {
      const data = await requestJson('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', {
        method: 'POST',
        signal,
        timeoutMs: 8000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Origin: 'https://music.youtube.com',
        },
        body: JSON.stringify({
          videoId: cleanId,
          playlistId: `RDAMVM${cleanId}`,
          context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', hl: 'pt', gl: 'BR' } },
        }),
      });

      const contents = at(data, 'contents', 'singleColumnMusicWatchNextResultsRenderer', 'tabbedRenderer', 'watchNextTabbedResultsRenderer', 'tabs') as unknown[];
      const firstTab = Array.isArray(contents) ? contents[0] : null;
      const rawQueue = at(firstTab, 'tabRenderer', 'content', 'musicQueueRenderer', 'content', 'playlistPanelRenderer', 'contents') as unknown[];

      if (Array.isArray(rawQueue) && rawQueue.length > 0) {
        const tracks: Track[] = [];
        for (const item of rawQueue) {
          const renderer = at(item, 'playlistPanelVideoRenderer');
          if (!renderer) continue;
          const id = string(at(renderer, 'videoId'));
          const title = string(at(renderer, 'title', 'runs', 0, 'text'));
          const artist = string(at(renderer, 'shortBylineText', 'runs', 0, 'text')) || string(at(renderer, 'longBylineText', 'runs', 0, 'text')) || 'Artista';
          if (!id || !title || id === cleanId) continue;
          const thumbs = array(at(renderer, 'thumbnail', 'thumbnails')).map(object);
          const coverUrl = bestThumbnail(thumbs);
          tracks.push({
            id: `yt:${id}`,
            title,
            artists: artist,
            durationMs: 180000,
            coverUrl,
          });
          if (tracks.length >= 15) break;
        }
        if (tracks.length > 0) return tracks;
      }
    } catch {}
  }

  // Fallback: search for top tracks in Brazil
  return searchTracks('Top Brasil músicas', signal).then(t => t.slice(0, 15)).catch(() => []);
}



