@description('Short application or platform name (letters, numbers, hyphens).')
@minLength(2)
@maxLength(20)
param namePrefix string

@description('Deployment environment name.')
@allowed([
  'dev'
  'test'
  'stage'
  'production'
])
param environment string

@description('Optional extra suffix for uniqueness (for example a short region code).')
param suffix string = ''

var normalizedPrefix = toLower(namePrefix)
var normalizedEnvironment = toLower(environment)
var normalizedSuffix = empty(suffix) ? '' : '-${toLower(suffix)}'
var base = '${normalizedPrefix}-${normalizedEnvironment}${normalizedSuffix}'


@description('Resource group friendly name suggestion.')
output resourceGroupName string = 'rg-${base}'

@description('Log Analytics workspace name.')
output logAnalyticsName string = 'log-${base}'

@description('Container Apps environment name.')
output containerAppsEnvironmentName string = 'acae-${base}'

@description('Key Vault name (3-24 chars, unique).')
output keyVaultName string = take('kv-${take(replace(base, '-', ''), 18)}', 24)

@description('PostgreSQL Flexible Server name.')
output postgresqlServerName string = 'psql-${base}'

@description('Generic Container App name builder prefix.')
output containerAppNamePrefix string = 'aca-${base}'

@description('Shared base token used by stacks for custom names.')
output baseName string = base
