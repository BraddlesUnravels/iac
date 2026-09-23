#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import { loadAndValidateEnvironment } from './validate-environment.mjs';

const schemaUrl = new URL('../schemas/workload.schema.json', import.meta.url);

const productionStackPolicies = {
  'access-control-demo': {
    environment: {
      ACCESS_GATE_DISABLED: 'false',
      HOSTNAME: '0.0.0.0',
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_ENV: 'production',
      PORT: '3000',
    },
  },
};

const formatAjvErrors = (errors = []) =>
  errors.map(({ instancePath, message, params }) => {
    const location = instancePath || '/';
    const detail = params?.additionalProperty
      ? `: ${params.additionalProperty}`
      : '';

    return `${location} ${message}${detail}`;
  });

const createValidator = async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true });

  return ajv.compile(schema);
};

const setsEqual = (left, right) =>
  left.size === right.size && [...left].every((value) => right.has(value));

const findCaseConflicts = (names) => {
  const originalByNormalizedName = new Map();
  const conflicts = [];

  for (const name of names) {
    const normalizedName = name.toUpperCase();
    const existingName = originalByNormalizedName.get(normalizedName);

    if (existingName && existingName !== name) {
      conflicts.push(`${existingName} and ${name}`);
    } else {
      originalByNormalizedName.set(normalizedName, name);
    }
  }

  return conflicts;
};

export const validateContract = async (
  contract,
  catalog,
  {
    callerRepository,
    callerRepositoryId,
    callerRepositoryOwnerId,
  } = {},
) => {
  const validateSchema = await createValidator();

  if (!validateSchema(contract)) {
    return { valid: false, errors: formatAjvErrors(validateSchema.errors) };
  }

  const errors = [];
  const workload = catalog.workloads[contract.application];

  if (!callerRepository) {
    errors.push('Caller repository is required');
  }

  if (!callerRepositoryId) {
    errors.push('Caller repository ID is required');
  }

  if (!callerRepositoryOwnerId) {
    errors.push('Caller repository owner ID is required');
  }

  if (!workload) {
    return {
      valid: false,
      errors: [...errors, `Unknown application: ${contract.application}`],
    };
  }

  if (contract.environment !== catalog.name) {
    errors.push(
      `Contract environment ${contract.environment} does not match catalog ${catalog.name}`,
    );
  }

  if (contract.stack !== workload.stack) {
    errors.push(`Stack ${contract.stack} is not approved for ${contract.application}`);
  }

  if (
    contract.environment === 'production' &&
    !productionStackPolicies[contract.stack]
  ) {
    errors.push(`Stack ${contract.stack} is not supported in production`);
  }

  if (callerRepository && callerRepository !== workload.repository) {
    errors.push(`Caller repository must equal ${workload.repository}`);
  }

  if (callerRepositoryId && callerRepositoryId !== workload.repositoryId) {
    errors.push(`Caller repository ID must equal ${workload.repositoryId}`);
  }

  if (
    callerRepositoryOwnerId &&
    callerRepositoryOwnerId !== workload.repositoryOwnerId
  ) {
    errors.push(`Caller repository owner ID must equal ${workload.repositoryOwnerId}`);
  }

  const policy = productionStackPolicies[contract.stack];

  if (contract.environment === 'production' && policy) {
    const requestedNames = new Set(Object.keys(contract.env));
    const approvedNames = new Set(Object.keys(policy.environment));

    if (!setsEqual(requestedNames, approvedNames)) {
      errors.push(
        `Environment variables must exactly match: ${[...approvedNames].sort().join(', ')}`,
      );
    }

    for (const [name, expectedValue] of Object.entries(policy.environment)) {
      if (contract.env[name] !== expectedValue) {
        errors.push(`${name} must equal ${expectedValue}`);
      }
    }
  }

  const requestedSecretNames = new Set(Object.values(contract.secretRefs));
  const approvedSecretNames = new Set(workload.allowedSecretNames);

  if (!setsEqual(requestedSecretNames, approvedSecretNames)) {
    errors.push(
      `Secret references must exactly match: ${[...approvedSecretNames].sort().join(', ')}`,
    );
  }

  const allEnvironmentNames = [
    ...Object.keys(contract.env),
    ...Object.keys(contract.secretRefs),
    ...workload.externalEnvironmentVariables,
  ];
  const duplicateNames = allEnvironmentNames.filter(
    (name, index) => allEnvironmentNames.indexOf(name) !== index,
  );

  if (duplicateNames.length > 0) {
    errors.push(
      `Environment variable names must be unique: ${[...new Set(duplicateNames)].join(', ')}`,
    );
  }

  for (const conflict of findCaseConflicts(allEnvironmentNames)) {
    errors.push(`Environment variable names conflict by case: ${conflict}`);
  }

  const { container } = contract;
  const { bounds } = workload;

  if (!bounds.targetPorts.includes(container.targetPort)) {
    errors.push(`Target port ${container.targetPort} is not approved`);
  }

  if (!bounds.healthProbePaths.includes(container.healthProbePath)) {
    errors.push(`Health probe path ${container.healthProbePath} is not approved`);
  }

  if (!bounds.cpu.includes(container.cpu)) {
    errors.push(`CPU ${container.cpu} is not approved`);
  }

  if (!bounds.memory.includes(container.memory)) {
    errors.push(`Memory ${container.memory} is not approved`);
  }

  if (
    container.minReplicas < bounds.minReplicas.minimum ||
    container.minReplicas > bounds.minReplicas.maximum
  ) {
    errors.push(`Minimum replicas ${container.minReplicas} is outside approved bounds`);
  }

  if (
    container.maxReplicas < bounds.maxReplicas.minimum ||
    container.maxReplicas > bounds.maxReplicas.maximum
  ) {
    errors.push(`Maximum replicas ${container.maxReplicas} is outside approved bounds`);
  }

  if (container.minReplicas > container.maxReplicas) {
    errors.push('Minimum replicas must not exceed maximum replicas');
  }

  const catalogHasCustomDomain =
    workload.customDomainName !== null && workload.certificateResourceId !== null;

  if (contract.customDomain.enabled !== catalogHasCustomDomain) {
    errors.push('Custom-domain intent does not match the environment catalog');
  }

  return { valid: errors.length === 0, errors };
};

