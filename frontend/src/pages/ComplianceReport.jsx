import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Divider,
  Skeleton,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import AssessmentIcon from '@mui/icons-material/Assessment';
import useAppStore from '../store/useAppStore';

const ComplianceReport = () => {
  const { 
    complianceOverview, 
    violations,
    violationsLoading,
    agreements,
    agreementsLoading,
    complianceLoading,
    loadCompliance,
    loadViolations,
    loadAgreements 
  } = useAppStore();

  useEffect(() => {
    if (!complianceOverview && !complianceLoading) loadCompliance();
    if (violations.length === 0 && !violationsLoading) loadViolations();
    if (agreements.length === 0 && !agreementsLoading) loadAgreements();
  }, []);

  if (complianceLoading) {
    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Skeleton variant="text" width={250} height={48} />
          <Skeleton variant="text" width={450} height={24} />
        </Box>
        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Skeleton variant="text" width={200} height={32} />
            <Skeleton variant="text" width="30%" height={72} sx={{ mt: 1 }} />
            <Skeleton variant="rectangular" height={10} sx={{ mt: 2, borderRadius: 1 }} />
          </CardContent>
        </Card>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} md={4} key={i}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" width="70%" height={32} />
                  <Skeleton variant="text" width="40%" height={56} sx={{ mt: 1 }} />
                  <Skeleton variant="text" width="60%" height={20} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
        <Paper sx={{ p: 3 }}>
          <Skeleton variant="text" width={200} height={32} />
          <Skeleton variant="rectangular" height={300} sx={{ mt: 2 }} />
        </Paper>
      </Box>
    );
  }

  const compliancePercentage = complianceOverview?.overall?.compliancePercentage || 0;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Compliance Report
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Comprehensive view of Delta Sharing compliance status
        </Typography>
      </Box>

      {/* Overall Score Card */}
      <Card sx={{ mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <CardContent sx={{ color: 'white' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6" gutterBottom>
                Overall Compliance Score
              </Typography>
              <Typography variant="h2" fontWeight="bold">
                {compliancePercentage}%
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, mt: 1 }}>
                {complianceOverview?.overall?.compliantAssets} of {complianceOverview?.overall?.totalAssets} assets compliant
              </Typography>
            </Box>
            <AssessmentIcon sx={{ fontSize: 100, opacity: 0.3 }} />
          </Box>
          <LinearProgress
            variant="determinate"
            value={compliancePercentage}
            sx={{
              mt: 2,
              height: 10,
              borderRadius: 1,
              backgroundColor: 'rgba(255,255,255,0.3)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: 'white',
              },
            }}
          />
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="h6" fontWeight="bold">
                  Compliant Assets
                </Typography>
              </Box>
              <Typography variant="h3" fontWeight="bold" color="success.main">
                {complianceOverview?.overall?.compliantAssets || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Meeting all requirements
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ErrorIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="h6" fontWeight="bold">
                  Non-Compliant Assets
                </Typography>
              </Box>
              <Typography variant="h3" fontWeight="bold" color="error.main">
                {complianceOverview?.overall?.nonCompliantAssets || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Require attention
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <WarningIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6" fontWeight="bold">
                  Critical Violations
                </Typography>
              </Box>
              <Typography variant="h3" fontWeight="bold" color="warning.main">
                {complianceOverview?.overall?.criticalViolations || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                High priority issues
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Active Agreements */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Active Agreements
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        {agreements.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No agreements configured
          </Typography>
        ) : (
          <Grid container spacing={2}>
            {agreements.map((agreement) => (
              <Grid item xs={12} md={6} key={agreement.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight="medium" gutterBottom>
                      {agreement.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {agreement.description}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {agreement.environments?.slice(0, 3).map((env, idx) => (
                        <Chip key={idx} label={env} size="small" />
                      ))}
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      {agreement.parsedRequirements?.length || 0} requirements
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Paper>

      {/* Top Violations */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Top Violations
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        {violations.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 1 }} />
            <Typography variant="body1" color="success.main">
              No violations found!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              All assets are compliant with active agreements
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Asset Name</strong></TableCell>
                  <TableCell><strong>Environment</strong></TableCell>
                  <TableCell><strong>Violations</strong></TableCell>
                  <TableCell><strong>Severity</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {violations.slice(0, 10).map((violation, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {violation.assetName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={violation.environmentId} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {violation.violations?.length || 0} violations
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {violation.violations?.some(v => v.severity === 'critical') ? (
                        <Chip label="Critical" color="error" size="small" />
                      ) : (
                        <Chip label="Warning" color="warning" size="small" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default ComplianceReport;
