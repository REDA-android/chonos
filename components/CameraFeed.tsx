import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, RefreshCw, Maximize, Move } from 'lucide-react';

interface CameraFeedProps {
  active: boolean;
  facingMode: 'user' | 'environment';
  resolution: 'low' | 'med' | 'high';
  onCapture?: (dataUrl: string) => void;
  className?: string;
}

export interface CameraHandle {
  capture: () => string | null;
}

const CameraFeed = forwardRef<CameraHandle, CameraFeedProps>(({ active, facingMode, resolution, onCapture, className }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>('');
  
  // Pan & Zoom State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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
    setError('');
    try {
      if (videoRef.current && videoRef.current.srcObject) {
         (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }

      const resConstraints = {
        low: { width: 640, height: 480 },
        med: { width: 1280, height: 720 },
        high: { width: 1920, height: 1080 }
      }[resolution];

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: facingMode,
          ...resConstraints
        }, 
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access denied:", err);
      setError("Camera Optics Malfunction. Check Permissions.");
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
    return () => {
       // cleanup on unmount not strictly needed as useEffect dependencies handle it, 
       // but good practice to stop tracks if component unmounts while active
    };
  }, [active, startCamera]);

  // Zoom Handlers
  const handleWheel = (e: React.WheelEvent) => {
    if (!active) return;
    e.stopPropagation(); // Prevent page scroll if embedded
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

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
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
        <div className="flex flex-col items-center justify-center h-full text-cyber-warn p-4 text-center space-y-4">
          <p className="font-mono text-sm">{error}</p>
          <button 
            onClick={startCamera}
            className="flex items-center gap-2 px-4 py-2 bg-cyber-900 border border-cyber-warn text-cyber-warn hover:bg-cyber-warn hover:text-white rounded transition-colors"
          >
            <RefreshCw size={16} /> REINITIALIZE
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
          
          <div className="absolute top-4 right-4 flex items-center space-x-2 bg-cyber-900/80 px-3 py-1 rounded-full border border-cyber-accent/30 backdrop-blur-sm z-20">
            <div className={`w-2 h-2 rounded-full ${active ? 'bg-cyber-success animate-pulse' : 'bg-gray-500'}`}></div>
            <span className="text-xs font-mono text-cyber-accent uppercase">
              {active ? `LIVE // ${resolution.toUpperCase()}` : 'OFFLINE'}
            </span>
          </div>

          {/* Zoom Controls */}
          {active && (
            <div className="absolute bottom-16 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-auto">
               <div className="bg-cyber-900/90 border border-cyber-700 rounded-lg p-1.5 flex flex-col gap-2 backdrop-blur-md">
                  <button onClick={() => setZoom(z => Math.min(5, z + 0.5))} className="p-1 hover:text-cyber-accent text-gray-400"><ZoomIn size={18}/></button>
                  <div className="h-px w-full bg-gray-700"></div>
                  <button onClick={() => setZoom(z => Math.max(1, z - 0.5))} className="p-1 hover:text-cyber-accent text-gray-400"><ZoomOut size={18}/></button>
                  {zoom > 1 && (
                    <>
                      <div className="h-px w-full bg-gray-700"></div>
                      <button onClick={resetView} className="p-1 hover:text-cyber-warn text-gray-400" title="Reset View"><Maximize size={18}/></button>
                    </>
                  )}
               </div>
               {zoom > 1 && (
                 <div className="bg-black/80 text-[10px] text-center text-cyber-accent rounded font-mono py-1 border border-cyber-accent/20">
                    {zoom.toFixed(1)}x
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