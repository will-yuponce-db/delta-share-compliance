// In-memory store for agreements (not from Databricks)
let agreements = [];

export const getAllAgreements = () => agreements;

export const getAgreementById = (id) => agreements.find(a => a.id === id);

export const addAgreement = (agreementData) => {
  // Check for duplicates based on shares
  const shareName = agreementData.shares?.[0];
  if (shareName) {
    const existingIndex = agreements.findIndex(a => 
      a.shares?.includes(shareName) && 
      a.source === agreementData.source
    );
    
    if (existingIndex !== -1) {
      // Update existing agreement instead of creating duplicate
      console.log(`   Updating existing agreement for share: ${shareName}`);
      agreements[existingIndex] = {
        ...agreements[existingIndex],
        ...agreementData,
        updatedAt: new Date().toISOString(),
      };
      return agreements[existingIndex];
    }
  }
  
  const newAgreement = {
    id: `agreement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...agreementData,
    createdAt: agreementData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  agreements.push(newAgreement);
  return newAgreement;
};

export const updateAgreement = (id, updates) => {
  const index = agreements.findIndex(a => a.id === id);
  if (index !== -1) {
    agreements[index] = {
      ...agreements[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    return agreements[index];
  }
  return null;
};

export const deleteAgreement = (id) => {
  const index = agreements.findIndex(a => a.id === id);
  if (index !== -1) {
    agreements.splice(index, 1);
    return true;
  }
  return false;
};
