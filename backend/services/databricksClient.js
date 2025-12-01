import axios from 'axios';
import { getEnvironment } from '../config/databricks.js';

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Configurable limits to prevent API overload
const MAX_CATALOGS = parseInt(process.env.MAX_CATALOGS || '10'); // Limit catalogs to avoid rate limits - set low for large environments
const MAX_SCHEMAS_PER_CATALOG = parseInt(process.env.MAX_SCHEMAS_PER_CATALOG || '5'); // Limit schemas per catalog to prevent timeouts

// Request locking to prevent parallel fetches
const activeRequests = new Map();

// Store the current user token for API calls
let currentUserToken = null;

// Set the user token for subsequent API calls
export const setUserToken = (token) => {
  currentUserToken = token;
};

// Get the current user token
export const getUserToken = () => {
  return currentUserToken;
};

// Export function to clear cache
export const clearCache = () => {
  cache.clear();
  activeRequests.clear();
  consecutiveErrors = 0;
  console.log('Cache cleared');
};

// Rate limiting helper with exponential backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 300; // 300ms between requests (increased for stability)
let consecutiveErrors = 0;

async function rateLimitedRequest(fn, retries = 3) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  // Add adaptive delay based on consecutive errors
  const adaptiveDelay = MIN_REQUEST_INTERVAL * (1 + consecutiveErrors);
  
  if (timeSinceLastRequest < adaptiveDelay) {
    await sleep(adaptiveDelay - timeSinceLastRequest);
  }
  
  lastRequestTime = Date.now();
  
  try {
    const result = await fn();
    consecutiveErrors = 0; // Reset on success
    return result;
  } catch (error) {
    if (error.response?.status === 429 && retries > 0) {
      consecutiveErrors++;
      const backoffDelay = Math.min(1000 * Math.pow(2, 3 - retries), 8000);
      console.log(`Rate limit hit, retrying in ${backoffDelay}ms... (${retries} retries left)`);
      await sleep(backoffDelay);
      return rateLimitedRequest(fn, retries - 1);
    }
    throw error;
  }
}

