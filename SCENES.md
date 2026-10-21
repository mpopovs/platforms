# Scene editor (M1): setup and use

The hot spring editor now lives in the claypixels admin at **/admin/scenes**.
Each scene has a working copy you edit and numbered versions you publish.

| Page | Who | What |
|---|---|---|
| `/admin/scenes` | admins | list, create, delete scenes |
| `/admin/scenes/<id>` | admins | the editor (Draw, Water, Capys, Routes, Look, Files) plus Publish, Preview, Consumer |
| `/scene/<id>/preview/<token>` | anyone with the link | the working copy |
| `/scene/<id>` | everyone | the published version |

## 1. Database

Run in the Supabase SQL Editor (after the M0 and shop SQL):

```sql

CREATE TABLE IF NOT EXISTS public.scenes (
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES public.brands(id),
  name TEXT NOT NULL,
  draft JSONB NOT NULL DEFAULT '{"format": 1, "files": {}, "json": {}}'::jsonb,
  draft_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_version INT,
  preview_token TEXT NOT NULL UNIQUE,
  merch JSONB NOT NULL DEFAULT '{"shirts": false}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scene_versions (
  scene_id TEXT NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  version INT NOT NULL CHECK (version > 0),
  manifest JSONB NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scene_id, version)
);

DROP TRIGGER IF EXISTS update_scenes_updated_at ON public.scenes;
CREATE TRIGGER update_scenes_updated_at BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_versions ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('scenes', 'scenes', true)
ON CONFLICT (id) DO NOTHING;
```

## 2. Storage

Scene files go straight from the browser to storage (never through the app,
so the 10 MB server-action limit does not apply).

**Default: Supabase Storage** (`scenes` bucket, made by the SQL above). Nothing
to configure. Limit: the storage container's `FILE_SIZE_LIMIT` (50 MB by
default in the Supabase docker `.env`). Big splats may need it raised.

**Hetzner Object Storage (hel1)**: add to `.env.local` / server `.env`:

```env
SCENES_S3_ENDPOINT=https://hel1.your-objectstorage.com
SCENES_S3_REGION=hel1
SCENES_S3_BUCKET=<your bucket name>
SCENES_S3_ACCESS_KEY_ID=...
SCENES_S3_SECRET_ACCESS_KEY=...
# SCENES_PUBLIC_BASE_URL=https://<bucket>.hel1.your-objectstorage.com   (default)
```

then once: `pnpm tsx scripts/scenes-bucket-setup.ts` (CORS for uploads from the
editor + public read for `scenes/*`). When these are set, Hetzner is used for
new uploads; scenes already stored in Supabase keep working only while their
files stay there, so pick one before importing real scenes.

## 3. Bring in the hot spring

Either in the browser: **/admin/scenes** → create a scene → *Upload world
folder* (pick `hotspring/world/<id>`) → *Files* → *Upload capybaras folder*
(pick `animations`).

Or from the Mac terminal (faster for big files):

```bash
pnpm tsx scripts/import-scene.ts \
  "$HOME/Desktop/claypixels research/capys/hotspring/world/<world id>" \
  --capys "$HOME/Desktop/claypixels research/capys/animations" \
  --name "Hot spring" --publish
```

Files with the same content are stored once, so re-running only uploads what changed.

## Different scenes and stories

A scene is any environment plus a cast plus an optional story. Pick a
starting point when you create it:

| Template | What you get |
|---|---|
| Fashion show | Lit catwalk, four models, and a story: each walks out, poses for a close shot, walks back; captions; loops |
| Empty stage | A lit stage with no cast, for any story |
| From a world folder | Nothing yet; upload a Marble / hot spring world folder |

**Environment** (`scene.json`): a Marble splat or the 2.5D image backdrop (as
before), `"environment": "stage"` (procedural stage, settings under `"stage"`),
or a GLB room (`"files": { "environment": "env/room.glb" }`).

**Cast tab** (`cast.json`): any rigged GLB with animations. *Add character
(GLB)*, then set its height and walk speed, which clip is idle / walk / pose /
swim, and the **outfit mesh**: the mesh that wears the child's drawing (its
UVs must match the worksheet). *Try a drawing* previews any image on it.
Scenes without cast.json still get the eight capybaras.

**Story tab** (`story.json`): steps played in order like a short film:
camera shot (frame it in Free view, *Use current view*, optional follow),
walk (route or spot), place, animation, caption, wait, show / hide, outfit
(the child's drawing or an image), music, and free (back to their own
behaviour). *Start next step together* lets two things happen at once.
*Plays by itself* starts it in the player; *Loop* repeats it.

