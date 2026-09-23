@description('Existing ACR name in this resource group (platform RG scope).')
param containerRegistryName string

@description('Principal object id receiving ACR control-plane Reader.')
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

@description('Optional stable name seed.')
param nameSeed string = ''

// Reader
var readerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2025-04-01' existing = {
  name: containerRegistryName
}

var assignmentName = empty(nameSeed)
  ? guid(containerRegistry.id, principalId, readerRoleId, 'acr-control-plane-reader')
  : guid(containerRegistry.id, principalId, readerRoleId, 'acr-control-plane-reader', nameSeed)

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: assignmentName
  scope: containerRegistry
  properties: {
    roleDefinitionId: readerRoleId
    principalId: principalId
    principalType: principalType
  }
}

output id string = roleAssignment.id
output name string = roleAssignment.name
