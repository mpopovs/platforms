import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleCheckoutCompleted, recipientFromSession, type FulfilStore, type OrderRow, type PaidSession } from '../lib/shop/fulfil';
import { PrintfulError, type PrintfulOrder } from '../lib/shop/printful';
import { getShopConfig, parseVariants, zoneForCountry } from '../lib/shop/config';

const session = (over: Partial<PaidSession> = {}): PaidSession => ({
  id: 'cs_test_1',
  payment_status: 'paid',
  metadata: { order_id: 'ord_1' },
  amount_total: 2980,
  payment_intent: 'pi_1',
  customer_details: { email: 'p@example.com', name: 'Parent' },
  collected_information: {
    shipping_details: {
      name: 'Parent Name',
      address: { line1: 'Brivibas 1', city: 'Riga', country: 'LV', postal_code: 'LV-1010' }
    }
  },
  ...over
});

function fakes(initial: Partial<OrderRow> = {}) {
  const row: OrderRow = { id: 'ord_1', status: 'pending_payment', catalog_variant_id: 4012, quantity: 1, printful_order_id: null, ...initial };
  const log: string[] = [];
  const store: FulfilStore = {
    async getOrder(id) { return id === row.id ? { ...row } : null; },
    async markPaid() {
      if (row.status !== 'pending_payment') return false;
      row.status = 'paid'; log.push('paid'); return true;
    },
    async printFileUrl() { return 'https://files/print.png'; },
    async setPrintful(_id, d) { row.printful_order_id = d.printfulOrderId; row.status = d.status; log.push('set:' + d.status); },
    async setError(_id, m) { log.push('error:' + m); }
  };
  const pfOrders = new Map<string, PrintfulOrder>();
  let creates = 0;
  let failCreate = false;
  const printful = {
    async getOrder({ externalId }: { externalId: string }) {
      const o = pfOrders.get(externalId);
      if (!o) throw new PrintfulError('not found', 404, null);
      return o;
    },
    async createOrder(input: { external_id: string; order_items: { placements: { layers: { url: string }[] }[] }[] }) {
      creates++;
      if (failCreate) throw new PrintfulError('boom', 500, null);
      const o = { id: 900 + creates, external_id: input.external_id, status: 'draft', input };
      pfOrders.set(input.external_id, o);
      return o;
    },
    async confirmOrder(id: number | { externalId: string }) {
      log.push('confirm:' + JSON.stringify(id));
      return { id: 901, external_id: 'ord_1', status: 'pending' };
    }
  };
  return { row, log, store, printful, pfOrders, get creates() { return creates; }, set failCreate(v: boolean) { failCreate = v; } };
}

describe('handleCheckoutCompleted', () => {
  test('creates one draft order with our id as external_id', async () => {
    const f = fakes();
    const r = await handleCheckoutCompleted(session(), f.store, f.printful as never, { autoConfirm: false });
    assert.deepEqual(r, { outcome: 'created', printfulOrderId: 901, confirmed: false });
    assert.equal(f.row.status, 'printful_draft');
    const created = f.pfOrders.get('ord_1') as unknown as { input: { order_items: { catalog_variant_id: number; placements: { layers: { url: string }[] }[] }[] } };
    assert.equal(created.input.order_items[0].catalog_variant_id, 4012);
    assert.equal(created.input.order_items[0].placements[0].layers[0].url, 'https://files/print.png');
  });

  test('same event delivered twice -> one Printful order', async () => {
    const f = fakes();
    await handleCheckoutCompleted(session(), f.store, f.printful as never, { autoConfirm: false });
    const second = await handleCheckoutCompleted(session(), f.store, f.printful as never, { autoConfirm: false });
    assert.equal(second.outcome, 'already_done');
    assert.equal(f.creates, 1);
  });

  test('retry after Printful created but our DB update failed reuses the order', async () => {
    const f = fakes({ status: 'paid' });
    f.pfOrders.set('ord_1', { id: 777, external_id: 'ord_1', status: 'draft' });
    const r = await handleCheckoutCompleted(session(), f.store, f.printful as never, { autoConfirm: false });
    assert.deepEqual(r, { outcome: 'created', printfulOrderId: 777, confirmed: false });
    assert.equal(f.creates, 0);
  });

  test('Printful failure records error, throws, and a retry succeeds once', async () => {
    const f = fakes();
    f.failCreate = true;
    await assert.rejects(handleCheckoutCompleted(session(), f.store, f.printful as never, { autoConfirm: false }));
    assert.ok(f.log.some((l) => l.startsWith('error:')));
    assert.equal(f.row.status, 'paid');
    f.failCreate = false;
    const r = await handleCheckoutCompleted(session(), f.store, f.printful as never, { autoConfirm: false });
    assert.equal(r.outcome, 'created');
    assert.equal(f.log.filter((l) => l === 'paid').length, 1);
  });

  test('autoConfirm confirms the draft', async () => {
    const f = fakes();
    const r = await handleCheckoutCompleted(session(), f.store, f.printful as never, { autoConfirm: true });
    assert.equal(r.outcome === 'created' && r.confirmed, true);
    assert.equal(f.row.status, 'confirmed');
  });

  test('unpaid, unknown or id-less sessions are ignored', async () => {
    const f = fakes();
    assert.equal((await handleCheckoutCompleted(session({ payment_status: 'unpaid' }), f.store, f.printful as never, { autoConfirm: false })).outcome, 'ignored');
    assert.equal((await handleCheckoutCompleted(session({ metadata: { order_id: 'ord_x' } }), f.store, f.printful as never, { autoConfirm: false })).outcome, 'ignored');
    assert.equal((await handleCheckoutCompleted(session({ metadata: {} }), f.store, f.printful as never, { autoConfirm: false })).outcome, 'ignored');
    assert.equal(f.creates, 0);
  });

  test('missing address -> error, no Printful order', async () => {
    const f = fakes();
    await assert.rejects(handleCheckoutCompleted(session({ collected_information: null }), f.store, f.printful as never, { autoConfirm: false }));
    assert.equal(f.creates, 0);
  });
});

describe('recipientFromSession', () => {
  test('maps Stripe address to Printful recipient, with older shipping_details fallback', () => {
    const r = recipientFromSession(session({
      collected_information: null,
      shipping_details: { name: 'X', address: { line1: 'a', line2: 'b', city: 'c', state: 'd', country: 'DE', postal_code: '1' } }
    }));
    assert.deepEqual(r, { name: 'X', address1: 'a', address2: 'b', city: 'c', state_code: 'd', country_code: 'DE', zip: '1', email: 'p@example.com' });
  });
});

describe('shop config', () => {
  test('zones', () => {
    const c = getShopConfig({});
    assert.equal(zoneForCountry(c, 'lv')?.id, 'lv');
    assert.equal(zoneForCountry(c, 'DE')?.id, 'eu');
    assert.equal(zoneForCountry(c, 'US'), null);
    assert.equal(c.enabled, false);
  });
  test('variants parsing ignores junk', () => {
    assert.deepEqual(parseVariants('s:1, M:2,XL:x,:3'), { S: 1, M: 2 });
  });
});
