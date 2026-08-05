using 'main.bicep'

param location = 'australiaeast'
param namePrefix = 'jobapp'
param environment = 'production'

// From platform deployment outputs
param containerAppsEnvironmentId = '/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.App/managedEnvironments/acae-shared-production'
param containerRegistryName = 'acrsharedproduction'
param containerRegistryLoginServer = 'acrsharedproduction.azurecr.io'

// Images built and pushed by application CI
param apiImage = 'acrsharedproduction.azurecr.io/job-api:REPLACE_WITH_SHA'
param uiImage = 'acrsharedproduction.azurecr.io/job-ui:REPLACE_WITH_SHA'

param postgresqlAdministratorLogin = 'appadmin'
// Set at deploy time; do not commit real values
param postgresqlAdministratorPassword = 'REPLACE_ME'
param databaseName = 'app_db'
param postgresqlSkuName = 'Standard_B1ms'
param postgresqlSkuTier = 'Burstable'
param postgresqlVersion = '16'

param jwtSecret = 'REPLACE_ME'

// Optional: set to the UI URL after first deploy, then redeploy API CORS
param corsOriginOverride = ''

param apiPort = 4000
param uiPort = 3000
param apiHealthProbePath = '/health'
param uiHealthProbePath = '/'
param minReplicas = 1
param maxReplicas = 1
