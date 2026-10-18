'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Design = {
  designId: string;
  printPreviewUrl: string;
  sizes: string[];
};

const eur = (cents: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export function ShirtOrder({
  textureId,
  priceCents,
  shipping,
  countries,
  cancelled
}: {
  textureId: string;
  priceCents: number;
  shipping: { lv: number; eu: number };
  countries: string[];
  cancelled: boolean;
}) {
  const [design, setDesign] = useState<Design | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<string>('');
  const [country, setCountry] = useState('LV');
  const [paying, setPaying] = useState(false);

  const countryNames = useMemo(() => {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return countries
      .map((code) => ({ code, name: dn.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries]);

  // Make (or reuse) the print file
  useEffect(() => {
    let alive = true;
    fetch('/api/shop/design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textureId })
    })
      .then(async (r) => {
        const data = await r.json();
        if (!alive) return;
        if (!r.ok) setError(data.error ?? 'Something went wrong');
        else setDesign(data);
      })
      .catch(() => alive && setError('Could not reach the server'));
    return () => {
      alive = false;
    };
  }, [textureId]);

  const shippingCents = country === 'LV' ? shipping.lv : shipping.eu;

  async function pay() {
    if (!design || !size) return;
    setPaying(true);
    setError(null);
    try {
      const r = await fetch('/api/shop/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId: design.designId, size, country })
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error ?? 'Could not start payment');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment');
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Put your drawing on a T-shirt</h1>
        <p className="mt-1 text-gray-600">Printed on demand and delivered to your door.</p>

        {cancelled && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Payment was cancelled. You can try again below.
          </p>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
          {!design && !error && (
            <div className="flex aspect-square flex-col items-center justify-center gap-3 text-gray-500">
              <Loader2 className="size-8 animate-spin" />
              Preparing your drawing for printing…
            </div>
          )}
          {design && <ShirtPreview printUrl={design.printPreviewUrl} />}
        </div>

        {design && (
          <>
            <h2 className="mt-6 font-semibold text-gray-900">Size</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {design.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`min-w-14 rounded-lg border px-4 py-2 font-medium ${
                    size === s ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <label className="mt-6 block font-semibold text-gray-900" htmlFor="country">
              Deliver to
            </label>
            <select
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              {countryNames.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>

            <dl className="mt-6 space-y-1 text-gray-700">
              <div className="flex justify-between"><dt>T-shirt</dt><dd>{eur(priceCents)}</dd></div>
              <div className="flex justify-between"><dt>Delivery</dt><dd>{eur(shippingCents)}</dd></div>
              <div className="flex justify-between border-t pt-2 font-semibold text-gray-900">
                <dt>Total</dt><dd>{eur(priceCents + shippingCents)}</dd>
              </div>
            </dl>

            <Button
              type="button"
              onClick={pay}
              disabled={!size || paying}
              className="mt-6 h-auto w-full rounded-xl bg-blue-600 py-4 text-lg hover:bg-blue-700"
            >
              {paying ? <Loader2 className="size-5 animate-spin" /> : size ? 'Continue to payment' : 'Choose a size'}
            </Button>
            <p className="mt-3 text-center text-xs text-gray-500">
              Secure payment by Stripe. Made to order, so it cannot be returned unless it arrives damaged or misprinted.
            </p>
          </>
        )}

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}

/** Flat preview: the exact print file placed on the chest of a plain shirt. */
function ShirtPreview({ printUrl }: { printUrl: string }) {
  return (
    <div className="relative aspect-square w-full bg-gray-100">
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden>
        <path
          d="M140 40 L100 55 L40 110 L75 160 L110 135 L110 370 L290 370 L290 135 L325 160 L360 110 L300 55 L260 40 Q200 85 140 40 Z"
          fill="#ffffff"
          stroke="#d1d5db"
          strokeWidth="3"
        />
      </svg>
      {/* print area: 12 x 16 in on the chest */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={printUrl}
        alt="Your drawing as it will be printed"
        className="absolute object-contain object-top"
        style={{ left: '35%', top: '25%', width: '30%', height: '40%' }}
      />
    </div>
  );
}
