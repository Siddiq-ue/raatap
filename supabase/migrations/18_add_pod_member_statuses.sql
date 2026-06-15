-- Drop existing constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'pod_members_status_check' 
    AND table_name = 'pod_members'
  ) THEN
    ALTER TABLE pod_members DROP CONSTRAINT pod_members_status_check;
  END IF;
END
$$;

-- Add new constraint with additional statuses
ALTER TABLE pod_members 
ADD CONSTRAINT pod_members_status_check 
CHECK (status IN ('pending_rider', 'active', 'left', 'dismissed'));
