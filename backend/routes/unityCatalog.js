import express from 'express';
import { unityCatalog } from '../services/databricksClient.js';

const router = express.Router();

// GET catalogs for an environment
router.get('/:envId/catalogs', async (req, res) => {
  try {
    const catalogs = await unityCatalog.listCatalogs(req.params.envId);
    res.json(catalogs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch catalogs', message: error.message });
  }
});

// GET schemas in a catalog
router.get('/:envId/catalogs/:catalog/schemas', async (req, res) => {
  try {
    const schemas = await unityCatalog.listSchemas(req.params.envId, req.params.catalog);
    res.json(schemas);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch schemas', message: error.message });
  }
});

// GET tables in a schema
router.get('/:envId/catalogs/:catalog/schemas/:schema/tables', async (req, res) => {
  try {
    const tables = await unityCatalog.listTables(req.params.envId, req.params.catalog, req.params.schema);
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tables', message: error.message });
  }
});

// GET tags for a table
router.get('/:envId/tags/:fullTableName', async (req, res) => {
  try {
    const tags = await unityCatalog.getTags(req.params.envId, req.params.fullTableName);
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tags', message: error.message });
  }
});

// PUT/update tags for a table
router.put('/:envId/tags/:fullTableName', async (req, res) => {
  try {
    const { tags } = req.body;
    const result = await unityCatalog.setTags(req.params.envId, req.params.fullTableName, tags);
    res.json({ success: true, tags: result.properties });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update tags', message: error.message });
  }
});

// GET table metadata
router.get('/:envId/metadata/:fullTableName', async (req, res) => {
  try {
    const metadata = await unityCatalog.getTable(req.params.envId, req.params.fullTableName);
    res.json(metadata);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch table metadata', message: error.message });
  }
});

export default router;
