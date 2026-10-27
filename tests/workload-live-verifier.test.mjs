import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalogPath = join(root, 'tests/fixtures/environment.with-qwik.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const digest = `sha256:${'b'.repeat(64)}`;

const setup = async (t, application, responses = {}) => {
  const directory = await mkdtemp(join(tmpdir(), 'live-verifier-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workload = catalog.workloads[application];
  const image = `${catalog.azure.containerRegistryLoginServer}/${workload.containerRepository}@${digest}`;
  const app = {
    properties: {
      template: {
        containers: [{
          image,
          env: [{ name: 'AZURE_CUSTOM_DOMAIN', value: workload.customDomainName }],
        }],
      },
      configuration: {
        ingress: {
          fqdn: 'test.azurecontainerapps.io',
          customDomains: [
            { name: workload.customDomainName, certificateResourceId: workload.certificateResourceId },
            ...(workload.additionalCustomDomains ?? []),
          ].map(({ name, certificateResourceId }) => ({
            name, certificateId: certificateResourceId, bindingType: 'SniEnabled',
          })),
        },
      },
    },
  };
  await writeFile(join(directory, 'az'), `#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  'account show --query id --output tsv') printf '%s\\n' "$MOCK_SUBSCRIPTION" ;;
  'account show --query tenantId --output tsv') printf '%s\\n' "$MOCK_TENANT" ;;
  'bicep version') echo 'Bicep CLI version 0.47.16' ;;
  'containerapp show '*) printf '%s\\n' "$MOCK_APP" ;;
  *) echo "Unexpected az command: $*" >&2; exit 1 ;;
esac
`, { mode: 0o700 });
  await writeFile(join(directory, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const url = args.at(-1);
const path = new URL(url).pathname;
const calls = JSON.parse(fs.readFileSync(process.env.MOCK_CALLS, 'utf8'));
const index = calls.filter((call) => call.url === url).length;
calls.push({ url, args });
fs.writeFileSync(process.env.MOCK_CALLS, JSON.stringify(calls));
const responses = JSON.parse(process.env.MOCK_RESPONSES)[path] ?? [{ status: '200' }];
const response = responses[Math.min(index, responses.length - 1)];
process.stdout.write(response.status);
if (response.exitCode) process.stderr.write('Simulated transport failure\\n');
process.exit(response.exitCode ?? 0);
`, { mode: 0o700 });
  await writeFile(join(directory, 'sleep'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$MOCK_SLEEPS"
`, { mode: 0o700 });
  const evidencePath = join(directory, 'evidence.json');
  await writeFile(evidencePath, JSON.stringify({
    sourceCommitSha: 'a'.repeat(40),
    imageDigest: digest,
  }));
  const callsPath = join(directory, 'calls.json');
  await writeFile(callsPath, '[]');
  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    MOCK_SUBSCRIPTION: catalog.azure.subscriptionId,
    MOCK_TENANT: catalog.azure.tenantId,
    MOCK_APP: JSON.stringify(app),
    MOCK_RESPONSES: JSON.stringify(responses),
    MOCK_CALLS: callsPath,
    MOCK_SLEEPS: join(directory, 'sleeps.log'),
  };
  const contractPath = join(root, 'tests/fixtures',
    application === 'qwik-website' ? 'workload.qwik-valid.json' : 'workload.valid.json');
  return {
    directory,
    env,
    run: () => spawnSync('bash', [
      join(root, 'scripts/deploy-workload-release.sh'),
      'verify', application, catalogPath, contractPath, evidencePath,
    ], { env, encoding: 'utf8', timeout: 30_000 }),
    calls: async () => JSON.parse(await readFile(callsPath, 'utf8')),
    sleeps: async () => (await readFile(env.MOCK_SLEEPS, 'utf8')).trim().split('\n'),
  };
};

for (const application of ['qwik-website', 'access-control-demo']) {
  test(`should verify all expected routes for ${application}`, async (t) => {
    const verifier = await setup(t, application);
    const result = verifier.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /health=ok/);
    const calls = await verifier.calls();
    assert.deepEqual(calls.map(({ url }) => new URL(url).pathname),
      application === 'qwik-website' ? ['/health', '/', '/projects/access-control-demo'] : ['/api/health']);
    for (const { args } of calls) {
      assert.equal(args[args.indexOf('--max-time') + 1], '10');
      assert.equal(args[args.indexOf('--connect-timeout') + 1], '5');
      assert.equal(args[args.indexOf('--output') + 1], '/dev/null');
      assert.ok(!args.includes('--location') && !args.includes('-L'));
    }
  });
}

for (const [application, path, status, exitCode] of [
  ['qwik-website', '/projects/access-control-demo', '404', 0],
  ['qwik-website', '/', '503', 0],
  ['qwik-website', '/health', '500', 0],
  ['access-control-demo', '/api/health', '000', 7],
  ['access-control-demo', '/api/health', '200', 28],
]) {
  test(`should retry ${application} ${path} after HTTP ${status}, curl exit ${exitCode}`, async (t) => {
    const verifier = await setup(t, application, {
      [path]: [{ status, exitCode }, { status: '200' }],
    });
    const result = verifier.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /health=ok/);
    assert.ok(result.stderr.includes(`HTTP ${status}, curl exit ${exitCode}`));
    const calls = (await verifier.calls()).filter(({ url }) => new URL(url).pathname === path);
    assert.equal(calls.length, 2);
    assert.deepEqual(await verifier.sleeps(), ['5']);
  });
}

for (const [application, path, status, exitCode] of [
  ['qwik-website', '/projects/access-control-demo', '404', 0],
  ['qwik-website', '/', '301', 0],
  ['qwik-website', '/health', '503', 0],
  ['access-control-demo', '/api/health', '404', 0],
  ['access-control-demo', '/api/health', '000', 28],
]) {
  test(`should fail closed after 30 failed checks for ${application} ${path} (${status}/${exitCode})`, async (t) => {
    const verifier = await setup(t, application, { [path]: [{ status, exitCode }] });
    const result = verifier.run();
    assert.equal(result.status, 1, result.stderr);
    assert.doesNotMatch(result.stdout, /health=ok/);
    assert.ok(result.stderr.includes(`Live HTTP verification failed for https://${catalog.workloads[application].customDomainName}${path}`));
    assert.ok(result.stderr.includes(`last HTTP ${status}, curl exit ${exitCode}`));
    const calls = await verifier.calls();
    assert.equal(calls.filter(({ url }) => new URL(url).pathname === path).length, 30);
    assert.equal(new URL(calls.at(-1).url).pathname, path);
    assert.deepEqual(await verifier.sleeps(), Array(29).fill('5'));
  });
}

test('should reject a live image mismatch before making HTTP requests', async (t) => {
  const verifier = await setup(t, 'qwik-website');
  const app = JSON.parse(verifier.env.MOCK_APP);
  app.properties.template.containers[0].image = 'wrong.azurecr.io/qwik-website:latest';
  verifier.env.MOCK_APP = JSON.stringify(app);
  const result = verifier.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Live image .* does not equal/);
  assert.deepEqual(await verifier.calls(), []);
});

