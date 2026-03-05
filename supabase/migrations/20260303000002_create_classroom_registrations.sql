-- Store classroom registrations created via /klase public form
CREATE TABLE IF NOT EXISTS classroom_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name TEXT NOT NULL,
  teacher_name TEXT,
  teacher_email TEXT,
  child_count INTEGER NOT NULL DEFAULT 1,
  viewer_id TEXT NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  parent_viewer_id TEXT REFERENCES viewers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classroom_registrations_viewer_id ON classroom_registrations(viewer_id);
CREATE INDEX IF NOT EXISTS idx_classroom_registrations_parent_viewer_id ON classroom_registrations(parent_viewer_id);
