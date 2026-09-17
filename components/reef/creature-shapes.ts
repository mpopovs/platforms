'use client';

import * as THREE from 'three';
import type { CreatureKind } from '@/lib/reef-runtime-config';

/**
 * Procedural silhouette alpha-masks. A child's coloring is a roughly square
 * texture; multiplying it by one of these silhouettes (as an `alphaMap`) makes
 * it read as a fish / plant / coral shape instead of a floating rectangle — no
 * pre-made assets required. Textures are generated once and cached per kind.
 *
 * These are Phase-1 placeholders: good enough to prove the "it's alive" look.
 * When/if we move to real 3D creatures they go away entirely.
 */

const cache = new Map<string, THREE.Texture>();
const SIZE = 512;

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#ffffff';
  return { canvas, ctx };
}

function drawFish(ctx: CanvasRenderingContext2D) {
  const cx = SIZE * 0.42;
  const cy = SIZE * 0.5;
  const bodyRx = SIZE * 0.34;
  const bodyRy = SIZE * 0.26;
  // Body
  ctx.beginPath();
  ctx.ellipse(cx, cy, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail (triangle at the back / left)
  const tailBaseX = cx - bodyRx * 0.75;
  ctx.beginPath();
  ctx.moveTo(tailBaseX, cy);
  ctx.lineTo(SIZE * 0.06, cy - SIZE * 0.2);
  ctx.lineTo(SIZE * 0.06, cy + SIZE * 0.2);
  ctx.closePath();
  ctx.fill();
  // Top fin
  ctx.beginPath();
  ctx.moveTo(cx - bodyRx * 0.1, cy - bodyRy * 0.9);
  ctx.quadraticCurveTo(cx, cy - bodyRy * 1.7, cx + bodyRx * 0.35, cy - bodyRy * 0.7);
  ctx.closePath();
  ctx.fill();
}

function drawPlant(ctx: CanvasRenderingContext2D) {
  // A few tapering seaweed fronds rising from the bottom.
  const fronds = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < fronds; i++) {
    const baseX = SIZE * (0.28 + i * 0.15);
    const width = SIZE * (0.10 - i * 0.006);
    const sway = (i % 2 === 0 ? 1 : -1) * SIZE * 0.12;
    ctx.beginPath();
    ctx.moveTo(baseX - width / 2, SIZE);
    ctx.quadraticCurveTo(baseX + sway, SIZE * 0.45, baseX + sway * 0.6, SIZE * 0.12);
    ctx.quadraticCurveTo(baseX + sway, SIZE * 0.45, baseX + width / 2, SIZE);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCoral(ctx: CanvasRenderingContext2D) {
  // Rounded lumpy coral head made of overlapping blobs.
  const blobs = [
    [0.5, 0.72, 0.28],
    [0.32, 0.66, 0.16],
    [0.68, 0.66, 0.17],
    [0.42, 0.5, 0.14],
    [0.58, 0.5, 0.15],
    [0.5, 0.4, 0.12],
  ];
  for (const [x, y, r] of blobs) {
    ctx.beginPath();
    ctx.arc(SIZE * x, SIZE * y, SIZE * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function getSilhouetteTexture(kind: CreatureKind): THREE.Texture {
  const existing = cache.get(kind);
  if (existing) return existing;

  const { canvas, ctx } = makeCanvas();
  if (kind === 'plant') drawPlant(ctx);
  else if (kind === 'coral') drawCoral(ctx);
  else drawFish(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // alpha data, not color
  tex.needsUpdate = true;
  cache.set(kind, tex);
  return tex;
}
