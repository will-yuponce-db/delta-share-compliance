import { useState } from 'react';
import { AppBar, Toolbar, Typography, Box, IconButton, Chip, Snackbar, Alert } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import SecurityIcon from '@mui/icons-material/Security';
import useAppStore from '../../store/useAppStore';
import { clearCache } from '../../services/validationService';

const Navbar = () => {
  const { complianceOverview, refreshAll, clearCache: clearFrontendCache } = useAppStore();
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const compliancePercentage = complianceOverview?.overall?.totalAssets > 0
    ? Math.round((complianceOverview.overall.compliantAssets / complianceOverview.overall.totalAssets) * 100)
    : 0;
  
  const handleClearCache = async () => {
    try {
      // Clear backend cache
      await clearCache();
      
      // Clear frontend cache
      clearFrontendCache();
      
      // Refresh all data
      await refreshAll();
      
      setSnackbar({ 
        open: true, 
        message: 'All caches cleared and data refreshed!', 
        severity: 'success' 
      });
    } catch (error) {
      console.error('Failed to clear cache:', error);
      setSnackbar({ 
        open: true, 
        message: 'Failed to clear cache', 
        severity: 'error' 
      });
    }
  };

  const getStatusColor = (percentage) => {
    if (percentage >= 90) return 'success';
    if (percentage >= 70) return 'warning';
    return 'error';
  };

  return (
    <AppBar 
      position="sticky" 
      color="default"
      elevation={0}
      sx={{ 
        bgcolor: 'white',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        {/* Logo and Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SecurityIcon color="primary" sx={{ fontSize: 32 }} />
          <Box>
            <Typography variant="h6" component="h1" fontWeight="bold" color="text.primary">
              Delta Sharing Compliance Manager
            </Typography>
          </Box>
        </Box>

        {/* Right side controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* Compliance Score */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary" fontWeight={500}>
              Compliance:
            </Typography>
            <Chip
              label={`${compliancePercentage}%`}
              color={getStatusColor(compliancePercentage)}
              size="small"
              sx={{ fontWeight: 600 }}
            />
            <IconButton
              size="small"
              onClick={refreshAll}
              title="Refresh all data"
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleClearCache}
              title="Clear cache and reload all assets"
              color="warning"
            >
              <ClearAllIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </Toolbar>
      
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AppBar>
  );
};

export default Navbar;
