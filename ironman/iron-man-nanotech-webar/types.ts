export enum SuitState {
    IDLE = 'IDLE',
    SCANNING = 'SCANNING',
    ASSEMBLING = 'ASSEMBLING',
    ACTIVE = 'ACTIVE',
    RETRACTING = 'RETRACTING'
}

export interface Landmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
}

export interface PoseResults {
    poseLandmarks: Landmark[];
}

export interface ParticleSystemState {
    status: SuitState;
    progress: number; // 0 to 1
}