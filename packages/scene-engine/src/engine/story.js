// Story runner: plays story.json steps in order, like a short film.
//
// story.json: { "autoplay": true, "loop": true, "steps": [ step, ... ] }
// Every step has "do" and, for timed steps, "wait" (default true). With
// "wait": false the next step starts at once, so two models can walk together.
//
//   { "do": "camera", "mode": "fixed", "shot": "hero" | { "pos": [x,y,z], "target": [x,y,z], "fov": 40 }, "seconds": 1.5 }
//   { "do": "camera", "mode": "look",   "who": "<id>", "shot": {…} }              stay put, keep aiming at them
//   { "do": "camera", "mode": "follow", "who": "<id>", "offset": [x,y,z], "frame": "world" | "character" }
//   { "do": "camera", "mode": "orbit",  "who": "<id>", "radius": 2.5, "height": 1.2, "speed": 20 }
//   { "do": "camera", "mode": "director", "who": "auto" | "<id>", "operators": ["front","side","low","close","crane","wide","back"], "cutMin": 2.5, "cutMax": 6 }
//        several camera operators; the show cuts between them at random moments
//   { "do": "walk",   "who": "<id>", "route": "<route name>" | "spot": 3 | "to": [x, z] }
//   { "do": "place",  "who": "<id>", "spot": 3 | "at": [x, z], "turn": 180 }
//   { "do": "anim",   "who": "<id>", "clip": "pose", "loop": false }
//   { "do": "say",    "text": "…", "seconds": 3 }
//   { "do": "wait",   "seconds": 2 }
//   { "do": "show" | "hide", "who": "<id>" }
//   { "do": "outfit", "who": "<id>", "image": "<file name>" | "drawing" }
//   { "do": "music",  "file": "<file name>", "volume": 0.6 } | { "do": "music", "stop": true }
//   { "do": "free",   "who": "<id>" | "all" }      back to their own behaviour

export const STEP_TYPES = ['camera', 'walk', 'place', 'anim', 'say', 'wait', 'show', 'hide', 'outfit', 'music', 'free'];

export function createStoryRunner(api) {
  let run = null;
  let audio = null;

  const sleep = (ms, r) => new Promise(res => { const t = setTimeout(res, ms); r.timers.push(t); });
  const until = async (fn, r, limitMs = 120000) => { const t0 = performance.now(); while (!r.cancelled && !fn() && performance.now() - t0 < limitMs) await sleep(100, r); };

  async function step(s, r) {
    const c = s.who && s.who !== 'all' ? api.char(s.who) : null;
    if (c) api.claim(c);
    const wait = s.wait !== false;
    switch (s.do) {
      case 'camera': {
        const p = api.cameraTo(s);
        if (wait) await Promise.race([p, until(() => false, r, (s.seconds ?? 0) * 1000 + 50)]);
        break;
      }
      case 'walk': {
        if (!c) break;
        if (!api.walk(c, s)) break;
        if (wait) await until(() => c.state !== 'move', r);
        if (!r.cancelled) api.play(c, 'idle');
        break;
      }
      case 'place': if (c) api.place(c, s); break;
      case 'anim': {
        if (!c) break;
        const d = api.play(c, s.clip || 'pose', { once: !s.loop });
        c.state = 'act'; c.timer = 1e9;
        if (wait && !s.loop) { await sleep(Math.max(0.2, d) * 1000, r); if (!r.cancelled) api.play(c, 'idle'); }
        break;
      }
      case 'say': {
        api.caption(s.text || '');
        if (wait) { await sleep((s.seconds ?? 3) * 1000, r); if (!r.cancelled) api.caption(null); }
        else { const t = setTimeout(() => api.caption(null), (s.seconds ?? 3) * 1000); r.timers.push(t); }
        break;
      }
      case 'wait': await sleep((s.seconds ?? 1) * 1000, r); break;
      case 'show': if (c) api.setVisible(c, true); break;
      case 'hide': if (c) api.setVisible(c, false); break;
      case 'outfit': if (c) await api.outfit(c, s.image); break;
      case 'music': {
        if (audio) { audio.pause(); audio = null; }
        if (!s.stop && s.file) {
          audio = new Audio(api.url(s.file)); audio.loop = s.loop !== false; audio.volume = s.volume ?? 0.6;
          audio.play().catch(() => { /* browsers block sound until the viewer taps */ });
        }
        break;
      }
      case 'free': {
        if (s.who === 'all' || !s.who) api.allChars().forEach(api.release); else if (c) api.release(c);
        break;
      }
    }
  }

  async function play(story, { from = 0 } = {}) {
    stop();
    const steps = story?.steps || [];
    if (!steps.length) return;
    const r = { cancelled: false, timers: [] };
    run = r;
    do {
      for (let i = from; i < steps.length && !r.cancelled; i++) {
        api.onStep?.(i);
        try { await step(steps[i], r); } catch (e) { console.warn('[story] step', i, e); }
      }
      from = 0;
      if (!r.cancelled && story.loop) { api.reset(); await sleep(400, r); }
    } while (!r.cancelled && story.loop);
    if (run === r) { run = null; api.onStep?.(-1); }
  }

  function stop() {
    if (!run) return;
    run.cancelled = true; run.timers.forEach(clearTimeout); run = null;
    if (audio) { audio.pause(); audio = null; }
    api.caption(null);
    api.allChars().forEach(api.release);
    api.onStep?.(-1);
  }

  return { play, stop, get running() { return Boolean(run); } };
}
