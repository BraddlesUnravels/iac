targetScope = 'subscription'

@description('Azure region.')
param location string

@description('Application resource group name.')
param resourceGroupName string

@description('Deployment environment name.')
@allowed([
  'production'
])
param environment string = 'production'

@description('Workload application id.')
param application string = 'qwik-website'

@description('Platform resource group containing the shared ACR.')
param platformResourceGroupName string

@description('Shared ACR name.')
param containerRegistryName string

@description('Exact container repository name for ABAC conditions.')
param containerRepositoryName string = 'qwik-website'

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string

@description('Container Apps environment name.')
param containerAppsEnvironmentName string

@description('Runtime pull identity name.')
param runtimeIdentityName string

@description('Publisher identity name.')
param publisherIdentityName string

@description('Planner identity name.')
param plannerIdentityName string

@description('Deployer identity name.')
param deployerIdentityName string

@description('GitHub subject for source image-publish environment OIDC.')
param publisherOidcSubject string

@description('GitHub subject for IaC production-plan environment OIDC.')
param plannerOidcSubject string

@description('GitHub subject for IaC production environment OIDC.')
param deployerOidcSubject string

@description('Extra tags.')
param additionalTags object = {}

var mandatoryTags = {
  application: application
  environment: environment
  managedBy: 'bicep'
}

var tags = union(additionalTags, mandatoryTags)

var repositoryReaderRoleId = 'b93aa761-3e63-49ed-ac28-beffa264f7ac'
var repositoryWriterRoleId = '2a1e307c-b015-4ebd-883e-5b7698a07328'

resource appResourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'qwik-foundation-resources'
  scope: appResourceGroup
  params: {
    location: location
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    containerAppsEnvironmentName: containerAppsEnvironmentName
    runtimeIdentityName: runtimeIdentityName
    publisherIdentityName: publisherIdentityName
    plannerIdentityName: plannerIdentityName
    deployerIdentityName: deployerIdentityName
    tags: tags
  }
}

module publisherOidc '../../modules/managed-identity/oidc-credential.bicep' = {
  name: 'publisher-oidc'
  scope: appResourceGroup
  params: {
    identityName: publisherIdentityName
    name: 'github-image-publish'
    subject: publisherOidcSubject
  }
  dependsOn: [
    resources
  ]
}

module plannerOidc '../../modules/managed-identity/oidc-credential.bicep' = {
  name: 'planner-oidc'
  scope: appResourceGroup
  params: {
    identityName: plannerIdentityName
    name: 'github-production-plan'
    subject: plannerOidcSubject
  }
  dependsOn: [
    resources
  ]
}

module deployerOidc '../../modules/managed-identity/oidc-credential.bicep' = {
  name: 'deployer-oidc'
  scope: appResourceGroup
  params: {
    identityName: deployerIdentityName
    name: 'github-production'
    subject: deployerOidcSubject
  }
  dependsOn: [
    resources
  ]
}

module pullReader '../../modules/role-assignment/acr-abac-repository.bicep' = {
  name: 'acr-pull-reader'
  scope: resourceGroup(platformResourceGroupName)
  params: {
    containerRegistryName: containerRegistryName
    principalId: resources.outputs.runtimeIdentityPrincipalId
    repositoryName: containerRepositoryName
    roleKind: 'Reader'
    roleDefinitionId: repositoryReaderRoleId
    nameSeed: 'qwik-pull'
  }
}

module plannerReader '../../modules/role-assignment/acr-abac-repository.bicep' = {
  name: 'acr-planner-reader'
  scope: resourceGroup(platformResourceGroupName)
  params: {
    containerRegistryName: containerRegistryName
    principalId: resources.outputs.plannerIdentityPrincipalId
    repositoryName: containerRepositoryName
    roleKind: 'Reader'
    roleDefinitionId: repositoryReaderRoleId
    nameSeed: 'qwik-planner'
  }
}

module publisherWriter '../../modules/role-assignment/acr-abac-repository.bicep' = {
  name: 'acr-publisher-writer'
  scope: resourceGroup(platformResourceGroupName)
  params: {
    containerRegistryName: containerRegistryName
    principalId: resources.outputs.publisherIdentityPrincipalId
    repositoryName: containerRepositoryName
    roleKind: 'Writer'
    roleDefinitionId: repositoryWriterRoleId
    nameSeed: 'qwik-publisher'
  }
}

// Deploy preflight/apply resolve images via az acr show + repository show.
module deployerRepoReader '../../modules/role-assignment/acr-abac-repository.bicep' = {
  name: 'acr-deployer-reader'
  scope: resourceGroup(platformResourceGroupName)
  params: {
    containerRegistryName: containerRegistryName
    principalId: resources.outputs.deployerIdentityPrincipalId
    repositoryName: containerRepositoryName
    roleKind: 'Reader'
    roleDefinitionId: repositoryReaderRoleId
    nameSeed: 'qwik-deployer'
  }
}

module plannerAcrReader '../../modules/role-assignment/acr-registry-reader.bicep' = {
  name: 'acr-planner-control-plane-reader'
  scope: resourceGroup(platformResourceGroupName)
  params: {
    containerRegistryName: containerRegistryName
    principalId: resources.outputs.plannerIdentityPrincipalId
    nameSeed: 'qwik-planner'
  }
}

module deployerAcrReader '../../modules/role-assignment/acr-registry-reader.bicep' = {
  name: 'acr-deployer-control-plane-reader'
  scope: resourceGroup(platformResourceGroupName)
  params: {
    containerRegistryName: containerRegistryName
    principalId: resources.outputs.deployerIdentityPrincipalId
    nameSeed: 'qwik-deployer'
  }
}

module workloadRoles '../../modules/role-assignment/workload-roles.bicep' = {
  name: 'workload-roles'
  scope: appResourceGroup
  params: {
    plannerPrincipalId: resources.outputs.plannerIdentityPrincipalId
    deployerPrincipalId: resources.outputs.deployerIdentityPrincipalId
    runtimeIdentityId: resources.outputs.runtimeIdentityId
  }
}

output resourceGroupId string = appResourceGroup.id
output resourceGroupName string = appResourceGroup.name
output containerAppsEnvironmentId string = resources.outputs.containerAppsEnvironmentId
output runtimeIdentityId string = resources.outputs.runtimeIdentityId
output runtimeIdentityClientId string = resources.outputs.runtimeIdentityClientId
output publisherIdentityClientId string = resources.outputs.publisherIdentityClientId
output plannerIdentityClientId string = resources.outputs.plannerIdentityClientId
output deployerIdentityClientId string = resources.outputs.deployerIdentityClientId
output logAnalyticsWorkspaceId string = resources.outputs.logAnalyticsWorkspaceId
