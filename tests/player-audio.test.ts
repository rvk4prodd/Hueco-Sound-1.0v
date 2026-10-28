import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../src/types";

const native = vi.hoisted(() => ({ create: vi.fn(), mode: vi.fn(), environment: "bare", players: [] as FakePlaylist[], aux: [] as FakeDeck[] }));

interface NativeEvent { currentIndex: number; playing: boolean; isLoaded: boolean; isBuffering: boolean; currentTime: number; duration: number; didJustFinish: boolean; error?: unknown; }
class FakePlaylist {
  currentIndex = 0; isLoaded = false; volume = 1; playbackRate = 1; loop = "none";
  get currentStatus() { return { currentIndex: this.currentIndex, isLoaded: this.isLoaded }; }
  sources: string[];
  events = new Map<string, ((event: any) => void)[]>();
  subscriptionsRemoved = 0;
  play = vi.fn(); pause = vi.fn(); destroy = vi.fn(); release = vi.fn(); seekTo = vi.fn(async () => {});
  clearLockScreenControls = vi.fn(); setActiveForLockScreen = vi.fn();
  constructor(sources: string[]) { this.sources = [...sources]; }
  addListener(name: string, listener: (event: any) => void) {
    this.events.set(name, [...(this.events.get(name) || []), listener]);
    return { remove: () => { this.subscriptionsRemoved++; this.events.set(name, this.events.get(name)!.filter((item) => item !== listener)); } };
  }
  add(source: { uri: string }) { if (!source || typeof source.uri !== "string") throw new Error("Native AudioSource must be a record"); this.sources.push(source.uri); }
  remove(index: number) {
    this.sources.splice(index, 1);
    if (index < this.currentIndex) { const previousIndex = this.currentIndex; this.currentIndex--; this.emit("trackChanged", { currentIndex: this.currentIndex, previousIndex }); }
  }
  skipTo(index: number) { const previousIndex = this.currentIndex; this.currentIndex = index; this.emit("trackChanged", { currentIndex: index, previousIndex }); }
  emit(name: string, data: unknown) { this.events.get(name)?.forEach((callback) => callback(data)); }
  ready(overrides: Partial<NativeEvent> = {}) {
    this.isLoaded = true;
    this.emit("playlistStatusUpdate", { currentIndex: this.currentIndex, playing: true, isLoaded: true, isBuffering: false,
      currentTime: 0, duration: 120, didJustFinish: false, ...overrides });
  }
}
class FakeDeck {
  isLoaded = false; volume = 0; playbackRate = 1; currentTime = 0;
  play = vi.fn(); pause = vi.fn(); release = vi.fn(); remove = vi.fn();
  seekTo = vi.fn(async (seconds: number) => { this.currentTime = seconds; });
  listeners = new Set<(status: { isLoaded: boolean; error?: string }) => void>();
  addListener(_name: string, listener: (status: { isLoaded: boolean; error?: string }) => void) {
    this.listeners.add(listener); return { remove: () => this.listeners.delete(listener) };
  }
  ready() { this.isLoaded = true; this.listeners.forEach(fn => fn({ isLoaded: true })); }
}

vi.mock("expo", () => ({ isRunningInExpoGo: () => native.environment === "storeClient" }));
vi.mock("expo-audio", () => ({ createAudioPlayer: () => { const deck = new FakeDeck(); native.aux.push(deck); return deck; }, createAudioPlaylist: (...args: unknown[]) => native.create(...args), setAudioModeAsync: (...args: unknown[]) => native.mode(...args) }));
const a: Track = { id: "a", title: "Primeira", artists: "Artista", coverUrl: "https://image.test/a.jpg", durationMs: 120000 };
const b = { ...a, id: "b", title: "Segunda" }, c = { ...a, id: "c", title: "Terceira" }, d = { ...a, id: "d", title: "Quarta" };
let AudioManager: typeof import("../src/player/audioManager").AudioManager;

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); native.environment = "bare"; native.players = []; native.aux = []; native.mode.mockResolvedValue(undefined);
  native.create.mockImplementation((options: { sources: string[] }) => { const player = new FakePlaylist(options.sources); native.players.push(player); return player; });
  AudioManager = (await import("../src/player/audioManager")).AudioManager;
});
afterEach(() => { vi.useRealTimers(); });

async function start(manager: InstanceType<typeof AudioManager>, track = a, changed: (track: Track) => void = vi.fn()) {
  const updates = vi.fn();
  const pending = manager.loadAndPlay(`https://audio.test/${track.id}`, track, updates, { volume: 0.7, playbackRate: 1.25, loopOne: false, onTrackChange: changed });
  await Promise.resolve(); await Promise.resolve();
  const player = native.players.at(-1)!;
  player.ready(); await pending;
  return { player, updates, changed };
}

