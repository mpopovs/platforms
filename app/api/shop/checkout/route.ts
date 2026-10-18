import { NextRequest, NextResponse } from 'next/server';
import { zoneForCountry } from '@/lib/shop/config';
import { clientIp, newOrderId, rateLimit, requireShop, ShopError } from '@/lib/shop/server';
import { shopErrorResponse } from '../_respond';

export const runtime = 'nodejs';

/**
 * POST /api/shop/checkout { designId, size, country }
 * Creates our order (pending_payment) and a Stripe Checkout session.
 * Shipping is a flat rate per zone; the country is fixed for the session so
 * the rate always matches the address. Stripe collects email and address.
 */
export async function POST(request: NextRequest) {
  try {
    const { config, stripe, db } = requireShop();
    await rateLimit(`checkout:${clientIp(request.headers)}`, 10, 60);

    const body = (await request.json().catch(() => ({}))) as { designId?: unknown; size?: unknown; country?: unknown };
    const designId = typeof body.designId === 'string' ? body.designId : '';
    const size = typeof body.size === 'string' ? body.size.toUpperCase() : '';
    const country = typeof body.country === 'string' ? body.country.toUpperCase() : '';

    const variantId = config.variants[size];
    if (!variantId) throw new ShopError('Choose a size', 400);
    const zone = zoneForCountry(config, country);
    if (!zone) throw new ShopError('We do not ship to this country yet', 400);

    const { data: design } = await db
      .from('designs')
      .select('id, texture_id, model_id')
      .eq('id', designId)
      .maybeSingle();
    if (!design) throw new ShopError('Design not found', 404);
    if (!config.pilotModelIds.includes(design.model_id)) {
      throw new ShopError('Shirts are not available for this drawing', 403);
    }

    const orderId = newOrderId();
    const ins = await db.from('orders').insert({
      id: orderId,
      design_id: design.id,
      size,
      catalog_variant_id: variantId,
      quantity: 1,
      currency: config.currency,
      price_cents: config.priceCents,
      shipping_cents: zone.cents,
      shipping_zone: zone.id,
      country_code: country
    });
    if (ins.error) throw new Error(ins.error.message);

    const origin = request.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: orderId,
      metadata: { order_id: orderId },
      payment_intent_data: { metadata: { order_id: orderId } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: config.currency,
            unit_amount: config.priceCents,
            product_data: {
              name: `T-shirt with your drawing (${size})`
            }
          }
        }
      ],
      shipping_address_collection: {
        allowed_countries: [country as never]
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: `Delivery (${zone.label})`,
            fixed_amount: { amount: zone.cents, currency: config.currency }
          }
        }
      ],
      phone_number_collection: { enabled: true },
      success_url: `${origin}/shop/thanks?order=${orderId}`,
      cancel_url: `${origin}/shop/shirt/${design.texture_id}?cancelled=1`
    }, { idempotencyKey: `checkout-${orderId}` });

    await db.from('orders').update({ stripe_session_id: session.id }).eq('id', orderId);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return shopErrorResponse(err, 'checkout');
  }
}
