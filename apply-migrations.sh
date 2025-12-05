#!/bin/bash

# Apply short code migration to Supabase
# This script adds the short_code column and generates codes for existing models

echo "📦 Applying short code migration..."

# Check if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
  echo "Please set them in your .env.local file or export them:"
  echo "  export SUPABASE_URL='your-project-url'"
  echo "  export SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'"
  exit 1
fi

echo "✅ Environment variables found"
echo "🔗 Supabase URL: $SUPABASE_URL"

# Apply the migration
echo ""
echo "📝 Applying migration file: supabase/migrations/20250101000003_add_short_codes.sql"

# You can apply this via Supabase Dashboard > SQL Editor
# Or use the Supabase CLI if you have it installed:
# supabase db push

echo ""
echo "⚠️  MANUAL STEP REQUIRED:"
echo "1. Go to your Supabase Dashboard > SQL Editor"
echo "2. Run the SQL from: supabase/migrations/20250101000003_add_short_codes.sql"
echo ""
echo "Or if you have Supabase CLI installed:"
echo "  supabase db push"
echo ""
echo "After applying the migration, existing models will NOT have short codes."
echo "New models will get short codes automatically."
echo ""
echo "To generate short codes for existing models, run:"
echo "  npm run generate-short-codes"
