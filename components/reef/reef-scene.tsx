'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { REEF_BOUNDS, REEF_HEALTH_EASE_SECONDS } from '@/lib/reef-runtime-config';
import { SwimmingCreature, type CreatureData } from './swimming-creature';

// Water color endpoints: bleached (sick) → vibrant (healthy).
const WATER_SICK = new THREE.Color('#3a4a52');
const WATER_HEALTHY = new THREE.Color('#0a6e9c');
const CORAL_SICK = new THREE.Color('#8a8f92');
const CORAL_HEALTHY_A = new THREE.Color('#ff6f91');
const CORAL_HEALTHY_B = new THREE.Color('#ffb703');
const CORAL_HEALTHY_C = new THREE.Color('#8ecae6');

interface ReefSceneProps {
  creatures: CreatureData[];
  /** Target health in [0,1]; the scene eases toward it. */
  health: number;
}

/**
 * Drives eased reef state every frame: interpolates a shared `healthRef` toward
 * the target, and repaints the scene background/fog + ambient light from it.
 * Kept as a child of <Canvas> so it can touch the three.js scene directly.
 */
function ReefEnvironment({
  targetHealthRef,
  healthRef,
  ambientRef,
  keyLightRef,
}: {
  targetHealthRef: React.MutableRefObject<number>;
  healthRef: React.MutableRefObject<number>;
  ambientRef: React.MutableRefObject<THREE.AmbientLight | null>;
  keyLightRef: React.MutableRefObject<THREE.SpotLight | null>;
}) {
  const { scene, camera } = useThree();
  const bg = useRef(new THREE.Color());
  const fog = useRef(new THREE.FogExp2('#22343b', 0.05));

  // Attach fog once.
  useMemo(() => {
    scene.fog = fog.current;
  }, [scene]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    // Ease health toward target.
    const k = 1 - Math.pow(0.5, dt / Math.max(0.1, REEF_HEALTH_EASE_SECONDS / 2));
    healthRef.current += (targetHealthRef.current - healthRef.current) * k;
    const h = healthRef.current;

    bg.current.copy(WATER_SICK).lerp(WATER_HEALTHY, h);
    scene.background = bg.current;
    fog.current.color.copy(bg.current);
    fog.current.density = 0.075 - 0.045 * h; // clearer water when healthy

    if (ambientRef.current) ambientRef.current.intensity = 0.25 + 0.55 * h;
    if (keyLightRef.current) keyLightRef.current.intensity = 0.6 + 1.6 * h;

    // Very slow camera drift for a living, handheld feel.
    const t = performance.now() / 1000;
    camera.position.x = Math.sin(t * 0.05) * 0.6;
    camera.position.y = Math.sin(t * 0.07) * 0.35;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/** Rising bubble particles; density scales with health. */
function Bubbles({ healthRef, count = 220 }: { healthRef: React.MutableRefObject<number>; count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * REEF_BOUNDS.x;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * REEF_BOUNDS.y * 2;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * REEF_BOUNDS.z;
      speeds[i] = 0.2 + Math.random() * 0.6;
    }
    return { positions, speeds };
  }, [count]);

  useFrame((_, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const dt = Math.min(delta, 0.05);
    const arr = (pts.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const t = performance.now() / 1000;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += speeds[i] * dt;
      arr[i * 3] += Math.sin(t + i) * 0.002; // gentle horizontal wobble
      if (arr[i * 3 + 1] > REEF_BOUNDS.y * 2) {
        arr[i * 3 + 1] = -REEF_BOUNDS.y * 2;
        arr[i * 3] = (Math.random() * 2 - 1) * REEF_BOUNDS.x;
      }
    }
    (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const mat = pts.material as THREE.PointsMaterial;
    mat.opacity = 0.15 + 0.35 * healthRef.current;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#dff6ff" size={0.06} transparent opacity={0.3} depthWrite={false} sizeAttenuation />
    </points>
  );
}

/** Static background reef structures whose color saturation follows health. */
function ReefFloor({ healthRef }: { healthRef: React.MutableRefObject<number> }) {
  const clusters = useMemo(() => {
    const out: { pos: [number, number, number]; scale: number; base: THREE.Color; kind: number }[] = [];
    const palette = [CORAL_HEALTHY_A, CORAL_HEALTHY_B, CORAL_HEALTHY_C];
    for (let i = 0; i < 14; i++) {
      out.push({
        pos: [(Math.random() * 2 - 1) * REEF_BOUNDS.x, -REEF_BOUNDS.y - 0.2, -1 - Math.random() * REEF_BOUNDS.z],
        scale: 0.5 + Math.random() * 1.1,
        base: palette[i % palette.length],
        kind: i % 3,
      });
    }
    return out;
  }, []);

  const matRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  useFrame(() => {
    const h = healthRef.current;
    clusters.forEach((c, i) => {
      const m = matRefs.current[i];
      if (m) m.color.copy(CORAL_SICK).lerp(c.base, h);
    });
  });

  return (
    <group>
      {/* Sandy floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -REEF_BOUNDS.y - 0.3, 0]} receiveShadow>
        <planeGeometry args={[REEF_BOUNDS.x * 4, REEF_BOUNDS.z * 4]} />
        <meshStandardMaterial color="#c2b280" roughness={1} />
      </mesh>
      {/* Coral clusters */}
      {clusters.map((c, i) => (
        <mesh key={i} position={c.pos} scale={c.scale} castShadow>
          {c.kind === 0 ? (
            <coneGeometry args={[0.5, 1.4, 6]} />
          ) : c.kind === 1 ? (
            <dodecahedronGeometry args={[0.6, 0]} />
          ) : (
            <sphereGeometry args={[0.55, 10, 8]} />
          )}
          <meshStandardMaterial
            ref={(el) => {
              matRefs.current[i] = el;
            }}
            color={CORAL_SICK}
            roughness={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

export function ReefScene({ creatures, health }: ReefSceneProps) {
  const healthRef = useRef(0.15);
  const targetHealthRef = useRef(health);
  targetHealthRef.current = health; // updated on each render, read in frame loop

  const ambientRef = useRef<THREE.AmbientLight>(null);
  const keyLightRef = useRef<THREE.SpotLight>(null);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0, 11], fov: 55 }}
      gl={{ powerPreference: 'high-performance', antialias: true }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <ReefEnvironment
        targetHealthRef={targetHealthRef}
        healthRef={healthRef}
        ambientRef={ambientRef}
        keyLightRef={keyLightRef}
      />

      <ambientLight ref={ambientRef} intensity={0.5} />
      {/* Sun shafts from above-front */}
      <spotLight
        ref={keyLightRef}
        position={[4, 14, 8]}
        angle={0.8}
        penumbra={1}
        intensity={1.4}
        decay={0}
        color="#bfefff"
        castShadow
      />
      <hemisphereLight args={[0x9fdcff, 0x1b3a2a, 0.5]} />

      <ReefFloor healthRef={healthRef} />
      <Bubbles healthRef={healthRef} />

      {creatures.map((c) => (
        <SwimmingCreature key={c.id} creature={c} healthRef={healthRef} />
      ))}
    </Canvas>
  );
}
