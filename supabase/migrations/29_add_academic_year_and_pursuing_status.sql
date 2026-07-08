-- =================================================================
-- ADD: academic start/end year + pursuing status to profiles
-- =================================================================
-- Raatap only operates for currently enrolled students. We still want
-- to accept a profile from someone who has graduated (so we don't
-- lose the signup), but need to flag it so the product can message
-- "students only" back to that user and admins can see who isn't
-- actually eligible to be matched.
-- =================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS academic_start_year INTEGER,
  ADD COLUMN IF NOT EXISTS academic_end_year INTEGER,
  ADD COLUMN IF NOT EXISTS is_pursuing BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN profiles.academic_start_year IS 'Year the student started their current degree program.';
COMMENT ON COLUMN profiles.academic_end_year IS 'Year the student''s current degree program ends (expected graduation year).';
COMMENT ON COLUMN profiles.is_pursuing IS 'False if the user has already graduated (not currently enrolled). Raatap is students-only, so this flags profiles admins should treat as ineligible.';
