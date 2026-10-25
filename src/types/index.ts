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

export type MixVolumeType = 'overlap' | 'fade' | 'cut' | 'equal_power' | 'linear';
export type MixEQType = 'end_bass_swap' | 'center_bass_swap' | 'early_bass_swap' | 'bass_cut' | 'flat' | 'none';
export type MixEffectType = 'echo' | 'low_pass' | 'high_pass' | 'reverb' | 'rise' | 'none';
export type MixPreset = 'auto' | 'custom' | 'fade' | 'rise' | 'blend' | 'bass_drop';

export interface TrackTransitionConfig {
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
