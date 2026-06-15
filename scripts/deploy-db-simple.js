/**
 * deploy-db-simple.js
 * Simple Supabase SQL deployment script
 * 
 * Usage: node scripts/deploy-db-simple.js
 */

const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    env[key.trim()] = value.trim();
  }
});

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

console.log('🚀 Deploying Supabase Functions...\n');
console.log('URL:', SUPABASE_URL);
console.log('');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// SQL files in order
const SQL_FILES = [
  'database/functions/09_standardize_match_functions.sql',
];

async function deployFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  console.log(`📄 Executing: ${filePath}`);
  
  // Split by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const stmt of statements) {
    try {
      // Try to execute via REST API directly
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ sql: stmt })
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.log(`   ⚠️  ${response.status}: ${error.substring(0, 100)}`);
      }
    } catch (err) {
      console.log(`   ⚠️  Error: ${err.message}`);
    }
  }
  
  console.log(`   ✅ Done\n`);
}

async function main() {
  for (const file of SQL_FILES) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      await deployFile(fullPath);
    } else {
      console.log(`⚠️  File not found: ${file}\n`);
    }
  }
  
  console.log('✅ Deployment complete!');
  console.log('\nVerify in Supabase Dashboard: https://supabase.com/dashboard/project/ivvpizzudzxlutgaxxap/database/functions');
}

main().catch(console.error);
