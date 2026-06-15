-- =====================================================
-- ADD created_at TO pod_members TABLE
-- =====================================================
-- The pod_members table is missing the created_at column
-- which is needed for sorting in the API

-- Add created_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pod_members' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE pod_members 
        ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        
        -- Backfill with joined_at for existing records
        UPDATE pod_members 
        SET created_at = joined_at 
        WHERE created_at IS NULL AND joined_at IS NOT NULL;
        
        -- Set default for any remaining nulls
        UPDATE pod_members 
        SET created_at = NOW() 
        WHERE created_at IS NULL;
    END IF;
END $$;

-- Add index for faster sorting
CREATE INDEX IF NOT EXISTS idx_pod_members_created_at 
ON pod_members(created_at DESC);

-- Add updated_at column as well (good practice)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pod_members' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE pod_members 
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_pod_members_updated_at ON pod_members;

CREATE TRIGGER update_pod_members_updated_at
    BEFORE UPDATE ON pod_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
