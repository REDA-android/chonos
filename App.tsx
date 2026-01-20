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
  decodeAudioData
} from './services/geminiService';
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
  X
} from 'lucide-react';

const App: React.FC = () => {
  const [active, setActive] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [settings, setSettings] = useState<MonitorSettings>({
    intervalHours: 1.5,
    autoAnalyze: false,
    wakeLockActive: true,
    facingMode: 'environment',
    resolution: 'med',
    playbackFps: 1,
    timestampPrecision: 'both',
    minConfidenceThreshold: 70,
    autoAdvance: true
  });
  const [selectedImage, setSelectedImage] = useState<CapturedImage | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [playbackMode, setPlaybackMode] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | undefined>(undefined);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [flash, setFlash] = useState(false);

  const cameraRef = useRef<CameraHandle>(null);
  const intervalRef = useRef<any>(null);
  const playbackRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (active) {
      const intervalMs = settings.intervalHours * 60 * 60 * 1000;
      if (images.length === 0) setTimeout(captureAndProcess, 1000);
      intervalRef.current = setInterval(captureAndProcess, intervalMs);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [active, settings.intervalHours]);

  useEffect(() => {
    if (playbackMode && images.length > 0 && settings.autoAdvance) {
      let idx = selectedImage ? images.findIndex(img => img.id === selectedImage.id) : 0;
      if (idx === -1) idx = 0;
      const interval = 1000 / settings.playbackFps;
      playbackRef.current = setInterval(() => {
        setSelectedImage(images[idx]);
        idx = (idx + 1) % images.length;
      }, interval);
    } else {
      clearInterval(playbackRef.current);
    }
    return () => clearInterval(playbackRef.current);
  }, [playbackMode, images, settings.playbackFps, settings.autoAdvance]);

  const captureAndProcess = async () => {
    if (cameraRef.current) {
      const dataUrl = cameraRef.current.capture();
      if (dataUrl) {
        const newImage: CapturedImage = { id: Date.now().toString(), timestamp: Date.now(), dataUrl };
        setImages(prev => [...prev, newImage]);
        if (settings.autoAnalyze) {
          try {
            const prompt = `Analyze plant snapshot. [HEALTH: STATUS][STAGE: stage][TAGS: tag1][ADVICE: text][CONFIDENCE: X%]`;
            const analysis = await analyzeImage(dataUrl, prompt);
            const metadata = parseMetaData(analysis);
            setImages(prev => prev.map(img => img.id === newImage.id ? { ...img, analysis, ...metadata } : img));
          } catch (e) { console.error(e); }
        }
      }
    }
  };

  const handleManualCapture = async () => {
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    await captureAndProcess();
  };

  const parseMetaData = (text: string) => {
    const confidence = text.match(/\[CONFIDENCE:\s*(\d+)%?\]/i);
    const health = text.match(/\[HEALTH:\s*(HEALTHY|STRESSED|CRITICAL)\]/i);
    return {
      confidence: confidence ? parseInt(confidence[1]) : undefined,
      healthStatus: health ? (health[1].toUpperCase() as any) : undefined
    };
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    const newMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: userInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, newMsg]);
    setUserInput('');
    setIsProcessing(true);
    try {
      const result = await sendMessage(chatMessages, newMsg.text);
      setChatMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: result.text || "", timestamp: Date.now() }]);
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  return (
    <div className="min-h-screen bg-cyber-900 text-gray-200 font-sans flex flex-col selection:bg-cyber-accent selection:text-black">
      {/* Stealth Mode Overlay - Better Visuals */}
      {stealthMode && (
        <div 
          className="fixed inset-0 bg-black z-[100] cursor-pointer flex flex-col items-center justify-center animate-in fade-in duration-500"
          onDoubleClick={() => setStealthMode(false)}
        >
          <div className="relative">
             <div className="absolute inset-0 blur-2xl opacity-20 bg-cyber-accent animate-pulse"></div>
             <Leaf className="text-cyber-accent/30 relative" size={64} />
          </div>
          <div className="text-[120px] font-mono font-thin text-white/5 tracking-tighter tabular-nums leading-none mt-8">
              {currentTime.getHours().toString().padStart(2, '0')}
              <span className="animate-pulse">:</span>
              {currentTime.getMinutes().toString().padStart(2, '0')}
          </div>
          <p className="text-cyber-accent/10 font-mono text-[10px] tracking-[0.5em] mt-8 uppercase">Gaia Passive Monitoring Active</p>
          <p className="text-white/5 text-[9px] absolute bottom-12 font-mono">DOUBLE CLICK TO RECALL SYSTEM</p>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-lg p-3 sticky top-0 z-30 flex justify-between items-center px-6">
        <div className="flex items-center gap-3">
          <Leaf className="text-cyber-accent w-6 h-6 drop-shadow-[0_0_8px_rgba(132,204,22,0.4)]"/>
          <h1 className="font-mono font-bold tracking-tighter text-lg bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">CHRONOS <span className="text-cyber-accent">GAIA</span></h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setStealthMode(!stealthMode)} 
            className={`p-2 rounded-lg transition-all border ${stealthMode ? 'bg-cyber-accent/20 text-cyber-accent border-cyber-accent/30' : 'text-gray-500 border-white/5 hover:bg-white/5'}`}
            title="Stealth Mode (Black Screen/Clock)"
          >
            {stealthMode ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)} 
            className={`p-2 rounded-lg transition-all border ${showSettings ? 'bg-cyber-accent/20 text-cyber-accent border-cyber-accent/30' : 'text-gray-400 border-white/5 hover:bg-white/5'}`}
            title="Toggle Settings"
          >
            <Settings size={18}/>
          </button>
          <button 
            onClick={() => setLiveMode(true)} 
            className="flex items-center gap-2 px-4 py-1.5 bg-cyber-accent/5 border border-cyber-accent/40 text-cyber-accent rounded-lg font-bold text-[11px] tracking-widest hover:bg-cyber-accent hover:text-black transition-all shadow-[0_0_15px_rgba(132,204,22,0.1)]"
          >
            <Video size={14}/> VIDEO LINK
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Feed and Timeline */}
        <main className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <div className="aspect-video bg-black rounded-xl overflow-hidden border border-cyber-700/50 relative shadow-2xl group ring-1 ring-white/5">
                {/* Visual Flash Effect */}
                <div className={`absolute inset-0 bg-white z-[60] pointer-events-none transition-opacity duration-200 ease-out ${flash ? 'opacity-80' : 'opacity-0'}`}></div>

                {playbackMode && selectedImage ? (
                  <img src={selectedImage.dataUrl} className="w-full h-full object-contain" alt="Selected Frame" />
                ) : (
                  <CameraFeed 
                    ref={cameraRef} 
                    active={isCameraEnabled} 
                    facingMode={settings.facingMode} 
                    resolution={settings.resolution}
                    onResolutionChange={(res) => setSettings({...settings, resolution: res})}
                  />
                )}
                
                {/* Bottom Left Feed Controls */}
                <div className="absolute bottom-6 left-6 flex gap-3 pointer-events-auto">
                  <button 
                    onClick={() => setActive(!active)} 
                    className={`flex items-center gap-2 px-8 py-3 rounded-lg font-bold transition-all shadow-lg text-xs tracking-widest uppercase ${active ? 'bg-cyber-warn text-white shadow-cyber-warn/20 ring-1 ring-red-400/50' : 'bg-cyber-accent text-black shadow-cyber-accent/20 ring-1 ring-lime-400/50'}`}
                  >
                    {active ? <Square size={14} fill="currentColor"/> : <Play size={14} fill="currentColor"/>}
                    {active ? 'Stop' : 'Start'}
                  </button>
                  <button 
                    onClick={() => images.length > 0 && setPlaybackMode(!playbackMode)} 
                    disabled={images.length === 0} 
                    className={`flex items-center gap-2 px-6 py-3 bg-black/80 border border-cyber-700/50 rounded-lg font-bold transition-all hover:bg-black text-xs uppercase tracking-widest ${playbackMode ? 'text-cyber-accent border-cyber-accent shadow-[0_0_10px_rgba(132,204,22,0.2)]' : 'text-white disabled:opacity-30 disabled:grayscale'}`}
                  >
                    <PlayCircle size={16}/> Playback
                  </button>
                </div>

                {/* Bottom Right Feed Controls */}
                <div className="absolute bottom-6 right-6 flex gap-3 pointer-events-auto">
                  <button 
                    onClick={() => setIsCameraEnabled(!isCameraEnabled)} 
                    className={`p-3 rounded-full transition-all border shadow-lg ${isCameraEnabled ? 'bg-cyber-success/10 text-cyber-success border-cyber-success/40' : 'bg-gray-800/50 text-gray-500 border-gray-700'}`}
                  >
                    <Power size={20}/>
                  </button>
                  {/* Replaced Stealth Mode with Snapshot Button */}
                  <button 
                    onClick={handleManualCapture} 
                    className="p-3 bg-white/5 border border-white/10 text-white rounded-full hover:bg-cyber-accent hover:text-black transition-all shadow-lg backdrop-blur-md group"
                    title="Capture Snapshot"
                  >
                    <Camera size={20} className="group-hover:scale-110 transition-transform duration-200"/>
                  </button>
                </div>
              </div>

              {/* Timeline Display */}
              <div className="bg-cyber-800/20 p-5 rounded-xl border border-white/5 backdrop-blur-sm">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[10px] font-mono text-gray-500 flex items-center gap-3 uppercase tracking-[0.2em]">
                    <Clock size={12} className="text-cyber-accent"/> Timeline 
                    <span className="text-white bg-white/5 px-2 py-0.5 rounded ml-2">{images.length} FRAMES</span>
                  </h3>
                  <button 
                    onClick={() => { if(confirm("Purge all monitoring data?")) setImages([]); }} 
                    className="text-[9px] text-gray-500 hover:text-red-500 flex items-center gap-1 uppercase tracking-widest transition-colors"
                  >
                    <Trash2 size={10}/> Purge Data
                  </button>
                </div>
                <Timeline images={images} onSelect={(img) => { setPlaybackMode(false); setSelectedImage(img); }} />
              </div>
            </div>

            {/* AI Console Sidebar - Mid-page layout */}
            <div className="lg:col-span-4 flex flex-col min-h-[500px]">
              <div className="flex-1 bg-cyber-800/10 border border-white/5 rounded-xl flex flex-col overflow-hidden backdrop-blur-md shadow-inner">
                <div className="p-4 bg-black/30 border-b border-white/5 font-mono text-[10px] flex justify-between items-center uppercase tracking-[0.1em]">
                  <span className="text-gray-400 flex items-center gap-2"><Terminal size={12}/> Console // Gaia v3.1</span>
                  <button 
                    onClick={() => images.length > 0 && generateGrowthReport(images.map(i => i.analysis || ""))} 
                    className="text-cyber-accent hover:text-white flex items-center gap-1.5 transition-colors"
                  >
                    <FileText size={12}/> Gen Report
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar text-justify leading-relaxed">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-700 opacity-40">
                      <BrainCircuit size={48} className="mb-4 text-cyber-accent/20" />
                      <p className="text-[10px] font-mono text-center tracking-widest uppercase">Awaiting Neural Input...</p>
                    </div>
                  )}
                  {chatMessages.map(m => (
                    <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`p-3.5 rounded-xl text-xs sm:text-sm max-w-[95%] shadow-sm ${m.role === 'user' ? 'bg-cyber-700/80 text-white border border-cyber-accent/20' : 'bg-black/50 border border-white/5 text-gray-300'}`}>
                        {m.text}
                      </div>
                      <span className="text-[8px] mt-1 text-gray-600 font-mono px-1">{new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-cyber-accent/60 animate-pulse bg-cyber-accent/5 px-3 py-1.5 rounded-full border border-cyber-accent/10">
                      <Cpu size={12} className="animate-spin" /> Neural Processing Engine Running...
                    </div>
                  )}
                </div>
                <form onSubmit={handleChatSubmit} className="p-4 bg-black/40 border-t border-white/5">
                   <div className="relative group">
                    <input 
                      type="text" 
                      value={userInput} 
                      onChange={e => setUserInput(e.target.value)} 
                      placeholder="Query the Gaia network..." 
                      className="w-full bg-black/50 border border-white/10 rounded-lg py-3 px-4 text-sm focus:outline-none focus:border-cyber-accent/50 focus:ring-1 focus:ring-cyber-accent/20 text-white transition-all placeholder:text-gray-600"
                    />
                    <button type="submit" disabled={isProcessing} className="absolute right-3 top-3 text-cyber-accent/50 hover:text-cyber-accent transition-colors disabled:opacity-20">
                      <MessageSquare size={18}/>
                    </button>
                   </div>
                   <div className="flex gap-4 mt-3 px-1">
                      <div className="flex items-center gap-2 text-gray-600 hover:text-cyber-accent cursor-pointer transition-colors"><Radio size={12}/><span className="text-[9px] font-mono">LIVE</span></div>
                      <div className="flex items-center gap-2 text-gray-600 hover:text-cyber-accent cursor-pointer transition-colors"><Globe size={12}/><span className="text-[9px] font-mono">GLOBAL</span></div>
                      <div className="flex items-center gap-2 text-gray-600 hover:text-cyber-accent cursor-pointer transition-colors"><MapPin size={12}/><span className="text-[9px] font-mono">LOCATE</span></div>
                   </div>
                </form>
              </div>
            </div>
          </div>
        </main>

        {/* System Config Sidebar - Styled exactly as requested */}
        {showSettings && (
          <aside className="w-[320px] border-l border-white/10 bg-[#0a0f1a] p-6 overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300 shadow-2xl z-40">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[13px] font-mono font-bold text-cyber-accent flex items-center gap-2 uppercase tracking-[0.1em]"><Settings size={16}/> System Config</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white transition-colors"><X size={18}/></button>
            </div>

            <div className="space-y-10">
              {/* Capture Frequency Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-[0.1em]">
                  <span className="text-gray-500 flex items-center gap-2 font-bold"><Clock size={12}/> Capture Frequency</span>
                  <span className="text-cyber-accent font-bold">{settings.intervalHours}h</span>
                </div>
                <div className="relative py-2">
                  <input 
                    type="range" 
                    min="0.1" max="24" step="0.1" 
                    value={settings.intervalHours} 
                    onChange={e => setSettings({...settings, intervalHours: parseFloat(e.target.value)})} 
                    className="w-full h-1 bg-[#1a2333] rounded-lg appearance-none cursor-pointer accent-cyber-accent"
                  />
                  <div className="flex justify-between mt-2 text-[8px] text-gray-600 font-mono">
                    <span>0.1</span>
                    <span>24.0</span>
                  </div>
                </div>
              </section>

              {/* Min Confidence Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-[0.1em]">
                  <span className="text-gray-500 flex items-center gap-2 font-bold"><Activity size={12}/> Min. Confidence</span>
                  <span className="text-cyber-accent font-bold">{settings.minConfidenceThreshold}%</span>
                </div>
                <div className="relative py-2">
                  <input 
                    type="range" 
                    min="1" max="100" step="1" 
                    value={settings.minConfidenceThreshold} 
                    onChange={e => setSettings({...settings, minConfidenceThreshold: parseInt(e.target.value)})} 
                    className="w-full h-1 bg-[#1a2333] rounded-lg appearance-none cursor-pointer accent-cyber-accent"
                  />
                </div>
              </section>

              {/* Timestamp Overlay Section */}
              <section className="space-y-3">
                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2 font-bold"><Calendar size={12}/> T-Stamp Overlay</label>
                <div className="grid grid-cols-3 gap-1 p-1 bg-black/40 rounded border border-white/5">
                  {(['DATE', 'TIME', 'BOTH'] as const).map(p => (
                    <button 
                      key={p} 
                      onClick={() => setSettings({...settings, timestampPrecision: p.toLowerCase() as any})} 
                      className={`py-1.5 text-[10px] rounded uppercase font-bold transition-all ${settings.timestampPrecision === p.toLowerCase() ? 'bg-cyber-accent text-black shadow-lg shadow-cyber-accent/20' : 'text-gray-500 hover:text-white'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </section>

              {/* Growth Engine Section */}
              <section className="space-y-3">
                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2 font-bold"><Cpu size={12}/> Growth Engine</label>
                <div className="flex items-center justify-between p-3.5 bg-black/40 rounded border border-white/5 transition-colors hover:border-white/10 group">
                  <span className="text-[11px] font-bold text-gray-300">Auto-Analyze Snapshots</span>
                  <button 
                    onClick={() => setSettings({...settings, autoAnalyze: !settings.autoAnalyze})} 
                    className={`w-9 h-5 rounded-full relative transition-all duration-300 ${settings.autoAnalyze ? 'bg-cyber-accent shadow-[0_0_12px_rgba(132,204,22,0.4)]' : 'bg-gray-700'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.autoAnalyze ? 'right-1' : 'left-1'}`}></div>
                  </button>
                </div>
              </section>

              {/* Optics Control Section */}
              <section className="space-y-4">
                <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest flex items-center gap-2 font-bold"><Camera size={12}/> Optics Control</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button 
                    onClick={() => setSettings({...settings, facingMode: 'environment'})} 
                    className={`py-2.5 text-[10px] rounded uppercase font-bold transition-all border ${settings.facingMode === 'environment' ? 'bg-cyber-accent text-black border-transparent shadow-lg shadow-cyber-accent/20' : 'bg-black/20 text-gray-500 border-white/5 hover:border-white/20'}`}
                  >
                    Macro (Rear)
                  </button>
                  <button 
                    onClick={() => setSettings({...settings, facingMode: 'user'})} 
                    className={`py-2.5 text-[10px] rounded uppercase font-bold transition-all border ${settings.facingMode === 'user' ? 'bg-cyber-accent text-black border-transparent shadow-lg shadow-cyber-accent/20' : 'bg-black/20 text-gray-500 border-white/5 hover:border-white/20'}`}
                  >
                    Selfie (Front)
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['low', 'med', 'high'] as const).map(r => (
                    <button 
                      key={r} 
                      onClick={() => setSettings({...settings, resolution: r})} 
                      className={`py-1.5 text-[9px] rounded uppercase font-bold border transition-all ${settings.resolution === r ? 'bg-cyber-success text-black border-transparent shadow-[0_0_12px_rgba(34,211,238,0.3)]' : 'border-white/5 text-gray-500 hover:text-white'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </section>

              {/* Playback Speed Section */}
              <section className="space-y-4">
                <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-[0.1em]">
                  <span className="text-gray-500 flex items-center gap-2 font-bold"><FastForward size={12}/> Playback Speed</span>
                  <span className="text-cyber-success font-bold">{settings.playbackFps} FPS</span>
                </div>
                <input 
                  type="range" 
                  min="1" max="60" step="1" 
                  value={settings.playbackFps} 
                  onChange={e => setSettings({...settings, playbackFps: parseInt(e.target.value)})} 
                  className="w-full h-1 bg-[#1a2333] rounded-lg appearance-none cursor-pointer accent-cyber-success"
                />
                <div className="flex items-center justify-between p-3.5 bg-black/40 rounded border border-white/5 group">
                  <span className="text-[11px] font-bold text-gray-300">Auto-Advance Slideshow</span>
                  <button 
                    onClick={() => setSettings({...settings, autoAdvance: !settings.autoAdvance})} 
                    className={`w-9 h-5 rounded-full relative transition-all duration-300 ${settings.autoAdvance ? 'bg-cyber-success shadow-[0_0_12px_rgba(34,211,238,0.4)]' : 'bg-gray-700'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all duration-300 ${settings.autoAdvance ? 'right-1' : 'left-1'}`}></div>
                  </button>
                </div>
              </section>
            </div>
          </aside>
        )}
      </div>

      {/* Background Monitoring Indicator */}
      {active && !stealthMode && (
        <div className="fixed bottom-6 left-6 z-20 pointer-events-none">
          <div className="flex items-center gap-3 bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-cyber-accent/30 shadow-2xl">
             <div className="relative">
                <div className="w-2.5 h-2.5 rounded-full bg-cyber-accent animate-ping absolute"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-cyber-accent relative"></div>
             </div>
             <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-cyber-accent">SYSTEM ACTIVE // MONITORING CYCLE {settings.intervalHours}H</span>
          </div>
        </div>
      )}

      {liveMode && <LiveAudio onClose={() => setLiveMode(false)} onCapture={handleManualCapture} onTranscript={(t, u) => setChatMessages(p => [...p, {id: Date.now().toString(), role: u ? 'user' : 'model', text: t, timestamp: Date.now()}])} />}
    </div>
  );
};

export default App;