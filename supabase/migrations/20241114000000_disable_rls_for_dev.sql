-- Disable Row Level Security for development
-- This allows operations without authentication
-- Re-enable in production with proper auth setup

-- Disable RLS on viewers table
ALTER TABLE viewers DISABLE ROW LEVEL SECURITY;

-- Disable RLS on viewer_models table  
ALTER TABLE viewer_models DISABLE ROW LEVEL SECURITY;

-- Disable RLS on model_textures table
ALTER TABLE model_textures DISABLE ROW LEVEL SECURITY;

-- Note: You can re-enable RLS later by running:
-- ALTER TABLE viewers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE viewer_models ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE model_textures ENABLE ROW LEVEL SECURITY;
