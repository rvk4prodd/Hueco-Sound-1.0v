export interface Track {
  id: string;
  title: string;
  artists: string;
  coverUrl: string;
  durationMs: number;
  albumTitle?: string;
  explicit?: boolean;
  streamUrl?: string;
  source?: "youtube" | "soundcloud" | "local";
}

export interface LyricLine {
  startTimeMs: number;
  words: string;
  synced?: boolean;
}

export type MixVolumeType = 'overlap' | 'fade' | 'rise' | 'cut' | 'equal_power' | 'linear';
export type MixEQType = 'end_bass_swap' | 'center_bass_swap' | 'early_bass_swap' | 'bass_cut' | 'flat' | 'none';
export type MixEffectType = 'echo' | 'low_pass' | 'high_pass' | 'reverb' | 'rise' | 'none';
export type MixPreset = 'auto' | 'custom' | 'fade' | 'rise' | 'blend' | 'bass_drop';

export interface TrackTransitionConfig {
  curves?: import('../player/mixAutomation').MixCurves;
  effectAmount?: number;
  eqAmount?: number;
  bpm?: number;
  durationSeconds: number;
  volume: MixVolumeType;
  eq: MixEQType;
  effect: MixEffectType;
  preset: MixPreset;
  bars?: 2 | 4 | 8 | 16;
  inPointSec?: number;
  outPointSec?: number;
  inCueSec?: number;
  outCueSec?: number;
}

export interface PlaylistMixSettings {
  enabled: boolean;
  defaultConfig: TrackTransitionConfig;
  customTransitions?: Record<string, TrackTransitionConfig>;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
  mixSettings?: PlaylistMixSettings;
}

export type RepeatMode = "off" | "all" | "one";

export type TabType = "home" | "search" | "library";

// 1. Lyrics FX Studio
export type LyricsFXStyle = 'clean' | 'neon_amv' | 'kinetic_zoom' | 'subtle_shake' | 'karaoke_fill';

// 2. Audio FX Rack
export interface AudioEQBand {
  id: string;
  label: string;
  freq: number;
  gainDb: number; // -12dB to +12dB
}

export interface AudioFXSettings {
  enabled: boolean;
  preset: 'flat' | 'bass_boost' | 'treble_boost' | 'vocal_pop' | 'electronic' | 'acoustic' | 'rock' | 'lofi' | 'custom';
  bands: AudioEQBand[];
  compressorEnabled: boolean;
  compressorThreshold: number; // -40 to 0 dB
  compressorRatio: number; // 1 to 20
  stereoWidth: number; // 0 (mono) to 200 (extra wide), default 100
}

// 4. Music Visualizer
export type VisualizerMode = 'bars' | 'wave' | 'circle' | 'particles';

// 5. Slowed + Reverb Studio
export type SlowedReverbPreset =
  | 'none'
  | 'slowed_reverb'
  | 'ultra_slowed'
  | 'sped_up'
  | 'nightcore'
  | 'vaporwave'
  | 'hall';

export interface SlowedReverbSettings {
  enabled: boolean;
  preset: SlowedReverbPreset;
  speed: number; // 0.5x to 2.0x
  reverbLevel: number; // 0 to 1
  pitchSemitones: number; // -12 to +12
  isPitchLinked: boolean;
}

// 6. Smart Playlists
export interface SmartPlaylistRule {
  field: 'artist' | 'title' | 'duration' | 'playCount' | 'source';
  operator: 'contains' | 'greater_than' | 'less_than' | 'equals';
  value: string | number;
}

export interface SmartPlaylist {
  id: string;
  name: string;
  description: string;
  rules: SmartPlaylistRule[];
  limit: number;
  icon?: string;
  isSmart: true;
}

// 7 & 9. Listening Stats & Music Time Machine
export interface PlayHistoryEvent {
  trackId: string;
  title: string;
  artists: string;
  coverUrl: string;
  durationMs: number;
  playedAt: number; // timestamp
  secondsPlayed: number;
  completed: boolean;
}

// 8. Gesture Controls
export interface GestureControlsConfig {
  doubleTapSeekSeconds: number; // 5, 10, 15, 30
  swipeToChangeTrack: boolean;
  swipeToOpenPlayer: boolean;
  doubleTapLike: boolean;
}

// 10. DJ Hot Cues
export interface HotCuePoint {
  index: number; // 0, 1, 2, 3
  positionSec: number;
  color: string;
  label?: string;
}

// 11. AB Loop
export interface ABLoopState {
  enabled: boolean;
  pointA: number | null; // start position in seconds
  pointB: number | null; // end position in seconds
}

// 12. Audio Normalization
export type AudioNormalizationMode = 'off' | 'balanced' | 'loud' | 'quiet';

