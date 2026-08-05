using 'main.bicep'

param location = 'australiaeast'
param namePrefix = 'acdemo'
param environment = 'production'

// From platform deployment outputs
param containerAppsEnvironmentId = '/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.App/managedEnvironments/acae-shared-production'
param containerRegistryName = 'acrsharedproduction'
param containerRegistryLoginServer = 'acrsharedproduction.azurecr.io'

// App image built and pushed by application CI
param image = 'acrsharedproduction.azurecr.io/access-control-demo:REPLACE_WITH_SHA'

param supabaseUrl = 'https://YOUR_PROJECT.supabase.co'

// Set at deploy time; do not commit real values
param supabasePublishableKey = 'REPLACE_ME'

param targetPort = 3000
param healthProbePath = '/api/health'
param minReplicas = 1
param maxReplicas = 1
