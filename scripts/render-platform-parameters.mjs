#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { loadAndValidateEnvironment } from './validate-environment.mjs';

export const renderPlatformParameters = (catalog) => ({
  $schema:
    'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
  contentVersion: '1.0.0.0',
  parameters: {
    location: { value: catalog.azure.location },
    resourceGroupName: { value: catalog.azure.platformResourceGroup },
    containerRegistryName: { value: catalog.azure.containerRegistryName },
    environment: { value: catalog.name },
    additionalTags: { value: {} },
  },
});

const main = async () => {
  const [catalogPath, ...unexpectedArguments] = process.argv.slice(2);

  if (!catalogPath || unexpectedArguments.length > 0) {
    throw new Error(
      'Usage: render-platform-parameters.mjs <environment-catalog.json>',
    );
  }

  const result = await loadAndValidateEnvironment(catalogPath);

  if (!result.valid) {
    throw new Error(`Environment validation failed:\n${result.errors.join('\n')}`);
  }

  process.stdout.write(`${JSON.stringify(renderPlatformParameters(result.catalog))}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}