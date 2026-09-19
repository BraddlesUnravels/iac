#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import { loadAndValidateEnvironment } from './validate-environment.mjs';

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;

const verifyImageAgainstCatalog = ({
  imageTag,
  imageDigest,
  callerSha,
  catalog,
  application,
  resolvedDigest,
}) => {
  const errors = [];
  const workload = catalog.workloads[application];

  if (!workload) {
    return { valid: false, errors: [`Unknown application: ${application}`] };
  }

  const escapedLoginServer = catalog.azure.containerRegistryLoginServer.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const escapedRepository = workload.containerRepository.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  const imagePattern = new RegExp(
    `^${escapedLoginServer}/${escapedRepository}:([0-9a-f]{40})$`,
  );
  const match = imagePattern.exec(imageTag);

  if (!match) {
    errors.push(
      `Image tag must match ${catalog.azure.containerRegistryLoginServer}/${workload.containerRepository}:<full-lowercase-git-sha>`,
    );
  }

  if (!shaPattern.test(callerSha)) {
    errors.push('Caller SHA must be 40 lowercase hexadecimal characters');
  } else if (match && match[1] !== callerSha) {
    errors.push('Image tag SHA must equal the caller SHA');
  }

  if (!digestPattern.test(imageDigest)) {
    errors.push('Image digest must be a lowercase sha256 digest');
  }

  if (!resolvedDigest) {
    errors.push('Resolved registry digest is required');
  } else if (!digestPattern.test(resolvedDigest)) {
    errors.push('Resolved registry digest must be a lowercase sha256 digest');
  } else if (resolvedDigest !== imageDigest) {
    errors.push('Resolved registry digest must equal the supplied image digest');
  }

  return {
    valid: errors.length === 0,
    errors,
    digestReference:
      errors.length === 0
        ? `${catalog.azure.containerRegistryLoginServer}/${workload.containerRepository}@${imageDigest}`
        : undefined,
  };
};

export const verifyImage = async ({ catalogPath, ...imageEvidence }) => {
  const environmentResult = await loadAndValidateEnvironment(catalogPath);

  if (!environmentResult.valid) {
    return {
      valid: false,
      errors: [
        'Environment validation failed',
        ...environmentResult.errors,
      ],
    };
  }

  return verifyImageAgainstCatalog({
    ...imageEvidence,
    catalog: environmentResult.catalog,
  });
};

const main = async () => {
  const [catalogPath, application, imageTag, imageDigest, callerSha, resolvedDigest] =
    process.argv.slice(2);

  if (
    !catalogPath ||
    !application ||
    !imageTag ||
    !imageDigest ||
    !callerSha ||
    !resolvedDigest
  ) {
    throw new Error(
      'Usage: verify-image.mjs <environment.json> <application> <image-tag> <image-digest> <caller-sha> <resolved-digest>',
    );
  }

  const result = await verifyImage({
    catalogPath,
    imageTag,
    imageDigest,
    callerSha,
    application,
    resolvedDigest,
  });

  if (!result.valid) {
    throw new Error(`Image validation failed:\n${result.errors.join('\n')}`);
  }

  console.log(result.digestReference);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}