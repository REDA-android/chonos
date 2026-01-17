import React from 'react';
import { CapturedImage } from '../types';
import { Clock, Eye, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';

interface TimelineProps {
  images: CapturedImage[];
  onSelect: (img: CapturedImage) => void;
}

const Timeline: React.FC<TimelineProps> = ({ images, onSelect }) => {
  const getThreatColor = (img: CapturedImage) => {
    // Priority: Explicit Metadata -> Text Analysis -> Default
    if (img.threatLevel === 'CRITICAL') return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
    if (img.threatLevel === 'CAUTION') return 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)]';
    if (img.threatLevel === 'SAFE') return 'border-cyber-success shadow-[0_0_10px_rgba(0,255,157,0.4)]';

    if (!img.analysis) return 'border-cyber-700';
    
    // Fallback legacy analysis
    const t = img.analysis.toLowerCase();
    if (t.includes('intruder') || t.includes('danger') || t.includes('weapon') || t.includes('fire') || t.includes('smoke') || t.includes('suspicious')) return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
    if (t.includes('person') || t.includes('human') || t.includes('movement') || t.includes('change') || t.includes('vehicle')) return 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)]';
    return 'border-cyber-success shadow-[0_0_10px_rgba(0,255,157,0.4)]';
  };

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500 border border-dashed border-cyber-700 rounded-lg">
        <Clock className="mb-2 opacity-50" />
        <p>No snapshots yet.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
      <div className="flex space-x-4 min-w-max px-1">
        {[...images].reverse().map((img) => (
          <div 
            key={img.id} 
            onClick={() => onSelect(img)}
            className={`group relative cursor-pointer w-48 h-32 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${getThreatColor(img)}`}
          >
            <img src={img.dataUrl} alt="Snapshot" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/0 transition-colors"></div>
            
            {/* Analysis Available Indicator */}
            {img.analysis && (
               <div className="absolute top-2 right-2 bg-cyber-accent text-black rounded-full p-1 shadow-[0_0_10px_#00f2ff] animate-pulse z-10">
                 <Eye size={10} />
               </div>
            )}

            {/* Event Tags */}
            {img.eventTags && img.eventTags.length > 0 && (
              <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[80%] pointer-events-none">
                {img.eventTags.slice(0, 2).map((tag, idx) => (
                  <span key={idx} className="text-[7px] bg-black/80 text-cyber-accent px-1 py-0.5 rounded border border-cyber-accent/30 font-mono uppercase truncate">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 bg-cyber-900/80 p-2 flex justify-between items-center backdrop-blur-sm border-t border-cyber-700/50">
              <span className="text-[10px] font-mono text-gray-300">
                {new Date(img.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[9px] text-cyber-accent/50 font-mono">ID-{img.id.slice(-4)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;