const allowedOptions = new Set([
  'caller-repository',
  'caller-repository-id',
  'caller-repository-owner-id',
]);

export const parseOptions = (args) => {
  if (args.length % 2 !== 0) {
    throw new Error('Every option must have a non-empty value');
  }

  const options = {};

  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];

    if (!name?.startsWith('--')) {
      throw new Error(`Invalid option: ${name ?? ''}`);
    }

    const optionName = name.slice(2);

    if (!allowedOptions.has(optionName)) {
      throw new Error(`Unknown option: ${name}`);
    }

    if (Object.hasOwn(options, optionName)) {
      throw new Error(`Duplicate option: ${name}`);
    }

    if (!value?.trim() || value.startsWith('--')) {
      throw new Error(`Option requires a non-empty value: ${name}`);
    }

    options[optionName] = value;
  }

  return options;
};

const main = async () => {
  const [contractPath, catalogPath, ...optionArgs] = process.argv.slice(2);

  if (!contractPath || !catalogPath) {
    throw new Error(
      'Usage: validate-contract.mjs <workload.json> <environment.json> --caller-repository owner/repo --caller-repository-id id --caller-repository-owner-id id',
    );
  }

  const options = parseOptions(optionArgs);
  const environmentResult = await loadAndValidateEnvironment(catalogPath);

  if (!environmentResult.valid) {
    throw new Error(
      `Environment validation failed:\n${environmentResult.errors.join('\n')}`,
    );
  }

  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  const result = await validateContract(contract, environmentResult.catalog, {
    callerRepository: options['caller-repository'],
    callerRepositoryId: options['caller-repository-id'],
    callerRepositoryOwnerId: options['caller-repository-owner-id'],
  });

  if (!result.valid) {
    throw new Error(`Contract validation failed:\n${result.errors.join('\n')}`);
  }

  console.log(`Validated workload contract: ${contractPath}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}