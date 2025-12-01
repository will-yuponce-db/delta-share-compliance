import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Databricks configuration
const configPath = path.join(__dirname, '..', 'databricks-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Get Databricks host from environment variable (set by Databricks Apps)
const getDatabricksHost = () => {
  const host = process.env.DATABRICKS_HOST;
  if (host) {
    // Ensure it's a full URL
    return host.startsWith('https://') ? host : `https://${host}`;
  }
  return null;
};

// Get enabled environments
export const getEnvironments = () => {
  const environments = [];
  const databricksHost = getDatabricksHost();
  
  // If running in Databricks Apps, add the current workspace as an environment
  if (databricksHost) {
    environments.push({
      id: 'current',
      name: process.env.DATABRICKS_APP_NAME || 'Current Workspace',
      host: databricksHost,
      token: null, // Use user token from X-Forwarded-Access-Token
      type: 'databricks',
      status: 'connected',
    });
  }
  
  // Also include any configured environments from the config file
  Object.entries(config.environments).forEach(([id, env]) => {
    if (env.enabled && env.workspaceUrl) {
      environments.push({
        id,
        name: env.name,
        host: env.workspaceUrl,
        token: env.token || null, // Include token if configured (for PAT fallback)
        type: 'databricks',
        status: 'connected',
      });
    }
  });
  
  return environments;
};

// Get a specific environment
export const getEnvironment = (envId) => {
  const databricksHost = getDatabricksHost();
  
  // If requesting 'current' environment and running in Databricks Apps
  if (envId === 'current' && databricksHost) {
    return {
      id: 'current',
      name: process.env.DATABRICKS_APP_NAME || 'Current Workspace',
      host: databricksHost,
      token: null, // Use user token from X-Forwarded-Access-Token
      type: 'databricks',
      status: 'connected',
    };
  }
  
  const env = config.environments[envId];
  if (!env || !env.enabled) {
    return null;
  }
  
  return {
    id: envId,
    name: env.name,
    host: env.workspaceUrl,
    token: env.token || null, // Include token if configured (for PAT fallback)
    type: 'databricks',
    status: 'connected',
  };
};

// Extract user token from request headers (Databricks Apps authorization)
export const getUserToken = (req) => {
  // Get token from X-Forwarded-Access-Token header (Databricks Apps)
  const forwardedToken = req.headers['x-forwarded-access-token'];
  if (forwardedToken) {
    return forwardedToken;
  }
  
  // Fallback: check Authorization header for development/testing
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return null;
};

// Get user email from request headers (Databricks Apps)
export const getUserEmail = (req) => {
  return req.headers['x-forwarded-email'] || null;
};

export default config;

