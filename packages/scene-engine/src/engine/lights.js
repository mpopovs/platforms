// Scene lighting: mood (sky, sun, picture tint) and placed lights.
//
// layout.json
//   look: { exposure, ambient, skyColor, groundColor,            sky light (hemisphere)
//           sun, sunColor, sunAz, sunElev,                        sun; sunAz 0 = behind the viewer,
//                                                                 90 = from the right, 180 = backlight
//           pictureTint, pictureBrightness,                       2.5D picture / backdrop colour
//           warmIntensity, warmLight }                            legacy window glow
//   lights: [{ id, name, type: 'spot' | 'lamp', on, color, intensity, pos: [x,y,z],
//              aim: [x,y,z] (spot), beam (deg), soft (0..1), reach (m), shadow,
//              anim: { kind: 'none'|'pulse'|'flicker'|'sweep'|'rainbow'|'follow', speed, amount, who } }]
//
// Story (runtime only, never saved):
//   { "do": "light", "mood": "night", "seconds": 3 }
//   { "do": "light", "light": "<id>" | "all", "on": true, "color": "#ff4f9a", "intensity": 80, "seconds": 1 }

import * as THREE from 'three/webgpu';

export const MOODS = {
  day: { label: 'Day', look: { exposure: 1, ambient: 1.6, skyColor: '#e3ebf5', groundColor: '#8d939c', sun: 1.4, sunColor: '#fff6e8', sunAz: -40, sunElev: 55, pictureTint: '#ffffff', pictureBrightness: 1, fog: '#cdd6e0', warmIntensity: 0 } },
  golden: { label: 'Golden hour', look: { exposure: 1.05, ambient: 0.9, skyColor: '#ffd9a8', groundColor: '#6b5a4a', sun: 2.2, sunColor: '#ffb35c', sunAz: -70, sunElev: 12, pictureTint: '#ffe0b8', pictureBrightness: 1, fog: '#e8c39a', warmIntensity: 4 } },
  blue: { label: 'Blue hour', look: { exposure: 1, ambient: 0.7, skyColor: '#7d93c9', groundColor: '#2c3346', sun: 0.35, sunColor: '#9fb4ff', sunAz: 160, sunElev: 6, pictureTint: '#a4b5e6', pictureBrightness: 0.78, fog: '#5f7090', warmIntensity: 8 } },
  night: { label: 'Night', look: { exposure: 1.1, ambient: 0.25, skyColor: '#4a5a8c', groundColor: '#141822', sun: 0.18, sunColor: '#8fa6ff', sunAz: 40, sunElev: 40, pictureTint: '#6274ab', pictureBrightness: 0.48, fog: '#141a2a', warmIntensity: 10 } },
  show: { label: 'Show', look: { exposure: 1.1, ambient: 0.18, skyColor: '#5a4a7a', groundColor: '#120f18', sun: 0, sunColor: '#ffffff', sunAz: 0, sunElev: 60, pictureTint: '#7a6a9a', pictureBrightness: 0.55, fog: '#120f18', warmIntensity: 0 } },
  studio: { label: 'Studio', look: { exposure: 1, ambient: 1.25, skyColor: '#ffffff', groundColor: '#b9b9b9', sun: 1.1, sunColor: '#ffffff', sunAz: -25, sunElev: 60, pictureTint: '#ffffff', pictureBrightness: 1, fog: '#d9dde2', warmIntensity: 0 } }
};
const MOOD_KEYS = ['exposure', 'ambient', 'skyColor', 'groundColor', 'sun', 'sunColor', 'sunAz', 'sunElev', 'pictureTint', 'pictureBrightness', 'fog', 'warmIntensity'];
const LOOK_DEFAULTS = { exposure: 1, ambient: 1.6, skyColor: '#e3ebf5', groundColor: '#8d939c', sun: 1.4, sunColor: '#eef3ff', pictureTint: '#ffffff', pictureBrightness: 1, warmIntensity: 6 };
export const ANIMS = [['none', 'Steady'], ['pulse', 'Pulse (breathes)'], ['flicker', 'Flicker (candle / fire)'], ['sweep', 'Sweep (spot swings)'], ['rainbow', 'Colour cycle'], ['follow', 'Follow a model (spot)']];

