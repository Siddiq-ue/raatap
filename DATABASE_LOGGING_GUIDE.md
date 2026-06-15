# 📊 Database Logging System Guide

## Overview

Comprehensive logging has been added to track all database activities. Every action, error, and state change is now logged for debugging, auditing, and monitoring.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Application Layer (Next.js)                            │
│  - API routes log to console                            │
│  - Frontend shows notifications                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Database Layer (PostgreSQL)                            │
│  - activity_logs table                                   │
│  - log_activity() function                               │
│  - log_error() function                                  │
│  - Auto-logging triggers                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Files Created

### **1. Core Logging System**
```
database/functions/00_logging.sql
```
- Creates `activity_logs` table
- Creates `log_activity()` function
- Creates `log_error()` function
- Creates utility views and functions

### **2. Logged Functions**
```
database/functions/02_matching_logged.sql       ← Matching with logs
database/functions/03_match_management_logged.sql ← Accept/Confirm with logs
```

### **3. API Endpoint**
```
src/app/api/logs/route.ts  ← Query logs programmatically
```

---

## 🗄️ Database Schema

### **activity_logs Table**

```sql
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY,
    log_time TIMESTAMPTZ DEFAULT NOW(),
    log_level TEXT,           -- DEBUG, INFO, WARNING, ERROR, CRITICAL
    function_name TEXT,       -- Which function logged this
    action TEXT,              -- What happened
    user_id UUID,             -- Who did it
    entity_type TEXT,         -- What type (match, pod, ride_template)
    entity_id UUID,           -- Which entity
    details JSONB,            -- Additional context
    ip_address INET,          -- User's IP (future)
    user_agent TEXT           -- User's browser (future)
);
```

### **Log Levels**

| Level | When to Use |
|-------|-------------|
| **DEBUG** | Detailed technical info for debugging |
| **INFO** | Normal operations (success, state changes) |
| **WARNING** | Potential issues (non-blocking) |
| **ERROR** | Recoverable errors (validation failures) |
| **CRITICAL** | Severe errors (system failures) |

---

## 📝 What Gets Logged

### **Matching Process**

```sql
-- Example: Match calculation
calculate_route_match_score
├── DEBUG: Starting match calculation
├── DEBUG: Template found
├── DEBUG: Request found
├── INFO: Gender preference mismatch (if incompatible)
├── DEBUG: Calculated pickup distance: 250m
├── DEBUG: Day overlap calculated: 0.75
├── DEBUG: Time compatibility calculated: 0.9
├── INFO: Match calculation completed
│   └── Details: {
│       "route_match_score": 0.875,
│       "schedule_match_score": 0.78,
│       "overall_score": 0.837,
│       "pickup_distance_meters": 250,
│       "compatible": true
│     }
└── ERROR: Unexpected error (if exception occurs)
```

### **Match Acceptance**

```sql
-- Example: Host accepts match
accept_match_suggestion
├── INFO: Host attempting to accept match
├── DEBUG: Match details retrieved
├── DEBUG: Seats available check passed (3 remaining)
├── INFO: New pod created (or "Using existing pod")
├── INFO: Match status updated to accepted
├── DEBUG: Seats taken incremented
├── INFO: Pod member created (pending rider confirmation)
└── INFO: Match accepted successfully
```

### **Match Confirmation**

```sql
-- Example: Rider confirms match
confirm_match_suggestion
├── INFO: Rider attempting to confirm match
├── DEBUG: Match details retrieved
├── INFO: Pod member status updated to active
├── INFO: Match status updated to confirmed
├── INFO: Competing matches expired
├── INFO: Ride request status updated to matched
└── INFO: Match confirmed successfully
```

---

## 🔍 How to Query Logs

### **1. Via API (Recommended)**

```typescript
// Get recent logs
const response = await fetch('/api/logs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    hours: 24,    // Last 24 hours
    limit: 100    // Max 100 results
  })
});

const logs = await response.json();

// Filter by entity
const matchLogs = await fetch('/api/logs', {
  method: 'POST',
  body: JSON.stringify({
    entityType: 'match',
    entityId: '123...',
    hours: 1
  })
});

// Get error logs only
const errors = await fetch('/api/logs?hours=24&limit=50');
```

### **2. Via SQL (Supabase Dashboard)**

