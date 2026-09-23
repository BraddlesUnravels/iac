#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadAndValidateEnvironment } from './validate-environment.mjs';

const REQUIRED_PAYLOAD_KEYS = [
  'schemaVersion',
  'application',
  'environment',
  'sourceRepository',
  'sourceRepositoryId',
  'releaseId',
  'releaseTag',
  'sourceCommitSha',
  'imageTag',
  'imageDigest',
  'sourceRunId',
];

const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const releaseTagPattern = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const positiveDecimalPattern = /^[1-9][0-9]*$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const unsafePattern = /[<>`$\\]|https?:\/\//i;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const defaultFetchJson = async (url, { headers } = {}) => {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub API request failed (${response.status}) for ${url}: ${body.slice(0, 200)}`,
    );
  }

  return response.json();
};

const rejectField = (errors, condition, message) => {
  if (condition) {
    errors.push(message);
  }
};

export const verifyRelease = async ({
  payload,
  catalog,
  githubClient = defaultFetchJson,
  githubToken,
  iacRepository,
  iacRepositoryId,
}) => {
  const errors = [];

  if (!isPlainObject(payload)) {
    return { valid: false, errors: ['Release payload must be a JSON object'] };
  }

  const keys = Object.keys(payload).sort();
  const expectedKeys = [...REQUIRED_PAYLOAD_KEYS].sort();

  if (keys.join(',') !== expectedKeys.join(',')) {
    errors.push(
      `Payload keys must exactly equal: ${REQUIRED_PAYLOAD_KEYS.join(', ')}`,
    );
  }

  for (const key of REQUIRED_PAYLOAD_KEYS) {
    if (!(key in payload)) {
      errors.push(`Missing payload field: ${key}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  rejectField(errors, payload.schemaVersion !== 1, 'schemaVersion must equal 1');
  rejectField(
    errors,
    typeof payload.application !== 'string' || !payload.application,
    'application must be a non-empty string',
  );
  rejectField(
    errors,
    payload.environment !== 'production',
    'environment must equal production',
  );
  rejectField(
    errors,
    typeof payload.sourceRepository !== 'string' ||
      !repositoryPattern.test(payload.sourceRepository),
    'sourceRepository must be owner/repo',
  );
  rejectField(
    errors,
    !positiveDecimalPattern.test(String(payload.sourceRepositoryId)),
    'sourceRepositoryId must be a positive decimal string',
  );
  rejectField(
    errors,
    !positiveDecimalPattern.test(String(payload.releaseId)),
    'releaseId must be a positive decimal string',
  );
  rejectField(
    errors,
    !positiveDecimalPattern.test(String(payload.sourceRunId)),
    'sourceRunId must be a positive decimal string',
  );
  rejectField(
    errors,
    !releaseTagPattern.test(payload.releaseTag),
    'releaseTag must match vMAJOR.MINOR.PATCH',
  );
  rejectField(
    errors,
    !shaPattern.test(payload.sourceCommitSha),
    'sourceCommitSha must be 40 lowercase hex characters',
  );
  rejectField(
    errors,
    !digestPattern.test(payload.imageDigest),
    'imageDigest must be a lowercase sha256 digest',
  );
  rejectField(
    errors,
    typeof payload.imageTag !== 'string' || payload.imageTag.length === 0,
    'imageTag must be a non-empty string',
  );

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' && unsafePattern.test(value) && key !== 'imageTag') {
      // imageTag contains registry host; still reject shell-like content
      if (/[<>`$\\]/.test(value)) {
        errors.push(`Payload field ${key} contains unsafe characters`);
      }
    } else if (typeof value === 'string' && /[<>`$\\]/.test(value)) {
      errors.push(`Payload field ${key} contains unsafe characters`);
    }
  }

  const workload = catalog.workloads[payload.application];

  if (!workload) {
    errors.push(`Unknown application: ${payload.application}`);
    return { valid: false, errors };
  }

  if (payload.environment !== catalog.name) {
    errors.push('Payload environment does not match catalog');
  }

  if (payload.sourceRepository !== workload.repository) {
    errors.push(`sourceRepository must equal ${workload.repository}`);
  }

  if (String(payload.sourceRepositoryId) !== workload.repositoryId) {
    errors.push(`sourceRepositoryId must equal ${workload.repositoryId}`);
  }

  const expectedImagePrefix = `${catalog.azure.containerRegistryLoginServer}/${workload.containerRepository}:`;
  if (
    payload.imageTag !==
    `${expectedImagePrefix}${payload.sourceCommitSha}`
  ) {
    errors.push(
      `imageTag must equal ${expectedImagePrefix}<sourceCommitSha>`,
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'braddlesunravels-iac-verify-release',
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  let repository;
  let release;
  let tagCommitSha;

  try {
    repository = await githubClient(
      `https://api.github.com/repos/${workload.repository}`,
      { headers },
    );
    release = await githubClient(
      `https://api.github.com/repos/${workload.repository}/releases/${payload.releaseId}`,
      { headers },
    );

    const ref = await githubClient(
      `https://api.github.com/repos/${workload.repository}/git/ref/tags/${encodeURIComponent(payload.releaseTag)}`,
      { headers },
    );

    if (ref.object?.type === 'commit') {
      tagCommitSha = ref.object.sha;
    } else if (ref.object?.type === 'tag') {
      const tagObject = await githubClient(ref.object.url, { headers });
      tagCommitSha = tagObject.object?.sha;
    } else {
      errors.push('Release tag does not resolve to a commit');
    }
  } catch (error) {
    return {
      valid: false,
      errors: [
        ...errors,
        `Independent GitHub verification failed: ${error.message}`,
      ],
    };
  }

  if (String(repository.id) !== workload.repositoryId) {
    errors.push('GitHub repository immutable ID does not match catalog');
  }

  if (String(repository.owner?.id) !== workload.repositoryOwnerId) {
    errors.push('GitHub repository owner ID does not match catalog');
  }

  const fullName = repository.full_name;
  if (
    typeof fullName !== 'string' ||
    fullName.toLowerCase() !== workload.repository.toLowerCase()
  ) {
    errors.push('GitHub repository full_name does not match catalog');
  }

  if (release.draft === true) {
    errors.push('Release is a draft');
  }

  if (release.prerelease === true) {
    errors.push('Release is a prerelease');
  }

  if (!release.published_at) {
    errors.push('Release is not published');
  }

  if (release.tag_name !== payload.releaseTag) {
    errors.push('Release tag_name does not match payload releaseTag');
  }

  if (!shaPattern.test(String(tagCommitSha ?? ''))) {
    errors.push('Peeled tag commit SHA is missing or malformed');
  } else if (tagCommitSha !== payload.sourceCommitSha) {
    errors.push('Release tag commit does not match sourceCommitSha');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const evidence = {
    application: payload.application,
    environment: payload.environment,
    sourceRepository: workload.repository,
    sourceRepositoryId: workload.repositoryId,
    sourceRepositoryOwnerId: workload.repositoryOwnerId,
    releaseId: String(payload.releaseId),
    releaseTag: payload.releaseTag,
    releasePublishedAt: release.published_at,
    releaseHtmlUrl: release.html_url,
    sourceCommitSha: payload.sourceCommitSha,
    imageTag: payload.imageTag,
    imageDigest: payload.imageDigest,
    sourceRunId: String(payload.sourceRunId),
    releaseIdentityKey: `${payload.application}:${payload.releaseId}:${payload.sourceCommitSha}:${payload.imageDigest}`,
    iacRepository: iacRepository ?? null,
    iacRepositoryId: iacRepositoryId ?? null,
  };

  return { valid: true, errors: [], evidence };
};

export const loadAndVerifyRelease = async ({
  payloadPath,
  catalogPath,
  githubClient,
  githubToken,
  iacRepository,
  iacRepositoryId,
}) => {
  const environmentResult = await loadAndValidateEnvironment(catalogPath);

  if (!environmentResult.valid) {
    return {
      valid: false,
      errors: ['Environment validation failed', ...environmentResult.errors],
    };
  }

  let payload;

  try {
    payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  } catch (error) {
    return {
      valid: false,
      errors: [`Unable to parse release payload JSON: ${error.message}`],
    };
  }

  return verifyRelease({
    payload,
    catalog: environmentResult.catalog,
    githubClient,
    githubToken,
    iacRepository,
    iacRepositoryId,
  });
};

const main = async () => {
  const [payloadPath, catalogPath] = process.argv.slice(2);

  if (!payloadPath || !catalogPath) {
    throw new Error(
      'Usage: verify-release.mjs <client-payload.json> <environment.json>',
    );
  }

  const result = await loadAndVerifyRelease({
    payloadPath,
    catalogPath,
    githubToken: process.env.SOURCE_GITHUB_TOKEN,
    iacRepository: process.env.IAC_REPOSITORY,
    iacRepositoryId: process.env.IAC_REPOSITORY_ID,
  });

  if (!result.valid) {
    throw new Error(`Release verification failed:\n${result.errors.join('\n')}`);
  }

  process.stdout.write(`${JSON.stringify(result.evidence)}\n`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
