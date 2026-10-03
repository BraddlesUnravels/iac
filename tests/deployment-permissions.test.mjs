import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDeploymentPermissions } from '../scripts/validate-deployment-permissions.mjs';

const permission = (actions, notActions = []) => ({ actions, notActions });
const planner = permission([
  'Microsoft.Resources/deployments/read',
  'Microsoft.Resources/deployments/validate/action',
  'Microsoft.Resources/deployments/whatIf/action',
]);

test('Reader alone fails with an actionable scoped planner repair', () => {
  assert.throws(
    () => validateDeploymentPermissions({ value: [permission(['*/read'])] }, 'preflight'),
    /whatIf\/action[\s\S]*deployment-planner\.bicep[\s\S]*do not grant Contributor/,
  );
});

test('Reader plus the custom role allows planning without resource write', () => {
  for (const operation of ['preflight', 'what-if']) {
    validateDeploymentPermissions({ value: [permission(['*/read']), planner] }, operation);
  }
  assert.throws(
    () => validateDeploymentPermissions({ value: [planner] }, 'apply'),
    /Microsoft.Resources\/deployments\/write/,
  );
});

test('Contributor permits protected apply despite its IAM exclusions', () => {
  validateDeploymentPermissions({
    value: [permission(['*'], ['Microsoft.Authorization/*/write', 'Microsoft.Authorization/*/delete'])],
  }, 'apply');
});

test('NotActions only subtracts permissions from the same role, not other roles', () => {
  const excluded = permission(['*'], ['Microsoft.Resources/deployments/whatIf/action']);
  assert.throws(() => validateDeploymentPermissions({ value: [excluded] }, 'what-if'), /whatIf\/action/);
  validateDeploymentPermissions({ value: [excluded, planner] }, 'what-if');
});

test('action matching is case-insensitive and requires the full action', () => {
  validateDeploymentPermissions({ value: [permission(['microsoft.resources/DEPLOYMENTS/*'])] }, 'what-if');
  assert.throws(
    () => validateDeploymentPermissions({ value: [permission(['Microsoft.Resources/deployments/whatIf/actionExtra'])] }, 'what-if'),
    /whatIf\/action/,
  );
});

test('missing, malformed, empty and incomplete permission responses fail closed', () => {
  for (const response of [
    null, {}, { value: [] }, { value: [permission(['*'])], nextLink: 'next-page' },
    { value: [{}] }, { value: [permission([null])] },
  ]) {
    assert.throws(() => validateDeploymentPermissions(response, 'what-if'));
  }
  assert.throws(() => validateDeploymentPermissions({ value: [planner] }, 'verify'), /Unsupported/);
});
