import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../src/types";
import type { PlaybackStatus } from "../src/player/audioManager";

const harness = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  status: null as null | ((status: PlaybackStatus) => void),
  nativeChange: null as null | ((track: Track) => void),
  activeId: "",
  hasPlayer: false,
  resolve: vi.fn(),
  setItem: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  seek: vi.fn(),
  upcoming: vi.fn(),
  skip: vi.fn(),
  load: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  multiGet: async (keys: string[]) => keys.map((key) => [key, harness.storage.get(key) ?? null]),
  setItem: (...args: unknown[]) => harness.setItem(...args),
} }));
vi.mock("../src/api/innertube", () => ({ resolveAudioStream: (...args: unknown[]) => harness.resolve(...args), fetchLyrics: async () => [], isAbortError: (error: unknown) => error instanceof Error && error.name === 'AbortError', clearApiCaches: vi.fn() }));
vi.mock("../src/player/prepareSource", () => ({ preparePlaybackSource: (...args: unknown[]) => harness.prepare(...args), originalPlaybackSource: (url: string) => url, discardPreparedSource: vi.fn() }));
vi.mock("../src/library/useDeviceLibraryStore", () => ({ getPlaybackTrack: (track: Track) => track }));
vi.mock("../src/player/audioManager", () => ({ audioManager: {
  get hasPlayer() { return harness.hasPlayer; },
  get currentTrackId() { return harness.activeId; },
  loadAndPlay: (...args: unknown[]) => harness.load(...args),
  stop: () => { harness.hasPlayer = false; },
  pause: () => harness.pause(), resume: () => harness.resume(), seekTo: (position: number) => harness.seek(position),
  setUpcoming: (...args: unknown[]) => harness.upcoming(...args), skipToTrack: (id: string) => harness.skip(id),
  setVolume: vi.fn(), setPlaybackRate: vi.fn(), setRepeatOne: vi.fn(),
  retainTracks: vi.fn(),
} }));

const track = (id: string): Track => ({ id, title: `Música ${id}`, artists: "Artista", coverUrl: "", durationMs: 120_000 });
const a = track("a"), b = track("b"), c = track("c"), d = track("d");
type StoreModule = typeof import("../src/player/usePlayerStore");
let module: StoreModule;
const state = () => module.usePlayerStore.getState();

function status(overrides: Partial<PlaybackStatus> = {}): void {
  harness.status?.({ trackId: harness.activeId, playing: true, isLoaded: true, isBuffering: false,
    currentTime: 0, duration: 120, didJustFinish: false, error: null, ...overrides });
}

async function settle(): Promise<void> { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); harness.storage.clear(); harness.hasPlayer = false; harness.status = null; harness.nativeChange = null;
  harness.setItem.mockImplementation(async (key: string, value: string) => { harness.storage.set(key, value); });
  harness.resolve.mockImplementation(async (id: string) => `https://audio.test/${id}.mp3`);
  harness.prepare.mockImplementation(async (url: string) => url);
  harness.seek.mockResolvedValue(undefined); harness.upcoming.mockResolvedValue(undefined); harness.skip.mockReturnValue(false);
  harness.load.mockImplementation(async (_url: string, next: Track, callback: (value: PlaybackStatus) => void, options: { onTrackChange: (next: Track) => void }) => {
    harness.hasPlayer = true; harness.activeId = next.id; harness.status = callback; harness.nativeChange = options.onTrackChange; status();
  });
  module = await import("../src/player/usePlayerStore");
});

afterEach(async () => { await module.flushPlayerPersistence(); vi.useRealTimers(); });

