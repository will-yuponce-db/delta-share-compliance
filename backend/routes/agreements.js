import express from 'express';
import { 
  getAllAgreements, 
  getAgreementById, 
  addAgreement, 
  deleteAgreement 
} from '../data/agreementsStore.js';
import { parseAgreement } from '../services/aiParserStub.js';
import { enforceAgreement, enforceAllAgreements } from '../services/complianceEnforcement.js';
import { createDatabricksClient } from '../services/databricksClient.js';
import { clearRegistry } from '../data/sharesRegistry.js';

const router = express.Router();

// Cache for volume loading (to prevent excessive API calls)
let volumeLoadCache = { data: [], timestamp: 0 };
const VOLUME_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Helper function to load ALL agreements from the central volume
async function loadAllAgreementsFromVolume(envId) {
  // Check cache first
  if (Date.now() - volumeLoadCache.timestamp < VOLUME_CACHE_TTL) {
    console.log('   Using cached volume agreements');
    return volumeLoadCache.data;
  }
  
  try {
    const client = createDatabricksClient(envId);
    const volumeName = 'agreements';
    const catalogName = 'main';
    const schemaName = 'default';
    const volumePath = `/Volumes/${catalogName}/${schemaName}/${volumeName}`;
    
    console.log(`📂 Loading all agreements from: ${volumePath}`);
    
    try {
      // List all files in the agreements volume
      const response = await client.get(`/api/2.0/fs/directories${volumePath}`);
      const files = response.data?.contents?.filter(f => f.name.endsWith('.txt')) || [];
      
      if (files.length === 0) {
        console.log('   No agreement files found in volume');
        volumeLoadCache = { data: [], timestamp: Date.now() };
        return [];
      }
      
      console.log(`   Found ${files.length} agreement file(s) in volume`);
      
      const agreements = [];
      
      // Read each agreement file (limit to first 20 to avoid overload)
      const filesToRead = files.slice(0, 20);
      if (files.length > 20) {
        console.log(`   ⚠️  Limiting to first 20 agreement files`);
      }
      
      for (const file of filesToRead) {
        try {
          const filePath = `${volumePath}/${file.name}`;
          console.log(`   📥 Reading: ${file.name}`);
          
          const fileResponse = await client.get(`/api/2.0/fs/files${filePath}`);
          const content = fileResponse.data;
          
          // Parse the agreement content
          const parsed = parseAgreementContent(content);
          
          // Extract share name from filename (e.g., "my_share_agreement.txt" -> "my_share")
          const shareName = file.name.replace(/_agreement\.txt$/, '');
          
          const agreementData = {
            name: parsed.name || `${shareName} - Agreement`,
            description: parsed.description || `Loaded from volume: ${file.name}`,
            content,
            environments: [envId],
            shares: [shareName],
            requiredTags: parsed.requiredTags || [],
            retentionYears: parsed.retentionYears,
            disseminationRules: parsed.disseminationRules,
            source: 'volume',
            sourceFile: filePath,
            loadedAt: new Date().toISOString(),
            parsedRequirements: parsed.requiredTags.length > 0 ? [{
              requiredTags: parsed.requiredTags.reduce((acc, tag) => {
                acc[tag.key] = tag.value;
                return acc;
              }, {}),
              scope: 'all',
              severity: 'critical',
              reason: 'Required tags from agreement',
            }] : [],
          };
          
          agreements.push(agreementData);
        } catch (error) {
          console.warn(`   ⚠️  Failed to read ${file.name}:`, error.message);
        }
      }
      
      console.log(`✅ Loaded ${agreements.length} agreement(s) from volume`);
      
      // Cache the results
      volumeLoadCache = { data: agreements, timestamp: Date.now() };
      
      return agreements;
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('   Agreements volume not found (this is normal if not set up yet)');
        volumeLoadCache = { data: [], timestamp: Date.now() };
        return [];
      }
      throw error;
    }
  } catch (error) {
    console.error('Error loading agreements from volume:', error);
    return [];
  }
}

