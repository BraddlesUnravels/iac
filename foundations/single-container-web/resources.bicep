targetScope = 'resourceGroup'

param location string
param logAnalyticsWorkspaceName string
param containerAppsEnvironmentName string
param runtimeIdentityName string
param publisherIdentityName string
param plannerIdentityName string
param deployerIdentityName string
param tags object = {}

module logAnalytics '../../modules/log-analytics/main.bicep' = {
  name: 'log-analytics'
  params: {
    location: location
    name: logAnalyticsWorkspaceName
    tags: tags
    retentionInDays: 30
  }
}

module containerAppsEnvironment '../../modules/container-apps-environment/main.bicep' = {
  name: 'container-apps-environment'
  params: {
    location: location
    name: containerAppsEnvironmentName
    tags: tags
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
  }
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: runtimeIdentityName
  location: location
  tags: tags
}

resource publisherIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: publisherIdentityName
  location: location
  tags: tags
}

resource plannerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: plannerIdentityName
  location: location
  tags: tags
}

resource deployerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: deployerIdentityName
  location: location
  tags: tags
}

output logAnalyticsWorkspaceId string = logAnalytics.outputs.id
output containerAppsEnvironmentId string = containerAppsEnvironment.outputs.id
output containerAppsEnvironmentName string = containerAppsEnvironment.outputs.name
output runtimeIdentityId string = runtimeIdentity.id
output runtimeIdentityPrincipalId string = runtimeIdentity.properties.principalId
output runtimeIdentityClientId string = runtimeIdentity.properties.clientId
output publisherIdentityId string = publisherIdentity.id
output publisherIdentityPrincipalId string = publisherIdentity.properties.principalId
output publisherIdentityClientId string = publisherIdentity.properties.clientId
output plannerIdentityId string = plannerIdentity.id
output plannerIdentityPrincipalId string = plannerIdentity.properties.principalId
output plannerIdentityClientId string = plannerIdentity.properties.clientId
output deployerIdentityId string = deployerIdentity.id
output deployerIdentityPrincipalId string = deployerIdentity.properties.principalId
output deployerIdentityClientId string = deployerIdentity.properties.clientId
