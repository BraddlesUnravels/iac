#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadAndValidateEnvironment } from './validate-environment.mjs';

const allowedChangeTypes = new Set(['Create', 'Modify', 'NoChange']);
const normalizeResourceId = (resourceId) => resourceId.toLowerCase();

const forbiddenDeltaPaths = [
  'identity',
  'properties.managedEnvironmentId',
  'properties.configuration.registries',
  'properties.configuration.ingress.external',
  'properties.configuration.ingress.allowInsecure',
  'properties.configuration.ingress.targetPort',
  'properties.configuration.secrets',
  'properties.configuration.activeRevisionsMode',
];

const inspectModifyDelta = (change, errors) => {
  const delta = change.delta ?? change.propertyChanges ?? [];

  if (!Array.isArray(delta) || delta.length === 0) {
    // When Azure omits granular detail, require callers to supply allowAmbiguousModify=false default reject
    errors.push(
      `Modify change for ${change.resourceId} lacks granular delta; rejecting ambiguous modification`,
    );
    return;
  }

  for (const entry of delta) {
    const path = String(entry.path ?? entry.propertyName ?? '').toLowerCase();
    for (const forbidden of forbiddenDeltaPaths) {
      if (path.includes(forbidden.toLowerCase())) {
        errors.push(
          `Forbidden configuration change on ${change.resourceId}: ${path || forbidden}`,
        );
      }
    }
  }
};

export const validateWorkloadWhatIf = ({
  whatIfResult,
  catalog,
  application,
  allowCreate = true,
}) => {
  const errors = [];
  const resultProperties = whatIfResult.properties ?? whatIfResult;
  const workload = catalog.workloads[application];

  if (!workload) {
    return {
      valid: false,
      errors: [`Unknown application: ${application}`],
      changes: [],
    };
  }

  if (whatIfResult.status !== 'Succeeded') {
    errors.push(
      `What-if status must be Succeeded, received ${whatIfResult.status ?? 'missing'}`,
    );
  }

  const diagnostics = resultProperties.diagnostics ?? [];
  if (diagnostics.length > 0) {
    errors.push('What-if contains diagnostics or incomplete expansion');
  }

  const changes = resultProperties.changes;
  if (!Array.isArray(changes)) {
    errors.push('What-if result must contain a changes array');
    return { valid: false, errors, changes: [] };
  }

  const containerAppId =
    `/subscriptions/${catalog.azure.subscriptionId}` +
    `/resourceGroups/${workload.resourceGroup}` +
    `/providers/Microsoft.App/containerApps/${workload.containerAppName}`;

  const allowedResources = new Map([
    [normalizeResourceId(containerAppId), 'Microsoft.App/containerApps'],
  ]);

  const normalizedChanges = [];

  for (const change of changes) {
    const resourceId = change.resourceId;
    const changeType = change.changeType;

    if (typeof resourceId !== 'string' || !resourceId) {
      errors.push('Every what-if change must contain a resource ID');
      continue;
    }

    const normalizedId = normalizeResourceId(resourceId);
    const expectedType = allowedResources.get(normalizedId);

    // Nested deployments under the app RG deployment name pattern may appear.
    if (
      !expectedType &&
      normalizedId.includes('/providers/microsoft.resources/deployments/') &&
      normalizedId.includes(normalizeResourceId(workload.resourceGroup))
    ) {
      // Only allow nested deployment IDs under the app RG; still not other RGs.
      if (!allowedChangeTypes.has(changeType) || changeType === 'Delete') {
        errors.push(
          `Unsupported nested deployment change ${changeType ?? 'missing'} for ${resourceId}`,
        );
      }
      continue;
    }

    if (!expectedType) {
      errors.push(`What-if targets an unapproved resource: ${resourceId}`);
      continue;
    }

    if (!allowedChangeTypes.has(changeType)) {
      errors.push(
        `Unsupported what-if change type ${changeType ?? 'missing'} for ${resourceId}`,
      );
      continue;
    }

    if (changeType === 'Create' && !allowCreate) {
      errors.push(`Create is not allowed for subsequent releases: ${resourceId}`);
    }

    if (changeType === 'Modify') {
      inspectModifyDelta(change, errors);
    }

    normalizedChanges.push({
      resourceId,
      resourceType: expectedType,
      changeType,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    changes: normalizedChanges,
  };
};

export const loadAndValidateWorkloadWhatIf = async ({
  whatIfPath,
  catalogPath,
  application,
  allowCreate = true,
}) => {
  const environmentResult = await loadAndValidateEnvironment(catalogPath);
  if (!environmentResult.valid) {
    return {
      valid: false,
      errors: ['Environment validation failed', ...environmentResult.errors],
      changes: [],
    };
  }

  let whatIfResult;
  try {
    whatIfResult = JSON.parse(await readFile(whatIfPath, 'utf8'));
  } catch (error) {
    return {
      valid: false,
      errors: [`Unable to parse what-if JSON: ${error.message}`],
      changes: [],
    };
  }

  return validateWorkloadWhatIf({
    whatIfResult,
    catalog: environmentResult.catalog,
    application,
    allowCreate,
  });
};

const main = async () => {
  const [whatIfPath, catalogPath, application, ...options] = process.argv.slice(2);
  if (!whatIfPath || !catalogPath || !application) {
    throw new Error(
      'Usage: validate-workload-what-if.mjs <what-if.json> <environment.json> <application> [--disallow-create]',
    );
  }

  const result = await loadAndValidateWorkloadWhatIf({
    whatIfPath,
    catalogPath,
    application,
    allowCreate: !options.includes('--disallow-create'),
  });

  if (!result.valid) {
    throw new Error(
      `Workload what-if validation failed:\n${result.errors.join('\n')}`,
    );
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
