#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const entryPoints = [
  'platform/main.bicep',
  'stacks/next-supabase/main.bicep',
  'stacks/qwik-elysia-postgres/main.bicep',
  'stacks/single-container-web/main.bicep',
  'foundations/single-container-web/main.bicep',
  'modules/role-assignment/deployment-planner.bicep',
];

const diagnosticPattern =
  /:\s+(?:warning|error)\s+(?:[A-Z]{2,}[0-9]{3}|[a-z][a-z0-9-]+)\b/i;

const assertPlatformTemplate = (template) => {
  const resourceTypes = template.resources.map((resource) => resource.type);

  if (
    resourceTypes.length !== 2 ||
    resourceTypes[0] !== 'Microsoft.Resources/resourceGroups' ||
    resourceTypes[1] !== 'Microsoft.Resources/deployments'
  ) {
    throw new Error(
      'Platform template must contain exactly one resource group and one nested deployment',
    );
  }

  const nestedTemplate = template.resources[1].properties.template;
  const nestedResources = nestedTemplate?.resources ?? [];

  if (
    nestedResources.length !== 1 ||
    nestedResources[0].type !== 'Microsoft.ContainerRegistry/registries'
  ) {
    throw new Error('Platform nested deployment must contain exactly one ACR');
  }

  const registry = nestedResources[0];
  const expectedProperties = {
    adminUserEnabled: false,
    anonymousPullEnabled: false,
    dataEndpointEnabled: false,
    networkRuleBypassAllowedForTasks: false,
    publicNetworkAccess: 'Enabled',
    roleAssignmentMode: 'AbacRepositoryPermissions',
    zoneRedundancy: 'Disabled',
  };

  if (registry.apiVersion !== '2025-11-01') {
    throw new Error('Platform ACR must use API version 2025-11-01');
  }

  if (registry.sku?.name !== 'Basic') {
    throw new Error('Platform ACR SKU must be hard-coded to Basic');
  }

  if (registry.properties?.encryption?.status !== 'disabled') {
    throw new Error('Platform ACR encryption must use Microsoft-managed keys');
  }

  for (const [name, expectedValue] of Object.entries(expectedProperties)) {
    if (registry.properties?.[name] !== expectedValue) {
      throw new Error(`Platform ACR property ${name} must equal ${expectedValue}`);
    }
  }

  if (
    registry.properties?.policies?.azureADAuthenticationAsArmPolicy?.status !==
    'enabled'
  ) {
    throw new Error('Platform ACR ARM-audience authentication must be enabled');
  }

  const serializedTemplate = JSON.stringify(template);
  const forbiddenResourceTypes = [
    'Microsoft.App/',
    'Microsoft.Authorization/roleAssignments',
    'Microsoft.DBforPostgreSQL/',
    'Microsoft.KeyVault/',
    'Microsoft.ManagedIdentity/',
    'Microsoft.OperationalInsights/',
  ];

  for (const resourceType of forbiddenResourceTypes) {
    if (serializedTemplate.includes(resourceType)) {
      throw new Error(`Platform template contains forbidden resource type ${resourceType}`);
    }
  }

  if (/listCredentials/i.test(serializedTemplate)) {
    throw new Error('Platform template must not request ACR credentials');
  }

  const hasSecureParameter = Object.values(template.parameters ?? {}).some(
    (parameter) => ['secureObject', 'secureString'].includes(parameter.type),
  );

  if (hasSecureParameter) {
    throw new Error('Platform template must not accept secure values');
  }
};

const assertPlannerRole = (template) => {
  const plannerRole = template.resources.find(
    (resource) => resource.type === 'Microsoft.Authorization/roleDefinitions',
  );

  assert.ok(plannerRole, 'Foundation must define a planner what-if role');
  assert.equal(plannerRole.properties.type, 'CustomRole');
  assert.deepEqual(plannerRole.properties.assignableScopes, ['[resourceGroup().id]']);
  assert.deepEqual(plannerRole.properties.permissions, [{
    actions: [
      'Microsoft.Resources/deployments/read',
      'Microsoft.Resources/deployments/validate/action',
      'Microsoft.Resources/deployments/whatIf/action',
    ],
    notActions: [],
    dataActions: [],
    notDataActions: [],
  }], 'Planner role must allow planning only, with no write or data-plane permissions');

  const plannerAssignments = template.resources.filter(
    (resource) => resource.type === 'Microsoft.Authorization/roleAssignments'
      && resource.properties.principalId === "[parameters('plannerPrincipalId')]",
  );
  assert.equal(template.resources.length, 2, 'Planner repair must contain only a role and assignment');
  assert.equal(plannerAssignments.length, 1);
  const plannerRoleId = "[resourceId('Microsoft.Authorization/roleDefinitions', guid(resourceGroup().id, 'qwik-planner-what-if'))]";
  assert.equal(plannerRole.name, "[guid(resourceGroup().id, 'qwik-planner-what-if')]");
  assert.equal(
    plannerAssignments[0].name,
    "[guid(resourceGroup().id, parameters('plannerPrincipalId'), resourceId('Microsoft.Authorization/roleDefinitions', guid(resourceGroup().id, 'qwik-planner-what-if')), 'qwik-planner-what-if')]",
    'Planner assignment ID must remain compatible with existing foundation deployments',
  );
  assert.ok(plannerAssignments.some(
    (resource) => resource.properties.roleDefinitionId === "[subscriptionResourceId('Microsoft.Authorization/roleDefinitions', guid(resourceGroup().id, 'qwik-planner-what-if'))]"
      && resource.dependsOn?.includes(plannerRoleId)
      && resource.properties.principalType === 'ServicePrincipal'
      && resource.scope === undefined,
  ), 'Planner what-if role must be assigned at the workload resource group');
};

const assertFoundationPlannerRole = (template) => {
  const workloadTemplate = template.resources.find(
    (resource) => resource.name === 'workload-roles',
  ).properties.template;
  const plannerAssignments = workloadTemplate.resources.filter(
    (resource) => resource.type === 'Microsoft.Authorization/roleAssignments'
      && resource.properties.principalId === "[parameters('plannerPrincipalId')]",
  );
  assert.equal(plannerAssignments.length, 1, 'Planner must retain its Reader assignment');
  assert.equal(plannerAssignments[0].properties.roleDefinitionId, "[variables('readerRoleId')]");
  assert.equal(
    workloadTemplate.variables.readerRoleId,
    "[subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')]",
  );
  const plannerModule = workloadTemplate.resources.find(
    (resource) => resource.name === 'planner-what-if-role',
  );
  assert.equal(
    plannerModule.properties.parameters.plannerPrincipalId.value,
    "[parameters('plannerPrincipalId')]",
  );
  assertPlannerRole(plannerModule.properties.template);
};

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

  if (entryPoint === 'platform/main.bicep') {
    assertPlatformTemplate(JSON.parse(result.stdout));
  }

  if (entryPoint === 'foundations/single-container-web/main.bicep') {
    assertFoundationPlannerRole(JSON.parse(result.stdout));
  }

  if (entryPoint === 'modules/role-assignment/deployment-planner.bicep') {
    assertPlannerRole(JSON.parse(result.stdout));
  }

  console.log(`Validated Bicep entry point: ${entryPoint}`);
}