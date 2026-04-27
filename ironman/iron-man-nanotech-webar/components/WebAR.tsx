import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as mpPose from '@mediapipe/pose';
import * as cameraUtils from '@mediapipe/camera_utils';
import { SuitState, Landmark } from '../types';
import { smoothLandmarks, getDistance, midpoint, lerp, clamp } from '../utils/mathUtils';
import HUD from './HUD';

// --- STARK INDUSTRIES CONFIG ---
const ASSEMBLY_DURATION = 4.0;
const RETRACTION_DURATION = 2.0; 
const CHEST_TRIGGER_DISTANCE = 0.15;
const HEAD_TRIGGER_DISTANCE = 0.18; 
const SUIT_DOWN_DELAY = 0.8; // Seconds to hold ear tap to trigger shutdown
const CALIBRATION_FRAMES = 60; // 2 seconds

const WebAR: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State
  const [suitState, setSuitState] = useState<SuitState>(SuitState.SCANNING);
  const [integrity, setIntegrity] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Scene Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  
  const stateRef = useRef<SuitState>(SuitState.SCANNING);
  const timeRef = useRef<number>(0);
  const suitDownTimerRef = useRef<number>(0); 
  
  // Smoothing Refs
  const torsoQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  
  // Biometrics
  const calibrationDataRef = useRef<{
    shoulderWidth: number;
    framesCollected: number;
  }>({ shoulderWidth: 0, framesCollected: 0 });

  const bodyScaleRef = useRef<number>(1.0); 

  // ARMOR MESH REFS
  const armorGroupRef = useRef<THREE.Group | null>(null);
  const meshesRef = useRef<{ [key: string]: THREE.Object3D }>({});
  const materialsRef = useRef<{ [key: string]: THREE.MeshStandardMaterial }>({});
  
  const setupThreeJS = useCallback(() => {
    if (!canvasRef.current) return;
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 2; 

    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      alpha: true, 
      antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); 
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffedd5, 2.5); 
    dirLight.position.set(2, 5, 5);
    scene.add(dirLight);

    const rimLight = new THREE.SpotLight(0x00aaff, 5.0);
    rimLight.position.set(-2, 2, -1.0);
    scene.add(rimLight);

    // Materials
    const redMaterial = new THREE.MeshStandardMaterial({
        color: 0xcc0000, 
        metalness: 0.6,  
        roughness: 0.3,  
        emissive: 0x440000, 
        emissiveIntensity: 0.2
    });

    const goldMaterial = new THREE.MeshStandardMaterial({
        color: 0xffd700, 
        metalness: 0.8,
        roughness: 0.25,
        emissive: 0x443300,
        emissiveIntensity: 0.1
    });

    const silverMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x222222,
        emissiveIntensity: 0.1
    });

    materialsRef.current = {
        red: redMaterial,
        gold: goldMaterial,
        silver: silverMaterial
    };

    const reactorMaterial = new THREE.MeshStandardMaterial({
        color: 0x55ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 2.0,
        toneMapped: false
    });
    
    const eyeMaterial = new THREE.MeshBasicMaterial({
        color: 0xccffff,
        toneMapped: false
    });

    // Armor Group
    const armorGroup = new THREE.Group();
    const meshes: { [key: string]: THREE.Object3D } = {};

    const addPart = (name: string, object: THREE.Object3D) => {
        object.scale.set(0,0,0);
        meshes[name] = object;
        armorGroup.add(object);
    };

    // --- GEOMETRY CONSTRUCTION ---

    // A. HELMET
    const helmetGroup = new THREE.Group();
    
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), redMaterial);
    cranium.scale.set(0.9, 1.05, 1.1); 
    cranium.position.y = 0.3;
    helmetGroup.add(cranium);
    
    const faceGroup = new THREE.Group();
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.2), goldMaterial);
    brow.position.set(0, 0.5, 0.95);
    brow.rotation.x = -0.2; 
    faceGroup.add(brow);

    const maskShape = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.7, 6)); 
    maskShape.material = goldMaterial;
    maskShape.scale.set(1.1, 1, 0.4); 
    maskShape.position.set(0, 0.0, 1.05);
    faceGroup.add(maskShape);

    const jaw = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 0.6, 6), goldMaterial);
    jaw.position.set(0, -0.6, 0.9);
    jaw.scale.set(1.1, 1, 0.5);
    faceGroup.add(jaw);

    const chinTip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), goldMaterial);
    chinTip.position.set(0, -0.85, 1.0);
    faceGroup.add(chinTip);

    meshes['faceplate'] = faceGroup; 
    helmetGroup.add(faceGroup);
    
    const earGeo = new THREE.CylinderGeometry(0.25, 0.2, 0.1, 32);
    const lEar = new THREE.Mesh(earGeo, silverMaterial);
    lEar.rotation.z = Math.PI / 2;
    lEar.position.set(-0.9, 0.1, 0.1);
    helmetGroup.add(lEar);

    const rEar = new THREE.Mesh(earGeo, silverMaterial);
    rEar.rotation.z = Math.PI / 2;
    rEar.position.set(0.9, 0.1, 0.1);
    helmetGroup.add(rEar);

    const eyeGeo = new THREE.BoxGeometry(0.28, 0.05, 0.15); 
    const lEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    lEye.position.set(-0.28, 0.15, 1.25); 
    lEye.rotation.z = -0.18; 
    lEye.rotation.y = 0.15; 
    helmetGroup.add(lEye);

    const rEye = new THREE.Mesh(eyeGeo, eyeMaterial);
    rEye.position.set(0.28, 0.15, 1.25);
    rEye.rotation.z = 0.18;
    rEye.rotation.y = -0.15;
    helmetGroup.add(rEye);
    
    addPart('helmet', helmetGroup);

    // B. TORSO
    const torsoGroup = new THREE.Group();
    const pecGroup = new THREE.Group();
    const lPec = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.15), redMaterial);
    lPec.position.set(-0.3, 0.3, 0.1);
    lPec.rotation.z = -0.15;
    lPec.rotation.y = 0.1; 
    pecGroup.add(lPec);

    const rPec = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.15), redMaterial);
    rPec.position.set(0.3, 0.3, 0.1);
    rPec.rotation.z = 0.15;
    rPec.rotation.y = -0.1;
    pecGroup.add(rPec);

    const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.12), redMaterial);
    sternum.position.set(0, 0.3, 0.12);
    pecGroup.add(sternum);
    
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 0.2, 4), goldMaterial);
    collar.position.set(0, 0.65, 0.05);
    collar.scale.set(1, 1, 0.5);
    collar.rotation.y = Math.PI / 4;
    pecGroup.add(collar);
    torsoGroup.add(pecGroup);
    
    const ribs = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 0.5, 8), redMaterial);
    ribs.position.set(0, -0.2, 0.05);
    ribs.scale.set(1.1, 1, 0.5); 
    torsoGroup.add(ribs);

    const absTop = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.36, 0.25, 6), goldMaterial);
    absTop.position.set(0, -0.55, 0.05);
    absTop.scale.set(1.2, 1, 0.5);
    torsoGroup.add(absTop);

    const absBot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.33, 0.25, 6), silverMaterial);
    absBot.position.set(0, -0.78, 0.05);
    absBot.scale.set(1.2, 1, 0.5);
    torsoGroup.add(absBot);

    const lSide = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), redMaterial);
    lSide.position.set(-0.5, -0.4, 0.0);
    lSide.rotation.z = 0.1;
    torsoGroup.add(lSide);
    
    const rSide = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.2), redMaterial);
    rSide.position.set(0.5, -0.4, 0.0);
    rSide.rotation.z = -0.1;
    torsoGroup.add(rSide);

    addPart('torso', torsoGroup);

    // C. REACTOR (Mark 85 Shield Shape)
    const reactorGroup = new THREE.Group();
    
    // Define Shape Points (Inverted Triangle / Shield)
    const reactorShape = new THREE.Shape();
    const rw = 0.16; 
    const rh = 0.16;
    reactorShape.moveTo(-rw, rh);
    reactorShape.lineTo(rw, rh);
    reactorShape.lineTo(rw * 0.85, -rh * 0.2); 
    reactorShape.lineTo(0, -rh * 1.3); // Bottom Point
    reactorShape.lineTo(-rw * 0.85, -rh * 0.2);
    reactorShape.lineTo(-rw, rh);

    // Housing (Silver)
    const housingSettings = { depth: 0.04, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.01, bevelThickness: 0.01 };
    const housingGeo = new THREE.ExtrudeGeometry(reactorShape, housingSettings);
    const housing = new THREE.Mesh(housingGeo, silverMaterial);
    housing.position.z = -0.02; 
    // Rotate to face front
    // Shape is in XY plane. Extrude is Z.
    // By default it works, but we might need to recenter the geometry
    housingGeo.center();
    reactorGroup.add(housing);

    // Glow Core (Smaller Shape)
    const glowShape = new THREE.Shape();
    const gw = 0.10;
    const gh = 0.10;
    glowShape.moveTo(-gw, gh);
    glowShape.lineTo(gw, gh);
    glowShape.lineTo(gw * 0.85, -gh * 0.2);
    glowShape.lineTo(0, -gh * 1.3);
    glowShape.lineTo(-gw * 0.85, -gh * 0.2);
    glowShape.lineTo(-gw, gh);

    const glowSettings = { depth: 0.04, bevelEnabled: false };
    const glowGeo = new THREE.ExtrudeGeometry(glowShape, glowSettings);
    const glow = new THREE.Mesh(glowGeo, reactorMaterial);
    glowGeo.center();
    glow.position.z = 0.015; // Push out slightly
    reactorGroup.add(glow);

    addPart('reactor', reactorGroup);

    // D. LIMBS
    const shoulderGeo = new THREE.SphereGeometry(1, 32, 32);
    addPart('l_shoulder', new THREE.Mesh(shoulderGeo, goldMaterial));
    addPart('r_shoulder', new THREE.Mesh(shoulderGeo, goldMaterial));

    const bicepGeo = new THREE.CylinderGeometry(0.8, 0.7, 1, 16);
    addPart('l_upperArm', new THREE.Mesh(bicepGeo, goldMaterial));
    addPart('r_upperArm', new THREE.Mesh(bicepGeo, goldMaterial));

    const elbowGeo = new THREE.SphereGeometry(0.7, 16, 16);
    addPart('l_elbow', new THREE.Mesh(elbowGeo, silverMaterial));
    addPart('r_elbow', new THREE.Mesh(elbowGeo, silverMaterial));

    const forearmGeo = new THREE.CylinderGeometry(0.7, 0.55, 1, 16);
    addPart('l_forearm', new THREE.Mesh(forearmGeo, redMaterial));
    addPart('r_forearm', new THREE.Mesh(forearmGeo, redMaterial));

    const handGeo = new THREE.BoxGeometry(1, 1.2, 0.3);
    addPart('l_hand', new THREE.Mesh(handGeo, redMaterial));
    addPart('r_hand', new THREE.Mesh(handGeo, redMaterial));

    scene.add(armorGroup);
    armorGroupRef.current = armorGroup;
    meshesRef.current = meshes;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
  }, []);
  
  const transformLandmark = (lm: Landmark, videoWidth: number, videoHeight: number): THREE.Vector3 => {
      const aspect = videoWidth / videoHeight;
      const fov = 75;
      const dist = 2; 
      const visibleHeight = 2 * Math.tan((fov * Math.PI / 180) / 2) * dist;
      const visibleWidth = visibleHeight * aspect;
      
      const x = (lm.x - 0.5) * visibleWidth; 
      const y = -(lm.y - 0.5) * visibleHeight;
      const z = -lm.z * 1.5; 
      
      return new THREE.Vector3(x, y, z);
  };
  
  const alignMesh = (
      mesh: THREE.Object3D, 
      start: THREE.Vector3, 
      end: THREE.Vector3, 
      thickness: number,
      scaleY: number = 1.0 
  ) => {
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mesh.position.copy(mid);

      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      
      mesh.rotation.set(0,0,0);
      const axis = new THREE.Vector3(0, 1, 0); 
      const quaternion = new THREE.Quaternion().setFromUnitVectors(axis, direction.clone().normalize());
      mesh.setRotationFromQuaternion(quaternion);

      mesh.scale.set(thickness, length * scaleY, thickness);
  };

  const getGrowthFactor = (currentTime: number, startTime: number, duration: number) => {
      const t = clamp((currentTime - startTime) / duration, 0, 1);
      return 1 - Math.pow(1 - t, 3);
  };

  const updateEmissive = (scale: number, targetMat: THREE.MeshStandardMaterial) => {
      if (scale > 0.05 && scale < 0.95) {
          const intensity = Math.sin(scale * Math.PI) * 2.0; 
          targetMat.emissive.setHex(0x00aaff);
          targetMat.emissiveIntensity = intensity;
      } else {
          targetMat.emissiveIntensity = lerp(targetMat.emissiveIntensity, 0, 0.1);
      }
  };

  const updateArmor = (landmarks: Landmark[]) => {
      if (!meshesRef.current || !sceneRef.current) return;
      const meshes = meshesRef.current;
      const mats = materialsRef.current;
      
      const width = window.innerWidth;
      const height = window.innerHeight;

      // Vectors
      const L_Ear = transformLandmark(landmarks[7], width, height);
      const R_Ear = transformLandmark(landmarks[8], width, height);
      const L_Shoulder = transformLandmark(landmarks[11], width, height);
      const R_Shoulder = transformLandmark(landmarks[12], width, height);
      const L_Elbow = transformLandmark(landmarks[13], width, height);
      const R_Elbow = transformLandmark(landmarks[14], width, height);
      const L_Wrist = transformLandmark(landmarks[15], width, height);
      const R_Wrist = transformLandmark(landmarks[16], width, height);
      const L_Hip = transformLandmark(landmarks[23], width, height);
      const R_Hip = transformLandmark(landmarks[24], width, height);

      // --- BIOMETRICS ---
      const currentShoulderWidth = L_Shoulder.distanceTo(R_Shoulder);
      
      if (stateRef.current === SuitState.SCANNING) {
          if (currentShoulderWidth > 0.1 && 
              landmarks[11].visibility! > 0.8 && 
              landmarks[12].visibility! > 0.8) {
              
              calibrationDataRef.current.shoulderWidth += currentShoulderWidth;
              calibrationDataRef.current.framesCollected++;
              setScanProgress(calibrationDataRef.current.framesCollected / CALIBRATION_FRAMES);

              if (calibrationDataRef.current.framesCollected >= CALIBRATION_FRAMES) {
                  const avgWidth = calibrationDataRef.current.shoulderWidth / CALIBRATION_FRAMES;
                  bodyScaleRef.current = avgWidth; 
                  stateRef.current = SuitState.IDLE;
                  setSuitState(SuitState.IDLE);
              }
          }
      }

      // --- SCALES & ANIMATION ---
      const baseScale = bodyScaleRef.current;
      const limbThickness = baseScale * 0.22; 
      const jointSize = limbThickness * 1.25;
      const chestMid = new THREE.Vector3().lerpVectors(L_Shoulder, R_Shoulder, 0.5);
      
      // STABILITY FIX: CHECK HIP VISIBILITY
      // If hips are not visible, assume a straight spine down from chest
      const hipsVisible = (landmarks[23].visibility || 0) > 0.5 && (landmarks[24].visibility || 0) > 0.5;
      let safeHipMid = new THREE.Vector3();
      if (hipsVisible) {
          safeHipMid.lerpVectors(L_Hip, R_Hip, 0.5);
      } else {
          // Assume hips are ~2.5x shoulder width down from chest
          const spineDown = new THREE.Vector3(0, -1, 0).multiplyScalar(currentShoulderWidth * 2.0);
          safeHipMid.addVectors(chestMid, spineDown);
      }

      const torsoHeight = chestMid.distanceTo(safeHipMid);
      const torsoCenter = new THREE.Vector3().lerpVectors(chestMid, safeHipMid, 0.45); 
      const headSize = L_Ear.distanceTo(R_Ear) * 2.3; 

      const t = timeRef.current;
      let chestScale = 0, shoulderScale = 0, uArmScale = 0, fArmScale = 0, handScale = 0, headScale = 0, faceplateScale = 0;
      
      // REACTOR LOGIC: Always On
      const pulseSpeed = stateRef.current === SuitState.ASSEMBLING ? 10 : 2; 
      const pulseMin = 1.0;
      const pulseMax = 1.1;
      const pulse = pulseMin + Math.sin(Date.now() / 1000 * pulseSpeed) * (pulseMax - pulseMin);
      
      if (stateRef.current === SuitState.ASSEMBLING) {
          chestScale = getGrowthFactor(t, 0.1, 0.9);
          shoulderScale = getGrowthFactor(t, 0.6, 0.8);
          uArmScale = getGrowthFactor(t, 1.0, 0.8);
          fArmScale = getGrowthFactor(t, 1.5, 0.8);
          handScale = getGrowthFactor(t, 2.0, 0.8);
          headScale = getGrowthFactor(t, 2.5, 0.7);
          faceplateScale = getGrowthFactor(t, 3.0, 0.5);

          setIntegrity(t / ASSEMBLY_DURATION);
          if (t > ASSEMBLY_DURATION) {
              setSuitState(SuitState.ACTIVE);
              stateRef.current = SuitState.ACTIVE;
          }
          updateEmissive(chestScale, mats.red);

      } else if (stateRef.current === SuitState.RETRACTING) {
          const rt = 1 - clamp(t / RETRACTION_DURATION, 0, 1);
          setIntegrity(rt);
          chestScale = shoulderScale = uArmScale = fArmScale = handScale = headScale = faceplateScale = rt;
          
          if (rt <= 0) {
              setSuitState(SuitState.IDLE);
              stateRef.current = SuitState.IDLE;
          }
      } else if (stateRef.current === SuitState.ACTIVE) {
          chestScale = shoulderScale = uArmScale = fArmScale = handScale = headScale = faceplateScale = 1;
          setIntegrity(1);
      } else if (stateRef.current === SuitState.IDLE || stateRef.current === SuitState.SCANNING) {
          chestScale = 0; shoulderScale = 0; uArmScale = 0; fArmScale = 0; handScale = 0; headScale = 0; faceplateScale = 0;
      }

      // --- APPLY TRANSFORMS ---

      // REACTOR - ANCHOR
      meshes['reactor'].position.copy(chestMid);
      meshes['reactor'].position.y -= torsoHeight * 0.12; 
      meshes['reactor'].position.z += limbThickness * 0.9; 
      
      // Look forward relative to body
      const spineV = new THREE.Vector3().subVectors(chestMid, safeHipMid);
      const rightV = new THREE.Vector3().subVectors(R_Shoulder, L_Shoulder);
      const fwdV = new THREE.Vector3().crossVectors(rightV, spineV).normalize();
      const lookTarget = new THREE.Vector3().copy(meshes['reactor'].position).add(fwdV);
      
      // Smooth reactor rotation too to prevent jitter
      const reactorTargetQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(meshes['reactor'].position, lookTarget, new THREE.Vector3(0,1,0)));
      meshes['reactor'].quaternion.slerp(reactorTargetQuat, 0.2);
      
      meshes['reactor'].scale.setScalar(Math.max(limbThickness * 1.5, 0.1) * pulse);

      // HELMET
      if (headScale > 0.01) {
          const headCenter = new THREE.Vector3().lerpVectors(L_Ear, R_Ear, 0.5);
          headCenter.y += headSize * 0.1; 
          meshes['helmet'].position.copy(headCenter);
          meshes['helmet'].lookAt(headCenter.x, headCenter.y, headCenter.z + 5); 
          meshes['helmet'].scale.setScalar(headSize * 0.55 * headScale);

          // Animate Faceplate
          const fp = meshes['faceplate'];
          if (fp) {
              const openY = 0.5;
              const openRot = -0.5;
              const clampFactor = faceplateScale;
              
              fp.position.y = lerp(openY, 0, clampFactor);
              fp.rotation.x = lerp(openRot, 0, clampFactor);
          }
      } else {
          meshes['helmet'].scale.set(0,0,0);
      }

      // TORSO - STABLE ROTATION MATRIX WITH SMOOTHING
      // 1. Calculate Basis Vectors
      const vUp = new THREE.Vector3().subVectors(chestMid, safeHipMid).normalize(); // Up (Hip to Chest)
      const vRight = new THREE.Vector3().subVectors(R_Shoulder, L_Shoulder).normalize(); // Right (L to R)
      const vFwd = new THREE.Vector3().crossVectors(vRight, vUp).normalize(); // Forward (Out of chest)
      // Recalculate Right to ensure orthogonality (Up is primary, Fwd is secondary)
      const vRightOrtho = new THREE.Vector3().crossVectors(vUp, vFwd).normalize();

      // 2. Construct Matrix
      const rotationMatrix = new THREE.Matrix4();
      // Map: Geometry Y -> vUp, Geometry X -> vRightOrtho, Geometry Z -> vFwd
      rotationMatrix.makeBasis(vRightOrtho, vUp, vFwd);
      
      // 3. Apply with Smoothing
      const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);
      
      // Use ref to store last quaternion and slerp towards new target
      if (stateRef.current !== SuitState.SCANNING) { // Only smooth when tracking
         torsoQuatRef.current.slerp(targetQuaternion, 0.15); // Factor 0.15 = Smooth, 0.9 = Snappy
         meshes['torso'].quaternion.copy(torsoQuatRef.current);
      } else {
         meshes['torso'].quaternion.copy(targetQuaternion);
         torsoQuatRef.current.copy(targetQuaternion);
      }

      meshes['torso'].position.copy(torsoCenter);
      meshes['torso'].scale.set(baseScale * 1.0 * chestScale, torsoHeight * 1.05 * chestScale, baseScale * 0.3 * chestScale);

      // SHOULDERS
      meshes['l_shoulder'].position.copy(L_Shoulder);
      meshes['l_shoulder'].scale.setScalar(jointSize * shoulderScale);
      
      meshes['r_shoulder'].position.copy(R_Shoulder);
      meshes['r_shoulder'].scale.setScalar(jointSize * shoulderScale);

      // ARMS
      alignMesh(meshes['l_upperArm'], L_Shoulder, L_Elbow, limbThickness * uArmScale, 0.95);
      alignMesh(meshes['r_upperArm'], R_Shoulder, R_Elbow, limbThickness * uArmScale, 0.95);

      meshes['l_elbow'].position.copy(L_Elbow);
      meshes['l_elbow'].scale.setScalar(jointSize * 0.8 * fArmScale);
      
      meshes['r_elbow'].position.copy(R_Elbow);
      meshes['r_elbow'].scale.setScalar(jointSize * 0.8 * fArmScale);

      alignMesh(meshes['l_forearm'], L_Elbow, L_Wrist, limbThickness * 0.85 * fArmScale, 0.9);
      alignMesh(meshes['r_forearm'], R_Elbow, R_Wrist, limbThickness * 0.85 * fArmScale, 0.9);

      // HANDS
      meshes['l_hand'].position.copy(L_Wrist);
      meshes['l_hand'].rotation.copy(meshes['l_forearm'].rotation); 
      meshes['l_hand'].scale.set(limbThickness * 0.6 * handScale, limbThickness * 1.1 * handScale, limbThickness * 0.25 * handScale);

      meshes['r_hand'].position.copy(R_Wrist);
      meshes['r_hand'].rotation.copy(meshes['r_forearm'].rotation);
      meshes['r_hand'].scale.set(limbThickness * 0.6 * handScale, limbThickness * 1.1 * handScale, limbThickness * 0.25 * handScale);
  };

  const handleGestures = (landmarks: Landmark[]) => {
      if (stateRef.current === SuitState.SCANNING) return;

      const l11 = landmarks[11];
      const l12 = landmarks[12];
      const chestCenter = midpoint(l11, l12);
      const rIndex = landmarks[20];
      const lIndex = landmarks[19];
      const rEar = landmarks[8];
      
      // SUIT UP: Chest Tap
      const distL = getDistance(lIndex, chestCenter);
      const distR = getDistance(rIndex, chestCenter);
      const isTouchingChest = distL < CHEST_TRIGGER_DISTANCE || distR < CHEST_TRIGGER_DISTANCE;

      if (stateRef.current === SuitState.IDLE) {
          if (isTouchingChest) {
              stateRef.current = SuitState.ASSEMBLING;
              setSuitState(SuitState.ASSEMBLING);
              timeRef.current = 0; 
          }
      }
      
      // SUIT DOWN: Right Ear Tap (WITH DELAY)
      if (stateRef.current === SuitState.ACTIVE) {
           const distHead = getDistance(rIndex, rEar); 
           if (distHead < HEAD_TRIGGER_DISTANCE) {
               suitDownTimerRef.current += 1/30; 
               
               if (suitDownTimerRef.current > SUIT_DOWN_DELAY) {
                   stateRef.current = SuitState.RETRACTING;
                   setSuitState(SuitState.RETRACTING);
                   timeRef.current = 0;
                   suitDownTimerRef.current = 0;
               }
           } else {
               suitDownTimerRef.current = 0; 
           }
      }
  };
  
  const onResults = useCallback((results: any) => {
      if (!results.poseLandmarks) return;
      const smoothed = smoothLandmarks(landmarksRef.current, results.poseLandmarks, 0.7); 
      landmarksRef.current = smoothed;
      
      const threshold = stateRef.current === SuitState.ACTIVE ? 0.1 : 0.2;
      const shouldersVisible = smoothed[11].visibility! > threshold && smoothed[12].visibility! > threshold;
      
      if (shouldersVisible) {
          if (stateRef.current === SuitState.ASSEMBLING || stateRef.current === SuitState.RETRACTING) {
              timeRef.current += 1/30; 
          }
          
          handleGestures(smoothed);
          updateArmor(smoothed);
          
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
      } 
  }, []);

  useEffect(() => {
    setupThreeJS();
    
    // @ts-ignore
    const Pose = mpPose.Pose || mpPose.default?.Pose;
    if (!Pose) return;
    
    const pose = new Pose({locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.65, minTrackingConfidence: 0.65 });
    pose.onResults(onResults);
    
    // @ts-ignore
    const Camera = cameraUtils.Camera || cameraUtils.default?.Camera;
    if (Camera && videoRef.current) {
      const camera = new Camera(videoRef.current, {
          onFrame: async () => { if (videoRef.current) await pose.send({image: videoRef.current}); },
          width: 1280, height: 720
      });
      camera.start().then(() => setIsReady(true));
      return () => { camera.stop(); pose.close(); }
    }
  }, [setupThreeJS, onResults]);

  useEffect(() => {
      const handleResize = () => {
          if (cameraRef.current && rendererRef.current) {
              cameraRef.current.aspect = window.innerWidth / window.innerHeight;
              cameraRef.current.updateProjectionMatrix();
              rendererRef.current.setSize(window.innerWidth, window.innerHeight);
          }
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" playsInline />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100" />
        
        {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
                <div className="flex flex-col items-center gap-4">
                     <div className="w-16 h-16 border-4 border-t-red-500 border-r-transparent border-b-yellow-500 border-l-transparent rounded-full animate-spin"></div>
                    <div className="text-yellow-500 font-mono text-sm tracking-widest animate-pulse">
                        INIT SYSTEMS...
                    </div>
                </div>
            </div>
        )}
        
        {isReady && suitState === SuitState.SCANNING && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
                <div className="flex flex-col items-center gap-2">
                    <div className="text-blue-400 font-mono text-xl font-bold tracking-widest animate-pulse shadow-black drop-shadow-lg">
                        CALIBRATING BIOMETRICS
                    </div>
                    <div className="w-64 h-2 bg-blue-900/50 rounded-full overflow-hidden border border-blue-500/50">
                        <div className="h-full bg-blue-400 transition-all duration-75" style={{ width: `${scanProgress * 100}%`}}></div>
                    </div>
                    <div className="text-blue-200/80 font-mono text-xs">
                        STAND STILL FOR SCAN
                    </div>
                </div>
             </div>
        )}

        <HUD suitState={suitState} integrity={integrity} showInstructions={isReady} />
    </div>
  );
};

export default WebAR;