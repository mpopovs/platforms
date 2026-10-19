// Claypixels hot spring: hybrid scene on three.js r186.
// Marble splat backdrop (GaussianSplat, near + far layers) + live water, steam,
// snow and the 8 animated capybaras walking on a navigation grid.
//
// Packaged as mountScene(container, options) for the Claypixels Scene editor
// and player. options.base is the URL prefix every scene file is read from
// (scene.json, layout.json, zones.json, backdrop/, splats, capys/...).
// Debug flags still work as URL query parameters (or options.params):
//   ?world=world/<id>    world folder (default: the first Marble world; world/test is the stand-in)
//   ?capys=../animations folder with <tag>/<tag>_capy_v2.glb
//   ?edit=1              layout editor (water edge, walk areas, terrace, blocked, spots) + look panel
//   ?camera=orbit        free camera instead of the hero view
//   ?webgl=1             force the WebGL fallback
//   ?splat=500k          force a splat set (100k | 150k | 500k | full_res | hero | hero_mobile)
//   ?backdrop=splat      use the Marble splat instead of the 2.5D image backdrop (default when the world has one)

import * as THREE from 'three/webgpu';
import {
  color, uniform, vec3, vec4, time, positionWorld, mx_noise_float,
  bumpMap, luminance, mix, sRGBTransferEOTF
} from 'three/tsl';
import { GaussianSplat } from 'three/addons/objects/GaussianSplat.js';
import { SPZLoader } from 'three/addons/loaders/SPZLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Nav, KIND, CELL, polyContains, polyCentroid } from './nav.js';
import { loadDepthBackdrop } from './backdrop.js';
import { createUi } from './ui.js';
import { buildStage } from './stage.js';
import { createStoryRunner } from './story.js';

/**
 * Mount the scene into `container`. Returns { ready, destroy }.
 * options: { base, capysBase?, edit?, params?, saveFile?(name, body, type) -> Promise<string> }
 */
export function mountScene(container, opts = {}) {
const disposers = [];
const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); disposers.push(() => target.removeEventListener(type, fn, o)); };
let destroyed = false;
const ui = createUi(container);

const Q = new URLSearchParams(location.search);
for (const [k, v] of Object.entries(opts.params || {})) if (v != null) Q.set(k, String(v));
const WORLD = String(opts.base || Q.get('world') || '').replace(/\/$/, '');
const CAPYS = String(opts.capysBase || Q.get('capys') || `${WORLD}/capys`).replace(/\/$/, '');
const EDIT = opts.edit === true || Q.get('edit') === '1';
const IS_PHONE = matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 900;
const statusEl = ui.status;
const say = t => { statusEl.textContent = t; };

// Default cast when a scene has no cast.json: the eight capybaras.
const LEGACY_TAGS = ['baby', 'explorer_boy', 'four_legged', 'girl_child', 'mother', 'sporty_boy', 'teen_girl_be', 'teen_girl_ho'];
const LEGACY_NAMES = { baby: 'Baby', explorer_boy: 'Explorer boy', four_legged: 'Four-legged', girl_child: 'Girl child', mother: 'Mother', sporty_boy: 'Sporty boy', teen_girl_be: 'Teen girl (beanie)', teen_girl_ho: 'Teen girl (hoodie)' };
const SURPRISE = {
  baby: 'surprise_popcorn', explorer_boy: 'surprise_lookout', four_legged: 'surprise_chill_flop',
  girl_child: 'surprise_pirouette', mother: 'surprise_piggyback_offer', sporty_boy: 'surprise_backflip',
  teen_girl_be: 'surprise_runway_strut', teen_girl_ho: 'surprise_dance'
};
const legacyCast = () => LEGACY_TAGS.map((tag, i) => ({ id: tag, name: `Model ${i + 1}`, file: `capys/${tag}/${tag}_capy_v2.glb`, clips: { pose: SURPRISE[tag] }, sizeFactor: tag === 'baby' ? 0.72 : 1 }));
// cast.json: { characters: [{ id, name, file, height?, speed?, clips?: { idle, walk, swim, pose, ... }, outfit?: { mesh: name | [names] }, enabled? }] }
let cast = [];
let TAGS = [];
const castUrl = ch => ch.file?.startsWith('capys/') && opts.capysBase ? `${CAPYS}/${ch.file.slice(6)}` : `${WORLD}/${ch.file}`;

// ---------------------------------------------------------------- layout (look + camera)
const DEFAULT_LAYOUT = {
  splat: { flip: false, rotY: 0, y: 0, scale: 1, toneMapped: false, saturation: 1.0, brightness: 1.0, tint: '#ffffff' },
  pool: { opacity: 0.4 },
  walk: { maxSlope: 0.5, minDist: 3.5 },
  capy: { height: 0.55, speed: 1, facing: 0, count: 8, personal: 0.75 },
  look: { exposure: 1.0, fog: '#cdd6e0', fogNear: 18, fogFar: 70, snow: 1, steam: 0.6, warmLight: [-6.5, 1.6, -2] },
  camera: { pos: [0, 2.4, 7.6], target: [0, 0.4, 0], minDist: 3.5, maxDist: 11, maxAzimuth: 55,
    mode: 'orbit', fov: 42, pitch: -9, yaw: 0, parallax: 0.22, drift: 0.04 }
};
const deepMerge = (a, b) => {
  for (const k in b) a[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? deepMerge(a[k] || {}, b[k]) : b[k];
  return a;
};
let L = structuredClone(DEFAULT_LAYOUT);

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGPURenderer({ antialias: !IS_PHONE, forceWebGL: Q.get('webgl') === '1' || !navigator.gpu });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_PHONE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
container.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 300);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ---------------------------------------------------------------- hero camera
let view = 'hero';
const hero = { base: new THREE.Vector3(), dir: new THREE.Vector3(), aim: new THREE.Vector2(), cur: new THREE.Vector2(), cam: new THREE.PerspectiveCamera(), input: -1e9 };
on(window, 'resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  hero.cam.aspect = camera.aspect; hero.cam.updateProjectionMatrix();
  if (view === 'hero' && typeof splatRoot !== 'undefined') setupHero();
  renderer.setSize(innerWidth, innerHeight);
});
on(window, 'pointermove', e => (hero.input = performance.now()) && hero.aim.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1));
on(window, 'deviceorientation', e => { if (e.gamma != null) hero.input = performance.now(), hero.aim.set(THREE.MathUtils.clamp(e.gamma / 25, -1, 1), THREE.MathUtils.clamp((e.beta - 45) / 25, -1, 1)); });
let backdropMeta = null; // set when the 2.5D image backdrop is used
let envMode = 'splat';
function setupHero() {
  // the generation camera sits at the splat's own origin; the image backdrop has its own camera
  let fov = L.camera.fov, pitchDeg = L.camera.pitch, yawDeg = L.camera.yaw;
  if (backdropMeta) {
    const c = backdropMeta.camera;
    hero.base.fromArray(c.position); pitchDeg = c.pitch; yawDeg = c.yaw;
    // stay inside the image even when the parallax turns the camera a little
    const imgV = THREE.MathUtils.degToRad(c.vfov), imgH = 2 * Math.atan(Math.tan(imgV / 2) * backdropMeta.width / backdropMeta.height);
    const margin = 0.9;
    fov = THREE.MathUtils.radToDeg(Math.min(imgV * margin, 2 * Math.atan(Math.tan(imgH / 2) * margin / camera.aspect)));
  } else if (envMode === 'stage' || envMode === 'glb') {
    hero.base.fromArray(L.camera.pos);
    const d = new THREE.Vector3().fromArray(L.camera.target).sub(hero.base).normalize();
    pitchDeg = THREE.MathUtils.radToDeg(Math.asin(d.y)); yawDeg = THREE.MathUtils.radToDeg(Math.atan2(-d.x, -d.z));
  } else hero.base.copy(splatRoot.position);
  hero.fov = fov; hero.pitch = pitchDeg; hero.yaw = yawDeg;
  const pitch = THREE.MathUtils.degToRad(pitchDeg), yaw = THREE.MathUtils.degToRad(yawDeg);
  hero.dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camera.fov = fov; camera.updateProjectionMatrix();
  camera.position.copy(hero.base); camera.lookAt(hero.base.clone().add(hero.dir));
  hero.cam.copy(camera); hero.cam.updateMatrixWorld();
}
const _look = new THREE.Vector3();
function updateHero(dt, t) {
  const still = EDIT; // no parallax or drift while editing
  // nobody moving the mouse or the phone (a display, a phone on the table):
  // the view wanders slowly by itself so the 2.5D parallax still shows
  if (!still && performance.now() - hero.input > 4000) {
    const w = (L.camera.handheld?.speed ?? (envMode === 'depth' ? 0.6 : 1)) * 0.12;
    hero.aim.set(Math.sin(t * w) * 0.8, Math.sin(t * w * 0.63 + 1.3) * 0.5);
    hero.cur.lerp(hero.aim, Math.min(1, dt * 0.8));
  } else if (still) hero.cur.set(0, 0); else hero.cur.lerp(hero.aim, Math.min(1, dt * 2.5));
  const par = still ? 0 : L.camera.parallax, dr = still ? 0 : L.camera.drift;
  const ox = hero.cur.x * par + Math.sin(t * 0.13) * dr, oy = -hero.cur.y * par * 0.4 + Math.sin(t * 0.21) * dr * 0.5;
  camera.position.set(hero.base.x + ox, hero.base.y + oy, hero.base.z);
  _look.copy(hero.base).addScaledVector(hero.dir, 9);
  camera.lookAt(_look);
}
// Story camera. Modes (camera step "mode"):
//   fixed   go to shot { pos, target, fov }
//   look    stay at shot.pos (or where it is) and keep aiming at a character
//   follow  move with a character, keeping `offset` from it (world axes, or
//           the character's own when frame = "character"): a tracking shot
//   orbit   circle a character at `radius` / `height`, `speed` degrees per second
//   drift   a slow, calm camera move for still or 2.5D scenes: from shot (or
//           where the camera is) glide `move` [right, up, forward] metres over
//           `driftSeconds`, then back again (`pingpong`, default true)
// Every change blends from the current view over `seconds`.
const storyCam = { mode: 'fixed', c: null, elapsed: 0, drift: null, shot: null, offset: new THREE.Vector3(0, 1, 2.5), frame: 'world',
  radius: 2.5, height: 1.2, speed: 20, angle: 0, fov: 42,
  fromPos: new THREE.Vector3(), fromT: new THREE.Vector3(), fromFov: 42, t: 1, dur: 0, done: null,
  target: new THREE.Vector3() };
