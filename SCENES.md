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
