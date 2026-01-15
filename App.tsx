import React, { useState, useEffect, useRef, useCallback } from 'react';
import CameraFeed, { CameraHandle } from './components/CameraFeed';
import LiveAudio from './components/LiveAudio';
import Timeline from './components/Timeline';
import { CapturedImage, MonitorSettings, ChatMessage } from './types';
import { 
  analyzeImage, 
  sendMessage, 
  generateSpeech, 
  getFastResponse, 
  generateSentinelReport,
  decodeAudio,
  decodeAudioData
} from './services/geminiService';
import { 
  Shield, 
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
  Terminal
} from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [active, setActive] = useState(false);
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [settings, setSettings] = useState<MonitorSettings>({
    intervalHours: 1.5,
    autoAnalyze: false,
    wakeLockActive: true
  });
  const [selectedImage, setSelectedImage] = useState<CapturedImage | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [playbackMode, setPlaybackMode] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Track audio state
  const [location, setLocation] = useState<{lat: number, lng: number} | undefined>(undefined);
  
  // HUD State
  const [currentTime, setCurrentTime] = useState(new Date());

  // Feature Toggles for Chat
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
      
      // Use helper from service to decode raw PCM (24kHz, 1 channel)
      // Native audioContext.decodeAudioData fails because there are no WAV/MP3 headers in GenAI output
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

  const getThreatLevel = (text?: string) => {
    if (!text) return 'UNKNOWN';
    const t = text.toLowerCase();
    if (t.includes('intruder') || t.includes('danger') || t.includes('weapon') || t.includes('fire') || t.includes('smoke') || t.includes('suspicious')) return 'CRITICAL';
    if (t.includes('person') || t.includes('human') || t.includes('movement') || t.includes('change') || t.includes('vehicle')) return 'CAUTION';
    return 'SAFE';
  };

  // --- Effects ---

  // Timer for HUD
  useEffect(() => {
    timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Location Setup
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.log("Geolocation denied or error")
      );
    }
  }, []);

  // Wake Lock Logic
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
      
      // Initial Capture if empty
      if (images.length === 0) {
        setTimeout(captureAndProcess, 1000);
      }

      intervalRef.current = setInterval(() => {
        captureAndProcess();
      }, intervalMs);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (wakeLockRef.current) wakeLockRef.current.release();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, settings.intervalHours]);

  // Playback Logic
  useEffect(() => {
    if (playbackMode && images.length > 0) {
      let idx = 0;
      playbackRef.current = setInterval(() => {
        setSelectedImage(images[idx]);
        idx = (idx + 1) % images.length;
      }, 500); // 2 FPS
    } else {
      clearInterval(playbackRef.current);
    }
    return () => clearInterval(playbackRef.current);
  }, [playbackMode, images]);

  // --- Core Functions ---

  const captureAndProcess = async () => {
    if (cameraRef.current) {
      const dataUrl = cameraRef.current.capture();
      if (dataUrl) {
        const newImage: CapturedImage = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          dataUrl: dataUrl
        };
        
        setImages(prev => [...prev, newImage]);

        // Auto Analysis
        if (settings.autoAnalyze) {
          setIsProcessing(true);
          try {
            const analysis = await analyzeImage(dataUrl, "Briefly analyze this security snapshot. Is there movement or a person?");
            setImages(prev => prev.map(img => img.id === newImage.id ? { ...img, analysis } : img));
          } catch (e) {
            console.error("Auto analysis failed", e);
          } finally {
            setIsProcessing(false);
          }
        }
      }
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: userInput,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, newMsg]);
    setUserInput('');
    setIsProcessing(true);

    try {
      let responseText = '';
      let grounding = undefined;

      if (!useThinking && !useSearch && !useMaps && !selectedImage && userInput.startsWith('/fast')) {
         responseText = await getFastResponse(newMsg.text.replace('/fast', ''));
      } 
      else if (selectedImage) {
        responseText = await analyzeImage(selectedImage.dataUrl, newMsg.text);
      } 
      else {
        const result = await sendMessage(
          chatMessages.map(m => ({role: m.role, text: m.text})), 
          newMsg.text,
          useThinking,
          useSearch,
          useMaps,
          location
        );
        responseText = result.text || "No response generated.";
        grounding = result.groundingMetadata?.groundingChunks;
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now(),
        isThinking: useThinking,
        groundingUrls: grounding?.map((g: any) => ({
           title: g.web?.title || g.maps?.title || 'Source', 
           uri: g.web?.uri || g.maps?.googleMapsUri 
        })).filter((g: any) => g.uri)
      };

      setChatMessages(prev => [...prev, botMsg]);

    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: "Error connecting to Sentinel AI network.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualCapture = () => {
    captureAndProcess();
  };

  const readAnalysis = async () => {
    if(!selectedImage?.analysis) return;
    try {
      const audio = await generateSpeech(selectedImage.analysis);
      if(audio) playAudio(audio);
    } catch (e) { console.error(e) }
  };

  const clearTimeline = () => {
    if(window.confirm("WARNING: PURGE ALL SURVEILLANCE DATA? THIS ACTION CANNOT BE UNDONE.")) {
      setImages([]);
      setSelectedImage(null);
      setPlaybackMode(false);
    }
  };

  const generateReport = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    try {
      const logs = images.slice(-5).map(img => 
        `[${new Date(img.timestamp).toLocaleTimeString()}] ${img.analysis || 'Image captured. No analysis available.'}`
      );
      const report = await generateSentinelReport(logs);
      setChatMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: `REPORT GENERATED:\n${report}`,
        timestamp: Date.now()
      }]);
      const audio = await generateSpeech(report);
      if (audio) playAudio(audio);
    } catch (e) {
      console.error("Report generation failed", e);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Render Helpers ---

  const renderThreatBadge = (level: string) => {
    switch(level) {
      case 'CRITICAL': 
        return <div className="flex items-center gap-1 text-red-500 bg-red-500/10 px-2 py-1 rounded border border-red-500 animate-pulse"><AlertTriangle size={14}/> CRITICAL</div>;
      case 'CAUTION':
        return <div className="flex items-center gap-1 text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded border border-yellow-500"><Activity size={14}/> CAUTION</div>;
      case 'SAFE':
        return <div className="flex items-center gap-1 text-cyber-success bg-cyber-success/10 px-2 py-1 rounded border border-cyber-success"><CheckCircle size={14}/> SAFE</div>;
      default:
        return <div className="flex items-center gap-1 text-gray-500 bg-gray-500/10 px-2 py-1 rounded border border-gray-500">ANALYZING...</div>;
    }
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-cyber-900 text-gray-200 font-sans selection:bg-cyber-accent selection:text-black">
      
      {/* Stealth Mode Overlay */}
      {stealthMode && (
        <div 
          className="fixed inset-0 bg-black z-[100] cursor-pointer flex flex-col items-center justify-center select-none"
          onDoubleClick={() => setStealthMode(false)}
        >
          <div className="animate-pulse opacity-20">
            <Shield size={64} className="text-cyber-accent" />
          </div>
          <p className="text-cyber-accent/20 font-mono text-xs mt-4 animate-bounce">SYSTEM ACTIVE // MONITORING</p>
          <p className="text-gray-800 text-[10px] absolute bottom-8">DOUBLE TAP TO WAKE</p>
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50"></div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-cyber-700 bg-cyber-800/50 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="text-cyber-accent" />
            <h1 className="text-xl font-bold tracking-wider font-mono text-white hidden sm:block">CHRONOS <span className="text-cyber-accent">SENTINEL</span></h1>
          </div>
          <div className="flex items-center space-x-2 md:space-x-4">
             <button 
                onClick={() => setStealthMode(true)}
                className="p-2 rounded-full hover:bg-cyber-700 text-gray-400 hover:text-white transition-colors"
                title="Stealth Mode (Save Battery)"
             >
               <EyeOff size={18} />
             </button>
             <button 
                onClick={() => setLiveMode(true)}
                className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-cyber-700 hover:bg-cyber-accent hover:text-black transition-colors"
             >
                <Mic size={16} />
                <span className="text-sm font-semibold hidden sm:inline">VOICE LINK</span>
             </button>
             <div className="flex items-center bg-black rounded-lg p-1 border border-cyber-700">
               <span className="text-xs text-gray-500 px-2 hidden sm:inline">FREQ: {settings.intervalHours}h</span>
               <input 
                 type="range" 
                 min="0.1" 
                 max="24" 
                 step="0.1" 
                 value={settings.intervalHours} 
                 onChange={(e) => setSettings({...settings, intervalHours: parseFloat(e.target.value)})}
                 className="w-16 sm:w-24 accent-cyber-accent"
               />
             </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Visuals */}
        <div className="lg:col-span-2 space-y-6">
          {/* Camera Viewport with HUD */}
          <div className="aspect-video w-full relative group bg-black rounded-lg border border-cyber-700 overflow-hidden shadow-[0_0_20px_rgba(0,242,255,0.05)]">
            {playbackMode && selectedImage ? (
               <img src={selectedImage.dataUrl} className="w-full h-full object-cover" />
            ) : (
              <CameraFeed ref={cameraRef} active={true} />
            )}
            
            {/* Live HUD Overlay */}
            <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
              <div className="flex justify-between items-start">
                 <div className="bg-black/60 backdrop-blur-sm p-2 rounded border-l-2 border-cyber-accent">
                    <div className="text-xs font-mono text-cyber-accent">CAM-01 // LIVE</div>
                    <div className="text-lg font-mono text-white font-bold">{currentTime.toLocaleTimeString()}</div>
                 </div>
                 {active && (
                   <div className="flex items-center gap-2 bg-red-900/80 text-white px-3 py-1 rounded animate-pulse">
                     <div className="w-2 h-2 rounded-full bg-red-500"></div>
                     <span className="text-xs font-bold tracking-widest">REC</span>
                   </div>
                 )}
              </div>
              
              <div className="flex justify-between items-end">
                <div className="text-[10px] text-cyber-700 font-mono">
                   LAT: {location?.lat.toFixed(4) || '---'} <br/>
                   LNG: {location?.lng.toFixed(4) || '---'}
                </div>
                {/* Crosshair decoration */}
                <div className="w-8 h-8 border-r-2 border-b-2 border-cyber-accent/50"></div>
              </div>
            </div>

            {/* Controls Overlay */}
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center z-10 pointer-events-none">
               <div className="pointer-events-auto flex gap-2">
                  <button 
                    onClick={() => setActive(!active)}
                    className={`flex items-center space-x-2 px-4 sm:px-6 py-2 sm:py-3 rounded-md font-bold transition-all ${active ? 'bg-cyber-warn text-white shadow-[0_0_15px_#ff0055]' : 'bg-cyber-accent text-black shadow-[0_0_15px_#00f2ff]'}`}
                  >
                    {active ? <><Square size={18} fill="currentColor"/> <span className="hidden sm:inline">STOP</span></> : <><Play size={18} fill="currentColor"/> <span className="hidden sm:inline">START</span></>}
                  </button>
                  <button 
                    onClick={() => {
                       if (images.length > 0) setPlaybackMode(!playbackMode);
                    }}
                    disabled={images.length === 0}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-md font-bold transition-all border ${playbackMode ? 'bg-cyber-success text-black border-transparent' : 'bg-black/50 text-white border-cyber-accent hover:bg-cyber-accent/10'}`}
                  >
                    <PlayCircle size={18} /> <span className="hidden sm:inline">PLAYBACK</span>
                  </button>
               </div>

               <button 
                 onClick={handleManualCapture}
                 className="pointer-events-auto p-3 bg-cyber-700 rounded-full hover:bg-white hover:text-black transition-colors border border-gray-600 shadow-lg"
                 title="Capture Now"
               >
                 <Eye size={20} />
               </button>
            </div>
          </div>

          {/* Timeline Gallery */}
          <div className="bg-cyber-800/50 p-4 rounded-xl border border-cyber-700 backdrop-blur-sm">
             <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-mono text-gray-400 flex items-center gap-2">
                    <Clock size={14} /> TIMELINE
                  </h3>
                  <span className="text-xs text-cyber-accent/50 font-mono border border-cyber-accent/20 px-2 py-0.5 rounded">{images.length} FRAMES</span>
                </div>
                
                <button 
                  onClick={clearTimeline} 
                  className="text-xs flex items-center gap-1 text-gray-500 hover:text-cyber-warn transition-colors px-2 py-1 hover:bg-cyber-warn/10 rounded"
                  title="Clear all data"
                >
                  <Trash2 size={12} /> PURGE DATA
                </button>
             </div>
             <Timeline images={images} onSelect={(img) => { setPlaybackMode(false); setSelectedImage(img); }} />
          </div>
        </div>

        {/* Right Col: Intelligence Hub */}
        <div className="lg:col-span-1 flex flex-col h-[500px] lg:h-[calc(100vh-8rem)] sticky top-24">
           {selectedImage && !playbackMode ? (
             <div className="flex-1 bg-cyber-800 rounded-xl border border-cyber-700 overflow-hidden flex flex-col animate-in fade-in slide-in-from-right-4 relative">
                <div className="p-3 border-b border-cyber-700 flex justify-between items-center bg-black/20">
                  <h3 className="font-mono text-cyber-accent flex items-center gap-2"><Terminal size={14}/> ANALYSIS MODE</h3>
                  <button onClick={() => setSelectedImage(null)} className="text-gray-400 hover:text-white text-xs">CLOSE X</button>
                </div>
                <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                  <div className="relative">
                    <img src={selectedImage.dataUrl} className="w-full rounded-lg mb-4 border border-gray-700" alt="Analysis Target" />
                    {/* Image Overlay Timestamp */}
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-1 font-mono rounded">
                      {new Date(selectedImage.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  
                  {selectedImage.analysis ? (
                    <div className="space-y-4">
                       <div className="flex justify-between items-center bg-black/20 p-2 rounded border border-cyber-700">
                         <span className="text-xs text-gray-400 font-mono">THREAT LEVEL</span>
                         {renderThreatBadge(getThreatLevel(selectedImage.analysis))}
                       </div>

                       <div className="bg-black/20 p-3 rounded border border-cyber-700">
                         <h4 className="text-white font-bold text-xs mb-2 flex items-center gap-2"><BrainCircuit size={12} className="text-cyber-accent"/> INTELLIGENCE REPORT</h4>
                         <p className="text-sm text-gray-300 leading-relaxed font-light font-mono text-justify">{selectedImage.analysis}</p>
                       </div>
                       
                       <button 
                        onClick={readAnalysis}
                        disabled={isSpeaking}
                        className={`w-full py-3 rounded text-sm font-bold flex justify-center items-center gap-2 transition-all ${isSpeaking ? 'bg-cyber-accent text-black animate-pulse' : 'bg-cyber-700 text-white hover:bg-cyber-600'}`}
                       >
                         {isSpeaking ? <><Activity size={16} className="animate-spin"/> TRANSMITTING AUDIO...</> : <><Volume2 size={16}/> READ ALOUD</>}
                       </button>
                    </div>
                  ) : (
                    <button 
                      onClick={async () => {
                        if(!selectedImage) return;
                        setIsProcessing(true);
                        const ans = await analyzeImage(selectedImage.dataUrl);
                        setImages(prev => prev.map(img => img.id === selectedImage.id ? { ...img, analysis: ans } : img));
                        setSelectedImage(prev => prev ? {...prev, analysis: ans} : null);
                        setIsProcessing(false);
                      }}
                      disabled={isProcessing}
                      className="w-full py-4 bg-cyber-700 hover:bg-cyber-600 rounded text-sm text-white flex justify-center items-center gap-2 border border-cyber-accent/20 hover:border-cyber-accent"
                    >
                      {isProcessing ? <Zap className="animate-pulse" size={16}/> : <BrainCircuit size={16}/>}
                      {isProcessing ? 'SCANNING SECTOR...' : 'INITIATE DEEP SCAN'}
                    </button>
                  )}
                </div>
             </div>
           ) : (
             <div className="flex-1 bg-cyber-800 rounded-xl border border-cyber-700 overflow-hidden flex flex-col">
               <div className="p-3 border-b border-cyber-700 bg-black/20 flex justify-between items-center">
                 <h3 className="font-mono text-gray-400 text-xs">COMMAND LINE // GEMINI PRO</h3>
                 <button 
                    onClick={generateReport}
                    disabled={isProcessing || images.length === 0}
                    className="flex items-center gap-1 text-[10px] bg-cyber-900 border border-cyber-accent/30 hover:border-cyber-accent text-cyber-accent px-2 py-1 rounded disabled:opacity-50"
                 >
                   <FileText size={10} /> GEN REPORT
                 </button>
               </div>
               
               {/* Chat History */}
               <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-black/20">
                 {chatMessages.length === 0 && (
                   <div className="text-center text-gray-600 mt-10">
                     <BrainCircuit className="mx-auto mb-2 opacity-50" size={32} />
                     <p className="text-sm">Sentinel is listening.</p>
                     <p className="text-xs mt-2">Try: "Is the area safe?" or use "GEN REPORT".</p>
                   </div>
                 )}
                 {chatMessages.map(msg => (
                   <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[85%] rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-cyber-700 text-white' : 'bg-black/40 border border-cyber-700/50 text-gray-300'}`}>
                        {msg.isThinking && <div className="text-xs text-cyber-accent mb-1 font-mono flex items-center gap-1"><BrainCircuit size={10}/> THINKING PROCESS COMPLETE</div>}
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      </div>
                      {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-2">
                           {msg.groundingUrls.map((g, idx) => (
                             <a key={idx} href={g.uri} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-0.5 bg-cyber-900 border border-gray-700 rounded text-cyber-accent hover:border-cyber-accent truncate max-w-full">
                               {g.title || 'Source'}
                             </a>
                           ))}
                        </div>
                      )}
                   </div>
                 ))}
                 {isProcessing && (
                   <div className="flex items-start">
                     <div className="bg-black/40 border border-cyber-700/50 rounded-lg p-3 text-sm text-gray-400 animate-pulse">
                       Processing...
                     </div>
                   </div>
                 )}
               </div>

               {/* Input Area */}
               <div className="p-3 bg-cyber-900 border-t border-cyber-700">
                  {/* Tool Toggles */}
                  <div className="flex gap-2 mb-2 justify-center">
                    <button 
                      onClick={() => { setUseThinking(!useThinking); setUseSearch(false); setUseMaps(false); }}
                      className={`p-1.5 rounded ${useThinking ? 'bg-cyber-accent text-black' : 'text-gray-500 hover:text-white'}`}
                      title="Deep Thinking (Pro)"
                    ><BrainCircuit size={16}/></button>
                    <button 
                      onClick={() => { setUseSearch(!useSearch); setUseThinking(false); setUseMaps(false); }}
                      className={`p-1.5 rounded ${useSearch ? 'bg-cyber-accent text-black' : 'text-gray-500 hover:text-white'}`}
                      title="Google Search"
                    ><Globe size={16}/></button>
                    <button 
                      onClick={() => { setUseMaps(!useMaps); setUseThinking(false); setUseSearch(false); }}
                      className={`p-1.5 rounded ${useMaps ? 'bg-cyber-accent text-black' : 'text-gray-500 hover:text-white'}`}
                      title="Maps Grounding"
                    ><MapPin size={16}/></button>
                  </div>

                  <form onSubmit={handleChatSubmit} className="relative">
                    <input 
                      type="text" 
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="Enter command..."
                      className="w-full bg-black border border-cyber-700 rounded-md py-2 pl-3 pr-10 text-sm text-white focus:outline-none focus:border-cyber-accent transition-colors"
                    />
                    <button type="submit" disabled={isProcessing} className="absolute right-2 top-2 text-cyber-accent hover:text-white disabled:opacity-50">
                      <MessageSquare size={16} />
                    </button>
                  </form>
               </div>
             </div>
           )}
        </div>
      </main>

      {liveMode && <LiveAudio onClose={() => setLiveMode(false)} onCapture={handleManualCapture} />}
    </div>
  );
};

export default App;