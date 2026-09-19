#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadAndValidateEnvironment } from './validate-environment.mjs';

const allowedChangeTypes = new Set(['Create', 'Modify', 'NoChange']);

const normalizeResourceId = (resourceId) => resourceId.toLowerCase();

export const validatePlatformWhatIf = ({
  whatIfResult,
  catalog,
  allowModify = false,
}) => {
  const errors = [];
  const resultProperties = whatIfResult.properties ?? whatIfResult;

  if (whatIfResult.status !== 'Succeeded') {
    errors.push(`What-if status must be Succeeded, received ${whatIfResult.status ?? 'missing'}`);
  }

  const diagnostics = resultProperties.diagnostics ?? [];

  if (diagnostics.length > 0) {
    errors.push('What-if contains diagnostics or incomplete expansion');
  }

  const changes = resultProperties.changes;

  if (!Array.isArray(changes)) {
    errors.push('What-if result must contain a changes array');
    return { valid: false, errors, changes: [], requiresModifyApproval: false };
  }

  const resourceGroupId =
    `/subscriptions/${catalog.azure.subscriptionId}` +
    `/resourceGroups/${catalog.azure.platformResourceGroup}`;
  const registryId =
    `${resourceGroupId}/providers/Microsoft.ContainerRegistry/registries/` +
    catalog.azure.containerRegistryName;
  const allowedResources = new Map([
    [normalizeResourceId(resourceGroupId), 'Microsoft.Resources/resourceGroups'],
    [normalizeResourceId(registryId), 'Microsoft.ContainerRegistry/registries'],
  ]);
  const normalizedChanges = [];
  let requiresModifyApproval = false;

  for (const change of changes) {
    const resourceId = change.resourceId;
    const changeType = change.changeType;

    if (typeof resourceId !== 'string' || !resourceId) {
      errors.push('Every what-if change must contain a resource ID');
      continue;
    }

    const expectedType = allowedResources.get(normalizeResourceId(resourceId));

    if (!expectedType) {
      errors.push(`What-if targets an unapproved resource: ${resourceId}`);
      continue;
    }

    if (!allowedChangeTypes.has(changeType)) {
      errors.push(`Unsupported what-if change type ${changeType ?? 'missing'} for ${resourceId}`);
      continue;
    }

    if (changeType === 'Modify') {
      requiresModifyApproval = true;

      if (!allowModify) {
        errors.push(`Modify requires explicit approval: ${resourceId}`);
      }
    }

    normalizedChanges.push({ resourceId, resourceType: expectedType, changeType });
  }

  return {
    valid: errors.length === 0,
    errors,
    changes: normalizedChanges,
    requiresModifyApproval,
  };
};

export const loadAndValidatePlatformWhatIf = async ({
  whatIfPath,
  catalogPath,
  allowModify = false,
}) => {
  const environmentResult = await loadAndValidateEnvironment(catalogPath);

  if (!environmentResult.valid) {
    return {
      valid: false,
      errors: ['Environment validation failed', ...environmentResult.errors],
      changes: [],
      requiresModifyApproval: false,
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
      requiresModifyApproval: false,
    };
  }

  return validatePlatformWhatIf({
    whatIfResult,
    catalog: environmentResult.catalog,
    allowModify,
  });
};

const main = async () => {
  const [whatIfPath, catalogPath, ...options] = process.argv.slice(2);

  if (!whatIfPath || !catalogPath || options.some((value) => value !== '--allow-modify')) {
    throw new Error(
      'Usage: validate-platform-what-if.mjs <what-if.json> <environment.json> [--allow-modify]',
    );
  }

  if (options.length > 1) {
    throw new Error('Duplicate --allow-modify option');
  }

  const result = await loadAndValidatePlatformWhatIf({
    whatIfPath,
    catalogPath,
    allowModify: options.includes('--allow-modify'),
  });

  if (!result.valid) {
    throw new Error(`Platform what-if validation failed:\n${result.errors.join('\n')}`);
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}