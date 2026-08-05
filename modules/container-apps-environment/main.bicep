@description('Azure region.')
param location string = resourceGroup().location

@description('Container Apps environment name.')
param name string

@description('Resource tags.')
param tags object = {}

@description('Log Analytics workspace resource id. Empty disables workspace logs.')
param logAnalyticsWorkspaceId string = ''

@description('Workload profile type.')
param workloadProfileType string = 'Consumption'

@description('Workload profile name.')
param workloadProfileName string = 'Consumption'

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' existing = if (!empty(logAnalyticsWorkspaceId)) {
  name: last(split(logAnalyticsWorkspaceId, '/'))
}

resource managedEnvironmentWithLogs 'Microsoft.App/managedEnvironments@2025-01-01' = if (!empty(logAnalyticsWorkspaceId)) {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsWorkspace!.properties.customerId
        sharedKey: logAnalyticsWorkspace!.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: workloadProfileName
        workloadProfileType: workloadProfileType
      }
    ]
  }
}

resource managedEnvironmentWithoutLogs 'Microsoft.App/managedEnvironments@2025-01-01' = if (empty(logAnalyticsWorkspaceId)) {
  name: name
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: null
      logAnalyticsConfiguration: null
    }
    workloadProfiles: [
      {
        name: workloadProfileName
        workloadProfileType: workloadProfileType
      }
    ]
  }
}

output id string = !empty(logAnalyticsWorkspaceId) ? managedEnvironmentWithLogs!.id : managedEnvironmentWithoutLogs!.id
output name string = !empty(logAnalyticsWorkspaceId) ? managedEnvironmentWithLogs!.name : managedEnvironmentWithoutLogs!.name
output defaultDomain string = !empty(logAnalyticsWorkspaceId) ? managedEnvironmentWithLogs!.properties.defaultDomain : managedEnvironmentWithoutLogs!.properties.defaultDomain
output staticIp string = !empty(logAnalyticsWorkspaceId) ? managedEnvironmentWithLogs!.properties.staticIp : managedEnvironmentWithoutLogs!.properties.staticIp