test('should stop at the shared deadline without waiting for all 30 attempts', async (t) => {
  const verifier = await setup(t, 'qwik-website', {
    '/health': [{ status: '503' }],
  });
  const clockPath = join(verifier.directory, 'clock.sh');
  await writeFile(clockPath, 'unset SECONDS\nSECONDS=0\nsleep() { SECONDS="${verification_deadline}"; }\n');
  verifier.env.BASH_ENV = clockPath;
  const result = verifier.run();
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /shared 300-second deadline exhausted/);
  assert.doesNotMatch(result.stdout, /health=ok/);
  assert.equal((await verifier.calls()).length, 1);
});

test('should cap request timeouts to the budget remaining across all routes', async (t) => {
  const verifier = await setup(t, 'qwik-website', {
    '/health': [{ status: '503' }, { status: '200' }],
  });
  const clockPath = join(verifier.directory, 'clock.sh');
  await writeFile(clockPath, 'unset SECONDS\nSECONDS=0\nsleep() { SECONDS=$((verification_deadline - 2)); }\n');
  verifier.env.BASH_ENV = clockPath;
  const result = verifier.run();
  assert.equal(result.status, 0, result.stderr);
  const calls = await verifier.calls();
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname),
    ['/health', '/health', '/', '/projects/access-control-demo']);
  for (const { args } of calls.slice(1)) {
    const timeout = Number(args[args.indexOf('--max-time') + 1]);
    assert.ok(timeout > 0 && timeout <= 2, `Timeout exceeded remaining budget: ${timeout}`);
  }
});
