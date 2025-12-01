import express from 'express';
import { createDatabricksClient } from '../services/databricksClient.js';
import { getEnvironments } from '../config/databricks.js';

const router = express.Router();

// POST setup Unity Catalog resources
router.post('/', async (req, res) => {
  try {
    const { action, catalog, schema, volume } = req.body;
    
    // Get first environment (assumes single environment setup)
    const environments = getEnvironments();
    if (environments.length === 0) {
      return res.status(400).json({ error: 'No environments configured' });
    }
    
    const envId = environments[0].id;
    const client = await createDatabricksClient(envId);
    
    switch (action) {
      case 'create_volume':
        try {
          await client.post('/api/2.1/unity-catalog/volumes', {
            name: volume,
            catalog_name: catalog,
            schema_name: schema,
            volume_type: 'MANAGED',
            comment: 'Storage for data sharing agreements and governance documents',
          });
          console.log(`✅ Created volume: ${catalog}.${schema}.${volume}`);
          res.json({ success: true, message: `Volume ${catalog}.${schema}.${volume} created` });
        } catch (error) {
          if (error.response?.status === 409 || error.response?.data?.error_code === 'ALREADY_EXISTS') {
            console.log(`ℹ️  Volume ${catalog}.${schema}.${volume} already exists`);
            res.json({ success: true, message: `Volume ${catalog}.${schema}.${volume} already exists` });
          } else {
            throw error;
          }
        }
        break;
        
      default:
        res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({ 
      error: 'Setup failed', 
      message: error.response?.data?.message || error.message 
    });
  }
});

// GET check if setup is required
router.get('/check', async (req, res) => {
  try {
    const environments = getEnvironments();
    if (environments.length === 0) {
      return res.json({ setupRequired: true, reason: 'No environments configured' });
    }
    
    const envId = environments[0].id;
    const client = await createDatabricksClient(envId);
    
    try {
      // Try to access the agreements volume
      await client.get('/api/2.0/fs/directories/Volumes/main/default/agreements');
      
      // If successful, no setup required
      res.json({ setupRequired: false });
    } catch (error) {
      // 404 means volume doesn't exist - setup required
      if (error.response?.status === 404) {
        res.json({ 
          setupRequired: true, 
          reason: 'Agreement volume does not exist',
          volumePath: '/Volumes/main/default/agreements'
        });
      } else {
        // Other errors might be permissions or connectivity
        res.json({ 
          setupRequired: false, 
          warning: 'Could not verify volume access',
          error: error.message 
        });
      }
    }
  } catch (error) {
    console.error('Setup check error:', error);
    res.status(500).json({ error: 'Failed to check setup status', message: error.message });
  }
});

export default router;
