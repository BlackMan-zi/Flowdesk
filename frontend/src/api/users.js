import client from './client'

export const listUsers = () => client.get('/users')
export const listUsersDirectory = () => client.get('/users/directory')
export const getUser = (id) => client.get(`/users/${id}`)
export const createUser = (data) => client.post('/users', data)
export const updateUser = (id, data) => client.patch(`/users/${id}`, data)
export const deactivateUser = (id) => client.delete(`/users/${id}`)

export const listRoles = () => client.get('/roles')
export const createRole = (data) => client.post('/roles', data)
export const updateRole = (id, data) => client.patch(`/roles/${id}`, data)
export const deleteRole = (id) => client.delete(`/roles/${id}`)

export const listDepartments = () => client.get('/departments')
export const createDepartment = (data) => client.post('/departments', data)
export const updateDepartment = (id, data) => client.patch(`/departments/${id}`, data)
export const deleteDepartment = (id) => client.delete(`/departments/${id}`)
