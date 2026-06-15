-- Check what statuses are allowed for ride_templates

-- Check the constraint definition
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conname LIKE '%status%' 
  AND conrelid = 'ride_templates'::regclass;

-- Check existing status values in the database
SELECT DISTINCT status FROM ride_templates;

-- Check existing status values in ride_requests
SELECT DISTINCT status FROM ride_requests;
