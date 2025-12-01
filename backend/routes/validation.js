import express from 'express';
import { deltaSharing, clearCache as clearDatabricksCache } from '../services/databricksClient.js';
import { getAllAgreements } from '../data/agreementsStore.js';
import { getEnvironments } from '../config/databricks.js';

const router = express.Router();

// Cache for validation results
const validationCache = new Map();
const VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Validate a single asset against agreement requirements
const validateAsset = (asset, agreements) => {
  const violations = [];
  
  // Get agreements for this asset's environment
  const relevantAgreements = agreements.filter(agreement => 
    agreement.environments.includes(asset.environmentId)
  );
  
  // Check each agreement's requirements
  relevantAgreements.forEach(agreement => {
    // Check if this agreement applies to this asset
    // Shares map to catalogs, so check against catalog_name
    const agreementApplies = 
      !agreement.shares || 
      agreement.shares.length === 0 || 
      agreement.shares.includes(asset.catalog_name);
    
    if (!agreementApplies) return;
    
    agreement.parsedRequirements?.forEach(req => {
      // Check if requirement applies to this asset (scope check)
      const scopeMatches = req.scope === '*.*.*' || 
        req.scope === 'all' ||
        req.scope.includes(asset.catalog_name) ||
        req.scope.includes(asset.name);
      
      if (scopeMatches) {
        // Check if required tags are present
        Object.entries(req.requiredTags).forEach(([tagKey, tagValue]) => {
          const assetTagValue = asset.properties?.[tagKey] || asset.tags?.[tagKey];
          
          if (!assetTagValue) {
            violations.push({
              agreementId: agreement.id,
              agreementName: agreement.name,
              severity: req.severity,
              tagKey,
              expectedValue: tagValue,
              actualValue: null,
              reason: req.reason,
            });
          } else if (assetTagValue !== tagValue) {
            violations.push({
              agreementId: agreement.id,
              agreementName: agreement.name,
              severity: req.severity,
              tagKey,
              expectedValue: tagValue,
              actualValue: assetTagValue,
              reason: req.reason,
            });
          }
        });
      }
    });
  });
  
  return {
    assetId: asset.id || asset.fullName,
    assetName: asset.name,
    fullName: asset.fullName,
    environmentId: asset.environmentId,
    compliant: violations.length === 0,
    violations,
  };
};

