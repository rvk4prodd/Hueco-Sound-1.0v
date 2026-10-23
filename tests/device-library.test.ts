import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../src/types";

const disk = vi.hoisted(() => ({ existing: new Set<string>(), storage: new Map<string, string>(), read: vi.fn(), write: vi.fn() }));
vi.mock("expo-file-system", () => ({ File: class {
  constructor(private uri: string) { if (uri.includes("invalid-uri")) throw new Error("Invalid URI"); }
  get exists() { return disk.existing.has(this.uri); }
} }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: (...args: unknown[]) => disk.read(...args), setItem: (...args: unknown[]) => disk.write(...args) } }));

const key = "@liner_device_tracks_v1";
const track = (id: string): Track => ({ id, title: `Faixa ${id}`, artists: "Artista", coverUrl: "", durationMs: 1000, source: "local", streamUrl: `file:///music/${id}.mp3` });
const a = track("a"), b = track("b"), c = track("c");
let library: typeof import("../src/library/useDeviceLibraryStore");
const state = () => library.useDeviceLibraryStore.getState();

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); disk.existing.clear(); disk.storage.clear();
  [a, b, c].forEach((item) => disk.existing.add(item.streamUrl!));
  disk.read.mockImplementation(async (storageKey: string) => disk.storage.get(storageKey) ?? null);
  disk.write.mockImplementation(async (storageKey: string, value: string) => { disk.storage.set(storageKey, value); });
  library = await import("../src/library/useDeviceLibraryStore");
});

describe("device library transactions", () => {
  it("serializes the state read and write for simultaneous downloads", async () => {
    await state().loadSavedData();
    let finish!: () => void;
    disk.write.mockImplementationOnce((_key: string, value: string) => new Promise<void>((resolve) => { finish = () => { disk.storage.set(key, value); resolve(); }; }));
    const first = state().addTracks([a]), second = state().addTracks([b]);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(disk.write).toHaveBeenCalledTimes(1); expect(state().localTracks).toHaveLength(0);
    finish(); await Promise.all([first, second]);
    expect(state().localTracks.map((item) => item.id)).toEqual(["a", "b"]);
    expect(JSON.parse(disk.storage.get(key)!).map((item: Track) => item.id)).toEqual(["a", "b"]);
  });

  it("applies an interleaved add and removal in request order", async () => {
    await state().addTracks([a]);
    const pending = [state().addTracks([b]), state().removeTrack("a"), state().addTracks([c])];
    await Promise.all(pending);
    expect(state().localTracks.map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("merges initial hydration before queued mutations and reads only once", async () => {
    let loaded!: (value: string) => void;
    disk.read.mockImplementationOnce(() => new Promise<string>((resolve) => { loaded = resolve; }));
    const hydration = state().loadSavedData();
    const add = state().addTracks([b]), remove = state().removeTrack("a");
    loaded(JSON.stringify([a])); await Promise.all([hydration, add, remove]);
    expect(state().localTracks.map((item) => item.id)).toEqual(["b"]); expect(disk.read).toHaveBeenCalledTimes(1);
  });

  it("does not publish failed writes and lets the next mutation retry", async () => {
    await state().addTracks([a]);
    disk.write.mockRejectedValueOnce(new Error("Disk full"));
    await expect(state().addTracks([b])).rejects.toThrow("Disk full");
    expect(state().localTracks.map((item) => item.id)).toEqual(["a"]); expect(state().error).toContain("salvar");
    await state().addTracks([c]);
    expect(state().localTracks.map((item) => item.id)).toEqual(["a", "c"]); expect(state().error).toBeNull();
  });

  it("retries hydration after an initial storage failure", async () => {
    disk.read.mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(state().loadSavedData()).rejects.toThrow("Storage unavailable");
    expect(state().hydrated).toBe(false);
    disk.storage.set(key, JSON.stringify([a])); await state().loadSavedData();
    expect(state().hydrated).toBe(true); expect(state().localTracks[0].id).toBe("a"); expect(state().error).toBeNull();
  });

  it("keeps only validated, readable files and deduplicates IDs", async () => {
    disk.storage.set(key, JSON.stringify([null, false, {}, { id: "bad" }, a, a, { ...b, streamUrl: "https://audio.test/b.mp3" },
      { ...c, streamUrl: "file:///music/missing.mp3" }, { ...c, streamUrl: "file:///invalid-uri.mp3" }]));
    await state().loadSavedData();
    expect(state().localTracks).toHaveLength(1); expect(state().localTracks[0].id).toBe("a");
  });

  it("rejects invalid additions without changing the saved library", async () => {
    await state().addTracks([a]);
    await expect(state().addTracks([{ ...b, streamUrl: "file:///missing.mp3" }])).rejects.toThrow("não está mais disponível");
    expect(state().localTracks.map((item) => item.id)).toEqual(["a"]); expect(disk.write).toHaveBeenCalledTimes(1);
  });

  it("preserves corrupt saved data instead of overwriting it during a mutation", async () => {
    disk.storage.set(key, "{corrupt");
    await expect(state().addTracks([a])).rejects.toThrow();
    expect(disk.storage.get(key)).toBe("{corrupt"); expect(disk.write).not.toHaveBeenCalled();
    disk.storage.set(key, "[]"); await state().addTracks([a]); expect(state().localTracks[0].id).toBe("a");
  });

  it("falls back to remote playback when an offline copy disappears and can remove its stale metadata", async () => {
    await state().addTracks([a]);
    const remote = { ...a, source: "youtube" as const, streamUrl: undefined };
    expect(library.getPlaybackTrack(remote).streamUrl).toBe(a.streamUrl);
    disk.existing.delete(a.streamUrl!);
    expect(library.getPlaybackTrack(remote)).toEqual(remote);
    expect(library.getPlaybackTrack(a)).toMatchObject({ source: undefined, streamUrl: undefined });
    await state().removeTrack("a"); expect(state().localTracks).toHaveLength(0);
  });
});