// Helper function to read agreement from consumed share volume
async function readAgreementFromVolume(envId, shareName) {
  try {
    const client = createDatabricksClient(envId);
    const volumeName = 'agreements';
    const catalogName = 'main'; // Central location for all agreements
    const schemaName = 'default';
    const volumePath = `/Volumes/${catalogName}/${schemaName}/${volumeName}`;
    
    try {
      // Look for agreement file for this specific share
      const fileName = `${shareName}_agreement.txt`;
      const filePath = `${volumePath}/${fileName}`;
      
      console.log(`📥 Reading agreement for ${shareName} from: ${filePath}`);
      
      const fileResponse = await client.get(`/api/2.0/fs/files${filePath}`);
      const content = fileResponse.data;
      
      // Parse the agreement content
      const parsed = parseAgreementContent(content);
      
      return {
        found: true,
        filePath,
        fileName,
        content,
        parsed,
      };
    } catch (readError) {
      // File not found for this specific share
      if (readError.response?.status === 404) {
        return {
          found: false,
          message: `No agreement file found for share: ${shareName}`,
          volumePath,
          expectedFile: fileName,
        };
      }
      
      // Other errors (volume not accessible, etc.)
      return {
        found: false,
        message: 'Agreement volume does not exist or is not accessible',
        volumePath,
      };
    }
  } catch (error) {
    console.error(`Error reading agreement from volume:`, error.message);
    return {
      found: false,
      error: error.message,
    };
  }
}

// Helper function to parse agreement content
function parseAgreementContent(content) {
  const lines = content.split('\n');
  const parsed = {
    name: '',
    description: '',
    retentionYears: '',
    requiredTags: [],
    disseminationRules: '',
  };
  
  let inTagsSection = false;
  let inDisseminationSection = false;
  
  for (const line of lines) {
    if (line.startsWith('Name:')) {
      parsed.name = line.replace('Name:', '').trim();
    } else if (line.startsWith('Description:')) {
      parsed.description = line.replace('Description:', '').trim();
    } else if (line.startsWith('Retention Period:')) {
      const match = line.match(/(\d+)\s*years?/i);
      if (match) parsed.retentionYears = match[1];
    } else if (line.includes('## Required Tags')) {
      inTagsSection = true;
      inDisseminationSection = false;
    } else if (line.includes('## Dissemination Rules')) {
      inTagsSection = false;
      inDisseminationSection = true;
    } else if (line.includes('##')) {
      inTagsSection = false;
      inDisseminationSection = false;
    } else if (inTagsSection && line.trim().startsWith('- ')) {
      const tagMatch = line.match(/- ([^:]+):\s*(.+)/);
      if (tagMatch) {
        parsed.requiredTags.push({
          key: tagMatch[1].trim(),
          value: tagMatch[2].trim(),
        });
      }
    } else if (inDisseminationSection && line.trim()) {
      parsed.disseminationRules += line.trim() + ' ';
    }
  }
  
  parsed.disseminationRules = parsed.disseminationRules.trim();
  return parsed;
}

