import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Box, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  Chip,
  Alert,
  AlertTitle,
  Button,
  Paper,
  Avatar,
  Skeleton,
} from '@mui/material';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import DescriptionIcon from '@mui/icons-material/Description';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import useAppStore from '../store/useAppStore';
import SetupModal from '../components/SetupModal';
import api from '../services/api';

const Dashboard = () => {
  const { 
    complianceOverview, 
    complianceLoading, 
    violations,
    violationsLoading,
    shares,
    sharesLoading,
    agreements,
    loadingStatus,
    loadCompliance, 
    loadViolations, 
    loadShares, 
    loadAgreements 
  } = useAppStore();

  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupCheckDone, setSetupCheckDone] = useState(false);

  useEffect(() => {
    // Load data immediately - don't wait for setup check
    if (!complianceOverview && !complianceLoading) loadCompliance();
    if (violations.length === 0 && !violationsLoading) loadViolations();
    if (shares.length === 0 && !sharesLoading) loadShares();
    if (agreements.length === 0) loadAgreements();
    
    // Check setup in background (non-blocking)
    const checkSetup = async () => {
      try {
        const response = await api.get('/setup/check');
        if (response.data.setupRequired) {
          console.log('Setup required:', response.data.reason);
          setSetupModalOpen(true);
        }
      } catch (error) {
        console.error('Setup check failed:', error);
      } finally {
        setSetupCheckDone(true);
      }
    };
    
    checkSetup();
  }, []);
  
  // Check if any environment is still loading
  const isAnyLoading = Object.values(loadingStatus).some(status => status.isLoading);
  
  // Get loading progress message
  const getLoadingProgress = () => {
    const currentStatus = loadingStatus['current'];
    if (!currentStatus || !currentStatus.isLoading) return null;
    
    const { catalogsProcessed, totalCatalogs, currentAssetCount } = currentStatus;
    return `Loading... [${catalogsProcessed}/${totalCatalogs} shares, ${currentAssetCount || 0} assets so far]`;
  };

  if (complianceLoading) {
    return (
      <Box>
        <Box sx={{ mb: 4 }}>
          <Skeleton variant="text" width={250} height={48} />
          <Skeleton variant="text" width={400} height={24} />
        </Box>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Skeleton variant="text" width="60%" height={24} />
                  <Skeleton variant="text" width="40%" height={56} sx={{ mt: 1 }} />
                  <Skeleton variant="text" width="50%" height={20} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
        <Paper sx={{ p: 3 }}>
          <Skeleton variant="text" width={200} height={32} />
          <Skeleton variant="rectangular" height={200} sx={{ mt: 2 }} />
        </Paper>
      </Box>
    );
  }

  const compliancePercentage = complianceOverview?.overall?.totalAssets > 0
    ? Math.round((complianceOverview.overall.compliantAssets / complianceOverview.overall.totalAssets) * 100)
    : 0;

  const currentStatus = loadingStatus['current'];
  const totalAssetsText = currentStatus?.isLoading 
    ? `${currentStatus.currentAssetCount || 0}+ (loading...)`
    : complianceOverview?.overall?.totalAssets || 0;
  
  const statCards = [
    {
      title: 'Total Shares',
      value: shares.length,
      icon: FolderSharedIcon,
      color: '#0891b2',
      bgColor: '#ecfeff',
      linkTo: '/shares',
      linkText: 'Explore',
    },
    {
      title: 'Compliance Score',
      value: isAnyLoading ? '...' : `${compliancePercentage}%`,
      icon: CheckCircleIcon,
      color: compliancePercentage >= 90 ? '#10b981' : compliancePercentage >= 70 ? '#f59e0b' : '#ef4444',
      bgColor: compliancePercentage >= 90 ? '#d1fae5' : compliancePercentage >= 70 ? '#fef3c7' : '#fee2e2',
      subtitle: isAnyLoading 
        ? getLoadingProgress() || 'Loading...'
        : complianceOverview?.overall?.note || `${compliancePercentage}% compliant`,
    },
    {
      title: 'Critical Violations',
      value: complianceOverview?.overall?.criticalViolations || 0,
      icon: WarningIcon,
      color: '#ef4444',
      bgColor: '#fee2e2',
      linkTo: '/remediation',
      linkText: 'Fix Issues',
    },
    {
      title: 'Agreements',
      value: agreements.length,
      icon: DescriptionIcon,
      color: '#8b5cf6',
      bgColor: '#f3e8ff',
      linkTo: '/agreements',
      linkText: 'Manage',
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Compliance Dashboard
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Monitor Delta Sharing compliance across all shares
        </Typography>
        {complianceOverview?.overall?.note && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {complianceOverview.overall.note}
          </Alert>
        )}
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((stat, index) => {
          const IconComponent = stat.icon;
          return (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography color="text.secondary" variant="body2" gutterBottom>
                        {stat.title}
                      </Typography>
                      <Typography variant="h3" fontWeight="bold" sx={{ mt: 1 }}>
                        {stat.value}
                      </Typography>
                      {stat.subtitle && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {stat.subtitle}
                        </Typography>
                      )}
                    </Box>
                    <Avatar
                      sx={{
                        bgcolor: stat.bgColor,
                        width: 56,
                        height: 56,
                      }}
                    >
                      <IconComponent sx={{ color: stat.color, fontSize: 28 }} />
                    </Avatar>
                  </Box>
                  {stat.linkTo && (
                    <Button 
                      component={Link} 
                      to={stat.linkTo}
                      size="small" 
                      endIcon={<ArrowForwardIcon />}
                      sx={{ mt: 1 }}
                    >
                      {stat.linkText}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Recent Violations */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight="bold" gutterBottom>
          Recent Violations
        </Typography>
        <Box sx={{ mt: 3 }}>
          {violations.length === 0 ? (
            <Alert severity="success" icon={<CheckCircleIcon />}>
              <AlertTitle>All Clear!</AlertTitle>
              No violations found. All assets are compliant!
            </Alert>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {violations.slice(0, 5).map((violation, idx) => (
                <Alert 
                  key={idx} 
                  severity="error" 
                  icon={<WarningIcon />}
                  action={
                    <Button 
                      component={Link} 
                      to="/remediation"
                      size="small"
                    >
                      Fix →
                    </Button>
                  }
                >
                  <AlertTitle>{violation.assetName}</AlertTitle>
                  {violation.violations?.length || 0} tag violations detected
                </Alert>
              ))}
            </Box>
          )}
        </Box>
      </Paper>

      {/* Setup Modal */}
      <SetupModal 
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        onSetupComplete={() => {
          setSetupModalOpen(false);
          // Reload data after setup
          loadCompliance();
          loadShares();
          loadAgreements();
        }}
      />
    </Box>
  );
};

export default Dashboard;
