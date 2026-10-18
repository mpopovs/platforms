-- M1: scenes for the Scene editor.
--
-- A scene has a working copy (draft) and numbered, immutable published
-- versions. Both are manifests (see packages/scene-engine/src/manifest.ts):
--   { "format": 1, "files": { name: storage key }, "json": { name: inline JSON } }
-- Asset bytes live in object storage under scenes/<scene id>/<sha256>.<ext>
-- (Hetzner S3 when SCENES_S3_* is set, else the Supabase `scenes` bucket).
--
-- Server code reads and writes these with the service role after checking
-- the admin role; RLS is on with no policies, so the public anon key sees
-- nothing.

CREATE TABLE IF NOT EXISTS public.scenes (
  id TEXT PRIMARY KEY,                              -- scene_xxx
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

-- Supabase Storage backend (used when SCENES_S3_* is not set). Public read:
-- keys are content hashes under an unguessable scene id. The global
-- FILE_SIZE_LIMIT of the storage container still applies (50 MB by default).
INSERT INTO storage.buckets (id, name, public)
VALUES ('scenes', 'scenes', true)
ON CONFLICT (id) DO NOTHING;
