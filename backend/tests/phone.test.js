const { test } = require('node:test');
const assert = require('node:assert');
const { formatNigerianPhone, normalizePhone } = require('../utils/phone');

test('formatNigerianPhone: local 0-prefixed number', () => {
  assert.strictEqual(formatNigerianPhone('08012345678'), '+2348012345678');
});

test('formatNigerianPhone: 234-prefixed number', () => {
  assert.strictEqual(formatNigerianPhone('2348012345678'), '+2348012345678');
});

test('formatNigerianPhone: +234 with spaces/dashes', () => {
  assert.strictEqual(formatNigerianPhone('+234 801-234-5678'), '+2348012345678');
});

test('formatNigerianPhone: bare 10-digit number', () => {
  assert.strictEqual(formatNigerianPhone('8012345678'), '+2348012345678');
});

test('formatNigerianPhone: rejects wrong length', () => {
  assert.strictEqual(formatNigerianPhone('0801234'), null);
  assert.strictEqual(formatNigerianPhone('23480123456789'), null);
  assert.strictEqual(formatNigerianPhone(''), null);
  assert.strictEqual(formatNigerianPhone(null), null);
});

test('normalizePhone: ensures leading +, strips junk', () => {
  assert.strictEqual(normalizePhone('2348012345678'), '+2348012345678');
  assert.strictEqual(normalizePhone('+2348012345678'), '+2348012345678');
  assert.strictEqual(normalizePhone('whatsapp:+234 801 234 5678'.replace('whatsapp:', '')), '+2348012345678');
  assert.strictEqual(normalizePhone(''), '');
  assert.strictEqual(normalizePhone(null), '');
});
