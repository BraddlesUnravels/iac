@description('Azure region.')
param location string = resourceGroup().location

@description('ACR name (alphanumeric, globally unique).')
param name string

@description('Resource tags.')
param tags object = {}

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    dataEndpointEnabled: false
    encryption: {
      status: 'disabled'
    }
    networkRuleBypassAllowedForTasks: false
    publicNetworkAccess: 'Enabled'
    roleAssignmentMode: 'AbacRepositoryPermissions'
    zoneRedundancy: 'Disabled'
    policies: {
      azureADAuthenticationAsArmPolicy: {
        status: 'enabled'
      }
    }
  }
}

output id string = registry.id
output name string = registry.name
output loginServer string = registry.properties.loginServer
output location string = registry.location
output skuName string = registry.sku.name
output roleAssignmentMode string = registry.properties.roleAssignmentMode
