@description('Role definition id. Use built-in GUID or full resource id.')
param roleDefinitionId string

@description('Principal object id (managed identity or service principal).')
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

@description('Optional stable name seed for the role assignment guid.')
param nameSeed string = ''

var roleDefinitionResourceId = startsWith(roleDefinitionId, '/')
  ? roleDefinitionId
  : subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleDefinitionId)

var assignmentName = empty(nameSeed)
  ? guid(resourceGroup().id, principalId, roleDefinitionResourceId)
  : guid(resourceGroup().id, principalId, roleDefinitionResourceId, nameSeed)

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: assignmentName
  properties: {
    roleDefinitionId: roleDefinitionResourceId
    principalId: principalId
    principalType: principalType
  }
}

output id string = roleAssignment.id
output name string = roleAssignment.name
