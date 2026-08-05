@description('Application or platform name.')
param application string

@description('Deployment environment.')
param environment string

@description('Optional extra tags merged over the defaults.')
param additionalTags object = {}

var defaultTags = {
  application: application
  environment: environment
  managedBy: 'bicep'
}

output tags object = union(defaultTags, additionalTags)