const _cp = new THREE.Vector3(), _ct = new THREE.Vector3(), _off = new THREE.Vector3();
const charAim = (c, out) => out.set(c.root.position.x, c.root.position.y + c.h * 0.55, c.root.position.z);
function desiredCam(dt, pos, target) {
  const m = storyCam.mode, c = storyCam.c;
  if (m === 'drift') {
    storyCam.elapsed += dt;
    const D = storyCam.drift, T = Math.max(1, D.seconds);
    let p = storyCam.elapsed / T;
    p = D.pingpong ? (Math.floor(p) % 2 ? 1 - (p % 1) : p % 1) : Math.min(1, p);
    const e = p * p * (3 - 2 * p);
    pos.copy(D.pos).addScaledVector(D.right, D.move[0] * e).addScaledVector(D.up, D.move[1] * e).addScaledVector(D.fwd, D.move[2] * e);
    target.copy(D.target).addScaledVector(D.right, D.move[0] * e * 0.6).addScaledVector(D.up, D.move[1] * e * 0.6);
    return;
  }
  if (m === 'fixed' || !c) { pos.fromArray(storyCam.shot?.pos || camera.position.toArray()); target.fromArray(storyCam.shot?.target || storyCam.target.toArray()); return; }
  charAim(c, target);
  if (m === 'look') { pos.fromArray(storyCam.shot?.pos || storyCam.fromPos.toArray()); return; }
  if (m === 'follow') {
    _off.copy(storyCam.offset);
    if (storyCam.frame === 'character') _off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, c.root.rotation.y);
    pos.copy(c.root.position).add(_off); return;
  }
  if (m === 'orbit') {
    storyCam.angle += THREE.MathUtils.degToRad(storyCam.speed) * dt;
    pos.set(c.root.position.x + Math.sin(storyCam.angle) * storyCam.radius, c.root.position.y + storyCam.height, c.root.position.z + Math.cos(storyCam.angle) * storyCam.radius);
  }
}
// ---------------------------------------------------------------- live camera
// Handheld: a smooth, never-repeating sway (sum of sines at unrelated
// frequencies) added on top of whatever the camera does, every frame, in
// every view except free editing. Applied just for rendering, so it never
// feeds back into the camera's own movement. layout.json camera.handheld:
// { amount 0..2 (default 0.5), speed 0.2..3 (default 1) }.
const SWAY = [[0.31, 1.7], [0.53, 0.4], [0.87, 2.9], [1.37, 5.1], [2.11, 3.3]];
function sway(t, seed) { let v = 0, a = 1, n = 0; for (const [f, p] of SWAY) { v += a * Math.sin(t * f * (1 + seed * 0.13) + p + seed * 7.1); n += a; a *= 0.6; } return v / n; }
const _shakePos = new THREE.Vector3(), _shakeQuat = new THREE.Quaternion(), _shakeE = new THREE.Euler();
// Defaults depend on the world: 2.5D picture backdrops get a calm, gentle
// camera (little tilt so the picture edges never show), others a livelier one.
function cameraFeel() {
  const hh = L.camera.handheld || {}, calm = envMode === 'depth';
  return {
    amount: hh.amount ?? (calm ? 0.25 : 0.5),
    speed: hh.speed ?? (calm ? 0.6 : 1),
    rotate: hh.rotate ?? (calm ? 0.25 : 1),           // share of the sway that tilts the view
    breathe: hh.breathe ?? (calm ? 0.04 : 0),          // slow push in / pull back, metres
    period: hh.breathePeriod ?? 18                     // seconds per breath
  };
}
const _fwd = new THREE.Vector3();
function applyHandheld(t) {
  const f = cameraFeel();
  const amount = f.amount * (director.on ? director.op?.shake ?? 1 : 1);
  if ((amount <= 0 && f.breathe <= 0) || (EDIT && view !== 'story')) return false; // calm while editing; live in the player and story preview
  const st = t * f.speed;
  _shakePos.copy(camera.position); _shakeQuat.copy(camera.quaternion);
  const p = 0.018 * amount, r = THREE.MathUtils.degToRad(0.55) * amount * f.rotate;
  camera.position.x += sway(st, 1) * p; camera.position.y += sway(st, 2) * p * 0.8; camera.position.z += sway(st, 3) * p * 0.6;
  if (f.breathe > 0) { camera.getWorldDirection(_fwd); camera.position.addScaledVector(_fwd, Math.sin((t / f.period) * Math.PI * 2) * f.breathe); }
  if (r > 0) { _shakeE.set(sway(st * 1.1, 4) * r, sway(st * 0.9, 5) * r, sway(st * 0.7, 6) * r * 0.5); camera.quaternion.multiply(new THREE.Quaternion().setFromEuler(_shakeE)); }
  camera.updateMatrixWorld();
  return true;
}
function undoHandheld() { camera.position.copy(_shakePos); camera.quaternion.copy(_shakeQuat); camera.updateMatrixWorld(); }

// Director: several virtual camera operators cover the performer and the
// show cuts between them at unpredictable moments (camera mode "director").
const OPERATORS = {
  front: { label: 'Front tracking', shake: 1.0, fov: 40, pose: (s, h, f, u) => ({ off: [Math.sin(f) * (3.4 + u * 1.0) + Math.cos(f) * 0.6, h * (0.55 + u * 0.3), Math.cos(f) * (3.4 + u * 1.0) - Math.sin(f) * 0.6], track: true }) },
  side: { label: 'Side dolly', shake: 0.8, fov: 42, pose: (s, h, f, u) => ({ off: [Math.cos(f) * (u > 0.5 ? 2.6 : -2.6), h * 0.55, -Math.sin(f) * (u > 0.5 ? 2.6 : -2.6)], track: true }) },
  low: { label: 'Low angle', shake: 1.3, fov: 46, pose: (s, h, f, u) => ({ off: [Math.sin(f + 0.5) * 2.0, 0.25, Math.cos(f + 0.5) * 2.0], aim: h * 0.75, track: true }) },
  close: { label: 'Close-up', shake: 1.6, fov: 28, pose: (s, h, f, u) => ({ orbit: { radius: 1.6 + u * 0.4, height: h * 0.7, speed: u > 0.5 ? 14 : -14 }, aim: h * 0.6 }) },
  crane: { label: 'Crane', shake: 0.5, fov: 40, pose: (s, h, f, u) => ({ off: [Math.sin(f + 2.4) * 3.5, h + 2.6 + u, Math.cos(f + 2.4) * 3.5], rise: 0.25, track: true }) },
  wide: { label: 'Wide (hero)', shake: 0.6, fov: null, pose: () => ({ hero: true }) },
  back: { label: 'Behind', shake: 1.1, fov: 44, pose: (s, h, f, u) => ({ off: [-Math.sin(f) * 2.6, h * 0.9, -Math.cos(f) * 2.6], track: true }) }
};
const director = { on: false, ops: Object.keys(OPERATORS), who: 'auto', min: 2.5, max: 6, next: 0, op: null, opName: '', plan: null, u: 0, t: 0 };
let lastPerformer = null; // set by the story runner
function directorSubject() {
  if (director.who && director.who !== 'auto') return findChar(director.who) || null;
  if (lastPerformer && lastPerformer.enabled) return lastPerformer;
  return capys.find(c => c.enabled && c.state === 'move') || capys.find(c => c.enabled) || null;
}
function directorCut(first = false) {
  const pool = director.ops.filter(n => OPERATORS[n] && (n !== director.opName || director.ops.length === 1));
  director.opName = pool[Math.floor(Math.random() * pool.length)] || 'wide';
  director.op = OPERATORS[director.opName];
  director.u = Math.random();
  director.t = 0;
  director.next = director.min + Math.random() * Math.max(0, director.max - director.min);
  const s = directorSubject();
  director.plan = s ? director.op.pose(s, s.h, s.root.rotation.y, director.u) : { hero: true };
  // most cuts are hard cuts, some are quick glides (like a live vision mixer)
  storyCam.fromPos.copy(camera.position); storyCam.fromT.copy(storyCam.target); storyCam.fromFov = camera.fov;
  storyCam.t = first || Math.random() < 0.7 ? 1 : 0; storyCam.dur = 0.6;
  if (director.plan.orbit && s) storyCam.angle = Math.atan2(camera.position.x - s.root.position.x, camera.position.z - s.root.position.z) + (Math.random() - 0.5);
  if (storyCam.t >= 1) { directorPose(0, _cp, _ct); camera.position.copy(_cp); storyCam.target.copy(_ct); camera.fov = director.op.fov || L.camera.fov; }
}
function directorPose(dt, pos, target) {
  const s = directorSubject(), plan = director.plan || { hero: true };
  director.t += dt;
  if (!s || plan.hero) {
    pos.fromArray(L.camera.pos || [0, 1.6, 4]);
    if (s) target.set(s.root.position.x, s.root.position.y + s.h * 0.55, s.root.position.z); else target.fromArray(L.camera.target || [0, 0.8, 0]);
    return;
  }
  const P = s.root.position;
  target.set(P.x, P.y + (plan.aim ?? s.h * 0.55), P.z);
  if (plan.orbit) {
    storyCam.angle += THREE.MathUtils.degToRad(plan.orbit.speed) * dt;
    pos.set(P.x + Math.sin(storyCam.angle) * plan.orbit.radius, P.y + plan.orbit.height, P.z + Math.cos(storyCam.angle) * plan.orbit.radius);
    return;
  }
  pos.set(P.x + plan.off[0], P.y + plan.off[1] + (plan.rise || 0) * director.t, P.z + plan.off[2]);
}

