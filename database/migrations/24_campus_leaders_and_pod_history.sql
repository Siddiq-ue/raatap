-- =====================================================
-- 24. ADD CAMPUS LEADERS & POD HISTORY COLUMNS
-- =====================================================

-- 1. Create campus_leaders table
CREATE TABLE IF NOT EXISTS campus_leaders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    institution TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE campus_leaders ENABLE ROW LEVEL SECURITY;

-- REMOVED: "Admin users can manage campus_leaders" policy
-- Reason: Admin panel uses SUPABASE_SERVICE_ROLE_KEY server-side, which bypasses
-- RLS entirely. Admin never authenticates via Supabase Auth, so auth.uid()
-- is always null in that context.

-- Policy: Campus leaders can view their own record
CREATE POLICY "Campus leaders can view their own record"
ON campus_leaders
FOR SELECT
USING (user_id = auth.uid());

-- Allow campus leaders to view profiles from their institution
-- (RLS on profiles table)
CREATE POLICY "Campus leaders can view profiles"
ON profiles
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM campus_leaders cl 
        WHERE cl.user_id = auth.uid() 
        AND (cl.institution = profiles.institution OR profiles.institution IS NULL)
    )
);

-- 2. Add history columns to pod_members
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pod_members' 
        AND column_name = 'left_at'
    ) THEN
        ALTER TABLE pod_members ADD COLUMN left_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pod_members' 
        AND column_name = 'rejected_at'
    ) THEN
        ALTER TABLE pod_members ADD COLUMN rejected_at TIMESTAMPTZ;
    END IF;
END $$;
