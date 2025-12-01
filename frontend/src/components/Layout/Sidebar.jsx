import { NavLink } from 'react-router-dom';
import { 
  Drawer, 
  List, 
  ListItem, 
  ListItemButton, 
  ListItemIcon, 
  ListItemText,
  Box,
  Divider,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import LabelIcon from '@mui/icons-material/Label';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import WarningIcon from '@mui/icons-material/Warning';

const drawerWidth = 260;

const Sidebar = () => {
  const navItems = [
    { name: 'Dashboard', path: '/', icon: <DashboardIcon /> },
    { name: 'Shares Explorer', path: '/shares', icon: <FolderSharedIcon /> },
    { name: 'Tag Management', path: '/tags', icon: <LabelIcon /> },
    { name: 'Compliance Report', path: '/compliance', icon: <AssessmentIcon /> },
    { name: 'Agreements', path: '/agreements', icon: <DescriptionIcon /> },
    { name: 'Remediation', path: '/remediation', icon: <WarningIcon /> },
  ];

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          position: 'relative',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
        },
      }}
    >
      <Box sx={{ overflow: 'auto', mt: 2 }}>
        <List sx={{ px: 2 }}>
          {navItems.map((item) => (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={NavLink}
                to={item.path}
                end={item.path === '/'}
                sx={{
                  borderRadius: 2,
                  '&.active': {
                    backgroundColor: 'primary.main',
                    color: 'white',
                    '& .MuiListItemIcon-root': {
                      color: 'white',
                    },
                  },
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.name} 
                  primaryTypographyProps={{ 
                    fontSize: '0.9rem', 
                    fontWeight: 500,
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
