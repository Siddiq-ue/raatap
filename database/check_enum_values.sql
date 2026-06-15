-- Check request_status enum values
SELECT enumlabel
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE typname = 'request_status'
ORDER BY enumsortorder;

-- Check if there's a ride_templates_status enum
SELECT enumlabel
FROM pg_enum
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
WHERE typname = 'ride_templates_status'
ORDER BY enumsortorder;

-- Check all enum types
SELECT DISTINCT typname
FROM pg_type
JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid
WHERE typname LIKE '%status%' OR typname LIKE '%ride%';
