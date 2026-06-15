-- =================================================================
-- ADD OVERLAPPING DISTANCE COLUMN
-- =================================================================
-- Adds column to track overlapping route distance for cost calculation
-- =================================================================

ALTER TABLE match_suggestions
ADD COLUMN IF NOT EXISTS overlapping_distance_meters NUMERIC;

-- Add comment
COMMENT ON COLUMN match_suggestions.overlapping_distance_meters IS 
'Distance (in meters) that host and rider travel together. Used for cost splitting.';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_match_suggestions_overlapping 
ON match_suggestions(overlapping_distance_meters DESC) 
WHERE overlapping_distance_meters IS NOT NULL;

-- =================================================================
-- UPDATE EXISTING RECORDS (optional - sets overlapping = detour distance)
-- =================================================================
UPDATE match_suggestions 
SET overlapping_distance_meters = detour_distance_meters
WHERE overlapping_distance_meters IS NULL 
AND detour_distance_meters IS NOT NULL;