describe("mobile playback", () => {
  it("ignores an older resolver and its late failure when a different track starts", async () => {
    await state().loadSavedData();
    let rejectFirst!: (reason: Error) => void;
    harness.resolve.mockImplementationOnce(() => new Promise<string>((_resolve, reject) => { rejectFirst = reject; }));
    const first = state().playTrack(a, [a, b]);
    await settle();
    await state().playTrack(b, [a, b]);
    rejectFirst(new Error("Resposta antiga"));
    await first;
    expect(state().currentTrack?.id).toBe("b"); expect(state().error).toBeNull();
    expect(harness.load).toHaveBeenCalledTimes(1);
  });

  it("ignores old native status events after the next track begins", async () => {
    await state().playTrack(a, [a, b]);
    const staleStatus = harness.status!;
    await state().playTrack(b, [a, b]);
    staleStatus({ trackId: "a", playing: false, isLoaded: false, isBuffering: false, currentTime: 60, duration: 120, didJustFinish: false, error: "Antigo" });
    expect(state().currentTrack?.id).toBe("b"); expect(state().error).toBeNull(); expect(state().positionMs).toBe(0);
  });

  it("ends a finite queue once instead of wrapping forever", async () => {
    await state().playTrack(b, [a, b]);
    status({ currentTime: 120, playing: false, didJustFinish: true });
    await settle();
    expect(state().currentTrack?.id).toBe("b"); expect(state().isPlaying).toBe(false);
    expect(state().positionMs).toBe(120_000); expect(harness.load).toHaveBeenCalledTimes(1);
  });

  it("cycles repeat off, all, one and wraps all only at the logical queue end", async () => {
    await state().playTrack(b, [a, b]);
    state().toggleRepeat(); expect(state().repeatMode).toBe("all");
    status({ currentTime: 120, playing: false, didJustFinish: true });
    await settle(); expect(state().currentTrack?.id).toBe("a");
    state().toggleRepeat(); expect(state().repeatMode).toBe("one");
    status({ currentTime: 120, playing: false, didJustFinish: true }); await settle();
    expect(state().currentTrack?.id).toBe("a"); expect(harness.seek).toHaveBeenLastCalledWith(0);
    state().toggleRepeat(); expect(state().repeatMode).toBe("off"); expect(state().repeat).toBe(false);
  });

  it("visits every track once in shuffle and follows playback history for Previous", async () => {
    await state().playTrack(a, [a, b, c, d]); state().toggleShuffle();
    const ids = [state().currentTrack!.id];
    for (let index = 0; index < 3; index++) { await state().nextTrack(); ids.push(state().currentTrack!.id); }
    expect(new Set(ids).size).toBe(4);
    await state().nextTrack(); expect(state().currentTrack?.id).toBe(ids[3]);
    await state().prevTrack(); expect(state().currentTrack?.id).toBe(ids[2]);
    await state().nextTrack(); expect(state().currentTrack?.id).toBe(ids[3]);
  });

  it("updates song, recents, queue index and lyrics after notification Next", async () => {
    await state().playTrack(a, [a, b, c]);
    harness.activeId = "b"; harness.nativeChange?.(b); status({ trackId: "b", currentTime: 4 });
    await settle();
    expect(state().currentTrack?.id).toBe("b"); expect(state().currentIndex).toBe(1);
    expect(state().recentTracks[0].id).toBe("b"); expect(state().positionMs).toBe(4000);
    expect(harness.upcoming).toHaveBeenLastCalledWith([c], expect.any(Function));
  });

  it("plays local files directly and clamps seek, volume and speed", async () => {
    await state().playTrack({ ...a, source: "local", streamUrl: "file:///music/a.mp3" });
    expect(harness.resolve).not.toHaveBeenCalled(); expect(harness.load.mock.calls[0][0]).toBe("file:///music/a.mp3");
    await state().seekTo(999_999); expect(state().positionMs).toBe(120_000);
    state().setVolume(-5); state().setPlaybackRate(99); state().setLyricsOffsetMs(-99_000);
    expect(state().volume).toBe(0); expect(state().playbackRate).toBe(2); expect(state().lyricsOffsetMs).toBe(-30_000);
  });

  it("shows playback failure and retries with a fresh resolution", async () => {
    harness.resolve.mockRejectedValueOnce(new Error("Sem conexão"));
    await state().playTrack(a);
    expect(state().error).toBe("Sem conexão"); expect(state().isLoading).toBe(false);
    await state().retryPlayback();
    expect(state().isPlaying).toBe(true); expect(state().error).toBeNull();
    expect(harness.resolve.mock.calls.at(-1)?.[3]).toMatchObject({ forceRefresh: true });
  });

  it("pauses at timer expiry and at the end of the selected track", async () => {
    vi.useFakeTimers();
    await state().playTrack(a, [a, b]);
    state().setSleepTimer(1); expect(state().sleepTimerEndAt).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state().isPlaying).toBe(false); expect(state().sleepTimerEndAt).toBeNull();
    await state().togglePlayPause(); state().setSleepAtEndOfTrack(true);
    status({ playing: false, didJustFinish: true, currentTime: 120 });
    expect(state().currentTrack?.id).toBe("a"); expect(state().sleepAtEndOfTrack).toBe(false);
  });
});

