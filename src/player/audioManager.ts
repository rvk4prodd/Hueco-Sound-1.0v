import { createAudioPlaylist, setAudioModeAsync } from "expo-audio";
import type { AudioPlaylist, AudioPlaylistStatus } from "expo-audio";
import { isRunningInExpoGo } from "expo";
import { Track } from "../types";
import { originalPlaybackSource, retainPreparedSources } from "./prepareSource";
import { transitionGain } from './transitions';
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

/** One native Media3/AVQueuePlayer session; no hidden players or polling intervals. */
export class AudioManager {
  private player: AudioPlaylist | null = null;
  private modePromise: Promise<void> | null = null;
  private subscriptions: Subscription[] = [];
  private tracks: Track[] = [];
  private urls: string[] = [];
  private version = 0;
  private upcomingVersion = 0;
  private options: PlaybackOptions | null = null;
  private preparedResolve: ((loaded: boolean) => void) | null = null;
  private reportedTrackId: string | null = null;
  private transition: AudioTransition = 'direct';
  private transitionSeconds = 3;
  private fadeCurve: FadeCurve = 'smooth';
  private lastTime = 0;
  private lastDuration = 0;

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

  async loadAndPlay(url: string, track: Track, onStatusUpdate: (status: PlaybackStatus) => void, options: PlaybackOptions): Promise<void> {
    this.stop();
    const version = this.version;
    await this.init();
    if (version !== this.version) return;
    const player = createAudioPlaylist({ sources: [url], updateInterval: 250, loop: options.loopOne ? "single" : "none" });
    this.player = player;
    this.tracks = [track];
    this.urls = [url];
    this.retainSources();
    this.reportedTrackId = track.id;
    this.options = options;
    this.lastTime = 0; this.lastDuration = 0;
    this.applyVolume();
    player.playbackRate = options.playbackRate;
    let playbackError: string | null = null;
    this.subscriptions = [
      player.addListener("playlistStatusUpdate", (status) => {
        if (this.player !== player || version !== this.version) return;
        const playingTrack = this.tracks[status.currentIndex];
        if (!playingTrack) return;
        const error = errorMessage((status as NativeStatus).error);
        this.lastTime = status.currentTime; this.lastDuration = status.duration;
        this.applyVolume();
        if (error) playbackError = error;
        if (status.isLoaded || error) this.preparedResolve?.(!error);
        onStatusUpdate({ ...status, trackId: playingTrack.id, sourceUrl: originalPlaybackSource(this.urls[status.currentIndex]), error });
      }),
      player.addListener("trackChanged", ({ currentIndex }) => {
        if (this.player !== player || version !== this.version) return;
        const playingTrack = this.tracks[currentIndex];
        if (!playingTrack || playingTrack.id === this.reportedTrackId) return;
        this.reportedTrackId = playingTrack.id;
        this.lastTime = 0; this.lastDuration = 0; this.applyVolume();
        this.retainSources();
        this.activateMetadata(playingTrack);
        this.options?.onTrackChange(playingTrack);
      }),
    ];
    this.activateMetadata(track);
    // Guard against native streams that stall forever without emitting an error.
    const prepared = new Promise<boolean>((resolve) => { this.preparedResolve = resolve; });
    const timeout = setTimeout(() => this.preparedResolve?.(false), 30_000);
    try {
      player.play();
      const loaded = player.isLoaded || await prepared;
      if (version !== this.version) return;
      if (!loaded || playbackError) throw new Error(playbackError || "O áudio demorou demais para carregar. Verifique sua conexão e tente novamente.");
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
    this.player?.setActiveForLockScreen(true, {
      title: track.title,
      artist: track.artists,
      albumTitle: track.albumTitle,
      artworkUrl: /^https?:\/\//.test(track.coverUrl) ? track.coverUrl : undefined,
    }, { showNextTrack: true, showPreviousTrack: true });
  }

  private retainSources(): void {
    const index = this.player?.currentIndex || 0;
    retainPreparedSources(this.urls.slice(Math.max(0, index - 1), index + 3));
  }

  /** Keep a small window resolved ahead; the OS advances without a JS round trip. */
  async setUpcoming(tracks: Track[], resolve: (track: Track) => Promise<string>): Promise<void> {
    const player = this.player;
    if (!player) return;
    const version = ++this.upcomingVersion;
    const current = player.currentIndex;
    for (let index = this.tracks.length - 1; index > current; index--) {
      this.tracks.splice(index, 1);
      this.urls.splice(index, 1);
      player.remove(index);
    }
    this.retainSources();
    for (const track of tracks.slice(0, 2)) {
      try {
        const url = await resolve(track);
        if (this.player !== player || this.upcomingVersion !== version) return;
        player.add({ uri: url });
        this.tracks.push(track);
        this.urls.push(url);
        this.retainSources();
      } catch {
        // Explicit Next retries this track and surfaces its error.
        return;
      }
    }
  }

  skipToTrack(id: string): boolean {
    if (!this.player) return false;
    const index = this.tracks.findIndex((track) => track.id === id);
    if (index < 0) return false;
    try {
      this.player.skipTo(index);
      this.player.play();
      return true;
    } catch { return false; }
  }

  /** Queue edits must also remove historical native entries used by notification Previous. */
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

  pause(): void { this.player?.pause(); }
  resume(): void { this.player?.play(); }
  async seekTo(positionMs: number): Promise<void> { await this.player?.seekTo(Math.max(0, positionMs) / 1000); }
  setVolume(value: number): void { if (this.options) this.options.volume = value; this.applyVolume(); }
  configureTransition(mode: AudioTransition, seconds: number, curve: FadeCurve): void {
    this.transition = mode;
    this.transitionSeconds = Number.isFinite(seconds) ? Math.min(8, Math.max(1, seconds)) : 3;
    this.fadeCurve = curve;
    this.applyVolume();
  }
  private applyVolume(): void {
    if (!this.player || !this.options) return;
    const gain = this.transition === 'fade' ? transitionGain(this.lastTime, this.lastDuration, this.transitionSeconds, this.fadeCurve) : 1;
    this.player.volume = this.options.volume * gain;
  }
  setPlaybackRate(value: number): void { if (this.player) this.player.playbackRate = value; }
  setRepeatOne(enabled: boolean): void { if (this.player) this.player.loop = enabled ? "single" : "none"; }

  stop(): void {
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
      try { player.pause(); } catch { /* Released by the OS. */ }
      try { player.clearLockScreenControls(); } catch { /* Already unregistered. */ }
      try { player.destroy(); } catch { /* Already destroyed. */ }
      try { player.release(); } catch { /* Shared native object already released. */ }
    }
  }
}

export const audioManager = new AudioManager();
