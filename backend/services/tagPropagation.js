/**
 * Tag Propagation Service
 * 
 * Handles hierarchical tag application for Delta Sharing:
 * - Tags defined at share level cascade to all child assets
 * - PROVIDED shares: Apply tags to actual Unity Catalog objects
 * - CONSUMED shares: Apply tags to registered/foreign catalog objects
 */

import { deltaSharing, unityCatalog } from './databricksClient.js';

/**
 * Apply tags hierarchically to a share and all its children
 * @param {string} envId - Environment ID
 * @param {string} shareName - Share name
 * @param {object} tags - Tags to apply {key: value}
 * @param {string} direction - 'provided' or 'consumed'
 * @param {object} options - Options like scope (catalog, schema, table, column)
 */
export async function applyTagsToShare(envId, shareName, tags, direction, options = {}) {
  const {
    scope = 'all', // 'catalog', 'schema', 'table', 'column', 'all'
    catalogName = null,
    schemaName = null,
    tableName = null,
    columnNames = [],
  } = options;

  console.log(`🏷️  Applying tags to ${direction} share: ${shareName} (scope: ${scope})`);

  const results = {
    success: [],
    failed: [],
    skipped: [],
  };

  try {
    // Get all assets in this share
    // Shares map directly to catalogs (share name = catalog name)
    const allAssets = await deltaSharing.getAllShareTables(envId);
    const shareAssets = allAssets.filter(a => a.catalog_name === shareName);

    console.log(`Found ${shareAssets.length} assets in share/catalog ${shareName}`);

    // Filter assets based on scope
    let assetsToTag = shareAssets;
    
    if (catalogName) {
      assetsToTag = assetsToTag.filter(a => a.catalog_name === catalogName);
    }
    
    if (schemaName) {
      assetsToTag = assetsToTag.filter(a => a.schema_name === schemaName);
    }
    
    if (tableName) {
      assetsToTag = assetsToTag.filter(a => a.name === tableName);
    }

    console.log(`Filtered to ${assetsToTag.length} assets based on scope`);

    // Apply tags based on direction
    for (const asset of assetsToTag) {
      try {
        if (direction === 'provided') {
          // For PROVIDED shares: Update actual Unity Catalog objects
          await applyTagsToUnityCatalogAsset(envId, asset, tags, scope, columnNames);
          results.success.push({
            asset: asset.fullName,
            type: 'unity_catalog',
            tags,
          });
        } else if (direction === 'consumed') {
          // For CONSUMED shares: Update registered/foreign catalog objects
          await applyTagsToRegisteredAsset(envId, asset, tags, scope, columnNames);
          results.success.push({
            asset: asset.fullName,
            type: 'registered_catalog',
            tags,
          });
        }
      } catch (error) {
        console.error(`Failed to tag ${asset.fullName}:`, error.message);
        results.failed.push({
          asset: asset.fullName,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      results,
      summary: {
        total: assetsToTag.length,
        succeeded: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length,
      },
    };
  } catch (error) {
    console.error(`Error applying tags to share ${shareName}:`, error);
    throw error;
  }
}

/**
 * Apply tags to actual Unity Catalog objects (for PROVIDED shares)
 */
async function applyTagsToUnityCatalogAsset(envId, asset, tags, scope, columnNames) {
  const { catalog_name, schema_name, name } = asset;

  // Note: Unity Catalog tag API endpoints:
  // - Catalog tags: PUT /api/2.1/unity-catalog/catalogs/{catalog}/tags/{key}
  // - Schema tags: PUT /api/2.1/unity-catalog/schemas/{full_name}/tags/{key}
  // - Table tags: PUT /api/2.1/unity-catalog/tables/{full_name}/tags/{key}
  // - Column tags: PUT /api/2.1/unity-catalog/tables/{full_name}/columns/{column}/tags/{key}

  const fullName = `${catalog_name}.${schema_name}.${name}`;

  // For now, log what we would do (actual API calls require proper auth and endpoints)
  console.log(`✓ Would apply tags to UC object: ${fullName}`);
  console.log(`  Tags:`, tags);
  console.log(`  Scope:`, scope);
  
  if (scope === 'column' && columnNames.length > 0) {
    console.log(`  Columns:`, columnNames);
  }

  // TODO: Implement actual Unity Catalog tag API calls
  // Example:
  // for (const [key, value] of Object.entries(tags)) {
  //   await unityCatalog.setTableTag(envId, fullName, key, value);
  // }
}

/**
 * Apply tags to registered/foreign catalog objects (for CONSUMED shares)
 */
async function applyTagsToRegisteredAsset(envId, asset, tags, scope, columnNames) {
  const { catalog_name, schema_name, name } = asset;
  const fullName = `${catalog_name}.${schema_name}.${name}`;

  // For consumed shares, we apply tags to the registered foreign catalog
  console.log(`✓ Would apply tags to registered catalog object: ${fullName}`);
  console.log(`  Tags:`, tags);
  console.log(`  Scope:`, scope);
  
  if (scope === 'column' && columnNames.length > 0) {
    console.log(`  Columns:`, columnNames);
  }

  // TODO: Implement actual foreign catalog tag API calls
  // The API is the same as Unity Catalog, but the catalog is a foreign/registered catalog
  // Example:
  // for (const [key, value] of Object.entries(tags)) {
  //   await unityCatalog.setTableTag(envId, fullName, key, value);
  // }
}

/**
 * Get all assets affected by a share-level policy
 * This helps preview what will be tagged
 */
export async function getAffectedAssets(envId, shareName, options = {}) {
  const {
    scope = 'all',
    catalogName = null,
    schemaName = null,
    tableName = null,
  } = options;

  try {
    const allAssets = await deltaSharing.getAllShareTables(envId);
    // Shares map directly to catalogs
    let shareAssets = allAssets.filter(a => a.catalog_name === shareName);

    // Apply filters
    if (catalogName) {
      shareAssets = shareAssets.filter(a => a.catalog_name === catalogName);
    }
    
    if (schemaName) {
      shareAssets = shareAssets.filter(a => a.schema_name === schemaName);
    }
    
    if (tableName) {
      shareAssets = shareAssets.filter(a => a.name === tableName);
    }

    // Group by type
    const grouped = {
      catalogs: new Set(),
      schemas: new Set(),
      tables: shareAssets.length,
      assets: shareAssets,
    };

    shareAssets.forEach(asset => {
      grouped.catalogs.add(asset.catalog_name);
      grouped.schemas.add(`${asset.catalog_name}.${asset.schema_name}`);
    });

    return {
      summary: {
        catalogs: grouped.catalogs.size,
        schemas: grouped.schemas.size,
        tables: grouped.tables,
      },
      assets: shareAssets,
    };
  } catch (error) {
    console.error(`Error getting affected assets for ${shareName}:`, error);
    throw error;
  }
}

export default {
  applyTagsToShare,
  getAffectedAssets,
};
