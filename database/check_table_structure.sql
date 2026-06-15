-- Check ride_templates table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ride_templates'
ORDER BY ordinal_position;

-- Check ride_requests table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ride_requests'
ORDER BY ordinal_position;

-- Check all constraints on ride_templates
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'ride_templates'::regclass;

-- Check what's in the error row
SELECT id, host_id, status
FROM ride_templates
WHERE id = '9c573d8e-1163-4a85-b6d4-119e01a7d443';
