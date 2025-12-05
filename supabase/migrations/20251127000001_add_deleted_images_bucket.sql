-- Create deleted-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('deleted-images', 'deleted-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for deleted-images bucket
CREATE POLICY "Authenticated users can upload to deleted-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'deleted-images');

CREATE POLICY "Authenticated users can read deleted-images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'deleted-images');

CREATE POLICY "Authenticated users can delete from deleted-images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'deleted-images');

-- Public read access for deleted-images (for archival purposes)
CREATE POLICY "Public can view deleted-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'deleted-images');
