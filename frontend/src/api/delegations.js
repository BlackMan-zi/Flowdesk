import client from './client'

export const listDelegations = () => client.get('/delegations')
export const listAllDelegations = () => client.get('/delegations/all')
export const createDelegation = (data) => client.post('/delegations', data)
export const returnDelegation = (id) => client.post(`/delegations/${id}/return`)
export const adminCreateDelegation = (data) => client.post('/delegations/admin-create', data)
