# Testing Guide - Raatap App

## Overview
This document covers all test cases for the Raatap carpooling app from both **Host** and **Rider** perspectives.

---

## Test Case Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Should work |
| ⚠️ | Edge case - verify behavior |
| 🔄 | Depends on other scenarios |

---

## Part 1: User Registration & Onboarding

### 1.1 New User Sign Up

| # | Test Case | Host | Rider | Expected Result |
|---|-----------|:----:|:-----:|-----------------|
| 1.1.1 | Sign up as Host only | ✅ | ❌ | Profile saved, vehicle type saved, ride_template created |
| 1.1.2 | Sign up as Rider only | ❌ | ✅ | Profile saved, ride_request created |
| 1.1.3 | Sign up as both Host & Rider | ✅ | ✅ | Both ride_template and ride_request created |
| 1.1.4 | Sign up without selecting Host/Rider | ⚠️ | ⚠️ | Should show validation error |
| 1.1.5 | Host selects 2-wheeler | ✅ | ❌ | available_seats = 1 |
| 1.1.6 | Host selects 4-wheeler | ✅ | ❌ | available_seats = 3 |
| 1.1.7 | Rider should NOT see vehicle type option | ❌ | ✅ | Vehicle type hidden for riders |
| 1.1.8 | Rider vehicle_type saved as null | ❌ | ✅ | DB shows null for rider's vehicle_type |

### 1.2 Route Selection (Hosts Only)

| # | Test Case | Host | Rider | Expected Result |
|---|-----------|:----:|:-----:|-----------------|
| 1.2.1 | Select route with valid from/to locations | ✅ | ❌ | Route selector button appears |
| 1.2.2 | Click "Select Your Route" | ✅ | ❌ | Modal opens with map showing alternative routes |
| 1.2.3 | Select one of the alternative routes | ✅ | ❌ | Route saved, button shows "Change Route" |
| 1.2.4 | Skip route selection | ✅ | ❌ | Falls back to OSRM default route |
| 1.2.5 | Rider should NOT see route selector | ❌ | ✅ | Route selector button hidden |
| 1.2.6 | Change selected route | ✅ | ❌ | New route geometry saved |

### 1.3 Email Verification

| # | Test Case | Host | Rider | Expected Result |
|---|-----------|:----:|:-----:|-----------------|
| 1.3.1 | Verify with valid institutional email | ✅ | ✅ | Email verified, matching runs |
| 1.3.2 | Verify with invalid email domain | ⚠️ | ⚠️ | Should show error for invalid domain |
| 1.3.3 | OTP expires/resend works | ✅ | ✅ | Timer works, resend sends new OTP |

---

## Part 2: Matching Logic

### 2.1 Match Generation

| # | Test Case | Host | Rider | Expected Result |
|---|-----------|:----:|:-----:|-----------------|
| 2.1.1 | Host creates ride - finds matching riders | ✅ | ❌ | Match suggestions created |
| 2.1.2 | Rider creates request - finds matching hosts | ❌ | ✅ | Host suggestions shown |
| 2.1.3 | Same college hosts/riders match | ✅ | ✅ | +10 bonus score applied |
| 2.1.4 | Different college hosts/riders match | ✅ | ✅ | No bonus, normal score |

### 2.2 Seat Availability

| # | Test Case | Host | Rider | Expected Result |
|---|-----------|:----:|:-----:|-----------------|
| 2.2.1 | Host has 3 seats - show top 3 matches | ✅ | ❌ | Max 3 suggestions created |
| 2.2.2 | Host has 1 seat - show only 1 match | ✅ | ❌ | Only 1 suggestion created |
| 2.2.3 | Host has 0 seats - show no matches | ✅ | ❌ | No suggestions created |
| 2.2.4 | All seats taken - new riders see no matches | ❌ | ✅ | No suggestions for rider |

### 2.3 Score Calculation

| # | Test Case | Expected Score |
|---|-----------|----------------|
| 2.3.1 | Pickup 500m, Dest 300m, Same college | ~85-95 (base + college bonus) |
| 2.3.2 | Pickup 500m, Dest 300m, Diff college | ~75-85 |
| 2.3.3 | Pickup 1800m (near max), Dest 800m | Score drops significantly |
| 2.3.4 | Pickup >2000m | ❌ No match (incompatible) |
| 2.3.5 | Dest >1000m | ❌ No match (incompatible) |

### 2.4 Gender Preferences

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 2.4.1 | Host: Male only + Rider: Male | ✅ Match |
| 2.4.2 | Host: Male only + Rider: Female | ❌ No match |
| 2.4.3 | Host: Both + Rider: Any | ✅ Match |
| 2.4.4 | Host: Female only + Rider: Female | ✅ Match |

---

## Part 3: Dashboard & Views

### 3.1 Host Dashboard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 3.1.1 | View pending match suggestions | Shows riders sorted by score |
| 3.1.2 | Same college indicator shown | Badge shows "Same College!" |
| 3.1.3 | Accept a match | Match status → confirmed, seats decrease |
| 3.1.4 | Reject/Skip a match | Match status → rejected |
| 3.1.5 | View confirmed rides (Pods) | Shows rider names, pickup info |
| 3.1.6 | Edit route after creation | Updates route_geometry |

