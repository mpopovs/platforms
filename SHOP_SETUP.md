# Shirt shop (slice S): setup and testing

A pilot of "Put this on a T-shirt" for one model. Payment by Stripe Checkout; the paid order becomes a Printful **draft** order (not printed until confirmed).

## 1. Database

Apply `supabase/migrations/20261016000003_create_shop_designs_orders.sql` (after the M0 migrations). It creates `designs`, `orders` (RLS on, server-only) and a private `print-files` bucket.

## 2. Environment (`.env` on the server, `.env.local` locally)

```env
SHOP_ENABLED=true
NEXT_PUBLIC_SHOP_PILOT_MODEL_IDS=model_xxx          # comma-separated viewer_models ids
SUPABASE_SERVICE_ROLE_KEY=...                       # already used by /klase

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

PRINTFUL_TOKEN=...                                  # Printful private token
# PRINTFUL_STORE_ID=...                             # only for account-level tokens
PRINTFUL_PRODUCT_ID=71                              # check in Printful catalog
PRINTFUL_VARIANTS=S:4011,M:4012,L:4013,XL:4014       # size:catalog_variant_id, check

SHOP_PRICE_CENTS=2490                               # incl. VAT
SHOP_SHIPPING_LV_CENTS=490
SHOP_SHIPPING_EU_CENTS=690
SHOP_AUTO_CONFIRM=false                             # keep false for the pilot
```

`NEXT_PUBLIC_SHOP_PILOT_MODEL_IDS` is read at build time by the upload page, so rebuild after changing it.

Product and variant ids are placeholders: open the product in the Printful catalog (or `GET /v2/catalog-products/{id}/catalog-variants`) and use the real ids for the shirt and colour you choose.

## 3. Stripe webhook

Dashboard → Developers → Webhooks → endpoint `https://claypixels.eu/api/webhooks/stripe` with events
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`.
Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

Locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and use the `whsec_` it prints.

## 4. Test the whole path (test mode)

1. Upload a drawing for the pilot model; the success screen shows **Put this on a T-shirt**.
2. The shirt page makes the print file and shows it on a plain shirt (no Printful mockup: the drawing is already previewed in 3D).
3. Choose size and country, pay with card `4242 4242 4242 4242`.
4. Check: `orders.status = printful_draft`, and a draft order with external id `ord_…` in Printful → Orders.
5. Replay the event from the Stripe dashboard: no second Printful order appears.

Then confirm **one** real order by hand in Printful to check print quality and delivery time before turning on `SHOP_AUTO_CONFIRM`.

## What happens where

| Step | Code |
|---|---|
| Print file from drawing (paper removed, 12×16 in at 150 DPI) | `lib/shop/print-file.ts` |
| Printful API v2 (orders, 429 retry; mockup calls kept for later use, e.g. order emails) | `lib/shop/printful.ts` |
| Design + checkout + webhook glue | `lib/shop/server.ts`, `app/api/shop/*`, `app/api/webhooks/stripe` |
| Paid → Printful order, idempotent | `lib/shop/fulfil.ts` (tested in `tests/shop-fulfil.test.ts`) |
| Pages | `app/shop/shirt/[textureId]`, `app/shop/thanks` |
