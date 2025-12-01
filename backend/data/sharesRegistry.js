// Registry to track which shares have been processed for agreement ingestion
const processedShares = new Set();

export const isShareProcessed = (envId, shareName) => {
  const key = `${envId}:${shareName}`;
  return processedShares.has(key);
};

export const markShareAsProcessed = (envId, shareName) => {
  const key = `${envId}:${shareName}`;
  processedShares.add(key);
};

export const clearRegistry = () => {
  processedShares.clear();
};

export const getProcessedShares = () => {
  return Array.from(processedShares);
};
