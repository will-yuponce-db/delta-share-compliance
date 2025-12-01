import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import agreementsRouter from './routes/agreements.js';
import deltaSharingRouter from './routes/deltaSharing.js';
import validationRouter from './routes/validation.js';
import tagsRouter from './routes/tags.js';
import environmentsRouter from './routes/environments.js';
import unityCatalogRouter from './routes/unityCatalog.js';
import setupRouter from './routes/setup.js';
import { setUserToken } from './services/databricksClient.js';
import { getUserToken, getUserEmail } from './config/databricks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// User authentication middleware (Databricks Apps)
// Extracts user token from X-Forwarded-Access-Token header and sets it for API calls
app.use((req, res, next) => {
  const userToken = getUserToken(req);
  const userEmail = getUserEmail(req);
  
  if (userToken) {
    // Set the user token for Databricks API calls
    setUserToken(userToken);
    // Attach user info to request for logging/auditing
    req.databricksUser = {
      email: userEmail,
      hasToken: true,
    };
    console.log(`👤 User authenticated: ${userEmail || 'unknown'}`);
  } else {
    // Clear any previous user token (will fall back to PAT from config)
    setUserToken(null);
    req.databricksUser = {
      email: null,
      hasToken: false,
    };
  }
  
  next();
});

// Routes
app.use('/api/agreements', agreementsRouter);
app.use('/api/delta-sharing', deltaSharingRouter);
app.use('/api/validation', validationRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/environments', environmentsRouter);
app.use('/api/setup', setupRouter); // More specific route first
app.use('/api/unity-catalog', unityCatalogRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    user: req.databricksUser?.email || null,
    authMode: req.databricksUser?.hasToken ? 'user_token' : 'pat_fallback',
  });
});

// Serve static files from the frontend build (production)
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

// API info endpoint (for debugging)
app.get('/api', (req, res) => {
  res.json({
    message: 'Delta Sharing Compliance API',
    version: '1.0.0',
    authMode: req.databricksUser?.hasToken ? 'user_token' : 'pat_fallback',
    user: req.databricksUser?.email || null,
    endpoints: {
      agreements: '/api/agreements',
      shares: '/api/delta-sharing/shares',
      tables: '/api/delta-sharing/tables',
      validation: '/api/validation',
      tags: '/api/tags',
      environments: '/api/environments',
      unityCatalog: '/api/unity-catalog',
      setup: '/api/setup',
    },
  });
});

// SPA fallback - serve index.html for all non-API routes (must be after API routes)
app.get('*', (req, res, next) => {
  // Skip if this is an API request
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Delta Sharing Compliance API server running on http://localhost:${PORT}`);
  console.log(`📊 API Documentation available at http://localhost:${PORT}`);
  console.log(`🔐 Auth: User token from X-Forwarded-Access-Token, falls back to PAT from config`);
});
