import React, { useEffect, useRef, useState, useCallback } from 'react';
import { connectToLiveAPI, createPcmBlob, decodeAudio, decodeAudioData, blobToBase64 } from '../services/geminiService';
import { Mic, MicOff, Activity, X, Video, Camera, SwitchCamera, MessageSquare } from 'lucide-react';

interface LiveAudioProps {
  onClose: () => void;
  onCapture: () => void;
  onTranscript: (text: string, isUser: boolean) => void;
}

const LiveAudio: React.FC<LiveAudioProps> = ({ onClose, onCapture, onTranscript }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user'|'environment'>('user');
  const [transcripts, setTranscripts] = useState<{text: string, isUser: boolean}[]>([]);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const animationFrameRef = useRef<number>(0);
  const videoIntervalRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptsRef = useRef<HTMLDivElement>(null);

  const FRAME_RATE = 1; // Frames per second to send to Gemini (bandwidth optimization)

  // Internal transcript handler to update UI state
  const handleTranscript = (text: string, isUser: boolean) => {
    setTranscripts(prev => [...prev.slice(-4), { text, isUser }]); // Keep last 5
    onTranscript(text, isUser); // Propagate to main app
    
    // Auto scroll
    if (transcriptsRef.current) {
        transcriptsRef.current.scrollTop = transcriptsRef.current.scrollHeight;
    }
  };

  const startStream = useCallback(async () => {
    try {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true 
        });
        
        streamRef.current = stream;
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }

        return stream;
    } catch (e) {
        console.error("Camera/Mic Error", e);
        setError("Camera/Mic Access Denied");
        return null;
    }
  }, [facingMode]);

  const switchCamera = () => {
      setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
      // The useEffect dependency on facingMode will trigger restart
  };

  // Visualization
  const drawVisualizer = () => {
    if (!analyserRef.current || !visualizerCanvasRef.current) return;
    
    const canvas = visualizerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if(!analyserRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.clearRect(0,0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for(let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        ctx.fillStyle = `rgba(0, 242, 255, ${barHeight/150})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    
    draw();
  };
  
  const handleAudioData = async (base64: string) => {
    if (!outputAudioContextRef.current) return;
    try {
      const audioBytes = decodeAudio(base64);
      const audioBuffer = await decodeAudioData(audioBytes, outputAudioContextRef.current);
      
      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioContextRef.current.destination);
      if (analyserRef.current) source.connect(analyserRef.current);

      const currentTime = outputAudioContextRef.current.currentTime;
      const startTime = Math.max(currentTime, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + audioBuffer.duration;
    } catch (e) {
      console.error("Audio decode error", e);
    }
  };

  useEffect(() => {
    let cleanup = false;

    const initSession = async () => {
      const stream = await startStream();
      if (!stream) return;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      analyserRef.current = outputAudioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(outputAudioContextRef.current.destination);
      drawVisualizer();

      const sessionPromise = connectToLiveAPI(
        handleAudioData,
        () => { if(!cleanup) setIsConnected(false); },
        (err) => { console.error(err); setError("Connection failed"); },
        handleTranscript,
        onCapture
      );

      sessionPromise.then(session => {
         if (cleanup) return;
         sessionRef.current = session;
         setIsConnected(true);
         
         // Setup Audio Input Stream
         if (inputAudioContextRef.current) {
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
                if (!sessionRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                session.sendRealtimeInput({ media: pcmBlob });
            };
            
            source.connect(processor);
            processor.connect(inputAudioContextRef.current.destination);
         }

         // Setup Video Frame Loop
         videoIntervalRef.current = window.setInterval(async () => {
             if (!videoRef.current || !canvasRef.current || !sessionRef.current) return;
             
             const video = videoRef.current;
             const canvas = canvasRef.current;
             const ctx = canvas.getContext('2d');
             
             if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
                 canvas.width = video.videoWidth * 0.5; // Downscale for bandwidth
                 canvas.height = video.videoHeight * 0.5;
                 ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                 
                 canvas.toBlob(async (blob) => {
                    if (blob) {
                        const base64 = await blobToBase64(blob);
                        session.sendRealtimeInput({ 
                            media: { mimeType: 'image/jpeg', data: base64 } 
                        });
                    }
                 }, 'image/jpeg', 0.6);
             }
         }, 1000 / FRAME_RATE);
      });
    };

    initSession();

    return () => {
      cleanup = true;
      cancelAnimationFrame(animationFrameRef.current);
      clearInterval(videoIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (inputAudioContextRef.current) inputAudioContextRef.current.close();
      if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    };
  }, [facingMode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-2xl h-[80vh] bg-cyber-900 rounded-2xl overflow-hidden border border-cyber-accent shadow-[0_0_50px_rgba(0,242,255,0.2)] flex flex-col">
        
        {/* Video Background */}
        <div className="absolute inset-0 z-0">
             <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover opacity-60" />
             <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.5)_100%)]"></div>
             {/* Grid Overlay */}
             <div className="absolute inset-0 bg-[linear-gradient(rgba(0,242,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,242,255,0.05)_1px,transparent_1px)] bg-[size:50px_50px] pointer-events-none"></div>
        </div>

        {/* HUD Header */}
        <div className="relative z-10 flex justify-between items-start p-6 bg-gradient-to-b from-black/80 to-transparent">
             <div>
                <h2 className="text-xl font-bold text-white tracking-widest flex items-center gap-2">
                    <Video size={20} className="text-cyber-accent" /> VIDEO LINK
                </h2>
                <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-cyber-success animate-pulse' : 'bg-red-500'}`}></div>
                    <span className="text-[10px] font-mono text-gray-400">
                        {isConnected ? `CONNECTED // ${facingMode.toUpperCase()}` : error || "INITIALIZING..."}
                    </span>
                </div>
             </div>
             <button onClick={onClose} className="p-2 bg-black/50 rounded-full text-white hover:bg-red-500/20 hover:text-red-500 transition-colors border border-gray-700">
                 <X size={24} />
             </button>
        </div>

        {/* Transcriptions Overlay */}
        <div className="relative z-10 flex-1 flex flex-col justify-end p-6 pointer-events-none">
            <div ref={transcriptsRef} className="max-h-48 overflow-y-auto space-y-2 mb-4 custom-scrollbar mask-gradient-top">
                {transcripts.map((t, i) => (
                    <div key={i} className={`flex ${t.isUser ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] px-3 py-2 rounded backdrop-blur-md border ${t.isUser ? 'bg-cyber-accent/10 border-cyber-accent/30 text-cyber-accent text-right' : 'bg-black/60 border-gray-600 text-white'}`}>
                            <p className="text-xs font-mono">{t.text}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Controls Footer */}
        <div className="relative z-10 p-6 flex justify-center items-center gap-6 bg-gradient-to-t from-black/90 to-transparent pointer-events-auto">
             <button onClick={switchCamera} className="p-3 rounded-full bg-cyber-800 border border-cyber-700 text-white hover:border-cyber-accent transition-all group">
                <SwitchCamera size={24} className="group-hover:rotate-180 transition-transform duration-500"/>
             </button>
             
             <div className="relative">
                 <canvas ref={visualizerCanvasRef} width="100" height="40" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50" />
                 <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center ${isConnected ? 'border-cyber-accent shadow-[0_0_20px_#00f2ff]' : 'border-gray-600'}`}>
                    <Activity size={32} className={isConnected ? "text-cyber-accent animate-pulse" : "text-gray-500"} />
                 </div>
             </div>

             <button onClick={onCapture} className="p-3 rounded-full bg-cyber-800 border border-cyber-700 text-white hover:bg-white hover:text-black transition-all" title="Capture Frame">
                <Camera size={24} />
             </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};

export default LiveAudio;