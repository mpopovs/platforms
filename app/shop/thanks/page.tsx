import type { Metadata } from 'next';
import { requireShop } from '@/lib/shop/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Thank you for your order' };

const MESSAGES: Record<string, string> = {
  pending_payment: 'We are waiting for the payment to be confirmed. This page will show it in a moment — refresh to check.',
  paid: 'Payment received. Your T-shirt is being sent to print.',
  printful_draft: 'Payment received. Your T-shirt is being prepared for printing.',
  confirmed: 'Your T-shirt is in production.',
  shipped: 'Your T-shirt is on its way.'
};

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  let status: string | null = null;
  try {
    if (order) {
      const { db } = requireShop();
      const { data } = await db.from('orders').select('status').eq('id', order).maybeSingle();
      status = data?.status ?? null;
    }
  } catch {
    status = null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Thank you!</h1>
        <p className="mt-3 text-gray-600">
          {(status && MESSAGES[status]) ?? 'We have your order. You will get an email from Stripe with the receipt.'}
        </p>
        {order && <p className="mt-4 text-xs text-gray-400">Order {order}</p>}
      </div>
    </div>
  );
}
