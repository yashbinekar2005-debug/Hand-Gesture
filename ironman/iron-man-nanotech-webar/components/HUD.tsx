import React from 'react';
import { SuitState } from '../types';

interface HUDProps {
  suitState: SuitState;
  integrity: number; // 0-1
  showInstructions: boolean;
}

const HUD: React.FC<HUDProps> = ({ suitState, integrity, showInstructions }) => {
  const isSuitActive = suitState === SuitState.ACTIVE || suitState === SuitState.ASSEMBLING || suitState === SuitState.RETRACTING;
  
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 flex flex-col justify-between p-6">
      {/* Top Bar / Header */}
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isSuitActive ? 'bg-blue-400 animate-pulse' : 'bg-red-500'}`} />
            <h1 className="text-blue-400 font-mono font-bold tracking-widest text-lg shadow-black drop-shadow-md">
              STARK INDUSTRIES <span className="text-xs opacity-70">v85.3.1</span>
            </h1>
          </div>
          <div className="text-xs text-blue-200 font-mono opacity-80">
            SYS STATUS: {suitState}
          </div>
        </div>
        
        {/* Integrity Bar */}
        <div className="flex flex-col items-end w-1/3 max-w-[200px]">
          <div className="text-xs text-blue-400 font-mono mb-1 w-full text-right">NANOTECH INTEGRITY</div>
          <div className="w-full h-2 bg-blue-900/50 border border-blue-500/30 rounded-sm overflow-hidden relative">
            <div 
              className="absolute right-0 top-0 bottom-0 bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)] transition-all duration-300 ease-out"
              style={{ width: `${integrity * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Central Targeting Reticle (Only when active) */}
      <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-1000 ${isSuitActive ? 'opacity-100' : 'opacity-0'}`}>
         <div className="w-[60vh] h-[60vh] border border-blue-500/20 rounded-full flex items-center justify-center animate-[spin_10s_linear_infinite]">
            <div className="w-[58vh] h-[58vh] border-t border-b border-blue-400/40 rounded-full" />
         </div>
         <div className="absolute w-[40vh] h-[40vh] border-l border-r border-blue-300/30 rounded-full rotate-45" />
      </div>

      {/* Instructions / Alerts */}
      <div className="flex flex-col items-center justify-center mb-10">
        {showInstructions && suitState === SuitState.IDLE && (
          <div className="bg-black/60 border border-blue-500/50 backdrop-blur-sm p-4 rounded-lg text-center animate-pulse">
            <p className="text-blue-300 font-mono text-sm font-bold uppercase tracking-wider">
              Tap Chest to Suit Up
            </p>
          </div>
        )}
        
        {suitState === SuitState.ACTIVE && (
          <div className="bg-black/40 border border-red-500/30 backdrop-blur-sm p-2 rounded text-center">
             <p className="text-red-300 font-mono text-xs uppercase tracking-wider">
              Tap Right Ear to Power Down
            </p>
          </div>
        )}
      </div>

      {/* Bottom Data */}
      <div className="flex justify-between items-end">
        <div className="font-mono text-[10px] text-blue-500/60 leading-tight">
          COORD: 34.0522° N, 118.2437° W<br />
          TEMP: 21°C<br />
          H.R.: 72 BPM
        </div>
        <div className="font-mono text-[10px] text-blue-500/60 text-right leading-tight">
          MEM: 128TB<br />
          PWR: 400GJ/s
        </div>
      </div>

      {/* Vignette Overlay */}
      {isSuitActive && (
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_60%,rgba(0,100,255,0.15)_100%)] z-0" />
      )}
    </div>
  );
};

export default HUD;