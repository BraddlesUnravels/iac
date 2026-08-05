@description('Azure region.')
param location string = resourceGroup().location

@description('Container App name.')
param name string

@description('Resource tags.')
param tags object = {}

@description('Container Apps environment resource id.')
param environmentId string

@description('Container image reference.')
param image string

@description('Container name inside the app.')
param containerName string = 'app'

@description('Target port for ingress and probes.')
param targetPort int = 3000

@description('Expose ingress externally.')
param externalIngress bool = true

@description('Allow insecure HTTP ingress.')
param allowInsecure bool = false

@description('Ingress transport.')
@allowed([
  'auto'
  'http'
  'http2'
  'tcp'
])
param transport string = 'auto'

@description('CPU cores allocated to the container.')
param cpu string = '0.25'

@description('Memory allocated to the container.')
param memory string = '0.5Gi'

@description('Minimum replicas.')
param minReplicas int = 1

@description('Maximum replicas.')
param maxReplicas int = 1

@description('Plain environment variables as name/value objects.')
param envVars array = []

@description('Secret map keyed by secret name. Values are secret strings.')
@secure()
param secrets object = {}

@description('Environment variables bound to secrets: name + secretRef.')
param secretEnvVars array = []

@description('HTTP probe path. Empty disables probes.')
param healthProbePath string = '/health'

@description('Enable system-assigned managed identity.')
param enableSystemAssignedIdentity bool = true

@description('ACR login server when using managed identity pull. Empty skips registry config.')
param registryLoginServer string = ''

@description('User-assigned identity resource id used for ACR pull. Empty uses system-assigned.')
param registryIdentityId string = ''

@description('Active revisions mode.')
@allowed([
  'Single'
  'Multiple'
])
param activeRevisionsMode string = 'Single'

@description('Termination grace period seconds.')
param terminationGracePeriodSeconds int = 30

var identity = enableSystemAssignedIdentity
  ? {
      type: 'SystemAssigned'
    }
  : null

var registryIdentity = !empty(registryIdentityId)
  ? registryIdentityId
  : 'system'

var registries = !empty(registryLoginServer)
  ? [
      {
        server: registryLoginServer
        identity: registryIdentity
      }
    ]
  : []

var secretNames = items(secrets)

var secretDefinitions = [
  for secret in secretNames: {
    name: secret.key
    value: secret.value
  }
]

var secretEnvironment = [
  for secretEnv in secretEnvVars: {
    name: secretEnv.name
    secretRef: secretEnv.secretRef
  }
]

var containerEnv = concat(envVars, secretEnvironment)

var probes = empty(healthProbePath)
  ? []
  : [
      {
        type: 'Startup'
        httpGet: {
          path: healthProbePath
          port: targetPort
        }
        initialDelaySeconds: 2
        periodSeconds: 3
        timeoutSeconds: 2
        failureThreshold: 10
        successThreshold: 1
      }
      {
        type: 'Liveness'
        httpGet: {
          path: healthProbePath
          port: targetPort
        }
        initialDelaySeconds: 10
        periodSeconds: 30
        timeoutSeconds: 3
        failureThreshold: 3
        successThreshold: 1
      }
      {
        type: 'Readiness'
        httpGet: {
          path: healthProbePath
          port: targetPort
        }
        initialDelaySeconds: 5
        periodSeconds: 10
        timeoutSeconds: 3
        failureThreshold: 3
        successThreshold: 1
      }
    ]

resource containerApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: name
  location: location
  tags: tags
  identity: identity
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: activeRevisionsMode
      maxInactiveRevisions: 1
      secrets: secretDefinitions
      registries: registries
      ingress: {
        external: externalIngress
        allowInsecure: allowInsecure
        targetPort: targetPort
        transport: transport
      }
    }
    template: {
      terminationGracePeriodSeconds: terminationGracePeriodSeconds
      containers: [
        {
          name: containerName
          image: image
          env: containerEnv
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          probes: probes
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

output id string = containerApp.id
output name string = containerApp.name
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output url string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output principalId string = enableSystemAssignedIdentity ? containerApp.identity.principalId : ''
