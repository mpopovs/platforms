// Scene editor (open the page with ?edit=1). Controls everything in the scene:
//   Draw     walk areas, terraces, blocked areas, spots (start / rest / water entry), layers list
//   Water    edge, level, colour, opacity, ripples, steam, how deep capybaras swim
//   Capys    on/off, size, speed, start spot, route, behaviour mix, drag them, send them somewhere
//   Routes   walking routes they follow
//   Objects  uploaded GLB objects and small props: move / turn / size with handles
//   Lights   mood, sun, sky, picture tint, spotlights and lamps (with handles)
//   Look     camera parallax, light, snow, fog, colour grade
// One Save writes zones.json (scene content) and layout.json (look) into the world folder.

import * as THREE from 'three/webgpu';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { polyContains, polyCentroid } from './nav.js';
import { encodeGray16, decodePNG } from './png16.js';
import { STEP_TYPES } from './story.js';
import { DEFAULT_FIT } from './picture.js';
import { LAYERS_DEFAULT_CAMERA } from './layers.js';
import { MOODS, ANIMS, newLightId } from './lights.js';

const COLORS = { water: 0x38c8ff, walk: 0x5dff86, terrace: 0xffc94a, blocked: 0xff4f5e, start: 0xffffff, rest: 0xffe066, entry: 0x38c8ff, route: 0xff6fd8, prop: 0xff9a3c, capy: 0xffe066 };
const BEHAVIOUR = [['walk', 'Walk around'], ['swim', 'Swim'], ['soak', 'Soak (sit in water)'], ['rest', 'Rest / graze'], ['nap', 'Nap'], ['surprise', 'Surprise move'], ['route', 'Walk a route']];
const NICE = { baby: 'Baby', explorer_boy: 'Explorer boy', four_legged: 'Four-legged', girl_child: 'Girl child', mother: 'Mother', sporty_boy: 'Sporty boy', teen_girl_be: 'Teen girl (beanie)', teen_girl_ho: 'Teen girl (hoodie)' };
const HINT = {
  select: 'Click to select. Drag dots to move them, small dots add a corner, Option-click deletes one. Drag models to move them.',
  draw: 'Click corners on the ground. Finish with the button above (or Enter / double-click). Esc cancels.',
  route: 'Click on the ground to add route points in walking order. Enter or double-click finishes, Esc cancels.',
  spot: 'Click on the ground to place the spot.',
  prop: 'Click on the ground to place it. Drag it later in Select mode.',
  send: 'Click on the ground: the selected model walks (or swims) there.'
};