// GET compliance overview (with caching)
router.get('/overview', async (req, res) => {
  try {
    const cacheKey = 'compliance_overview';
    const cached = validationCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < VALIDATION_CACHE_TTL) {
      console.log('✅ Returning cached compliance overview');
      return res.json(cached.data);
    }
    
    const environments = getEnvironments();
    const agreements = getAllAgreements();
    
    // Quick response: Just get already-cached assets, don't fetch new data
    const detailedAssets = [];
    
    for (const env of environments) {
      try {
        // Only use already-cached data - don't trigger new fetches
        const assets = await deltaSharing.getAllShareTables(env.id);
        detailedAssets.push(...assets);
      } catch (error) {
        console.error(`Error fetching data from ${env.id}:`, error.message);
      }
    }
    
    console.log(`⚡ Quick validation of ${detailedAssets.length} cached assets`);
    
    // If no assets yet, return a default response
    if (detailedAssets.length === 0) {
      const defaultOverview = {
        overall: {
          totalAssets: 0,
          totalCatalogs: 0,
          catalogsScanned: 0,
          compliantAssets: 0,
          nonCompliantAssets: 0,
          criticalViolations: 0,
          compliancePercentage: 0,
          note: 'Loading assets... Please wait.',
        },
        byEnvironment: [],
        lastUpdated: new Date().toISOString(),
      };
      
      // Don't cache empty results
      return res.json(defaultOverview);
    }
    
    // Validate detailed assets
    const results = detailedAssets.map(asset => validateAsset(asset, agreements));
    
    // Calculate overall stats
    const compliantAssets = results.filter(r => r.compliant).length;
    const criticalViolations = results.reduce((count, r) => {
      return count + r.violations.filter(v => v.severity === 'critical').length;
    }, 0);
    
    // Group by environment
    const byEnvironment = {};
    results.forEach(result => {
      if (!byEnvironment[result.environmentId]) {
        byEnvironment[result.environmentId] = {
          environmentId: result.environmentId,
          totalAssets: 0,
          compliantAssets: 0,
        };
      }
      byEnvironment[result.environmentId].totalAssets++;
      if (result.compliant) {
        byEnvironment[result.environmentId].compliantAssets++;
      }
    });
    
    // Calculate percentages
    const environmentStats = Object.values(byEnvironment).map(env => ({
      ...env,
      compliancePercentage: env.totalAssets > 0 
        ? Math.round((env.compliantAssets / env.totalAssets) * 100)
        : 0,
    }));
    
    // Get unique catalogs from assets
    const uniqueCatalogs = new Set(detailedAssets.map(a => a.catalog_name));
    
    const overview = {
      overall: {
        totalAssets: detailedAssets.length,
        totalCatalogs: uniqueCatalogs.size,
        catalogsScanned: uniqueCatalogs.size,
        compliantAssets,
        nonCompliantAssets: detailedAssets.length - compliantAssets,
        criticalViolations,
        compliancePercentage: detailedAssets.length > 0 
          ? Math.round((compliantAssets / detailedAssets.length) * 100)
          : 0,
        note: `Showing compliance for ${uniqueCatalogs.size} scanned shares`,
      },
      byEnvironment: environmentStats,
      lastUpdated: new Date().toISOString(),
    };
    
    // Cache the result
    validationCache.set(cacheKey, { data: overview, timestamp: Date.now() });
    
    res.json(overview);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get compliance overview', message: error.message });
  }
});

// GET catalog-level compliance summary
router.get('/catalog-compliance', async (req, res) => {
  try {
    const cacheKey = 'catalog_compliance';
    const cached = validationCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < VALIDATION_CACHE_TTL) {
      console.log('Returning cached catalog compliance');
      return res.json(cached.data);
    }
    
    const environments = getEnvironments();
    const agreements = getAllAgreements();
    const catalogCompliance = {};
    
    for (const env of environments) {
      try {
        const assets = await deltaSharing.getAllShareTables(env.id);
        
        // Group assets by catalog
        const assetsByCatalog = {};
        assets.forEach(asset => {
          const catalogName = asset.catalog_name;
          if (!assetsByCatalog[catalogName]) {
            assetsByCatalog[catalogName] = [];
          }
          assetsByCatalog[catalogName].push(asset);
        });
        
        // Validate each catalog
        for (const [catalogName, catalogAssets] of Object.entries(assetsByCatalog)) {
          const results = catalogAssets.map(asset => validateAsset(asset, agreements));
          const compliant = results.filter(r => r.compliant).length;
          const total = results.length;
          const violations = results.filter(r => !r.compliant);
          
          catalogCompliance[catalogName] = {
            catalogName,
            environmentId: env.id,
            totalAssets: total,
            compliantAssets: compliant,
            nonCompliantAssets: total - compliant,
            compliancePercentage: total > 0 ? Math.round((compliant / total) * 100) : 0,
            isCompliant: compliant === total,
            violations: violations.length,
            criticalViolations: violations.reduce((count, v) => {
              return count + v.violations.filter(viol => viol.severity === 'critical').length;
            }, 0),
          };
        }
      } catch (error) {
        console.error(`Error checking catalog compliance for ${env.id}:`, error.message);
      }
    }
    
    const response = {
      catalogCompliance,
      summary: {
        totalCatalogs: Object.keys(catalogCompliance).length,
        compliantCatalogs: Object.values(catalogCompliance).filter(c => c.isCompliant).length,
        nonCompliantCatalogs: Object.values(catalogCompliance).filter(c => !c.isCompliant).length,
      },
      lastUpdated: new Date().toISOString(),
    };
    
    // Cache the result
    validationCache.set(cacheKey, { data: response, timestamp: Date.now() });
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get catalog compliance', message: error.message });
  }
});

