import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

interface CameraFeedProps {
  active: boolean;
  facingMode: 'user' | 'environment';
  resolution: 'low' | 'med' | 'high';
  onCapture?: (dataUrl: string) => void;
}

export interface CameraHandle {
  capture: () => string | null;
}

const CameraFeed = forwardRef<CameraHandle, CameraFeedProps>(({ active, facingMode, resolution, onCapture }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>('');

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

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const resConstraints = {
          low: { width: 640, height: 480 },
          med: { width: 1280, height: 720 },
          high: { width: 1920, height: 1080 }
        }[resolution];

        stream = await navigator.mediaDevices.getUserMedia({ 
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
        setError("Camera access denied or resolution not supported. Please check permissions.");
      }
    };

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
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [active, facingMode, resolution]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden border border-cyber-700 shadow-[0_0_15px_rgba(0,242,255,0.1)]">
      {error ? (
        <div className="flex items-center justify-center h-full text-cyber-warn p-4 text-center">
          {error}
        </div>
      ) : (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(0,242,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,242,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
          
          <div className="absolute top-4 right-4 flex items-center space-x-2 bg-cyber-900/80 px-3 py-1 rounded-full border border-cyber-accent/30 backdrop-blur-sm">
            <div className={`w-2 h-2 rounded-full ${active ? 'bg-cyber-success animate-pulse' : 'bg-gray-500'}`}></div>
            <span className="text-xs font-mono text-cyber-accent uppercase">
              {active ? `LIVE // ${resolution.toUpperCase()}` : 'OFFLINE'}
            </span>
          </div>
        </>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
});

CameraFeed.displayName = "CameraFeed";

export default CameraFeed;