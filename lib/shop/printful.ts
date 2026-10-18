/**
 * Minimal Printful API v2 client for the shirt slice.
 *
 * - Auth: private token as Bearer. X-PF-Store-Id is only sent when a store
 *   id is set: a token created for a single store needs none.
 * - Rate limits: 429 responses are retried after `retry-after` seconds
 *   (capped), at most `maxRetries` times. Mockup generation has its own,
 *   much lower limit (2/min for new stores), so callers cache mockups.
 * - Orders are created as drafts and confirmed separately. Our own order id
 *   is sent as `external_id`, so an order can be looked up as `@<id>` and a
 *   retried create cannot silently make a second order.
 *
 * Docs: https://developers.printful.com/docs/v2-beta/
 */

export const PRINTFUL_API = 'https://api.printful.com';

export interface PrintfulConfig {
  token: string;
  /** Needed only for account-level tokens that can reach several stores. */
  storeId?: string | null;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  /** Upper bound on a single retry wait, ms. */
  maxRetryWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class PrintfulError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = 'PrintfulError';
  }
}

export interface PrintfulRecipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code?: string;
  country_code: string;
  zip: string;
  email?: string;
  phone?: string;
}

export interface PrintfulPlacement {
  placement: string; // 'front'
  technique: string; // 'dtg'
  layers: { type: 'file'; url: string }[];
}

export interface PrintfulOrderItem {
  source: 'catalog';
  catalog_variant_id: number;
  quantity: number;
  external_id?: string;
  placements: PrintfulPlacement[];
}

export interface CreateOrderInput {
  external_id: string;
  shipping?: string; // 'STANDARD'
  recipient: PrintfulRecipient;
  order_items: PrintfulOrderItem[];
}

export interface PrintfulOrder {
  id: number;
  external_id: string | null;
  status: string;
  [key: string]: unknown;
}

export interface MockupTaskInput {
  catalogProductId: number;
  catalogVariantIds: number[];
  placement: PrintfulPlacement;
  format?: 'jpg' | 'png';
  mockupStyleIds?: number[];
}

export interface MockupTask {
  id: number;
  status: string; // 'pending' | 'completed' | 'failed'
  catalog_variant_mockups?: {
    catalog_variant_id: number;
    mockups?: { placement?: string; mockup_url?: string; [key: string]: unknown }[];
  }[];
  failure_reasons?: unknown[];
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createPrintfulClient(config: PrintfulConfig) {
  const doFetch = config.fetchImpl ?? fetch;
  const maxRetries = config.maxRetries ?? 3;
  const maxWait = config.maxRetryWaitMs ?? 60_000;
  const sleep = config.sleep ?? defaultSleep;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(PRINTFUL_API + path, {
        method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          ...(config.storeId ? { 'X-PF-Store-Id': config.storeId } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
        },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });

      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5_000;
        await sleep(Math.min(waitMs, maxWait));
        continue;
      }

      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }

      if (!res.ok) {
        const msg =
          (json as { error?: { message?: string } } | null)?.error?.message ??
          (json as { detail?: string } | null)?.detail ??
          `Printful ${method} ${path} failed with ${res.status}`;
        throw new PrintfulError(msg, res.status, json);
      }
      // v2 wraps payloads in { data: ... }
      const wrapped = json as { data?: T } | null;
      return (wrapped && typeof wrapped === 'object' && 'data' in wrapped ? wrapped.data : json) as T;
    }
  }

  return {
    request,

    createOrder(input: CreateOrderInput): Promise<PrintfulOrder> {
      return request('POST', '/v2/orders', input);
    },

    /** Look up by Printful id or by our external id. */
    getOrder(id: number | { externalId: string }): Promise<PrintfulOrder> {
      const ref = typeof id === 'number' ? String(id) : '@' + encodeURIComponent(id.externalId);
      return request('GET', `/v2/orders/${ref}`);
    },

    confirmOrder(id: number | { externalId: string }): Promise<PrintfulOrder> {
      const ref = typeof id === 'number' ? String(id) : '@' + encodeURIComponent(id.externalId);
      return request('POST', `/v2/orders/${ref}/confirm`);
    },

    async createMockupTask(input: MockupTaskInput): Promise<MockupTask> {
      const result = await request<MockupTask | MockupTask[]>('POST', '/v2/mockup-tasks', {
        format: input.format ?? 'jpg',
        products: [
          {
            source: 'catalog',
            catalog_product_id: input.catalogProductId,
            catalog_variant_ids: input.catalogVariantIds,
            ...(input.mockupStyleIds ? { mockup_style_ids: input.mockupStyleIds } : {}),
            placements: [input.placement]
          }
        ]
      });
      return Array.isArray(result) ? result[0] : result;
    },

    async getMockupTask(id: number): Promise<MockupTask | null> {
      const result = await request<MockupTask | MockupTask[]>('GET', `/v2/mockup-tasks?id=${id}`);
      return Array.isArray(result) ? (result[0] ?? null) : result;
    }
  };
}

export type PrintfulClient = ReturnType<typeof createPrintfulClient>;

/** First mockup image URL in a completed task, if any. */
export function firstMockupUrl(task: MockupTask | null): string | null {
  for (const v of task?.catalog_variant_mockups ?? []) {
    for (const m of v.mockups ?? []) {
      if (typeof m.mockup_url === 'string') return m.mockup_url;
    }
  }
  return null;
}

/** Client from env, or null when the shop is not configured. */
export function printfulFromEnv(): PrintfulClient | null {
  const token = process.env.PRINTFUL_TOKEN;
  if (!token) return null;
  return createPrintfulClient({ token, storeId: process.env.PRINTFUL_STORE_ID || null });
}