describe("library and queue durability", () => {
  it("supports queue insertion, order and removal without losing the selected song", async () => {
    await state().playTrack(a, [a, b, c]);
    state().playNext(c); expect(state().queue.map((item) => item.id)).toEqual(["a", "c", "b"]);
    state().addToQueue(c); expect(state().queue).toHaveLength(3);
    state().moveQueueTrack(0, 2); expect(state().currentIndex).toBe(2);
    state().removeFromQueue(0); expect(state().currentTrack?.id).toBe("a"); expect(state().currentIndex).toBe(1);
    state().clearQueue(); expect(state().queue).toEqual([a]);
  });

  it("stores complete liked tracks and edits playlists with duplicate prevention", async () => {
    await state().loadSavedData(); state().toggleLike(a); expect(state().likedTracks).toEqual([a]);
    const id = state().createPlaylist("  Viagem  ", [a, a, b]);
    expect(state().playlists[0].name).toBe("Viagem"); expect(state().playlists[0].tracks).toEqual([a, b]);
    expect(state().addTrackToPlaylist(id, a)).toBe(false); expect(state().addTrackToPlaylist(id, c)).toBe(true);
    state().renamePlaylist(id, "Estrada"); state().movePlaylistTrack(id, 2, 0);
    state().removeTrackFromPlaylist(id, "b");
    await module.flushPlayerPersistence();
    const saved = JSON.parse(harness.storage.get("@liner_player_v2")!);
    expect(saved.playlists[0].tracks.map((item: Track) => item.id)).toEqual(["c", "a"]);
    expect(saved.likedTracks[0].title).toBe(a.title);
    state().deletePlaylist(id); expect(state().playlists).toHaveLength(0);
  });

  it("migrates legacy liked IDs through recent full tracks and preserves unknown IDs", async () => {
    harness.storage.set("@liner_liked_tracks", JSON.stringify(["a", "unknown"]));
    harness.storage.set("@liner_recent_tracks", JSON.stringify([a, b]));
    await state().loadSavedData(); await module.flushPlayerPersistence();
    expect(state().likedTrackIds).toEqual(["a", "unknown"]); expect(state().likedTracks[0].id).toBe("a");
    expect(harness.storage.has("@liner_player_v2")).toBe(true);
  });

  it("restores the selected session paused and filters malformed saved tracks", async () => {
    harness.storage.set("@liner_player_v2", JSON.stringify({ version: 2, queue: [a, { id: "bad" }, b], currentTrackId: "b", positionMs: 13_000,
      volume: -100, playbackRate: 800, repeatMode: "wrong" }));
    await state().loadSavedData();
    expect(state().queue.map((item) => item.id)).toEqual(["a", "b"]); expect(state().currentTrack?.id).toBe("b");
    expect(state().positionMs).toBe(13_000); expect(state().isPlaying).toBe(false); expect(harness.load).not.toHaveBeenCalled();
    expect(state().volume).toBe(0); expect(state().playbackRate).toBe(2); expect(state().repeatMode).toBe("off");
  });

  it("keeps corrupt stored data and exposes a recoverable error", async () => {
    harness.storage.set("@liner_player_v2", "{not json");
    await state().loadSavedData();
    expect(state().hydrated).toBe(true); expect(state().error).toContain("carregar");
    expect(harness.setItem).not.toHaveBeenCalled(); expect(harness.storage.get("@liner_player_v2")).toBe("{not json");
  });

  it("preserves edits made before hydration completes", async () => {
    harness.storage.set("@liner_player_v2", JSON.stringify({ version: 2, playlists: [{ id: "old", name: "Antiga", tracks: [a] }], likedTracks: [b] }));
    state().createPlaylist("Nova", [c]); state().toggleLike(d); state().setVolume(0.4);
    await state().loadSavedData(); await module.flushPlayerPersistence();
    expect(state().playlists.map((item) => item.name)).toEqual(["Nova", "Antiga"]);
    expect(state().likedTracks.map((item) => item.id)).toEqual(["d", "b"]); expect(state().volume).toBe(0.4);
  });

  it("serializes storage writes and reports a full disk", async () => {
    await state().loadSavedData();
    let finishFirst!: () => void;
    harness.setItem.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    state().createPlaylist("Primeira"); state().createPlaylist("Segunda");
    await settle(); expect(harness.setItem).toHaveBeenCalledTimes(1);
    finishFirst(); await module.flushPlayerPersistence(); expect(harness.setItem).toHaveBeenCalledTimes(2);
    harness.setItem.mockRejectedValueOnce(new Error("Disk full"));
    state().toggleLike(a); await module.flushPlayerPersistence(); expect(state().error).toContain("salvar");
  });

  it("merges backup playlists and likes by ID without duplicate songs", async () => {
    await state().loadSavedData(); const id = state().createPlaylist("Casa", [a]);
    state().importLibraryData({ likedTracks: [a, a], playlists: [{ id, name: "Importada", tracks: [a, b], createdAt: 1, updatedAt: 1 }] });
    expect(state().likedTracks).toHaveLength(1); expect(state().playlists).toHaveLength(1);
    expect(state().playlists[0].name).toBe("Casa"); expect(state().playlists[0].tracks.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

it('re-resolves a failed native stream once without reusing its failed URL', async () => {
 harness.load.mockRejectedValueOnce(new Error('Native decoder failed'));
 await module.usePlayerStore.getState().playTrack(a, [a,b]);
 expect(harness.load).toHaveBeenCalledTimes(2);
 expect(harness.resolve.mock.calls[1][3]).toMatchObject({forceRefresh:true,excludeUrls:['https://audio.test/a.mp3']});
 expect(module.usePlayerStore.getState().error).toBeNull();
});

it('refreshes a failed prefetched song once after native skip', async () => {
 await state().playTrack(a, [a,b]);
 harness.activeId = 'b'; harness.nativeChange?.(b);
 status({ trackId: 'b', error: 'Source error', sourceUrl: 'https://audio.test/expired-b.mp3' });
 await vi.waitFor(() => expect(harness.resolve).toHaveBeenCalledWith('b', b.title, b.artists, expect.objectContaining({ forceRefresh: true, excludeUrls: ['https://audio.test/expired-b.mp3'] })));
 await vi.waitFor(() => expect(state().isPlaying).toBe(true));
 expect(state().currentTrack?.id).toBe('b');
 const calls = harness.resolve.mock.calls.length;
 status({ trackId: 'b', error: 'Source error again' });
 await settle();
 expect(harness.resolve).toHaveBeenCalledTimes(calls);
 expect(state().error).toBe('Source error again');
});

it('prepares the full source before giving it to native playback and retries a failed transfer with another source', async () => {
  harness.prepare.mockRejectedValueOnce(new Error('Trecho bloqueado')).mockResolvedValueOnce('file:///cache/complete.m4a');
  harness.resolve.mockResolvedValueOnce('https://audio.test/first').mockResolvedValueOnce('https://audio.test/second');
  await state().playTrack(a, [a]);
  expect(harness.resolve).toHaveBeenNthCalledWith(2, 'a', a.title, a.artists, expect.objectContaining({ forceRefresh: true, excludeUrls: ['https://audio.test/first'] }));
  expect(harness.load).toHaveBeenCalledTimes(1);
  expect(harness.load.mock.calls[0][0]).toBe('file:///cache/complete.m4a');
  expect(state().isPlaying).toBe(true);
});

it('preserves playback intent when the first native load emits an error before its retry', async () => {
  harness.load.mockImplementationOnce(async (_url: string, track: Track, callback: (status: PlaybackStatus) => void) => {
    callback({ trackId: track.id, playing: false, isLoaded: false, isBuffering: false, currentTime: 0, duration: 120, didJustFinish: false, error: 'Source error' });
    throw new Error('Source error');
  });
  await state().playTrack(a, [a]);
  expect(harness.load).toHaveBeenCalledTimes(2);
  expect(state().isPlaying).toBe(true); expect(state().error).toBeNull();
  expect(harness.pause).not.toHaveBeenCalled();
});

it('allows another recovery only after the previously repaired source advances', async () => {
  await state().playTrack(a, [a]);
  status({ currentTime: 20 });
  status({ currentTime: 20, error: 'Source error', sourceUrl: 'https://audio.test/old.mp3' });
  await vi.waitFor(() => expect(harness.load).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(state().isPlaying).toBe(true));
  status({ currentTime: 24 });
  status({ currentTime: 24, error: 'Next source error', sourceUrl: 'https://audio.test/expired-again.mp3' });
  await vi.waitFor(() => expect(harness.load).toHaveBeenCalledTimes(3));
  expect(state().error).toBeNull();
});

it('a retry waiting on native initialization cannot replace a newer track selection', async () => {
  // The native manager is already mocked; add a deferred initialization for this retry.
  const { audioManager } = await import('../src/player/audioManager');
  let ready!: () => void;
  Object.assign(audioManager, { recoverEngine: vi.fn(() => new Promise<void>(resolve => { ready = resolve; })) });
  await state().playTrack(a, [a, b]);
  const retry = state().retryPlayback(); await settle();
  await state().playTrack(b, [a, b]); ready(); await retry;
  expect(state().currentTrack?.id).toBe('b');
});
