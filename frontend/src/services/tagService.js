import api from './api';

export const updateAssetTags = async (assetIdOrEnvId, tagsOrShareId, schemaName, tableName, actualTags) => {
  // Handle both signatures:
  // updateAssetTags(assetId, tags) OR
  // updateAssetTags(envId, shareId, schemaName, tableName, tags)
  
  let tableId, tags;
  
  if (arguments.length === 2) {
    // Simple signature: updateAssetTags(assetId, tags)
    tableId = assetIdOrEnvId;
    tags = tagsOrShareId;
  } else if (arguments.length === 5) {
    // Complex signature: updateAssetTags(envId, shareId, schemaName, tableName, tags)
    // For now, we'll use the table name as an ID (this is a simplification)
    // In a real app, you'd need to look up the table ID from these parameters
    const { getAllTables } = await import('./shareService');
    const allTables = await getAllTables();
    const table = allTables.find(t => 
      t.environmentId === assetIdOrEnvId &&
      t.shareId === tagsOrShareId &&
      t.schemaName === schemaName &&
      t.name === tableName
    );
    
    if (!table) {
      throw new Error('Table not found');
    }
    
    tableId = table.id;
    tags = actualTags;
  } else {
    throw new Error('Invalid arguments for updateAssetTags');
  }
  
  const response = await api.put(`/delta-sharing/tables/${tableId}/tags`, { tags });
  return response.data;
};

export const bulkUpdateTags = async (assets, tags) => {
  // Update tags for multiple assets
  const promises = assets.map(asset => {
    const assetId = asset.id || asset.assetId;
    return api.put(`/delta-sharing/tables/${assetId}/tags`, { tags });
  });
  const results = await Promise.all(promises);
  return { success: true, updated: results.length };
};

export const getTagSuggestions = async (assetName, schema) => {
  const response = await api.post('/tags/suggest', {
    assetName,
    schema,
  });
  return response.data;
};

export const getAllTags = async () => {
  const response = await api.get('/tags');
  return response.data;
};

export const getTags = async (tableId) => {
  const response = await api.get(`/delta-sharing/tables/${tableId}`);
  return response.data.tags || {};
};

export const setTags = async (tableId, tags) => {
  const response = await api.put(`/delta-sharing/tables/${tableId}/tags`, { tags });
  return response.data;
};
