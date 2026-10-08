@description('Planner principal object id.')
param plannerPrincipalId string

@description('Deployer principal object id.')
param deployerPrincipalId string

@description('Pull identity resource id for Managed Identity Operator scope.')
param runtimeIdentityId string

// Reader
var readerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
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

module plannerWhatIf 'deployment-planner.bicep' = {
  name: 'planner-what-if-role'
  params: {
    plannerPrincipalId: plannerPrincipalId
  }
}

// Least-privilege deployer for shared platform RG: Container App release only.
// Never Contributor — platform RG also hosts ACR and shared Key Vault.
resource deployerRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'qwik-container-app-deployer')
  properties: {
    roleName: '${resourceGroup().name} container app deployer'
    description: 'Deploy and update Container Apps release surface without ACR, Key Vault, or IAM write.'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          'Microsoft.Resources/deployments/read'
          'Microsoft.Resources/deployments/write'
          'Microsoft.Resources/deployments/validate/action'
          'Microsoft.Resources/deployments/whatIf/action'
          'Microsoft.Resources/deployments/operations/read'
          'Microsoft.Resources/deployments/operationStatuses/read'
          'Microsoft.Resources/subscriptions/resourcegroups/read'
          'Microsoft.App/containerApps/read'
          'Microsoft.App/containerApps/write'
          'Microsoft.App/managedEnvironments/read'
          'Microsoft.App/managedEnvironments/join/action'
          'Microsoft.ManagedIdentity/userAssignedIdentities/read'
          'Microsoft.OperationalInsights/workspaces/read'
          'Microsoft.Authorization/roleAssignments/read'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
    assignableScopes: [
      resourceGroup().id
    ]
  }
}

resource deployerAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, deployerPrincipalId, deployerRole.id, 'qwik-container-app-deployer')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', deployerRole.name)
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
output deployerRoleId string = deployerRole.id
output deployerAssignmentId string = deployerAssignment.id
output deployerMioAssignmentId string = deployerMio.id
