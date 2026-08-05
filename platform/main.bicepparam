using 'main.bicep'

param location = 'australiaeast'
param namePrefix = 'shared'
param environment = 'production'
param applicationName = 'platform'
param containerRegistrySku = 'Basic'
param deployKeyVault = true
param logRetentionInDays = 30
