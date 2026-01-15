import React, { useEffect, useRef, useState } from 'react';
import { connectToLiveAPI, createPcmBlob, decodeAudio, decodeAudioData } from '../services/geminiService';
import { Mic, MicOff, Activity, X } from 'lucide-react';

interface LiveAudioProps {
  onClose: () => void;
  onCapture: () => void;
}

const LiveAudio: React.FC<LiveAudioProps> = ({ onClose, onCapture }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const animationFrameRef = useRef<number>(0);

  // Visualization
  const drawVisualizer = () => {
    if (!analyserRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if(!analyserRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.fillStyle = '#0a1525';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for(let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#00f2ff');
        gradient.addColorStop(1, '#050b14');

        ctx.fillStyle = gradient;
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
      
      // Connect to analyser for visualization
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      }

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

    const startSession = async () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
        outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
        
        // Setup Visualizer
        analyserRef.current = outputAudioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(outputAudioContextRef.current.destination);
        
        // Start Drawing
        drawVisualizer();

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const sessionPromise = connectToLiveAPI(
          handleAudioData,
          () => { if(!cleanup) setIsConnected(false); },
          (err) => { console.error(err); setError("Connection failed"); },
          onCapture
        );

        sessionPromise.then(session => {
           sessionRef.current = session;
           setIsConnected(true);
           
           if (!inputAudioContextRef.current) return;
           const source = inputAudioContextRef.current.createMediaStreamSource(stream);
           const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
           
           processor.onaudioprocess = (e) => {
             const inputData = e.inputBuffer.getChannelData(0);
             const pcmBlob = createPcmBlob(inputData);
             session.sendRealtimeInput({ media: pcmBlob });
           };
           
           source.connect(processor);
           processor.connect(inputAudioContextRef.current.destination);
        });

      } catch (err) {
        console.error(err);
        setError("Could not access microphone or connect.");
      }
    };

    startSession();

    return () => {
      cleanup = true;
      cancelAnimationFrame(animationFrameRef.current);
      if (inputAudioContextRef.current) inputAudioContextRef.current.close();
      if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="bg-cyber-800 p-8 rounded-2xl border border-cyber-accent shadow-[0_0_50px_rgba(0,242,255,0.2)] max-w-md w-full text-center relative overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white z-10">
          <X size={24} />
        </button>
        
        <div className="mb-6 flex justify-center relative">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center border-4 ${isConnected ? 'border-cyber-accent shadow-[0_0_30px_#00f2ff]' : 'border-gray-700'}`}>
            {isConnected ? <Activity size={48} className="text-cyber-accent" /> : <MicOff size={48} className="text-gray-500" />}
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2 tracking-wider">VOICE LINK</h2>
        <p className="text-gray-400 mb-6 font-mono text-sm">
          {error ? <span className="text-cyber-warn">{error}</span> : isConnected ? "CHANNEL OPEN // LISTENING" : "ESTABLISHING CONNECTION..."}
        </p>

        <canvas ref={canvasRef} width="300" height="60" className="w-full h-16 rounded opacity-80" />
        
        <div className="mt-4 text-xs text-cyber-700 font-mono space-y-1">
          <p>MODEL: gemini-2.5-flash-native-audio</p>
          <p className="text-cyber-accent/50">TRY: "Take a picture"</p>
        </div>
      </div>
    </div>
  );
};

export default LiveAudio;