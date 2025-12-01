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
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Card,
  CardContent,
  Skeleton,
  Autocomplete,
  CircularProgress,
  Collapse,
  Checkbox,
  alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DescriptionIcon from '@mui/icons-material/Description';
import RemoveCircleIcon from '@mui/icons-material/RemoveCircle';
import LabelIcon from '@mui/icons-material/Label';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import { createAgreement, updateAgreement, deleteAgreement, parseAgreement } from '../services/agreementService';
import useAppStore from '../store/useAppStore';

const AgreementsPage = () => {
  const { agreements, agreementsLoading, shares, loadAgreements, loadShares } = useAppStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState(null);
  const [newAgreement, setNewAgreement] = useState({
    shareName: '',  // The share this agreement applies to
    agreementText: '',
    description: '',
    environments: ['prod'], // Default to prod environment
    selectedAssets: [], // Array of selected assets with scope: { type: 'catalog|schema|table|column', fullName }
    retentionYears: '', // Retention policy applies to all assets
    requiredTags: [{ key: '', value: '' }],
    disseminationRules: '',
  });
  
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [currentShare, setCurrentShare] = useState(null);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedAssetsForDialog, setSelectedAssetsForDialog] = useState([]); // Array for multi-select
  const [expandedSchemas, setExpandedSchemas] = useState({});
  const [expandedTables, setExpandedTables] = useState({});
  const [tableColumnsMap, setTableColumnsMap] = useState({});
  const [loadingColumns, setLoadingColumns] = useState({});
  const [selectedColumns, setSelectedColumns] = useState([]);

  useEffect(() => {
    if (agreements.length === 0 && !agreementsLoading) loadAgreements();
    if (shares.length === 0) loadShares();
  }, []);

  const handleAddTag = () => {
    setNewAgreement({
      ...newAgreement,
      requiredTags: [...newAgreement.requiredTags, { key: '', value: '' }],
    });
  };
  
  const handleRemoveTag = (index) => {
    const updatedTags = newAgreement.requiredTags.filter((_, i) => i !== index);
    setNewAgreement({
      ...newAgreement,
      requiredTags: updatedTags.length > 0 ? updatedTags : [{ key: '', value: '' }],
    });
  };
  
  const handleTagChange = (index, field, value) => {
    const updatedTags = [...newAgreement.requiredTags];
    updatedTags[index][field] = value;
    setNewAgreement({
      ...newAgreement,
      requiredTags: updatedTags,
    });
  };
  

  const handleOpenAssetSelector = (share) => {
    setCurrentShare(share);
    setAssetDialogOpen(true);
    setSelectedAssetsForDialog([]);
    setSelectedColumns([]);
    loadShareAssets(share);
  };

  const loadShareAssets = async (share) => {
    setLoadingAssets(true);
    try {
      const { getTablesInShare } = await import('../services/shareService');
      const assets = await getTablesInShare('prod', share.name);
      
      // Organize by schema
      const schemaMap = new Map();
      assets.forEach(asset => {
        const schemaName = asset.schema_name || 'default';
        if (!schemaMap.has(schemaName)) {
          schemaMap.set(schemaName, {
            name: schemaName,
            fullName: `${share.name}.${schemaName}`,
            assets: [],
          });
        }
        schemaMap.get(schemaName).assets.push(asset);
      });
      
      setAvailableAssets(Array.from(schemaMap.values()));
    } catch (error) {
      console.error('Failed to load share assets:', error);
      setAvailableAssets([]);
    } finally {
      setLoadingAssets(false);
    }
  };
  
  const toggleColumn = (columnName) => {
    setSelectedColumns(prev => 
      prev.includes(columnName)
        ? prev.filter(c => c !== columnName)
        : [...prev, columnName]
    );
  };

  // Helper functions to check if schema/table is selected (fully or partially)
  const getSchemaSelectionState = (schema) => {
    // Check if entire schema is selected
    const isFullySelected = newAgreement.selectedAssets.some(
      asset => asset.type === 'schema' && asset.fullName === schema.fullName
    );
    if (isFullySelected) return 'full';
    
    // Check if any assets under this schema are selected
    const hasPartialSelection = newAgreement.selectedAssets.some(
      asset => (asset.type === 'table' || asset.type === 'column') && 
               asset.schema === schema.name &&
               asset.catalog === currentShare?.name
    );
    if (hasPartialSelection) return 'partial';
    
    return 'none';
  };
  
  const getTableSelectionState = (table) => {
    // Check if entire table is selected
    const isFullySelected = newAgreement.selectedAssets.some(
      asset => asset.type === 'table' && asset.fullName === table.fullName
    );
    if (isFullySelected) return 'full';
    
    // Check if any columns are selected
    const hasColumnSelection = newAgreement.selectedAssets.some(
      asset => asset.type === 'column' && asset.table === table.name &&
               asset.schema === table.schema_name &&
               asset.catalog === table.catalog_name
    );
    if (hasColumnSelection) return 'partial';
    
    return 'none';
  };

  // Helper to check if an asset is selected in the dialog
  const isAssetSelectedInDialog = (assetKey) => {
    return selectedAssetsForDialog.some(a => a.key === assetKey);
  };

  // Helper to get icon and label for asset type
  const getAssetTypeDisplay = (assetType) => {
    switch (assetType?.toLowerCase()) {
      case 'table':
        return { icon: '📊', label: 'Table' };
      case 'volume':
        return { icon: '💾', label: 'Volume' };
      case 'function':
        return { icon: '⚡', label: 'Function' };
      case 'model':
        return { icon: '🤖', label: 'Model' };
      default:
        return { icon: '📄', label: 'Asset' };
    }
  };

  // Helper to format scope label
  const formatScopeLabel = (type) => {
    switch (type?.toLowerCase()) {
      case 'catalog':
        return 'Share';
      case 'schema':
        return 'Schema';
      case 'table':
        return 'Table';
      case 'column':
        return 'Column';
      default:
        return type?.toUpperCase() || 'Unknown';
    }
  };

  const handleAddAssetToAgreement = () => {
    if (selectedAssetsForDialog.length === 0) {
      alert('Please select at least one asset');
      return;
    }
    
    setNewAgreement({
      ...newAgreement,
      selectedAssets: [...newAgreement.selectedAssets, ...selectedAssetsForDialog],
    });
    
    // Reset dialog
    setSelectedAssetsForDialog([]);
    setSelectedColumns([]);
    setAssetDialogOpen(false);
  };
  
  const selectCatalog = () => {
    const asset = {
      key: `catalog-${currentShare.name}`,
      type: 'catalog',
      fullName: currentShare.name,
      name: currentShare.name,
      catalog: currentShare.name,
    };
    
    if (isAssetSelectedInDialog(asset.key)) {
      setSelectedAssetsForDialog(selectedAssetsForDialog.filter(a => a.key !== asset.key));
    } else {
      setSelectedAssetsForDialog([...selectedAssetsForDialog, asset]);
    }
  };
  
  const selectSchema = (schema) => {
    const asset = {
      key: `schema-${schema.fullName}`,
      type: 'schema',
      fullName: schema.fullName,
      name: schema.name,
      catalog: currentShare.name,
      schema: schema.name,
    };
    
    if (isAssetSelectedInDialog(asset.key)) {
      setSelectedAssetsForDialog(selectedAssetsForDialog.filter(a => a.key !== asset.key));
    } else {
      setSelectedAssetsForDialog([...selectedAssetsForDialog, asset]);
    }
  };
  
  const selectTable = (table) => {
    const asset = {
      key: `table-${table.fullName}`,
      type: 'table',
      fullName: table.fullName,
      name: table.name,
      catalog: table.catalog_name,
      schema: table.schema_name,
      table: table.name,
    };
    
    if (isAssetSelectedInDialog(asset.key)) {
      setSelectedAssetsForDialog(selectedAssetsForDialog.filter(a => a.key !== asset.key));
    } else {
      setSelectedAssetsForDialog([...selectedAssetsForDialog, asset]);
    }
  };
  
  const toggleSchemaExpanded = (schemaName) => {
    setExpandedSchemas({
      ...expandedSchemas,
      [schemaName]: !expandedSchemas[schemaName],
    });
  };
  
  const toggleTableExpanded = async (table) => {
    const key = table.fullName;
    if (expandedTables[key]) {
      setExpandedTables({ ...expandedTables, [key]: false });
    } else {
      setExpandedTables({ ...expandedTables, [key]: true });
      
      // Load columns if not already loaded
      if (!tableColumnsMap[key]) {
        setLoadingColumns({ ...loadingColumns, [key]: true });
        try {
          const { getTableMetadata } = await import('../services/shareService');
          const metadata = await getTableMetadata('prod', table.fullName);
          setTableColumnsMap({
            ...tableColumnsMap,
            [key]: metadata.columns || [],
          });
        } catch (error) {
          console.error('Failed to load columns:', error);
          setTableColumnsMap({ ...tableColumnsMap, [key]: [] });
        } finally {
          setLoadingColumns({ ...loadingColumns, [key]: false });
        }
      }
    }
  };
  
  const addColumnsSelection = (table) => {
    if (selectedColumns.length === 0) {
      alert('Please select at least one column');
      return;
    }
    
    const asset = {
      key: `columns-${table.fullName}-${selectedColumns.join(',')}`,
      type: 'column',
      fullName: `${table.fullName} (${selectedColumns.length} columns)`,
      name: table.name,
      catalog: table.catalog_name,
      schema: table.schema_name,
      table: table.name,
      columns: [...selectedColumns],
    };
    
    setSelectedAssetsForDialog([...selectedAssetsForDialog, asset]);
    setSelectedColumns([]);
  };

  const handleRemoveAsset = (index) => {
    setNewAgreement({
      ...newAgreement,
      selectedAssets: newAgreement.selectedAssets.filter((_, i) => i !== index),
    });
  };

  const handleCreateAgreement = async () => {
    if (!newAgreement.shareName || !newAgreement.agreementText) {
      alert('Please provide a share name and agreement text');
      return;
    }

    if (newAgreement.selectedAssets.length === 0) {
      alert('Please select at least one asset to apply this agreement to');
      return;
    }

    try {
      // Transform to backend format
      const agreementData = {
        name: `${newAgreement.shareName} - Sharing Agreement`,
        description: newAgreement.description,
        content: newAgreement.agreementText,
        environments: newAgreement.environments,
        shares: [newAgreement.shareName],
        requiredTags: newAgreement.requiredTags.filter(t => t.key && t.value),
        disseminationRules: newAgreement.disseminationRules,
        retentionYears: newAgreement.retentionYears,
        assetScopes: newAgreement.selectedAssets.map(asset => ({
          type: asset.type,
          fullName: asset.fullName,
          catalog: asset.catalog,
          schema: asset.schema,
          table: asset.table,
          columns: asset.columns,
        })),
      };

      // Check if we're editing an existing agreement
      if (selectedAgreement) {
        await updateAgreement(selectedAgreement.id, agreementData);
      } else {
        await createAgreement(agreementData);
      }
      
      setDialogOpen(false);
      setSelectedAgreement(null);
      setNewAgreement({
        shareName: '',
        agreementText: '',
        description: '',
        environments: ['prod'],
        selectedAssets: [],
        retentionYears: '',
        requiredTags: [{ key: '', value: '' }],
        disseminationRules: '',
      });
      await loadAgreements();
    } catch (error) {
      console.error('Failed to save agreement:', error);
      alert('Failed to save agreement');
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedAgreement(null);
    setNewAgreement({
      shareName: '',
      agreementText: '',
      description: '',
      environments: ['prod'],
      selectedAssets: [],
      retentionYears: '',
      requiredTags: [{ key: '', value: '' }],
      disseminationRules: '',
    });
  };

  const handleDeleteAgreement = async (id) => {
    if (!window.confirm('Are you sure you want to delete this agreement?')) {
      return;
    }

    try {
      await deleteAgreement(id);
      await loadAgreements();
    } catch (error) {
      console.error('Failed to delete agreement:', error);
      alert('Failed to delete agreement');
    }
  };

  const handleViewAgreement = (agreement) => {
    setSelectedAgreement(agreement);
    setViewDialogOpen(true);
  };

  const handleEditAgreement = (agreement) => {
    // Populate the form with existing agreement data
    // Ensure assets have the proper 'key' property for multi-select tracking
    const formattedAssets = (agreement.assetScopes || []).map(asset => ({
      ...asset,
      key: asset.key || `${asset.type}-${asset.fullName}`,
    }));
    
    setNewAgreement({
      shareName: agreement.shares?.[0] || '',
      agreementText: agreement.content || '',
      description: agreement.description || '',
      environments: agreement.environments || ['prod'],
      selectedAssets: formattedAssets,
      retentionYears: agreement.retentionYears || '',
      requiredTags: agreement.requiredTags && agreement.requiredTags.length > 0 
        ? agreement.requiredTags 
        : [{ key: '', value: '' }],
      disseminationRules: agreement.disseminationRules || '',
    });
    setSelectedAgreement(agreement);
    setDialogOpen(true);
  };

  if (agreementsLoading) {
    return (
      <Box>
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Skeleton variant="text" width={300} height={48} />
            <Skeleton variant="text" width={400} height={24} />
          </Box>
          <Skeleton variant="rectangular" width={140} height={40} />
        </Box>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <TableCell key={i}><Skeleton variant="text" width={100} /></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton variant="text" width="90%" /></TableCell>
                  <TableCell><Skeleton variant="text" width="85%" /></TableCell>
                  <TableCell><Skeleton variant="rectangular" width={80} height={24} /></TableCell>
                  <TableCell><Skeleton variant="text" width={100} /></TableCell>
                  <TableCell><Skeleton variant="text" width={80} /></TableCell>
                  <TableCell><Skeleton variant="rectangular" width={60} height={24} /></TableCell>
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
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Data Sharing Agreements
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage compliance requirements from legal agreements
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
        >
          New Agreement
        </Button>
      </Box>

      {/* Agreements List */}
      {agreements.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <DescriptionIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No Agreements Found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your first data sharing agreement to start tracking compliance requirements
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
            >
              Create Agreement
            </Button>
          </CardContent>
        </Card>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Name</strong></TableCell>
                <TableCell><strong>Description</strong></TableCell>
                <TableCell><strong>Shares</strong></TableCell>
                <TableCell><strong>Required Tags</strong></TableCell>
                <TableCell><strong>Created</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agreements.map((agreement) => (
                <TableRow key={agreement.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {agreement.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {agreement.description}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {agreement.shares?.length > 0 ? (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {agreement.shares.slice(0, 2).map((share, idx) => (
                          <Chip key={idx} label={share} size="small" sx={{ mr: 0.5 }} />
                        ))}
                        {agreement.shares.length > 2 && (
                          <Chip label={`+${agreement.shares.length - 2}`} size="small" />
                        )}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        All shares
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {agreement.requiredTags && agreement.requiredTags.filter(t => t.key).length > 0 ? (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {agreement.requiredTags.filter(t => t.key).slice(0, 3).map((tag, idx) => (
                          <Chip key={idx} label={`${tag.key}: ${tag.value}`} size="small" color="primary" variant="outlined" />
                        ))}
                        {agreement.requiredTags.filter(t => t.key).length > 3 && (
                          <Chip label={`+${agreement.requiredTags.filter(t => t.key).length - 3}`} size="small" />
                        )}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">No tags</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(agreement.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleViewAgreement(agreement)}
                      title="View Details"
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleEditAgreement(agreement)}
                      color="primary"
                      title="Edit"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteAgreement(agreement.id)}
                      color="error"
                      title="Delete"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create Agreement Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Create Data Sharing Agreement</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: 'block' }}>
            Define a sharing agreement for data assets. Select which assets to include and set retention policies.
          </Typography>

          {/* Step 1: Share Name and Agreement Text */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              1. Share Details
            </Typography>
            
            <Autocomplete
              fullWidth
              options={shares.filter(s => s.environmentId === 'prod')}
              getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
              value={shares.find(s => s.name === newAgreement.shareName) || null}
              onChange={(e, newValue) => {
                setNewAgreement({ 
                  ...newAgreement, 
                  shareName: newValue ? newValue.name : ''
                });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Share"
                  placeholder="Search shares..."
                  margin="normal"
                  size="small"
                  required
                />
              )}
              renderOption={(props, option) => {
                const { key, ...otherProps } = props;
                return (
                  <li key={key} {...otherProps}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight="600">{option.name}</Typography>
                        <Chip 
                          label={option.direction === 'provided' ? 'Provided' : 'Consumed'} 
                          size="small" 
                          color={option.direction === 'provided' ? 'success' : 'info'}
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {option.tableCount || 0} assets • {option.comment || 'No description'}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              filterOptions={(options, { inputValue }) => {
                const filtered = options.filter(option =>
                  option.name.toLowerCase().includes(inputValue.toLowerCase()) ||
                  option.comment?.toLowerCase().includes(inputValue.toLowerCase())
                );
                return filtered.slice(0, 100); // Limit to 100 results for performance
              }}
              loading={shares.length === 0}
              loadingText="Loading shares..."
              noOptionsText="No shares found"
            />

            <TextField
              fullWidth
              label="Agreement Text"
              value={newAgreement.agreementText}
              onChange={(e) => setNewAgreement({ ...newAgreement, agreementText: e.target.value })}
              margin="normal"
              multiline
              rows={4}
              required
              placeholder="Enter the terms and conditions of this data sharing agreement..."
              size="small"
            />
            
            <TextField
              fullWidth
              label="Description (Optional)"
              value={newAgreement.description}
              onChange={(e) => setNewAgreement({ ...newAgreement, description: e.target.value })}
              margin="normal"
              size="small"
              placeholder="Brief summary of this agreement"
            />
          </Paper>

          {/* Step 2: Select Assets & Set Retention Policy */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2">
                2. Select Assets & Retention Policy
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => newAgreement.shareName && handleOpenAssetSelector(shares.find(s => s.name === newAgreement.shareName))}
                disabled={!newAgreement.shareName}
              >
                Add Assets
              </Button>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Hierarchy: Catalog → Schema → Table → Column/Row
            </Typography>

            <TextField
              fullWidth
              label="Retention Period (Years)"
              type="number"
              value={newAgreement.retentionYears}
              onChange={(e) => setNewAgreement({ ...newAgreement, retentionYears: e.target.value })}
              size="small"
              placeholder="e.g., 7"
              sx={{ mb: 2 }}
              helperText="How long should the selected assets be retained? This applies to all assets in this agreement."
            />

            {newAgreement.selectedAssets.length === 0 ? (
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 3 }}>
                No assets selected. Click "Add Assets" to begin.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {newAgreement.selectedAssets.map((asset, index) => (
                  <Paper key={index} variant="outlined" sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight="600">
                        {asset.fullName}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Chip 
                          label={`Scope: ${formatScopeLabel(asset.type)}`}
                          size="small"
                          variant="outlined"
                          color="primary"
                        />
                        {asset.retentionYears && (
                          <Chip 
                            label={`Retention: ${asset.retentionYears} years`}
                            size="small"
                            variant="outlined"
                            color="success"
                          />
                        )}
                        {asset.columns && asset.columns.length > 0 && (
                          <Chip 
                            label={`${asset.columns.length} columns`}
                            size="small"
                            variant="outlined"
                            color="info"
                          />
                        )}
                      </Box>
                    </Box>
                    <IconButton size="small" color="error" onClick={() => handleRemoveAsset(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Paper>
                ))}
              </Box>
            )}
          </Paper>

          {/* Step 3: Required Tags */}
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2">
                3. Required Tags (Optional)
              </Typography>
              <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={handleAddTag}>
                Add Tag
              </Button>
            </Box>

            {newAgreement.requiredTags.map((tag, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  label="Tag Key"
                  value={tag.key}
                  onChange={(e) => handleTagChange(index, 'key', e.target.value)}
                  size="small"
                  placeholder="e.g., classification"
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Tag Value"
                  value={tag.value}
                  onChange={(e) => handleTagChange(index, 'value', e.target.value)}
                  size="small"
                  placeholder="e.g., PII"
                  sx={{ flex: 1 }}
                />
                <IconButton
                  onClick={() => handleRemoveTag(index)}
                  disabled={newAgreement.requiredTags.length === 1}
                  color="error"
                  size="small"
                >
                  <RemoveCircleIcon />
                </IconButton>
              </Box>
            ))}
          </Paper>

          {/* Step 4: Dissemination Rules */}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              4. Dissemination Rules (Optional)
            </Typography>
            <TextField
              fullWidth
              value={newAgreement.disseminationRules}
              onChange={(e) => setNewAgreement({ ...newAgreement, disseminationRules: e.target.value })}
              multiline
              rows={3}
              placeholder="Define rules for how this data can be shared or disseminated..."
              size="small"
            />
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateAgreement}>
            {selectedAgreement ? 'Update Agreement' : 'Create Agreement'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Asset Selector Dialog */}
      <Dialog open={assetDialogOpen} onClose={() => setAssetDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Select Assets for {currentShare?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
            Select assets from the hierarchy: Catalog → Schema → Table → Column/Row
          </Typography>

          {loadingAssets ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Loading assets...
              </Typography>
            </Box>
          ) : (
            <Box>
              {/* Option 1: Entire Share */}
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 2, 
                  mb: 2, 
                  cursor: 'pointer',
                  border: isAssetSelectedInDialog(`catalog-${currentShare?.name}`) ? 2 : 1,
                  borderColor: isAssetSelectedInDialog(`catalog-${currentShare?.name}`) ? 'success.main' : 'divider',
                  bgcolor: isAssetSelectedInDialog(`catalog-${currentShare?.name}`) ? 'success.light' : 'background.paper',
                  '&:hover': { borderColor: 'primary.main', bgcolor: isAssetSelectedInDialog(`catalog-${currentShare?.name}`) ? 'success.light' : 'action.hover' },
                }}
                onClick={selectCatalog}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {isAssetSelectedInDialog(`catalog-${currentShare?.name}`) && (
                    <CheckCircleIcon color="success" fontSize="small" />
                  )}
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle2" fontWeight="600">
                      📁 Entire Share: {currentShare?.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Apply agreement to all schemas, tables, and assets in this share
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              {/* Option 2-4: Schemas and Tables */}
              {availableAssets.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  {availableAssets.map((schema, schemaIdx) => (
                    <Paper key={schemaIdx} variant="outlined" sx={{ mb: 1 }}>
                      <Box
                        sx={{ 
                          p: 2, 
                          cursor: 'pointer',
                          bgcolor: isAssetSelectedInDialog(`schema-${schema.fullName}`)
                            ? 'success.light'
                            : getSchemaSelectionState(schema) === 'full'
                            ? 'success.light'
                            : getSchemaSelectionState(schema) === 'partial'
                            ? alpha('#fbbf24', 0.15)
                            : expandedSchemas[schema.name] ? 'action.selected' : 'background.paper',
                          border: isAssetSelectedInDialog(`schema-${schema.fullName}`) ||
                                  getSchemaSelectionState(schema) !== 'none' ? 2 : 0,
                          borderColor: isAssetSelectedInDialog(`schema-${schema.fullName}`) || getSchemaSelectionState(schema) === 'full' ? 'success.main' 
                                     : getSchemaSelectionState(schema) === 'partial' ? '#fbbf24' 
                                     : 'success.main',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                        onClick={() => toggleSchemaExpanded(schema.name)}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                            <IconButton size="small" sx={{ p: 0.5 }}>
                              {expandedSchemas[schema.name] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            </IconButton>
                            {isAssetSelectedInDialog(`schema-${schema.fullName}`) || getSchemaSelectionState(schema) === 'full' ? (
                              <CheckCircleIcon color="success" fontSize="small" />
                            ) : getSchemaSelectionState(schema) === 'partial' ? (
                              <IndeterminateCheckBoxIcon sx={{ color: '#fbbf24' }} fontSize="small" />
                            ) : null}
                            <Box>
                              <Typography variant="body2" fontWeight="600">
                                📂 Schema: {schema.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {schema.assets.length} assets
                                {getSchemaSelectionState(schema) === 'partial' && ' • Partially selected'}
                              </Typography>
                            </Box>
                          </Box>
                          <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); selectSchema(schema); }}>
                            {isAssetSelectedInDialog(`schema-${schema.fullName}`) ? 'Deselect' : 'Select'} Schema
                          </Button>
                        </Box>
                      </Box>

                      <Collapse in={expandedSchemas[schema.name]}>
                        <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
                          {schema.assets.map((table, tableIdx) => (
                            <Paper 
                              key={tableIdx} 
                              variant="outlined" 
                              sx={{ 
                                mb: 1, 
                                bgcolor: isAssetSelectedInDialog(`table-${table.fullName}`) ||
                                         getTableSelectionState(table) === 'full'
                                  ? 'success.light'
                                  : getTableSelectionState(table) === 'partial'
                                  ? alpha('#fbbf24', 0.15)
                                  : 'background.paper',
                                border: isAssetSelectedInDialog(`table-${table.fullName}`) ||
                                        getTableSelectionState(table) !== 'none' ? 2 : 1,
                                borderColor: isAssetSelectedInDialog(`table-${table.fullName}`) || getTableSelectionState(table) === 'full'
                                  ? 'success.main'
                                  : getTableSelectionState(table) === 'partial'
                                  ? '#fbbf24'
                                  : 'divider',
                              }}
                            >
                              <Box
                                sx={{ 
                                  p: 1.5,
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: 'action.hover' },
                                }}
                                onClick={() => toggleTableExpanded(table)}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                    {table.assetType === 'table' && (
                                      <IconButton size="small" sx={{ p: 0.5 }}>
                                        {expandedTables[table.fullName] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                      </IconButton>
                                    )}
                                    {isAssetSelectedInDialog(`table-${table.fullName}`) || getTableSelectionState(table) === 'full' ? (
                                      <CheckCircleIcon color="success" fontSize="small" />
                                    ) : getTableSelectionState(table) === 'partial' ? (
                                      <IndeterminateCheckBoxIcon sx={{ color: '#fbbf24' }} fontSize="small" />
                                    ) : null}
                                    <Box sx={{ flex: 1 }}>
                                      <Typography variant="body2">
                                        {getAssetTypeDisplay(table.assetType).icon} {table.name}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {getAssetTypeDisplay(table.assetType).label}
                                        {getTableSelectionState(table) === 'partial' && ' • Partially selected'}
                                      </Typography>
                                    </Box>
                                  </Box>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button 
                                      size="small" 
                                      variant="outlined"
                                      onClick={(e) => { e.stopPropagation(); selectTable(table); }}
                                    >
                                      {isAssetSelectedInDialog(`table-${table.fullName}`) ? 'Deselect' : 'Select'} {getAssetTypeDisplay(table.assetType).label}
                                    </Button>
                                    {table.assetType === 'table' && (
                                      <IconButton 
                                        size="small"
                                        onClick={(e) => { e.stopPropagation(); toggleTable(table); }}
                                      >
                                        {expandedTables[table.fullName] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                      </IconButton>
                                    )}
                                  </Box>
                                </Box>
                              </Box>

                              {/* Column selection for tables */}
                              {table.assetType === 'table' && (
                                <Collapse in={expandedTables[table.fullName]}>
                                  <Box sx={{ p: 2, bgcolor: 'action.selected' }}>
                                    {loadingColumns[table.fullName] ? (
                                      <Box sx={{ textAlign: 'center', py: 2 }}>
                                        <CircularProgress size={20} />
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                          Loading columns...
                                        </Typography>
                                      </Box>
                                    ) : tableColumnsMap[table.fullName]?.length > 0 ? (
                                      <Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                          <Typography variant="caption" fontWeight="600">
                                            Columns ({tableColumnsMap[table.fullName].length})
                                          </Typography>
                                            <Button 
                                            size="small" 
                                            variant="contained"
                                            disabled={selectedColumns.length === 0}
                                            onClick={() => addColumnsSelection(table)}
                                          >
                                            Add {selectedColumns.length} Column{selectedColumns.length !== 1 ? 's' : ''}
                                          </Button>
                                        </Box>
                                        <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                                          {tableColumnsMap[table.fullName].map((col, colIdx) => (
                                            <Paper
                                              key={colIdx}
                                              variant="outlined"
                                              sx={{ 
                                                p: 1, 
                                                mb: 0.5,
                                                cursor: 'pointer',
                                                bgcolor: selectedColumns.includes(col.name) ? 'success.light' : 'background.paper',
                                                border: selectedColumns.includes(col.name) ? 2 : 1,
                                                borderColor: selectedColumns.includes(col.name) ? 'success.main' : 'divider',
                                                '&:hover': { bgcolor: selectedColumns.includes(col.name) ? 'success.light' : 'action.hover' },
                                              }}
                                              onClick={() => toggleColumn(col.name)}
                                            >
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Checkbox
                                                  size="small"
                                                  checked={selectedColumns.includes(col.name)}
                                                  onChange={() => toggleColumn(col.name)}
                                                  color="success"
                                                />
                                                <Box sx={{ flex: 1 }}>
                                                  <Typography variant="caption" fontWeight="600">
                                                    {col.name}
                                                  </Typography>
                                                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                                    {col.type}
                                                  </Typography>
                                                </Box>
                                              </Box>
                                            </Paper>
                                          ))}
                                        </Box>
                                      </Box>
                                    ) : (
                                      <Typography variant="caption" color="text.secondary">
                                        No columns available
                                      </Typography>
                                    )}
                                  </Box>
                                </Collapse>
                              )}
                            </Paper>
                          ))}
                        </Box>
                      </Collapse>
                    </Paper>
                  ))}
                </Box>
              )}

              {/* Selected Assets Preview */}
              {selectedAssetsForDialog.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'success.light', border: 2, borderColor: 'success.main' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Selected Assets ({selectedAssetsForDialog.length})
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {selectedAssetsForDialog.map((asset, idx) => (
                      <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircleIcon color="success" fontSize="small" />
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight="600">
                            {asset.fullName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Scope: {formatScopeLabel(asset.type)}
                            {asset.columns && asset.columns.length > 0 && (
                              <> • {asset.columns.length} column{asset.columns.length !== 1 ? 's' : ''}</>
                            )}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssetDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleAddAssetToAgreement}
            disabled={selectedAssetsForDialog.length === 0}
          >
            Add {selectedAssetsForDialog.length > 0 ? `${selectedAssetsForDialog.length} Asset${selectedAssetsForDialog.length !== 1 ? 's' : ''}` : 'to Agreement'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Agreement Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{selectedAgreement?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            Description
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            {selectedAgreement?.description || 'No description'}
          </Typography>

          <Typography variant="subtitle2" gutterBottom>
            Shares
          </Typography>
          <Box sx={{ mb: 2, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {selectedAgreement?.shares?.length > 0 ? (
              selectedAgreement.shares.map((share, idx) => (
                <Chip key={idx} label={share} size="small" />
              ))
            ) : (
              <Typography variant="caption" color="text.secondary">All shares</Typography>
            )}
          </Box>

          <Typography variant="subtitle2" gutterBottom>
            Required Tags
          </Typography>
          <Box sx={{ mb: 2, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {selectedAgreement?.requiredTags?.filter(t => t.key).length > 0 ? (
              selectedAgreement.requiredTags.filter(t => t.key).map((tag, idx) => (
                <Chip key={idx} label={`${tag.key}: ${tag.value}`} size="small" color="primary" />
              ))
            ) : (
              <Typography variant="caption" color="text.secondary">No required tags</Typography>
            )}
          </Box>

          {selectedAgreement?.retentionYears && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Retention Period
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                {selectedAgreement.retentionYears} years
              </Typography>
            </>
          )}

          {selectedAgreement?.disseminationRules && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Dissemination Rules
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                {selectedAgreement.disseminationRules}
              </Typography>
            </>
          )}

          {selectedAgreement?.assetScopes && selectedAgreement.assetScopes.length > 0 && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Asset Scopes
              </Typography>
              <Box sx={{ mb: 2 }}>
                {selectedAgreement.assetScopes.map((scope, idx) => (
                  <Paper key={idx} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                    <Typography variant="body2" fontWeight="medium">
                      {scope.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Scope: {scope.scope}
                      {scope.scope === 'column' && scope.columns?.length > 0 && (
                        <> • Columns: {scope.columns.join(', ')}</>
                      )}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            </>
          )}

          {selectedAgreement?.volumePaths && selectedAgreement.volumePaths.length > 0 && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Agreement Files
              </Typography>
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                {selectedAgreement.volumePaths.map((path, idx) => (
                  <Typography key={idx} variant="caption" display="block" sx={{ fontFamily: 'monospace' }}>
                    📄 {path.share}: {path.volumePath}
                  </Typography>
                ))}
              </Paper>
            </>
          )}

          <Typography variant="subtitle2" gutterBottom>
            Agreement Content
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 2, maxHeight: 200, overflow: 'auto' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {selectedAgreement?.content}
            </Typography>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AgreementsPage;
