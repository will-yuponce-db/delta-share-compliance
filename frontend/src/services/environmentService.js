import api from './api';

export const getAllEnvironments = async () => {
  const response = await api.get('/environments');
  return response.data;
};

export const getEnvironmentById = async (id) => {
  const response = await api.get(`/environments/${id}`);
  return response.data;
};

export const createEnvironment = async (environment) => {
  const response = await api.post('/environments', environment);
  return response.data;
};

export const updateEnvironment = async (id, updates) => {
  const response = await api.put(`/environments/${id}`, updates);
  return response.data;
};

export const deleteEnvironment = async (id) => {
  const response = await api.delete(`/environments/${id}`);
  return response.data;
};



