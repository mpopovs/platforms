// Procedural stage environment (scene.json: { "environment": "stage", "stage": {...} }).
// A floor, an optional catwalk, a back wall with a light panel and spotlights.
// Units are metres; the catwalk runs from z = front toward -z.
import * as THREE from 'three/webgpu';

export const STAGE_DEFAULTS = {
  floor: '#1b1d24', runway: '#f2efe8', wall: '#252836', accent: '#ff4f9a', background: '#121319',
  runwayLength: 12, runwayWidth: 2.2, runwayHeight: 0.3, front: 1,
  wallDistance: 14, wallHeight: 6, spotlights: 4, spotColor: '#fff4e6', spotIntensity: 60
};

export function buildStage(cfg = {}) {
  const c = { ...STAGE_DEFAULTS, ...cfg };
  const g = new THREE.Group(); g.name = 'stage';
  const mat = (color, extra = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: 0.6, metalness: 0, ...extra });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), mat(c.floor, { roughness: 0.35 }));
  floor.position.z = -c.runwayLength / 2; g.add(floor);

  if (c.runwayLength > 0) {
    const rw = new THREE.Mesh(new THREE.BoxGeometry(c.runwayWidth, c.runwayHeight, c.runwayLength), mat(c.runway, { roughness: 0.25 }));
    rw.position.set(0, c.runwayHeight / 2, c.front - c.runwayLength / 2); g.add(rw);
    // glowing edges
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, c.runwayLength), new THREE.MeshBasicNodeMaterial({ color: c.accent }));
      edge.position.set(side * (c.runwayWidth / 2 + 0.02), c.runwayHeight, c.front - c.runwayLength / 2); g.add(edge);
    }
  }

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, c.wallHeight), mat(c.wall));
  wall.position.set(0, c.wallHeight / 2, -c.wallDistance); g.add(wall);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(c.runwayWidth * 1.6, c.wallHeight * 0.7), new THREE.MeshBasicNodeMaterial({ color: c.accent }));
  panel.position.set(0, c.wallHeight * 0.45, -c.wallDistance + 0.02); g.add(panel);

  const lights = new THREE.Group(); lights.name = 'stage-lights';
  for (let i = 0; i < c.spotlights; i++) {
    const z = c.front - (c.runwayLength * (i + 0.5)) / Math.max(1, c.spotlights);
    const s = new THREE.SpotLight(c.spotColor, c.spotIntensity, 14, Math.PI / 7, 0.5, 1.6);
    s.position.set(i % 2 ? 2.6 : -2.6, 5.5, z + 1);
    s.target.position.set(0, c.runwayHeight, z);
    lights.add(s, s.target);
  }
  g.add(lights);
  return { group: g, background: c.background };
}
