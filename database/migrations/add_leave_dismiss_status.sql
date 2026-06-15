-- Add 'left' and 'dismissed' status to pod_members constraint
DROP CONSTRAINT IF EXISTS pod_members_status_check;

ALTER TABLE pod_members 
ADD CONSTRAINT pod_members_status_check 
CHECK (status = ANY (ARRAY['pending_rider'::text, 'active'::text, 'left'::text, 'dismissed'::text]));
