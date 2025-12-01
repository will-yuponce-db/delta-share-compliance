import express from 'express';
import { getEnvironments, getEnvironment } from '../config/databricks.js';

const router = express.Router();

// GET all environments
router.get('/', (req, res) => {
  const environments = getEnvironments();
  res.json(environments);
});

// GET single environment
router.get('/:id', (req, res) => {
  const environment = getEnvironment(req.params.id);
  if (environment) {
    res.json(environment);
  } else {
    res.status(404).json({ error: 'Environment not found' });
  }
});

export default router;
