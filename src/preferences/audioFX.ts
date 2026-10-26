import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ABLoopState,
  AudioEQBand,
  AudioFXSettings,
  HotCuePoint,
  PlayHistoryEvent,
  SlowedReverbPreset,
  SlowedReverbSettings,
  SmartPlaylist,
} from '../types';

export const DEFAULT_EQ_BANDS: AudioEQBand[] = [
  { id: 'sub', label: '60 Hz', freq: 60, gainDb: 0 },
  { id: 'bass', label: '250 Hz', freq: 250, gainDb: 0 },
  { id: 'mid', label: '1 kHz', freq: 1000, gainDb: 0 },
  { id: 'presence', label: '4 kHz', freq: 4000, gainDb: 0 },
  { id: 'air', label: '12 kHz', freq: 12000, gainDb: 0 },
];

export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0],
  bass_boost: [6, 4.5, 0, -1, -1.5],
  treble_boost: [-1, -0.5, 1, 4, 6],
  vocal_pop: [-2, 0, 4, 3, 1.5],
  electronic: [5.5, 3.5, -1, 3, 4],
  acoustic: [2, 1, 2, 2.5, 3],
  rock: [4, 2, -1, 2.5, 4.5],
  lofi: [1, 2, -2, -3, -6],
};

export const SLOWED_REVERB_PRESETS: Record<
  SlowedReverbPreset,
  { speed: number; reverb: number; pitch: number; linked: boolean }
> = {
  none: { speed: 1.0, reverb: 0.0, pitch: 0, linked: true },
  slowed_reverb: { speed: 0.85, reverb: 0.45, pitch: -2.8, linked: true },
  ultra_slowed: { speed: 0.78, reverb: 0.6, pitch: -4.3, linked: true },
  sped_up: { speed: 1.25, reverb: 0.2, pitch: 3.8, linked: true },
  nightcore: { speed: 1.35, reverb: 0.25, pitch: 5.2, linked: true },
  vaporwave: { speed: 0.8, reverb: 0.55, pitch: -3.8, linked: true },
  hall: { speed: 1.0, reverb: 0.4, pitch: 0, linked: false },
};

export const HOT_CUE_COLORS = ['#00e5ff', '#a855f7', '#10b981', '#f59e0b'];

export interface AudioFXStoreState {
  // Audio FX Rack
  audioFX: AudioFXSettings;
  setAudioFXEnabled: (enabled: boolean) => void;
  setEQPreset: (preset: AudioFXSettings['preset']) => void;
  setEQBandGain: (bandId: string, gainDb: number) => void;
  setCompressor: (enabled: boolean, threshold?: number, ratio?: number) => void;
  setStereoWidth: (width: number) => void;

  // Slowed + Reverb Studio
  slowedReverb: SlowedReverbSettings;
  applySlowedReverbPreset: (preset: SlowedReverbPreset) => void;
  setSlowedSpeed: (speed: number) => void;
  setReverbLevel: (level: number) => void;
  setPitchSemitones: (semitones: number) => void;
  setIsPitchLinked: (linked: boolean) => void;
  toggleSlowedReverb: (enabled: boolean) => void;

  // AB Loop
  abLoop: ABLoopState;
  setLoopPointA: (seconds: number | null) => void;
  setLoopPointB: (seconds: number | null) => void;
  toggleABLoop: (enabled?: boolean) => void;
  clearABLoop: () => void;
  nudgePointA: (delta: number) => void;
  nudgePointB: (delta: number) => void;

  // DJ Hot Cues (stored per trackId)
  hotCues: Record<string, HotCuePoint[]>;
  setHotCue: (trackId: string, index: number, positionSec: number) => void;
  clearHotCue: (trackId: string, index: number) => void;

  // Listening Stats & Music Time Machine
  playHistory: PlayHistoryEvent[];
  recordPlayEvent: (event: Omit<PlayHistoryEvent, 'playedAt'>) => void;
  clearPlayHistory: () => void;

  // Smart Playlists
  smartPlaylists: SmartPlaylist[];
  addSmartPlaylist: (playlist: Omit<SmartPlaylist, 'id' | 'isSmart'>) => string;
  removeSmartPlaylist: (id: string) => void;
}

export const defaultAudioFX: AudioFXSettings = {
  enabled: false,
  preset: 'flat',
  bands: DEFAULT_EQ_BANDS,
  compressorEnabled: false,
  compressorThreshold: -16,
  compressorRatio: 4,
  stereoWidth: 100,
};

