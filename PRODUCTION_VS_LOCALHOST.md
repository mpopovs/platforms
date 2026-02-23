# Production vs Localhost — What's Different & What to Watch Out For

## 1. Environment File

| | Localhost | Production Server |
|---|---|---|
| File | `.env.local` | `.env` |
| Location | project root | project root |

Next.js loads `.env.local` first on localhost but on the production server the app is started by pm2, which only sees `.env`. **Never commit `.env` or `.env.local` to git.**

---

## 2. Supabase URL — The Most Critical Rule

### ⚠️ `SUPABASE_INTERNAL_URL` must NEVER be used in `lib/supabase/server.ts`

On production the app runs on the same machine as Supabase (self-hosted), so there is a temptation to add an internal URL like `http://localhost:8000` for faster queries.

**This breaks authentication.** Here is why:

- `@supabase/ssr` derives the session **cookie name** from the Supabase URL hostname.
- The middleware (`lib/supabase/middleware.ts`) always uses `NEXT_PUBLIC_SUPABASE_URL` (e.g. `https://db.claypixels.eu`) → sets cookie `sb-db-auth-token`.
- If `lib/supabase/server.ts` uses `http://localhost:8000` → it looks for `sb-localhost-auth-token` → **not found** → `getUser()` returns `null` → every server-rendered admin page appears empty or redirects to login.

**Rule:** `lib/supabase/server.ts` and `lib/supabase/middleware.ts` **must always use the same URL** — always `NEXT_PUBLIC_SUPABASE_URL`.

`SUPABASE_INTERNAL_URL` is safe to use only in `lib/supabase.ts` (the non-SSR client used for background server actions that do not read user sessions from cookies).

### Correct state of `lib/supabase/server.ts`
```ts
return createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,   // ← always this, never SUPABASE_INTERNAL_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ...
```

---

## 3. Database Migrations — Production May Be Behind Localhost

Localhost dev may run migrations that have not yet been applied on the production Supabase instance. If code references a column or function that doesn't exist in the DB, **the query fails silently** and the page renders empty data (no crash, just no content).

### Known columns that did NOT exist on production (Feb 2026)
| Table | Missing column |
|---|---|
| `model_textures` | `queue_number` |

### How to check
```bash
# SSH into server, then:
source ~/projects/platform/.env
curl -s "http://localhost:8000/rest/v1/model_textures?limit=1&select=queue_number" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# If response is {"code":"42703",...} the column does not exist yet
```

### How to apply pending migrations
```bash
cd ~/projects/platform
ls supabase/migrations/   # see what migrations exist
# Apply manually via psql or the Supabase Studio SQL editor at https://db.claypixels.eu
```

---

## 4. After Every `git pull` — Required Steps

```bash
cd ~/projects/platform

# 1. Stash local config changes (server.ts, supabase.ts, next.config.ts)
git stash push -m "local config changes"

# 2. Pull
git pull origin main

# 3. Restore local config
git stash pop

# 4. Check if any new migrations need to be applied (see section 3)
git diff HEAD~1 HEAD -- supabase/migrations/

# 5. Rebuild and restart
pnpm build && pm2 restart platform
```

---

## 5. Local Config Changes That Must Be Kept on the Server

These three files are modified on the server and should **not** be overwritten by a pull (always stash before pulling):

| File | What's changed | Why |
|---|---|---|
| `lib/supabase/server.ts` | Uses `NEXT_PUBLIC_SUPABASE_URL` only | Fixes auth cookie mismatch (see section 2) |
| `lib/supabase.ts` | Uses `SUPABASE_INTERNAL_URL` for non-SSR server calls | Performance — direct internal network |
| `next.config.ts` | `removeConsole` in production | Removes debug logs from production build |

---

## 6. Starting / Restarting the App

Localhost: `pnpm dev`

Production:
```bash
pnpm build          # always required after code changes
pm2 restart platform
pm2 logs platform --lines 30 --nostream   # check for errors
```

---

## 7. User Accounts

There are two Supabase user accounts:

| Email | Owns viewers/data |
|---|---|
| `maris.popovs@gmail.com` | ✅ Yes — all viewers, models, textures |
| `maris.popovs@daugavpils.lv` | ❌ No data |

Always log into the admin panel with **maris.popovs@gmail.com**.

---

## 8. Hard Refresh After Deploy

After `pm2 restart platform`, always do a **hard refresh** in the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`). The browser caches old JS chunks — stale chunks cause "Failed to find Server Action" errors that look like bugs but are just the browser running old code.
