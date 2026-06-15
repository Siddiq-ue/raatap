# Self-Hosted OSRM Setup Guide

## Why Self-Host OSRM?

| Public OSRM | Self-Hosted OSRM |
|-------------|------------------|
| ❌ Rate limited | ✅ Unlimited requests |
| ❌ Can be slow/unreliable | ✅ Fast & reliable |
| ❌ Not for production | ✅ Production-ready |
| ✅ Zero setup | ⚠️ Requires setup |
| ✅ Free | ✅ Free (on Oracle Cloud) |

---

## Option 1: Oracle Cloud Always Free (Recommended)

### Step 1: Create Oracle Cloud Account

1. Go to [oracle.com/cloud/free](https://www.oracle.com/cloud/free/)
2. Sign up (requires credit card for verification)
3. Get 4 ARM Ampere VMs with 24GB RAM total

### Step 2: Create VM Instance

1. Go to **Compute → Instances**
2. Click **Create Instance**
3. Choose:
   - **Image:** Ubuntu 22.04
   - **Shape:** VM.Standard.A1.Flex (1 OCPU, 6GB RAM)
   - **Boot Volume:** 50GB
4. Add SSH key
5. Click **Create**

### Step 3: Install Docker

```bash
# SSH into your VM
ssh -i your-key.pem ubuntu@YOUR_VM_IP

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Logout and login again for group changes
exit
ssh -i your-key.pem ubuntu@YOUR_VM_IP
```

### Step 4: Download OSM Data

```bash
# Create OSRM directory
mkdir ~/osrm && cd ~/osrm

# Download OSM extract for your region
# Options:
# - Russia: https://download.geofabrik.de/russia-latest.osm.pbf
# - Europe: https://download.geofabrik.de/europe-latest.osm.pbf
# - India: https://download.geofabrik.de/asia/india-latest.osm.pbf
# - US: https://download.geofabrik.de/north-america-latest.osm.pbf

# Example: Download Moscow region
wget https://download.geofabrik.de/russia/moscow-latest.osm.pbf

# Or download full Russia
wget https://download.geofabrik.de/russia-latest.osm.pbf
```

### Step 5: Process OSM Data

```bash
# Extract OSM data for car routing
docker run --rm -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/moscow-latest.osm.pbf

# This creates: moscow-latest.osrm.* files
```

### Step 6: Build Route Data

```bash
# Partition the data (faster startup)
docker run --rm -v $(pwd):/data osrm/osrm-backend osrm-partition /data/moscow-latest.osrm

# Customize the data (optional)
docker run --rm -v $(pwd):/data osrm/osrm-backend osrm-customize /data/moscow-latest.osrm
```

### Step 7: Run OSRM Server

```bash
# Run OSRM HTTP server
docker run -dt --name osrm -p 5000:5000 \
  -v $(pwd):/data \
  osrm/osrm-backend \
  osrm-russia --algorithm mld /data/moscow-latest.osrm
```

### Step 8: Test OSRM

```bash
# Test the API
curl "http://localhost:5000/route/v1/driving/37.6176,55.7558;37.6000,55.7500?overview=false"

# Should return JSON with route distance and duration
```

### Step 9: Configure Firewall

```bash
# Open port 5000
sudo ufw allow 5000/tcp
sudo ufw reload

# Or via Oracle Cloud Console:
# Networking → Virtual Cloud Networks → Security Lists
# Add Ingress Rule: TCP 5000
```

### Step 10: Update Your App

```bash
# In Vercel/Railway environment variables:
OSRM_SERVER_URL=http://YOUR_VM_IP:5000
```

---

## Option 2: Fly.io (Easier, Uses Free Allowance)

### Step 1: Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
```

### Step 2: Login

```bash
fly auth login
```

### Step 3: Create App

```bash
mkdir osrm-fly && cd osrm-fly
```

### Step 4: Download OSM Data

```bash
# Download small region (e.g., Moscow)
wget https://download.geofabrik.de/russia/moscow-latest.osm.pbf
```

### Step 5: Create Dockerfile

```dockerfile
FROM osrm/osrm-backend

WORKDIR /data

# Copy OSM file
COPY moscow-latest.osm.pbf /data/

# Extract
RUN osrm-extract -p /opt/car.lua /data/moscow-latest.osm.pbf

# Partition
RUN osrm-partition /data/moscow-latest.osrm

# Customize
RUN osrm-customize /data/moscow-latest.osrm

EXPOSE 5000

CMD ["osrm-russia", "--algorithm", "mld", "/data/moscow-latest.osrm"]
```

### Step 6: Deploy

```bash
fly launch --name osrm-moscow --region ams
fly deploy
fly scale memory 512
```

### Step 7: Get URL

```bash
fly status
# Output: osrm-moscow.fly.dev

# Update your app:
OSRM_SERVER_URL=https://osrm-moscow.fly.dev
```

**Estimated Cost:** ~$0-2/month (uses free allowance)

---

## Option 3: Local Development (Testing)

### Step 1: Install Docker

Download from [docker.com](https://www.docker.com/products/docker-desktop)

### Step 2: Download OSM Data

```bash
# Download small test area
wget https://download.geofabrik.de/russia/moscow-latest.osm.pbf
```

### Step 3: Run OSRM

```bash
# Extract
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-extract -p /opt/car.lua /data/moscow-latest.osm.pbf

# Partition
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-partition /data/moscow-latest.osrm

# Customize
docker run -t -v $(pwd):/data osrm/osrm-backend osrm-customize /data/moscow-latest.osrm

# Run server
docker run -p 5000:5000 -v $(pwd):/data osrm/osrm-backend osrm-russia --algorithm mld /data/moscow-latest.osrm
```

### Step 4: Test

```bash
curl "http://localhost:5000/route/v1/driving/37.6176,55.7558;37.6000,55.7500?overview=false"
```

---

## Option 4: Docker Compose (Production)

```yaml
version: '3.8'

services:
  osrm:
    image: osrm/osrm-backend
    container_name: osrm
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - ./data:/data
    command: >
      osrm-russia
      --algorithm mld
      --max-table-size 1000
      --max-matching-size 1000
      /data/moscow-latest.osrm
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:5000/route/v1/driving/37.6,55.7;37.6,55.8?overview=false"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Run:**
```bash
docker-compose up -d
```

---

## OSM Data Sources

### Geofabrik (Recommended)
- https://download.geofabrik.de/
- Updated daily
- Good for countries/regions

### BBBike
- https://download.bbbike.org/osm/bbbike/
- Custom extracts
- Good for cities

### OpenStreetMap US
- https://openstreetmap.us/
- US-focused

---

## Data Size Reference

| Region | OSM File Size | Processed Size | RAM Required |
|--------|--------------|----------------|--------------|
| Moscow | ~200 MB | ~1 GB | 512 MB |
| Russia | ~2 GB | ~10 GB | 4 GB |
| Europe | ~10 GB | ~50 GB | 8 GB |
| India | ~3 GB | ~15 GB | 4 GB |
| USA | ~15 GB | ~80 GB | 16 GB |

---

## Performance Optimization

### 1. Use MLD Algorithm (Faster)

```bash
osrm-partition --algorithm MLD data.osrm
osrm-customize data.osrm
osrm-routed --algorithm MLD data.osrm
```

### 2. Enable Compression

```bash
# Behind nginx
server {
  listen 80;
  server_name osrm.yourdomain.com;

  location / {
    proxy_pass http://localhost:5000;
    gzip on;
    gzip_types application/json;
  }
}
```

### 3. Add Caching (Redis)

```typescript
// In your app
import Redis from 'ioredis';
const redis = new Redis();

async function getRoute(from, to) {
  const key = `route:${from.lat},${from.lng}-${to.lat},${to.lng}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const route = await fetchFromOSRM(from, to);
  await redis.setex(key, 300, JSON.stringify(route)); // 5 min TTL
  return route;
}
```

### 4. Use SSD Storage

OSRM benefits greatly from SSD:
- Faster partitioning
- Faster route calculation
- Faster startup

---

## Monitoring

### Health Check Endpoint

```bash
curl http://localhost:5000/route/v1/driving/37.6,55.7;37.6,55.8?overview=false
```

### Prometheus Metrics (Optional)

```bash
# Use osrm-backend with prometheus exporter
docker run -p 5000:5000 -p 9090:9090 \
  -v $(pwd):/data \
  osrm/osrm-backend-prometheus
