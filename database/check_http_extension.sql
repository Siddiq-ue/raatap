-- Check what HTTP extensions are available

-- 1. Check if pg_http extension exists
SELECT * FROM pg_extension WHERE extname = 'http';

-- 2. Check if pg_net extension exists  
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 3. List all available extensions
SELECT * FROM pg_available_extensions WHERE name LIKE '%http%' OR name LIKE '%net%';

-- 4. Check what functions exist in extensions schema
SELECT routine_name, routine_schema 
FROM information_schema.routines 
WHERE routine_schema = 'extensions' 
  AND (routine_name LIKE '%http%' OR routine_name LIKE '%get%');

-- 5. Check what functions exist in public schema
SELECT routine_name, routine_schema 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND (routine_name LIKE '%http%' OR routine_name LIKE '%get%');
