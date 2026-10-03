import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { renderWorkloadParameters } from '../scripts/render-workload-parameters.mjs';

const readFixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const evidence = {
  sourceCommitSha: 'a'.repeat(40),
  releaseId: 1,
  imageDigest: `sha256:${'b'.repeat(64)}`,
};

test('renders Key Vault secret references for qwik secret env vars', async () => {
  const parameters = renderWorkloadParameters({
    contract: await readFixture('workload.qwik-valid.json'),
    catalog: await readFixture('environment.with-qwik.json'),
    evidence,
    digestReference: 'example.azurecr.io/qwik-website@sha256:abc',
  }).parameters;

  assert.deepEqual(parameters.keyVaultSecretRefs.value, [
    {
      name: 'qwik-demo-general-access-code',
      keyVaultUrl:
        'https://kv-acd-prod-braddles.vault.azure.net/secrets/qwik-demo-general-access-code',
    },
  ]);
  assert.deepEqual(parameters.secretEnvVars.value, [
    { name: 'ACA_GENERAL_ACCESS_CODE', secretRef: 'qwik-demo-general-access-code' },
  ]);
  assert.ok(
    parameters.nonsecretEnvVars.value.every(
      ({ name }) => name !== 'ACA_GENERAL_ACCESS_CODE',
    ),
  );
});

test('renders empty secret parameters when a workload has no secret refs', async () => {
  const contract = await readFixture('workload.qwik-valid.json');
  contract.secretRefs = {};

  const parameters = renderWorkloadParameters({
    contract,
    catalog: await readFixture('environment.with-qwik.json'),
    evidence,
    digestReference: 'example.azurecr.io/qwik-website@sha256:abc',
  }).parameters;

  assert.deepEqual(parameters.keyVaultSecretRefs.value, []);
  assert.deepEqual(parameters.secretEnvVars.value, []);
});
