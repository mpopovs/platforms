/**
 * Starting points for new scenes. Each returns the inline JSON of a draft
 * manifest; files (GLBs, images) are added later in the editor.
 *
 * - fashion-show: a lit catwalk (procedural stage), Model 1-4 (capsules until
 *   they get GLBs) and a story: each walks the catwalk, poses and walks back
 *   while several camera operators film it (Director camera) with handheld sway.
 * - stage: an empty lit stage for any story.
 * - hot-spring: nothing; upload the world folder.
 */
import { emptyManifest, type SceneManifest } from '@claypixels/scene-engine/manifest';

export const TEMPLATES = [
  { id: 'fashion-show', name: 'Fashion show', note: 'Catwalk, 4 models, a ready story' },
  { id: 'stage', name: 'Empty stage', note: 'Lit stage for any story' },
  { id: 'hot-spring', name: 'From a world folder', note: 'Upload a Marble / hot spring world' }
] as const;

export type TemplateId = (typeof TEMPLATES)[number]['id'];

const RUNWAY = { length: 8, width: 2.2, height: 0.3, front: 1 };
const BACK_Z = RUNWAY.front - RUNWAY.length + 0.6; // backstage end of the catwalk
const FRONT_Z = 0.2; // posing spot

const stageLook = {
  capy: { height: 1.6, speed: 1, facing: 0, count: 8, personal: 0.6 },
  look: { exposure: 1.05, fog: '#121319', fogNear: 18, fogFar: 45, snow: 0, steam: 0, warmLight: [0, 3, -9], warmIntensity: 0, ambient: 0.55, sun: 0.35 },
  camera: { pos: [0, 1.5, 4.2], target: [0, 0.7, -4], fov: 40, parallax: 0.08, drift: 0.015, mode: 'hero', handheld: { amount: 0.6, speed: 1 } }
};

function fashionShow(): Record<string, unknown> {
  // Model 1-4 start as stand-in capsules; give them GLBs in Files or Models
  const models = [1, 2, 3, 4].map((n) => ({ id: `model_${n}`, name: `Model ${n}` }));
  const xs = [-0.75, -0.25, 0.25, 0.75];
  const spots = [
    ...xs.map((x) => ({ type: 'start', x, z: BACK_Z })),
    { type: 'rest', x: 0, z: FRONT_Z }
  ];
  const poseSpot = spots.length - 1;
  const hero = { pos: [0, 1.5, 4.2], target: [0, 0.7, -4], fov: 40 };

  const steps: Record<string, unknown>[] = [
    ...models.map((m, i) => ({ do: 'place', who: m.id, spot: i, turn: 0 })),
    ...models.map((m) => ({ do: 'outfit', who: m.id, image: 'drawing' })),
    { do: 'camera', mode: 'fixed', shot: hero, seconds: 0 },
    { do: 'say', text: 'Welcome to the Magic Forms fashion show!', seconds: 3 }
  ];
  // from here several camera operators film the show and cut between them
  steps.push({ do: 'camera', mode: 'director', who: 'auto', cutMin: 2.5, cutMax: 5.5 });
  models.forEach((m, i) => {
    steps.push(
      { do: 'walk', who: m.id, spot: poseSpot },
      { do: 'say', text: `${m.name}!`, seconds: 2, wait: false },
      { do: 'anim', who: m.id, clip: 'pose' },
      { do: 'place', who: m.id, turn: 180 },
      { do: 'walk', who: m.id, spot: i, wait: false },
      { do: 'wait', seconds: 1.5 }
    );
  });
  steps.push(
    { do: 'camera', mode: 'fixed', shot: hero, seconds: 1.5 },
    { do: 'wait', seconds: 2 },
    { do: 'say', text: 'Thank you for watching!', seconds: 3 }
  );

  return {
    'scene.json': {
      caption: 'Fashion show',
      environment: 'stage',
      stage: { runwayLength: RUNWAY.length, runwayWidth: RUNWAY.width, runwayHeight: RUNWAY.height, front: RUNWAY.front, wallDistance: RUNWAY.length + 2 }
    },
    'layout.json': stageLook,
    'zones.json': {
      water: { polygon: [], steam: { amount: 0 } },
      walk: [{ name: 'catwalk', polygon: [[-RUNWAY.width / 2 + 0.1, RUNWAY.front - 0.1], [RUNWAY.width / 2 - 0.1, RUNWAY.front - 0.1], [RUNWAY.width / 2 - 0.1, RUNWAY.front - RUNWAY.length + 0.1], [-RUNWAY.width / 2 + 0.1, RUNWAY.front - RUNWAY.length + 0.1]] }],
      blocked: [], props: [], spots,
      routes: [{ name: 'catwalk', points: [[0, BACK_Z], [0, FRONT_Z]], loop: false, reverse: false }],
      behaviour: { walk: 0, swim: 0, soak: 0, rest: 1, nap: 0, surprise: 0, route: 0 }
    },
    'cast.json': {
      characters: models.map((m) => ({ id: m.id, name: m.name, height: 1.6, speed: 0.9 }))
    },
    'story.json': { autoplay: true, loop: true, startDelay: 1, steps }
  };
}

function emptyStage(): Record<string, unknown> {
  return {
    'scene.json': { caption: 'Stage', environment: 'stage', stage: { runwayLength: 0, wallDistance: 8, spotlights: 3 } },
    'layout.json': { ...stageLook, camera: { ...stageLook.camera, pos: [0, 1.6, 6], target: [0, 0.8, -2] } },
    'zones.json': {
      water: { polygon: [], steam: { amount: 0 } },
      walk: [{ name: 'stage', polygon: [[-5, 3], [5, 3], [5, -7], [-5, -7]] }],
      blocked: [], props: [], spots: [], routes: [],
      behaviour: { walk: 2, swim: 0, soak: 0, rest: 3, nap: 0, surprise: 1, route: 0 }
    },
    'cast.json': { characters: [] },
    'story.json': { autoplay: true, loop: true, startDelay: 1, steps: [] }
  };
}

export function templateManifest(id: string): SceneManifest {
  const m = emptyManifest();
  if (id === 'fashion-show') m.json = fashionShow();
  else if (id === 'stage') m.json = emptyStage();
  return m;
}