function cameraTo(step = {}) {
  const shot = step.shot ?? 'hero';
  const mode = step.mode || (step.follow ? 'look' : 'fixed');
  const who = step.who || step.follow;
  director.on = mode === 'director';
  if (director.on) {
    director.who = who || 'auto';
    director.ops = Array.isArray(step.operators) && step.operators.length ? step.operators.filter(n => OPERATORS[n]) : Object.keys(OPERATORS);
    director.min = step.cutMin ?? 2.5; director.max = step.cutMax ?? 6;
    view = 'story'; controls.enabled = false; storyCam.mode = 'director';
    directorCut(true);
    return Promise.resolve();
  }
  if (mode === 'fixed' && shot === 'hero') { storyCam.c = null; director.on = false; setView('hero'); return Promise.resolve(); }
  if (view !== 'story') storyCam.target.copy(camera.position).add(camera.getWorldDirection(_ct).multiplyScalar(5));
  view = 'story'; controls.enabled = false;
  storyCam.mode = mode; storyCam.c = who ? findChar(who) || null : null;
  storyCam.shot = shot && shot !== 'hero' ? shot : null;
  if (Array.isArray(step.offset)) storyCam.offset.fromArray(step.offset);
  storyCam.frame = step.frame === 'character' ? 'character' : 'world';
  storyCam.radius = step.radius ?? 2.5; storyCam.height = step.height ?? 1.2; storyCam.speed = step.speed ?? 20;
  if (mode === 'drift') {
    const sp = storyCam.shot ? new THREE.Vector3().fromArray(storyCam.shot.pos) : camera.position.clone();
    const tp = storyCam.shot ? new THREE.Vector3().fromArray(storyCam.shot.target) : camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(5));
    const fwd = tp.clone().sub(sp).normalize(), right = new THREE.Vector3().crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize(), up = new THREE.Vector3().crossVectors(right, fwd);
    const calm = envMode === 'depth';
    storyCam.drift = { pos: sp, target: tp, fwd, right, up, move: Array.isArray(step.move) ? step.move : calm ? [0.12, 0, 0.15] : [0.6, 0, 0.5],
      seconds: step.driftSeconds ?? (calm ? 14 : 10), pingpong: step.pingpong !== false };
    storyCam.elapsed = 0; storyCam.c = null;
  }
  if (mode === 'orbit' && storyCam.c) { const p = storyCam.c.root.position; storyCam.angle = Math.atan2(camera.position.x - p.x, camera.position.z - p.z); }
  storyCam.fov = step.fov ?? storyCam.shot?.fov ?? camera.fov;
  storyCam.fromPos.copy(camera.position); storyCam.fromT.copy(storyCam.target); storyCam.fromFov = camera.fov;
  storyCam.t = 0; storyCam.dur = Math.max(0, step.seconds ?? 0);
  return new Promise(res => { storyCam.done = res; });
}
function updateStoryCam(dt) {
  if (storyCam.mode === 'director') {
    director.next -= dt;
    if (director.next <= 0) directorCut();
    directorPose(dt, _cp, _ct);
    const fov = director.op?.fov || L.camera.fov || 42;
    if (storyCam.t < 1) {
      storyCam.t = Math.min(1, storyCam.t + dt / storyCam.dur);
      const e = storyCam.t * storyCam.t * (3 - 2 * storyCam.t);
      camera.position.lerpVectors(storyCam.fromPos, _cp, e); storyCam.target.lerpVectors(storyCam.fromT, _ct, e);
      camera.fov = storyCam.fromFov + (fov - storyCam.fromFov) * e;
    } else {
      // operators keep the performer framed with a little lag, like a person would
      camera.position.lerp(_cp, Math.min(1, dt * 3.5)); storyCam.target.lerp(_ct, Math.min(1, dt * 5));
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 2);
    }
    camera.updateProjectionMatrix(); camera.lookAt(storyCam.target);
    return;
  }
  storyCam.t = storyCam.dur > 0 ? Math.min(1, storyCam.t + dt / storyCam.dur) : 1;
  const e = storyCam.t * storyCam.t * (3 - 2 * storyCam.t);
  desiredCam(dt, _cp, _ct);
  if (storyCam.t < 1) {
    camera.position.lerpVectors(storyCam.fromPos, _cp, e);
    storyCam.target.lerpVectors(storyCam.fromT, _ct, e);
    camera.fov = storyCam.fromFov + (storyCam.fov - storyCam.fromFov) * e;
  } else {
    const k = storyCam.mode === 'fixed' ? 1 : Math.min(1, dt * 6); // smooth tracking
    camera.position.lerp(_cp, k); storyCam.target.lerp(_ct, k); camera.fov = storyCam.fov;
  }
  camera.updateProjectionMatrix();
  camera.lookAt(storyCam.target);
  if (storyCam.t >= 1 && storyCam.done) { const d = storyCam.done; storyCam.done = null; d(); }
}
function setView(v) {
  view = v; if (v !== 'story') director.on = false;
  controls.enabled = v !== 'hero';
  if (v === 'hero') { setupHero(); return; }
  camera.fov = 50; camera.updateProjectionMatrix();
  const c = zones.water?.polygon?.length ? polyCentroid(zones.water.polygon) : [0, -6];
  if (v === 'top') {
    controls.enableRotate = false; controls.screenSpacePanning = true;
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.minDistance = 2; controls.maxDistance = 60; controls.minPolarAngle = 0; controls.maxPolarAngle = 0.001;
    controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    controls.target.set(c[0], 0, c[1]); camera.position.set(c[0], 14, c[1] + 0.01);
  } else {
    controls.enableRotate = true;
    controls.mouseButtons = EDIT ? { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE } : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.minDistance = 1; controls.maxDistance = 40; controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI * 0.49;
    controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
    controls.target.set(c[0], 0, c[1]); camera.position.copy(splatRoot.position).add(new THREE.Vector3(0, 2.5, 2));
  }
  controls.update();
}

// ---------------------------------------------------------------- sky + lights
function gradientSky() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#9fb0c4'); gr.addColorStop(0.45, '#d5dde6'); gr.addColorStop(0.55, '#e9edf2'); gr.addColorStop(1, '#c3cad3');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hemi = new THREE.HemisphereLight(0xe3ebf5, 0x8d939c, 1.6);
const key = new THREE.DirectionalLight(0xeef3ff, 1.4); key.position.set(-6, 9, 4);
const warm = new THREE.PointLight(0xffb066, 6, 9, 1.6);
scene.add(hemi, key, warm);

// ---------------------------------------------------------------- splat backdrop (near + far layers)
const splatRoot = new THREE.Group(); scene.add(splatRoot);
let splats = [];
const grade = { sat: uniform(1), bright: uniform(1), tint: uniform(color('#ffffff')) };
function pickSplatSet(files) {
  // hero / hero_mobile: full detail cut to the hero view, split near/far (tools/crop_hero.py).
  // Each layer gets its own depth sort, which three.js needs for big worlds.
  const order = Q.get('splat') ? [Q.get('splat')]
    : renderer.backend?.isWebGLBackend ? ['150k', '100k', '500k']
    : IS_PHONE ? ['hero_mobile', '500k', '150k'] : ['hero', '500k', '150k', 'full_res'];
  for (const k of order) if (files.splats?.[k]) return [].concat(files.splats[k]);
  const any = Object.values(files.splats || {})[0]; // e.g. only full_res uploaded
  return any ? [].concat(any) : [];
}
async function loadSplats(list) {
  const loaded = await Promise.all(list.map(f => new SPZLoader().loadAsync(`${WORLD}/${f}`)));
  for (const s of splats) { splatRoot.remove(s); s.geometry.dispose(); s.material.dispose(); }
  splats = loaded.map((geo, i) => {
    const s = new GaussianSplat(geo);
    const base = s.material.colorNode;
    const lin = sRGBTransferEOTF(base.rgb.clamp(0, 1)); // splat colours are sRGB values
    s.material.colorNode = vec4(mix(vec3(luminance(lin)), lin, grade.sat).mul(grade.bright).mul(grade.tint), base.a);
    s.material.toneMapped = L.splat.toneMapped;
    s.renderOrder = -10 - i * 10; // far layers first, water after all of them
    s.frustumCulled = false;
    splatRoot.add(s);
    return s;
  });
  return loaded.reduce((n, g) => n + g.getAttribute('position').count, 0);
}