// Create Databricks API client for a specific environment
// Uses the user's access token from X-Forwarded-Access-Token header (Databricks Apps)
// Falls back to PAT from config if no user token is available
export const createDatabricksClient = (envId, userToken = null) => {
  const env = getEnvironment(envId);
  
  if (!env) {
    throw new Error(`Environment ${envId} not found or not enabled`);
  }
  
  // Priority: 1) Provided userToken, 2) Current user token from middleware, 3) PAT from config
  const token = userToken || currentUserToken || env.token;
  
  if (!token) {
    throw new Error('No authentication token available. Either configure a PAT in databricks-config.json or access via Databricks Apps.');
  }
  
  const client = axios.create({
    baseURL: env.host,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
  
  // Add response interceptor for error handling and retries
  client.interceptors.response.use(
    response => response,
    async error => {
      if (error.response?.status === 429) {
        console.warn(`Rate limit hit for ${envId}, backing off...`);
        await sleep(2000); // Wait 2 seconds before retry
      }
      if (error.response?.status === 401) {
        console.error(`Authentication failed for ${envId}. User token may be invalid or expired.`);
      }
      throw error;
    }
  );
  
  return client;
};

// Unity Catalog API calls
export const unityCatalog = {
  // List catalogs (with caching and filtering)
  async listCatalogs(envId, userToken = null) {
    const cacheKey = `catalogs:${envId}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    const client = createDatabricksClient(envId, userToken);
    const response = await rateLimitedRequest(() => 
      client.get('/api/2.1/unity-catalog/catalogs')
    );
    
    // Filter out internal catalogs
    const catalogs = (response.data.catalogs || []).filter(catalog => 
      !catalog.name.startsWith('__') && 
      !catalog.name.startsWith('system')
    );
    
    cache.set(cacheKey, { data: catalogs, timestamp: Date.now() });
    return catalogs;
  },
  
  // List schemas in a catalog (with caching and filtering)
  async listSchemas(envId, catalogName, userToken = null) {
    const cacheKey = `schemas:${envId}:${catalogName}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    const client = createDatabricksClient(envId, userToken);
    const response = await rateLimitedRequest(() =>
      client.get('/api/2.1/unity-catalog/schemas', {
        params: { catalog_name: catalogName }
      })
    );
    
    // Filter out internal schemas
    const schemas = (response.data.schemas || []).filter(schema =>
      !schema.name.startsWith('__') &&
      !schema.name.startsWith('information_schema')
    );
    
    cache.set(cacheKey, { data: schemas, timestamp: Date.now() });
    return schemas;
  },
  
  // List tables in a schema (with caching)
  async listTables(envId, catalogName, schemaName, userToken = null) {
    const cacheKey = `tables:${envId}:${catalogName}:${schemaName}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    const client = createDatabricksClient(envId, userToken);
    const response = await rateLimitedRequest(() =>
      client.get('/api/2.1/unity-catalog/tables', {
        params: { 
          catalog_name: catalogName,
          schema_name: schemaName 
        }
      })
    );
    
    const tables = response.data.tables || [];
    cache.set(cacheKey, { data: tables, timestamp: Date.now() });
    return tables;
  },
  
  // List volumes in a schema (with caching)
  async listVolumes(envId, catalogName, schemaName, userToken = null) {
    const cacheKey = `volumes:${envId}:${catalogName}:${schemaName}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    try {
      const client = createDatabricksClient(envId, userToken);
      const response = await rateLimitedRequest(() =>
        client.get('/api/2.1/unity-catalog/volumes', {
          params: { 
            catalog_name: catalogName,
            schema_name: schemaName 
          }
        })
      );
      
      const volumes = response.data.volumes || [];
      cache.set(cacheKey, { data: volumes, timestamp: Date.now() });
      return volumes;
    } catch (error) {
      console.error(`Error listing volumes: ${error.message}`);
      return [];
    }
  },
  
  // List functions in a schema (with caching)
  async listFunctions(envId, catalogName, schemaName, userToken = null) {
    const cacheKey = `functions:${envId}:${catalogName}:${schemaName}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    try {
      const client = createDatabricksClient(envId, userToken);
      const response = await rateLimitedRequest(() =>
        client.get('/api/2.1/unity-catalog/functions', {
          params: { 
            catalog_name: catalogName,
            schema_name: schemaName 
          }
        })
      );
      
      const functions = response.data.functions || [];
      cache.set(cacheKey, { data: functions, timestamp: Date.now() });
      return functions;
    } catch (error) {
      console.error(`Error listing functions: ${error.message}`);
      return [];
    }
  },
  
  // List models in a schema (with caching)
  async listModels(envId, catalogName, schemaName, userToken = null) {
    const cacheKey = `models:${envId}:${catalogName}:${schemaName}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    try {
      const client = createDatabricksClient(envId, userToken);
      const response = await rateLimitedRequest(() =>
        client.get('/api/2.1/unity-catalog/models', {
          params: { 
            catalog_name: catalogName,
            schema_name: schemaName 
          }
        })
      );
      
      const models = response.data.registered_models || [];
      cache.set(cacheKey, { data: models, timestamp: Date.now() });
      return models;
    } catch (error) {
      console.error(`Error listing models: ${error.message}`);
      return [];
    }
  },
  
  // List columns in a table (with caching)
  async listTableColumns(envId, catalogName, schemaName, tableName, userToken = null) {
    const cacheKey = `columns:${envId}:${catalogName}:${schemaName}:${tableName}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    try {
      const client = createDatabricksClient(envId, userToken);
      const fullTableName = `${catalogName}.${schemaName}.${tableName}`;
      const response = await rateLimitedRequest(() =>
        client.get(`/api/2.1/unity-catalog/tables/${fullTableName}`)
      );
      
      const columns = response.data.columns || [];
      cache.set(cacheKey, { data: columns, timestamp: Date.now() });
      return columns;
    } catch (error) {
      console.error(`Error listing columns for ${catalogName}.${schemaName}.${tableName}:`, error.message);
      return [];
    }
  },
  
  // Get table details
  async getTable(envId, fullTableName, userToken = null) {
    const client = createDatabricksClient(envId, userToken);
    const response = await client.get(`/api/2.1/unity-catalog/tables/${fullTableName}`);
    return response.data;
  },
  
  // Get table tags
  async getTags(envId, fullTableName, userToken = null) {
    const client = createDatabricksClient(envId, userToken);
    try {
      const response = await client.get(`/api/2.1/unity-catalog/tables/${fullTableName}`);
      return response.data.properties || {};
    } catch (error) {
      console.error('Error fetching tags:', error);
      return {};
    }
  },
  
  // Set table tags
  async setTags(envId, fullTableName, tags, userToken = null) {
    const client = createDatabricksClient(envId, userToken);
    const response = await client.patch(`/api/2.1/unity-catalog/tables/${fullTableName}`, {
      properties: tags
    });
    return response.data;
  },
};

// Delta Sharing API calls
export const deltaSharing = {
  // List shares
  async listShares(envId, userToken = null) {
    const client = createDatabricksClient(envId, userToken);
    const response = await client.get('/api/2.1/unity-catalog/shares');
    return response.data.shares || [];
  },
  
  // Get share details
  async getShare(envId, shareName, includeSharedData = true, userToken = null) {
    const cacheKey = `share:${envId}:${shareName}:${includeSharedData}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    
    const client = createDatabricksClient(envId, userToken);
    // include_shared_data parameter is needed to get the objects array
    const params = includeSharedData ? { include_shared_data: true } : {};
    const response = await client.get(`/api/2.1/unity-catalog/shares/${shareName}`, { params });
    
    cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
    return response.data;
  },
  
  // Get object count for multiple shares efficiently (batch)
  async getShareObjectCounts(envId, shareNames, userToken = null) {
    const results = {};
    
    // Process in small batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < shareNames.length; i += batchSize) {
      const batch = shareNames.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (shareName) => {
        try {
          const shareDetails = await this.getShare(envId, shareName, true, userToken);
          results[shareName] = shareDetails.objects?.length || 0;
        } catch (error) {
          console.warn(`Could not get object count for share ${shareName}:`, error.message);
          results[shareName] = 0;
        }
      }));
      
      // Small delay between batches
      if (i + batchSize < shareNames.length) {
        await sleep(100);
      }
    }
    
    return results;
  },
  
  // List all tables/objects in a share
  async listShareObjects(envId, shareName, userToken = null) {
    try {
      const client = createDatabricksClient(envId, userToken);
      // Try the shares permissions endpoint which includes granted objects
      const response = await client.get(`/api/2.1/unity-catalog/shares/${shareName}/permissions`);
      return response.data;
    } catch (error) {
      console.warn(`Could not list share objects for ${shareName}:`, error.message);
      return null;
    }
  },
  
  // List tables granted to a share (what tables are IN the share)
  async listTablesInShare(envId, shareName, userToken = null) {
    try {
      const client = createDatabricksClient(envId, userToken);
      // Try different possible endpoints
      
      // Option 1: Try grants endpoint
      try {
        const response = await client.get(`/api/2.1/unity-catalog/grants/share/${shareName}`);
        if (response.data) return response.data;
      } catch (e) {
        console.log(`      Grants endpoint failed: ${e.message}`);
      }
      
      return null;
    } catch (error) {
      console.warn(`Could not list grants for share ${shareName}:`, error.message);
      return null;
    }
  },
  
  // List all providers (for discovering available data sharing providers)
  async listProviders(envId, userToken = null) {
    try {
      const client = createDatabricksClient(envId, userToken);
      const response = await client.get('/api/2.1/data-sharing/providers');
      console.log(`📊 Found ${response.data.providers?.length || 0} data sharing providers`);
      return response.data.providers || [];
    } catch (error) {
      console.warn(`Could not list providers:`, error.message);
      return [];
    }
  },
  
  // Get share details via Delta Sharing provider endpoint (for identifying underlying data)
  async getShareFromProvider(envId, providerName, shareName, userToken = null) {
    try {
      const client = createDatabricksClient(envId, userToken);
      const response = await client.get(`/api/2.1/data-sharing/providers/${providerName}/shares/${shareName}`);
      console.log(`📊 Share ${shareName} from provider ${providerName}:`, response.data);
      return response.data;
    } catch (error) {
      console.warn(`Could not fetch share ${shareName} from provider ${providerName}:`, error.message);
      return null;
    }
  },

  // Get all tables in a specific share via catalog mapping
  async getShareTables(envId, shareName, userToken = null) {
    // Shares in Unity Catalog reference tables from catalogs
    // We need to find which catalog this share is associated with
    // For now, assume share name maps to catalog name (common pattern)
    
    try {
      // Try to get share details
      const shareDetails = await this.getShare(envId, shareName, true, userToken);
      
      // If share has objects defined, use those
      if (shareDetails.objects && shareDetails.objects.length > 0) {
        // Share has explicit table definitions
        return shareDetails.objects.map(obj => ({
          ...obj,
          shareName: shareName,
          share_name: shareName,
        }));
      }
      
      // Otherwise, fall back to catalog-based lookup
      // Try to find a catalog with the same name
      const allAssets = await this.getAllShareTables(envId, [], userToken);
      return allAssets.filter(a => a.catalog_name === shareName);
    } catch (error) {
      console.error(`Error fetching tables for share ${shareName}:`, error.message);
      return [];
    }
  },
  
  // List all tables in all shares (using Unity Catalog tables API)
  async listShareSchemas(envId, shareName, userToken = null) {
    // For Delta Sharing, we need to use the tables API and group by schema
    const client = createDatabricksClient(envId, userToken);
    const response = await client.get('/api/2.1/unity-catalog/tables', {
      params: {
        max_results: 1000
      }
    });
    
    const tables = response.data.tables || [];
    const schemas = new Set();
    
    // Extract unique schemas from tables
    tables.forEach(table => {
      if (table.catalog_name && table.schema_name) {
        schemas.add(table.schema_name);
      }
    });
    
    return Array.from(schemas).map(name => ({ name }));
  },
  
  // List tables in a share schema
  async listShareTables(envId, shareName, schemaName, userToken = null) {
    const client = createDatabricksClient(envId, userToken);
    const response = await client.get('/api/2.1/unity-catalog/tables', {
      params: {
        catalog_name: shareName,
        schema_name: schemaName,
        max_results: 1000
      }
    });
    return response.data.tables || [];
  },
  
  // Get catalog-level metadata for ALL catalogs (lightweight for compliance checking)
  async getAllCatalogMetadata(envId, userToken = null) {
    const cacheKey = `all_catalog_metadata:${envId}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✓ Returning cached catalog metadata for ${envId} (${cached.data.length} catalogs)`);
      return cached.data;
    }
    
    const catalogMetadata = [];
    
    try {
      // Get ALL catalogs (lightweight - just metadata)
      const catalogs = await unityCatalog.listCatalogs(envId, userToken);
      console.log(`📊 Processing metadata for ALL ${catalogs.length} catalogs in ${envId}`);
      
      for (let i = 0; i < catalogs.length; i++) {
        const catalog = catalogs[i];
        try {
          // Get schemas for this catalog (still lightweight)
          const schemas = await unityCatalog.listSchemas(envId, catalog.name, userToken);
          
          catalogMetadata.push({
            catalog_name: catalog.name,
            catalog_type: catalog.catalog_type,
            comment: catalog.comment,
            owner: catalog.owner,
            schema_count: schemas.length,
            schemas: schemas.map(s => ({
              name: s.name,
              comment: s.comment,
              owner: s.owner,
            })),
            properties: catalog.properties || {},
          });
          
          if ((i + 1) % 100 === 0) {
            console.log(`   Progress: ${i + 1}/${catalogs.length} catalogs processed`);
          }
        } catch (error) {
          if (error.response?.status !== 429) {
            console.error(`Error getting metadata for ${catalog.name}:`, error.message);
          }
        }
      }
      
      console.log(`✅ Catalog metadata loaded: ${catalogMetadata.length} catalogs`);
      cache.set(cacheKey, { data: catalogMetadata, timestamp: Date.now() });
    } catch (error) {
      console.error(`Error fetching catalog metadata:`, error.message);
    }
    
    return catalogMetadata;
  },
  
  // Get all assets (tables, volumes, functions, models) across all catalogs (with aggressive caching)
  async getAllShareTables(envId, priorityCatalogs = [], userToken = null) {
    const cacheKey = `all_assets:${envId}`;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✓ Returning cached assets for ${envId} (${cached.data.length} assets)`);
      return cached.data;
    }
    
    // Check if there's already an active request for this environment
    const requestKey = `fetch_assets:${envId}`;
    if (activeRequests.has(requestKey)) {
      console.log(`⏳ Waiting for existing asset fetch request for ${envId}...`);
      return await activeRequests.get(requestKey);
    }
    
    // Create a promise for this request and store it
    const fetchPromise = this._fetchAllAssets(envId, priorityCatalogs, userToken);
    activeRequests.set(requestKey, fetchPromise);
    
    try {
      const result = await fetchPromise;
      return result;
    } finally {
      // Remove from active requests when done
      activeRequests.delete(requestKey);
    }
  },
  
  // Internal method to actually fetch all assets
  async _fetchAllAssets(envId, priorityCatalogs = [], userToken = null) {
    console.log(`🚀 Starting asset fetch for ${envId}...`);
    const cacheKey = `all_assets:${envId}`;
    const metadataKey = `${cacheKey}:metadata`;
    const allAssets = [];
    let catalogsProcessed = 0;
    
    try {
      // First, get all catalogs (already filtered for internal catalogs)
      const catalogs = await unityCatalog.listCatalogs(envId, userToken);
      console.log(`Found ${catalogs.length} catalogs in ${envId}`);
      
      // Prioritize catalogs with agreements
      const prioritySet = new Set(priorityCatalogs.map(c => c.toLowerCase()));
      const prioritizedCatalogs = [];
      const otherCatalogs = [];
      
      catalogs.forEach(catalog => {
        if (prioritySet.has(catalog.name.toLowerCase())) {
          prioritizedCatalogs.push(catalog);
        } else {
          otherCatalogs.push(catalog);
        }
      });
      
      // Always scan ALL priority catalogs, then fill up to MAX_CATALOGS with others
      const remainingSlots = Math.max(0, MAX_CATALOGS - prioritizedCatalogs.length);
      const catalogsToScan = [...prioritizedCatalogs, ...otherCatalogs.slice(0, remainingSlots)];
      
      if (prioritizedCatalogs.length > 0) {
        console.log(`📌 Prioritizing ${prioritizedCatalogs.length} catalogs with agreements: ${prioritizedCatalogs.map(c => c.name).join(', ')}`);
      }
      
      if (catalogs.length > catalogsToScan.length) {
        console.log(`⚠️  Scanning ${catalogsToScan.length} catalogs (${prioritizedCatalogs.length} with agreements + ${catalogsToScan.length - prioritizedCatalogs.length} others) out of ${catalogs.length} total`);
      }
      
      // Set initial metadata
      cache.set(metadataKey, {
        isLoading: true,
        catalogsProcessed: 0,
        totalCatalogs: catalogsToScan.length,
        priorityCatalogs: prioritizedCatalogs.length,
        timestamp: Date.now()
      });
      
      // Process catalogs with limits
      for (const catalog of catalogsToScan) {
        try {
          const schemas = await unityCatalog.listSchemas(envId, catalog.name, userToken);
          console.log(`[${++catalogsProcessed}/${catalogsToScan.length}] Found ${schemas.length} schemas in ${catalog.name}`);
          
          // Limit schemas per catalog to prevent rate limiting
          const limitedSchemas = schemas.slice(0, MAX_SCHEMAS_PER_CATALOG);
          if (schemas.length > MAX_SCHEMAS_PER_CATALOG) {
            console.log(`  ⚠️  Limiting to first ${MAX_SCHEMAS_PER_CATALOG} schemas in ${catalog.name}`);
          }
          
          // Process schemas
          for (const schema of limitedSchemas) {
            try {
              // Fetch all asset types in parallel
              const [tables, volumes, functions, models] = await Promise.all([
                unityCatalog.listTables(envId, catalog.name, schema.name, userToken),
                unityCatalog.listVolumes(envId, catalog.name, schema.name, userToken),
                unityCatalog.listFunctions(envId, catalog.name, schema.name, userToken),
                unityCatalog.listModels(envId, catalog.name, schema.name, userToken),
              ]);
              
              // Add tables
              tables.forEach(table => {
                allAssets.push({
                  ...table,
                  id: `${envId}:${table.full_name}`,
                  assetType: 'table',
                  catalog_name: catalog.name,
                  schema_name: schema.name,
                  fullName: table.full_name || `${catalog.name}.${schema.name}.${table.name}`,
                  environmentId: envId,
                  tags: table.properties || {},
                });
              });
              
              // Add volumes
              volumes.forEach(volume => {
                allAssets.push({
                  ...volume,
                  id: `${envId}:${volume.full_name}`,
                  assetType: 'volume',
                  catalog_name: catalog.name,
                  schema_name: schema.name,
                  fullName: volume.full_name || `${catalog.name}.${schema.name}.${volume.name}`,
                  environmentId: envId,
                  tags: {},
                });
              });
              
              // Add functions
              functions.forEach(func => {
                allAssets.push({
                  ...func,
                  id: `${envId}:${func.full_name}`,
                  assetType: 'function',
                  catalog_name: catalog.name,
                  schema_name: schema.name,
                  fullName: func.full_name || `${catalog.name}.${schema.name}.${func.name}`,
                  environmentId: envId,
                  tags: {},
                });
              });
              
              // Add models
              models.forEach(model => {
                allAssets.push({
                  ...model,
                  id: `${envId}:${model.full_name}`,
                  assetType: 'model',
                  catalog_name: catalog.name,
                  schema_name: schema.name,
                  fullName: model.full_name || `${catalog.name}.${schema.name}.${model.name}`,
                  environmentId: envId,
                  tags: {},
                });
              });
              
            } catch (error) {
              if (error.response?.status !== 429) {
                console.error(`Error fetching assets from ${catalog.name}.${schema.name}:`, error.message);
              }
            }
          }
          
          // Update cache with partial results after each catalog
          cache.set(cacheKey, { data: allAssets, timestamp: Date.now() });
          cache.set(metadataKey, {
            isLoading: true,
            catalogsProcessed,
            totalCatalogs: catalogsToScan.length,
            currentAssetCount: allAssets.length,
            timestamp: Date.now()
          });
          
        } catch (error) {
          if (error.response?.status !== 429) {
            console.error(`Error fetching schemas from catalog ${catalog.name}:`, error.message);
          }
        }
      }
      
      const tables = allAssets.filter(a => a.assetType === 'table').length;
      const volumes = allAssets.filter(a => a.assetType === 'volume').length;
      const functions = allAssets.filter(a => a.assetType === 'function').length;
      const models = allAssets.filter(a => a.assetType === 'model').length;
      
      console.log(`✅ Successfully fetched ${allAssets.length} assets from ${envId}`);
      console.log(`   📊 Breakdown: ${tables} tables, ${volumes} volumes, ${functions} functions, ${models} models`);
      console.log(`   📁 Processed ${catalogsProcessed} catalogs`);
      
      cache.set(cacheKey, { data: allAssets, timestamp: Date.now() });
      cache.set(metadataKey, {
        isLoading: false,
        catalogsProcessed,
        totalCatalogs: catalogsProcessed,
        currentAssetCount: allAssets.length,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error(`Error fetching all assets from ${envId}:`, error.message);
      cache.set(metadataKey, {
        isLoading: false,
        error: error.message,
        timestamp: Date.now()
      });
    }
    
    return allAssets;
  },
  
  // Get loading status for assets
  getLoadingStatus(envId) {
    const metadataKey = `all_assets:${envId}:metadata`;
    const metadata = cache.get(metadataKey);
    
    if (!metadata) {
      return { isLoading: false, catalogsProcessed: 0, totalCatalogs: 0 };
    }
    
    return metadata;
  },
};

export default {
  createDatabricksClient,
  setUserToken,
  getUserToken,
  unityCatalog,
  deltaSharing,
};
