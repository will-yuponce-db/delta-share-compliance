import express from 'express';
import { deltaSharing, unityCatalog } from '../services/databricksClient.js';
import { getEnvironments } from '../config/databricks.js';
import axios from 'axios';
import { isShareProcessed, markShareAsProcessed } from '../data/sharesRegistry.js';

const router = express.Router();

// Helper function to auto-ingest agreements for NEW consumed shares only
async function autoIngestNewShares(envId, consumedShares) {
  // Filter to only NEW shares that haven't been processed yet
  const newShares = consumedShares.filter(share => !isShareProcessed(envId, share.name));
  
  if (newShares.length === 0) {
    return 0; // No new shares to process
  }
  
  console.log(`📥 Detected ${newShares.length} new consumed share(s) in ${envId}, checking for agreements...`);
  
  let ingestedCount = 0;
  
  // Process in small batches to avoid overwhelming the API
  const batchSize = 3;
  for (let i = 0; i < newShares.length; i += batchSize) {
    const batch = newShares.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (share) => {
      try {
        // Try to ingest agreement for this share (silent mode)
        const response = await axios.post('http://localhost:3001/api/agreements/ingest', {
          environment: envId,
          shareName: share.name,
          silent: true,
        });
        
        if (response.data.success) {
          console.log(`✅ Auto-ingested agreement for new share: ${share.name}`);
          ingestedCount++;
        }
      } catch (error) {
        // Silently skip - no agreement found is normal
      } finally {
        // Mark as processed either way (so we don't keep trying)
        markShareAsProcessed(envId, share.name);
      }
    }));
  }
  
  if (ingestedCount > 0) {
    console.log(`📥 Successfully ingested ${ingestedCount} agreement(s) from ${newShares.length} new share(s)`);
  } else {
    console.log(`ℹ️  No agreements found in ${newShares.length} new share(s)`);
  }
  
  return ingestedCount;
}