// ---------------------------------------------------------------- ground height field (Marble collider)
let hf = null;
const HF_CELL = 0.25;
function buildHeightField(obj) {
  // rasterise the collider's triangles; per cell keep the highest surface below 1.2 m
  obj.updateWorldMatrix(true, true);
  const R = { x0: -16, x1: 16, z0: -26, z1: 6 };
  const W = Math.ceil((R.x1 - R.x0) / HF_CELL), H = Math.ceil((R.z1 - R.z0) / HF_CELL);
  const h = new Float32Array(W * H).fill(NaN), v = new THREE.Vector3();
  obj.traverse(o => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, idx = o.geometry.index, P = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    const tri = idx ? idx.count / 3 : p.count / 3;
    for (let t = 0; t < tri; t++) {
      const a = (idx ? idx.getX(t * 3) : t * 3) * 3, b = (idx ? idx.getX(t * 3 + 1) : t * 3 + 1) * 3, c = (idx ? idx.getX(t * 3 + 2) : t * 3 + 2) * 3;
      const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
      if (Math.min(ay, by, cy) > 1.2 || Math.max(ay, by, cy) < -3) continue;
      const minx = Math.max(R.x0, Math.min(ax, bx, cx)), maxx = Math.min(R.x1, Math.max(ax, bx, cx));
      const minz = Math.max(R.z0, Math.min(az, bz, cz)), maxz = Math.min(R.z1, Math.max(az, bz, cz));
      if (minx > maxx || minz > maxz) continue;
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(den) < 1e-9) continue;
      const xi0 = Math.floor((minx - R.x0) / HF_CELL), xi1 = Math.floor((maxx - R.x0) / HF_CELL);
      const zi0 = Math.floor((minz - R.z0) / HF_CELL), zi1 = Math.floor((maxz - R.z0) / HF_CELL);
      for (let zi = zi0; zi <= zi1; zi++) for (let xi = xi0; xi <= xi1; xi++) {
        const px = R.x0 + (xi + 0.5) * HF_CELL, pz = R.z0 + (zi + 0.5) * HF_CELL;
        const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den;
        const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den, l3 = 1 - l1 - l2;
        if (l1 < -0.01 || l2 < -0.01 || l3 < -0.01) continue;
        const y = l1 * ay + l2 * by + l3 * cy;
        if (y > 1.2 || y < -3) continue;
        const k = zi * W + xi;
        if (!(h[k] >= y)) h[k] = y;
      }
    }
  });
  return { x0: R.x0, z0: R.z0, W, H, h };
}
function groundY(x, z) {
  if (!hf) return 0;
  const xi = Math.floor((x - hf.x0) / HF_CELL), zi = Math.floor((z - hf.z0) / HF_CELL);
  if (xi < 0 || zi < 0 || xi >= hf.W || zi >= hf.H) return 0;
  const y = hf.h[zi * hf.W + xi];
  return isNaN(y) ? 0 : y;
}

// ---------------------------------------------------------------- zones + navigation
// ---------------------------------------------------------------- scene content (zones.json, edited with ?edit=1)
const ZONE_DEFAULTS = {
  water: { y: -0.2, polygon: [], color: '#5f9893', opacity: 0.4, swimDepth: 0.6,
    ripple: { size: 1, speed: 1, strength: 1 }, steam: { amount: 0.6, height: 1.5, opacity: 0.11, size: 1 } },
  walk: [], blocked: [], spots: [], routes: [], props: [],
  // how often each kind of activity is chosen (relative weights)
  behaviour: { walk: 3, swim: 2, soak: 2, rest: 3, nap: 1, surprise: 1, route: 2 },
  capys: {} // per capybara: { enabled, scale, speed, start, route, behaviour }
};
const CAPY_DEFAULT = { enabled: true, scale: 1, speed: 1, start: null, route: '', behaviour: null };
let zones = structuredClone(ZONE_DEFAULTS);
let nav = null;
const capCfg = c => ({ ...CAPY_DEFAULT, ...(zones.capys?.[c.tag] || {}) });
// is a ground point inside the hero camera's view? (angles from the generation spot)
function inHeroView(x, y, z) {
  const dx = x - hero.base.x, dz = z - hero.base.z, dy = y - hero.base.y, d = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, -dz) - THREE.MathUtils.degToRad(hero.yaw ?? L.camera.yaw);
  const halfV = THREE.MathUtils.degToRad((hero.fov ?? L.camera.fov) / 2), halfH = Math.atan(Math.tan(halfV) * Math.max(1, innerWidth / innerHeight));
  const pitch = Math.atan2(dy, d) - THREE.MathUtils.degToRad(hero.pitch ?? L.camera.pitch);
  return Math.abs(yaw) < halfH * 0.92 && pitch > -halfV * 0.92 && pitch < halfV * 0.6;
}
function buildNav() {
  // without drawn walk areas: flat-ish ground the hero camera can see, not right at the lens
  const fallbackWalk = (x, z, g) => Math.abs(g) < L.walk.maxSlope && inHeroView(x, g, z) &&
    Math.hypot(x - hero.base.x, z - hero.base.z) > L.walk.minDist;
  nav = new Nav(zones, groundY, { fallbackWalk });
  for (const c of capys) { c.path = null; c.state = 'idle'; }
  buildWater(); buildProps(); if (navViz) showGrid(true);
}
// scope: 'all' | 'nav' (shapes, water edge/level) | 'water' (look only) | 'props' | 'capys' | 'data' (routes, behaviour)
function setZones(z, scope = 'all') {
  zones = deepMerge(structuredClone(ZONE_DEFAULTS), z);
  if (scope === 'all' || scope === 'nav') buildNav();
  if (scope === 'water') applyWaterLook();
  if (scope === 'props') buildProps();
  if (scope === 'all' || scope === 'capys') applyCapyConfig();
}

// ---------------------------------------------------------------- water
const pool = new THREE.Group(); scene.add(pool);
const waterU = { color: uniform(color('#5f9893')), size: uniform(1), speed: uniform(1), strength: uniform(0.04) };
let waterMesh = null;
function buildWater() {
  pool.clear(); waterMesh = null;
  const poly = zones.water?.polygon;
  if (!poly || poly.length < 3) return;
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const p = positionWorld.xz, t = time.mul(0.35).mul(waterU.speed);
  const h = q => mx_noise_float(vec3(q.x.mul(waterU.size.mul(2.2)), q.y.mul(waterU.size.mul(2.2)), t)).mul(0.6)
    .add(mx_noise_float(vec3(q.x.mul(waterU.size.mul(6.0)), q.y.mul(waterU.size.mul(6.0)), t.mul(1.7))).mul(0.25));
  const mat = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.05, metalness: 0, transparent: true, depthWrite: false });
  mat.colorNode = waterU.color;
  mat.normalNode = bumpMap(h(p), waterU.strength);
  waterMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), mat);
  waterMesh.rotation.x = -Math.PI / 2; waterMesh.renderOrder = 5;
  pool.add(waterMesh);
  applyWaterLook();
}
function applyWaterLook() {
  const w = zones.water;
  waterU.color.value.set(w.color); waterU.size.value = 1 / Math.max(0.1, w.ripple.size);
  waterU.speed.value = w.ripple.speed; waterU.strength.value = 0.04 * w.ripple.strength;
  if (waterMesh) { waterMesh.material.opacity = w.opacity; waterMesh.position.y = w.y + (backdropMeta ? 0.015 : 0); }
  const want = Math.round((IS_PHONE ? 18 : 30) * w.steam.amount);
  if (want !== steamCount) buildSteam();
}
const waterY = () => zones.water?.y ?? 0;

// ---------------------------------------------------------------- steam, snow, ripples
function softTexture(inner = 'rgba(255,255,255,1)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const steamTex = softTexture();
const steam = [], steamGroup = new THREE.Group(); scene.add(steamGroup);
let steamCount = -1;
function steamSprite() {
  const s = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
  s.renderOrder = 8; s.userData = { life: Math.random(), speed: 0.08 + Math.random() * 0.06, a: Math.random() * 6.28 };
  steam.push(s); steamGroup.add(s); return s;
}
function buildSteam() {
  steamGroup.clear(); steam.length = 0;
  steamCount = Math.round((IS_PHONE ? 18 : 30) * zones.water.steam.amount);
  for (let i = 0; i < steamCount; i++) steamSprite();
  // steam vents placed as props: a few extra puffs each
  for (const pr of zones.props || []) if (pr.type === 'steam') for (let i = 0; i < 6; i++) { const s = steamSprite(); s.userData.vent = pr; }
}
function updateSteam(dt) {
  if (!nav) return;
  const st = zones.water.steam;
  for (const s of steam) {
    const u = s.userData; u.life += dt * u.speed;
    if (u.life > 1 || !u.p) {
      u.life = u.life > 1 ? 0 : u.life;
      u.p = u.vent ? [u.vent.x + (Math.random() - 0.5) * 0.3 * (u.vent.scale || 1), u.vent.z + (Math.random() - 0.5) * 0.3 * (u.vent.scale || 1)] : (nav.randomCell(KIND.WATER) || [0, -6]);
    }
    const y0 = u.vent ? nav.height(u.vent.x, u.vent.z) : waterY();
    s.position.set(u.p[0] + Math.sin(u.life * 4 + u.a) * 0.15, y0 + 0.05 + u.life * st.height, u.p[1]);
    const size = (0.6 + u.life * 1.5) * st.size * (u.vent ? 0.6 * (u.vent.scale || 1) : 1); s.scale.set(size, size, 1);
    s.material.opacity = Math.sin(u.life * Math.PI) * st.opacity;
  }
}
let snow = null; const snowData = [];
function buildSnow() {
  if (snow) { scene.remove(snow); snow.geometry.dispose(); }
  const n = Math.round((IS_PHONE ? 700 : 1800) * L.look.snow);
  if (!n) { snow = null; return; }
  snow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 5, 4), new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }), n);
  snow.frustumCulled = false; snow.renderOrder = 9; snowData.length = 0;
  for (let i = 0; i < n; i++) snowData.push({ x: (Math.random() - 0.5) * 18, y: Math.random() * 8, z: -Math.random() * 16, s: 0.25 + Math.random() * 0.35, p: Math.random() * 6 });
  scene.add(snow);
}
const _m = new THREE.Matrix4();
function updateSnow(dt, t) {
  if (!snow) return;
  const sp = L.look.snowSpeed ?? 1;
  for (let i = 0; i < snowData.length; i++) {
    const d = snowData[i]; d.y -= d.s * dt * sp;
    if (d.y < -0.5) { d.y = 8; d.x = (Math.random() - 0.5) * 18; d.z = -Math.random() * 16; }
    _m.makeTranslation(hero.base.x + d.x + Math.sin(t * 0.7 + d.p) * 0.3, d.y, hero.base.z + d.z + Math.cos(t * 0.5 + d.p) * 0.2);
    snow.setMatrixAt(i, _m);
  }
  snow.instanceMatrix.needsUpdate = true;
}
const ringGeo = new THREE.RingGeometry(0.85, 1, 48), ripples = [];
function spawnRipple(x, z, size) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, waterY() + 0.02, z); m.renderOrder = 6; m.userData = { age: 0, size };
  scene.add(m); ripples.push(m);
}
function updateRipples(dt) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const m = ripples[i], u = m.userData; u.age += dt;
    const s = u.size * (0.4 + u.age * 0.9); m.scale.set(s, s, s);
    m.material.opacity = Math.max(0, 0.2 * (1 - u.age / 1.6));
    if (u.age > 1.6) { scene.remove(m); m.material.dispose(); ripples.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- props (mandarins, lanterns, steam vents)
const propsGroup = new THREE.Group(); scene.add(propsGroup);
const propMat = {
  orange: new THREE.MeshStandardNodeMaterial({ color: 0xff8a1f, roughness: 0.55 }),
  leaf: new THREE.MeshStandardNodeMaterial({ color: 0x2f5a2a, roughness: 0.7 }),
  stone: new THREE.MeshStandardNodeMaterial({ color: 0x8d8a84, roughness: 0.95 }),
  snow: new THREE.MeshStandardNodeMaterial({ color: 0xf2f5f8, roughness: 0.8 }),
  glow: new THREE.MeshBasicNodeMaterial({ color: 0xffc46b })
};
function makeProp(pr) {
  const g = new THREE.Group();
  if (pr.type === 'mandarins') {
    [[0, 0], [0.13, 0.05], [0.05, 0.14]].forEach(([dx, dz]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), propMat.orange); m.scale.y = 0.85; m.position.set(dx, 0.065, dz);
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), propMat.leaf); l.position.set(0, 0.07, 0); l.rotation.z = 0.6; m.add(l);
      g.add(m);
    });
  } else if (pr.type === 'lantern') { // small stone lantern (tōrō)
    const part = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
    part(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 8), propMat.stone, 0.04);
    part(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 8), propMat.stone, 0.24);
    part(new THREE.BoxGeometry(0.24, 0.05, 0.24), propMat.stone, 0.42);
    part(new THREE.BoxGeometry(0.17, 0.15, 0.17), propMat.stone, 0.52);
    part(new THREE.BoxGeometry(0.12, 0.09, 0.18), propMat.glow, 0.52);
    part(new THREE.ConeGeometry(0.22, 0.14, 4), propMat.stone, 0.66).rotation.y = Math.PI / 4;
    part(new THREE.ConeGeometry(0.2, 0.06, 4), propMat.snow, 0.72).rotation.y = Math.PI / 4;
  } else if (pr.type === 'steam') { // a marker only; the puffs come from buildSteam
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0xffffff, transparent: true, opacity: EDIT ? 0.25 : 0, depthWrite: false }));
    m.position.y = 0.02; g.add(m);
  }
  g.position.set(pr.x, nav ? nav.height(pr.x, pr.z) : groundY(pr.x, pr.z), pr.z);
  g.rotation.y = THREE.MathUtils.degToRad(pr.rot || 0); g.scale.setScalar(pr.scale || 1);
  return g;
}
function buildProps() {
  propsGroup.clear();
  for (const pr of zones.props || []) propsGroup.add(makeProp(pr));
  buildSteam();
}

