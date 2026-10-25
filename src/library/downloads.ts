import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { resolveAudioStream } from "../api/innertube";
import { useDeviceLibraryStore } from "./useDeviceLibraryStore";
import type { Track } from "../types";
import { preparePlaybackSource } from "../player/prepareSource";

const MAX_BYTES = 250 * 1024 * 1024;
const active = new Map<string, Promise<void>>();
const UNSUPPORTED = "Esta fonte usa transmissão HLS e ainda não permite download. Você pode ouvi-la online ou importar um arquivo de áudio.";

function formatOf(bytes: Uint8Array): string | null {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return "aac";
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "mp3";
  if (ascii(4, 4) === "ftyp") return "m4a";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "wav";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  return null;
}

async function inspectHeaders(url: string, signal: AbortSignal): Promise<void> {
  let response: Response;
  try { response = await fetch(url, { method: "HEAD", signal }); }
  catch (error) { if (signal.aborted) throw error; return; }
  // Some CDNs do not implement HEAD. The bounded native transfer remains the source of truth.
  if (!response.ok) return;
  const mime = response.headers.get("content-type")?.toLowerCase() || "";
  if (/mpegurl|m3u|dash\+xml/.test(mime)) throw new Error(UNSUPPORTED);
  if (/text\/|json|xml/.test(mime)) throw new Error("A fonte retornou uma página em vez de um arquivo de áudio. Tente novamente mais tarde.");
  const size = Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && size > MAX_BYTES) throw new Error("O áudio excede o limite de 250 MB por download.");
}

function cleanFile(file: File | null): void {
  try { if (file?.exists) file.delete(); } catch { /* An interrupted native transfer may already have removed it. */ }
}

async function performDownload(track: Track): Promise<void> {
  if (Platform.OS === "web") throw new Error("Use o aplicativo Android para baixar músicas neste aparelho.");
  await useDeviceLibraryStore.getState().loadSavedData();
  const existing = useDeviceLibraryStore.getState().localTracks.find((item) => item.id === track.id);
  if (existing?.streamUrl && new File(existing.streamUrl).exists) return;
  if (track.source === "local") throw new Error("O arquivo local não está mais disponível. Importe-o novamente.");

  const controller = new AbortController();
  let tooLarge = false;
  let timedOut = false;
  let output: File | null = null;
  let finalFile: File | null = null;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 5 * 60_000);
  try {
    const url = track.streamUrl || await resolveAudioStream(track.id, track.title, track.artists, { durationMs: track.durationMs, signal: controller.signal });
    if (!/^https?:\/\//i.test(url)) throw new Error("Esta fonte não oferece um arquivo para download.");
    if (/\.m3u8(?:$|[?#])|\/manifest\/(?:hls|dash)|\.mpd(?:$|[?#])/i.test(url)) throw new Error(UNSUPPORTED);
    await inspectHeaders(url, controller.signal);
    const directory = new Directory(Paths.document, "hueco-downloads");
    directory.create({ idempotent: true, intermediates: true });
    const stem = `audio-${track.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    output = new File(directory, `${stem}.part`);
    const prepared = await preparePlaybackSource(url, controller.signal);
    if (prepared.startsWith('file:')) await new File(prepared).copy(output);
    else await File.downloadFileAsync(url, output, {
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (bytesWritten > MAX_BYTES || totalBytes > MAX_BYTES) { tooLarge = true; controller.abort(); }
      },
    });
    if (controller.signal.aborted) throw new Error("Download interrompido.");
    if (!output.exists || output.size < 16) throw new Error("O download não retornou um arquivo de áudio válido.");
    if (output.size > MAX_BYTES) throw new Error("O áudio excede o limite de 250 MB por download.");
    // Inspect only the container signature; never load the whole audio into JavaScript memory.
    const handle = output.open();
    let signature: Uint8Array;
    try { signature = await handle.readBytes(96); } finally { handle.close(); }
    const format = formatOf(signature);
    if (!format) {
      const prefix = String.fromCharCode(...signature).trim();
      if (prefix.startsWith("#EXTM3U") || prefix.startsWith("<?xml") || prefix.includes("<MPD")) throw new Error(UNSUPPORTED);
      throw new Error("A fonte não retornou um arquivo de áudio compatível para salvar offline.");
    }
    finalFile = new File(directory, `${stem}.${format}`);
    await output.move(finalFile);
    await useDeviceLibraryStore.getState().addTracks([{ ...track, source: "local", streamUrl: finalFile.uri }]);
    output = null; finalFile = null;
  } catch (error) {
    cleanFile(output); cleanFile(finalFile);
    if (tooLarge) throw new Error("O áudio excede o limite de 250 MB por download.");
    if (timedOut) throw new Error("O download demorou demais. Verifique sua conexão e tente novamente.");
    throw error;
  } finally { clearTimeout(deadline); }
}

/** Native streaming-to-disk transfer, deduplicated per song and limited to two at a time. */
export function downloadTrack(track: Track): Promise<void> {
  const pending = active.get(track.id);
  if (pending) return pending;
  if (active.size >= 2) return Promise.reject(new Error("Aguarde um dos dois downloads terminar antes de iniciar outro."));
  const task = performDownload(track).finally(() => { active.delete(track.id); });
  active.set(track.id, task);
  return task;
}

export interface PlaylistDownloadResult {
  success: number;
  failed: number;
  total: number;
}

export type PlaylistProgressCallback = (progress: {
  current: number;
  total: number;
  trackTitle: string;
}) => void;

const activePlaylistDownloads = new Set<string>();

export function isPlaylistDownloading(playlistId: string): boolean {
  return activePlaylistDownloads.has(playlistId);
}

/** Download an entire playlist into local storage with progress reporting. */
export async function downloadPlaylist(
  playlistId: string,
  tracks: Track[],
  onProgress?: PlaylistProgressCallback
): Promise<PlaylistDownloadResult> {
  if (activePlaylistDownloads.has(playlistId)) {
    throw new Error("O download desta playlist já está em andamento.");
  }
  activePlaylistDownloads.add(playlistId);
  let success = 0;
  let failed = 0;
  const total = tracks.length;

  try {
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      onProgress?.({ current: i + 1, total, trackTitle: track.title });
      try {
        await downloadTrack(track);
        success++;
      } catch {
        failed++;
      }
    }
  } finally {
    activePlaylistDownloads.delete(playlistId);
  }

  return { success, failed, total };
}
