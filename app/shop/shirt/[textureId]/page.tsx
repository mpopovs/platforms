import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { EU_COUNTRIES, getShopConfig } from '@/lib/shop/config';
import { shopDb } from '@/lib/shop/server';
import { ShirtOrder } from './shirt-order';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Put your drawing on a T-shirt' };

export default async function ShirtPage({
  params,
  searchParams
}: {
  params: Promise<{ textureId: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const config = getShopConfig();
  const { textureId } = await params;

  // The page is hidden (404) unless everything lines up; log why on the
  // server so setup problems are easy to spot in the terminal.
  const hide = (reason: string): never => {
    console.warn(`[shop] /shop/shirt/${textureId} hidden: ${reason}`);
    notFound();
  };

  if (!config.enabled) hide('SHOP_ENABLED is not "true"');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) hide('SUPABASE_SERVICE_ROLE_KEY is missing');

  const { data: tex, error } = await shopDb()
    .from('model_textures')
    .select('id, model_id')
    .eq('id', textureId)
    .maybeSingle();
  if (error) hide(`database error: ${error.message}`);
  if (!tex) hide('no model_textures row with this id in the database NEXT_PUBLIC_SUPABASE_URL points to');
  if (!config.pilotModelIds.includes(tex!.model_id)) {
    hide(`model ${tex!.model_id} is not in NEXT_PUBLIC_SHOP_PILOT_MODEL_IDS (${config.pilotModelIds.join(',') || 'empty'})`);
  }

  return (
    <ShirtOrder
      textureId={textureId}
      priceCents={config.priceCents}
      shipping={{ lv: config.zones.lv.cents, eu: config.zones.eu.cents }}
      countries={[...EU_COUNTRIES]}
      cancelled={(await searchParams).cancelled === '1'}
    />
  );
}
