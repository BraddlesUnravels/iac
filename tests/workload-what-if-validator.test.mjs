import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAndValidateWorkloadWhatIf } from '../scripts/validate-workload-what-if.mjs';

const catalogPath = new URL('./fixtures/environment.with-qwik.json', import.meta.url);
const fixturePath = (name) => new URL(`./fixtures/${name}`, import.meta.url);

const validateFixture = (name, options = {}) =>
  loadAndValidateWorkloadWhatIf({
    whatIfPath: fixturePath(name),
    catalogPath,
    application: 'qwik-website',
    ...options,
  });

test('accepts initial create of the exact qwik container app', async () => {
  const result = await validateFixture('what-if.qwik-create.json');
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('accepts image-only modify with granular delta', async () => {
  const result = await validateFixture('what-if.qwik-image-modify.json');
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('accepts idempotent no-change', async () => {
  const result = await validateFixture('what-if.qwik-nochange.json');
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('rejects identity modification', async () => {
  const result = await validateFixture('what-if.qwik-identity-modify.json');
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Forbidden configuration change|identity/i);
});

test('rejects unrelated registry changes', async () => {
  const result = await validateFixture('what-if.qwik-unrelated.json');
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unapproved resource/);
});
