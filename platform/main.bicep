targetScope = 'resourceGroup'

@description('Azure region for platform resources.')
param location string = resourceGroup().location

@description('Short name used in resource naming.')
@minLength(2)
@maxLength(20)
param namePrefix string = 'shared'

@description('Deployment environment.')
@allowed([
  'dev'
  'test'
  'stage'
  'production'
])
param environment string = 'production'

@description('Optional naming suffix.')
param suffix string = ''

@description('Application tag value for platform resources.')
param applicationName string = 'platform'

@description('ACR SKU.')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param containerRegistrySku string = 'Basic'

@description('Create a shared Key Vault.')
param deployKeyVault bool = true

@description('Log Analytics retention in days.')
param logRetentionInDays int = 30

@description('Extra tags merged into defaults.')
param additionalTags object = {}

module naming '../modules/naming/main.bicep' = {
  name: 'naming'
  params: {
    namePrefix: namePrefix
    environment: environment
    suffix: suffix
  }
}

module tagsModule '../modules/tags/main.bicep' = {
  name: 'tags'
  params: {
    application: applicationName
    environment: environment
    additionalTags: additionalTags
  }
}

module logAnalytics '../modules/log-analytics/main.bicep' = {
  name: 'log-analytics'
  params: {
    location: location
    name: naming.outputs.logAnalyticsName
    tags: tagsModule.outputs.tags
    retentionInDays: logRetentionInDays
  }
}

module containerRegistry '../modules/container-registry/main.bicep' = {
  name: 'container-registry'
  params: {
    location: location
    name: naming.outputs.containerRegistryName
    tags: tagsModule.outputs.tags
    skuName: containerRegistrySku
    adminUserEnabled: false
  }
}

module containerAppsEnvironment '../modules/container-apps-environment/main.bicep' = {
  name: 'container-apps-environment'
  params: {
    location: location
    name: naming.outputs.containerAppsEnvironmentName
    tags: tagsModule.outputs.tags
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
  }
}

module keyVault '../modules/key-vault/main.bicep' = if (deployKeyVault) {
  name: 'key-vault'
  params: {
    location: location
    name: naming.outputs.keyVaultName
    tags: tagsModule.outputs.tags
  }
}

output location string = location
output environment string = environment
output namePrefix string = namePrefix
output baseName string = naming.outputs.baseName

output logAnalyticsWorkspaceId string = logAnalytics.outputs.id
output logAnalyticsWorkspaceCustomerId string = logAnalytics.outputs.customerId

output containerRegistryId string = containerRegistry.outputs.id
output containerRegistryName string = containerRegistry.outputs.name
output containerRegistryLoginServer string = containerRegistry.outputs.loginServer

output containerAppsEnvironmentId string = containerAppsEnvironment.outputs.id
output containerAppsEnvironmentName string = containerAppsEnvironment.outputs.name
output containerAppsDefaultDomain string = containerAppsEnvironment.outputs.defaultDomain

output keyVaultId string = deployKeyVault ? keyVault!.outputs.id : ''
output keyVaultName string = deployKeyVault ? keyVault!.outputs.name : ''
output keyVaultUri string = deployKeyVault ? keyVault!.outputs.uri : ''