// ---------------------------------------------------------------- capybaras
const blobTex = softTexture('rgba(0,0,0,1)');
const capys = [];
const loader = new GLTFLoader();
const spots = type => (zones.spots || []).filter(s => s.type === type);
const active = () => capys.filter(c => c.enabled);
// a free place: not taken by another capybara standing there or heading there
function free(x, z, me) {
  const r = L.capy.personal * 1.4;
  return active().every(o => o === me || (Math.hypot(o.root.position.x - x, o.root.position.z - z) > r && !(o.goal && Math.hypot(o.goal[0] - x, o.goal[1] - z) < r)));
}
function pickTarget(c, kind) {
  for (let k = 0; k < 30; k++) {
    let p = null;
    if (kind === KIND.LAND && spots('rest').length && Math.random() < 0.55) { const s = spots('rest')[Math.floor(Math.random() * spots('rest').length)]; p = nav.nearestOpen(s.x, s.z, KIND.LAND, 1); }
    else if (kind === KIND.WATER && spots('entry').length && Math.random() < 0.2) { const s = spots('entry')[Math.floor(Math.random() * spots('entry').length)]; p = nav.nearestOpen(s.x, s.z, KIND.WATER, 2); }
    else p = nav.randomCell(kind);
    if (p && free(p[0], p[1], c)) return p;
  }
  return null;
}
function startMove(c, path, goal, then) {
  if (!path || path.length < 2) return false;
  c.path = path; c.pi = 1; c.goal = goal; c.state = 'move'; c.then = then; c.stuck = 0;
  play(c, nav.isWater(c.root.position.x, c.root.position.z) ? 'swim' : 'walk');
  return true;
}
function goTo(c, kind, then) {
  const p = pickTarget(c, kind); if (!p) return false;
  return startMove(c, nav.path(c.root.position.x, c.root.position.z, p[0], p[1]), p, then);
}
// walk a drawn route: to its first point, then point by point (each leg path-found)
function followRoute(c) {
  const cfg = capCfg(c), routes = (zones.routes || []).filter(r => r.points?.length >= 2);
  if (cfg.route === 'none' || !routes.length) return false;
  const pool = cfg.route ? routes.filter(r => r.name === cfg.route) : routes;
  if (!pool.length) return false;
  const r = pool[Math.floor(Math.random() * pool.length)];
  let pts = r.points.slice(); if (r.reverse !== false && Math.random() < 0.5) pts.reverse();
  if (r.loop) pts.push(pts[0]);
  let x = c.root.position.x, z = c.root.position.z, full = [[x, z]];
  for (const [px, pz] of pts) {
    const leg = nav.path(x, z, px, pz); if (!leg) return false;
    full.push(...leg.slice(1)); x = px; z = pz;
  }
  return startMove(c, full, pts[pts.length - 1], 'route');
}
function capyMarker() {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: 0xffe066, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  m.renderOrder = 104; m.visible = false; return m;
}
// Stand-in figure for characters whose GLB is missing: body, head and an
// "Outfit" mesh with UVs (so the drawing can be shown), plus idle/walk/pose clips.
function placeholderCharacter() {
  // a plain capsule; the whole capsule is the "Outfit" and takes the drawing
  const model = new THREE.Group(); model.name = 'placeholder';
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.9, 8, 24), new THREE.MeshStandardNodeMaterial({ color: 0xf4f1ec, roughness: 0.6 }));
  body.name = 'Outfit'; body.material.name = 'Outfit'; body.position.y = 0.7;
  model.add(body);
  const q = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg)).toArray();
  const clips = [
    new THREE.AnimationClip('idle', 2, [new THREE.VectorKeyframeTrack('Outfit.scale', [0, 1, 2], [1, 1, 1, 1.02, 0.985, 1.02, 1, 1, 1])]),
    new THREE.AnimationClip('walk', 0.5, [
      new THREE.VectorKeyframeTrack('Outfit.position', [0, 0.25, 0.5], [0, 0.7, 0, 0, 0.76, 0, 0, 0.7, 0]),
      new THREE.QuaternionKeyframeTrack('Outfit.quaternion', [0, 0.25, 0.5], [...q(-6), ...q(6), ...q(-6)])
    ]),
    new THREE.AnimationClip('pose', 1.4, [new THREE.QuaternionKeyframeTrack('Outfit.quaternion', [0, 0.7, 1.4], [...q(0), ...q(180), ...q(360)])])
  ];
  return { scene: model, animations: clips };
}
async function loadCapy(ch, i) {
  const tag = ch.id;
  let gltf, placeholder = false;
  try {
    if (!ch.file) throw new Error('no file');
    gltf = await loader.loadAsync(castUrl(ch));
  } catch (e) {
    console.warn(`[scene] ${tag}: ${ch.file || 'no file'} not found, showing a stand-in figure`);
    gltf = placeholderCharacter(); placeholder = true;
  }
  const model = gltf.scene;
  model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
  const h0 = (placeholder && !ch.height ? 1.6 : ch.height) || L.capy.height * (ch.sizeFactor ?? 1), k = h0 / size.y;
  const inner = new THREE.Group(); inner.add(model);
  model.scale.setScalar(k); model.position.y = -box.min.y * k;
  inner.rotation.y = THREE.MathUtils.degToRad(L.capy.facing);
  const root = new THREE.Group(); root.add(inner);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicNodeMaterial({ map: blobTex, transparent: true, opacity: 0.45, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.scale.set(size.x * k * 1.6, size.z * k * 1.3, 1); blob.position.y = 0.01; blob.renderOrder = 1;
  root.add(blob);
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(h0 * 0.6, 8, 6), new THREE.MeshBasicNodeMaterial({ visible: false }));
  proxy.position.y = h0 * 0.5; proxy.userData.capyIndex = i; root.add(proxy);
  const marker = capyMarker(); marker.scale.setScalar(h0 * 1.4); root.add(marker);
  const mixer = new THREE.AnimationMixer(model);
  const clip = n => THREE.AnimationClip.findByName(gltf.animations, placeholder ? n : ch.clips?.[n] || n);
  // meshes that wear the drawing (cast.json outfit.mesh: mesh or material names)
  const outfitNames = [].concat(ch.outfit?.mesh || (placeholder ? 'Outfit' : []));
  const outfit = [];
  model.traverse(o => { if (o.isMesh && (outfitNames.includes(o.name) || outfitNames.includes(o.material?.name))) outfit.push({ mesh: o, original: o.material }); });
  const meshNames = []; model.traverse(o => { if (o.isMesh) meshNames.push(o.name || o.material?.name || ''); });
  const c = { tag, ch, placeholder, outfit, meshNames, clipNames: gltf.animations.map(a => a.name), root, inner, blob, proxy, marker, mixer, clip, h0, h: h0, enabled: true, cur: null, state: 'idle', timer: 0.5 + Math.random() * 2, swimming: false, rippleT: 0, blinkT: 2 + Math.random() * 3, path: null };
  proxy.userData.capy = c;
  scene.add(root); capys.push(c); play(c, 'idle');
  placeAtStart(c);
}
function placeAtStart(c) {
  const cfg = capCfg(c), sp = zones.spots || [];
  const mine = cfg.start != null && sp[cfg.start]?.type === 'start' ? sp[cfg.start] : null;
  const st = mine || spots('start').find(s => free(s.x, s.z, c));
  const p = st ? [st.x, st.z] : (pickTarget(c, KIND.LAND) || nav.randomCell(KIND.LAND) || [0, -5]);
  c.root.position.set(p[0], nav.height(p[0], p[1]), p[1]);
  c.root.rotation.y = Math.random() * Math.PI * 2;
  c.path = null; c.goal = null; c.state = 'idle'; c.timer = 0.3 + Math.random();
}
const texLoader = new THREE.TextureLoader();
async function setOutfit(c, url) {
  if (!c?.outfit.length) return false;
  if (!url) { for (const o of c.outfit) o.mesh.material = o.original; return true; }
  const t = await texLoader.loadAsync(url);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8;
  for (const o of c.outfit) {
    const m = o.original.clone(); m.map = t; if (m.color) m.color.set(0xffffff); m.needsUpdate = true;
    o.mesh.material = m;
  }
  return true;
}
async function loadCast(list) {
  for (const c of capys.splice(0)) { scene.remove(c.root); c.mixer.stopAllAction(); }
  cast = list; TAGS = cast.map(ch => ch.id);
  const use = cast.filter(ch => ch.enabled !== false);
  const limit = cast === legacyList ? Math.min(L.capy.count, use.length) : use.length;
  for (let i = 0; i < limit; i++) await loadCapy(use[i], i).catch(e => console.warn('character', use[i].id, e));
  applyCapyConfig();
  if (EDIT) editorHandle?.refresh?.();
}
let legacyList = null;
function applyCapyConfig() {
  for (const c of capys) {
    const cfg = capCfg(c);
    c.enabled = cfg.enabled !== false; c.root.visible = c.enabled;
    c.root.scale.setScalar(cfg.scale || 1); c.h = c.h0 * (cfg.scale || 1);
  }
}
function play(c, name, { once = false, fade = 0.3 } = {}) {
  const cl = c.clip(name); if (!cl) return 0;
  const a = c.mixer.clipAction(cl);
  if (c.cur === a && !once) return cl.duration;
  a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.play();
  if (c.cur && c.cur !== a) c.cur.crossFadeTo(a, fade, false);
  c.cur = a; return cl.duration;
}
function face(c, name) { const cl = c.clip(name); if (!cl) return; const a = c.mixer.clipAction(cl); a.reset(); a.setLoop(THREE.LoopOnce); a.play(); }
const pick = (...xs) => xs[Math.floor(Math.random() * xs.length)];
function weighted(w) {
  const keys = Object.keys(w).filter(k => w[k] > 0), sum = keys.reduce((s, k) => s + w[k], 0);
  let r = Math.random() * sum;
  for (const k of keys) { if ((r -= w[k]) <= 0) return k; }
  return keys[0];
}
function rest(c) { c.state = 'act'; const n = pick('idle', 'graze', 'idle', 'sunbathe'); const d = play(c, n, { once: n === 'sunbathe' }); c.timer = n === 'sunbathe' ? d : 3 + Math.random() * 4; }
function decide(c) {
  c.goal = null;
  const W = { ...zones.behaviour, ...(capCfg(c).behaviour || {}) };
  if (c.swimming) {
    const a = weighted({ soak: W.soak, swim: W.swim, out: W.walk + W.rest + W.nap + W.route });
    if (a === 'soak') { c.state = 'soak'; c.timer = play(c, 'soak_in', { once: true }); c.next = 'soak_loop'; return; }
    if (a === 'swim' && goTo(c, KIND.WATER)) return;
    if (goTo(c, KIND.LAND, 'dry')) return;
    c.state = 'act'; c.timer = 2; play(c, 'swim'); return;
  }
  const a = weighted({ walk: W.walk, swim: nav.water.length ? W.swim + W.soak : 0, rest: W.rest, nap: W.nap, surprise: W.surprise, route: zones.routes?.length ? W.route : 0 });
  if (a === 'walk' && goTo(c, KIND.LAND)) return;
  if (a === 'swim' && goTo(c, KIND.WATER)) return;
  if (a === 'route' && followRoute(c)) return;
  if (a === 'nap') { c.state = 'act'; play(c, 'nap'); c.timer = 6 + Math.random() * 6; face(c, 'expr_sleepy'); return; }
  if (a === 'surprise') { surprise(c); return; }
  rest(c);
}
function surprise(c) { c.state = 'act'; c.timer = play(c, 'pose', { once: true }) + 0.2; face(c, 'expr_happy'); }

let paused = false;
const _v = new THREE.Vector3();
function updateCapy(c, dt) {
  if (!c.enabled) return;
  c.mixer.update(dt);
  c.blinkT -= dt; if (c.blinkT < 0) { face(c, 'face_blink'); c.blinkT = 2.5 + Math.random() * 3.5; }
  if (paused || c.held) return;
  const pos = c.root.position;
  if (c.state === 'move') {
    const [tx, tz] = c.path[c.pi];
    _v.set(tx - pos.x, 0, tz - pos.z);
    const d = _v.length();
    if (d < 0.12) {
      if (++c.pi >= c.path.length) { c.path = null; c.state = c.then === 'dry' ? 'dry' : 'idle'; c.timer = 0; }
    } else {
      _v.divideScalar(d);
      // avoid other capybaras: steer sideways, wait if someone is right in front
      let block = false;
      for (const o of capys) {
        if (o === c || !o.enabled) continue;
        const dx = o.root.position.x - pos.x, dz = o.root.position.z - pos.z, dd = Math.hypot(dx, dz), need = (c.h + o.h) * 0.5 * L.capy.personal * 1.6;
        if (dd < need && dd > 1e-3) {
          const ahead = (dx * _v.x + dz * _v.z) / dd;
          if (ahead > 0.3) { block = true; _v.x -= dz / dd * 0.8 * Math.sign(dx * _v.z - dz * _v.x || 1); _v.z += dx / dd * 0.8 * Math.sign(dx * _v.z - dz * _v.x || 1); }
          _v.x -= dx / dd * (need - dd) * 2; _v.z -= dz / dd * (need - dd) * 2;
        }
      }
      _v.normalize();
      const yaw = Math.atan2(_v.x, _v.z);
      let dy = yaw - c.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.root.rotation.y += dy * Math.min(1, dt * 5);
      const speed = (c.swimming ? 0.8 : 1) * (c.ch.speed ? c.ch.speed : 0.33 * c.h) * L.capy.speed * (capCfg(c).speed || 1) * (block ? 0.35 : 1);
      const nx = pos.x + Math.sin(c.root.rotation.y) * speed * dt, nz = pos.z + Math.cos(c.root.rotation.y) * speed * dt;
      if (nav.kind(nx, nz)) { pos.x = nx; pos.z = nz; c.stuck = Math.max(0, c.stuck - dt); }
      else { // steering pushed us off the grid: step straight along the path instead
        c.stuck += dt;
        const px = pos.x + (tx - pos.x) / d * speed * dt, pz = pos.z + (tz - pos.z) / d * speed * dt;
        if (nav.kind(px, pz)) { pos.x = px; pos.z = pz; }
      }
      if (block) c.stuck += dt;
      if (c.stuck > 3) { c.path = null; c.state = 'idle'; c.stuck = 0; } // give up, choose again
    }
  } else if (c.state === 'soak') {
    c.timer -= dt;
    if (c.timer <= 0 && c.next) { play(c, c.next); c.next = null; c.timer = 5 + Math.random() * 6; face(c, 'expr_happy'); }
    else if (c.timer <= 0) c.state = 'idle';
  } else if (c.state === 'dry') { c.state = 'act'; c.timer = play(c, 'shake_dry', { once: true }); }
  else c.timer -= dt;
  if (!c.story && (c.state === 'idle' || (c.state === 'act' && c.timer <= 0))) decide(c);

  // land <-> water
  const wasWet = c.swimming;
  c.swimming = nav.isWater(pos.x, pos.z);
  if (c.swimming !== wasWet && c.state === 'move') { play(c, c.swimming ? 'swim' : 'walk'); if (c.swimming) face(c, 'expr_surprised'); }
  const targetY = c.swimming ? waterY() - c.h * zones.water.swimDepth : nav.height(pos.x, pos.z) + 0.01;
  pos.y += (targetY - pos.y) * Math.min(1, dt * 4);
  c.blob.visible = !c.swimming;
  if (c.swimming && (c.state === 'move' || c.state === 'soak')) {
    c.rippleT -= dt;
    if (c.rippleT < 0) { spawnRipple(pos.x, pos.z, c.h * (c.state === 'soak' ? 0.9 : 1.2)); c.rippleT = c.state === 'soak' ? 1.4 : 0.55; }
  }
}
const picker = new THREE.Raycaster(), pointer = new THREE.Vector2();
function capyAt(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  picker.setFromCamera(pointer, camera);
  const hit = picker.intersectObjects(active().map(c => c.proxy), false)[0];
  return hit ? hit.object.userData.capy : null;
}
renderer.domElement.addEventListener('pointerup', e => {
  if (EDIT || e.button !== 0) return;
  const c = capyAt(e);
  if (c && c.story) return;
  if (c && !c.swimming) surprise(c); else if (c) face(c, 'expr_happy');
});

// ---------------------------------------------------------------- debug views (editor)
let navViz = null, pathViz = null;
function showGrid(on) {
  if (navViz) { scene.remove(navViz); navViz.geometry.dispose(); navViz = null; }
  if (!on || !nav) return;
  const cells = nav.land.length + nav.water.length;
  navViz = new THREE.InstancedMesh(new THREE.PlaneGeometry(CELL * 0.8, CELL * 0.8).rotateX(-Math.PI / 2), new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }), cells);
  const col = new THREE.Color(); let i = 0;
  for (const list of [nav.land, nav.water]) for (const k of list) {
    const x = nav.cx(k % nav.W), z = nav.cz(Math.floor(k / nav.W));
    _m.makeTranslation(x, nav.hgt[k] + 0.03, z); navViz.setMatrixAt(i, _m);
    navViz.setColorAt(i++, col.set(nav.cross[k] ? 0xffffff : list === nav.water ? 0x38c8ff : 0x5dff86));
  }
  navViz.renderOrder = 99; scene.add(navViz);
}
function updatePathViz() {
  if (!pathViz) return;
  pathViz.clear();
  for (const c of active()) if (c.path) {
    const pts = [c.root.position.clone().setY(c.root.position.y + 0.1), ...c.path.slice(c.pi).map(([x, z]) => new THREE.Vector3(x, nav.height(x, z) + 0.1, z))];
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicNodeMaterial({ color: 0xff7ad9, depthTest: false, toneMapped: false, fog: false }));
    l.renderOrder = 103; pathViz.add(l);
  }
}