// Helper function to save agreement to volume
async function saveAgreementToVolume(envId, shareName, agreementData) {
  try {
    const client = createDatabricksClient(envId);
    const volumeName = 'agreements';
    const catalogName = 'main'; // Central location for all agreements
    const schemaName = 'default';
    const fileName = `${agreementData.name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_agreement_${Date.now()}.txt`;
    const volumePath = `/Volumes/${catalogName}/${schemaName}/${volumeName}/${fileName}`;
    
    // Generate agreement content as structured text
    const tagsList = agreementData.requiredTags
      .filter(t => t.key && t.value)
      .map(tag => `  - ${tag.key}: ${tag.value}`)
      .join('\n') || '  None specified';
    
    const agreementContent = `# Data Sharing Agreement: ${agreementData.name}
# Created: ${new Date().toISOString()}
# 
# This file should be included in the Delta Share to communicate
# compliance requirements to data consumers.
# ========================================================================

## Agreement Details
Name: ${agreementData.name}
Description: ${agreementData.description || 'N/A'}
Retention Period: ${agreementData.retentionYears ? agreementData.retentionYears + ' years' : 'Not specified'}

## Required Tags
The following tags MUST be applied to all tables in this share
and any derivative tables:
${tagsList}

## Dissemination Rules
${agreementData.disseminationRules || 'Not specified'}

## Full Agreement Text
${agreementData.content}

## Instructions for Consumers
1. Review the required tags above
2. Apply these tags (or your organization's equivalent) to all consumed tables
3. Ensure all derivative tables maintain these tags
4. Comply with retention and dissemination rules
`;
    
    try {
      // Upload file to volume using Files API
      // First, check if the volume exists, if not provide instructions
      console.log(`📄 Uploading agreement to: ${volumePath}`);
      
      // Use Files API to upload
      await client.put(
        `/api/2.0/fs/files${volumePath}`,
        agreementContent,
        {
          headers: {
            'Content-Type': 'text/plain',
          }
        }
      );
      
      console.log(`✅ Agreement successfully saved to ${volumePath}`);
      
      return {
        volumePath,
        content: agreementContent,
        instructions: `File saved to ${volumePath}. Include this volume in your Delta Share.`,
      };
    } catch (uploadError) {
      // If upload fails, provide instructions
      console.warn(`⚠️  Could not upload to volume: ${uploadError.message}`);
      console.log(`   Volume may not exist. Create volume first with:`);
      console.log(`   CREATE VOLUME ${catalogName}.${schemaName}.${volumeName};`);
      
      return {
        volumePath,
        content: agreementContent,
        instructions: `Volume ${catalogName}.${schemaName}.${volumeName} may not exist. Create it and manually upload the agreement file.`,
        error: 'Volume may not exist',
      };
    }
  } catch (error) {
    console.error(`Error saving agreement to volume:`, error.message);
    return null;
  }
}

// GET all agreements
// Track if volume has been loaded
let volumeAgreementsLoaded = false;

router.get('/', async (req, res) => {
  try {
    // Load from volume only ONCE on first request
    if (!volumeAgreementsLoaded) {
      console.log('📂 First request - loading agreements from volume...');
      const volumeAgreements = await loadAllAgreementsFromVolume('current');
      
      // Add volume agreements to in-memory store (only if not already there)
      volumeAgreements.forEach(volAgreement => {
        const volShareName = volAgreement.shares?.[0];
        
        // Check if agreement for this share already exists
        const alreadyExists = getAllAgreements().some(a => 
          a.shares?.includes(volShareName)
        );
        
        if (!alreadyExists) {
          console.log(`   ➕ Adding volume agreement for ${volShareName}`);
          addAgreement(volAgreement);
        }
      });
      
      volumeAgreementsLoaded = true; // Mark as loaded
      console.log(`✅ Volume agreements loaded (${volumeAgreements.length} found)`);
    }
    
    // Return all agreements from in-memory store
    const allAgreements = getAllAgreements();
    res.json(allAgreements);
  } catch (error) {
    console.error('Error fetching agreements:', error);
    res.status(500).json({ error: 'Failed to fetch agreements', message: error.message });
  }
});

// GET single agreement
router.get('/:id', (req, res) => {
  const agreement = getAgreementById(req.params.id);
  if (agreement) {
    res.json(agreement);
  } else {
    res.status(404).json({ error: 'Agreement not found' });
  }
});

