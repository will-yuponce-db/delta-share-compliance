import express from 'express';
import { deltaSharing } from '../services/databricksClient.js';
import { getEnvironments } from '../config/databricks.js';
import { suggestTags } from '../services/aiParserStub.js';
import { applyTagsToShare, getAffectedAssets } from '../services/tagPropagation.js';

const router = express.Router();

// GET all unique tags across all assets
router.get('/', async (req, res) => {
  try {
    const environments = getEnvironments();
    const allTags = {};
    
    for (const env of environments) {
      try {
        const tables = await deltaSharing.getAllShareTables(env.id);
        tables.forEach(table => {
          const tags = table.properties || table.tags || {};
          Object.entries(tags).forEach(([key, value]) => {
            if (!allTags[key]) {
              allTags[key] = new Set();
            }
            allTags[key].add(value);
          });
        });
      } catch (error) {
        console.error(`Error fetching tags from ${env.id}:`, error.message);
      }
    }
    
    // Convert sets to arrays
    const tagsSummary = Object.entries(allTags).map(([key, values]) => ({
      key,
      values: Array.from(values),
      count: values.size,
    }));
    
    res.json(tagsSummary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tags', message: error.message });
  }
});

// POST get tag suggestions for an asset
router.post('/suggest', (req, res) => {
  const { assetName, schema } = req.body;
  const suggestions = suggestTags(assetName, schema);
  res.json({ suggestions });
});

// POST apply tags hierarchically to a share
router.post('/apply-to-share', async (req, res) => {
  try {
    const {
      envId,
      shareName,
      tags,
      direction, // 'provided' or 'consumed'
      scope, // 'catalog', 'schema', 'table', 'column', 'all'
      catalogName,
      schemaName,
      tableName,
      columnNames,
    } = req.body;

    if (!envId || !shareName || !tags || !direction) {
      return res.status(400).json({
        error: 'Missing required fields: envId, shareName, tags, direction',
      });
    }

    const result = await applyTagsToShare(envId, shareName, tags, direction, {
      scope,
      catalogName,
      schemaName,
      tableName,
      columnNames,
    });

    res.json(result);
  } catch (error) {
    console.error('Error applying tags to share:', error);
    res.status(500).json({ error: 'Failed to apply tags', message: error.message });
  }
});

// POST preview affected assets before applying tags
router.post('/preview-affected', async (req, res) => {
  try {
    const {
      envId,
      shareName,
      scope,
      catalogName,
      schemaName,
      tableName,
    } = req.body;

    if (!envId || !shareName) {
      return res.status(400).json({
        error: 'Missing required fields: envId, shareName',
      });
    }

    const result = await getAffectedAssets(envId, shareName, {
      scope,
      catalogName,
      schemaName,
      tableName,
    });

    res.json(result);
  } catch (error) {
    console.error('Error previewing affected assets:', error);
    res.status(500).json({ error: 'Failed to preview assets', message: error.message });
  }
});

export default router;
