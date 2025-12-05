/**
 * Generate short codes for existing models that don't have them
 * Run with: npx tsx scripts/generate-short-codes.ts
 */

import { createClient } from '@supabase/supabase-js';
import { generateShortCode } from '../lib/short-links';

// Load from .env.local
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateShortCodesForExistingModels() {
  console.log('🔍 Finding models without short codes...');

  // Get all models without short codes
  const { data: models, error } = await supabase
    .from('viewer_models')
    .select('id, name')
    .is('short_code', null);

  if (error) {
    console.error('❌ Error fetching models:', error);
    process.exit(1);
  }

  if (!models || models.length === 0) {
    console.log('✅ All models already have short codes!');
    return;
  }

  console.log(`📝 Found ${models.length} models without short codes`);

  let successCount = 0;
  let errorCount = 0;

  for (const model of models) {
    const shortCode = generateShortCode();

    console.log(`  Processing: ${model.name || model.id}`);
    console.log(`    Generated code: ${shortCode}`);

    const { error: updateError } = await supabase
      .from('viewer_models')
      .update({
        short_code: shortCode,
        qr_code_data: `${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'http://localhost:3000'}/u/${shortCode}`
      })
      .eq('id', model.id);

    if (updateError) {
      console.error(`    ❌ Error: ${updateError.message}`);
      errorCount++;
    } else {
      console.log(`    ✅ Updated`);
      successCount++;
    }
  }

  console.log('');
  console.log('📊 Summary:');
  console.log(`  ✅ Success: ${successCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log('');
  console.log('🎉 Done!');
}

generateShortCodesForExistingModels().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