// POST new agreement
router.post('/', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      content, 
      environments, 
      shares, 
      requiredTags, 
      retentionYears, 
      disseminationRules,
      assetScopes
    } = req.body;
    
    // Parse the agreement content to extract requirements
    const parsed = parseAgreement(content);
    
    // Convert requiredTags array to object format for requirements
    const tagRequirements = requiredTags
      .filter(tag => tag.key && tag.value)
      .reduce((acc, tag) => {
        acc[tag.key] = tag.value;
        return acc;
      }, {});
    
    // Create agreement data
    const agreementData = {
      name,
      description,
      content,
      environments: environments || [],
      shares: shares || [],
      requiredTags: requiredTags || [],
      retentionYears,
      disseminationRules,
      assetScopes: assetScopes || [],
      parsedRequirements: [
        ...parsed.requirements,
        // Add a requirement for the user-specified tags
        ...(Object.keys(tagRequirements).length > 0 ? [{
          requiredTags: tagRequirements,
          scope: 'all',
          severity: 'critical',
          reason: 'User-defined tags from sharing agreement',
        }] : []),
      ],
    };
    
    // Save to volume ONLY for PROVIDED shares
    const volumeSaveResults = [];
    if (shares && shares.length > 0 && environments && environments.length > 0) {
      // Import to get share details
      const { deltaSharing } = await import('../services/databricksClient.js');
      
      for (const envId of environments) {
        // Get all shares for this environment to check direction
        const allShares = await deltaSharing.getAllShareTables(envId);
        const shareMap = new Map();
        
        // Build a map of share names to their direction
        try {
          const response = await fetch(`http://localhost:3001/api/delta-sharing/shares`);
          const sharesData = await response.json();
          sharesData.forEach(s => {
            if (s.environmentId === envId) {
              shareMap.set(s.name, s.direction);
            }
          });
        } catch (error) {
          console.warn('Could not fetch share directions:', error.message);
        }
        
        for (const shareName of shares) {
          const direction = shareMap.get(shareName);
          
          // Only write agreement for PROVIDED shares
          if (direction === 'provided' || !direction) {
            console.log(`📝 Writing agreement for PROVIDED share: ${shareName}`);
            const volumeResult = await saveAgreementToVolume(envId, shareName, agreementData);
            if (volumeResult) {
              volumeSaveResults.push({
                environment: envId,
                share: shareName,
                direction: 'provided',
                volumePath: volumeResult.volumePath,
                instructions: volumeResult.instructions,
              });
            }
          } else {
            console.log(`📥 Skipping write for CONSUMED share: ${shareName} (agreement should be read from provider)`);
            volumeSaveResults.push({
              environment: envId,
              share: shareName,
              direction: 'consumed',
              action: 'read',
              message: 'Agreement should be ingested from the share volume',
            });
          }
        }
      }
    }
    
    // Add volume paths to agreement data
    agreementData.volumePaths = volumeSaveResults;
    
    const newAgreement = addAgreement(agreementData);
    
    // Mark that we should reload from volume on next GET (in case agreement was saved to volume)
    volumeAgreementsLoaded = false;
    
    res.status(201).json(newAgreement);
  } catch (error) {
    console.error('Error creating agreement:', error);
    res.status(500).json({ error: 'Failed to create agreement', message: error.message });
  }
});

// POST parse agreement content
router.post('/parse', (req, res) => {
  const { content } = req.body;
  const result = parseAgreement(content);
  res.json(result);
});

