/**
 * Shirt slice configuration. Everything here is env-driven so staging and
 * production can differ without code changes. Pure module (tested).
 *
 * Env:
 *   SHOP_ENABLED=true                       master switch (off by default)
 *   NEXT_PUBLIC_SHOP_PILOT_MODEL_IDS=a,b    models that show the shirt button
 *   PRINTFUL_PRODUCT_ID=71                  Printful catalog product
 *   PRINTFUL_VARIANTS=S:4011,M:4012,...     size -> catalog variant id
 *   SHOP_PRICE_CENTS=2490                   shirt price incl. VAT, EUR cents
 *   SHOP_SHIPPING_LV_CENTS / SHOP_SHIPPING_EU_CENTS
 *
 * The defaults (product 71 = Bella+Canvas 3001, variants 4011-4014 = white
 * S-XL) are placeholders: check them in the Printful catalog before use.
 */

export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'
] as const;

export type ShippingZone = { id: 'lv' | 'eu'; label: string; cents: number };

export interface ShopConfig {
  enabled: boolean;
  pilotModelIds: string[];
  productId: number;
  variants: Record<string, number>; // size -> catalog_variant_id
  priceCents: number;
  currency: 'eur';
  zones: { lv: ShippingZone; eu: ShippingZone };
  autoConfirm: boolean;
}

type Env = Record<string, string | undefined>;

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function parseVariants(value: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (value ?? 'S:4011,M:4012,L:4013,XL:4014').split(',')) {
    const [size, id] = part.split(':').map((s) => s.trim());
    const n = Number(id);
    if (size && Number.isInteger(n) && n > 0) out[size.toUpperCase()] = n;
  }
  return out;
}

export function parsePilotModels(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function getShopConfig(env: Env = process.env): ShopConfig {
  return {
    enabled: env.SHOP_ENABLED === 'true',
    pilotModelIds: parsePilotModels(env.NEXT_PUBLIC_SHOP_PILOT_MODEL_IDS),
    productId: int(env.PRINTFUL_PRODUCT_ID, 71),
    variants: parseVariants(env.PRINTFUL_VARIANTS),
    priceCents: int(env.SHOP_PRICE_CENTS, 2490),
    currency: 'eur',
    zones: {
      lv: { id: 'lv', label: 'Latvia', cents: int(env.SHOP_SHIPPING_LV_CENTS, 490) },
      eu: { id: 'eu', label: 'European Union', cents: int(env.SHOP_SHIPPING_EU_CENTS, 690) }
    },
    autoConfirm: env.SHOP_AUTO_CONFIRM === 'true'
  };
}

/** Flat-rate zone for a country, or null if we do not ship there. */
export function zoneForCountry(config: ShopConfig, country: string): ShippingZone | null {
  const cc = country.toUpperCase();
  if (cc === 'LV') return config.zones.lv;
  if ((EU_COUNTRIES as readonly string[]).includes(cc)) return config.zones.eu;
  return null;
}

/** Client-safe check used by the upload page (reads only the public env). */
export function isShirtPilotModel(modelId: string): boolean {
  return parsePilotModels(process.env.NEXT_PUBLIC_SHOP_PILOT_MODEL_IDS).includes(modelId);
}
