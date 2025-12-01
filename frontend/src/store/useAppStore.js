import { create } from 'zustand';
import { getAllShares, getAllTables, getLoadingStatus } from '../services/shareService';
import { getComplianceOverview, getViolations, validateAllAssets } from '../services/validationService';
import { getAllAgreements } from '../services/agreementService';
import { getAllEnvironments } from '../services/environmentService';

const useAppStore = create((set, get) => ({
  // Shares/Catalogs state
  shares: [],
  sharesLoading: false,
  sharesLastUpdated: null,
  
  // Loading status for progressive loading
  loadingStatus: {},
  loadingStatusInterval: null,
  
  // Assets state
  assets: [],
  assetsLoading: false,
  assetsLastUpdated: null,
  
  // Compliance state
  complianceOverview: null,
  complianceLoading: false,
  complianceLastUpdated: null,
  
  // Violations state
  violations: [],
  violationsLoading: false,
  violationsLastUpdated: null,
  
  // Agreements state
  agreements: [],
  agreementsLoading: false,
  agreementsLastUpdated: null,
  
  // Environments state
  environments: [],
  environmentsLoading: false,
  
  // Actions
  loadShares: async () => {
    set({ sharesLoading: true });
    
    // Start polling for loading status
    get().startLoadingStatusPolling();
    
    try {
      const data = await getAllShares();
      set({ 
        shares: data, 
        sharesLoading: false,
        sharesLastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load shares:', error);
      set({ sharesLoading: false });
    } finally {
      // Continue polling until complete
      setTimeout(() => {
        get().checkLoadingComplete();
      }, 1000);
    }
  },
  
  startLoadingStatusPolling: () => {
    const { loadingStatusInterval } = get();
    
    // Clear existing interval if any
    if (loadingStatusInterval) {
      clearInterval(loadingStatusInterval);
    }
    
    let pollCount = 0;
    const MAX_POLLS = 150; // Stop after 5 minutes (150 * 2s = 300s)
    
    // Start polling every 2 seconds
    const interval = setInterval(async () => {
      pollCount++;
      
      // Safety: stop polling after max attempts
      if (pollCount > MAX_POLLS) {
        console.log('⚠️  Polling timeout reached, stopping...');
        get().stopLoadingStatusPolling();
        return;
      }
      
      try {
        const status = await getLoadingStatus();
        set({ loadingStatus: status });
        
        // Check if loading is complete
        get().checkLoadingComplete();
      } catch (error) {
        console.error('Failed to get loading status:', error);
      }
    }, 2000);
    
    set({ loadingStatusInterval: interval });
  },
  
  stopLoadingStatusPolling: () => {
    const { loadingStatusInterval } = get();
    if (loadingStatusInterval) {
      clearInterval(loadingStatusInterval);
      set({ loadingStatusInterval: null });
    }
  },
  
  checkLoadingComplete: async () => {
    const { loadingStatus, stopLoadingStatusPolling } = get();
    
    // Check if all environments are done loading
    const allComplete = Object.values(loadingStatus).every(status => !status.isLoading);
    
    if (allComplete && Object.keys(loadingStatus).length > 0) {
      console.log('✅ All assets loaded, refreshing shares...');
      stopLoadingStatusPolling();
      
      // Refresh shares to get final counts (without restarting polling)
      try {
        const data = await getAllShares();
        set({ 
          shares: data,
          sharesLastUpdated: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Failed to refresh shares:', error);
      }
    }
  },
  
  loadAssets: async () => {
    set({ assetsLoading: true });
    try {
      const data = await getAllTables();
      set({ 
        assets: data, 
        assetsLoading: false,
        assetsLastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load assets:', error);
      set({ assetsLoading: false });
    }
  },
  
  loadCompliance: async () => {
    set({ complianceLoading: true });
    try {
      const data = await getComplianceOverview();
      set({ 
        complianceOverview: data, 
        complianceLoading: false,
        complianceLastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load compliance:', error);
      set({ complianceLoading: false });
    }
  },
  
  loadViolations: async () => {
    set({ violationsLoading: true });
    try {
      const data = await getViolations();
      set({ 
        violations: data.violations || [], 
        violationsLoading: false,
        violationsLastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load violations:', error);
      set({ violationsLoading: false });
    }
  },
  
  loadAgreements: async () => {
    set({ agreementsLoading: true });
    try {
      const data = await getAllAgreements();
      set({ 
        agreements: data, 
        agreementsLoading: false,
        agreementsLastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to load agreements:', error);
      set({ agreementsLoading: false });
    }
  },
  
  loadEnvironments: async () => {
    set({ environmentsLoading: true });
    try {
      const data = await getAllEnvironments();
      set({ 
        environments: data, 
        environmentsLoading: false,
      });
    } catch (error) {
      console.error('Failed to load environments:', error);
      set({ environmentsLoading: false });
    }
  },
  
  // Refresh all data
  refreshAll: async () => {
    const { loadShares, loadAssets, loadCompliance, loadViolations, loadAgreements } = get();
    await Promise.all([
      loadShares(),
      loadAssets(),
      loadCompliance(),
      loadViolations(),
      loadAgreements(),
    ]);
  },
  
  // Refresh compliance data only
  refreshCompliance: async () => {
    const { loadCompliance, loadViolations } = get();
    await Promise.all([
      loadCompliance(),
      loadViolations(),
    ]);
  },
  
  // Clear cache by invalidating timestamps (forces reload on next access)
  clearCache: () => {
    set({
      sharesLastUpdated: null,
      assetsLastUpdated: null,
      complianceLastUpdated: null,
      violationsLastUpdated: null,
      agreementsLastUpdated: null,
    });
  },
}));

export default useAppStore;
