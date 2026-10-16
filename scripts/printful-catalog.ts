/**
 * Find Printful ids for the shop config, using the token in .env.local.
 * Prints nothing secret.
 *
 *   pnpm tsx scripts/printful-catalog.ts stores
 *   pnpm tsx scripts/printful-catalog.ts search "youth"      # products by name
 *   pnpm tsx scripts/printful-catalog.ts variants 71 white   # sizes for a colour
 *
 * Copy the result into PRINTFUL_PRODUCT_ID and PRINTFUL_VARIANTS.
 */
import { config } from 'dotenv';
import { createPrintfulClient } from '../lib/shop/printful';

config({ path: '.env.local' });
config();

const token = process.env.PRINTFUL_TOKEN;
if (!token) {
  console.error('PRINTFUL_TOKEN is not set in .env.local');
  process.exit(1);
}
const pf = createPrintfulClient({ token, storeId: process.env.PRINTFUL_STORE_ID || null });

type Product = { id: number; name: string; type?: string; is_discontinued?: boolean };
type Variant = { id: number; name?: string; size?: string; color?: string };

async function all<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await pf.request<T[]>('GET', `${path}${sep}limit=100&offset=${offset}`);
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'stores') {
    const stores = await pf.request<{ id: number; name: string; type?: string }[]>('GET', '/v2/stores');
    for (const s of stores) console.log(`${s.id}\t${s.name}\t${s.type ?? ''}`);
  } else if (cmd === 'search') {
    const q = (a ?? '').toLowerCase();
    const products = await all<Product>('/v2/catalog-products');
    for (const p of products) {
      if (!p.is_discontinued && p.name.toLowerCase().includes(q)) console.log(`${p.id}\t${p.name}`);
    }
  } else if (cmd === 'variants' && a) {
    const colour = (b ?? '').toLowerCase();
    const variants = await all<Variant>(`/v2/catalog-products/${a}/catalog-variants`);
    const picked = variants.filter((v) => !colour || (v.color ?? '').toLowerCase() === colour);
    for (const v of picked) console.log(`${v.id}\t${v.size}\t${v.color}`);
    if (colour && picked.length) {
      console.log('\nPRINTFUL_PRODUCT_ID=' + a);
      console.log('PRINTFUL_VARIANTS=' + picked.map((v) => `${v.size}:${v.id}`).join(','));
    }
  } else {
    console.log('usage: stores | search <text> | variants <productId> [colour]');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
