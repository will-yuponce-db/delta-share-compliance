import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import Navbar from './components/Layout/Navbar';
import Sidebar from './components/Layout/Sidebar';
import Dashboard from './pages/Dashboard';
import SharesExplorer from './pages/SharesExplorer';
import TagManagement from './pages/TagManagement';
import ComplianceReport from './pages/ComplianceReport';
import AgreementsPage from './pages/AgreementsPage';
import RemediationPage from './pages/RemediationPage';
import AssetDetails from './pages/AssetDetails';
import './App.css';

function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Navbar />
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <Box 
          component="main" 
          sx={{ 
            flexGrow: 1, 
            p: 3, 
            overflow: 'auto',
            backgroundColor: '#f8fafc',
          }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/shares" element={<SharesExplorer />} />
            <Route path="/shares/:shareId" element={<AssetDetails />} />
            <Route path="/tags" element={<TagManagement />} />
            <Route path="/compliance" element={<ComplianceReport />} />
            <Route path="/agreements" element={<AgreementsPage />} />
            <Route path="/remediation" element={<RemediationPage />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

export default App;
