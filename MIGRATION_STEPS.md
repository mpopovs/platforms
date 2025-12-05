# Short Codes Migration Steps

## Why Short Codes Aren't Showing

Short codes won't appear in the admin panel until you:
1. ✅ Apply the database migration (adds `short_code` column)
2. ✅ Generate short codes for existing models

## Step 1: Apply Database Migration

### Option A: Via Supabase Dashboard (Recommended)

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Copy and paste this SQL:

```sql
-- Add short_code column to viewer_models for short upload URLs
ALTER TABLE viewer_models
ADD COLUMN short_code TEXT UNIQUE;

-- Create index for fast short code lookups
CREATE INDEX IF NOT EXISTS idx_viewer_models_short_code ON viewer_models(short_code);

-- Add comment
COMMENT ON COLUMN viewer_models.short_code IS 'Short code for simplified upload URLs (e.g., /u/abc123)';
```

4. Click **Run**

### Option B: Via Supabase CLI

If you have Supabase CLI installed:

```bash
supabase db push
```

### Option C: Self-Hosted Supabase (psql)

```bash
psql -h claypixels.eu -p 5432 -U postgres -d postgres -f supabase/migrations/20250101000003_add_short_codes.sql
```

## Step 2: Generate Short Codes for Existing Models

After applying the migration, run this script to generate short codes for existing models:

```bash
pnpm run generate-short-codes
```

This will:
- Find all models without short codes
- Generate a unique 4-character code for each
- Update the `short_code` and `qr_code_data` fields
- Show progress for each model

### Example Output

```
🔍 Finding models without short codes...
📝 Found 3 models without short codes

  Processing: my-model.glb
    Generated code: K7mN
    ✅ Updated

  Processing: another-model.glb
    Generated code: Xy3A
    ✅ Updated

  Processing: third-model.glb
    Generated code: 9Pqr
    ✅ Updated

📊 Summary:
  ✅ Success: 3
  ❌ Errors: 0

🎉 Done!
```

## Step 3: Verify

1. Refresh your admin page: `/admin/viewers`
2. You should now see short links under each model:
   ```
   🔗 yourdomain.com/u/K7mN  [Copy]
   Upload link (QR code directs here)
   ```

## Future Models

All **new models** uploaded after the migration will automatically get short codes. No manual steps needed!

## Troubleshooting

### "Cannot connect to database"
- Check your `.env.local` file
- Make sure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

### "Models still don't have short codes"
- Run: `pnpm run generate-short-codes`
- Check the output for errors

### "Short codes not showing in UI"
- Clear browser cache
- Refresh the page
- Check if the migration was applied: Go to Supabase Dashboard > Table Editor > viewer_models
- You should see a `short_code` column

### "Duplicate key error"
- This means a short code collision occurred (very rare with 10.5 million combinations)
- Run the script again - it will generate new codes for failed models

## Migration File Location

The migration SQL is here:
```
supabase/migrations/20250101000003_add_short_codes.sql
```

## What Gets Updated

When you run `generate-short-codes`:

**Before**:
```json
{
  "id": "model_123",
  "short_code": null,
  "qr_code_data": "https://domain.com/upload/viewer_xxx/model_123"
}
```

**After**:
```json
{
  "id": "model_123",
  "short_code": "K7mN",
  "qr_code_data": "https://domain.com/u/K7mN"
}
```

The QR code URL is also updated to use the short link!