// ---------------------------------------------------------------- look (layout.json)
function applyLayout() {
  splatRoot.rotation.set(L.splat.flip ? Math.PI : 0, THREE.MathUtils.degToRad(L.splat.rotY), 0);
  splatRoot.position.y = L.splat.y; splatRoot.scale.setScalar(L.splat.scale);
  for (const s of splats) { s.material.toneMapped = L.splat.toneMapped; s.material.needsUpdate = true; }
  grade.sat.value = L.splat.saturation; grade.bright.value = L.splat.brightness; grade.tint.value.set(L.splat.tint);
  renderer.toneMappingExposure = L.look.exposure;
  scene.fog = new THREE.Fog(L.look.fog, L.look.fogNear, L.look.fogFar);
  warm.position.fromArray(L.look.warmLight);
  warm.intensity = L.look.warmIntensity ?? 6; hemi.intensity = L.look.ambient ?? 1.6; key.intensity = L.look.sun ?? 1.4;
}
async function putFile(name, body, type) {
  if (opts.saveFile) return opts.saveFile(name, body, type);
  const r = await fetch(`${WORLD}/${name}`, { method: 'PUT', headers: { 'Content-Type': type }, body });
  if (!r.ok) throw new Error(r.status === 501 || r.status === 405 ? 'saving is not available here' : `${r.status} ${await r.text()}`.slice(0, 200));
  return (await r.json()).at;
}
const putJSON = (name, data) => putFile(name, JSON.stringify(data, null, 2), 'application/json');

