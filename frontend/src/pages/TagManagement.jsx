import { useState, useEffect } from 'react';
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
  Checkbox,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Skeleton,
} from '@mui/material';
import LabelIcon from '@mui/icons-material/Label';
import { validateAllAssets } from '../services/validationService';
import { bulkUpdateTags } from '../services/tagService';
import useAppStore from '../store/useAppStore';

const TagManagement = () => {
  const { assets, loadAssets: loadAssetsStore } = useAppStore();
  const [validatedAssets, setValidatedAssets] = useState([]);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [bulkTags, setBulkTags] = useState({ tag: '', value: '' });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showBulkDialog, setShowBulkDialog] = useState(false);

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setLoading(true);
    try {
      // Ensure assets are loaded in store
      if (assets.length === 0) {
        await loadAssetsStore();
      }
      
      // Validate all assets
      const data = await validateAllAssets();
      setValidatedAssets(data.results);
    } catch (error) {
      console.error('Failed to load assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAsset = (assetName) => {
    if (selectedAssets.includes(assetName)) {
      setSelectedAssets(selectedAssets.filter(a => a !== assetName));
    } else {
      setSelectedAssets([...selectedAssets, assetName]);
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedAssets(filteredAssets.map(a => a.assetName));
    } else {
      setSelectedAssets([]);
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkTags.tag || !bulkTags.value || selectedAssets.length === 0) {
      alert('Please select assets and provide tag name and value');
      return;
    }

    try {
      const assetsToUpdate = selectedAssets.map(assetName => {
        const asset = validatedAssets.find(a => a.assetName === assetName);
        return {
          id: asset.assetId,
          assetId: asset.assetId,
        };
      });

      await bulkUpdateTags(assetsToUpdate, { [bulkTags.tag]: bulkTags.value });
      setShowBulkDialog(false);
      setSelectedAssets([]);
      setBulkTags({ tag: '', value: '' });
      await loadAssets();
    } catch (error) {
      console.error('Failed to update tags:', error);
      alert('Failed to update tags');
    }
  };

  const filteredAssets = validatedAssets.filter(asset => {
    if (filterStatus === 'compliant') return asset.compliant;
    if (filterStatus === 'non-compliant') return !asset.compliant;
    return true;
  });

  if (loading) {
    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Skeleton variant="text" width={200} height={48} />
          <Skeleton variant="text" width={400} height={24} />
        </Box>
        <Skeleton variant="rectangular" height={60} sx={{ mb: 3 }} />
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox"><Skeleton variant="rectangular" width={18} height={18} /></TableCell>
                <TableCell><Skeleton variant="text" width={100} /></TableCell>
                <TableCell><Skeleton variant="text" width={80} /></TableCell>
                <TableCell><Skeleton variant="text" width={100} /></TableCell>
                <TableCell><Skeleton variant="text" width={80} /></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell padding="checkbox"><Skeleton variant="rectangular" width={18} height={18} /></TableCell>
                  <TableCell><Skeleton variant="text" width="80%" /></TableCell>
                  <TableCell><Skeleton variant="rectangular" width={80} height={24} /></TableCell>
                  <TableCell><Skeleton variant="text" width={60} /></TableCell>
                  <TableCell><Skeleton variant="text" width={40} /></TableCell>
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
          Tag Management
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Apply and manage tags across multiple assets
        </Typography>
      </Box>

      {/* Bulk Tag Editor Alert */}
      {selectedAssets.length > 0 && (
        <Alert 
          severity="info" 
          sx={{ mb: 3 }}
          action={
            <Button 
              color="inherit" 
              size="small"
              onClick={() => setShowBulkDialog(true)}
            >
              Edit Tags
            </Button>
          }
        >
          {selectedAssets.length} asset{selectedAssets.length > 1 ? 's' : ''} selected
        </Alert>
      )}

      {/* Filter */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <ToggleButtonGroup
          value={filterStatus}
          exclusive
          onChange={(e, newValue) => newValue && setFilterStatus(newValue)}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="compliant">Compliant</ToggleButton>
          <ToggleButton value="non-compliant">Non-Compliant</ToggleButton>
        </ToggleButtonGroup>
        
        <Typography variant="body2" color="text.secondary">
          Showing {filteredAssets.length} of {assets.length} assets
        </Typography>
      </Box>

      {/* Assets Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={selectedAssets.length === filteredAssets.length && filteredAssets.length > 0}
                  indeterminate={selectedAssets.length > 0 && selectedAssets.length < filteredAssets.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </TableCell>
              <TableCell><strong>Asset Name</strong></TableCell>
              <TableCell><strong>Status</strong></TableCell>
              <TableCell><strong>Current Tags</strong></TableCell>
              <TableCell><strong>Violations</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredAssets.map((asset, index) => (
              <TableRow key={asset.assetId || asset.fullName || index} hover>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedAssets.includes(asset.assetName)}
                    onChange={() => handleSelectAsset(asset.assetName)}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {asset.assetName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {asset.fullName}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={asset.compliant ? 'Compliant' : 'Non-Compliant'}
                    color={asset.compliant ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {Object.keys(asset.tags || {}).length} tags
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="error.main">
                    {asset.violations?.length || 0} violations
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Bulk Tag Dialog */}
      <Dialog open={showBulkDialog} onClose={() => setShowBulkDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Bulk Tag Editor
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Apply tags to {selectedAssets.length} selected asset{selectedAssets.length > 1 ? 's' : ''}
          </Typography>
          
          <TextField
            fullWidth
            label="Tag Name"
            value={bulkTags.tag}
            onChange={(e) => setBulkTags({ ...bulkTags, tag: e.target.value })}
            margin="normal"
            placeholder="e.g., PII"
          />
          
          <TextField
            fullWidth
            label="Tag Value"
            value={bulkTags.value}
            onChange={(e) => setBulkTags({ ...bulkTags, value: e.target.value })}
            margin="normal"
            placeholder="e.g., true"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkDialog(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleBulkUpdate}>
            Apply to Selected
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TagManagement;
