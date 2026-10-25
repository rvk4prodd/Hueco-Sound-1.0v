import { createAudioPlayer, createAudioPlaylist, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer, AudioPlaylist, AudioPlaylistStatus } from "expo-audio";
import { isRunningInExpoGo } from "expo";
import { Track } from "../types";
import { originalPlaybackSource, retainPreparedSources } from "./prepareSource";
import { calculateCrossfadeFactors, CrossfadeCurve, transitionGain } from './transitions';
import type { AudioTransition, FadeCurve } from '../preferences/experience';

export interface PlaybackStatus {
  trackId: string;
  sourceUrl?: string;
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
  error: string | null;
}

interface PlaybackOptions {
  volume: number;
  playbackRate: number;
  loopOne: boolean;
  onTrackChange: (track: Track) => void;
}

type Subscription = { remove: () => void };
type NativeStatus = AudioPlaylistStatus & { error?: string | { message?: string; code?: number } | null };

function errorMessage(error: NativeStatus["error"]): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  const message = error.message || "Não foi possível reproduzir esta música.";
  return typeof error.code === 'number' ? `${message} (código ${error.code})` : message;
}

/**
 * Dual-deck native audio manager for Hueco Sound.
 * - Primary deck (AudioPlaylist) holds native MediaSession, Samsung One UI notification, and Bluetooth AVRCP controls.
 * - Auxiliary deck (AudioPlayer) provides simultaneous dual-channel crossfading without gaps or silences.
 */
export class AudioManager {
  private player: AudioPlaylist | null = null;
  private auxPlayer: AudioPlayer | null = null;
  private modePromise: Promise<void> | null = null;
  private subscriptions: Subscription[] = [];
  private tracks: Track[] = [];
  private urls: string[] = [];
  private version = 0;
  private upcomingVersion = 0;
  private options: PlaybackOptions | null = null;
  private preparedResolve: ((loaded: boolean) => void) | null = null;
  private reportedTrackId: string | null = null;

  // Crossfading state
  private isCrossfading = false;
  private crossfadeTimer: ReturnType<typeof setInterval> | null = null;
  private crossfadeWatchdog: ReturnType<typeof setTimeout> | null = null;
  private preparedAuxTrackId: string | null = null;
  private preparedAuxInCue = 0;
  private lastTime = 0;
  private lastDuration = 0;

  // Experience transitions
  private transition: AudioTransition = 'direct';
  private transitionSeconds = 3;
  private fadeCurve: FadeCurve = 'smooth';

