
import { 
  GoogleGenAI, 
  Modality, 
  LiveServerMessage, 
  Type,
  FunctionDeclaration
} from "@google/genai";

// --- Configuration Constants ---
const MODEL_CHAT_PRO = 'gemini-3-pro-preview';
const MODEL_FAST_LITE = 'gemini-flash-lite-latest';
const MODEL_SEARCH = 'gemini-3-flash-preview';
const MODEL_MAPS = 'gemini-2.5-flash';
const MODEL_VISION = 'gemini-3-pro-preview';
const MODEL_LIVE = 'gemini-2.5-flash-native-audio-preview-12-2025';
const MODEL_TTS = 'gemini-2.5-flash-preview-tts';

// --- Instance Helper ---
// Always create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date API key.
const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY as string });
};

// --- Tool Declarations ---
const captureSnapshotTool: FunctionDeclaration = {
  name: 'captureSnapshot',
  description: 'Capture a photo or snapshot of the current plant/environment immediately when the user asks to take a picture, scan, or capture.',
};

// --- API Functions ---

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
    modelName = MODEL_CHAT_PRO;
  }

  const chat = ai.chats.create({
    model: modelName,
    config: {
      ...config,
      systemInstruction: "You are Gaia, an expert AI botanist. You monitor plant growth, diagnose health issues, and offer gardening advice.",
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

export const analyzeImage = async (base64Data: string, prompt: string) => {
  const ai = getAI();
  try {
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
  } catch (error) {
    console.error("Analysis Error:", error);
    throw new Error("Optical Analysis Failed. Check connection.");
  }
};

export const generateGrowthReport = async (logs: string[]) => {
  const ai = getAI();
  const prompt = `
  SYSTEM: You are Gaia, an expert AI Botanist.
  TASK: Analyze the following plant observation logs and generate a concise growth progress report. Highlight health status, growth rate, and any care recommendations.
  TONE: Scientific, encouraging, precise.
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

export const getFastResponse = async (text: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL_FAST_LITE,
    contents: text
  });
  return response.text;
};

export const generateSpeech = async (text: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: MODEL_TTS,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Fenrir has a deep, calm voice suitable for nature
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio;
};

// --- Live API Helpers ---

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

// Convert blob to base64
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data url prefix
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

export const connectToLiveAPI = async (
  onAudioData: (base64: string) => void,
  onClose: () => void,
  onError: (err: any) => void,
  onTranscript: (text: string, isUser: boolean) => void,
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

        // Handle Transcriptions
        if (message.serverContent?.outputTranscription?.text) {
           onTranscript(message.serverContent.outputTranscription.text, false);
        }
        if (message.serverContent?.inputTranscription?.text) {
           onTranscript(message.serverContent.inputTranscription.text, true);
        }

        // Handle Tool Calls
        if (message.toolCall) {
          for (const fc of message.toolCall.functionCalls) {
            if (fc.name === 'captureSnapshot') {
              console.log('Voice Command: Capture Snapshot Triggered');
              if (onCaptureTrigger) onCaptureTrigger();
              
              const session = await sessionPromise;
              // sendToolResponse expects an object for functionResponses, not an array
              session.sendToolResponse({
                functionResponses: {
                  id: fc.id,
                  name: fc.name,
                  response: { result: "Snapshot captured successfully." }
                }
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
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } // Kore has a gentle voice
      },
      systemInstruction: "You are Gaia, an expert botanist AI assistant connected to a live video feed. Your job is to ANALYZE the plant life in the video in REAL-TIME. 1. Identify the plant and its current growth stage (germination, vegetative, flowering, etc.). 2. Detect any health issues like wilting, pests, or discoloration. 3. Provide immediate botanical advice to the user. Speak naturally and concisely.",
      tools: [{ functionDeclarations: [captureSnapshotTool] }]
    }
  });

  return sessionPromise;
};
