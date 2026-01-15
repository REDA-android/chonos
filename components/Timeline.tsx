import React from 'react';
import { CapturedImage } from '../types';
import { Clock, Eye } from 'lucide-react';

interface TimelineProps {
  images: CapturedImage[];
  onSelect: (img: CapturedImage) => void;
}

const Timeline: React.FC<TimelineProps> = ({ images, onSelect }) => {
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
            className="group relative cursor-pointer w-48 h-32 rounded-lg overflow-hidden border border-cyber-700 hover:border-cyber-accent transition-all hover:scale-105"
          >
            <img src={img.dataUrl} alt="Snapshot" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/0 transition-colors"></div>
            
            <div className="absolute bottom-0 left-0 right-0 bg-cyber-900/80 p-2 flex justify-between items-center backdrop-blur-sm">
              <span className="text-xs font-mono text-gray-300">
                {new Date(img.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {img.analysis && <Eye size={12} className="text-cyber-accent" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline;