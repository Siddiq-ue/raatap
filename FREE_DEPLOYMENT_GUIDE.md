# Free Deployment Resources for Raatap

## Problem with Render
Render's free tier has become inefficient:
- Slow cold starts (50+ seconds)
- Limited hours/month
- Unreliable for production

---

## Recommended Free Alternatives

### 🥇 **Option 1: Vercel (Best for Next.js)**

Since this is a Next.js app, Vercel is the **optimal choice**.

**Free Tier:**
- ✅ Unlimited deployments
- ✅ 100GB bandwidth/month
- ✅ Serverless Functions (API routes)
- ✅ Automatic HTTPS & CDN
- ✅ Custom domains
- ❌ 10GB bandwidth limit (overage charges)

**Pros:**
- Built by Next.js creators
- Zero configuration needed
- Fastest deployment for Next.js
- Edge functions available

**Cons:**
- Serverless functions timeout at 10s (Hobby)
- Cold starts ~200-500ms

**Deploy:**
```bash
npm i -g vercel
vercel login
vercel deploy --prod
```

**Environment Variables to Set:**
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

---

### 🥈 **Option 2: Railway**

**Free Tier:**
- ✅ $5 free credit/month (enough for small apps)
- ✅ No cold starts (always-on containers)
- ✅ Full Node.js runtime
- ✅ PostgreSQL available
- ❌ Requires credit card

**Pros:**
- No cold starts
- Real containers (not serverless)
- Easy database setup
- Good for background jobs

**Cons:**
- Credit card required
- Can exceed free tier with heavy usage

**Deploy:**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

**Estimated Cost:** ~$0-5/month for low traffic

---

### 🥉 **Option 3: Fly.io**

**Free Tier:**
- ✅ 3 shared VMs (256MB RAM each)
- ✅ Free allowance covers small apps
- ✅ Real containers
- ✅ Global edge deployment
- ❌ Requires credit card

**Pros:**
- Real Docker containers
- Deploy close to users (global regions)
- No cold starts
- Can run OSRM locally!

**Cons:**
- More complex setup
- Need Dockerfile

**Deploy:**
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login and deploy
fly auth login
fly launch
fly deploy
```

**Dockerfile Example:**
```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY .next ./.next
COPY public ./public
COPY next.config.js ./

EXPOSE 3000

CMD ["npm", "start"]
```

**Estimated Cost:** ~$0-3/month for small app

---

### **Option 4: Netlify**

**Free Tier:**
- ✅ 100GB bandwidth/month
- ✅ Serverless functions (125k invocations/month)
- ✅ Automatic HTTPS
- ✅ Custom domains
- ❌ 10min function timeout

**Pros:**
- Similar to Vercel
- Good Next.js support
- Easy deployment

**Cons:**
- Slightly slower than Vercel for Next.js
- Function timeout limits

**Deploy:**
```bash
npm i -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

---

### **Option 5: Oracle Cloud Always Free (Best Value)**

**Free Tier:**
- ✅ 4 ARM Ampere A1 Compute instances (24GB RAM total!)
- ✅ 200GB block storage
- ✅ Always free (no time limit)
- ❌ Requires credit card for verification

**Pros:**
- Most generous free tier
- Real VPS (not serverless)
- Can host everything: frontend, backend, database, OSRM
- No cold starts

**Cons:**
- Complex setup (manual server management)
- ARM architecture (some compatibility issues)
- Approval can take time

**Setup:**
```bash
# SSH into your Oracle Cloud VM
ssh -i key.pem ubuntu@your-server-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Docker (for OSRM)
curl -fsSL https://get.docker.com | sh

# Deploy your app
git clone <your-repo>
npm install
npm run build
pm2 start npm --name "raatap" -- start
```

**Estimated Cost:** $0/month (completely free)

---

### **Option 6: Google Cloud Run**

**Free Tier:**
- ✅ 2 million requests/month
- ✅ 180,000 vCPU-seconds/month
- ✅ 360,000 GB-seconds/month
- ❌ Requires credit card

**Pros:**
- Serverless containers
- Auto-scaling to zero (no cost when idle)
- No cold start penalty for always-on option

**Cons:**
- Cold starts (~1-2 seconds)
- More complex than Vercel

**Deploy:**
```bash
gcloud auth login
gcloud run deploy raatap \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

---

## OSRM Deployment Options

### **Option A: Public OSRM Demo Server (Free)**
```typescript
https://router.project-osrm.org/route/v1/driving/...
```
- ✅ Completely free
- ✅ No setup needed
- ❌ Rate limited
- ❌ Can be slow/unreliable
- ❌ Not for production

---

### **Option B: Self-Host OSRM on Oracle Cloud (Recommended)**
```bash
# Run OSRM on your free Oracle Cloud VM
docker run -dt --name osrm -p 5000:5000 \
  osrm/osrm-backend \
  osrm-russia --algorithm mld /data.osrm
```

**Setup Guide:**
1. Download OSM extract for your region
2. Process with osrm-extract
3. Run osrm-routed
4. Use `http://your-server:5000` in your app

---

### **Option C: Fly.io OSRM**
```bash
# Deploy OSRM on Fly.io (uses free allowance)
fly launch --image osrm/osrm-backend
```

---

## Recommended Architecture

### **For Hobby/Prototype:**
```
Frontend: Vercel (free)
Backend: Vercel API Routes (free)
Database: Supabase (free tier)
OSRM: Public demo server
Total: $0/month
```

### **For Production (Low Traffic):**
```
Frontend: Vercel Pro ($20/month)
Backend: Railway ($5/month)
Database: Supabase Pro ($25/month)
OSRM: Oracle Cloud (free)
Total: ~$50/month
```

### **For Production (Budget):**
```
Everything on Oracle Cloud:
- Frontend + Backend: Node.js app
- Database: Supabase self-hosted or PostgreSQL
- OSRM: Docker container
Total: $0/month (time investment required)
```

---

## Migration Guide: Render → Vercel

### 1. **Prepare Your App**

Ensure Next.js API routes are set up (already done in your project).

### 2. **Update Environment Variables**

```bash
# In Vercel dashboard, set:
NEXT_PUBLIC_SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### 3. **Deploy**

```bash
vercel deploy --prod
```

### 4. **Update Frontend**

Change any hardcoded backend URLs:

```typescript
// Before
const BACKEND_URL = 'https://raatap-backend.onrender.com';

// After (Vercel API routes)
const BACKEND_URL = '/api'; // relative path
```

---

## Performance Comparison

| Platform | Cold Start | Function Timeout | Monthly Free |
|----------|-----------|------------------|--------------|
| **Vercel** | ~300ms | 10s (Hobby) | Unlimited |
| **Railway** | None | No limit | $5 credit |
| **Fly.io** | None | No limit | ~$0-3 |
| **Netlify** | ~500ms | 10min | 125k invocations |
| **Render** | 50+s | 15min | 750 hours |
| **Oracle Cloud** | None | No limit | Always free |

---

## Final Recommendation

**For your use case (raatap):**

1. **Start with Vercel** - Easiest migration from Render
2. **Use public OSRM** for now - Works for prototype
3. **Migrate OSRM to Oracle Cloud** when ready for production
4. **Keep Supabase** - Their free tier is generous

**Quick Start:**
```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Deploy
vercel deploy --prod

# 3. Set environment variables in Vercel dashboard
# 4. Done!
```

---

## Troubleshooting

### OSRM Rate Limiting
If you hit rate limits on public OSRM:
```typescript
// Add caching
import { Cache } from 'node-cache';

const routeCache = new Cache({ stdTTL: 300 }); // 5 minutes

async function getRouteWithCache(from, to) {
  const key = `${from.lat},${from.lng}-${to.lat},${to.lng}`;
  const cached = routeCache.get(key);
  if (cached) return cached;
  
  const route = await getRoute(from, to);
  routeCache.set(key, route);
  return route;
}
```

### Vercel Function Timeout
If OSRM calls timeout:
```typescript
// Use Edge Runtime for faster response
export const runtime = 'edge';
```

### Bandwidth Limits
Monitor usage:
```bash
vercel inspect
```
