import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAndValidatePlatformWhatIf } from '../scripts/validate-platform-what-if.mjs';

const catalogPath = new URL('./fixtures/environment.valid.json', import.meta.url);
const fixturePath = (name) => new URL(`./fixtures/${name}`, import.meta.url);

const validateFixture = (name, options = {}) =>
  loadAndValidatePlatformWhatIf({
    whatIfPath: fixturePath(name),
    catalogPath,
    ...options,
  });

test('accepts creation of only the approved resource group and ACR', async () => {
  const result = await validateFixture('what-if.safe-create.json');

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.changes.length, 2);
  assert.equal(result.requiresModifyApproval, false);
});

test('accepts the live Azure CLI what-if envelope', async () => {
  const result = await validateFixture('what-if.live-cli-create.json');

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.changes.length, 2);
});

test('accepts an idempotent result', async () => {
  const result = await validateFixture('what-if.safe-idempotent.json');

  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('requires explicit approval for an allowed-resource modification', async () => {
  const unapprovedResult = await validateFixture('what-if.allowed-modify.json');
  const approvedResult = await validateFixture('what-if.allowed-modify.json', {
    allowModify: true,
  });

  assert.equal(unapprovedResult.valid, false);
  assert.match(unapprovedResult.errors.join('\n'), /Modify requires explicit approval/);
  assert.equal(approvedResult.valid, true, approvedResult.errors.join('\n'));
  assert.equal(approvedResult.requiresModifyApproval, true);
});

const unsafeFixtures = [
  ['what-if.registry-delete.json', /Unsupported what-if change type Delete/],
  ['what-if.unrelated-create.json', /unapproved resource/],
  ['what-if.wrong-resource-group.json', /unapproved resource/],
  ['what-if.malformed.json', /Unable to parse what-if JSON/],
  ['what-if.incomplete.json', /status must be Succeeded|diagnostics/],
];

for (const [fixture, messagePattern] of unsafeFixtures) {
  test(`rejects ${fixture}`, async () => {
    const result = await validateFixture(fixture);

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), messagePattern);
  });
}