export const defaultSlowedReverb: SlowedReverbSettings = {
  enabled: false,
  preset: 'none',
  speed: 1.0,
  reverbLevel: 0.0,
  pitchSemitones: 0,
  isPitchLinked: true,
};

export const defaultABLoop: ABLoopState = {
  enabled: false,
  pointA: null,
  pointB: null,
};

export const useAudioFXStore = create<AudioFXStoreState>()(
  persist(
    (set, get) => ({
      audioFX: defaultAudioFX,
      setAudioFXEnabled: (enabled) =>
        set((state) => ({ audioFX: { ...state.audioFX, enabled } })),
      setEQPreset: (preset) => {
        const gains = EQ_PRESETS[preset] || EQ_PRESETS.flat;
        set((state) => ({
          audioFX: {
            ...state.audioFX,
            preset,
            bands: state.audioFX.bands.map((b, i) => ({
              ...b,
              gainDb: gains[i] ?? 0,
            })),
          },
        }));
      },
      setEQBandGain: (bandId, gainDb) => {
        set((state) => ({
          audioFX: {
            ...state.audioFX,
            preset: 'custom',
            bands: state.audioFX.bands.map((b) =>
              b.id === bandId
                ? { ...b, gainDb: Math.max(-12, Math.min(12, gainDb)) }
                : b
            ),
          },
        }));
      },
      setCompressor: (enabled, threshold, ratio) => {
        set((state) => ({
          audioFX: {
            ...state.audioFX,
            compressorEnabled: enabled,
            compressorThreshold:
              threshold !== undefined
                ? threshold
                : state.audioFX.compressorThreshold,
            compressorRatio:
              ratio !== undefined ? ratio : state.audioFX.compressorRatio,
          },
        }));
      },
      setStereoWidth: (stereoWidth) => {
        set((state) => ({
          audioFX: {
            ...state.audioFX,
            stereoWidth: Math.max(0, Math.min(200, stereoWidth)),
          },
        }));
      },

      slowedReverb: defaultSlowedReverb,
      applySlowedReverbPreset: (preset) => {
        const cfg = SLOWED_REVERB_PRESETS[preset] || SLOWED_REVERB_PRESETS.none;
        set({
          slowedReverb: {
            enabled: preset !== 'none',
            preset,
            speed: cfg.speed,
            reverbLevel: cfg.reverb,
            pitchSemitones: cfg.pitch,
            isPitchLinked: cfg.linked,
          },
        });
      },
      setSlowedSpeed: (speed) => {
        const clamped = Math.max(0.5, Math.min(2.0, speed));
        set((state) => {
          const linkedPitch = state.slowedReverb.isPitchLinked
            ? Math.round(12 * (Math.log(clamped) / Math.LN2) * 10) / 10
            : state.slowedReverb.pitchSemitones;
          return {
            slowedReverb: {
              ...state.slowedReverb,
              preset: 'none',
              speed: clamped,
              pitchSemitones: linkedPitch,
            },
          };
        });
      },
      setReverbLevel: (reverbLevel) => {
        set((state) => ({
          slowedReverb: {
            ...state.slowedReverb,
            preset: 'none',
            reverbLevel: Math.max(0, Math.min(1, reverbLevel)),
          },
        }));
      },
      setPitchSemitones: (pitchSemitones) => {
        set((state) => ({
          slowedReverb: {
            ...state.slowedReverb,
            preset: 'none',
            pitchSemitones: Math.max(-12, Math.min(12, pitchSemitones)),
          },
        }));
      },
      setIsPitchLinked: (isPitchLinked) => {
        set((state) => ({
          slowedReverb: {
            ...state.slowedReverb,
            isPitchLinked,
          },
        }));
      },
      toggleSlowedReverb: (enabled) => {
        set((state) => ({
          slowedReverb: {
            ...state.slowedReverb,
            enabled,
          },
        }));
      },

      abLoop: defaultABLoop,
      setLoopPointA: (seconds) => {
        set((state) => {
          const validSec = seconds !== null ? Math.max(0, seconds) : null;
          const currentB = state.abLoop.pointB;
          const hasValidRange =
            validSec !== null && currentB !== null && currentB > validSec + 0.3;
          return {
            abLoop: {
              ...state.abLoop,
              pointA: validSec,
              enabled: hasValidRange,
            },
          };
        });
      },
      setLoopPointB: (seconds) => {
        set((state) => {
          const validSec = seconds !== null ? Math.max(0, seconds) : null;
          const currentA = state.abLoop.pointA;
          const hasValidRange =
            currentA !== null && validSec !== null && validSec > currentA + 0.3;
          return {
            abLoop: {
              ...state.abLoop,
              pointB: validSec,
              enabled: hasValidRange,
            },
          };
        });
      },
      toggleABLoop: (enabled) => {
        set((state) => ({
          abLoop: {
            ...state.abLoop,
            enabled:
              (enabled !== undefined ? enabled : !state.abLoop.enabled) &&
              state.abLoop.pointA !== null &&
              state.abLoop.pointB !== null &&
              state.abLoop.pointB > state.abLoop.pointA,
          },
        }));
      },
      clearABLoop: () => set({ abLoop: defaultABLoop }),
      nudgePointA: (delta) => {
        set((state) => {
          if (state.abLoop.pointA === null) return {};
          const newA = Math.max(0, state.abLoop.pointA + delta);
          const newB = state.abLoop.pointB;
          return {
            abLoop: {
              ...state.abLoop,
              pointA: newA,
              enabled: newB !== null && newB > newA + 0.3,
            },
          };
        });
      },
      nudgePointB: (delta) => {
        set((state) => {
          if (state.abLoop.pointB === null) return {};
          const newA = state.abLoop.pointA;
          const newB = Math.max(
            (newA ?? 0) + 0.3,
            state.abLoop.pointB + delta
          );
          return {
            abLoop: {
              ...state.abLoop,
              pointB: newB,
              enabled: newA !== null && newB > newA + 0.3,
            },
          };
        });
      },

      hotCues: {},
      setHotCue: (trackId, index, positionSec) => {
        set((state) => {
          const existing = state.hotCues[trackId] || [];
          const updated = [...existing.filter((c) => c.index !== index)];
          updated.push({
            index,
            positionSec: Math.max(0, positionSec),
            color: HOT_CUE_COLORS[index % HOT_CUE_COLORS.length],
          });
          updated.sort((a, b) => a.index - b.index);
          return {
            hotCues: {
              ...state.hotCues,
              [trackId]: updated,
            },
          };
        });
      },
      clearHotCue: (trackId, index) => {
        set((state) => ({
          hotCues: {
            ...state.hotCues,
            [trackId]: (state.hotCues[trackId] || []).filter(
              (c) => c.index !== index
            ),
          },
        }));
      },

      playHistory: [],
      recordPlayEvent: (event) => {
        const entry: PlayHistoryEvent = {
          ...event,
          playedAt: Date.now(),
        };
        set((state) => ({
          playHistory: [entry, ...state.playHistory].slice(0, 500),
        }));
      },
      clearPlayHistory: () => set({ playHistory: [] }),

      smartPlaylists: [
        {
          id: 'smart-most-played',
          name: 'Mais Tocadas',
          description: 'Músicas que você mais escutou no Hueco Sound.',
          rules: [{ field: 'playCount', operator: 'greater_than', value: 2 }],
          limit: 30,
          icon: 'flame',
          isSmart: true,
        },
        {
          id: 'smart-recent-discoveries',
          name: 'Descobertas Recentes',
          description: 'Músicas adicionadas ou descobertas recentemente.',
          rules: [{ field: 'duration', operator: 'greater_than', value: 60 }],
          limit: 25,
          icon: 'sparkles',
          isSmart: true,
        },
        {
          id: 'smart-marathon-long',
          name: 'Faixas Longas (> 3:30)',
          description: 'Produções completas para imersão sem cortes rápidos.',
          rules: [{ field: 'duration', operator: 'greater_than', value: 210 }],
          limit: 40,
          icon: 'timer',
          isSmart: true,
        },
      ],
      addSmartPlaylist: (item) => {
        const id = `smart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set((state) => ({
          smartPlaylists: [
            { ...item, id, isSmart: true },
            ...state.smartPlaylists,
          ],
        }));
        return id;
      },
      removeSmartPlaylist: (id) => {
        set((state) => ({
          smartPlaylists: state.smartPlaylists.filter((p) => p.id !== id),
        }));
      },
    }),
    {
      name: '@hueco_audio_fx_v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
