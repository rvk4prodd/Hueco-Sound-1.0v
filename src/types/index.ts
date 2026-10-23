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

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export type RepeatMode = "off" | "all" | "one";

export type TabType = "home" | "search" | "library";
