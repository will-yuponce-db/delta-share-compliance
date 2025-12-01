import api from './api';

export const getAllAgreements = async () => {
  const response = await api.get('/agreements');
  return response.data;
};

export const getAgreementById = async (id) => {
  const response = await api.get(`/agreements/${id}`);
  return response.data;
};

export const createAgreement = async (agreement) => {
  const response = await api.post('/agreements', agreement);
  return response.data;
};

export const parseAgreement = async (content) => {
  const response = await api.post('/agreements/parse', { content });
  return response.data;
};

export const ingestAgreement = async (environment, shareName) => {
  const response = await api.post('/agreements/ingest', { environment, shareName });
  return response.data;
};

export const updateAgreement = async (id, agreement) => {
  const response = await api.put(`/agreements/${id}`, agreement);
  return response.data;
};

export const deleteAgreement = async (id) => {
  const response = await api.delete(`/agreements/${id}`);
  return response.data;
};
