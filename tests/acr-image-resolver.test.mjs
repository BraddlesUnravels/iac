import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalogPath = join(root, 'tests/fixtures/environment.with-qwik.json');
const contractPath = join(root, 'tests/fixtures/workload.qwik-valid.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const workload = catalog.workloads['qwik-website'];
const sourceSha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;

const setup = async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'acr-resolver-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'az'), `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  'account show --query id --output tsv') printf '%s\\n' "$MOCK_SUBSCRIPTION" ;;
  'account show --query tenantId --output tsv') printf '%s\\n' "$MOCK_TENANT" ;;
  'bicep version') echo 'Bicep CLI version 0.47.16' ;;
  'group show '*) ;;
  'acr show '*) printf '%s\\n' "$MOCK_ACR" ;;
  'acr login '*) echo '{"accessToken":"test-refresh-token"}' ;;
  *) echo "Unexpected az command: $*" >&2; exit 1 ;;
esac
`, { mode: 0o700 });
  await writeFile(join(directory, 'curl'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *'/oauth2/token'* ]]; then
  echo '{"access_token":"test-access-token"}'
else
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dump-header) printf 'Docker-Content-Digest: %s\\r\\n' "$MOCK_DIGEST" > "$2"; shift 2 ;;
      --output) echo '{}' > "$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  printf '200'
fi
`, { mode: 0o700 });
  const evidencePath = join(directory, 'evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    sourceRepository: workload.repository,
    sourceRepositoryId: workload.repositoryId,
    sourceRepositoryOwnerId: workload.repositoryOwnerId,
    sourceCommitSha: sourceSha,
    releaseId: 1,
    imageTag: `${catalog.azure.containerRegistryLoginServer}/qwik-website:${sourceSha}`,
    imageDigest: digest,
  }));
  return {
    evidencePath,
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      MOCK_SUBSCRIPTION: catalog.azure.subscriptionId,
      MOCK_TENANT: catalog.azure.tenantId,
      MOCK_DIGEST: digest,
      MOCK_ACR: JSON.stringify({
        name: catalog.azure.containerRegistryName,
        loginServer: catalog.azure.containerRegistryLoginServer,
        sku: 'Basic',
        roleMode: 'AbacRepositoryPermissions',
        admin: false,
      }),
    },
  };
};

test('ACR resolver emits only JSON on stdout and validation status on stderr', async (t) => {
  const { env } = await setup(t);
  const result = spawnSync('bash', [
    join(root, 'scripts/resolve-acr-image.sh'), catalogPath, 'qwik-website', sourceSha,
  ], { env, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const resolved = JSON.parse(result.stdout);
  assert.equal(resolved.imageDigest, digest);
  assert.equal(resolved.sourceCommitSha, sourceSha);
  assert.equal(resolved.imageTag, `${catalog.azure.containerRegistryLoginServer}/qwik-website:${sourceSha}`);
  assert.match(result.stderr, /Validated environment catalog:/);
});

for (const mismatch of [false, true]) {
  test(`planner preflight ${mismatch ? 'rejects a mismatched' : 'accepts a matching'} live digest`, async (t) => {
    const { env, evidencePath } = await setup(t);
    if (mismatch) env.MOCK_DIGEST = `sha256:${'c'.repeat(64)}`;
    const result = spawnSync('bash', [
      join(root, 'scripts/deploy-workload-release.sh'),
      'preflight', 'qwik-website', catalogPath, contractPath, evidencePath,
    ], { env, encoding: 'utf8' });

    if (mismatch) {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Resolved ACR digest does not match verified release evidence/);
      assert.doesNotMatch(result.stdout, /preflight=ok/);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /preflight=ok/);
      assert.ok(result.stdout.includes(`imageDigest=${digest}`));
      assert.doesNotMatch(result.stderr, /using independently verified release digest/);
    }
  });
}
