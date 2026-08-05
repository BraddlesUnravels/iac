@description('Azure region.')
param location string = resourceGroup().location

@description('Workspace name.')
param name string

@description('Resource tags.')
param tags object = {}

@description('Retention in days.')
@minValue(30)
@maxValue(730)
param retentionInDays int = 30

@description('SKU name.')
param skuName string = 'PerGB2018'

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      name: skuName
    }
    retentionInDays: retentionInDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output id string = workspace.id
output name string = workspace.name
output customerId string = workspace.properties.customerId
output location string = workspace.location
