import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Track, LyricLine, Playlist, RepeatMode } from "../types";
import { resolveAudioStream, fetchLyrics, getRadioTracks, isAbortError } from "../api/innertube";
import { audioManager, PlaybackStatus } from "./audioManager";
import { MAX_QUEUE, moved, shuffledIds, uniqueTracks } from "./queue";
import { finite, LEGACY_LIKES_KEY, LEGACY_RECENTS_KEY, parseSavedData, SavedPlayerData, STORAGE_KEY, validatedIds, validatedTracks } from "./persistence";
import { useUIStore } from "../ui/useUIStore";
import { getPlaybackTrack } from "../library/useDeviceLibraryStore";
import { originalPlaybackSource, preparePlaybackSource } from "./prepareSource";
import { useExperienceStore } from "../preferences/experience";

export interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  queue: Track[];
  currentIndex: number;
  activePlaylistId: string | null;
  shuffle: boolean;
  repeat: boolean;
  repeatMode: RepeatMode;
  isFullscreenOpen: boolean;
  likedTrackIds: string[];
  likedTracks: Track[];
  recentTracks: Track[];
  playlists: Playlist[];
  lyrics: LyricLine[];
  isLyricsLoading: boolean;
  error: string | null;
  hydrated: boolean;
  sleepTimerEndAt: number | null;
  sleepAtEndOfTrack: boolean;
  playbackRate: number;
  volume: number;
  reducedMotion: boolean;
  lyricsOffsetMs: number;
  playTrack: (track: Track, newQueue?: Track[], playlistId?: string) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (positionMs: number) => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (track: Track | string) => void;
  setIsFullscreenOpen: (open: boolean) => void;
  loadSavedData: () => Promise<void>;
  retryPlayback: () => Promise<void>;
  clearError: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  moveQueueTrack: (from: number, to: number) => void;
  clearQueue: () => void;
  createPlaylist: (name: string, tracks?: Track[]) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (id: string, track: Track) => boolean;
  removeTrackFromPlaylist: (id: string, trackId: string) => void;
  movePlaylistTrack: (id: string, from: number, to: number) => void;
  updatePlaylistMixSettings: (id: string, mixSettings: import('../types').PlaylistMixSettings) => void;
  setSleepTimer: (minutes: number | null) => void;
  setSleepAtEndOfTrack: (enabled: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setReducedMotion: (enabled: boolean) => void;
  clearHistory: () => void;
  setLyricsOffsetMs: (offset: number) => void;
  importLibraryData: (data: { likedTracks: Track[]; playlists: (Pick<Playlist, "name" | "tracks"> & Partial<Playlist>)[] }) => void;
}

