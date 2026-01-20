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
  
  const [error, setError] = useState<{message: string; type: string} | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  
  // Pan & Zoom State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Flash/Torch State
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [hasTorch, setHasTorch] = useState(false);

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
          // Return high quality JPEG
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
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
      const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : {};
      setHasTorch(!!capabilities.torch);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      let msg = "Camera Optics Malfunction. Check Permissions.";
      let type = "unknown";
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = "Camera access denied by user. Check browser settings.";
        type = "permission";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = "No compatible optics found on this hardware.";
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
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    }
  }, [active, startCamera]);

  useEffect(() => {
    const applyFlash = async () => {
      if (videoRef.current && videoRef.current.srcObject && hasTorch) {
        const stream = videoRef.current.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        try {
          // 'auto' mode isn't natively supported by standard applyConstraints for torch in many browsers,
          // so we simulate it or just use 'on/off' toggle. Here we handle 'on'/'off'.
          await track.applyConstraints({
            advanced: [{ torch: flashMode === 'on' }]
          } as any);
        } catch (e) {
          console.warn("Flash application error", e);
        }
      }
    };
    applyFlash();
  }, [flashMode, hasTorch]);

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

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full bg-black rounded-lg overflow-hidden border border-cyber-700 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] group ${className}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {error ? (
        <div className="flex flex-col items-center justify-center h-full text-cyber-warn p-6 text-center space-y-4 bg-cyber-900/90 backdrop-blur-sm">
          <AlertCircle size={48} className="text-red-600 animate-pulse" />
          <div className="space-y-1">
            <h3 className="font-bold text-white font-mono uppercase text-sm tracking-widest">Camera Optics Malfunction</h3>
            <p className="font-sans text-[11px] text-gray-400 max-w-xs">{error.message}</p>
          </div>
          <button 
            onClick={startCamera}
            disabled={isInitializing}
            className="flex items-center gap-2 px-8 py-2 bg-transparent border border-red-500/50 text-red-500 font-bold rounded hover:bg-red-500/10 transition-all text-xs font-mono uppercase tracking-tighter"
          >
            <RefreshCw size={14} className={isInitializing ? 'animate-spin' : ''} /> 
            {isInitializing ? 'Reinitializing...' : 'Reinitialize'}
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
          
          {/* Scanline Overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-10 bg-[linear-gradient(rgba(0,242,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,242,255,0.1)_1px,transparent_1px)] bg-[size:30px_30px]"></div>
          
          {/* Feed HUD */}
          <div className="absolute top-4 left-4 flex flex-col gap-2 z-20 pointer-events-none">
            <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded border border-cyber-accent/30 backdrop-blur-md">
              <span className="text-[10px] font-mono text-cyber-accent font-bold uppercase tracking-widest">
                CAM-01 // {facingMode.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded border border-white/5 text-[10px] font-mono text-white/40">
              {new Date().toLocaleTimeString()}
            </div>
          </div>

          {/* Controls Bar */}
          <div className="absolute top-4 right-4 flex gap-2 pointer-events-auto z-20">
            {hasTorch && active && (
              <div className="flex bg-black/60 border border-white/10 rounded-lg p-0.5 backdrop-blur-md">
                <button 
                  onClick={() => setFlashMode('off')}
                  className={`p-1.5 rounded transition-all ${flashMode === 'off' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                  title="Flash Off"
                >
                  <ZapOff size={14} />
                </button>
                <button 
                  onClick={() => setFlashMode('on')}
                  className={`p-1.5 rounded transition-all ${flashMode === 'on' ? 'bg-cyber-accent text-black shadow-[0_0_10px_rgba(132,204,22,0.5)]' : 'text-gray-500 hover:text-cyber-accent'}`}
                  title="Flash On"
                >
                  <Zap size={14} fill={flashMode === 'on' ? 'currentColor' : 'none'} />
                </button>
                <button 
                  onClick={() => setFlashMode('auto')}
                  className={`px-2 py-0.5 rounded text-[8px] font-bold transition-all font-mono ${flashMode === 'auto' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                  title="Flash Auto"
                >
                  AUTO
                </button>
              </div>
            )}
            
            <div className="flex bg-black/60 border border-white/10 rounded-lg p-0.5 backdrop-blur-md">
              {(['low', 'med', 'high'] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => onResolutionChange?.(res)}
                  className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all font-mono uppercase ${resolution === res ? 'bg-cyber-success text-black' : 'text-gray-500 hover:text-white'}`}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          {/* Zoom Hub */}
          {active && (
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-auto">
               <div className="bg-black/80 border border-cyber-700 rounded-lg p-1 flex flex-col gap-1 backdrop-blur-md">
                  <button onClick={() => setZoom(z => Math.min(5, z + 0.5))} disabled={zoom >= 5} className="p-2 hover:bg-white/5 text-gray-400 hover:text-white transition-all disabled:opacity-10"><ZoomIn size={18}/></button>
                  <div className="h-px w-full bg-white/5"></div>
                  <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} disabled={zoom <= 1} className="p-2 hover:bg-white/5 text-gray-400 hover:text-white transition-all disabled:opacity-10"><ZoomOut size={18}/></button>
                  {zoom > 1 && (
                    <>
                      <div className="h-px w-full bg-white/5"></div>
                      <button onClick={() => { setZoom(1); setPan({x:0, y:0}); }} className="p-2 hover:bg-red-500/20 text-red-500 transition-all" title="Reset Optics"><Maximize size={18}/></button>
                    </>
                  )}
               </div>
               
               {zoom > 1 && (
                 <div className="flex items-center justify-center gap-1 bg-cyber-accent text-black text-[9px] px-2 py-0.5 rounded font-bold font-mono shadow-[0_0_15px_rgba(132,204,22,0.4)]">
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