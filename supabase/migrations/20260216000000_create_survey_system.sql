-- Create survey system for post-upload research
-- Age groups: 1 (0-12 years), 2 (13-18 years), 3 (19+ years)

-- Survey questions table
CREATE TABLE IF NOT EXISTS survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id TEXT NOT NULL REFERENCES viewers(id) ON DELETE CASCADE,
  age_group INTEGER NOT NULL CHECK (age_group IN (1, 2, 3)), -- 1: 0-12, 2: 13-18, 3: 19+
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('emoji', 'star', 'likert')), -- emoji for group 1, star for group 2, likert for group 3
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(viewer_id, age_group, order_index)
);

-- Survey responses table
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texture_id TEXT NOT NULL REFERENCES model_textures(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  age_group INTEGER NOT NULL CHECK (age_group IN (1, 2, 3)),
  response_value INTEGER NOT NULL, -- 1-5 for emoji (sad to happy), 1-5 for stars, 1-5 for likert (strongly disagree to strongly agree)
  responded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_survey_questions_viewer ON survey_questions(viewer_id, age_group, is_active);
CREATE INDEX idx_survey_responses_texture ON survey_responses(texture_id);
CREATE INDEX idx_survey_responses_question ON survey_responses(question_id);
CREATE INDEX idx_survey_responses_age_group ON survey_responses(age_group);

-- Add age_group to model_textures to track which age group uploaded
ALTER TABLE model_textures 
ADD COLUMN IF NOT EXISTS age_group INTEGER CHECK (age_group IN (1, 2, 3));

-- Add survey_completed flag
ALTER TABLE model_textures 
ADD COLUMN IF NOT EXISTS survey_completed BOOLEAN DEFAULT FALSE;

COMMENT ON TABLE survey_questions IS 'Stores survey questions configured per viewer and age group';
COMMENT ON TABLE survey_responses IS 'Stores user responses to surveys after texture upload';
COMMENT ON COLUMN survey_questions.age_group IS '1: 0-12 years (emoji scale), 2: 13-18 years (star rating), 3: 19+ years (Likert scale)';
COMMENT ON COLUMN survey_responses.response_value IS '1-5 scale: Emoji (1=very sad, 5=very happy), Star (1-5 stars), Likert (1=strongly disagree, 5=strongly agree)';