describe("native audio lifecycle", () => {
  it("configures audio focus/background playback and publishes notification metadata", async () => {
    const manager = new AudioManager(); const { player } = await start(manager);
    expect(native.mode).toHaveBeenCalledWith(expect.objectContaining({ shouldPlayInBackground: true, interruptionMode: "doNotMix", allowsRecording: false }));
    expect(player.setActiveForLockScreen).toHaveBeenCalledWith(true, expect.objectContaining({ title: a.title, artist: a.artists, artworkUrl: a.coverUrl }), { showNextTrack: true, showPreviousTrack: true });
    expect(player.volume).toBe(0.7); expect(player.playbackRate).toBe(1.25);
    manager.stop(); expect(player.pause).toHaveBeenCalled(); expect(player.destroy).toHaveBeenCalled(); expect(player.release).toHaveBeenCalled();
    expect(player.clearLockScreenControls).toHaveBeenCalled(); expect(player.subscriptionsRemoved).toBe(2);
  });

  it("invalidates an obsolete native load when a newer request wins", async () => {
    const manager = new AudioManager();
    let readyMode!: () => void;
    native.mode.mockImplementationOnce(() => new Promise<void>((resolve) => { readyMode = resolve; }));
    const first = manager.loadAndPlay("a.mp3", a, vi.fn(), { volume: 1, playbackRate: 1, loopOne: false, onTrackChange: vi.fn() });
    const second = manager.loadAndPlay("b.mp3", b, vi.fn(), { volume: 1, playbackRate: 1, loopOne: false, onTrackChange: vi.fn() });
    readyMode(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(native.create).toHaveBeenCalledTimes(1); expect(native.players[0].sources).toEqual(["b.mp3"]);
    native.players[0].ready(); await Promise.all([first, second]); manager.stop();
  });

  it("stops and frees a stalled native player after its load timeout", async () => {
    vi.useFakeTimers();
    const manager = new AudioManager();
    const pending = manager.loadAndPlay("a.mp3", a, vi.fn(), { volume: 1, playbackRate: 1, loopOne: false, onTrackChange: vi.fn() });
    const result = expect(pending).rejects.toThrow("demorou demais");
    await vi.advanceTimersByTimeAsync(30_001); await result;
    expect(manager.hasPlayer).toBe(false); expect(native.players[0].destroy).toHaveBeenCalled(); expect(native.players[0].release).toHaveBeenCalled();
  });

  it("rejects the real native playback error and releases the player", async () => {
    const manager = new AudioManager();
    const pending = manager.loadAndPlay("a.mp3", a, vi.fn(), { volume: 1, playbackRate: 1, loopOne: false, onTrackChange: vi.fn() });
    const result = expect(pending).rejects.toThrow("Fonte indisponível");
    await Promise.resolve(); await Promise.resolve();
    native.players[0].ready({ isLoaded: false, error: { message: "Fonte indisponível", code: 403 } });
    await result; expect(manager.hasPlayer).toBe(false);
  });

  it("updates metadata and store once when the native notification advances", async () => {
    const manager = new AudioManager(); const { player, changed, updates } = await start(manager);
    await manager.setUpcoming([b, c, d], async (track) => `${track.id}.mp3`);
    expect(player.sources).toEqual(["https://audio.test/a", "b.mp3", "c.mp3"]);
    player.skipTo(1); player.ready();
    expect(changed).toHaveBeenCalledExactlyOnceWith(b);
    expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({ trackId: "b" }));
    expect(player.setActiveForLockScreen).toHaveBeenLastCalledWith(true, expect.objectContaining({ title: "Segunda" }), expect.anything());
    manager.stop();
  });

  it("does not append stale prefetched tracks after a queue edit", async () => {
    const manager = new AudioManager(); const { player } = await start(manager);
    let resolveOld!: (url: string) => void;
    const old = manager.setUpcoming([b], () => new Promise((resolve) => { resolveOld = resolve; }));
    await manager.setUpcoming([d], async () => "d.mp3");
    resolveOld("b.mp3"); await old;
    expect(player.sources).toEqual(["https://audio.test/a", "d.mp3"]); manager.stop();
  });

  it("drops an obsolete in-flight URL when a native transition rebuilds the upcoming window", async () => {
    const manager = new AudioManager(); let nextResolve!: (url: string) => void;
    const { player } = await start(manager, a, () => { void manager.setUpcoming([d], async () => "d.mp3"); });
    const old = manager.setUpcoming([b, c], async (track) => track.id === "b" ? "b.mp3" : new Promise((resolve) => { nextResolve = resolve; }));
    await Promise.resolve(); await Promise.resolve();
    player.skipTo(1); await Promise.resolve();
    nextResolve("c.mp3"); await old;
    expect(player.sources).toEqual(["https://audio.test/a", "b.mp3", "d.mp3"]); manager.stop();
  });

  it("removes deleted native history without replaying or resetting the current track", async () => {
    const manager = new AudioManager(); const { player, changed } = await start(manager);
    await manager.setUpcoming([b, c], async (track) => `${track.id}.mp3`); player.skipTo(1);
    vi.mocked(changed).mockClear(); manager.retainTracks(new Set(["b", "c"]));
    expect(player.sources).toEqual(["b.mp3", "c.mp3"]); expect(player.currentIndex).toBe(0);
    expect(changed).not.toHaveBeenCalled(); expect(manager.skipToTrack("a")).toBe(false); manager.stop();
  });
});

