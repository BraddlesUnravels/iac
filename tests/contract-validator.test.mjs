import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateContract } from '../scripts/validate-contract.mjs';

const readFixture = async (name) =>
  JSON.parse(
    await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'),
  );

const catalog = await readFixture('environment.valid.json');
const caller = {
  callerRepository: 'braddlesunravels/access-control-demo',
  callerRepositoryId: '1298659298',
  callerRepositoryOwnerId: '103235805',
};

test('accepts the approved production workload', async () => {
  const result = await validateContract(
    await readFixture('workload.valid.json'),
    catalog,
    caller,
  );

  assert.equal(result.valid, true, result.errors.join('\n'));
});

const invalidFixtures = [
  ['workload.unknown-stack.json', /not approved/],
  ['workload.unknown-environment.json', /must be equal to one of the allowed values/],
  ['workload.injected-target.json', /additional properties/],
  ['workload.unapproved-env.json', /Environment variables must exactly match/],
  ['workload.unapproved-secret.json', /Secret references must exactly match/],
  ['workload.secret-value.json', /additional properties/],
  ['workload.invalid-port.json', /Target port 4000 is not approved/],
  ['workload.replica-outside-bounds.json', /Maximum replicas 2 is outside approved bounds/],
  ['workload.postgresql-production.json', /not approved|not supported/],
];

for (const [fixture, messagePattern] of invalidFixtures) {
  test(`rejects ${fixture}`, async () => {
    const result = await validateContract(
      await readFixture(fixture),
      catalog,
      caller,
    );

    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), messagePattern);
  });
}

test('rejects a caller repository mismatch', async () => {
  const result = await validateContract(
    await readFixture('workload.valid.json'),
    catalog,
    { ...caller, callerRepository: 'braddlesunravels/other-repository' },
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Caller repository must equal/);
});

test('rejects immutable caller ID mismatches', async () => {
  const result = await validateContract(
    await readFixture('workload.valid.json'),
    catalog,
    {
      ...caller,
      callerRepositoryId: '1',
      callerRepositoryOwnerId: '2',
    },
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Caller repository ID must equal/);
  assert.match(result.errors.join('\n'), /Caller repository owner ID must equal/);
});