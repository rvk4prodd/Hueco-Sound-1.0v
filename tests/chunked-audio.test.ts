import { afterEach, expect, it, vi } from 'vitest';
import { AUDIO_CHUNK_BYTES, googleAudioSize, writeAudioChunks } from '../src/api/chunkedAudio';

const source = 'https://rr1.googlevideo.com/videoplayback?clen=1048583&itag=140';
afterEach(() => vi.unstubAllGlobals());

it('assembles exact bounded ranges in order instead of making the forbidden open-ended request', async () => {
  const total = AUDIO_CHUNK_BYTES * 2 + 7;
  const writes: Uint8Array[] = [];
  const fetcher = vi.fn(async (input: string) => {
    const [start, end] = new URL(input).searchParams.get('range')!.split('-').map(Number);
    expect(end - start + 1).toBeLessThanOrEqual(AUDIO_CHUNK_BYTES);
    const data = new Uint8Array(end - start + 1).fill(Math.floor(start / AUDIO_CHUNK_BYTES) + 1);
    return new Response(data, { headers: { 'content-length': String(data.length), 'content-type': 'audio/mp4' } });
  });
  vi.stubGlobal('fetch', fetcher);
  await writeAudioChunks(source, total, async bytes => { writes.push(bytes); });
  expect(writes.map(bytes => bytes.length)).toEqual([AUDIO_CHUNK_BYTES, AUDIO_CHUNK_BYTES, 7]);
  expect(writes.map(bytes => bytes[0])).toEqual([1, 2, 3]);
  expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('range'))).toEqual(['0-262143', '262144-524287', '524288-524294']);
});

it('rejects a provider ignoring the requested range before reading its large response', async () => {
  const response = new Response('ignored', { headers: { 'content-length': '99999999' } });
  const read = vi.spyOn(response, 'arrayBuffer');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  const write = vi.fn();
  await expect(writeAudioChunks(source, 10, write)).rejects.toMatchObject({ code: 'invalid_response' });
  expect(write).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});

it('does not accept truncated bytes or error pages with a successful HTTP status', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x', { headers: { 'content-length': '10', 'content-type': 'audio/mp4' } })));
  await expect(writeAudioChunks(source, 10, vi.fn())).rejects.toMatchObject({ code: 'invalid_response' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error page', { headers: { 'content-length': '10', 'content-type': 'text/html' } })));
  await expect(writeAudioChunks(source, 10, vi.fn())).rejects.toMatchObject({ code: 'invalid_response' });
});

it('cancels obsolete preparation before requesting the next range', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array(AUDIO_CHUNK_BYTES), { headers: { 'content-length': String(AUDIO_CHUNK_BYTES) } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(writeAudioChunks(source, AUDIO_CHUNK_BYTES + 1, async () => controller.abort(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('limits preparation to actual HTTPS Googlevideo audio with a known bounded size', async () => {
  expect(googleAudioSize(source)).toBe(1048583);
  expect(googleAudioSize('https://rr1.googlevideo.com/videoplayback')).toBeNull();
  expect(googleAudioSize('https://googlevideo.com.attacker.test/?clen=10')).toBeNull();
  expect(googleAudioSize('file:///audio.m4a')).toBeNull();
  await expect(writeAudioChunks(source, 33 * 1024 * 1024, vi.fn())).rejects.toMatchObject({ code: 'unavailable' });
});

it('retries a rejected large range at the same offset with smaller bounded requests', async () => {
  const fetcher = vi.fn(async (input: string) => {
    const [start, end] = new URL(input).searchParams.get('range')!.split('-').map(Number);
    if (start >= AUDIO_CHUNK_BYTES && end - start + 1 > 16384) return new Response('', { status: 403 });
    return new Response(new Uint8Array(end - start + 1), { headers: { 'content-length': String(end - start + 1) } });
  });
  vi.stubGlobal('fetch', fetcher);
  let received = 0;
  await writeAudioChunks(source, AUDIO_CHUNK_BYTES + 65536, async bytes => { received += bytes.length; });
  expect(received).toBe(AUDIO_CHUNK_BYTES + 65536);
  expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('range'))).toEqual([
    '0-262143', '262144-327679', '262144-278527', '278528-294911', '294912-311295', '311296-327679',
  ]);
});