```

---

## Troubleshooting

### "Cannot allocate memory"

**Solution:** Increase VM RAM or use smaller region

### "No route found"

**Solution:** Check coordinates are within OSM data bounds

### Slow responses

**Solution:** 
1. Use MLD algorithm
2. Ensure SSD storage
3. Add caching layer

### OSRM won't start

```bash
# Check logs
docker logs osrm

# Restart
docker restart osrm

# Rebuild data
rm *.osrm.*
osrm-extract -p /opt/car.lua data.osm.pbf
osrm-partition data.osrm
osrm-customize data.osrm
```

---

## Cost Comparison

| Solution | Monthly Cost | Setup Time | Reliability |
|----------|-------------|------------|-------------|
| Public OSRM | $0 | 0 min | ⭐⭐ |
| Oracle Cloud | $0 | 60 min | ⭐⭐⭐⭐⭐ |
| Fly.io | $0-2 | 20 min | ⭐⭐⭐⭐ |
| Railway | $5 | 15 min | ⭐⭐⭐⭐ |
| AWS EC2 | $10-20 | 30 min | ⭐⭐⭐⭐⭐ |

---

## Next Steps

1. **Start with public OSRM** for development
2. **Deploy to Oracle Cloud** when ready for production
3. **Monitor usage** and upgrade if needed
4. **Add caching** to reduce API calls

**Quick Start Command:**

```bash
# Test with public OSRM first
export OSRM_SERVER_URL=https://router.project-osrm.org

# When ready, switch to self-hosted
export OSRM_SERVER_URL=http://YOUR_ORACLE_VM:5000
```