```sql
-- View recent logs
SELECT * FROM recent_activity_logs;

-- Get logs for specific match
SELECT * FROM get_entity_logs('match', '123...', 50);

-- Get user activity
SELECT * FROM get_user_activity('456...', 100);

-- Get errors from last 24 hours
SELECT * FROM get_error_logs(24, 50);

-- Custom query
SELECT 
    log_time,
    log_level,
    function_name,
    action,
    details
FROM activity_logs
WHERE entity_type = 'pod'
  AND entity_id = '789...'
ORDER BY log_time DESC;
```

### **3. Via Supabase Client**

```typescript
const { data: logs } = await supabase
  .from('activity_logs')
  .select('*')
  .eq('entity_type', 'match')
  .eq('entity_id', matchId)
  .gte('log_time', new Date(Date.now() - 3600000).toISOString()) // Last hour
  .order('log_time', { ascending: false })
  .limit(50);
```

---

## 📊 Example Log Entries

### **Successful Match Calculation**

```json
{
  "id": "abc123...",
  "log_time": "2026-03-13T10:30:00Z",
  "log_level": "INFO",
  "function_name": "calculate_route_match_score",
  "action": "Match calculation completed",
  "user_id": null,
  "entity_type": "match",
  "entity_id": null,
  "details": {
    "template_id": "tpl_123...",
    "request_id": "req_456...",
    "route_match_score": 0.875,
    "schedule_match_score": 0.78,
    "overall_score": 0.837,
    "pickup_distance_meters": 250,
    "day_overlap": 0.75,
    "time_compatibility": 0.9,
    "compatible": true
  }
}
```

### **Failed Match (Too Far)**

```json
{
  "id": "def456...",
  "log_time": "2026-03-13T10:31:00Z",
  "log_level": "INFO",
  "function_name": "calculate_route_match_score",
  "action": "Pickup too far from route",
  "details": {
    "template_id": "tpl_123...",
    "request_id": "req_789...",
    "pickup_distance_meters": 2500,
    "max_detour_meters": 2000,
    "excess_meters": 500
  }
}
```

### **Error Log**

```json
{
  "id": "ghi789...",
  "log_time": "2026-03-13T10:32:00Z",
  "log_level": "ERROR",
  "function_name": "accept_match_suggestion",
  "action": "No available seats",
  "user_id": "host_123...",
  "entity_type": "match",
  "entity_id": "match_456...",
  "error_message": "All seats are already taken",
  "details": {
    "available_seats": 3,
    "seats_taken": 3
  }
}
```

---

## 🛠️ Deployment Steps

### **Step 1: Create Logging System**

Run in Supabase SQL Editor:

```sql
-- 1. Create logging infrastructure
-- Run: database/functions/00_logging.sql
```

### **Step 2: Update Functions with Logging**

```sql
-- 2. Replace matching function with logged version
-- Run: database/functions/02_matching_logged.sql

-- 3. Replace match management with logged version
-- Run: database/functions/03_match_management_logged.sql
```

### **Step 3: Verify Logs**

```sql
-- Check if logs are being created
SELECT * FROM recent_activity_logs LIMIT 10;
```

---

## 🔧 Usage Examples

### **Add Logging to Custom Function**

