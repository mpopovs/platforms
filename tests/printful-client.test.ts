import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPrintfulClient, firstMockupUrl, PrintfulError } from '../lib/shop/printful';

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('printful client', () => {
  test('sends auth + store headers and unwraps data', async () => {
    const { impl, calls } = fakeFetch([json(200, { data: { id: 7, external_id: 'ord_1', status: 'draft' } })]);
    const pf = createPrintfulClient({ token: 'tok', storeId: '123', fetchImpl: impl });
    const order = await pf.createOrder({
      external_id: 'ord_1',
      recipient: { name: 'A', address1: 'x', city: 'Riga', country_code: 'LV', zip: 'LV-1050' },
      order_items: []
    });
    assert.equal(order.id, 7);
    assert.equal(calls[0].url, 'https://api.printful.com/v2/orders');
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, 'Bearer tok');
    assert.equal(h['X-PF-Store-Id'], '123');
    assert.equal(JSON.parse(String(calls[0].init.body)).external_id, 'ord_1');
  });

  test('no store header when the token is for a single store', async () => {
    const { impl, calls } = fakeFetch([json(200, { data: { id: 1, status: 'pending' } })]);
    const pf = createPrintfulClient({ token: 't', fetchImpl: impl });
    await pf.getMockupTask(1);
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal('X-PF-Store-Id' in h, false);
  });

  test('addresses orders by external id with @', async () => {
    const { impl, calls } = fakeFetch([json(200, { data: { id: 7, status: 'pending' } })]);
    const pf = createPrintfulClient({ token: 't', storeId: '1', fetchImpl: impl });
    await pf.confirmOrder({ externalId: 'ord_1' });
    assert.equal(calls[0].url, 'https://api.printful.com/v2/orders/@ord_1/confirm');
    assert.equal(calls[0].init.method, 'POST');
  });

  test('retries 429 using retry-after, then succeeds', async () => {
    const waits: number[] = [];
    const { impl, calls } = fakeFetch([
      json(429, { error: { message: 'slow down' } }, { 'retry-after': '2' }),
      json(200, { data: { id: 1, status: 'pending' } })
    ]);
    const pf = createPrintfulClient({
      token: 't', storeId: '1', fetchImpl: impl,
      sleep: async (ms) => { waits.push(ms); }
    });
    await pf.getMockupTask(1);
    assert.equal(calls.length, 2);
    assert.deepEqual(waits, [2000]);
  });

  test('gives up after maxRetries and throws PrintfulError', async () => {
    const { impl } = fakeFetch([json(429, {}), json(429, {}), json(429, { error: { message: 'rate' } })]);
    const pf = createPrintfulClient({ token: 't', storeId: '1', fetchImpl: impl, maxRetries: 2, sleep: async () => {} });
    await assert.rejects(pf.getMockupTask(1), (e: unknown) => e instanceof PrintfulError && e.status === 429);
  });

  test('error message from body', async () => {
    const { impl } = fakeFetch([json(400, { error: { message: 'Invalid file' } })]);
    const pf = createPrintfulClient({ token: 't', storeId: '1', fetchImpl: impl });
    await assert.rejects(pf.createOrder({} as never), /Invalid file/);
  });

  test('mockup task request shape and url extraction', async () => {
    const { impl, calls } = fakeFetch([
      json(200, { data: [{ id: 9, status: 'pending' }] }),
      json(200, {
        data: [{
          id: 9, status: 'completed',
          catalog_variant_mockups: [{ catalog_variant_id: 4011, mockups: [{ placement: 'front', mockup_url: 'https://m/1.jpg' }] }]
        }]
      })
    ]);
    const pf = createPrintfulClient({ token: 't', storeId: '1', fetchImpl: impl });
    const task = await pf.createMockupTask({
      catalogProductId: 71, catalogVariantIds: [4011],
      placement: { placement: 'front', technique: 'dtg', layers: [{ type: 'file', url: 'https://f/p.png' }] }
    });
    assert.equal(task.id, 9);
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.products[0].source, 'catalog');
    assert.equal(body.products[0].catalog_product_id, 71);
    const done = await pf.getMockupTask(9);
    assert.equal(calls[1].url, 'https://api.printful.com/v2/mockup-tasks?id=9');
    assert.equal(firstMockupUrl(done), 'https://m/1.jpg');
    assert.equal(firstMockupUrl(null), null);
  });
});
