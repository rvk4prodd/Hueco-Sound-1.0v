import { createAudioPlayer, createAudioPlaylist, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer, AudioPlaylist, AudioPlaylistStatus } from "expo-audio";
import { isRunningInExpoGo } from "expo";
import { Track } from "../types";
import { originalPlaybackSource, retainPreparedSources } from "./prepareSource";
import { calculateCrossfadeFactors, CrossfadeCurve, transitionGain } from './transitions';
import type { AudioTransition, FadeCurve } from '../preferences/experience';
import { applyNativeEffects, type NativeEffectsConfig } from './nativeEffects';

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
  private mixVersion = 0;
  private crossfadeTimer: ReturnType<typeof setInterval> | null = null;
  private crossfadeSubscription: Subscription | null = null;
  private crossfadeWatchdog: ReturnType<typeof setTimeout> | null = null;
  private preparedAuxTrackId: string | null = null;
  private preparedAuxInCue = 0;
  private auxVersion = 0;
  private auxReady: Promise<boolean> | null = null;
  private cancelAuxReady: (() => void) | null = null;
  private handoverPending = false;
  private paused = false;
  private lastTime = 0;
  private lastDuration = 0;

  // Experience transitions
  private transition: AudioTransition = 'direct';
  private transitionSeconds = 3;
  private fadeCurve: FadeCurve = 'smooth';
  private normalizationFactor = 1.0;
  private reverbLevel = 0;
  private studio: NativeEffectsConfig | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private incomingFadeComplete = false;

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
    this.paused = false;
    player.playbackRate = options.playbackRate;
    if (this.studio) applyNativeEffects(this.studio);
    this.lastTime = 0;
    this.lastDuration = 0;
    this.incomingFadeComplete = false;
    this.applyVolume();

    let playbackError: string | null = null;
    let lastStatus: PlaybackStatus | null = null, lastProgressAt = Date.now(), healthFailed = false;
    this.subscriptions = [
      player.addListener("playlistStatusUpdate", (status) => {
        if (this.player !== player || version !== this.version) return;

        const error = errorMessage((status as NativeStatus).error);
        if (error) playbackError = error;
        if (status.isLoaded || error || status.currentTime > 0) {
          this.preparedResolve?.(!error);
        }

        // Native transitions briefly report -1; never attribute them to the first song.
        if (status.currentIndex < 0) return;
        const effectiveIndex = status.currentIndex;
        const playingTrack = this.tracks[effectiveIndex];
        if (!playingTrack) {
          if (error) {
            onStatusUpdate({
              ...status,
              trackId: track.id,
              sourceUrl: originalPlaybackSource(url),
              error,
            });
          }
          return;
        }

        this.lastTime = status.currentTime;
        this.lastDuration = status.duration > 0 ? status.duration : (playingTrack.durationMs ? playingTrack.durationMs / 1000 : 0);
        this.applyVolume();

        if (this.isCrossfading && !this.handoverPending && status.isLoaded && !status.isBuffering && !status.didJustFinish && status.currentTime < status.duration - .6) {
          // The notification/headset controls the primary MediaSession. Mirror it to the other deck.
          if (!status.playing && !this.paused) { this.paused = true; this.auxPlayer?.pause(); }
          else if (status.playing && this.paused) { this.paused = false; this.auxPlayer?.play(); }
        }
        if (this.isCrossfading && playingTrack.id !== this.reportedTrackId) return;

        const currentStatus: PlaybackStatus = {
          ...status,
          trackId: playingTrack.id,
          sourceUrl: originalPlaybackSource(this.urls[effectiveIndex] || url),
          error,
        };
        if (!lastStatus || lastStatus.trackId !== currentStatus.trackId || Math.abs(currentStatus.currentTime - lastStatus.currentTime) > .01 || !currentStatus.playing && !currentStatus.isBuffering) lastProgressAt = Date.now();
        lastStatus = currentStatus;
        onStatusUpdate(currentStatus);
      }),
      player.addListener("trackChanged", ({ currentIndex }) => {
        if (this.player !== player || version !== this.version) return;
        const playingTrack = this.tracks[currentIndex];
        if (!playingTrack || playingTrack.id === this.reportedTrackId) return;
        if (this.isCrossfading) return;
        this.reportedTrackId = playingTrack.id;
        this.incomingFadeComplete = false;
        this.lastTime = 0;
        this.lastDuration = playingTrack.durationMs ? playingTrack.durationMs / 1000 : 0;
        this.applyVolume();
        this.retainSources();
        this.activateMetadata(playingTrack);
        this.options?.onTrackChange(playingTrack);
      }),
    ];

    this.activateMetadata(track);

    const prepared = new Promise<boolean>((resolve) => { this.preparedResolve = resolve; });
    const timeout = setTimeout(() => this.preparedResolve?.(false), 20_000);
    try {
      player.play();
      const loaded = player.isLoaded || await prepared;
      if (version !== this.version) return;
      if (!loaded || playbackError) {
        throw new Error(playbackError || "O áudio demorou demais para carregar. Verifique sua conexão e tente novamente.");
      }
      lastProgressAt = Date.now();
      this.healthTimer = setInterval(() => {
        if (version !== this.version || this.player !== player || healthFailed || !lastStatus) return;
        if (this.paused || this.isCrossfading || (!lastStatus.playing && !lastStatus.isBuffering) || lastStatus.didJustFinish) { lastProgressAt = Date.now(); return; }
        if (Date.now() - lastProgressAt < 12_000) return;
        healthFailed = true;
        onStatusUpdate({ ...lastStatus, error: 'A fonte de áudio parou de responder.', isBuffering: false, playing: false });
      }, 1_000);
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
    if (!player || this.isCrossfading) return;
    const version = ++this.upcomingVersion;
    if (player.currentIndex < 0) return;
    const current = Math.max(0, player.currentIndex);
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
        // Register JS identity before native add emits synchronous status events.
        this.tracks.push(track);
        this.urls.push(url);
        try { player.add({ uri: url }); }
        catch (error) { this.tracks.pop(); this.urls.pop(); throw error; }
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
    if (this.preparedAuxTrackId === track.id && this.auxPlayer && this.preparedAuxInCue === inCueSec) {
      return this.auxReady || this.auxPlayer.isLoaded;
    }
    this.cleanupAuxPlayer();

    try {
      const aux = createAudioPlayer({ uri: url }, { updateInterval: 50 });
      this.auxPlayer = aux;
      this.preparedAuxTrackId = track.id;
      this.preparedAuxInCue = inCueSec;
      aux.volume = 0;
      aux.playbackRate = this.options?.playbackRate || 1;
      if (this.studio) applyNativeEffects(this.studio);
      const generation = this.auxVersion;
      this.auxReady = new Promise<boolean>(resolve => {
        let done = false;
        let listener: Subscription | undefined;
        const finish = (loaded: boolean) => {
          if (done) return;
          done = true; clearTimeout(timeout); listener?.remove();
          this.cancelAuxReady = null; resolve(loaded);
        };
        const timeout = setTimeout(() => finish(false), 8_000);
        this.cancelAuxReady = () => finish(false);
        listener = aux.addListener('playbackStatusUpdate', status => {
          if (this.auxPlayer !== aux || generation !== this.auxVersion) { finish(false); return; }
          if ((status as { error?: unknown }).error) finish(false);
          else if (status.isLoaded) finish(true);
        });
        if (aux.isLoaded) finish(true);
      }).then(async loaded => {
        if (!loaded || this.auxPlayer !== aux || generation !== this.auxVersion) return false;
        if (inCueSec > 0) await aux.seekTo(inCueSec);
        return this.auxPlayer === aux && generation === this.auxVersion;
      }).catch(() => false);
      const ready = await this.auxReady;
      if (!ready && this.auxPlayer === aux && generation === this.auxVersion) this.cleanupAuxPlayer();
      return ready;
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
    onHandover: (handedOverNatively?: boolean) => void,
  ): Promise<void> {
    const player = this.player;
    if (!player || this.isCrossfading) return;
    const version = this.version;
    this.isCrossfading = true;
    const mixVersion = ++this.mixVersion;

    const effectiveSec = Math.max(1, Math.min(16, durationSec));

    // Ensure auxPlayer is ready
    if (!this.auxPlayer || this.preparedAuxTrackId !== nextTrack.id || this.preparedAuxInCue !== inCueSec) {
      // Find in existing urls or fallback
      const trackIndex = this.tracks.findIndex(t => t.id === nextTrack.id);
      const url = trackIndex >= 0 ? this.urls[trackIndex] : null;
      if (url) {
        await this.prepareAuxTrack(nextTrack, url, inCueSec);
      }
    }

    const aux = this.auxPlayer;
    const ready = aux && await this.auxReady;
    if (version !== this.version || mixVersion !== this.mixVersion || !this.isCrossfading) return;
    if (!aux || !ready || !aux.isLoaded || aux !== this.auxPlayer || this.preparedAuxTrackId !== nextTrack.id) {
      this.abortCrossfade();
      onHandover(false);
      return;
    }

    const startPosition = aux.currentTime;
    const totalMs = effectiveSec * 1000;

    try {
      aux.volume = 0;
      if (!this.paused) aux.play();
    } catch {
      this.abortCrossfade();
      onHandover(false);
      return;
    }

    let lastPosition = startPosition, stalledMs = 0, lastTick = Date.now();

    // High frequency volume interpolation loop
    const tick = () => {
      if (version !== this.version || mixVersion !== this.mixVersion || aux !== this.auxPlayer) return;
      if (!this.isCrossfading || !this.player || !this.auxPlayer) {
        if (this.crossfadeTimer) clearInterval(this.crossfadeTimer);
        this.crossfadeTimer = null;
        return;
      }
      const now = Date.now(), elapsedTick = Math.max(0, now - lastTick);
      lastTick = now;
      if (this.paused || this.handoverPending) return;
      stalledMs = aux.currentTime > lastPosition + .001 ? 0 : stalledMs + elapsedTick;
      lastPosition = aux.currentTime;
      if (stalledMs > 8_000) { this.abortCrossfade(); onHandover(false); return; }
      if (!aux.isLoaded) return;

      // Advance with audio, not wall time: pause and buffering must freeze the mix.
      const elapsed = Math.max(0, aux.currentTime - startPosition) * 1000;
      const progress = Math.min(1, Math.max(0, elapsed / totalMs));
      const { outFactor, inFactor } = calculateCrossfadeFactors(progress, curve);

      try {
        const masterVolume = (this.options?.volume ?? 1) * this.normalizationFactor;
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
        void this.finalizeCrossfade(nextTrack, aux.currentTime, onHandover, mixVersion);
      }
    };
    // Native status events keep the mix progressing when Android throttles JS timers.
    this.crossfadeSubscription = aux.addListener('playbackStatusUpdate', tick);
    this.crossfadeTimer = setInterval(tick, 25);
  }

  private async finalizeCrossfade(nextTrack: Track, finalPositionSec: number, onHandover: (handedOverNatively?: boolean) => void, mixVersion: number): Promise<void> {
    if (this.handoverPending) return;
    this.handoverPending = true;
    this.crossfadeSubscription?.remove(); this.crossfadeSubscription = null;
    const version = this.version;
    if (this.crossfadeWatchdog) {
      clearTimeout(this.crossfadeWatchdog);
      this.crossfadeWatchdog = null;
    }
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    const player = this.player;

    // Advance primary player to nextTrack
    const nextIndex = this.tracks.findIndex(t => t.id === nextTrack.id);
    let handedOverNatively = false;
    if (player && nextIndex >= 0) {
      try {
        player.volume = 0;
        player.skipTo(nextIndex);
        // Keep the auxiliary deck audible until the primary is ready and seek completes.
        await new Promise<void>((resolve, reject) => {
          let subscription: Subscription | undefined;
          const timer = setTimeout(() => { subscription?.remove(); reject(new Error('Handover timeout')); }, 6_000);
          const check = (status: AudioPlaylistStatus) => {
            if (this.version !== version || mixVersion !== this.mixVersion || !this.isCrossfading) { clearTimeout(timer); subscription?.remove(); reject(new Error('Obsolete handover')); }
            else if (status.currentIndex === nextIndex && status.isLoaded) { clearTimeout(timer); subscription?.remove(); resolve(); }
          };
          subscription = player.addListener('playlistStatusUpdate', check);
          check(player.currentStatus);
        });
        if (version !== this.version || mixVersion !== this.mixVersion || !this.isCrossfading) return;
        if (finalPositionSec > 0) {
          await player.seekTo(this.auxPlayer?.currentTime || finalPositionSec);
        }
        if (version !== this.version || mixVersion !== this.mixVersion || !this.isCrossfading) return;
        this.lastTime = this.auxPlayer?.currentTime || finalPositionSec;
        this.lastDuration = nextTrack.durationMs / 1000;
        if (this.paused) player.pause(); else player.play();
        handedOverNatively = true;
      } catch {
        // Fallback
      }
    }

    // Clean up auxiliary deck
    if (version !== this.version || mixVersion !== this.mixVersion) return;
    this.cleanupAuxPlayer();
    this.isCrossfading = false;
    this.handoverPending = false;
    this.incomingFadeComplete = handedOverNatively;
    this.applyVolume();

    // Activate lockscreen metadata for Track B
    if (handedOverNatively) {
      this.reportedTrackId = nextTrack.id;
      this.activateMetadata(nextTrack);
    }
    onHandover(handedOverNatively);
  }

  abortCrossfade(): void {
    this.mixVersion++;
    this.crossfadeSubscription?.remove(); this.crossfadeSubscription = null;
    if (this.crossfadeWatchdog) {
      clearTimeout(this.crossfadeWatchdog);
      this.crossfadeWatchdog = null;
    }
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    this.isCrossfading = false;
    this.handoverPending = false;
    this.cleanupAuxPlayer();
    this.applyVolume();
  }

  private cleanupAuxPlayer(): void {
    this.auxVersion++;
    this.cancelAuxReady?.(); this.cancelAuxReady = null; this.auxReady = null;
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
    this.paused = false;
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
    this.paused = true;
    this.player?.pause();
    if (this.isCrossfading && this.auxPlayer) {
      try { this.auxPlayer.pause(); } catch { /* Ignore */ }
    }
  }

  resume(): void {
    this.paused = false;
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

  setNormalization(mode: import('../types').AudioNormalizationMode): void {
    if (mode === 'balanced') this.normalizationFactor = 0.9;
    else if (mode === 'quiet') this.normalizationFactor = 0.75;
    else if (mode === 'loud') this.normalizationFactor = 1.0;
    else this.normalizationFactor = 1.0;
    this.applyVolume();
  }

  setSlowedReverb(speed: number, reverbLevel: number): void {
    this.reverbLevel = Math.max(0, Math.min(1, reverbLevel));
    if (this.player) {
      this.player.playbackRate = speed;
    }
    this.applyVolume();
  }

  configureStudio(config: NativeEffectsConfig): boolean {
    this.studio = config;
    return applyNativeEffects(config);
  }

  private applyVolume(): void {
    if (!this.player || !this.options || this.isCrossfading) return;
    // The dual deck owns the outgoing fade. A second fade here could mute a track
    // before the incoming source was ready, leaving the player apparently stuck.
    const gain = this.transition === 'fade' && !this.incomingFadeComplete ? transitionGain(this.lastTime, 0, this.transitionSeconds, this.fadeCurve) : 1;
    this.player.volume = Math.max(0, Math.min(1, this.options.volume * gain * this.normalizationFactor));
  }

  setPlaybackRate(value: number): void {
    if (this.player) this.player.playbackRate = value;
  }

  setRepeatOne(enabled: boolean): void {
    if (this.player) this.player.loop = enabled ? "single" : "none";
  }

  stop(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
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

  async recoverEngine(): Promise<void> {
    this.stop();
    this.modePromise = null;
    await this.init();
  }
}

export const audioManager = new AudioManager();
