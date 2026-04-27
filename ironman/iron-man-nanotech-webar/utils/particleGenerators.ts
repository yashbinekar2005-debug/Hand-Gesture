import * as THREE from 'three';

// Helper to get a point ON THE SURFACE of a cylinder (Armor Plate)
export const getPointOnCylinderSurface = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  taper: number = 1.0 // 1.0 = cylinder, < 1.0 = cone-ish (good for forearms)
): THREE.Vector3 => {
  const vec = new THREE.Vector3().subVectors(end, start);
  const len = vec.length();
  const axis = vec.clone().normalize();
  
  // Position along axis (Uniform)
  const t = Math.random();
  const currentRadius = radius * (1 - t * (1 - taper));
  const centerPos = new THREE.Vector3().copy(start).add(vec.multiplyScalar(t));

  // Random angle around the axis
  const theta = Math.random() * Math.PI * 2;

  // Create an arbitrary orthogonal basis
  // If axis is close to Y, use X, else use Y
  const arbitrary = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const perp1 = new THREE.Vector3().crossVectors(axis, arbitrary).normalize();
  const perp2 = new THREE.Vector3().crossVectors(axis, perp1).normalize();

  const offset = new THREE.Vector3()
    .addScaledVector(perp1, currentRadius * Math.cos(theta))
    .addScaledVector(perp2, currentRadius * Math.sin(theta));

  return centerPos.add(offset);
};

// Surface of a sphere (Helmet/Shoulders)
export const getPointOnSphereSurface = (center: THREE.Vector3, radius: number): THREE.Vector3 => {
    // Uniform distribution on sphere surface
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    
    const sinPhi = Math.sin(phi);
    const x = radius * sinPhi * Math.cos(theta);
    const y = radius * sinPhi * Math.sin(theta);
    const z = radius * Math.cos(phi);
    
    return new THREE.Vector3(x, y, z).add(center);
};

// Rectangular Surface (Chest Plates)
export const getPointOnBoxSurface = (center: THREE.Vector3, size: THREE.Vector3): THREE.Vector3 => {
    // Pick a random face
    const face = Math.floor(Math.random() * 6);
    const point = new THREE.Vector3();
    
    const rx = (Math.random() - 0.5);
    const ry = (Math.random() - 0.5);
    
    switch(face) {
        case 0: // +x
            point.set(0.5, rx, ry).multiply(size); break;
        case 1: // -x
            point.set(-0.5, rx, ry).multiply(size); break;
        case 2: // +y
            point.set(rx, 0.5, ry).multiply(size); break;
        case 3: // -y
            point.set(rx, -0.5, ry).multiply(size); break;
        case 4: // +z (Front - most important for chest)
            point.set(rx, ry, 0.5).multiply(size); break;
        case 5: // -z
            point.set(rx, ry, -0.5).multiply(size); break;
    }
    
    // Bias towards front for chest (face 4)
    if (Math.random() > 0.3) {
         point.set((Math.random() - 0.5), (Math.random() - 0.5), 0.5).multiply(size);
    }

    return point.add(center);
};