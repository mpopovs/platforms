import 'server-only';

import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { customAlphabet } from 'nanoid';
import { redis } from '@/lib/redis';
import { normalizeStorageUrl } from '@/lib/storage';
import { getShopConfig, type ShopConfig } from './config';
import { printfulFromEnv, type PrintfulClient } from './printful';
import { makePrintFile } from './print-file';
import type { FulfilStore } from './fulfil';

export const PRINT_BUCKET = 'print-files';
const id = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
export const newDesignId = () => `design_${id()}`;
export const newOrderId = () => `ord_${id()}`;

export class ShopError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ShopError';
  }
}

/** Service-role client: shop tables have RLS on and no public policies. */
export function shopDb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
  });
}

export function stripeFromEnv(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/** Config plus clients, or a ShopError if the shop is off or not set up. */
export function requireShop(): { config: ShopConfig; printful: PrintfulClient; stripe: Stripe; db: SupabaseClient } {
  const config = getShopConfig();
  if (!config.enabled) throw new ShopError('Shop is not enabled', 404);
  const printful = printfulFromEnv();
  const stripe = stripeFromEnv();
  if (!printful || !stripe || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ShopError('Shop is not configured', 503);
  }
  return { config, printful, stripe, db: shopDb() };
}

/** Fixed-window rate limit per key. Fails open if Redis is down. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  try {
    const k = `shop:rl:${key}`;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, windowSec);
    if (n > limit) throw new ShopError('Too many requests, try again in a minute', 429);
  } catch (err) {
    if (err instanceof ShopError) throw err;
  }
}

export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip') || 'unknown';
}

export async function signedPrintUrl(db: SupabaseClient, path: string, seconds: number): Promise<string> {
  const { data, error } = await db.storage.from(PRINT_BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(`Could not sign print file: ${error?.message}`);
  return normalizeStorageUrl(data.signedUrl);
}

export interface DesignRow {
  id: string;
  texture_id: string | null;
  model_id: string | null;
  print_file_path: string;
  print_width: number;
  print_height: number;
  coverage: number | null;
  effective_dpi: number | null;
}

/**
 * Get or create the design for a drawing: the print file. (No Printful
 * mockup: the drawing is already previewed in 3D on the upload page, and
 * the shirt page shows the flat print file.)
 * Only drawings of pilot models are allowed in the slice.
 */
export async function ensureDesign(
  ctx: { config: ShopConfig; db: SupabaseClient },
  textureId: string
): Promise<DesignRow> {
  const { config, db } = ctx;

  const existing = await db.from('designs').select('*').eq('texture_id', textureId).maybeSingle();
  if (existing.data) return existing.data as DesignRow;

  const tex = await db
    .from('model_textures')
    .select('id, model_id, corrected_texture_url')
    .eq('id', textureId)
    .maybeSingle();
  if (!tex.data) throw new ShopError('Drawing not found', 404);
  if (!config.pilotModelIds.includes(tex.data.model_id)) {
    throw new ShopError('Shirts are not available for this drawing', 403);
  }

  const sourceUrl = normalizeStorageUrl(tex.data.corrected_texture_url);
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Could not download drawing (${res.status})`);
  const print = await makePrintFile(Buffer.from(await res.arrayBuffer()));

  const designId = newDesignId();
  const path = `${designId}.png`;
  const up = await db.storage.from(PRINT_BUCKET).upload(path, print.png, { contentType: 'image/png', upsert: false });
  if (up.error) throw new Error(`Could not store print file: ${up.error.message}`);

  const row = {
    id: designId,
    texture_id: textureId,
    model_id: tex.data.model_id,
    source_url: sourceUrl,
    print_file_path: path,
    print_width: print.width,
    print_height: print.height,
    coverage: print.coverage,
    effective_dpi: print.effectiveDpi
  };
  const ins = await db.from('designs').insert(row).select('*').single();
  if (ins.error) {
    // Lost a race with a parallel request for the same drawing: use theirs.
    const again = await db.from('designs').select('*').eq('texture_id', textureId).maybeSingle();
    if (again.data) {
      await db.storage.from(PRINT_BUCKET).remove([path]);
      return again.data as DesignRow;
    }
    throw new Error(`Could not save design: ${ins.error.message}`);
  }
  return ins.data as DesignRow;
}

/** Supabase-backed store for handleCheckoutCompleted. */
export function fulfilStore(db: SupabaseClient): FulfilStore {
  return {
    async getOrder(orderId) {
      const { data } = await db
        .from('orders')
        .select('id, status, catalog_variant_id, quantity, printful_order_id')
        .eq('id', orderId)
        .maybeSingle();
      return data ?? null;
    },
    async markPaid(orderId, d) {
      const { data, error } = await db
        .from('orders')
        .update({
          status: 'paid',
          email: d.email,
          recipient: d.recipient,
          stripe_payment_intent: d.stripePaymentIntent,
          amount_total_cents: d.amountTotalCents,
          paid_at: new Date().toISOString(),
          last_error: null
        })
        .eq('id', orderId)
        .eq('status', 'pending_payment')
        .select('id');
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
    async printFileUrl(orderId) {
      const { data, error } = await db
        .from('orders')
        .select('designs(print_file_path)')
        .eq('id', orderId)
        .single();
      const path = (data as unknown as { designs: { print_file_path: string } } | null)?.designs?.print_file_path;
      if (error || !path) throw new Error('Print file not found for order');
      // Printful fetches the file when the order is processed, which can be
      // days after a draft is made; keep the link valid for 30 days.
      return signedPrintUrl(db, path, 60 * 60 * 24 * 30);
    },
    async setPrintful(orderId, d) {
      const { error } = await db
        .from('orders')
        .update({ printful_order_id: d.printfulOrderId, printful_status: d.printfulStatus, status: d.status, last_error: null })
        .eq('id', orderId);
      if (error) throw new Error(error.message);
    },
    async setError(orderId, message) {
      await db.from('orders').update({ last_error: message.slice(0, 500) }).eq('id', orderId);
    }
  };
}
