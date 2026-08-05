@description('Azure region.')
param location string = resourceGroup().location

@description('Key Vault name.')
param name string

@description('Resource tags.')
param tags object = {}

@description('Tenant id for access policies / RBAC. Defaults to current subscription tenant.')
param tenantId string = subscription().tenantId

@description('Enable RBAC authorization instead of access policies.')
param enableRbacAuthorization bool = true

@description('Soft delete retention days.')
@minValue(7)
@maxValue(90)
param softDeleteRetentionInDays int = 7

@description('Public network access.')
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Enabled'

@description('Optional secrets keyed by name.')
@secure()
param secrets object = {}

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: enableRbacAuthorization
    enableSoftDelete: true
    softDeleteRetentionInDays: softDeleteRetentionInDays
    enablePurgeProtection: false
    publicNetworkAccess: publicNetworkAccess
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

var secretItems = items(secrets)

resource vaultSecrets 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = [
  for secret in secretItems: {
    parent: keyVault
    name: secret.key
    properties: {
      value: secret.value
      contentType: 'text/plain'
    }
  }
]

output id string = keyVault.id
output name string = keyVault.name
output uri string = keyVault.properties.vaultUri
