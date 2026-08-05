targetScope = 'resourceGroup'

@description('Azure region.')
param location string = resourceGroup().location

@description('Short application name for naming and tags.')
@minLength(2)
@maxLength(20)
param namePrefix string

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

@description('Container Apps environment resource id from the platform stack.')
param containerAppsEnvironmentId string

@description('ACR name in this resource group (for AcrPull). Empty skips role assignments.')
param containerRegistryName string = ''

@description('ACR login server (for managed identity image pull).')
param containerRegistryLoginServer string = ''

@description('Elysia API container image reference.')
param apiImage string

@description('Qwik UI container image reference.')
param uiImage string

@description('PostgreSQL administrator login.')
param postgresqlAdministratorLogin string = 'appadmin'

@description('PostgreSQL administrator password.')
@secure()
param postgresqlAdministratorPassword string

@description('Application database name.')
param databaseName string = 'app_db'

@description('PostgreSQL SKU name.')
param postgresqlSkuName string = 'Standard_B1ms'

@description('PostgreSQL SKU tier.')
param postgresqlSkuTier string = 'Burstable'

@description('PostgreSQL version.')
param postgresqlVersion string = '16'

@description('JWT secret used by the API.')
@secure()
param jwtSecret string

@description('API container port.')
param apiPort int = 4000

@description('UI container port.')
param uiPort int = 3000

@description('API health probe path.')
param apiHealthProbePath string = '/health'

@description('UI health probe path. Use empty string to disable probes.')
param uiHealthProbePath string = '/'

@description('API CPU allocation.')
param apiCpu string = '0.5'

@description('API memory allocation.')
param apiMemory string = '1Gi'

@description('UI CPU allocation.')
param uiCpu string = '0.25'

@description('UI memory allocation.')
param uiMemory string = '0.5Gi'

@description('Minimum replicas for API and UI.')
param minReplicas int = 1

@description('Maximum replicas for API and UI.')
param maxReplicas int = 1

@description('Optional CORS origin override. Set to the UI URL after first deploy if needed.')
param corsOriginOverride string = ''

@description('Extra tags.')
param additionalTags object = {}

module naming '../../modules/naming/main.bicep' = {
  name: 'naming'
  params: {
    namePrefix: namePrefix
    environment: environment
    suffix: suffix
  }
}

module tagsModule '../../modules/tags/main.bicep' = {
  name: 'tags'
  params: {
    application: namePrefix
    environment: environment
    additionalTags: additionalTags
  }
}

module postgresql '../../modules/postgresql-flexible/main.bicep' = {
  name: 'postgresql'
  params: {
    location: location
    name: naming.outputs.postgresqlServerName
    tags: tagsModule.outputs.tags
    administratorLogin: postgresqlAdministratorLogin
    administratorPassword: postgresqlAdministratorPassword
    version: postgresqlVersion
    skuName: postgresqlSkuName
    skuTier: postgresqlSkuTier
    databaseName: databaseName
    allowAzureServices: true
    publicNetworkAccess: 'Enabled'
  }
}

var apiAppName = '${naming.outputs.containerAppNamePrefix}-api'
var uiAppName = '${naming.outputs.containerAppNamePrefix}-ui'
var bindAllHost = '0.0.0.0'
var databaseUrl = 'postgresql://${postgresqlAdministratorLogin}:${postgresqlAdministratorPassword}@${postgresql.outputs.host}:5432/${databaseName}?sslmode=require'

module apiApp '../../modules/container-app/main.bicep' = {
  name: 'api-app'
  params: {
    location: location
    name: apiAppName
    tags: tagsModule.outputs.tags
    environmentId: containerAppsEnvironmentId
    image: apiImage
    containerName: 'api'
    targetPort: apiPort
    externalIngress: true
    cpu: apiCpu
    memory: apiMemory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    healthProbePath: apiHealthProbePath
    registryLoginServer: containerRegistryLoginServer
    enableSystemAssignedIdentity: true
    envVars: concat(
      [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'PORT'
          value: '${apiPort}'
        }
        {
          name: 'API_HOST'
          value: bindAllHost
        }
        {
          name: 'LOG_LEVEL'
          value: 'info'
        }
      ],
      empty(corsOriginOverride)
        ? []
        : [
            {
              name: 'CORS_ORIGIN'
              value: corsOriginOverride
            }
          ]
    )
    secrets: {
      'database-url': databaseUrl
      'jwt-secret': jwtSecret
    }
    secretEnvVars: [
      {
        name: 'DATABASE_URL'
        secretRef: 'database-url'
      }
      {
        name: 'JWT_SECRET'
        secretRef: 'jwt-secret'
      }
    ]
  }
}

module uiApp '../../modules/container-app/main.bicep' = {
  name: 'ui-app'
  params: {
    location: location
    name: uiAppName
    tags: tagsModule.outputs.tags
    environmentId: containerAppsEnvironmentId
    image: uiImage
    containerName: 'ui'
    targetPort: uiPort
    externalIngress: true
    cpu: uiCpu
    memory: uiMemory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    healthProbePath: uiHealthProbePath
    registryLoginServer: containerRegistryLoginServer
    enableSystemAssignedIdentity: true
    envVars: [
      {
        name: 'NODE_ENV'
        value: 'production'
      }
      {
        name: 'PORT'
        value: '${uiPort}'
      }
      {
        name: 'API_URL'
        value: apiApp.outputs.url
      }
      {
        name: 'PUBLIC_API_URL'
        value: apiApp.outputs.url
      }
    ]
  }
}

module apiAcrPull '../../modules/role-assignment/acr-pull.bicep' = if (!empty(containerRegistryName)) {
  name: 'api-acr-pull'
  params: {
    containerRegistryName: containerRegistryName
    principalId: apiApp.outputs.principalId
    nameSeed: 'qwik-elysia-api'
  }
}

module uiAcrPull '../../modules/role-assignment/acr-pull.bicep' = if (!empty(containerRegistryName)) {
  name: 'ui-acr-pull'
  params: {
    containerRegistryName: containerRegistryName
    principalId: uiApp.outputs.principalId
    nameSeed: 'qwik-elysia-ui'
  }
}

output postgresqlServerName string = postgresql.outputs.name
output postgresqlFqdn string = postgresql.outputs.fqdn
output databaseName string = postgresql.outputs.databaseName

output apiName string = apiApp.outputs.name
output apiFqdn string = apiApp.outputs.fqdn
output apiUrl string = apiApp.outputs.url
output apiPrincipalId string = apiApp.outputs.principalId

output uiName string = uiApp.outputs.name
output uiFqdn string = uiApp.outputs.fqdn
output uiUrl string = uiApp.outputs.url
output uiPrincipalId string = uiApp.outputs.principalId
