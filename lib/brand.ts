/**
 * Brand resolution: one codebase serves claypixels.eu and magicforms.eu.
 *
 * Pure function (no Next.js imports) so it works in middleware, server code
 * and tests. Server components use getBrand() from lib/brand-server.ts.
 * Keep BRAND_HOSTS in step with public.brands.hosts.
 */

export const BRANDS = ['claypixels', 'magicforms'] as const;
export type BrandId = (typeof BRANDS)[number];

export const DEFAULT_BRAND: BrandId = 'claypixels';

export const BRAND_HOSTS: Record<BrandId, readonly string[]> = {
  claypixels: ['claypixels.eu', 'www.claypixels.eu'],
  magicforms: ['magicforms.eu', 'www.magicforms.eu']
};

export function isBrandId(value: unknown): value is BrandId {
  return typeof value === 'string' && (BRANDS as readonly string[]).includes(value);
}

/** Lowercase, strip port and a trailing dot. */
export function normaliseHost(host: string | null | undefined): string {
  if (!host) return '';
  // x-forwarded-host may hold a comma-separated list; the first is the client's.
  const first = host.split(',')[0].trim().toLowerCase();
  return first.replace(/:\d+$/, '').replace(/\.$/, '');
}

export interface ResolveBrandOptions {
  /** Used for localhost and unknown hosts in development (env DEV_BRAND). */
  devOverride?: string | null;
}

export function resolveBrand(
  host: string | null | undefined,
  options: ResolveBrandOptions = {}
): BrandId {
  const h = normaliseHost(host);
  for (const brand of BRANDS) {
    if (BRAND_HOSTS[brand].includes(h)) return brand;
  }
  // Subdomains such as staging.magicforms.eu
  for (const brand of BRANDS) {
    if (BRAND_HOSTS[brand].some((base) => h.endsWith('.' + base))) return brand;
  }
  if (isBrandId(options.devOverride)) return options.devOverride;
  return DEFAULT_BRAND;
}
