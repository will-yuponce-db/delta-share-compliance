import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Alert,
  AlertTitle,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  TextField,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import CancelIcon from '@mui/icons-material/Cancel';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { getTableMetadata } from '../services/shareService';
import { validateAsset } from '../services/validationService';
import { updateAssetTags } from '../services/tagService';

const AssetDetails = () => {
  const { envId, shareId, schema, table } = useParams();
  const navigate = useNavigate();
  const [metadata, setMetadata] = useState(null);
  const [validation, setValidation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingTags, setEditingTags] = useState(false);
  const [newTags, setNewTags] = useState({});

  useEffect(() => {
    loadAssetDetails();
  }, [envId, shareId, schema, table]);

  const loadAssetDetails = async () => {
    setLoading(true);
    try {
      const meta = await getTableMetadata(envId, shareId, schema, table);
      setMetadata(meta);
      setNewTags(meta.tags || {});
      
      const val = await validateAsset(envId, shareId, schema, table);
      setValidation(val);
    } catch (error) {
      console.error('Failed to load asset details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTags = async () => {
    try {
      await updateAssetTags(envId, shareId, schema, table, newTags);
      await loadAssetDetails();
      setEditingTags(false);
    } catch (error) {
      console.error('Failed to update tags:', error);
    }
  };

  const addTag = () => {
    const tagName = prompt('Enter tag name:');
    if (tagName) {
      setNewTags({ ...newTags, [tagName]: '' });
    }
  };

  const removeTag = (tagKey) => {
    const updated = { ...newTags };
    delete updated[tagKey];
    setNewTags(updated);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
        <Typography color="text.secondary">Loading asset details...</Typography>
      </Box>
    );
  }

  if (!metadata) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">Asset not found</Typography>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/shares')}
          sx={{ mt: 2 }}
        >
          Back to Shares
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/shares')}
          sx={{ mb: 2 }}
        >
          Back to Shares
        </Button>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" fontWeight="bold">
              {metadata.name}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {metadata.full_name || metadata.fullName}
            </Typography>
          </Box>
          <Chip
            label={validation?.isCompliant ? '✓ Compliant' : '✗ Non-Compliant'}
            color={validation?.isCompliant ? 'success' : 'error'}
            sx={{ px: 2, py: 3 }}
          />
        </Box>
      </Box>

      {/* Violations Alert */}
      {validation && !validation.isCompliant && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle><strong>{validation.violations.length} Compliance Violations Found</strong></AlertTitle>
          <Box component="ul" sx={{ mt: 1, mb: 0 }}>
            {validation.violations.map((violation, idx) => (
              <li key={idx}>{violation.message}</li>
            ))}
          </Box>
        </Alert>
      )}

      {/* Schema */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Schema
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell><strong>Column</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell><strong>Nullable</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {metadata.columns?.map((col, idx) => (
                <TableRow key={idx}>
                  <TableCell>{col.name}</TableCell>
                  <TableCell><code>{col.type}</code></TableCell>
                  <TableCell>{col.nullable ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Tags */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            Tags
          </Typography>
          {!editingTags ? (
            <Button
              startIcon={<EditIcon />}
              onClick={() => setEditingTags(true)}
              variant="outlined"
            >
              Edit Tags
            </Button>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                startIcon={<CancelIcon />}
                onClick={() => {
                  setEditingTags(false);
                  setNewTags(metadata.tags || {});
                }}
              >
                Cancel
              </Button>
              <Button
                startIcon={<SaveIcon />}
                onClick={handleSaveTags}
                variant="contained"
              >
                Save
              </Button>
            </Box>
          )}
        </Box>
        
        {editingTags ? (
          <Box>
            {Object.entries(newTags).map(([key, value]) => (
              <Box key={key} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <TextField
                  value={key}
                  disabled
                  size="small"
                  sx={{ flex: 1 }}
                />
                <TextField
                  value={value}
                  onChange={(e) => setNewTags({ ...newTags, [key]: e.target.value })}
                  placeholder="Tag value"
                  size="small"
                  sx={{ flex: 1 }}
                />
                <IconButton onClick={() => removeTag(key)} color="error" size="small">
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
            <Button
              startIcon={<AddIcon />}
              onClick={addTag}
              size="small"
            >
              Add Tag
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {Object.entries(metadata.tags || {}).length === 0 ? (
              <Typography color="text.secondary">No tags applied</Typography>
            ) : (
              Object.entries(metadata.tags || {}).map(([key, value]) => (
                <Chip key={key} label={`${key}: ${value}`} />
              ))
            )}
          </Box>
        )}
      </Paper>

      {/* Required Tags */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Required Tags
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {Object.entries(metadata.requiredTags || {}).length === 0 ? (
            <Typography color="text.secondary">No required tags defined</Typography>
          ) : (
            Object.entries(metadata.requiredTags || {}).map(([key, value]) => (
              <Chip key={key} label={`${key}: ${value}`} color="warning" />
            ))
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default AssetDetails;