  init(): Promise<void> {
    if (!this.modePromise) {
      this.modePromise = setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: !isRunningInExpoGo(),
        allowsRecording: false,
        interruptionMode: "doNotMix",
      }).catch((error: unknown) => {
        this.modePromise = null;
        throw error;
      });
    }
    return this.modePromise;
  }

  get hasPlayer(): boolean { return this.player !== null; }
  get currentTrackId(): string | null {
    const index = this.player?.currentIndex ?? -1;
    return this.tracks[index]?.id ?? null;
  }
  get activelyCrossfading(): boolean { return this.isCrossfading; }

  async loadAndPlay(url: string, track: Track, onStatusUpdate: (status: PlaybackStatus) => void, options: PlaybackOptions): Promise<void> {
    this.stop();
    const version = this.version;
    await this.init();
    if (version !== this.version) return;

    const player = createAudioPlaylist({ sources: [url], updateInterval: 200, loop: options.loopOne ? "single" : "none" });
    this.player = player;
    this.tracks = [track];
    this.urls = [url];
    this.retainSources();
    this.reportedTrackId = track.id;
    this.options = options;
    player.playbackRate = options.playbackRate;
    this.lastTime = 0;
    this.lastDuration = 0;
    this.applyVolume();

    let playbackError: string | null = null;
    this.subscriptions = [
      player.addListener("playlistStatusUpdate", (status) => {
        if (this.player !== player || version !== this.version) return;
        const playingTrack = this.tracks[status.currentIndex];
        if (!playingTrack) return;
        const error = errorMessage((status as NativeStatus).error);
        if (error) playbackError = error;
        if (status.isLoaded || error) this.preparedResolve?.(!error);

        this.lastTime = status.currentTime;
        this.lastDuration = status.duration;
        this.applyVolume();

        onStatusUpdate({
          ...status,
          trackId: playingTrack.id,
          sourceUrl: originalPlaybackSource(this.urls[status.currentIndex]),
          error,
        });
      }),
      player.addListener("trackChanged", ({ currentIndex }) => {
        if (this.player !== player || version !== this.version) return;
        const playingTrack = this.tracks[currentIndex];
        if (!playingTrack || playingTrack.id === this.reportedTrackId) return;
        this.reportedTrackId = playingTrack.id;
        this.lastTime = 0;
        this.lastDuration = 0;
        this.applyVolume();
        this.retainSources();
        this.activateMetadata(playingTrack);
        this.options?.onTrackChange(playingTrack);
      }),
    ];

    this.activateMetadata(track);

    const prepared = new Promise<boolean>((resolve) => { this.preparedResolve = resolve; });
    const timeout = setTimeout(() => this.preparedResolve?.(false), 30_000);
    try {
      player.play();
      const loaded = player.isLoaded || await prepared;
      if (version !== this.version) return;
      if (!loaded || playbackError) {
        throw new Error(playbackError || "O áudio demorou demais para carregar. Verifique sua conexão e tente novamente.");
      }
    } catch (error) {
      if (version === this.version) this.stop();
      throw error;
    } finally {
      clearTimeout(timeout);
      if (version === this.version) this.preparedResolve = null;
    }
  }

  private activateMetadata(track: Track): void {
    if (isRunningInExpoGo()) return;
    try {
      this.player?.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artists,
        albumTitle: track.albumTitle,
        artworkUrl: /^https?:\/\//.test(track.coverUrl) ? track.coverUrl : undefined,
      }, {
        showNextTrack: true,
        showPreviousTrack: true,
      });
    } catch {
      // Ignore if lock screen controls fail on older OS
    }
  }

  private retainSources(): void {
    const index = this.player?.currentIndex || 0;
    retainPreparedSources(this.urls.slice(Math.max(0, index - 1), index + 3));
  }

  /**
   * Pre-buffers upcoming track in the native playlist so the OS advances seamlessly.
   */
  async setUpcoming(tracks: Track[], resolve: (track: Track) => Promise<string>): Promise<void> {
    const player = this.player;
    if (!player) return;
    const version = ++this.upcomingVersion;
    const current = player.currentIndex;
    const desired = tracks.slice(0, 2);
    const existing = this.tracks.slice(current + 1);
    if (existing.length === desired.length && existing.every((t, i) => t.id === desired[i]?.id)) {
      return; // Already prebuffered natively
    }

    for (let index = this.tracks.length - 1; index > current; index--) {
      this.tracks.splice(index, 1);
      this.urls.splice(index, 1);
      try { player.remove(index); } catch { /* Ignore */ }
    }
    this.retainSources();

    for (const track of desired) {
      try {
        const url = await resolve(track);
        if (this.player !== player || this.upcomingVersion !== version) return;
        player.add({ uri: url });
        this.tracks.push(track);
        this.urls.push(url);
        this.retainSources();
      } catch {
        return;
      }
    }
  }

  /**
   * Pre-loads the auxiliary deck with Track B's stream URL at the designated in-cue point.
   */
  async prepareAuxTrack(track: Track, url: string, inCueSec = 0): Promise<boolean> {
    if (this.preparedAuxTrackId === track.id && this.auxPlayer) {
      return true;
    }
    this.cleanupAuxPlayer();

    try {
      const aux = createAudioPlayer({ uri: url }, { updateInterval: 50 });
      this.auxPlayer = aux;
      this.preparedAuxTrackId = track.id;
      this.preparedAuxInCue = inCueSec;
      aux.volume = 0;
      if (inCueSec > 0) {
        await aux.seekTo(inCueSec);
      }
      return true;
    } catch {
      this.cleanupAuxPlayer();
      return false;
    }
  }

  /**
   * Executes a simultaneous dual-player crossfade from the currently playing track to nextTrack.
   * Both tracks play concurrently during durationSec, interpolating volumes according to curve.
   */
  async executeCrossfade(
    nextTrack: Track,
    durationSec: number,
    curve: CrossfadeCurve = 'overlap',
    inCueSec = 0,
    onHandover: () => void,
  ): Promise<void> {
    const player = this.player;
    if (!player || this.isCrossfading) return;

    const masterVolume = this.options?.volume ?? 1;
    const effectiveSec = Math.max(1, Math.min(16, durationSec));

    // Ensure auxPlayer is ready
    if (!this.auxPlayer || this.preparedAuxTrackId !== nextTrack.id) {
      // Find in existing urls or fallback
      const trackIndex = this.tracks.findIndex(t => t.id === nextTrack.id);
      const url = trackIndex >= 0 ? this.urls[trackIndex] : null;
      if (url) {
        await this.prepareAuxTrack(nextTrack, url, inCueSec);
      }
    }

    const aux = this.auxPlayer;
    if (!aux) {
      // If aux deck is unavailable, fallback to skipToTrack
      this.skipToTrack(nextTrack.id);
      onHandover();
      return;
    }

    this.isCrossfading = true;
    const startTime = Date.now();
    const totalMs = effectiveSec * 1000;

    try {
      aux.volume = 0;
      aux.play();
    } catch {
      this.abortCrossfade();
      this.skipToTrack(nextTrack.id);
      onHandover();
      return;
    }

    // Safety watchdog to prevent hanging if an audio stream stalls
    this.crossfadeWatchdog = setTimeout(() => {
      if (this.isCrossfading) {
        this.finalizeCrossfade(nextTrack, inCueSec + effectiveSec, onHandover);
      }
    }, totalMs + 4000);

    // High frequency volume interpolation loop
    this.crossfadeTimer = setInterval(() => {
      if (!this.isCrossfading || !this.player || !this.auxPlayer) {
        if (this.crossfadeTimer) clearInterval(this.crossfadeTimer);
        this.crossfadeTimer = null;
        return;
      }

      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / totalMs));
      const { outFactor, inFactor } = calculateCrossfadeFactors(progress, curve);

      try {
        this.player.volume = Math.max(0, Math.min(1, masterVolume * outFactor));
        this.auxPlayer.volume = Math.max(0, Math.min(1, masterVolume * inFactor));
      } catch {
        // Ignore native volume assignment glitches
      }

      if (progress >= 1) {
        if (this.crossfadeTimer) {
          clearInterval(this.crossfadeTimer);
          this.crossfadeTimer = null;
        }
        this.finalizeCrossfade(nextTrack, inCueSec + effectiveSec, onHandover);
      }
    }, 25);
  }

  private finalizeCrossfade(nextTrack: Track, finalPositionSec: number, onHandover: () => void): void {
    if (this.crossfadeWatchdog) {
      clearTimeout(this.crossfadeWatchdog);
      this.crossfadeWatchdog = null;
    }
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    const player = this.player;
    const masterVolume = this.options?.volume ?? 1;

    // Advance primary player to nextTrack
    const nextIndex = this.tracks.findIndex(t => t.id === nextTrack.id);
    if (player && nextIndex >= 0) {
      try {
        player.skipTo(nextIndex);
        if (finalPositionSec > 0) {
          void player.seekTo(finalPositionSec);
        }
        player.volume = masterVolume;
        player.play();
      } catch {
        // Fallback
      }
    }

    // Clean up auxiliary deck
    this.cleanupAuxPlayer();
    this.isCrossfading = false;

    // Activate lockscreen metadata for Track B
    this.activateMetadata(nextTrack);
    onHandover();
  }

  abortCrossfade(): void {
    if (this.crossfadeWatchdog) {
      clearTimeout(this.crossfadeWatchdog);
      this.crossfadeWatchdog = null;
    }
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    this.isCrossfading = false;
    this.cleanupAuxPlayer();
    this.applyVolume();
  }

  private cleanupAuxPlayer(): void {
    if (this.auxPlayer) {
      try { this.auxPlayer.pause(); } catch { /* Ignore */ }
      try { this.auxPlayer.release(); } catch { /* Ignore */ }
      try { this.auxPlayer.remove(); } catch { /* Ignore */ }
      this.auxPlayer = null;
    }
    this.preparedAuxTrackId = null;
    this.preparedAuxInCue = 0;
  }

  skipToTrack(id: string): boolean {
    if (this.isCrossfading) this.abortCrossfade();
    if (!this.player) return false;
    const index = this.tracks.findIndex((track) => track.id === id);
    if (index < 0) return false;
    if (this.player.currentIndex === index) {
      this.player.play();
      return true;
    }
    try {
      this.player.skipTo(index);
      this.lastTime = 0;
      this.lastDuration = 0;
      this.applyVolume();
      this.player.play();
      return true;
    } catch { return false; }
  }

  retainTracks(ids: Set<string>): void {
    const player = this.player;
    if (!player) return;
    for (let index = this.tracks.length - 1; index >= 0; index--) {
      if (ids.has(this.tracks[index].id)) continue;
      this.tracks.splice(index, 1);
      this.urls.splice(index, 1);
      player.remove(index);
    }
    this.retainSources();
  }

  pause(): void {
    this.player?.pause();
    if (this.isCrossfading && this.auxPlayer) {
      try { this.auxPlayer.pause(); } catch { /* Ignore */ }
    }
  }

  resume(): void {
    this.player?.play();
    if (this.isCrossfading && this.auxPlayer) {
      try { this.auxPlayer.play(); } catch { /* Ignore */ }
    }
  }

  async seekTo(positionMs: number): Promise<void> {
    if (this.isCrossfading) {
      this.abortCrossfade();
    }
    await this.player?.seekTo(Math.max(0, positionMs) / 1000);
  }

  setVolume(value: number): void {
    if (this.options) this.options.volume = value;
    this.applyVolume();
  }

  configureTransition(mode: AudioTransition, seconds: number, curve: FadeCurve): void {
    this.transition = mode;
    this.transitionSeconds = Number.isFinite(seconds) ? Math.min(8, Math.max(1, seconds)) : 3;
    this.fadeCurve = curve;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.player || !this.options || this.isCrossfading) return;
    const gain = this.transition === 'fade' ? transitionGain(this.lastTime, this.lastDuration, this.transitionSeconds, this.fadeCurve) : 1;
    this.player.volume = this.options.volume * gain;
  }

  setPlaybackRate(value: number): void {
    if (this.player) this.player.playbackRate = value;
  }

  setRepeatOne(enabled: boolean): void {
    if (this.player) this.player.loop = enabled ? "single" : "none";
  }

  stop(): void {
    this.abortCrossfade();
    this.version++;
    this.upcomingVersion++;
    this.preparedResolve?.(false);
    this.preparedResolve = null;
    const player = this.player;
    this.player = null;
    this.options = null;
    this.tracks = [];
    this.urls = [];
    retainPreparedSources([]);
    this.reportedTrackId = null;
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions = [];
    if (player) {
      try { player.pause(); } catch { /* Released by the OS */ }
      try { player.clearLockScreenControls(); } catch { /* Already unregistered */ }
      try { player.destroy(); } catch { /* Already destroyed */ }
      try { player.release(); } catch { /* Shared native object already released */ }
    }
  }
}

export const audioManager = new AudioManager();
