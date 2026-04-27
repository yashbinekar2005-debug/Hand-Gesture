import { Landmark } from '../types';

export const lerp = (start: number, end: number, t: number) => {
  return start * (1 - t) + end * t;
};

export const clamp = (val: number, min: number, max: number) => {
  return Math.min(Math.max(val, min), max);
};

// Exponential smoothing for landmarks to reduce jitter
export const smoothLandmarks = (
  prevLandmarks: Landmark[] | null,
  newLandmarks: Landmark[],
  alpha: number = 0.5
): Landmark[] => {
  if (!prevLandmarks) return newLandmarks;

  return newLandmarks.map((landmark, index) => {
    const prev = prevLandmarks[index];
    // If visibility is low, trust the new one less or just snap? 
    // Usually standard smoothing is fine.
    return {
      x: lerp(prev.x, landmark.x, alpha),
      y: lerp(prev.y, landmark.y, alpha),
      z: lerp(prev.z, landmark.z, alpha),
      visibility: landmark.visibility
    };
  });
};

export const getDistance = (l1: Landmark, l2: Landmark): number => {
    const dx = l1.x - l2.x;
    const dy = l1.y - l2.y;
    // We ignore Z for simple 2D trigger checks mostly, but can include it if accurate
    return Math.sqrt(dx * dx + dy * dy);
};

export const midpoint = (l1: Landmark, l2: Landmark): Landmark => {
    return {
        x: (l1.x + l2.x) / 2,
        y: (l1.y + l2.y) / 2,
        z: (l1.z + l2.z) / 2,
        visibility: Math.min(l1.visibility || 0, l2.visibility || 0)
    };
};