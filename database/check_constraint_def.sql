-- Check the actual constraint on ride_templates
SELECT conname, pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conrelid = 'ride_templates'::regclass
AND contype = 'c'; -- check constraints

-- Also check if there's an enum type
SELECT typname, typcategory
FROM pg_type
WHERE typname LIKE '%status%' OR typname LIKE '%ride%';
