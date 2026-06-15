-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ride_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pods ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_members ENABLE ROW LEVEL SECURITY;

-- Profiles: Allow read for all authenticated users
CREATE POLICY "Profiles are viewable by everyone" 
ON profiles FOR SELECT 
TO authenticated 
USING (true);

-- Profiles: Allow update only for self
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id);

-- Profiles: Allow insert for self (handling new user trigger usually does this, but for completeness)
CREATE POLICY "Users can insert own profile" 
ON profiles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

-- Ride Requests: Viewable by everyone (for matching) or at least by hosts
-- For simplicity in this MVP, viewable by authenticated users
CREATE POLICY "Ride requests are viewable by authenticated users" 
ON ride_requests FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Riders can insert own requests" 
ON ride_requests FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = rider_id);

CREATE POLICY "Riders can update own requests" 
ON ride_requests FOR UPDATE 
TO authenticated 
USING (auth.uid() = rider_id);

-- Ride Templates: Viewable by everyone
CREATE POLICY "Ride templates are viewable by authenticated users" 
ON ride_templates FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Hosts can insert own templates" 
ON ride_templates FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update own templates" 
ON ride_templates FOR UPDATE 
TO authenticated 
USING (auth.uid() = host_id);

-- Match Suggestions: Viewable by related host and rider
-- Actually, our API uses service_role key, so RLS is bypassed in API routes.
-- checking API code:
-- import { createClient } from "@supabase/supabase-js";
-- const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

-- WAIT! The API uses SUPABASE_SERVICE_ROLE_KEY!
-- This means RLS is BYPASSED for all API calls.
-- So RLS is NOT the issue for the "0 Riders" bug if the API is using the service role key.

-- However, for the frontend (client-side) calls, RLS matters.
-- But the "Your Pod" data comes from `api/pods/current`, which is a server-side route.
-- So `dashboard/page.tsx` calls `api/pods/current`.

-- Let's double check `api/pods/current/route.ts` imports.
