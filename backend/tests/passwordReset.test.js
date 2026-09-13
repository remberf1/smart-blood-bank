const { test } = require('node:test');
const assert = require('node:assert');
const { generateResetToken, hashToken, RESET_TOKEN_TTL_MS } = require('../utils/passwordReset');
const { buildPasswordResetEmail } = require('../services/notificationService');

test('generateResetToken returns a raw token, its hash, and a future expiry', () => {
  const t = generateResetToken();
  assert.strictEqual(typeof t.raw, 'string');
  assert.ok(t.raw.length >= 32, 'raw token is long enough to be unguessable');
  assert.strictEqual(t.hash, hashToken(t.raw), 'hash is the SHA-256 of the raw token');
  assert.ok(t.expiry > new Date(), 'expiry is in the future');
  assert.ok(t.expiry.getTime() - Date.now() <= RESET_TOKEN_TTL_MS + 1000);
});

test('hashToken is deterministic and never returns the raw token', () => {
  const raw = 'some-secret-token';
  const h = hashToken(raw);
  assert.strictEqual(h, hashToken(raw));
  assert.notStrictEqual(h, raw);
  assert.strictEqual(h.length, 64); // sha256 hex
});

test('two tokens are distinct', () => {
  assert.notStrictEqual(generateResetToken().raw, generateResetToken().raw);
});

test('password reset email carries the reset link and is branded', () => {
  const e = buildPasswordResetEmail('Ada', 'https://app/reset-password?token=xyz');
  assert.match(e.subject, /reset/i);
  assert.ok(e.text.includes('https://app/reset-password?token=xyz'));
  assert.match(e.html, /reset-password\?token=xyz/);
  assert.match(e.html, /Smart Blood Bank/);
  assert.ok(!e.text.includes('<'), 'plain text has no tags');
});
