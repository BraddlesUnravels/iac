import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  loadAndValidateWorkloadWhatIf,
  validateWorkloadWhatIf,
} from '../scripts/validate-workload-what-if.mjs';

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

test('accepts Key Vault secret reference changes for workloads with approved secrets', async () => {
  const result = await validateFixture('what-if.qwik-secrets-modify.json');
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('rejects secret changes for workloads without approved secrets', async () => {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  catalog.workloads['qwik-website'].allowedSecretNames = [];
  const whatIfResult = JSON.parse(
    await readFile(fixturePath('what-if.qwik-secrets-modify.json'), 'utf8'),
  );

  const result = validateWorkloadWhatIf({
    whatIfResult,
    catalog,
    application: 'qwik-website',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /properties\.configuration\.secrets/);
});

test('accepts live CLI Ignore entries for untouched workload foundation resources', async () => {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const prefix = `/subscriptions/${catalog.azure.subscriptionId}/resourceGroups/${catalog.workloads['qwik-website'].resourceGroup}/providers/`;
  const foundationIds = [
    `${prefix}Microsoft.App/managedEnvironments/acae-qwik-website-production`,
    `${prefix}Microsoft.App/managedEnvironments/acae-qwik-website-production/managedCertificates/www`,
    `${prefix}Microsoft.ManagedIdentity/userAssignedIdentities/id-qwik-website-pull`,
    `${prefix}Microsoft.OperationalInsights/workspaces/log-qwik-website-production`,
  ];
  const result = validateWorkloadWhatIf({
    catalog,
    application: 'qwik-website',
    whatIfResult: {
      status: 'Succeeded',
      changes: foundationIds.map((resourceId) => ({ resourceId, changeType: 'Ignore' })),
    },
  });
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(result.changes, []);

  for (const changeType of ['Create', 'Modify', 'Delete', 'NoChange', 'Unsupported']) {
    const rejected = validateWorkloadWhatIf({
      catalog,
      application: 'qwik-website',
      whatIfResult: { status: 'Succeeded', changes: [{ resourceId: foundationIds[0], changeType }] },
    });
    assert.equal(rejected.valid, false, `Foundation ${changeType} must remain blocked`);
  }
});

test('Ignore never permits a skipped app or a different workload scope', async () => {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const workload = catalog.workloads['qwik-website'];
  for (const [group, type] of [
    [workload.resourceGroup, `Microsoft.App/containerApps/${workload.containerAppName}`],
    [`${workload.resourceGroup}-other`, 'Microsoft.ManagedIdentity/userAssignedIdentities/pull'],
    ['rg-access-control-demo', 'Microsoft.App/containerApps/aca-access-control-demo'],
  ]) {
    const result = validateWorkloadWhatIf({
      catalog,
      application: 'qwik-website',
      whatIfResult: {
        status: 'Succeeded',
        changes: [{
          resourceId: `/subscriptions/${catalog.azure.subscriptionId}/resourceGroups/${group}/providers/${type}`,
          changeType: 'Ignore',
        }],
      },
    });
    assert.equal(result.valid, false);
  }
});

test('nested deployments must use the exact workload resource group boundary', async () => {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const workload = catalog.workloads['qwik-website'];
  const resourceId = `/subscriptions/${catalog.azure.subscriptionId}/resourceGroups/${workload.resourceGroup}-other/providers/Microsoft.Resources/deployments/nested`;
  const result = validateWorkloadWhatIf({
    catalog,
    application: 'qwik-website',
    whatIfResult: { status: 'Succeeded', changes: [{ resourceId, changeType: 'Create' }] },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /unapproved resource/);
});
