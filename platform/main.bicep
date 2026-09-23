targetScope = 'subscription'

@description('Azure region for the platform resource group and registry.')
param location string

@description('Platform resource group name.')
@minLength(1)
@maxLength(90)
param resourceGroupName string

@description('Globally unique Azure Container Registry name.')
@minLength(5)
@maxLength(50)
param containerRegistryName string

@description('Deployment environment.')
@allowed([
  'dev'
  'test'
  'stage'
  'production'
])
param environment string

@description('Extra tags. Mandatory platform tags override matching keys.')
param additionalTags object = {}

var mandatoryTags = {
  application: 'platform'
  environment: environment
  managedBy: 'bicep'
}

var tags = union(additionalTags, mandatoryTags)

resource platformResourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module containerRegistry '../modules/container-registry/main.bicep' = {
  name: 'container-registry'
  scope: platformResourceGroup
  params: {
    location: location
    name: containerRegistryName
    tags: tags
  }
}

output platformResourceGroupId string = platformResourceGroup.id
output platformResourceGroupName string = platformResourceGroup.name
output containerRegistryId string = containerRegistry.outputs.id
output containerRegistryName string = containerRegistry.outputs.name
output containerRegistryLoginServer string = containerRegistry.outputs.loginServer
output containerRegistryLocation string = containerRegistry.outputs.location
output containerRegistrySku string = containerRegistry.outputs.skuName
output containerRegistryRoleAssignmentMode string = containerRegistry.outputs.roleAssignmentMode