// POST bulk ingest agreements from multiple consumed shares
router.post('/ingest-bulk', async (req, res) => {
  try {
    let { environment, shareNames } = req.body;
    
    // If no shareNames provided, fetch all shares and ingest from all
    if (!shareNames) {
      console.log('📥 No shareNames provided, fetching all shares...');
      const { deltaSharing } = await import('../services/databricksClient.js');
      const allShares = await deltaSharing.listShares(environment || 'current');
      shareNames = allShares.map(s => s.name);
      environment = environment || 'current';
      console.log(`Found ${shareNames.length} shares to scan for agreements`);
    }
    
    if (!environment || !shareNames || !Array.isArray(shareNames)) {
      return res.status(400).json({ 
        error: 'Missing required fields: environment and shareNames (array)' 
      });
    }
    
    console.log(`📥 Bulk ingesting agreements for ${shareNames.length} shares in ${environment}`);
    
    const results = {
      success: [],
      failed: [],
      notFound: [],
    };
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < shareNames.length; i += batchSize) {
      const batch = shareNames.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (shareName) => {
        try {
          // Check if agreement already exists
          const existingAgreements = getAllAgreements();
          const alreadyExists = existingAgreements.some(a => 
            a.shares && a.shares.includes(shareName) && a.source === 'ingested'
          );
          
          if (alreadyExists) {
            console.log(`⏭️  Skipping ${shareName}: agreement already ingested`);
            results.notFound.push(shareName + ' (already exists)');
            return;
          }
          
          const result = await readAgreementFromVolume(environment, shareName);
          
          if (!result.found) {
            results.notFound.push(shareName);
            return;
          }
          
          // Create agreement from ingested content
          const agreementData = {
            name: `${shareName} - Provider Agreement`,
            description: `Ingested from consumed share: ${shareName}`,
            content: result.content,
            environments: [environment],
            shares: [shareName],
            requiredTags: result.parsed.requiredTags || [],
            retentionYears: result.parsed.retentionYears,
            disseminationRules: result.parsed.disseminationRules,
            source: 'ingested',
            sourceFile: result.filePath,
            ingestedAt: new Date().toISOString(),
            parsedRequirements: result.parsed.requiredTags.length > 0 ? [{
              requiredTags: result.parsed.requiredTags.reduce((acc, tag) => {
                acc[tag.key] = tag.value;
                return acc;
              }, {}),
              scope: 'all',
              severity: 'critical',
              reason: 'Required tags from provider agreement',
            }] : [],
          };
          
          addAgreement(agreementData);
          results.success.push(shareName);
          
        } catch (error) {
          results.failed.push({ shareName, error: error.message });
        }
      }));
    }
    
    console.log(`✅ Bulk ingest complete: ${results.success.length} successful, ${results.notFound.length} not found, ${results.failed.length} failed`);
    
    res.status(200).json({
      success: true,
      results,
      summary: {
        total: shareNames.length,
        ingested: results.success.length,
        notFound: results.notFound.length,
        failed: results.failed.length,
      },
    });
  } catch (error) {
    console.error('Bulk ingest error:', error);
    res.status(500).json({ 
      error: 'Bulk ingest failed', 
      message: error.message 
    });
  }
});

// POST ingest agreement from consumed share
router.post('/ingest', async (req, res) => {
  try {
    const { environment, shareName, silent } = req.body;
    
    if (!environment || !shareName) {
      return res.status(400).json({ 
        error: 'Missing required fields: environment and shareName' 
      });
    }
    
    const result = await readAgreementFromVolume(environment, shareName);
    
    if (!result.found) {
      return res.status(404).json({
        error: 'Agreement not found',
        message: result.message || 'No agreement file found in this share',
        volumePath: result.volumePath,
      });
    }
    
    // Create an agreement from the ingested content
    const agreementData = {
      name: `${shareName} - Provider Agreement`,
      description: `Ingested from consumed share: ${shareName}`,
      content: result.content,
      environments: [environment],
      shares: [shareName],
      requiredTags: result.parsed.requiredTags || [],
      retentionYears: result.parsed.retentionYears,
      disseminationRules: result.parsed.disseminationRules,
      source: 'ingested',
      sourceFile: result.filePath,
      ingestedAt: new Date().toISOString(),
      parsedRequirements: result.parsed.requiredTags.length > 0 ? [{
        requiredTags: result.parsed.requiredTags.reduce((acc, tag) => {
          acc[tag.key] = tag.value;
          return acc;
        }, {}),
        scope: 'all',
        severity: 'critical',
        reason: 'Required tags from provider agreement',
      }] : [],
    };
    
    const newAgreement = addAgreement(agreementData);
    
    // Only log success if not in silent mode
    if (!silent) {
      console.log(`✅ Ingested agreement for ${shareName}: ${newAgreement.name}`);
    }
    
    res.status(201).json({
      success: true,
      agreement: newAgreement,
      sourceFile: result.filePath,
      message: 'Agreement successfully ingested from share volume',
    });
  } catch (error) {
    console.error('Error ingesting agreement:', error);
    res.status(500).json({ 
      error: 'Failed to ingest agreement', 
      message: error.message 
    });
  }
});