// ---------------------------------------------------------------- swap files at runtime (editor Files tab)
let bdGroup = null, sceneInfoRef = null;
async function reloadBackdrop() {
  if (!bdGroup) return;
  const bd = await loadDepthBackdrop(`${WORLD}/${sceneInfoRef.files.backdrop}`, { phone: IS_PHONE, bust: Date.now() });
  scene.remove(bdGroup);
  bdGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  bdGroup = bd.group; backdropMeta = bd.meta; scene.add(bdGroup);
  hf = buildHeightField(bd.front); buildNav();
}
async function reloadSky() {
  if (!sceneInfoRef.files.pano) return;
  const t = await new THREE.TextureLoader().loadAsync(`${WORLD}/${sceneInfoRef.files.pano}?v=${Date.now()}`);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  scene.background?.dispose?.(); scene.background = t; scene.environment = t;
}

// ---------------------------------------------------------------- boot
const timer = new THREE.Timer();
let story = { autoplay: true, loop: true, startDelay: 1, steps: [] };
let storyStepListener = null;
const findChar = id => capys.find(c => c.tag === id);
const storyRunner = createStoryRunner({
  char: findChar,
  allChars: () => capys,
  claim: c => { lastPerformer = c; c.story = true; if (c.state !== 'move') { c.path = null; c.state = 'act'; c.timer = 1e9; } },
  release: c => { if (c.story) { c.story = false; c.state = 'idle'; } },
  play: (c, name, o) => play(c, name, o),
  walk: (c, s) => {
    const p = c.root.position;
    let pts = null;
    if (s.route) { const r = (zones.routes || []).find(r => r.name === s.route); if (r?.points?.length) pts = r.loop ? [...r.points, r.points[0]] : r.points.slice(); }
    else if (s.spot != null && zones.spots?.[s.spot]) pts = [[zones.spots[s.spot].x, zones.spots[s.spot].z]];
    else if (Array.isArray(s.to)) pts = [s.to];
    if (!pts) return false;
    let x = p.x, z = p.z; const full = [[x, z]];
    for (const [px, pz] of pts) { const leg = nav.path(x, z, px, pz) || [[x, z], [px, pz]]; full.push(...leg.slice(1)); x = px; z = pz; }
    return startMove(c, full, pts[pts.length - 1], 'story');
  },
  place: (c, s) => {
    const sp = s.spot != null ? zones.spots?.[s.spot] : null;
    const at = sp ? [sp.x, sp.z] : Array.isArray(s.at) ? s.at : null;
    if (at) c.root.position.set(at[0], nav.height(at[0], at[1]), at[1]);
    if (s.turn != null) c.root.rotation.y = THREE.MathUtils.degToRad(s.turn);
    c.path = null; c.state = 'act'; c.timer = 1e9; play(c, 'idle');
  },
  setVisible: (c, on) => { c.enabled = on; c.root.visible = on; },
  outfit: (c, image) => setOutfit(c, image === 'drawing' ? opts.drawingUrl?.(c.tag) : image ? `${WORLD}/${image}` : null),
  caption: t => ui.caption(t),
  cameraTo: step => cameraTo(step),
  url: name => `${WORLD}/${name}`,
  reset: () => {},
  onStep: i => storyStepListener?.(i)
});
let envGroup = null, stageBackground = null;
// GLB environments come in any units/orientation: scale, turn and lift them
function applyEnvTransform(t = {}) {
  if (!envGroup || envMode !== 'glb') return;
  envGroup.scale.setScalar(t.scale || 1);
  envGroup.rotation.y = THREE.MathUtils.degToRad(t.rotY || 0);
  envGroup.position.set(t.x || 0, t.y || 0, t.z || 0);
  envGroup.updateMatrixWorld(true);
  hf = buildHeightField(envGroup);
}
let editorHandle = null;
async function boot() {
  await renderer.init();
  if (destroyed) return;
  const sceneInfo = await (await fetch(`${WORLD}/scene.json`)).json(); sceneInfoRef = sceneInfo;
  sceneInfo.files = sceneInfo.files || {};
  try { const r = await fetch(`${WORLD}/layout.json`); if (r.ok) L = deepMerge(L, await r.json()); } catch { }
  const msf = sceneInfo.metric_scale_factor || 1;
  if (!L._scaled) { // Marble API worlds: OpenCV axes (y down), metric scale, ground offset
    const flip = sceneInfo.up === '-y';
    L.splat.flip = flip; L.splat.scale *= msf;
    L.splat.y += (flip ? 1 : -1) * (sceneInfo.ground_plane_offset || 0) * msf; L._scaled = true;
  }
  // scene content: zones.json from the editor, else the traced pool from pool.json
  try {
    const r = await fetch(`${WORLD}/zones.json`);
    if (r.ok) zones = deepMerge(structuredClone(ZONE_DEFAULTS), await r.json());
    else {
      const p = await fetch(`${WORLD}/pool.json`);
      if (p.ok) { const pj = await p.json(); zones.water.y = pj.water_y; zones.water.polygon = pj.polygon_xz; }
      if (L.pool?.opacity != null) zones.water.opacity = L.pool.opacity;
      zones.water.steam.amount = L.look.steam ?? zones.water.steam.amount;
    }
  } catch { }

  const sky = sceneInfo.files.pano
    ? await new THREE.TextureLoader().loadAsync(`${WORLD}/${sceneInfo.files.pano}`).then(t => { t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t; })
    : gradientSky();
  scene.background = sky; scene.environment = sky;
  applyLayout();

  say('Loading the scene…');
  const mode = Q.get('backdrop') || (sceneInfo.environment === 'stage' ? 'stage' : sceneInfo.files.environment ? 'glb' : sceneInfo.files.backdrop ? 'depth' : 'splat');
  envMode = mode;
  if (mode === 'stage') {
    const st = buildStage(sceneInfo.stage); scene.add(st.group); envGroup = st.group; stageBackground = st.background;
    if (!sceneInfo.files.pano) scene.background = new THREE.Color(st.background);
    hf = buildHeightField(st.group);
  } else if (mode === 'glb') {
    const g = await loader.loadAsync(`${WORLD}/${sceneInfo.files.environment}`);
    envGroup = new THREE.Group(); envGroup.name = 'environment'; envGroup.add(g.scene); scene.add(envGroup);
    applyEnvTransform(sceneInfo.environmentTransform);
  }
  let splatPromise = Promise.resolve(0);
  if (mode === 'depth') {
    const bd = await loadDepthBackdrop(`${WORLD}/${sceneInfo.files.backdrop}`, { phone: IS_PHONE });
    backdropMeta = bd.meta; scene.add(bd.group); bdGroup = bd.group;
    hf = buildHeightField(bd.front); // capybaras stand on the image's own ground
    if (Q.get('parallax') == null && L.camera.parallax > 0.15) L.camera.parallax = 0.15;
  }
  setupHero();
  setView(Q.get('camera') === 'orbit' || L.camera.mode === 'orbit' ? 'free' : 'hero');
  if (mode === 'splat') {
    const set = pickSplatSet(sceneInfo.files);
    if (sceneInfo.files.splats?.['100k'] && !set.includes(sceneInfo.files.splats['100k'])) await loadSplats([sceneInfo.files.splats['100k']]);
    splatPromise = loadSplats(set);
  }
  if (mode === 'splat' && sceneInfo.files.collider) {
    try {
      const g = await loader.loadAsync(`${WORLD}/${sceneInfo.files.collider}`);
      g.scene.visible = false; splatRoot.add(g.scene); hf = buildHeightField(g.scene);
    } catch (e) { console.warn('collider', e); }
  }
  buildNav(); buildSnow();
  say('Bringing in the models…');
  let castList = null;
  try { const r = await fetch(`${WORLD}/cast.json`); if (r.ok) castList = (await r.json()).characters; } catch { }
  if (!Array.isArray(castList)) { castList = legacyList = legacyCast(); }
  await loadCast(castList);
  try { const r = await fetch(`${WORLD}/story.json`); if (r.ok) story = { ...story, ...(await r.json()) }; } catch { }
  const n = await splatPromise;
  console.log(`[hotspring] ${renderer.backend.isWebGLBackend ? 'WebGL fallback' : 'WebGPU'} · backdrop ${mode}${mode === 'splat' ? ` (${n} splats, ${splats.length} layers)` : ''} · ${active().length} models · nav ${nav.land.length} land / ${nav.water.length} water cells`);
  ui.loader.classList.add('done');
  if (!EDIT && story.autoplay && story.steps?.length) { ui.hint.remove(); setTimeout(() => storyRunner.play(story), (story.startDelay ?? 1) * 1000); }
  if (EDIT) {
    ui.hint.remove();
    const { initEditor } = await import('./editor.js');
    if (destroyed) return;
    editorHandle = initEditor({
      scene, camera, renderer, controls, world: WORLD, groundY, backdrop: mode, get tags() { return TAGS; },
      // cast + story
      castInfo: () => capys.map(c => ({ id: c.tag, name: c.ch.name || c.tag, clips: c.clipNames, meshes: c.meshNames, outfit: c.outfit.length })),
      getCast: () => structuredClone(cast),
      setCast: list => { legacyList = null; return loadCast(structuredClone(list)); },
      castName: id => { const n = cast.find(ch => ch.id === id)?.name || id; return capys.find(c => c.tag === id)?.placeholder ? `${n} (stand-in)` : n; },
      tryOutfit: (id, url) => setOutfit(capys.find(c => c.tag === id), url),
      getStory: () => structuredClone(story),
      setStory: st => { story = structuredClone(st); },
      playStory: from => storyRunner.play(story, { from }),
      stopStory: () => { storyRunner.stop(); setView('free'); },
      storyRunning: () => storyRunner.running,
      onStoryStep: fn => { storyStepListener = fn; },
      previewCamera: step => cameraTo(step),
      cameraFeel: () => cameraFeel(),
      cameraOperators: () => Object.entries(OPERATORS).map(([k, o]) => [k, o.label]),
      sceneFiles: () => ({ mode: envMode, ...structuredClone(sceneInfoRef.files || {}) }),
      // change scene.json file references (null removes); reload = save all and reload the editor
      updateSceneFiles: async (patch, { reload = false } = {}) => {
        const info = sceneInfoRef; info.files = info.files || {};
        for (const [k, v] of Object.entries(patch.files || {})) { if (v === null) delete info.files[k]; else info.files[k] = v; }
        for (const [k, v] of Object.entries(patch.top || {})) { if (v === null) delete info[k]; else info[k] = v; }
        if (reload) await editorHandle.saveAll();
        const at = await putJSON('scene.json', info);
        if (reload) location.reload();
        return at;
      },
      clearSky: () => { const g = gradientSky(); scene.background = stageBackground ? new THREE.Color(stageBackground) : g; scene.environment = g; },
      reloadSplats: async () => { if (envMode === 'splat') return loadSplats(pickSplatSet(sceneInfoRef.files)); },
      envInfo: () => ({ mode: envMode, file: sceneInfoRef.files?.environment || null, transform: { scale: 1, rotY: 0, x: 0, y: 0, z: 0, ...(sceneInfoRef.environmentTransform || {}) } }),
      setEnvTransform: t => { sceneInfoRef.environmentTransform = { ...(sceneInfoRef.environmentTransform || {}), ...t }; applyEnvTransform(sceneInfoRef.environmentTransform); buildNav(); for (const c of capys) placeAtStart(c); },
      // switch environment: save everything, then reload so the new one loads cleanly
      setEnvironment: async kind => {
        const info = structuredClone(sceneInfoRef);
        info.files = info.files || {};
        if (kind.glb) { info.files.environment = kind.glb; delete info.environment; delete info.files.backdrop; delete info.files.splats; info.environmentTransform = info.environmentTransform || { scale: 1, rotY: 0, y: 0 }; }
        else if (kind.stage) { delete info.files.environment; info.environment = 'stage'; info.stage = info.stage || {}; }
        await editorHandle.saveAll();
        await putJSON('scene.json', info);
        location.reload();
      },
      charPos: id => findChar(id)?.root.position.toArray() ?? null,
      currentShot: () => ({ pos: camera.position.toArray().map(v => +v.toFixed(3)), target: (view === 'free' || view === 'top' ? controls.target : storyCam.target).toArray().map(v => +v.toFixed(3)), fov: +camera.fov.toFixed(1) }),
      navHeight: (x, z) => nav.height(x, z),
      getZones: () => structuredClone(zones), setZones,
      layout: () => L,
      applyLook: what => {
        applyLayout();
        if (what === 'snow') buildSnow();
        if (what === 'camera' && view === 'hero') setupHero();
      },
      view: () => view, setView,
      setShow: (k, on) => {
        if (k === 'grid') showGrid(on);
        if (k === 'paths') { if (on) { pathViz = new THREE.Group(); scene.add(pathViz); } else { scene.remove(pathViz); pathViz = null; } }
        if (k === 'pause') paused = on;
      },
      // capybaras
      capys: () => capys.map(c => ({ tag: c.tag, enabled: c.enabled, x: c.root.position.x, y: c.root.position.y, z: c.root.position.z, state: c.state, swimming: c.swimming })),
      capyAt,
      selectCapy: tag => { for (const c of capys) c.marker.visible = c.tag === tag; },
      holdCapy: (tag, on) => { const c = capys.find(q => q.tag === tag); if (c) { c.held = on; if (on) { c.path = null; c.state = 'idle'; play(c, 'idle'); } } },
      moveCapy: (tag, x, z) => {
        const c = capys.find(q => q.tag === tag); if (!c) return;
        c.root.position.set(x, nav.isWater(x, z) ? waterY() - c.h * zones.water.swimDepth : nav.height(x, z), z);
      },
      resetCapys: () => { for (const c of capys) c.goal = null; for (const c of active()) placeAtStart(c); },
      sendCapy: (tag, x, z) => { const c = capys.find(q => q.tag === tag); if (c) startMove(c, nav.path(c.root.position.x, c.root.position.z, x, z), [x, z]); },
      doCapy: (tag, what) => {
        const c = capys.find(q => q.tag === tag); if (!c) return;
        if (what === 'surprise') surprise(c);
        else if (what === 'route') followRoute(c);
        else if (what === 'nap') { c.state = 'act'; play(c, 'nap'); c.timer = 8; }
      },
      files: { backdropDir: sceneInfo.files.backdrop ? sceneInfo.files.backdrop.replace(/[^/]*$/, '') : null, pano: sceneInfo.files.pano || null },
      reloadBackdrop, reloadSky,
      importLayout: l => { L = deepMerge(L, l); applyLayout(); buildSnow(); if (view === 'hero') setupHero(); return L; },
      put: putFile,
      container,
      save: async () => {
        const a = await putJSON('zones.json', zones);
        if (view === 'free' && (envMode === 'splat' || envMode === 'depth')) { L.camera.pos = camera.position.toArray(); L.camera.target = controls.target.toArray(); }
        if (envMode === 'glb' || envMode === 'stage') await putJSON('scene.json', sceneInfoRef);
        await putJSON('layout.json', L);
        await putJSON('story.json', story);
        await putJSON('cast.json', { characters: cast.map(({ sizeFactor, ...ch }) => ({ ...ch, ...(sizeFactor && sizeFactor !== 1 && !ch.height ? { height: +(L.capy.height * sizeFactor).toFixed(3) } : {}) })) });
        return `Saved the scene at ${a}`;
      }
    });
  }
  if (destroyed) return;
  renderer.setAnimationLoop(frame);
}