// GET loading status for assets
router.get('/loading-status', async (req, res) => {
  try {
    const environments = getEnvironments();
    const statusByEnv = {};
    
    for (const env of environments) {
      statusByEnv[env.id] = deltaSharing.getLoadingStatus(env.id);
    }
    
    res.json(statusByEnv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get loading status', message: error.message });
  }
});

// GET all shares across all environments (using both Delta Sharing and catalogs)
router.get('/shares', async (req, res) => {
  try {
    const environments = getEnvironments();
    const { getAllAgreements } = await import('../data/agreementsStore.js');
    const agreements = getAllAgreements();
    const allShares = [];
    
    for (const env of environments) {
      try {
        // HYBRID APPROACH:
        // 1. Get Unity Catalog shares we've CREATED (provided shares)
        // 2. Get catalogs with type FOREIGN/DELTASHARING (consumed shares)
        // 3. Use catalog-based asset loading (which works)
        
        let providedShareNames = [];
        try {
          const ucShares = await deltaSharing.listShares(env.id);
          providedShareNames = ucShares.map(s => s.name);
          console.log(`Found ${providedShareNames.length} provided share(s) in ${env.id}`);
        } catch (error) {
          console.log(`No provided shares found in ${env.id}:`, error.message);
        }
        
        // Get ALL catalogs (to find consumed shares as foreign catalogs)
        const allCatalogs = await unityCatalog.listCatalogs(env.id);
        console.log(`Found ${allCatalogs.length} catalog(s) in ${env.id}`);
        
        // Separate catalogs into consumed vs provided
        const consumedCatalogs = allCatalogs.filter(c => 
          c.catalog_type === 'DELTASHARING' || 
          c.catalog_type === 'FOREIGN'
        );
        
        console.log(`   - ${consumedCatalogs.length} consumed (foreign) catalogs`);
        console.log(`   - ${providedShareNames.length} provided shares`);
        
        // Get priority catalogs from agreements
        const priorityCatalogs = [...new Set(
          agreements.flatMap(a => a.shares || [])
        )];
        
        // Load assets from catalogs (existing working approach)
        const allShareAssets = await deltaSharing.getAllShareTables(env.id, priorityCatalogs);
        
        // Build a set of catalog names that have been scanned
        const scannedCatalogs = new Set(allShareAssets.map(t => t.catalog_name));
        
        // Helper function to validate asset compliance
        const validateAsset = (asset, agreements) => {
          const violations = [];
          
          for (const agreement of agreements) {
            // Check if this asset is in scope for this agreement
            // Shares map to catalogs (share name = catalog name)
            const inScope = 
              !agreement.shares || 
              agreement.shares.length === 0 || 
              agreement.shares.includes(asset.catalog_name);
            
            if (!inScope) continue;
            
            for (const req of agreement.parsedRequirements || []) {
              for (const [tagKey, requiredValue] of Object.entries(req.requiredTags)) {
                const actualValue = asset.tags?.[tagKey];
                
                if (!actualValue) {
                  violations.push({
                    type: 'missing',
                    tag: tagKey,
                    requiredValue,
                    severity: req.severity,
                  });
                } else if (actualValue !== requiredValue) {
                  violations.push({
                    type: 'incorrect',
                    tag: tagKey,
                    actualValue,
                    requiredValue,
                    severity: req.severity,
                  });
                }
              }
            }
          }
          
          return violations;
        };
        
        // Calculate compliance per catalog/share
        const catalogCompliance = {};
        allShareAssets.forEach(asset => {
          const catalogName = asset.catalog_name;
          if (!catalogCompliance[catalogName]) {
            catalogCompliance[catalogName] = {
              total: 0,
              compliant: 0,
              violations: 0,
            };
          }
          
          catalogCompliance[catalogName].total++;
          const violations = validateAsset(asset, agreements);
          
          if (violations.length === 0) {
            catalogCompliance[catalogName].compliant++;
          } else {
            catalogCompliance[catalogName].violations += violations.length;
          }
        });
        
        // Use a Map to deduplicate by name
        const sharesMap = new Map();
        
        // 1. Add PROVIDED shares (Unity Catalog shares we created)
        // Note: We don't fetch detailed share info here to avoid excessive API calls
        // Share details are fetched on-demand when user expands a specific share
        for (const share of providedShareNames) {
          // Count assets by catalog name (from already-loaded data)
          const tableCount = allShareAssets.filter(t => t.catalog_name === share).length;
          const compliance = catalogCompliance[share] || { total: 0, compliant: 0, violations: 0 };
          const hasAgreement = agreements.some(a => a.shares?.includes(share));
          
          sharesMap.set(share, {
            name: share,
            id: share,
            comment: `Shared data from multiple catalogs`,
            environmentId: env.id,
            environmentName: env.name,
            tableCount: tableCount,
            direction: 'provided',
            fullyScanned: scannedCatalogs.has(share),
            hasAgreement,
            compliance: {
              total: compliance.total,
              compliant: compliance.compliant,
              violations: compliance.violations,
              percentage: compliance.total > 0 ? Math.round((compliance.compliant / compliance.total) * 100) : 100,
              status: !hasAgreement ? 'no_agreement' : compliance.total === 0 ? 'unknown' : compliance.violations === 0 ? 'compliant' : 'non_compliant',
            },
          });
        }
        
        // 2. Add CONSUMED shares (foreign/deltasharing catalogs)
        for (const catalog of consumedCatalogs) {
          const tableCount = allShareAssets.filter(t => t.catalog_name === catalog.name).length;
          const compliance = catalogCompliance[catalog.name] || { total: 0, compliant: 0, violations: 0 };
          const hasAgreement = agreements.some(a => a.shares?.includes(catalog.name));
          
          sharesMap.set(catalog.name, {
            name: catalog.name,
            id: catalog.name,
            comment: catalog.comment,
            owner: catalog.owner,
            created_at: catalog.created_at,
            catalog_type: catalog.catalog_type,
            environmentId: env.id,
            environmentName: env.name,
            tableCount: tableCount,
            direction: 'consumed',
            fullyScanned: scannedCatalogs.has(catalog.name),
            hasAgreement,
            compliance: {
              total: compliance.total,
              compliant: compliance.compliant,
              violations: compliance.violations,
              percentage: compliance.total > 0 ? Math.round((compliance.compliant / compliance.total) * 100) : 100,
              status: !hasAgreement ? 'no_agreement' : compliance.total === 0 ? 'unknown' : compliance.violations === 0 ? 'compliant' : 'non_compliant',
            },
          });
        }
        
        // Convert Map to array
        const shares = Array.from(sharesMap.values());
        allShares.push(...shares);
        
        // Auto-ingest agreements for NEW consumed shares only (runs in background, non-blocking)
        const consumedShares = shares.filter(s => s.direction === 'consumed');
        if (consumedShares.length > 0) {
          // Run async without blocking the response
          autoIngestNewShares(env.id, consumedShares).catch(err => {
            console.log(`⚠️  Background agreement ingestion error for ${env.id}:`, err.message);
          });
        }
      } catch (error) {
        console.error(`Error fetching catalogs from ${env.id}:`, error.message);
        if (error.response) {
          console.error(`  Status: ${error.response.status}`);
          console.error(`  Data: ${JSON.stringify(error.response.data)}`);
          if (error.response.status === 403) {
            console.error(`  ⚠️  403 Forbidden - The user token may not have Unity Catalog permissions.`);
            console.error(`  ⚠️  Add 'unity-catalog' or 'all-apis' scope to your Databricks App.`);
          }
        }
      }
    }
    
    res.json(allShares);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shares', message: error.message });
  }
});

// GET single share (catalog) with all asset types
router.get('/shares/:shareId', async (req, res) => {
  try {
    const environments = getEnvironments();
    
    // Try to find the catalog in any environment
    for (const env of environments) {
      try {
        const schemas = await unityCatalog.listSchemas(env.id, req.params.shareId);
        
        // Fetch all assets for each schema
        const schemasWithAssets = await Promise.all(
          schemas.map(async (schema) => {
            try {
              const [tables, volumes, functions, models] = await Promise.all([
                unityCatalog.listTables(env.id, req.params.shareId, schema.name),
                unityCatalog.listVolumes(env.id, req.params.shareId, schema.name),
                unityCatalog.listFunctions(env.id, req.params.shareId, schema.name),
                unityCatalog.listModels(env.id, req.params.shareId, schema.name),
              ]);
              
              // Combine all assets with proper naming
              const allAssets = [
                ...tables.map(t => ({
                  ...t,
                  assetType: 'table',
                  fullName: t.full_name || `${req.params.shareId}.${schema.name}.${t.name}`,
                })),
                ...volumes.map(v => ({
                  ...v,
                  assetType: 'volume',
                  fullName: v.full_name || `${req.params.shareId}.${schema.name}.${v.name}`,
                })),
                ...functions.map(f => ({
                  ...f,
                  assetType: 'function',
                  fullName: f.full_name || `${req.params.shareId}.${schema.name}.${f.name}`,
                })),
                ...models.map(m => ({
                  ...m,
                  assetType: 'model',
                  fullName: m.full_name || `${req.params.shareId}.${schema.name}.${m.name}`,
                })),
              ];
              
              return {
                ...schema,
                assets: allAssets,
                tables: tables,
                volumes: volumes,
                functions: functions,
                models: models,
              };
            } catch (error) {
              console.error(`Error fetching assets for schema ${schema.name}:`, error.message);
              return { 
                ...schema, 
                assets: [],
                tables: [],
                volumes: [],
                functions: [],
                models: [],
              };
            }
          })
        );
        
        return res.json({
          name: req.params.shareId,
          id: req.params.shareId,
          environmentId: env.id,
          schemas: schemasWithAssets,
        });
      } catch (error) {
        // Continue to next environment
        continue;
      }
    }
    
    res.status(404).json({ error: 'Catalog not found' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch catalog', message: error.message });
  }
});

// GET tables for a specific share (efficient - doesn't fetch all)
router.get('/tables/:envId/:shareName', async (req, res) => {
  try {
    const { envId, shareName } = req.params;
    
    console.log(`📊 Fetching assets for share: ${shareName}`);
    
    // Best approach: Use the share's explicit objects (most accurate)
    try {
      const shareDetails = await deltaSharing.getShare(envId, shareName, true);
      console.log(`   Share has ${shareDetails.objects?.length || 0} explicit objects`);
      
      if (shareDetails.objects && shareDetails.objects.length > 0) {
        // Map share objects to asset format
        const shareObjects = shareDetails.objects.map(obj => {
          const parts = obj.name.split('.');
          const assetType = obj.data_object_type?.toLowerCase() || 'table';
          
          // Handle different object types
          if (assetType === 'schema') {
            // Schema object: catalog.schema
            const [catalogName, schemaName] = parts.length === 2 ? parts : [parts[0], parts[1]];
            return {
              name: schemaName,
              catalog_name: catalogName,
              schema_name: schemaName,
              fullName: obj.name,
              assetType: 'schema',
              share_name: shareName,
              shared_as: obj.shared_as,
              added_at: obj.added_at,
              added_by: obj.added_by,
              status: obj.status,
              ...obj,
            };
          } else {
            // Table/Volume/Function/Model: catalog.schema.object
            const [catalogName, schemaName, objectName] = parts.length === 3 ? parts : [shareName, parts[0], parts[1]];
            return {
              name: objectName,
              catalog_name: catalogName,
              schema_name: schemaName,
              fullName: obj.name,
              assetType: assetType,
              share_name: shareName,
              shared_as: obj.shared_as,
              added_at: obj.added_at,
              added_by: obj.added_by,
              cdf_enabled: obj.cdf_enabled,
              status: obj.status,
              ...obj,
            };
          }
        });
        
        const allResults = shareObjects;
        
        console.log(`   Returning ${allResults.length} total assets from share`);
        console.log(`   Asset breakdown:`, {
          schemas: allResults.filter(a => a.assetType === 'schema').length,
          tables: allResults.filter(a => a.assetType === 'table').length,
          volumes: allResults.filter(a => a.assetType === 'volume').length,
          functions: allResults.filter(a => a.assetType === 'function').length,
          models: allResults.filter(a => a.assetType === 'model').length,
        });
        
        return res.json(allResults);
      }
      
      console.log(`   Share has no explicit objects`);
    } catch (shareError) {
      console.log(`   Could not fetch share details: ${shareError.message}`);
    }
    
    // Fallback: Try to find assets in cache by catalog name
    console.log(`   Attempting fallback: looking for catalog '${shareName}' in cache`);
    const allAssets = await deltaSharing.getAllShareTables(envId);
    const shareAssets = allAssets.filter(a => a.catalog_name === shareName);
    
    if (shareAssets.length > 0) {
      // Don't auto-generate schemas from cached assets - only show what's explicitly in the share
      console.log(`   Returning ${shareAssets.length} assets from cache`);
      return res.json(shareAssets);
    }
    
    // No data available
    console.log(`   No assets found for share '${shareName}'`);
    res.json([]);
  } catch (error) {
    console.error('Error fetching share tables:', error);
    res.status(500).json({ error: 'Failed to fetch share tables', message: error.message });
  }
});

// GET all tables across all shares and environments
router.get('/tables', async (req, res) => {
  try {
    const environments = getEnvironments();
    const allTables = [];
    
    for (const env of environments) {
      try {
        const tables = await deltaSharing.getAllShareTables(env.id);
        allTables.push(...tables);
      } catch (error) {
        console.error(`Error fetching tables from ${env.id}:`, error.message);
      }
    }
    
    res.json(allTables);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tables', message: error.message });
  }
});

// GET single table
router.get('/tables/:tableId', async (req, res) => {
  try {
    const environments = getEnvironments();
    
    // tableId format: envId:shareName.schemaName.tableName
    const [envId, fullTableName] = req.params.tableId.split(':');
    
    if (!envId || !fullTableName) {
      return res.status(400).json({ error: 'Invalid table ID format. Expected: envId:share.schema.table' });
    }
    
    const table = await unityCatalog.getTable(envId, fullTableName);
    
    if (table) {
      res.json({
        ...table,
        environmentId: envId,
      });
    } else {
      res.status(404).json({ error: 'Table not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch table', message: error.message });
  }
});

// PUT update table tags
router.put('/tables/:tableId/tags', async (req, res) => {
  try {
    const { tags } = req.body;
    const [envId, fullTableName] = req.params.tableId.split(':');
    
    if (!envId || !fullTableName) {
      return res.status(400).json({ error: 'Invalid table ID format' });
    }
    
    await unityCatalog.setTags(envId, fullTableName, tags);
    const updated = await unityCatalog.getTable(envId, fullTableName);
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tags', message: error.message });
  }
});

// DELETE a specific tag from a table
router.delete('/tables/:tableId/tags/:tagKey', async (req, res) => {
  try {
    const [envId, fullTableName] = req.params.tableId.split(':');
    
    if (!envId || !fullTableName) {
      return res.status(400).json({ error: 'Invalid table ID format' });
    }
    
    // Get current tags
    const currentTags = await unityCatalog.getTags(envId, fullTableName);
    
    // Remove the specified tag
    delete currentTags[req.params.tagKey];
    
    // Update tags
    await unityCatalog.setTags(envId, fullTableName, currentTags);
    const updated = await unityCatalog.getTable(envId, fullTableName);
    
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete tag', message: error.message });
  }
});

// GET table columns
router.get('/tables/:envId/:catalogName/:schemaName/:tableName/columns', async (req, res) => {
  try {
    const { envId, catalogName, schemaName, tableName } = req.params;
    
    // Fetch columns using Unity Catalog API
    const columns = await unityCatalog.listTableColumns(envId, catalogName, schemaName, tableName);
    
    res.json({
      catalog: catalogName,
      schema: schemaName,
      table: tableName,
      columns: columns.map(col => ({
        name: col.name,
        type: col.type_text || col.type_name || 'UNKNOWN',
        comment: col.comment || '',
        nullable: col.nullable !== false,
        position: col.position,
      })),
    });
  } catch (error) {
    console.error('Error fetching table columns:', error);
    res.status(500).json({ error: 'Failed to fetch columns', message: error.message });
  }
});

// GET test endpoint to verify share details API
router.get('/test-share-details/:shareName', async (req, res) => {
  try {
    const { shareName } = req.params;
    const { deltaSharing } = await import('../services/databricksClient.js');
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 Testing API endpoints for share: ${shareName}`);
    console.log('='.repeat(80));
    
    const results = {
      shareName,
      timestamp: new Date().toISOString(),
      apis: {},
    };
    
    // Test 1: Unity Catalog Shares API
    try {
      console.log(`\n1️⃣  Testing: GET /api/2.1/unity-catalog/shares/${shareName}?include_shared_data=true`);
      const shareDetails = await deltaSharing.getShare('current', shareName, true);
      console.log(`   ✅ Success! Response structure:`);
      console.log(`      - name: ${shareDetails.name}`);
      console.log(`      - comment: ${shareDetails.comment || '(none)'}`);
      console.log(`      - objects: ${shareDetails.objects?.length || 0} items`);
      
      if (shareDetails.objects && shareDetails.objects.length > 0) {
        console.log(`      - Sample object:`, JSON.stringify(shareDetails.objects[0], null, 2));
      }
      
      results.apis.unityCatalogShares = {
        success: true,
        endpoint: `/api/2.1/unity-catalog/shares/${shareName}`,
        data: shareDetails,
        objectCount: shareDetails.objects?.length || 0,
        objects: shareDetails.objects || [],
      };
      
      // Try to get share permissions/objects
      try {
        console.log(`   📋 Checking share permissions (recipients)...`);
        const shareObjects = await deltaSharing.listShareObjects('current', shareName);
        if (shareObjects) {
          console.log(`      Recipients: ${shareObjects.privilege_assignments?.length || 0}`);
          results.apis.shareRecipients = {
            success: true,
            data: shareObjects,
          };
        }
      } catch (permError) {
        console.log(`      No permissions endpoint available`);
      }
      
      // Try to get what tables are granted TO this share
      try {
        console.log(`   📋 Checking what tables are granted to this share...`);
        const shareGrants = await deltaSharing.listTablesInShare('current', shareName);
        if (shareGrants) {
          console.log(`      Grants found:`, JSON.stringify(shareGrants, null, 2));
          results.apis.shareGrants = {
            success: true,
            data: shareGrants,
          };
        }
      } catch (grantsError) {
        console.log(`      Grants endpoint not available: ${grantsError.message}`);
      }
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      results.apis.unityCatalogShares = {
        success: false,
        error: error.message,
      };
    }
    
    // Test 1b: Check if there's a catalog with the same name
    try {
      console.log(`\n1️⃣b Testing: Does a catalog named '${shareName}' exist?`);
      const { unityCatalog } = await import('../services/databricksClient.js');
      const catalogs = await unityCatalog.listCatalogs('current');
      const matchingCatalog = catalogs.find(c => c.name === shareName);
      
      if (matchingCatalog) {
        console.log(`   ✅ Found catalog: ${matchingCatalog.name}`);
        console.log(`      - Type: ${matchingCatalog.catalog_type || 'MANAGED'}`);
        console.log(`      - Comment: ${matchingCatalog.comment || '(none)'}`);
        
        results.apis.matchingCatalog = {
          success: true,
          found: true,
          catalog: matchingCatalog,
        };
        
        // If catalog exists, try to list its tables
        try {
          console.log(`   📋 Listing tables in catalog ${shareName}...`);
          const allAssets = await deltaSharing.getAllShareTables('current');
          const catalogTables = allAssets.filter(a => a.catalog_name === shareName);
          console.log(`      Found ${catalogTables.length} tables/assets`);
          if (catalogTables.length > 0) {
            console.log(`      Sample:`, catalogTables.slice(0, 3).map(t => t.fullName));
          }
          
          results.apis.catalogTables = {
            success: true,
            count: catalogTables.length,
            tables: catalogTables,
          };
        } catch (tablesError) {
          console.log(`      Could not list tables: ${tablesError.message}`);
        }
      } else {
        console.log(`   ℹ️  No catalog named '${shareName}' found`);
        results.apis.matchingCatalog = {
          success: true,
          found: false,
        };
      }
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      results.apis.matchingCatalog = {
        success: false,
        error: error.message,
      };
    }
    
    // Test 2: List providers (to find the right provider for the share)
    try {
      console.log(`\n2️⃣  Testing: GET /api/2.1/data-sharing/providers`);
      const providers = await deltaSharing.listProviders('current');
      console.log(`   ✅ Found ${providers.length} providers`);
      if (providers.length > 0) {
        console.log(`      - Providers: ${providers.map(p => p.name).join(', ')}`);
      }
      
      results.apis.providers = {
        success: true,
        providers: providers,
      };
      
      // Test 3: Try to get share from each provider
      if (providers.length > 0) {
        console.log(`\n3️⃣  Testing provider-specific share details...`);
        for (const provider of providers.slice(0, 3)) { // Test first 3 providers
          try {
            console.log(`   Testing: GET /api/2.1/data-sharing/providers/${provider.name}/shares/${shareName}`);
            const providerShare = await deltaSharing.getShareFromProvider('current', provider.name, shareName);
            if (providerShare) {
              console.log(`   ✅ Found share in provider: ${provider.name}`);
              console.log(`      - Share data:`, JSON.stringify(providerShare, null, 2));
              
              results.apis.providerShares = results.apis.providerShares || [];
              results.apis.providerShares.push({
                provider: provider.name,
                success: true,
                data: providerShare,
              });
            }
          } catch (error) {
            console.log(`   ⏭️  Not in provider ${provider.name}`);
          }
        }
      }
    } catch (error) {
      console.log(`   ❌ Failed to list providers: ${error.message}`);
      results.apis.providers = {
        success: false,
        error: error.message,
      };
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ Test complete for share: ${shareName}`);
    console.log('='.repeat(80) + '\n');
    
    res.json(results);
  } catch (error) {
    console.error('Error testing share details:', error);
    res.status(500).json({ error: 'Failed to test share details', message: error.message });
  }
});

// POST get accurate asset counts for specific shares
router.post('/shares/asset-counts', async (req, res) => {
  try {
    const { envId = 'current', shareNames } = req.body;
    
    if (!shareNames || !Array.isArray(shareNames)) {
      return res.status(400).json({ error: 'shareNames array is required' });
    }
    
    console.log(`📊 Fetching accurate asset counts for ${shareNames.length} shares...`);
    
    const { deltaSharing } = await import('../services/databricksClient.js');
    const counts = await deltaSharing.getShareObjectCounts(envId, shareNames);
    
    console.log(`✅ Retrieved counts:`, counts);
    
    res.json(counts);
  } catch (error) {
    console.error('Error fetching share asset counts:', error);
    res.status(500).json({ error: 'Failed to fetch asset counts', message: error.message });
  }
});

// GET providers (test endpoint for Delta Sharing provider API)
router.get('/providers', async (req, res) => {
  try {
    const { deltaSharing } = await import('../services/databricksClient.js');
    const providers = await deltaSharing.listProviders('current');
    res.json(providers);
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers', message: error.message });
  }
});

// GET share from provider (test endpoint)
router.get('/providers/:providerName/shares/:shareName', async (req, res) => {
  try {
    const { providerName, shareName } = req.params;
    const { deltaSharing } = await import('../services/databricksClient.js');
    const shareDetails = await deltaSharing.getShareFromProvider('current', providerName, shareName);
    
    if (!shareDetails) {
      return res.status(404).json({ error: 'Share not found or provider API not available' });
    }
    
    res.json(shareDetails);
  } catch (error) {
    console.error('Error fetching share from provider:', error);
    res.status(500).json({ error: 'Failed to fetch share details', message: error.message });
  }
});

export default router;
