-- Add author information to model_textures
ALTER TABLE model_textures
ADD COLUMN author_name TEXT,
ADD COLUMN author_age INTEGER;

-- Add comments
COMMENT ON COLUMN model_textures.author_name IS 'Name of the person who created/uploaded the texture';
COMMENT ON COLUMN model_textures.author_age IS 'Age of the texture author';
