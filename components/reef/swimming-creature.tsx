'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { REEF_BOUNDS, REEF_FISH_SPEED, REEF_ENTRANCE_MS, type CreatureKind } from '@/lib/reef-runtime-config';
import { getSilhouetteTexture } from './creature-shapes';
import { useCreatureTexture } from './use-creature-texture';

export interface CreatureData {
  id: string;
  textureUrl: string;
  kind: CreatureKind;
  /** Stable pseudo-random seed in [0,1) derived from the id. */
  seed: number;
  modelId?: string;
}

interface Props {
  creature: CreatureData;
  /** Ref holding the eased reef-health value in [0,1], read every frame. */
  healthRef: React.MutableRefObject<number>;
}

// Deterministic PRNG from a seed so each creature is stable across renders.
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TMP = new THREE.Vector3();

export function SwimmingCreature({ creature, healthRef }: Props) {
  const { kind, seed } = creature;
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);

  const colorTexture = useCreatureTexture(creature.textureUrl, {
    modelId: creature.modelId,
    textureId: creature.id,
  });
  const silhouette = useMemo(() => getSilhouetteTexture(kind), [kind]);

  // Per-creature motion state, seeded so it's stable.
  const state = useMemo(() => {
    const rand = mulberry32(Math.floor(seed * 1e9) + 1);
    const spawnAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const scale = 0.9 + rand() * 0.7;
    const startPos = new THREE.Vector3(
      (rand() * 2 - 1) * REEF_BOUNDS.x,
      (rand() * 2 - 1) * REEF_BOUNDS.y,
      (rand() * 2 - 1) * REEF_BOUNDS.z,
    );
    return {
      rand,
      spawnAt,
      scale,
      pos: startPos,
      target: pickTarget(rand),
      speed: REEF_FISH_SPEED * (0.7 + rand() * 0.7),
      bobPhase: rand() * Math.PI * 2,
      wigglePhase: rand() * Math.PI * 2,
      facing: rand() > 0.5 ? 1 : -1, // +1 faces right, −1 faces left
      // Plants/coral are anchored to the floor and only sway.
      anchored: kind !== 'fish',
      floorPos: new THREE.Vector3(
        (rand() * 2 - 1) * REEF_BOUNDS.x,
        -REEF_BOUNDS.y + (kind === 'coral' ? 0.3 : 0.9),
        (rand() * 1.4 - 0.7) * REEF_BOUNDS.z - 0.5,
      ),
    };
  }, [seed, kind]);

  // A segmented plane so we can undulate the mesh (tail wiggle) per frame.
  const geometry = useMemo(() => {
    const w = kind === 'plant' ? 1.1 : 1.4;
    const h = kind === 'plant' ? 1.9 : 1.05;
    const g = new THREE.PlaneGeometry(w, h, 18, 2);
    // Stash original X positions to weight the wiggle toward the tail (−X).
    (g as any)._baseX = Float32Array.from(g.attributes.position.array as Float32Array);
    return g;
  }, [kind]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = meshRef.current;
    if (!group || !mesh) return;

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = now / 1000;
    const dt = Math.min(delta, 0.05); // clamp to avoid jumps after tab switches

    // Entrance: scale + fade in.
    const age = now - state.spawnAt;
    const entrance = Math.min(1, age / REEF_ENTRANCE_MS);
    const ease = 1 - Math.pow(1 - entrance, 3);

    let flip = 1; // horizontal facing (−1 = mirrored to swim left)

    if (state.anchored) {
      // Plants/coral: fixed on the floor, gentle sway, facing the camera.
      group.position.copy(state.floorPos);
      group.rotation.set(0, 0, Math.sin(t * 0.8 + state.bobPhase) * (kind === 'plant' ? 0.18 : 0.05));
    } else {
      // Fish: steer toward target, retarget on arrival.
      TMP.copy(state.target).sub(state.pos);
      const dist = TMP.length();
      if (dist < 0.4) {
        state.target = pickTarget(state.rand);
      } else {
        const dx = TMP.x;
        TMP.normalize();
        state.pos.addScaledVector(TMP, state.speed * dt);
        // Flip to face horizontal travel direction (hysteresis avoids flicker).
        if (dx > 0.15) state.facing = 1;
        else if (dx < -0.15) state.facing = -1;
      }
      group.position.copy(state.pos);
      group.position.y += Math.sin(t * 1.4 + state.bobPhase) * 0.12; // bob
      // Always keep the coloring facing the camera; only wobble gently.
      group.rotation.set(0, 0, Math.sin(t * 3 + state.wigglePhase) * 0.08);
      flip = state.facing;
    }

    // Undulation: displace plane vertices along local Z, weighted toward tail.
    const g = mesh.geometry as THREE.PlaneGeometry;
    const baseX = (g as any)._baseX as Float32Array | undefined;
    if (baseX) {
      const posAttr = g.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const halfW = kind === 'plant' ? 0.55 : 0.7;
      const amp = (kind === 'fish' ? 0.14 : 0.07);
      const freq = kind === 'plant' ? 2.2 : 3.0;
      const speed = kind === 'plant' ? 1.4 : 6.0;
      for (let i = 0; i < arr.length; i += 3) {
        const x = baseX[i];
        // weight 0 at front (+X / top), 1 at tail (−X / bottom)
        const weight = (halfW - x) / (halfW * 2);
        arr[i + 2] = Math.sin(x * freq - t * speed + state.wigglePhase) * amp * weight;
      }
      posAttr.needsUpdate = true;
    }

    // Health drives brightness/saturation: bleached creatures look faded.
    const health = healthRef.current;
    const s = state.scale * (0.2 + 0.8 * ease);
    group.scale.set(s * flip, s, s);
    if (matRef.current) {
      matRef.current.opacity = ease;
      const lit = 0.25 + 0.75 * health;
      matRef.current.color.setScalar(lit);
      matRef.current.emissiveIntensity = 0.05 + 0.15 * health;
    }
  });

  if (!colorTexture) return null;

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={geometry} castShadow>
        <meshStandardMaterial
          ref={matRef}
          map={colorTexture}
          alphaMap={silhouette}
          transparent
          alphaTest={0.35}
          side={THREE.DoubleSide}
          roughness={0.85}
          metalness={0}
          emissive={'#2a6a7a'}
          emissiveIntensity={0.1}
          depthWrite
        />
      </mesh>
    </group>
  );
}

function pickTarget(rand: () => number): THREE.Vector3 {
  return new THREE.Vector3(
    (rand() * 2 - 1) * REEF_BOUNDS.x,
    (rand() * 2 - 1) * REEF_BOUNDS.y,
    (rand() * 2 - 1) * REEF_BOUNDS.z,
  );
}

