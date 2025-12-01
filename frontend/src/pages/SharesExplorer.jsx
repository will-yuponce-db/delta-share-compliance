import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Avatar,
  Paper,
  Divider,
  alpha,
  CircularProgress,
  Skeleton,
  ToggleButtonGroup,
  ToggleButton,
  LinearProgress,
  Pagination,
  Stack,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderIcon from '@mui/icons-material/Folder';
import TableChartIcon from '@mui/icons-material/TableChart';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import StorageIcon from '@mui/icons-material/Storage';
import FunctionsIcon from '@mui/icons-material/Functions';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import { getTablesInShare, getTableMetadata } from '../services/shareService';
import useAppStore from '../store/useAppStore';

const SharesExplorer = () => {
  const { shares, sharesLoading, loadShares, loadingStatus } = useAppStore();
  const [expandedShares, setExpandedShares] = useState({});
  const [shareTables, setShareTables] = useState({});
  const [loadingTables, setLoadingTables] = useState({});
  const [expandedTables, setExpandedTables] = useState({});
  const [tableColumns, setTableColumns] = useState({});
  const [loadingColumns, setLoadingColumns] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState(['schema', 'table', 'volume', 'function', 'model']);
  const [shareDirectionFilter, setShareDirectionFilter] = useState(['provided', 'consumed']);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20); // 20 catalogs per page
  const [accurateAssetCounts, setAccurateAssetCounts] = useState({}); // Cache accurate counts

  useEffect(() => {
    if (shares.length === 0 && !sharesLoading) {
      loadShares();
    }
  }, [shares.length, sharesLoading, loadShares]);

  const toggleShare = async (shareId, envId) => {
    const key = `${envId}-${shareId}`;
    if (expandedShares[key]) {
      setExpandedShares({ ...expandedShares, [key]: false });
    } else {
      // Show loading state
      setLoadingTables({ ...loadingTables, [key]: true });
      setExpandedShares({ ...expandedShares, [key]: true });
      
      try {
        console.log(`🔍 Loading assets for share: ${shareId} (envId: ${envId})`);
        const tables = await getTablesInShare(envId, shareId);
        console.log(`✅ Received ${tables?.length || 0} assets:`, tables);
        setShareTables({ ...shareTables, [key]: tables });
      } catch (error) {
        console.error('Failed to load tables:', error);
      } finally {
        setLoadingTables({ ...loadingTables, [key]: false });
      }
    }
  };
  
  const toggleAsset = async (asset, envId) => {
    const key = `${envId}-${asset.fullName}`;
    if (expandedTables[key]) {
      setExpandedTables({ ...expandedTables, [key]: false });
    } else {
      // Show loading state
      setLoadingColumns({ ...loadingColumns, [key]: true });
      setExpandedTables({ ...expandedTables, [key]: true });
      
      try {
        // Only load columns for tables
        if (asset.assetType === 'table') {
          const metadata = await getTableMetadata(envId, asset.fullName);
          setTableColumns({ ...tableColumns, [key]: metadata.columns || [] });
        } else {
          // For other asset types, just mark as loaded (metadata display will show basic info)
          setTableColumns({ ...tableColumns, [key]: [] });
        }
      } catch (error) {
        console.error(`Failed to load ${asset.assetType} metadata:`, error);
        setTableColumns({ ...tableColumns, [key]: [] });
      } finally {
        setLoadingColumns({ ...loadingColumns, [key]: false });
      }
    }
  };

  const filteredShares = shares.filter(share => {
    const matchesSearch = share.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         share.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDirection = !share.direction || shareDirectionFilter.includes(share.direction);
    return matchesSearch && matchesDirection;
  });
  
  // Pagination
  const totalPages = Math.ceil(filteredShares.length / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedShares = filteredShares.slice(startIndex, endIndex);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, shareDirectionFilter]);
  
  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);
  
  // Load accurate asset counts for shares on current page
  useEffect(() => {
    let cancelled = false;
    
    const loadAccurateCounts = async () => {
      // Get shares on current page that don't have accurate counts yet
      const sharesToCount = paginatedShares.filter(share => {
        const key = `${share.environmentId}-${share.name}`;
        return !accurateAssetCounts[key] && accurateAssetCounts[key] !== -1;
      });
      
      if (sharesToCount.length === 0 || cancelled) return;
      
      console.log(`📊 Loading accurate counts for ${sharesToCount.length} shares on page ${page}`);
      
      // Mark as loading first to prevent duplicate requests
      const loadingKeys = {};
      sharesToCount.forEach(share => {
        const key = `${share.environmentId}-${share.name}`;
        loadingKeys[key] = -1;
      });
      setAccurateAssetCounts(prev => ({ ...prev, ...loadingKeys }));
      
      // Load counts for each share
      for (const share of sharesToCount) {
        if (cancelled) break;
        
        try {
          const tables = await getTablesInShare(share.environmentId, share.name);
          const key = `${share.environmentId}-${share.name}`;
          if (!cancelled) {
            setAccurateAssetCounts(prev => ({
              ...prev,
              [key]: tables.length
            }));
          }
        } catch (error) {
          console.error(`Failed to get count for ${share.name}:`, error);
          if (!cancelled) {
            const key = `${share.environmentId}-${share.name}`;
            setAccurateAssetCounts(prev => ({
              ...prev,
              [key]: 0
            }));
          }
        }
      }
    };
    
    if (paginatedShares.length > 0) {
      loadAccurateCounts();
    }
    
    return () => {
      cancelled = true;
    };
  }, [page, filteredShares.length]); // Only re-run when page or filter changes
  
  const handleAssetTypeFilterChange = (event, newFilters) => {
    if (newFilters.length > 0) {
      setAssetTypeFilter(newFilters);
    }
  };
  
  const handleShareDirectionFilterChange = (event, newFilters) => {
    if (newFilters.length > 0) {
      setShareDirectionFilter(newFilters);
    }
  };
  
  const getAssetIcon = (assetType) => {
    switch (assetType) {
      case 'schema': return <StorageIcon fontSize="small" />;
      case 'table': return <TableChartIcon fontSize="small" />;
      case 'volume': return <FolderIcon fontSize="small" />;
      case 'function': return <FunctionsIcon fontSize="small" />;
      case 'model': return <ModelTrainingIcon fontSize="small" />;
      default: return <TableChartIcon fontSize="small" />;
    }
  };
  
  const getAssetColor = (assetType) => {
    switch (assetType) {
      case 'schema': return { bg: '#fff8e1', fg: '#f57f17', color: 'warning' };
      case 'table': return { bg: '#e8f5e9', fg: '#2e7d32', color: 'success' };
      case 'volume': return { bg: '#e3f2fd', fg: '#1565c0', color: 'info' };
      case 'function': return { bg: '#fff3e0', fg: '#e65100', color: 'warning' };
      case 'model': return { bg: '#f3e5f5', fg: '#6a1b9a', color: 'secondary' };
      default: return { bg: '#e3f2fd', fg: '#1976d2', color: 'primary' };
    }
  };

  if (sharesLoading) {
    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Skeleton variant="text" width={200} height={40} />
          <Skeleton variant="text" width={400} height={24} />
        </Box>
        <Skeleton variant="rounded" height={60} sx={{ mb: 3 }} />
        {[1, 2, 3].map((i) => (
          <Card key={i} sx={{ mb: 2, borderRadius: 2 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Skeleton variant="circular" width={48} height={48} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="40%" height={32} />
                  <Skeleton variant="text" width="60%" height={20} />
                </Box>
                <Skeleton variant="rectangular" width={120} height={32} />
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  // Check if any environment is loading
  const isAnyLoading = Object.values(loadingStatus).some(status => status.isLoading);
  const currentStatus = loadingStatus['current'];
  
  // Calculate progress percentage
  const progressPercentage = currentStatus?.isLoading && currentStatus.totalCatalogs > 0
    ? (currentStatus.catalogsProcessed / currentStatus.totalCatalogs) * 100
    : 0;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Shares Explorer
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Browse Delta Shares and their tables with compliance status
        </Typography>
        
        {/* Loading Progress */}
        {isAnyLoading && currentStatus && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                Loading assets... [{currentStatus.catalogsProcessed}/{currentStatus.totalCatalogs} catalogs]
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {currentStatus.currentAssetCount || 0}+ assets found
              </Typography>
            </Box>
            <LinearProgress 
              variant="determinate" 
              value={progressPercentage}
              sx={{ height: 6, borderRadius: 1 }}
            />
          </Box>
        )}
      </Box>

      {/* Search and Filters */}
      <Paper 
        elevation={0}
        sx={{ 
          p: 3, 
          mb: 4,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <TextField
          fullWidth
          placeholder="Search catalogs by name or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
        
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ minWidth: 100 }}>
              Asset Types:
            </Typography>
            <ToggleButtonGroup
              value={assetTypeFilter}
              onChange={handleAssetTypeFilterChange}
              size="small"
              multiple
            >
              <ToggleButton value="schema" sx={{ px: 2 }}>
                <StorageIcon sx={{ fontSize: 18, mr: 0.5 }} />
                Schemas
              </ToggleButton>
              <ToggleButton value="table" sx={{ px: 2 }}>
                <TableChartIcon sx={{ fontSize: 18, mr: 0.5 }} />
                Tables
              </ToggleButton>
              <ToggleButton value="volume" sx={{ px: 2 }}>
                <FolderIcon sx={{ fontSize: 18, mr: 0.5 }} />
                Volumes
              </ToggleButton>
              <ToggleButton value="function" sx={{ px: 2 }}>
                <FunctionsIcon sx={{ fontSize: 18, mr: 0.5 }} />
                Functions
              </ToggleButton>
              <ToggleButton value="model" sx={{ px: 2 }}>
                <ModelTrainingIcon sx={{ fontSize: 18, mr: 0.5 }} />
                Models
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ minWidth: 100 }}>
              Direction:
            </Typography>
            <ToggleButtonGroup
              value={shareDirectionFilter}
              onChange={handleShareDirectionFilterChange}
              size="small"
              multiple
            >
              <ToggleButton value="provided" sx={{ px: 2 }}>
                <ArrowUpwardIcon sx={{ fontSize: 18, mr: 0.5 }} />
                Provided
              </ToggleButton>
              <ToggleButton value="consumed" sx={{ px: 2 }}>
                <ArrowDownwardIcon sx={{ fontSize: 18, mr: 0.5 }} />
                Consumed
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Paper>

      {/* Results Summary */}
      {filteredShares.length > 0 && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredShares.length)} of {filteredShares.length} catalogs
          </Typography>
          {totalPages > 1 && (
            <Pagination 
              count={totalPages} 
              page={page} 
              onChange={(e, value) => setPage(value)}
              color="primary"
              size="small"
            />
          )}
        </Box>
      )}

      {/* Shares List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filteredShares.length === 0 ? (
          <Paper 
            elevation={0}
            sx={{ 
              p: 8, 
              textAlign: 'center',
              borderRadius: 2,
              border: '2px dashed',
              borderColor: 'divider',
            }}
          >
            <Avatar 
              sx={{ 
                width: 80, 
                height: 80, 
                mx: 'auto', 
                mb: 2,
                bgcolor: 'primary.light',
                color: 'primary.main',
              }}
            >
              <FolderIcon sx={{ fontSize: 40 }} />
            </Avatar>
            <Typography variant="h6" color="text.secondary">
              No shares found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {searchTerm ? 'Try adjusting your search terms' : 'No shares available'}
            </Typography>
          </Paper>
        ) : (
          paginatedShares.map((share) => {
            const shareId = share.id || share.name;
            const key = `${share.environmentId}-${shareId}`;
            const isExpanded = expandedShares[key];
            const isLoadingTables = loadingTables[key];
            const tables = shareTables[key] || [];
            
            // Debug logging
            if (isExpanded && tables.length === 0 && !isLoadingTables) {
              console.warn(`⚠️  Share ${shareId} is expanded but has no assets. Key: ${key}, shareTables:`, shareTables);
            }

            return (
              <Card 
                key={key} 
                sx={{ 
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: 3,
                  }
                }}
              >
                <CardContent 
                  sx={{ 
                    p: 3,
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    }
                  }}
                  onClick={() => toggleShare(shareId, share.environmentId)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                      <Avatar 
                        sx={{ 
                          bgcolor: 'primary.main',
                          width: 48,
                          height: 48,
                        }}
                      >
                        <FolderIcon />
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography 
                          variant="h6" 
                          fontWeight="bold"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {share.name}
                        </Typography>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {share.comment || share.description || `${share.direction === 'consumed' ? 'External shared catalog' : 'Owned catalog'}`}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                      <Chip 
                        icon={share.direction === 'consumed' ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />}
                        label={share.direction === 'consumed' ? 'Consumed' : 'Provided'}
                        size="small"
                        color={share.direction === 'consumed' ? 'secondary' : 'primary'}
                        variant="outlined"
                      />
                      
                      {/* Compliance Status Badge */}
                      {share.compliance && (
                        <Chip 
                          icon={
                            share.compliance.status === 'compliant' ? <CheckCircleIcon /> :
                            share.compliance.status === 'non_compliant' ? <WarningIcon /> :
                            share.compliance.status === 'no_agreement' ? null : null
                          }
                          label={
                            share.compliance.status === 'compliant' ? 'Compliant' :
                            share.compliance.status === 'non_compliant' ? `${share.compliance.violations} Issues` :
                            share.compliance.status === 'no_agreement' ? 'No Agreement' :
                            'Unknown'
                          }
                          size="small"
                          color={
                            share.compliance.status === 'compliant' ? 'success' :
                            share.compliance.status === 'non_compliant' ? 'error' :
                            'default'
                          }
                          variant={share.compliance.status === 'no_agreement' ? 'outlined' : 'filled'}
                          title={
                            share.compliance.status === 'compliant' ? `All ${share.compliance.total} assets are compliant` :
                            share.compliance.status === 'non_compliant' ? `${share.compliance.compliant}/${share.compliance.total} assets compliant (${share.compliance.percentage}%)` :
                            share.compliance.status === 'no_agreement' ? 'No sharing agreement defined for this catalog' :
                            'Compliance status unknown'
                          }
                        />
                      )}
                      
                      <Chip 
                        icon={<TableChartIcon />}
                        label={
                          accurateAssetCounts[key] !== undefined
                            ? `${accurateAssetCounts[key]} assets`
                            : loadingStatus[share.environmentId]?.isLoading 
                              ? `${share.tableCount || 0}+ assets (loading...)`
                              : share.fullyScanned
                                ? `${share.tableCount || 0} assets`
                                : `${share.tableCount || 0}+ assets`
                        }
                        size="small"
                        variant="outlined"
                        color={
                          accurateAssetCounts[key] !== undefined ? 'success' :
                          loadingStatus[share.environmentId]?.isLoading ? 'warning' : 'primary'
                        }
                        title={
                          accurateAssetCounts[key] !== undefined
                            ? 'Accurate count from Unity Catalog'
                            : !share.fullyScanned && !loadingStatus[share.environmentId]?.isLoading
                              ? 'This catalog has not been fully scanned yet (partial count)'
                              : share.fullyScanned 
                                ? 'Full asset count'
                                : 'Currently loading'
                        }
                      />
                      <IconButton>
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>

                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <Divider />
                  <Box sx={{ bgcolor: 'action.hover', p: 3 }}>
                    {isLoadingTables ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {[1, 2, 3].map((i) => (
                          <Paper key={i} elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Skeleton variant="circular" width={32} height={32} />
                              <Box sx={{ flex: 1 }}>
                                <Skeleton variant="text" width="60%" height={24} />
                                <Skeleton variant="text" width="40%" height={20} />
                              </Box>
                              <Skeleton variant="rectangular" width={80} height={24} />
                            </Box>
                          </Paper>
                        ))}
                      </Box>
                    ) : tables.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                        No assets found in this catalog
                      </Typography>
                    ) : (
                      <Box>
                        {/* Group assets by type */}
                        {['schema', 'table', 'volume', 'function', 'model'].map(assetType => {
                          const filteredAssets = tables.filter(a => 
                            a.assetType === assetType && assetTypeFilter.includes(assetType)
                          );
                          
                          if (filteredAssets.length === 0) return null;
                          
                          const colors = getAssetColor(assetType);
                          
                          return (
                            <Box key={assetType} sx={{ mb: 3 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                <Avatar sx={{ bgcolor: colors.bg, width: 24, height: 24 }}>
                                  {getAssetIcon(assetType)}
                                </Avatar>
                                <Typography variant="subtitle2" fontWeight="bold" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                                  {assetType}S ({filteredAssets.length})
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {filteredAssets.map((asset, idx) => {
                                  const tableKey = `${share.environmentId}-${asset.fullName}`;
                                  const isTableExpanded = expandedTables[tableKey];
                                  const columns = tableColumns[tableKey] || [];
                                  const isLoadingMetadata = loadingColumns[tableKey];
                                  const isExpandable = true; // All asset types can be expanded
                                  
                                  return (
                                    <Box key={idx}>
                                      <Paper
                                        elevation={0}
                                        sx={{ 
                                          p: 2,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          border: '1px solid',
                                          borderColor: 'divider',
                                          borderRadius: 2,
                                          transition: 'all 0.2s ease',
                                          cursor: 'pointer',
                                          '&:hover': {
                                            borderColor: `${colors.color}.main`,
                                            bgcolor: 'background.paper',
                                          }
                                        }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          toggleAsset(asset, share.environmentId);
                                        }}
                                      >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                          <Avatar 
                                            sx={{ 
                                              bgcolor: colors.bg,
                                              color: colors.fg,
                                              width: 36,
                                              height: 36,
                                            }}
                                          >
                                            {getAssetIcon(asset.assetType)}
                                          </Avatar>
                                          <Box>
                                            <Typography variant="body1" fontWeight="600" color="text.primary">
                                              {asset.fullName}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                              {asset.catalog_name}.{asset.schema_name}
                                            </Typography>
                                          </Box>
                                        </Box>
                                        <IconButton size="small" color="primary">
                                          {isTableExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                        </IconButton>
                                      </Paper>
                                      
                                      {/* Metadata Collapse (for all asset types) */}
                                      <Collapse in={isTableExpanded}>
                                          <Box sx={{ pl: 6, pr: 2, py: 2, bgcolor: alpha(colors.bg, 0.1), borderRadius: 1, mt: 1 }}>
                                            {isLoadingMetadata ? (
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CircularProgress size={20} />
                                                <Typography variant="caption" color="text.secondary">
                                                  Loading metadata...
                                                </Typography>
                                              </Box>
                                            ) : asset.assetType === 'table' && columns.length > 0 ? (
                                              <Box>
                                                <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mb: 1.5 }}>
                                                  Columns ({columns.length})
                                                </Typography>
                                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1.5 }}>
                                                  {columns.map((column, colIdx) => (
                                                    <Paper
                                                      key={colIdx}
                                                      variant="outlined"
                                                      sx={{ 
                                                        p: 1.5, 
                                                        bgcolor: 'white',
                                                        borderLeft: '3px solid',
                                                        borderLeftColor: colors.fg,
                                                      }}
                                                    >
                                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                        <Typography variant="body2" fontWeight="600" color="text.primary">
                                                          {column.name}
                                                        </Typography>
                                                        <Chip 
                                                          label={column.type_text || column.type_name} 
                                                          size="small" 
                                                          sx={{ height: 20, fontSize: '0.7rem' }}
                                                        />
                                                      </Box>
                                                      {column.comment && (
                                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                                          {column.comment}
                                                        </Typography>
                                                      )}
                                                    </Paper>
                                                  ))}
                                                </Box>
                                              </Box>
                                            ) : (
                                              <Box>
                                                <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mb: 1.5 }}>
                                                  Asset Details
                                                </Typography>
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                  <Box sx={{ display: 'flex', gap: 2 }}>
                                                    <Typography variant="body2" fontWeight="600" color="text.secondary" sx={{ minWidth: 120 }}>
                                                      Type:
                                                    </Typography>
                                                    <Chip 
                                                      label={asset.assetType?.toUpperCase() || 'UNKNOWN'} 
                                                      size="small" 
                                                      color={colors.color}
                                                    />
                                                  </Box>
                                                  <Box sx={{ display: 'flex', gap: 2 }}>
                                                    <Typography variant="body2" fontWeight="600" color="text.secondary" sx={{ minWidth: 120 }}>
                                                      Full Name:
                                                    </Typography>
                                                    <Typography variant="body2" color="text.primary" sx={{ fontFamily: 'monospace' }}>
                                                      {asset.fullName}
                                                    </Typography>
                                                  </Box>
                                                  {asset.shared_as && (
                                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                                      <Typography variant="body2" fontWeight="600" color="text.secondary" sx={{ minWidth: 120 }}>
                                                        Shared As:
                                                      </Typography>
                                                      <Typography variant="body2" color="text.primary" sx={{ fontFamily: 'monospace' }}>
                                                        {asset.shared_as}
                                                      </Typography>
                                                    </Box>
                                                  )}
                                                  {asset.added_by && (
                                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                                      <Typography variant="body2" fontWeight="600" color="text.secondary" sx={{ minWidth: 120 }}>
                                                        Added By:
                                                      </Typography>
                                                      <Typography variant="body2" color="text.primary">
                                                        {asset.added_by}
                                                      </Typography>
                                                    </Box>
                                                  )}
                                                  {asset.added_at && (
                                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                                      <Typography variant="body2" fontWeight="600" color="text.secondary" sx={{ minWidth: 120 }}>
                                                        Added At:
                                                      </Typography>
                                                      <Typography variant="body2" color="text.primary">
                                                        {new Date(asset.added_at).toLocaleString()}
                                                      </Typography>
                                                    </Box>
                                                  )}
                                                  {asset.cdf_enabled !== undefined && (
                                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                                      <Typography variant="body2" fontWeight="600" color="text.secondary" sx={{ minWidth: 120 }}>
                                                        CDF Enabled:
                                                      </Typography>
                                                      <Chip 
                                                        label={asset.cdf_enabled ? 'Yes' : 'No'} 
                                                        size="small" 
                                                        color={asset.cdf_enabled ? 'success' : 'default'}
                                                      />
                                                    </Box>
                                                  )}
                                                  {asset.status && (
                                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                                      <Typography variant="body2" fontWeight="600" color="text.secondary" sx={{ minWidth: 120 }}>
                                                        Status:
                                                      </Typography>
                                                      <Chip 
                                                        label={asset.status} 
                                                        size="small" 
                                                        color={asset.status === 'ACTIVE' ? 'success' : 'default'}
                                                      />
                                                    </Box>
                                                  )}
                                                  {asset.assetType === 'table' && columns.length === 0 && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                                                      No columns available
                                                    </Typography>
                                                  )}
                                                </Box>
                                              </Box>
                                            )}
                                          </Box>
                                        </Collapse>
                                    </Box>
                                  );
                                })}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                  </Box>
                </Collapse>
              </Card>
            );
          })
        )}
      </Box>
      
      {/* Bottom Pagination */}
      {filteredShares.length > pageSize && (
        <Stack spacing={2} alignItems="center" sx={{ mt: 4 }}>
          <Pagination 
            count={totalPages} 
            page={page} 
            onChange={(e, value) => setPage(value)}
            color="primary"
            showFirstButton
            showLastButton
          />
          <Typography variant="caption" color="text.secondary">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredShares.length)} of {filteredShares.length} catalogs
          </Typography>
        </Stack>
      )}
    </Box>
  );
};

export default SharesExplorer;
