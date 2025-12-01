import api from './api';

export const getAllShares = async () => {
  const response = await api.get('/delta-sharing/shares');
  return response.data;
};

export const getLoadingStatus = async () => {
  const response = await api.get('/delta-sharing/loading-status');
  return response.data;
};

export const getShareById = async (id) => {
  const response = await api.get(`/delta-sharing/shares/${id}`);
  return response.data;
};

export const getTablesInShare = async (envId, shareName) => {
  try {
    // Use dedicated endpoint to get tables for specific share (uses cached data only)
    const response = await api.get(`/delta-sharing/tables/${envId}/${shareName}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching assets in share:', error);
    // Return empty array on error to prevent white screen
    return [];
  }
};

export const getAllTables = async () => {
  const response = await api.get('/delta-sharing/tables');
  return response.data;
};

export const getTableById = async (id) => {
  const response = await api.get(`/delta-sharing/tables/${id}`);
  return response.data;
};

export const getTableMetadata = async (envId, fullName) => {
  // Parse the full name (catalog.schema.table)
  const parts = fullName.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid table full name format. Expected: catalog.schema.table');
  }
  
  const [catalogName, schemaName, tableName] = parts;
  
  try {
    // Fetch columns for this table
    const response = await api.get(`/delta-sharing/tables/${envId}/${catalogName}/${schemaName}/${tableName}/columns`);
    return response.data;
  } catch (error) {
    console.error('Error fetching table metadata:', error);
    throw error;
  }
};

export const updateTableTags = async (tableId, tags) => {
  const response = await api.put(`/delta-sharing/tables/${tableId}/tags`, { tags });
  return response.data;
};

export const deleteTableTag = async (tableId, tagKey) => {
  const response = await api.delete(`/delta-sharing/tables/${tableId}/tags/${tagKey}`);
  return response.data;
};
