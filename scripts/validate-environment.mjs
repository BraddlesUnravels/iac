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

    const certificatePrefix =
      `/subscriptions/${catalog.azure.subscriptionId}` +
      `/resourceGroups/${workload.resourceGroup}` +
      '/providers/Microsoft.App/managedEnvironments/' +
      `${workload.containerAppsEnvironmentName}/`;

    if (
      !workload.certificateResourceId
        .toLowerCase()
        .startsWith(certificatePrefix.toLowerCase())
    ) {
      errors.push(
        `${path}.certificateResourceId must belong to the approved subscription, resource group, and Container Apps environment`,
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