@description('Azure region.')
param location string = resourceGroup().location

@description('PostgreSQL Flexible Server name.')
param name string

@description('Resource tags.')
param tags object = {}

@description('Administrator login name.')
param administratorLogin string

@description('Administrator password.')
@secure()
param administratorPassword string

@description('PostgreSQL major version.')
@allowed([
  '14'
  '15'
  '16'
  '17'
])
param version string = '16'

@description('Compute tier.')
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param skuTier string = 'Burstable'

@description('SKU name, for example Standard_B1ms.')
param skuName string = 'Standard_B1ms'

@description('Storage size in GB.')
@minValue(32)
param storageSizeGb int = 32

@description('Backup retention days.')
@minValue(7)
@maxValue(35)
param backupRetentionDays int = 7

@description('Geo-redundant backup.')
param geoRedundantBackup bool = false

@description('High availability mode.')
@allowed([
  'Disabled'
  'SameZone'
  'ZoneRedundant'
])
param highAvailabilityMode string = 'Disabled'

@description('Application database name to create.')
param databaseName string = 'app_db'

@description('Allow Azure services firewall rule.')
param allowAzureServices bool = true

@description('Optional extra firewall rules: name, startIpAddress, endIpAddress.')
param firewallRules array = []

@description('Public network access.')
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Enabled'

@description('Availability zone. Empty lets Azure choose.')
param availabilityZone string = ''

var azureServicesFirewallIp = '0.0.0.0'

var haProperties = highAvailabilityMode == 'Disabled'
  ? {
      mode: 'Disabled'
    }
  : {
      mode: highAvailabilityMode
    }

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-11-01-preview' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: version
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    storage: {
      storageSizeGB: storageSizeGb
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: geoRedundantBackup ? 'Enabled' : 'Disabled'
    }
    highAvailability: haProperties
    network: {
      publicNetworkAccess: publicNetworkAccess
    }
    availabilityZone: empty(availabilityZone) ? null : availabilityZone
  }
}

resource appDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-11-01-preview' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource azureServicesFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-11-01-preview' = if (allowAzureServices && publicNetworkAccess == 'Enabled') {
  parent: server
  name: 'AllowAllAzureServicesAndResourcesWithinAzureIps'
  properties: {
    startIpAddress: azureServicesFirewallIp
    endIpAddress: azureServicesFirewallIp
  }
}

resource extraFirewallRules 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-11-01-preview' = [
  for rule in firewallRules: if (publicNetworkAccess == 'Enabled') {
    parent: server
    name: rule.name
    properties: {
      startIpAddress: rule.startIpAddress
      endIpAddress: rule.endIpAddress
    }
  }
]

output id string = server.id
output name string = server.name
output fqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = appDatabase.name
output administratorLogin string = administratorLogin

@description('libpq-style connection host only. Build full URLs in the calling stack with the password secret.')
output host string = server.properties.fullyQualifiedDomainName
