import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessAdminPath,
  getRoleClaims,
  hasRole,
  isStaffRole
} from '../lib/auth/roles';

const user = (app_metadata: Record<string, unknown> | null) => ({ app_metadata });

describe('getRoleClaims', () => {
  test('reads role and capabilities from app_metadata', () => {
    const claims = getRoleClaims(user({ role: 'sub_admin', capabilities: ['orders', 'print'] }));
    assert.deepEqual(claims, { role: 'sub_admin', capabilities: ['orders', 'print'] });
  });

  test('unknown role and capabilities are dropped', () => {
    const claims = getRoleClaims(user({ role: 'superuser', capabilities: ['orders', 'refunds', 7] }));
    assert.deepEqual(claims, { role: null, capabilities: ['orders'] });
  });

  test('missing user or metadata gives no role', () => {
    assert.deepEqual(getRoleClaims(null), { role: null, capabilities: [] });
    assert.deepEqual(getRoleClaims(user(null)), { role: null, capabilities: [] });
    assert.deepEqual(getRoleClaims(user({})), { role: null, capabilities: [] });
  });

  test('role in user_metadata is ignored (users can edit it)', () => {
    const claims = getRoleClaims({ app_metadata: {}, user_metadata: { role: 'admin' } } as never);
    assert.equal(claims.role, null);
  });
});

describe('canAccessAdminPath', () => {
  const admin = { role: 'admin' as const, capabilities: [] };
  const sub = { role: 'sub_admin' as const, capabilities: ['orders' as const] };

  test('admin opens everything', () => {
    for (const p of ['/admin', '/admin/viewers', '/admin/scenes/x', '/admin/orders']) {
      assert.equal(canAccessAdminPath(admin, p), true, p);
    }
  });

  test('sub-admin opens landing page and granted areas only', () => {
    assert.equal(canAccessAdminPath(sub, '/admin'), true);
    assert.equal(canAccessAdminPath(sub, '/admin/orders'), true);
    assert.equal(canAccessAdminPath(sub, '/admin/orders/123'), true);
    assert.equal(canAccessAdminPath(sub, '/admin/print'), false);
    assert.equal(canAccessAdminPath(sub, '/admin/viewers'), false);
    assert.equal(canAccessAdminPath(sub, '/admin/scenes'), false);
    assert.equal(canAccessAdminPath(sub, '/admin/orders-export'), false);
  });

  test('non-staff roles and no role open nothing', () => {
    for (const role of ['teacher', 'museum', 'parent', 'guest', null] as const) {
      assert.equal(canAccessAdminPath({ role, capabilities: [] }, '/admin'), false, String(role));
      assert.equal(canAccessAdminPath({ role, capabilities: ['orders'] }, '/admin/orders'), false);
    }
  });
});

describe('hasRole / isStaffRole', () => {
  test('hasRole matches allowed list', () => {
    assert.equal(hasRole({ role: 'admin', capabilities: [] }, ['admin']), true);
    assert.equal(hasRole({ role: 'sub_admin', capabilities: [] }, ['admin']), false);
    assert.equal(hasRole({ role: null, capabilities: [] }, ['admin']), false);
  });

  test('only admin and sub_admin are staff', () => {
    assert.equal(isStaffRole('admin'), true);
    assert.equal(isStaffRole('sub_admin'), true);
    assert.equal(isStaffRole('teacher'), false);
    assert.equal(isStaffRole(null), false);
  });
});

describe('adminEmails / resolveClaims', () => {
  test('ADMIN_EMAILS parsing', async () => {
    const { adminEmails } = await import('../lib/auth/claims');
    assert.deepEqual(adminEmails({ ADMIN_EMAILS: ' A@x.eu, b@y.eu ,,' }), ['a@x.eu', 'b@y.eu']);
    assert.deepEqual(adminEmails({}), []);
  });

  test('allow-listed email is admin without any database', async () => {
    const { resolveClaims } = await import('../lib/auth/claims');
    const prev = { ...process.env };
    process.env.ADMIN_EMAILS = 'boss@claypixels.eu';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const c = await resolveClaims({ id: 'u1', email: 'Boss@Claypixels.eu', app_metadata: {} });
      assert.equal(c.role, 'admin');
      assert.equal(c.source, 'admin-emails');
      const d = await resolveClaims({ id: 'u2', email: 'other@x.eu', app_metadata: { role: 'parent' } });
      assert.equal(d.role, 'parent');
      const e = await resolveClaims({ id: 'u3', email: 'other@x.eu', app_metadata: {} });
      assert.equal(e.role, null);
    } finally {
      process.env = prev;
    }
  });
});