### 3.2 Rider Dashboard

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 3.2.1 | View available hosts | Shows hosts sorted by score |
| 3.2.2 | Same college indicator shown | Badge shows if same college |
| 3.2.3 | Request to join host | Creates match request |
| 3.2.4 | View confirmed ride | Shows host info, pickup location |

---

## Part 4: Pods / Ride Management

### 4.1 Pod Creation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 4.1.1 | Host accepts rider - pod created | Pod with host + rider |
| 4.1.2 | Multiple riders join same pod | Pod grows, seats decrease |
| 4.1.3 | Pod reaches max capacity | No more accepts allowed |
| 4.1.4 | Rider cancels before pod forms | Match suggestion removed |

### 4.2 Daily Rides

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 4.2.1 | Daily pod schedule generated | Shows today's rides |
| 4.2.2 | Host marks ride complete | Ride status → completed |
| 4.2.3 | Rider no-show | Host can mark as no-show |

---

## Part 5: Edge Cases & Error Handling

### 5.1 Location Issues

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 5.1.1 | Host enters invalid location | Validation error shown |
| 5.1.2 | From = To location | Should show error |
| 5.1.3 | Very long route (>50km) | Should work but warn user |
| 5.1.4 | OSRM service down | Fallback error message |

### 5.2 Time & Days

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 5.2.1 | No days selected | Validation error |
| 5.2.2 | Leave time > Return time | Should allow (overnight possible) |
| 5.2.3 | All days selected | Should work |

### 5.3 Concurrent Actions

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 5.3.1 | Two hosts match same rider simultaneously | First come first served |
| 5.3.2 | Rider accepts while seats filling | Show current availability |
| 5.3.3 | Host deletes account mid-ride | Pod cancelled, riders notified |

---

## Part 6: Admin Functions

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 6.1.1 | Admin verifies user manually | Triggers matching |
| 6.1.2 | Admin creates user as host | Creates ride_template |
| 6.1.3 | Admin views all pods | Shows all active pods |
| 6.1.4 | Admin cancels pod | Pod cancelled for all |

---

## Part 7: Complete User Flows

### Flow 1: Happy Path - Host with 2 Riders

```
1. User A signs up as Host (4W)
2. Selects route: Home → CBIT
3. Chooses alternative route #2
4. Verifies email
5. ✅ Ride template created with 3 seats
6. User B signs up as Rider (CBIT → Home)
7. ✅ Match suggestion created (same college +10)
8. User C signs up as Rider (CBIT → Home)
9. ✅ Second match suggestion created
10. User A (Host) views matches, accepts both
11. ✅ Pod created with Host + 2 Riders
12. ✅ Only 1 seat remaining
```

### Flow 2: Rider Looking for Host

```
1. User B signs up as Rider
2. Selects route: SR Nagar → CBIT
3. Verifies email
4. ✅ Ride request created
5. User A (Host) later signs up with route CBIT → SR Nagar
6. ✅ Match found (reverse route, within detour)
7. User B sees host suggestion
8. ✅ Same college badge shown
9. User B requests to join
10. Host A accepts
11. ✅ Pod created
```

### Flow 3: No Match Due to Constraints

```
1. Host A signs up with route: JNTU → CBIT
2. Rider B signs up with route: Gachibowli → Hi-tech City
3. ❌ No match (routes don't intersect)
4. ✅ No suggestions created
```

### Flow 4: Seat Full Scenario

```
1. Host A has 3 seats, 0 taken
2. ✅ Gets top 3 matching suggestions
3. Host accepts Rider B (1 seat taken)
4. Host accepts Rider C (2 seats taken)
5. Host accepts Rider D (3 seats taken - FULL)
6. ❌ No more suggestions shown to other riders
7. Host rejects Rider E
8. ✅ Rider E becomes available for other hosts
```

---

## Test Data Checklist

### Colleges (for same-college testing)
- CBIT Gandipet
- VJIT
- VCE
- MGIT
- Lords

### Locations (for route testing)
- Kukatpally
- Gachibowli
- Madhapur
- Hitec City
- JNTU

### Vehicle Types
- 2 Wheeler (1 seat)
- 4 Wheeler (3 seats max)

---

## Running Tests

### Manual Test Commands
```bash
# Start dev server
npm run dev

# Check for lint errors
npm run lint

# Run type check
# (if available)
```

### Test Users to Create
1. **Host1**: CBIT, Host, 4W, Kukatpally → CBIT
2. **Host2**: VJIT, Host, 2W, Gachibowli → VJIT  
3. **Rider1**: CBIT, Rider, CBIT → Kukatpally
4. **Rider2**: Different college, Rider, JNTU → MGIT
5. **Rider3**: CBIT, Rider, CBIT → Gachibowli

---

## Known Limitations (To Test & Verify)

1. ⚠️ OSRM alternatives may not return multiple routes for short distances
2. ⚠️ Exact college name matching (case sensitivity handled?)
3. ⚠️ Timezone handling for college schedules
4. ⚠️ Map display issues on slow connections
5. ⚠️ OTP resend rate limiting

---

*Last Updated: March 2026*
