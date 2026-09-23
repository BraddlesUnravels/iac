@description('Planner principal object id.')
param plannerPrincipalId string

@description('Deployer principal object id.')
param deployerPrincipalId string

@description('Pull identity resource id for Managed Identity Operator scope.')
param runtimeIdentityId string

// Reader
var readerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
// Contributor (RG-scoped deployer is an accepted simple initial setting)
var contributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
// Managed Identity Operator
var mioRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f1a07417-d97a-45cb-824c-7a7467783830')

resource plannerReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, plannerPrincipalId, readerRoleId, 'qwik-planner-reader')
  properties: {
    roleDefinitionId: readerRoleId
    principalId: plannerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource deployerContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployerPrincipalId, contributorRoleId, 'qwik-deployer-contributor')
  properties: {
    roleDefinitionId: contributorRoleId
    principalId: deployerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: last(split(runtimeIdentityId, '/'))
}

resource deployerMio 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(runtimeIdentity.id, deployerPrincipalId, mioRoleId, 'qwik-deployer-mio')
  scope: runtimeIdentity
  properties: {
    roleDefinitionId: mioRoleId
    principalId: deployerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output plannerReaderAssignmentId string = plannerReader.id
output deployerContributorAssignmentId string = deployerContributor.id
output deployerMioAssignmentId string = deployerMio.id
