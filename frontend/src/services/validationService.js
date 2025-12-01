import api from './api';

export const getComplianceOverview = async () => {
  const response = await api.get('/validation/overview');
  return response.data;
};

export const getViolations = async () => {
  const response = await api.get('/validation/violations');
  return response.data;
};

export const validateAsset = async (assetId) => {
  const response = await api.post(`/validation/validate/${assetId}`);
  return response.data;
};

export const validateAllAssets = async () => {
  const response = await api.post('/validation/validate-all');
  return response.data;
};

export const clearCache = async () => {
  const response = await api.post('/validation/clear-cache');
  return response.data;
};
