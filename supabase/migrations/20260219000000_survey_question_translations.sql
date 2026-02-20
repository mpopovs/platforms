-- Add multi-language translations to survey questions
-- Stores per-language question text as JSONB, e.g. { "en": "...", "lv": "...", "de": "..." }

ALTER TABLE survey_questions
ADD COLUMN IF NOT EXISTS question_translations JSONB DEFAULT '{}';

COMMENT ON COLUMN survey_questions.question_translations IS 'Per-language question text: { en, lv, de, ru, lt, et }. Falls back to question_text if a language key is missing.';