let requestVersion = 0;
let streamController: AbortController | null = null;
let hydratePromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let sleepTimeout: ReturnType<typeof setTimeout> | null = null;
let desiredPlaying = false;
let shuffleRemaining: string[] = [];
let navigationHistory: string[] = [];
let historyCursor = -1;
let lastCheckpoint = 0;
let lastFinishedTrack: string | null = null;
let activeLoadVersion: number | null = null;
let recoveredTrackId: string | null = null;

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Não foi possível reproduzir. Tente novamente.";
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const dirtyFields = new Set<string>();
  function update(change: Partial<PlayerState>): void {
    if (!get().hydrated) Object.keys(change).forEach((key) => dirtyFields.add(key));
    set(change);
  }
  function save(): void {
    if (!get().hydrated) { void get().loadSavedData().then(save); return; }
    const state = get();
    const data: SavedPlayerData = {
      version: 2, likedTrackIds: state.likedTrackIds, likedTracks: state.likedTracks,
      recentTracks: state.recentTracks, playlists: state.playlists, queue: state.queue,
      currentTrackId: state.currentTrack?.id ?? null, positionMs: state.positionMs,
      shuffle: state.shuffle, repeatMode: state.repeatMode, volume: state.volume,
      playbackRate: state.playbackRate, reducedMotion: state.reducedMotion, lyricsOffsetMs: state.lyricsOffsetMs,
    };
    const payload = JSON.stringify(data);
    // Capture the snapshot now and serialize writes, so rapid edits cannot save stale data last.
    writeChain = writeChain.then(() => AsyncStorage.setItem(STORAGE_KEY, payload)).catch(() => {
      update({ error: "Não foi possível salvar sua biblioteca neste aparelho. Libere espaço e tente novamente." });
    });
  }

  function resetTraversal(track: Track | null): void {
    shuffleRemaining = shuffledIds(get().queue, track ? [track.id] : []);
    navigationHistory = track ? [track.id] : [];
    historyCursor = track ? 0 : -1;
  }

  function rememberNavigation(track: Track): void {
    if (navigationHistory[historyCursor] === track.id) return;
    if (navigationHistory[historyCursor + 1] === track.id) historyCursor++;
    else if (historyCursor > 0 && navigationHistory[historyCursor - 1] === track.id) historyCursor--;
    else {
      navigationHistory = [...navigationHistory.slice(0, historyCursor + 1), track.id].slice(-MAX_QUEUE * 2);
      historyCursor = navigationHistory.length - 1;
    }
    shuffleRemaining = shuffleRemaining.filter((id) => id !== track.id);
  }

  async function streamFor(track: Track, forceRefresh = false, excludeUrls: string[] = []): Promise<string> {
    const playbackTrack = getPlaybackTrack(track);
    if (playbackTrack.streamUrl) return playbackTrack.streamUrl;
    const signal = streamController?.signal;
    const excluded = [...excludeUrls];
    for (let attempt = 0; ; attempt++) {
      const url = await resolveAudioStream(track.id, track.title, track.artists, {
        durationMs: track.durationMs, signal, forceRefresh: forceRefresh || attempt > 0, excludeUrls: excluded,
      });
      try { return await preparePlaybackSource(url, signal); }
      catch (error) {
        if (signal?.aborted || isAbortError(error) || attempt > 0) throw error;
        excluded.push(url);
      }
    }
  }

  function upcoming(): Track[] {
    const state = get();
    if (!state.currentTrack || state.sleepAtEndOfTrack) return [];
    if (state.shuffle) {
      const forward = navigationHistory.slice(historyCursor + 1);
      const ids = [...new Set([...forward, ...shuffleRemaining])];
      return ids.map((id) => state.queue.find((track) => track.id === id)).filter((track): track is Track => !!track).slice(0, 2);
    }
    const nextTracks = state.queue.slice(state.currentIndex + 1, state.currentIndex + 3);
    if (state.repeatMode === "all" && nextTracks.length < 2 && state.queue.length > 0) {
      const wrapNeeded = 2 - nextTracks.length;
      return [...nextTracks, ...state.queue.slice(0, wrapNeeded)];
    }
    return nextTracks;
  }

  function syncUpcoming(): void { void audioManager.setUpcoming(upcoming(), (track) => streamFor(track)).catch(() => { /* Manual Next resolves again if native prefetch is unavailable. */ }); }

  function loadTrackLyrics(track: Track, version: number): void {
    update({ lyrics: [], isLyricsLoading: true });
    void fetchLyrics(track.title, track.artists).then((lyrics) => {
      if (requestVersion === version && get().currentTrack?.id === track.id) update({ lyrics, isLyricsLoading: false });
    }).catch(() => {
      if (requestVersion === version && get().currentTrack?.id === track.id) update({ lyrics: [], isLyricsLoading: false });
    });
  }

  function selectTrack(track: Track, version: number): void {
    const state = get();
    rememberNavigation(track);
    const recentTracks = [track, ...state.recentTracks.filter((item) => item.id !== track.id)].slice(0, 100);
    const likedTracks = state.likedTrackIds.includes(track.id) ? uniqueTracks([track, ...state.likedTracks], 10000) : state.likedTracks;
    update({ currentTrack: track, currentIndex: state.queue.findIndex((item) => item.id === track.id),
      durationMs: track.durationMs, positionMs: 0, recentTracks, likedTracks, error: null });
    lastFinishedTrack = null;
    loadTrackLyrics(track, version);
    save();
  }

  function pausePlayback(): void {
    desiredPlaying = false;
    if (get().isLoading) {
      requestVersion++;
      streamController?.abort();
      audioManager.stop();
    } else audioManager.pause();
    update({ isPlaying: false, isLoading: false });
    save();
  }

  function expireSleepTimer(): boolean {
    const deadline = get().sleepTimerEndAt;
    if (!deadline || Date.now() < deadline) return false;
    if (sleepTimeout) clearTimeout(sleepTimeout);
    sleepTimeout = null;
    update({ sleepTimerEndAt: null, sleepAtEndOfTrack: false });
    pausePlayback();
    return true;
  }

  let auxPreparingTrackId: string | null = null;

  async function checkAndTriggerCrossfade(status: PlaybackStatus, version: number): Promise<void> {
    if (audioManager.activelyCrossfading || !status.playing || status.duration <= 8) return;
    const state = get();
    const currentTrack = state.currentTrack;
    if (!currentTrack || currentTrack.id !== status.trackId) return;
    const nextTrack = upcoming()[0];
    if (!nextTrack || nextTrack.id === currentTrack.id) return;

    const playlist = state.activePlaylistId
      ? state.playlists.find(p => p.id === state.activePlaylistId)
      : null;
    const mixSettings = playlist?.mixSettings;

    let durationSec = 4;
    let outPointSec = status.duration - 4;
    let inCueSec = 0;
    let curve: import('./transitions').CrossfadeCurve = 'overlap';
    let isTransitionActive = false;

    if (mixSettings?.enabled) {
      isTransitionActive = true;
      const pairKey = `${currentTrack.id}->${nextTrack.id}`;
      const conf = (mixSettings.customTransitions && mixSettings.customTransitions[pairKey]) || mixSettings.defaultConfig || { durationSeconds: 4, volume: 'overlap' };
      durationSec = conf.durationSeconds || 4;
      curve = conf.volume || 'overlap';
      outPointSec = conf.outPointSec !== undefined ? conf.outPointSec : Math.max(0, status.duration - durationSec);
      inCueSec = conf.inPointSec !== undefined ? conf.inPointSec : (conf.inCueSec ?? 0);
    } else {
      const exp = useExperienceStore.getState();
      if (exp.audioTransition === 'fade') {
        isTransitionActive = true;
        durationSec = exp.transitionSeconds || 3;
        outPointSec = Math.max(0, status.duration - durationSec);
        inCueSec = 0;
        curve = exp.fadeCurve || 'smooth';
      }
    }

    if (!isTransitionActive || outPointSec <= 0) return;

    // Pre-buffer auxiliary deck 12 seconds in advance
    if (status.currentTime >= outPointSec - 12 && auxPreparingTrackId !== nextTrack.id) {
      auxPreparingTrackId = nextTrack.id;
      void (async () => {
        try {
          const url = await streamFor(nextTrack);
          if (requestVersion !== version) return;
          await audioManager.prepareAuxTrack(nextTrack, url, inCueSec);
        } catch {
          auxPreparingTrackId = null;
        }
      })();
    }

    // Trigger the real simultaneous dual-deck crossfade right at outPointSec
    if (status.currentTime >= outPointSec) {
      auxPreparingTrackId = null;
      void audioManager.executeCrossfade(nextTrack, durationSec, curve, inCueSec, () => {
        if (requestVersion !== version) return;
        selectTrack(nextTrack, version);
        syncUpcoming();
      });
    }
  }

  function onStatus(status: PlaybackStatus, version: number): void {
    if (requestVersion !== version || get().currentTrack?.id !== status.trackId) return;
    if (expireSleepTimer()) return;
    if (status.error) {
      // Prefetched tracks skip loadAndPlay; recover their expired/broken source here too.
      if (activeLoadVersion !== version && recoveredTrackId !== status.trackId && !getPlaybackTrack(get().currentTrack!).streamUrl) {
        recoveredTrackId = status.trackId;
        void startPlayback(get().currentTrack!, undefined, false, true, get().positionMs, status.sourceUrl ? [status.sourceUrl] : []);
        return;
      }
      recoveredTrackId = null;
      desiredPlaying = false;
      update({ isPlaying: false, isLoading: false, error: status.error });
      save();
      return;
    }
    const state = get();
    const positionMs = finite(Math.round(status.currentTime * 1000), state.positionMs);
    const durationMs = status.duration > 0 ? finite(Math.round(status.duration * 1000), state.durationMs) : state.durationMs;
    update({ isPlaying: status.playing, isLoading: status.isBuffering || (!status.isLoaded && desiredPlaying), positionMs, durationMs });
    if (Date.now() - lastCheckpoint > 10_000 || state.isPlaying !== status.playing) { lastCheckpoint = Date.now(); save(); }

    if (!audioManager.activelyCrossfading) {
      void checkAndTriggerCrossfade(status, version);
    }

    if (status.didJustFinish && lastFinishedTrack !== status.trackId) {
      if (audioManager.activelyCrossfading) {
        // Crossfade handover is currently active; do not interrupt!
        return;
      }
      lastFinishedTrack = status.trackId;
      if (state.sleepAtEndOfTrack) {
        update({ sleepAtEndOfTrack: false });
        audioManager.setRepeatOne(state.repeatMode === "one");
        pausePlayback();
      } else if (state.repeatMode === "one") {
        void get().seekTo(0).then(() => { lastFinishedTrack = null; audioManager.resume(); });
      } else {
        const currentNativeId = audioManager.currentTrackId;
        if (currentNativeId && currentNativeId !== status.trackId) {
          // Native queue advanced seamlessly without interruption.
          return;
        }
        void advance(true);
      }
    }
  }

  async function startPlayback(track: Track, newQueue?: Track[], freshTraversal = true, forceRefresh = false, restorePosition = 0, initialExclusions: string[] = [], playlistId?: string): Promise<void> {
    await get().loadSavedData();
    const version = ++requestVersion;
    streamController?.abort();
    streamController = new AbortController();
    audioManager.stop();
    desiredPlaying = true;
    auxPreparingTrackId = null;
    const existing = get().queue;
    const queue = uniqueTracks(newQueue?.length ? newQueue : existing.some((item) => item.id === track.id) ? existing : [track]);
    if (!queue.some((item) => item.id === track.id)) queue.unshift(track);
    update({
      queue: queue.slice(0, MAX_QUEUE),
      isLoading: true,
      isPlaying: false,
      ...(playlistId !== undefined ? { activePlaylistId: playlistId } : {}),
    });
    if (freshTraversal) { resetTraversal(track); recoveredTrackId = null; }
    selectTrack(track, version);
    try {
      const excluded: string[] = [...initialExclusions];
      for (let attempt = 0; attempt < 2; attempt++) {
      const url = await streamFor(track, forceRefresh || attempt > 0, excluded);
      if (requestVersion !== version) return;
      const state = get();
      activeLoadVersion = version;
      const loading = audioManager.loadAndPlay(url, track, (status) => onStatus(status, version), {
        volume: state.volume, playbackRate: state.playbackRate,
        loopOne: state.repeatMode === "one" && !state.sleepAtEndOfTrack,
        onTrackChange: (next) => {
          if (requestVersion !== version) return;
          const queued = get().queue.find((item) => item.id === next.id);
          if (!queued) { void startPlayback(next, [next]); return; }
          lastFinishedTrack = null;
          selectTrack(queued, version);
          syncUpcoming();
        },
      });
      try { await loading; } catch (error) {
        if (activeLoadVersion === version) activeLoadVersion = null;
        if (requestVersion !== version) return;
        if (attempt === 0 && !getPlaybackTrack(track).streamUrl) { desiredPlaying = true; excluded.push(originalPlaybackSource(url)); update({ isLoading: true, error: null }); continue; }
        throw error;
      }
      if (requestVersion !== version) return;
      if (activeLoadVersion === version) activeLoadVersion = null;
      if (restorePosition > 0) await get().seekTo(restorePosition);
      if (!desiredPlaying) audioManager.pause();
      syncUpcoming();
      break;
      }
    } catch (error) {
      if (requestVersion !== version) return;
      desiredPlaying = false;
      audioManager.stop();
      update({ error: message(error), isLoading: false, isPlaying: false });
    }
  }

  async function transition(track: Track): Promise<void> {
    desiredPlaying = true;
    if (audioManager.skipToTrack(track.id)) return;
    await startPlayback(track, undefined, false);
  }

  async function advance(automatic: boolean): Promise<void> {
    const state = get();
    if (!state.queue.length) return;
    let next: Track | undefined;
    if (state.shuffle) {
      const forward = navigationHistory[historyCursor + 1];
      let nextId: string | undefined = forward || shuffleRemaining[0];
      if (!nextId && state.repeatMode === "all") {
        shuffleRemaining = shuffledIds(state.queue, state.currentTrack ? [state.currentTrack.id] : []);
        nextId = shuffleRemaining[0] || state.currentTrack?.id;
      }
      next = state.queue.find((track) => track.id === nextId);
    } else {
      next = state.queue[state.currentIndex + 1];
      if (!next && state.repeatMode === "all") next = state.queue[0];
    }
    if (!next) {
      if (state.repeatMode === "one" && state.currentTrack) {
        next = state.currentTrack;
      } else if (state.currentTrack) {
        // Autoplay / Endless playback: fetch recommendations based on current track and carry on!
        try {
          const recs = await getRadioTracks(state.currentTrack.id);
          const existingIds = new Set(state.queue.map((t) => t.id));
          const additions = recs.filter((t) => !existingIds.has(t.id));
          if (additions.length > 0) {
            const newQueue = [...state.queue, ...additions].slice(0, MAX_QUEUE);
            update({ queue: newQueue });
            next = additions[0];
          }
        } catch {}
      }
    }
    if (!next) {
      // A finite queue has a real end. Manual Next leaves the final track selected.
      if (automatic) { update({ positionMs: state.durationMs }); pausePlayback(); }
      else useUIStore.getState().notify("Fim da fila. Adicione mais músicas pelo menu ⋮ ou ative repetir a fila.");
      return;
    }
    if (next.id === state.currentTrack?.id) {
      await get().seekTo(0); lastFinishedTrack = null; audioManager.resume(); return;
    }
    await transition(next);
  }

  function queueChanged(queue: Track[]): void {
    const currentTrack = get().currentTrack;
    update({ queue, currentIndex: currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1 });
    const known = new Set([...shuffleRemaining, ...navigationHistory]);
    shuffleRemaining = [...shuffleRemaining.filter((id) => queue.some((track) => track.id === id)), ...shuffledIds(queue, [...known])];
    navigationHistory = navigationHistory.filter((id) => queue.some((track) => track.id === id));
    historyCursor = currentTrack ? navigationHistory.lastIndexOf(currentTrack.id) : -1;
    audioManager.retainTracks(new Set(queue.map((track) => track.id)));
    syncUpcoming();
    save();
  }

  function updatePlaylist(id: string, transform: (playlist: Playlist) => Playlist): void {
    update({ playlists: get().playlists.map((playlist) => playlist.id === id ? { ...transform(playlist), updatedAt: Date.now() } : playlist) });
    save();
  }

  return {
    currentTrack: null, isPlaying: false, isLoading: false, positionMs: 0, durationMs: 0,
    queue: [], currentIndex: -1, activePlaylistId: null, shuffle: false, repeat: false, repeatMode: "off", isFullscreenOpen: false,
    likedTrackIds: [], likedTracks: [], recentTracks: [], playlists: [], lyrics: [], isLyricsLoading: false,
    error: null, hydrated: false, sleepTimerEndAt: null, sleepAtEndOfTrack: false, playbackRate: 1, volume: 1, reducedMotion: false, lyricsOffsetMs: 0,

    playTrack: (track, queue, playlistId) => startPlayback(track, queue, true, false, 0, [], playlistId),
    togglePlayPause: async () => {
      const state = get();
      if (!state.currentTrack) return;
      if (state.isPlaying || state.isLoading) { pausePlayback(); return; }
      if (!audioManager.hasPlayer || state.error) { await startPlayback(state.currentTrack, undefined, false, !!state.error, state.positionMs); return; }
      try {
        desiredPlaying = true;
        if (state.durationMs > 0 && state.positionMs >= state.durationMs - 300) { await get().seekTo(0); lastFinishedTrack = null; }
        audioManager.resume();
      } catch (error) { update({ error: message(error), isPlaying: false }); }
    },
    seekTo: async (position) => {
      const state = get();
      const positionMs = finite(position, state.positionMs, 0, state.durationMs || Number.MAX_SAFE_INTEGER);
      try { await audioManager.seekTo(positionMs); update({ positionMs }); if (positionMs < state.durationMs - 500) lastFinishedTrack = null; save(); }
      catch (error) { update({ error: message(error) }); }
    },
    nextTrack: () => advance(false),
    prevTrack: async () => {
      const state = get();
      if (state.positionMs > 3000) { await get().seekTo(0); return; }
      const previousId = navigationHistory[historyCursor - 1];
      const previous = state.shuffle ? state.queue.find((track) => track.id === previousId) : state.queue[state.currentIndex - 1] || (state.repeatMode === "all" ? state.queue[state.queue.length - 1] : undefined);
      if (previous) await transition(previous); else await get().seekTo(0);
    },
    toggleShuffle: () => {
      update({ shuffle: !get().shuffle }); resetTraversal(get().currentTrack); syncUpcoming(); save();
    },
    toggleRepeat: () => {
      const repeatMode: RepeatMode = get().repeatMode === "off" ? "all" : get().repeatMode === "all" ? "one" : "off";
      update({ repeatMode, repeat: repeatMode !== "off" });
      audioManager.setRepeatOne(repeatMode === "one" && !get().sleepAtEndOfTrack); syncUpcoming(); save();
    },
    toggleLike: (trackOrId) => {
      const state = get();
      const id = typeof trackOrId === "string" ? trackOrId : trackOrId.id;
      const known = typeof trackOrId === "string" ? [state.currentTrack, ...state.queue, ...state.recentTracks, ...state.playlists.flatMap((playlist) => playlist.tracks)].find((track) => track?.id === id) : trackOrId;
      const liked = state.likedTrackIds.includes(id);
      update({ likedTrackIds: liked ? state.likedTrackIds.filter((item) => item !== id) : [...state.likedTrackIds, id],
        likedTracks: liked ? state.likedTracks.filter((track) => track.id !== id) : known ? uniqueTracks([known, ...state.likedTracks], 10000) : state.likedTracks });
      save();
    },
    setIsFullscreenOpen: (open) => update({ isFullscreenOpen: open }),
    clearError: () => update({ error: null }),
    retryPlayback: async () => { const state = get(); if (state.currentTrack) await startPlayback(state.currentTrack, undefined, false, true, state.positionMs); },
    addToQueue: (track) => {
      const state = get();
      if (state.queue.some((item) => item.id === track.id)) return;
      if (state.queue.length >= MAX_QUEUE) { update({ error: "A fila comporta até 500 músicas. Remova uma para adicionar outra." }); return; }
      queueChanged([...state.queue, track]);
    },
    playNext: (track) => {
      const state = get();
      if (state.currentTrack?.id === track.id) return;
      if (state.queue.length >= MAX_QUEUE && !state.queue.some((item) => item.id === track.id)) {
        update({ error: "A fila comporta até 500 músicas. Remova uma para adicionar outra." }); return;
      }
      const queue = state.queue.filter((item) => item.id !== track.id);
      const index = state.currentTrack ? queue.findIndex((item) => item.id === state.currentTrack?.id) + 1 : 0;
      queue.splice(index, 0, track);
      queueChanged(queue.slice(0, MAX_QUEUE));
      if (get().shuffle) {
        navigationHistory = navigationHistory.slice(0, historyCursor + 1);
        shuffleRemaining = [track.id, ...shuffleRemaining.filter((id) => id !== track.id)]; syncUpcoming();
      }
    },
    removeFromQueue: (index) => {
      const state = get();
      if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) return;
      const removed = state.queue[index];
      const queue = state.queue.filter((_, itemIndex) => itemIndex !== index);
      if (removed.id !== state.currentTrack?.id) { queueChanged(queue); return; }
      const next = queue[index] || queue[index - 1];
      const wasPlaying = state.isPlaying || state.isLoading;
      requestVersion++; streamController?.abort(); audioManager.stop(); desiredPlaying = false;
      update({ queue, currentTrack: next || null, currentIndex: next ? queue.indexOf(next) : -1, positionMs: 0, durationMs: next?.durationMs || 0,
        isPlaying: false, isLoading: false, lyrics: [], isLyricsLoading: false });
      resetTraversal(next || null); save();
      if (next && wasPlaying) void startPlayback(next, queue);
    },
    moveQueueTrack: (from, to) => { const queue = moved(get().queue, from, to); if (queue !== get().queue) queueChanged(queue); },
    clearQueue: () => { const current = get().currentTrack; queueChanged(current ? [current] : []); resetTraversal(current); },
    createPlaylist: (name, tracks = []) => {
      const cleanName = name.trim().slice(0, 120);
      if (!cleanName) { update({ error: "Dê um nome à playlist." }); return ""; }
      if (get().playlists.length >= 500) { update({ error: "Você já tem 500 playlists neste aparelho." }); return ""; }
      const id = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const now = Date.now();
      update({ playlists: [{ id, name: cleanName, tracks: uniqueTracks(tracks), createdAt: now, updatedAt: now }, ...get().playlists] });
      save(); return id;
    },
    renamePlaylist: (id, name) => { const cleanName = name.trim().slice(0, 120); if (cleanName) updatePlaylist(id, (playlist) => ({ ...playlist, name: cleanName })); },
    deletePlaylist: (id) => { update({ playlists: get().playlists.filter((playlist) => playlist.id !== id) }); save(); },
    addTrackToPlaylist: (id, track) => {
      const playlist = get().playlists.find((item) => item.id === id);
      if (!playlist || playlist.tracks.some((item) => item.id === track.id)) return false;
      if (playlist.tracks.length >= MAX_QUEUE) { update({ error: "Esta playlist já tem 500 músicas." }); return false; }
      updatePlaylist(id, (item) => ({ ...item, tracks: [...item.tracks, track] })); return true;
    },
    removeTrackFromPlaylist: (id, trackId) => updatePlaylist(id, (playlist) => ({ ...playlist, tracks: playlist.tracks.filter((track) => track.id !== trackId) })),
    movePlaylistTrack: (id, from, to) => updatePlaylist(id, (playlist) => ({ ...playlist, tracks: moved(playlist.tracks, from, to) })),
    updatePlaylistMixSettings: (id, mixSettings) => updatePlaylist(id, (playlist) => ({ ...playlist, mixSettings })),
    setSleepTimer: (minutes) => {
      if (sleepTimeout) clearTimeout(sleepTimeout);
      sleepTimeout = null;
      const duration = minutes === null ? 0 : finite(minutes, 0, 0, 24 * 60);
      const sleepTimerEndAt = duration > 0 ? Date.now() + duration * 60_000 : null;
      update({ sleepTimerEndAt, sleepAtEndOfTrack: false });
      audioManager.setRepeatOne(get().repeatMode === "one");
      if (sleepTimerEndAt) sleepTimeout = setTimeout(() => { expireSleepTimer(); }, duration * 60_000);
      syncUpcoming();
    },
    setSleepAtEndOfTrack: (enabled) => {
      if (sleepTimeout) clearTimeout(sleepTimeout);
      sleepTimeout = null;
      update({ sleepAtEndOfTrack: enabled, sleepTimerEndAt: null });
      audioManager.setRepeatOne(get().repeatMode === "one" && !enabled); syncUpcoming();
    },
    setPlaybackRate: (rate) => { const playbackRate = finite(rate, 1, 0.5, 2); audioManager.setPlaybackRate(playbackRate); update({ playbackRate }); save(); },
    setVolume: (value) => { const volume = finite(value, 1, 0, 1); audioManager.setVolume(volume); update({ volume }); save(); },
    setReducedMotion: (enabled) => { update({ reducedMotion: enabled }); save(); },
    clearHistory: () => { update({ recentTracks: [] }); save(); },
    setLyricsOffsetMs: (offset) => { update({ lyricsOffsetMs: finite(offset, 0, -30_000, 30_000) }); save(); },
    importLibraryData: (data) => {
      const state = get();
      const now = Date.now();
      const importedPlaylists = data.playlists.map((playlist) => ({ ...playlist,
        id: playlist.id || state.playlists.find((item) => item.name.trim().toLocaleLowerCase() === playlist.name.trim().toLocaleLowerCase())?.id || `playlist-${now}-${Math.random().toString(36).slice(2, 10)}`,
        createdAt: playlist.createdAt ?? now, updatedAt: playlist.updatedAt ?? now,
      }));
      const incoming = parseSavedData(JSON.stringify({ version: 2, likedTracks: data.likedTracks, playlists: importedPlaylists }));
      const playlists = [...state.playlists];
      for (const imported of incoming.playlists) {
        const index = playlists.findIndex((playlist) => playlist.id === imported.id);
        if (index < 0) playlists.push(imported);
        else playlists[index] = { ...playlists[index], tracks: uniqueTracks([...playlists[index].tracks, ...imported.tracks]), updatedAt: Date.now() };
      }
      if (playlists.length > 500) throw new Error("O backup excede o limite de 500 playlists neste aparelho.");
      update({ playlists, likedTracks: uniqueTracks([...state.likedTracks, ...incoming.likedTracks], 10000),
        likedTrackIds: [...new Set([...state.likedTrackIds, ...incoming.likedTrackIds])] });
      save();
    },
    loadSavedData: () => {
      if (get().hydrated) return Promise.resolve();
      if (hydratePromise) return hydratePromise;
      hydratePromise = (async () => {
        try {
          const results = await AsyncStorage.multiGet([STORAGE_KEY, LEGACY_LIKES_KEY, LEGACY_RECENTS_KEY]);
          const raw = results[0][1];
          let saved: SavedPlayerData;
          if (raw) saved = parseSavedData(raw);
          else {
            const recentTracks = validatedTracks(results[2][1] ? JSON.parse(results[2][1]!) : [], 100);
            const legacy = results[1][1] ? JSON.parse(results[1][1]!) : [];
            const likedTracks = validatedTracks(legacy, 10000);
            const likedTrackIds = [...new Set([...validatedIds(legacy), ...likedTracks.map((track) => track.id)])];
            saved = { version: 2, likedTracks: uniqueTracks([...likedTracks, ...recentTracks.filter((track) => likedTrackIds.includes(track.id))], 10000), likedTrackIds,
              recentTracks, playlists: [], queue: [], currentTrackId: null, positionMs: 0, shuffle: false, repeatMode: "off", volume: 1, playbackRate: 1, reducedMotion: false, lyricsOffsetMs: 0 };
          }
          const current = get();
          const queue = dirtyFields.has("queue") ? current.queue : saved.queue;
          const currentTrack = dirtyFields.has("currentTrack") ? current.currentTrack : queue.find((track) => track.id === saved.currentTrackId) || null;
          const likedTrackIds = dirtyFields.has("likedTrackIds") ? [...new Set([...saved.likedTrackIds, ...current.likedTrackIds])] : saved.likedTrackIds;
          update({
            queue, currentTrack, currentIndex: currentTrack ? queue.findIndex((track) => track.id === currentTrack.id) : -1,
            positionMs: dirtyFields.has("currentTrack") ? current.positionMs : Math.min(saved.positionMs, currentTrack?.durationMs || saved.positionMs),
            durationMs: currentTrack?.durationMs || 0,
            likedTrackIds, likedTracks: uniqueTracks([...current.likedTracks, ...saved.likedTracks], 10000).filter((track) => likedTrackIds.includes(track.id)),
            recentTracks: dirtyFields.has("recentTracks") ? current.recentTracks : saved.recentTracks,
            playlists: dirtyFields.has("playlists") ? [...current.playlists, ...saved.playlists.filter((playlist) => !current.playlists.some((item) => item.id === playlist.id))] : saved.playlists,
            shuffle: dirtyFields.has("shuffle") ? current.shuffle : saved.shuffle,
            repeatMode: dirtyFields.has("repeatMode") ? current.repeatMode : saved.repeatMode,
            repeat: (dirtyFields.has("repeatMode") ? current.repeatMode : saved.repeatMode) !== "off",
            volume: dirtyFields.has("volume") ? current.volume : saved.volume,
            playbackRate: dirtyFields.has("playbackRate") ? current.playbackRate : saved.playbackRate,
            reducedMotion: dirtyFields.has("reducedMotion") ? current.reducedMotion : saved.reducedMotion,
            lyricsOffsetMs: dirtyFields.has("lyricsOffsetMs") ? current.lyricsOffsetMs : saved.lyricsOffsetMs,
            hydrated: true, isPlaying: false, isLoading: false,
          });
          resetTraversal(currentTrack);
          // Migration only writes after a successful validated read; corrupt data is retained for recovery.
          if (!raw && (results[1][1] || results[2][1])) save();
        } catch {
          update({ hydrated: true, error: "Não foi possível carregar a biblioteca salva. Os dados existentes foram preservados." });
        }
      })();
      return hydratePromise;
    },
  };
});

/** Flush pending library changes before tests, exports, or an explicit app shutdown. */
export async function flushPlayerPersistence(): Promise<void> { await writeChain; }
