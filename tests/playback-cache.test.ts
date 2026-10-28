import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const disk = new Map<string, { bytes: Uint8Array; modified: number }>();
class MockDirectory {
  uri: string;
  constructor(parent: string, name: string) { this.uri = `${parent}/${name}`; }
  create() {}
  list() { return [...disk.keys()].filter(uri => uri.startsWith(`${this.uri}/`)).map(uri => new MockFile(uri)); }
}
class MockFile {
  uri: string;
  constructor(parent: string | MockDirectory, name?: string) { this.uri = name ? `${typeof parent === 'string' ? parent : parent.uri}/${name}` : String(parent); }
  get name() { return this.uri.split('/').at(-1)!; }
  get exists() { return disk.has(this.uri); }
  get size() { return disk.get(this.uri)?.bytes.length || 0; }
  get modificationTime() { return disk.get(this.uri)?.modified || 0; }
  create() { disk.set(this.uri, { bytes: new Uint8Array(), modified: Date.now() }); }
  delete() { disk.delete(this.uri); }
  open() {
    let closed = false;
    return {
      writeBytes: async (bytes: Uint8Array) => {
        if (closed) throw new Error('Closed file');
        const previous = disk.get(this.uri)!.bytes;
        const next = new Uint8Array(previous.length + bytes.length);
        next.set(previous); next.set(bytes, previous.length);
        disk.set(this.uri, { bytes: next, modified: Date.now() });
      },
      close: () => { closed = true; },
    };
  }
  async move(target: MockFile) { disk.set(target.uri, disk.get(this.uri)!); disk.delete(this.uri); this.uri = target.uri; }
}
vi.mock('expo-file-system', () => ({ File: MockFile, Directory: MockDirectory, Paths: { cache: 'file:///cache' } }));
let cache: typeof import('../src/player/prepareSource.native');
const source = (id = 'recording') => `https://rr1.googlevideo.com/videoplayback?id=${id}&clen=20&itag=140&sig=private`;
beforeEach(async () => {
  vi.resetModules(); disk.clear();
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const [start, end] = new URL(input).searchParams.get('range')!.split('-').map(Number);
    return new Response(new Uint8Array(end - start + 1).fill(42), { headers: { 'content-length': String(end - start + 1), 'content-type': 'audio/mp4' } });
  }));
  cache = await import('../src/player/prepareSource.native');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('publishes only the complete local file and reuses it across renewed signatures', async () => {
  const prepared = await cache.preparePlaybackSource(source());
  expect(prepared).toMatch(/^file:\/\/\/cache\/liner-playback-v1\/.*\.m4a$/);
  expect(disk.get(prepared)!.bytes).toEqual(new Uint8Array(20).fill(42));
  expect([...disk.keys()].some(uri => uri.endsWith('.part'))).toBe(false);
  expect(cache.originalPlaybackSource(prepared)).toBe(source());
  expect(await cache.preparePlaybackSource(source().replace('private', 'renewed'))).toBe(prepared);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('deduplicates preparations and respects independent subscriber cancellation', async () => {
  let respond!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
  const controller = new AbortController();
  const first = cache.preparePlaybackSource(source(), controller.signal);
  const second = cache.preparePlaybackSource(source());
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  respond(new Response(new Uint8Array(20), { headers: { 'content-length': '20' } }));
  expect(await second).toMatch(/\.m4a$/);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('removes partial files after HTTP failures and rechecks files evicted by the OS', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 403 }));
  await expect(cache.preparePlaybackSource(source())).rejects.toMatchObject({ status: 403 });
  expect(disk.size).toBe(0);
  const prepared = await cache.preparePlaybackSource(source());
  disk.delete(prepared);
  await cache.preparePlaybackSource(source());
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('bounds disk entries and preserves the currently retained audio during eviction', async () => {
  vi.useFakeTimers();
  const current = await cache.preparePlaybackSource(source('current'));
  cache.retainPreparedSources([current]);
  for (let index = 0; index < 19; index++) {
    vi.setSystemTime(Date.now() + 31_000);
    await cache.preparePlaybackSource(source(`next-${index}`));
  }
  expect(disk.has(current)).toBe(true);
  expect(disk.size).toBeLessThanOrEqual(16);
});

it('passes through device files and non-Google providers', async () => {
  expect(await cache.preparePlaybackSource('file:///music/local.mp3')).toBe('file:///music/local.mp3');
  expect(await cache.preparePlaybackSource('https://authorized.test/audio.mp4')).toBe('https://authorized.test/audio.mp4');
  expect(fetch).not.toHaveBeenCalled();
});

it('evicts a decoded bad file before retrying a fresh signature and never removes user files', async () => {
  const local = await cache.preparePlaybackSource(source());
  disk.set(local, { bytes: new Uint8Array(20).fill(9), modified: Date.now() });
  cache.discardPreparedSource(source());
  expect(disk.has(local)).toBe(false);
  await cache.preparePlaybackSource(source().replace('private', 'renewed'));
  expect(fetch).toHaveBeenCalledTimes(2);
  disk.set('file:///music/local.mp3', { bytes: new Uint8Array(20), modified: Date.now() });
  cache.discardPreparedSource('file:///music/local.mp3');
  expect(disk.has('file:///music/local.mp3')).toBe(true);
});
