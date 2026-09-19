import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { verifyImage } from '../scripts/verify-image.mjs';

const readFixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );

const catalog = await readFixture('environment.valid.json');
const imageCases = await readFixture('image-cases.json');

const verify = (overrides = {}) =>
  verifyImage({
    imageTag: imageCases.validTag,
    imageDigest: imageCases.digest,
    callerSha: imageCases.callerSha,
    catalog,
    application: 'access-control-demo',
    resolvedDigest: imageCases.digest,
    ...overrides,
  });

test('accepts a matching immutable image and returns its digest reference', () => {
  const result = verify();

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(
    result.digestReference,
    `acriacvalidation001.azurecr.io/access-control-demo@${imageCases.digest}`,
  );
});

const invalidCases = [
  ['mutable image tag', { imageTag: imageCases.mutableTag }, /Image tag must match/],
  ['wrong ACR hostname', { imageTag: imageCases.wrongRegistryTag }, /Image tag must match/],
  ['wrong repository', { imageTag: imageCases.wrongRepositoryTag }, /Image tag must match/],
  ['SHA mismatch', { callerSha: imageCases.differentSha }, /Image tag SHA must equal/],
  ['digest mismatch', { resolvedDigest: imageCases.differentDigest }, /Resolved registry digest must equal/],
];

for (const [name, overrides, messagePattern] of invalidCases) {
  test(`rejects ${name}`, () => {
    const result = verify(overrides);

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), messagePattern);
  });
}