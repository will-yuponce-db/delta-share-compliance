import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  AlertTitle,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Chip,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import StorageIcon from '@mui/icons-material/Storage';
import api from '../services/api';

const SetupModal = ({ open, onClose, onSetupComplete }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [setupStatus, setSetupStatus] = useState({
    volume: null,
  });
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    { label: 'Create Volume', key: 'volume' },
  ];

  const handleSetup = async () => {
    setLoading(true);
    setError(null);
    setActiveStep(0);

    try {
      // Create volume (catalog and schema already exist)
      const volumeResult = await api.post('/setup', {
        action: 'create_volume',
        catalog: 'main',
        schema: 'default',
        volume: 'agreements',
      });
      setSetupStatus(prev => ({ ...prev, volume: volumeResult.data.success }));
      
      // Success!
      setActiveStep(1);
      setTimeout(() => {
        onSetupComplete?.();
      }, 1500);
      
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Setup failed');
      console.error('Setup error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={!loading ? onClose : undefined}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <StorageIcon color="primary" />
          <Typography variant="h6">Unity Catalog Setup Required</Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="warning">
            <AlertTitle>Agreement Storage Not Found</AlertTitle>
            The <strong>main.default.agreements</strong> volume is required to store and share 
            data governance agreements. This setup will create the necessary Unity Catalog resources.
          </Alert>
        </Box>

        {!loading && !activeStep && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" paragraph>
              This will create the <strong>agreements</strong> volume in <code>main.default</code>
            </Typography>
            <Box sx={{ pl: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                • Catalog <code>main</code> (already exists)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                • Schema <code>main.default</code> (already exists)
              </Typography>
              <Typography variant="body2" fontWeight="600">
                • Volume <code>main.default.agreements</code> (will be created)
              </Typography>
            </Box>
          </Box>
        )}

        {(loading || activeStep > 0) && (
          <Box sx={{ mb: 3 }}>
            <Stepper activeStep={activeStep} orientation="vertical">
              {steps.map((step, index) => (
                <Step key={step.key}>
                  <StepLabel
                    optional={
                      setupStatus[step.key] !== null && (
                        <Chip
                          icon={setupStatus[step.key] ? <CheckCircleIcon /> : <WarningIcon />}
                          label={setupStatus[step.key] ? 'Success' : 'Failed'}
                          size="small"
                          color={setupStatus[step.key] ? 'success' : 'error'}
                          variant="outlined"
                        />
                      )
                    }
                  >
                    {step.label}
                  </StepLabel>
                </Step>
              ))}
            </Stepper>

            {loading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Setting up Unity Catalog resources...
                </Typography>
              </Box>
            )}

            {!loading && activeStep === 1 && (
              <Alert severity="success" sx={{ mt: 2 }}>
                <AlertTitle>Setup Complete!</AlertTitle>
                The agreements volume has been created successfully. You can now create and share agreements.
              </Alert>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Setup Error</AlertTitle>
            {error}
          </Alert>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSetup} 
          variant="contained" 
          disabled={loading || activeStep === 1}
          startIcon={loading ? <CircularProgress size={20} /> : <StorageIcon />}
        >
          {activeStep === 1 ? 'Setup Complete' : 'Create Volume'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SetupModal;

