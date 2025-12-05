-- Add logo_url column to viewers table
ALTER TABLE viewers ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create storage bucket for viewer logos if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('viewer-logos', 'viewer-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for viewer logos
CREATE POLICY "Allow public read access to viewer logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'viewer-logos');

CREATE POLICY "Allow authenticated users to upload viewer logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'viewer-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update viewer logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'viewer-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to delete viewer logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'viewer-logos' AND auth.role() = 'authenticated');
