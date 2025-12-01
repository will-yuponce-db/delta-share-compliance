import { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Alert,
  AlertTitle,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  Skeleton,
} from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { updateAssetTags } from '../services/tagService';
import useAppStore from '../store/useAppStore';

const RemediationPage = () => {
  const { violations, violationsLoading, loadViolations } = useAppStore();
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [fixDialogOpen, setFixDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [tagValues, setTagValues] = useState({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (violations.length === 0 && !violationsLoading) {
      loadViolations();
    }
  }, [violations.length, violationsLoading, loadViolations]);

  const handleFixViolation = (violation) => {
    setSelectedViolation(violation);
    const initialTags = {};
    violation.violations.forEach(v => {
      if (v.type === 'missing') {
        initialTags[v.tag] = v.requiredValue;
      } else if (v.type === 'incorrect') {
        initialTags[v.tag] = v.requiredValue;
      }
    });
    setTagValues(initialTags);
    setFixDialogOpen(true);
  };

  const handleShowConfirmation = () => {
    // Close the fix dialog and open confirmation
    setFixDialogOpen(false);
    setConfirmDialogOpen(true);
  };

  const handleApplyFix = async () => {
    if (!selectedViolation) return;

    setApplying(true);
    try {
      // Extract asset info from violation
      const parts = selectedViolation.fullName.split('.');
      const [shareId, schemaName, assetName] = parts;
      
      await updateAssetTags(
        selectedViolation.environmentId || 'current',
        shareId,
        schemaName,
        assetName,
        tagValues
      );

      setConfirmDialogOpen(false);
      setSelectedViolation(null);
      setTagValues({});
      await loadViolations();
      
      alert('Tags successfully applied!');
    } catch (error) {
      console.error('Failed to apply fix:', error);
      alert('Failed to apply fix: ' + error.message);
    } finally {
      setApplying(false);
    }
  };
  
  const handleCancelConfirmation = () => {
    // Go back to the fix dialog
    setConfirmDialogOpen(false);
    setFixDialogOpen(true);
  };

  if (violationsLoading) {
    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Skeleton variant="text" width={220} height={48} />
          <Skeleton variant="text" width={400} height={24} />
        </Box>
        <Skeleton variant="rectangular" height={80} sx={{ mb: 3, borderRadius: 1 }} />
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableCell key={i}><Skeleton variant="text" width={100} /></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {[1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton variant="text" width="90%" /></TableCell>
                  <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                  <TableCell><Skeleton variant="text" width={60} /></TableCell>
                  <TableCell><Skeleton variant="rectangular" width={70} height={24} /></TableCell>
                  <TableCell><Skeleton variant="rectangular" width={80} height={32} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Remediation Center
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Fix compliance violations and apply required tags
        </Typography>
      </Box>

      {/* Summary Alert */}
      {violations.length === 0 ? (
        <Alert severity="success" icon={<CheckCircleIcon />} sx={{ mb: 3 }}>
          <AlertTitle>All Clear!</AlertTitle>
          No violations found. All assets are compliant!
        </Alert>
      ) : (
        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3 }}>
          <AlertTitle>Action Required</AlertTitle>
          {violations.length} assets require remediation
        </Alert>
      )}

      {/* Violations Table */}
      {violations.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Asset Name</strong></TableCell>
                <TableCell><strong>Full Name</strong></TableCell>
                <TableCell><strong>Violations</strong></TableCell>
                <TableCell><strong>Severity</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {violations.map((violation, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {violation.assetName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {violation.fullName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {violation.violations?.length || 0} violations
                    </Typography>
                    {violation.violations?.slice(0, 2).map((v, i) => (
                      <Typography key={i} variant="caption" display="block" color="text.secondary">
                        • {v.message}
                      </Typography>
                    ))}
                  </TableCell>
                  <TableCell>
                    {violation.violations?.some(v => v.severity === 'critical') && (
                      <Chip label="Critical" color="error" size="small" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => handleFixViolation(violation)}
                    >
                      Fix Now
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Fix Dialog */}
      <Dialog open={fixDialogOpen} onClose={() => setFixDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Fix Compliance Violations
          <Typography variant="body2" color="text.secondary">
            {selectedViolation?.assetName}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Violations to Fix:
            </Typography>
            <List dense>
              {selectedViolation?.violations?.map((v, idx) => (
                <ListItem key={idx}>
                  <ListItemText
                    primary={v.message}
                    secondary={v.severity}
                  />
                </ListItem>
              ))}
            </List>

            <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
              Apply Tags:
            </Typography>
            {Object.entries(tagValues).map(([tag, value]) => (
              <TextField
                key={tag}
                fullWidth
                label={tag}
                value={value}
                onChange={(e) => setTagValues({ ...tagValues, [tag]: e.target.value })}
                margin="normal"
                size="small"
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFixDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleShowConfirmation}>
            Review & Apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onClose={() => !applying && setConfirmDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Confirm Tag Changes
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Please Review Carefully</AlertTitle>
            You are about to modify tags on the following asset. This action will update the Unity Catalog metadata.
          </Alert>

          <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Asset
            </Typography>
            <Typography variant="body1" fontWeight="bold">
              {selectedViolation?.assetName}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              {selectedViolation?.fullName}
            </Typography>
          </Box>

          <Typography variant="subtitle2" gutterBottom>
            Tags to be Applied:
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Tag Key</strong></TableCell>
                  <TableCell><strong>Value</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(tagValues).map(([tag, value]) => (
                  <TableRow key={tag}>
                    <TableCell>
                      <Chip label={tag} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{value}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="caption" color="text.secondary">
            This will fix {selectedViolation?.violations?.length || 0} violation(s).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelConfirmation} disabled={applying}>
            Go Back
          </Button>
          <Button 
            variant="contained" 
            onClick={handleApplyFix}
            disabled={applying}
            color="primary"
          >
            {applying ? 'Applying...' : 'Confirm & Apply'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RemediationPage;
