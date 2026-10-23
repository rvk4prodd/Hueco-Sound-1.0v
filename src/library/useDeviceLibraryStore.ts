import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import { validatedTrack } from "../player/persistence";
import type { Track } from "../types";

const KEY = "@liner_device_tracks_v1";
const MAX_TRACKS = 10_000;
let mutationChain: Promise<void> = Promise.resolve();
let loading: Promise<void> | null = null;

function fileExists(uri: string): boolean {
  try { return new File(uri).exists; } catch { return false; }
}

function localTrack(value: unknown): Track | null {
  const track = validatedTrack(value);
  if (!track?.streamUrl?.startsWith("file://") || !fileExists(track.streamUrl)) return null;
  return { ...track, source: "local" };
}

export interface DeviceState {
  localTracks: Track[];
  hydrated: boolean;
  error: string | null;
  loadSavedData: () => Promise<void>;
  addTracks: (tracks: Track[]) => Promise<void>;
  removeTrack: (id: string) => Promise<void>;
}

/** Serialize the complete mutation, including the state read, so simultaneous downloads merge. */
function enqueue(operation: () => Promise<void>): Promise<void> {
  const pending = mutationChain.then(operation);
  // A failed write rejects its caller, while later edits can still retry independently.
  mutationChain = pending.catch(() => {});
  return pending;
}

export const useDeviceLibraryStore = create<DeviceState>((set, get) => ({
  localTracks: [], hydrated: false, error: null,
  loadSavedData: () => {
    if (get().hydrated) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const data: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(data)) throw new Error("A biblioteca de arquivos salva está em um formato inválido.");
        const tracks = new Map<string, Track>();
        for (const value of data.slice(0, MAX_TRACKS)) {
          const track = localTrack(value);
          if (track) tracks.set(track.id, track);
        }
        set({ localTracks: [...tracks.values()], hydrated: true, error: null });
      } catch (error) {
        loading = null;
        set({ error: "Não foi possível carregar os arquivos salvos neste aparelho." });
        throw error;
      }
    })();
    return loading;
  },
  addTracks: (input) => enqueue(async () => {
    await get().loadSavedData();
    const tracks = new Map(get().localTracks.map((track) => [track.id, track]));
    for (const value of input) {
      const track = localTrack(value);
      if (!track) throw new Error("Um dos arquivos de áudio não está mais disponível. Importe-o novamente.");
      tracks.set(track.id, track);
    }
    if (tracks.size > MAX_TRACKS) throw new Error("A biblioteca do aparelho comporta até 10.000 músicas.");
    const localTracks = [...tracks.values()];
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(localTracks));
      set({ localTracks, error: null });
    } catch (error) {
      set({ error: "Não foi possível salvar os arquivos na biblioteca. Libere espaço e tente novamente." });
      throw error;
    }
  }),
  removeTrack: (id) => enqueue(async () => {
    await get().loadSavedData();
    const localTracks = get().localTracks.filter((track) => track.id !== id);
    try {
      // Removing metadata works even if a user or the OS has already removed the file.
      await AsyncStorage.setItem(KEY, JSON.stringify(localTracks));
      set({ localTracks, error: null });
    } catch (error) {
      set({ error: "Não foi possível salvar a remoção. Tente novamente." });
      throw error;
    }
  }),
}));

export function getPlaybackTrack(track: Track): Track {
  const local = useDeviceLibraryStore.getState().localTracks.find((item) => item.id === track.id);
  if (local?.streamUrl && fileExists(local.streamUrl)) return local;
  // A missing downloaded copy must not block streaming the original remote song.
  if (track.source === "local" && !track.id.startsWith("local:") && (!track.streamUrl || !fileExists(track.streamUrl))) {
    return { ...track, source: undefined, streamUrl: undefined };
  }
  return track;
}
