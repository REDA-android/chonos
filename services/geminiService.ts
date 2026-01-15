import { 
  GoogleGenAI, 
  Modality, 
  LiveServerMessage, 
  Type,
  FunctionDeclaration
} from "@google/genai";

const API_KEY = process.env.API_KEY || '';

// --- Configuration Constants ---
const MODEL_CHAT_PRO = 'gemini-3-pro-preview';
const MODEL_FAST_LITE = 'gemini-2.5-flash-lite'; // Use common alias if needed, mapping to full name handled by SDK usually, but sticking to guidelines
const MODEL_SEARCH = 'gemini-3-flash-preview';
const MODEL_MAPS = 'gemini-2.5-flash';
const MODEL_VISION = 'gemini-3-pro-preview';
const MODEL_LIVE = 'gemini-2.5-flash-native-audio-preview-12-2025';
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

// --- Instance ---
let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: API_KEY });
  }
  return aiInstance;
};

// --- Tool Declarations ---
const captureSnapshotTool: FunctionDeclaration = {
  name: 'captureSnapshot',
  description: 'Capture a photo or snapshot of the current environment immediately when the user asks to take a picture, scan, or capture.',
};

// --- API Functions ---

/**
 * General Chat with Tool Selection based on user intent (simplified logic)
 */
export const sendMessage = async (
  history: { role: string; text: string }[], 
  newMessage: string,
  useThinking: boolean = false,
  useSearch: boolean = false,
  useMaps: boolean = false,
  location?: { lat: number; lng: number }
) => {
  const ai = getAI();
  
  let modelName = MODEL_CHAT_PRO;
  let config: any = {};

  if (useThinking) {
    modelName = MODEL_CHAT_PRO;
    config.thinkingConfig = { thinkingBudget: 32768 };
    // DO NOT set maxOutputTokens when using thinking
  } else if (useSearch) {
    modelName = MODEL_SEARCH;
    config.tools = [{ googleSearch: {} }];
  } else if (useMaps) {
    modelName = MODEL_MAPS;
    config.tools = [{ googleMaps: {} }];
    if (location) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: location.lat,
            longitude: location.lng
          }
        }
      };
    }
  } else {
    // Default fallback to Lite for very simple queries if we wanted, 
    // but Pro is requested for "Chatbot"
    modelName = MODEL_CHAT_PRO;
  }

  // Formatting history for the API
  // Note: For simple single-turn or stateless calls we use generateContent.
  // For chat, we use chats.create. 
  
  // Construct a chat session
  const chat = ai.chats.create({
    model: modelName,
    config: {
      ...config,
      systemInstruction: "You are Chronos, an intelligent sentinel AI. You monitor this environment.",
    },
    history: history.map(h => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.text }]
    }))
  });

  const response = await chat.sendMessage({ message: newMessage });
  
  return {
    text: response.text,
    groundingMetadata: response.candidates?.[0]?.groundingMetadata
  };
};

/**
 * Image Analysis
 */
export const analyzeImage = async (base64Data: string, prompt: string = "Describe what you see in this image in detail. Identify any potential security concerns or interesting changes.") => {
  const ai = getAI();
  // Remove header if present (data:image/jpeg;base64,)
  const cleanBase64 = base64Data.split(',')[1];

  const response = await ai.models.generateContent({
    model: MODEL_VISION,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
        { text: prompt }
      ]
    }
  });

  return response.text;
};

/**
 * Generate a tactical report from logs
 */
export const generateSentinelReport = async (logs: string[]) => {
  const ai = getAI();
  const prompt = `
  SYSTEM: You are Chronos, an advanced AI Sentinel.
  TASK: Analyze the following observation logs and generate a concise, tactical status report suitable for a commanding officer. Highlight any anomalies.
  TONE: Military, Sci-Fi, precise, authoritative.
  FORMAT: Plain text, no markdown symbols like ** or #.
  LOGS:
  ${logs.join('\n')}
  `;

  const response = await ai.models.generateContent({
    model: MODEL_CHAT_PRO,
    contents: prompt
  });

  return response.text;
};

/**
 * Fast Summary / Low Latency
 */
export const getFastResponse = async (text: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest', // Explicit mapping for 'flash lite'
    contents: text
  });
  return response.text;
};

/**
 * Text to Speech
 */
export const generateSpeech = async (text: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL_TTS,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Fenrir sounds deeper/sentinel-like
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio; // Returns base64 PCM/Audio
};

// --- Live API Helpers ---

// Audio Encoding/Decoding Utils
export function decodeAudio(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function encodeAudio(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createPcmBlob(data: Float32Array): any {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encodeAudio(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export const connectToLiveAPI = async (
  onAudioData: (base64: string) => void,
  onClose: () => void,
  onError: (err: any) => void,
  onCaptureTrigger?: () => void
) => {
  const ai = getAI();
  
  const sessionPromise = ai.live.connect({
    model: MODEL_LIVE,
    callbacks: {
      onopen: () => console.log('Live Session Opened'),
      onmessage: async (message: LiveServerMessage) => {
        // Handle Audio
        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          onAudioData(base64Audio);
        }

        // Handle Tool Calls
        if (message.toolCall) {
          for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'captureSnapshot') {
              console.log('Voice Command: Capture Snapshot Triggered');
              if (onCaptureTrigger) onCaptureTrigger();
              
              // Send response back
              const session = await sessionPromise;
              session.sendToolResponse({
                functionResponses: [{
                  id: fc.id,
                  name: fc.name,
                  response: { result: "Snapshot captured successfully." }
                }]
              });
            }
          }
        }
      },
      onclose: () => onClose(),
      onerror: (e) => onError(e),
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
      },
      systemInstruction: "You are Chronos, a helpful and observant AI assistant. You can capture snapshots when asked. If the user says 'take a picture', 'capture', or 'scan', call the captureSnapshot tool.",
      tools: [{ functionDeclarations: [captureSnapshotTool] }]
    }
  });

  return sessionPromise;
};