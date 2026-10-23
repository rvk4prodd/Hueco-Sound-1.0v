import { create } from 'zustand';
import type { Track } from '../types';
interface UIState { actionTrack: Track | null; actionPlaylistId?: string; toast: { message: string; id: number } | null; openTrackActions: (track: Track, playlistId?: string) => void; closeTrackActions: () => void; notify: (message: string) => void; dismissToast: () => void; }
export const useUIStore = create<UIState>((set) => ({ actionTrack: null, toast: null, openTrackActions: (actionTrack, actionPlaylistId) => set({ actionTrack, actionPlaylistId }), closeTrackActions: () => set({ actionTrack: null, actionPlaylistId: undefined }), notify: (message) => set({ toast: { message, id: Date.now() } }), dismissToast: () => set({ toast: null }) }));
