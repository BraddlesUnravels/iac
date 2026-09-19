import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateEnvironment } from '../scripts/validate-environment.mjs';

const readFixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );

test('accepts the valid environment fixture', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.valid.json'),
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('rejects a login server that does not match the ACR name', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.invalid-login-server.json'),
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /containerRegistryLoginServer/);
});

test('rejects inverted environment bounds', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.invalid-range.json'),
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /minimum must not exceed/);
});