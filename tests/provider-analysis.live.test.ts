import { expect, it } from 'vitest';
import { resolveAudioStream } from '../src/api/innertube';
import { googleAudioSize, writeAudioChunks } from '../src/api/chunkedAudio';

// Opt-in: verify full media bytes, without printing signed URLs or session tokens.
it.skipIf(process.env.LINER_PROVIDER_DIAG !== '1')('reads complete reported recordings and checks native-style HTTP requests', async () => {
  const tracks = [
    { id: 'lQUvn6nFqq0', title: 'Hobby + Gestão Inteligente', artists: 'Ryu, the Runner, Jovem Dex', durationMs: 178000 },
    { id: 'ypQjv_W424E', title: 'ESCRAVO MODERNO', artists: 'Leviano', durationMs: 0 },
    { id: 'qiasDFc7o5Y', title: 'PRÓXIMO CAPÍTULO', artists: 'Ryu, the Runner, Neckklace', durationMs: 132000 },
  ];
  for (const track of tracks) {
    const url = await resolveAudioStream(track.id, track.title, track.artists, { durationMs: track.durationMs, forceRefresh: true });
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'AndroidXMedia3/1.9.0', Range: 'bytes=0-' } });
    const reader = response.body?.getReader();
    const first = await reader?.read();
    await reader?.cancel();
    console.info('Native-style media response', { id: track.id, title: track.title, status: response.status, client: new URL(url).searchParams.get('c'), itag: new URL(url).searchParams.get('itag') });
    expect(response.ok, track.title).toBe(true);
    expect(first?.value?.length).toBeGreaterThan(0);
    const size = googleAudioSize(url);
    expect(size).toBeGreaterThan(0);
    let received = 0;
    let signature = '';
    await writeAudioChunks(url, size!, async bytes => {
      if (!received) signature = String.fromCharCode(...bytes.slice(4, 8));
      received += bytes.length;
    }, AbortSignal.timeout(60000));
    expect(received).toBe(size);
    expect(signature).toBe('ftyp');
    console.info('Complete bounded transfer', { id: track.id, bytes: received, container: signature });
  }
}, 150000);
