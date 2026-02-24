-- Add 'yes-no' as a valid question type in survey_questions
ALTER TABLE survey_questions
  DROP CONSTRAINT IF EXISTS survey_questions_question_type_check;

ALTER TABLE survey_questions
  ADD CONSTRAINT survey_questions_question_type_check
    CHECK (question_type IN ('emoji', 'star', 'likert', 'yes-no'));
