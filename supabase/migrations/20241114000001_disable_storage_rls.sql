-- Create public storage policies for development
-- This allows file uploads without authentication

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;

-- Allow anyone to upload files
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK (true);

-- Allow anyone to read files
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING (true);

-- Allow anyone to delete files (for development)
CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
TO public
USING (true);

-- Allow anyone to update files (for development)
CREATE POLICY "Public Update"
ON storage.objects FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Note: In production, you should restrict these policies to authenticated users only
