import { expect, it } from 'vitest';
import { fetchLyrics, resolveAudioStream, searchTracks } from '../src/api/innertube';

// Explicit opt-in: provider access depends on the current network, region and account.
it.skipIf(process.env.LINER_LIVE_TEST !== '1')('searches the live catalog and resolves the selected recording', async () => {
  const tracks = await searchTracks('Rick Astley Never Gonna Give You Up');
  expect(tracks.length).toBeGreaterThan(0);
  const track = tracks[0];
  console.info('Live catalog:', { id: track.id, title: track.title, artists: track.artists, durationMs: track.durationMs });
  expect(track.durationMs).toBeGreaterThan(0);
  const stream = await resolveAudioStream(track.id, track.title, track.artists, { durationMs: track.durationMs });
  expect(new URL(stream).protocol).toBe('https:');
  // Deliberately omit signed audio URLs from logs.
  console.info('Live audio provider:', new URL(stream).hostname);
  const lyrics = await fetchLyrics('Never Gonna Give You Up', 'Rick Astley');
  expect(lyrics.length).toBeGreaterThan(0);
  console.info('Live lyrics:', { lines: lyrics.length, synced: lyrics[0].synced });
}, 90000);