let nextId = 1;
export const newLightId = () => `light_${Date.now().toString(36)}_${nextId++}`;

export function createLighting({ scene, camera, renderer, hemi, key, warm, getL, getHero, edit, getBackdrop, findChar, getPerformer }) {
  scene.add(key.target);
  const group = new THREE.Group(); group.name = 'lights'; scene.add(group);
  const helpers = new THREE.Group(); helpers.name = 'light-helpers'; helpers.visible = edit; scene.add(helpers);
  const items = new Map(); // id -> { light, target, bulb, aimDot, cone }
  const rt = { lights: new Map(), mood: null }; // story overrides
  let shadowsOn = false, shadowScan = 0, selectedId = null;
  const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();

  // ------------------------------------------------ mood (with story fades)
  function look(k) {
    const L = getL(), base = L.look[k] ?? LOOK_DEFAULTS[k];
    const m = rt.mood; if (!m || !(k in m.to)) return base;
    const from = m.from[k] ?? base, w = m.w;
    if (typeof from === 'string' || typeof m.to[k] === 'string') return '#' + _c.set(from).lerp(_c2.set(m.to[k]), w).getHexString();
    if (k === 'sunAz') { const d = ((m.to[k] - from + 540) % 360) - 180; return from + d * w; }
    return from + (m.to[k] - from) * w;
  }
  function applyMood() {
    const L = getL(), legacySun = L.look.sunAz == null && !rt.mood;
    renderer.toneMappingExposure = look('exposure');
    hemi.intensity = look('ambient'); hemi.color.set(look('skyColor')); hemi.groundColor.set(look('groundColor'));
    key.intensity = look('sun'); key.color.set(look('sunColor'));
    const hero = getHero();
    _f.copy(hero.dir); _f.y = 0; if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1); _f.normalize();
    _r.set(-_f.z, 0, _f.x);
    const centre = _v.copy(hero.base).addScaledVector(_f, 6);
    key.target.position.copy(centre);
    if (legacySun) key.position.set(-6, 9, 4);
    else {
      const az = THREE.MathUtils.degToRad(look('sunAz') ?? -40), el = THREE.MathUtils.degToRad(look('sunElev') ?? 55), D = 20;
      key.position.copy(centre).addScaledVector(_f, -Math.cos(az) * Math.cos(el) * D).addScaledVector(_r, Math.sin(az) * Math.cos(el) * D);
      key.position.y = centre.y + Math.sin(el) * D;
    }
    warm.intensity = look('warmIntensity');
    if (scene.fog && (L.look.fog || rt.mood)) scene.fog.color.set(look('fog') ?? L.look.fog);
    const tint = _c.set(look('pictureTint')).multiplyScalar(look('pictureBrightness'));
    for (const m of getBackdrop()) { m.material.color.copy(tint); }
  }

  // ------------------------------------------------ placed lights
  const bulbGeo = new THREE.SphereGeometry(0.09, 16, 10), dotGeo = new THREE.SphereGeometry(0.06, 12, 8);
  function build() {
    for (const it of items.values()) { it.light.dispose?.(); it.bulb.material.dispose(); it.aimDot?.material.dispose(); it.cone?.geometry.dispose(); it.cone?.material.dispose(); }
    items.clear(); group.clear(); helpers.clear();
    const list = getL().lights || [];
    const was = shadowsOn;
    shadowsOn = list.some(l => l.shadow && l.on !== false && l.type === 'spot');
    renderer.shadowMap.enabled = shadowsOn;
    if (was !== shadowsOn) scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    for (const l of list) {
      const spot = l.type === 'spot';
      const light = spot ? new THREE.SpotLight(l.color || '#ffffff', 0, l.reach ?? 14, THREE.MathUtils.degToRad(l.beam ?? 22), l.soft ?? 0.45, 1.6)
        : new THREE.PointLight(l.color || '#ffd6a0', 0, l.reach ?? 8, 1.6);
      if (spot && l.shadow) { light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -0.0005; }
      group.add(light); if (spot) group.add(light.target);
      const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicNodeMaterial({ color: l.color || '#ffffff', depthTest: false, transparent: true, opacity: 0.95, fog: false, toneMapped: false }));
      bulb.renderOrder = 120; bulb.userData.light = l.id; helpers.add(bulb);
      let aimDot = null, cone = null;
      if (spot) {
        aimDot = new THREE.Mesh(dotGeo, new THREE.MeshBasicNodeMaterial({ color: l.color || '#ffffff', depthTest: false, transparent: true, opacity: 0.8, fog: false, toneMapped: false }));
        aimDot.renderOrder = 120; aimDot.userData.light = l.id; aimDot.userData.aim = true; helpers.add(aimDot);
        cone = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicNodeMaterial({ color: l.color || '#ffffff', transparent: true, opacity: 0.55, depthTest: false, fog: false, toneMapped: false }));
        cone.renderOrder = 119; cone.frustumCulled = false; helpers.add(cone);
      }
      items.set(l.id, { l, light, bulb, aimDot, cone });
    }
  }
  const coneGeom = (it, from, to) => {
    const ang = it.light.angle, len = from.distanceTo(to), rad = Math.tan(ang) * len, N = 16, pts = [];
    const dir = _v.copy(to).sub(from).normalize(), u = new THREE.Vector3(0, 1, 0);
    if (Math.abs(dir.y) > 0.95) u.set(1, 0, 0);
    const a = new THREE.Vector3().crossVectors(dir, u).normalize(), b = new THREE.Vector3().crossVectors(dir, a);
    const ring = i => to.clone().addScaledVector(a, Math.cos(i / N * Math.PI * 2) * rad).addScaledVector(b, Math.sin(i / N * Math.PI * 2) * rad);
    for (let i = 0; i < N; i++) { pts.push(ring(i), ring(i + 1)); if (i % 4 === 0) pts.push(from.clone(), ring(i)); }
    it.cone.geometry.setFromPoints(pts);
  };
  function noise(t, s) { return (Math.sin(t * 7.3 + s) * 0.5 + Math.sin(t * 13.1 + s * 2) * 0.3 + Math.sin(t * 23.7 + s * 3) * 0.2); }
  function update(t, dt) {
    if (rt.mood && rt.mood.w < 1) rt.mood.w = Math.min(1, rt.mood.w + dt / Math.max(0.001, rt.mood.dur));
    applyMood();
    const list = getL().lights || [];
    for (const l of list) {
      const it = items.get(l.id); if (!it) continue;
      const o = rt.lights.get(l.id);
      if (o && o.w < 1) o.w = Math.min(1, o.w + dt / Math.max(0.001, o.dur));
      const e = o ? o.w : 1;
      // on/off and strength (story can fade them)
      const onBase = l.on !== false ? 1 : 0, onTo = o?.on != null ? (o.on ? 1 : 0) : onBase, onFrom = o?.fromOn ?? onBase;
      const baseI = l.intensity ?? (l.type === 'spot' ? 60 : 15);
      const iTo = o?.intensity ?? baseI, iFrom = o?.fromI ?? baseI;
      let I = (iFrom + (iTo - iFrom) * e) * (onFrom + (onTo - onFrom) * e);
      _c.set(l.color || '#ffffff'); if (o?.color) _c.lerpColors(_c2.set(o.fromColor || l.color || '#ffffff'), new THREE.Color(o.color), e);
      const a = l.anim || {}, sp = a.speed ?? 1, am = a.amount ?? 0.5, seed = l.id.length * 1.7;
      if (a.kind === 'pulse') I *= 1 - am * 0.5 * (1 + Math.sin(t * sp * 2));
      if (a.kind === 'flicker') I *= Math.max(0.05, 1 - am * 0.6 * (0.5 + 0.5 * noise(t * sp, seed)));
      if (a.kind === 'rainbow') _c.offsetHSL(((t * sp * 0.08) % 1), 0, 0);
      it.light.intensity = I; it.light.color.copy(_c);
      it.light.position.fromArray(l.pos || [0, 3, 0]);
      if (it.light.isSpotLight) {
        it.light.distance = l.reach ?? 14; it.light.angle = THREE.MathUtils.degToRad(l.beam ?? 22); it.light.penumbra = l.soft ?? 0.45;
        const aim = it.light.target.position.fromArray(l.aim || [0, 0, 0]);
        if (a.kind === 'sweep') {
          const from = it.light.position, d = _v.copy(aim).sub(from); const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
          aim.addScaledVector(side, Math.sin(t * sp * 0.9 + seed) * am * 3);
        }
        if (a.kind === 'follow') {
          const c = a.who && a.who !== 'auto' ? findChar(a.who) : getPerformer();
          if (c?.root?.visible !== false && c) { aim.copy(c.root.position); aim.y += (c.h || 1.6) * 0.5; }
        }
        it.light.target.updateMatrixWorld();
      } else it.light.distance = l.reach ?? 8;
      // editor helpers
      it.bulb.position.copy(it.light.position); it.bulb.material.color.copy(_c); it.bulb.material.opacity = l.on === false ? 0.35 : 0.95;
      if (it.aimDot) {
        const selOn = l.id === selectedId; it.aimDot.visible = it.cone.visible = selOn; // beam outline only for the selected spot
        if (selOn) { it.aimDot.position.fromArray(l.aim || [0, 0, 0]); it.aimDot.material.color.copy(_c); coneGeom(it, it.light.position, it.light.target.position); }
      }
    }
    if (shadowsOn && (shadowScan -= dt) <= 0) { // new models / objects get shadows too
      shadowScan = 2;
      scene.traverse(o => { if (o.isMesh && !o.material?.isMeshBasicNodeMaterial && !o.material?.isMeshBasicMaterial) { o.castShadow = true; o.receiveShadow = true; } });
    }
  }

  return {
    build, update, applyMood, helpers,
    showHelpers: (on, sel = null) => { helpers.visible = on; selectedId = sel; },
    // story
    mood(name, seconds = 2) {
      const p = MOODS[name]; if (!p) return;
      const from = {}; for (const k of MOOD_KEYS) from[k] = look(k);
      rt.mood = { from, to: p.look, w: seconds > 0 ? 0 : 1, dur: seconds };
    },
    light(s) {
      const ids = s.light === 'all' || !s.light ? (getL().lights || []).map(l => l.id) : [s.light];
      for (const id of ids) {
        const l = (getL().lights || []).find(q => q.id === id); if (!l) continue;
        const prev = rt.lights.get(id), it = items.get(id);
        rt.lights.set(id, {
          fromOn: prev ? (prev.on != null ? (prev.on ? 1 : 0) : (l.on !== false ? 1 : 0)) : (l.on !== false ? 1 : 0),
          on: s.on ?? prev?.on, fromI: prev?.intensity ?? l.intensity ?? (l.type === 'spot' ? 60 : 15), intensity: s.intensity ?? prev?.intensity,
          fromColor: it ? '#' + it.light.color.getHexString() : l.color, color: s.color ?? prev?.color, w: (s.seconds ?? 0) > 0 ? 0 : 1, dur: s.seconds ?? 0
        });
      }
    },
    reset() { rt.lights.clear(); rt.mood = null; },
    // editor
    objectFor: (id, aim) => { const it = items.get(id); return it ? (aim ? it.aimDot : it.bulb) : null; },
    pick: raycaster => { const hit = raycaster.intersectObjects(helpers.children.filter(o => o.isMesh), false)[0]; return hit ? { id: hit.object.userData.light, aim: !!hit.object.userData.aim } : null; }
  };
}
