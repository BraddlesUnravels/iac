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

// Exact repository equality conditions (no StartsWith). A missing condition is a hard failure.
var readerCondition = '(([resource.type] == \'Microsoft.ContainerRegistry/registries/repositories\') && ([resource.name] == \'${repositoryName}\')) || (([resource.type] == \'Microsoft.ContainerRegistry/registries/repositories/metadata\') && ([resource.name] == \'${repositoryName}\'))'
var writerCondition = '(([resource.type] == \'Microsoft.ContainerRegistry/registries/repositories\') && ([resource.name] == \'${repositoryName}\')) || (([resource.type] == \'Microsoft.ContainerRegistry/registries/repositories/metadata\') && ([resource.name] == \'${repositoryName}\')) || (([resource.type] == \'Microsoft.ContainerRegistry/registries/repositories/content\') && ([resource.name] == \'${repositoryName}\'))'

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
