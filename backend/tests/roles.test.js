const { test } = require('node:test');
const assert = require('node:assert');
const { allowRoles, canAccessHospital } = require('../middleware/roles');

const HOSP_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const HOSP_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

test('canAccessHospital: superadmin reaches any hospital', () => {
  const su = { role: 'superadmin' };
  assert.strictEqual(canAccessHospital(su, HOSP_A), true);
  assert.strictEqual(canAccessHospital(su, HOSP_B), true);
  assert.strictEqual(canAccessHospital(su, undefined), true);
});

test('canAccessHospital: admin/staff limited to own hospital', () => {
  const adminA = { role: 'admin', hospitalId: HOSP_A };
  assert.strictEqual(canAccessHospital(adminA, HOSP_A), true);
  assert.strictEqual(canAccessHospital(adminA, HOSP_B), false);
});

test('canAccessHospital: falsy user or hospital is denied', () => {
  assert.strictEqual(canAccessHospital(null, HOSP_A), false);
  assert.strictEqual(canAccessHospital({ role: 'staff', hospitalId: HOSP_A }, undefined), false);
  assert.strictEqual(canAccessHospital({ role: 'staff' }, HOSP_A), false);
});

// Minimal Express req/res/next doubles for middleware tests.
function run(middleware, user) {
  const req = { user };
  let nexted = false;
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  middleware(req, res, () => { nexted = true; });
  return { nexted, statusCode: res.statusCode, body: res.body };
}

test('allowRoles: calls next for an allowed role', () => {
  const r = run(allowRoles('admin', 'superadmin'), { role: 'admin' });
  assert.strictEqual(r.nexted, true);
});

test('allowRoles: 403 for a disallowed role', () => {
  const r = run(allowRoles('admin', 'superadmin'), { role: 'staff' });
  assert.strictEqual(r.nexted, false);
  assert.strictEqual(r.statusCode, 403);
});

test('allowRoles: 401 when unauthenticated', () => {
  const r = run(allowRoles('admin'), undefined);
  assert.strictEqual(r.nexted, false);
  assert.strictEqual(r.statusCode, 401);
});
