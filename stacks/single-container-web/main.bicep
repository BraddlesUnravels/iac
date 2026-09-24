targetScope = 'resourceGroup'

@description('Azure region.')
param location string = resourceGroup().location

@description('Container App name.')
param containerAppName string

@description('Existing Container Apps environment name.')
param containerAppsEnvironmentName string

@description('Existing pull identity name.')
param runtimeIdentityName string

@description('ACR login server.')
param registryLoginServer string

@description('Immutable image digest reference (loginServer/repo@sha256:...).')
param imageDigestReference string

@description('Target port.')
param targetPort int = 3000

@description('Health probe path.')
param healthProbePath string = '/health'

@description('CPU cores.')
param cpu string = '0.25'

@description('Memory.')
param memory string = '0.5Gi'

@description('Minimum replicas.')
param minReplicas int = 1

@description('Maximum replicas.')
param maxReplicas int = 1

@description('Approved non-secret environment variables as name/value objects.')
param nonsecretEnvVars array

@description('Application id for tags.')
param application string = 'qwik-website'

@description('Environment name for tags.')
param environment string = 'production'

@description('Extra tags.')
param additionalTags object = {}

@description('Optional custom hostname. Empty skips sticky domain binding.')
param customDomainName string = ''

@description('Existing managed certificate resource ID. Required when customDomainName is set.')
param customDomainCertificateId string = ''

@description('Additional sticky hostname bindings: [{ name, certificateId }].')
param additionalCustomDomains array = []

var mandatoryTags = {
  application: application
  environment: environment
  managedBy: 'bicep'
}

var tags = union(additionalTags, mandatoryTags)

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: containerAppsEnvironmentName
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: runtimeIdentityName
}

module webApp '../../modules/container-app/main.bicep' = {
  name: 'single-container-web-app'
  params: {
    location: location
    name: containerAppName
    tags: tags
    environmentId: containerAppsEnvironment.id
    image: imageDigestReference
    containerName: 'web'
    targetPort: targetPort
    externalIngress: true
    allowInsecure: false
    cpu: cpu
    memory: memory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    healthProbePath: healthProbePath
    enableSystemAssignedIdentity: false
    userAssignedIdentityIds: [
      runtimeIdentity.id
    ]
    registryLoginServer: registryLoginServer
    registryIdentityId: runtimeIdentity.id
    envVars: nonsecretEnvVars
    secrets: {}
    secretEnvVars: []
    activeRevisionsMode: 'Single'
    customDomainName: customDomainName
    customDomainCertificateId: customDomainCertificateId
    additionalCustomDomains: additionalCustomDomains
  }
}

output id string = webApp.outputs.id
output name string = webApp.outputs.name
output fqdn string = webApp.outputs.fqdn
output url string = webApp.outputs.url
output customDomainName string = webApp.outputs.customDomainName
output environmentId string = containerAppsEnvironment.id
output runtimeIdentityId string = runtimeIdentity.id
output image string = imageDigestReference
