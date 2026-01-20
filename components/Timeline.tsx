import React from 'react';
import { CapturedImage } from '../types';
import { Clock, Eye, AlertTriangle, Leaf, Sprout, Flower, Sun, HelpCircle } from 'lucide-react';

interface TimelineProps {
  images: CapturedImage[];
  onSelect: (img: CapturedImage) => void;
}

const Timeline: React.FC<TimelineProps> = ({ images, onSelect }) => {
  const getHealthColor = (img: CapturedImage) => {
    // Priority: Explicit Metadata -> Text Analysis -> Default
    if (img.healthStatus === 'CRITICAL') return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
    if (img.healthStatus === 'STRESSED') return 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)]';
    if (img.healthStatus === 'HEALTHY') return 'border-cyber-accent shadow-[0_0_10px_rgba(132,204,22,0.4)]';

    if (!img.analysis) return 'border-cyber-700';
    
    // Fallback legacy analysis
    const t = img.analysis.toLowerCase();
    if (t.includes('dead') || t.includes('disease') || t.includes('pest') || t.includes('rot') || t.includes('critical')) return 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
    if (t.includes('wilt') || t.includes('yellow') || t.includes('dry') || t.includes('spot')) return 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.4)]';
    return 'border-cyber-accent shadow-[0_0_10px_rgba(132,204,22,0.4)]';
  };

  const getStageIcon = (stage?: string) => {
    if (!stage) return null;
    const s = stage.toLowerCase();
    if (s.includes('germinat') || s.includes('seed') || s.includes('sprout')) return <Sprout size={12} className="text-cyber-accent" />;
    if (s.includes('flower') || s.includes('bloom') || s.includes('bud')) return <Flower size={12} className="text-pink-400" />;
    if (s.includes('fruit') || s.includes('harvest') || s.includes('mature')) return <Sun size={12} className="text-orange-400" />;
    if (s.includes('veg') || s.includes('leaf')) return <Leaf size={12} className="text-green-400" />;
    return <HelpCircle size={12} className="text-gray-400" />;
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
            className={`group relative cursor-pointer w-48 h-32 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${getHealthColor(img)}`}
          >
            <img src={img.dataUrl} alt="Snapshot" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/0 transition-colors"></div>
            
            {/* Analysis Available Indicator */}
            {img.analysis && (
               <div className="absolute top-2 right-2 bg-cyber-accent text-black rounded-full p-1 shadow-[0_0_10px_#84cc16] animate-pulse z-10">
                 <Eye size={10} />
               </div>
            )}

            {/* Growth Stage Icon */}
            {img.growthStage && (
              <div 
                className="absolute top-2 left-2 bg-black/80 p-1 rounded-full border border-gray-600 shadow-md backdrop-blur-sm"
                title={`Stage: ${img.growthStage}`}
              >
                {getStageIcon(img.growthStage)}
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