// GET all violations (with caching)
router.get('/violations', async (req, res) => {
  try {
    const cacheKey = 'violations';
    const cached = validationCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < VALIDATION_CACHE_TTL) {
      console.log('✅ Returning cached violations');
      return res.json(cached.data);
    }
    
    const agreements = getAllAgreements();
    
    // OPTIMIZATION: If no agreements exist, there can't be any violations!
    if (agreements.length === 0) {
      console.log('⚡ No agreements defined - skipping violation check');
      const emptyResult = {
        violations: [],
        totalAssets: 0,
        compliantAssets: 0,
        violatingAssets: 0,
        note: 'No agreements defined. Create an agreement to check for violations.',
      };
      
      // Don't cache empty results (so it rechecks when agreements are added)
      return res.json(emptyResult);
    }
    
    const environments = getEnvironments();
    const allAssets = [];
    
    // Fetch all assets from all environments (uses cached asset data ONLY)
    for (const env of environments) {
      try {
        const assets = await deltaSharing.getAllShareTables(env.id);
        allAssets.push(...assets);
      } catch (error) {
        console.error(`Error fetching assets from ${env.id}:`, error.message);
      }
    }
    
    console.log(`⚡ Validating ${allAssets.length} assets against ${agreements.length} agreement(s)`);
    
    // Validate each asset
    const results = allAssets.map(asset => validateAsset(asset, agreements));
    
    // Filter to only assets with violations
    const violationsOnly = results.filter(r => !r.compliant);
    
    const violations = {
      violations: violationsOnly,
      totalAssets: allAssets.length,
      compliantAssets: allAssets.length - violationsOnly.length,
      violatingAssets: violationsOnly.length,
    };
    
    // Cache the result
    validationCache.set(cacheKey, { data: violations, timestamp: Date.now() });
    
    res.json(violations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get violations', message: error.message });
  }
});

// POST validate specific asset
router.post('/validate/:assetId', async (req, res) => {
  try {
    const [envId, fullTableName] = req.params.assetId.split(':');
    
    if (!envId || !fullTableName) {
      return res.status(400).json({ error: 'Invalid asset ID format' });
    }
    
    const agreements = getAllAgreements();
    const tables = await deltaSharing.getAllShareTables(envId);
    const table = tables.find(t => t.fullName === fullTableName);
    
    if (!table) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    
    const result = validateAsset(table, agreements);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate asset', message: error.message });
  }
});

// POST validate all assets (with caching)
router.post('/validate-all', async (req, res) => {
  try {
    const cacheKey = 'validate_all';
    const cached = validationCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < VALIDATION_CACHE_TTL) {
      console.log('Returning cached validate-all results');
      return res.json(cached.data);
    }
    
    const environments = getEnvironments();
    const agreements = getAllAgreements();
    const allAssets = [];
    
    // Fetch all assets from all environments (uses cached asset data)
    for (const env of environments) {
      try {
        const assets = await deltaSharing.getAllShareTables(env.id);
        allAssets.push(...assets);
      } catch (error) {
        console.error(`Error fetching assets from ${env.id}:`, error.message);
      }
    }
    
    // Validate each asset
    const results = allAssets.map(asset => validateAsset(asset, agreements));
    
    const response = {
      results,
      summary: {
        total: results.length,
        compliant: results.filter(r => r.compliant).length,
        nonCompliant: results.filter(r => !r.compliant).length,
      },
    };
    
    // Cache the result
    validationCache.set(cacheKey, { data: response, timestamp: Date.now() });
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate all assets', message: error.message });
  }
});

// POST clear all caches
router.post('/clear-cache', (req, res) => {
  try {
    // Clear validation cache
    validationCache.clear();
    
    // Clear Databricks client cache
    clearDatabricksCache();
    
    res.json({ 
      success: true, 
      message: 'All caches cleared successfully' 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache', message: error.message });
  }
});

export default router;
