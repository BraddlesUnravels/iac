#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { validateContract } from './validate-contract.mjs';
import { loadAndValidateEnvironment } from './validate-environment.mjs';
import { verifyImage } from './verify-image.mjs';

const ALLOWED_OPERATIONS = new Set(['what-if', 'apply']);

export const renderWorkloadParameters = ({
  contract,
  catalog,
  evidence,
  digestReference,
}) => {
  const workload = catalog.workloads[contract.application];

  const customDomainEnabled = contract.customDomain.enabled === true;
  const customDomainName = customDomainEnabled
    ? workload.customDomainName
    : '';
  const customDomainCertificateId = customDomainEnabled
    ? workload.certificateResourceId
    : '';

  return {
    $schema:
      'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
    contentVersion: '*******',
    parameters: {
      location: { value: catalog.azure.location },
      containerAppName: { value: workload.containerAppName },
      containerAppsEnvironmentName: {
        value: workload.containerAppsEnvironmentName,
      },
      runtimeIdentityName: { value: workload.runtimeIdentityName },
      registryLoginServer: {
        value: catalog.azure.containerRegistryLoginServer,
      },
      imageDigestReference: { value: digestReference },
      targetPort: { value: contract.container.targetPort },
      healthProbePath: { value: contract.container.healthProbePath },
      cpu: { value: contract.container.cpu },
      memory: { value: contract.container.memory },
      minReplicas: { value: contract.container.minReplicas },
      maxReplicas: { value: contract.container.maxReplicas },
      nonsecretEnvVars: {
        value: Object.entries(contract.env).map(([name, value]) => ({
          name,
          value,
        })),
      },
      application: { value: contract.application },
      environment: { value: contract.environment },
      customDomainName: { value: customDomainName ?? '' },
      customDomainCertificateId: { value: customDomainCertificateId ?? '' },
    },
    metadata: {
      sourceCommitSha: evidence.sourceCommitSha,
      releaseId: evidence.releaseId,
      imageDigest: evidence.imageDigest,
    },
  };
};

export const buildWorkloadParameters = async ({
  contractPath,
  catalogPath,
  evidence,
  resolvedDigest,
  operation,
}) => {
  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw new Error('operation must be what-if or apply');
  }

  if (!evidence || typeof evidence !== 'object') {
    throw new Error('Verified release evidence is required');
  }

  const environmentResult = await loadAndValidateEnvironment(catalogPath);

  if (!environmentResult.valid) {
    throw new Error(
      `Environment validation failed:\n${environmentResult.errors.join('\n')}`,
    );
  }

  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  const contractResult = await validateContract(
    contract,
    environmentResult.catalog,
    {
      callerRepository: evidence.sourceRepository,
      callerRepositoryId: evidence.sourceRepositoryId,
      callerRepositoryOwnerId: evidence.sourceRepositoryOwnerId,
    },
  );

  if (!contractResult.valid) {
    throw new Error(
      `Contract validation failed:\n${contractResult.errors.join('\n')}`,
    );
  }

  const imageResult = await verifyImage({
    catalogPath,
    application: contract.application,
    imageTag: evidence.imageTag,
    imageDigest: evidence.imageDigest,
    sourceCommitSha: evidence.sourceCommitSha,
    resolvedDigest,
  });

  if (!imageResult.valid) {
    throw new Error(
      `Image validation failed:\n${imageResult.errors.join('\n')}`,
    );
  }

  return renderWorkloadParameters({
    contract,
    catalog: environmentResult.catalog,
    evidence,
    digestReference: imageResult.digestReference,
  });
};

const main = async () => {
  const [contractPath, catalogPath, evidencePath, resolvedDigest, operation] =
    process.argv.slice(2);

  if (
    !contractPath ||
    !catalogPath ||
    !evidencePath ||
    !resolvedDigest ||
    !operation
  ) {
    throw new Error(
      'Usage: render-workload-parameters.mjs <workload.json> <environment.json> <evidence.json> <resolved-digest> <what-if|apply>',
    );
  }

  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const parameters = await buildWorkloadParameters({
    contractPath,
    catalogPath,
    evidence,
    resolvedDigest,
    operation,
  });

  process.stdout.write(`${JSON.stringify(parameters)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