it('keeps Expo Go audio usable without binding an unavailable app service', async () => {
 native.environment='storeClient';
 const manager=new AudioManager();const {player}=await start(manager);
 expect(player.setActiveForLockScreen).not.toHaveBeenCalled();
 expect(native.mode).toHaveBeenCalledWith(expect.objectContaining({shouldPlayInBackground:false}));
 expect(player.play).toHaveBeenCalled();manager.stop();
});

it('fades the entrance and leaves the outgoing volume to the dual deck', async () => {
  const manager = new AudioManager();
  manager.configureTransition('fade', 3, 'linear');
  const { player } = await start(manager);
  expect(player.volume).toBe(0);
  player.ready({ currentTime: 1.5 });
  expect(player.volume).toBeCloseTo(.35);
  player.ready({ currentTime: 60 });
  expect(player.volume).toBeCloseTo(.7);
  player.ready({ currentTime: 118.5 });
  expect(player.volume).toBeCloseTo(.7);
  manager.setVolume(.4);
  expect(player.volume).toBeCloseTo(.4);
  manager.configureTransition('direct', 3, 'linear');
  expect(player.volume).toBeCloseTo(.4);
  manager.stop();
});

it('starts the next native track with the incoming fade instead of a full-volume burst', async () => {
  const manager = new AudioManager();
  manager.configureTransition('fade', 2, 'smooth');
  const { player } = await start(manager);
  player.ready({ currentTime: 50 });
  expect(player.volume).toBe(.7);
  await manager.setUpcoming([b], async () => 'b.mp3');
  manager.skipToTrack('b');
  expect(player.volume).toBe(0);
  player.ready({ currentTime: 1 });
  expect(player.volume).toBeCloseTo(.7 * Math.SQRT1_2);
  manager.stop();
});

