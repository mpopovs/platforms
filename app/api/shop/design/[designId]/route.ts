import { NextRequest, NextResponse } from 'next/server';
import { refreshMockup, requireShop, ShopError, type DesignRow } from '@/lib/shop/server';
import { shopErrorResponse } from '../../_respond';

export const runtime = 'nodejs';

/** GET /api/shop/design/:id  mockup status, polled by the shirt page. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ designId: string }> }) {
  try {
    const shop = requireShop();
    const { designId } = await params;
    const { data } = await shop.db.from('designs').select('*').eq('id', designId).maybeSingle();
    if (!data) throw new ShopError('Design not found', 404);
    const design = await refreshMockup(shop, data as DesignRow);
    return NextResponse.json({ mockupStatus: design.mockup_status, mockupUrl: design.mockup_url });
  } catch (err) {
    return shopErrorResponse(err, 'design status');
  }
}
