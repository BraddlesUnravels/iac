#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const entryPoints = [
  'platform/main.bicep',
  'stacks/next-supabase/main.bicep',
  'stacks/qwik-elysia-postgres/main.bicep',
];

const diagnosticPattern =
  /:\s+(?:warning|error)\s+(?:[A-Z]{2,}[0-9]{3}|[a-z][a-z0-9-]+)\b/i;

for (const entryPoint of entryPoints) {
  const result = spawnSync(
    'az',
    ['bicep', 'build', '--file', entryPoint, '--stdout'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  const diagnostics = `${result.stderr ?? ''}${result.stdout ?? ''}`;

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 || diagnosticPattern.test(diagnostics)) {
    process.stderr.write(diagnostics);
    throw new Error(`Bicep validation failed for ${entryPoint}`);
  }

  console.log(`Validated Bicep entry point: ${entryPoint}`);
}