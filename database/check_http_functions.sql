-- Check what functions the http extension provides

-- List all functions in extensions schema that might be from http extension
SELECT 
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines 
WHERE routine_schema = 'extensions'
  AND routine_name LIKE '%http%'
ORDER BY routine_name;

-- Check for http_get specifically
SELECT proname, prosrc, pronargs 
FROM pg_proc 
WHERE proname LIKE '%http%get%'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'extensions');

-- Try to see what's in http extension
SELECT * FROM pg_depend 
WHERE refobjid = (SELECT oid FROM pg_extension WHERE extname = 'http')
LIMIT 20;
