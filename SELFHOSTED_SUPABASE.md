# Self-Hosted Supabase Setup Guide

## Prerequisites

Your self-hosted Supabase server should be running on your remote server. If you haven't set it up yet, follow the [official Supabase self-hosting guide](https://supabase.com/docs/guides/self-hosting).

## Configuration for Self-Hosted Supabase

### 1. Locate Your Supabase API Keys

On your self-hosted Supabase server, you can find the keys in:

**Option A: From Kong configuration**
```bash
# SSH into your server
ssh user@your-server.com

# Navigate to your Supabase docker directory
cd /path/to/supabase/docker

# Check your .env file or docker-compose.yml
cat docker/.env | grep -E "ANON_KEY|SERVICE_ROLE_KEY|API_EXTERNAL_URL"
```

**Option B: From Supabase Studio**
1. Access your Supabase Studio at `http://your-server.com:3000`
2. Go to Settings → API
3. Copy the keys

### 2. Configure Environment Variables

Create `.env.local`:

```env
# Your self-hosted Supabase URL
# Default Kong API gateway runs on port 8000
NEXT_PUBLIC_SUPABASE_URL=https://your-server.com:8000
# Or if using custom domain:
# NEXT_PUBLIC_SUPABASE_URL=https://api.yourdomain.com

# Anon key (public, safe to expose)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Service role key (optional, for admin operations - KEEP SECRET!)
# SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Redis (can also be self-hosted)
UPSTASH_REDIS_REST_URL=http://your-redis-server:6379
UPSTASH_REDIS_REST_TOKEN=your-redis-password
```

### 3. Update Supabase Auth Configuration

#### Set Site URL and Redirect URLs

On your self-hosted instance:

1. Access Supabase Studio at `http://your-server.com:3000`
2. Go to **Authentication** → **URL Configuration**
3. Set:
   - **Site URL**: `http://localhost:3000` (dev) or `https://yourdomain.com` (prod)
   - **Redirect URLs**: Add these patterns:
     ```
     http://localhost:3000/**
     https://yourdomain.com/**
     ```

#### Or via SQL:

```sql
-- Connect to your Supabase postgres database
-- Update auth config
UPDATE auth.config 
SET 
  site_url = 'https://yourdomain.com',
  uri_allow_list = '{"http://localhost:3000/**","https://yourdomain.com/**"}';
```

### 4. Configure OAuth Providers (Optional)

#### Google OAuth

1. In Studio → **Authentication** → **Providers** → **Google**
2. Or update via SQL:
```sql
-- Insert Google provider config
INSERT INTO auth.config (key, value) VALUES 
  ('external_google_enabled', 'true'),
  ('external_google_client_id', 'your-client-id'),
  ('external_google_secret', 'your-client-secret'),
  ('external_google_redirect_uri', 'https://your-server.com:8000/auth/v1/callback');
```

3. Set callback URL in Google Console:
   - `https://your-server.com:8000/auth/v1/callback`

#### GitHub OAuth

Similar to Google:
```sql
INSERT INTO auth.config (key, value) VALUES 
  ('external_github_enabled', 'true'),
  ('external_github_client_id', 'your-client-id'),
  ('external_github_secret', 'your-client-secret'),
  ('external_github_redirect_uri', 'https://your-server.com:8000/auth/v1/callback');
```

Set callback URL in GitHub:
- `https://your-server.com:8000/auth/v1/callback`

### 5. HTTPS Configuration (Recommended)

For production, use HTTPS with a reverse proxy:

#### Option A: Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/supabase
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then use:
```env
NEXT_PUBLIC_SUPABASE_URL=https://api.yourdomain.com
```

#### Option B: Caddy (Automatic HTTPS)

```caddy
# Caddyfile
api.yourdomain.com {
    reverse_proxy localhost:8000
}
```

### 6. Network Considerations

#### Firewall Rules
Ensure these ports are accessible:
- **8000**: Kong API Gateway
- **5432**: PostgreSQL (if direct access needed)
- **3000**: Supabase Studio (optional, can restrict to VPN)

#### Docker Network
If your Next.js app and Supabase are on the same Docker network:
```env
# Use internal Docker network name
NEXT_PUBLIC_SUPABASE_URL=http://kong:8000
```

### 7. Test Your Connection

Create a test file:

```typescript
// test-connection.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function test() {
  const { data, error } = await supabase.auth.getSession();
  console.log('Connection:', error ? 'Failed' : 'Success');
  console.log('Data:', data);
}

test();
```

Run:
```bash
npx tsx test-connection.ts
```

### 8. Common Issues

#### CORS Errors
Add your domain to Supabase CORS config:
```bash
# In your docker/.env file
ADDITIONAL_CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

Restart Kong:
```bash
docker-compose restart kong
```

#### SSL Certificate Issues
If using self-signed certificates in development:
```typescript
// For development only
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

#### Connection Refused
Check if Kong is running:
```bash
docker ps | grep kong
curl http://your-server:8000/
```

### 9. Self-Hosted Redis (Optional)

Instead of Upstash, you can use self-hosted Redis:

```bash
# Install Redis on your server
sudo apt install redis-server

# Or use Docker
docker run -d --name redis -p 6379:6379 redis:alpine
```

Update `.env.local`:
```env
# Self-hosted Redis
UPSTASH_REDIS_REST_URL=http://your-server:6379
UPSTASH_REDIS_REST_TOKEN=your-redis-password
```

If using Redis directly (not REST), you'll need to update `lib/redis.ts`:
```typescript
import { Redis } from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD
});
```

## Benefits of Self-Hosting

✅ **Full control** over your data
✅ **No external dependencies** on cloud services
✅ **Cost savings** for high-volume apps
✅ **Data sovereignty** - keep data in your region
✅ **Customization** - modify Supabase as needed

## Monitoring

Monitor your self-hosted instance:

```bash
# Check logs
docker-compose logs -f kong
docker-compose logs -f auth
docker-compose logs -f postgres

# Check health
curl http://your-server:8000/
```

## Backup

Don't forget to backup your PostgreSQL database:

```bash
# Backup
docker exec supabase-db pg_dump -U postgres postgres > backup.sql

# Restore
docker exec -i supabase-db psql -U postgres postgres < backup.sql
```

## Resources

- [Supabase Self-Hosting Docs](https://supabase.com/docs/guides/self-hosting)
- [Supabase Docker](https://github.com/supabase/supabase/tree/master/docker)
- [Kong Configuration](https://docs.konghq.com/)
