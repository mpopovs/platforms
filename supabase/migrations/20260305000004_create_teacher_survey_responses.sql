-- Teacher survey responses
-- Survey definitions live in the viewer's worksheet_layout JSON.
-- This table only stores the filled-in responses.

CREATE TABLE IF NOT EXISTS teacher_survey_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   TEXT NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  pin         TEXT,  -- classroom PIN used when the survey was filled in (optional)
  lang        TEXT NOT NULL DEFAULT 'en',
  answers     JSONB NOT NULL DEFAULT '[]',
  -- answers format: [{ question_id: string, value: string | string[] }]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teacher_survey_responses_viewer_id ON teacher_survey_responses(viewer_id);
CREATE INDEX IF NOT EXISTS idx_teacher_survey_responses_created_at ON teacher_survey_responses(created_at DESC);

-- RLS: admins/service role can read; anyone can insert (public survey)
ALTER TABLE teacher_survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON teacher_survey_responses
  FOR ALL USING (true) WITH CHECK (true);