// Helper function to delete agreement file from volume
async function deleteAgreementFromVolume(envId, fileName) {
  try {
    const client = createDatabricksClient(envId);
    const volumeName = 'agreements';
    const catalogName = 'main';
    const schemaName = 'default';
    const volumePath = `/Volumes/${catalogName}/${schemaName}/${volumeName}/${fileName}`;
    
    console.log(`🗑️  Deleting agreement from: ${volumePath}`);
    
    try {
      await client.delete(`/api/2.0/fs/files${volumePath}`);
      console.log(`✅ Agreement file deleted: ${volumePath}`);
      return { success: true, volumePath };
    } catch (deleteError) {
      if (deleteError.response?.status === 404) {
        console.log(`⚠️  File not found (may have been already deleted): ${volumePath}`);
        return { success: true, volumePath, note: 'File not found' };
      }
      throw deleteError;
    }
  } catch (error) {
    console.error(`Error deleting agreement from volume:`, error.message);
    return { success: false, error: error.message };
  }
}

// DELETE agreement
router.delete('/:id', async (req, res) => {
  try {
    const agreement = getAgreementById(req.params.id);
    
    if (!agreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    // Delete from in-memory store
    const deleted = deleteAgreement(req.params.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    // If agreement was loaded from or saved to a volume, delete the file
    if (agreement.sourceFile) {
      // Extract filename from sourceFile path
      const fileName = agreement.sourceFile.split('/').pop();
      const envId = agreement.environments?.[0] || 'current';
      await deleteAgreementFromVolume(envId, fileName);
    } else if (agreement.volumePaths && agreement.volumePaths.length > 0) {
      // Delete all volume files for this agreement
      for (const volumePath of agreement.volumePaths) {
        if (volumePath.volumePath) {
          const fileName = volumePath.volumePath.split('/').pop();
          const envId = volumePath.environment || agreement.environments?.[0] || 'current';
          await deleteAgreementFromVolume(envId, fileName);
        }
      }
    }
    
    // Invalidate cache to trigger reload on next request
    volumeAgreementsLoaded = false;
    
    res.json({ success: true, message: 'Agreement deleted from store and volume' });
  } catch (error) {
    console.error('Error deleting agreement:', error);
    res.status(500).json({ error: 'Failed to delete agreement', message: error.message });
  }
});

// PUT update agreement
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      content, 
      environments, 
      shares, 
      requiredTags, 
      retentionYears, 
      disseminationRules,
      assetScopes
    } = req.body;
    
    const existingAgreement = getAgreementById(id);
    if (!existingAgreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    // Parse the agreement content to extract requirements
    const parsed = parseAgreement(content);
    
    // Convert requiredTags array to object format for requirements
    const tagRequirements = requiredTags
      .filter(tag => tag.key && tag.value)
      .reduce((acc, tag) => {
        acc[tag.key] = tag.value;
        return acc;
      }, {});
    
    // Create updated agreement data
    const agreementData = {
      name,
      description,
      content,
      environments: environments || [],
      shares: shares || [],
      requiredTags: requiredTags || [],
      retentionYears,
      disseminationRules,
      assetScopes: assetScopes || [],
      parsedRequirements: [
        ...parsed.requirements,
        ...(Object.keys(tagRequirements).length > 0 ? [{
          requiredTags: tagRequirements,
          scope: 'all',
          severity: 'critical',
          reason: 'User-defined tags from sharing agreement',
        }] : []),
      ],
    };
    
    // Update volume files for PROVIDED shares
    const volumeSaveResults = [];
    if (shares && shares.length > 0 && environments && environments.length > 0) {
      const { deltaSharing } = await import('../services/databricksClient.js');
      
      for (const envId of environments) {
        const allShares = await deltaSharing.getAllShareTables(envId);
        const shareMap = new Map();
        
        // Build a map of share names to their direction
        try {
          const response = await fetch(`http://localhost:3001/api/delta-sharing/shares`);
          const sharesData = await response.json();
          sharesData.forEach(s => {
            if (s.environmentId === envId) {
              shareMap.set(s.name, s.direction);
            }
          });
        } catch (error) {
          console.warn('Could not fetch share directions:', error.message);
        }
        
        for (const shareName of shares) {
          const direction = shareMap.get(shareName);
          
          // Delete old volume file if it exists
          if (existingAgreement.sourceFile) {
            const fileName = existingAgreement.sourceFile.split('/').pop();
            await deleteAgreementFromVolume(envId, fileName);
          } else if (existingAgreement.volumePaths) {
            for (const vp of existingAgreement.volumePaths) {
              if (vp.share === shareName && vp.volumePath) {
                const fileName = vp.volumePath.split('/').pop();
                await deleteAgreementFromVolume(envId, fileName);
              }
            }
          }
          
          // Write new agreement for PROVIDED shares
          if (direction === 'provided' || !direction) {
            console.log(`📝 Updating agreement for PROVIDED share: ${shareName}`);
            const volumeResult = await saveAgreementToVolume(envId, shareName, agreementData);
            if (volumeResult) {
              volumeSaveResults.push({
                environment: envId,
                share: shareName,
                direction: 'provided',
                volumePath: volumeResult.volumePath,
                instructions: volumeResult.instructions,
              });
            }
          } else {
            console.log(`📥 Skipping write for CONSUMED share: ${shareName} (agreement should be read from provider)`);
            volumeSaveResults.push({
              environment: envId,
              share: shareName,
              direction: 'consumed',
              action: 'read',
              message: 'Agreement should be ingested from the share volume',
            });
          }
        }
      }
    }
    
    // Add volume paths to agreement data
    agreementData.volumePaths = volumeSaveResults;
    
    // Update in store using the existing updateAgreement function
    const { updateAgreement } = await import('../data/agreementsStore.js');
    const updatedAgreement = updateAgreement(id, agreementData);
    
    if (!updatedAgreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }
    
    // Invalidate cache to trigger reload on next GET
    volumeAgreementsLoaded = false;
    
    res.json(updatedAgreement);
  } catch (error) {
    console.error('Error updating agreement:', error);
    res.status(500).json({ error: 'Failed to update agreement', message: error.message });
  }
});

