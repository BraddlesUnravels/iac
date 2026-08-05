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

@description('ACR name in this resource group (for AcrPull). Empty skips role assignment.')
param containerRegistryName string = ''

@description('ACR login server (for managed identity image pull).')
param containerRegistryLoginServer string = ''

@description('Immutable container image reference.')
param image string

@description('Hosted Supabase project URL.')
param supabaseUrl string

@description('Supabase publishable key. RLS remains the security boundary.')
@secure()
param supabasePublishableKey string

@description('Container target port.')
param targetPort int = 3000

@description('Health probe path.')
param healthProbePath string = '/api/health'

@description('CPU allocation.')
param cpu string = '0.25'

@description('Memory allocation.')
param memory string = '0.5Gi'

@description('Minimum replicas.')
param minReplicas int = 1

@description('Maximum replicas.')
param maxReplicas int = 1

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

var containerAppName = '${naming.outputs.containerAppNamePrefix}-web'
var bindAllHost = '0.0.0.0'

module webApp '../../modules/container-app/main.bicep' = {
  name: 'web-app'
  params: {
    location: location
    name: containerAppName
    tags: tagsModule.outputs.tags
    environmentId: containerAppsEnvironmentId
    image: image
    containerName: 'web'
    targetPort: targetPort
    externalIngress: true
    cpu: cpu
    memory: memory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    healthProbePath: healthProbePath
    registryLoginServer: containerRegistryLoginServer
    enableSystemAssignedIdentity: true
    envVars: [
      {
        name: 'NODE_ENV'
        value: 'production'
      }
      {
        name: 'NEXT_TELEMETRY_DISABLED'
        value: '1'
      }
{
        name: 'HOSTNAME'
        value: bindAllHost
      }
      {
        name: 'PORT'
        value: '${targetPort}'
      }
      {
        name: 'NEXT_PUBLIC_SUPABASE_URL'
        value: supabaseUrl
      }
    ]
    secrets: {
      'supabase-publishable-key': supabasePublishableKey
    }
    secretEnvVars: [
      {
        name: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
        secretRef: 'supabase-publishable-key'
      }
    ]
  }
}

module acrPull '../../modules/role-assignment/acr-pull.bicep' = if (!empty(containerRegistryName)) {
  name: 'web-acr-pull'
  params: {
    containerRegistryName: containerRegistryName
    principalId: webApp.outputs.principalId
    nameSeed: 'next-supabase-web'
  }
}

output applicationName string = webApp.outputs.name
output applicationFqdn string = webApp.outputs.fqdn
output applicationUrl string = webApp.outputs.url
output principalId string = webApp.outputs.principalId
