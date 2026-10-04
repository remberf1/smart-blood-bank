const { test } = require('node:test');
const assert = require('node:assert');
const { hashNin, maskNin } = require('../utils/nin');

test('maskNin: masks 11-digit NIN preserving only last 4 digits', () => {
  assert.strictEqual(maskNin('21475086321'), '*******6321');
  assert.strictEqual(maskNin('12345678901'), '*******8901');
  assert.strictEqual(maskNin('  214-750-86321  '), '*******6321');
});

test('maskNin: handles edge cases and short values', () => {
  assert.strictEqual(maskNin(''), null);
  assert.strictEqual(maskNin(null), null);
  assert.strictEqual(maskNin(undefined), null);
  assert.strictEqual(maskNin('123'), '123');
});

test('hashNin: is deterministic (same input produces identical hash)', () => {
  const hash1 = hashNin('21475086321');
  const hash2 = hashNin('21475086321');
  assert.strictEqual(typeof hash1, 'string');
  assert.strictEqual(hash1.length, 64); // 256-bit hex
  assert.strictEqual(hash1, hash2);
});

test('hashNin: normalizes formatted NIN (spaces, dashes)', () => {
  const rawHash = hashNin('21475086321');
  const formattedHash = hashNin('214-750-86321');
  const spacedHash = hashNin('214 750 86321');
  assert.strictEqual(formattedHash, rawHash);
  assert.strictEqual(spacedHash, rawHash);
});

test('hashNin: different NINs produce distinct hashes', () => {
  const hashA = hashNin('21475086321');
  const hashB = hashNin('21475086322');
  assert.notStrictEqual(hashA, hashB);
});

test('hashNin: handles empty and null inputs safely', () => {
  assert.strictEqual(hashNin(''), null);
  assert.strictEqual(hashNin(null), null);
  assert.strictEqual(hashNin(undefined), null);
});
