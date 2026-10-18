import { NextRequest, NextResponse } from 'next/server';
import { clientIp, ensureDesign, rateLimit, requireShop, ShopError, signedPrintUrl } from '@/lib/shop/server';
import { shopErrorResponse } from '../_respond';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/shop/design { textureId }
 * Makes (or reuses) the print file for a drawing.
 */
export async function POST(request: NextRequest) {
  try {
    const shop = requireShop();
    const { textureId } = (await request.json().catch(() => ({}))) as { textureId?: unknown };
    if (typeof textureId !== 'string' || !/^[\w-]{1,80}$/.test(textureId)) {
      throw new ShopError('Invalid drawing id', 400);
    }
    await rateLimit(`design:${clientIp(request.headers)}`, 10, 60);
    const design = await ensureDesign(shop, textureId);
    return NextResponse.json({
      designId: design.id,
      printPreviewUrl: await signedPrintUrl(shop.db, design.print_file_path, 60 * 60),
      sizes: Object.keys(shop.config.variants)
    });
  } catch (err) {
    return shopErrorResponse(err, 'design');
  }
}
