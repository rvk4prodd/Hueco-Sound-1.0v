import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { durationMs, parseLrc, parseLyricsResponse, parseSearchTracks, soundCloudMatches } from '../src/api/parsers';
import { ApiError, RequestCache, requestJson } from '../src/api/transport';
import { clearApiCaches, configureApi, fetchLyrics, resolveAudioStream, searchTracks } from '../src/api/innertube';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const musicItem = (id = 'dQw4w9WgXcQ', length = '3:33') => ({ musicResponsiveListItemRenderer: {
  playlistItemData: { videoId: id },
  flexColumns: [
    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Never Gonna Give You Up' }] } } },
    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [
      { text: 'Rick Astley', navigationEndpoint: { browseEndpoint: { browseId: 'UCartist' } } },
      { text: ' • ' }, { text: '1 bi visualizações' },
    ] } } },
  ],
  fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: length }] } } }],
  thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: '//small.test/image', width: 60 }, { url: 'https://large.test/image', width: 300 }] } } },
  badges: [{ musicInlineBadgeRenderer: { icon: { iconType: 'MUSIC_EXPLICIT_BADGE' } } }],
} });

beforeEach(() => { configureApi({}); });
afterEach(() => { clearApiCaches(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('catalog metadata', () => {
  it('finds nested shelves, keeps canonical identities, artist only and real duration', () => {
    const tracks = parseSearchTracks({ contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: [musicItem(), musicItem()] } }] } } } }] } } });
    expect(tracks).toEqual([{ id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artists: 'Rick Astley', durationMs: 213000, coverUrl: 'https://large.test/image', explicit: true, source: 'youtube' }]);
  });
  it('deduplicates and enriches a missing duration from another shelf', () => {
    expect(parseSearchTracks([musicItem('dQw4w9WgXcQ', ''), musicItem()])[0].durationMs).toBe(213000);
    expect(durationMs('1:02:03')).toBe(3723000);
    expect(durationMs('3:99')).toBe(0);
  });
  it('distinguishes empty search results from network failures and malformed responses', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ contents: {} })).mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetcher);
    await expect(searchTracks('empty')).resolves.toEqual([]);
    await expect(searchTracks('different')).rejects.toMatchObject({ code: 'network' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    fetcher.mockResolvedValue(json({ error: 'bad shape' }));
    await expect(searchTracks('bad')).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('actual lyrics timing', () => {
  it('supports repeated tags, integer/decimal times, offset, enhanced tags and sorting', () => {
    expect(parseLrc('[ar:Artist]\n[offset:-250]\n[00:02.5][01:02.050] Same <00:02.60>line\n[00:01] First\n[00:99.00] Invalid\n[00:01] First')).toEqual([
      { startTimeMs: 750, words: 'First', synced: true },
      { startTimeMs: 2250, words: 'Same line', synced: true },
      { startTimeMs: 61800, words: 'Same line', synced: true },
    ]);
  });
  it('never invents synchronization for plain lyrics', () => {
    expect(parseLyricsResponse({ plainLyrics: '\nLine one\n\nLine two\r\n' })).toEqual([
      { startTimeMs: 0, words: 'Line one', synced: false }, { startTimeMs: 0, words: 'Line two', synced: false },
    ]);
  });
  it('returns [] only for genuinely missing lyrics and propagates provider outages', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 404)).mockResolvedValue(json({}, 503));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchLyrics('missing', 'artist')).resolves.toEqual([]);
    await expect(fetchLyrics('outage', 'artist')).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe('recording identity', () => {
  const original = { title: 'Rick Astley - Never Gonna Give You Up', duration: 213000, user: { username: 'Rick Astley' }, streamable: true };
  it('requires matching title, credited artist and compatible duration', () => {
    expect(soundCloudMatches(original, 'Never Gonna Give You Up', 'Rick Astley', 213000)).toBe(true);
    expect(soundCloudMatches({ ...original, title: 'Never Gonna Give You Up (DJ remix)' }, 'Never Gonna Give You Up', 'Rick Astley', 213000)).toBe(false);
    expect(soundCloudMatches({ ...original, title: 'Never Gonna Give You Up', user: { username: 'Cover Singer' } }, 'Never Gonna Give You Up', 'Rick Astley', 213000)).toBe(false);
    expect(soundCloudMatches({ ...original, duration: 30000 }, 'Never Gonna Give You Up', 'Rick Astley', 213000)).toBe(false);
    expect(soundCloudMatches({ ...original, policy: 'SNIP' }, 'Never Gonna Give You Up', 'Rick Astley', 213000)).toBe(false);
    expect(soundCloudMatches({ ...original, title: 'Together Forever' }, 'Never Gonna Give You Up', 'Rick Astley', 213000)).toBe(false);
  });
  it('resolves the selected YouTube ID before ever considering a substitute', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('sw.js_data')) return new Response('visitor data unavailable');
      if (url.includes('/player?')) {
        expect(JSON.parse(String(init?.body)).videoId).toBe('dQw4w9WgXcQ');
        return json({ videoDetails: { videoId: 'dQw4w9WgXcQ' }, playabilityStatus: { status: 'OK' }, streamingData: { adaptiveFormats: [{ mimeType: 'audio/mp4', bitrate: 128000, url: 'https://audio.test/song?expire=9999999999' }] } });
      }
      if (url.startsWith('https://audio.test/')) return new Response('x');
      throw new Error('Unexpected provider');
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(resolveAudioStream('dQw4w9WgXcQ', 'Never Gonna Give You Up', 'Rick Astley')).resolves.toBe('https://audio.test/song?expire=9999999999');
    expect(fetcher.mock.calls.some(([url]) => url.includes('soundcloud'))).toBe(false);
    await resolveAudioStream('dQw4w9WgXcQ', 'Never Gonna Give You Up', 'Rick Astley');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('rejects an arbitrary SoundCloud remix when the canonical track is blocked', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('sw.js_data')) return new Response('');
      if (url.includes('/player?')) return json({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in' } });
      if (url.includes('/search/tracks?')) return json({ collection: [{ ...original, title: 'Never Gonna Give You Up remix', media: { transcodings: [{ url: 'https://api-v2.soundcloud.com/media/fake', format: { protocol: 'hls' } }] } }] });
      throw new Error('Must not resolve mismatched recording');
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(resolveAudioStream('dQw4w9WgXcQ', 'Never Gonna Give You Up', 'Rick Astley', { durationMs: 213000 })).rejects.toMatchObject({ code: 'unavailable' });
    expect(fetcher.mock.calls.some(([url]) => url.includes('/media/'))).toBe(false);
  });
  it('uses the real desktop playback contract only with an authorized token', async () => {
    configureApi({ backendUrl: 'https://my-server.test/', getAccessToken: () => 'authorized-token' });
    const fetcher = vi.fn().mockResolvedValue(json({ url: 'https://audio.test/authorized.mp4' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(resolveAudioStream('dQw4w9WgXcQ')).resolves.toBe('https://audio.test/authorized.mp4');
    expect(fetcher).toHaveBeenCalledWith('https://my-server.test/v1/tracks/dQw4w9WgXcQ/playback', expect.objectContaining({ method: 'POST', headers: { authorization: 'Bearer authorized-token' } }));
    expect(() => configureApi({ backendUrl: 'http://insecure.test' })).toThrow(ApiError);
  });
});

describe('request lifetime', () => {
  it('deduplicates requests while keeping each subscriber cancellation independent', async () => {
    const cache = new RequestCache<string>();
    let complete!: (value: string) => void;
    const factory = vi.fn(() => new Promise<string>(resolve => { complete = resolve; }));
    const controller = new AbortController();
    const first = cache.get('song', 1000, factory, controller.signal);
    const second = cache.get('song', 1000, factory);
    await Promise.resolve();
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    complete('same song');
    await expect(second).resolves.toBe('same song');
    await expect(cache.get('song', 1000, factory)).resolves.toBe('same song');
    expect(factory).toHaveBeenCalledTimes(1);
  });
  it('cancels obsolete searches and prevents their results from entering cache', async () => {
    let requestSignal: AbortSignal | null | undefined;
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const pending = searchTracks('old query', controller.signal);
    await Promise.resolve(); await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal?.aborted).toBe(true);
    fetcher.mockResolvedValue(json({ contents: {} }));
    await expect(searchTracks('old query')).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('enforces a deadline even if fetch ignores cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const operation = requestJson('https://provider.test', { timeoutMs: 50 });
    const assertion = expect(operation).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});

describe('optional authenticated audio fallback', () => {
  it('still plays anonymous audio if account renewal is unavailable', async () => {
    configureApi({ getAccessToken: async () => { throw new ApiError('Account server unavailable', 'network'); } });
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('sw.js_data')) return new Response('');
      if (url.includes('/player?')) return json({ streamingData: { adaptiveFormats: [{ mimeType: 'audio/mp4', url: 'https://audio.test/source.mp4' }] } });
      return new Response('x');
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(resolveAudioStream('dQw4w9WgXcQ')).resolves.toBe('https://audio.test/source.mp4');
    expect(fetcher.mock.calls.every(([url]) => !url.includes('tryliner.fun'))).toBe(true);
  });
  it('caps a hanging account token provider within the whole audio deadline', async () => {
    vi.useFakeTimers();
    configureApi({ getAccessToken: () => new Promise<string | null>(() => {}) });
    vi.stubGlobal('fetch', vi.fn());
    const pending = resolveAudioStream('dQw4w9WgXcQ');
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
  });
});

it('tries another format when the preferred audio URL is forbidden', async () => {
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if(url.includes('sw.js_data')) return new Response('');
  if(url.includes('/player?')) return json({playabilityStatus:{status:'OK'},streamingData:{adaptiveFormats:[{mimeType:'audio/mp4',bitrate:128000,url:'https://audio.test/blocked'},{mimeType:'audio/webm',bitrate:64000,url:'https://audio.test/working'}]}});
  return new Response('x',{status:url.includes('blocked')?403:200});
 }));
 await expect(resolveAudioStream('dQw4w9WgXcQ')).resolves.toBe('https://audio.test/working');
});

it('excludes a failed native format even when its signed URL changes', async () => {
  const refreshed = 'https://rr1.googlevideo.com/videoplayback?itag=140&sig=new';
  const alternative = 'https://rr2.googlevideo.com/videoplayback?itag=251&sig=new';
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('sw.js_data')) return new Response('');
    if (url.includes('/player?')) return json({
      playabilityStatus: { status: 'OK' },
      streamingData: { adaptiveFormats: [
        { mimeType: 'audio/mp4', bitrate: 128000, url: refreshed },
        { mimeType: 'audio/webm', bitrate: 64000, url: alternative },
      ] },
    });
    return new Response('x');
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(resolveAudioStream('dQw4w9WgXcQ', undefined, undefined, {
    forceRefresh: true,
    excludeUrls: ['https://rr9.googlevideo.com/videoplayback?itag=140&sig=old'],
  })).resolves.toBe(alternative);
  expect(fetcher.mock.calls.some(([url]) => url.startsWith(refreshed))).toBe(false);
  expect(fetcher.mock.calls.some(([url]) => url.startsWith(alternative))).toBe(true);
});

it('rejects a preview-only format by checking the end of the recording, including short low-bitrate audio', async () => {
  const rejected = 'https://rr1.googlevideo.com/videoplayback?clen=900000&itag=140&c=VISIONOS';
  const working = 'https://rr2.googlevideo.com/videoplayback?clen=900000&itag=140&c=ANDROID_VR';
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('sw.js_data')) return new Response('');
    if (url.includes('/player?')) {
      const client = JSON.parse(String(init?.body)).context.client.clientName;
      return json({ streamingData: { adaptiveFormats: [{ mimeType: 'audio/mp4', contentLength: '900000', url: client === 'VISIONOS' ? rejected : working }] } });
    }
    const parsed = new URL(url);
    expect(parsed.searchParams.get('range')).toBe('899999-899999');
    return new Response('x', { status: url.startsWith(rejected) ? 403 : 200 });
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(resolveAudioStream('dQw4w9WgXcQ')).resolves.toBe(working);
  const clients = fetcher.mock.calls.filter(([url]) => url.includes('/player?')).map(([, init]) => JSON.parse(String(init?.body)).context.client.clientName);
  expect(clients).toEqual(['VISIONOS', 'ANDROID_VR']);
});

it('can retry the same codec from another client without repeating the failed client signature', async () => {
  const failed = 'https://rr1.googlevideo.com/videoplayback?itag=140&c=VISIONOS&sig=old';
  const working = 'https://rr2.googlevideo.com/videoplayback?itag=140&c=ANDROID_VR&sig=new';
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('sw.js_data')) return new Response('');
    if (url.includes('/player?')) {
      const client = JSON.parse(String(init?.body)).context.client.clientName;
      return json({ streamingData: { adaptiveFormats: [{ mimeType: 'audio/mp4', url: client === 'VISIONOS' ? failed.replace('old', 'new') : working }] } });
    }
    return new Response('x');
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(resolveAudioStream('dQw4w9WgXcQ', undefined, undefined, { forceRefresh: true, excludeUrls: [failed] })).resolves.toBe(working);
  expect(fetcher.mock.calls.some(([url]) => url.includes('sig=new') && url.includes('c=VISIONOS'))).toBe(false);
});