**Files tab** (no serve.py needed: files go to the scene's storage):

| Card | Download | Upload / replace |
|---|---|---|
| Environment GLB | yes | switch the scene to a GLB place; scale / turn / lift / shift |
| 360° background image | yes | JPG/PNG panorama (also lights the scene); remove |
| Image backdrop layers | yes | front image, background fill, both 16-bit depth maps |
| 3D Gaussian splats (.spz) | yes | replace a set, or switch the scene to a splat world |
| Collision surface (GLB) | yes | ground mesh for splat worlds |
| Models | yes | replace a model's GLB or give a stand-in a real file |
| Scene settings | zones / look JSON | load zones / look JSON |

## How it fits together

- The engine is `packages/scene-engine` (three.js r186, WebGPU with WebGL
  fallback): `mountScene(container, { base, edit, saveFile })`. It reads every
  file as `<base>/<name>`.
- `/api/scenes/<id>/files/<ref>/<name>` answers those reads: inline JSON
  (scene.json, zones.json, layout.json, backdrop meta) directly, everything
  else as a redirect to its storage URL. `ref` is `draft`, `p.<token>`,
  `published` or `v<n>`.
- A version is a manifest `{ format: 1, files: { name: key }, json: { name: … } }`.
  Keys are `scenes/<scene id>/<sha256>.<ext>`, so publishing copies nothing.
- Editor **Save** writes zones.json and layout.json into the working copy;
  the Files tab swaps single layers; **Publish** freezes the working copy as
  the next version. Players of `/scene/<id>` load a fixed version, so a new
  publish never mixes files for someone already watching.

## 2.5D scene from a picture

New scene → **From a picture (2.5D)** (or, in any scene, Files → *2.5D from a picture*). Pick a JPG/PNG:

1. The depth is worked out **in the browser** with Depth Anything V2 Small (Apache-2.0, ~100 MB, downloaded once and kept in the browser cache). Graphics card (WebGPU) when available, otherwise the processor: ~15 s – 2 min.
2. The bottom of the picture is taken as ground under a camera 1.6 m high, 40° lens, tilted 5° down. That sets the real-world scale, so models walk on the picture's ground.
3. The picture is split into a front layer, cut at depth edges, and a filled-in background layer, so the small camera movement never shows holes.

Files → **Adjust the depth** changes lens, camera height, tilt and farthest distance, then rebuilds in a second (no model run). Each layer can still be downloaded, retouched and uploaded again.

Optional: host the model yourself (e.g. on the Hetzner bucket) and set `NEXT_PUBLIC_DEPTH_MODEL_URL` to its URL. Without it, the model comes from Hugging Face and the runtime from jsDelivr.

## Objects

Editor → **Objects**: upload any GLB (it lands in the middle of the view), then move / turn / size it with the handles (W / E / R) or exact numbers (X, Z, lift, turn, tilt, size). Objects can be duplicated, dropped to the ground, and marked **Blocks walking** so models go around them. Stored in `zones.json` → `props` as `{ type: "model", file, x, z, y, rot, rx, rz, scale, size, blocks }`.

## Snow

Look → Snowfall: amount, fall speed, flake size, wind (m/s), wind direction and gusts. Flakes fill a box that travels with the camera, so the snow never runs out.

## Lights

Editor → **Lights**:
- **Mood presets:** Day, Golden hour, Blue hour, Night, Show and Studio. Each sets sky, sun, fog and picture tint together.
- **Sun:** direction and height. A sun disc shows in the scene while you drag.
- **Sky light:** sky colour, ground bounce and strength.
- **Picture tint:** for 2.5D pictures, which the lights don't light.
- **Lights you add:** spotlights, lamps or a set of three "show lights". Move a light and its aim point with the on-screen handles. Each has colour, strength, reach, beam width, soft edge, shadows and an animation (pulse, flicker, sweep, colour cycle, follow a model).

Story → **Light / mood** step fades the whole mood, or switches, recolours and dims lights. These changes last only while the story plays; the saved lights stay as set.
Saved in `layout.json` → `look` (mood values) and `lights` (placed lights).

## 2.5D from your own layers

New scene → **From picture layers (2.5D)** (or, in any scene, Files → *2.5D from your own layers*). Pick several prepared images at once (PNG with transparency):
- Images the size of the whole composition **fill the frame**. Sorted by file name, the first is the farthest, so name them `1_sky.png`, `2_hills.png`, `3_house.png`, … They're spread from 40 m to 4 m.
- Smaller images become **pieces** you place by hand: drag them in the view, use the mouse wheel to resize (Alt + wheel moves them nearer or farther), or use the sliders.
- **Distance** changes only how much a layer shifts as the camera moves; seen from the camera, it always looks as you composed it.
- **Make depth for this layer** + **Relief** gives one layer some roundness using its own depth (0 = flat cut-out).
- **Ground (lies flat):** below the horizon that layer lies on the floor, and models walk on it.
- **Look from the side** shows the stack like stage flats. The camera lens, height and tilt can be changed too.

Stored in `layers/layers.json` (see `engine/layers.js` for the format).
