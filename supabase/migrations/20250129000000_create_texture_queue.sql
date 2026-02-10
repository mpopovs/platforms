-- Create texture_queue table for queue ticket system
CREATE TABLE IF NOT EXISTS texture_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_number integer NOT NULL UNIQUE,
  texture_id text REFERENCES model_textures(id) ON DELETE CASCADE,
  viewer_id text NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'displaying', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  displayed_at timestamptz,
  completed_at timestamptz
);

-- Create index for faster queries
CREATE INDEX idx_texture_queue_status ON texture_queue(status);
CREATE INDEX idx_texture_queue_viewer_id ON texture_queue(viewer_id);
CREATE INDEX idx_texture_queue_created_at ON texture_queue(created_at);
CREATE INDEX idx_texture_queue_queue_number ON texture_queue(queue_number);

-- Create function to get next queue number
CREATE OR REPLACE FUNCTION get_next_queue_number()
RETURNS integer AS $$
DECLARE
  next_number integer;
BEGIN
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO next_number FROM texture_queue;
  RETURN next_number;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE texture_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read queue entries
CREATE POLICY "Anyone can view queue entries"
  ON texture_queue FOR SELECT
  USING (true);

-- Policy: Anyone can insert queue entries
CREATE POLICY "Anyone can insert queue entries"
  ON texture_queue FOR INSERT
  WITH CHECK (true);

-- Policy: Anyone can update queue entries
CREATE POLICY "Anyone can update queue entries"
  ON texture_queue FOR UPDATE
  USING (true);
