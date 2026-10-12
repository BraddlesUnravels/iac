import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateEnvironment } from '../scripts/validate-environment.mjs';

const readFixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );

test('should accept the valid environment fixture', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.valid.json'),
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('should reject a login server that does not match the ACR name', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.invalid-login-server.json'),
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /containerRegistryLoginServer/);
});

test('should reject inverted environment bounds', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.invalid-range.json'),
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /minimum must not exceed/);
});

test('should accept a workload without secrets or a custom domain', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.no-capabilities.json'),
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
});

const invalidCapabilityFixtures = [
  ['environment.domain-without-certificate.json', /must both be set or both be null/],
  ['environment.certificate-without-domain.json', /must both be set or both be null/],
  ['environment.secrets-without-key-vault.json', /keyVaultName is required/],
];

for (const [fixture, messagePattern] of invalidCapabilityFixtures) {
  test(`should reject ${fixture}`, async () => {
    const result = await validateEnvironment(await readFixture(fixture));

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), messagePattern);
  });
}

test('should accept the production catalog that includes qwik-website', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.with-qwik.json'),
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('should accept workloads hosted in the shared platform resource group', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.platform-rg-collision.json'),
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('should reject non-platform resource groups shared by multiple workloads', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.duplicate-nonplatform-rg.json'),
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Duplicate resource group/);
});

test('should reject duplicate container app targets across workloads', async () => {
  const result = await validateEnvironment(
    await readFixture('environment.duplicate-app-name.json'),
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Duplicate container app target/);
});
