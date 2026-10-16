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
  if (!config.enabled || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();

  const { textureId } = await params;
  const { data: tex } = await shopDb()
    .from('model_textures')
    .select('id, model_id')
    .eq('id', textureId)
    .maybeSingle();
  if (!tex || !config.pilotModelIds.includes(tex.model_id)) notFound();

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
