
-- Migration: Add 'confirmed' to allowed statuses in match_suggestions

ALTER TABLE match_suggestions
DROP CONSTRAINT IF EXISTS match_suggestions_status_check;

ALTER TABLE match_suggestions
ADD CONSTRAINT match_suggestions_status_check
CHECK (status = ANY (ARRAY['pending'::text, 'shown'::text, 'accepted'::text, 'skipped'::text, 'expired'::text, 'confirmed'::text]));
