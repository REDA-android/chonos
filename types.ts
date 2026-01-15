export interface CapturedImage {
  id: string;
  timestamp: number;
  dataUrl: string;
  analysis?: string;
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
}