/**
 * Compliance Enforcement Service
 * 
 * Automatically applies tags/policies based on agreement definitions:
 * - Reads agreement requirements (tags, retention, dissemination rules)
 * - Applies them hierarchically to all affected assets
 * - Handles both PROVIDED and CONSUMED shares appropriately
 */

import { applyTagsToShare } from './tagPropagation.js';
import { getAllAgreements } from '../data/agreementsStore.js';

/**
 * Enforce compliance for a specific agreement
 * @param {string} agreementId - Agreement ID to enforce
 * @param {string} envId - Environment ID
 */
export async function enforceAgreement(agreementId, envId = 'prod') {
  const agreements = getAllAgreements();
  const agreement = agreements.find(a => a.id === agreementId);

  if (!agreement) {
    throw new Error(`Agreement not found: ${agreementId}`);
  }

  console.log(`🔒 Enforcing agreement: ${agreement.name}`);

  const results = {
    agreement: agreement.name,
    shares: [],
    totalAssets: 0,
    successfullyTagged: 0,
    failed: 0,
  };

  // Get all shares this agreement applies to
  const shares = agreement.shares || [];
  
  if (shares.length === 0) {
    console.log('⚠️  Agreement applies to all shares - this may take a while');
    // TODO: Handle agreements that apply to all shares
    return results;
  }

  // Prepare tags from agreement
  const tags = {};
  if (agreement.requiredTags && Array.isArray(agreement.requiredTags)) {
    agreement.requiredTags.forEach(tag => {
      if (tag.key && tag.value) {
        tags[tag.key] = tag.value;
      }
    });
  }

  // Add retention as a tag if specified
  if (agreement.retentionYears) {
    tags['retention_years'] = agreement.retentionYears.toString();
  }

  // Add dissemination rules as a tag if specified
  if (agreement.disseminationRules) {
    tags['dissemination_rules'] = agreement.disseminationRules;
  }

  console.log(`Tags to apply:`, tags);

  // Process each share
  for (const shareName of shares) {
    try {
      // Determine share direction
      // If agreement source is 'ingested', it's a consumed share
      // Otherwise, it's a provided share
      const direction = agreement.source === 'ingested' ? 'consumed' : 'provided';

      console.log(`Processing ${direction} share: ${shareName}`);

      // Process each asset scope defined in the agreement
      if (agreement.assetScopes && agreement.assetScopes.length > 0) {
        for (const assetScope of agreement.assetScopes) {
          const options = {
            scope: assetScope.type, // 'catalog', 'schema', 'table', 'column'
            catalogName: assetScope.catalog || shareName,
            schemaName: assetScope.schema,
            tableName: assetScope.table,
            columnNames: assetScope.columns || [],
          };

          const result = await applyTagsToShare(
            envId,
            shareName,
            tags,
            direction,
            options
          );

          results.totalAssets += result.summary.total;
          results.successfullyTagged += result.summary.succeeded;
          results.failed += result.summary.failed;

          results.shares.push({
            share: shareName,
            direction,
            scope: assetScope.type,
            result: result.summary,
          });
        }
      } else {
        // No specific asset scopes - apply to entire share
        const result = await applyTagsToShare(
          envId,
          shareName,
          tags,
          direction,
          { scope: 'all' }
        );

        results.totalAssets += result.summary.total;
        results.successfullyTagged += result.summary.succeeded;
        results.failed += result.summary.failed;

        results.shares.push({
          share: shareName,
          direction,
          scope: 'all',
          result: result.summary,
        });
      }
    } catch (error) {
      console.error(`Failed to enforce agreement on share ${shareName}:`, error);
      results.failed++;
      results.shares.push({
        share: shareName,
        error: error.message,
      });
    }
  }

  console.log(`✅ Enforcement complete:`, results);
  return results;
}

/**
 * Enforce all agreements
 */
export async function enforceAllAgreements(envId = 'prod') {
  const agreements = getAllAgreements();
  
  console.log(`🔒 Enforcing ${agreements.length} agreements`);

  const results = [];

  for (const agreement of agreements) {
    try {
      const result = await enforceAgreement(agreement.id, envId);
      results.push(result);
    } catch (error) {
      console.error(`Failed to enforce agreement ${agreement.id}:`, error);
      results.push({
        agreement: agreement.name,
        error: error.message,
      });
    }
  }

  return {
    total: agreements.length,
    results,
  };
}

export default {
  enforceAgreement,
  enforceAllAgreements,
};

