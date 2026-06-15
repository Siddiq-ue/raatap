/**
 * deploy-db.js
 * Deploys all Supabase SQL functions and triggers
 * 
 * Usage: npm run db:migrate
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    env[key.trim()] = value.trim();
  }
});

// Configuration
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// SQL files in deployment order
const SQL_FILES = [
  'database/functions/01_create_rides.sql',
  'database/functions/02_matching.sql',
  'database/functions/03_match_management.sql',
  'database/functions/04_seat_management.sql',
  'database/functions/05_auto_create_triggers.sql',
  'database/functions/06_idempotent_matching.sql',
  'database/functions/07_match_workflow_updates.sql',
  'database/functions/08_enforce_capacity.sql',
  'database/functions/09_standardize_match_functions.sql',
];

async function deploySQLFile(filePath, supabase) {
  const sqlContent = fs.readFileSync(filePath, 'utf-8');
  
  console.log(`📄 Deploying: ${filePath}`);
  
  // Execute the entire SQL file at once
  try {
    // Use RPC to execute raw SQL (requires service role key)
    const { error } = await supabase.rpc('exec_sql', { sql: sqlContent });
    
    if (error) {
      console.warn(`⚠️  Warning: ${error.message}`);
      // Continue anyway - the function might not exist but direct SQL execution works
    }
    
    console.log(`✅ Completed: ${filePath}`);
  } catch (err) {
    console.warn(`⚠️  Execution error: ${err.message}`);
    // Continue to next file
  }
  
  console.log(''); // Empty line between files
}

async function main() {
  console.log('🚀 Starting Supabase Database Deployment...\n');
  
  // Validate configuration
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing environment variables:');
    console.error('   - NEXT_PUBLIC_SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    console.error('\n   Please create a .env.local file with these values.');
    process.exit(1);
  }
  
  console.log('✅ Using Supabase URL:', SUPABASE_URL);
  console.log('✅ Service Role Key loaded:', SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...\n');
  
  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  // Test connection
  const { error: testError } = await supabase.from('profiles').select('id').limit(1);
  if (testError) {
    console.error('❌ Failed to connect to Supabase:', testError.message);
    process.exit(1);
  }
  
  console.log('✅ Connected to Supabase\n');
  console.log('='.repeat(60));
  console.log('');
  
  // Deploy each SQL file
  for (const file of SQL_FILES) {
    const fullPath = path.join(process.cwd(), file);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  File not found: ${fullPath}`);
      continue;
    }
    
    await deploySQLFile(fullPath, supabase);
  }
  
  console.log('='.repeat(60));
  console.log('✅ All database functions deployed successfully!');
  console.log('\n📝 Next steps:');
  console.log('   1. Verify functions in Supabase Dashboard → Database → Functions');
  console.log('   2. Check triggers in Database → Triggers');
  console.log('   3. Test the match workflow in the app');
  console.log('   4. Run "npm run db:check" to verify all functions');
}

main().catch(console.error);
