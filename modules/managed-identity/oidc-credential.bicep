@description('Parent user-assigned managed identity name.')
param identityName string

@description('Federated credential name.')
param name string

@description('GitHub OIDC subject claim.')
param subject string

@description('Token issuer.')
param issuer string = 'https://token.actions.githubusercontent.com'

@description('Audiences.')
param audiences array = [
  'api://AzureADTokenExchange'
]

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: identityName
}

resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: name
  properties: {
    issuer: issuer
    subject: subject
    audiences: audiences
  }
}

output id string = federatedCredential.id
output name string = federatedCredential.name
