targetScope = 'resourceGroup'

@description('Planner principal object id.')
param plannerPrincipalId string

resource plannerRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'qwik-planner-what-if')
  properties: {
    roleName: '${resourceGroup().name} deployment planner'
    description: 'Validate and preview workload deployments without deployment write permissions.'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          'Microsoft.Resources/deployments/read'
          'Microsoft.Resources/deployments/validate/action'
          'Microsoft.Resources/deployments/whatIf/action'
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

resource plannerWhatIf 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, plannerPrincipalId, plannerRole.id, 'qwik-planner-what-if')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', plannerRole.name)
    principalId: plannerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output plannerRoleId string = plannerRole.id
output plannerWhatIfAssignmentId string = plannerWhatIf.id