```sql
CREATE OR REPLACE FUNCTION my_custom_function(user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    log_id UUID;
BEGIN
    -- Log function entry
    log_id := log_activity(
        'INFO',
        'my_custom_function',
        'Starting custom operation',
        user_id,
        'custom_entity',
        NULL,
        jsonb_build_object('user_id', user_id)
    );

    -- Your logic here...

    -- Log success
    PERFORM log_activity(
        'INFO',
        'my_custom_function',
        'Operation completed successfully',
        user_id,
        'custom_entity',
        entity_id,
        jsonb_build_object('result', 'success')
    );

    RETURN json_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    -- Log error
    PERFORM log_error(
        'my_custom_function',
        'Operation failed',
        SQLERRM,
        user_id,
        'custom_entity',
        NULL,
        jsonb_build_object('sql_state', SQLSTATE)
    );
    
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

### **Log in API Route**

```typescript
// src/app/api/my-route/route.ts
export async function POST(request: NextRequest) {
  const supabase = createClient(...);
  
  try {
    const { userId, data } = await request.json();

    // Log API call
    await supabase.from('activity_logs').insert({
      log_level: 'INFO',
      function_name: 'api_my_route',
      action: 'API call received',
      user_id: userId,
      details: { data }
    });

    // Process...

    return NextResponse.json({ success: true });
  } catch (error) {
    // Log error
    await supabase.from('activity_logs').insert({
      log_level: 'ERROR',
      function_name: 'api_my_route',
      action: 'API call failed',
      details: { error: error.message }
    });

    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

---

## 📈 Monitoring & Alerts

### **Create Dashboard View**

```sql
CREATE VIEW log_dashboard AS
SELECT 
    log_level,
    COUNT(*) as count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
FROM activity_logs
WHERE log_time > NOW() - '24 hours'::INTERVAL
GROUP BY log_level
ORDER BY count DESC;
```

### **Check Error Rate**

```sql
-- Error rate per hour
SELECT 
    DATE_TRUNC('hour', log_time) as hour,
    COUNT(*) FILTER (WHERE log_level = 'ERROR') as errors,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE log_level = 'ERROR') * 100.0 / COUNT(*) as error_rate
FROM activity_logs
WHERE log_time > NOW() - '7 days'::INTERVAL
GROUP BY DATE_TRUNC('hour', log_time)
ORDER BY hour DESC;
```

### **Most Common Errors**

```sql
SELECT 
    function_name,
    action,
    details->>'error_message' as error_message,
    COUNT(*) as occurrences
FROM activity_logs
WHERE log_level = 'ERROR'
  AND log_time > NOW() - '24 hours'::INTERVAL
GROUP BY function_name, action, details->>'error_message'
ORDER BY occurrences DESC
LIMIT 10;
```

---

## 🧹 Maintenance

### **Auto-Cleanup Old Logs**

```sql
-- Run daily to delete logs older than 30 days
SELECT cleanup_old_logs(30);
```

### **Set Up Automated Cleanup (pg_cron)**

```sql
-- Enable pg_cron extension (requires Supabase Pro plan)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 2 AM
SELECT cron.schedule(
    'daily-log-cleanup',
    '0 2 * * *',
    'SELECT cleanup_old_logs(30)'
);
```

---

## 🎯 Best Practices

### **Do's**
- ✅ Log all state changes (create, update, delete)
- ✅ Log all errors with context
- ✅ Log user actions for auditing
- ✅ Include relevant entity IDs in logs
- ✅ Use appropriate log levels
- ✅ Clean up old logs regularly

### **Don'ts**
- ❌ Don't log sensitive data (passwords, tokens)
- ❌ Don't log excessively in loops
- ❌ Don't rely solely on logs for critical data
- ❌ Don't forget to handle log failures gracefully

---

## 📊 Log Analytics

### **Popular Queries**

```sql
-- 1. Busiest functions
SELECT function_name, COUNT(*) as calls
FROM activity_logs
WHERE log_time > NOW() - '24 hours'::INTERVAL
GROUP BY function_name
ORDER BY calls DESC;

-- 2. User activity summary
SELECT user_id, COUNT(*) as actions
FROM activity_logs
WHERE log_time > NOW() - '7 days'::INTERVAL
GROUP BY user_id
ORDER BY actions DESC;

-- 3. Entity type distribution
SELECT entity_type, COUNT(*) as count
FROM activity_logs
WHERE log_time > NOW() - '24 hours'::INTERVAL
GROUP BY entity_type;

-- 4. Peak activity hours
SELECT DATE_TRUNC('hour', log_time) as hour, COUNT(*) as actions
FROM activity_logs
WHERE log_time > NOW() - '7 days'::INTERVAL
GROUP BY DATE_TRUNC('hour', log_time)
ORDER BY hour DESC;
```

---

## 🚨 Troubleshooting

### **Logs Not Appearing?**

1. Check if logging functions exist:
```sql
SELECT * FROM pg_proc WHERE proname IN ('log_activity', 'log_error');
```

2. Check table permissions:
```sql
GRANT ALL ON activity_logs TO service_role;
```

3. Test logging:
```sql
SELECT log_activity('INFO', 'test', 'Test log entry');
SELECT * FROM recent_activity_logs LIMIT 1;
```

### **Too Many Logs?**

- Increase cleanup frequency
- Reduce log level verbosity (log fewer DEBUG entries)
- Filter logs in queries

---

**Your database is now fully logged! 🎉**

Every action is tracked, every error is recorded, and you have complete visibility into your system.
