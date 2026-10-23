import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../src/types";

const disk = vi.hoisted(() => ({ files: new Map<string, { size: number; bytes: Uint8Array }>(), resolve: vi.fn(), nativeDownload: vi.fn(), add: vi.fn(), locals: [] as Track[] }));
class FakeDirectory {
  uri: string;
  constructor(parent: { uri: string }, name: string) { this.uri = `${parent.uri}/${name}`; }
  create() {}
}
class FakeFile {
  uri: string;
  constructor(parent: string | { uri: string }, name?: string) { this.uri = typeof parent === "string" ? parent : `${parent.uri}/${name}`; }
  get exists() { return disk.files.has(this.uri); }
  get size() { return disk.files.get(this.uri)?.size || 0; }
  delete() { disk.files.delete(this.uri); }
  open() { return { readBytes: vi.fn(async (length: number) => disk.files.get(this.uri)!.bytes.slice(0, length)), close: vi.fn() }; }
  async move(destination: FakeFile) { const data = disk.files.get(this.uri)!; disk.files.delete(this.uri); disk.files.set(destination.uri, data); this.uri = destination.uri; }
  static downloadFileAsync(...args: unknown[]) { return disk.nativeDownload(...args); }
}
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-file-system", () => ({ File: FakeFile, Directory: FakeDirectory, Paths: { document: { uri: "file:///documents" } } }));
vi.mock("../src/api/innertube", () => ({ resolveAudioStream: (...args: unknown[]) => disk.resolve(...args) }));
vi.mock("../src/library/useDeviceLibraryStore", () => ({ useDeviceLibraryStore: { getState: () => ({ localTracks: disk.locals, loadSavedData: async () => {}, addTracks: (...args: unknown[]) => disk.add(...args) }) } }));

const track: Track = { id: "track:test", title: "Faixa", artists: "Artista", coverUrl: "", durationMs: 120000 };
let download: typeof import("../src/library/downloads");

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); disk.files.clear(); disk.locals = [];
  disk.resolve.mockResolvedValue("https://audio.test/song.mp3");
  disk.add.mockImplementation(async (tracks: Track[]) => { disk.locals.push(...tracks); });
  disk.nativeDownload.mockImplementation(async (_url: string, file: FakeFile) => { disk.files.set(file.uri, { size: 2000, bytes: new Uint8Array([73, 68, 51, ...Array(93).fill(0)]) }); return file; });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { headers: { "content-type": "audio/mpeg", "content-length": "2000" } })));
  download = await import("../src/library/downloads");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("offline audio downloads", () => {
  it("streams a real audio container to disk and saves the original track identity", async () => {
    await download.downloadTrack(track);
    expect(disk.nativeDownload).toHaveBeenCalledOnce();
    expect(disk.locals[0]).toMatchObject({ id: track.id, source: "local", streamUrl: expect.stringMatching(/\.mp3$/) });
    expect(disk.files.size).toBe(1); expect([...disk.files.keys()][0]).not.toContain(".part");
    expect(disk.resolve).toHaveBeenCalledWith(track.id, track.title, track.artists, expect.objectContaining({ durationMs: 120000 }));
  });

  it("rejects HLS before transfer and leaves no files or misleading offline entry", async () => {
    disk.resolve.mockResolvedValue("https://audio.test/playlist.m3u8?token=test");
    await expect(download.downloadTrack(track)).rejects.toThrow("HLS");
    expect(disk.nativeDownload).not.toHaveBeenCalled(); expect(disk.locals).toHaveLength(0); expect(disk.files.size).toBe(0);
  });

  it("rejects disguised HLS manifests after a bounded header inspection and deletes the partial file", async () => {
    disk.nativeDownload.mockImplementationOnce(async (_url: string, file: FakeFile) => {
      disk.files.set(file.uri, { size: 2000, bytes: new TextEncoder().encode("#EXTM3U\n#EXT-X-TARGETDURATION:10\nhttps://audio.test/segment.ts") }); return file;
    });
    await expect(download.downloadTrack(track)).rejects.toThrow("HLS");
    expect(disk.files.size).toBe(0); expect(disk.add).not.toHaveBeenCalled();
  });

  it("rejects HTML and oversized responses before saving", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { headers: { "content-type": "text/html" } }));
    await expect(download.downloadTrack(track)).rejects.toThrow("página");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { headers: { "content-length": String(300 * 1024 * 1024) } }));
    await expect(download.downloadTrack(track)).rejects.toThrow("250 MB");
    expect(disk.nativeDownload).not.toHaveBeenCalled();
  });

  it("aborts a transfer with unknown size when progress exceeds its size limit", async () => {
    disk.nativeDownload.mockImplementationOnce(async (_url: string, file: FakeFile, options: { signal: AbortSignal; onProgress: (progress: { bytesWritten: number; totalBytes: number }) => void }) => {
      disk.files.set(file.uri, { size: 1000, bytes: new Uint8Array(96) });
      options.onProgress({ bytesWritten: 251 * 1024 * 1024, totalBytes: -1 });
      expect(options.signal.aborted).toBe(true); throw new Error("AbortError");
    });
    await expect(download.downloadTrack(track)).rejects.toThrow("250 MB"); expect(disk.files.size).toBe(0);
  });

  it("deduplicates concurrent requests for one song", async () => {
    let finish!: () => void;
    disk.resolve.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = () => resolve("https://audio.test/song.mp3"); }));
    const first = download.downloadTrack(track), second = download.downloadTrack(track);
    expect(first).toBe(second); await Promise.resolve(); finish(); await Promise.all([first, second]);
    expect(disk.nativeDownload).toHaveBeenCalledOnce(); expect(disk.add).toHaveBeenCalledOnce();
  });

  it("cleans both downloaded and final files when saving the library fails", async () => {
    disk.add.mockRejectedValueOnce(new Error("Disk full"));
    await expect(download.downloadTrack(track)).rejects.toThrow("Disk full"); expect(disk.files.size).toBe(0);
  });

  it("avoids re-downloading an existing offline copy", async () => {
    disk.locals.push({ ...track, source: "local", streamUrl: "file:///existing.mp3" });
    disk.files.set("file:///existing.mp3", { size: 2000, bytes: new Uint8Array(96) });
    await download.downloadTrack(track); expect(disk.resolve).not.toHaveBeenCalled(); expect(disk.nativeDownload).not.toHaveBeenCalled();
  });
});