export function initEditor(ctx) {
  const { scene, camera, renderer, controls } = ctx;
  const L = ctx.layout();
  let zones = ctx.getZones();
  let tab = (ctx.startHint === 'picture' && ctx.backdrop !== 'depth') || (ctx.startHint === 'layers' && ctx.backdrop !== 'layers') || ctx.backdrop === 'layers' ? 'files' : 'draw', tool = 'select', drawKind = null, spotType = null, propType = null;
  let draft = [], sel = null, drag = null, capySel = null;
  const undo = [];
  let story = ctx.getStory();
  let ldef = ctx.layers?.() || null; // layered 2.5D (layers.json), when the scene uses it
  const snapshot = () => { undo.push(JSON.stringify({ zones, look: L, story, layers: ldef })); if (undo.length > 80) undo.shift(); };

  // ============================================================ panel
  const css = document.createElement('style');
  css.textContent = `
  #ed{position:fixed;left:12px;top:12px;width:330px;max-height:calc(100vh - 24px);display:flex;flex-direction:column;background:rgba(20,26,34,.92);color:#e8eef5;
      font:12.5px/1.35 system-ui,sans-serif;border-radius:12px;z-index:20;box-shadow:0 6px 24px rgba(0,0,0,.3)}
  #ed .tabs{display:flex;gap:2px;padding:8px 8px 0}
  #ed .tabs{flex-wrap:wrap} #ed .tabs button{flex:1 1 18%;min-width:0;background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;padding:5px 1px;font-size:11.5px;color:#9fb2c6;font-weight:600}
  #ed .tabs button.on{color:#fff;border-bottom-color:#5b8fc0;background:transparent}
  #ed .body{overflow:auto;padding:4px 12px 8px;flex:1}
  #ed .foot{border-top:1px solid #2f3b4a;padding:8px 12px;display:flex;flex-direction:column;gap:6px}
  #ed h3{margin:12px 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9fb2c6}
  #ed .row{display:flex;flex-wrap:wrap;gap:5px}
  #ed button{flex:1 1 auto;background:#2b3644;color:#e8eef5;border:1px solid #3c4a5c;border-radius:7px;padding:5px 7px;font:inherit;cursor:pointer;white-space:nowrap}
  #ed button:hover{background:#354357} #ed button.on{background:#3d6b96;border-color:#5b8fc0}
  #ed button.save{background:#2f7d4f;border-color:#3f9a64;font-weight:600} #ed button.warn{background:#6b2f37;border-color:#8a3c46}
  #ed button.mini{flex:0 0 auto;padding:2px 7px}
  #ed .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}
  #ed .ctl{display:grid;grid-template-columns:110px 1fr 42px;align-items:center;gap:6px;margin:4px 0}
  #ed .ctl.c2{grid-template-columns:110px 1fr}
  #ed .ctl span.v{text-align:right;color:#b8c6d4;font-variant-numeric:tabular-nums}
  #ed input[type=range]{width:100%;accent-color:#5b8fc0}
  #ed input[type=text],#ed input[type=number],#ed select{width:100%;box-sizing:border-box;background:#1b222c;color:#e8eef5;border:1px solid #3c4a5c;border-radius:6px;padding:3px 5px;font:inherit}
  #ed input[type=color]{width:100%;height:24px;background:none;border:1px solid #3c4a5c;border-radius:6px;padding:0}
  #ed .list{display:flex;flex-direction:column;gap:3px}
  #ed .item{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;background:#222b37;cursor:pointer}
  #ed .item.on{background:#33506e} #ed .item .grow{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #ed .muted{color:#8a9bb0} #ed .hint{color:#9fb2c6;font-size:11.5px} #ed .msg{color:#8fe3a8;min-height:1.2em}
  #ed-banner{position:fixed;left:50%;top:14px;transform:translateX(-50%);display:none;align-items:center;gap:10px;padding:8px 10px 8px 16px;border-radius:12px;
      background:rgba(20,26,34,.94);color:#fff;font:13px/1.35 system-ui,sans-serif;z-index:25;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:min(760px,calc(100vw - 380px))}
  #ed-banner.on{display:flex} #ed-banner b{color:#8fe3a8} #ed-banner .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
  #ed-banner button{background:#2b3644;color:#e8eef5;border:1px solid #3c4a5c;border-radius:7px;padding:5px 10px;font:inherit;cursor:pointer;white-space:nowrap}
  #ed-banner button.go{background:#2f7d4f;border-color:#3f9a64;font-weight:600} #ed-banner button:disabled{opacity:.45;cursor:default}
  #ed .card{background:#1a2230;border:1px solid #2f3b4a;border-radius:8px;padding:8px;margin-top:6px}`;
  document.head.appendChild(css);
  const disposers = [() => css.remove()];
  const el = document.createElement('div'); el.id = 'ed';
  el.innerHTML = `<div class="tabs">${[['draw', 'Draw'], ['water', 'Water'], ['capys', 'Models'], ['routes', 'Routes'], ['objects', 'Objects'], ['lights', 'Lights'], ['story', 'Story'], ['look', 'Look'], ['files', 'Files']].map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="body"></div>
    <div class="foot"><div class="hint"></div><div class="row"><button data-a="undo">Undo</button><button data-a="save" class="save">Save scene</button></div><div class="msg"></div></div>`;
  (ctx.container || document.body).appendChild(el);
  // step-by-step bar over the scene while drawing or placing something
  const banner = document.createElement('div'); banner.id = 'ed-banner';
  (ctx.container || document.body).appendChild(banner);
  disposers.push(() => banner.remove());
  ['pointerdown', 'pointerup', 'dblclick'].forEach(ev => banner.addEventListener(ev, e => e.stopPropagation()));
  disposers.push(() => el.remove());
  const body = el.querySelector('.body');
  const msg = t => { el.querySelector('.msg').textContent = t; };
  ['pointerdown', 'pointerup', 'wheel', 'dblclick'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));

  // ---------- small control builders
  const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); } kids.flat().forEach(k => e.append(k?.nodeType ? k : document.createTextNode(k ?? ''))); return e; };
  const heading = t => h('h3', {}, t);
  const btn = (label, fn, { on = false, cls = '', dot } = {}) => { const b = h('button', { class: (on ? 'on ' : '') + cls }, dot != null ? h('span', { class: 'dot', style: `background:#${dot.toString(16).padStart(6, '0')}` }) : '', label); b.onclick = () => { fn(); refresh(); }; return b; };
  const row = (...kids) => h('div', { class: 'row' }, ...kids);
  let editingKey = null; // one undo step per slider drag
  function slider(label, get, set, min, max, step, scope, fmt = v => (+v).toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0)) {
    const v = h('span', { class: 'v' }, fmt(get()));
    const i = h('input', { type: 'range', min, max, step, value: get() });
    i.addEventListener('input', () => { if (editingKey !== label) { snapshot(); editingKey = label; } set(+i.value); v.textContent = fmt(i.value); apply(scope); cue(label, fmt(i.value)); });
    i.addEventListener('change', () => { editingKey = null; });
    return h('div', { class: 'ctl' }, h('span', {}, label), i, v);
  }
  function colorCtl(label, get, set, scope) {
    const i = h('input', { type: 'color', value: get() });
    i.addEventListener('input', () => { if (editingKey !== label) { snapshot(); editingKey = label; } set(i.value); apply(scope); });
    i.addEventListener('change', () => { editingKey = null; });
    return h('div', { class: 'ctl c2' }, h('span', {}, label), i);
  }
  function checkCtl(label, get, set, scope) {
    const i = h('input', { type: 'checkbox' }); i.checked = !!get();
    i.addEventListener('change', () => { snapshot(); set(i.checked); apply(scope); refresh(); });
    return h('label', { class: 'ctl c2' }, h('span', {}, label), h('span', {}, i));
  }
  function selectCtl(label, options, get, set, scope) {
    const s = h('select', {}, options.map(([v, t]) => { const o = h('option', { value: v }, t); if (String(get()) === String(v)) o.selected = true; return o; }));
    s.addEventListener('change', () => { snapshot(); set(s.value); apply(scope); refresh(); });
    return h('div', { class: 'ctl c2' }, h('span', {}, label), s);
  }
  function textCtl(label, get, set) {
    const i = h('input', { type: 'text', value: get() || '' });
    i.addEventListener('change', () => { snapshot(); set(i.value); apply('data'); refresh(); });
    return h('div', { class: 'ctl c2' }, h('span', {}, label), i);
  }
  // push changes into the scene; scope decides how much has to be rebuilt
  function apply(scope) {
    if (scope === 'none') return;
    if (scope === 'layers') { ctx.setLayers(ldef); msg('Unsaved changes'); return; }
    if (scope === 'look' || scope === 'snow' || scope === 'camera') ctx.applyLook(scope);
    else ctx.setZones(structuredClone(zones), scope);
    redraw(); msg('Unsaved changes');
    if (scope === 'props' || scope === 'nav' || scope === 'all') queueMicrotask(attachGizmo); // objects were rebuilt
  }

  function updateBanner() {
    const active = ['draw', 'route', 'spot', 'prop', 'send'].includes(tool);
    banner.classList.toggle('on', active);
    if (!active) return;
    banner.innerHTML = '';
    const area = AREA_TYPES.find(a => a[0] === drawKind);
    let title = '', needed = 0;
    if (tool === 'draw') { title = `${redrawTarget ? 'Redrawing' : 'Drawing'} ${area ? area[1].toLowerCase() : 'area'}: click on the ground to add corners (${draft.length} so far).`; needed = 3; }
    else if (tool === 'route') { title = `Drawing a route: click points in walking order (${draft.length} so far).`; needed = 2; }
    else if (tool === 'spot') title = `Click on the ground to place the ${(SPOT_TYPES.find(s => s[0] === spotType)?.[1] || 'spot').toLowerCase()}.`;
    else if (tool === 'prop') title = 'Click on the ground to place it.';
    else if (tool === 'send') title = 'Click on the ground: the selected model walks there.';
    const color = tool === 'draw' ? area?.[2] : tool === 'route' ? COLORS.route : tool === 'spot' ? COLORS[spotType] : null;
    banner.append(h('span', {}, color != null ? h('span', { class: 'dot', style: `background:${hex(color)}` }) : '', title));
    if (needed) {
      const fin = h('button', { class: 'go' }, 'Finish'); fin.disabled = draft.length < needed; fin.onclick = finishDraw;
      const un = h('button', {}, 'Undo corner'); un.disabled = !draft.length; un.onclick = undoCorner;
      banner.append(un, fin);
    }
    const cancel = h('button', {}, 'Cancel'); cancel.onclick = cancelTool; banner.append(cancel);
  }

  // ============================================================ tabs
  function refresh() {
    updateBanner();
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    el.querySelector('.hint').textContent = HINT[tool] || '';
    body.innerHTML = '';
    ({ draw: tabDraw, water: tabWater, capys: tabCapys, routes: tabRoutes, objects: tabObjects, lights: tabLights, story: tabStory, look: tabLook, files: tabFiles })[tab]();
    queueMicrotask(attachGizmo);
    ctx.showLightHelpers(tab === 'lights', sel?.kind === 'light' ? sel.id : null);
  }
  el.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; refresh(); } });
  el.querySelector('[data-a=undo]').onclick = doUndo;
  el.querySelector('[data-a=save]').onclick = save;
  let redrawTarget = null; // an existing area being redrawn
  const setTool = (t, extra = {}) => {
    tool = t; draft = []; Object.assign(toolOpts, extra); redrawTarget = extra.redrawTarget ?? null;
    drawKind = extra.drawKind ?? drawKind; spotType = extra.spotType ?? spotType; propType = extra.propType ?? propType;
    if ((t === 'draw' || t === 'route') && ctx.view() === 'hero') ctx.setView('top'); // drawing is easiest from above
    redraw(); refresh();
  };
  const cancelTool = () => { draft = []; tool = 'select'; redrawTarget = null; redraw(); refresh(); };
  const undoCorner = () => { draft.pop(); redraw(); updateBanner(); };
  const toolOpts = {};
  const viewRow = () => [heading('View'), row(...[['hero', 'Hero'], ['top', 'Top'], ['free', 'Free']].map(([v, t]) => btn(t, () => { ctx.setView(v); redraw(); }, { on: ctx.view() === v })),
    btn(ctx.live().on ? '■ Live motion' : '▶ Live motion', () => {
      const on = !ctx.live().on; ctx.setLive(on); if (on && ctx.view() !== 'hero') { ctx.setView('hero'); redraw(); }
      msg(on ? 'Live motion: the camera moves as viewers will see it (parallax, sway, breathing, snow). Turn off to edit in a still view.' : 'Live motion off: still camera for editing.');
    }, { on: ctx.live().on }))];

  // ---------- visual cues: show what a setting does while you change it
  const CAMERA_CUES = new Set(['Parallax (m)', 'Drift (m)', 'Handheld sway', 'Tilt in sway', 'Sway speed', 'Breathing (m)', 'Breath length (s)']);
  const CUE_TEXT = {
    'Parallax (m)': 'how far the camera slides when the viewer moves the mouse or tilts the phone',
    'Drift (m)': 'slow sideways float on its own',
    'Handheld sway': 'the hand-held wobble',
    'Tilt in sway': 'how much the wobble tilts the view (keep low for 2.5D pictures)',
    'Sway speed': 'how fast the wobble is',
    'Breathing (m)': 'slow push in and pull back',
    'Breath length (s)': 'seconds per push in and back',
    'Wind (m/s)': 'arrow shows the wind', 'Wind direction (°)': 'arrow shows where the snow blows', 'Gusts': 'how much the wind swells and calms',
    'Starts at (m)': 'green ring: fog starts', 'Full at (m)': 'white ring: fully fogged',
    'Sun direction (°)': '0 = behind you, 90 = from the right, 180 = against the light', 'Sun height (°)': 'low = long shadows, warm light'
  };
  const cues = new THREE.Group(); cues.renderOrder = 110; scene.add(cues);
  disposers.push(() => { scene.remove(cues); cueClear(); });
  let cueTimer = 0;
  function cueClear() { cues.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); cues.clear(); }
  const cueMats = new Map(); // reused, so a cue shows at once (no new shader each time)
  const cueMat = (c, o) => { const k = c + ':' + o; if (!cueMats.has(k)) cueMats.set(k, flat(c, o)); return cueMats.get(k); };
  disposers.push(() => cueMats.forEach(m => m.dispose()));
  function cueShow(build, secs = 4) { cueClear(); build(); clearTimeout(cueTimer); cueTimer = setTimeout(cueClear, secs * 1000); }
  const _cd = new THREE.Vector3();
  function viewGround() { // ground point in the middle of the view
    const g = groundPick({ clientX: innerWidth / 2 + 165, clientY: innerHeight * 0.6 }) || groundPick({ clientX: innerWidth / 2, clientY: innerHeight * 0.75 });
    if (g) return new THREE.Vector3(g[0], ctx.groundY(g[0], g[1]) + 0.05, g[1]);
    camera.getWorldDirection(_cd); return camera.position.clone().addScaledVector(_cd, 5);
  }
  function windArrow() {
    const k = L.look, at = viewGround();
    camera.getWorldDirection(_cd); _cd.y = 0; _cd.normalize();
    const right = new THREE.Vector3(-_cd.z, 0, _cd.x), a = THREE.MathUtils.degToRad(k.windDir ?? 0);
    const dir = right.multiplyScalar(Math.cos(a)).addScaledVector(_cd, Math.sin(a)).normalize();
    const scale = camera.position.distanceTo(at) * 0.06, len = scale * (1 + (k.wind ?? 0.3) * 1.2);
    const m = cueMat(0x9fd8ff, 0.95);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(scale * 0.12, scale * 0.12, len, 12), m);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(scale * 0.35, scale * 0.8, 16), m);
    const g = new THREE.Group(); shaft.position.y = len / 2; tip.position.y = len + scale * 0.4; g.add(shaft, tip);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.position.copy(at).addScaledVector(dir, -len / 2).add(new THREE.Vector3(0, scale * 0.6, 0));
    g.children.forEach(c => { c.renderOrder = 111; }); cues.add(g);
  }
  function sunCue() { // a sun disc and its ray toward the middle of the scene
    const s = ctx.sunLine(); if (!s) return;
    const from = new THREE.Vector3().fromArray(s.from), to = new THREE.Vector3().fromArray(s.to);
    const p = to.clone().lerp(from, 0.45), d = camera.position.distanceTo(p) * 0.04;
    const sun = new THREE.Mesh(new THREE.SphereGeometry(d, 20, 12), cueMat(0xffd25a, 0.95)); sun.position.copy(p); sun.renderOrder = 111; cues.add(sun);
    const dir = to.clone().sub(p), len = dir.length(); dir.normalize();
    const ray = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.12, d * 0.12, len, 8), cueMat(0xffd25a, 0.6));
    ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); ray.position.copy(p).addScaledVector(dir, len / 2); ray.renderOrder = 111; cues.add(ray);
  }
  function fogRings(active) {
    const k = L.look, y = ctx.groundY(camera.position.x, camera.position.z) + 0.03;
    for (const [r, col, key] of [[k.fogNear, 0x5dff86, 'Starts at (m)'], [k.fogFar, 0xffffff, 'Full at (m)']]) {
      if (!(r > 0)) continue;
      const w = Math.max(0.06, r * 0.012);
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - w, r + w, 128), cueMat(col, key === active ? 0.95 : 0.45));
      ring.rotation.x = -Math.PI / 2; ring.position.set(camera.position.x, y, camera.position.z); ring.renderOrder = 111; cues.add(ring);
    }
  }
  function cue(label, value) {
    const what = CUE_TEXT[label];
    if (CAMERA_CUES.has(label)) {
      if (!ctx.live().on) ctx.previewLive(8);
      msg(`${label}: ${value} (${what}). ${ctx.live().on ? '' : 'Playing the camera motion for 8 s; ▶ Live motion keeps it on.'}`);
      return;
    }
    if (label === 'Wind (m/s)' || label === 'Wind direction (°)' || label === 'Gusts') { cueShow(windArrow); msg(`${label}: ${value} (${what})`); return; }
    if (label === 'Sun direction (°)' || label === 'Sun height (°)') { cueShow(sunCue); msg(`${label}: ${value} (${what})`); return; }
    if (label === 'Starts at (m)' || label === 'Full at (m)') { cueShow(() => fogRings(label), 5); msg(`${label}: ${value} (${what})`); return; }
    msg(`${label}: ${value}${what ? ` (${what})` : ''}`);
  }

  const AREA_TYPES = [
    ['walk', 'Walk area', COLORS.walk, 'Models may walk here.'],
    ['terrace', 'Raised area', COLORS.terrace, 'A floor at a fixed height (stage, deck, steps).'],
    ['blocked', 'No-go area', COLORS.blocked, 'Models never walk here (furniture, holes, walls).'],
    ['water', 'Water', COLORS.water, 'Models swim here. One per scene.']
  ];
  const SPOT_TYPES = [['start', 'Start spot', COLORS.start], ['rest', 'Rest spot', COLORS.rest], ['entry', 'Water entry', COLORS.entry]];
  const hex = c => `#${c.toString(16).padStart(6, '0')}`;
  let addMenu = null; // 'area' | 'spot' | null
  const areaKind = it => (it.y != null ? 'terrace' : 'walk');
  function areaRows() {
    const rows = [];
    if (zones.water?.polygon?.length) rows.push({ s: { kind: 'water' }, name: 'Water', kind: 'water', extra: `${zones.water.polygon.length} corners` });
    (zones.walk || []).forEach((w, i) => rows.push({ s: { kind: 'walk', list: 'walk', i }, name: w.name || `Walk area ${i + 1}`, kind: areaKind(w), extra: w.y != null ? `${w.y.toFixed(2)} m high` : '' }));
    (zones.blocked || []).forEach((w, i) => rows.push({ s: { kind: 'blocked', list: 'blocked', i }, name: w.name || `No-go area ${i + 1}`, kind: 'blocked', extra: '' }));
    return rows;
  }
  const isSel = s => sel && sel.kind === s.kind && sel.i === s.i && sel.list === s.list;
  function layerRow({ s, name, kind, extra }, onDelete) {
    const t = AREA_TYPES.find(a => a[0] === kind) || SPOT_TYPES.find(a => a[0] === kind);
    const del = h('button', { class: 'mini', title: 'Delete' }, '✕');
    del.onclick = ev => { ev.stopPropagation(); onDelete(); };
    return h('div', { class: 'item' + (isSel(s) ? ' on' : ''), onclick: () => { sel = s; tool = 'select'; refresh(); redraw(); } },
      h('span', { class: 'dot', style: `background:${hex(t?.[2] ?? 0xffffff)}` }), h('span', { class: 'grow' }, name),
      h('span', { class: 'muted' }, extra || t?.[1] || ''), del);
  }
  function removeArea(s) {
    snapshot();
    if (s.kind === 'water') zones.water.polygon = [];
    else zones[s.list].splice(s.i, 1);
    if (isSel(s)) sel = null;
    apply('nav'); refresh();
  }
  function tabDraw() {
    body.append(...viewRow(), h('div', { class: 'muted' }, 'Tip: Top view is easiest for drawing.'));

    // ---- areas
    const areas = areaRows();
    body.append(h('div', { class: 'row', style: 'align-items:center;margin-top:12px' }, h('h3', { style: 'margin:0;flex:1' }, `Areas (${areas.length})`),
      btn(addMenu === 'area' ? 'Close' : '+ New area', () => { addMenu = addMenu === 'area' ? null : 'area'; }, { cls: 'mini' })));
    if (addMenu === 'area') body.append(h('div', { class: 'card' }, h('div', { class: 'muted' }, 'What kind of area?'),
      ...AREA_TYPES.map(([k, label, color, note]) => h('div', { class: 'item', onclick: () => {
        if (k === 'water' && zones.water?.polygon?.length && !confirm('Replace the existing water with a new shape?')) return;
        addMenu = null; setTool('draw', { drawKind: k });
      } }, h('span', { class: 'dot', style: `background:${hex(color)}` }), h('span', { class: 'grow' }, h('b', {}, label), h('br'), h('span', { class: 'muted' }, note))))));
    const list = h('div', { class: 'list' });
    for (const r of areas) list.append(layerRow(r, () => removeArea(r.s)));
    if (!areas.length) list.append(h('div', { class: 'muted' }, 'No areas yet. Without areas, models walk on any flat ground in view. Click “+ New area” to draw where they may (or may not) go.'));
    body.append(list);

    const it = selItem();
    if (it && (sel.kind === 'walk' || sel.kind === 'blocked' || sel.kind === 'water')) {
      const kind = sel.kind === 'water' ? 'water' : sel.kind === 'blocked' ? 'blocked' : areaKind(it);
      const card = h('div', { class: 'card' });
      if (kind !== 'water') {
        card.append(textCtl('Name', () => it.name, v => { it.name = v; }),
          selectCtl('Type', AREA_TYPES.filter(a => a[0] !== 'water').map(a => [a[0], a[1]]), () => kind, v => {
            if (v === kind) return;
            const item = zones[sel.list].splice(sel.i, 1)[0];
            if (v === 'blocked') { delete item.y; zones.blocked = zones.blocked || []; zones.blocked.push(item); sel = { kind: 'blocked', list: 'blocked', i: zones.blocked.length - 1 }; }
            else { if (v === 'terrace') item.y = +avgGround(item.polygon).toFixed(2); else delete item.y; zones.walk = zones.walk || []; zones.walk.push(item); sel = { kind: 'walk', list: 'walk', i: zones.walk.length - 1 }; }
          }, 'nav'));
        if (kind === 'terrace') card.append(slider('Height (m)', () => it.y, v => { it.y = v; }, -1, 3, 0.01, 'nav'));
      } else card.append(h('div', { class: 'muted' }, 'Water look and level are in the Water tab.'));
      card.append(h('div', { class: 'muted' }, 'Reshape: drag the corner dots. Add a corner: drag a small middle dot. Remove a corner: Alt/Option-click it.'),
        row(btn('Redraw shape', () => setTool('draw', { drawKind: kind, redrawTarget: { ...sel } })),
          btn('Delete area', () => removeArea({ ...sel }), { cls: 'warn' })));
      body.append(card);
    }

    // ---- spots
    const spotsList = zones.spots || [];
    body.append(h('div', { class: 'row', style: 'align-items:center;margin-top:12px' }, h('h3', { style: 'margin:0;flex:1' }, `Spots (${spotsList.length})`),
      btn(addMenu === 'spot' ? 'Close' : '+ Add spot', () => { addMenu = addMenu === 'spot' ? null : 'spot'; }, { cls: 'mini' })));
    if (addMenu === 'spot') body.append(h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Spots are places models start at, rest at, or enter the water. Stories walk models to spots.'),
      row(...SPOT_TYPES.map(([k, label, color]) => btn(label, () => { addMenu = null; setTool('spot', { spotType: k }); }, { dot: color })))));
    const sl = h('div', { class: 'list' });
    const counts = {};
    spotsList.forEach((sp, i) => {
      counts[sp.type] = (counts[sp.type] || 0) + 1;
      const label = (SPOT_TYPES.find(t => t[0] === sp.type)?.[1] || sp.type);
      sl.append(layerRow({ s: { kind: 'spot', i }, name: `${i + 1}. ${label}`, kind: sp.type, extra: '' }, () => { snapshot(); zones.spots.splice(i, 1); if (sel?.kind === 'spot') sel = null; apply('nav'); refresh(); }));
    });
    if (!spotsList.length) sl.append(h('div', { class: 'muted' }, 'No spots yet.'));
    body.append(sl);
    if (sel?.kind === 'spot' && it) body.append(h('div', { class: 'card' },
      selectCtl('Type', SPOT_TYPES.map(t => [t[0], t[1]]), () => it.type, v => { it.type = v; }, 'nav'),
      h('div', { class: 'muted' }, 'Move it: drag the dot in the scene.')));

    body.append(heading('Show'),
      row(...[['grid', 'Walkable grid'], ['paths', 'Model paths'], ['pause', 'Pause models']].map(([k, t]) => btn(t, () => { shows[k] = !shows[k]; ctx.setShow(k, shows[k]); }, { on: shows[k] }))));
  }
  const shows = { grid: false, paths: false, pause: false };
  // properties of the selected shape / spot / route / prop
  function propsCard() {
    const it = selItem(); if (!it || sel.kind === 'capy') return '';
    const card = h('div', { class: 'card' });
    if (sel.kind === 'walk' || sel.kind === 'blocked') {
      card.append(textCtl('Name', () => it.name, v => { it.name = v; }));
      if (sel.kind === 'walk') {
        card.append(checkCtl('Fixed height (terrace)', () => it.y != null, v => { it.y = v ? +avgGround(it.polygon).toFixed(2) : null; }, 'nav'));
        if (it.y != null) card.append(slider('Height (m)', () => it.y, v => { it.y = v; }, -1, 2, 0.01, 'nav'));
      }
    } else if (sel.kind === 'spot') {
      card.append(selectCtl('Type', [['start', 'Start'], ['rest', 'Rest'], ['entry', 'Water entry']], () => it.type, v => { it.type = v; }, 'nav'));
    } else if (sel.kind === 'route') card.append(...routeCtls(it));
    else if (sel.kind === 'prop') card.append(...propCtls(it));
    else if (sel.kind === 'water') card.append(h('div', { class: 'muted' }, 'Water settings are in the Water tab.'));
    return card;
  }

  function tabWater() {
    const w = zones.water;
    body.append(...viewRow(),
      heading('Edge'),
      row(btn(w.polygon?.length ? 'Redraw water edge' : 'Draw water edge', () => setTool('draw', { drawKind: 'water' }), { on: tool === 'draw' && drawKind === 'water', dot: COLORS.water }),
        btn('Edit corners', () => { sel = { kind: 'water' }; setTool('select'); }, { on: sel?.kind === 'water' })),
      row(btn('Add water entry spot', () => setTool('spot', { spotType: 'entry' }), { on: tool === 'spot' && spotType === 'entry', dot: COLORS.entry })),
      heading('Surface'),
      slider('Level (m)', () => w.y, v => { w.y = v; }, -1.5, 1, 0.01, 'nav'),
      slider('Opacity', () => w.opacity, v => { w.opacity = v; }, 0, 1, 0.01, 'water'),
      colorCtl('Colour', () => w.color, v => { w.color = v; }, 'water'),
      heading('Ripples'),
      slider('Wave size', () => w.ripple.size, v => { w.ripple.size = v; }, 0.2, 4, 0.05, 'water'),
      slider('Speed', () => w.ripple.speed, v => { w.ripple.speed = v; }, 0, 4, 0.05, 'water'),
      slider('Strength', () => w.ripple.strength, v => { w.ripple.strength = v; }, 0, 4, 0.05, 'water'),
      heading('Steam'),
      slider('Amount', () => w.steam.amount, v => { w.steam.amount = v; }, 0, 3, 0.05, 'water'),
      slider('Rise height (m)', () => w.steam.height, v => { w.steam.height = v; }, 0.2, 5, 0.05, 'water'),
      slider('Puff size', () => w.steam.size, v => { w.steam.size = v; }, 0.2, 3, 0.05, 'water'),
      slider('Opacity', () => w.steam.opacity, v => { w.steam.opacity = v; }, 0, 0.5, 0.01, 'water'),
      heading('Swimming'),
      slider('Swim depth', () => w.swimDepth, v => { w.swimDepth = v; }, 0.2, 0.95, 0.01, 'water', v => `${Math.round(v * 100)}%`),
      h('div', { class: 'muted' }, 'How much of a model is under water while swimming.'));
  }

  function tabCapys() {
    const b = zones.behaviour;
    const list = h('div', { class: 'list' });
    for (const c of ctx.capys()) {
      const cfg = capyCfg(c.tag);
      const cb = h('input', { type: 'checkbox' }); cb.checked = cfg.enabled !== false;
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => { snapshot(); cfg.enabled = cb.checked; apply('capys'); });
      list.append(h('div', { class: 'item' + (capySel === c.tag ? ' on' : ''), onclick: () => selectCapy(c.tag) }, cb, h('span', { class: 'grow' }, ctx.castName(c.tag)), h('span', { class: 'muted' }, c.swimming ? 'swimming' : c.state)));
    }
    body.append(heading('Models'), list, castAdder());
    if (capySel) {
      const cfg = capyCfg(capySel);
      const starts = (zones.spots || []).map((s, i) => [i, s]).filter(([, s]) => s.type === 'start').map(([i]) => [i, `Start spot ${i + 1}`]);
      const routes = (zones.routes || []).map(r => [r.name, r.name]);
      const card = h('div', { class: 'card' },
        h('b', {}, ctx.castName(capySel)),
        slider('Size', () => cfg.scale ?? 1, v => { cfg.scale = v; }, 0.5, 2, 0.01, 'capys'),
        slider('Speed', () => cfg.speed ?? 1, v => { cfg.speed = v; }, 0.2, 3, 0.05, 'capys'),
        selectCtl('Start at', [['', 'Any start spot'], ...starts], () => cfg.start ?? '', v => { cfg.start = v === '' ? null : +v; }, 'capys'),
        selectCtl('Route', [['', 'Any route'], ['none', 'Never'], ...routes], () => cfg.route ?? '', v => { cfg.route = v; }, 'capys'),
        checkCtl('Own behaviour mix', () => !!cfg.behaviour, v => { cfg.behaviour = v ? { ...b } : null; }, 'capys'));
      if (cfg.behaviour) for (const [k, t] of BEHAVIOUR) card.append(slider(t, () => cfg.behaviour[k] ?? 0, v => { cfg.behaviour[k] = v; }, 0, 10, 0.5, 'capys'));
      card.append(heading('Do now'), row(
        btn('Surprise', () => ctx.doCapy(capySel, 'surprise')),
        btn('Walk a route', () => ctx.doCapy(capySel, 'route')),
        btn('Nap', () => ctx.doCapy(capySel, 'nap')),
        btn('Send to…', () => setTool('send'), { on: tool === 'send' })));
      body.append(card, castCard(capySel));
    }
    body.append(heading('Everyone'),
      slider('Walk speed', () => L.capy.speed, v => { L.capy.speed = v; }, 0.3, 3, 0.05, 'look'),
      slider('Personal space', () => L.capy.personal, v => { L.capy.personal = v; }, 0.3, 2, 0.05, 'look'),
      h('div', { class: 'muted' }, 'Behaviour mix (how often each is chosen):'));
    for (const [k, t] of BEHAVIOUR) body.append(slider(t, () => b[k] ?? 0, v => { b[k] = v; }, 0, 10, 0.5, 'data'));
    body.append(row(btn('Back to start spots', () => ctx.resetCapys()),
      btn(shows.pause ? 'Resume' : 'Pause', () => { shows.pause = !shows.pause; ctx.setShow('pause', shows.pause); }, { on: shows.pause })));
  }
  const capyCfg = tag => { zones.capys = zones.capys || {}; return (zones.capys[tag] = zones.capys[tag] || {}); };
  function selectCapy(tag) { capySel = tag; sel = tag ? { kind: 'capy', tag } : null; ctx.selectCapy(tag); refresh(); }

  // ------------------------------------------------------------ cast (cast.json)
  const slug = t => t.toLowerCase().replace(/\.glb$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'character';
  function fileInput(label, accept, onFile) {
    const i = h('input', { type: 'file', accept, style: 'display:none' });
    i.addEventListener('change', () => { const f = i.files?.[0]; i.value = ''; if (f) onFile(f); });
    const b = h('button', {}, label); b.onclick = () => i.click();
    return h('span', { style: 'display:contents' }, b, i);
  }
  function numberCtl(label, get, set, min, max, step) {
    const i = h('input', { type: 'number', min, max, step, value: get() ?? '' });
    i.style.width = '100%';
    i.addEventListener('change', () => set(i.value === '' ? null : +i.value));
    return h('div', { class: 'ctl c2' }, h('span', {}, label), i);
  }
  function castAdder() {
    return h('div', { class: 'card' },
      h('div', { class: 'muted' }, 'Add any rigged GLB model with its animations (a runway model, an animal, a capybara…). Then pick which clip is idle, walk and pose, and which mesh wears the drawing.'),
      row(btn('Add stand-in', () => busy('Adding', async () => {
        const cast = ctx.getCast(); let n = cast.length + 1;
        while (cast.some(c => c.id === `model_${n}`)) n++;
        cast.push({ id: `model_${n}`, name: `Model ${n}`, height: 1.6 });
        await ctx.setCast(cast); selectCapy(`model_${n}`);
        return `Added Model ${n} (a capsule until you give it a GLB in Files). Save to keep it.`;
      })), fileInput('Add model (GLB)', '.glb,model/gltf-binary', f => busy('Uploading ' + f.name, async () => {
        const cast = ctx.getCast(); let n = cast.length + 1;
        while (cast.some(c => c.id === `model_${n}`)) n++;
        const id = `model_${n}`;
        const file = `cast/${id}.glb`;
        await ctx.put(file, f, 'model/gltf-binary');
        cast.push({ id, name: `Model ${n}`, file, height: 1.7, clips: {} });
        await ctx.setCast(cast); selectCapy(id);
        return `Added Model ${n} (${f.name}). Rename it in Model setup; Save to keep it.`;
      }))));
  }
  function castCard(id) {
    const cast = ctx.getCast(), ch = cast.find(c => c.id === id), info = ctx.castInfo().find(c => c.id === id);
    if (!ch) return h('div');
    const update = (fn, label = 'Updating') => busy(label, async () => { fn(ch); await ctx.setCast(cast); return 'Updated. Save to keep it.'; });
    const clipOpts = [['', '(same name)'], ...(info?.clips || []).map(n => [n, n])];
    const clipSel = (role, label) => {
      const sel = h('select', {}, clipOpts.map(([v, t]) => { const o = h('option', { value: v }, t); if ((ch.clips?.[role] || '') === v) o.selected = true; return o; }));
      sel.addEventListener('change', () => update(c => { c.clips = { ...(c.clips || {}) }; if (sel.value) c.clips[role] = sel.value; else delete c.clips[role]; }));
      return h('div', { class: 'ctl c2' }, h('span', {}, label), sel);
    };
    const meshes = [...new Set((info?.meshes || []).filter(Boolean))];
    const outSel = h('select', {}, [['', 'None'], ...meshes.map(m => [m, m])].map(([v, t]) => { const o = h('option', { value: v }, t); if ([].concat(ch.outfit?.mesh || [])[0] === v || (!ch.outfit && v === '')) o.selected = true; return o; }));
    outSel.addEventListener('change', () => update(c => { if (outSel.value) c.outfit = { mesh: outSel.value }; else delete c.outfit; }));
    const nameIn = h('input', { type: 'text', value: ch.name || '' });
    nameIn.addEventListener('change', () => update(c => { c.name = nameIn.value; }));
    return h('div', { class: 'card' },
      h('b', {}, 'Model setup'),
      h('div', { class: 'ctl c2' }, h('span', {}, 'Name'), nameIn),
      numberCtl('Height (m)', () => ch.height ?? '', v => update(c => { if (v) c.height = v; else delete c.height; }), 0.1, 4, 0.01),
      numberCtl('Walk speed (m/s)', () => ch.speed ?? '', v => update(c => { if (v) c.speed = v; else delete c.speed; }), 0.1, 3, 0.05),
      clipSel('idle', 'Idle clip'), clipSel('walk', 'Walk clip'), clipSel('pose', 'Pose clip'), clipSel('swim', 'Swim clip'),
      h('div', { class: 'ctl c2' }, h('span', {}, 'Outfit mesh'), outSel),
      h('div', { class: 'muted' }, info?.outfit ? 'The drawing goes on this mesh (its UVs must match the worksheet).' : 'Pick the mesh of this model that should wear the child’s drawing.'),
      row(fileInput('Try a drawing', 'image/*', f => busy('Dressing', async () => (await ctx.tryOutfit(id, URL.createObjectURL(f))) ? 'Outfit shown (not saved)' : 'Pick an outfit mesh first')),
        btn('Clear', () => ctx.tryOutfit(id, null)),
        btn('Remove model', () => { if (confirm('Remove ' + (ch.name || id) + '?')) busy('Removing', async () => { await ctx.setCast(cast.filter(c => c.id !== id)); selectCapy(null); return 'Removed. Save to keep it.'; }); }, { cls: 'warn' })));
  }

  // ------------------------------------------------------------ story (story.json)
  const STEP_NAMES = { camera: 'Camera shot', walk: 'Walk', place: 'Place', anim: 'Animation', say: 'Caption', wait: 'Wait', show: 'Show', hide: 'Hide', outfit: 'Outfit', music: 'Music', light: 'Light / mood', free: 'Free (own behaviour)' };
  let stepSel = null, playingStep = -1, newStepType = 'walk';
  ctx.onStoryStep(i => { playingStep = i; if (tab === 'story') refresh(); });
  const storyChanged = () => { ctx.setStory(story); msg('Unsaved changes'); };
  const who = () => ctx.castInfo().map(c => [c.id, ctx.castName(c.id)]);
  function stepSummary(st) {
    const n = st.who ? ctx.castName(st.who) : '';
    switch (st.do) {
      case 'camera': {
        const m = st.mode || (st.follow ? 'look' : 'fixed'), w = ctx.castName(st.who || st.follow || '');
        const what = m === 'director' ? `Director: ${(st.operators?.length || ctx.cameraOperators().length)} cameras on ${st.who && st.who !== 'auto' ? w : 'whoever performs'}` : m === 'follow' ? `Camera follows ${w}` : m === 'orbit' ? `Camera circles ${w}` : m === 'drift' ? 'Camera drifts slowly' : m === 'look' ? `Camera watches ${w}` : st.shot === 'hero' ? 'Camera: hero view' : 'Camera shot';
        return `${what}${st.seconds ? ` (${st.seconds}s move)` : ''}${st.wait === false ? ' (with next)' : ''}`;
      }
      case 'walk': return `${n} walks ${st.route ? 'route “' + st.route + '”' : st.spot != null ? 'to spot ' + (st.spot + 1) : 'to a point'}${st.wait === false ? ' (with next)' : ''}`;
      case 'place': return `${n} placed${st.spot != null ? ' at spot ' + (st.spot + 1) : ''}${st.turn != null ? `, facing ${st.turn}°` : ''}`;
      case 'anim': return `${n} plays ${st.clip || 'pose'}${st.loop ? ' (loop)' : ''}`;
      case 'say': return `“${(st.text || '').slice(0, 40)}” (${st.seconds ?? 3}s)`;
      case 'wait': return `Wait ${st.seconds ?? 1}s`;
      case 'outfit': return `${n} wears ${st.image === 'drawing' ? 'the child’s drawing' : st.image || '—'}`;
      case 'music': return st.stop ? 'Stop music' : `Music ${st.file || '—'}`;
      case 'free': return `${st.who === 'all' ? 'Everyone' : n} back to own behaviour`;
      case 'light': {
        if (st.mood) return `Mood: ${MOODS[st.mood]?.label || st.mood}${st.seconds ? ` (fade ${st.seconds}s)` : ''}`;
        const ln = st.light === 'all' || !st.light ? 'All lights' : lightName(lightById(st.light) || {});
        return `${ln}${st.on === true ? ' on' : st.on === false ? ' off' : ''}${st.color ? ' ' + st.color : ''}${st.intensity != null ? ` @${st.intensity}` : ''}${st.seconds ? ` (fade ${st.seconds}s)` : ''}`;
      }
      default: return `${STEP_NAMES[st.do] || st.do} ${n}`;
    }
  }
  function defaultStep(type) {
    const first = ctx.castInfo()[0]?.id;
    return ({
      camera: { do: 'camera', mode: 'director', who: 'auto' },
      walk: { do: 'walk', who: first, route: zones.routes?.[0]?.name },
      place: { do: 'place', who: first, spot: (zones.spots || []).findIndex(s => s.type === 'start') >= 0 ? (zones.spots || []).findIndex(s => s.type === 'start') : null, turn: 0 },
      anim: { do: 'anim', who: first, clip: 'pose' },
      say: { do: 'say', text: 'Hello!', seconds: 3 },
      wait: { do: 'wait', seconds: 1 },
      show: { do: 'show', who: first }, hide: { do: 'hide', who: first },
      outfit: { do: 'outfit', who: first, image: 'drawing' },
      music: { do: 'music', file: '', volume: 0.6 },
      free: { do: 'free', who: 'all' },
      light: { do: 'light', mood: 'night', seconds: 3 }
    })[type];
  }
  function stepFields(st) {
    const set = fn => v => { snapshot(); fn(v); storyChanged(); refresh(); };
    const sel = (label, opts, get, fn) => {
      const s2 = h('select', {}, opts.map(([v, t]) => { const o = h('option', { value: v }, t); if (String(get() ?? '') === String(v)) o.selected = true; return o; }));
      s2.addEventListener('change', () => set(fn)(s2.value)); return h('div', { class: 'ctl c2' }, h('span', {}, label), s2);
    };
    const num = (label, get, fn, min, max, step) => {
      const i = h('input', { type: 'number', min, max, step, value: get() ?? '' }); i.style.width = '100%';
      i.addEventListener('change', () => set(fn)(i.value === '' ? null : +i.value)); return h('div', { class: 'ctl c2' }, h('span', {}, label), i);
    };
    const text = (label, get, fn) => { const i = h('input', { type: 'text', value: get() ?? '' }); i.addEventListener('change', () => set(fn)(i.value)); return h('div', { class: 'ctl c2' }, h('span', {}, label), i); };
    const chk = (label, get, fn) => { const i = h('input', { type: 'checkbox' }); i.checked = !!get(); i.addEventListener('change', () => set(fn)(i.checked)); return h('label', { class: 'ctl c2' }, h('span', {}, label), h('span', {}, i)); };
    const whoSel = (all = false) => sel('Who', [...(all ? [['all', 'Everyone']] : []), ...who()], () => st.who, v => { st.who = v; });
    const spotOpts = [['', '—'], ...(zones.spots || []).map((s, i) => [i, `Spot ${i + 1} (${s.type})`])];
    const withNext = () => chk('Start next step together', () => st.wait === false, v => { if (v) st.wait = false; else delete st.wait; });
    const upload = (label, accept, folder, fn) => fileInput(label, accept, f => busy('Uploading ' + f.name, async () => {
      const name = `${folder}/${slug(f.name.replace(/\.[^.]+$/, ''))}.${(f.name.split('.').pop() || 'bin').toLowerCase()}`;
      await ctx.put(name, f, f.type || 'application/octet-stream'); snapshot(); fn(name); storyChanged(); refresh(); return `Uploaded ${name}`;
    }));
    switch (st.do) {
      case 'camera': {
        const mode = st.mode || (st.follow ? 'look' : 'fixed');
        if (st.follow && !st.who) { st.who = st.follow; }
        const setMode = v => { st.mode = v; delete st.follow; if (v === 'director') { st.who = st.who || 'auto'; return; } if (st.who === 'auto') delete st.who; if (v === 'drift') { delete st.who; return; } if (v !== 'fixed' && !st.who) st.who = who()[0]?.[0]; if (v === 'follow' && !st.offset) st.offset = [0, 0.9, 2.2]; };
        const preset = (label, off, frame) => btn(label, () => { snapshot(); st.offset = off; st.frame = frame; storyChanged(); ctx.previewCamera({ ...st, seconds: 0.8 }); });
        const fields = [
          sel('Camera', [['director', 'Director (several cameras)'], ['fixed', 'Fixed shot'], ['look', 'Look at a model'], ['follow', 'Follow a model'], ['orbit', 'Circle a model'], ['drift', 'Slow drift (calm, 2.5D)']], () => mode, setMode)];
        if (mode === 'director') {
          fields.push(h('div', { class: 'muted' }, 'Several camera operators film the show; it cuts between them at unpredictable moments until the next camera step.'),
            sel('Films', [['auto', 'Whoever is performing'], ...who()], () => st.who || 'auto', v => { st.who = v; }));
          const ops = ctx.cameraOperators(), on = new Set(st.operators?.length ? st.operators : ops.map(o => o[0]));
          const box = h('div', { class: 'row' });
          for (const [k, label] of ops) {
            const b = btn(label, () => { snapshot(); if (on.has(k)) on.delete(k); else on.add(k); st.operators = on.size === ops.length ? undefined : [...on]; if (!on.size) st.operators = [k]; storyChanged(); }, { on: on.has(k), cls: 'mini' });
            box.append(b);
          }
          fields.push(h('div', { class: 'muted' }, 'Cameras used:'), box,
            num('Cut after at least (s)', () => st.cutMin ?? 2.5, v => { st.cutMin = v ?? 2.5; }, 0.5, 30, 0.5),
            num('…and at most (s)', () => st.cutMax ?? 6, v => { st.cutMax = v ?? 6; }, 0.5, 60, 0.5),
            row(btn('Preview cameras', () => ctx.previewCamera(st))));
          return fields;
        }
        if (mode === 'drift') {
          const mv = () => st.move || [0.12, 0, 0.15];
          const setMv = (i, v) => { const m = [...mv()]; m[i] = v ?? 0; st.move = m; };
          fields.push(h('div', { class: 'muted' }, 'A calm, slow glide that shows the depth of the picture. Keep it small for 2.5D backgrounds so the edges never show.'),
            row(btn('Start from current view', () => { snapshot(); st.shot = ctx.currentShot(); storyChanged(); }), btn('From where the camera is', () => { snapshot(); delete st.shot; storyChanged(); })),
            num('Sideways (m)', () => mv()[0], v => setMv(0, v), -3, 3, 0.01),
            num('Up (m)', () => mv()[1], v => setMv(1, v), -3, 3, 0.01),
            num('Forward (m)', () => mv()[2], v => setMv(2, v), -3, 3, 0.01),
            num('Glide time (s)', () => st.driftSeconds ?? 14, v => { st.driftSeconds = v ?? 14; }, 2, 120, 1),
            chk('Glide back and forth', () => st.pingpong !== false, v => { if (v) delete st.pingpong; else st.pingpong = false; }),
            num('Blend in (s)', () => st.seconds, v => { st.seconds = v ?? 0; }, 0, 10, 0.1),
            withNext(), row(btn('Preview camera', () => ctx.previewCamera(st))));
          return fields;
        }
        if (mode !== 'fixed') fields.push(sel('Model', who(), () => st.who, v => { st.who = v; }));
        if (mode === 'fixed' || mode === 'look') fields.push(
          row(btn('Use current view', () => { snapshot(); st.shot = ctx.currentShot(); storyChanged(); }),
            ...(mode === 'fixed' ? [btn('Hero view', () => { snapshot(); st.shot = 'hero'; storyChanged(); })] : [])),
          h('div', { class: 'muted' }, 'Frame it in Free view (right-drag to orbit, wheel to zoom), then “Use current view”.'));
        if (mode === 'follow') fields.push(
          h('div', { class: 'muted' }, 'Where the camera rides, relative to the model:'),
          row(preset('In front', [0, 0.9, 2.2], 'character'), preset('Behind', [0, 1.1, -2.4], 'character'), preset('Side', [2.2, 0.9, 0], 'character')),
          row(btn('Use current view', () => {
            const p = ctx.charPos(st.who), c = ctx.currentShot(); if (!p) return;
            snapshot(); st.offset = [c.pos[0] - p[0], c.pos[1] - p[1], c.pos[2] - p[2]].map(v => +v.toFixed(2)); st.frame = 'world'; storyChanged();
          })),
          chk('Turn with them', () => st.frame === 'character', v => { st.frame = v ? 'character' : 'world'; }));
        if (mode === 'orbit') fields.push(
          num('Distance (m)', () => st.radius ?? 2.5, v => { st.radius = v ?? 2.5; }, 0.3, 20, 0.1),
          num('Height (m)', () => st.height ?? 1.2, v => { st.height = v ?? 1.2; }, -2, 10, 0.1),
          num('Speed (°/s)', () => st.speed ?? 20, v => { st.speed = v ?? 20; }, -180, 180, 5));
        fields.push(
          num('Move time (s)', () => st.seconds, v => { st.seconds = v ?? 0; }, 0, 10, 0.1),
          num('Field of view', () => st.fov ?? '', v => { if (v) st.fov = v; else delete st.fov; }, 15, 90, 1),
          withNext(),
          row(btn('Preview camera', () => ctx.previewCamera(st))));
        return fields;
      }
      case 'walk': return [whoSel(),
        sel('Route', [['', '—'], ...(zones.routes || []).map(r => [r.name, r.name])], () => st.route, v => { if (v) { st.route = v; delete st.spot; } else delete st.route; }),
        sel('or to spot', spotOpts, () => st.spot, v => { if (v !== '') { st.spot = +v; delete st.route; } else delete st.spot; }),
        withNext()];
      case 'place': return [whoSel(), sel('Spot', spotOpts, () => st.spot, v => { st.spot = v === '' ? null : +v; }),
        num('Facing (°)', () => st.turn, v => { st.turn = v; }, -180, 180, 5)];
      case 'anim': {
        const clips = ctx.castInfo().find(c => c.id === st.who)?.clips || [];
        return [whoSel(), sel('Clip', [['pose', 'pose (role)'], ['idle', 'idle (role)'], ['walk', 'walk (role)'], ...clips.map(c => [c, c])], () => st.clip, v => { st.clip = v; }),
          chk('Loop', () => st.loop, v => { st.loop = v || undefined; }), withNext()];
      }
      case 'say': return [text('Text', () => st.text, v => { st.text = v; }), num('Seconds', () => st.seconds, v => { st.seconds = v ?? 3; }, 0.5, 30, 0.5), withNext()];
      case 'wait': return [num('Seconds', () => st.seconds, v => { st.seconds = v ?? 1; }, 0.1, 60, 0.1)];
      case 'show': case 'hide': return [whoSel()];
      case 'outfit': return [whoSel(),
        sel('Wear', [['drawing', 'The child’s drawing'], ...(st.image && st.image !== 'drawing' ? [[st.image, st.image]] : [])], () => st.image, v => { st.image = v; }),
        row(upload('Use an image…', 'image/*', 'story', n => { st.image = n; }))];
      case 'music': return [chk('Stop music', () => st.stop, v => { st.stop = v || undefined; }),
        h('div', { class: 'muted' }, st.file || 'No file yet'), row(upload('Choose audio…', 'audio/*', 'audio', n => { st.file = n; })),
        num('Volume', () => st.volume, v => { st.volume = v ?? 0.6; }, 0, 1, 0.05)];
      case 'free': return [whoSel(true)];
      case 'light': {
        const f = [sel('Change', [['mood', 'The whole mood'], ['light', 'A light']], () => st.mood ? 'mood' : 'light', v => {
          if (v === 'mood') { st.mood = st.mood || 'night'; delete st.light; delete st.on; delete st.color; delete st.intensity; } else { delete st.mood; st.light = st.light || 'all'; st.on = st.on ?? true; }
        })];
        if (st.mood) f.push(sel('Mood', Object.entries(MOODS).map(([k, m]) => [k, m.label]), () => st.mood, v => { st.mood = v; }));
        else {
          f.push(sel('Light', [['all', 'All lights'], ...(L.lights || []).map(l => [l.id, lightName(l)])], () => st.light || 'all', v => { st.light = v; }),
            sel('Switch', [['', 'Keep'], ['on', 'On'], ['off', 'Off']], () => st.on === true ? 'on' : st.on === false ? 'off' : '', v => { if (v === '') delete st.on; else st.on = v === 'on'; }),
            chk('Change colour', () => st.color != null, v => { if (v) st.color = st.color || '#ff4f9a'; else delete st.color; }));
          if (st.color != null) { const ci = h('input', { type: 'color', value: st.color }); ci.addEventListener('change', () => set(() => { st.color = ci.value; })()); f.push(h('div', { class: 'ctl c2' }, h('span', {}, 'Colour'), ci)); }
          f.push(num('Strength (empty = keep)', () => st.intensity, v => { if (v == null) delete st.intensity; else st.intensity = v; }, 0, 500, 1));
          if (!(L.lights || []).length) f.push(h('div', { class: 'muted' }, 'No lights yet: add them in the Lights tab.'));
        }
        f.push(num('Fade (s)', () => st.seconds, v => { st.seconds = v ?? 0; }, 0, 30, 0.1), withNext(),
          h('div', { class: 'muted' }, 'Story changes are not saved into the lights: when the story ends or loops, the lights go back to how you set them.'));
        return f;
      }
      default: return [];
    }
  }
  function tabStory() {
    const steps = story.steps = story.steps || [];
    const running = ctx.storyRunning();
    body.append(...viewRow(),
      heading('Play'),
      row(btn(running ? 'Stop' : 'Play story', () => { if (running) ctx.stopStory(); else ctx.playStory(0); }, { on: running }),
        btn('Play from selected', () => ctx.playStory(stepSel ?? 0))),
      h('label', { class: 'ctl c2' }, h('span', {}, 'Plays by itself'), h('span', {}, (() => { const i = h('input', { type: 'checkbox' }); i.checked = story.autoplay !== false; i.onchange = () => { snapshot(); story.autoplay = i.checked; storyChanged(); }; return i; })())),
      h('label', { class: 'ctl c2' }, h('span', {}, 'Loop'), h('span', {}, (() => { const i = h('input', { type: 'checkbox' }); i.checked = story.loop !== false; i.onchange = () => { snapshot(); story.loop = i.checked; storyChanged(); }; return i; })())),
      heading(`Steps (${steps.length})`));
    const list = h('div', { class: 'list' });
    steps.forEach((st, i) => list.append(h('div', { class: 'item' + (stepSel === i ? ' on' : ''), onclick: () => { stepSel = i; refresh(); } },
      h('span', { class: 'muted' }, String(i + 1)), h('span', { class: 'grow' }, stepSummary(st)), playingStep === i ? h('span', {}, '▶') : '')));
    if (!steps.length) list.append(h('div', { class: 'muted' }, 'No steps yet. Add a camera shot, then make models walk, pose and talk.'));
    const typeSel = h('select', {}, STEP_TYPES.map(t => { const o = h('option', { value: t }, STEP_NAMES[t] || t); if (t === newStepType) o.selected = true; return o; }));
    typeSel.onchange = () => { newStepType = typeSel.value; };
    body.append(list, h('div', { class: 'ctl c2' }, typeSel, btn('Add step', () => {
      snapshot(); const at = stepSel != null ? stepSel + 1 : steps.length;
      steps.splice(at, 0, defaultStep(newStepType)); stepSel = at; storyChanged();
    })));
    const st = steps[stepSel];
    if (st) body.append(h('div', { class: 'card' }, h('b', {}, `${stepSel + 1}. ${STEP_NAMES[st.do] || st.do}`), ...stepFields(st),
      row(btn('↑', () => { if (stepSel > 0) { snapshot(); [steps[stepSel - 1], steps[stepSel]] = [steps[stepSel], steps[stepSel - 1]]; stepSel--; storyChanged(); } }, { cls: 'mini' }),
        btn('↓', () => { if (stepSel < steps.length - 1) { snapshot(); [steps[stepSel + 1], steps[stepSel]] = [steps[stepSel], steps[stepSel + 1]]; stepSel++; storyChanged(); } }, { cls: 'mini' }),
        btn('Duplicate', () => { snapshot(); steps.splice(stepSel + 1, 0, structuredClone(st)); stepSel++; storyChanged(); }),
        btn('Delete', () => { snapshot(); steps.splice(stepSel, 1); stepSel = null; storyChanged(); }, { cls: 'warn' }))));
  }

  function routeCtls(r) {
    return [textCtl('Name', () => r.name, v => { const old = r.name; r.name = v; for (const c of Object.values(zones.capys || {})) if (c.route === old) c.route = v; }),
      checkCtl('Loop back to start', () => r.loop, v => { r.loop = v; }, 'data'),
      checkCtl('Walk both directions', () => r.reverse !== false, v => { r.reverse = v; }, 'data')];
  }
  function propCtls(p) {
    return [slider('Rotation', () => p.rot || 0, v => { p.rot = v; }, -180, 180, 1, 'props'),
      slider('Size', () => p.scale || 1, v => { p.scale = v; }, 0.3, 3, 0.05, 'props')];
  }
  function tabRoutes() {
    body.append(...viewRow(),
      heading('Routes'),
      h('div', { class: 'muted' }, 'Paths models walk along, point by point (they go around obstacles between points).'),
      row(btn('Draw route', () => setTool('route'), { on: tool === 'route', dot: COLORS.route })));
    const rl = h('div', { class: 'list' });
    (zones.routes || []).forEach((r, i) => rl.append(h('div', { class: 'item' + (sel?.kind === 'route' && sel.i === i ? ' on' : ''), onclick: () => { sel = { kind: 'route', list: 'routes', i }; tool = 'select'; refresh(); redraw(); } }, h('span', { class: 'dot', style: 'background:#ff6fd8' }), h('span', { class: 'grow' }, r.name), h('span', { class: 'muted' }, `${r.points.length} pts`))));
    body.append(rl);
    if (sel?.kind === 'route' && zones.routes[sel.i]) body.append(h('div', { class: 'card' }, ...routeCtls(zones.routes[sel.i]), row(btn('Delete route', deleteSel, { cls: 'warn' }))));
    body.append(h('div', { class: 'muted', style: 'margin-top:10px' }, 'Props and 3D objects are in the Objects tab.'));
  }

  // ============================================================ objects (zones.props): GLBs + built-in props
  const PROP_NAMES = { mandarins: 'Mandarins', lantern: 'Stone lantern', steam: 'Steam vent' };
  const propLabel = (p, i) => p.type === 'model' ? (p.name || p.file?.split('/').pop().replace(/\.glb$/i, '') || 'Object') : `${PROP_NAMES[p.type] || p.type} ${i + 1}`;
  let gizmoMode = 'translate';
  const tc = new TransformControls(camera, renderer.domElement);
  tc.setSize(0.9);
  const tcHelper = tc.getHelper(); scene.add(tcHelper);
  disposers.push(() => { tc.detach(); scene.remove(tcHelper); tc.dispose(); });
  let tcBefore = null;
  tc.addEventListener('dragging-changed', ev => {
    controls.enabled = !ev.value && ctx.view() !== 'hero';
    if (ev.value) { snapshot(); tcBefore = true; return; }
    if (tcBefore) {
      tcBefore = null;
      if (sel?.kind === 'light') { msg('Unsaved changes'); refresh(); return; }
      const p = zones.props?.[sel?.i]; apply(p?.blocks ? 'nav' : 'props'); attachGizmo(); refresh();
    }
  });
  tc.addEventListener('objectChange', () => {
    if (sel?.kind === 'light') {
      const l = lightById(sel.id), o = tc.object; if (!l || !o) return;
      const v = o.position.toArray().map(n => +n.toFixed(3));
      if (lightPart === 'aim') l.aim = v; else l.pos = v;
      msg('Unsaved changes'); return;
    }
    const p = zones.props?.[sel?.i], o = tc.object; if (!p || !o) return;
    if (gizmoMode === 'scale') { const s = Math.max(0.01, (o.scale.x + o.scale.y + o.scale.z) / 3); o.scale.setScalar(s); p.scale = +s.toFixed(3); }
    p.x = +o.position.x.toFixed(3); p.z = +o.position.z.toFixed(3);
    p.y = +(o.position.y - ctx.propGround(p.x, p.z)).toFixed(3); if (Math.abs(p.y) < 0.002) delete p.y;
    const deg = THREE.MathUtils.radToDeg;
    p.rot = +deg(o.rotation.y).toFixed(1); p.rx = +deg(o.rotation.x).toFixed(1); p.rz = +deg(o.rotation.z).toFixed(1);
    if (!p.rx) delete p.rx; if (!p.rz) delete p.rz;
    redraw(); msg('Unsaved changes');
  });
  function attachGizmo() {
    if (tab === 'lights' && sel?.kind === 'light') {
      const o = ctx.lightObject(sel.id, lightPart === 'aim');
      if (o) { tc.attach(o); tc.setMode('translate'); tc.setSpace('world'); } else tc.detach();
      return;
    }
    const show = tab === 'objects' && sel?.kind === 'prop' && zones.props?.[sel.i];
    const o = show ? ctx.propObject(sel.i) : null;
    if (o) { o.rotation.order = 'YXZ'; tc.attach(o); tc.setMode(gizmoMode); tc.setSpace(gizmoMode === 'scale' ? 'local' : 'world'); tc.showY = true; }
    else tc.detach();
  }
  const selectProp = i => { sel = i == null ? null : { kind: 'prop', list: 'props', i }; tool = 'select'; refresh(); redraw(); };
  async function addObject(f) {
    const name = `objects/${slug(f.name)}.glb`;
    await ctx.put(name, f, 'model/gltf-binary');
    const size = await ctx.objectSize(name);
    if (!size) throw new Error('could not read that GLB');
    // drop it on the ground in the middle of the view
    const g = groundPick({ clientX: innerWidth / 2, clientY: innerHeight * 0.62 }) || [0, 0];
    snapshot(); zones.props = zones.props || [];
    zones.props.push({ type: 'model', file: name, name: f.name.replace(/\.glb$/i, ''), x: g[0], z: g[1], rot: 0, scale: 1, size });
    apply('props'); selectProp(zones.props.length - 1);
    const big = Math.max(...size);
    return big > 20 ? `Added ${f.name}: it is ${big.toFixed(0)} m big, use Size to shrink it. Save to keep it.` : `Added ${f.name}. Drag the arrows to move it. Save to keep it.`;
  }
  function tabObjects() {
    body.append(...viewRow(),
      heading('Add'),
      h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Upload any GLB (a bench, a tree, a lamp, a sign). It lands in the middle of the view; then move, turn and size it with the handles.'),
        row(fileInput('Upload 3D object (GLB)…', '.glb,model/gltf-binary', f => busy('Uploading ' + f.name, () => addObject(f))))),
      row(...Object.entries(PROP_NAMES).map(([k, t]) => btn(t, () => setTool('prop', { propType: k }), { on: tool === 'prop' && propType === k, cls: 'mini' }))));
    const list = zones.props || [];
    body.append(heading(`In the scene (${list.length})`));
    const pl = h('div', { class: 'list' });
    list.forEach((p, i) => pl.append(h('div', { class: 'item' + (sel?.kind === 'prop' && sel.i === i ? ' on' : ''), onclick: () => selectProp(i) },
      h('span', { class: 'dot', style: `background:${p.type === 'model' ? '#5b8fc0' : '#ff9a3c'}` }), h('span', { class: 'grow' }, propLabel(p, i)),
      p.blocks ? h('span', { class: 'muted' }, 'blocks') : '')));
    if (!list.length) pl.append(h('div', { class: 'muted' }, 'Nothing yet. Click an object in the scene to select it.'));
    body.append(pl);
    const p = sel?.kind === 'prop' ? list[sel.i] : null;
    if (p) {
      const num = (label, get, set, min, max, step) => numberCtl(label, get, v => { snapshot(); set(v); apply(p.blocks ? 'nav' : 'props'); attachGizmo(); }, min, max, step);
      const mode = (m, label, key) => btn(`${label} (${key})`, () => { gizmoMode = m; attachGizmo(); }, { on: gizmoMode === m });
      body.append(h('div', { class: 'card' },
        p.type === 'model' ? textCtl('Name', () => p.name, v => { p.name = v; }) : h('b', {}, propLabel(p, sel.i)),
        row(mode('translate', 'Move', 'W'), mode('rotate', 'Turn', 'E'), mode('scale', 'Size', 'R')),
        h('div', { class: 'muted' }, 'Drag the handles in the scene. Arrows move along one direction, squares in a plane.'),
        num('X (m)', () => p.x, v => { p.x = v ?? 0; }, -500, 500, 0.05),
        num('Z (m)', () => p.z, v => { p.z = v ?? 0; }, -500, 500, 0.05),
        num('Lift (m)', () => p.y || 0, v => { p.y = v || 0; }, -50, 50, 0.01),
        num('Turn (°)', () => p.rot || 0, v => { p.rot = v ?? 0; }, -360, 360, 1),
        num('Tilt fwd (°)', () => p.rx || 0, v => { p.rx = v || 0; }, -180, 180, 1),
        num('Tilt side (°)', () => p.rz || 0, v => { p.rz = v || 0; }, -180, 180, 1),
        num('Size', () => p.scale || 1, v => { p.scale = Math.max(0.001, v ?? 1); }, 0.001, 1000, 0.05),
        p.size ? h('div', { class: 'muted' }, `Real size: ${p.size.map(v => (v * (p.scale || 1)).toFixed(2)).join(' × ')} m (W × H × D)`) : '',
        checkCtl('Blocks walking', () => p.blocks, v => { p.blocks = v || undefined; if (v && !p.size) p.size = [0.5, 0.5, 0.5]; }, 'nav'),
        row(btn('Drop to ground', () => { snapshot(); delete p.y; delete p.rx; delete p.rz; apply(p.blocks ? 'nav' : 'props'); attachGizmo(); }),
          btn('Duplicate', () => { snapshot(); const c = structuredClone(p); c.x += 0.6; zones.props.push(c); apply(c.blocks ? 'nav' : 'props'); selectProp(zones.props.length - 1); }),
          btn('Delete', () => { tc.detach(); deleteSel(); }, { cls: 'warn' }))));
    }
  }

  // ============================================================ lights
  let lightPart = 'pos';
  const lightById = id => (L.lights || []).find(l => l.id === id);
  const selectLight = id => { sel = id ? { kind: 'light', id } : null; tool = 'select'; refresh(); };
  const lightName = l => l.name || (l.type === 'spot' ? 'Spotlight' : 'Lamp');
  function addLight(type, extra = {}) {
    const g = groundPick({ clientX: innerWidth / 2 + 165, clientY: innerHeight * 0.62 }) || [0, -3];
    const gy = ctx.groundY(g[0], g[1]);
    const l = type === 'spot'
      ? { id: newLightId(), type: 'spot', name: `Spotlight ${(L.lights || []).filter(q => q.type === 'spot').length + 1}`, on: true, color: '#fff4e6', intensity: 80, pos: [+(g[0] + 2).toFixed(2), +(gy + 4.5).toFixed(2), +(g[1] + 1.5).toFixed(2)], aim: [g[0], +gy.toFixed(2), g[1]], beam: 20, soft: 0.45, reach: 16, anim: { kind: 'none' }, ...extra }
      : { id: newLightId(), type: 'lamp', name: `Lamp ${(L.lights || []).filter(q => q.type === 'lamp').length + 1}`, on: true, color: '#ffc98a', intensity: 15, pos: [g[0], +(gy + 1.6).toFixed(2), g[1]], reach: 8, anim: { kind: 'none' }, ...extra };
    L.lights = L.lights || []; L.lights.push(l);
    return l;
  }
  function tabLights() {
    const k = L.look;
    body.append(...viewRow(),
      heading('Mood'),
      h('div', { class: 'muted' }, 'One click sets sky, sun, fog and picture colour together. Fine-tune below. (A Story step can fade between moods.)'),
      row(...Object.entries(MOODS).map(([key, m]) => btn(m.label, () => {
        snapshot(); Object.assign(k, structuredClone(m.look)); apply('look'); msg(`Mood: ${m.label}. Not saved yet.`);
      }, { cls: 'mini' }))),
      heading('Sun'),
      slider('Sun direction (°)', () => k.sunAz ?? -40, v => { k.sunAz = v; k.sunElev = k.sunElev ?? 55; }, -180, 180, 1, 'look'),
      slider('Sun height (°)', () => k.sunElev ?? 55, v => { k.sunElev = v; k.sunAz = k.sunAz ?? -40; }, 0, 90, 1, 'look'),
      colorCtl('Sun colour', () => k.sunColor ?? '#eef3ff', v => { k.sunColor = v; }, 'look'),
      slider('Sun strength', () => k.sun ?? 1.4, v => { k.sun = v; }, 0, 5, 0.05, 'look'),
      heading('Sky light'),
      colorCtl('Sky colour', () => k.skyColor ?? '#e3ebf5', v => { k.skyColor = v; }, 'look'),
      colorCtl('Ground bounce', () => k.groundColor ?? '#8d939c', v => { k.groundColor = v; }, 'look'),
      slider('Sky strength', () => k.ambient ?? 1.6, v => { k.ambient = v; }, 0, 4, 0.05, 'look'),
      slider('Exposure', () => k.exposure, v => { k.exposure = v; }, 0.3, 2.5, 0.01, 'look'));
    if (ctx.backdrop === 'depth' || ctx.backdrop === 'layers') body.append(heading('Picture'),
      h('div', { class: 'muted' }, 'The 2.5D picture is not lit by lights (they light models and objects). Tint it to match the mood.'),
      colorCtl('Picture tint', () => k.pictureTint ?? '#ffffff', v => { k.pictureTint = v; }, 'look'),
      slider('Picture brightness', () => k.pictureBrightness ?? 1, v => { k.pictureBrightness = v; }, 0.1, 1.6, 0.01, 'look'));
    if (ctx.backdrop === 'depth' || ctx.backdrop === 'splat') body.append(slider('Window glow', () => k.warmIntensity ?? 6, v => { k.warmIntensity = v; }, 0, 20, 0.5, 'look'));

    body.append(heading('Lights'),
      row(btn('+ Spotlight', () => { snapshot(); const l = addLight('spot'); lightPart = 'pos'; apply('lights'); selectLight(l.id); msg('Spotlight added. Drag the bulb to move it, the small dot to aim it.'); }),
        btn('+ Lamp', () => { snapshot(); const l = addLight('lamp'); lightPart = 'pos'; apply('lights'); selectLight(l.id); msg('Lamp added: it glows all around. Drag it with the arrows.'); }),
        btn('+ Show lights', () => {
          snapshot(); let last;
          [['#ff4f9a', -3.5, 0], ['#4f8bff', 3.5, 1.7], ['#fff4e6', 0, 3.4]].forEach(([c, dx, ph], i) => {
            last = addLight('spot', { name: `Show light ${i + 1}`, color: c, intensity: 120, beam: 16, anim: { kind: i === 2 ? 'follow' : 'sweep', speed: 0.8 + ph * 0.1, amount: 0.5, who: 'auto' } });
            last.pos = [+(last.aim[0] + dx).toFixed(2), +(last.pos[1] + 1).toFixed(2), +(last.aim[2] + 2.5).toFixed(2)];
          });
          apply('lights'); selectLight(last.id); msg('Three show lights: two sweep, one follows whoever performs. Try the Show mood with them.');
        })));
    const list = L.lights || [];
    const ll = h('div', { class: 'list' });
    list.forEach(l => {
      const on = h('input', { type: 'checkbox' }); on.checked = l.on !== false;
      on.addEventListener('click', ev => ev.stopPropagation());
      on.addEventListener('change', () => { snapshot(); l.on = on.checked; apply(l.shadow ? 'lights' : 'look'); });
      ll.append(h('div', { class: 'item' + (sel?.kind === 'light' && sel.id === l.id ? ' on' : ''), onclick: () => { lightPart = 'pos'; selectLight(l.id); } },
        h('span', { class: 'dot', style: `background:${l.color}` }), h('span', { class: 'grow' }, lightName(l)),
        h('span', { class: 'muted' }, l.anim?.kind && l.anim.kind !== 'none' ? ANIMS.find(a => a[0] === l.anim.kind)?.[1].split(' ')[0] : ''), on));
    });
    if (!list.length) ll.append(h('div', { class: 'muted' }, 'No lights yet. Lights shine on models and objects (and the stage); they show as glowing dots while this tab is open.'));
    body.append(ll);
    const l = sel?.kind === 'light' ? lightById(sel.id) : null;
    if (!l) return;
    l.anim = l.anim || { kind: 'none' };
    const spot = l.type === 'spot', a = l.anim;
    const card = h('div', { class: 'card' },
      textCtl('Name', () => l.name, v => { l.name = v; }),
      spot ? row(btn('Move light', () => { lightPart = 'pos'; attachGizmo(); }, { on: lightPart === 'pos' }), btn('Move aim', () => { lightPart = 'aim'; attachGizmo(); }, { on: lightPart === 'aim' })) : '',
      h('div', { class: 'muted' }, spot ? 'Drag the arrows in the scene. The big dot is the light, the small dot is where it points.' : 'Drag the arrows in the scene to move the lamp.'),
      colorCtl('Colour', () => l.color, v => { l.color = v; }, 'look'),
      slider('Strength', () => l.intensity ?? (spot ? 80 : 15), v => { l.intensity = v; }, 0, spot ? 400 : 100, 1, 'look'),
      slider('Reach (m)', () => l.reach ?? (spot ? 16 : 8), v => { l.reach = v; }, 1, 50, 0.5, 'look'));
    if (spot) card.append(
      slider('Beam width (°)', () => l.beam ?? 20, v => { l.beam = v; }, 3, 70, 1, 'look'),
      slider('Soft edge', () => l.soft ?? 0.45, v => { l.soft = v; }, 0, 1, 0.01, 'look'),
      checkCtl('Shadows', () => l.shadow, v => { l.shadow = v || undefined; }, 'lights'));
    card.append(selectCtl('Animation', ANIMS.filter(([kk]) => spot || (kk !== 'sweep' && kk !== 'follow')), () => a.kind || 'none', v => { a.kind = v; if (v === 'follow') a.who = a.who || 'auto'; }, 'look'));
    if (a.kind && a.kind !== 'none') {
      if (a.kind === 'follow') card.append(selectCtl('Follows', [['auto', 'Whoever performs'], ...who()], () => a.who || 'auto', v => { a.who = v; }, 'look'));
      card.append(slider('Speed', () => a.speed ?? 1, v => { a.speed = v; }, 0.1, 4, 0.05, 'look'));
      if (a.kind !== 'follow' && a.kind !== 'rainbow') card.append(slider('Amount', () => a.amount ?? 0.5, v => { a.amount = v; }, 0, 1, 0.01, 'look'));
      if (a.kind === 'follow') card.append(h('div', { class: 'muted' }, 'Aims at the model while the story plays (between steps it keeps its own aim).'));
    }
    card.append(row(
      btn('Duplicate', () => { snapshot(); const c = structuredClone(l); c.id = newLightId(); c.name = lightName(l) + ' copy'; c.pos = [c.pos[0] + 1, c.pos[1], c.pos[2]]; L.lights.push(c); apply('lights'); selectLight(c.id); }),
      btn('Delete', () => { snapshot(); tc.detach(); L.lights = L.lights.filter(q => q !== l); sel = null; apply('lights'); refresh(); }, { cls: 'warn' })));
    body.append(card);
  }

  function tabLook() {
    const c = L.camera, k = L.look;
    body.append(...viewRow(), heading('Hero camera'),
      slider('Parallax (m)', () => c.parallax, v => { c.parallax = v; }, 0, ctx.backdrop === 'depth' ? 0.3 : 0.8, 0.01, 'look'),
      slider('Drift (m)', () => c.drift, v => { c.drift = v; }, 0, 0.2, 0.005, 'look'));
    const builtEnv = ctx.backdrop === 'stage' || ctx.backdrop === 'glb';
    if (builtEnv) body.append(
      row(btn('Use current view as hero camera', () => { snapshot(); const s = ctx.currentShot(); c.pos = s.pos; c.target = s.target; c.fov = s.fov; apply('camera'); ctx.setView('hero'); })),
      h('div', { class: 'muted' }, 'Frame it in Free view first (right-drag to orbit, wheel to zoom).'),
      slider('Field of view', () => c.fov, v => { c.fov = v; }, 20, 75, 0.5, 'camera'));
    else if (ctx.backdrop !== 'depth') body.append(
      slider('Field of view', () => c.fov, v => { c.fov = v; }, 20, 75, 0.5, 'camera'),
      slider('Tilt', () => c.pitch, v => { c.pitch = v; }, -35, 10, 0.5, 'camera'),
      slider('Turn', () => c.yaw, v => { c.yaw = v; }, -60, 60, 0.5, 'camera'));
    else body.append(h('div', { class: 'muted' }, 'The image backdrop fixes the view; framing comes from the image.'));
    c.handheld = c.handheld || {};
    const feel = ctx.cameraFeel();
    const FEELS = {
      still: { label: 'Still', note: 'Locked off, no movement.', hh: { amount: 0, rotate: 0, speed: 1, breathe: 0 }, parallax: 0, drift: 0 },
      gentle: { label: 'Gentle', note: 'Barely moves: a slow breath and soft parallax. Best for 2.5D pictures.', hh: { amount: 0.25, rotate: 0.25, speed: 0.6, breathe: 0.04, breathePeriod: 18 }, parallax: 0.08, drift: 0.02 },
      handheld: { label: 'Handheld', note: 'Someone holding the camera: alive but calm.', hh: { amount: 0.6, rotate: 1, speed: 1, breathe: 0 }, parallax: 0.15, drift: 0.03 },
      show: { label: 'Show', note: 'Energetic. Add a Director camera step in Story for several operators.', hh: { amount: 0.9, rotate: 1, speed: 1.25, breathe: 0 }, parallax: 0.2, drift: 0.04 }
    };
    const current = Object.entries(FEELS).find(([, f]) => Math.abs((feel.amount) - f.hh.amount) < 0.01 && Math.abs(feel.breathe - (f.hh.breathe || 0)) < 0.005 && Math.abs(feel.rotate - f.hh.rotate) < 0.01)?.[0];
    body.append(heading('Camera feel'),
      row(...Object.entries(FEELS).map(([k, f]) => btn(f.label, () => {
        snapshot(); c.handheld = { ...f.hh }; c.parallax = f.parallax; c.drift = f.drift; apply('look');
        if (!ctx.live().on) ctx.previewLive(10);
        msg(`Camera feel: ${f.label}. ${f.note}${ctx.live().on ? '' : ' Playing it for 10 s.'}`);
      }, { on: current === k }))),
      h('div', { class: 'muted' }, current ? FEELS[current].note : 'Custom mix. (The camera stays calm while you edit; the feel plays in the player and in story preview.)'),
      slider('Handheld sway', () => c.handheld.amount ?? feel.amount, v => { c.handheld.amount = v; }, 0, 2, 0.05, 'look'),
      slider('Tilt in sway', () => c.handheld.rotate ?? feel.rotate, v => { c.handheld.rotate = v; }, 0, 1, 0.05, 'look'),
      slider('Sway speed', () => c.handheld.speed ?? feel.speed, v => { c.handheld.speed = v; }, 0.2, 3, 0.05, 'look'),
      slider('Breathing (m)', () => c.handheld.breathe ?? feel.breathe, v => { c.handheld.breathe = v; }, 0, 0.3, 0.005, 'look'),
      slider('Breath length (s)', () => c.handheld.breathePeriod ?? feel.period, v => { c.handheld.breathePeriod = v; }, 4, 60, 1, 'look'));
    body.append(heading('Light'),
      row(btn('Open the Lights tab (mood, sun, spotlights) →', () => { tab = 'lights'; })),
      heading('Snowfall'),
      slider('Amount', () => k.snow, v => { k.snow = v; }, 0, 3, 0.05, 'snow'),
      slider('Fall speed', () => k.snowSpeed ?? 1, v => { k.snowSpeed = v; }, 0.1, 3, 0.05, 'look'),
      slider('Flake size', () => k.snowSize ?? 1, v => { k.snowSize = v; }, 0.3, 3, 0.05, 'look'),
      slider('Wind (m/s)', () => k.wind ?? 0.3, v => { k.wind = v; }, 0, 6, 0.05, 'look'),
      slider('Wind direction (°)', () => k.windDir ?? 0, v => { k.windDir = v; }, -180, 180, 5, 'look'),
      slider('Gusts', () => k.gusts ?? 0.4, v => { k.gusts = v; }, 0, 1, 0.05, 'look'),
      heading('Fog'),
      colorCtl('Colour', () => k.fog, v => { k.fog = v; }, 'look'),
      checkCtl('Fog on the 2.5D picture / layers', () => k.pictureFog !== false, v => { k.pictureFog = v; }, 'look'),
      slider('Starts at (m)', () => k.fogNear, v => { k.fogNear = v; }, 0, 60, 0.5, 'look'),
      slider('Full at (m)', () => k.fogFar, v => { k.fogFar = v; }, 5, 150, 1, 'look'));
    if (ctx.backdrop === 'splat') body.append(heading('Splat colour'),
      slider('Saturation', () => L.splat.saturation, v => { L.splat.saturation = v; }, 0, 1.6, 0.01, 'look'),
      slider('Brightness', () => L.splat.brightness, v => { L.splat.brightness = v; }, 0.5, 1.6, 0.01, 'look'),
      colorCtl('Tint', () => L.splat.tint, v => { L.splat.tint = v; }, 'look'));
  }

  // ============================================================ files: download / upload environment layers
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const pickFile = accept => new Promise(res => { const i = h('input', { type: 'file', accept }); i.onchange = () => res(i.files[0] || null); i.click(); });
  const fetchBlob = async path => { const r = await fetch(`${ctx.world}/${path}?v=${Date.now()}`); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.blob(); };
  const imgSize = async blob => { const b = await createImageBitmap(blob); const s = [b.width, b.height]; b.close(); return s; };
  async function toJpeg(file, w, h) {
    const bmp = await createImageBitmap(file); const c = new OffscreenCanvas(w || bmp.width, h || bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  }
  // our depth format: millimetres, high byte in R, low byte in G (8-bit RGB PNG)
  async function readDepthMM(blob) {
    const png = await decodePNG(await blob.arrayBuffer()), mm = new Uint16Array(png.w * png.h);
    if (png.channels === 1 && png.bitDepth === 16) { for (let y = 0; y < png.h; y++) for (let x = 0; x < png.w; x++) mm[y * png.w + x] = png.get(x, y, 0); }
    else if (png.channels >= 3 && png.bitDepth === 8) { for (let y = 0; y < png.h; y++) for (let x = 0; x < png.w; x++) mm[y * png.w + x] = png.get(x, y, 0) * 256 + png.get(x, y, 1); }
    else throw new Error('Depth must be a 16-bit greyscale PNG in millimetres (as downloaded here)');
    return { w: png.w, h: png.h, mm };
  }
  async function writeDepthRG({ w, h, mm }) {
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h);
    for (let i = 0; i < mm.length; i++) { const v = Math.max(1, mm[i]); im.data[i * 4] = v >> 8; im.data[i * 4 + 1] = v & 255; im.data[i * 4 + 2] = 0; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c.convertToBlob({ type: 'image/png' });
  }
  const busy = async (label, fn) => { msg(label + '…'); try { msg(await fn()); } catch (e) { msg('Failed: ' + e.message); } };
  const LAYERS = [
    { key: 'color', file: 'color.jpg', name: 'Image (front layer)', kind: 'image', note: 'What you see. Retouch freely, keep the same framing.' },
    { key: 'color_bg', file: 'color_bg.jpg', name: 'Background fill', kind: 'image', note: 'Shows through behind edges when the camera moves. Paint what is hidden behind objects.' },
    { key: 'depth', file: 'depth.png', name: 'Depth (front)', kind: 'depth', note: '16-bit greyscale, millimetres from the camera. Brighter = farther.' },
    { key: 'depth_bg', file: 'depth_bg.png', name: 'Depth (background)', kind: 'depth', note: 'Same, for the background fill (keep it a little farther than the front).' }
  ];
  async function downloadLayer(L1) {
    const path = ctx.files.backdropDir + L1.file;
    if (L1.kind === 'image') { download(await fetchBlob(path), L1.file); return `Downloaded ${L1.file}`; }
    const d = await readDepthMM(await fetchBlob(path));
    download(await encodeGray16(d.w, d.h, d.mm), L1.key + '_mm16.png');
    return `Downloaded ${L1.key}_mm16.png (16-bit, millimetres)`;
  }
  async function uploadLayer(L1) {
    const f = await pickFile(L1.kind === 'image' ? 'image/*' : 'image/png'); if (!f) return 'Cancelled';
    const path = ctx.files.backdropDir + L1.file;
    const cur = L1.kind === 'image' ? await imgSize(await fetchBlob(ctx.files.backdropDir + 'color.jpg')) : null;
    let blob;
    if (L1.kind === 'image') {
      const [w, h] = await imgSize(f), [cw, ch] = cur;
      if (Math.abs(w / h - cw / ch) > 0.01) throw new Error(`aspect ${w}x${h} does not match the backdrop (${cw}x${ch}); keep the same framing`);
      const bgw = Math.min(2048, cw); // background layer: picture resolution, up to 2048 px
      blob = await toJpeg(f, L1.key === 'color_bg' ? bgw : null, L1.key === 'color_bg' ? Math.round(bgw * ch / cw) : null);
    } else {
      const d = await readDepthMM(f), ref = await readDepthMM(await fetchBlob(ctx.files.backdropDir + 'depth.png'));
      if (Math.abs(d.w / d.h - ref.w / ref.h) > 0.01) throw new Error(`aspect ${d.w}x${d.h} does not match the depth map (${ref.w}x${ref.h})`);
      blob = await writeDepthRG(d);
    }
    const at = await ctx.put(path, blob, blob.type);
    await ctx.reloadBackdrop(); redraw();
    return `${L1.name} replaced at ${at} (previous kept as ${L1.file}.bak)`;
  }
  function envSection() {
    const env = ctx.envInfo();
    const label = { glb: `3D model: ${env.file}`, stage: 'Lit stage (built in)', depth: 'Image backdrop (2.5D)', layers: 'Picture layers (2.5D)', splat: 'Marble splat world' }[env.mode] || env.mode;
    const card = h('div', { class: 'card' },
      h('div', {}, 'Now: ', h('b', {}, label)),
      h('div', { class: 'muted' }, 'Upload a GLB of the place (a room, a park, a stage set). Models walk on its floors; draw walk areas in the Draw tab.'),
      row(fileInput('Upload environment (GLB)', '.glb,model/gltf-binary', f => busy('Uploading ' + f.name, async () => {
        if (!confirm('Switch this scene to the uploaded 3D environment? Your changes are saved first and the editor reloads.')) return 'Cancelled';
        const name = `env/${slug(f.name)}.glb`;
        await ctx.put(name, f, 'model/gltf-binary');
        await ctx.setEnvironment({ glb: name });
        return 'Reloading…';
      })), ...(env.mode !== 'stage' ? [btn('Use lit stage', () => busy('Switching', async () => {
        if (!confirm('Switch this scene to the built-in lit stage? Your changes are saved first and the editor reloads.')) return 'Cancelled';
        await ctx.setEnvironment({ stage: true }); return 'Reloading…';
      }))] : [])));
    if (env.mode === 'glb') {
      const t = env.transform;
      const n = (label, key, min, max, step) => numberCtl(label, () => t[key], v => { ctx.setEnvTransform({ [key]: v ?? (key === 'scale' ? 1 : 0) }); msg('Unsaved changes'); }, min, max, step);
      card.append(h('div', { class: 'muted' }, 'If the place looks too big, small, turned or below the floor:'),
        n('Scale', 'scale', 0.001, 1000, 0.01), n('Turn (°)', 'rotY', -180, 180, 1), n('Lift (m)', 'y', -50, 50, 0.05),
        n('Shift X (m)', 'x', -100, 100, 0.1), n('Shift Z (m)', 'z', -100, 100, 0.1));
    }
    return [heading('Environment'), card, ...layersSection(env), ...pictureSection(env)];
  }
  // ---------- picture -> 2.5D (depth made here in the browser)
  let building = false, depthView = false, splitCount = 4;
  const depthOpts = () => ({ modelUrl: ctx.depth?.modelUrl || undefined, inpaintModelUrl: ctx.depth?.inpaintModelUrl || undefined, wasmPaths: ctx.depth?.wasmPaths || undefined, onProgress: m => msg(m) });
  async function putAll(files) { let n = 0; for (const [name, blob] of Object.entries(files)) { msg(`Saving ${++n}/${Object.keys(files).length}…`); await ctx.put(name, blob, blob.type || 'application/octet-stream'); } }
  // ---------- layered 2.5D: your own PNGs (with transparency) at chosen distances
  function fileInputMulti(label, accept, onFiles) {
    const i = h('input', { type: 'file', accept, multiple: '', style: 'display:none' });
    i.addEventListener('change', () => { const fs = [...(i.files || [])]; i.value = ''; if (fs.length) onFiles(fs); });
    const b = h('button', {}, label); b.onclick = () => i.click();
    return h('span', { style: 'display:contents' }, b, i);
  }
  const layerById = id => ldef?.layers.find(l => l.id === id);
  const selectLayer = id => { sel = id ? { kind: 'layer', id } : null; tool = 'select'; refresh(); };
  let layerSeq = 0;
  // upload images and turn them into layers: same size as the frame = whole-frame layer, smaller = a piece
  async function addLayerImages(def, files) {
    const items = [];
    for (const f of files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
      const bmp = await createImageBitmap(f); const w = bmp.width, hh = bmp.height; bmp.close();
      const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace('jpeg', 'jpg');
      const name = `layers/${slug(f.name.replace(/\.[^.]+$/, ''))}_${Date.now().toString(36)}${layerSeq++}.${ext}`;
      msg(`Uploading ${f.name}…`);
      await ctx.put(name, f, f.type || 'image/png');
      items.push({ f, name, w, h: hh });
    }
    if (!def.width) { const big = items.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)); def.width = big.w; def.height = big.h; }
    const A = def.width / def.height;
    const frames = items.filter(it => Math.abs(it.w / it.h - A) < 0.01 && it.w >= def.width * 0.5), pieces = items.filter(it => !frames.includes(it));
    const n = frames.length, haveFrames = def.layers.some(l => l.fit !== 'piece');
    frames.forEach((it, i) => def.layers.push({
      id: `layer_${Date.now().toString(36)}_${layerSeq++}`, name: it.f.name.replace(/\.[^.]+$/, ''), file: it.name, fit: 'frame',
      // first file (by name) is the farthest; spread from 40 m to 4 m
      distance: +(haveFrames ? 8 : n === 1 ? 30 : 40 * Math.pow(4 / 40, i / (n - 1))).toFixed(2), visible: true
    }));
    pieces.forEach((it, i) => def.layers.push({
      id: `layer_${Date.now().toString(36)}_${layerSeq++}`, name: it.f.name.replace(/\.[^.]+$/, ''), file: it.name, fit: 'piece',
      x: +(0.5 + (i - (pieces.length - 1) / 2) * 0.12).toFixed(3), y: 0.6, size: +Math.min(0.6, it.w / def.width).toFixed(3), distance: 6, visible: true
    }));
    return items.length;
  }
  async function makeLayerDepth(l) {
    const { estimateDisparity } = await import('./picture.js');
    const { encodeGray16 } = await import('./png16.js');
    const bmp = await createImageBitmap(await fetchBlob(l.file));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0); // transparent parts: neutral grey
    const flat = await createImageBitmap(c);
    const disp = await estimateDisparity(flat, depthOpts()); flat.close();
    // the layer's own alpha at the depth size: normalise over the visible pixels only
    const ac = new OffscreenCanvas(disp.w, disp.h), ag = ac.getContext('2d', { willReadFrequently: true }); ag.drawImage(bmp, 0, 0, disp.w, disp.h); bmp.close();
    const al = ag.getImageData(0, 0, disp.w, disp.h).data, vis = [];
    for (let i = 0; i < disp.d.length; i++) if (al[i * 4 + 3] > 128) vis.push(disp.d[i]);
    if (vis.length < 20) throw new Error('this layer is almost empty');
    vis.sort((a, b) => a - b);
    const lo = vis[Math.floor(vis.length * 0.02)], hi = Math.max(lo + 1e-6, vis[Math.floor(vis.length * 0.98)]), mid = vis[vis.length >> 1];
    const q = new Uint16Array(disp.d.length);
    for (let i = 0; i < q.length; i++) { const v = al[i * 4 + 3] > 128 ? disp.d[i] : mid; q[i] = Math.round(Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * 65535); }
    const name = l.file.replace(/\.[^.]+$/, '') + '_disp.png';
    await ctx.put(name, await encodeGray16(disp.w, disp.h, q), 'image/png');
    l.disp = name; if (!(l.relief > 0)) l.relief = 0.5;
    await ctx.setLayers(ldef, { forget: [name] });
  }
  // automatic layers: save the files, switch the scene to layers and reload
  async function useLayers(res, label) {
    await putAll(res.files);
    await ctx.put('layers/layers.json', new Blob([JSON.stringify(res.def, null, 2)], { type: 'application/json' }), 'application/json');
    await ctx.updateSceneFiles({ files: { layers: 'layers/layers.json', backdrop: null, environment: null, splats: null, collider: null }, top: { environment: null, start: null } }, { reload: true });
    return `${label}: ${res.def.layers.length} layers. Reloading…`;
  }
  function splitIntoLayers(meta, fit) {
    if (building) return;
    if (!confirm(`Split this picture into ${splitCount} layers? It takes a while (AI fill for each layer). Your changes are saved first and the editor reloads with the layers.`)) return;
    busy('Splitting into layers', async () => {
      building = true;
      try {
        const { backdropToLayers } = await import('./picture.js');
        const res = await backdropToLayers(name => fetchBlob(ctx.files.backdropDir + name), meta, fit, { ...depthOpts(), count: splitCount });
        return useLayers(res, 'Split');
      } finally { building = false; }
    });
  }
  function layersSection(env) {
    const start = ctx.startHint === 'layers' && env.mode !== 'layers';
    const out = [heading('2.5D from your own layers')];
    if (env.mode !== 'layers') {
      out.push(h('div', { class: 'card', style: start ? 'border-color:#5b8fc0;box-shadow:0 0 0 2px rgba(91,143,192,.35)' : '' },
        h('div', { class: 'muted' }, 'Layers stand at their own distances, like flats on a stage. Make them automatically from one picture (depth + AI fill behind each layer, a minute or more), then move, retouch or replace them one by one.'),
        row(fileInput('Make layers from one picture…', 'image/jpeg,image/png,image/webp', f => {
          if (building) return;
          if (!start && !confirm(`Turn this picture into ${splitCount} editable layers? Depth and AI fill run here in the browser (a minute or more). Your changes are saved first and the editor reloads.`)) return;
          busy('Reading the picture', async () => {
            building = true;
            try {
              const { pictureToLayers } = await import('./picture.js');
              return useLayers(await pictureToLayers(f, DEFAULT_FIT, { ...depthOpts(), count: splitCount }), 'Made');
            } finally { building = false; }
          });
        }), selectCtl('Layers', [[3, '3'], [4, '4'], [5, '5']], () => splitCount, v => { splitCount = +v; }, 'none')),
        h('div', { class: 'muted' }, 'Or use your own prepared images (PNG/WebP with transparency): sky, hills, house, bushes… Pictures the size of the whole composition fill the frame (the first by name is the farthest); smaller ones become pieces you place by hand.'),
        row(fileInputMulti(start ? 'Choose layer images…' : 'Make from layer images…', 'image/png,image/webp,image/jpeg', fs => {
          if (building) return;
          if (!start && !confirm('Switch this scene to picture layers? Your changes are saved first and the editor reloads.')) return;
          busy('Making layers', async () => {
            building = true;
            try {
              const def = { camera: { ...LAYERS_DEFAULT_CAMERA }, width: 0, height: 0, layers: [] };
              const n = await addLayerImages(def, fs);
              await ctx.put('layers/layers.json', new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' }), 'application/json');
              await ctx.updateSceneFiles({ files: { layers: 'layers/layers.json', backdrop: null, environment: null, splats: null, collider: null }, top: { environment: null, start: null } }, { reload: true });
              return `${n} layers made. Reloading…`;
            } finally { building = false; }
          });
        }))));
      return out;
    }
    if (!ldef) ldef = ctx.layers() || { layers: [] };
    const cam = ldef.camera = { ...LAYERS_DEFAULT_CAMERA, ...(ldef.camera || {}) };
    out.push(h('div', { class: 'card' },
      h('div', { class: 'muted' }, 'Click a layer in the view to select it. Pieces: drag to move, mouse wheel to resize (Alt + wheel: nearer / farther). Use Look from the side to see the stack.'),
      row(fileInputMulti('Add layer images…', 'image/png,image/webp,image/jpeg', fs => busy('Adding layers', async () => {
        snapshot(); const n = await addLayerImages(ldef, fs); await ctx.setLayers(ldef); refresh(); return `Added ${n} layer${n > 1 ? 's' : ''}. Save to keep the arrangement.`;
      })), btn('Look from the side', () => { ctx.lookFromSide(); redraw(); msg('Side view: the layers as flats on a stage. “Back to camera” returns.'); }),
      btn('Back to camera', () => { ctx.setView('hero'); redraw(); })),
      h('b', { style: 'display:block;margin-top:8px' }, 'Camera'),
      numberCtl('Lens (vertical °)', () => cam.vfov, v => { if (v) { snapshot(); cam.vfov = v; apply('layers'); } }, 10, 100, 1),
      numberCtl('Camera height (m)', () => cam.position[1], v => { if (v != null) { snapshot(); cam.position = [0, v, 0]; apply('layers'); } }, 0.1, 50, 0.05),
      numberCtl('Camera tilt (°)', () => cam.pitch, v => { if (v != null) { snapshot(); cam.pitch = v; apply('layers'); } }, -60, 30, 0.5)));
    const list = [...ldef.layers].sort((a, b) => (b.distance ?? 0) - (a.distance ?? 0));
    const ll = h('div', { class: 'list' });
    for (const l of list) {
      const vis = h('input', { type: 'checkbox' }); vis.checked = l.visible !== false;
      vis.addEventListener('click', ev => ev.stopPropagation());
      vis.addEventListener('change', () => { snapshot(); l.visible = vis.checked; apply('layers'); });
      ll.append(h('div', { class: 'item' + (sel?.kind === 'layer' && sel.id === l.id ? ' on' : ''), onclick: () => selectLayer(l.id) },
        h('span', { class: 'dot', style: `background:${l.floor ? '#5dff86' : l.fit === 'piece' ? '#ff9a3c' : '#5b8fc0'}` }),
        h('span', { class: 'grow' }, l.name || 'Layer'), h('span', { class: 'muted' }, `${(l.distance ?? 0).toFixed(1)} m${l.floor ? ' · ground' : ''}`), vis));
    }
    if (!list.length) ll.append(h('div', { class: 'muted' }, 'No layers yet.'));
    out.push(h('div', { class: 'muted', style: 'margin-top:6px' }, 'Far to near:'), ll);
    const l = sel?.kind === 'layer' ? layerById(sel.id) : null;
    if (l) {
      const card = h('div', { class: 'card' },
        textCtl('Name', () => l.name, v => { l.name = v; }),
        selectCtl('Fits', [['frame', 'The whole frame'], ['piece', 'A piece I place']], () => l.fit || 'frame', v => { l.fit = v; if (v === 'piece') { l.x = l.x ?? 0.5; l.y = l.y ?? 0.5; l.size = l.size ?? 0.4; } }, 'layers'),
        slider('Distance (m)', () => Math.log10(l.distance ?? 10), v => { l.distance = +Math.pow(10, v).toFixed(2); }, Math.log10(0.5), 2, 0.005, 'layers', v => Math.pow(10, +v).toFixed(1)),
        h('div', { class: 'muted' }, 'Farther = moves less when the camera moves. It still looks the same size from the camera.'));
      if (l.fit === 'piece') card.append(
        slider('Left ↔ right', () => l.x ?? 0.5, v => { l.x = v; }, -0.2, 1.2, 0.001, 'layers', v => Math.round(v * 100) + '%'),
        slider('Up ↕ down', () => l.y ?? 0.5, v => { l.y = v; }, -0.2, 1.2, 0.001, 'layers', v => Math.round(v * 100) + '%'),
        slider('Size', () => l.size ?? 0.3, v => { l.size = v; }, 0.02, 2, 0.001, 'layers', v => Math.round(v * 100) + '%'));
      card.append(
        slider('Relief', () => l.relief ?? 0, v => { l.relief = v; }, 0, 1, 0.01, 'layers'),
        h('div', { class: 'muted' }, l.disp ? 'Relief rounds the layer using its own depth (0 = flat cut-out).' : 'Flat cut-out. Make depth to give it some roundness.'),
        row(btn(l.disp ? 'Make depth again' : 'Make depth for this layer', () => { if (building) return; busy('Making depth', async () => { building = true; snapshot(); try { await makeLayerDepth(l); refresh(); return `Depth made for ${l.name}. Use Relief to set how round it is.`; } finally { building = false; } }); })),
        checkCtl('Ground (lies flat)', () => l.floor, v => { l.floor = v || undefined; }, 'layers'),
        h('div', { class: 'muted' }, 'Ground: below the horizon this layer lies on the floor, and models walk on it.'),
        row(fileInput('Replace image…', 'image/png,image/webp,image/jpeg', f => busy('Replacing', async () => {
          await ctx.put(l.file, f, f.type || 'image/png'); delete l.disp; await ctx.setLayers(ldef, { forget: [l.file] }); refresh(); return 'Image replaced (same place and distance).';
        })),
          btn('Nearer', () => { snapshot(); l.distance = +(l.distance * 0.8).toFixed(2); apply('layers'); refresh(); }),
          btn('Farther', () => { snapshot(); l.distance = +(l.distance * 1.25).toFixed(2); apply('layers'); refresh(); }),
          btn('Delete', () => { snapshot(); ldef.layers = ldef.layers.filter(q => q !== l); sel = null; apply('layers'); refresh(); }, { cls: 'warn' })));
      out.push(card);
    }
    return out;
  }
  function pictureSection(env) {
    const start = ctx.startHint === 'picture' && env.mode !== 'depth';
    if (env.mode === 'layers') return [];
    const out = [heading('2.5D from a picture')];
    out.push(h('div', { class: 'card', style: start ? 'border-color:#5b8fc0;box-shadow:0 0 0 2px rgba(91,143,192,.35)' : '' },
      h('div', { class: 'muted' }, start
        ? 'Start here: pick a picture (JPG/PNG, landscape works best). Its depth is worked out right here in the browser, the picture is split into a front layer and a filled-in background, and the scene becomes a 2.5D world with a little parallax. Takes ~30 s – 2 min; the depth model (~100 MB) downloads once.'
        : 'Turn a picture into a 2.5D world: depth is made here in the browser (no server, no Python). The ground at the bottom of the picture becomes the floor models walk on.'),
      row(fileInput(env.mode === 'depth' ? 'New picture…' : 'Make from a picture…', 'image/jpeg,image/png,image/webp', f => {
        if (building) return;
        if (!start && !confirm(env.mode === 'depth' ? 'Replace the picture and its depth? Your changes are saved first and the editor reloads.' : 'Switch this scene to a 2.5D picture world? Your changes are saved first and the editor reloads.')) return;
        busy('Reading the picture', async () => {
          building = true;
          try {
            const { pictureToBackdrop } = await import('./picture.js');
            const res = await pictureToBackdrop(f, DEFAULT_FIT, depthOpts());
            await putAll(res.files);
            await ctx.updateSceneFiles({ files: { backdrop: 'backdrop/backdrop.json', environment: null, splats: null, collider: null }, top: { environment: null, start: null } }, { reload: true });
            return `Done${res.filled === 'ai' ? ' (AI fill behind objects)' : ' (quick fill: AI fill was not available)'}${res.how === 'ground' ? '' : '; no clear ground at the bottom, used near/far instead'}. Reloading…`;
          } finally { building = false; }
        });
      }))));
    if (env.mode === 'depth' && ctx.files.backdropDir) {
      const card = h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Loading depth settings…'));
      out.push(card);
      fetchBlob(ctx.files.backdropDir + 'backdrop.json').then(b => b.text()).then(t => {
        const meta = JSON.parse(t), fit = { ...DEFAULT_FIT, ...(meta.fit || {}), vfov: meta.camera.vfov, pitch: meta.camera.pitch, height: meta.camera.position[1] };
        card.textContent = '';
        if (!meta.disparity) { card.append(h('div', { class: 'muted' }, 'This backdrop was made with the world tools. To adjust its depth here, make it again from a picture.')); return; }
        // every change rebuilds by itself (short pause first, so typing is not interrupted)
        let timer = 0, again = false;
        const rebuild = (ai = false) => {
          if (building) { again = true; return; }
          busy(ai ? 'AI fill behind objects' : 'Rebuilding the depth', async () => {
            building = true;
            try {
              const { refitBackdrop } = await import('./picture.js');
              const res = await refitBackdrop(name => fetchBlob(ctx.files.backdropDir + name), meta, fit, { ...depthOpts(), ...(ai ? { fill: 'ai' } : {}) });
              await putAll(Object.fromEntries(Object.entries(res.files).map(([k, v]) => [ctx.files.backdropDir + k.replace(/^backdrop\//, ''), v])));
              Object.assign(meta, res.meta);
              await ctx.reloadBackdrop(); redraw();
              return ai ? (res.filled === 'ai' ? 'AI fill done: what is hidden behind objects is painted in.' : 'AI fill was not available; quick fill used.') : `Depth rebuilt: ${fitText()}.`;
            } finally { building = false; if (again) { again = false; rebuild(); } }
          });
        };
        const fitText = () => `lens ${fit.vfov}°, camera ${fit.height} m high, tilt ${fit.pitch}°, farthest ${fit.far} m`;
        const later = () => { clearTimeout(timer); msg('Rebuilding in a moment…'); timer = setTimeout(rebuild, 700); };
        const n = (label, key, min, max, step) => {
          const c = numberCtl(label, () => fit[key], v => { if (v != null) { fit[key] = v; later(); } }, min, max, step);
          c.querySelector('input').addEventListener('input', e => { if (e.target.value !== '') { fit[key] = +e.target.value; later(); } });
          return c;
        };
        const chk = h('input', { type: 'checkbox' }); chk.checked = fit.ground !== false; chk.onchange = () => { fit.ground = chk.checked; later(); };
        card.append(h('b', {}, 'Adjust the depth'),
          h('div', { class: 'muted' }, `How the depth was scaled: ${meta.fit?.how === 'ground' ? 'from the ground at the bottom of the picture' : 'nearest/farthest distance'}. Too flat or too deep? Change these and rebuild (fast, no model run).`),
          n('Lens (vertical °)', 'vfov', 10, 100, 1), n('Camera height (m)', 'height', 0.1, 50, 0.05), n('Camera tilt (°)', 'pitch', -60, 30, 0.5),
          n('Farthest (m)', 'far', 5, 65, 1),
          n('Edge softness (0 = sharp cut)', 'soft', 0, 2, 0.1),
          h('label', { class: 'ctl c2' }, h('span', {}, 'Ground at bottom'), h('span', {}, chk)),
          n('Nearest (m, no ground)', 'near', 0.3, 30, 0.1),
          h('div', { class: 'muted' }, 'Changes rebuild by themselves. Smaller lens angle = flatter, farther picture. Taller camera = bigger, deeper world.'),
          h('b', { style: 'display:block;margin-top:8px' }, 'See the depth'),
          row(btn(depthView ? 'Show the picture' : 'Show depth colours', () => { depthView = !depthView; ctx.depthView(depthView); msg(depthView ? 'Depth colours: red = near, yellow/green = middle, blue = far. Smooth bands are good; sudden colour jumps are cuts.' : 'Showing the picture.'); }, { on: depthView }),
            btn('Look from the side', () => { ctx.lookFromSide(); redraw(); msg('Side view: the picture as a 3D relief. Right-drag to orbit, wheel to zoom. “Hero” goes back.'); }),
            btn('Back to camera', () => { ctx.setView('hero'); redraw(); })),
          h('div', { class: 'muted' }, 'Tip: turn on depth colours and look from the side, then change the numbers: the relief updates as you go.'),
          h('b', { style: 'display:block;margin-top:8px' }, 'Behind objects'),
          h('div', { class: 'muted' }, meta.fill === 'ai' ? 'Filled by AI (LaMa). After big depth changes, run it again for new gaps.' : 'Quick fill (smudged). The AI fill paints believable background behind objects.'),
          row(btn(meta.fill === 'ai' ? 'Run AI fill again' : 'AI fill behind objects', () => rebuild(true))),
          h('b', { style: 'display:block;margin-top:8px' }, 'Editable layers'),
          h('div', { class: 'muted' }, 'Split this picture into separate layers (far to near), each filled behind, so you can move, retouch or replace them one by one.'),
          row(selectCtl('Layers', [[3, '3'], [4, '4'], [5, '5']], () => splitCount, v => { splitCount = +v; }, 'none'),
            btn('Split into layers', () => splitIntoLayers(meta, fit))));
      }).catch(err => { card.textContent = 'Could not read the depth settings: ' + err.message; });
    }
    return out;
  }
  // one stored file: download it, replace it (same name, so references stay), or add it
  function fileCard(title, note, name, accept, { upload, remove, extra = [] } = {}) {
    return h('div', { class: 'card' }, h('b', {}, title), h('div', { class: 'muted' }, note),
      h('div', { class: 'muted' }, name ? `File: ${name}` : 'No file yet'),
      row(...(name ? [btn('Download', () => busy('Preparing', async () => { download(await fetchBlob(name), name.split('/').pop()); return `Downloaded ${name.split('/').pop()}`; }))] : []),
        ...(upload ? [fileInput(name ? 'Replace…' : 'Upload…', accept, f => busy('Uploading ' + f.name, () => upload(f)))] : []),
        ...(name && remove ? [btn('Remove', () => busy('Removing', remove), { cls: 'warn' })] : []),
        ...extra));
  }
  const extOf = f => (f.name.split('.').pop() || '').toLowerCase();
  function tabFiles() {
    const files = ctx.sceneFiles();
    body.append(...envSection());
    if (files.mode === 'glb' && files.environment) body.append(fileCard('Environment GLB', 'The place itself.', files.environment, '.glb', {
      upload: async f => { await ctx.put(files.environment, f, 'model/gltf-binary'); return ctx.setEnvironment({ glb: files.environment }).then(() => 'Reloading…'); } }));

    body.append(heading('Background'), fileCard('360° background image', 'A 2:1 panorama (JPG or PNG) behind everything; also lights the scene and shows in water. Without it: a plain sky or the stage colour.', files.pano || null, 'image/*', {
      upload: async f => {
        const name = files.pano || 'sky/pano.jpg';
        const at = await ctx.put(name, await toJpeg(f, 2048, 1024), 'image/jpeg');
        if (!files.pano) await ctx.updateSceneFiles({ files: { pano: name } });
        await ctx.reloadSky(); refresh(); return `Background replaced at ${at}`;
      },
      remove: async () => { await ctx.updateSceneFiles({ files: { pano: null } }); ctx.clearSky(); refresh(); return 'Background removed'; }
    }));

    body.append(heading('Image backdrop layers'));
    if (files.mode !== 'depth' || !ctx.files.backdropDir) body.append(h('div', { class: 'muted' }, files.mode === 'splat' ? 'This world uses the splat. Open it without ?backdrop=splat if it also has an image backdrop.' : 'Only for image-backdrop (2.5D) worlds made with the world tools.'));
    else for (const L1 of LAYERS) body.append(h('div', { class: 'card' }, h('b', {}, L1.name), h('div', { class: 'muted' }, L1.note),
      row(btn('Download', () => busy('Preparing', () => downloadLayer(L1))), btn('Upload…', () => busy('Uploading', () => uploadLayer(L1))))));

    body.append(heading('3D Gaussian splats'));
    const sets = Object.entries(files.splats || {});
    for (const [key, val] of sets) for (const name of [].concat(val)) body.append(fileCard(`Splat (${key})`, 'A Marble / 3DGS world in .spz.', name, '.spz', {
      upload: async f => { if (extOf(f) !== 'spz') throw new Error('Pick a .spz file'); await ctx.put(name, f, 'application/octet-stream'); await ctx.reloadSplats(); return `Replaced ${name}`; }
    }));
    body.append(h('div', { class: 'card' }, h('div', { class: 'muted' }, sets.length ? 'Add another splat file as the main set:' : 'Use a 3D Gaussian splat (.spz) as this scene’s world. The scene switches to it and the editor reloads.'),
      row(fileInput(sets.length ? 'Upload splat (.spz)…' : 'Use a splat world (.spz)…', '.spz', f => busy('Uploading ' + f.name, async () => {
        if (extOf(f) !== 'spz') throw new Error('Pick a .spz file');
        if (!sets.length && !confirm('Switch this scene to the splat world? Your changes are saved first and the editor reloads.')) return 'Cancelled';
        const name = `splats/${slug(f.name.replace(/\.spz$/i, ''))}.spz`;
        await ctx.put(name, f, 'application/octet-stream');
        await ctx.updateSceneFiles({ files: { splats: { ...(files.splats || {}), full_res: name }, ...(sets.length ? {} : { environment: null, backdrop: null }) }, top: sets.length ? {} : { environment: null } }, { reload: true });
        return 'Reloading…';
      })))));
    if (files.mode === 'splat') body.append(fileCard('Collision surface (GLB)', 'Optional ground mesh for the splat world, so models walk on it (Marble’s collider.glb).', files.collider || null, '.glb', {
      upload: async f => { const name = files.collider || 'splats/collider.glb'; await ctx.put(name, f, 'model/gltf-binary'); return ctx.updateSceneFiles({ files: { collider: name } }, { reload: true }).then(() => 'Reloading…'); }
    }));

    body.append(heading('Models'));
    const cast = ctx.getCast();
    if (!cast.length) body.append(h('div', { class: 'muted' }, 'No models yet: add them in the Models tab.'));
    for (const ch of cast) body.append(fileCard(ch.name || ch.id, ch.file ? 'Rigged GLB with its animations.' : 'Stand-in capsule (no file yet).', ch.file || null, '.glb', {
      upload: async f => {
        const name = ch.file || `cast/${slug(ch.id)}.glb`;
        await ctx.put(name, f, 'model/gltf-binary');
        const next = ctx.getCast().map(c => c.id === ch.id ? { ...c, file: name } : c);
        await ctx.setCast(next); refresh(); return `Updated ${ch.name || ch.id}. Save to keep it.`;
      }
    }));

    body.append(heading('Scene settings'), h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Everything from the other tabs: zones.json (areas, water, models, routes, props), layout.json (look), cast.json (models) and story.json.'),
      row(btn('Download zones', () => { download(new Blob([JSON.stringify(zones, null, 2)], { type: 'application/json' }), 'zones.json'); msg('Downloaded zones.json'); }),
        btn('Download look', () => { download(new Blob([JSON.stringify(L, null, 2)], { type: 'application/json' }), 'layout.json'); msg('Downloaded layout.json'); })),
      row(btn('Load zones…', () => busy('Loading', async () => {
          const f = await pickFile('application/json,.json'); if (!f) return 'Cancelled';
          const z = JSON.parse(await f.text()); snapshot(); zones = z; ctx.setZones(structuredClone(zones), 'all'); zones = ctx.getZones(); redraw(); refresh();
          return `Loaded ${f.name}. Not saved yet: press Save scene to keep it.`;
        })),
        btn('Load look…', () => busy('Loading', async () => {
          const f = await pickFile('application/json,.json'); if (!f) return 'Cancelled';
          snapshot(); ctx.importLayout(JSON.parse(await f.text())); refresh();
          return `Loaded ${f.name}. Not saved yet: press Save scene to keep it.`;
        })))),
      h('div', { class: 'muted', style: 'margin-top:8px' }, 'Uploads go into the working copy right away; Publish makes them live. Earlier versions stay available.'));
  }

  // ============================================================ overlays
  const overlay = new THREE.Group(); overlay.renderOrder = 100; scene.add(overlay);
  const flat = (c, opacity = 1) => new THREE.MeshBasicNodeMaterial({ color: c, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide });
  const ball = new THREE.SphereGeometry(1, 16, 10), rim = new THREE.SphereGeometry(1.35, 16, 10);
  const _hp = new THREE.Vector3();
  const handle = (c, size = 0.022) => { // a dot that stays the same size on screen
    const g = new THREE.Group();
    const r = new THREE.Mesh(rim, flat(0x10161d, 0.9)); r.renderOrder = 102;
    const d = new THREE.Mesh(ball, flat(c)); d.renderOrder = 103;
    g.add(r, d);
    d.onBeforeRender = () => {
      const dist = _hp.setFromMatrixPosition(g.matrixWorld).distanceTo(camera.position);
      g.scale.setScalar(dist * size * 0.45 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); g.updateMatrixWorld(true);
    };
    g.scale.setScalar(0.06); return g;
  };
  const surfY = (x, z, kind, it) => kind === 'water' ? zones.water.y + 0.03 : (it && it.y != null ? it.y + 0.03 : ctx.navHeight(x, z) + 0.05);
  function tube(poly, kind, it, closed, color = COLORS[kind], thick = 1) {
    const pts = [];
    const add = (x, z) => pts.push(new THREE.Vector3(x, surfY(x, z, kind, it), z));
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i];
      if (!closed && i === poly.length - 1) { add(ax, az); break; }
      const [bx, bz] = poly[(i + 1) % poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
      for (let s = 0; s < n; s++) add(ax + (bx - ax) * s / n, az + (bz - az) * s / n);
    }
    if (closed && pts.length) pts.push(pts[0].clone());
    for (let i = pts.length - 1; i > 0; i--) if (pts[i].distanceToSquared(pts[i - 1]) < 1e-8) pts.splice(i, 1);
    if (pts.length < 2) return new THREE.Group();
    const path = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const r = Math.max(0.02, camera.position.distanceTo(pts[0]) * 0.0022) * thick;
    const m = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(2, pts.length * 2), r, 5, false), flat(color));
    m.renderOrder = 101; return m;
  }
  function fill(poly, kind, it) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)))), flat(COLORS[kind], 0.16));
    m.rotation.x = -Math.PI / 2; const [cx, cz] = polyCentroid(poly); m.position.y = surfY(cx, cz, kind, it) - 0.02; m.renderOrder = 100; return m;
  }
  const shapes = () => {
    const out = [];
    if (zones.water?.polygon?.length) out.push({ kind: 'water', s: { kind: 'water' }, it: zones.water });
    (zones.walk || []).forEach((it, i) => out.push({ kind: it.y != null ? 'terrace' : 'walk', s: { kind: 'walk', list: 'walk', i }, it }));
    (zones.blocked || []).forEach((it, i) => out.push({ kind: 'blocked', s: { kind: 'blocked', list: 'blocked', i }, it }));
    return out;
  };
  const same = (a, b) => a && b && a.kind === b.kind && a.i === b.i && a.list === b.list;
  function selItem() {
    if (!sel) return null;
    if (sel.kind === 'water') return zones.water;
    if (sel.kind === 'spot') return zones.spots?.[sel.i];
    if (sel.kind === 'capy') return { tag: sel.tag };
    return zones[sel.list]?.[sel.i] || null;
  }
  let handles = [];
  function redraw() {
    overlay.clear(); handles = [];
    for (const { kind, s, it } of shapes()) {
      overlay.add(tube(it.polygon, kind, it, true), fill(it.polygon, kind, it));
      if (same(sel, s)) addCorners(it.polygon, kind, it, true);
    }
    (zones.routes || []).forEach((r, i) => {
      const isSel = sel?.kind === 'route' && sel.i === i;
      overlay.add(tube(r.points, 'route', null, !!r.loop, COLORS.route, isSel ? 1.2 : 0.7));
      if (isSel) addCorners(r.points, 'route', null, false);
      else r.points.forEach(([x, z], v) => { if (v === 0) { const hd = handle(COLORS.route, 0.016); hd.position.set(x, surfY(x, z) , z); overlay.add(hd); handles.push({ h: hd, route: i, v }); } });
    });
    (zones.spots || []).forEach((s, i) => {
      const y = ctx.navHeight(s.x, s.z);
      const hd = handle(COLORS[s.type] ?? 0xffffff, sel?.kind === 'spot' && sel.i === i ? 0.03 : 0.022);
      hd.position.set(s.x, y + 0.35, s.z); overlay.add(hd);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6), flat(COLORS[s.type] ?? 0xffffff)); pin.position.set(s.x, y + 0.175, s.z); pin.renderOrder = 101; overlay.add(pin);
      handles.push({ h: hd, spot: i });
    });
    (zones.props || []).forEach((p, i) => {
      const hd = handle(COLORS.prop, sel?.kind === 'prop' && sel.i === i ? 0.028 : 0.018);
      hd.position.set(p.x, ctx.navHeight(p.x, p.z) + 0.05, p.z); overlay.add(hd); handles.push({ h: hd, prop: i });
    });
    if ((tool === 'draw' || tool === 'route') && draft.length) {
      const k = tool === 'route' ? 'route' : drawKind;
      overlay.add(tube(draft, k, drawKind === 'terrace' ? { y: avgGround(draft) } : null, false));
      draft.forEach(([x, z]) => { const hd = handle(COLORS[k]); hd.position.set(x, surfY(x, z, k), z); overlay.add(hd); });
    }
  }
  function addCorners(poly, kind, it, closed) {
    poly.forEach(([x, z], v) => {
      const hd = handle(COLORS[kind]); hd.position.set(x, surfY(x, z, kind, it), z); overlay.add(hd); handles.push({ h: hd, v, mid: false, poly });
      if (!closed && v === poly.length - 1) return;
      const [nx, nz] = poly[(v + 1) % poly.length], mx = (x + nx) / 2, mz = (z + nz) / 2;
      const m = handle(COLORS[kind], 0.012); m.position.set(mx, surfY(mx, mz, kind, it), mz); overlay.add(m); handles.push({ h: m, v, mid: true, poly });
    });
  }
  const avgGround = poly => poly.reduce((s, [x, z]) => s + ctx.groundY(x, z), 0) / Math.max(1, poly.length);

  // ============================================================ picking + interaction
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), P = new THREE.Vector3();
  function groundPick(e) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const onPic = ctx.view() === 'hero' && ctx.backdrop === 'depth' && ctx.pickBackdrop?.(ndc.x, ndc.y); // draw on what you see
    if (onPic) return [+onPic[0].toFixed(3), +onPic[1].toFixed(3)];
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction; let prev = null;
    for (let t = 0.3; t < 80; t += Math.max(0.03, t * 0.012)) {
      P.copy(o).addScaledVector(d, t);
      const inW = zones.water?.polygon?.length > 2 && polyContains(zones.water.polygon, P.x, P.z);
      if (P.y <= (inW ? zones.water.y : ctx.groundY(P.x, P.z))) { if (prev) P.copy(prev).lerp(P, 0.5); return [+P.x.toFixed(3), +P.z.toFixed(3)]; }
      prev = P.clone();
    }
    return null;
  }
  const _s = new THREE.Vector3();
  function screenDist(obj, e) {
    _s.copy(obj.position).project(camera);
    return _s.z > 1 ? Infinity : Math.hypot((_s.x + 1) / 2 * innerWidth - e.clientX, (1 - _s.y) / 2 * innerHeight - e.clientY);
  }
  function hitHandle(e) { let best = null, bd = 12; for (const hd of handles) { const d = screenDist(hd.h, e); if (d < bd) { bd = d; best = hd; } } return best; }
  const area = poly => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; return Math.abs(a / 2); };
  const scopeOf = s => s.kind === 'route' ? 'data' : s.kind === 'prop' ? 'props' : 'nav';

  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (tc.object && (tc.dragging || tc.axis)) return; // using the move/turn/size handles
    if (tool === 'select' && tab === 'files' && ctx.backdrop === 'layers' && ctx.view() === 'hero') {
      const id = ctx.pickLayer((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (id) {
        const l = layerById(id); selectLayer(id);
        if (l?.fit === 'piece') { snapshot(); drag = { layer: id, sx: e.clientX, sy: e.clientY, x: l.x ?? 0.5, y: l.y ?? 0.5 }; dom.setPointerCapture(e.pointerId); }
        return;
      }
    }
    if (tool === 'select' && tab === 'lights') {
      const hit = ctx.pickLight((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (hit) { lightPart = hit.aim ? 'aim' : 'pos'; selectLight(hit.id); return; }
    }
    if (tool === 'select' && (tab === 'objects' || !hitHandle(e))) {
      const i = ctx.propsAt((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (i != null) { tab = 'objects'; selectProp(i); return; }
    }
    if (tool === 'select') {
      const hd = hitHandle(e);
      if (hd) {
        snapshot();
        if (hd.spot != null) { sel = { kind: 'spot', i: hd.spot }; drag = { spot: hd.spot }; }
        else if (hd.prop != null) { sel = { kind: 'prop', list: 'props', i: hd.prop }; drag = { prop: hd.prop }; }
        else if (hd.route != null) { sel = { kind: 'route', list: 'routes', i: hd.route }; refresh(); redraw(); return; }
        else {
          const poly = hd.poly;
          if (e.altKey && !hd.mid) { const min = sel?.kind === 'route' ? 2 : 3; if (poly.length > min) { poly.splice(hd.v, 1); apply(scopeOf(sel)); } return; }
          if (hd.mid) { const [ax, az] = poly[hd.v], [bx, bz] = poly[(hd.v + 1) % poly.length]; poly.splice(hd.v + 1, 0, [(ax + bx) / 2, (az + bz) / 2]); drag = { poly, v: hd.v + 1 }; }
          else drag = { poly, v: hd.v };
        }
        controls.enabled = false; dom.setPointerCapture(e.pointerId); refresh(); redraw(); return;
      }
      const c = ctx.capyAt(e);
      if (c) { selectCapy(c.tag); tab = 'capys'; refresh(); ctx.holdCapy(c.tag, true); drag = { capy: c.tag }; controls.enabled = false; dom.setPointerCapture(e.pointerId); return; }
      const g = groundPick(e);
      if (!g) { sel = null; capySel = null; ctx.selectCapy(null); refresh(); redraw(); return; }
      let best = null, ba = Infinity;
      for (const x of shapes()) if (polyContains(x.it.polygon, g[0], g[1])) { const a = area(x.it.polygon); if (a < ba) { ba = a; best = x; } }
      sel = best ? best.s : null; if (!best) { capySel = null; ctx.selectCapy(null); }
      refresh(); redraw();
    } else if (tool === 'draw' || tool === 'route') {
      const g = groundPick(e); if (!g) return;
      const last = draft[draft.length - 1];
      if (last && Math.hypot(last[0] - g[0], last[1] - g[1]) < 0.05) return; // 2nd click of a double-click
      draft.push(g); redraw(); updateBanner();
    } else if (tool === 'spot') {
      const g = groundPick(e); if (!g) return;
      snapshot(); zones.spots = zones.spots || []; zones.spots.push({ type: spotType, x: g[0], z: g[1] });
      sel = { kind: 'spot', i: zones.spots.length - 1 }; tool = 'select'; apply('nav'); refresh();
    } else if (tool === 'prop') {
      const g = groundPick(e); if (!g) return;
      snapshot(); zones.props = zones.props || []; zones.props.push({ type: propType, x: g[0], z: g[1], rot: 0, scale: 1 });
      tool = 'select'; apply('props'); tab = 'objects'; selectProp(zones.props.length - 1);
    } else if (tool === 'send') {
      const g = groundPick(e); if (!g || !capySel) return;
      ctx.sendCapy(capySel, g[0], g[1]); tool = 'select'; refresh();
    }
  });
  dom.addEventListener('dblclick', () => { if ((tool === 'draw' && draft.length >= 3) || (tool === 'route' && draft.length >= 2)) finishDraw(); });
  dom.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.layer) {
      const l = layerById(drag.layer), fs = ctx.frameScale(); if (!l || !fs) return;
      l.x = +(drag.x + (e.clientX - drag.sx) / fs.x).toFixed(4); l.y = +(drag.y + (e.clientY - drag.sy) / fs.y).toFixed(4);
      ctx.setLayers(ldef); return;
    }
    const g = groundPick(e); if (!g) return;
    if (drag.capy) { ctx.moveCapy(drag.capy, g[0], g[1]); return; }
    if (drag.spot != null) { zones.spots[drag.spot].x = g[0]; zones.spots[drag.spot].z = g[1]; }
    else if (drag.prop != null) { zones.props[drag.prop].x = g[0]; zones.props[drag.prop].z = g[1]; ctx.setZones(structuredClone(zones), 'props'); }
    else drag.poly[drag.v] = g;
    redraw();
  });
  dom.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null; controls.enabled = ctx.view() !== 'hero';
    if (d.layer) { msg('Moved. Save to keep it.'); refresh(); return; }
    if (d.capy) { ctx.holdCapy(d.capy, false); return; }
    apply(d.prop != null ? 'props' : d.spot != null ? 'nav' : scopeOf(sel || {}));
  });
  // mouse wheel over a selected piece: size (Alt: distance)
  const onWheel = e => {
    if (tab !== 'files' || ctx.backdrop !== 'layers' || sel?.kind !== 'layer' || ctx.view() !== 'hero') return;
    const l = layerById(sel.id); if (!l) return;
    if (!e.altKey && l.fit !== 'piece') return;
    e.preventDefault();
    if (editingKey !== 'wheel') { snapshot(); editingKey = 'wheel'; clearTimeout(onWheel.t); }
    onWheel.t = setTimeout(() => { editingKey = null; refresh(); }, 400);
    const f = Math.exp(-e.deltaY * 0.0015);
    if (e.altKey) l.distance = +Math.min(100, Math.max(0.5, l.distance / f)).toFixed(2); else l.size = +Math.min(2, Math.max(0.02, (l.size ?? 0.3) * f)).toFixed(4);
    ctx.setLayers(ldef); msg(e.altKey ? `Distance ${l.distance.toFixed(1)} m` : `Size ${Math.round(l.size * 100)}%`);
  };
  dom.addEventListener('wheel', onWheel, { passive: false });
  disposers.push(() => dom.removeEventListener('wheel', onWheel));
  const onKey = e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'Enter' && (tool === 'draw' || tool === 'route')) finishDraw();
    if (e.key === 'Escape') cancelTool();
    if (tab === 'objects' && sel?.kind === 'prop' && !e.metaKey && !e.ctrlKey) {
      const m = { w: 'translate', e: 'rotate', r: 'scale' }[e.key.toLowerCase()];
      if (m) { gizmoMode = m; attachGizmo(); refresh(); }
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && sel) { e.preventDefault(); deleteSel(); }
    if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doUndo(); }
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  };
  addEventListener('keydown', onKey);
  disposers.push(() => removeEventListener('keydown', onKey));
  function finishDraw() {
    if (tool === 'route') {
      if (draft.length < 2) { msg('A route needs at least 2 points.'); return; }
      snapshot(); zones.routes = zones.routes || [];
      zones.routes.push({ name: `Route ${zones.routes.length + 1}`, points: draft, loop: false, reverse: true });
      sel = { kind: 'route', list: 'routes', i: zones.routes.length - 1 }; draft = []; tool = 'select'; apply('data'); refresh(); return;
    }
    if (draft.length < 3) { msg('A shape needs at least 3 corners.'); return; }
    snapshot();
    if (drawKind === 'water') { zones.water.polygon = draft; sel = { kind: 'water' }; }
    else if (redrawTarget && zones[redrawTarget.list]?.[redrawTarget.i]) {
      zones[redrawTarget.list][redrawTarget.i].polygon = draft; sel = redrawTarget;
    } else {
      const list = drawKind === 'blocked' ? 'blocked' : 'walk';
      zones[list] = zones[list] || [];
      const base = { walk: 'Walk area', terrace: 'Raised area', blocked: 'No-go area' }[drawKind] || 'Area';
      const n = zones[list].filter(x => (x.name || '').startsWith(base)).length + 1;
      const it = { name: `${base} ${n}`, polygon: draft };
      if (drawKind === 'terrace') it.y = +avgGround(draft).toFixed(2);
      zones[list].push(it); sel = { kind: list === 'walk' ? 'walk' : 'blocked', list, i: zones[list].length - 1 };
    }
    draft = []; tool = 'select'; redrawTarget = null; apply('nav'); refresh();
  }
  function deleteSel() {
    if (!sel || sel.kind === 'capy') return; snapshot();
    const scope = scopeOf(sel);
    if (sel.kind === 'water') zones.water.polygon = [];
    else if (sel.kind === 'spot') zones.spots.splice(sel.i, 1);
    else zones[sel.list].splice(sel.i, 1);
    sel = null; apply(scope); refresh();
  }
  function doUndo() {
    const s = undo.pop(); if (!s) { msg('Nothing to undo.'); return; }
    const o = JSON.parse(s); zones = o.zones; Object.assign(L, o.look); if (o.story) { story = o.story; ctx.setStory(story); } if (o.layers && ldef) { ldef = o.layers; ctx.setLayers(ldef); }
    sel = null; ctx.setZones(structuredClone(zones), 'all'); ctx.applyLook('snow'); ctx.applyLook('camera'); ctx.applyLook('lights'); redraw(); refresh(); msg('Undone');
  }
  async function save() {
    try { msg(await ctx.save()); }
    catch (err) {
      const dl = (name, data) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = name; a.click(); };
      dl('zones.json', zones); dl('layout.json', L);
      msg('Downloaded zones.json and layout.json; saving failed, so they were downloaded instead.');
    }
  }
  // keep the capybara list fresh (state text) without stealing focus from sliders
  const tick = setInterval(() => { if (tab === 'capys' && !editingKey && !el.contains(document.activeElement)) refresh(); }, 1500);

  disposers.push(() => clearInterval(tick));
  refresh(); redraw();
  return { redraw, refresh, saveAll: () => ctx.save(), dispose: () => { for (const d of disposers.splice(0)) d(); } };
}
