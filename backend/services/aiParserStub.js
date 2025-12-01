// Mock AI parser that extracts tag requirements from agreements
export const parseAgreement = (agreementContent) => {
  // Simple pattern matching to extract requirements
  // In a real implementation, this would use an LLM
  
  const requirements = [];
  
  // Look for PII mentions
  if (agreementContent.toLowerCase().includes('pii') || 
      agreementContent.toLowerCase().includes('personally identifiable')) {
    requirements.push({
      scope: '*.*.*',
      requiredTags: {
        PII: 'true',
      },
      severity: 'critical',
      reason: 'Document mentions PII requirements',
    });
  }
  
  // Look for classification mentions
  const classificationMatch = agreementContent.match(/data_classification[:\s]+["']?(\w+)["']?/i);
  if (classificationMatch) {
    requirements.push({
      scope: '*.*.*',
      requiredTags: {
        data_classification: classificationMatch[1].toLowerCase(),
      },
      severity: 'critical',
      reason: `Document specifies ${classificationMatch[1]} classification`,
    });
  }
  
  // Look for retention mentions
  const retentionMatch = agreementContent.match(/retention[_\s]+period[:\s]+["']?(\d+_?\w+)["']?/i);
  if (retentionMatch) {
    requirements.push({
      scope: '*.*.*',
      requiredTags: {
        retention_period: retentionMatch[1].toLowerCase(),
      },
      severity: 'warning',
      reason: `Document specifies ${retentionMatch[1]} retention period`,
    });
  }
  
  // Look for compliance framework mentions
  if (agreementContent.match(/sox|sarbanes.oxley/i)) {
    requirements.push({
      scope: '*.*.*',
      requiredTags: {
        compliance_framework: 'SOX',
      },
      severity: 'critical',
      reason: 'Document mentions SOX compliance',
    });
  }
  
  if (agreementContent.match(/gdpr/i)) {
    requirements.push({
      scope: '*.*.*',
      requiredTags: {
        compliance_framework: 'GDPR',
      },
      severity: 'critical',
      reason: 'Document mentions GDPR compliance',
    });
  }
  
  if (agreementContent.match(/hipaa/i)) {
    requirements.push({
      scope: '*.*.*',
      requiredTags: {
        compliance_framework: 'HIPAA',
      },
      severity: 'critical',
      reason: 'Document mentions HIPAA compliance',
    });
  }
  
  return {
    success: true,
    requirements,
    summary: `Extracted ${requirements.length} tag requirements from agreement`,
  };
};

export const suggestTags = (assetName, schema) => {
  // Suggest tags based on asset name and schema
  const suggestions = [];
  
  // Check for PII-related column names
  const piiColumns = ['email', 'phone', 'ssn', 'address', 'name', 'credit_card'];
  const hasPII = schema?.some(col => 
    piiColumns.some(piiCol => col.name.toLowerCase().includes(piiCol))
  );
  
  if (hasPII) {
    suggestions.push({
      tag: 'PII',
      value: 'true',
      confidence: 0.9,
      reason: 'Schema contains PII-related columns',
    });
    suggestions.push({
      tag: 'data_classification',
      value: 'sensitive',
      confidence: 0.8,
      reason: 'Table contains PII',
    });
  } else {
    suggestions.push({
      tag: 'PII',
      value: 'false',
      confidence: 0.7,
      reason: 'No obvious PII columns detected',
    });
  }
  
  // Suggest retention based on table name
  if (assetName.toLowerCase().includes('transaction') || 
      assetName.toLowerCase().includes('financial')) {
    suggestions.push({
      tag: 'retention_period',
      value: '10_years',
      confidence: 0.6,
      reason: 'Financial data typically requires long retention',
    });
  } else if (assetName.toLowerCase().includes('log') || 
             assetName.toLowerCase().includes('event')) {
    suggestions.push({
      tag: 'retention_period',
      value: '1_year',
      confidence: 0.7,
      reason: 'Log data typically has shorter retention',
    });
  }
  
  return suggestions;
};





