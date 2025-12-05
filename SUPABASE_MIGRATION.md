# Supabase Migration Guide

## Overview
This migration moves viewer data from Redis to Supabase PostgreSQL for persistence and adds 3D model viewer capabilities.

## Prerequisites
1. Supabase account and project
2. Environment variables configured
3. pnpm installed

## Step 1: Configure Environment Variables

Add these to your `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Step 2: Run Database Migrations

### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Option B: Manual Migration via Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Execute the migrations in order:
   - `supabase/migrations/20241112000000_create_viewer_tables.sql`
   - `supabase/migrations/20241112000001_create_storage_buckets.sql`

## Step 3: Configure Storage Buckets

If not using the SQL migration for storage, manually create buckets:

1. Go to **Storage** in Supabase dashboard
2. Create these buckets:
   - `3d-models` (Private)
   - `texture-templates` (Public)
   - `user-texture-photos` (Private, public insert)
   - `processed-textures` (Public read, auth write)

### Bucket Policies

For `user-texture-photos` bucket:
```sql
-- Allow public insert (for QR code uploads)
CREATE POLICY "Anyone can upload texture photos"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'user-texture-photos');
```

For `processed-textures` bucket:
```sql
-- Allow public read (for viewer display)
CREATE POLICY "Anyone can view processed textures"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'processed-textures');
```

## Step 4: Test Database Connection

Run the dev server and test:
```bash
pnpm dev
```

Try creating a new viewer to verify Supabase connection.

## Step 5: Data Migration (If Needed)

If you have existing viewers in Redis that need to be migrated:

1. Create a migration script:
```typescript
// scripts/migrate-redis-to-supabase.ts
import { redis } from '@/lib/redis';
import { supabase } from '@/lib/supabase';
import { ViewerKeys } from '@/lib/types/viewer';

async function migrateViewers() {
  // Get all user IDs from your system
  const userIds = []; // Fetch from your auth system
  
  for (const userId of userIds) {
    const viewerIds = await redis.get(ViewerKeys.userViewers(userId));
    
    if (viewerIds && Array.isArray(viewerIds)) {
      for (const viewerId of viewerIds) {
        const config = await redis.get(ViewerKeys.config(viewerId));
        
        if (config) {
          // Insert into Supabase
          await supabase.from('viewers').insert({
            id: config.id,
            user_id: config.userId,
            name: config.name,
            pin_hash: config.pin,
            settings: config.settings
          });
        }
      }
    }
  }
}

migrateViewers().then(() => console.log('Migration complete'));
```

2. Run the migration script:
```bash
npx tsx scripts/migrate-redis-to-supabase.ts
```

## Changes Made

### Database Schema
- `viewers` table: Stores viewer configurations
- `viewer_models` table: Stores 3D model metadata
- `model_textures` table: Stores texture upload history
- Storage buckets for file uploads
- RLS policies for security

### Code Changes
- Updated `lib/viewers.ts` to use Supabase instead of Redis
- Added functions for 3D model management
- Added functions for texture management
- Keep Redis for sessions and rate limiting only
- Updated TypeScript types to support new schema

### Dependencies Added
- `three` - 3D rendering engine
- `@react-three/fiber` - React renderer for Three.js
- `@react-three/drei` - Helper components for React Three Fiber
- `qrcode` - QR code generation
- `jsqr` - QR code scanning
- `sharp` - Image processing and perspective correction

## Redis Usage After Migration

Redis is now only used for:
- Viewer sessions (temporary, 1 hour TTL)
- Embed tokens (long-lived)
- Rate limiting and IP lockouts (24 hour TTL)

Persistent data is in Supabase PostgreSQL.

## Troubleshooting

### Migration fails
- Check Supabase credentials in `.env.local`
- Verify database connection
- Check migration file syntax

### Storage uploads fail
- Verify bucket policies are set correctly
- Check RLS policies
- Ensure CORS is configured in Supabase

### 3D models don't load
- Verify file URLs are publicly accessible
- Check CORS headers on storage buckets
- Verify model file formats (.glb or .obj)

## Next Steps

After migration:
1. Test viewer creation
2. Upload test 3D models
3. Generate QR codes
4. Test texture upload workflow
5. Verify carousel rotation display
