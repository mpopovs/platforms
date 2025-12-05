# Authentication Setup Guide

## Quick Setup Instructions

### 1. Create `.env.local` file

Copy the example file:
```bash
cp .env.example .env.local
```

### 2. Generate NextAuth Secret

Run this command and copy the output:
```bash
openssl rand -base64 32
```

Add it to `.env.local`:
```
NEXTAUTH_SECRET=<paste-your-generated-secret>
NEXTAUTH_URL=http://localhost:3000
```

### 3. Set Up Email Provider (Recommended for Quick Start)

Email authentication sends a magic link to users - no password needed!

#### Option A: Using Gmail (Quick for Development)

1. Enable 2-Step Verification on your Google Account
2. Go to: https://myaccount.google.com/apppasswords
3. Generate an App Password for "Mail"
4. Add to `.env.local`:
```
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-email@gmail.com
EMAIL_SERVER_PASSWORD=your-16-char-app-password
EMAIL_FROM=your-email@gmail.com
```

#### Option B: Using Resend (Recommended for Production)

1. Sign up at: https://resend.com
2. Get your API key
3. Add to `.env.local`:
```
EMAIL_SERVER_HOST=smtp.resend.com
EMAIL_SERVER_PORT=465
EMAIL_SERVER_USER=resend
EMAIL_SERVER_PASSWORD=re_your_api_key
EMAIL_FROM=onboarding@resend.dev
```

### 4. Set Up Redis (Required for Email Auth)

1. Go to: https://upstash.com
2. Create a new Redis database
3. Copy the REST URL and Token
4. Add to `.env.local`:
```
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### 5. Set Up OAuth Providers (Optional)

#### GitHub

1. Go to: https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Your App Name
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Click "Register application"
5. Copy the **Client ID** and generate a **Client Secret**
6. Add to `.env.local`:
```
GITHUB_ID=your_client_id
GITHUB_SECRET=your_client_secret
```

#### Google OAuth

1. Go to: https://console.cloud.google.com/apis/credentials
2. Create a new project (if needed)
3. Click "Create Credentials" → "OAuth Client ID"
4. Configure consent screen (if first time)
5. Choose "Web application"
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy the **Client ID** and **Client Secret**
8. Add to `.env.local`:
```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

### 6. Restart Your Dev Server

```bash
# Stop the current server (Ctrl+C)
pnpm dev
```

## Testing

### Email Sign-In
1. Click "Sign In" button in the navbar
2. Enter your email address
3. Click "Continue with Email"
4. Check your email for the magic link
5. Click the link to sign in
6. You should see your profile icon in the navbar
7. Click the profile to access the subdomain creation form

### OAuth Sign-In
1. Click "Sign In" button in the navbar
2. Choose GitHub or Google
3. Complete the OAuth flow
4. You should see your profile icon in the navbar

## Notes

- **Email auth requires Redis** (Upstash) to store verification tokens
- For email-only setup: Configure EMAIL_* and UPSTASH_* variables
- OAuth providers are optional but provide faster sign-in
- For production, update the URLs in your OAuth app settings
- Keep your `.env.local` file private (it's already in .gitignore)

## Quick Start (Email Only)

For the fastest setup, just configure:
1. Generate NEXTAUTH_SECRET
2. Set up Gmail App Password (or Resend)
3. Create Upstash Redis database
4. Restart server

You can add OAuth providers later!