describe('dual deck transitions', () => {
  it('can complete through native status events without a JavaScript timer tick', async () => {
    vi.useFakeTimers();
    const manager = new AudioManager(); await start(manager);
    await manager.setUpcoming([b], async () => 'b.mp3');
    const preparing = manager.prepareAuxTrack(b, 'b.mp3'); const deck = native.aux[0]; deck.ready(); await preparing;
    const handedOver = vi.fn(); await manager.executeCrossfade(b, 2, 'linear', 0, handedOver);
    deck.currentTime = 2.1; deck.ready();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(handedOver).toHaveBeenCalledExactlyOnceWith(true); manager.stop();
  });
  it('mirrors notification or Bluetooth pause and resume to the incoming deck', async () => {
    vi.useFakeTimers();
    const manager = new AudioManager(); const { player } = await start(manager);
    const preparing = manager.prepareAuxTrack(b, 'b.mp3'); const deck = native.aux[0]; deck.ready(); await preparing;
    await manager.executeCrossfade(b, 2, 'linear', 0, vi.fn());
    player.ready({ playing: false, currentTime: 110 });
    expect(deck.pause).toHaveBeenCalled();
    const previousPlays = deck.play.mock.calls.length;
    player.ready({ playing: true, currentTime: 110 });
    expect(deck.play).toHaveBeenCalledTimes(previousPlays + 1); manager.stop();
  });
  it('waits for native readiness before seeking and frees a failed preparation for retry', async () => {
    vi.useFakeTimers();
    const manager = new AudioManager(); await start(manager);
    const preparing = manager.prepareAuxTrack(b, 'b.mp3', 12.5), deck = native.aux[0];
    expect(deck.seekTo).not.toHaveBeenCalled();
    deck.ready(); expect(await preparing).toBe(true); expect(deck.seekTo).toHaveBeenCalledWith(12.5);
    const failed = manager.prepareAuxTrack(c, 'c.mp3');
    await vi.advanceTimersByTimeAsync(8001); expect(await failed).toBe(false);
    const retried = manager.prepareAuxTrack(c, 'fresh-c.mp3');
    native.aux.at(-1)!.ready(); expect(await retried).toBe(true);
    manager.stop();
  });
  it('does not seek or start an obsolete deck after stopping', async () => {
    const manager = new AudioManager(); await start(manager);
    const pending = manager.prepareAuxTrack(b, 'b.mp3', 20), deck = native.aux[0];
    manager.stop(); deck.ready(); expect(await pending).toBe(false);
    expect(deck.seekTo).not.toHaveBeenCalled(); expect(deck.play).not.toHaveBeenCalled();
  });
  it('freezes the mix while paused and follows incoming audio time on resume', async () => {
    vi.useFakeTimers();
    const manager = new AudioManager(); const { player, changed } = await start(manager);
    await manager.setUpcoming([b], async () => 'b.mp3');
    const preparing = manager.prepareAuxTrack(b, 'b.mp3'); const deck = native.aux[0]; deck.ready(); await preparing;
    const handedOver = vi.fn(); await manager.executeCrossfade(b, 2, 'linear', 0, handedOver);
    deck.currentTime = 1; await vi.advanceTimersByTimeAsync(25);
    expect(player.volume).toBeCloseTo(.35); expect(deck.volume).toBeCloseTo(.35);
    manager.pause(); await vi.advanceTimersByTimeAsync(15000);
    expect(handedOver).not.toHaveBeenCalled(); expect(manager.activelyCrossfading).toBe(true);
    manager.resume(); deck.currentTime = 2.1; await vi.advanceTimersByTimeAsync(25);
    expect(handedOver).toHaveBeenCalledExactlyOnceWith(true);
    expect(player.seekTo).toHaveBeenCalledWith(2.1); expect(changed).not.toHaveBeenCalled();
    expect(player.volume).toBeCloseTo(.7); manager.stop();
  });
  it('abandons a stalled incoming deck and restores the primary volume', async () => {
    vi.useFakeTimers();
    const manager = new AudioManager(); const { player } = await start(manager);
    const preparing = manager.prepareAuxTrack(b, 'b.mp3'); native.aux[0].ready(); await preparing;
    const handedOver = vi.fn(); await manager.executeCrossfade(b, 2, 'linear', 0, handedOver);
    await vi.advanceTimersByTimeAsync(8100);
    expect(handedOver).toHaveBeenCalledExactlyOnceWith(false);
    expect(player.volume).toBeCloseTo(.7); expect(manager.activelyCrossfading).toBe(false); manager.stop();
  });
  it('cannot finish an old handover after the user skips again', async () => {
    vi.useFakeTimers();
    const manager = new AudioManager(); const { player } = await start(manager);
    await manager.setUpcoming([b, c], async t => t.id + '.mp3');
    const preparing = manager.prepareAuxTrack(b, 'b.mp3'); const deck = native.aux[0]; deck.ready(); await preparing;
    let completeSeek!: () => void;
    player.seekTo.mockImplementationOnce(() => new Promise<void>(resolve => { completeSeek = resolve; }));
    const handedOver = vi.fn(); await manager.executeCrossfade(b, 2, 'linear', 0, handedOver);
    deck.currentTime = 2.1; await vi.advanceTimersByTimeAsync(25);
    manager.skipToTrack('c'); completeSeek(); await vi.advanceTimersByTimeAsync(25);
    expect(handedOver).not.toHaveBeenCalled(); expect(manager.currentTrackId).toBe('c'); manager.stop();
  });
});

it('reports a non-advancing source once and does not mistake pause for a stall', async () => {
  vi.useFakeTimers();
  const manager = new AudioManager(); const { player, updates } = await start(manager);
  player.ready({ currentTime: 20 }); await vi.advanceTimersByTimeAsync(11000);
  expect(updates.mock.calls.some(([value]) => value.error)).toBe(false);
  manager.pause(); await vi.advanceTimersByTimeAsync(20000);
  expect(updates.mock.calls.some(([value]) => value.error)).toBe(false);
  manager.resume(); player.ready({ currentTime: 21 }); await vi.advanceTimersByTimeAsync(12500);
  expect(updates.mock.calls.filter(([value]) => value.error)).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(20000);
  expect(updates.mock.calls.filter(([value]) => value.error)).toHaveLength(1); manager.stop();
});

