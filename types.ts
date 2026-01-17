export interface CapturedImage {
  id: string;
  timestamp: number;
  dataUrl: string;
  analysis?: string;
  confidence?: number;
  sceneCategory?: string;
  eventTags?: string[];
  threatLevel?: 'SAFE' | 'CAUTION' | 'CRITICAL';
}

export enum AppMode {
  MONITOR = 'MONITOR',
  CHAT = 'CHAT',
  LIVE = 'LIVE',
  GALLERY = 'GALLERY'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
  isThinking?: boolean;
  groundingUrls?: Array<{ title?: string; uri: string }>;
}

export interface MonitorSettings {
  intervalHours: number;
  autoAnalyze: boolean;
  wakeLockActive: boolean;
  facingMode: 'user' | 'environment';
  resolution: 'low' | 'med' | 'high';
  playbackFps: number;
  timestampPrecision: 'date' | 'time' | 'both';
}