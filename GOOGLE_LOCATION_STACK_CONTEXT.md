# Google Services Location Stack Context (Raatap)

## Goal
Document every project touchpoint related to Google services for location search/geocoding/maps/routing, and contrast with current free alternatives.

## TL;DR
- Google is still used for:
  - Places Autocomplete (server route)
  - Geocoding by place_id (server route)
  - Google Maps JS rendering (route selection UI)
  - Google Maps JS package dependency
- Google is NOT used for route computation anymore:
  - Route alternatives and distance/detour are OSRM-based.
- Browser geolocation (GPS from user device) is used directly via `navigator.geolocation`.

## Active Google Dependencies

### 1) NPM dependency
- `@react-google-maps/api` in `package.json`
- File: `package.json`

### 2) Google Maps API key env var
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is used by:
  - `src/app/api/locations/search/route.ts`
  - `src/app/api/locations/geocode/route.ts`
  - `src/components/RouteSelector.tsx`

## Backend/API Touchpoints (Location)

### A) Location search endpoint
- File: `src/app/api/locations/search/route.ts`
- Behavior:
  1. Reads query param `q`
  2. If Google API key exists, calls:
     - `https://maps.googleapis.com/maps/api/place/autocomplete/json`
     - params include: `input`, `key`, `components=country:in`, `types=establishment|geocode`, `language=en`
  3. If Google fails/no results, falls back to OpenStreetMap Nominatim:
     - `https://nominatim.openstreetmap.org/search`

### B) Place ID geocode endpoint
- File: `src/app/api/locations/geocode/route.ts`
- Behavior:
  - Expects `place_id`
  - Requires `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - Calls Google Geocoding API:
    - `https://maps.googleapis.com/maps/api/geocode/json`
  - Returns `lat`, `lng`, `formatted_address`

### C) Reverse geocode endpoint (already non-Google)
- File: `src/app/api/locations/reverse/route.ts`
- Behavior:
  - Expects `lat`, `lon`
  - Calls Nominatim reverse API:
    - `https://nominatim.openstreetmap.org/reverse`
  - Used to convert current GPS coordinates to human-readable address

### D) Route alternatives endpoint (already non-Google)
- File: `src/app/api/routes/alternatives/route.ts`
- Behavior:
  - Expects from/to coords
  - Calls `getAlternativeRoutes` from `src/lib/osrm.ts`
  - Returns OSRM routes with geometry/distance/duration

## Frontend/UI Touchpoints

### A) LocationInput component
- File: `src/components/LocationInput.tsx`
- Behavior:
  - Typing in location box -> calls `/api/locations/search`
  - If suggestion has string `place_id` (Google Places item), then calls `/api/locations/geocode`
  - If suggestion has `lat/lon` (Nominatim item), uses directly (no geocode call)
  - Current location button:
    - Uses `navigator.geolocation.getCurrentPosition`
    - Then calls `/api/locations/reverse` (Nominatim)

### B) RouteSelector component
- File: `src/components/RouteSelector.tsx`
- Uses `@react-google-maps/api` to render map/polylines/markers
- Loads Google JS API via key `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Fetches route geometries from `/api/routes/alternatives` (OSRM), then displays those routes on Google map canvas

## Where Components Are Used
- `src/app/dashboard/components/ProfileFormStep1.tsx`
  - Uses `LocationInput` for from/to location
  - Opens `RouteSelector` modal for host route selection
- `src/app/dashboard/DashboardContent.tsx`
  - Also uses `LocationInput` and `RouteSelector` in onboarding/profile flows

## Other Google-Related (Non-location-routing)

### A) Google OAuth auth
- Files:
  - `src/app/login/LoginForm.tsx`
  - `src/app/signup/SignupForm.tsx`
  - `src/app/api/auth/callback/route.ts`
- This is sign-in provider usage, not map/routing APIs.

### B) Google-hosted profile images
- File: `next.config.ts`
- Allows remote image host: `lh3.googleusercontent.com`

## Free/Open Alternatives Already in Project

### 1) OSRM for routing
- Library/runtime file: `src/lib/osrm.ts`
- API integration:
  - Public OSRM by default: `https://router.project-osrm.org`
  - Optional self-host: via `OSRM_SERVER_URL`
- Used by route alternatives and detour/route geometry logic

### 2) Nominatim (OpenStreetMap) for search/reverse
- Already used as fallback for search and primary for reverse geocode

### 3) SQL/database matching uses OSRM docs + functions
- Docs:
  - `OSRM_MATCHING_SETUP.md`
  - `OSRM_ROUTE_GEOMETRY_IMPLEMENTATION.md`
  - `SELF_HOST_OSRM_GUIDE.md`
- DB scripts include OSRM-specific functions and deployment flow

## Practical Cost Surface (Current)
If you remove Google API key today:
- Breaks:
  - Google Places autocomplete path
  - Google geocode by place_id path
  - Google map rendering in RouteSelector
- Still works:
  - OSRM route computation backend
  - Reverse geocode via Nominatim
  - Any search results that come from Nominatim with lat/lon

## Minimal Migration Targets (to eliminate Google location costs)
1. Replace map renderer in `RouteSelector` with Leaflet/MapLibre/OpenLayers.
2. Replace Google-first search path in `/api/locations/search` with Nominatim/Photon/Pelias-first.
3. Remove `/api/locations/geocode` dependency on Google by using OSM provider geocoding by text/object ID.
4. Remove `@react-google-maps/api` from dependencies.
5. Remove `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` usage.

## Copy/Paste Prompt For Another AI
Use this prompt as-is:

"I have a Next.js ridesharing app. Please help me remove all Google location services and migrate fully to free/open alternatives.
Current state:
- `@react-google-maps/api` is used in `src/components/RouteSelector.tsx` to display route alternatives.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is used in:
  - `src/app/api/locations/search/route.ts` (Google Places autocomplete first, fallback to Nominatim)
  - `src/app/api/locations/geocode/route.ts` (Google geocode by place_id)
  - `src/components/RouteSelector.tsx` (Google JS map loader)
- `src/components/LocationInput.tsx` calls:
  - `/api/locations/search`
  - `/api/locations/geocode` (for Google place_id suggestions)
  - `/api/locations/reverse` (already Nominatim)
- Routing itself is already OSRM-based:
  - `/api/routes/alternatives` -> `src/lib/osrm.ts`
  - OSRM default URL `https://router.project-osrm.org`, optional `OSRM_SERVER_URL`
Requirements:
1) Keep route selection UX (multiple alternatives + select one)
2) Remove Google Maps JS and Google Places/Geocoding
3) Use free stack (MapLibre/Leaflet + Nominatim/Photon/Pelias)
4) Keep current API contracts as much as possible
5) Give me step-by-step code changes and env var changes"
