#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const planningActions = [
  'Microsoft.Resources/deployments/read',
  'Microsoft.Resources/deployments/validate/action',
  'Microsoft.Resources/deployments/whatIf/action',
];

const matchesAction = (pattern, action) => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '.*')}$`, 'i').test(action);
};

export const validateDeploymentPermissions = (response, operation) => {
  if (!['preflight', 'what-if', 'apply'].includes(operation)) {
    throw new Error(`Unsupported permission-check operation: ${operation}`);
  }
  if (!Array.isArray(response?.value) || response.nextLink) {
    throw new Error('Effective permissions response is missing or incomplete');
  }
  for (const permission of response.value) {
    if (!Array.isArray(permission.actions) || !Array.isArray(permission.notActions)
      || [...permission.actions, ...permission.notActions].some(
        (pattern) => typeof pattern !== 'string' || !pattern,
      )) {
      throw new Error('Effective permissions response contains malformed actions');
    }
  }

  const requiredActions = operation === 'apply'
    ? [...planningActions, 'Microsoft.Resources/deployments/write', 'Microsoft.App/containerApps/write']
    : planningActions;
  const missing = requiredActions.filter((action) => !response.value.some(
    (permission) => permission.actions.some((pattern) => matchesAction(pattern, action))
      && !permission.notActions.some((pattern) => matchesAction(pattern, action)),
  ));

  if (missing.length > 0) {
    const repair = operation === 'apply'
      ? 'Have a foundation operator verify the deployer role assignments on the workload resource group.'
      : 'Have a foundation operator apply modules/role-assignment/deployment-planner.bicep for the planner on the workload resource group. Reader alone cannot run what-if; do not grant Contributor to the planner.';
    throw new Error(
      `Deployment permission preflight failed for the authenticated identity:\n${missing.join('\n')}\n${repair}\nAllow RBAC propagation and start a fresh job after repair.`,
    );
  }
};

const main = async () => {
  const [permissionsPath, operation] = process.argv.slice(2);
  if (!permissionsPath || !operation) {
    throw new Error('Usage: validate-deployment-permissions.mjs <permissions.json> <preflight|what-if|apply>');
  }
  validateDeploymentPermissions(JSON.parse(await readFile(permissionsPath, 'utf8')), operation);
  console.log(`deploymentPermissions=ok (${operation})`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
