import 'server-only';

import { headers } from 'next/headers';
import { resolveBrand, type BrandId } from './brand';

/**
 * The brand for the current request, from the host name. Behind a reverse
 * proxy the public host is in x-forwarded-host. Brand only changes what the
 * site shows, never who may access what, so a spoofed header is harmless.
 */
export async function getBrand(): Promise<BrandId> {
  const h = await headers();
  return resolveBrand(h.get('x-forwarded-host') ?? h.get('host'), {
    devOverride: process.env.DEV_BRAND
  });
}
