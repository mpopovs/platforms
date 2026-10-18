import { NextRequest, NextResponse } from 'next/server';
import { getShopConfig } from '@/lib/shop/config';
import { handleCheckoutCompleted, type PaidSession } from '@/lib/shop/fulfil';
import { printfulFromEnv } from '@/lib/shop/printful';
import { fulfilStore, shopDb, stripeFromEnv } from '@/lib/shop/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/webhooks/stripe
 * Verifies the signature on the raw body, then turns a paid checkout into a
 * Printful order. Returns 500 on failure so Stripe retries; the handler is
 * idempotent (see lib/shop/fulfil.ts).
 */
export async function POST(request: NextRequest) {
  const stripe = stripeFromEnv();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const printful = printfulFromEnv();
  if (!stripe || !secret || !printful) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  const db = shopDb();
  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const result = await handleCheckoutCompleted(
          event.data.object as unknown as PaidSession,
          fulfilStore(db),
          printful,
          { autoConfirm: getShopConfig().autoConfirm }
        );
        console.log('[shop] checkout', event.id, result);
        break;
      }
      case 'checkout.session.expired': {
        const s = event.data.object as unknown as PaidSession;
        const orderId = s.metadata?.order_id;
        if (orderId) {
          await db.from('orders').update({ status: 'expired' }).eq('id', orderId).eq('status', 'pending_payment');
        }
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[shop] webhook failed', event.id, err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
}
