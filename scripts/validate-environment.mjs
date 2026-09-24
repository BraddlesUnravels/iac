#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schemaUrl = new URL('../schemas/environment.schema.json', import.meta.url);

const formatAjvErrors = (errors = []) =>
  errors
    .map(({ instancePath, message, params }) => {
      const location = instancePath || '/';
      const detail = params?.additionalProperty
        ? `: ${params.additionalProperty}`
        : '';

      return `${location} ${message}${detail}`;
    })
    .join('\n');

const createValidator = async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });

  addFormats(ajv);

  return ajv.compile(schema);
};

const validateRange = (range, path, errors) => {
  if (range.minimum > range.maximum) {
    errors.push(`${path}.minimum must not exceed ${path}.maximum`);
  }
};

const trackUnique = (map, key, owner, label, errors) => {
  if (!key) {
    return;
  }

  const existing = map.get(key);

  if (existing && existing !== owner) {
    errors.push(
      `Duplicate ${label} "${key}" shared by workloads ${existing} and ${owner}`,
    );
    return;
  }

  map.set(key, owner);
};

export const validateEnvironment = async (catalog) => {
  const validateSchema = await createValidator();

  if (!validateSchema(catalog)) {
    return {
      valid: false,
      errors: formatAjvErrors(validateSchema.errors).split('\n'),
    };
  }

  const errors = [];
  const expectedLoginServer = `${catalog.azure.containerRegistryName}.azurecr.io`;

  if (
    catalog.azure.containerRegistryLoginServer.toLowerCase() !==
    expectedLoginServer.toLowerCase()
  ) {
    errors.push(
      `azure.containerRegistryLoginServer must equal ${expectedLoginServer}`,
    );
  }

  const resourceGroups = new Map();
  const containerAppNames = new Map();
  const containerRepositories = new Map();
  const identityNames = new Map();
  const environmentNames = new Map();
  const workspaceNames = new Map();

  for (const [application, workload] of Object.entries(catalog.workloads)) {
    const path = `workloads.${application}`;

    validateRange(workload.bounds.minReplicas, `${path}.bounds.minReplicas`, errors);
    validateRange(workload.bounds.maxReplicas, `${path}.bounds.maxReplicas`, errors);

    if (
      workload.bounds.minReplicas.minimum >
      workload.bounds.maxReplicas.maximum
    ) {
      errors.push(
        `${path}.bounds.minReplicas.minimum must not exceed maxReplicas.maximum`,
      );
    }

    if (
      workload.bounds.minReplicas.maximum >
      workload.bounds.maxReplicas.maximum
    ) {
      errors.push(
        `${path}.bounds.minReplicas.maximum must not exceed maxReplicas.maximum`,
      );
    }

    if (
      workload.resourceGroup.toLowerCase() ===
      catalog.azure.platformResourceGroup.toLowerCase()
    ) {
      errors.push(
        `${path}.resourceGroup must not target the shared platform resource group`,
      );
    }

    if (workload.containerRepository.length > 256) {
      errors.push(`${path}.containerRepository exceeds ACR repository name limits`);
    }

    const certificatePrefix =
      `/subscriptions/${catalog.azure.subscriptionId}` +
      `/resourceGroups/${workload.resourceGroup}` +
      '/providers/Microsoft.App/managedEnvironments/' +
      `${workload.containerAppsEnvironmentName}/`;

    const hasCustomDomain = workload.customDomainName !== null;
    const hasCertificate = workload.certificateResourceId !== null;

    if (hasCustomDomain !== hasCertificate) {
      errors.push(
        `${path}.customDomainName and certificateResourceId must both be set or both be null`,
      );
    }

    if (
      hasCertificate &&
      !workload.certificateResourceId
        .toLowerCase()
        .startsWith(certificatePrefix.toLowerCase())
    ) {
      errors.push(
        `${path}.certificateResourceId must belong to the approved subscription, resource group, and Container Apps environment`,
      );
    }

    const additionalCustomDomains = workload.additionalCustomDomains ?? [];

    if (additionalCustomDomains.length > 0 && !hasCustomDomain) {
      errors.push(
        `${path}.additionalCustomDomains requires customDomainName and certificateResourceId`,
      );
    }

    const domainNames = new Set(
      hasCustomDomain ? [workload.customDomainName.toLowerCase()] : [],
    );

    for (const [index, domain] of additionalCustomDomains.entries()) {
      const domainPath = `${path}.additionalCustomDomains[${index}]`;
      const domainName = String(domain.name ?? '').toLowerCase();

      if (!domainName) {
        errors.push(`${domainPath}.name is required`);
        continue;
      }

      if (domainNames.has(domainName)) {
        errors.push(`${domainPath}.name duplicates another custom domain`);
      }

      domainNames.add(domainName);

      if (
        !String(domain.certificateResourceId ?? '')
          .toLowerCase()
          .startsWith(certificatePrefix.toLowerCase())
      ) {
        errors.push(
          `${domainPath}.certificateResourceId must belong to the approved subscription, resource group, and Container Apps environment`,
        );
      }
    }

    if (
      (workload.allowedSecretNames.length > 0 ||
        workload.migrationSecretNames.length > 0) &&
      workload.keyVaultName === null
    ) {
      errors.push(`${path}.keyVaultName is required when secret names are configured`);
    }

    trackUnique(
      resourceGroups,
      workload.resourceGroup.toLowerCase(),
      application,
      'resource group',
      errors,
    );
    trackUnique(
      containerAppNames,
      `${workload.resourceGroup.toLowerCase()}/${workload.containerAppName.toLowerCase()}`,
      application,
      'container app target',
      errors,
    );
    trackUnique(
      containerRepositories,
      workload.containerRepository.toLowerCase(),
      application,
      'container repository',
      errors,
    );
    trackUnique(
      environmentNames,
      workload.containerAppsEnvironmentName.toLowerCase(),
      application,
      'container apps environment name',
      errors,
    );
    trackUnique(
      workspaceNames,
      workload.logAnalyticsWorkspaceName.toLowerCase(),
      application,
      'log analytics workspace name',
      errors,
    );

    for (const identityField of [
      'runtimeIdentityName',
      'publisherIdentityName',
      'plannerIdentityName',
      'deployerIdentityName',
    ]) {
      trackUnique(
        identityNames,
        workload[identityField].toLowerCase(),
        application,
        identityField,
        errors,
      );
    }
  }

  return { valid: errors.length === 0, errors };
};

export const loadAndValidateEnvironment = async (catalogPath) => {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const result = await validateEnvironment(catalog);

  return { catalog, ...result };
};

const main = async () => {
  const [catalogPath] = process.argv.slice(2);

  if (!catalogPath) {
    throw new Error('Usage: validate-environment.mjs <environment.json>');
  }

  const result = await loadAndValidateEnvironment(catalogPath);

  if (!result.valid) {
    throw new Error(`Environment validation failed:\n${result.errors.join('\n')}`);
  }

  console.log(`Validated environment catalog: ${catalogPath}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
