import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, RefreshCw, Maximize, Move, Zap, ZapOff, AlertCircle } from 'lucide-react';

interface CameraFeedProps {
  active: boolean;
  facingMode: 'user' | 'environment';
  resolution: 'low' | 'med' | 'high';
  onResolutionChange?: (res: 'low' | 'med' | 'high') => void;
  onCapture?: (dataUrl: string) => void;
  className?: string;
}

export interface CameraHandle {
  capture: () => string | null;
}

const CameraFeed = forwardRef<CameraHandle, CameraFeedProps>(({ active, facingMode, resolution, onResolutionChange, onCapture, className }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [error, setError] = useState<{message: string, type: string} | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  
  // Pan & Zoom State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Flash/Torch State
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  const [hasFlash, setHasFlash] = useState(false);

  useImperativeHandle(ref, () => ({
    capture: () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          if (onCapture) onCapture(dataUrl);
          return dataUrl;
        }
      }
      return null;
    }
  }));

  const startCamera = useCallback(async () => {
    setError(null);
    setIsInitializing(true);
    try {
      if (videoRef.current && videoRef.current.srcObject) {
         (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }

      const resConstraints = {
        low: { width: { ideal: 640 }, height: { ideal: 480 } },
        med: { width: { ideal: 1280 }, height: { ideal: 720 } },
        high: { width: { ideal: 1920 }, height: { ideal: 1080 } }
      }[resolution];

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: facingMode,
          ...resConstraints
        }, 
        audio: false 
      });

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      // Check for torch (flash) support
      if ((capabilities as any).torch !== undefined) {
        setHasFlash(true);
      } else {
        setHasFlash(false);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      let msg = "An unexpected error occurred while initializing camera optics.";
      let type = "unknown";
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = "Camera permissions were denied. Please check your browser settings.";
        type = "permission";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = "No compatible camera device found on this system.";
        type = "hardware";
      }
      
      setError({ message: msg, type });
    } finally {
      setIsInitializing(false);
    }
  }, [facingMode, resolution]);

  useEffect(() => {
    if (active) {
      startCamera();
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [active, startCamera]);

  // Handle Flash Toggle
  useEffect(() => {
    const applyFlash = async () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        try {
          if (track.getCapabilities && (track.getCapabilities() as any).torch !== undefined) {
            await track.applyConstraints({
              advanced: [{ torch: flashMode === 'on' }]
            } as any);
          }
        } catch (e) {
          console.warn("Could not apply flash constraints", e);
        }
      }
    };
    applyFlash();
  }, [flashMode]);

  // Zoom Handlers
  const handleWheel = (e: React.WheelEvent) => {
    if (!active) return;
    const delta = -e.deltaY * 0.001;
    setZoom(z => Math.min(Math.max(1, z + delta), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const adjustZoom = (amount: number) => {
    setZoom(z => Math.min(Math.max(1, z + amount), 5));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const toggleFlash = () => {
    setFlashMode(prev => prev === 'off' ? 'on' : 'off');
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full bg-black rounded-lg overflow-hidden border border-cyber-700 shadow-[0_0_15px_rgba(0,242,255,0.1)] group ${className}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {error ? (
        <div className="flex flex-col items-center justify-center h-full text-cyber-warn p-6 text-center space-y-4 bg-black/60 backdrop-blur-md">
          <AlertCircle size={40} className="text-red-500" />
          <div className="space-y-1">
            <h3 className="font-bold text-white font-mono uppercase text-sm tracking-widest">Optical Offline</h3>
            <p className="font-sans text-[11px] text-gray-400 max-w-xs">{error.message}</p>
          </div>
          <button 
            onClick={startCamera}
            disabled={isInitializing}
            className="flex items-center gap-2 px-6 py-2 bg-cyber-accent text-black font-bold rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 text-xs"
          >
            <RefreshCw size={14} className={isInitializing ? 'animate-spin' : ''} /> 
            {isInitializing ? 'RETRYING...' : 'RE-INITIALIZE'}
          </button>
        </div>
      ) : (
        <>
          <div 
             className="w-full h-full transition-transform duration-100 ease-out origin-center will-change-transform"
             style={{ 
               transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
               cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
             }}
          >
             <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover select-none pointer-events-none"
            />
          </div>
          
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(0,242,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,242,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-20 pointer-events-none">
            <div className="flex items-center gap-3 bg-cyber-900/80 px-3 py-1.5 rounded-full border border-cyber-accent/30 backdrop-blur-md pointer-events-auto">
              <div className={`w-2 h-2 rounded-full ${active ? 'bg-cyber-success animate-pulse' : 'bg-gray-500'}`}></div>
              <span className="text-[10px] font-mono text-cyber-accent font-bold uppercase tracking-widest">
                {active ? `LIVE // ${resolution.toUpperCase()}` : 'STANDBY'}
              </span>
            </div>

            <div className="flex gap-2 pointer-events-auto">
              {hasFlash && active && (
                <button 
                  onClick={toggleFlash}
                  className={`p-2 rounded-full border backdrop-blur-md transition-all ${flashMode === 'on' ? 'bg-cyber-accent text-black border-transparent' : 'bg-black/60 text-gray-400 border-gray-700'}`}
                  title="Toggle Flash"
                >
                  {flashMode === 'on' ? <Zap size={16} fill="currentColor" /> : <ZapOff size={16} />}
                </button>
              )}
              
              <div className="flex bg-black/60 border border-gray-700 rounded-full p-0.5 backdrop-blur-md">
                {(['low', 'med', 'high'] as const).map((res) => (
                  <button
                    key={res}
                    onClick={() => onResolutionChange?.(res)}
                    className={`px-3 py-1 text-[9px] font-bold rounded-full transition-all uppercase ${resolution === res ? 'bg-cyber-accent text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {active && (
            <div className="absolute bottom-16 right-4 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-auto">
               <div className="bg-cyber-900/90 border border-cyber-700 rounded-2xl p-2 flex flex-col gap-3 backdrop-blur-md shadow-2xl">
                  <button onClick={() => adjustZoom(0.5)} disabled={zoom >= 5} className="p-2 hover:bg-cyber-700 rounded-lg text-gray-400 hover:text-cyber-accent transition-colors disabled:opacity-20"><ZoomIn size={18}/></button>
                  <div className="h-px w-full bg-gray-700"></div>
                  <button onClick={() => adjustZoom(-0.5)} disabled={zoom <= 1} className="p-2 hover:bg-cyber-700 rounded-lg text-gray-400 hover:text-cyber-accent transition-colors disabled:opacity-20"><ZoomOut size={18}/></button>
                  {zoom > 1 && (
                    <>
                      <div className="h-px w-full bg-gray-700"></div>
                      <button onClick={resetView} className="p-2 hover:bg-red-500/20 rounded-lg text-red-500 transition-colors" title="Reset Optics"><Maximize size={18}/></button>
                    </>
                  )}
               </div>
               
               {zoom > 1 && (
                 <div className="flex items-center justify-center gap-1 bg-cyber-accent text-black text-[10px] px-2 py-1 rounded-full font-bold font-mono shadow-[0_0_10px_rgba(132,204,22,0.4)]">
                    <Move size={10} /> {zoom.toFixed(1)}x
                 </div>
               )}
            </div>
          )}
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
});

CameraFeed.displayName = "CameraFeed";

export default CameraFeed;