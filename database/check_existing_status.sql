-- What status values exist in ride_templates?
SELECT DISTINCT status, COUNT(*) 
FROM ride_templates 
GROUP BY status;

-- What status values exist in ride_requests?
SELECT DISTINCT status, COUNT(*) 
FROM ride_requests 
GROUP BY status;

-- Check the actual constraint
SELECT conname, pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conname LIKE '%status%'
  AND (conrelid = 'ride_templates'::regclass OR conrelid = 'ride_requests'::regclass);
