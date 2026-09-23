import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { verifyRelease } from '../scripts/verify-release.mjs';

const readFixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );

const catalog = await readFixture('environment.with-qwik.json');
const sourceSha = '0123456789abcdef0123456789abcdef01234567';
const digest =
  'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const validPayload = {
  schemaVersion: 1,
  application: 'qwik-website',
  environment: 'production',
  sourceRepository: 'BraddlesUnravels/qwik-website',
  sourceRepositoryId: '1367173842',
  releaseId: '42',
  releaseTag: 'v1.0.0',
  sourceCommitSha: sourceSha,
  imageTag: `acriacvalidation001.azurecr.io/qwik-website:${sourceSha}`,
  imageDigest: digest,
  sourceRunId: '99',
};

const createGithubClient = (overrides = {}) => {
  const repository = {
    id: 1367173842,
    full_name: 'BraddlesUnravels/qwik-website',
    owner: { id: 103235805 },
    ...overrides.repository,
  };
  const release = {
    id: 42,
    draft: false,
    prerelease: false,
    published_at: '2026-09-23T00:00:00Z',
    tag_name: 'v1.0.0',
    html_url: 'https://github.com/BraddlesUnravels/qwik-website/releases/tag/v1.0.0',
    ...overrides.release,
  };
  const ref = {
    object: { type: 'commit', sha: sourceSha },
    ...overrides.ref,
  };

  return async (url) => {
    if (url.endsWith('/repos/BraddlesUnravels/qwik-website')) {
      return repository;
    }
    if (url.includes('/releases/')) {
      return release;
    }
    if (url.includes('/git/ref/tags/')) {
      return ref;
    }
    throw new Error(`Unexpected URL ${url}`);
  };
};

test('accepts a verified stable release payload', async () => {
  const result = await verifyRelease({
    payload: validPayload,
    catalog,
    githubClient: createGithubClient(),
  });

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.evidence.sourceCommitSha, sourceSha);
  assert.equal(result.evidence.releaseId, '42');
});

test('rejects forged repository id even when slug matches', async () => {
  const result = await verifyRelease({
    payload: { ...validPayload, sourceRepositoryId: '1' },
    catalog,
    githubClient: createGithubClient(),
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /sourceRepositoryId must equal/);
});

test('rejects draft releases from GitHub evidence', async () => {
  const result = await verifyRelease({
    payload: validPayload,
    catalog,
    githubClient: createGithubClient({ release: { draft: true } }),
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /draft/i);
});

test('rejects tag commit mismatch', async () => {
  const result = await verifyRelease({
    payload: validPayload,
    catalog,
    githubClient: createGithubClient({
      ref: {
        object: {
          type: 'commit',
          sha: 'fedcba9876543210fedcba9876543210fedcba98',
        },
      },
    }),
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /tag commit does not match/);
});

test('rejects extra payload properties', async () => {
  const result = await verifyRelease({
    payload: { ...validPayload, subscriptionId: 'evil' },
    catalog,
    githubClient: createGithubClient(),
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Unexpected payload field/);
});

test('accepts payload without optional sourceRunId', async () => {
  const { sourceRunId: _ignored, ...payloadWithoutRunId } = validPayload;
  const result = await verifyRelease({
    payload: payloadWithoutRunId,
    catalog,
    githubClient: createGithubClient(),
  });

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.evidence.sourceRunId, undefined);
});

test('treats GitHub API failures as deployment blockers', async () => {
  const result = await verifyRelease({
    payload: validPayload,
    catalog,
    githubClient: async () => {
      throw new Error('rate limited');
    },
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Independent GitHub verification failed/);
});
