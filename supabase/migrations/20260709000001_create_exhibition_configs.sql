-- Exhibition grid configs: named, savable multi-model display setups used by
-- the "Exhibition Grid" show mode (up to 20 models on screen at once).
--
-- Ownership is enforced at the application layer (no RLS), matching the
-- existing convention in this project — see 20241114000000_disable_rls_for_dev.sql.
--
-- access_token grants read-only access to the fullscreen /exhibition show
-- route without requiring a Supabase login on the gallery/show computer.
CREATE TABLE IF NOT EXISTS exhibition_configs (
  id TEXT PRIMARY KEY, -- e.g. "exhibition_abc123"
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config JSONB NOT NULL, -- { layout, cells, tunables } — see lib/types/exhibition.ts
  access_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_exhibition_configs_user_id ON exhibition_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_exhibition_configs_access_token ON exhibition_configs(access_token);

-- Reuses the update_updated_at_column() trigger function created in
-- 20241112000000_create_viewer_tables.sql
CREATE TRIGGER update_exhibition_configs_updated_at
  BEFORE UPDATE ON exhibition_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
