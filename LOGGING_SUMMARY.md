# 🔔 Logging System Added to Raatap

## ✅ What Was Added

A comprehensive logging system that tracks **everything** happening in the database.

---

## 📁 New Files Created

| File | Purpose |
|------|---------|
| `database/functions/00_logging.sql` | Core logging infrastructure |
| `database/functions/02_matching_logged.sql` | Matching with full logging |
| `database/functions/03_match_management_logged.sql` | Accept/Confirm with logging |
| `src/app/api/logs/route.ts` | API to query logs |
| `DATABASE_LOGGING_GUIDE.md` | Complete documentation |

---

## 🗄️ What Gets Logged

### **Every Database Action:**

```
✅ Match calculations (scores, distances, compatibility)
✅ Match acceptances (pod creation, seat updates)
✅ Match confirmations (status changes, member activation)
✅ Errors (validation failures, system errors)
✅ State changes (pending → accepted → confirmed)
✅ User actions (who did what and when)
```

---

## 📊 Example Log Output

### **Match Calculation:**
```json
{
  "log_level": "INFO",
  "function_name": "calculate_route_match_score",
  "action": "Match calculation completed",
  "details": {
    "route_match_score": 0.875,
    "schedule_match_score": 0.78,
    "overall_score": 0.837,
    "pickup_distance_meters": 250,
    "compatible": true
  }
}
```

### **Error:**
```json
{
  "log_level": "ERROR",
  "function_name": "accept_match_suggestion",
  "action": "No available seats",
  "error_message": "All seats are already taken",
  "details": {
    "available_seats": 3,
    "seats_taken": 3
  }
}
```

---

## 🚀 How to Deploy

### **Step 1: Create Logging System**

Run in Supabase SQL Editor:

```bash
# 1. Core logging
database/functions/00_logging.sql

# 2. Update matching function
database/functions/02_matching_logged.sql

# 3. Update match management
database/functions/03_match_management_logged.sql
```

### **Step 2: Test Logging**

```sql
-- Test log entry
SELECT log_activity('INFO', 'test', 'Testing logging system');

-- View recent logs
SELECT * FROM recent_activity_logs LIMIT 10;
```

---

## 🔍 How to View Logs

### **1. Via API (Recommended)**

```typescript
// Get recent logs
const logs = await fetch('/api/logs', {
  method: 'POST',
  body: JSON.stringify({ hours: 24, limit: 100 })
});

// Get logs for specific match
const matchLogs = await fetch('/api/logs', {
  method: 'POST',
  body: JSON.stringify({
    entityType: 'match',
    entityId: matchId,
    hours: 1
  })
});

// Get error logs
const errors = await fetch('/api/logs?hours=24&limit=50');
```

### **2. Via SQL**

```sql
-- Recent logs
SELECT * FROM recent_activity_logs;

-- Logs for specific entity
SELECT * FROM get_entity_logs('match', 'match-id', 50);

-- User activity
SELECT * FROM get_user_activity('user-id', 100);

-- Recent errors
SELECT * FROM get_error_logs(24, 50);
```

---

## 📈 Benefits

| Before | After |
|--------|-------|
| ❌ No visibility into DB | ✅ Complete audit trail |
| ❌ Hard to debug issues | ✅ Detailed error context |
| ❌ Unknown user actions | ✅ Every action tracked |
| ❌ Silent failures | ✅ All errors logged |

---

## 🎯 Log Levels

| Level | Description | Example |
|-------|-------------|---------|
| **DEBUG** | Technical details | "Pickup distance: 250m" |
| **INFO** | Normal operations | "Match accepted successfully" |
| **WARNING** | Potential issues | "Seat capacity nearly full" |
| **ERROR** | Recoverable errors | "No available seats" |
| **CRITICAL** | System failures | "Database connection lost" |

---

## 🧹 Auto-Cleanup

Logs are automatically cleaned up after 30 days:

```sql
-- Run daily (manual or automated)
SELECT cleanup_old_logs(30);
```

---

## 📊 Log Table Schema

```sql
activity_logs (
    id UUID,
    log_time TIMESTAMPTZ,
    log_level TEXT,           -- DEBUG, INFO, WARNING, ERROR, CRITICAL
    function_name TEXT,       -- Which function logged
    action TEXT,              -- What happened
    user_id UUID,             -- Who did it
    entity_type TEXT,         -- What type (match, pod, ride)
    entity_id UUID,           -- Which entity
    details JSONB             -- Additional context
)
```

---

## 🔧 Usage Examples

### **Debug a Match Issue**

```typescript
// Get all logs for a specific match
const matchLogs = await fetch('/api/logs', {
  method: 'POST',
  body: JSON.stringify({
    entityType: 'match',
    entityId: 'problem-match-id',
    hours: 24
  })
});

const logs = await matchLogs.json();
console.log(logs);
```

### **Monitor Errors**

```typescript
// Get errors from last hour
const errors = await fetch('/api/logs', {
  method: 'POST',
  body: JSON.stringify({
    logLevel: 'ERROR',
    hours: 1,
    limit: 50
  })
});
```

### **Track User Activity**

```typescript
// See what a user did
const activity = await fetch('/api/logs', {
  method: 'POST',
  body: JSON.stringify({
    userId: 'user-id',
    hours: 168 // Last week
  })
});
```

---

## 📝 What's Logged

### **Matching:**
- ✅ Match calculation started
- ✅ Template/request found
- ✅ Gender/vehicle compatibility checks
- ✅ Pickup distance calculated
- ✅ Day overlap calculated
- ✅ Time compatibility calculated
- ✅ Final scores (route, schedule, overall)
- ✅ Match result (compatible/incompatible)
- ✅ Errors (template not found, too far, etc.)

### **Accept Match:**
- ✅ Host attempting to accept
- ✅ Match details retrieved
- ✅ Seat availability check
- ✅ Pod created/used
- ✅ Match status updated
- ✅ Seats incremented
- ✅ Pod member created
- ✅ Success confirmation

### **Confirm Match:**
- ✅ Rider attempting to confirm
- ✅ Match details retrieved
- ✅ Pod member activated
- ✅ Match status updated
- ✅ Competing matches expired
- ✅ Ride request updated
- ✅ Success confirmation

---

## 🎯 Next Steps

1. **Deploy logging system:**
   ```bash
   # Run in Supabase SQL Editor
   database/functions/00_logging.sql
   database/functions/02_matching_logged.sql
   database/functions/03_match_management_logged.sql
   ```

2. **Test logging:**
   ```sql
   SELECT * FROM recent_activity_logs LIMIT 10;
   ```

3. **Use logs for debugging:**
   ```typescript
   const logs = await fetch('/api/logs', { ... });
   ```

---

**Your database is now fully logged! 🎉**

Every action is tracked, every error is recorded, complete visibility achieved.

See full documentation: [`DATABASE_LOGGING_GUIDE.md`](./DATABASE_LOGGING_GUIDE.md)
