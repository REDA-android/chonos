import React, { useState, useEffect, useRef } from 'react';
import CameraFeed, { CameraHandle } from './components/CameraFeed';
import LiveAudio from './components/LiveAudio';
import Timeline from './components/Timeline';
import { CapturedImage, MonitorSettings, ChatMessage } from './types';
import { 
  analyzeImage, 
  sendMessage, 
  generateSpeech, 
  getFastResponse, 
  generateGrowthReport,
  decodeAudio,
  decodeAudioData,
  blobToBase64
} from './services/geminiService';
import JSZip from 'jszip';
import FileSaver from 'file-saver';
import { 
  Leaf, 
  Play, 
  Square, 
  Mic, 
  MessageSquare, 
  MapPin, 
  Globe, 
  BrainCircuit, 
  Volume2,
  Clock, 
  Zap,
  Eye,
  FileText,
  PlayCircle,
  EyeOff,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Activity,
  Terminal,
  Settings,
  Camera,
  FastForward,
  Cpu,
  ChevronDown,
  ChevronUp,
  Siren,
  Radio,
  Tag,
  Calendar,
  Video,
  Sprout,
  Droplet,
  Sun,
  Flower,
  AlertCircle,
  Repeat,
  Power,
  HelpCircle,
  Lightbulb,
  Download
} from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [active, setActive] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [settings, setSettings] = useState<MonitorSettings>({
    intervalHours: 1.5,
    autoAnalyze: false,
    wakeLockActive: true,
    facingMode: 'environment',
    resolution: 'med',
    playbackFps: 4,
    timestampPrecision: 'both',
    minConfidenceThreshold: 70,
    autoAdvance: true
  });
  const [selectedImage, setSelectedImage] = useState<CapturedImage | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [playbackMode, setPlaybackMode] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | undefined>(undefined);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  const [useThinking, setUseThinking] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [useMaps, setUseMaps] = useState(false);

  // Refs
  const cameraRef = useRef<CameraHandle>(null);
  const intervalRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);
  const playbackRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  // --- Helpers ---
  const playAudio = async (base64Audio: string) => {
    try {
      setIsSpeaking(true);
      const audioBytes = decodeAudio(base64Audio);
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffer = await decodeAudioData(audioBytes, audioContext, 24000, 1);
      
      const source = audioContext.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(audioContext.destination);
      source.onended = () => setIsSpeaking(false);
      source.start(0);
    } catch (e) {
      console.error("Audio playback error", e);
      setIsSpeaking(false);
    }
  };

  const parseMetaData = (text: string) => {
    const confidence = text.match(/\[CONFIDENCE:\s*(\d+)%?\]/i);
    const stage = text.match(/\[STAGE:\s*([^\]]+)\]/i);
    const tags = text.match(/\[TAGS:\s*([^\]]+)\]/i);
    const health = text.match(/\[HEALTH:\s*(HEALTHY|STRESSED|CRITICAL)\]/i);
    const advice = text.match(/\[ADVICE:\s*([^\]]+)\]/i);

    return {
      confidence: confidence ? parseInt(confidence[1]) : undefined,
      growthStage: stage ? stage[1].trim() : undefined,
      eventTags: tags ? tags[1].split(',').map(t => t.trim()) : undefined,
      healthStatus: health ? (health[1].toUpperCase() as 'HEALTHY'|'STRESSED'|'CRITICAL') : undefined,
      advice: advice ? advice[1].trim() : undefined
    };
  };

  useEffect(() => {
    timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.log("Geolocation denied or error")
      );
    }
  }, []);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator && settings.wakeLockActive) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err) {
        console.log(`Wake Lock Error: ${err}`);
      }
    }
  };

  useEffect(() => {
    if (active) {
      requestWakeLock();
      const intervalMs = settings.intervalHours * 60 * 60 * 1000;
      if (images.length === 0) setTimeout(captureAndProcess, 1000);
      intervalRef.current = setInterval(captureAndProcess, intervalMs);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (wakeLockRef.current) wakeLockRef.current.release();
    }
    return () => clearInterval(intervalRef.current);
  }, [active, settings.intervalHours]);

  const captureAndProcess = async () => {
    if (cameraRef.current) {
      const dataUrl = cameraRef.current.capture();
      if (dataUrl) {
        const newImage: CapturedImage = { id: Date.now().toString(), timestamp: Date.now(), dataUrl };
        setImages(prev => [...prev, newImage]);
        if (settings.autoAnalyze) {
          try {
            const prompt = `Analyze plant. [HEALTH: STATUS][STAGE: stage][TAGS: tag1][ADVICE: text][CONFIDENCE: X%]`;
            const analysis = await analyzeImage(dataUrl, prompt);
            const metadata = parseMetaData(analysis);
            setImages(prev => prev.map(img => img.id === newImage.id ? { ...img, analysis, ...metadata } : img));
          } catch (e) { console.error(e); }
        }
      }
    }
  };

  const handleExport = async (single: boolean) => {
    if (images.length === 0) return;
    if (single && selectedImage) {
      FileSaver.saveAs(selectedImage.dataUrl, `gaia_snapshot_${selectedImage.id}.jpg`);
    } else {
      const zip = new JSZip();
      images.forEach(img => zip.file(`snapshot_${img.id}.jpg`, img.dataUrl.split(',')[1], {base64: true}));
      const content = await zip.generateAsync({type: "blob"});
      FileSaver.saveAs(content, `gaia_timeline_${Date.now()}.zip`);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    const newMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: userInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, newMsg]);
    setUserInput('');
    setIsProcessing(true);
    try {
      const result = await sendMessage(chatMessages, newMsg.text, useThinking, useSearch, useMaps, location);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: result.text || "", timestamp: Date.now() }]);
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  return (
    <div className="min-h-screen bg-cyber-900 text-gray-200 font-sans">
      {stealthMode && <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center" onDoubleClick={() => setStealthMode(false)}><Leaf className="text-cyber-accent animate-pulse" size={64}/></div>}
      <header className="border-b border-cyber-700 bg-cyber-800/50 p-4 sticky top-0 z-30 flex justify-between items-center backdrop-blur-md">
        <div className="flex items-center gap-2"><Leaf className="text-cyber-accent"/><h1 className="font-mono font-bold tracking-widest">CHRONOS <span className="text-cyber-accent">GAIA</span></h1></div>
        <div className="flex gap-4">
          <button onClick={() => setStealthMode(true)} className="p-2 text-gray-400 hover:text-white"><EyeOff size={20}/></button>
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 text-gray-400 hover:text-white"><Settings size={20}/></button>
          <button onClick={() => setLiveMode(true)} className="px-4 py-1.5 bg-cyber-accent text-black rounded-full font-bold text-xs shadow-[0_0_15px_rgba(132,204,22,0.4)]">LIVE LINK</button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="aspect-video bg-black rounded-xl overflow-hidden border border-cyber-700 relative">
            {playbackMode && selectedImage ? (
              <img src={selectedImage.dataUrl} className="w-full h-full object-cover"/>
            ) : (
              <CameraFeed 
                ref={cameraRef} 
                active={isCameraEnabled} 
                facingMode={settings.facingMode} 
                resolution={settings.resolution}
                onResolutionChange={(res) => setSettings({...settings, resolution: res})}
              />
            )}
            <div className="absolute bottom-4 left-4 flex gap-2 z-20">
              <button onClick={() => setActive(!active)} className={`px-6 py-2 rounded font-bold transition-all ${active ? 'bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'bg-cyber-accent text-black shadow-[0_0_20px_rgba(132,204,22,0.5)]'}`}>{active ? 'STOP' : 'START'}</button>
              <button onClick={() => setPlaybackMode(!playbackMode)} className="px-6 py-2 bg-cyber-700 text-white rounded font-bold border border-cyber-700">PLAYBACK</button>
            </div>
            <div className="absolute bottom-4 right-4 flex gap-2 z-20">
              <button onClick={captureAndProcess} className="p-4 bg-white text-black rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all"><Camera size={24}/></button>
            </div>
          </div>
          <div className="bg-cyber-800 p-4 rounded-xl border border-cyber-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-mono text-gray-400 flex items-center gap-2"><Clock size={14}/> TIMELINE</h3>
              <button onClick={() => handleExport(false)} className="text-xs text-cyber-accent flex items-center gap-1 hover:underline"><Download size={12}/> EXPORT ZIP</button>
            </div>
            <Timeline images={images} onSelect={(img) => { setPlaybackMode(false); setSelectedImage(img); }} />
          </div>
        </div>
        <div className="lg:col-span-1 h-[600px] flex flex-col gap-6">
          <div className="flex-1 bg-cyber-800 border border-cyber-700 rounded-xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-3 bg-black/40 border-b border-cyber-700 font-mono text-xs text-cyber-accent flex justify-between items-center">
              <span>INTELLIGENCE UNIT // GAIA</span>
              {isProcessing && <Zap size={10} className="text-cyber-accent animate-pulse" />}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {chatMessages.length === 0 && <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50"><Sprout size={48} className="mb-2"/><p className="text-[10px] font-mono tracking-widest">AWAITING INPUT</p></div>}
              {chatMessages.map(m => <div key={m.id} className={`p-3 rounded-lg text-sm max-w-[85%] ${m.role === 'user' ? 'bg-cyber-700 self-end ml-auto' : 'bg-black/40 border border-cyber-700'}`}>{m.text}</div>)}
              {selectedImage && <div className="p-3 bg-cyber-accent/10 border border-cyber-accent/30 rounded text-xs font-mono">{selectedImage.analysis || 'Optical scan in progress...'}</div>}
            </div>
            <form onSubmit={handleChatSubmit} className="p-3 bg-black/60 flex gap-2 border-t border-cyber-700">
              <input type="text" value={userInput} onChange={e => setUserInput(e.target.value)} placeholder="Query botanist network..." className="flex-1 bg-black border border-cyber-700 rounded p-2 text-sm focus:border-cyber-accent outline-none text-white transition-colors"/>
              <button type="submit" disabled={isProcessing} className="p-2 text-cyber-accent hover:text-white transition-colors disabled:opacity-30"><MessageSquare size={20}/></button>
            </form>
          </div>
        </div>
      </main>
      {showSettings && <div className="fixed inset-0 bg-black/80 flex justify-end z-50 animate-in fade-in"><div className="w-80 bg-cyber-800 border-l border-cyber-700 p-8 shadow-2xl animate-in slide-in-from-right">
        <div className="flex justify-between items-center mb-8 pb-4 border-b border-cyber-700"><h2 className="font-mono font-bold text-cyber-accent flex items-center gap-2"><Settings size={20}/> CONFIG</h2><button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white">✕</button></div>
        <div className="space-y-8">
          <section>
            <label className="text-[10px] font-mono text-gray-500 block mb-3 uppercase tracking-widest">Capture Interval (H)</label>
            <input type="range" min="0.1" max="24" step="0.1" value={settings.intervalHours} onChange={e => setSettings({...settings, intervalHours: parseFloat(e.target.value)})} className="w-full accent-cyber-accent"/>
            <div className="text-right text-cyber-accent font-mono text-sm mt-2">{settings.intervalHours}h</div>
          </section>
          <div className="bg-black/30 p-4 rounded-lg border border-cyber-700 space-y-4">
            <div className="flex items-center justify-between"><span className="text-xs font-mono text-gray-300">Auto-Analyze</span><input type="checkbox" checked={settings.autoAnalyze} onChange={e => setSettings({...settings, autoAnalyze: e.target.checked})} className="accent-cyber-accent w-4 h-4"/></div>
            <div className="flex items-center justify-between"><span className="text-xs font-mono text-gray-300">Wake-Lock</span><input type="checkbox" checked={settings.wakeLockActive} onChange={e => setSettings({...settings, wakeLockActive: e.target.checked})} className="accent-cyber-accent w-4 h-4"/></div>
          </div>
        </div>
      </div></div>}
      {liveMode && <LiveAudio onClose={() => setLiveMode(false)} onCapture={captureAndProcess} onTranscript={(t, u) => setChatMessages(p => [...p, {id: Date.now().toString(), role: u ? 'user' : 'model', text: t, timestamp: Date.now()}])} />}
    </div>
  );
};

export default App;