# Supabase Setup Guide

## Why Supabase?

Supabase provides everything you need in one place:
- ✅ **Authentication** (Email, OAuth, Magic Links)
- ✅ **PostgreSQL Database** (for users, subdomains, etc.)
- ✅ **Real-time subscriptions**
- ✅ **Storage** (for file uploads)
- ✅ **Edge Functions** (serverless functions)
- ✅ **Free tier** (50,000 monthly active users)

## Quick Setup (5 minutes)

### 1. Create a Supabase Project

1. Go to: https://supabase.com
2. Click "Start your project"
3. Create a new organization (if needed)
4. Click "New project"
5. Fill in:
   - **Name**: Your project name
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
6. Wait 2-3 minutes for project creation

### 2. Get Your API Keys

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

### 3. Configure Environment Variables

Create `.env.local` file:

```bash
cp .env.example .env.local
```

Add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Still need Redis for subdomain storage
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

### 4. Configure Authentication Providers

#### Enable Email Authentication (Default - Already Works!)

Email auth is enabled by default. Your app supports both:
- **Password-based login** - Users create accounts with email + password
- **Magic link** - Users can optionally sign in via email link (no password needed)

#### Enable Google OAuth (Optional)

1. In Supabase Dashboard → **Authentication** → **Providers**
2. Find **Google** and click to expand
3. Toggle **Enable Sign in with Google**
4. You need Google OAuth credentials:
   - Go to: https://console.cloud.google.com/apis/credentials
   - Create OAuth 2.0 Client ID
   - Add authorized redirect URI: `https://your-project.supabase.co/auth/v1/callback`
5. Copy **Client ID** and **Client Secret** to Supabase
6. Save

#### Enable GitHub OAuth (Optional)

1. In Supabase Dashboard → **Authentication** → **Providers**
2. Find **GitHub** and click to expand
3. Toggle **Enable Sign in with GitHub**
4. You need GitHub OAuth credentials:
   - Go to: https://github.com/settings/developers
   - Click "New OAuth App"
   - Add **Authorization callback URL**: `https://your-project.supabase.co/auth/v1/callback`
5. Copy **Client ID** and **Client Secret** to Supabase
6. Save

### 5. Configure Email Templates (Optional but Recommended)

1. Go to **Authentication** → **Email Templates**
2. Customize the magic link email:
   - Subject, content, button text, etc.
3. For development, you can use the default templates

### 6. Set Up Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Add your site URLs:
   - **Site URL**: `http://localhost:3000` (for development)
   - **Redirect URLs**: 
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/**` (wildcard for all routes)

For production, add:
- `https://yourdomain.com/auth/callback`
- `https://yourdomain.com/**`

### 7. Set Up Redis (Still Required for Subdomains)

Supabase handles auth, but you still need Redis for subdomain storage:

1. Go to: https://upstash.com
2. Create a new Redis database
3. Copy **REST URL** and **REST Token**
4. Add to `.env.local`

### 8. Restart Your Dev Server

```bash
pnpm dev
```

## Testing

1. Click **Sign In** button
2. Try email sign-in:
   - Enter your email
   - Check inbox for magic link
   - Click the link
3. Try OAuth (if configured):
   - Click Google or GitHub button
   - Complete OAuth flow

## What's Included

Your app now has:

✅ **Email Magic Links** - Passwordless authentication
✅ **OAuth** - Google & GitHub sign-in
✅ **User Profile** - Avatar, email, name
✅ **Session Management** - Automatic token refresh
✅ **Protected Routes** - Can check auth in middleware
✅ **Database Ready** - PostgreSQL for your data

## Next Steps: Using the Database

You can now use Supabase as your database! Example:

```typescript
// Create a subdomains table
// In Supabase Dashboard → SQL Editor, run:

create table subdomains (
  id uuid default gen_random_uuid() primary key,
  subdomain text unique not null,
  emoji text not null,
  user_id uuid references auth.users not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table subdomains enable row level security;

-- Allow users to read all subdomains
create policy "Subdomains are viewable by everyone"
  on subdomains for select
  using (true);

-- Allow users to create their own subdomains
create policy "Users can create subdomains"
  on subdomains for insert
  with check (auth.uid() = user_id);
```

Then in your code:

```typescript
// Create subdomain
const { data, error } = await supabase
  .from('subdomains')
  .insert({
    subdomain: 'my-site',
    emoji: '🚀',
    user_id: user.id
  });

// Get all subdomains
const { data } = await supabase
  .from('subdomains')
  .select('*');
```

## Troubleshooting

**Can't sign in?**
- Check your `.env.local` has correct Supabase URL and key
- Make sure redirect URLs are configured in Supabase dashboard
- Check browser console for errors

**Email not arriving?**
- Check spam folder
- Verify email in Supabase → Authentication → Users
- In development, you can copy the link from Supabase logs

**OAuth not working?**
- Verify OAuth credentials in Supabase dashboard
- Check callback URL matches exactly
- Make sure provider is enabled in Supabase

## Resources

- [Supabase Docs](https://supabase.com/docs)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)