// POST reset share registry (force re-check all shares for agreements)
router.post('/reset-registry', (req, res) => {
  try {
    clearRegistry();
    console.log('🔄 Share registry cleared - all shares will be re-checked for agreements');
    res.json({ 
      success: true, 
      message: 'Registry cleared. Shares will be checked for agreements on next load.' 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset registry', message: error.message });
  }
});

// POST enforce agreement (apply tags hierarchically)
router.post('/enforce/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { envId = 'current' } = req.body;

    const result = await enforceAgreement(id, envId);
    
    res.json({
      success: true,
      enforcement: result,
      message: `Agreement enforced on ${result.shares.length} share(s)`,
    });
  } catch (error) {
    console.error('Error enforcing agreement:', error);
    res.status(500).json({ 
      error: 'Failed to enforce agreement', 
      message: error.message 
    });
  }
});

// POST enforce all agreements
router.post('/enforce-all', async (req, res) => {
  try {
    const { envId = 'current' } = req.body;

    const result = await enforceAllAgreements(envId);
    
    res.json({
      success: true,
      enforcements: result,
      message: `Enforced ${result.total} agreement(s)`,
    });
  } catch (error) {
    console.error('Error enforcing agreements:', error);
    res.status(500).json({ 
      error: 'Failed to enforce agreements', 
      message: error.message 
    });
  }
});

export default router;