it('does not apply a second entrance fade after a short dual deck transition', async () => {
  vi.useFakeTimers();
  const manager = new AudioManager(); manager.configureTransition('fade', 8, 'linear');
  const { player } = await start(manager); await manager.setUpcoming([b], async () => 'b.mp3');
  const preparing = manager.prepareAuxTrack(b, 'b.mp3'); const deck = native.aux[0]; deck.ready(); await preparing;
  const handedOver = vi.fn(); await manager.executeCrossfade(b, 1, 'linear', 0, handedOver);
  deck.currentTime = 1.1; await vi.advanceTimersByTimeAsync(25);
  expect(handedOver).toHaveBeenCalledExactlyOnceWith(true);
  expect(player.volume).toBeCloseTo(.7); manager.stop();
});

it('escapes a native seek that never settles during the fourth song handover', async () => {
  vi.useFakeTimers();
  const manager = new AudioManager(); const { player } = await start(manager);
  for (const next of [b, c, d]) {
    await manager.setUpcoming([next], async t => t.id + '.mp3');
    const preparing = manager.prepareAuxTrack(next, next.id + '.mp3'); const deck = native.aux.at(-1)!;
    deck.ready(); await preparing;
    if (next === d) player.seekTo.mockImplementationOnce(() => new Promise<void>(() => {}));
    const handedOver = vi.fn(); await manager.executeCrossfade(next, 1, 'linear', 0, handedOver);
    deck.currentTime = 1.1; await vi.advanceTimersByTimeAsync(25);
    if (next === d) {
      await vi.advanceTimersByTimeAsync(6500);
      expect(manager.activelyCrossfading).toBe(false);
      expect(handedOver).toHaveBeenCalledExactlyOnceWith(false);
      expect(player.volume).toBeCloseTo(.7);
    } else expect(handedOver).toHaveBeenCalledExactlyOnceWith(true);
  }
  manager.stop();
});

it('detects a prefetched track stuck at zero after three successful tracks with no further native events', async () => {
  vi.useFakeTimers();
  const manager = new AudioManager(); const { player, updates } = await start(manager);
  for (const next of [b, c, d]) {
    await manager.setUpcoming([next], async t => t.id + '.mp3');
    player.ready({ currentTime: 120, didJustFinish: true, playing: false });
    player.skipTo(player.currentIndex + 1);
    if (next !== d) player.ready({ currentTime: 1 });
  }
  await vi.advanceTimersByTimeAsync(12500);
  expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({ trackId: 'd', currentTime: 0, error: expect.any(String) }));
  manager.stop();
});

it('does not swallow native source errors while the native index is transiently minus one', async () => {
  const manager = new AudioManager(); const { player, updates } = await start(manager);
  player.ready({ currentIndex: -1, error: { message: 'Source error', code: 2004 } });
  expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({ trackId: 'a', error: 'Source error (código 2004)' }));
  manager.stop();
});

it('does not freeze the Android incoming deck when the native playlist advances first', async () => {
  vi.useFakeTimers();
  const manager = new AudioManager(); const { player } = await start(manager);
  await manager.setUpcoming([b], async () => 'b.mp3');
  const preparing = manager.prepareAuxTrack(b, 'b.mp3'); const deck = native.aux[0]; deck.ready(); await preparing;
  const handedOver = vi.fn(); await manager.executeCrossfade(b, 2, 'linear', 0, handedOver);
  player.skipTo(1); player.ready({ playing: false, currentTime: 0 });
  expect(deck.pause).not.toHaveBeenCalled();
  deck.currentTime = 2.1; await vi.advanceTimersByTimeAsync(25);
  expect(handedOver).toHaveBeenCalledExactlyOnceWith(true);
  expect(manager.activelyCrossfading).toBe(false); manager.stop();
});

it('keeps the native queue bounded over forty automatic track changes', async () => {
  const manager = new AudioManager(); const { player } = await start(manager);
  for (let i = 1; i <= 40; i++) {
    const next = { ...a, id: 'sequence-' + i };
    await manager.setUpcoming([next], async t => t.id + '.mp3');
    player.skipTo(player.currentIndex + 1); player.ready({ currentTime: 1 });
    expect(manager.currentTrackId).toBe(next.id);
    expect(player.sources.length).toBeLessThanOrEqual(3);
  }
  manager.stop();
});
