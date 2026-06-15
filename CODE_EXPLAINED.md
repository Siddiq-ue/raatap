# 🚀 Raatap Codebase Explained

**Raatap** is a community-based ride-sharing platform that helps verified members coordinate daily commutes together. Think of it as a carpooling app for colleges and institutions.

---

## 📱 User Flow

```
1. Sign Up → 2. Verify Email → 3. Complete Profile → 4. Create/Request Ride → 5. Get Matches → 6. Form Pod
```

### **Two User Types:**

| Host (Driver) | Rider (Passenger) |
|---------------|-------------------|
| Creates ride templates | Creates ride requests |
| Drives the route | Joins host's pod |
| Accepts match requests | Confirms matches |
| Manages pod seats | Reviews pod details |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │  Landing   │  │ Dashboard  │  │   Auth     │        │
│  │   Page     │  │   (Main)   │  │   Pages    │        │
│  └────────────┘  └────────────┘  └────────────┘        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              API Routes (Next.js API)                    │
│  /api/matches/*  /api/pods/*  /api/rides/*  /api/otp/* │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Supabase (PostgreSQL + PostGIS)             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  Tables  │  │Functions │  │  Triggers│              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
raatap/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (public pages)        # Landing, login, signup
│   │   ├── dashboard/            # Main app (protected)
│   │   ├── api/                  # API routes
│   │   └── admin/                # Admin panel
│   │
│   ├── components/               # React components
│   │   ├── LocationInput.tsx     # Address autocomplete
│   │   ├── AuthRedirect.tsx      # Auth guard
│   │   └── SessionBadge.tsx      # User session display
│   │
│   └── lib/
│       ├── supabase.ts           # Supabase client
│       └── osrm.ts               # OSRM routing (NEW)
│
├── database/
│   ├── functions/                # PostgreSQL functions
│   │   ├── 01_create_rides.sql   # Create rides
│   │   ├── 02_matching.sql       # Matching algorithm
│   │   ├── 03_match_management.sql # Accept/confirm
│   │   ├── 04_seat_management.sql # Capacity control
│   │   └── 05_auto_create_triggers.sql # Auto-matching
│   │
│   └── migrations/               # Database migrations
│
└── public/                       # Static assets
    ├── landingpage.png
    ├── verify.png
    ├── set_commute.png
    └── form_pod.png
```

---

## 🔑 Core Features & Code

### **1. Authentication Flow**

**Files:** `src/app/login/`, `src/app/signup/`, `src/app/verify-email/`

```typescript
// User signs up → gets OTP → verifies institutional email
src/app/api/otp/send/route.ts    // Send OTP to email
src/app/api/otp/verify/route.ts  // Verify OTP code
```

**Process:**
1. User enters institutional email
2. System sends 6-digit OTP
3. User verifies OTP
4. Profile created with `email_verified = true`

---

### **2. Profile Creation**

**File:** `src/app/dashboard/DashboardContent.tsx`

**What it does:**
- Collects user info (name, phone, age, gender)
- Sets commute route (home ↔ college)
- Chooses role: Host (driver) or Rider (passenger)
- Sets schedule (days, times)

**Key Fields:**
```typescript
interface FormData {
  // Personal
  full_name, phone_number, age, gender
  student_id, institution
  
  // Route
  from_location, to_location
  from_lat/lng, to_lat/lng
  
  // Schedule
  leave_home_time, leave_college_time
  days_of_commute: ["Monday", "Tuesday", ...]
  
  // Role preference
  prefer_hosting: boolean   // Want to drive
  prefer_taking_ride: boolean // Want to ride
  vehicle_type: "2_wheeler" | "4_wheeler"
}
```

---

### **3. Ride Creation**

**Database Function:** `create_ride_template_from_profile()`

**File:** `database/functions/01_create_rides.sql`

**What it does:**

```sql
-- Host creates a ride template
CREATE FUNCTION create_ride_template_from_profile(
  user_id UUID,
  vehicle_type TEXT,
  available_seats INTEGER,
  max_detour_meters INTEGER
)

-- Creates:
INSERT INTO ride_templates (
  host_id,
  from_point, to_point,      -- Route (PostGIS points)
  departure_time,             -- When leaving
  days_available,             -- [Mon, Tue, Wed]
  vehicle_type,
  available_seats,
  max_detour_meters           -- Willing to detour X meters
)
```

**For Riders:**
```sql
-- Rider creates a ride request
INSERT INTO ride_requests (
  rider_id,
  pickup_point, drop_point,
  preferred_arrival_time,
  days_needed,
  vehicle_preference
)
```

---

### **4. Matching Algorithm** ⭐

**File:** `database/functions/02_matching.sql`

**Function:** `calculate_route_match_score(template_id, request_id)`

**What it does:**

```sql
-- 1. Check basic compatibility
gender_compatible = (host.gender = rider.gender) OR (either = 'both')
vehicle_compatible = (rider wants any vehicle OR matches host's vehicle)

-- 2. Calculate route match (PostGIS)
host_route_line = ST_MakeLine(host.from_point, host.to_point)
pickup_distance = ST_Distance(rider.pickup_point, host_route_line)

-- 3. Check if detour is acceptable
IF pickup_distance > host.max_detour_meters:
  RETURN incompatible

-- 4. Calculate day overlap
overlap_count = count(host.days_available ∩ rider.days_needed)
day_overlap = overlap_count / total_days

-- 5. Calculate time compatibility
time_diff = |host.departure - rider.preferred_arrival|
IF time_diff <= rider.flexibility:
  time_compatibility = 1.0
ELSE:
  time_compatibility = decreases linearly

-- 6. Calculate scores
route_match_score = 1.0 - (pickup_distance / max_detour)
schedule_match_score = (time_compatibility × 0.7) + (day_overlap × 0.3)
overall_score = (route_match_score × 0.6) + (schedule_match_score × 0.4)

RETURN {
  compatible: true,
  route_match_score: 0.85,
  schedule_match_score: 0.75,
  overall_score: 0.81,
  pickup_distance_meters: 250
}
```

**Visual:**
```
Host Route: Office ───────────────────── Home
                    │
                    │ 250m (detour)
                    │
                Rider Pickup

Score = 1.0 - (250 / 2000) = 0.875 (87.5% match)
```

---

### **5. Match Suggestions**

**Database Function:** `generate_match_suggestions_for_ride_template()`

**File:** `database/functions/02_matching.sql`

**What it does:**

```sql
-- When host creates ride template:
FOR each active ride_request:
  match_result = calculate_route_match_score(template_id, request_id)
  
  IF match_result.compatible = true:
    INSERT INTO match_suggestions (
      ride_template_id,
      ride_request_id,
      route_match_score,
      schedule_match_score,
      overall_score,
      status = 'pending'
    )
```

**API Endpoint:** `src/app/api/matches/suggestions/route.ts`

```typescript
// Fetch matches for user
const suggestions = await supabase
  .from('match_suggestions')
  .select(`
    *,
    ride_template:ride_templates(...),
    ride_request:ride_requests(...)
  `)
  .or(`ride_template.host_id.eq.${userId},ride_request.rider_id.eq.${userId}`)
```

---

### **6. Accept/Confirm Match**

**File:** `database/functions/03_match_management.sql`

#### **Host Accepts Match:**

```sql
FUNCTION accept_match_suggestion(match_id, host_id, pod_name)

1. Verify match exists and is pending
2. Check available seats (available_seats - seats_taken > 0)
3. Create pod (if not exists)
   INSERT INTO pods (
     ride_template_id,
     host_id,
     name,
     days_active,
     departure_time,
     status = 'active'
   )
4. Update match: status = 'accepted'
5. Increment seats_taken
6. Create pod_member (rider) with status = 'pending_rider'
```

#### **Rider Confirms Match:**

```sql
FUNCTION confirm_match_suggestion(match_id, rider_id)

1. Verify match is accepted
2. Update pod_member: status = 'active'
3. Update match: status = 'confirmed'
4. Expire other competing matches (same template)
5. Update ride_request: status = 'matched'
```

**Frontend:** `src/app/dashboard/DashboardContent.tsx`

```typescript
const handleAcceptMatch = async (matchId, riderName) => {
  const response = await fetch('/api/matches/accept', {
    method: 'POST',
    body: JSON.stringify({ matchId, hostId: user.id })
  });
  // Updates UI, refreshes pod data
};

const handleConfirmMatch = async (matchId) => {
  const response = await fetch('/api/matches/confirm', {
    method: 'POST',
    body: JSON.stringify({ matchId, riderId: user.id })
  });
  // Shows success, updates dashboard
};
```

---

### **7. Pod Management**

**Tables:**
```sql
pods -- Groups formed by hosts
├── id
├── ride_template_id
├── host_id
├── name ("Daily Commute - Hitech City")
├── days_active [Mon, Tue, Wed]
├── departure_time 09:00
├── status (active, completed, dissolved)
└── created_at

pod_members -- Members in a pod
├── id
├── pod_id
├── rider_id
├── pickup_location
├── pickup_point (PostGIS)
├── status (pending_host, pending_rider, active, removed)
└── created_at
```

**API:** `src/app/api/pods/current/route.ts`

```typescript
// Get user's pods
const hostPods = await supabase
  .from('pods')
  .select('*, ride_template(...)')
  .eq('host_id', userId)
  .eq('status', 'active');

const riderRides = await supabase
  .from('pod_members')
  .select('*, pod: pods(..., ride_template(...))')
  .eq('rider_id', userId)
  .in('status', ['active', 'pending_host', 'pending_rider']);
```

---

### **8. Seat Management**

**File:** `database/functions/04_seat_management.sql`

**What it does:**
- Auto-calculates seats based on vehicle type
- Prevents overbooking
- Releases seats if match expires

```sql
-- Auto-calculate seats
vehicle_type = '2_wheeler' → 1 seat
vehicle_type = '4_wheeler' → 3 seats

-- Enforce capacity
FUNCTION enforce_capacity_check()
  IF seats_taken >= available_seats:
    Block new acceptances
    Mark template as full
```

---

### **9. Auto-Matching Triggers**

**File:** `database/functions/05_auto_create_triggers.sql`

**What it does:**

```sql
-- When new ride template created:
CREATE TRIGGER trigger_auto_match_template
AFTER INSERT ON ride_templates
FOR EACH ROW:
  PERFORM generate_match_suggestions_for_ride_template(NEW.id);

-- When new ride request created:
CREATE TRIGGER trigger_auto_match_request
AFTER INSERT ON ride_requests
FOR EACH ROW:
  PERFORM generate_match_suggestions_for_ride_request(NEW.id);
```

**Result:** Matches are generated automatically in real-time!

---

## 🗺️ OSRM Integration (Real Road Distances)

**Files:**
- `src/lib/osrm.ts` - OSRM client
- `src/app/api/matches/calculate-detour/route.ts` - API endpoint

**What it does:**

```typescript
// Instead of straight-line distance:
pickup_distance = perpendicular_distance  // ❌ Inaccurate

// Use real roads:
detour = (Office → Pickup → Home) - (Office → Home)  // ✅ Accurate
```

**How:**
```typescript
// Call OSRM API
const originalRoute = await getRoute(office, home);
const detourRoute = await getRouteWithWaypoint(office, pickup, home);

const realDetour = detourRoute.distance - originalRoute.distance;
```

**Benefits:**
- Accounts for actual roads
- Considers one-way streets
- More accurate matching

---

## 📊 Database Schema

### **Core Tables:**

```sql
-- User profiles
profiles
├── id (UUID)
├── full_name
├── phone_number
├── age, gender
├── student_id, institution
├── from_lat/lng, to_lat/lng  -- Commute route
├── leave_home_time, leave_college_time
├── days_of_commute [Mon, Tue, ...]
├── prefer_hosting, prefer_taking_ride
├── vehicle_type
├── email_verified
└── created_at

-- Ride templates (hosts)
ride_templates
├── id (UUID)
├── host_id
├── from_point, to_point (PostGIS)
├── departure_time, return_time
├── days_available
├── vehicle_type
├── available_seats
├── max_detour_meters
├── seats_taken
└── status (active, completed, dissolved)

-- Ride requests (riders)
ride_requests
├── id (UUID)
├── rider_id
├── pickup_point, drop_point (PostGIS)
├── preferred_arrival_time
├── days_needed
├── vehicle_preference
├── time_flexibility_mins
└── status (active, matched, cancelled)

-- Match suggestions
match_suggestions
├── id (UUID)
├── ride_template_id
├── ride_request_id
├── route_match_score
├── schedule_match_score
├── overall_score
├── detour_distance_meters
├── status (pending, shown, accepted, skipped, confirmed)
├── host_action_at
└── created_at

-- Pods (formed groups)
pods
├── id (UUID)
├── ride_template_id
├── host_id
├── name
├── days_active
├── departure_time
├── origin_location, destination_location
└── status

-- Pod members
pod_members
├── id (UUID)
├── pod_id
├── rider_id
├── pickup_location
├── pickup_point (PostGIS)
├── status
└── created_at
```

---

## 🔌 API Routes

### **Matches:**
```
POST /api/matches/suggestions  -- Get match suggestions
POST /api/matches/accept       -- Host accepts match
POST /api/matches/confirm      -- Rider confirms match
POST /api/matches/skip         -- Skip/reject match
POST /api/matches/calculate-detour -- OSRM detour calculation
```

### **Rides:**
```
POST /api/rides/templates/create -- Create ride template
POST /api/rides/requests/create  -- Create ride request
POST /api/rides/seats/manage    -- Manage seat capacity
```

### **Pods:**
```
POST /api/pods/current  -- Get user's current pods
```

### **Auth:**
```
POST /api/otp/send     -- Send OTP
POST /api/otp/verify   -- Verify OTP
POST /api/auth/logout  -- Logout
```

### **Locations:**
```
POST /api/locations/geocode    -- Address → Coordinates
POST /api/locations/reverse    -- Coordinates → Address
POST /api/locations/search     -- Search places
```

---

## 🎯 Key Components

### **DashboardContent.tsx** (2560 lines)

**Main app logic:**

```typescript
// States
- formData (profile info)
- matchSuggestions (pending matches)
- confirmedPods (active pods)
- notification (toast messages)
- OTP verification states

// Functions
- handleAcceptMatch(matchId, riderName)
- handleConfirmMatch(matchId)
- handleSkipMatch(matchId)
- fetchMatchSuggestions(userId)
- fetchConfirmedPods(userId)
- submitProfile()
```

### **LocationInput.tsx**

**Address autocomplete:**

```typescript
// Uses Google Places API
- User types address
- Shows suggestions
- On select: gets lat/lng
- Stores in form data
```

### **AuthRedirect.tsx**

**Auth guard:**

```typescript
// Checks if user is logged in
// Redirects to /login if not
// Redirects to /dashboard if already logged in
```

---

## 🚀 Deployment Flow

### **1. Deploy Database:**
```bash
# Run in Supabase SQL Editor
database/functions/01_create_rides.sql
database/functions/02_matching.sql
database/functions/03_match_management.sql
database/functions/04_seat_management.sql
database/functions/05_auto_create_triggers.sql
```

### **2. Deploy Frontend:**
```bash
vercel deploy --prod
```

### **3. Set Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OSRM_SERVER_URL=https://router.project-osrm.org
```

---

## 📈 Data Flow Example

**Scenario: Host creates ride, rider joins**

```
1. Host (Alice) creates ride template
   ↓
   API: POST /api/rides/templates/create
   ↓
   DB: INSERT INTO ride_templates
   ↓
   Trigger: generate_match_suggestions()
   ↓
   DB: Creates match_suggestions for compatible riders

2. Rider (Bob) logs in
   ↓
   API: POST /api/matches/suggestions
   ↓
   DB: SELECT match_suggestions WHERE rider_id = Bob
   ↓
   Frontend: Shows "Alice is going your way!"

3. Bob accepts the match
   ↓
   API: POST /api/matches/accept
   ↓
   DB: accept_match_suggestion()
   ↓
   DB: Creates pod, adds Bob as pending member

4. Alice confirms Bob
   ↓
   API: POST /api/matches/confirm
   ↓
   DB: confirm_match_suggestion()
   ↓
   DB: Bob becomes active member
   ↓
   Frontend: "Pod formed! Bob is joining your ride"
```

---

## 🎨 UI Components

### **Dashboard Views:**

1. **Profile Setup** (Step 1 & 2)
   - Personal info form
   - Route selection (with map)
   - Schedule picker
   - Role selection (Host/Rider)

2. **Match Queue**
   - Cards showing compatible matches
   - Score badges (85% match)
   - Accept/Skip buttons

3. **Active Pods**
   - Pod details (route, time, days)
   - Member list
   - Seat availability
   - Leave pod option

4. **Match Details**
   - Route visualization
   - Time compatibility
   - Day overlap
   - Pickup distance

---

## 🔐 Security

```sql
-- Row Level Security (RLS) enabled on all tables

-- Example: Users can only see their own matches
CREATE POLICY "Users can view own matches"
ON match_suggestions
FOR SELECT
USING (
  ride_template_id IN (
    SELECT id FROM ride_templates WHERE host_id = auth.uid()
  )
  OR
  ride_request_id IN (
    SELECT id FROM ride_requests WHERE rider_id = auth.uid()
  )
);

-- Only admins can delete users
CREATE POLICY "Admins can delete users"
ON profiles
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  )
);
```

---

## 📝 Summary

| Component | Purpose | Key Files |
|-----------|---------|-----------|
| **Frontend** | User interface | `src/app/dashboard/`, `src/components/` |
| **API Routes** | Backend logic | `src/app/api/` |
| **Database** | Data storage | `database/functions/` |
| **Matching** | Connect hosts & riders | `02_matching.sql`, `osrm.ts` |
| **Pods** | Group management | `03_match_management.sql` |
| **Auth** | User verification | `src/app/api/otp/` |

**Raatap = Next.js + Supabase + PostGIS + OSRM**

A complete ride-sharing platform in one codebase! 🎉