function frame() {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();
  for (const c of capys) updateCapy(c, dt);
  updateSteam(dt); updateSnow(dt, t); updateRipples(dt); updatePathViz();
  if (view === 'hero') updateHero(dt, t); else if (view === 'story') updateStoryCam(dt); else controls.update();
  const shaken = applyHandheld(t);
  renderer.render(scene, camera);
  if (shaken) undoHandheld();
}

const ready = boot().catch(e => { console.error(e); say('Could not load the scene: ' + e.message); throw e; });
ready.catch(() => {});
globalThis.__scene = { THREE, renderer, scene, camera, controls, capys, groundY, get nav() { return nav; }, get zones() { return zones; }, get layout() { return L; } };

function destroy() {
  if (destroyed) return;
  destroyed = true;
  renderer.setAnimationLoop(null);
  storyRunner.stop();
  editorHandle?.dispose?.();
  for (const d of disposers.splice(0)) { try { d(); } catch { } }
  controls.dispose();
  scene.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) { o.geometry?.dispose?.(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => x?.dispose?.()); } });
  renderer.dispose();
  renderer.domElement.remove();
  ui.destroy();
  if (globalThis.__scene?.renderer === renderer) delete globalThis.__scene;
}

return {
  ready, destroy,
  playStory: () => storyRunner.play(story),
  stopStory: () => storyRunner.stop(),
  setOutfit: (id, url) => setOutfit(findChar(id), url)
};
}
