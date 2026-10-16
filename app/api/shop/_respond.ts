import { NextResponse } from 'next/server';
import { ShopError } from '@/lib/shop/server';
import { EmptyDrawingError } from '@/lib/shop/print-file';

/** Map errors to JSON responses; never leak internal messages. */
export function shopErrorResponse(err: unknown, where: string) {
  if (err instanceof ShopError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof EmptyDrawingError) {
    return NextResponse.json({ error: 'We could not find a drawing on this page.' }, { status: 422 });
  }
  console.error(`[shop] ${where}`, err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
