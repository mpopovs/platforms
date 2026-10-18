/**
 * What happens after Stripe says a checkout is paid. Written against small
 * interfaces (not Supabase/Stripe directly) so the idempotency rules are
 * unit-tested:
 *
 *  - Stripe can deliver the same event more than once, and retries after a
 *    5xx. Each delivery must lead to at most one Printful order.
 *  - Our order id is the Printful external_id. Before creating, we look the
 *    order up by external id, so a retry after a half-finished attempt
 *    (Printful created, our DB update failed) reuses it instead of
 *    duplicating.
 *  - Printful orders stay drafts unless autoConfirm is on; in the slice the
 *    first real order is confirmed by hand to check print quality.
 */

import type { CreateOrderInput, PrintfulOrder, PrintfulRecipient } from './printful';

export interface PaidSession {
  id: string;
  payment_status: string; // 'paid' | 'unpaid' | 'no_payment_required'
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
  amount_total?: number | null;
  payment_intent?: string | { id: string } | null;
  customer_details?: { email?: string | null; name?: string | null; phone?: string | null } | null;
  collected_information?: { shipping_details?: ShippingDetails | null } | null;
  shipping_details?: ShippingDetails | null; // older API versions
}

interface ShippingDetails {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
}

export interface OrderRow {
  id: string;
  status: string;
  catalog_variant_id: number;
  quantity: number;
  printful_order_id: number | null;
  print_file_url?: string; // signed URL, filled by the store
}

export interface FulfilStore {
  getOrder(id: string): Promise<OrderRow | null>;
  /** pending_payment -> paid; returns false if it was not pending. */
  markPaid(id: string, data: { email: string | null; recipient: PrintfulRecipient; stripePaymentIntent: string | null; amountTotalCents: number | null }): Promise<boolean>;
  printFileUrl(orderId: string): Promise<string>;
  setPrintful(id: string, data: { printfulOrderId: number; printfulStatus: string; status: 'printful_draft' | 'confirmed' }): Promise<void>;
  setError(id: string, message: string): Promise<void>;
}

export interface FulfilPrintful {
  getOrder(id: { externalId: string }): Promise<PrintfulOrder>;
  createOrder(input: CreateOrderInput): Promise<PrintfulOrder>;
  confirmOrder(id: number | { externalId: string }): Promise<PrintfulOrder>;
}

export type FulfilResult =
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'already_done'; printfulOrderId: number }
  | { outcome: 'created'; printfulOrderId: number; confirmed: boolean };

export function recipientFromSession(session: PaidSession): PrintfulRecipient | null {
  const ship = session.collected_information?.shipping_details ?? session.shipping_details;
  const a = ship?.address;
  if (!ship?.name || !a?.line1 || !a.city || !a.country || !a.postal_code) return null;
  return {
    name: ship.name,
    address1: a.line1,
    ...(a.line2 ? { address2: a.line2 } : {}),
    city: a.city,
    ...(a.state ? { state_code: a.state } : {}),
    country_code: a.country,
    zip: a.postal_code,
    ...(session.customer_details?.email ? { email: session.customer_details.email } : {}),
    ...(session.customer_details?.phone ? { phone: session.customer_details.phone } : {})
  };
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: number }).status === 404;
}

export async function handleCheckoutCompleted(
  session: PaidSession,
  store: FulfilStore,
  printful: FulfilPrintful,
  options: { autoConfirm: boolean }
): Promise<FulfilResult> {
  const orderId = session.metadata?.order_id ?? session.client_reference_id ?? null;
  if (!orderId) return { outcome: 'ignored', reason: 'no order id on session' };
  if (session.payment_status !== 'paid') return { outcome: 'ignored', reason: `payment_status ${session.payment_status}` };

  const order = await store.getOrder(orderId);
  if (!order) return { outcome: 'ignored', reason: 'unknown order' };
  if (order.printful_order_id) return { outcome: 'already_done', printfulOrderId: order.printful_order_id };

  const recipient = recipientFromSession(session);
  if (!recipient) {
    await store.setError(orderId, 'Checkout session has no complete shipping address');
    throw new Error('missing shipping address');
  }

  if (order.status === 'pending_payment') {
    const pi = session.payment_intent;
    await store.markPaid(orderId, {
      email: session.customer_details?.email ?? null,
      recipient,
      stripePaymentIntent: typeof pi === 'string' ? pi : pi?.id ?? null,
      amountTotalCents: session.amount_total ?? null
    });
  }

  try {
    // Reuse an order a previous attempt already created.
    let pfOrder: PrintfulOrder | null = null;
    try {
      pfOrder = await printful.getOrder({ externalId: orderId });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }

    if (!pfOrder) {
      pfOrder = await printful.createOrder({
        external_id: orderId,
        shipping: 'STANDARD',
        recipient,
        order_items: [
          {
            source: 'catalog',
            catalog_variant_id: order.catalog_variant_id,
            quantity: order.quantity,
            external_id: `${orderId}-1`,
            placements: [
              {
                placement: 'front',
                technique: 'dtg',
                layers: [{ type: 'file', url: await store.printFileUrl(orderId) }]
              }
            ]
          }
        ]
      });
    }

    let confirmed = false;
    if (options.autoConfirm && pfOrder.status === 'draft') {
      pfOrder = await printful.confirmOrder(pfOrder.id);
      confirmed = true;
    }

    await store.setPrintful(orderId, {
      printfulOrderId: pfOrder.id,
      printfulStatus: pfOrder.status,
      status: confirmed || pfOrder.status !== 'draft' ? 'confirmed' : 'printful_draft'
    });
    return { outcome: 'created', printfulOrderId: pfOrder.id, confirmed };
  } catch (err) {
    await store.setError(orderId, err instanceof Error ? err.message : String(err));
    throw err; // 5xx -> Stripe retries; the lookup above prevents duplicates
  }
}
