// Scene editor (open the page with ?edit=1). Controls everything in the scene:
//   Draw     walk areas, terraces, blocked areas, spots (start / rest / water entry), layers list
//   Water    edge, level, colour, opacity, ripples, steam, how deep capybaras swim
//   Capys    on/off, size, speed, start spot, route, behaviour mix, drag them, send them somewhere
//   Routes   walking routes they follow; props (mandarins, lanterns, steam vents)
//   Look     camera parallax, light, snow, fog, colour grade
// One Save writes zones.json (scene content) and layout.json (look) into the world folder.

import * as THREE from 'three/webgpu';
import { polyContains, polyCentroid } from './nav.js';
import { encodeGray16, decodePNG } from './png16.js';
import { STEP_TYPES } from './story.js';

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
  let tab = 'draw', tool = 'select', drawKind = null, spotType = null, propType = null;
  let draft = [], sel = null, drag = null, capySel = null;
  const undo = [];
  let story = ctx.getStory();
  const snapshot = () => { undo.push(JSON.stringify({ zones, look: L, story })); if (undo.length > 80) undo.shift(); };

  // ============================================================ panel
  const css = document.createElement('style');
  css.textContent = `
  #ed{position:fixed;left:12px;top:12px;width:330px;max-height:calc(100vh - 24px);display:flex;flex-direction:column;background:rgba(20,26,34,.92);color:#e8eef5;
      font:12.5px/1.35 system-ui,sans-serif;border-radius:12px;z-index:20;box-shadow:0 6px 24px rgba(0,0,0,.3)}
  #ed .tabs{display:flex;gap:2px;padding:8px 8px 0}
  #ed .tabs button{flex:1;background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;padding:6px 2px;color:#9fb2c6;font-weight:600}
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
  el.innerHTML = `<div class="tabs">${[['draw', 'Draw'], ['water', 'Water'], ['capys', 'Models'], ['routes', 'Routes'], ['story', 'Story'], ['look', 'Look'], ['files', 'Files']].map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join('')}</div>
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
    i.addEventListener('input', () => { if (editingKey !== label) { snapshot(); editingKey = label; } set(+i.value); v.textContent = fmt(i.value); apply(scope); });
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
    if (scope === 'look' || scope === 'snow' || scope === 'camera') ctx.applyLook(scope);
    else ctx.setZones(structuredClone(zones), scope);
    redraw(); msg('Unsaved changes');
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
    ({ draw: tabDraw, water: tabWater, capys: tabCapys, routes: tabRoutes, story: tabStory, look: tabLook, files: tabFiles })[tab]();
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
  const viewRow = () => [heading('View'), row(...[['hero', 'Hero'], ['top', 'Top'], ['free', 'Free']].map(([v, t]) => btn(t, () => { ctx.setView(v); redraw(); }, { on: ctx.view() === v })))];

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
  const STEP_NAMES = { camera: 'Camera shot', walk: 'Walk', place: 'Place', anim: 'Animation', say: 'Caption', wait: 'Wait', show: 'Show', hide: 'Hide', outfit: 'Outfit', music: 'Music', free: 'Free (own behaviour)' };
  let stepSel = null, playingStep = -1, newStepType = 'walk';
  ctx.onStoryStep(i => { playingStep = i; if (tab === 'story') refresh(); });
  const storyChanged = () => { ctx.setStory(story); msg('Unsaved changes'); };
  const who = () => ctx.castInfo().map(c => [c.id, ctx.castName(c.id)]);
  function stepSummary(st) {
    const n = st.who ? ctx.castName(st.who) : '';
    switch (st.do) {
      case 'camera': {
        const m = st.mode || (st.follow ? 'look' : 'fixed'), w = ctx.castName(st.who || st.follow || '');
        const what = m === 'director' ? `Director: ${(st.operators?.length || ctx.cameraOperators().length)} cameras on ${st.who && st.who !== 'auto' ? w : 'whoever performs'}` : m === 'follow' ? `Camera follows ${w}` : m === 'orbit' ? `Camera circles ${w}` : m === 'look' ? `Camera watches ${w}` : st.shot === 'hero' ? 'Camera: hero view' : 'Camera shot';
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
      free: { do: 'free', who: 'all' }
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
        const setMode = v => { st.mode = v; delete st.follow; if (v === 'director') { st.who = st.who || 'auto'; return; } if (st.who === 'auto') delete st.who; if (v !== 'fixed' && !st.who) st.who = who()[0]?.[0]; if (v === 'follow' && !st.offset) st.offset = [0, 0.9, 2.2]; };
        const preset = (label, off, frame) => btn(label, () => { snapshot(); st.offset = off; st.frame = frame; storyChanged(); ctx.previewCamera({ ...st, seconds: 0.8 }); });
        const fields = [
          sel('Camera', [['director', 'Director (several cameras)'], ['fixed', 'Fixed shot'], ['look', 'Look at a model'], ['follow', 'Follow a model'], ['orbit', 'Circle a model']], () => mode, setMode)];
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
    body.append(heading('Props'),
      row(btn('Mandarins', () => setTool('prop', { propType: 'mandarins' }), { on: tool === 'prop' && propType === 'mandarins', dot: 0xff8a1f }),
        btn('Stone lantern', () => setTool('prop', { propType: 'lantern' }), { on: tool === 'prop' && propType === 'lantern', dot: 0xb0aba3 }),
        btn('Steam vent', () => setTool('prop', { propType: 'steam' }), { on: tool === 'prop' && propType === 'steam', dot: 0xffffff })));
    const pl = h('div', { class: 'list' });
    (zones.props || []).forEach((p, i) => pl.append(h('div', { class: 'item' + (sel?.kind === 'prop' && sel.i === i ? ' on' : ''), onclick: () => { sel = { kind: 'prop', list: 'props', i }; tool = 'select'; refresh(); redraw(); } }, h('span', { class: 'dot', style: 'background:#ff9a3c' }), h('span', { class: 'grow' }, `${p.type} ${i + 1}`))));
    body.append(pl);
    if (sel?.kind === 'prop' && zones.props[sel.i]) body.append(h('div', { class: 'card' }, ...propCtls(zones.props[sel.i]), row(btn('Delete prop', deleteSel, { cls: 'warn' }))));
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
    body.append(heading('Live camera'),
      h('div', { class: 'muted' }, 'A gentle handheld sway that makes the camera feel alive. 0 = steady tripod. (Calm while you edit; plays in the player and in story preview.)'),
      slider('Handheld', () => c.handheld.amount ?? 0.5, v => { c.handheld.amount = v; }, 0, 2, 0.05, 'look'),
      slider('Sway speed', () => c.handheld.speed ?? 1, v => { c.handheld.speed = v; }, 0.2, 3, 0.05, 'look'));
    body.append(heading('Light'),
      slider('Exposure', () => k.exposure, v => { k.exposure = v; }, 0.3, 2, 0.01, 'look'),
      slider('Sky light', () => k.ambient ?? 1.6, v => { k.ambient = v; }, 0, 4, 0.05, 'look'),
      slider('Sun', () => k.sun ?? 1.4, v => { k.sun = v; }, 0, 4, 0.05, 'look'),
      slider('Window glow', () => k.warmIntensity ?? 6, v => { k.warmIntensity = v; }, 0, 20, 0.5, 'look'),
      heading('Snowfall'),
      slider('Amount', () => k.snow, v => { k.snow = v; }, 0, 3, 0.05, 'snow'),
      slider('Speed', () => k.snowSpeed ?? 1, v => { k.snowSpeed = v; }, 0.1, 3, 0.05, 'look'),
      heading('Fog'),
      colorCtl('Colour', () => k.fog, v => { k.fog = v; }, 'look'),
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
      blob = await toJpeg(f, L1.key === 'color_bg' ? Math.round(cw / 2) : null, L1.key === 'color_bg' ? Math.round(ch / 2) : null);
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
    const label = { glb: `3D model: ${env.file}`, stage: 'Lit stage (built in)', depth: 'Image backdrop (2.5D)', splat: 'Marble splat world' }[env.mode] || env.mode;
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
    return [heading('Environment'), card];
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
      sel = { kind: 'prop', list: 'props', i: zones.props.length - 1 }; tool = 'select'; apply('props'); refresh();
    } else if (tool === 'send') {
      const g = groundPick(e); if (!g || !capySel) return;
      ctx.sendCapy(capySel, g[0], g[1]); tool = 'select'; refresh();
    }
  });
  dom.addEventListener('dblclick', () => { if ((tool === 'draw' && draft.length >= 3) || (tool === 'route' && draft.length >= 2)) finishDraw(); });
  dom.addEventListener('pointermove', e => {
    if (!drag) return;
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
    if (d.capy) { ctx.holdCapy(d.capy, false); return; }
    apply(d.prop != null ? 'props' : d.spot != null ? 'nav' : scopeOf(sel || {}));
  });
  const onKey = e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'Enter' && (tool === 'draw' || tool === 'route')) finishDraw();
    if (e.key === 'Escape') cancelTool();
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
    const o = JSON.parse(s); zones = o.zones; Object.assign(L, o.look); if (o.story) { story = o.story; ctx.setStory(story); }
    sel = null; ctx.setZones(structuredClone(zones), 'all'); ctx.applyLook('snow'); ctx.applyLook('camera'); redraw(); refresh(); msg('Undone');
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
