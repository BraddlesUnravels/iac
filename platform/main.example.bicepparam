using 'main.bicep'

// Example values only. Production parameters are rendered from the validated catalog.
param location = 'australiaeast'
param resourceGroupName = 'rg-platform-production'
param containerRegistryName = 'exampleacrname'
param environment = 'production'
param additionalTags = {}