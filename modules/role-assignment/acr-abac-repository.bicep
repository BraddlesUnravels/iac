@description('Existing ACR name in this resource group (platform RG scope).')
param containerRegistryName string

@description('Principal object id receiving the repository-scoped role.')
param principalId string

@description('Principal type.')
@allowed([
  'Device'
  'ForeignGroup'
  'Group'
  'ServicePrincipal'
  'User'
])
param principalType string = 'ServicePrincipal'

@description('Exact ACR repository name protected by the ABAC condition.')
param repositoryName string

@description('Repository data-plane role kind.')
@allowed([
  'Reader'
  'Writer'
])
param roleKind string

@description('Built-in role definition GUID for Reader or Writer repository roles.')
param roleDefinitionId string

@description('Optional stable name seed.')
param nameSeed string = ''

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: containerRegistryName
}

// Official Azure ABAC condition format for ACR repository scope.
// https://learn.microsoft.com/en-us/azure/container-registry/container-registry-rbac-abac-repository-permissions
var readerCondition = '((!(ActionMatches{\'Microsoft.ContainerRegistry/registries/repositories/content/read\'}) AND !(ActionMatches{\'Microsoft.ContainerRegistry/registries/repositories/metadata/read\'})) OR (@Request[Microsoft.ContainerRegistry/registries/repositories:name] StringEqualsIgnoreCase \'${repositoryName}\'))'
var writerCondition = '((!(ActionMatches{\'Microsoft.ContainerRegistry/registries/repositories/content/read\'}) AND !(ActionMatches{\'Microsoft.ContainerRegistry/registries/repositories/content/write\'}) AND !(ActionMatches{\'Microsoft.ContainerRegistry/registries/repositories/metadata/read\'}) AND !(ActionMatches{\'Microsoft.ContainerRegistry/registries/repositories/metadata/write\'})) OR (@Request[Microsoft.ContainerRegistry/registries/repositories:name] StringEqualsIgnoreCase \'${repositoryName}\'))'

var condition = roleKind == 'Writer' ? writerCondition : readerCondition

var assignmentName = empty(nameSeed)
  ? guid(containerRegistry.id, principalId, roleDefinitionId, repositoryName, roleKind)
  : guid(containerRegistry.id, principalId, roleDefinitionId, repositoryName, roleKind, nameSeed)

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: assignmentName
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)
    principalId: principalId
    principalType: principalType
    condition: condition
    conditionVersion: '2.0'
  }
}

output id string = roleAssignment.id
output name string = roleAssignment.name
output condition string = condition
output roleDefinitionId string = roleDefinitionId
